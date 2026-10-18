import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LIBRARY_PLAN_DAYS,
  colleagueInviteTrialDays,
  grantWindow,
  isGrantActive,
  isMissingLibraryGrantsTable,
  libraryEndsAtAr,
  libraryPlanDays,
  resolveLibraryRequestGrant,
  stackedGrantWindow,
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

// ── An approved library request (owner ٢٠١–٢٠٣) ─────────────────────────────

test("resolveLibraryRequestGrant: a paid plan ref keeps its name and its real length", () => {
  assert.deepEqual(resolveLibraryRequestGrant("lib-q1", undefined), { ok: true, planRef: "lib-q1", days: 90 });
  assert.deepEqual(resolveLibraryRequestGrant("lib-q2", undefined), { ok: true, planRef: "lib-q2", days: 180 });
  assert.deepEqual(resolveLibraryRequestGrant("lib-annual", undefined), {
    ok: true,
    planRef: "lib-annual",
    days: 365,
  });
  // A JSON body that sends `durationDays: null` means "not given".
  assert.deepEqual(resolveLibraryRequestGrant("lib-annual", null), { ok: true, planRef: "lib-annual", days: 365 });
});

test("resolveLibraryRequestGrant: the admin's days win over the plan's length", () => {
  assert.deepEqual(resolveLibraryRequestGrant("lib-annual", 120), { ok: true, planRef: "lib-annual", days: 120 });
  assert.deepEqual(resolveLibraryRequestGrant("lib-q1", 1), { ok: true, planRef: "lib-q1", days: 1 });
  assert.deepEqual(resolveLibraryRequestGrant("lib-q1", 3660), { ok: true, planRef: "lib-q1", days: 3660 });
});

test("resolveLibraryRequestGrant: anything that is not a paid plan is lib-admin, 90 days by default", () => {
  assert.deepEqual(resolveLibraryRequestGrant("lib-firm-small", undefined), { ok: true, planRef: "lib-admin", days: 90 });
  assert.deepEqual(resolveLibraryRequestGrant(null, undefined), { ok: true, planRef: "lib-admin", days: 90 });
  assert.deepEqual(resolveLibraryRequestGrant("toString", undefined), { ok: true, planRef: "lib-admin", days: 90 });
  // A trial or invite ref in a request is still not a paid plan.
  assert.deepEqual(resolveLibraryRequestGrant("lib-trial", undefined), { ok: true, planRef: "lib-admin", days: 90 });
  assert.deepEqual(resolveLibraryRequestGrant("lib-firm-small", 45), { ok: true, planRef: "lib-admin", days: 45 });
});

test("resolveLibraryRequestGrant: days outside 1–3660, fractions and strings are refused", () => {
  for (const bad of [0, -1, 3661, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "120", true, {}]) {
    assert.deepEqual(resolveLibraryRequestGrant("lib-annual", bad), { ok: false }, `durationDays ${String(bad)}`);
  }
});

test("resolveLibraryRequestGrant + grantWindow: lib-annual ends at now+365, an explicit 120 at now+120", () => {
  const now = new Date("2026-10-19T09:00:00.000Z");
  const annual = resolveLibraryRequestGrant("lib-annual", undefined);
  assert.ok(annual.ok);
  assert.equal(grantWindow(annual.days, now)?.endsAt, "2027-10-19T09:00:00.000Z");
  const custom = resolveLibraryRequestGrant("lib-annual", 120);
  assert.ok(custom.ok);
  assert.equal(grantWindow(custom.days, now)?.endsAt, "2027-02-16T09:00:00.000Z");
});

// ── A colleague invitation's trial length ───────────────────────────────────

test("colleagueInviteTrialDays: the invitation's own whole-day length", () => {
  assert.equal(colleagueInviteTrialDays(14), 14);
  assert.equal(colleagueInviteTrialDays(1), 1);
  assert.equal(colleagueInviteTrialDays(3660), 3660);
});

test("colleagueInviteTrialDays: a missing or unusable length is 30 days", () => {
  for (const bad of [null, undefined, 0, -3, 3661, 2.5, Number.NaN, "14"]) {
    assert.equal(colleagueInviteTrialDays(bad), 30, `trial_days ${String(bad)}`);
  }
});

// ── The end date in the requester's notification ────────────────────────────

test("libraryEndsAtAr: an Arabic Gregorian date, in Riyadh time", () => {
  assert.equal(libraryEndsAtAr("2027-10-18T10:00:00.000Z"), "١٨ أكتوبر ٢٠٢٧");
  // 22:30 UTC on the 17th is already the 18th in Riyadh (UTC+3), whatever
  // timezone the server itself runs in.
  assert.equal(libraryEndsAtAr("2027-10-17T22:30:00.000Z"), "١٨ أكتوبر ٢٠٢٧");
});

