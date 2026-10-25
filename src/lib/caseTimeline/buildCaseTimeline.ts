/**
 * buildCaseTimeline.ts — one chronological line for a case file (N3.7, owner
 * §٤٥ axis 1: «تايم لاين تفاعلي بملف كل قضية»): hearings, litigation stages,
 * ledger entries and the notes the reader may see, merged on ONE sort key.
 *
 * Time zones (plan review focus 4): a hearing's date and time and a stage's
 * dates are FLOATING wall-clock values in Riyadh (20260903_phase1). They are
 * placed on the line as +03:00 — the convention hearingReminders.ts and the
 * deadline reminders use — and never through `new Date("YYYY-MM-DD")`, which
 * reads UTC midnight and moves a Riyadh day. Ledger entries and notes are real
 * instants (timestamptz) and are used as they are.
 *
 * Pure (no imports), so `node --test` loads it directly.
 */

export type TimelineKind = "hearing" | "stage_opened" | "stage_closed" | "ledger" | "note";

export interface TimelineItem {
  key: string;
  kind: TimelineKind;
  /** Epoch ms of the moment on the line. */
  sortMs: number;
  /** Wall-clock date (Riyadh) "YYYY-MM-DD" of that moment, for day grouping. */
  day: string;
  /** "HH:MM" when the source carries a time of day; null for date-only sources. */
  time: string | null;
  title: string;
  detail: string | null;
  /** hearing: scheduled/held/…; ledger: in/out; note: its visibility. */
  tag: string | null;
  /** hearing still ahead of `nowMs`. */
  upcoming: boolean;
}

export interface TimelineHearing { id: string; date: string; time?: string | null; title: string; status: string; location?: string | null }
export interface TimelineStage { id: string; degree: string; courtName?: string | null; openedOn?: string | null; closedOn?: string | null; outcome?: string | null; createdAt: string }
export interface TimelineLedger { id: string; direction: string; channel: string; title: string; notes?: string | null; occurredAt: string }
export interface TimelineNote { id: string; body: string; visibility: string; createdAt: string; authorName?: string | null; source: "case_note" | "dashboard_note" }

export interface TimelineInput {
  hearings?: readonly TimelineHearing[];
  stages?: readonly TimelineStage[];
  ledger?: readonly TimelineLedger[];
  notes?: readonly TimelineNote[];
  nowMs: number;
  labels: {
    degree: (dbDegree: string) => string;
    outcome: (dbOutcome: string) => string | null;
    ledgerTitle: (direction: string, channel: string, title: string) => string;
  };
}

const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

/** A Riyadh wall-clock date (and optional time) → epoch ms; null when malformed. */
export function riyadhWallClockMs(date: string, time?: string | null): number | null {
  const d = DATE_RE.exec(date ?? "");
  if (!d) return null;
  let hh = 0;
  let mm = 0;
  if (time) {
    const t = TIME_RE.exec(time);
    if (!t) return null;
    hh = Number(t[1]);
    mm = Number(t[2]);
    if (hh > 23 || mm > 59) return null;
  }
  const ms = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), hh, mm) - RIYADH_OFFSET_MS;
  return Number.isNaN(ms) ? null : ms;
}

/** Epoch ms → the Riyadh wall-clock day and "HH:MM". */
export function riyadhDayAndTime(ms: number): { day: string; time: string } {
  const r = new Date(ms + RIYADH_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    day: `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`,
    time: `${pad(r.getUTCHours())}:${pad(r.getUTCMinutes())}`,
  };
}

const excerpt = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);

export function buildCaseTimeline(input: TimelineInput): TimelineItem[] {
  const out: TimelineItem[] = [];
  const { labels, nowMs } = input;

  for (const h of input.hearings ?? []) {
    const hasTime = !!h.time && TIME_RE.test(h.time);
    const ms = riyadhWallClockMs(h.date, hasTime ? h.time : null);
    if (ms === null) continue;
    out.push({
      key: `hearing:${h.id}`,
      kind: "hearing",
      sortMs: ms,
      day: h.date,
      time: hasTime ? (h.time as string).slice(0, 5) : null,
      title: h.title,
      detail: h.location?.trim() ? h.location.trim() : null,
      tag: h.status,
      // An untimed hearing stays ahead for its whole Riyadh day.
      upcoming: h.status === "scheduled" && (hasTime ? ms >= nowMs : ms + DAY_MS > nowMs),
    });
  }

  for (const s of input.stages ?? []) {
    const court = s.courtName?.trim() ? s.courtName.trim() : null;
    const openedMs = s.openedOn ? riyadhWallClockMs(s.openedOn) : null;
    const openedAt = openedMs ?? Date.parse(s.createdAt);
    if (!Number.isNaN(openedAt)) {
      const dt = riyadhDayAndTime(openedAt);
      out.push({
        key: `stage:${s.id}:opened`,
        kind: "stage_opened",
        sortMs: openedAt,
        day: openedMs !== null ? (s.openedOn as string) : dt.day,
        time: openedMs !== null ? null : dt.time,
        title: `بدء درجة التقاضي: ${labels.degree(s.degree)}`,
        detail: court,
        tag: null,
        upcoming: false,
      });
    }
    const closedMs = s.closedOn ? riyadhWallClockMs(s.closedOn) : null;
    if (closedMs !== null) {
      const outcome = s.outcome ? labels.outcome(s.outcome) : null;
      out.push({
        key: `stage:${s.id}:closed`,
        kind: "stage_closed",
        sortMs: closedMs,
        day: s.closedOn as string,
        time: null,
        title: `انتهاء درجة التقاضي: ${labels.degree(s.degree)}`,
        detail: outcome ? `النتيجة: ${outcome}` : court,
        tag: null,
        upcoming: false,
      });
    }
  }

  for (const l of input.ledger ?? []) {
    const ms = Date.parse(l.occurredAt);
    if (Number.isNaN(ms)) continue;
    const dt = riyadhDayAndTime(ms);
    out.push({
      key: `ledger:${l.id}`,
      kind: "ledger",
      sortMs: ms,
      day: dt.day,
      time: dt.time,
      title: labels.ledgerTitle(l.direction, l.channel, l.title),
      detail: l.notes?.trim() ? excerpt(l.notes.trim()) : null,
      tag: l.direction,
      upcoming: false,
    });
  }

  for (const n of input.notes ?? []) {
    const ms = Date.parse(n.createdAt);
    if (Number.isNaN(ms)) continue;
    const dt = riyadhDayAndTime(ms);
    out.push({
      key: `${n.source}:${n.id}`,
      kind: "note",
      sortMs: ms,
      day: dt.day,
      time: dt.time,
      title: n.authorName ? `ملاحظة — ${n.authorName}` : "ملاحظة",
      detail: excerpt(n.body),
      tag: n.visibility,
      upcoming: false,
    });
  }

  // Newest first; ties keep a stable, readable order by key.
  return out.sort((a, b) => b.sortMs - a.sortMs || a.key.localeCompare(b.key));
}
