/**
 * hearingReminders.ts — SERVER ONLY. In-platform hearing reminders (P4 N3.2).
 * ─────────────────────────────────────────────────────────────────────────
 * Owner ٤٥ axis 2: reminders a week before, three days before, the previous
 * evening at 20:00 and the hearing morning at 07:00, to the lawyer, the
 * consultant responsible and the office owner. In-platform channel only;
 * platform accounts only.
 *
 * WHEN — src/lib/calendar/hearingReminderStages.ts, the one stage constant
 * the .ics download also reads (owner question ٢٦٥ pending). This module turns
 * each stage's WALL CLOCK into an instant by reading it as Asia/Riyadh
 * (UTC+3, no DST): a hearing row records no zone, the courts it is filed in
 * are Saudi, and the deadline reminders already read 06:00 as Riyadh. So
 * «the previous day 20:00» is (hearing_date − 1 calendar day) 20:00 +03:00,
 * whatever the hearing's own hour.
 *
 * WHO — public.hearing_reminder_targets (20261025_30_hearing_reminders.sql):
 * the hearing owner, the case lead while an active member of the case's firm,
 * case-team consultants, and the firm owner. Never the client.
 *
 * HOW — the hourly scheduler (POST /api/v1/cron/deadlines) calls
 * queueHearingReminders, then deliverHearingReminders, with the service
 * client (it has no user session; see that route's header).
 *
 *   QUEUE   every scheduled hearing dated Riyadh today .. +8 days. For each
 *           (hearing, recipient, stage) the desired schedule is computed;
 *           a stage is WRITTEN only if it is after the hearing was created
 *           and not more than HEARING_QUEUE_GRACE_MINUTES in the past — so a
 *           late-created hearing never gets a «week before» reminder days
 *           after the fact, while a stage that fell due between two hourly
 *           runs is still sent. Idempotent: an upsert on the outbox's own
 *           hearing key (uq_notification_outbox_hearing_once); a kind already
 *           pending or sent for the identical schedule is left alone; a sent
 *           kind whose schedule moved (re-dated hearing) is revived. Pending
 *           rows of a recipient no longer in the set, or whose right schedule
 *           is already past, are cancelled. Sent rows are history and never
 *           touched.
 *   DELIVER every due pending hearing row. The hearing is re-read and the
 *           stage recomputed first: a hearing no longer scheduled, re-dated,
 *           or already started cancels the row instead of sending a wrong
 *           reminder. Hearing rows are a separate step from the deadline rows,
 *           so neither can starve the other's 200-row window.
 *
 * Never throws: every failure is logged and reported in the result.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  HEARING_REMINDER_STAGES,
  hearingStageTargets,
  parseHearingDate,
  parseHearingTime,
  minutesToWallClock,
  type HearingStage,
  type HearingStageKey,
  type WallClock,
} from "./calendar/hearingReminderStages.ts";
import { toArabicDigits } from "./services/arabicCount.ts";
import { formatTimeOfDayAr } from "../app/dashboard/lawyer/hearings/_timeOfDay.ts";

export const RIYADH_OFFSET = "+03:00";
export const HEARING_KIND_PREFIX = "hearing_reminder_";
/** The 7-day stage plus a day of slack. */
export const HEARING_QUEUE_WINDOW_DAYS = 8;
/** Two hourly runs: a stage that fell due since the last run is still sent. */
export const HEARING_QUEUE_GRACE_MINUTES = 120;
export const HEARING_OUTBOX_CONFLICT_KEY = "hearing_id,recipient_user_id,channel,kind";
export const MAX_HEARING_DELIVER_PER_RUN = 200;

const RPC_PAGE = 1000;
const ID_CHUNK = 150;
const WRITE_CHUNK = 200;

export type HearingRecipientVia = "owner" | "lead" | "consultant" | "firm_owner";

/** One row of public.hearing_reminder_targets. */
export interface HearingTarget {
  hearing_id: string;
  recipient_user_id: string;
  via: HearingRecipientVia | string;
  case_request_id: string | null;
  title: string;
  hearing_date: string;
  hearing_time: string | null;
  court_name: string | null;
  location: string | null;
  created_at: string;
}

export interface HearingReminderPayload {
  via: string;
  title: string;
  hearingDate: string;
  hearingTime: string | null;
  caseRequestId: string | null;
}

export interface PlannedHearingRow {
  hearing_id: string;
  recipient_user_id: string;
  channel: "in_app";
  kind: string;
  scheduled_for: string;
  payload: HearingReminderPayload;
  /** False when the stage is already past (or before the hearing existed): never written. */
  writable: boolean;
}

export interface ExistingHearingOutboxRow {
  id: string;
  hearing_id: string;
  recipient_user_id: string;
  kind: string;
  status: string;
  scheduled_for: string;
}

