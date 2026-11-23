import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { isJournalSchemaMissing, loadIssue, sendIssueBatch } from "@/lib/journal/journalServer";

/**
 * PATCH /api/v1/admin/journal/issues/[id] — approve, return to draft, or
 * send one batch of a monthly issue (owner Q192: approved by an admin before
 * it is sent; batch l13). Staff role broadcasts.send; audited.
 *
 *   {action: "approve"}    draft → approved. Refused when the issue is empty
 *                          or carries an entry that is no longer approved.
 *   {action: "unapprove"}  approved → draft, only before any e-mail went out.
 *   {action: "send"}       approved / sending → e-mails one batch to the
 *                          accounts with «النشرة» on (sendIssueBatch); press
 *                          again (or let the cron run) for the next batch.
 *                          Refused while the journal switch is off or e-mail
 *                          is not set up — said plainly, nothing is sent.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SKIP_AR: Record<string, string> = {
  journal_disabled: "المجلة مطفأة من «مفاتيح الميزات»، فلا يُرسل العدد حتى تُفعَّل.",
  email_unavailable: "البريد الإلكتروني غير مُعدّ على الخادم، فلم يُرسل شيء.",
  not_approved: "اعتمد العدد أولاً.",
  schema_missing: "جداول المجلة غير موجودة بعد.",
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireStaff("broadcasts.send");
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "معرّف غير صالح" }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { action?: unknown } | null;
  const action = body?.action;
  if (action !== "approve" && action !== "unapprove" && action !== "send") {
    return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
  }

  try {
    const db = await createServiceClient();

    if (action === "send") {
      const report = await sendIssueBatch(db, id);
      if (report.skipped) return NextResponse.json({ error: SKIP_AR[report.skipped] ?? "لم يُرسل شيء", data: report }, { status: 409 });
      if (!report.ok) {
        console.error("[admin/journal/issues/[id] send]", report.error ?? "error");
        return NextResponse.json({ error: report.error === "not_found" ? "العدد غير موجود" : "تعذّر إكمال الإرسال الآن — أعد المحاولة", data: report }, { status: report.error === "not_found" ? 404 : 500 });
      }
      await logAdminAction({
        actorId: gate.userId,
        action: "journal_issue_send_batch",
        targetType: "journal_issue",
        targetId: id,
        after: { sent: report.sent, sunk: report.sunk, failed: report.failed, skipped_accounts: report.skippedAccounts, done: report.done },
      });
      return NextResponse.json({ data: report });
    }

    const loaded = await loadIssue(db, id);
    if (loaded === "schema_missing") return NextResponse.json({ error: SKIP_AR.schema_missing, code: "schema_missing" }, { status: 503 });
    if (!loaded) return NextResponse.json({ error: "العدد غير موجود" }, { status: 404 });
    const { issue, rows } = loaded;
    const nowIso = new Date().toISOString();

    let update: Record<string, unknown>;
    let from: string;
    if (action === "approve") {
      if (issue.status !== "draft") return NextResponse.json({ error: "العدد ليس بانتظار الاعتماد" }, { status: 409 });
      if (rows.length === 0) return NextResponse.json({ error: "العدد فارغ — أعد بنائه بعد اعتماد الأخبار" }, { status: 409 });
      if (rows.some((r) => r.status !== "approved")) {
        return NextResponse.json({ error: "في العدد خبر لم يعد معتمداً — أعد بناء العدد" }, { status: 409 });
      }
      update = { status: "approved", approved_by: gate.userId, approved_at: nowIso };
      from = "draft";
    } else {
      if (issue.status !== "approved") return NextResponse.json({ error: "لا يُعاد إلى المسودة إلا عدد معتمد لم يبدأ إرساله" }, { status: 409 });
      const { count, error: cErr } = await db.from("journal_issue_sends").select("user_id", { count: "exact", head: true }).eq("issue_id", id);
      if (cErr) throw new Error(cErr.code ?? "count");
      if ((count ?? 0) > 0) return NextResponse.json({ error: "بدأ إرسال هذا العدد، فلا يُعاد إلى المسودة" }, { status: 409 });
      update = { status: "draft", approved_by: null, approved_at: null };
      from = "approved";
    }

    const { data, error } = await db.from("journal_issues").update(update).eq("id", id).eq("status", from).select("id, status, approved_at").maybeSingle();
    if (error) {
      if (isJournalSchemaMissing(error)) return NextResponse.json({ error: SKIP_AR.schema_missing }, { status: 503 });
      console.error("[admin/journal/issues/[id] PATCH]", error.code ?? "no-code");
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "تغيّر العدد للتو — أعد تحميل الصفحة" }, { status: 409 });
    await logAdminAction({
      actorId: gate.userId,
      action: action === "approve" ? "journal_issue_approve" : "journal_issue_unapprove",
      targetType: "journal_issue",
      targetId: id,
      before: { status: issue.status },
      after: data,
      metadata: { period_month: issue.period_month, entries: rows.length },
    });
    return NextResponse.json({ data });
  } catch (err) {
    console.error("[admin/journal/issues/[id] PATCH] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}
