import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordEvent, RequestEvent } from "@/lib/events";
import {
  buildTaskMetadataPatch,
  mergeTaskMetadata,
  readSubtasks,
  validateSubtasks,
  validateTaskTitle,
} from "@/lib/services/taskMetadata";

// ─── Status mapping ─────────────────────────────────────────────────────────
// DB service_requests.status enum:
//   draft | pending_payment | pending_assignment | assigned | in_review | completed | cancelled
// UI TaskStatus: todo | in_progress | done | archived
// Mapping (DB → UI task status, read direction):
const DB_TO_TASK_STATUS: Record<string, string> = {
  draft: "todo",
  pending_payment: "todo",
  pending_assignment: "todo",
  assigned: "in_progress",
  in_review: "in_progress",
  completed: "done",
  cancelled: "archived",
};

// Valid DB statuses (for PATCH validation)
const VALID_DB_STATUSES = new Set([
  "draft",
  "pending_payment",
  "pending_assignment",
  "assigned",
  "in_review",
  "completed",
  "cancelled",
]);

/**
 * GET /api/v1/lawyer/tasks
 * Auth required. Returns tasks for this lawyer derived from service requests.
 * Maps DB status → UI task status (todo/in_progress/done/archived).
 *
 * Query params:
 *   - caseId → only tasks linked to that case. The link lives in
 *     metadata.caseId (POST writes it there); there is no tasks table and no
 *     column to filter on, so this filters the jsonb key directly. Kept as a
 *     plain `.eq()` on `metadata->>caseId` — same pattern as the admin
 *     service-orders route — so every other consumer of this GET (the Kanban
 *     at /dashboard/lawyer/tasks calls it with no params) is untouched.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;
    const caseId = new URL(request.url).searchParams.get("caseId");

    // Get service requests assigned to this lawyer across all relevant statuses
    // (include completed/cancelled so done/archived tasks surface in the UI).
    let query = supabase
      .from("service_requests")
      .select("id, title, status, type, created_at, updated_at, metadata")
      .eq("assigned_to", uid)
      .in("status", [
        "pending_assignment",
        "assigned",
        "in_review",
        "completed",
        "cancelled",
      ]);

    if (caseId) {
      query = query.eq("metadata->>caseId", caseId);
    }

    // `error` was destructured away here. A failed select produced `data: null`,
    // which the mapper below turned into `[]`, which the Kanban rendered as
    // «لا توجد مهام بعد» — a positive claim that the lawyer has no work,
    // written over a query that never ran. Not logged, not signalled, 200 OK.
    const { data: requests, error: requestsError } = await query
      .order("created_at", { ascending: false })
      .limit(50);

    if (requestsError) {
      console.error("[lawyer/tasks GET] service_requests query failed:", requestsError.message, requestsError.code);
      return NextResponse.json({ error: requestsError.message }, { status: 500 });
    }

    // Get recent events for these requests. A failure here is NOT fatal: it only
    // costs the eventsCount/lastEvent decoration, and losing that is not worth
    // hiding the task list a lawyer needs. Logged, then treated as no events.
    const requestIds = (requests ?? []).map((r) => r.id);
    const { data: events, error: eventsError } = requestIds.length > 0
      ? await supabase
          .from("request_events")
          .select("id, request_id, event, created_at")
          .in("request_id", requestIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : { data: [], error: null };

    if (eventsError) {
      console.error("[lawyer/tasks GET] request_events query failed:", eventsError.message);
    }

    // Map requests to task-like objects (map DB status → UI task status)
    const tasks = (requests ?? []).map((req) => {
      const reqEvents = (events ?? []).filter((e) => e.request_id === req.id);
      const meta = (req.metadata as Record<string, unknown> | null) ?? {};

      let category: string = "case";
      if (req.type === "document" || req.type === "contract_draft") category = "document";
      else if (req.type === "consultation") category = "client";
      else if (typeof meta.category === "string") category = meta.category;

      const priority =
        typeof meta.priority === "string" ? meta.priority : "normal";

      return {
        id: req.id,
        title: req.title || "مهمة بدون عنوان",
        status: DB_TO_TASK_STATUS[req.status] ?? "todo",
        type: req.type,
        category,
        priority,
        createdAt: req.created_at,
        created_at: req.created_at,
        updatedAt: req.updated_at,
        dueDate: typeof meta.dueDate === "string" ? meta.dueDate : null,
        caseId: typeof meta.caseId === "string" ? meta.caseId : undefined,
        caseRef: typeof meta.caseRef === "string" ? meta.caseRef : undefined,
        // Only the task's own `notes` key — never spread `meta`, which on a
        // real client request also carries the top-level internalNotes the
        // team note lives in.
        notes: typeof meta.notes === "string" ? meta.notes : undefined,
        // The checklist lives in metadata.subtasks. Read leniently — a
        // malformed entry drops out instead of blanking the whole list — so a
        // reload shows the real ticked state rather than an empty checklist.
        subtasks: readSubtasks(meta.subtasks),
        eventsCount: reqEvents.length,
        lastEvent: reqEvents[0] || null,
      };
    });

    return NextResponse.json(tasks);
  } catch (err) {
    // Was `return NextResponse.json([])` — a 200 carrying an empty list, i.e.
    // the route answered "this lawyer has no tasks" for every unexpected
    // failure, and no caller could tell the difference. A 500 lets the caller
    // say «تعذّر قراءة مهامك» instead of asserting an empty board.
    console.error("[lawyer/tasks GET] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/v1/lawyer/tasks
 * Create a new task (service_request row) for this lawyer.
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

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }

    // An initial checklist is validated by the same rules PATCH uses, so a task
    // cannot be born holding junk that PATCH would later refuse to write.
    let initialSubtasks: { id: string; title: string; done: boolean }[] = [];
    if (subtasks !== undefined) {
      const parsed = validateSubtasks(subtasks);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      initialSubtasks = parsed.value;
    }

    const id = crypto.randomUUID();
    const metadata: Record<string, unknown> = {
      task: true,
      priority: priority || "normal",
    };
    if (category) metadata.category = category;
    if (dueDate) metadata.dueDate = dueDate;
    if (caseId) metadata.caseId = caseId;
    if (caseRef) metadata.caseRef = caseRef;
    if (notes) metadata.notes = notes;
    if (initialSubtasks.length > 0) metadata.subtasks = initialSubtasks;

    const { data, error } = await supabase
      .from("service_requests")
      .insert({
        id,
        requester_user_id: user.id,
        type: "service",
        title: title.trim(),
        description: notes || "",
        requester: { name: "lawyer", role: "lawyer", tier: "free" },
        receiver: "lawyer",
        assigned_to: user.id,
        status: "pending_assignment",
        payment: { amount: 0, status: "not_required" },
        source_path: "",
        metadata,
      })
      .select("id, title, status, type, created_at, updated_at, metadata")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Insert failed" }, { status: 500 });
    }

    // F7 — record a namespaced task.created event (does not throw on failure).
    await recordEvent({
      supabase,
      requestId: id,
      event: RequestEvent.TASK_CREATED,
      actorUserId: user.id,
    });

    const meta = (data.metadata as Record<string, unknown> | null) ?? {};
    return NextResponse.json({
      data: {
        id: data.id,
        title: data.title,
        status: DB_TO_TASK_STATUS[data.status] ?? "todo",
        type: data.type,
        category: typeof meta.category === "string" ? meta.category : "case",
        priority: typeof meta.priority === "string" ? meta.priority : "normal",
        dueDate: typeof meta.dueDate === "string" ? meta.dueDate : null,
        caseId: typeof meta.caseId === "string" ? meta.caseId : undefined,
        caseRef: typeof meta.caseRef === "string" ? meta.caseRef : undefined,
        notes: typeof meta.notes === "string" ? meta.notes : undefined,
        subtasks: readSubtasks(meta.subtasks),
        createdAt: data.created_at,
        created_at: data.created_at,
        updatedAt: data.updated_at,
        eventsCount: 0,
        lastEvent: null,
      },
    });
  } catch (err) {
    console.error("[lawyer/tasks POST] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/lawyer/tasks
 * Update a task (service request). Three kinds of update, combinable:
 *   - status   → a valid DB enum status, written to the `status` column
 *   - title    → the `title` column (task rows only, see below)
 *   - metadata → subtasks / priority / category / dueDate / notes
 *
 * The metadata path is a READ-MODIFY-WRITE, and that is the point: every
 * task-only field shares one jsonb column, so `.update({ metadata: { subtasks } })`
 * would REPLACE it and silently drop the task's caseId, dueDate and notes with
 * no error. The read is scoped by the same ownership filter as the write
 * (`assigned_to = user.id`), so it can never surface another lawyer's row.
 * Its cost is last-write-wins: two concurrent updates to two different metadata
 * keys can lose one another. A jsonb `||` concatenation in a single statement
 * would avoid that, but it needs an RPC and therefore a migration, which is out
 * of scope here — one lawyer owns a task, so the race is theoretical.
 *
 * A status-only body takes exactly the path it always did: no read, one update,
 * one TASK_STATUS_CHANGED event.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { taskId, status, title } = body as {
      taskId?: string;
      status?: string;
      title?: unknown;
    };

    if (!taskId) {
      return NextResponse.json({ error: "taskId required" }, { status: 400 });
    }

    // Whitelist, never a spread of the body: this is what keeps a caller from
    // reaching metadata.internalNotes, flipping metadata.task, or overwriting
    // caseId/caseRef through the edit form.
    const patchResult = buildTaskMetadataPatch((body ?? {}) as Record<string, unknown>);
    if (!patchResult.ok) {
      return NextResponse.json({ error: patchResult.error }, { status: 400 });
    }
    const metadataPatch = patchResult.value;

    const hasStatus = status !== undefined;
    const hasTitle = title !== undefined;
    const hasMetadata = Object.keys(metadataPatch).length > 0;

    if (!hasStatus && !hasTitle && !hasMetadata) {
      return NextResponse.json(
        { error: "taskId and at least one of status, title, subtasks, priority, category, dueDate or notes required" },
        { status: 400 },
      );
    }

    if (hasStatus && !VALID_DB_STATUSES.has(status as string)) {
      return NextResponse.json(
        { error: `Invalid status. Valid: ${Array.from(VALID_DB_STATUSES).join(", ")}` },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (hasStatus) update.status = status;
    // Set when a rename was asked for on a client's own request and refused.
    // The rest of the patch still applies — see the branch below.
    let titleSkipped = false;

    if (hasTitle || hasMetadata) {
      const { data: row, error: readError } = await supabase
        .from("service_requests")
        .select("title, metadata")
        .eq("id", taskId)
        .eq("assigned_to", user.id)
        .maybeSingle();

      if (readError) {
        return NextResponse.json({ error: readError.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      const meta = (row.metadata as Record<string, unknown> | null) ?? {};

      if (hasTitle) {
        const parsedTitle = validateTaskTitle(title);
        if (!parsedTitle.ok) {
          return NextResponse.json({ error: parsedTitle.error }, { status: 400 });
        }
        // GET returns every request assigned to this lawyer, not only rows
        // stamped metadata.task — so a real client request shows up on the
        // Kanban and its edit form posts back a title too. An unchanged title
        // is simply dropped (the common case).
        //
        // A genuine rename is refused on a client request: that title is the
        // client's own text and it is rendered in the client's own dashboard
        // (src/app/dashboard/client/requests/page.tsx). `metadata.task !== true`
        // is the discriminator the lawyer cases board already uses for exactly
        // this distinction. The refusal does NOT fail the request, though — the
        // rest of the edit (priority, notes, the checklist) is still written and
        // the response flags `titleSkipped` so the client can revert just the
        // title and say why. Rejecting the whole body would throw away a
        // checklist the lawyer meant to save.
        if (parsedTitle.value !== row.title) {
          if (meta.task !== true) {
            titleSkipped = true;
          } else {
            update.title = parsedTitle.value;
          }
        }
      }

      if (hasMetadata) {
        update.metadata = mergeTaskMetadata(meta, metadataPatch);
      }
    }

    // Only `updated_at` left (an unchanged or refused title, nothing else):
    // there is nothing to write, so do not bump the row.
    if (Object.keys(update).length > 1) {
      const { error } = await supabase
        .from("service_requests")
        .update(update)
        .eq("id", taskId)
        .eq("assigned_to", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    // F7 — record a namespaced task.status_changed event (does not throw).
    // Only for an actual status move: a subtask tick is not a status change.
    if (hasStatus) {
      await recordEvent({
        supabase,
        requestId: taskId,
        event: RequestEvent.TASK_STATUS_CHANGED,
        actorUserId: user.id,
      });
    }

    return NextResponse.json(
      titleSkipped ? { success: true, titleSkipped: true } : { success: true },
    );
  } catch (err) {
    console.error("[lawyer/tasks PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}