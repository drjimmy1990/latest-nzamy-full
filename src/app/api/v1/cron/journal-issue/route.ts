import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { issuePeriodFor } from "@/lib/journal/journal";
import { buildIssue, isJournalSchemaMissing, journalEnabled, sendIssueBatch } from "@/lib/journal/journalServer";

/**
 * POST /api/v1/cron/journal-issue — «المجلة التشريعية», the monthly issue
 * (owner Q191/Q192, batch l13). NOT SCHEDULED yet: the journal opens after
 * 17 Dec, behind the switch legislative_journal_enabled.
 *
 *   1. BUILD: the issue of the previous Gregorian month (Riyadh date) when it
 *      does not exist yet and approved entries are waiting — so on the 1st,
 *      and on the next run if the 1st was missed. An existing issue is never
 *      rebuilt here (the admin does that while it is a draft). The issue is
 *      born a DRAFT: an admin approves it on /dashboard/admin/journal.
 *   2. SEND: every issue an admin has APPROVED (approved / sending) gets one
 *      batch of e-mails (sendIssueBatch: «النشرة» on, once per account,
 *      suspended accounts and test accounts never reached). The next run
 *      continues; the issue becomes «أُرسل» when nobody is left.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches). Unset
 * secret or a wrong header → 401.
 *
 * ── SCHEDULE (when the owner opens the journal) ─────────────────────────────
 * Daily (e.g. 06:00 Riyadh) is enough; the build only happens once per month:
 *   n8n: Schedule Trigger → HTTP Request POST https://<site>/api/v1/cron/journal-issue
 *        header x-cron-secret: <CRON_SECRET>
 *
 * Switch off → 200 {skipped: "journal_disabled"}, nothing built or sent.
 * Before 20261203_70 → 200 {skipped: "schema_missing"}.
 */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await journalEnabled())) return NextResponse.json({ ok: true, skipped: "journal_disabled" });

  const db = await createServiceClient();
  const period = issuePeriodFor();

  // 1. build
  const { data: existing, error: exErr } = await db.from("journal_issues").select("id").eq("period_month", period).maybeSingle();
  if (exErr) {
    if (isJournalSchemaMissing(exErr)) return NextResponse.json({ ok: true, skipped: "schema_missing" });
    console.error("[cron/journal-issue] read:", exErr.code ?? "no-code");
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
  let build: Record<string, unknown> = { period, state: "exists" };
  if (!existing) {
    const outcome = await buildIssue(db, period, null);
    build = outcome.ok
      ? { period, state: "built", issueId: outcome.issueId, entries: outcome.entries }
      : { period, state: outcome.reason };
  }

  // 2. send the approved issues, one batch each
  const { data: approved, error: aErr } = await db
    .from("journal_issues").select("id").in("status", ["approved", "sending"]).order("period_month", { ascending: true }).limit(3);
  if (aErr) {
    console.error("[cron/journal-issue] approved read:", aErr.code ?? "no-code");
    return NextResponse.json({ ok: false, build, error: "approved_read_failed" }, { status: 500 });
  }
  const sends: Array<Record<string, unknown>> = [];
  for (const row of (approved ?? []) as Array<{ id: string }>) {
    const report = await sendIssueBatch(db, row.id);
    sends.push({ issueId: row.id, ...report });
  }
  return NextResponse.json({ ok: true, build, sends });
}
