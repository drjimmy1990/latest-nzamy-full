/**
 * pointsStanding.test.ts — the «رصيدك من النقاط لا يكفي» banner follows the
 * server's charge rule (Wave 1 task 8, owner package LIVE-06).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/pointsStanding.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fakeDb, type FakeQuery, type FakeError } from "../payments/fakeDb.test-helper.ts";
import { isPointsStandingTool, isPricedAiToolId, pointsShort, pointsStandingWith } from "./pointsStanding.ts";
import { CONTRACT_DRAFT_PRICE } from "./tools.ts";

const USER = "11111111-2222-4333-8444-555555555555";

test("pointsShort: only enforcement on, a non-exempt caller, a priced tool and a smaller balance", () => {
  const base = { enforced: true, exempt: false, balance: 100, price: 500 };
  assert.equal(pointsShort(base), true);
  assert.equal(pointsShort({ ...base, balance: 500 }), false, "exactly the price is enough");
  assert.equal(pointsShort({ ...base, enforced: false }), false, "enforcement off: nobody is short");
  assert.equal(pointsShort({ ...base, exempt: true }), false, "an admin is never short");
  assert.equal(pointsShort({ ...base, price: 0 }), false, "a free run charges nothing");
  assert.equal(pointsShort({ ...base, balance: null }), false, "an unknown balance is not a shortfall");
});

test("isPricedAiToolId: registry tools only", () => {
  assert.equal(isPricedAiToolId("contract-drafter"), true);
  assert.equal(isPricedAiToolId("letter-drafter"), false);
  assert.equal(isPricedAiToolId(null), false);
});

test("isPointsStandingTool: no tool a founder credit can pay (the rule knows only points)", () => {
  assert.equal(isPointsStandingTool("contract-drafter"), true);
  assert.equal(isPointsStandingTool("najiz-optimizer"), true);
  for (const credit of ["legal-drafter", "contracts-pro", "legal-opinion-consult", "legal-opinion-letter", "wargaming"]) {
    assert.equal(isPricedAiToolId(credit), true, credit);
    assert.equal(isPointsStandingTool(credit), false, credit);
  }
  assert.equal(isPointsStandingTool("letter-drafter"), false);
});

type Answers = { profile?: { data?: unknown; error?: FakeError }; setting?: { data?: unknown; error?: FakeError }; balance?: { data?: unknown; error?: FakeError } };

function clients(a: Answers) {
  const rls = fakeDb((q: FakeQuery) => (q.table === "profiles" ? a.profile : q.op === "rpc" && q.table === "points_balance" ? a.balance : undefined));
  const admin = fakeDb((q: FakeQuery) => (q.table === "platform_settings" ? a.setting : undefined));
  return { rls, admin };
}

const SHORT: Answers = {
  profile: { data: { user_type: "lawyer" } },
  setting: { data: { value: true } },
  balance: { data: 120 },
};

test("pointsStandingWith: a lawyer under the price, enforcement on → short, with the server's numbers", async () => {
  const { rls, admin } = clients(SHORT);
  const got = await pointsStandingWith(rls.client, admin.client, USER, "contract-drafter");
  assert.deepEqual(got, { short: true, balance: 120, price: CONTRACT_DRAFT_PRICE });
  const balanceCall = rls.log.find((q) => q.op === "rpc");
  assert.deepEqual(balanceCall?.payload, { p_user: USER });
  assert.ok(admin.log.some((q) => q.filters.some(([, c, v]) => c === "key" && v === "points_enforcement")));
});

test("pointsStandingWith: an admin is never short, and the setting and balance are not even read", async () => {
  const { rls, admin } = clients({ ...SHORT, profile: { data: { user_type: "admin" } } });
  assert.deepEqual(await pointsStandingWith(rls.client, admin.client, USER, "contract-drafter"), { short: false });
  assert.equal(admin.log.length, 0);
  assert.equal(rls.log.some((q) => q.op === "rpc"), false);
});

test("pointsStandingWith: enforcement off (or not a JSON true) → never short", async () => {
  for (const value of [false, "true", null]) {
    const { rls, admin } = clients({ ...SHORT, setting: { data: { value } } });
    assert.deepEqual(await pointsStandingWith(rls.client, admin.client, USER, "contract-drafter"), { short: false }, String(value));
  }
  const { rls, admin } = clients({ ...SHORT, setting: { data: null } });
  assert.deepEqual(await pointsStandingWith(rls.client, admin.client, USER, "contract-drafter"), { short: false }, "no row");
});

test("pointsStandingWith: enough points → not short", async () => {
  const { rls, admin } = clients({ ...SHORT, balance: { data: CONTRACT_DRAFT_PRICE } });
  assert.deepEqual(await pointsStandingWith(rls.client, admin.client, USER, "contract-drafter"), { short: false });
});

test("pointsStandingWith: every failed read means no banner", async () => {
  const err = { error: { code: "XX000", message: "boom" } };
  for (const broken of [{ profile: err }, { setting: err }, { balance: err }, { balance: { data: "12" } }] as Answers[]) {
    const { rls, admin } = clients({ ...SHORT, ...broken });
    assert.deepEqual(await pointsStandingWith(rls.client, admin.client, USER, "contract-drafter"), { short: false }, JSON.stringify(broken));
  }
});
