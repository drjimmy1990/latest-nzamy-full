import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/access-control";

/**
 * PATCH /api/v1/admin/community/moderation/[id] — Apply a moderation decision to
 * a community post.
 *
 * URL param: id = community_posts.id (uuid)
 * Body: { action: 'approve' | 'hide' | 'remove' | 'escalate' | 'reject', reason?: string }
 *
 * The write path IS supported: community_posts has a real `status` column
 *   status ∈ ('active', 'closed', 'moderated', 'deleted').
 * We translate the admin action → that column (no jsonb workaround needed):
 *   approve            → 'active'    (visible / kept)
 *   hide | escalate    → 'moderated' (held for legal/senior review)
 *   remove | reject    → 'deleted'   (removed)
 * The decision is also written to admin_audit_events for traceability.
 *
 * The page also sends the UI status values directly (approved/rejected/escalated);
 * those are accepted as aliases.
 */

// Admin action / UI-status alias → DB community_posts.status value.
const ACTION_TO_DB_STATUS: Record<string, string> = {
  approve: "active",
  approved: "active",
  hide: "moderated",
  escalate: "moderated",
  escalated: "moderated",
  remove: "deleted",
  reject: "deleted",
  rejected: "deleted",
};

// DB status → the audit action label recorded in admin_audit_events.
const DB_STATUS_TO_AUDIT_ACTION: Record<string, string> = {
  active: "community_post_approved",
  moderated: "community_post_escalated",
  deleted: "community_post_removed",
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireAdmin();
    if (!gate.isAdmin) {
      return NextResponse.json({ error: gate.error }, { status: gate.status ?? 403 });
    }

    let body: { action?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const rawAction = (body.action ?? "").toLowerCase();
    const newStatus = ACTION_TO_DB_STATUS[rawAction];
    if (!newStatus) {
      return NextResponse.json(
        { error: "الإجراء مطلوب: approve أو hide/escalate أو remove/reject" },
        { status: 400 },
      );
    }

    const admin = await createServiceClient();

    // Read the current status first so we can record before/after in the audit log.
    const { data: existing, error: readError } = await admin
      .from("community_posts")
      .select("id, status, title")
      .eq("id", id)
      .maybeSingle();

    if (readError) {
      console.error(
        "[admin/community/moderation PATCH] read error:",
        readError.message,
        readError.code,
      );
      return NextResponse.json({ error: readError.message }, { status: 500 });
    }

    if (!existing) {
      return NextResponse.json(
        { error: "لم يتم العثور على المنشور" },
        { status: 404 },
      );
    }

    const beforeStatus = (existing.status as string) ?? "active";

    const { data: updated, error: updateError } = await admin
      .from("community_posts")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id, status, title")
      .maybeSingle();

    if (updateError) {
      console.error(
        "[admin/community/moderation PATCH] update error:",
        updateError.message,
        updateError.code,
      );
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Audit trail (best-effort — never fail the decision if logging fails).
    try {
      await admin.from("admin_audit_events").insert({
        actor_id: gate.userId,
        actor_type: "admin",
        action: DB_STATUS_TO_AUDIT_ACTION[newStatus] ?? "community_post_moderated",
        target_type: "community_post",
        target_id: id,
        before_state: { status: beforeStatus },
        after_state: { status: newStatus, reason: body.reason ?? null },
        metadata: { reason: body.reason ?? null, action: rawAction },
      });
    } catch (auditErr) {
      console.error("[admin/community/moderation PATCH] audit insert failed:", auditErr);
    }

    return NextResponse.json({
      success: true,
      data: {
        id: (updated?.id as string) ?? id,
        status: (updated?.status as string) ?? newStatus,
        title: (updated?.title as string) ?? (existing.title as string) ?? "",
      },
    });
  } catch (err) {
    console.error("[admin/community/moderation PATCH] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
