/**
 * entitlements.test.ts — the no-downgrade rule of grantEntitlement().
 * Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/lib/*.test.ts"
 *
 * Two halves, the technique src/app/api/v1/profile/route.test.ts uses:
 *   1. the pure decision, through ./entitlementGrantRules.ts — entitlements.ts
 *      itself cannot be imported here (it value-imports "@/lib/supabase/server";
 *      node resolves no tsconfig path alias: ERR_MODULE_NOT_FOUND "@/lib").
 *      That same failure is why the rules module takes the tier ranking as a
 *      parameter: src/lib/access-control.ts, which owns the ONE TIER_RANK table
 *      on the server, is just as unimportable from here. This file lifts that
 *      real table out of the source and passes it in, so the rule is exercised
 *      against production ranks without a second copy existing anywhere. The
 *      mirrored table that used to live in entitlementGrantRules.ts, and the
 *      drift test that policed it, are gone.
 *   2. the parts that live only in the source of entitlements.ts, asserted
 *      against the file: that the guard runs BEFORE the cancel, that
 *      `replaceActive` is the only bypass, and that the skip branch inserts
 *      nothing and stamps only the tier the user KEEPS.
 *
 * Closes review 2026-09-21 A3 / C01 (grantEntitlement cancelled every active
 * subscription before inserting the grant, so a 14-day invite trial destroyed
 * a live paid plan) and its 2026-09-22 follow-up: a HIGHER tier expiring sooner
 * than the grant was still traded away for days.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  tierRank,
  planEndsAtMs,
  dominantActivePlan,
  planGrantDecision,
  type TierRankTable,
} from "./entitlementGrantRules.ts";

const entitlementsSource = readFileSync(
  new URL("./entitlements.ts", import.meta.url),
  "utf8",
);
const rulesSource = readFileSync(
  new URL("./entitlementGrantRules.ts", import.meta.url),
  "utf8",
);
const accessControlSource = readFileSync(
  new URL("./access-control.ts", import.meta.url),
  "utf8",
);

/**
 * The production tier ranking, read out of src/lib/access-control.ts. Not a
 * mirror and not a drift test: it is the same single table the running code
 * uses, loaded the only way a `node --test` file can reach it.
 */
function readTierRankFixture(source: string): TierRankTable {
  const block = source.match(
    /export const TIER_RANK: Record<ServerTier, number> = \{([\s\S]*?)\n\};/,
  );
  if (!block) {
    throw new Error(
      "src/lib/access-control.ts no longer exports TIER_RANK in the shape this fixture reads",
    );
  }
  const table: Record<string, number> = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+):\s*(\d+),/);
    if (m) table[m[1]] = Number(m[2]);
  }
  return table as TierRankTable;
}

const RANKS = readTierRankFixture(accessControlSource);

const NEW_END = new Date("2026-10-06T00:00:00.000Z"); // a 14-day grant made today
const iso = (d: string) => new Date(d).toISOString();

// ── 1. there is exactly ONE tier ranking, and it is access-control.ts's ──────

test("access-control.ts exports the only TIER_RANK table on the server", () => {
  assert.deepEqual(RANKS as Record<string, number>, {
    free: 0,
    shield: 1,
    ai: 2,
    pro: 3,
    max: 4,
    corp: 5,
    enterprise: 6,
  });
  assert.ok(
    !/(?:export )?const TIER_RANK/.test(rulesSource),
    "entitlementGrantRules.ts declares a TIER_RANK table again — it must take the ranking as `ranks`, not keep a copy",
  );
});

test("an unknown or missing tier never outranks a real one", () => {
  assert.equal(tierRank(null, RANKS), -1);
  assert.equal(tierRank(undefined, RANKS), -1);
  assert.equal(tierRank("platinum", RANKS), -1);
  assert.equal(tierRank("free", RANKS), 0);
  assert.ok(tierRank("max", RANKS) > tierRank("pro", RANKS));
});

// ── 2. the decision ──────────────────────────────────────────────────────────

test("a 14-day pro trial does NOT cancel a longer active max subscription", () => {
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-max", tier: "max", current_period_end: iso("2027-01-01") }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, true);
  assert.equal(decision.existing?.id, "sub-max");
});

test("the same tier for a shorter window is also kept (a re-accepted invite cannot shorten a plan)", () => {
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-pro", tier: "pro", current_period_end: iso("2027-01-01") }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, true);
});

test("a user with no active subscription always receives the grant", () => {
  assert.equal(
    planGrantDecision({ activeRows: [], tier: "pro", newPeriodEnd: NEW_END, ranks: RANKS })
      .keepExisting,
    false,
  );
  assert.equal(
    planGrantDecision({ activeRows: null, tier: "pro", newPeriodEnd: NEW_END, ranks: RANKS })
      .keepExisting,
    false,
  );
});

test("an UPGRADE is applied even when the old row runs longer", () => {
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-ai", tier: "ai", current_period_end: iso("2028-01-01") }],
    tier: "max",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, false, "ai < max — the grant must go through");
});

test("an EXTENSION of the same tier is applied (the new grant ends later)", () => {
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-pro", tier: "pro", current_period_end: iso("2026-09-25") }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, false, "same rank, longer window — apply it");
});

test("an equal-rank grant ending at exactly the same instant is applied, not skipped", () => {
  // The comparison is strict: only a STRICTLY longer existing window wins, so
  // re-granting the identical period refreshes the row instead of dead-ending.
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-pro", tier: "pro", current_period_end: NEW_END.toISOString() }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, false);
});

