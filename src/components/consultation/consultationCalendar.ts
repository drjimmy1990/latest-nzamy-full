/**
 * consultationCalendar.ts — the seven day-cards the /book/consultation calendar
 * offers, built from a date that is handed in.
 *
 * WHAT WAS HERE BEFORE
 * `calendarSlots` in ./constants.ts was a hand-written table of 6–12 April with
 * two days carrying an empty `times` array. StepScheduling greys out any day
 * whose `times` are empty, so the page told an August visitor that Tuesday the
 * 8th and Friday the 11th of a month five months gone were "unavailable" — and
 * let them book the rest of that dead week. Nothing read those dates back:
 * `calDay` / `calTime` travel to the team as a free-text preference.
 *
 * WHAT IT DOES NOW
 * Seven real consecutive days, starting the day after the one passed in. Every
 * day carries the SAME list of preferred times and no day is greyed out,
 * because there is no availability source in this codebase to grey one out
 * with — an empty `times` array is a claim ("no lawyer is free that day") and
 * inventing that claim is the defect this file exists to remove. Building an
 * availability system was explicitly out of scope.
 *
 * WHY IT TAKES `today` INSTEAD OF READING THE CLOCK
 * So the whole thing can be asserted (see consultationCalendar.test.ts,
 * `node --test`). A function that calls Date.now() internally can only be
 * tested against itself.
 *
 * WHY IT LIVES HERE AND NOT IN ./constants.ts
 * Same reason buildConsultationIntake.ts does: ./constants.ts imports
 * @phosphor-icons/react and `@/constants/taxonomies`, neither of which
 * `node --test` can load. This module imports NOTHING, on purpose.
 */

/** One day-card in the booking calendar. */
export interface ConsultationDaySlot {
  /** Full Arabic weekday, e.g. «الأحد». This exact string becomes `calDay`
   *  and is printed back to the client on the confirm screen, so it stays in
   *  full legal-register Arabic rather than an abbreviation. */
  dayAr: string;
  /** Three-letter English weekday, e.g. "Sun" — becomes `calDay` in English. */
  dayEn: string;
  /** Short Arabic weekday for the narrow day chip, e.g. «أحد».
   *  StepScheduling currently renders `dayAr.slice(0, 2)`, which is «ال» for
   *  all seven Arabic weekdays; this field is the replacement it should read.
   *  Added rather than solved by dropping the article, because dropping it
   *  would degrade the full name printed on the confirm screen. */
  dayShortAr: string;
  /** «28 أغسطس». StepScheduling renders `date.split(" ")[0]` in the chip and
   *  uses the whole string as the React key, so the day number must come
   *  first and must be unique across the seven cards — it is, since seven
   *  consecutive days never repeat a day-of-month. */
  date: string;
  /** "Aug 28" — the English mirror of `date`. */
  dateEn: string;
  /** Times the client may state a PREFERENCE for. Not availability. */
  times: string[];
}

/**
 * Seven, and it is load-bearing rather than a taste call: StepScheduling
 * resolves the selected day with `.find(d => d.dayAr === calDay)`, so two cards
 * sharing a weekday name would silently resolve to the wrong one. Seven
 * consecutive days is the largest window where every name is unique.
 */
export const CONSULTATION_DAY_COUNT = 7;

/**
 * One list, offered on every day. These are the hours a client may say they
 * prefer; the team confirms the real time when it answers the request.
 */
export const CONSULTATION_PREFERRED_TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00"];

const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const WEEKDAYS_SHORT_AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
const WEEKDAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];
const MONTHS_EN = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The seven day-cards that follow `today`.
 *
 * Starts at today + 1, not today. The calendar is the "pick a day" branch of a
 * step that already offers «الأسرع الممكن» for anyone who wants to be seen
 * now; offering the current day here would let a client at 18:00 state 09:00
 * this morning as their preference, which is not a preference anybody can act
 * on. Nothing about tomorrow-onward is a promise: it is still only a wish the
 * team confirms.
 *
 * Dates are built with the local-midnight constructor, so month-end and
 * year-end roll over on their own and no arithmetic on milliseconds can drift.
 */
export function buildConsultationDays(today: Date): ConsultationDaySlot[] {
  const days: ConsultationDaySlot[] = [];

  for (let offset = 1; offset <= CONSULTATION_DAY_COUNT; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const weekday = d.getDay();
    const dayOfMonth = d.getDate();

    days.push({
      dayAr: WEEKDAYS_AR[weekday],
      dayEn: WEEKDAYS_EN[weekday],
      dayShortAr: WEEKDAYS_SHORT_AR[weekday],
      date: `${dayOfMonth} ${MONTHS_AR[d.getMonth()]}`,
      dateEn: `${MONTHS_EN[d.getMonth()]} ${dayOfMonth}`,
      // A fresh copy per day: the caller hands these arrays to React lists and
      // a shared reference would make an in-place edit hit all seven cards.
      times: [...CONSULTATION_PREFERRED_TIMES],
    });
  }

  return days;
}
