import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { effectiveTier } from "./entitlementGrantRules.ts";

// access-control.ts's TIER_RANK (it cannot be imported under node --test).
const RANKS = { free: 0, shield: 1, ai: 2, pro: 3, max: 4, corp: 5, enterprise: 6 } as const;
const NOW = Date.parse("2026-10-16T12:00:00Z");

test("an active row whose period has ended no longer counts", () => {
  assert.equal(effectiveTier([{ tier: "pro", current_period_end: "2026-10-01T00:00:00Z" }], NOW, RANKS), "free");
  assert.equal(effectiveTier([{ tier: "pro", current_period_end: "2026-10-16T12:00:00Z" }], NOW, RANKS), "free", "ends exactly now");
  assert.equal(effectiveTier([{ tier: "pro", current_period_end: "2026-10-30T00:00:00Z" }], NOW, RANKS), "pro");
});

test("a NULL or unparsable end is open-ended coverage", () => {
  assert.equal(effectiveTier([{ tier: "max", current_period_end: null }], NOW, RANKS), "max");
  assert.equal(effectiveTier([{ tier: "max" }], NOW, RANKS), "max");
  assert.equal(effectiveTier([{ tier: "ai", current_period_end: "not a date" }], NOW, RANKS), "ai");
});

test("the highest running tier wins, not the newest row; expired higher tiers are skipped", () => {
  const rows = [
    { tier: "ai", current_period_end: "2027-01-01T00:00:00Z" },
    { tier: "max", current_period_end: "2026-09-01T00:00:00Z" },
    { tier: "pro", current_period_end: "2026-11-01T00:00:00Z" },
  ];
  assert.equal(effectiveTier(rows, NOW, RANKS), "pro");
});

test("no rows, or only unknown tiers, is free", () => {
  assert.equal(effectiveTier([], NOW, RANKS), "free");
  assert.equal(effectiveTier(null, NOW, RANKS), "free");
  assert.equal(effectiveTier([{ tier: "gold", current_period_end: null }], NOW, RANKS), "free");
});

test("getUserTier reads every active row with its end date and decides with effectiveTier", () => {
  const src = readFileSync(new URL("./access-control.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function getUserTier"), src.indexOf("// ─── requireAdmin"));
  assert.match(fn, /\.select\("tier, current_period_end"\)/);
  assert.match(fn, /\.eq\("status", "active"\)/);
  assert.match(fn, /return effectiveTier\(\(subs as ActivePlanRow\[\] \| null\) \?\? \[\], Date\.now\(\), TIER_RANK\);/);
  assert.doesNotMatch(fn, /\.limit\(1\)/);
});

test("the profile and dashboard summary show the plan getUserTier grants, not the newest active row", async () => {
  const { currentPlanRow } = await import("./entitlementGrantRules.ts");
  const rows = [
    { id: "old-pro", tier: "pro", current_period_end: "2026-09-01T00:00:00Z" },
    { id: "ai", tier: "ai", current_period_end: null },
  ];
  assert.equal(currentPlanRow(rows, NOW, RANKS)?.id, "ai");
  assert.equal(currentPlanRow([rows[0]], NOW, RANKS), null);
  for (const rel of ["../app/api/v1/profile/route.ts", "../app/api/v1/dashboard/summary/route.ts"]) {
    const src = readFileSync(new URL(rel, import.meta.url), "utf8");
    assert.match(src, /currentPlanRow\(\(\w+ as ActivePlanRow\[\] \| null\) \?\? \[\], Date\.now\(\), TIER_RANK\)/, rel);
  }
});
