import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronSecretMatches } from "@/lib/payments/fulfillDecision";
import { notifyReminderOnce } from "@/lib/email/reminderDelivery";
import {
  LICENCE_EXPIRY_HORIZON_DAYS,
  licenceExpiryKind,
  licenceExpiryNotice,
  licenceNoticeMuted,
  planLicenceExpiryNotices,
  type LicenceExpiryRow,
  type LicenceNoticeSettings,
} from "@/lib/licence/licenceExpiry";

/**
 * POST /api/v1/cron/licence-expiry — owner ٢٤١ (27 Nov 2026, batch l19): the
 * licence expiry alerts that replace l18's «جدّد رخصتك أولاً» refusal.
 *
 *   1. public.licence_expiry_alerts(NULL, 30) (20261209_10): the licences of
 *      VERIFIED lawyers / legal consultants, firm owners and providers whose
 *      date is within 30 days or already past;
 *   2. per licence, the band it is in (30 days / 7 days / the last day or
 *      past — src/lib/licence/licenceExpiry.ts), only the most urgent;
 *   3. IN-APP: one notice per (stage, licence, recipient, licence date) —
 *      claim → insert → record in public.email_reminder_log
 *      (notifyReminderOnce, kinds licence_expiry_30d/7d/0d_app). A renewed
 *      date is a new cycle. Skipped for an account that turned notifications
 *      or the «تجديدات الترخيص» category off, or is suspended. A failed
 *      settings read sends nothing for those accounts (fail closed — a muted
 *      user is never notified because a read failed); the next run retries.
 *   No e-mail (the owner asked for the notifications and the dashboard).
 *
 * Before 20261209_10 runs the function is missing and the route answers 200
 * {skipped: "schema_missing"}: nothing is sent, nothing can repeat.
 *
 * ── AUTH — fails CLOSED ─────────────────────────────────────────────────────
 * Header `x-cron-secret` must equal CRON_SECRET (cronSecretMatches). Unset
 * secret or a wrong header → 401.
 *
 * ── SCHEDULE ────────────────────────────────────────────────────────────────
 * Once a day in the Riyadh morning (e.g. 08:00): n8n Schedule Trigger → HTTP
 * Request POST https://nezamy.sa/api/v1/cron/licence-expiry, header
 * x-cron-secret. More often is harmless (once-only per stage and date).
 */

export const dynamic = "force-dynamic";

/** At most this many licences a run (the rest wait for the next run). */
const MAX_NOTICES = 5000;
const ID_CHUNK = 150;
const SCHEMA_MISSING = new Set(["42883", "PGRST202", "42P01", "PGRST205"]);

export async function POST(request: NextRequest) {
  if (!cronSecretMatches(request.headers.get("x-cron-secret"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = await createServiceClient();
  const now = new Date();

  const { data, error } = await admin.rpc("licence_expiry_alerts", {
    p_user_ids: null,
    p_horizon_days: LICENCE_EXPIRY_HORIZON_DAYS,
  });
  if (error) {
    if (SCHEMA_MISSING.has(error.code ?? "")) return NextResponse.json({ ok: true, skipped: "schema_missing" });
    console.error("[cron/licence-expiry] licences:", error.code, error.message);
    return NextResponse.json({ ok: false, error: "licences_failed" }, { status: 500 });
  }
  const planned = planLicenceExpiryNotices((Array.isArray(data) ? data : []) as LicenceExpiryRow[], now).slice(0, MAX_NOTICES);

  // who may be told: settings (muted?) and suspension, per chunk of users
  const users = Array.from(new Set(planned.map((p) => p.row.user_id)));
  const allowed = new Set<string>();
  let muted = 0;
  let settingsFailed = 0;
  for (let i = 0; i < users.length; i += ID_CHUNK) {
    const part = users.slice(i, i + ID_CHUNK);
    const [settings, banned] = await Promise.all([
      admin.from("user_settings").select("user_id, notifications_enabled, preferences").in("user_id", part),
      // Suspended accounts (20261124_60) get no reminders. Best-effort, like loadEmailRecipients.
      Promise.resolve()
        .then(() => admin.rpc("admin_suspended_user_ids", { p_ids: part }))
        .then((r) => r, () => null),
    ]);
    if (settings.error) {
      console.error("[cron/licence-expiry] user_settings:", settings.error.code, settings.error.message);
      settingsFailed += part.length;
      continue;
    }
    const suspended = new Set<string>(
      banned && !banned.error && Array.isArray(banned.data)
        ? (banned.data as unknown[]).map((r) => (typeof r === "string" ? r : String((r as Record<string, unknown>)?.admin_suspended_user_ids ?? "")))
        : [],
    );
    const byUser = new Map<string, LicenceNoticeSettings>();
    for (const s of (settings.data ?? []) as Array<LicenceNoticeSettings & { user_id: string }>) byUser.set(s.user_id, s);
    for (const id of part) {
      if (suspended.has(id) || licenceNoticeMuted(byUser.get(id))) muted++;
      else allowed.add(id);
    }
  }

  let sent = 0;
  let already = 0;
  let failed = 0;
  for (const p of planned) {
    if (!allowed.has(p.row.user_id)) continue;
    const notice = licenceExpiryNotice(p.row.holder, p.daysLeft);
    const outcome = await notifyReminderOnce(
      admin,
      { kind: licenceExpiryKind(p.stage), subjectId: p.row.subject_id, recipientUserId: p.row.user_id, dueOn: p.row.expiry.slice(0, 10) },
      { title: notice.title, body: notice.body, href: notice.href },
    );
    if (outcome === "schema_missing") {
      return NextResponse.json({ ok: true, skipped: "schema_missing", due: planned.length, sent });
    }
    if (outcome === "sent") sent++;
    else if (outcome === "already") already++;
    else failed++;
  }

  return NextResponse.json({
    ok: true,
    due: planned.length,
    sent,
    already,
    failed,
    muted,
    ...(settingsFailed > 0 ? { settingsFailed } : {}),
  });
}
