import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordActivity, RequestEvent } from "@/lib/events";
import {
  readSubtasks,
  validateCategory,
  validateDueDate,
  validateNotes,
  validatePriority,
  validateSubtasks,
  validateTaskTitle,
  type TaskSubtask,
} from "@/lib/services/taskMetadata";

/**
 * /api/v1/lawyer/tasks — Phase 1, step 2 (خطة_البناء_الكاملة §5).
 *
 * Backed by `public.tasks` + `public.task_steps`
 * (migration 20260903_phase1_case_tables.sql), NOT `service_requests`. A task
 * used to be a service_requests row with `metadata.task = true`, its
 * priority/category/dueDate/notes/checklist all sharing one jsonb column with
 * whatever ELSE that row might be (a client's real request, a manually-added
 * client, a hearing) — so a title edit had to be refused on some rows to
 * avoid renaming a client's own request out from under them, and every
 * partial update was a read-modify-write merge to avoid clobbering the other
 * keys. Neither problem exists here: `public.tasks` rows are never anything
 * but a task, and every field is its own column.
 *
 * `status` is stored AS the UI vocabulary now (todo/in_progress/done/
 * archived) — the DB_TO_TASK_STATUS / taskStatusToDbStatus translation
 * through the old service_requests status enum
 * (draft/pending_assignment/assigned/…) is gone. There is nothing left to
 * translate.
 *
 * `eventsCount`/`lastEvent` from the old response are dropped: grep across
 * the whole repo before this rewrite found no reader of either field on the
 * client — a request_events join that fed nothing on screen.
 */

interface TaskRow {
  id: string;
  case_request_id: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  due_date: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const VALID_STATUSES = new Set(["todo", "in_progress", "done", "archived"]);

function toDto(row: TaskRow, steps: TaskSubtask[]) {
  const meta = row.metadata ?? {};
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    category: row.category ?? undefined,
    dueDate: row.due_date ?? undefined,
    caseId: row.case_request_id ?? undefined,
    caseRef: typeof meta.caseRef === "string" ? meta.caseRef : undefined,
    notes: row.description || undefined,
    subtasks: steps,
    createdAt: row.created_at,
    created_at: row.created_at,
    updatedAt: row.updated_at,
  };
}

const TASK_SELECT =
  "id, case_request_id, title, description, status, priority, category, due_date, completed_at, metadata, created_at, updated_at";

