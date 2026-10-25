/**
 * hearingIcs.ts — one hearing as an iCalendar (.ics) file, RFC 5545.
 * ─────────────────────────────────────────────────────────────────────────
 * Owner ٤٦ part ٢: a calendar file with four reminders. The reminders are the
 * shared stages of hearingReminderStages.ts — the same constant the
 * in-platform reminders use. Apple Calendar and Outlook honour the VALARMs;
 * Google Calendar imports the event but drops them and applies the
 * calendar's own default notifications, which the button's tooltip says.
 *
 * ── Floating time, on purpose ────────────────────────────────────────────
 * DTSTART/DTEND carry no `Z` and no TZID: a hearing row stores a wall-clock
 * date and time and records no zone, and the hearings page's Google link
 * (googleCalUrl) already hands Google a floating stamp for the same reason.
 * The calendar app reads it in its own zone, which is the zone the lawyer
 * typed the hour in.
 *
 * ── Relative alarms ──────────────────────────────────────────────────────
 * An absolute TRIGGER must be UTC (RFC 5545 §3.8.6.3), which would assert a
 * zone the row does not have. Each VALARM therefore carries a RELATIVE
 * trigger: the wall-clock distance from the reminder to the hearing's start,
 * computed in hearingReminderStages.ts. For a 09:00 hearing that is −P7D,
 * −P3D, −PT13H (20:00 the day before) and −PT2H (07:00). In a zone with
 * daylight saving, a trigger that spans a clock change fires an hour off its
 * wall clock; the Kingdom keeps no DST.
 *
 * A hearing with no recorded hour is an all-day event (VALUE=DATE), and its
 * triggers are measured from that day's 00:00 — so the morning reminder is a
 * positive PT7H, which RFC 5545 allows.
 *
 * Lines end in CRLF and are folded at 75 OCTETS (Arabic letters are two bytes
 * each in UTF-8), never inside a character. Pure, relative imports only.
 */

import { hearingStageTargets, minutesToWallClock, parseHearingDate, parseHearingTime } from "./hearingReminderStages.ts";

export interface HearingIcsInput {
  /** The hearing's id; becomes `UID:<uid>@nezamy.sa`. */
  uid: string;
  title: string;
  /** YYYY-MM-DD, the row's own stored day. */
  date: string;
  /** HH:MM[:SS]; null/empty → an all-day event. */
  time?: string | null;
  /** hearings.duration_minutes; missing → 60, the Google link's default block. */
  durationMinutes?: number | null;
  location?: string | null;
  description?: string | null;
  /** DTSTAMP; defaults to now. */
  now?: Date;
}

const CRLF = "\r\n";
const DEFAULT_BLOCK_MINUTES = 60;

/** TEXT escaping (RFC 5545 §3.3.11): backslash, semicolon, comma, newline. */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** UTF-8 length of one code point, without Buffer (this module ships to the browser). */
function utf8Length(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0;
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/** Folds one content line at 75 octets; continuation lines start with a space. */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const size = utf8Length(ch);
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
      limit = 74; // the leading space takes one octet
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** Minutes before the start → a dur-value: 10080 → "-P7D", 150 → "-PT2H30M", −420 → "PT7H". */
export function formatIcsDuration(minutesBefore: number): string {
  const sign = minutesBefore > 0 ? "-" : "";
  let rest = Math.abs(Math.round(minutesBefore));
  const days = Math.floor(rest / 1440);
  rest -= days * 1440;
  const hours = Math.floor(rest / 60);
  const minutes = rest - hours * 60;
  let out = `${sign}P`;
  if (days) out += `${days}D`;
  if (hours || minutes || !days) {
    out += "T";
    if (hours) out += `${hours}H`;
    if (minutes || !hours) out += `${minutes}M`;
  }
  return out;
}

const compactDate = (date: string) => date.replace(/-/g, "");
const compactStamp = (date: string, time: string) => `${compactDate(date)}T${time.replace(":", "")}00`;

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** The download's file name. ASCII on purpose: some mail clients mangle non-ASCII names. */
export function hearingIcsFilename(date: string): string {
  return `hearing-${date}.ics`;
}

/** The whole VCALENDAR, or null when the date is not a real day. */
export function buildHearingIcs(input: HearingIcsInput): string | null {
  const day0 = parseHearingDate(input.date);
  if (day0 === null) return null;
  const t = parseHearingTime(input.time);

  const out: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nezamy//Hearings//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@nezamy.sa`,
    `DTSTAMP:${utcStamp(input.now ?? new Date())}`,
  ];

  if (t) {
    const start = day0 + t.h * 60 + t.m;
    const block = typeof input.durationMinutes === "number" && input.durationMinutes > 0
      ? Math.round(input.durationMinutes)
      : DEFAULT_BLOCK_MINUTES;
    const s = minutesToWallClock(start);
    const e = minutesToWallClock(start + block);
    out.push(`DTSTART:${compactStamp(s.date, s.time)}`, `DTEND:${compactStamp(e.date, e.time)}`);
  } else {
    out.push(
      `DTSTART;VALUE=DATE:${compactDate(input.date)}`,
      `DTEND;VALUE=DATE:${compactDate(minutesToWallClock(day0 + 1440).date)}`,
    );
  }

  out.push(`SUMMARY:${escapeIcsText(input.title)}`);
  if (input.location) out.push(`LOCATION:${escapeIcsText(input.location)}`);
  if (input.description) out.push(`DESCRIPTION:${escapeIcsText(input.description)}`);

  for (const stage of hearingStageTargets(input.date, input.time)) {
    out.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcsText(`${stage.bodyAr} — ${input.title}`)}`,
      `TRIGGER:${formatIcsDuration(stage.minutesBeforeStart)}`,
      "END:VALARM",
    );
  }

  out.push("END:VEVENT", "END:VCALENDAR");
  return out.map(foldIcsLine).join(CRLF) + CRLF;
}
