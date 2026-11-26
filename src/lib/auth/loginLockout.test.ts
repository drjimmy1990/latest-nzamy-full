/**
 * loginLockout.test.ts — the per-account sign-in lockout (owner file 10 ب23,
 * batch l12-access). The SQL half is proved in
 * supabase/tests/rls/access_lockout_test_kinds.test.sql. Run with:
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/auth/loginLockout.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LOGIN_LOCKED_AR,
  LOGIN_LOCKED_MARKER,
  isCredentialFailure,
  isHookLockRefusal,
  loginIdentifier,
  loginLockedEmail,
  loginLockoutSettingIssue,
  parseSignInBody,
} from "./loginLockout.ts";
import { loginLockKey } from "./loginLockoutKey.ts";

test("the identifier: a lower-cased e-mail or a Saudi E.164 mobile; anything else none", () => {
  assert.deepEqual(loginIdentifier({ email: "  Lawyer@Example.SA " }), { kind: "email", value: "lawyer@example.sa" });
  assert.deepEqual(loginIdentifier({ phone: "+966512345678" }), { kind: "phone", value: "+966512345678" });
  assert.equal(loginIdentifier({ phone: "0512345678" }), null);
  assert.equal(loginIdentifier({ email: "no-at-sign" }), null);
  assert.equal(loginIdentifier({}), null);
});

test("the key: hashed (no address in the table), case-blind, per kind", () => {
  const a = loginLockKey({ kind: "email", value: "lawyer@example.sa" });
  assert.match(a, /^i:[0-9a-f]{64}$/);
  assert.ok(!a.includes("lawyer"));
  assert.equal(a, loginLockKey(loginIdentifier({ email: "LAWYER@example.sa" })!));
  assert.notEqual(a, loginLockKey({ kind: "phone", value: "lawyer@example.sa" }));
});

test("only a wrong password counts — never a captcha refusal, a network error, an unconfirmed address", () => {
  assert.equal(isCredentialFailure({ code: "invalid_credentials", status: 400, message: "Invalid login credentials" }), true);
  assert.equal(isCredentialFailure({ status: 400, message: "Invalid login credentials" }), true, "no code (CORS-hidden header)");
  assert.equal(isCredentialFailure({ code: "captcha_failed", status: 400, message: "captcha protection: request disallowed" }), false);
  assert.equal(isCredentialFailure({ code: "email_not_confirmed", status: 400, message: "Email not confirmed" }), false);
  assert.equal(isCredentialFailure({ status: 0, message: "Failed to fetch" }), false);
  assert.equal(isCredentialFailure(null), false);
});

test("the GoTrue hook's refusal is recognised by its own words", () => {
  assert.ok(LOGIN_LOCKED_AR.includes(LOGIN_LOCKED_MARKER));
  assert.equal(isHookLockRefusal({ message: LOGIN_LOCKED_AR }), true);
  assert.equal(isHookLockRefusal({ message: "Invalid login credentials" }), false);
  // the hook in the migration says the same sentence
  const sql = readFileSync(join(import.meta.dirname, "..", "..", "..", "supabase", "migrations", "20261202_20_access_login_lockout_test_kinds.sql"), "utf8");
  assert.ok(sql.includes(LOGIN_LOCKED_AR), "the hook message = LOGIN_LOCKED_AR");
});

test("the body: identifier + password required; the captcha token passed on when present", () => {
  assert.deepEqual(parseSignInBody({ email: "a@b.sa", password: "x", captchaToken: "t" }), {
    ok: true, id: { kind: "email", value: "a@b.sa" }, password: "x", captchaToken: "t",
  });
  assert.equal(parseSignInBody({ email: "a@b.sa", password: "" }).ok, false);
  assert.equal(parseSignInBody({ password: "x" }).ok, false);
  assert.equal(parseSignInBody([]).ok, false);
  const noToken = parseSignInBody({ phone: "+966512345678", password: "x" });
  assert.ok(noToken.ok && noToken.captchaToken === undefined);
});

test("the lock e-mail and the admin setting validator", () => {
  const m = loginLockedEmail("لمدة ١٥ دقيقة");
  assert.match(m.text, /لمدة ١٥ دقيقة/);
  assert.doesNotMatch(m.subject + m.text, /[A-Za-z]/, "no technical words");
  assert.equal(loginLockoutSettingIssue({ max_failures: 5, window_minutes: 15, lock_minutes: 15 }), null);
  assert.equal(loginLockoutSettingIssue({ max_failures: 3 }), null);
  assert.ok(loginLockoutSettingIssue({ max_failures: 0 }));
  assert.ok(loginLockoutSettingIssue({ lock_minutes: 2000 }));
  assert.ok(loginLockoutSettingIssue({ extra: 1 }));
  assert.ok(loginLockoutSettingIssue(5));
});

const src = (...p: string[]) => readFileSync(join(import.meta.dirname, "..", "..", ...p), "utf8");

test("wiring: the login page signs in through the route; the route checks the lock first and counts credential failures only", () => {
  const page = src("app", "login", "page.tsx");
  assert.match(page, /fetch\("\/api\/v1\/auth\/sign-in"/);
  assert.doesNotMatch(page, /supabase\.auth\.signInWithPassword\(/, "no browser password sign-in left");
  assert.match(page, /captchaToken: captcha\.token/);
  assert.match(page, /signInRes\.status === 423/);
  assert.doesNotMatch(page, /node:crypto|loginLockoutKey/, "the client never pulls the hashing");
  const route = src("app", "api", "v1", "auth", "sign-in", "route.ts");
  const status = route.indexOf("lockStatus(service, key, lockId)");
  const signIn = route.indexOf("supabase.auth.signInWithPassword(credentials)");
  assert.ok(status > 0 && status < signIn, "the lock is checked before GoTrue is asked");
  assert.match(route, /if \(isCredentialFailure\(error\)\) \{\s*const after = await record\(service, key, lockId, false\);/);
  // l18 LIVE-05: the counter key is still the typed identifier; a mobile only
  // tells the lock functions which account it named.
  assert.match(route, /const key = loginLockKey\(body\.id\);/);
  assert.match(route, /const lockId: LoginIdentifier = target \? \{ kind: "email", value: target\.email \} : body\.id;/);
  // l16 D-31: no service client → the sign-in is refused (503), never let through uncounted
  {
    const svc = route.indexOf("service = await createServiceClient();");
    const refuse = route.indexOf("{ status: 503, headers: NO_STORE }");
    assert.ok(svc > 0 && refuse > svc && refuse < status, "a missing service client is answered 503 before anything else");
  }
  assert.match(page, /signInRes\.status === 503/);
  assert.match(route, /options: \{ captchaToken: body\.captchaToken \}/);
  assert.match(route, /sendEmail\(\{ to: data, subject: mail\.subject, text: mail\.text, tag: "login_locked" \}\)/);
  const settings = src("app", "api", "v1", "admin", "settings", "route.ts");
  assert.match(settings, /auth_login_lockout: loginLockoutSettingIssue,/);
  const limits = src("lib", "rateLimitRoutes.ts");
  assert.match(limits, /export const AUTH_SIGN_IN_RE/);
  const proxy = src("proxy.ts");
  assert.match(proxy, /!isSourcePreviewMatch && !isAuthSignInMatch &&\r?\n\s*!isAiRunProgressMatch/, "the new flags are in the early return");
  assert.match(proxy, /rateLimiter\.check\("auth-sign-in", key, AUTH_SIGN_IN_RATE_LIMIT\)/);
  assert.match(proxy, /rateLimiter\.check\("source-preview", key, SOURCE_PREVIEW_RATE_LIMIT\)/);
});
