/**
 * staffMfa.test.ts — owner item 18 (batch l7): mandatory TOTP for staff.
 * The pure rule and helpers run; the wiring in proxy.ts, access-control.ts,
 * assertRole.ts and the routes is read as source (they import next/server).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/staffMfa.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  ADMIN_MFA_ENFORCE_ENV,
  MFA_ENROLLMENT_REQUIRED_CODE,
  MFA_REQUIRED_CODE,
  STAFF_MFA_PATH,
  aalFromAccessToken,
  adminMfaMode,
  describeDevice,
  hasVerifiedFactor,
  hasVerifiedTotp,
  sessionIdFromAccessToken,
  staffMfaDecision,
  staffMfaUrlFor,
} from "./staffMfa.ts";
import {
  BACKUP_CODE_ALPHABET,
  BACKUP_CODE_COUNT,
  generateBackupCode,
  generateBackupCodes,
  hashBackupCode,
  normalizeBackupCode,
} from "./staffBackupCodes.ts";

const root = process.cwd();
const src = (p: string) => readFileSync(join(root, p), "utf8");

function token(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.sig`;
}

test("adminMfaMode: forced enrolment only when the switch says so; default is the rollout", () => {
  assert.equal(adminMfaMode({}), "rollout");
  assert.equal(adminMfaMode({ [ADMIN_MFA_ENFORCE_ENV]: "" }), "rollout");
  assert.equal(adminMfaMode({ [ADMIN_MFA_ENFORCE_ENV]: "off" }), "rollout");
  assert.equal(adminMfaMode({ [ADMIN_MFA_ENFORCE_ENV]: "required" }), "required");
  assert.equal(adminMfaMode({ [ADMIN_MFA_ENFORCE_ENV]: " ON " }), "required");
});

test("aalFromAccessToken / sessionIdFromAccessToken read the claims, junk gives null", () => {
  const sid = "0b6c3f5e-1c1d-4e5b-9a7a-2f0f3c1d2e4a";
  assert.equal(aalFromAccessToken(token({ aal: "aal2", session_id: sid })), "aal2");
  assert.equal(aalFromAccessToken(token({ aal: "aal1" })), "aal1");
  assert.equal(aalFromAccessToken(token({ aal: "aal3" })), null);
  assert.equal(aalFromAccessToken("not-a-jwt"), null);
  assert.equal(aalFromAccessToken(null), null);
  assert.equal(aalFromAccessToken("a.@@@.c"), null);
  assert.equal(sessionIdFromAccessToken(token({ session_id: sid.toUpperCase() })), sid);
  assert.equal(sessionIdFromAccessToken(token({ session_id: "x" })), null);
});

test("hasVerifiedTotp / hasVerifiedFactor: an unverified factor never counts", () => {
  assert.equal(hasVerifiedTotp({ factors: [{ status: "unverified", factor_type: "totp" }] }), false);
  assert.equal(hasVerifiedTotp({ factors: [{ status: "verified", factor_type: "totp" }] }), true);
  assert.equal(hasVerifiedTotp({ factors: [{ status: "verified", factor_type: "phone" }] }), false);
  assert.equal(hasVerifiedFactor({ factors: [{ status: "verified", factor_type: "phone" }] }), true);
  assert.equal(hasVerifiedTotp({}), false);
  assert.equal(hasVerifiedTotp(null), false);
});

test("staffMfaDecision: enrolled needs aal2 in every mode; unenrolled is forced only when required", () => {
  for (const mode of ["rollout", "required"] as const) {
    assert.deepEqual(staffMfaDecision({ hasVerifiedFactor: true, aal: "aal2", mode }), { ok: true, suggestEnroll: false });
    for (const aal of ["aal1", null] as const) {
      const d = staffMfaDecision({ hasVerifiedFactor: true, aal, mode });
      assert.equal(d.ok, false);
      assert.equal(!d.ok && d.need, "challenge");
      assert.equal(!d.ok && d.code, MFA_REQUIRED_CODE);
    }
  }
  assert.deepEqual(staffMfaDecision({ hasVerifiedFactor: false, aal: "aal1", mode: "rollout" }), { ok: true, suggestEnroll: true });
  const forced = staffMfaDecision({ hasVerifiedFactor: false, aal: "aal1", mode: "required" });
  assert.equal(!forced.ok && forced.need, "enroll");
  assert.equal(!forced.ok && forced.code, MFA_ENROLLMENT_REQUIRED_CODE);
});

test("staffMfaUrlFor keeps only a local next path", () => {
  assert.equal(staffMfaUrlFor("/dashboard/admin/users"), `${STAFF_MFA_PATH}?next=%2Fdashboard%2Fadmin%2Fusers`);
  assert.equal(staffMfaUrlFor("//evil.example"), STAFF_MFA_PATH);
  assert.equal(staffMfaUrlFor("https://evil.example"), STAFF_MFA_PATH);
  assert.equal(staffMfaUrlFor(null), STAFF_MFA_PATH);
});

test("describeDevice gives a short label, never the raw user agent", () => {
  assert.equal(
    describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"),
    "Chrome على Windows",
  );
  assert.equal(
    describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
    "Safari على iPhone",
  );
  assert.equal(describeDevice(""), "جهاز غير معروف");
  assert.equal(describeDevice(null), "جهاز غير معروف");
});

test("backup codes: 10 distinct 80-bit codes, normalised input, per-user hash", () => {
  const codes = generateBackupCodes();
  assert.equal(codes.length, BACKUP_CODE_COUNT);
  assert.equal(new Set(codes).size, BACKUP_CODE_COUNT);
  for (const c of codes) assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(BACKUP_CODE_ALPHABET.length, 32);
  assert.equal(generateBackupCode(() => new Uint8Array(16)), "AAAA-AAAA-AAAA-AAAA");
  assert.equal(normalizeBackupCode(" abcd-efgh-jkmn-pq٢٣ "), "ABCDEFGHJKMNPQ23");
  assert.equal(normalizeBackupCode("ABCD-EFGH-JKMN-PQ01"), null); // 0 and 1 are not in the alphabet
  assert.equal(normalizeBackupCode("ABCD"), null);
  assert.equal(normalizeBackupCode(42), null);
  const h1 = hashBackupCode("u1", "ABCDEFGHJKMNPQ23");
  assert.match(h1, /^[0-9a-f]{64}$/);
  assert.notEqual(h1, hashBackupCode("u2", "ABCDEFGHJKMNPQ23"));
  assert.equal(h1, hashBackupCode("u1", "ABCDEFGHJKMNPQ23"));
});

// ─── Wiring, read as source ────────────────────────────────────────────────

test("proxy.ts: the admin API prefix and every protected page of an admin pass through the MFA rule", () => {
  const proxy = src("src/proxy.ts");
  assert.match(proxy, /from "@\/lib\/auth\/staffMfa"/);
  assert.match(proxy, /isAdminApiPath\(pathname\)/);
  assert.match(proxy, /staffMfaDecision\(/);
  assert.match(proxy, /if \(isAdmin\) \{[\s\S]{0,600}staffMfaDecision/);
  assert.match(proxy, /staffMfaUrlFor\(/);
  // the MFA page itself is not PROTECTED (no redirect loop)
  assert.doesNotMatch(proxy, /"\/auth\/mfa"/);
});

test("requireAdmin and assertRole refuse an admin whose session does not pass the rule", () => {
  const ac = src("src/lib/access-control.ts");
  assert.match(ac, /staffMfaGate\(/);
  const ar = src("src/lib/auth/assertRole.ts");
  assert.match(ar, /userType === 'admin'[\s\S]{0,200}staffMfaGate\(/);
});

test("the MFA API lives outside /api/v1/admin, and the page outside /dashboard/admin", () => {
  for (const p of [
    "src/app/api/v1/auth/mfa/status/route.ts",
    "src/app/api/v1/auth/mfa/backup-codes/route.ts",
    "src/app/api/v1/auth/mfa/recover/route.ts",
    "src/app/auth/mfa/page.tsx",
  ]) assert.ok(existsSync(join(root, p)), p);
});

test("the backup-code route needs aal2; the recovery route consumes atomically and resets the factor", () => {
  const regen = src("src/app/api/v1/auth/mfa/backup-codes/route.ts");
  assert.match(regen, /aal !== "aal2"/);
  assert.match(regen, /admin_mfa_backup_codes_replace/);
  const rec = src("src/app/api/v1/auth/mfa/recover/route.ts");
  assert.match(rec, /admin_mfa_backup_code_consume/);
  assert.match(rec, /mfa\.deleteFactor/);
});

test("the backup-code route has its own per-address bucket in the proxy", async () => {
  const { isMfaRecoverRoute } = await import("../rateLimitRoutes.ts");
  assert.equal(isMfaRecoverRoute("POST", "/api/v1/auth/mfa/recover"), true);
  assert.equal(isMfaRecoverRoute("GET", "/api/v1/auth/mfa/recover"), false);
  assert.equal(isMfaRecoverRoute("POST", "/api/v1/auth/mfa/recover/x"), false);
  const proxy = src("src/proxy.ts");
  assert.match(proxy, /rateLimiter\.check\("mfa-recover", ip, MFA_RECOVER_RATE_LIMIT\)/);
});

test("the login handshake sends the new-login alert for staff only, after the answer", () => {
  const route = src("src/app/api/v1/auth/session/route.ts");
  assert.match(route, /profile\?\.user_type === "admin"[\s\S]{0,200}after\(\(\) => recordStaffLogin\(/);
  const login = src("src/app/login/page.tsx");
  assert.match(login, /getAuthenticatorAssuranceLevel\(\)/);
  assert.match(login, /staffMfaUrlFor\(dest\)/);
});

test("the 2FA page uses GoTrue TOTP and never renders the QR as markup", () => {
  const page = src("src/app/auth/mfa/page.tsx");
  assert.match(page, /mfa\.enroll\(\{\s*factorType: "totp"/);
  assert.match(page, /mfa\.challengeAndVerify\(/);
  assert.match(page, /<img src=\{enroll\.qr\}/);
  assert.doesNotMatch(page, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(page, /text-gray-(?:100|200)\b/);
});