export interface HearingOutboxWrite {
  hearing_id: string;
  recipient_user_id: string;
  channel: "in_app";
  kind: string;
  scheduled_for: string;
  payload: HearingReminderPayload;
  status: "pending";
  attempts: 0;
  last_error: null;
  sent_at: null;
}

/** A wall clock read as Riyadh → epoch ms. */
export function riyadhInstantMs(w: WallClock): number {
  return Date.parse(`${w.date}T${w.time}:00${RIYADH_OFFSET}`);
}

export function hearingKind(key: HearingStageKey): string {
  return `${HEARING_KIND_PREFIX}${key}`;
}

/** Riyadh's calendar day for an instant, as YYYY-MM-DD. */
function riyadhDay(now: Date): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** The hearing dates the queue step looks at: Riyadh today .. +8 days. */
export function hearingWindow(now: Date): { from: string; to: string } {
  const from = riyadhDay(now);
  const day0 = parseHearingDate(from) as number;
  return { from, to: minutesToWallClock(day0 + HEARING_QUEUE_WINDOW_DAYS * 1440).date };
}

/** "HH:MM" of a stored time, or null. */
function hhmm(time: string | null | undefined): string | null {
  const t = parseHearingTime(time);
  return t ? `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}` : null;
}

/**
 * The instant after which a reminder is pointless: the hearing's start, or for
 * a hearing with no hour the end of its day (Riyadh).
 */
export function hearingCutoffMs(date: string, time: string | null | undefined): number | null {
  const day0 = parseHearingDate(date);
  if (day0 === null) return null;
  const t = hhmm(time);
  if (t) return riyadhInstantMs({ date, time: t });
  return riyadhInstantMs({ date: minutesToWallClock(day0 + 1440).date, time: "00:00" });
}

/** Every desired reminder row of these targets, writable or not. */
export function planHearingReminders(
  targets: readonly HearingTarget[],
  now: Date,
  stages: readonly HearingStage[] = HEARING_REMINDER_STAGES,
): PlannedHearingRow[] {
  const graceFloor = now.getTime() - HEARING_QUEUE_GRACE_MINUTES * 60_000;
  const rows: PlannedHearingRow[] = [];
  for (const t of targets) {
    const created = Date.parse(t.created_at);
    const floor = Number.isNaN(created) ? graceFloor : Math.max(created, graceFloor);
    const time = hhmm(t.hearing_time);
    for (const stage of hearingStageTargets(t.hearing_date, time, stages)) {
      const at = riyadhInstantMs(stage.at);
      if (Number.isNaN(at)) continue;
      rows.push({
        hearing_id: t.hearing_id,
        recipient_user_id: t.recipient_user_id,
        channel: "in_app",
        kind: hearingKind(stage.key),
        scheduled_for: new Date(at).toISOString(),
        payload: {
          via: t.via,
          title: t.title,
          hearingDate: t.hearing_date,
          hearingTime: time,
          caseRequestId: t.case_request_id,
        },
        writable: at > floor,
      });
    }
  }
  return rows;
}

const rowKey = (r: { hearing_id: string; recipient_user_id: string; kind: string }) =>
  `${r.hearing_id}|${r.recipient_user_id}|${r.kind}`;
const sameInstant = (a: string, b: string) => {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return !Number.isNaN(x) && x === y;
};

/**
 * What to write and what to cancel, given the plan and the in_app rows already
 * stored for the same hearings. See the module header for each rule.
 */
export function reconcileHearingOutbox(
  plan: readonly PlannedHearingRow[],
  stored: readonly ExistingHearingOutboxRow[],
): { upserts: HearingOutboxWrite[]; cancelIds: string[] } {
  const byKey = new Map<string, ExistingHearingOutboxRow>();
  for (const e of stored) byKey.set(rowKey(e), e);
  const desiredKeys = new Set<string>();
  const upserts: HearingOutboxWrite[] = [];
  const cancelIds: string[] = [];

  for (const p of plan) {
    const k = rowKey(p);
    desiredKeys.add(k);
    const e = byKey.get(k);
    const same = e ? sameInstant(e.scheduled_for, p.scheduled_for) : false;
    if (e && same && (e.status === "sent" || e.status === "pending")) continue;
    if (p.writable) {
      upserts.push({
        hearing_id: p.hearing_id,
        recipient_user_id: p.recipient_user_id,
        channel: "in_app",
        kind: p.kind,
        scheduled_for: p.scheduled_for,
        payload: p.payload,
        status: "pending",
        attempts: 0,
        last_error: null,
        sent_at: null,
      });
    } else if (e && e.status === "pending" && !same) {
      cancelIds.push(e.id);
    }
  }
  for (const e of stored) {
    if (e.status === "pending" && !desiredKeys.has(rowKey(e))) cancelIds.push(e.id);
  }
  return { upserts, cancelIds };
}

