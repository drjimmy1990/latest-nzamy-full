/**
 * pointsGate.test.ts — the 50-point library gate (owner register 14 item 48,
 * spec 16.12, tests G34–G39; batch l9). Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/pointsGate.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXEMPT_LIBRARY_PLAN_REFS,
  GATED_LIBRARY_PLAN_REFS,
  LIBRARY_MIN_POINTS_DEFAULT,
  LIBRARY_TOPUP_HREF,
  libraryCreditPoints,
  libraryMinPointsIssue,
  libraryPointsGateDecision,
  libraryPointsLock,
  libraryPointsLockedMessageAr,
  parseLibraryMinPoints,
  type PointsGateInput,
} from "./pointsGate.ts";

const base: PointsGateInput = { isAdmin: false, tierIncludesLibrary: false, planRefs: ["lib-annual"], balance: 50, minPoints: 50 };
const gate = (over: Partial<PointsGateInput>) => libraryPointsGateDecision({ ...base, ...over });

test("G34/G35: a paid subscriber with 49 is locked, with 50 is open", () => {
  assert.deepEqual(gate({ balance: 49 }), { gated: true, locked: true });
  assert.deepEqual(gate({ balance: 50 }), { gated: true, locked: false });
  assert.deepEqual(gate({ balance: 500 }), { gated: true, locked: false });
});

test("every paid plan and the founder are gated", () => {
  assert.deepEqual([...GATED_LIBRARY_PLAN_REFS], ["lib-q1", "lib-q2", "lib-annual", "lib-founder"]);
  for (const p of GATED_LIBRARY_PLAN_REFS) assert.equal(gate({ planRefs: [p], balance: 10 }).locked, true, p);
});

test("defaults until the owner answers: trial / invitation / admin grants, Pro tier and admins are not gated", () => {
  assert.deepEqual([...EXEMPT_LIBRARY_PLAN_REFS], ["lib-trial", "lib-invite", "lib-admin"]);
  for (const p of EXEMPT_LIBRARY_PLAN_REFS) assert.deepEqual(gate({ planRefs: [p], balance: 0 }), { gated: false, locked: false }, p);
  // one exempt source is enough, even beside a paid plan
  assert.equal(gate({ planRefs: ["lib-q1", "lib-invite"], balance: 0 }).locked, false);
  assert.equal(gate({ tierIncludesLibrary: true, balance: 0 }).locked, false);
  assert.equal(gate({ isAdmin: true, balance: 0 }).locked, false);
});

test("no grant at all is never 'gated' (no subscription = no library, decided elsewhere)", () => {
  assert.deepEqual(gate({ planRefs: [], balance: 500 }), { gated: false, locked: false });
});

test("an unread balance never locks (fail open); 0 in the setting switches the gate off", () => {
  assert.deepEqual(gate({ balance: null }), { gated: true, locked: false });
  assert.deepEqual(gate({ balance: 0, minPoints: 0 }), { gated: false, locked: false });
});

test("G39: the setting is {points: n}; a bad value reads as 50 and is refused by the admin validator", () => {
  assert.equal(LIBRARY_MIN_POINTS_DEFAULT, 50);
  assert.equal(parseLibraryMinPoints({ points: 60 }), 60);
  assert.equal(parseLibraryMinPoints({ points: 0 }), 0);
  assert.equal(parseLibraryMinPoints(null), 50);
  assert.equal(parseLibraryMinPoints({ points: "60" }), 50);
  assert.equal(parseLibraryMinPoints({ points: -1 }), 50);
  assert.equal(libraryMinPointsIssue({ points: 60 }), null);
  assert.equal(libraryMinPointsIssue({ points: 0 }), null);
  assert.ok(libraryMinPointsIssue({ points: 2.5 }));
  assert.ok(libraryMinPointsIssue({ points: 50, extra: 1 }));
  assert.ok(libraryMinPointsIssue(50));
});

test("the founder's library credits count at 5 points a question (20 → 100)", () => {
  assert.equal(libraryCreditPoints([{ remaining: 20 }]), 100);
  assert.equal(libraryCreditPoints([{ remaining: 9 }, { remaining: 1 }]), 50);
  assert.equal(libraryCreditPoints([{ remaining: "9" }, { remaining: -3 }, {}]), 0);
});

test("the owner's sentence and the top-up button", () => {
  assert.equal(libraryPointsLockedMessageAr(50), "رصيدك أقل من ٥٠ نقطة؛ اشحن لتستمر في المكتبة");
  assert.equal(libraryPointsLockedMessageAr(60), "رصيدك أقل من ٦٠ نقطة؛ اشحن لتستمر في المكتبة");
  const lock = libraryPointsLock(45, 50);
  assert.deepEqual(lock, { code: "library_points_locked", message: "رصيدك أقل من ٥٠ نقطة؛ اشحن لتستمر في المكتبة", balance: 45, minPoints: 50, topupHref: LIBRARY_TOPUP_HREF });
});

const src = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...p), "utf8");

test("wiring: the full-library rule applies the gate on every full-access read (server, not UI)", () => {
  const ac = src("lib", "access-control.ts");
  // O26 (batch l11): the per-request memo still ends in libraryFullAccessState.
  assert.match(ac, /export async function hasFullLibraryAccess\(userId: string \| null, memo\?: LibraryAccessMemo\): Promise<boolean> \{\s*return \(await memoFullState\(userId, memo\)\)\.hasFullAccess;/);
  assert.match(ac, /if \(!usableMemo\(memo, userId\)\) return libraryFullAccessState\(userId\);/);
  assert.match(ac, /memoTier\(userId, memo\)\.then\(\(tier\) => libraryFullAccessState\(userId, tier\)\)/);
  assert.match(ac, /async function fullLibraryAccessForTier\(userId: string \| null, tier: ServerTier, memo\?: LibraryAccessMemo\): Promise<boolean> \{\s*if \(usableMemo\(memo, userId\)\) return \(await memoFullState\(userId, memo\)\)\.hasFullAccess;\s*return \(await libraryFullAccessState\(userId, tier\)\)\.hasFullAccess;/);
  assert.match(ac, /readLibraryMinPoints\(\), readLibraryPointsBalance\(userId\)/);
  const access = src("app", "api", "v1", "library", "access", "route.ts");
  assert.match(access, /pointsLock: accountLocked \? null : full\.pointsLock/);
  const status = src("app", "api", "v1", "library", "status", "route.ts");
  assert.match(status, /pointsLock: accountLocked \? null : readState\.pointsLock/);
  const guard = src("components", "library", "LibraryGuard.tsx");
  assert.match(guard, /<LibraryPointsLockBanner lock=\{lib\.pointsLock\} \/>/);
  const settings = src("app", "api", "v1", "admin", "settings", "route.ts");
  assert.match(settings, /"library_min_points_to_browse",/);
  assert.match(settings, /library_min_points_to_browse: libraryMinPointsIssue,/);
});

test("the balance read counts points_balance plus the founder's unexpired library credits, and fails open", () => {
  const s = src("lib", "library", "pointsGateServer.ts");
  assert.match(s, /rpc\("points_balance", \{ p_user: userId \}\)/);
  assert.match(s, /\.eq\("kind", "library_question"\)/);
  assert.match(s, /\.gt\("ends_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(s, /return \(points\.data as number\) \+ creditPoints;/);
});
