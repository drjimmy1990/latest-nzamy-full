/**
 * testRow.test.ts — the «تجريبي» tag reader (batch l7, decision 3).
 * Run: node --test src/lib/testAccounts/testRow.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isTestMetadata, isTestRow, TEST_ROW_LABEL_AR } from "./testRow.ts";

test("a tagged row is test data, through metadata or the PostgREST alias", () => {
  assert.equal(isTestMetadata({ test_account: true }), true);
  assert.equal(isTestRow({ metadata: { test_account: true } }), true);
  assert.equal(isTestRow({ test_account: true }), true);
  assert.equal(isTestRow({ test_account: "true" }), true);
});

test("anything else is not: untagged, false, null, arrays, rows read before the migration", () => {
  for (const v of [null, undefined, {}, [], "x", { metadata: null }, { metadata: { test_account: false } }, { test_account: null }, { metadata: [{ test_account: true }] }]) {
    assert.equal(isTestRow(v), false, JSON.stringify(v));
  }
  assert.equal(TEST_ROW_LABEL_AR, "تجريبي");
});

test("the tag key matches the one 20261127_80 writes", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/20261127_80_test_account_mode.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("jsonb_build_object('test_account', true)"));
});
