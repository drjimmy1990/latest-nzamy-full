import assert from "node:assert/strict";
import test from "node:test";
import {
  LIBRARY_PLAN_DAYS,
  grantWindow,
  isGrantActive,
  isMissingLibraryGrantsTable,
  libraryPlanDays,
} from "./libraryAccess.ts";

test("libraryPlanDays: the three paid library plans and their lengths", () => {
  assert.equal(libraryPlanDays("lib-q1"), 90);
  assert.equal(libraryPlanDays("lib-q2"), 180);
  assert.equal(libraryPlanDays("lib-annual"), 365);
  assert.deepEqual({ ...LIBRARY_PLAN_DAYS }, { "lib-q1": 90, "lib-q2": 180, "lib-annual": 365 });
});

test("libraryPlanDays: anything else is null", () => {
  assert.equal(libraryPlanDays("lib-firm-small"), null);
  assert.equal(libraryPlanDays(null), null);
  assert.equal(libraryPlanDays(42), null);
  assert.equal(libraryPlanDays(undefined), null);
  assert.equal(libraryPlanDays(""), null);
  // No fixed length: the grant's days come from the caller.
  assert.equal(libraryPlanDays("lib-trial"), null);
  assert.equal(libraryPlanDays("lib-invite"), null);
  // Inherited object keys are not plans.
  assert.equal(libraryPlanDays("toString"), null);
  assert.equal(libraryPlanDays("constructor"), null);
  assert.equal(libraryPlanDays("__proto__"), null);
});

const grant = { starts_at: "2026-10-19T00:00:00.000Z", ends_at: "2027-01-17T00:00:00.000Z" };

test("isGrantActive: inside the window, and exactly at starts_at", () => {
  assert.equal(isGrantActive(grant, new Date("2026-11-01T12:00:00.000Z")), true);
  assert.equal(isGrantActive(grant, new Date("2026-10-19T00:00:00.000Z")), true);
  assert.equal(isGrantActive(grant, new Date("2027-01-16T23:59:59.999Z")), true);
});

test("isGrantActive: false exactly at ends_at, after it, and before starts_at", () => {
  assert.equal(isGrantActive(grant, new Date("2027-01-17T00:00:00.000Z")), false);
  assert.equal(isGrantActive(grant, new Date("2027-02-01T00:00:00.000Z")), false);
  assert.equal(isGrantActive(grant, new Date("2026-10-18T23:59:59.999Z")), false);
});

test("isGrantActive: unparseable dates are not active", () => {
  const now = new Date("2026-11-01T12:00:00.000Z");
  assert.equal(isGrantActive({ starts_at: "garbage", ends_at: grant.ends_at }, now), false);
  assert.equal(isGrantActive({ starts_at: grant.starts_at, ends_at: "" }, now), false);
  assert.equal(isGrantActive(grant, new Date(Number.NaN)), false);
});

test("grantWindow: 90 days from a fixed date", () => {
  assert.deepEqual(grantWindow(90, new Date("2026-10-19T00:00:00.000Z")), {
    startsAt: "2026-10-19T00:00:00.000Z",
    endsAt: "2027-01-17T00:00:00.000Z",
  });
  assert.deepEqual(grantWindow(1, new Date("2026-10-19T08:30:00.000Z")), {
    startsAt: "2026-10-19T08:30:00.000Z",
    endsAt: "2026-10-20T08:30:00.000Z",
  });
  const max = grantWindow(3660, new Date("2026-10-19T00:00:00.000Z"));
  assert.ok(max);
  assert.equal(Date.parse(max.endsAt) - Date.parse(max.startsAt), 3660 * 86_400_000);
});

test("grantWindow: days outside 1–3660, non-integers and a bad clock give null", () => {
  const now = new Date("2026-10-19T00:00:00.000Z");
  assert.equal(grantWindow(0, now), null);
  assert.equal(grantWindow(3661, now), null);
  assert.equal(grantWindow(1.5, now), null);
  assert.equal(grantWindow(Number.NaN, now), null);
  assert.equal(grantWindow(-5, now), null);
  assert.equal(grantWindow(Number.POSITIVE_INFINITY, now), null);
  assert.equal(grantWindow("90" as unknown as number, now), null);
  assert.equal(grantWindow(90, new Date(Number.NaN)), null);
});

test("isMissingLibraryGrantsTable: the two 'table not there yet' codes only", () => {
  assert.equal(isMissingLibraryGrantsTable("42P01"), true);
  assert.equal(isMissingLibraryGrantsTable("PGRST205"), true);
  assert.equal(isMissingLibraryGrantsTable("42703"), false);
  assert.equal(isMissingLibraryGrantsTable("23514"), false);
  assert.equal(isMissingLibraryGrantsTable(undefined), false);
});
