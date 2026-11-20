/**
 * reminderDelivery.ts — SERVER ONLY. Sends one reminder e-mail ONCE per
 * (kind, subject, recipient, day), through the shared sender, and finds who
 * may receive it. Used by the three reminder crons:
 *   /api/v1/cron/hearing-reminders, /api/v1/cron/poa-reminders,
 *   /api/v1/cron/library-grant-reminders.
 * And (20261201_45, batch l11-remind) by /api/v1/cron/task-reminders,
 * /api/v1/cron/contract-payment-reminders — which also mark their IN-APP
 * notices here (notifyReminderOnce, "_app" kinds) — and by the firm
 * invitation e-mail (POST /api/v1/firm/invitations, kind firm_invite).
 *
 * ONCE — public.email_reminder_log (20261125_20), primary key
 *   (kind, subject_id, recipient_user_id, due_on):
 *     1. claim: INSERT status 'sending' ON CONFLICT DO NOTHING; a row this
 *        call created is ours. An existing 'failed' row with attempts < 3 is
 *        claimed with a compare-and-set update (status + attempts must still
 *        be what was read), so two overlapping runs cannot both claim it.
 *     2. send through sendEmail, with a stable idempotency key (Resend: a retry
 *        of an attempt Resend in fact accepted is not delivered twice; SMTP: the same Message-ID);
 *     3. mark 'sent' or 'failed' (last_error is a short code — never a body
 *        or an address).
 *   A 'sending' row left by a crash is never re-sent: a missed e-mail beats a
 *   double one.
 *
 * WHO — loadEmailRecipients: the account's address is profiles.email (read
 *   with the service client); an account is skipped when it has no usable
 *   address, or when it turned e-mail off — user_settings.email_notifications
 *   = false or notifications_enabled = false, or the reminder's category set
 *   to false in preferences.notifications.categories (the settings page,
 *   src/app/settings/components/tabs/NotificationsTab.tsx). No settings row =
 *   the defaults (e-mail on). A failed settings read sends nothing (fail
 *   closed — a muted user is never e-mailed because a read failed).
 *
 * Never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlainEmail, sendEmail, type EmailMessage, type SendEmailDeps } from "./sendEmail.ts";

export type ReminderEmailKind =
  | "hearing_1d" | "poa_30d" | "poa_7d" | "library_7d" | "library_3d"
  // 20261201_45 (batch l11-remind): tasks due, contract installments, the firm
  // invitation e-mail. The "_app" kinds mark the IN-APP notice of the same
  // reminder (notifyReminderOnce) — their own rows, so neither channel uses
  // the other's up.
  | "task_due_1d" | "contract_pay_due" | "contract_pay_overdue" | "firm_invite"
  | "task_due_1d_app" | "contract_pay_due_app" | "contract_pay_overdue_app";

export const EMAIL_LOG_TABLE = "email_reminder_log";
export const EMAIL_LOG_CONFLICT = "kind,subject_id,recipient_user_id,due_on";
export const MAX_EMAIL_ATTEMPTS = 3;
/** Missing table / column (PostgREST + Postgres): the migration has not run. */
export const EMAIL_SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);
/** check_violation on the claim insert: the kind is newer than the database's CHECK. */
export const KIND_NOT_ALLOWED = "23514";

const ID_CHUNK = 150;

export interface ReminderKey {
  kind: ReminderEmailKind;
  subjectId: string;
  recipientUserId: string;
  /** YYYY-MM-DD */
  dueOn: string;
}

export interface UserSettingsRow {
  user_id: string;
  notifications_enabled?: boolean | null;
  email_notifications?: boolean | null;
  preferences?: unknown;
}

/**
 * True when this account turned these e-mails off. `categories` are the keys
 * of preferences.notifications.categories that cover this reminder; only an
 * explicit `false` mutes (an absent key keeps the category's default, on).
 */
