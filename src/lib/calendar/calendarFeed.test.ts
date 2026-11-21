/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/calendar/calendarFeed.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendarFeed, deadlineIcsInput, hearingIcsInput, CALENDAR_FEED_NAME_AR } from "./calendarFeed.ts";
import { buildCalendarIcs, buildHearingIcs } from "./hearingIcs.ts";

const now = new Date("2026-11-18T08:00:00Z");
const unfold = (ics: string) => ics.replace(/\r\n /g, "").split("\r\n");

const hearing = {
  id: "h1",
  title: "جلسة مرافعة — دعوى عمالية",
  date: "2026-12-01",
  time: "09:00",
  durationMinutes: 45,
  location: "المحكمة العمالية بالرياض",
  type: "hearing",
  status: "scheduled",
  caseName: "دعوى عمالية",
};

test("one file, one VTIMEZONE, one VEVENT per hearing and open deadline; cancelled and closed deadlines left out", () => {
  const { ics, count } = buildCalendarFeed(
    [hearing, { ...hearing, id: "h2", status: "cancelled" }, { ...hearing, id: "h3", status: "held", time: null }],
    [
      { id: "d1", title: "مهلة الاعتراض", dueDate: "2026-12-10", status: "open", caseTitle: "دعوى عمالية" },
      { id: "d2", title: "منتهية", dueDate: "2026-12-11", status: "done" },
    ],
    now,
  );
  assert.equal(count, 3);
  const l = unfold(ics);
  assert.equal(l.filter((x) => x === "BEGIN:VEVENT").length, 3);
  assert.equal(l.filter((x) => x === "BEGIN:VTIMEZONE").length, 1);
  assert.ok(l.includes("UID:hearing-h1@nezamy.sa"));
  assert.ok(l.includes("UID:hearing-h3@nezamy.sa"));
  assert.ok(!l.includes("UID:hearing-h2@nezamy.sa"));
  assert.ok(l.includes("UID:deadline-d1@nezamy.sa"));
  assert.ok(l.includes("DTSTART;VALUE=DATE:20261210"));
  assert.ok(l.includes(`X-WR-CALNAME:${CALENDAR_FEED_NAME_AR}`));
  assert.ok(l.includes("X-WR-TIMEZONE:Asia/Riyadh"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n"));
});

test("N14 (owner RAW[71], reverses ٤٥ / ٤٩): the client's name and the full notes are in the event", () => {
  const notes = "أحضر أصل العقد؛ الموكل يطلب التأجيل،\nوالشاهد الثاني غائب";
  const input = hearingIcsInput({ ...hearing, clientName: "شركة المثال", notes }, now);
  assert.equal(input.description, `القضية: دعوى عمالية\nالعميل: شركة المثال\nملاحظات: ${notes}`);
  const l = unfold(buildHearingIcs(input)!);
  const desc = l.find((x) => x.startsWith("DESCRIPTION:") && x.includes("العميل"));
  assert.ok(desc, "the event carries the client line");
  // RFC 5545 TEXT: the notes' newline is escaped (\n), nothing cut; an ASCII ; and , would be too.
  assert.ok(desc!.includes("ملاحظات: أحضر أصل العقد؛ الموكل يطلب التأجيل،\\nوالشاهد الثاني غائب"));
  const ascii = unfold(buildHearingIcs(hearingIcsInput({ ...hearing, notes: "a;b,c" }, now))!).find((x) => x.startsWith("DESCRIPTION:") && x.includes("ملاحظات"));
  assert.ok(ascii!.endsWith("ملاحظات: a\\;b\\,c"));
  // Only what is present: no client and no notes → the case line alone, as before.
  assert.equal(hearingIcsInput({ ...hearing, clientName: "  ", notes: "" }, now).description, "القضية: دعوى عمالية");
  assert.equal(hearingIcsInput({ ...hearing, caseName: "" }, now).description, null);
  assert.equal(hearingIcsInput({ ...hearing, caseName: "", clientName: "س" }, now).description, "العميل: س");
});

test("still kept private: no platform line; a client meeting loses its location", () => {
  const input = hearingIcsInput({ ...hearing, type: "client_meet", location: "حي النرجس، منزل الموكل" }, now);
  assert.equal(input.location, null);
  assert.equal(input.description, "القضية: دعوى عمالية");
  const ics = buildHearingIcs(input)!;
  assert.ok(!ics.includes("النرجس"));
  assert.ok(!ics.includes("منصة"));
  assert.equal(hearingIcsInput(hearing, now).location, "المحكمة العمالية بالرياض");
});

test("the long notes still fold to ≤ 75 octets per line", () => {
  const { ics } = buildCalendarFeed([{ ...hearing, notes: "ملاحظة طويلة ".repeat(60) }], [], now);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.ok(unfold(ics).some((x) => x.startsWith("DESCRIPTION:") && x.includes("ملاحظات: ملاحظة طويلة")));
});

test("a deadline is an all-day event titled «مهلة: …»", () => {
  const d = deadlineIcsInput({ id: "d9", title: "تقديم اللائحة", dueDate: "2026-12-31", status: "open" }, now);
  assert.equal(d.time, null);
  assert.equal(d.title, "مهلة: تقديم اللائحة");
  const l = unfold(buildHearingIcs(d)!);
  assert.ok(l.includes("DTSTART;VALUE=DATE:20261231"));
  assert.ok(l.includes("DTEND;VALUE=DATE:20270101"));
});

test("a bad date is skipped, never guessed; an empty feed is still a valid calendar", () => {
  const { count, ics } = buildCalendarIcs([hearingIcsInput({ ...hearing, date: "2026-02-30" }, now)]);
  assert.equal(count, 0);
  assert.ok(!ics.includes("BEGIN:VEVENT"));
  assert.ok(ics.includes("END:VCALENDAR"));
});

test("every physical line ≤ 75 octets", () => {
  const { ics } = buildCalendarFeed([{ ...hearing, title: "ج".repeat(200) }], [], now);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
});

test("N14 wiring (l12 integration): the hearings page hands the client's name and the notes to every calendar file", async () => {
  const { readFileSync } = await import("node:fs");
  const page = readFileSync(new URL("../../app/dashboard/lawyer/hearings/page.tsx", import.meta.url), "utf8");
  const fn = page.slice(page.indexOf("function feedHearingOf"), page.indexOf("function downloadHearingIcs"));
  assert.match(fn, /clientName: ev\.client \?\? null, notes: ev\.notes \?\? null,/);
  const bar = readFileSync(new URL("../../app/dashboard/lawyer/hearings/_HearingsExportBar.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(bar, /لا يحمل ملاحظاتك ولا أسماء الموكلين/);
});