test("libraryEndsAtAr: an unparseable value gives null, never 'Invalid Date'", () => {
  assert.equal(libraryEndsAtAr("not-a-date"), null);
  assert.equal(libraryEndsAtAr(""), null);
  assert.equal(libraryEndsAtAr(null), null);
  assert.equal(libraryEndsAtAr(42), null);
});

// ── A new grant extends the current one (controller ruling, 2026-10-18) ─────

const DAY = 86_400_000;
const NOW = new Date("2026-10-19T09:00:00.000Z");
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

test("stackedGrantWindow: no active grant starts now", () => {
  assert.deepEqual(stackedGrantWindow(90, NOW, null), { startsAt: NOW.toISOString(), endsAt: at(90) });
  assert.deepEqual(stackedGrantWindow(90, NOW, null), grantWindow(90, NOW));
});

test("stackedGrantWindow: an active grant ending in 10 days, plus 90, starts there and ends 100 days from now", () => {
  assert.deepEqual(stackedGrantWindow(90, NOW, at(10)), { startsAt: at(10), endsAt: at(100) });
});

test("stackedGrantWindow: an end in the past, or exactly now, is ignored", () => {
  assert.deepEqual(stackedGrantWindow(30, NOW, at(-5)), { startsAt: NOW.toISOString(), endsAt: at(30) });
  assert.deepEqual(stackedGrantWindow(30, NOW, NOW.toISOString()), { startsAt: NOW.toISOString(), endsAt: at(30) });
});

test("stackedGrantWindow: garbage input is ignored", () => {
  for (const junk of ["not-a-date", "", 42, {}, undefined]) {
    assert.deepEqual(
      stackedGrantWindow(30, NOW, junk as unknown as string | null),
      { startsAt: NOW.toISOString(), endsAt: at(30) },
      `latestActiveEnd ${String(junk)}`,
    );
  }
});

test("stackedGrantWindow: invalid days give null, with the same rules as grantWindow", () => {
  for (const bad of [0, -1, 3661, 1.5, Number.NaN, "90" as unknown as number]) {
    assert.equal(stackedGrantWindow(bad, NOW, at(10)), null, `days ${String(bad)}`);
    assert.equal(stackedGrantWindow(bad, NOW, null), null, `days ${String(bad)}`);
  }
  assert.equal(stackedGrantWindow(30, new Date(Number.NaN), null), null);
});

// The IO half cannot be imported here (it uses @/ aliases), so its wiring is
// pinned in the source.
const serverSource = readFileSync(join(import.meta.dirname, "libraryAccessServer.ts"), "utf8");

test("grantLibraryAccess reads the user's latest active end and stacks the new window on it", () => {
  const grantAt = serverSource.indexOf("export async function grantLibraryAccess(");
  assert.ok(grantAt > -1);
  const body = serverSource.slice(grantAt);
  const readAt = body.indexOf("await latestActiveGrantEnd(");
  const windowAt = body.indexOf("stackedGrantWindow(input.days, now, latestActiveEnd)");
  const insertAt = body.indexOf(".insert({");
  assert.ok(readAt > -1, "the grant no longer reads the current end");
  assert.ok(windowAt > readAt && insertAt > windowAt, "read, then the stacked window, then the insert");
  const insert = body.slice(insertAt, body.indexOf("});", insertAt));
  assert.ok(insert.includes("starts_at: window.startsAt") && insert.includes("ends_at: window.endsAt"));
  assert.ok(body.includes("return { ok: true, endsAt: window.endsAt }"), "the returned end is the extended end");
});

test("the end read takes the latest ends_at after now, and any read error means 'start now'", () => {
  const readAt = serverSource.indexOf("async function latestActiveGrantEnd(");
  assert.ok(readAt > -1, "the end read is no longer its own helper");
  const helper = serverSource.slice(readAt, serverSource.indexOf("\n}\n", readAt));
  assert.ok(helper.includes(".select('ends_at')"));
  assert.ok(helper.includes(".eq('user_id', userId)"));
  assert.ok(helper.includes(".gt('ends_at', nowIso)"), "only grants that end after now count");
  assert.ok(helper.includes(".order('ends_at', { ascending: false })") && helper.includes(".limit(1)"));
  assert.ok(helper.includes("catch"), "a thrown read must not fail the grant");
  assert.ok(!helper.includes("throw"), "the read never throws");
  assert.equal(
    helper.split("return null;").length - 1,
    2,
    "both the error arm and the catch fall back to null (start now)",
  );
});