/** Where the notification opens. */
export function hearingReminderHref(via: string, caseRequestId: string | null | undefined): string {
  const firm = via === "firm_owner";
  if (caseRequestId) return `/dashboard/${firm ? "firm" : "lawyer"}/cases/${encodeURIComponent(caseRequestId)}`;
  return firm ? "/dashboard/firm/hearings" : "/dashboard/lawyer/hearings";
}

/** The Arabic copy of one stage. */
export function buildHearingReminderCopy(
  key: HearingStageKey,
  h: { title: string; hearing_date: string; hearing_time: string | null; court_name?: string | null; location?: string | null },
  stages: readonly HearingStage[] = HEARING_REMINDER_STAGES,
): { title: string; body: string } {
  const stage = stages.find((s) => s.key === key);
  const lead = stage?.bodyAr ?? "تذكير بموعد جلسة";
  const time = hhmm(h.hearing_time);
  const place = (h.court_name ?? "").trim() || (h.location ?? "").trim();
  const when = `${toArabicDigits(h.hearing_date)}${time ? ` الساعة ${formatTimeOfDayAr(time)}` : ""}`;
  return {
    title: `تذكير بجلسة: ${h.title}`,
    body: `${lead} — ${when}${place ? ` — ${place}` : ""}.`,
  };
}

export interface DeliverableHearing {
  id: string;
  title: string;
  hearing_date: string;
  hearing_time: string | null;
  status: string;
  case_request_id: string | null;
  court_name: string | null;
  location: string | null;
}

export type DeliveryDecision =
  | { ok: true; title: string; body: string; href: string }
  | { ok: false; status: "cancelled" | "failed"; reason: string };

/** Whether a due row may be sent now, judged against the hearing as it is NOW. */
export function checkHearingDelivery(
  row: { kind: string; channel: string; scheduled_for: string; payload: unknown },
  hearing: DeliverableHearing | null,
  now: Date,
  stages: readonly HearingStage[] = HEARING_REMINDER_STAGES,
): DeliveryDecision {
  if (row.channel !== "in_app") return { ok: false, status: "failed", reason: "channel not configured" };
  if (!hearing) return { ok: false, status: "cancelled", reason: "hearing not found" };
  if (hearing.status !== "scheduled") return { ok: false, status: "cancelled", reason: "hearing is no longer scheduled" };
  const key = row.kind.startsWith(HEARING_KIND_PREFIX) ? (row.kind.slice(HEARING_KIND_PREFIX.length) as HearingStageKey) : null;
  const stage = key ? hearingStageTargets(hearing.hearing_date, hhmm(hearing.hearing_time), stages).find((s) => s.key === key) : undefined;
  if (!key || !stage) return { ok: false, status: "cancelled", reason: "schedule changed" };
  if (!sameInstant(new Date(riyadhInstantMs(stage.at)).toISOString(), row.scheduled_for)) {
    return { ok: false, status: "cancelled", reason: "schedule changed" };
  }
  const cutoff = hearingCutoffMs(hearing.hearing_date, hearing.hearing_time);
  if (cutoff === null || now.getTime() >= cutoff) return { ok: false, status: "cancelled", reason: "hearing already started" };
  const via = (row.payload as { via?: unknown } | null)?.via;
  const copy = buildHearingReminderCopy(key, hearing, stages);
  return { ok: true, ...copy, href: hearingReminderHref(typeof via === "string" ? via : "owner", hearing.case_request_id) };
}

function chunks<T>(xs: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}

export interface QueueResult {
  queued: number;
  cancelled: number;
  error: string | null;
}

