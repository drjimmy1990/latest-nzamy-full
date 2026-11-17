/**
 * calendarFeed.ts — P1-37 «كل جلساتي»: the lawyer's hearings and open deadlines
 * as ONE .ics file, and the privacy rule every calendar file here follows.
 *
 * A calendar file leaves the platform: it is synced to Google / iCloud /
 * Exchange, shared with assistants, shown on lock screens. So an event carries
 * the hearing's title (type + case title, as AddHearingModal composes it), its
 * day and hour, the court's location, and «القضية: …» — and NOTHING else: no
 * notes (they hold whatever the lawyer typed about the client), no client
 * name, no assignee or owner name, no ids beyond the opaque UID. The location
 * of a client meeting is dropped too: it can be the client's home address.
 *
 * Cancelled hearings are left out; held and adjourned ones stay (they are the
 * record of what happened). Deadlines: open ones only, as all-day events on
 * their due date with the same four reminders as a hearing.
 *
 * White-label: the file names no platform (no «منصة نظامي» line); the
 * calendar is named after the lawyer's own diary.
 *
 * Pure, relative imports only (node --test loads it directly).
 */
import { buildCalendarIcs, type HearingIcsInput } from "./hearingIcs.ts";

export interface FeedHearing {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  time?: string | null;
  durationMinutes?: number | null;
  location?: string | null;
  /** UI type: hearing | deadline | gov_review | client_meet | internal */
  type?: string | null;
  status?: string | null;
  caseName?: string | null;
}

export interface FeedDeadline {
  id: string;
  title: string;
  /** YYYY-MM-DD */
  dueDate: string;
  status: string;
  caseTitle?: string | null;
}

export const CALENDAR_FEED_NAME_AR = "جلساتي ومهلي";
export const CALENDAR_FEED_FILENAME = "my-hearings.ics";

function caseLine(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  return n ? `القضية: ${n}` : null;
}

/** One hearing → the calendar event, under the privacy rule above. */
export function hearingIcsInput(h: FeedHearing, now?: Date): HearingIcsInput {
  const location = h.type === "client_meet" ? null : (h.location ?? "").trim() || null;
  return {
    uid: `hearing-${h.id}`,
    title: h.title,
    date: h.date,
    time: h.time ?? null,
    durationMinutes: h.durationMinutes ?? null,
    location,
    description: caseLine(h.caseName),
    now,
  };
}

/** One deadline → an all-day event on its due date. */
export function deadlineIcsInput(d: FeedDeadline, now?: Date): HearingIcsInput {
  return {
    uid: `deadline-${d.id}`,
    title: `مهلة: ${d.title}`,
    date: d.dueDate,
    time: null,
    durationMinutes: null,
    location: null,
    description: caseLine(d.caseTitle),
    now,
  };
}

/** The whole file: hearings (not cancelled) then open deadlines. */
export function buildCalendarFeed(
  hearings: readonly FeedHearing[],
  deadlines: readonly FeedDeadline[],
  now: Date = new Date(),
): { ics: string; count: number } {
  const inputs: HearingIcsInput[] = [
    ...hearings.filter((h) => h.status !== "cancelled").map((h) => hearingIcsInput(h, now)),
    ...deadlines.filter((d) => d.status === "open").map((d) => deadlineIcsInput(d, now)),
  ];
  return buildCalendarIcs(inputs, CALENDAR_FEED_NAME_AR);
}
