/**
 * libraryAccessDecision.test.ts — who has the FULL library (owner answers
 * ٢٠٥ / ٢٠٩, decisions of 2026-10-18): a Pro+ tier, an active library grant,
 * or a platform admin.
 * Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/libraryAccessDecision.test.ts
 *
 * Two halves, as in entitlements.test.ts:
 *   1. the pure rule, through ./libraryAccessDecision.ts, against the real
 *      tier ranking lifted out of src/lib/access-control.ts (that module
 *      value-imports "@/lib/supabase/server" and cannot load under node --test,
 *      so the rule takes the ranking as `ranks` and keeps no copy of it);
 *   2. the wiring in access-control.ts and the three library routes that used
 *      to compare the tier with `TIER_RANK.pro` inline, asserted on source.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { fullLibraryAccess } from "./libraryAccessDecision.ts";

const accessControlSource = readFileSync(new URL("./access-control.ts", import.meta.url), "utf8");
const decisionSource = readFileSync(new URL("./libraryAccessDecision.ts", import.meta.url), "utf8");

/** access-control.ts's TIER_RANK, read out of its source (the ONE table). */
function readTierRank(source: string): Record<string, number> {
  const block = source.match(/export const TIER_RANK: Record<ServerTier, number> = \{([\s\S]*?)\n\};/);
  if (!block) throw new Error("src/lib/access-control.ts no longer exports TIER_RANK in the shape this test reads");
  const table: Record<string, number> = {};
  for (const line of block[1].split("\n")) {
    const m = line.match(/^\s*(\w+):\s*(\d+),/);
    if (m) table[m[1]] = Number(m[2]);
  }
  return table;
}

const RANKS = readTierRank(accessControlSource);
const none = { isAdmin: false, hasLibraryGrant: false };

test("the ranking read here is access-control.ts's, and pro sits above ai", () => {
  assert.ok(RANKS.pro > RANKS.ai && RANKS.ai > RANKS.free, JSON.stringify(RANKS));
});

// ── 1. the rule ─────────────────────────────────────────────────────────────

test("a free user with an active library grant has the full library", () => {
  assert.equal(fullLibraryAccess({ tier: "free", isAdmin: false, hasLibraryGrant: true }, RANKS), true);
});

test("a platform admin on the free tier has the full library", () => {
  assert.equal(fullLibraryAccess({ tier: "free", isAdmin: true, hasLibraryGrant: false }, RANKS), true);
});

test("pro and every tier above it have the full library", () => {
  for (const tier of ["pro", "max", "corp", "enterprise"]) {
    assert.equal(fullLibraryAccess({ tier, ...none }, RANKS), true, tier);
  }
});

test("ai and shield without a grant do not; free with nothing does not", () => {
  assert.equal(fullLibraryAccess({ tier: "ai", ...none }, RANKS), false);
  assert.equal(fullLibraryAccess({ tier: "shield", ...none }, RANKS), false);
  assert.equal(fullLibraryAccess({ tier: "free", ...none }, RANKS), false);
});

test("an unknown tier ranks -1, never full — inherited object keys included", () => {
  for (const tier of ["gold", "", "constructor", "__proto__", "toString", "PRO"]) {
    assert.equal(fullLibraryAccess({ tier, ...none }, RANKS), false, JSON.stringify(tier));
  }
  // A grant or admin still opens it: those do not depend on the tier.
  assert.equal(fullLibraryAccess({ tier: "gold", isAdmin: false, hasLibraryGrant: true }, RANKS), true);
  assert.equal(fullLibraryAccess({ tier: "gold", isAdmin: true, hasLibraryGrant: false }, RANKS), true);
});

test("only a literal true counts as admin or grant", () => {
  const loose = { tier: "free", isAdmin: "yes", hasLibraryGrant: 1 } as unknown as Parameters<typeof fullLibraryAccess>[0];
  assert.equal(fullLibraryAccess(loose, RANKS), false);
});

test("a ranking without pro opens nothing by tier", () => {
  assert.equal(fullLibraryAccess({ tier: "max", ...none }, { free: 0, max: 4 }), false);
  assert.equal(fullLibraryAccess({ tier: "max", isAdmin: false, hasLibraryGrant: true }, { free: 0, max: 4 }), true);
});

