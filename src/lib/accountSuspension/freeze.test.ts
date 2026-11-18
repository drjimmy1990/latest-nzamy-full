/**
 * Owner ٢٥ (batch l7, 20261127_60): a suspension FREEZES what the account
 * holds and the lift gives the suspended days back. These tests cover the
 * server helpers with a fake rpc client; the SQL itself is proven by
 * supabase/tests/rls/l7_community.test.sql (T9–T11).
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  freezeEntitlementsWith,
  thawEntitlementsWith,
  parseFreezeOpen,
  parseFreezeLift,
} from "./suspensionServer.ts";

type Call = { fn: string; args: Record<string, unknown> };

function fakeRpc(answer: { data?: unknown; error?: { code?: string; message?: string } | null } | Error) {
  const calls: Call[] = [];
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (answer instanceof Error) throw answer;
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  };
  return { client: client as never, calls };
}

test("freeze: calls account_freeze_open with the user, the actor and the reason", async () => {
  const { client, calls } = fakeRpc({
    data: { state: "frozen", counts: { subscriptions: 1, library_access_grants: 2, points_lots: 0 } },
  });
  const out = await freezeEntitlementsWith(client, { userId: "u1", actorId: "a1", reason: "admin" });
  assert.deepEqual(calls, [{ fn: "account_freeze_open", args: { p_user: "u1", p_actor: "a1", p_reason: "admin" } }]);
  assert.deepEqual(out, { state: "frozen", counts: { subscriptions: 1, library_access_grants: 2, points_lots: 0 } });
});

test("freeze: an open freeze is reported, not duplicated", () => {
  assert.deepEqual(parseFreezeOpen({ state: "already_frozen", id: "f" }), { state: "already_frozen", counts: null });
});

test("freeze: before the migration it says so (nothing cancelled, nothing frozen)", async () => {
  const { client } = fakeRpc({ error: { code: "PGRST202", message: "not found" } });
  assert.deepEqual(await freezeEntitlementsWith(client, { userId: "u1", actorId: null, reason: "device_limit" }), {
    state: "migration_missing",
  });
});

test("freeze: another error or a throw is a failure, never an exception", async () => {
  const { client } = fakeRpc({ error: { code: "57014", message: "timeout" } });
  assert.deepEqual(await freezeEntitlementsWith(client, { userId: "u1", actorId: null, reason: "admin" }), {
    state: "failed",
    error: "57014",
  });
  const thrown = fakeRpc(new Error("boom"));
  assert.equal((await freezeEntitlementsWith(thrown.client, { userId: "u1", actorId: null, reason: "admin" })).state, "failed");
});

test("thaw: the days given back and what was extended", async () => {
  const { client, calls } = fakeRpc({
    data: {
      state: "lifted",
      reason: "device_limit",
      extended_days: 10.5,
      extended: { subscriptions: 1, founder_seats: 1, junk: "x" },
    },
  });
  const out = await thawEntitlementsWith(client, { userId: "u1", actorId: "a1" });
  assert.deepEqual(calls, [{ fn: "account_freeze_lift", args: { p_user: "u1", p_actor: "a1" } }]);
  assert.deepEqual(out, {
    state: "lifted",
    reason: "device_limit",
    extendedDays: 10.5,
    extended: { subscriptions: 1, founder_seats: 1 },
  });
});

test("thaw: a second lift extends nothing", () => {
  assert.deepEqual(parseFreezeLift({ state: "not_frozen" }), { state: "not_frozen" });
  assert.equal(parseFreezeLift(null).state, "failed");
});
