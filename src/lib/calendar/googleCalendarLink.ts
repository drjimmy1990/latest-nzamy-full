/**
 * googleCalendarLink.ts — the «أضف لـ Google» link of one hearing.
 * ─────────────────────────────────────────────────────────────────────────
 * Owner q352: the link names its zone, `ctz=Asia/Riyadh`. A hearing row
 * stores a wall-clock day and hour with no zone, and that wall clock is the
 * Kingdom's; the old link handed Google a "floating" stamp, which Google reads
 * in the viewer's own calendar zone — a lawyer whose calendar is set to
 * another zone saw the sitting at the wrong hour. The .ics download
 * (hearingIcs.ts) carries `TZID=Asia/Riyadh` for the same reason.
 *
 * The stamps are wall-clock minute arithmetic (hearingReminderStages.ts), not
 * the browser's `Date` getters: with `ctz` set they must be Riyadh digits on
 * any machine, and a browser `Date` would shift them in a zone with DST.
 *
 * The block is the row's own `duration_minutes` («مدة الجلسة») when one is
 * recorded, otherwise one hour — the template's default, editable in Google's
 * compose screen before anything is saved. A row with no readable hour stays
 * an all-day event rather than inventing one. Pure, relative imports only.
 */

import { minutesToWallClock, parseHearingDate, parseHearingTime } from "./hearingReminderStages.ts";
import { HEARING_TZID } from "./hearingIcs.ts";

export interface GoogleCalendarLinkInput {
  title: string;
  /** YYYY-MM-DD, the row's own stored day. */
  date: string;
  /** HH:MM[:SS]; null/empty → an all-day event. */
  time?: string | null;
  durationMinutes?: number | null;
  details?: string;
  location?: string | null;
}

const DEFAULT_BLOCK_MINUTES = 60;

const compactDate = (date: string) => date.replace(/-/g, "");
const compactStamp = (date: string, time: string) => `${compactDate(date)}T${time.replace(":", "")}00`;

/** The `dates` parameter: "YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS", or "YYYYMMDD/YYYYMMDD" all day; null for a bad day. */
export function googleCalendarDates(date: string, time?: string | null, durationMinutes?: number | null): string | null {
  const day0 = parseHearingDate(date);
  if (day0 === null) return null;
  const t = parseHearingTime(time);
  if (!t) {
    const day = compactDate(date);
    return `${day}/${day}`;
  }
  const start = day0 + t.h * 60 + t.m;
  const block = typeof durationMinutes === "number" && durationMinutes > 0 ? Math.round(durationMinutes) : DEFAULT_BLOCK_MINUTES;
  const s = minutesToWallClock(start);
  const e = minutesToWallClock(start + block);
  return `${compactStamp(s.date, s.time)}/${compactStamp(e.date, e.time)}`;
}

/** The TEMPLATE link, or null when the day does not parse (no link to a guess). */
export function googleCalendarUrl(input: GoogleCalendarLinkInput): string | null {
  const dates = googleCalendarDates(input.date, input.time, input.durationMinutes);
  if (!dates) return null;
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: input.title,
    dates,
    ctz: HEARING_TZID,
    details: input.details ?? "",
    location: input.location || "",
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}