export function emailMuted(row: UserSettingsRow | null | undefined, categories: readonly string[]): boolean {
  if (!row) return false;
  if (row.notifications_enabled === false || row.email_notifications === false) return true;
  const prefs = row.preferences;
  if (!prefs || typeof prefs !== "object") return false;
  const block = (prefs as Record<string, unknown>).notifications;
  if (!block || typeof block !== "object") return false;
  const cats = (block as Record<string, unknown>).categories;
  if (!cats || typeof cats !== "object") return false;
  return categories.some((c) => (cats as Record<string, unknown>)[c] === false);
}

export interface RecipientLookup {
  /** user id → address, only for accounts that may receive this reminder. */
  addresses: Map<string, string>;
  /** user id → profiles.user_type (decides which dashboard a link opens). */
  userTypes: Map<string, string | null>;
  muted: number;
  noAddress: number;
  error: string | null;
}

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

/** The addresses of `userIds` that may receive a reminder of these categories. */
export async function loadEmailRecipients(
  admin: SupabaseClient,
  userIds: readonly string[],
  categories: readonly string[],
): Promise<RecipientLookup> {
  const addresses = new Map<string, string>();
  const userTypes = new Map<string, string | null>();
  let muted = 0;
  let noAddress = 0;
  const ids = Array.from(new Set(userIds.filter((u) => typeof u === "string" && u)));
  try {
    for (const part of chunks(ids, ID_CHUNK)) {
      const [profiles, settings, banned] = await Promise.all([
        admin.from("profiles").select("id, email, user_type").in("id", part),
        admin
          .from("user_settings")
          .select("user_id, notifications_enabled, email_notifications, preferences")
          .in("user_id", part),
        // Suspended accounts (20261124_60) get no reminders. Best-effort: when
        // the function is missing or fails, nobody is skipped for it.
        Promise.resolve()
          .then(() => (typeof admin.rpc === "function" ? admin.rpc("admin_suspended_user_ids", { p_ids: part }) : null))
          .then((r) => r, () => null),
      ]);
      const suspended = new Set<string>(
        banned && !banned.error && Array.isArray((banned as { data?: unknown }).data)
          ? ((banned as { data: unknown[] }).data).map((r) => (typeof r === "string" ? r : String((r as Record<string, unknown>)?.admin_suspended_user_ids ?? "")))
          : [],
      );
      if (profiles.error) return { addresses: new Map(), userTypes, muted, noAddress, error: `profiles: ${profiles.error.code ?? profiles.error.message}` };
      if (settings.error) return { addresses: new Map(), userTypes, muted, noAddress, error: `user_settings: ${settings.error.code ?? settings.error.message}` };
      const byUser = new Map<string, UserSettingsRow>();
      for (const s of (settings.data ?? []) as UserSettingsRow[]) byUser.set(s.user_id, s);
      const emails = new Map<string, unknown>();
      for (const p of (profiles.data ?? []) as Array<{ id: string; email: unknown; user_type?: unknown }>) {
        emails.set(p.id, p.email);
        userTypes.set(p.id, typeof p.user_type === "string" ? p.user_type : null);
      }
      for (const id of part) {
        if (suspended.has(id) || emailMuted(byUser.get(id), categories)) {
          muted++;
          continue;
        }
        const raw = emails.get(id);
        const email = typeof raw === "string" ? raw.trim() : "";
        if (!isPlainEmail(email)) {
          noAddress++;
          continue;
        }
        addresses.set(id, email);
      }
    }
    return { addresses, userTypes, muted, noAddress, error: null };
  } catch (err) {
    return { addresses: new Map(), userTypes, muted, noAddress, error: err instanceof Error ? err.message : String(err) };
  }
}

export type ClaimOutcome = "claimed" | "already" | "schema_missing" | "error";

/** The primary-key columns of one reminder, for `.match()`. */
function keyColumns(key: ReminderKey): Record<string, string> {
  return {
    kind: key.kind,
    subject_id: key.subjectId,
    recipient_user_id: key.recipientUserId,
    due_on: key.dueOn,
  };
}

