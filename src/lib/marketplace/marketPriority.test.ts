/**
 * marketPriority.test.ts — owner س٢٣ (batch l16): the admin's two settings and
 * the Arabic the client and the admin read. The arithmetic itself is SQL
 * (supabase/tests/rls/l16_priority.test.sql).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/marketplace/marketPriority.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRIORITY_MINUTES_DEFAULT,
  WORKING_HOURS_DEFAULT,
  isHeld,
  openNowResultReply,
  parsePriorityMinutes,
  parseWorkingHours,
  priorityDisclosureAr,
  readPriorityPatch,
  workingDaysAr,
} from "./marketPriority.ts";

test("minutes: only 0 / 15 / 30 / 60; anything else reads as the default 30 (as the SQL)", () => {
  assert.equal(PRIORITY_MINUTES_DEFAULT, 30);
  for (const v of [0, 15, 30, 60, "15"]) assert.equal(parsePriorityMinutes(v), Number(v));
  for (const v of [45, -1, null, undefined, "x", 30.5, {}]) assert.equal(parsePriorityMinutes(v), 30, String(v));
});

test("working hours: field-by-field fallback to Asia/Riyadh Sun–Thu 09:00–17:00", () => {
  assert.deepEqual(parseWorkingHours(null), { ...WORKING_HOURS_DEFAULT, days: [0, 1, 2, 3, 4] });
  assert.deepEqual(parseWorkingHours({ tz: "Asia/Riyadh", days: [6, 0, 0, 9], start: "10:00", end: "12:00" }), {
    tz: "Asia/Riyadh",
    days: [0, 6],
    start: "10:00",
    end: "12:00",
  });
  assert.deepEqual(parseWorkingHours({ days: [], start: "17:00", end: "09:00" }), { ...WORKING_HOURS_DEFAULT, days: [0, 1, 2, 3, 4] });
});

test("the admin's patch: valid choices pass; every bad value is refused in Arabic", () => {
  assert.deepEqual(readPriorityPatch({ minutes: 15 }), { ok: true, patch: { minutes: 15 } });
  assert.deepEqual(readPriorityPatch({ workingHours: { days: [4, 0, 1], start: "08:30", end: "16:00" } }), {
    ok: true,
    patch: { workingHours: { tz: "Asia/Riyadh", days: [0, 1, 4], start: "08:30", end: "16:00" } },
  });
  for (const bad of [
    { minutes: 45 },
    { minutes: "30" },
    { workingHours: { days: [], start: "09:00", end: "17:00" } },
    { workingHours: { days: [7], start: "09:00", end: "17:00" } },
    { workingHours: { days: [0], start: "9", end: "17:00" } },
    { workingHours: { days: [0], start: "17:00", end: "09:00" } },
    { workingHours: { tz: "Europe/London", days: [0], start: "09:00", end: "17:00" } },
    {},
    null,
  ]) {
    const r = readPriorityPatch(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    if (!r.ok) assert.match(r.error, /[؀-ۿ]/);
  }
});

test("the client's disclosure names the minutes and the hours; none when the window is 0", () => {
  const text = priorityDisclosureAr(30, parseWorkingHours(null));
  assert.ok(text);
  assert.match(text!, /٣٠ دقيقة/);
  assert.match(text!, /الأحد–الخميس/);
  assert.match(text!, /٠٩:٠٠/);
  assert.match(text!, /فتحه للجميع فوراً/);
  assert.equal(priorityDisclosureAr(0, parseWorkingHours(null)), null);
  assert.equal(workingDaysAr([0, 6]), "الأحد، السبت");
});

test("open-now replies and the held check", () => {
  assert.equal(openNowResultReply("opened").status, 200);
  assert.equal(openNowResultReply("already_open").status, 200);
  assert.equal(openNowResultReply("not_open").status, 409);
  assert.equal(openNowResultReply("not_found").status, 404);
  assert.equal(openNowResultReply("?").status, 500);
  const now = Date.parse("2026-11-26T10:00:00Z");
  assert.equal(isHeld("2026-11-26T10:30:00Z", now), true);
  assert.equal(isHeld("2026-11-26T09:30:00Z", now), false);
  assert.equal(isHeld(null, now), false);
  assert.equal(isHeld("nonsense", now), false);
});

test("the routes: admin settings are staff-gated and audited; open-now is the requester's RPC on his own session", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const admin = read("src/app/api/v1/admin/marketplace/priority/route.ts");
  assert.match(admin, /requireStaff\("orders\.manage"\)/);
  assert.match(admin, /requireStaff\("settings\.write"\)/);
  assert.match(admin, /logAdminAction\(/);
  const open = read("src/app/api/v1/service-requests/[id]/open-market/route.ts");
  assert.match(open, /supabase\.rpc\("service_request_market_open_now"/);
  assert.doesNotMatch(open, /createServiceClient/, "the client's own session, never the service role");
});
