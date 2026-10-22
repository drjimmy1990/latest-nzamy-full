import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustPointsWith, readAdminBalances, readAdminBalance } from "./pointsAdmin.ts";
import { fakeDb } from "./fakeDb.test-helper.ts";
test("admin credits use only lot RPCs and debit fails without any credit write", async () => {
  const db = fakeDb(() => ({ data: { previous_balance: 10, new_balance: 40 } }));
  const result = await adjustPointsWith(db.client, { userId: "u", amount: 30, ref: "admin:a", expiresAt: new Date("2027-10-22") });
  assert.equal(result.ok, true);
  assert.ok(db.log.every(q => q.op === "rpc"));
  assert.equal(db.log.length, 1);
  assert.equal(db.log[0].table, "adjust_admin_points");
  assert.equal(result.ok && result.new_balance, 40);
  const fail = fakeDb(() => ({ error: { code: "P0001", message: "insufficient_points" } }));
  assert.equal((await adjustPointsWith(fail.client, { userId: "u", amount: -30, ref: "a", expiresAt: new Date() })).ok, false);
  assert.equal(fail.log[0].table, "adjust_admin_points");
});
test("a failed balance read degrades to null (shown as —), never an error page", async () => {
  const fail = fakeDb(() => ({ error: { code: "XX000", message: "boom" } }));
  assert.equal(await readAdminBalances(fail.client, ["u1", "u2"]), null);
  assert.equal(await readAdminBalance(fail.client, "u1"), null);
  const bad = fakeDb(() => ({ data: "not a number" }));
  assert.equal(await readAdminBalance(bad.client, "u1"), null);
  const ok = fakeDb(q => ({ data: q.table === "admin_points_balances" ? [{ user_id: "u1", balance: 7 }] : 12 }));
  const map = await readAdminBalances(ok.client, ["u1", "u2"]);
  assert.equal(map?.get("u1"), 7);
  assert.deepEqual(ok.log[0].payload, { p_users: ["u1", "u2"] });
  assert.equal(await readAdminBalance(ok.client, "u1"), 12);
  assert.deepEqual(ok.log[1].payload, { p_user: "u1" });
});
