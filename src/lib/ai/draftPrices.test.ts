/**
 * draftPrices.test.ts — batch l12 (owner N6): the legal drafter's prices are
 * the admin setting ai_draft_prices; the code defaults (claim 200) are what
 * 20261202_10 seeds and what any failure falls back to — never 0.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeDb } from "../payments/fakeDb.test-helper.ts";
import {
  DEFAULT_DRAFT_PRICES,
  DRAFT_KIND_IDS,
  DRAFT_PRICES_KEY,
  draftKindPrice,
  draftPricesIssue,
  parseDraftPrices,
  readDraftPrices,
} from "./draftKinds.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

test("N6: the defaults are the owner's prices — claim 200, memos 500, appeal 800, cassation / petition 1,500", () => {
  assert.deepEqual({ ...DEFAULT_DRAFT_PRICES }, {
    claim: 200, reply: 500, rejoinder: 500, supplementary: 500, closing: 500, appeal: 800, cassation: 1500, petition: 1500,
  });
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261202_10_l12_money.sql"), "utf8");
  const seeded = sql.match(/\('ai_draft_prices',\s*'(\{[^']+\})'::jsonb/);
  assert.ok(seeded, "the migration seeds ai_draft_prices");
  assert.deepEqual(JSON.parse(seeded![1]), { ...DEFAULT_DRAFT_PRICES }, "the seed is the code default");
  assert.equal(DRAFT_PRICES_KEY, "ai_draft_prices");
});

test("the validator: known kinds only, whole points ≥ 1; a kind left out keeps its default", () => {
  assert.equal(draftPricesIssue({ claim: 250 }), null);
  assert.equal(draftPricesIssue({ ...DEFAULT_DRAFT_PRICES }), null);
  assert.notEqual(draftPricesIssue({ claim: 0 }), null, "never free by mistake");
  assert.notEqual(draftPricesIssue({ claim: 2.5 }), null);
  assert.notEqual(draftPricesIssue({ notary: 100 }), null);
  assert.notEqual(draftPricesIssue([200]), null);
  assert.deepEqual(parseDraftPrices({ claim: 250 }), { ...DEFAULT_DRAFT_PRICES, claim: 250 });
  assert.deepEqual(parseDraftPrices({ claim: 0 }), DEFAULT_DRAFT_PRICES);
  assert.deepEqual(parseDraftPrices(undefined), DEFAULT_DRAFT_PRICES);
});

test("draftKindPrice: the given prices first, then the default; 0 only for a non-kind", () => {
  assert.equal(draftKindPrice("claim"), 200);
  assert.equal(draftKindPrice("claim", { claim: 300 }), 300);
  assert.equal(draftKindPrice("appeal", { claim: 300 }), 800);
  assert.equal(draftKindPrice("claim", { claim: 0 }), 200, "a bad value never zeroes the price");
  assert.equal(draftKindPrice("notary", { notary: 100 }), 0);
  for (const k of DRAFT_KIND_IDS) assert.ok(draftKindPrice(k) > 0, k);
});

test("readDraftPrices: the stored row over the defaults; any failure → the defaults", async () => {
  const set = fakeDb(() => ({ data: { value: { claim: 350, appeal: 900 } } }));
  assert.deepEqual(await readDraftPrices(set.client), { ...DEFAULT_DRAFT_PRICES, claim: 350, appeal: 900 });
  assert.ok(set.log[0].filters.some(([op, col, v]) => op === "eq" && col === "key" && v === "ai_draft_prices"));
  const broken = fakeDb(() => ({ error: { code: "XX000", message: "x" } }));
  assert.deepEqual(await readDraftPrices(broken.client), DEFAULT_DRAFT_PRICES);
  const empty = fakeDb(() => ({ data: null }));
  assert.deepEqual(await readDraftPrices(empty.client), DEFAULT_DRAFT_PRICES);
});
