import { NextResponse, NextRequest } from "next/server";
import { assertRole } from "@/lib/auth/assertRole";
import { recordEvent, RequestEvent } from "@/lib/events";

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
 * Optional query params:
 *   ?case_id=<uuid>  — filter to tasks linked to a specific case
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const uid = user.id;
    const { searchParams } = new URL(request.url);
    const caseIdFilter = searchParams.get("case_id");

    // Get service requests assigned to or created by this lawyer.
    // When case_id is provided we can't filter by metadata column directly
    // (JSONB filter), so we fetch all and filter in JS — the result set is
    // small (≤50) so this is fine.
    let query = supabase
      .from("service_requests")
      .select("id, title, status, type, created_at, updated_at, metadata")
      .or(`assigned_to.eq.${uid},requester_user_id.eq.${uid}`)
      .in("status", [
        "pending_assignment",
        "assigned",
        "in_review",
        "completed",
        "cancelled",
      ])
      .order("created_at", { ascending: false })
      .limit(200);

    const { data: requests } = await query;

    // JS-side caseId filter (metadata is JSONB → filter in application layer)
    let filtered = requests ?? [];
    if (caseIdFilter) {
      filtered = filtered.filter((r) => {
        const meta = (r.metadata as Record<string, unknown> | null) ?? {};
        return meta.caseId === caseIdFilter || meta.case_id === caseIdFilter;
      });
    }

    // Get recent events for these requests
    const requestIds = filtered.map((r) => r.id);
    const { data: events } = requestIds.length > 0
      ? await supabase
          .from("request_events")
          .select("id, request_id, event, created_at")
          .in("request_id", requestIds)
          .order("created_at", { ascending: false })
          .limit(200)
      : { data: [] };

    // Map requests to task-like objects (map DB status → UI task status)
    const tasks = filtered.map((req) => {
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
        notes: typeof meta.notes === "string" ? meta.notes : undefined,
        subtasks: Array.isArray(meta.subtasks) ? meta.subtasks : [],
        eventsCount: reqEvents.length,
        lastEvent: reqEvents[0] || null,
      };
    });

    return NextResponse.json(tasks);
  } catch (err) {
    console.error("[lawyer/tasks GET] Unexpected error:", err);
    return NextResponse.json([]);
  }
}

/**
 * POST /api/v1/lawyer/tasks
 * Create a new task (service_request row) for this lawyer.
 * Body: { title, category?, priority?, dueDate?, caseId?, caseRef?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { title, category, priority, dueDate, caseId, caseRef, notes } = body as {
      title?: string;
      category?: string;
      priority?: string;
      dueDate?: string;
      caseId?: string;
      caseRef?: string;
      notes?: string;
    };

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
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
 * Update a task (service request) status. Expects a valid DB enum status.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await assertRole(["lawyer", "firm"]);
    if (!auth.ok) return auth.response;
    const { user, supabase } = auth;

    const body = await request.json();
    const { taskId, status } = body;

    if (!taskId || !status) {
      return NextResponse.json({ error: "taskId and status required" }, { status: 400 });
    }

    if (!VALID_DB_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Invalid status. Valid: ${Array.from(VALID_DB_STATUSES).join(", ")}` },
        { status: 400 },
      );
    }

    const { error } = await supabase
      .from("service_requests")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("assigned_to", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // F7 — record a namespaced task.status_changed event (does not throw).
    await recordEvent({
      supabase,
      requestId: taskId,
      event: RequestEvent.TASK_STATUS_CHANGED,
      actorUserId: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[lawyer/tasks PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}