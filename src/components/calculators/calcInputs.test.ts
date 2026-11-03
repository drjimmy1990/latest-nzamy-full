/**
 * calcInputs.test.ts — owner finding LIVE-F30: the calculators refuse an
 * illogical input with an Arabic reason BEFORE calculating.
 *
 * Run: npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CASE_VALUE_RULE,
  HOURS_RULE,
  YEARS_RULE,
  lawyerFeeInputError,
  parseBounded,
  parseLaborInputs,
  parseOptional,
} from "./calcInputs.ts";

const labor = (over: Partial<Parameters<typeof parseLaborInputs>[0]> = {}) => ({
  salary: "8000",
  housingAllowance: "",
  otherAllowances: "",
  yearsOfService: "5",
  monthsOfService: "",
  hasUnusedLeave: false,
  unusedLeaveDays: "",
  hasNoticePeriod: false,
  noticePeriodMonths: "",
  ...over,
});

test("CALC01: −5 hours is refused, not turned into negative fees", () => {
  const err = lawyerFeeInputError({ feeModel: "hourly", estimatedHours: "-5", caseValue: "" });
  assert.equal(err, "عدد الساعات لا يكون سالباً.");
});

test("hourly or contingency with an empty field is refused, not swapped for the fixed formula", () => {
  assert.equal(lawyerFeeInputError({ feeModel: "hourly", estimatedHours: "", caseValue: "" }), "أدخل عدد الساعات.");
  assert.equal(lawyerFeeInputError({ feeModel: "contingency", estimatedHours: "", caseValue: " " }), "أدخل قيمة النزاع.");
  assert.equal(lawyerFeeInputError({ feeModel: "hourly", estimatedHours: "0", caseValue: "" }), "عدد الساعات يجب أن يكون أكبر من ٠ إلى ١٠٬٠٠٠.");
  assert.equal(lawyerFeeInputError({ feeModel: "fixed", estimatedHours: "", caseValue: "" }), null);
  assert.equal(lawyerFeeInputError({ feeModel: "", estimatedHours: "-5", caseValue: "" }), null);
});

test("valid fee inputs pass, Arabic-Indic digits and separators included", () => {
  assert.equal(lawyerFeeInputError({ feeModel: "hourly", estimatedHours: "40", caseValue: "" }), null);
  assert.equal(lawyerFeeInputError({ feeModel: "hourly", estimatedHours: "٤٠", caseValue: "" }), null);
  assert.equal(lawyerFeeInputError({ feeModel: "contingency", estimatedHours: "", caseValue: "500,000" }), null);
  assert.deepEqual(parseBounded("٥٠٠٬٠٠٠", CASE_VALUE_RULE), { ok: true, value: 500000 });
});

test("junk is refused, never read as its leading digits (parseFloat('5abc') was 5)", () => {
  for (const raw of ["5abc", "1e3", "+5", "5-", "١,٢,٣.٤.٥", "Infinity", "NaN"]) {
    assert.equal(parseBounded(raw, HOURS_RULE).ok, false, raw);
  }
  assert.equal(parseBounded("−5", HOURS_RULE).ok, false, "unicode minus");
});

test("bounds: above the maximum is refused with the range in the message", () => {
  const r = parseBounded("10001", HOURS_RULE);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /١٠٬٠٠٠/);
});

test("CALC04: a service of −5 years is refused, not answered with 0", () => {
  const r = parseLaborInputs(labor({ yearsOfService: "-5" }));
  assert.deepEqual(r, { ok: false, error: "سنوات الخدمة لا يكون سالباً." });
});

test("labour: zero service, fractional years, months over 11 and a missing salary are refused", () => {
  assert.equal(parseLaborInputs(labor({ yearsOfService: "0", monthsOfService: "0" })).ok, false);
  assert.equal(parseLaborInputs(labor({ yearsOfService: "", monthsOfService: "" })).ok, false);
  assert.equal(parseLaborInputs(labor({ yearsOfService: "2.5" })).ok, false);
  assert.equal(parseLaborInputs(labor({ monthsOfService: "12" })).ok, false);
  assert.equal(parseLaborInputs(labor({ salary: "" })).ok, false);
  assert.equal(parseLaborInputs(labor({ salary: "0" })).ok, false);
  assert.equal(parseLaborInputs(labor({ housingAllowance: "-100" })).ok, false);
  assert.equal(parseLaborInputs(labor({ yearsOfService: "61" })).ok, false);
});

test("labour: a toggled leave or notice field must be filled and in range", () => {
  assert.equal(parseLaborInputs(labor({ hasUnusedLeave: true, unusedLeaveDays: "" })).ok, false);
  assert.equal(parseLaborInputs(labor({ hasUnusedLeave: true, unusedLeaveDays: "-3" })).ok, false);
  assert.equal(parseLaborInputs(labor({ hasNoticePeriod: true, noticePeriodMonths: "" })).ok, false);
  assert.equal(parseLaborInputs(labor({ hasNoticePeriod: true, noticePeriodMonths: "-1" })).ok, false);
});

test("labour: valid inputs come back as numbers, optional allowances as 0", () => {
  assert.deepEqual(parseLaborInputs(labor({ housingAllowance: "2,000", monthsOfService: "6", hasUnusedLeave: true, unusedLeaveDays: "10" })), {
    ok: true,
    value: { baseSalary: 8000, housing: 2000, other: 0, years: 5, months: 6, leaveDays: 10, noticeMonths: 0 },
  });
  assert.deepEqual(parseLaborInputs(labor({ yearsOfService: "", monthsOfService: "7" })).ok, true);
  assert.deepEqual(parseOptional("", YEARS_RULE), { ok: true, value: 0 });
});

test("the calculator screens use the bounded parser, not parseFloat", async () => {
  const { readFileSync } = await import("node:fs");
  const labour = readFileSync(new URL("./CalcLaborRights.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(labour, /parseFloat/);
  assert.match(labour, /parseLaborInputs\(inp\)/);
  const page = readFileSync(new URL("../../app/ai/fee-calculator/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /parseFloat|parseInt/);
  assert.match(page, /lawyerFeeInputError\(inputs\)/);
});
