import { test } from "node:test";
import assert from "node:assert/strict";
import { getBillingWith, deleteCardWith, readReceiptWith } from "./billingCore.ts";
import { fakeDb, has } from "./fakeDb.test-helper.ts";

const USER = "user-a";
const CARD = "00000000-0000-0000-0000-000000000001";
const card = { id: CARD, user_id: USER, merchant: "platform", token: "token-secret", live: false, status: "active" };
test("billing filters every financial row to the authenticated owner, never selects a token", async () => {
  const db = fakeDb(q => q.table === "points_balance" ? { data: 300 } : { data: [] });
  const r = await getBillingWith(db.client, USER);
  assert.equal(r.status, 200);
  for (const q of db.log.filter(q => q.op === "select")) {
    assert.ok(has(q, "eq", "user_id", USER));
    assert.ok(q.columns && !q.columns.includes("*") && !/\b(token|metadata)\b/.test(q.columns));
  }
  assert.deepEqual(db.log.find(q => q.table === "points_balance")?.payload, { p_user: USER });
  assert.equal((r.body as { pointsBalance: number }).pointsBalance, 300);
});
test("missing billing schema returns unavailable, never invents a zero balance", async () => {
  const db = fakeDb(() => ({ error: { code: "42P01" } }));
  assert.equal((await getBillingWith(db.client, USER)).status, 503);
});
test("another user's or absent card is 404 without any gateway call", async () => {
  const db = fakeDb(() => ({ data: null }));
  let calls = 0;
  const r = await deleteCardWith({ admin: db.client, gateway: async () => { calls++; return null; } }, USER, CARD);
  assert.equal(r.status, 404);
  assert.equal(calls, 0);
  assert.ok(has(db.log[0], "eq", "user_id", USER));
});
test("card deletion calls the gateway before an owner-filtered database change", async () => {
  const events: string[] = [];
  const db = fakeDb(q => {
    events.push(q.op);
    return { data: q.op === "select" ? card : [{ id: CARD }] };
  });
  const r = await deleteCardWith({ admin: db.client, gateway: async () => ({ mode: "test", deleteToken: async id => { assert.equal(id, card.token); events.push("gateway"); return { ok: true, data: null }; } }) }, USER, CARD);
  assert.equal(r.status, 200);
  assert.deepEqual(events, ["select", "gateway", "update"]);
  assert.ok(has(db.log[1], "eq", "user_id", USER));
  assert.deepEqual(db.log[1].payload, { status: "deleted" });
  assert.ok(!JSON.stringify(r.body).includes(card.token));
});
test("gateway failure leaves the local card unchanged", async () => {
  const db = fakeDb(() => ({ data: card }));
  const r = await deleteCardWith({ admin: db.client, gateway: async () => ({ mode: "test", deleteToken: async () => ({ ok: false, status: 500, type: "http_error", message: "unavailable" }) }) }, USER, CARD);
  assert.equal(r.status, 502);
  assert.equal(db.log.length, 1);
});
test("unknown mode, other merchant and mismatched mode never send a token", async () => {
  for (const change of [{ live: null }, { merchant: "office" }, { live: true }]) {
    const db = fakeDb(() => ({ data: { ...card, ...change } }));
    let calls = 0;
    const r = await deleteCardWith({ admin: db.client, gateway: async () => ({ mode: "test", deleteToken: async () => { calls++; return { ok: true, data: null }; } }) }, USER, CARD);
    assert.equal(r.status, 503);
    assert.equal(calls, 0);
    assert.equal(db.log.length, 1);
  }
});
test("a remotely missing token allows retry after local status persistence failed", async () => {
  const db = fakeDb(q => ({ data: q.op === "select" ? card : [{ id: CARD }] }));
  const r = await deleteCardWith({ admin: db.client, gateway: async () => ({ mode: "test", deleteToken: async () => ({ ok: false, status: 404, type: "not_found", message: "absent" }) }) }, USER, CARD);
  assert.equal(r.status, 200);
});
test("receipt reads ownership before company settings, projects only safe payment details", async () => {
  const db = fakeDb(q => ({ data: q.table === "payment_orders" ? { id: CARD, metadata: { payment_method: { last_four: "1111" }, token: "secret", user_email: "private" } } : { value: {} } }));
  const result = await readReceiptWith(db.client, USER, CARD);
  assert.ok(has(db.log[0], "eq", "user_id", USER));
  assert.ok(result.order);
  assert.equal(result.order.last_four, "1111");
  assert.ok(!JSON.stringify(result).includes("secret") && !JSON.stringify(result).includes("private"));
  const absent = fakeDb(() => ({ data: null }));
  assert.equal((await readReceiptWith(absent.client, USER, CARD)).order, null);
  assert.equal(absent.log.length, 1);
});
