import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getHearingLocationField,
  DEFAULT_HEARING_LOCATION_FIELD,
} from "./hearingLocationField.ts";

test("hearing (جلسة قضائية) relabels location as court/circuit", () => {
  const field = getHearingLocationField("hearing");
  assert.ok(field);
  assert.equal(field!.label, "المحكمة / الدائرة");
});

test("client_meet (اجتماع موكل) relabels location as the meeting place", () => {
  const field = getHearingLocationField("client_meet");
  assert.ok(field);
  assert.equal(field!.label, "مكان الاجتماع");
});

test("gov_review (مراجعة جهة حكومية) relabels location as the authority name", () => {
  const field = getHearingLocationField("gov_review");
  assert.ok(field);
  assert.equal(field!.label, "الجهة الحكومية");
});

test("deadline (موعد طعن / نهائي) has no location field at all", () => {
  assert.equal(getHearingLocationField("deadline"), null);
});

test("internal (أخرى) keeps the original generic field", () => {
  assert.deepEqual(getHearingLocationField("internal"), DEFAULT_HEARING_LOCATION_FIELD);
});

test("an unrecognised or empty type falls back to the generic field, never to null", () => {
  assert.deepEqual(getHearingLocationField(""), DEFAULT_HEARING_LOCATION_FIELD);
  assert.deepEqual(getHearingLocationField("something-nobody-wrote-yet"), DEFAULT_HEARING_LOCATION_FIELD);
});

test("every field has a non-empty label and placeholder", () => {
  for (const type of ["hearing", "client_meet", "gov_review", "internal"]) {
    const field = getHearingLocationField(type);
    assert.ok(field);
    assert.ok(field!.label.trim().length > 0);
    assert.ok(field!.placeholder.trim().length > 0);
  }
});
