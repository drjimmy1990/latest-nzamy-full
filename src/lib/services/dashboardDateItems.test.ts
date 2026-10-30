import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dashboardItemHref, moreCriticalHref, sumKnown, hiddenCount } from "./dashboardDateItems.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("CODE-F16: a deadline opens the deadline, a hearing opens the hearing", () => {
  assert.equal(dashboardItemHref({ source: "deadline", caseId: "c1" }), "/dashboard/lawyer/cases/c1?tab=deadlines");
  assert.equal(dashboardItemHref({ source: "deadline", caseId: null }), "/dashboard/lawyer/deadlines");
  assert.equal(dashboardItemHref({ source: "hearing", caseId: "c1" }), "/dashboard/lawyer/cases/c1?tab=hearings");
  assert.equal(dashboardItemHref({ source: "hearing", caseId: null }), "/dashboard/lawyer/hearings");
  assert.equal(moreCriticalHref(true), "/dashboard/lawyer/deadlines");
  assert.equal(moreCriticalHref(false), "/dashboard/lawyer/hearings");
});

test("CODE-F14: an unknown part makes the total unknown, never a smaller number", () => {
  assert.equal(sumKnown(3, 12), 15);
  assert.equal(sumKnown(null, 12), null);
  assert.equal(sumKnown(3, null), null);
  assert.equal(hiddenCount(15, 4), 11);
  assert.equal(hiddenCount(null, 4), null);
  assert.equal(hiddenCount(2, 4), 0);
});

test("CODE-F14 wiring: the summary route counts in the database, apart from the preview limits", () => {
  const route = read("app/api/v1/lawyer/dashboard/summary/route.ts");
  assert.match(route, /metadata, case_request_id", \{ count: "exact" \}\)/);
  assert.match(route, /\.select\("id, title, due_date, case_request_id", \{ count: "exact" \}\)/);
  assert.match(route, /\.or\("kind\.eq\.deadline,urgency\.eq\.urgent"\)/);
  assert.match(route, /upcomingHearingsCount = hearingRead\?\.count \?\? null;/);
  assert.match(route, /sumKnown\(criticalDeadlinesCount, deadlineRead\?\.count \?\? null\)/);
  assert.doesNotMatch(route, /upcomingHearingsCount = hearings\.length/);
  assert.doesNotMatch(route, /\+ deadlineItems\.length/);
  assert.match(route, /href: dashboardItemHref\(\{ source: "deadline"/);
});

test("CODE-F16 / F29 wiring: the home page — Riyadh day, words not negatives, colour by nearness, own links", () => {
  const page = read("app/dashboard/lawyer/page.tsx");
  assert.match(page, /const today = useRiyadhToday\(\);/);
  assert.doesNotMatch(page, /today\.setHours\(0, 0, 0, 0\)/);
  assert.doesNotMatch(page, /palette\[i % palette\.length\]/);
  assert.match(page, /dayUrgency\(today, h\.date\)/);
  assert.doesNotMatch(page, /`موعد خلال \$\{soonestUrgent\.daysLeft\} أيام`/);
  assert.match(page, /relativeDayAr\(today, d\.date, toArabicDigits\)/);
  // no link on the critical card is hard-wired to the hearings diary any more
  const card = page.slice(page.indexOf("{/* Critical Deadlines */}"), page.indexOf("{/* ── Main Grid"));
  assert.doesNotMatch(card, /href="\/dashboard\/lawyer\/hearings"/);
  const banner = page.slice(page.indexOf("{/* ── Urgent Deadlines Banner ── */}"), page.indexOf("{/* ── Quick Actions Bar ── */}"));
  assert.match(banner, /href=\{soonestUrgent\.href\}/);
});

test("LIVE-F38: the header date pill reads Riyadh's day, not the device clock", () => {
  const widget = read("components/HijriDateWidget.tsx");
  assert.match(widget, /const riyadhDay = useRiyadhToday\(\);/);
  assert.doesNotMatch(widget, /setNow\(new Date\(\)\)/);
  assert.doesNotMatch(widget, /useState<Date \| null>\(null\);\n\s*const \[viewDate/);
  assert.doesNotMatch(widget, /setInterval\(/);
});
