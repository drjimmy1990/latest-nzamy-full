import { test } from "node:test";
import assert from "node:assert/strict";
import { courtBadge, principleYear } from "./principleCardFields.ts";

test("courtBadge maps the four courts and leaves anything else empty", () => {
  assert.equal(courtBadge("المحكمة العليا"), "م ع");
  assert.equal(courtBadge("ديوان المظالم"), "د م");
  assert.equal(courtBadge("المحكمة الإدارية العليا بديوان المظالم"), "د م");
  assert.equal(courtBadge("المجلس الأعلى للقضاء"), "م س");
  assert.equal(courtBadge("لجنة الفصل في المنازعات المصرفية"), "ل ج");
  assert.equal(courtBadge("محكمة الاستئناف بالرياض"), "");
  assert.equal(courtBadge(""), "");
  assert.equal(courtBadge(null), "");
});

test("a Board of Grievances principle never gets the Supreme Court badge", () => {
  assert.notEqual(courtBadge("ديوان المظالم"), "م ع");
});

test("principleYear never invents a year", () => {
  assert.equal(principleYear(null, "قرار 12"), "");
  assert.equal(principleYear(undefined, undefined), "");
  assert.equal(principleYear(0, "قرار 12"), "");
  assert.equal(principleYear(1430, "قرار 12"), "1430");
});

test("principleYear is empty when the reference already carries a year", () => {
  assert.equal(principleYear(1445, "حكم التدقيق ٢٥٩/ت/٨ لعام ١٤٢٨هـ"), "");
  assert.equal(principleYear(1445, "قرار 55 عام 1433"), "");
});
