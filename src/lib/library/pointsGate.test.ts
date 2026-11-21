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
  libraryPlanCheckoutGateLineAr,
  libraryPointsLock,
  libraryPointsLockedMessageAr,
  libraryPointsLow,
  libraryPointsLowBeforeQuestion,
  libraryPointsLowMessageAr,
  libraryPointsWordAr,
  parseLibraryMinPoints,
  type PointsGateInput,
} from "./pointsGate.ts";

const base: PointsGateInput = { isAdmin: false, planRefs: ["lib-annual"], balance: 50, minPoints: 50 };
const gate = (over: Partial<PointsGateInput>) => libraryPointsGateDecision({ ...base, ...over });

test("G34/G35: a paid subscriber with 49 is locked, with 50 is open", () => {
  assert.deepEqual(gate({ balance: 49 }), { gated: true, locked: true });
  assert.deepEqual(gate({ balance: 50 }), { gated: true, locked: false });
  assert.deepEqual(gate({ balance: 500 }), { gated: true, locked: false });
});

test("every library grant is gated: paid plans, the founder, and the old trial / invitation / admin grants (owner ٩٣, l12)", () => {
  assert.deepEqual([...GATED_LIBRARY_PLAN_REFS], ["lib-q1", "lib-q2", "lib-annual", "lib-founder", "lib-trial", "lib-invite", "lib-admin"]);
  for (const p of GATED_LIBRARY_PLAN_REFS) assert.equal(gate({ planRefs: [p], balance: 10 }).locked, true, p);
  // a plan ref added later is gated from day one (the gate does not read a list)
  assert.equal(gate({ planRefs: ["lib-something-new"], balance: 10 }).locked, true);
});

test("owner ٩٣ (l12): «لا استثناء لأي حساب» — no exempt grant; only the admin (staff bypass) is outside the gate", () => {
  assert.deepEqual([...EXEMPT_LIBRARY_PLAN_REFS], []);
  for (const p of ["lib-trial", "lib-invite", "lib-admin"]) {
    assert.deepEqual(gate({ planRefs: [p], balance: 0 }), { gated: true, locked: true }, p);
  }
  assert.equal(gate({ planRefs: ["lib-q1", "lib-invite"], balance: 0 }).locked, true);
  assert.equal(gate({ isAdmin: true, balance: 0 }).locked, false);
  // negative control: a loose truthy admin flag is not an admin
  assert.equal(gate({ isAdmin: "yes" as unknown as boolean, balance: 0 }).locked, true);
  // the tier no longer reaches the gate at all
  assert.doesNotMatch(src("lib", "library", "pointsGate.ts"), /tierIncludesLibrary/);
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

test("06 ج6 (l12): warned when ONE question would take the balance below the minimum", () => {
  assert.equal(libraryPointsLowBeforeQuestion(54, 50, 5), true);
  assert.equal(libraryPointsLowBeforeQuestion(50, 50, 5), true);
  assert.equal(libraryPointsLowBeforeQuestion(55, 50, 5), false, "55 − 5 = 50: still open after the question");
  assert.equal(libraryPointsLowBeforeQuestion(49, 50, 5), false, "already locked: the lock says it, not the warning");
  assert.equal(libraryPointsLowBeforeQuestion(54, 0, 5), false, "gate off");
  assert.equal(libraryPointsLowBeforeQuestion(null, 50, 5), false, "unknown balance");
  assert.equal(libraryPointsLowBeforeQuestion(54, 50, null), false, "unknown price");
  assert.equal(libraryPointsLowBeforeQuestion(54, 50, 0), false);
});

test("06 ج6 (l12): the warning's words and shape", () => {
  assert.equal(libraryPointsWordAr(5), "٥ نقاط");
  assert.equal(libraryPointsWordAr(50), "٥٠ نقطة");
  assert.equal(libraryPointsWordAr(1), "نقطة واحدة");
  assert.equal(
    libraryPointsLowMessageAr(52, 50, 5),
    "تنبيه: رصيدك ٥٢ نقطة، والسؤال المدفوع لمساعد المكتبة يكلّف ٥ نقاط؛ بعده ينزل رصيدك عن ٥٠ نقطة فتُقفل نصوص المكتبة الكاملة حتى تشحن.",
  );
  assert.deepEqual(libraryPointsLow(52, 50, 5), {
    code: "library_points_low", message: libraryPointsLowMessageAr(52, 50, 5), balance: 52, minPoints: 50, questionPoints: 5, topupHref: LIBRARY_TOPUP_HREF,
  });
});

test("٩٣ quarterly (l12): the library checkout line; the quarterly plan's 50 against 50 says the first question locks", () => {
  const q1 = libraryPlanCheckoutGateLineAr(50, 50, 5)!;
  assert.match(q1, /بألا يقل رصيدك عن ٥٠ نقطة/);
  assert.match(q1, /فأول سؤال مدفوع تطرحه ينزل رصيدك عن الحد/);
  const annual = libraryPlanCheckoutGateLineAr(300, 50, 5)!;
  assert.doesNotMatch(annual, /أول سؤال/);
  assert.match(annual, /تمنحك ٣٠٠ نقطة لمساعد المكتبة/);
  assert.equal(libraryPlanCheckoutGateLineAr(50, 0, 5), null, "gate off: no line");
  assert.equal(libraryPlanCheckoutGateLineAr(50, null, 5), null);
  assert.equal(libraryPlanCheckoutGateLineAr(null, 50, 5), "فتح نصوص المكتبة الكاملة مشروط بألا يقل رصيدك عن ٥٠ نقطة.");
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
  // 06 ج6 (l12): the warning, from the gate's own numbers and the registry price
  assert.match(status, /pointsLow: accountLocked \? null : readState\.pointsLow/);
  assert.match(status, /aiToolPointRange\("library-assistant"\)/);
  assert.match(ac, /return \{ hasFullAccess: true, pointsLock: null, pointsGate: \{ balance, minPoints \} \};/);
  for (const f of [["app", "laws", "components", "AiTabContent.tsx"], ["app", "laws", "[slug]", "_ai-components.tsx"]]) {
    assert.match(src(...f), /<LibraryPointsLowNotice /, f.join("/"));
  }
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
