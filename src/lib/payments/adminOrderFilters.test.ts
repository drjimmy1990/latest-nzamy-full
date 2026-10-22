import { test } from "node:test";
import assert from "node:assert/strict";
import { riyadhFilterIso } from "./adminOrderFilters.ts";

test("a zone-less datetime-local filter is read as Riyadh time (+03:00)", () => {
  assert.equal(riyadhFilterIso("2026-10-22T10:00"), "2026-10-22T07:00:00.000Z");
  assert.equal(riyadhFilterIso("2026-10-22T10:00:30"), "2026-10-22T07:00:30.000Z");
  assert.equal(riyadhFilterIso("2026-10-22"), "2026-10-21T21:00:00.000Z");
});
test("a value with an explicit zone keeps its zone", () => {
  assert.equal(riyadhFilterIso("2026-10-22T10:00:00Z"), "2026-10-22T10:00:00.000Z");
  assert.equal(riyadhFilterIso("2026-10-22T10:00:00+05:00"), "2026-10-22T05:00:00.000Z");
});
test("garbage is rejected", () => {
  for (const bad of ["", "tomorrow", "2026-13-40T10:00", "2026-10-22T25:00"]) assert.equal(riyadhFilterIso(bad), null);
});