test("the rule module stays pure: no alias imports and no TIER_RANK copy", () => {
  assert.doesNotMatch(decisionSource, /from\s+["']@\//);
  assert.doesNotMatch(decisionSource, /(?:export )?const TIER_RANK/);
});

// ── 2. the wiring ───────────────────────────────────────────────────────────

/** The source of one top-level `export async function NAME` in access-control.ts. */
function fnSource(name: string): string {
  const start = accessControlSource.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} not found in access-control.ts`);
  const next = accessControlSource.indexOf("\n// ─── ", start);
  const nextFn = accessControlSource.indexOf("\nexport ", start + 1);
  const ends = [next, nextFn].filter((i) => i > -1);
  return accessControlSource.slice(start, ends.length ? Math.min(...ends) : undefined);
}

test("isPlatformAdmin reads profiles.user_type with the service client and never throws", () => {
  const fn = fnSource("isPlatformAdmin");
  assert.match(fn, /^export async function isPlatformAdmin\(userId: string \| null\): Promise<boolean> \{/);
  assert.match(fn, /await createServiceClient\(\)/);
  assert.match(fn, /\.from\("profiles"\)\s*\.select\("user_type"\)\s*\.eq\("id", userId\)\s*\.maybeSingle\(\)/);
  assert.match(fn, /=== "admin"/);
  assert.match(fn, /\btry \{[\s\S]*\} catch\b/);
  assert.match(fn, /if \(error \|\| !data\) \{?/);
});

test("hasFullLibraryAccess: tier, admin and grant read together, then the one rule", () => {
  const fn = fnSource("hasFullLibraryAccess");
  assert.match(fn, /^export async function hasFullLibraryAccess\(userId: string \| null\): Promise<boolean> \{/);
  assert.match(fn, /if \(!userId\) return false;/);
  assert.match(fn, /await Promise\.all\(\[\s*getUserTier\(userId\),\s*isPlatformAdmin\(userId\),\s*hasActiveLibraryGrant\(userId\),?\s*\]\)/);
  assert.match(fn, /fullLibraryAccess\(\{ tier, isAdmin, hasLibraryGrant \}, TIER_RANK\)/);
});

test("checkLibraryAccess and getLibraryAccessForUser decide full access by the same rule", () => {
  const check = fnSource("checkLibraryAccess");
  assert.doesNotMatch(check, /TIER_RANK\.pro/);
  assert.match(check, /if \(await fullLibraryAccessForTier\(userId, currentTier\)\) \{\s*return \{\s*allowed: true,\s*isWhitelisted: false,\s*freeLimit: -1,\s*currentTier,/);
  assert.match(check, /`المادة مقفلة — تتطلب اشتراك المكتبة أو باقة Pro فما فوق`/);
  assert.doesNotMatch(check, /يتطلب اشتراك Pro أو أعلى/);

  const forUser = fnSource("getLibraryAccessForUser");
  assert.doesNotMatch(forUser, /TIER_RANK\.pro/);
  assert.match(forUser, /const hasFullAccess = await fullLibraryAccessForTier\(userId, tier\);/);
  assert.match(accessControlSource, /hasFullAccess: boolean; \/\/ Pro\+ tier, an active library grant, or an admin/);

  // The shared step: a guest reads nothing more, a Pro+ tier skips the two reads.
  const shared = accessControlSource.slice(accessControlSource.indexOf("async function fullLibraryAccessForTier("));
  assert.match(shared, /if \(!userId\) return false;/);
  assert.match(shared, /await Promise\.all\(\[isPlatformAdmin\(userId\), hasActiveLibraryGrant\(userId\)\]\)/);
  assert.match(shared, /return fullLibraryAccess\(\{ tier, isAdmin, hasLibraryGrant \}, TIER_RANK\);/);
});

test("access-control imports the rule and the grant read, not a second ranking", () => {
  assert.match(accessControlSource, /import \{ fullLibraryAccess \} from "@\/lib\/libraryAccessDecision";/);
  assert.match(accessControlSource, /import \{ hasActiveLibraryGrant \} from "@\/lib\/libraryAccessServer";/);
});

test("no library API route compares the tier with TIER_RANK.pro inline any more", () => {
  const root = new URL("../app/api/library/", import.meta.url);
  const routes = (readdirSync(root, { recursive: true }) as string[])
    .map((p) => p.replace(/\\/g, "/"))
    .filter((p) => p.endsWith("/route.ts") || p === "route.ts");
  assert.ok(routes.length >= 10, routes.join("\n"));
  for (const rel of routes) {
    const src = readFileSync(new URL(rel, root), "utf8");
    assert.doesNotMatch(src, /TIER_RANK\.pro/, rel);
    assert.doesNotMatch(src, /currentTier === 'pro'/, rel);
  }
  for (const rel of ["enactments/route.ts", "monitor/route.ts", "laws/[slug]/route.ts"]) {
    const src = readFileSync(new URL(rel, root), "utf8");
    assert.match(src, /hasFullLibraryAccess\(userId\)/, rel);
    assert.match(src, /import \{[^}]*\bhasFullLibraryAccess\b[^}]*\} from ["']@\/lib\/access-control["'];/, rel);
  }
});