/** Step 1: make this reminder ours, or learn it is someone else's / done. */
export async function claimReminder(admin: SupabaseClient, key: ReminderKey): Promise<ClaimOutcome> {
  const { data, error } = await admin
    .from(EMAIL_LOG_TABLE)
    .upsert(
      {
        kind: key.kind,
        subject_id: key.subjectId,
        recipient_user_id: key.recipientUserId,
        due_on: key.dueOn,
        status: "sending",
        attempts: 1,
      },
      { onConflict: EMAIL_LOG_CONFLICT, ignoreDuplicates: true },
    )
    .select("kind");
  if (error) {
    if (EMAIL_SCHEMA_MISSING.has(error.code ?? "")) return "schema_missing";
    // 23514: the kind CHECK does not know this kind yet — the migration that
    // adds it (20261201_45 for the l11 kinds) has not run. Nothing is sent.
    if (error.code === KIND_NOT_ALLOWED) return "schema_missing";
    console.error("[email reminders] claim failed:", key.kind, error.code, error.message);
    return "error";
  }
  if (Array.isArray(data) && data.length > 0) return "claimed";

  // Already there: only a failed row with attempts left may be taken again.
  const { data: row, error: readErr } = await admin
    .from(EMAIL_LOG_TABLE)
    .select("status, attempts")
    .match(keyColumns(key))
    .maybeSingle();
  if (readErr) {
    console.error("[email reminders] claim read failed:", key.kind, readErr.code, readErr.message);
    return "error";
  }
  const current = row as { status: string; attempts: number } | null;
  if (!current || current.status !== "failed" || current.attempts >= MAX_EMAIL_ATTEMPTS) return "already";
  const { data: retaken, error: updErr } = await admin
    .from(EMAIL_LOG_TABLE)
    .update({ status: "sending", attempts: current.attempts + 1, last_error: null, updated_at: new Date().toISOString() })
    .match(keyColumns(key))
    .eq("status", "failed")
    .eq("attempts", current.attempts)
    .select("kind");
  if (updErr) {
    console.error("[email reminders] re-claim failed:", key.kind, updErr.code, updErr.message);
    return "error";
  }
  return Array.isArray(retaken) && retaken.length > 0 ? "claimed" : "already";
}

export type ReminderSendOutcome = "sent" | "already" | "failed" | "schema_missing" | "error";

/** Claim → send → record. */
export async function sendReminderOnce(
  admin: SupabaseClient,
  key: ReminderKey,
  message: Omit<EmailMessage, "idempotencyKey" | "tag">,
  deps: SendEmailDeps = {},
): Promise<ReminderSendOutcome> {
  try {
    const claim = await claimReminder(admin, key);
    if (claim !== "claimed") return claim;
    const result = await sendEmail(
      {
        ...message,
        tag: key.kind,
        idempotencyKey: `nezamy-${key.kind}-${key.subjectId}-${key.recipientUserId}-${key.dueOn}`,
        // l9 testinfra: a test account's reminder goes to the test mail sink
        userIds: [key.recipientUserId],
      },
      deps,
    );
    // 'sunk' (a test account, 20261129_90) is done, never retried: the row
    // is 'sent' with last_error 'sunk' so the log says where it went.
    const sent = result === "sent" || result === "sunk";
    const { error } = await admin
      .from(EMAIL_LOG_TABLE)
      .update({
        status: sent ? "sent" : "failed",
        last_error: result === "sunk" ? "sunk" : sent ? null : result,
        updated_at: new Date().toISOString(),
      })
      .match(keyColumns(key))
      .eq("status", "sending");
    if (error) console.error("[email reminders] status update failed:", key.kind, error.code, error.message);
    return sent ? "sent" : "failed";
  } catch (err) {
    console.error("[email reminders] send threw:", key.kind, err instanceof Error ? err.name : "error");
    return "error";
  }
}

