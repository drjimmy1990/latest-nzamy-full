/**
 * pointsExpiryNotice.test.ts — the 7-day points expiry warning (owner 18 Nov
 * G16, batch l7): which lots are warned, and what the notice says.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expiryNotice, libraryExpiryLockLineAr, lotsToWarn, type ExpiringLot } from "./pointsExpiryNotice.ts";

const NOW = new Date("2026-11-20T09:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();
const lot = (over: Partial<ExpiringLot>): ExpiringLot => ({ id: "l1", user_id: "u1", points_left: 120, expires_at: inDays(5), ...over });

test("only lots with points that end after now and within 7 days", () => {
  const rows = [
    lot({ id: "a" }),
    lot({ id: "b", expires_at: inDays(7) }),
    lot({ id: "c", expires_at: inDays(8) }),
    lot({ id: "d", expires_at: inDays(-1) }),
    lot({ id: "e", points_left: 0 }),
  ];
  assert.deepEqual(lotsToWarn(rows, NOW).map((r) => r.id), ["a", "b"]);
});

test("the notice: points and date in Arabic, the library wallet named, a link to the points page", () => {
  const general = expiryNotice(lot({}));
  assert.equal(general.title, "تنتهي بعض نقاطك قريباً");
  assert.match(general.body, /^تنتهي ١٢٠ نقطة في .+، ولا تُستعاد بعد انتهائها\.$/);
  assert.equal(general.href, "/dashboard/billing");
  const library = expiryNotice(lot({ wallet_scope: "library_agent", points_left: 300 }));
  assert.equal(library.title, "تنتهي نقاط مساعد المكتبة قريباً");
  assert.match(library.body, /^تنتهي ٣٠٠ نقطة من نقاط مساعد المكتبة في /);
});
test("l11 O7: a library subscriber is told the expiry may lock the library (founder terms ١٢); nobody else", () => {
  const plain = expiryNotice(lot({}));
  assert.doesNotMatch(plain.body, /المكتبة/);
  const gated = expiryNotice(lot({}), { libraryMinPoints: 50 });
  assert.match(gated.body, /ولا تُستعاد بعد انتهائها\. بما أن فتح المكتبة مشروط ببقاء رصيدك ٥٠ نقطة فأكثر، فانتهاء صلاحية هذه النقاط قد يُقفل التصفح حتى تشحن من جديد\.$/);
  assert.doesNotMatch(expiryNotice(lot({}), { libraryMinPoints: 0 }).body, /المكتبة/, "0 = the gate is off");
  assert.doesNotMatch(expiryNotice(lot({}), { libraryMinPoints: null }).body, /المكتبة/);
  assert.equal(libraryExpiryLockLineAr(1.5, "this_topup"), null);
  assert.match(libraryExpiryLockLineAr(50, "this_topup") ?? "", /صلاحية هذه الشحنة قد يُقفل التصفح/);
});

test("l11 O7: the cron reads the gated library grants of the due users once and passes the minimum only to them", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "..", "app", "api", "v1", "cron", "points-expiry", "route.ts"), "utf8");
  assert.ok(route.includes('.in("plan_ref", [...GATED_LIBRARY_PLAN_REFS])'));
  assert.ok(route.includes("expiryNotice(lot, { libraryMinPoints: gated.has(lot.user_id) ? libraryMinPoints : null })"));
});
