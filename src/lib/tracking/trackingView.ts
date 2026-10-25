/**
 * trackingView.ts — the WHITELIST serializer of the client's case tracking
 * page (N3.6, owner §٤٥ axis 6; migration 20261025_32_case_tracking_links.sql).
 *
 * The page's one read is public.case_tracking_snapshot (service role), which
 * already returns only {title, case_number, court, stage, hearings[{date,
 * time, court}]}. This module is the second gate: it REBUILDS the view field
 * by field from that object, so a column added to the SQL later (or anything
 * else in the payload) can never reach the page by accident. Never notes,
 * memos, documents, parties, phones, ids or fees.
 *
 * Decisions are not shown: no column in our schema marks a court decision as
 * approved for the client (see the migration header).
 *
 * Pure (no imports), so `node --test` loads it directly.
 */

/** The link's secret: 32 random bytes, hex (shareSecrets.generateShareToken). */
export const TRACKING_TOKEN_RE = /^[0-9a-f]{64}$/;

export function isTrackingToken(value: unknown): value is string {
  return typeof value === "string" && TRACKING_TOKEN_RE.test(value);
}

export function trackingPath(token: string): string {
  return `/track/${token}`;
}

export const STAGE_LABEL_AR: Record<string, string> = {
  first_instance: "الدرجة الابتدائية",
  appeal: "الاستئناف",
  cassation: "النقض",
  execution: "التنفيذ",
};

export interface TrackingHearing {
  /** Wall-clock Riyadh date "YYYY-MM-DD". */
  date: string;
  /** "HH:MM", or null when the hearing has no set time. */
  time: string | null;
  court: string | null;
}

export interface TrackingView {
  title: string | null;
  caseNumber: string | null;
  court: string | null;
  stageLabel: string | null;
  hearings: TrackingHearing[];
}

export const MAX_TRACKING_HEARINGS = 20;
const MAX_TEXT = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_TEXT) : null;
}

/** Snapshot (unknown shape) → the view, or null when it is not a snapshot at all. */
export function toTrackingView(raw: unknown): TrackingView | null {
  if (!isRecord(raw)) return null;
  const stage = typeof raw.stage === "string" ? STAGE_LABEL_AR[raw.stage] ?? null : null;
  const hearings: TrackingHearing[] = [];
  if (Array.isArray(raw.hearings)) {
    for (const h of raw.hearings) {
      if (hearings.length >= MAX_TRACKING_HEARINGS) break;
      if (!isRecord(h) || typeof h.date !== "string" || !DATE_RE.test(h.date)) continue;
      hearings.push({
        date: h.date,
        time: typeof h.time === "string" && TIME_RE.test(h.time) ? h.time : null,
        court: text(h.court),
      });
    }
  }
  return {
    title: text(raw.title),
    caseNumber: text(raw.case_number),
    court: text(raw.court),
    stageLabel: stage,
    hearings,
  };
}
