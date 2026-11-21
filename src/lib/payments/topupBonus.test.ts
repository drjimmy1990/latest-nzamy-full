/**
 * topupBonus.test.ts — batch l12 (owner Q88a / ١٥٢): the top-up bonus is an
 * admin setting (0 by default), frozen in the order; the founder discount
 * and the bonus never stack by default (the higher one).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { fakeDb } from "./fakeDb.test-helper.ts";
import {
  bonusPctFor,
  bonusPoints,
  DEFAULT_FOUNDER_BONUS_MODE,
  founderBonusRuleIssue,
  founderVsBonus,
  grantedTopupPoints,
  parseFounderBonusMode,
  parseTopupBonus,
  readFounderBonusMode,
  readTopupBonusPct,
  TOPUP_BONUS_PACK_IDS,
  topupBonusIssue,
  topupGrantMeta,
} from "./topupBonus.ts";
import { isOnSale, PRICE_BOOK } from "../pricing/priceBook.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");

test("the validator takes whole percents 0–100 keyed by a pack id, nothing else", () => {
  assert.equal(topupBonusIssue({ "topup-500": 0, "topup-1000": 5, "topup-10000": 100 }), null);
  assert.equal(topupBonusIssue({}), null);
  assert.notEqual(topupBonusIssue({ "topup-500": 101 }), null);
  assert.notEqual(topupBonusIssue({ "topup-500": -1 }), null);
  assert.notEqual(topupBonusIssue({ "topup-500": 2.5 }), null);
  assert.notEqual(topupBonusIssue({ "topup-500": "5" }), null);
  assert.notEqual(topupBonusIssue({ "lib-q1": 5 }), null, "only top-ups");
  assert.notEqual(topupBonusIssue([5]), null);
  assert.notEqual(topupBonusIssue(null), null);
});

test("a missing or malformed map means no bonus anywhere — never a bonus the owner did not set", () => {
  assert.deepEqual(parseTopupBonus(undefined), {});
  assert.deepEqual(parseTopupBonus({ "topup-500": 500 }), {});
  assert.deepEqual(parseTopupBonus({ "topup-500": 8 }), { "topup-500": 8 });
  assert.equal(bonusPctFor({ "topup-500": 8 }, "topup-500"), 8);
  assert.equal(bonusPctFor({ "topup-500": 8 }, "topup-1000"), 0);
  assert.equal(bonusPctFor({}, "toString"), 0, "never an inherited key");
});

test("bonus points are floored whole points of the pack's own points", () => {
  assert.equal(bonusPoints(500, 0), 0);
  assert.equal(bonusPoints(500, 5), 25);
  assert.equal(bonusPoints(250, 5), 12, "12.5 → 12");
  assert.equal(bonusPoints(10000, 20), 2000);
  assert.equal(bonusPoints(500, 101), 0);
  assert.deepEqual(topupGrantMeta(1000, 8), { base_points: 1000, bonus_pct: 8, bonus_points: 80, points: 1080 });
  assert.deepEqual(topupGrantMeta(1000, 0), { base_points: 1000, bonus_pct: 0, bonus_points: 0, points: 1000 });
});

test("١٥٢: higher_only keeps the larger (1 point = 100 halalas), a tie keeps the discount; both keeps both", () => {
  assert.equal(DEFAULT_FOUNDER_BONUS_MODE, "higher_only");
  assert.deepEqual(founderVsBonus("higher_only", 7500, 100), { keepDiscount: false, keepBonus: true });
  assert.deepEqual(founderVsBonus("higher_only", 7500, 50), { keepDiscount: true, keepBonus: false });
  assert.deepEqual(founderVsBonus("higher_only", 7500, 75), { keepDiscount: true, keepBonus: false }, "tie → discount");
  assert.deepEqual(founderVsBonus("both", 7500, 50), { keepDiscount: true, keepBonus: true });
  assert.deepEqual(founderVsBonus("higher_only", 0, 50), { keepDiscount: false, keepBonus: true });
  assert.deepEqual(founderVsBonus("higher_only", 7500, 0), { keepDiscount: true, keepBonus: false });
});

test("the founder rule setting: {mode} only; anything else reads as higher_only", () => {
  assert.equal(founderBonusRuleIssue({ mode: "higher_only" }), null);
  assert.equal(founderBonusRuleIssue({ mode: "both" }), null);
  assert.notEqual(founderBonusRuleIssue({ mode: "sum" }), null);
  assert.notEqual(founderBonusRuleIssue({ mode: "both", extra: 1 }), null);
  assert.notEqual(founderBonusRuleIssue("both"), null);
  assert.equal(parseFounderBonusMode({ mode: "both" }), "both");
  assert.equal(parseFounderBonusMode({ mode: "x" }), "higher_only");
  assert.equal(parseFounderBonusMode(undefined), "higher_only");
});

test("the grant credits the frozen points only within [pack, 2 × pack]; else the pack's own points", () => {
  assert.equal(grantedTopupPoints(500, { topup: { points: 540 } }), 540);
  assert.equal(grantedTopupPoints(500, { topup: { points: 1000 } }), 1000);
  assert.equal(grantedTopupPoints(500, { topup: { points: 1001 } }), 500);
  assert.equal(grantedTopupPoints(500, { topup: { points: 499 } }), 500);
  assert.equal(grantedTopupPoints(500, { topup: { points: 540.5 } }), 500);
  assert.equal(grantedTopupPoints(500, {}), 500);
  assert.equal(grantedTopupPoints(500, null), 500);
  assert.equal(grantedTopupPoints(500, undefined), 500);
});

test("the readers fall back on a read error: 0 % and higher_only", async () => {
  const broken = fakeDb(() => ({ error: { code: "XX000", message: "x" } }));
  assert.equal(await readTopupBonusPct(broken.client, "topup-500"), 0);
  assert.equal(await readFounderBonusMode(broken.client), "higher_only");
  const set = fakeDb(() => ({ data: { value: { "topup-500": 12 } } }));
  assert.equal(await readTopupBonusPct(set.client, "topup-500"), 12);
  assert.equal(set.log[0].table, "platform_settings");
  assert.ok(set.log[0].filters.some(([op, col, v]) => op === "eq" && col === "key" && v === "topup_bonus_pct"));
});

test("the admin list is exactly the book's on-sale top-ups, and the migration seeds each at 0", () => {
  const onSale = Object.values(PRICE_BOOK)
    .filter((e) => e.kind === "topup" && isOnSale(e))
    .sort((a, b) => (a.prices.once?.sar ?? 0) - (b.prices.once?.sar ?? 0))
    .map((e) => e.id);
  assert.deepEqual([...TOPUP_BONUS_PACK_IDS], onSale);
  const sql = readFileSync(join(ROOT, "supabase", "migrations", "20261202_10_l12_money.sql"), "utf8");
  for (const id of TOPUP_BONUS_PACK_IDS) assert.match(sql, new RegExp(`"${id}": 0`), id);
  assert.match(sql, /'founder_bonus_rule',\s*'\{"mode": "higher_only"\}'::jsonb/);
});
