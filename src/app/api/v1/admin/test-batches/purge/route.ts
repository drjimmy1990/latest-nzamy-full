import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { createServiceClient } from "@/lib/supabase/server";
import { clientIpFrom } from "@/lib/rateLimit";
import { readFreshTotp } from "@/lib/testBatches/freshTotpServer";
import {
  TEST_BATCH_ERRORS_AR,
  chunkFilesByBucket,
  purgeSummaryAr,
  validBatchId,
  type PurgeFile,
  type PurgeResult,
} from "@/lib/testBatches/testBatches";

/**
 * POST /api/v1/admin/test-batches/purge — «مسح دفعة الاختبار» (owner file
 * 19 §1ج.3–4, batch l9-testinfra; T34–T37).
 *
 *   { batch, dryRun: true }  → the dry-run: what would be deleted per table
 *                              and per file type, what is kept (a row that
 *                              names a real account), what blocks the purge.
 *                              The database runs the very same deletes and
 *                              rolls them back. Nothing is deleted.
 *   { batch, dryRun: false, confirm: batch } → the purge, after a TOTP code
 *                              entered in the last five minutes
 *                              (readFreshTotp). Only rows tagged is_test AND
 *                              this test_batch; refused while any real row
 *                              depends on one (409). Then the batch's files
 *                              are removed through the Storage API and the
 *                              outcome is written as a second audit row.
 *
 * Gate: requireStaff("users.delete") — super admins only. Every call writes
 * one append-only row in public.test_batch_purge_audit (who, when, batch,
 * before / after, blockers, files, IP) inside the database function, and one
 * admin_audit_events row here. Never deletes an account.
 */

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const isMissingFn = (code: string | undefined) => code === "PGRST202" || code === "42883";

type PurgeAnswer = PurgeResult & { file_list?: PurgeFile[]; purge_id?: string; audit_id?: number; accounts?: number };

export async function POST(request: NextRequest) {
  try {
    const gate = await requireStaff("users.delete");
    if (!gate.ok) return gate.response;

    const body = (await request.json().catch(() => null)) as { batch?: unknown; dryRun?: unknown; confirm?: unknown } | null;
    const batch = typeof body?.batch === "string" ? body.batch.trim() : "";
    if (!validBatchId(batch)) return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.invalid }, { status: 400 });
    const dryRun = body?.dryRun !== false;

    if (!dryRun) {
      if (body?.confirm !== batch) return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.confirm }, { status: 400 });
      const totp = await readFreshTotp();
      if (!totp.ok) return NextResponse.json({ error: totp.error, code: totp.code }, { status: 403 });
    }

    const ip = clientIpFrom(request);
    const service = await createServiceClient();
    const { data, error } = await service.rpc("test_batch_purge", {
      p_batch: batch,
      p_dry_run: dryRun,
      p_actor: gate.userId,
      p_ip: ip,
    });
    if (error) {
      if (isMissingFn(error.code)) return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.notReady }, { status: 503 });
      console.error("[admin/test-batches/purge] rpc failed:", error.code);
      return NextResponse.json({ error: TEST_BATCH_ERRORS_AR.failed }, { status: 500 });
    }
    const result = (data ?? {}) as PurgeAnswer;

    // the files of a done purge: the Storage API (a SQL delete would leave the bytes)
    let filesRemoved = 0;
    const filesFailed: PurgeFile[] = [];
    if (!dryRun && result.status === "purged") {
      for (const chunk of chunkFilesByBucket(result.file_list)) {
        const { data: gone, error: rmErr } = await service.storage.from(chunk.bucket).remove(chunk.names);
        if (rmErr) {
          console.error("[admin/test-batches/purge] storage remove failed:", chunk.bucket, rmErr.message);
          for (const name of chunk.names) filesFailed.push({ bucket: chunk.bucket, name });
        } else {
          filesRemoved += Array.isArray(gone) ? gone.length : chunk.names.length;
        }
      }
      if (result.purge_id) {
        const { error: doneErr } = await service.rpc("test_batch_purge_files_done", {
          p_purge: result.purge_id,
          p_batch: batch,
          p_actor: gate.userId,
          p_ip: ip,
          p_removed: filesRemoved,
          p_failed: filesFailed,
        });
        if (doneErr) console.error("[admin/test-batches/purge] files audit row failed:", doneErr.code);
      }
    }

    await logAdminAction({
      actorId: gate.userId,
      action: dryRun ? "test_batch_dry_run" : "test_batch_purge",
      targetType: "test_batch",
      targetId: batch,
      before: { tables: result.tables ?? {}, blockers: result.blockers ?? [] },
      after: {
        status: result.status ?? null,
        purge_audit_id: result.audit_id ?? null,
        files_removed: filesRemoved,
        files_failed: filesFailed.length,
      },
    });

    const shown: Record<string, unknown> = { ...result };
    delete shown.file_list;
    const status = result.status === "blocked" ? 409 : result.status === "failed" ? 500 : 200;
    return NextResponse.json(
      {
        ...shown,
        files_removed: filesRemoved,
        files_failed: filesFailed.length,
        message: purgeSummaryAr(result, filesRemoved, filesFailed.length),
      },
      { status, headers: NO_STORE },
    );
  } catch (err) {
    console.error("[admin/test-batches/purge] unexpected:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
