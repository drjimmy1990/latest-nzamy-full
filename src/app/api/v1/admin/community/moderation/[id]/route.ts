import { NextRequest, NextResponse } from "next/server";
import { dbErrorJson } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { moderationDecision, reviewNotificationAr } from "@/lib/community/review";

/**
 * PATCH /api/v1/admin/community/moderation/[id] — a reviewer's decision on a
 * community question or answer (owner ٤٢, 18 Nov 2026; batch l7 decision 13).
 *
 * URL param: id = community_posts.id, or community_answers.id with kind "answer"
 * Body: { kind?: 'post' | 'answer', action: 'approve' | 'reject' | 'escalate' | 'remove', reason?: string }
 *
 *   approve   → 'active'     public (an answer is counted again by its trigger)
 *   reject    → 'rejected'   needs a reason (≤ 500 characters): the author
 *                            reads it on his own row (review_note) and in a
 *                            notification; he may edit and resubmit
 *   escalate  → 'moderated'  held for legal/senior review (also 'hide')
 *   remove    → 'deleted'
 *
 * Written with the service role (members cannot write status, 20261016_06).
 * Before 20261127_60 runs, 'rejected' is not an allowed status and the
 * review columns do not exist: a rejection then answers the database error,
 * and the other decisions are written without the review columns.
 *
 * The decision goes to admin_audit_events once (logAdminAction) and needs a
 * staff role with community.moderate. The author is notified of an approval
 * or a rejection (best effort — a failed notification never fails the
 * decision).
 */
const isMissingColumn = (code: unknown) => code === "42703" || code === "PGRST204";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const gate = await requireStaff("community.moderate");
    if (!gate.ok) return gate.response;

    let body: { kind?: string; action?: string; reason?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
    }

    const kind = body.kind === "answer" ? "answer" : "post";
    const rawAction = typeof body.action === "string" ? body.action.toLowerCase() : "";
    const decision = moderationDecision(kind, rawAction, body.reason);
    if (!decision.ok) {
      return NextResponse.json({ error: decision.error }, { status: 400 });
    }
    const newStatus = decision.status;
    const table = kind === "post" ? "community_posts" : "community_answers";

    const admin = await createServiceClient();

    // The row as it is now, for the audit row and the notification.
    const { data: existing, error: readError } = await admin
      .from(table)
      .select(kind === "post" ? "id, status, title, author_id" : "id, status, author_id, post_id")
      .eq("id", id)
      .maybeSingle();
    if (readError) {
      console.error("[admin/community/moderation PATCH] read error:", readError.code, readError.message);
      return dbErrorJson("admin/community/moderation/[id] PATCH", readError);
    }
    if (!existing) {
      return NextResponse.json({ error: kind === "post" ? "لم يتم العثور على السؤال" : "لم يتم العثور على الإجابة" }, { status: 404 });
    }
    const row = existing as unknown as { status?: string; title?: string; author_id?: string; post_id?: string };
    const beforeStatus = row.status ?? "active";

    const nowIso = new Date().toISOString();
    const write = (withReview: boolean) =>
      admin
        .from(table)
        .update(
          withReview
            ? { status: newStatus, review_note: decision.note, reviewed_at: nowIso, updated_at: nowIso }
            : { status: newStatus, updated_at: nowIso },
        )
        .eq("id", id)
        .select("id, status")
        .maybeSingle();
    let { data: updated, error: updateError } = await write(true);
    if (updateError && isMissingColumn(updateError.code) && newStatus !== "rejected") {
      ({ data: updated, error: updateError } = await write(false));
    }
    if (updateError) {
      console.error("[admin/community/moderation PATCH] update error:", updateError.code, updateError.message);
      return dbErrorJson("admin/community/moderation/[id] PATCH", updateError);
    }

    await logAdminAction({
      actorId: gate.userId,
      action: decision.audit,
      targetType: kind === "post" ? "community_post" : "community_answer",
      targetId: id,
      before: { status: beforeStatus },
      after: { status: newStatus, reason: body.reason ?? null },
      metadata: { reason: body.reason ?? null, action: rawAction },
    });

    // The author learns the outcome (approval / rejection with its reason).
    const note = reviewNotificationAr(kind, newStatus, decision.note);
    if (note && row.author_id && beforeStatus !== newStatus) {
      const postId = kind === "post" ? id : row.post_id;
      const { error: notifyError } = await admin.from("notifications").insert({
        user_id: row.author_id,
        title: note.title,
        body: note.body,
        href: postId ? `/community/${postId}` : null,
      });
      if (notifyError) {
        console.error("[admin/community/moderation PATCH] notification failed:", notifyError.code);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: (updated as { id?: string } | null)?.id ?? id,
        kind,
        status: (updated as { status?: string } | null)?.status ?? newStatus,
      },
    });
  } catch (err) {
    console.error("[admin/community/moderation PATCH] unexpected:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "تعذّر حفظ القرار" }, { status: 500 });
  }
}
