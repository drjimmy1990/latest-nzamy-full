/**
 * reminderDelivery.ts — SERVER ONLY. Sends one reminder e-mail ONCE per
 * (kind, subject, recipient, day), through the shared sender, and finds who
 * may receive it. Used by the three reminder crons:
 *   /api/v1/cron/hearing-reminders, /api/v1/cron/poa-reminders,
 *   /api/v1/cron/library-grant-reminders.
 *
 * ONCE — public.email_reminder_log (20261125_20), primary key
 *   (kind, subject_id, recipient_user_id, due_on):
 *     1. claim: INSERT status 'sending' ON CONFLICT DO NOTHING; a row this
 *        call created is ours. An existing 'failed' row with attempts < 3 is
 *        claimed with a compare-and-set update (status + attempts must still
 *        be what was read), so two overlapping runs cannot both claim it.
 *     2. send through sendEmail, with a stable Resend Idempotency-Key (a retry
 *        of an attempt Resend in fact accepted is not delivered twice);
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

export type ReminderEmailKind = "hearing_1d" | "poa_30d" | "poa_7d" | "library_7d" | "library_3d";

export const EMAIL_LOG_TABLE = "email_reminder_log";
export const EMAIL_LOG_CONFLICT = "kind,subject_id,recipient_user_id,due_on";
export const MAX_EMAIL_ATTEMPTS = 3;
/** Missing table / column (PostgREST + Postgres): the migration has not run. */
export const EMAIL_SCHEMA_MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

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
  let muted = 0;
  let noAddress = 0;
  const ids = Array.from(new Set(userIds.filter((u) => typeof u === "string" && u)));
  try {
    for (const part of chunks(ids, ID_CHUNK)) {
      const [profiles, settings] = await Promise.all([
        admin.from("profiles").select("id, email").in("id", part),
        admin
          .from("user_settings")
          .select("user_id, notifications_enabled, email_notifications, preferences")
          .in("user_id", part),
      ]);
      if (profiles.error) return { addresses: new Map(), muted, noAddress, error: `profiles: ${profiles.error.code ?? profiles.error.message}` };
      if (settings.error) return { addresses: new Map(), muted, noAddress, error: `user_settings: ${settings.error.code ?? settings.error.message}` };
      const byUser = new Map<string, UserSettingsRow>();
      for (const s of (settings.data ?? []) as UserSettingsRow[]) byUser.set(s.user_id, s);
      const emails = new Map<string, unknown>();
      for (const p of (profiles.data ?? []) as Array<{ id: string; email: unknown }>) emails.set(p.id, p.email);
      for (const id of part) {
        if (emailMuted(byUser.get(id), categories)) {
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
    return { addresses, muted, noAddress, error: null };
  } catch (err) {
    return { addresses: new Map(), muted, noAddress, error: err instanceof Error ? err.message : String(err) };
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
      },
      deps,
    );
    const sent = result === "sent";
    const { error } = await admin
      .from(EMAIL_LOG_TABLE)
      .update({
        status: sent ? "sent" : "failed",
        last_error: sent ? null : result,
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

/** Riyadh's calendar day (UTC+3, no DST) `days` after `now`, as YYYY-MM-DD. */
export function riyadhDayPlus(now: Date, days: number): string {
  return new Date(now.getTime() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}