/**
 * GET /api/v1/lawyer/tasks
 * Query params:
 *   - caseId → only tasks linked to that case (case_request_id).
 *   - limit  → default 200 (was a hard, silent 50 with no way to ask for
 *     more — the plan's own acceptance test for this phase, "a lawyer adds
 *     60 tasks and sees 60", failed on exactly this route).
 *
 * Response: `{ data, total }`, not a bare array. `total` is the server's real
 * count via `{ count: "exact" }`, so a caller can tell a full board from a
 * truncated one instead of assuming `data.length` is everything.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get("caseId");
    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 1000) : 200;

    let query = supabase
      .from("tasks")
      .select(TASK_SELECT, { count: "exact" })
      .eq("owner_user_id", user.id);

    if (caseId) query = query.eq("case_request_id", caseId);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[lawyer/tasks GET] query failed:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as TaskRow[];

    // One extra query for every step of every returned task, scoped by
    // task_id — cheaper than N+1 per task and simple enough not to need a
    // stored function. RLS on task_steps already follows its parent task
    // (see the migration's "task steps follow their task" policy), so no
    // extra predicate is needed here.
    const taskIds = rows.map((r) => r.id);
    const stepsByTask = new Map<string, TaskSubtask[]>();
    if (taskIds.length > 0) {
      const { data: stepRows, error: stepsError } = await supabase
        .from("task_steps")
        .select("id, task_id, title, done")
        .in("task_id", taskIds)
        .order("position", { ascending: true });

      if (stepsError) {
        // Not fatal — losing the checklist decoration is not worth hiding the
        // whole task board a lawyer needs to see.
        console.error("[lawyer/tasks GET] task_steps query failed:", stepsError.message);
      } else {
        for (const s of stepRows ?? []) {
          const list = stepsByTask.get(s.task_id) ?? [];
          list.push({ id: s.id, title: s.title, done: s.done });
          stepsByTask.set(s.task_id, list);
        }
      }
    }

    const tasks = rows.map((row) => toDto(row, stepsByTask.get(row.id) ?? []));
    return NextResponse.json({ data: tasks, total: count ?? tasks.length });
  } catch (err) {
    console.error("[lawyer/tasks GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/tasks
 * Body: { title, category?, priority?, dueDate?, caseId?, caseRef?, notes?, subtasks? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { title, category, priority, dueDate, caseId, caseRef, notes, subtasks } = body as {
      title?: string;
      category?: string;
      priority?: string;
      dueDate?: string;
      caseId?: string;
      caseRef?: string;
      notes?: string;
      subtasks?: unknown;
    };

    const parsedTitle = validateTaskTitle(title);
    if (!parsedTitle.ok) return NextResponse.json({ error: parsedTitle.error }, { status: 400 });

    const parsedPriority = priority !== undefined ? validatePriority(priority) : { ok: true as const, value: "normal" };
    if (!parsedPriority.ok) return NextResponse.json({ error: parsedPriority.error }, { status: 400 });

    const parsedCategory = category !== undefined ? validateCategory(category) : { ok: true as const, value: null };
    if (!parsedCategory.ok) return NextResponse.json({ error: parsedCategory.error }, { status: 400 });

    const parsedDueDate = dueDate !== undefined ? validateDueDate(dueDate) : { ok: true as const, value: null };
    if (!parsedDueDate.ok) return NextResponse.json({ error: parsedDueDate.error }, { status: 400 });

    let initialSubtasks: TaskSubtask[] = [];
    if (subtasks !== undefined) {
      const parsed = validateSubtasks(subtasks);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      initialSubtasks = parsed.value;
    }

    // Solo lawyer → no firm row → firm_id stays null, matching hearings'
    // POST — the owner arm of can_access_case_row is what keeps a solo
    // lawyer's own tasks visible to them.
    const { data: membership, error: membershipError } = await supabase
      .from("firm_members")
      .select("firm_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (membershipError) {
      console.error("[lawyer/tasks] firm_members lookup failed:", membershipError.message, membershipError.code);
    }

    const metadata: Record<string, unknown> = {};
    if (caseRef && caseRef.trim()) metadata.caseRef = caseRef.trim();

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        case_request_id: caseId || null,
        firm_id: membership?.firm_id ?? null,
        owner_user_id: user.id,
        title: parsedTitle.value,
        description: notes?.trim() || "",
        priority: parsedPriority.value,
        category: parsedCategory.value,
        due_date: parsedDueDate.value,
        metadata,
      })
      .select(TASK_SELECT)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    let steps: TaskSubtask[] = [];
    if (initialSubtasks.length > 0) {
      const { data: stepRows, error: stepsError } = await supabase
        .from("task_steps")
        .insert(initialSubtasks.map((s, i) => ({ id: s.id, task_id: data.id, title: s.title, done: s.done, position: i })))
        .select("id, title, done");
      if (stepsError) {
        // The task itself is saved; a checklist that failed to attach is not
        // worth failing the whole create over. Logged, reported empty.
        console.error("[lawyer/tasks POST] initial task_steps insert failed:", stepsError.message);
      } else {
        steps = (stepRows ?? []).map((s) => ({ id: s.id, title: s.title, done: s.done }));
      }
    }

    await recordActivity({
      supabase,
      kind: RequestEvent.TASK_CREATED,
      ownerUserId: user.id,
      firmId: membership?.firm_id ?? null,
      actorUserId: user.id,
      caseRequestId: caseId || null,
      subjectTable: "tasks",
      subjectId: data.id,
      payload: { title: parsedTitle.value },
    });

    return NextResponse.json({ data: toDto(data as TaskRow, steps) });
  } catch (err) {
    console.error("[lawyer/tasks POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/lawyer/tasks
 * Body: { taskId, status?, title?, priority?, category?, dueDate?, notes?, subtasks? }
 *
 * Every field is its own column now, so — unlike the old jsonb-merge route —
 * this is a plain partial `.update()`: no read-before-write, and no risk of
 * one field's patch clobbering another's. `status → "done"` stamps
 * `completed_at`; moving off "done" clears it.
 *
 * The old `titleSkipped` protection (a task row could secretly BE a client's
 * own request, whose title the client sees, so renaming was refused) no
 * longer applies: every row in `public.tasks` is unambiguously a task. A
 * title edit here always lands.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { taskId, status, title, priority, category, dueDate, notes, subtasks } = body as {
      taskId?: string;
      status?: unknown;
      title?: unknown;
      priority?: unknown;
      category?: unknown;
      dueDate?: unknown;
      notes?: unknown;
      subtasks?: unknown;
    };

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (status !== undefined) {
      if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
        return NextResponse.json(
          { error: `status must be one of: ${[...VALID_STATUSES].join(", ")}` },
          { status: 400 },
        );
      }
      update.status = status;
      update.completed_at = status === "done" ? new Date().toISOString() : null;
    }

    if (title !== undefined) {
      const parsed = validateTaskTitle(title);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      update.title = parsed.value;
    }

    if (priority !== undefined) {
      const parsed = validatePriority(priority);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      update.priority = parsed.value;
    }

    if (category !== undefined) {
      const parsed = validateCategory(category);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      update.category = parsed.value;
    }

    if (dueDate !== undefined) {
      const parsed = validateDueDate(dueDate);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      update.due_date = parsed.value;
    }

    if (notes !== undefined) {
      const parsed = validateNotes(notes);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      update.description = parsed.value;
    }

    let parsedSubtasks: TaskSubtask[] | null = null;
    if (subtasks !== undefined) {
      const parsed = validateSubtasks(subtasks);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
      parsedSubtasks = parsed.value;
    }

    const hasFieldUpdate = Object.keys(update).length > 1; // more than just updated_at
    const hasSubtasksUpdate = parsedSubtasks !== null;

    if (!hasFieldUpdate && !hasSubtasksUpdate) {
      return NextResponse.json(
        { error: "taskId and at least one of status, title, priority, category, dueDate, notes or subtasks required" },
        { status: 400 },
      );
    }

    if (hasFieldUpdate) {
      // `.select()` after `.update()` returns the row in the same round trip
      // — needed for the activity event below (title, case link), not just
      // for its own sake.
      const { data: updated, error } = await supabase
        .from("tasks")
        .update(update)
        .eq("id", taskId)
        .eq("owner_user_id", user.id)
        .select("id, title, case_request_id, firm_id")
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (status !== undefined && updated) {
        await recordActivity({
          supabase,
          kind: RequestEvent.TASK_STATUS_CHANGED,
          ownerUserId: user.id,
          firmId: updated.firm_id,
          actorUserId: user.id,
          caseRequestId: updated.case_request_id,
          subjectTable: "tasks",
          subjectId: updated.id,
          payload: { title: updated.title, status },
        });
      }
    }

    if (hasSubtasksUpdate) {
      const steps = parsedSubtasks as TaskSubtask[];
      // Whole-checklist replace, same semantics the jsonb array always had
      // ("the checklist is replaced wholesale" — lawyerTasksService.ts).
      // Upsert-by-id first, THEN delete whatever is no longer in the list —
      // not delete-then-insert — so a failure here leaves the checklist
      // intact-but-stale rather than emptied.
      if (steps.length === 0) {
        const { error: delError } = await supabase.from("task_steps").delete().eq("task_id", taskId);
        if (delError) {
          console.error("[lawyer/tasks PATCH] clearing task_steps failed:", delError.message);
          return NextResponse.json({ error: delError.message }, { status: 500 });
        }
      } else {
        const { error: upsertError } = await supabase
          .from("task_steps")
          .upsert(
            steps.map((s, i) => ({ id: s.id, task_id: taskId, title: s.title, done: s.done, position: i })),
            { onConflict: "id" },
          );
        if (upsertError) {
          console.error("[lawyer/tasks PATCH] task_steps upsert failed:", upsertError.message);
          return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }
        const { error: pruneError } = await supabase
          .from("task_steps")
          .delete()
          .eq("task_id", taskId)
          .not("id", "in", `(${steps.map((s) => `"${s.id}"`).join(",")})`);
        if (pruneError) {
          console.error("[lawyer/tasks PATCH] task_steps prune failed:", pruneError.message);
          // Not fatal: every step the caller sent IS saved correctly at this
          // point. A stray leftover row is a smaller failure than losing data.
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lawyer/tasks PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
