import test from "node:test";
import assert from "node:assert/strict";
import {
  canViewMemberPoints,
  memberPointsRpcOutcome,
  sumMemberPoints,
  toMemberPointsUsage,
} from "./firmMemberPoints.ts";

test("٤٤٤: only the firm owner or a managing partner may see the per-member counter", () => {
  assert.equal(canViewMemberPoints(null), false);
  assert.equal(canViewMemberPoints({ isOwner: true, role: "managing_partner" }), true);
  assert.equal(canViewMemberPoints({ isOwner: false, role: "managing_partner" }), true);
  for (const role of ["partner", "lawyer", "trainee", "office_admin", "hr_manager", "finance_manager", ""]) {
    assert.equal(canViewMemberPoints({ isOwner: false, role }), false, role);
  }
  // the owner flag wins whatever the role string says
  assert.equal(canViewMemberPoints({ isOwner: true, role: "lawyer" }), true);
});

test("٤٤٤: an RPC error reads as unavailable / forbidden / failed, never as zeros", () => {
  assert.equal(memberPointsRpcOutcome(null), "ok");
  assert.equal(memberPointsRpcOutcome(undefined), "ok");
  assert.equal(memberPointsRpcOutcome({ code: "42883" }), "unavailable");
  assert.equal(memberPointsRpcOutcome({ code: "PGRST202" }), "unavailable");
  assert.equal(memberPointsRpcOutcome({ code: "42501" }), "forbidden");
  assert.equal(memberPointsRpcOutcome({ code: "57014" }), "failed");
  assert.equal(memberPointsRpcOutcome({ code: null }), "failed");
  assert.equal(memberPointsRpcOutcome({}), "failed");
});

test("٤٤٤: rows map to totals only — the user id is dropped", () => {
  const out = toMemberPointsUsage([
    { user_id: "u1", display_name: "  مكتب  ", role: "managing_partner", is_owner: true, joined_at: "2026-10-01T00:00:00Z", points_month: 15, points_total: "45" },
    { user_id: "u2", display_name: null, role: "lawyer", is_owner: false, joined_at: null, points_month: null, points_total: 7.9 },
    null,
    "junk",
  ]);
  assert.deepEqual(out, [
    { displayName: "مكتب", role: "managing_partner", isOwner: true, joinedAt: "2026-10-01T00:00:00Z", pointsMonth: 15, pointsTotal: 45 },
    { displayName: "—", role: "lawyer", isOwner: false, joinedAt: null, pointsMonth: 0, pointsTotal: 7 },
  ]);
  for (const row of out) assert.equal("userId" in row || "user_id" in row, false);
  assert.deepEqual(toMemberPointsUsage(null), []);
  assert.deepEqual(toMemberPointsUsage({}), []);
});

test("٤٤٤: the footer sums both columns", () => {
  const members = toMemberPointsUsage([
    { display_name: "A", role: "lawyer", points_month: 3, points_total: 10 },
    { display_name: "B", role: "lawyer", points_month: 4, points_total: 20 },
  ]);
  assert.deepEqual(sumMemberPoints(members), { month: 7, total: 30 });
  assert.deepEqual(sumMemberPoints([]), { month: 0, total: 0 });
});
