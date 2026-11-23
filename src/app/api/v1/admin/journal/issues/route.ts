import { NextRequest, NextResponse } from "next/server";
import { DB_ERROR_AR } from "@/lib/api/dbError";
import { createServiceClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/access-control";
import { logAdminAction } from "@/lib/auth/adminAudit";
import { emailConfigured } from "@/lib/email/sendEmail";
import { ISSUE_COLUMNS, issuePaths, issuePeriodFor, pdfConfigured, periodFromMonthInput } from "@/lib/journal/journal";
import {
  buildIssue,
  isJournalSchemaMissing,
  journalEnabled,
  optedInCount,
  sendCounts,
} from "@/lib/journal/journalServer";

/**
 * /api/v1/admin/journal/issues — the monthly issues (owner Q192/Q193, batch l13).
 *
 * GET  — the issues (newest month first) with their entry count and send-log
 *        counts, plus what the page must say honestly: the journal switch,
 *        whether e-mail is set up, whether the server can make a PDF
 *        (CHROMIUM_PATH), how many accounts turned «النشرة» on, and the
 *        month the next issue covers. Any staff role (read).
 * POST — build (or, while still a draft, rebuild) the issue of a month,
 *        body {month?: "YYYY-MM"} (default: the previous Gregorian month,
 *        Riyadh date — what the cron builds on the 1st). Staff role
 *        broadcasts.send; audited. Works with the switch off (preparation).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireStaff("read");
  if (!gate.ok) return gate.response;
  try {
    const db = await createServiceClient();
    const [issues, links, enabled, optedIn] = await Promise.all([
      db.from("journal_issues").select(ISSUE_COLUMNS).order("period_month", { ascending: false }).limit(60),
      db.from("journal_issue_entries").select("issue_id").limit(20000),
      journalEnabled(),
      optedInCount(db),
    ]);
    const err = issues.error ?? links.error;
    const status = {
      enabled,
      emailReady: emailConfigured(process.env),
      pdfReady: pdfConfigured(),
      optedIn,
      nextPeriod: issuePeriodFor(),
    };
    if (err) {
      if (isJournalSchemaMissing(err)) {
        return NextResponse.json({ error: "جداول المجلة غير موجودة بعد", code: "schema_missing", status }, { status: 503 });
      }
      console.error("[admin/journal/issues GET]", err.code ?? "no-code");
      return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
    }
    const perIssue = new Map<string, number>();
    for (const l of (links.data ?? []) as Array<{ issue_id: string }>) perIssue.set(l.issue_id, (perIssue.get(l.issue_id) ?? 0) + 1);
    const rows = (issues.data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>;
    const counts = await sendCounts(db, rows.map((r) => r.id));
    const data = rows.map((r) => ({
      ...r,
      entries: perIssue.get(r.id) ?? 0,
      sends: counts.get(r.id) ?? { sent: 0, sunk: 0, failed: 0, sending: 0 },
      paths: issuePaths(r.id),
    }));
    return NextResponse.json({ data, status });
  } catch (err) {
    console.error("[admin/journal/issues GET] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireStaff("broadcasts.send");
  if (!gate.ok) return gate.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown> | null;
  const month = body && typeof body === "object" ? body.month : undefined;
  const period = month === undefined || month === null || month === "" ? issuePeriodFor() : periodFromMonthInput(month);
  if (!period) return NextResponse.json({ error: "اختر الشهر بالصيغة الصحيحة" }, { status: 400 });

  try {
    const db = await createServiceClient();
    const outcome = await buildIssue(db, period, gate.userId);
    if (!outcome.ok) {
      const httpStatus = outcome.reason === "schema_missing" ? 503 : outcome.reason === "error" ? 500 : 409;
      return NextResponse.json({ error: outcome.messageAr, reason: outcome.reason }, { status: httpStatus });
    }
    await logAdminAction({
      actorId: gate.userId,
      action: outcome.rebuilt ? "journal_issue_rebuild" : "journal_issue_build",
      targetType: "journal_issue",
      targetId: outcome.issueId,
      after: { period_month: period, entries: outcome.entries },
    });
    return NextResponse.json({ data: outcome }, { status: outcome.rebuilt ? 200 : 201 });
  } catch (err) {
    console.error("[admin/journal/issues POST] threw:", err instanceof Error ? err.name : "error");
    return NextResponse.json({ error: DB_ERROR_AR }, { status: 500 });
  }
}
