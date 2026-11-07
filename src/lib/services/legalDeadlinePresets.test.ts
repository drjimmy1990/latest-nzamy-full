import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LEGAL_DEADLINE_PRESETS, presetInputs, yearsAsDays, rawLastDay, type PresetRule } from "./legalDeadlinePresets.ts";
import { computeDueDate, resolveHolidayDates } from "./deadlineEngine.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const preset = (id: string) => LEGAL_DEADLINE_PRESETS.find((p) => p.id === id)!;
const noHolidays = resolveHolidayDates([], 2026, 2027);

const appealRule: PresetRule = {
  code: "appeal_general", ownerUserId: null, active: true, titleAr: "الاعتراض بطلب الاستئناف",
  periodDays: 30, countFromNextDay: true, rollForwardIfHoliday: true,
  sourceAr: "نظام المرافعات الشرعية — المادة (١٨٧)", verifiedByOwner: true,
};

function due(id: string, trigger: string, rules: PresetRule[] = []) {
  const inputs = presetInputs(preset(id), trigger, rules)!;
  return { inputs, result: computeDueDate({ triggerDate: trigger, ...inputs, holidays: noHolidays })! };
}

test("LIVE-F33: appeal 30 days from 29 Oct 2026 → Sat 28 Nov rolls to Sun 29 Nov, as the radar says", () => {
  const { inputs, result } = due("appeal", "2026-10-29", [appealRule]);
  assert.equal(rawLastDay("2026-10-29", inputs), "2026-11-28");
  assert.equal(result.dueDate, "2026-11-29");
  assert.equal(result.rolledFromHoliday, true);
  assert.equal(result.rolledPast[0].reason, "weekend");
  assert.equal(inputs.basis, "platform_rule");
  assert.equal(inputs.verified, true);
  assert.match(inputs.sourceAr ?? "", /١٨٧/);
});

test("without the platform rule the guide period uses the same المادة ٢٢ defaults (same date, not verified)", () => {
  const { inputs, result } = due("appeal", "2026-10-29");
  assert.equal(result.dueDate, "2026-11-29");
  assert.equal(inputs.basis, "guide");
  assert.equal(inputs.verified, false);
});

test("an inactive or lawyer-owned rule is not the platform rule", () => {
  const { inputs } = due("appeal", "2026-10-29", [{ ...appealRule, active: false }, { ...appealRule, ownerUserId: "u1", periodDays: 20 }]);
  assert.equal(inputs.basis, "guide");
  assert.equal(inputs.periodDays, 30);
});

test("years are calendar years — leap days included — then rolled like any period", () => {
  assert.equal(yearsAsDays("2027-03-01", 1), 366); // crosses 29 Feb 2028
  assert.equal(yearsAsDays("2026-03-01", 1), 365);
  const { result } = due("labor_claim", "2026-03-01");
  assert.equal(result.dueDate, "2027-03-01"); // a Monday — no roll
  assert.equal(yearsAsDays("bad", 1), null);
});

test("the calculator tab no longer has its own date maths", () => {
  const page = read("app/ai/fee-calculator/page.tsx");
  assert.doesNotMatch(page, /function addDaysToDate/);
  assert.doesNotMatch(page, /DEADLINE_TYPES/);
  assert.match(page, /<CalcLegalDeadlines/);
  const tab = read("components/calculators/CalcLegalDeadlines.tsx");
  assert.match(tab, /computeDueDate\(/);
  assert.match(tab, /getCourtHolidays\(\)/);
  assert.match(tab, /getDeadlineRules\(\)/);
  assert.match(tab, /useRiyadhToday\(\)/);
});

test("owner 2026-11-07 (المادة ١٩٤): urgent cassation is 15 days — the platform rule when present, else the guide 15", () => {
  const p = preset("cassation_urgent");
  assert.equal(p.ruleCode, "cassation_urgent");
  assert.equal(p.days, 15);
  const rule: PresetRule = {
    code: "cassation_urgent", ownerUserId: null, active: true, titleAr: "الاعتراض بطلب النقض — المسائل المستعجلة",
    periodDays: 15, countFromNextDay: true, rollForwardIfHoliday: true,
    sourceAr: "نظام المرافعات الشرعية — المادة (١٩٤)", verifiedByOwner: true,
  };
  const withRule = presetInputs(p, "2026-11-01", [rule])!;
  assert.equal(withRule.basis, "platform_rule");
  assert.equal(withRule.periodDays, 15);
  assert.match(withRule.sourceAr ?? "", /١٩٤/);
  const guide = presetInputs(p, "2026-11-01", [])!;
  assert.equal(guide.basis, "guide");
  assert.equal(guide.periodDays, 15);
  // the ordinary cassation preset keeps 30 days
  assert.equal(preset("cassation").days, 30);
});

test("the cassation SQL: 15 days copied from cassation's settings; cassation cites المادة (١٩٤)", () => {
  const sql = read("../supabase/migrations/20261107_30_deadline_cassation_urgent_194.sql");
  assert.match(sql, /'cassation_urgent'/);
  assert.match(sql, /c\.trigger_kind, 15, c\.calendar/);
  assert.match(sql, /on conflict \(code\) where owner_user_id is null do update/);
  assert.match(sql, /set source_ar\s+= 'نظام المرافعات الشرعية — المادة \(١٩٤\)'/);
  assert.match(sql, /select code, period_days, source_ar/);
});