test("a HIGHER tier that expires sooner than the grant is kept, not traded for days", () => {
  // Changed 2026-09-22 (A3 skeptic, rule 3). The old rule required BOTH halves
  // — rank AND expiry — so a "max" row expiring in two days was destroyed by a
  // 14-day "pro" grant: the user bought 12 days with a whole tier. Buying days
  // by cutting the tier is a downgrade, and only `replaceActive` may do it.
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-max", tier: "max", current_period_end: iso("2026-09-23") }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, true);
  assert.equal(decision.existing?.id, "sub-max");
});

test("a LOWER tier is replaced however long it runs", () => {
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-free", tier: "free", current_period_end: iso("2030-01-01") }],
    tier: "shield",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, false);
});

test("an open-ended active row (current_period_end NULL) is protected, never silently cancelled", () => {
  assert.equal(planEndsAtMs({ current_period_end: null }), Number.POSITIVE_INFINITY);
  assert.equal(planEndsAtMs({ current_period_end: "not-a-date" }), Number.POSITIVE_INFINITY);
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-corp", tier: "corp", current_period_end: null }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, true);
});

test("with several active rows the dominating one decides, whatever order they arrive in", () => {
  const rows = [
    { id: "sub-free", tier: "free", current_period_end: iso("2030-01-01") },
    { id: "sub-max", tier: "max", current_period_end: iso("2027-01-01") },
    { id: "sub-max-longer", tier: "max", current_period_end: iso("2027-06-01") },
  ];
  assert.equal(dominantActivePlan(rows, RANKS)?.id, "sub-max-longer");
  assert.equal(dominantActivePlan([...rows].reverse(), RANKS)?.id, "sub-max-longer");
  const decision = planGrantDecision({
    activeRows: rows,
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, true);
  assert.equal(decision.existing?.id, "sub-max-longer");
});

test("every active row is weighed, because the cancel takes every active row", () => {
  // The cancel in entitlements.ts is `.eq("status","active")` with no further
  // filter. Here BOTH rows must block the 14-day pro grant: the max row on
  // rank alone (it expires first — that was the 2026-09-22 hole), the pro row
  // on its longer window. The dominating protected row is the one reported.
  const decision = planGrantDecision({
    activeRows: [
      { id: "sub-max", tier: "max", current_period_end: iso("2026-09-23") },
      { id: "sub-pro", tier: "pro", current_period_end: iso("2027-01-01") },
    ],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, true);
  assert.equal(decision.existing?.id, "sub-max", "the best of the rows that would have died");
});

test("a row whose tier is garbage does not block a real grant", () => {
  const decision = planGrantDecision({
    activeRows: [{ id: "sub-x", tier: "platinum", current_period_end: iso("2030-01-01") }],
    tier: "pro",
    newPeriodEnd: NEW_END,
    ranks: RANKS,
  });
  assert.equal(decision.keepExisting, false);
});

// ── 3. how entitlements.ts wires the decision in ─────────────────────────────

test("entitlements.ts hands the decision access-control.ts's own table", () => {
  assert.match(
    entitlementsSource,
    /import \{ TIER_RANK, type ServerTier \} from "@\/lib\/access-control";/,
    "the ranking must be imported, not re-declared",
  );
  assert.match(
    entitlementsSource,
    /ranks: TIER_RANK,/,
    "planGrantDecision is called without the production ranking",
  );
});

test("the guard runs before the cancel, and only replaceActive skips it", () => {
  const guardAt = entitlementsSource.indexOf("planGrantDecision({");
  const bypassAt = entitlementsSource.indexOf("if (!input.replaceActive) {");
  const cancelAt = entitlementsSource.indexOf('status: "cancelled"');
  assert.ok(bypassAt > -1, "the replaceActive bypass is gone");
  assert.ok(guardAt > -1, "grantEntitlement no longer consults planGrantDecision");
  assert.ok(cancelAt > -1, "the cancel-then-insert path vanished — re-read this test");
  assert.ok(
    bypassAt < guardAt && guardAt < cancelAt,
    "the no-downgrade decision must be taken BEFORE any subscription is cancelled",
  );
});

test("the guard fails closed when the active-subscription read errors", () => {
  assert.match(
    entitlementsSource,
    /if \(activeErr\) return \{ ok: false, error: activeErr\.message \};/,
    "a failed read of what the user holds must not fall through to the cancel",
  );
});

test("the skip branch inserts nothing and stamps only the tier the user KEEPS", () => {
  const guardAt = entitlementsSource.indexOf("if (!input.replaceActive) {");
  const cancelAt = entitlementsSource.indexOf('status: "cancelled"');
  const skipBranch = entitlementsSource.slice(guardAt, cancelAt);
  assert.ok(
    skipBranch.includes("alreadyEntitled: true"),
    "the kept subscription must be reported with alreadyEntitled: true",
  );
  assert.ok(
    skipBranch.includes("detail: { subscription: decision.existing }"),
    "callers read grant.detail.subscription — it must carry the EXISTING row",
  );
  assert.ok(!skipBranch.includes(".insert("), "the skip branch must not insert a subscription");
  // The metadata refresh added 2026-09-22 (A3 skeptic, rule 6): stale
  // user_metadata is corrected to the row that actually survived…
  assert.ok(
    skipBranch.includes("user_metadata: { tier: keptTier }"),
    "the skip branch no longer refreshes auth metadata with the kept tier",
  );
  // …and never to the tier that was asked for, which is by definition no
  // better than the one being kept.
  assert.ok(
    !/user_metadata: \{ tier \}/.test(skipBranch),
    "stamping the REQUESTED tier would downgrade the client hydration path (useSubscription)",
  );
});

test("the active-subscription read projects what the decision needs", () => {
  assert.match(
    entitlementsSource,
    /\.select\("id, tier, status, current_period_end"\)\s*\n\s*\.eq\("user_id", input\.userId\)\s*\n\s*\.eq\("status", "active"\)/,
  );
});
