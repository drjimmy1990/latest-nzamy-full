/**
 * testSeatRelease.test.ts — «تحرير المقاعد التجريبية» (batch l7, decision 3):
 * which seats the admin action frees, and what it never touches.
 * Run: node --test src/lib/membership/testSeatRelease.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  planTestSeatRelease,
  releaseMessageAr,
  summarizeRelease,
  TEST_SEAT_RELEASE_REASON,
  type SeatForRelease,
} from "./testSeatRelease.ts";

const seat = (over: Partial<SeatForRelease>): SeatForRelease => ({
  seatId: "s",
  userId: "real",
  orderId: "o",
  status: "active",
  orderLive: null,
  ...over,
});
const TEST = new Set(["t1", "t2"]);

test("a seat paid in TEST mode is released, whoever holds it (staff testing included)", () => {
  const p = planTestSeatRelease([seat({ seatId: "a", userId: "staff", orderLive: false })], TEST);
  assert.deepEqual(p.release.map((s) => s.seatId), ["a"]);
});

test("a test account's unpaid / reserved seat is released; a real lawyer's is never touched", () => {
  const p = planTestSeatRelease(
    [
      seat({ seatId: "t-res", userId: "t1", status: "reserved", orderLive: null }),
      seat({ seatId: "real-res", userId: "real", status: "reserved", orderLive: null }),
      seat({ seatId: "real-live", userId: "real", orderLive: true }),
    ],
    TEST,
  );
  assert.deepEqual(p.release.map((s) => s.seatId), ["t-res"]);
  assert.equal(p.skippedLive.length, 0);
});

test("NEVER a seat paid live — a test account's live seat is listed apart (refund path), not released", () => {
  const p = planTestSeatRelease([seat({ seatId: "t-live", userId: "t2", orderLive: true })], TEST);
  assert.equal(p.release.length, 0);
  assert.deepEqual(p.skippedLive.map((s) => s.seatId), ["t-live"]);
});

test("released / revoked seats are skipped; a test seat with no order is listed apart", () => {
  const p = planTestSeatRelease(
    [
      seat({ seatId: "r1", userId: "t1", status: "released", orderLive: false }),
      seat({ seatId: "r2", userId: "t1", status: "revoked", orderLive: false }),
      seat({ seatId: "n", userId: "t1", orderId: null }),
    ],
    TEST,
  );
  assert.equal(p.release.length, 0);
  assert.deepEqual(p.skippedNoOrder.map((s) => s.seatId), ["n"]);
});

test("the summary and the message say what did not happen", () => {
  const s = summarizeRelease(["revoked", "revoked", "none", "error"]);
  assert.deepEqual(s, { revoked: 2, none: 1, failed: 1 });
  const msg = releaseMessageAr(s, 1);
  assert.match(msg, /حُرِّر 2/);
  assert.match(msg, /تعذّر تحرير 1/);
  assert.match(msg, /بالاسترداد/);
});

test("the route revokes through founder_revoke with the fixed reason, gated and audited (no seat SQL of its own)", () => {
  const src = readFileSync(new URL("../../app/api/v1/admin/founder/test-seats/route.ts", import.meta.url), "utf8");
  assert.ok(src.includes('rpc("founder_revoke"'));
  assert.ok(src.includes("TEST_SEAT_RELEASE_REASON"));
  assert.ok(src.includes('requireStaff("settings.write")'));
  assert.ok(src.includes("logAdminAction"));
  assert.ok(!/\.from\("founder_seats"\)\s*\.(update|delete|insert)/.test(src), "never writes founder_seats directly");
  assert.equal(TEST_SEAT_RELEASE_REASON, "test_account_release");
});
