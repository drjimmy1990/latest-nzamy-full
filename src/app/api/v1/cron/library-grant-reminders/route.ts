import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { recordNotification } from "@/lib/notify";
import {
  libraryReminderNotice,
  planLibraryReminders,
  type LibraryGrantRowWithUser,
  type PlannedLibraryReminder,
} from "@/lib/libraryAccessReminders";
import { emailConfigured } from "@/lib/email/sendEmail";
import {
  emptyEmailReport,
  loadEmailRecipients,
  sendReminderOnce,
  type EmailStepReport,
} from "@/lib/email/reminderDelivery";
import { libraryEmailKey, libraryEmailMessage } from "@/lib/email/libraryEmailReminders";

/**
 * POST /api/v1/cron/library-grant-reminders — the 7- and 3-day reminders of
 * the library-only subscription (owner note ١٨ C06).
 *
 *   1. candidates: grants not revoked whose end falls within the next 7 days
 *      (a bounded read);
 *   2. those users' live grants, so the reminder counts down to the END OF
 *      THE CHAIN (a user who renewed early is not reminded) —
 *      planLibraryReminders (src/lib/libraryAccessReminders.ts);
 *   3. per due reminder: INSERT the marker (grant_id, offset_days) into
 *      public.library_grant_reminders (20261030_66) with ON CONFLICT DO
 *      NOTHING, and send the in-app notice ONLY when the insert created the
 *      row. A retry, an overlapping run, or a second run the same day sends
 *      nothing twice.
 *
 * In-app (recordNotification), with a link to /laws/subscribe, AND by e-mail
 * (step 4, owner TODO F1): the same due reminders, each once per chain end
 * and recipient in public.email_reminder_log (20261125_20), skipped for an
 * account that turned e-mail or the «renewal» category off. Without
 * RESEND_API_KEY + EMAIL_FROM the e-mail step reports
 * {skipped: "email_unavailable"} and writes nothing.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches: SHA-256
 * digests compared with timingSafeEqual). Unset secret or a wrong header → 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day is enough (the windows are days wide); hourly is harmless:
 *   n8n: Schedule Trigger → HTTP Request POST https://nezamy.sa/api/v1/cron/library-grant-reminders
 *        header x-cron-secret: <CRON_SECRET>
 *
 * Deploy order: before 20261030_65 / _66 run, the route answers 200
 * {skipped: "schema_missing"} and sends NOTHING — no marker, no notice.
 */

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** At most this many candidate grants a run; the rest wait for the next run. */
const REMINDER_CANDIDATE_LIMIT = 500;
const ID_CHUNK = 300;

const SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const horizonIso = new Date(now.getTime() + 7 * DAY_MS).toISOString();

  // 1. candidate users: a grant ending within 7 days
  const { data: candidates, error: candErr } = await admin
    .from("library_access_grants")
    .select("user_id")
    .is("revoked_at", null)
    .gt("ends_at", nowIso)
    .lte("ends_at", horizonIso)
    .order("ends_at", { ascending: true })
    .limit(REMINDER_CANDIDATE_LIMIT);
  if (candErr) {
    if (SCHEMA_MISSING.has(candErr.code ?? "")) {
      return NextResponse.json({ ok: true, skipped: "schema_missing" });
    }
    console.error("[cron/library-grant-reminders] candidates:", candErr.code, candErr.message);
    return NextResponse.json({ error: "candidates_failed" }, { status: 500 });
  }
  const userIds = Array.from(new Set((candidates ?? []).map((c: { user_id: string }) => c.user_id)));
  if (userIds.length === 0) return NextResponse.json({ ok: true, candidates: 0, due: 0, sent: 0, already: 0, errors: 0 });

  // 2. their live grants (the whole chain, not just the ending one)
  const rows: LibraryGrantRowWithUser[] = [];
  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const { data, error } = await admin
      .from("library_access_grants")
      .select("id, user_id, plan_ref, source, starts_at, ends_at, revoked_at")
      .in("user_id", userIds.slice(i, i + ID_CHUNK))
      .is("revoked_at", null)
      .gt("ends_at", nowIso);
    if (error) {
      console.error("[cron/library-grant-reminders] chains:", error.code, error.message);
      return NextResponse.json({ error: "chains_failed" }, { status: 500 });
    }
    rows.push(...((data ?? []) as LibraryGrantRowWithUser[]));
  }

  // 3. marker first, notice only for a marker this run created
  const due = planLibraryReminders(rows, now);
  let sent = 0;
  let already = 0;
  let errors = 0;
  for (const r of due) {
    const { data: inserted, error } = await admin
      .from("library_grant_reminders")
      .upsert(
        { grant_id: r.grantId, offset_days: r.offset, user_id: r.userId, ends_at: r.endsAt },
        { onConflict: "grant_id,offset_days", ignoreDuplicates: true },
      )
      .select("grant_id");
    if (error) {
      if (SCHEMA_MISSING.has(error.code ?? "")) {
        return NextResponse.json({ ok: true, skipped: "schema_missing", sent });
      }
      errors += 1;
      console.error("[cron/library-grant-reminders] marker:", error.code, error.message);
      continue;
    }
    if (!inserted || inserted.length === 0) {
      already += 1;
      continue;
    }
    const notice = libraryReminderNotice(r, now);
    await recordNotification({ userId: r.userId, ...notice });
    sent += 1;
  }

  // 4. the same reminders by e-mail — their own once-only rows, so a failed
  //    or not-yet-configured e-mail never uses up the in-app notice (or back).
  const email = await sendLibraryReminderEmails(admin, due, now);

  return NextResponse.json({ ok: true, candidates: userIds.length, due: due.length, sent, already, errors, email });
}

/**
 * Step 4. Never throws, never stops the in-app step's answer: a missing
 * email_reminder_log (20261125_20 not run) or no Resend key is reported in
 * `email.skipped` and nothing is sent.
 */
async function sendLibraryReminderEmails(
  admin: Awaited<ReturnType<typeof createServiceClient>>,
  due: PlannedLibraryReminder[],
  now: Date,
): Promise<EmailStepReport> {
  const report = emptyEmailReport();
  if (!emailConfigured(process.env)) return { ...report, skipped: "email_unavailable" };
  if (due.length === 0) return report;
  try {
    report.due = due.length;
    const lookup = await loadEmailRecipients(admin, due.map((r) => r.userId), ["renewal"]);
    if (lookup.error) {
      console.error("[cron/library-grant-reminders] email recipients:", lookup.error);
      return { ...report, ok: false, error: "recipients_failed" };
    }
    report.muted = lookup.muted;
    report.noAddress = lookup.noAddress;
    for (const r of due) {
      const to = lookup.addresses.get(r.userId);
      const key = libraryEmailKey(r);
      if (!to || !key) continue;
      const outcome = await sendReminderOnce(admin, key, { to, ...libraryEmailMessage(r, now) });
      if (outcome === "schema_missing") return { ...report, skipped: "schema_missing" };
      if (outcome === "sent") report.sent++;
      else if (outcome === "already") report.already++;
      else report.failed++;
    }
    return report;
  } catch (err) {
    console.error("[cron/library-grant-reminders] email step threw:", err instanceof Error ? err.name : "error");
    return { ...report, ok: false, error: "email_step_threw" };
  }
}