/** QUEUE step. `admin` is the service client. */
export async function queueHearingReminders(admin: SupabaseClient, now: Date = new Date()): Promise<QueueResult> {
  let queued = 0;
  let cancelled = 0;
  try {
    const { from, to } = hearingWindow(now);
    const targets: HearingTarget[] = [];
    for (let offset = 0; ; offset += RPC_PAGE) {
      const { data, error } = await admin
        .rpc("hearing_reminder_targets", { p_from: from, p_to: to })
        .range(offset, offset + RPC_PAGE - 1);
      if (error) {
        console.error("[hearingReminders] targets rpc failed:", error.message, error.code);
        return { queued: 0, cancelled: 0, error: error.message };
      }
      const page = (data ?? []) as HearingTarget[];
      targets.push(...page);
      if (page.length < RPC_PAGE) break;
    }
    if (targets.length === 0) return { queued: 0, cancelled: 0, error: null };

    const plan = planHearingReminders(targets, now);
    const hearingIds = Array.from(new Set(targets.map((t) => t.hearing_id)));
    const stored: ExistingHearingOutboxRow[] = [];
    for (const ids of chunks(hearingIds, ID_CHUNK)) {
      const { data, error } = await admin
        .from("notification_outbox")
        .select("id, hearing_id, recipient_user_id, kind, status, scheduled_for")
        .in("hearing_id", ids)
        .eq("channel", "in_app");
      if (error) {
        // Without the stored rows a sent reminder could be re-armed; stop here.
        console.error("[hearingReminders] outbox read failed:", error.message, error.code);
        return { queued: 0, cancelled: 0, error: error.message };
      }
      stored.push(...((data ?? []) as ExistingHearingOutboxRow[]));
    }

    const { upserts, cancelIds } = reconcileHearingOutbox(plan, stored);
    let firstError: string | null = null;
    for (const rows of chunks(upserts, WRITE_CHUNK)) {
      const { error } = await admin.from("notification_outbox").upsert(rows, { onConflict: HEARING_OUTBOX_CONFLICT_KEY });
      if (error) {
        console.error("[hearingReminders] outbox upsert failed:", error.message, error.code);
        firstError ??= error.message;
      } else {
        queued += rows.length;
      }
    }
    for (const ids of chunks(cancelIds, ID_CHUNK)) {
      const { error } = await admin.from("notification_outbox").update({ status: "cancelled" }).in("id", ids).eq("status", "pending");
      if (error) {
        console.error("[hearingReminders] outbox cancel failed:", error.message, error.code);
        firstError ??= error.message;
      } else {
        cancelled += ids.length;
      }
    }
    return { queued, cancelled, error: firstError };
  } catch (err) {
    console.error("[hearingReminders] queue threw:", err);
    return { queued, cancelled, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface DeliverResult {
  sent: number;
  cancelled: number;
  failed: number;
  error: string | null;
}

interface DueHearingRow {
  id: string;
  recipient_user_id: string;
  channel: string;
  kind: string;
  scheduled_for: string;
  attempts: number | null;
  payload: unknown;
  hearings: DeliverableHearing | null;
}

/** DELIVER step. Writes in-app notifications straight to `notifications`. */
export async function deliverHearingReminders(admin: SupabaseClient, now: Date = new Date()): Promise<DeliverResult> {
  let sent = 0;
  let cancelled = 0;
  let failed = 0;
  try {
    const nowIso = now.toISOString();
    const { data, error } = await admin
      .from("notification_outbox")
      .select("id, recipient_user_id, channel, kind, scheduled_for, attempts, payload, hearings(id, title, hearing_date, hearing_time, status, case_request_id, court_name, location)")
      .eq("status", "pending")
      .not("hearing_id", "is", null)
      .lte("scheduled_for", nowIso)
      .order("scheduled_for", { ascending: true })
      .limit(MAX_HEARING_DELIVER_PER_RUN);
    if (error) {
      console.error("[hearingReminders] due rows query failed:", error.message, error.code);
      return { sent, cancelled, failed, error: error.message };
    }
    for (const row of (data ?? []) as unknown as DueHearingRow[]) {
      try {
        const attempts = (row.attempts ?? 0) + 1;
        const decision = checkHearingDelivery(row, row.hearings, now);
        if (!decision.ok) {
          await admin.from("notification_outbox")
            .update({ status: decision.status, last_error: decision.reason, attempts })
            .eq("id", row.id);
          if (decision.status === "cancelled") cancelled++; else failed++;
          continue;
        }
        const { error: insErr } = await admin.from("notifications").insert({
          user_id: row.recipient_user_id,
          title: decision.title,
          body: decision.body,
          href: decision.href,
        });
        if (insErr) {
          console.error("[hearingReminders] notification insert failed:", row.id, insErr.message, insErr.code);
          await admin.from("notification_outbox")
            .update({ status: "failed", last_error: insErr.message, attempts })
            .eq("id", row.id);
          failed++;
          continue;
        }
        const { error: updErr } = await admin.from("notification_outbox")
          .update({ status: "sent", sent_at: nowIso, attempts, last_error: null })
          .eq("id", row.id);
        if (updErr) console.error("[hearingReminders] outbox update (sent) failed:", row.id, updErr.message);
        sent++;
      } catch (err) {
        console.error("[hearingReminders] delivering one row threw:", row.id, err);
        failed++;
      }
    }
    return { sent, cancelled, failed, error: null };
  } catch (err) {
    console.error("[hearingReminders] deliver threw:", err);
    return { sent, cancelled, failed, error: err instanceof Error ? err.message : String(err) };
  }
}
