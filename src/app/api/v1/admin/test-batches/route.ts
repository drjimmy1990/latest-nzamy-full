import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { TEST_BATCH_ERRORS_AR, validBatchId } from "@/lib/testBatches/testBatches";

/**
 * /api/v1/admin/test-batches — «دفعات الاختبار» (owner file 19 §1ج, batch
 * l9-testinfra; SQL 20261129_90).
 *
 *   GET  → { ready, overview: { accounts, rows_by_batch, tables }, audit, mail }
 *          the test accounts with their current batch, the tagged rows per
 *          batch, the last purge-audit rows and the last sunk e-mails (the
 *          test mail sink — a test account's codes wait there).
 *          requireStaff("read").
 *   POST { userId, batch } → moves a TEST account to a new batch (its next
 *          rows and files go to it; the old ones stay in the old batch).
 *          requireStaff("settings.write"), audited (test_batch_assigned).
 *          A real account is refused by the database (409).
 * The purge itself is ./purge/route.ts.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isMissingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";
const isMissingTable = (code: string | undefined) => code === "PGRST205" || code === "42P01";

export async function GET() {
  try {
    const gate = await requireStaff("read");
    if (!gate.ok) return gate.response;
    const service = await createServiceClient();

    const { data: overview, error } = await service.rpc("test_batch_overview");
    if (error) {
      if (isMissingFn(error.code)) {
        return NextResponse.json({ ready: false, message: TEST_BATCH_ERRORS_AR.notReady }, { headers: NO_STORE });
      }
      console.error("[admin/test-batches] overview failed:", error.code);
      return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.failed }, { status: 503, headers: NO_STORE });
    }

    const [audit, mail] = await Promise.all([
      service
        .from("test_batch_purge_audit")
        .select("id, purge_id, created_at, kind, status, test_batch, actor_email, ip, counts_before, counts_after, blockers, files, error")
        .order("id", { ascending: false })
        .limit(30),
      service
        .from("test_mail_sink")
        .select("id, created_at, to_masked, reason, subject, body_text, tag, test_batch")
        .order("id", { ascending: false })
        .limit(30),
    ]);
    for (const r of [audit, mail]) {
      if (r.error && !isMissingTable(r.error.code)) console.error("[admin/test-batches] read failed:", r.error.code);
    }

    return NextResponse.json(
      {
        ready: true,
        overview,
        audit: audit.error ? null : (audit.data ?? []),
        mail: mail.error ? null : (mail.data ?? []),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/test-batches] GET unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("settings.write");
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => null)) as { userId?: unknown; batch?: unknown } | null;
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const batch = typeof body?.batch === "string" ? body.batch.trim() : "";
    if (!UUID_RE.test(userId)) return NextResponse.json({ error: "حساب غير صالح" }, { status: 400 });
    if (!validBatchId(batch)) return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.invalid }, { status: 400 });

    const service = await createServiceClient();
    const { data, error } = await service.rpc("test_account_set_batch", { p_user: userId, p_batch: batch, p_by: gate.userId });
    if (error) {
      if (isMissingFn(error.code)) return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.notReady }, { status: 503 });
      if ((error.message ?? "").includes("test_batch:not_test_account")) {
        return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.notTest }, { status: 409 });
      }
      if ((error.message ?? "").includes("test_batch:invalid")) {
        return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.invalid }, { status: 400 });
      }
      console.error("[admin/test-batches] set batch failed:", error.code);
      return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.failed }, { status: 500 });
    }

    await logAdminAction({
      actorId: gate.userId,
      action: "test_batch_assigned",
      targetType: "user",
      targetId: userId,
      after: { batch, result: data },
    });
    return NextResponse.json({ ok: true, result: data });
  } catch (err) {
    console.error("[admin/test-batches] POST unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