/** One in-app notice (public.notifications: title, body, href). */
export interface InAppNotice {
  title: string;
  body: string;
  href: string;
}

/**
 * The IN-APP half of a once-only reminder (20261201_45): the same claim →
 * deliver → record as sendReminderOnce, with an "_app" kind, the notice
 * written straight into public.notifications (what recordNotification does,
 * but here the insert's error is seen, so a failed insert is retried on the
 * next run, up to 3 attempts). Before the migration runs the claim answers
 * "schema_missing" and NOTHING is written — never a notice without a marker,
 * which would repeat on every run.
 */
export async function notifyReminderOnce(
  admin: SupabaseClient,
  key: ReminderKey,
  notice: InAppNotice,
): Promise<ReminderSendOutcome> {
  try {
    const claim = await claimReminder(admin, key);
    if (claim !== "claimed") return claim;
    const { error: insErr } = await admin.from("notifications").insert({
      user_id: key.recipientUserId,
      title: notice.title,
      body: notice.body,
      href: notice.href,
    });
    if (insErr) console.error("[in-app reminders] notification insert failed:", key.kind, insErr.code, insErr.message);
    const { error } = await admin
      .from(EMAIL_LOG_TABLE)
      .update({
        status: insErr ? "failed" : "sent",
        last_error: insErr ? `notify_${insErr.code ?? "error"}`.slice(0, 200) : null,
        updated_at: new Date().toISOString(),
      })
      .match(keyColumns(key))
      .eq("status", "sending");
    if (error) console.error("[in-app reminders] status update failed:", key.kind, error.code, error.message);
    return insErr ? "failed" : "sent";
  } catch (err) {
    console.error("[in-app reminders] threw:", key.kind, err instanceof Error ? err.name : "error");
    return "error";
  }
}

/** Counters every reminder cron reports for its e-mail step. */
export interface EmailStepReport {
  ok: boolean;
  skipped?: "email_unavailable" | "schema_missing";
  due: number;
  sent: number;
  already: number;
  failed: number;
  muted: number;
  noAddress: number;
  error?: string;
}

export function emptyEmailReport(): EmailStepReport {
  return { ok: true, due: 0, sent: 0, already: 0, failed: 0, muted: 0, noAddress: 0 };
}

/**
 * The dashboard a reminder link opens: a «firm» account cannot open
 * /dashboard/lawyer/* (src/lib/auth/routeAccess.ts), every other recipient of
 * these reminders is a lawyer.
 */
export function dashboardRootFor(userType: string | null | undefined): "/dashboard/firm" | "/dashboard/lawyer" {
  return userType === "firm" ? "/dashboard/firm" : "/dashboard/lawyer";
}

/**
 * user id → profiles.user_type, for the in-app link of a reminder (the e-mail
 * step gets the same map from loadEmailRecipients). A failed read leaves the
 * map partial: dashboardRootFor then falls back to the lawyer dashboard.
 */
export async function loadUserTypes(admin: SupabaseClient, userIds: readonly string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(new Set(userIds.filter((u) => typeof u === "string" && u)));
  try {
    for (const part of chunks(ids, ID_CHUNK)) {
      const { data, error } = await admin.from("profiles").select("id, user_type").in("id", part);
      if (error) {
        console.error("[reminders] user types:", error.code, error.message);
        break;
      }
      for (const p of (data ?? []) as Array<{ id: string; user_type?: unknown }>) {
        out.set(p.id, typeof p.user_type === "string" ? p.user_type : null);
      }
    }
  } catch (err) {
    console.error("[reminders] user types threw:", err instanceof Error ? err.name : "error");
  }
  return out;
}

/** Riyadh's calendar day (UTC+3, no DST) `days` after `now`, as YYYY-MM-DD. */
export function riyadhDayPlus(now: Date, days: number): string {
  return new Date(now.getTime() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}
