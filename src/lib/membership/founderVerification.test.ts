/**
 * founderVerification.test.ts — batch l7, decision 1: a founder seat paid
 * while the licence was pending is activated on the admin's approval and
 * refunded in full on a rejection; nothing ever fails the decision.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/membership/founderVerification.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { settleFounderSeatOnVerification, type FounderVerificationDeps } from "./founderVerification.ts";
import { fakeDb, has, type FakeHandler, type FakeQuery } from "../payments/fakeDb.test-helper.ts";

const USER = "00000000-0000-0000-0000-0000000000a1";
const ORDER = "00000000-0000-0000-0000-0000000000b1";

function setup(over: FakeHandler, refundReply: { status: number; body: unknown } | Error = { status: 200, body: { refunded: true } }) {
  const db = fakeDb((q) => {
    const r = over(q);
    if (r) return r;
    if (q.table === "founder_seats") return { data: { order_id: ORDER } };
    if (q.table === "founder_activate") return { data: "activated" };
    if (q.table === "payment_orders") return { data: { item_id: "lawyer-founder-2026", receipt_number: "NZ-2026-000011" } };
    return { data: null };
  });
  const refunds: string[] = [];
  const notices: Array<{ userId: string; title: string; body: string }> = [];
  const admins: Array<{ title: string; body: string; href: string }> = [];
  const deps: FounderVerificationDeps = {
    admin: db.client,
    refund: async (orderId) => {
      refunds.push(orderId);
      if (refundReply instanceof Error) throw refundReply;
      return refundReply;
    },
    notify: async (n) => {
      notices.push(n);
    },
    notifyAdmins: async (n) => {
      admins.push(n);
    },
  };
  return { deps, log: db.log, refunds, notices, admins };
}

const merges = (log: FakeQuery[]) => log.filter((q) => q.table === "merge_payment_order_metadata").map((q) => q.payload);

test("no pending seat (the usual lawyer): nothing is called, on approve or reject", async () => {
  for (const decision of ["approve", "reject"] as const) {
    const s = setup((q) => (q.table === "founder_seats" ? { data: null } : undefined));
    assert.deepEqual(await settleFounderSeatOnVerification(s.deps, USER, decision), { outcome: "none" });
    assert.equal(s.log.length, 1, decision);
    const read = s.log[0];
    assert.ok(has(read, "eq", "user_id", USER) && has(read, "eq", "status", "pending_verification") && has(read, "eq", "campaign_id", "founder-2026"));
    assert.equal(s.refunds.length, 0);
  }
});

test("a database before 20261127_10 / the founder tables (42P01, 42703) is 'none'", async () => {
  for (const code of ["42P01", "42703"]) {
    const s = setup((q) => (q.table === "founder_seats" ? { error: { code } } : undefined));
    assert.equal((await settleFounderSeatOnVerification(s.deps, USER, "approve")).outcome, "none", code);
    assert.equal(s.admins.length, 0);
  }
});

test("approve: founder_activate on the pending order, the refund flag cleared, «تم تفعيل عضويتك المؤسِّسة»", async () => {
  const s = setup(() => undefined);
  const r = await settleFounderSeatOnVerification(s.deps, USER, "approve");
  assert.deepEqual(r, { outcome: "activated", orderId: ORDER });
  const rpc = s.log.find((q) => q.table === "founder_activate");
  assert.deepEqual(rpc?.payload, { p_order: ORDER });
  assert.deepEqual(merges(s.log), [{ p_order: ORDER, p_patch: { already_entitled: false } }]);
  assert.equal(s.notices.length, 1);
  assert.equal(s.notices[0].userId, USER);
  assert.equal(s.notices[0].title, "تم تفعيل عضويتك المؤسِّسة");
  assert.match(s.notices[0].body, /NZ-2026-000011/);
  assert.equal(s.refunds.length, 0);
  assert.equal(s.admins.length, 0);
});

test("approve: an activation that fails is an admin alert, never a throw", async () => {
  for (const reply of [{ data: "not_verified" }, { error: { code: "XX000" } }]) {
    const s = setup((q) => (q.table === "founder_activate" ? reply : undefined));
    const r = await settleFounderSeatOnVerification(s.deps, USER, "approve");
    assert.equal(r.outcome, "failed");
    assert.equal(s.admins.length, 1);
    assert.match(s.admins[0].body, new RegExp(ORDER));
    assert.equal(s.notices.length, 0);
  }
});

test("reject: the refund-review marks first, then the full refund of the order", async () => {
  const s = setup(() => undefined);
  const r = await settleFounderSeatOnVerification(s.deps, USER, "reject");
  assert.deepEqual(r, { outcome: "refunded", orderId: ORDER });
  assert.deepEqual(merges(s.log), [{ p_order: ORDER, p_patch: { founder: "not_verified", already_entitled: true } }]);
  assert.deepEqual(s.refunds, [ORDER]);
  assert.equal(s.log.filter((q) => q.table === "founder_activate").length, 0);
  assert.equal(s.admins.length, 0);
});

test("reject: a refund that cannot run (gateway off, a 409, a throw) leaves the order for the admin and alerts", async () => {
  const replies = [
    { status: 503, body: { error: "تعذّر إتمام الاسترداد مؤقتاً، حاول مرة أخرى" } },
    { status: 409, body: { error: "هذه العملية غير متاحة للاسترداد" } },
    new Error("network"),
  ];
  for (const reply of replies) {
    const s = setup(() => undefined, reply);
    const r = await settleFounderSeatOnVerification(s.deps, USER, "reject");
    assert.deepEqual(r, { outcome: "refund_pending", orderId: ORDER });
    assert.equal(s.admins.length, 1);
    assert.equal(s.admins[0].href, "/dashboard/admin/subscriptions/orders");
    assert.match(s.admins[0].body, /استرداد/);
  }
});

test("a failed seat read is an admin alert", async () => {
  const s = setup((q) => (q.table === "founder_seats" ? { error: { code: "XX000" } } : undefined));
  assert.equal((await settleFounderSeatOnVerification(s.deps, USER, "reject")).outcome, "failed");
  assert.equal(s.admins.length, 1);
  assert.equal(s.refunds.length, 0);
});

test("the wiring: the admin route settles the seat for a lawyer only; the instant approval activates it too", () => {
  const route = readFileSync(join(import.meta.dirname, "../../app/api/v1/admin/verifications/[id]/route.ts"), "utf8");
  assert.match(route, /updatedType === "lawyer"\s*\?\s*await settleFounderSeatAfterDecision\(adminClient, gate\.userId, userId,/);
  const approve = readFileSync(join(import.meta.dirname, "../lawyerSignup/approve.ts"), "utf8");
  assert.match(approve, /settleFounderSeatAfterDecision\(svc, userId, userId, "approve"\)/);
  const server = readFileSync(join(import.meta.dirname, "founderVerificationServer.ts"), "utf8");
  assert.match(server, /refundOrderWith\([\s\S]*orderId,\s*actorId,\s*true,?\s*\)/, "the full refund, confirmed, as the deciding admin");
});
