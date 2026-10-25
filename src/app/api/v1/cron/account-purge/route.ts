import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { isMissingAccountDeletionSchema } from "@/lib/auth/accountFreeze";
import { purgeAccountWith } from "@/lib/accountDeletion/accountDeletionServer";

/**
 * POST /api/v1/cron/account-purge — D6 (owner ٢٩٨): the end of the 60-day
 * freeze. Claims the requests whose `purge_after` has passed (and any a dead
 * run left `purging` for an hour) with `account_purge_claim`, then, one by
 * one, runs purgeAccountWith (src/lib/accountDeletion/accountDeletionServer.ts):
 *
 *   prepare   — 20261026_70's account_purge_prepare: refuses an entity owner
 *               with members, moves firm rows to the firm owner, keeps
 *               documents on a shared case, snapshots the buyer onto paid
 *               invoices, and lists the Storage objects no kept row refers to
 *               (never a folder prefix);
 *   deleteUser — the BEFORE DELETE trigger on auth.users re-runs the keep rules;
 *   Storage   — removes the listed objects from the `documents` bucket;
 *   finish    — the request becomes purged / blocked / back to requested.
 *
 * A blocked request (entity owner, a key that refuses the delete) stays
 * blocked: the account stays frozen and is not retried every day.
 *
 * ── AUTH — fails CLOSED, as /api/v1/cron/deadlines and payments-sweep ──────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches: SHA-256 +
 * timingSafeEqual). An unset or empty CRON_SECRET, or a wrong header, is 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Daily:
 *   n8n: Schedule Trigger (daily, e.g. 03:00 Riyadh) → HTTP Request
 *        POST https://nezamy.sa/api/v1/cron/account-purge
 *        header x-cron-secret: <CRON_SECRET>
 *
 * Deploy order: before 20261026_70 runs, account_purge_claim does not exist —
 * 200 `{ skipped: "schema_missing" }`, never a 500.
 */

const PURGE_BATCH = 20;

interface ClaimRow {
  request_id: string;
  account_id: string;
}

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const { data, error } = await admin.rpc("account_purge_claim", { p_limit: PURGE_BATCH });
  if (error) {
    if (isMissingAccountDeletionSchema(error.code)) {
      return NextResponse.json({ ok: true, skipped: "schema_missing" });
    }
    console.error("[cron/account-purge] claim failed:", error.code, error.message);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as ClaimRow[];
  const counts = { claimed: rows.length, purged: 0, blocked: 0, retry: 0, storage_removed: 0, storage_failed: 0 };
  for (const row of rows) {
    try {
      const run = await purgeAccountWith(admin, { requestId: row.request_id, userId: row.account_id });
      counts[run.outcome] += 1;
      counts.storage_removed += run.storageRemoved;
      counts.storage_failed += run.storageFailed;
      if (run.outcome !== "purged") {
        console.warn("[cron/account-purge] request", row.request_id, run.outcome, run.reason ?? "");
      }
    } catch (err) {
      // Left `purging`: the next run re-claims it after an hour.
      counts.retry += 1;
      console.error("[cron/account-purge] purge threw:", row.request_id, err);
    }
  }

  console.info("[cron/account-purge]", JSON.stringify(counts));
  return NextResponse.json({ ok: true, ...counts });
}
