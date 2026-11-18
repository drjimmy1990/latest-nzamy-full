/**
 * testAccountIds.test.ts — the admin numbers' test-account set (batch l7,
 * decision 3): is_demo ∪ test_accounts, minus admins; works before
 * 20261127_80; a failed read is reported, never thrown.
 * Run: node --test src/lib/testAccounts/testAccountIds.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { fakeDb } from "../payments/fakeDb.test-helper.ts";
import { isTestAccountId, readTestAccountIds, testAccountIdSet } from "./testAccountIds.ts";

test("testAccountIdSet: demo ∪ listed, a listed admin is never a test account, a demo flag always is", () => {
  const set = testAccountIdSet({ demoIds: ["d1", "a2"], listedIds: ["l1", "a1", "a2", ""], adminIds: ["a1", "a2"] });
  assert.deepEqual([...set].sort(), ["a2", "d1", "l1"]);
  assert.equal(isTestAccountId(set, "l1"), true);
  assert.equal(isTestAccountId(set, "a1"), false);
  assert.equal(isTestAccountId(set, null), false);
});

test("readTestAccountIds: reads the two sources and the admins among the listed, by id", async () => {
  const { client, log } = fakeDb((q) => {
    if (q.table === "profiles" && q.filters.some(([, c]) => c === "is_demo")) return { data: [{ id: "d1" }] };
    if (q.table === "test_accounts") return { data: [{ user_id: "l1" }, { user_id: "adm" }] };
    if (q.table === "profiles" && q.filters.some(([, c]) => c === "user_type")) return { data: [{ id: "adm" }] };
    return { data: null };
  });
  const r = await readTestAccountIds(client);
  assert.equal(r.complete, true);
  assert.deepEqual([...r.ids].sort(), ["d1", "l1"]);
  const adminRead = log.find((q) => q.table === "profiles" && q.filters.some(([, c]) => c === "user_type"));
  assert.deepEqual(adminRead?.filters.find(([k]) => k === "in")?.[2], ["l1", "adm"]);
});

test("readTestAccountIds: before the migrations (missing table / column) → nobody from that source, still complete", async () => {
  const { client } = fakeDb((q) => {
    if (q.table === "profiles") return { error: { code: "42703", message: "column is_demo does not exist" } };
    if (q.table === "test_accounts") return { error: { code: "PGRST205", message: "missing" } };
    return { data: null };
  });
  const r = await readTestAccountIds(client);
  assert.equal(r.complete, true);
  assert.equal(r.ids.size, 0);
});

test("readTestAccountIds: any other error → incomplete, and a listed account whose admin check failed stays out", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const { client } = fakeDb((q) => {
      if (q.table === "profiles" && q.filters.some(([, c]) => c === "is_demo")) return { data: [{ id: "d1" }] };
      if (q.table === "test_accounts") return { data: [{ user_id: "l1" }] };
      return { error: { code: "57014", message: "timeout" } };
    });
    const r = await readTestAccountIds(client);
    assert.equal(r.complete, false);
    assert.deepEqual([...r.ids], ["d1"]);
  } finally {
    console.error = original;
  }
});
