/**
 * grantPointsTopup.test.ts — LIVE-10 (batch l19): an admin library grant tops
 * the member up to the 50-point minimum. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/grantPointsTopup.test.ts
 *
 * The pure reading of the SQL answer and the wording, then source contracts
 * on the two admin routes and the locked-item note (they import next/server or
 * React and cannot be loaded by node --test). The SQL itself is proved in
 * supabase/tests/rls/l19_library_grant_topup.test.sql.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  grantPointsTopupAdminAr,
  grantPointsTopupAudit,
  grantPointsTopupNoticeAr,
  grantTopupFunctionMissing,
  parseGrantPointsTopup,
} from "./grantPointsTopup.ts";
import { parseLibraryPointsLock } from "./libraryFullAccess.ts";

test("parse: credited carries its points and the minimum", () => {
  assert.deepEqual(parseGrantPointsTopup({ status: "credited", points: 50, balance_before: 0, min_points: 50, lot_id: "x" }), {
    status: "credited",
    points: 50,
    minPoints: 50,
  });
});

test("parse: no-credit outcomes carry 0 points", () => {
  for (const status of ["not_needed", "gate_off", "not_gated", "ended", "not_admin_grant"]) {
    assert.equal(parseGrantPointsTopup({ status, points: 99, min_points: 50 }).points, 0, status);
    assert.equal(parseGrantPointsTopup({ status, points: 99 }).status, status);
  }
  assert.equal(parseGrantPointsTopup({ status: "already", points: 20, min_points: 50 }).points, 20);
});

test("parse: anything unexpected is failed (never a made-up credit)", () => {
  for (const bad of [null, undefined, 5, "credited", [], {}, { status: "weird" }, { status: "credited", points: 0 }, { status: "credited", points: -3 }, { status: "credited", points: 1.5 }]) {
    assert.equal(parseGrantPointsTopup(bad).status, "failed", JSON.stringify(bad));
    assert.equal(parseGrantPointsTopup(bad).points, 0);
  }
});

test("missing function codes", () => {
  assert.equal(grantTopupFunctionMissing("PGRST202"), true);
  assert.equal(grantTopupFunctionMissing("42883"), true);
  assert.equal(grantTopupFunctionMissing("42501"), false);
  assert.equal(grantTopupFunctionMissing(undefined), false);
});

test("the member's notice names the points only when THIS grant credited them", () => {
  const line = grantPointsTopupNoticeAr({ status: "credited", points: 50, minPoints: 50 });
  assert.ok(line && line.includes("٥٠ نقطة") && line.includes("الحد الأدنى"), line ?? "");
  assert.equal(grantPointsTopupNoticeAr({ status: "credited", points: 20, minPoints: 50 })?.includes("٢٠ نقطة"), true);
  for (const status of ["not_needed", "already", "gate_off", "not_gated", "ended", "not_admin_grant", "not_installed", "failed", "skipped"] as const) {
    assert.equal(grantPointsTopupNoticeAr({ status, points: 50, minPoints: 50 }), null, status);
  }
});

test("the admin's toast line follows the outcome", () => {
  assert.match(grantPointsTopupAdminAr({ status: "credited", points: 50 }) ?? "", /٥٠ نقطة/);
  assert.match(grantPointsTopupAdminAr({ status: "not_needed", points: 0 }) ?? "", /فلم تُضف نقاط/);
  assert.match(grantPointsTopupAdminAr({ status: "not_installed", points: 0 }) ?? "", /20261209_50/);
  assert.match(grantPointsTopupAdminAr({ status: "failed", points: 0 }) ?? "", /تعذّرت/);
  assert.equal(grantPointsTopupAdminAr(undefined), null);
  assert.equal(grantPointsTopupAdminAr({ status: "skipped", points: 0 }), null);
});

test("audit shape", () => {
  assert.deepEqual(grantPointsTopupAudit({ status: "credited", points: 30, minPoints: 50 }), { status: "credited", points: 30 });
});

test("parseLibraryPointsLock: the access route's pointsLock, or null", () => {
  const lock = { code: "library_points_locked", message: "رصيدك أقل من ٥٠ نقطة؛ اشحن لتستمر في المكتبة", balance: 0, minPoints: 50, topupHref: "/pricing" };
  assert.deepEqual(parseLibraryPointsLock(true, { hasFullAccess: false, accountLocked: false, pointsLock: lock }), {
    message: lock.message,
    balance: 0,
    minPoints: 50,
    topupHref: "/pricing",
  });
  assert.equal(parseLibraryPointsLock(false, { pointsLock: lock }), null, "a failed read is no lock");
  assert.equal(parseLibraryPointsLock(true, { accountLocked: true, pointsLock: lock }), null, "the account-type lock wins");
  assert.equal(parseLibraryPointsLock(true, { pointsLock: null }), null);
  assert.equal(parseLibraryPointsLock(true, { pointsLock: { ...lock, message: " " } }), null);
  assert.equal(parseLibraryPointsLock(true, { pointsLock: { ...lock, balance: "0" } }), null);
  assert.equal(parseLibraryPointsLock(true, { pointsLock: { ...lock, topupHref: "//evil.example" } })?.topupHref, "/pricing");
  assert.equal(parseLibraryPointsLock(true, { pointsLock: { ...lock, topupHref: "https://evil.example" } })?.topupHref, "/pricing");
  assert.equal(parseLibraryPointsLock(true, null), null);
});

// ── source contracts ──────────────────────────────────────────────────────────

const root = join(import.meta.dirname, "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
const grantRoute = read("app/api/v1/admin/entitlements/grant/route.ts");
const requestRoute = read("app/api/v1/admin/entitlements/requests/[id]/route.ts");
const card = read("components/library/LibrarySubscribeCard.tsx");

for (const [name, src, fnName] of [
  ["direct grant", grantRoute, "async function grantLibrary("],
  ["request approval", requestRoute, "async function approveLibraryRequest("],
] as const) {
  test(`${name}: the top-up runs after a successful grant, keyed on its id, before the audit and the notice`, () => {
    const fnAt = src.indexOf(fnName);
    assert.ok(fnAt > -1);
    const fn = src.slice(fnAt);
    const failAt = fn.indexOf("if (!grant.ok)");
    const topupAt = fn.indexOf("await topUpLibraryGrantPoints(grant.grantId)");
    const auditAt = fn.indexOf("await logAdminAction(", topupAt);
    const noticeAt = fn.indexOf("await recordNotification(", topupAt);
    assert.ok(failAt > -1 && topupAt > failAt, "only after the grant succeeded");
    assert.ok(auditAt > topupAt && noticeAt > topupAt);
    assert.match(fn, /grantPointsTopupAudit\(topup\)/);
    assert.match(fn, /const pointsAr = grantPointsTopupNoticeAr\(topup\);/);
    assert.match(fn, /body: pointsAr \? `\$\{grantedAr\} \$\{pointsAr\}` : grantedAr/);
  });
}

test("the top-up never decides the grant's answer (no early return on it)", () => {
  for (const src of [grantRoute, requestRoute]) {
    assert.ok(!/if \(\s*topup\.status/.test(src), "a top-up outcome must not refuse or undo the grant");
  }
});

test("LibraryLockedNote: account lock first, then the points notice, then the subscribe button", () => {
  const at = card.indexOf("export function LibraryLockedNote(");
  assert.ok(at > -1);
  const fn = card.slice(at);
  const hookAt = fn.indexOf("useLibraryLockNoteState()");
  const accountAt = fn.indexOf("if (accountLocked) return <AccountLockedLine");
  const pointsAt = fn.indexOf("if (pointsLock) {");
  const bannerAt = fn.indexOf("<LibraryPointsLockBanner lock={pointsLock} />");
  const subscribeAt = fn.indexOf("{LIBRARY_SUBSCRIBE_LABEL}");
  assert.ok(hookAt > -1 && accountAt > hookAt && pointsAt > accountAt && bannerAt > pointsAt && subscribeAt > bannerAt);
  assert.ok(!fn.slice(0, subscribeAt).includes("useLibraryStatus("), "no per-note polling");
});
