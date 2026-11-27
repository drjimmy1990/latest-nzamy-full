/**
 * phoneSignIn.test.ts — batch l18 (LIVE-05): signing in with a Saudi mobile.
 * The verdict core (./phoneSignIn.ts) and the route's wiring (source read).
 *
 *   - a number with no single account still reaches GoTrue (a throw-away
 *     address) so the security check answers the same whatever the number;
 *   - every refusal on the phone path is the one wrong-password answer,
 *     counted by the lockout; only number-independent refusals pass through;
 *   - a sign-in that lands on any account but the named one is undone.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PHONE_SIGN_IN_REFUSAL_FLOOR_MS,
  PHONE_SIGN_IN_SINK_DOMAIN,
  phoneSignInLockKeys,
  phoneSignInSinkAddress,
  phoneSignInVerdict,
  phoneTargetFromRpc,
  UNIFORM_CREDENTIALS_REFUSAL,
} from "./phoneSignIn.ts";
import { isCredentialFailure } from "./loginLockout.ts";
import { translateAuthError } from "./translateAuthError.ts";

const TARGET = { userId: "00000000-0000-0000-0000-0000000018a1", email: "phone.one@example.test" };
const WRONG = { message: "Invalid login credentials", code: "invalid_credentials", status: 400 };

test("the database answer: an account only for ok + id + address", () => {
  assert.deepEqual(phoneTargetFromRpc({ ok: true, user_id: TARGET.userId, email: " Phone.One@Example.TEST " }), TARGET);
  for (const v of [null, undefined, [], "x", { ok: false, reason: "shared" }, { ok: true, user_id: TARGET.userId }, { ok: true, email: "a@b.sa" }, { ok: "true", user_id: "u", email: "a@b.sa" }, { ok: true, user_id: "u", email: "no-at" }]) {
    assert.equal(phoneTargetFromRpc(v), null, JSON.stringify(v));
  }
});

test("the throw-away address: a fresh random id under the reserved .invalid domain, never a fixed one", () => {
  const a = phoneSignInSinkAddress("3f2b9c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f");
  assert.equal(a, `3f2b9c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f@${PHONE_SIGN_IN_SINK_DOMAIN}`);
  assert.ok(PHONE_SIGN_IN_SINK_DOMAIN.endsWith(".invalid"));
  assert.notEqual(phoneSignInSinkAddress(crypto.randomUUID()), phoneSignInSinkAddress(crypto.randomUUID()));
  assert.throws(() => phoneSignInSinkAddress(""));
  assert.throws(() => phoneSignInSinkAddress("fixed"));
});

test("the right password for the named account signs in", () => {
  assert.deepEqual(phoneSignInVerdict({ target: TARGET, error: null, signedInUserId: TARGET.userId }), { ok: true });
});

test("every account-dependent refusal becomes the one wrong-password answer, and is counted", () => {
  const errors = [
    WRONG,
    { message: "Email not confirmed", code: "email_not_confirmed", status: 400 },
    { message: "User is banned", code: "user_banned", status: 400 },
    { message: "Phone not confirmed", code: "phone_not_confirmed", status: 400 },
    { message: "Database error", status: 500 },
    { message: "something new" },
  ];
  for (const target of [TARGET, null]) {
    for (const error of errors) {
      const v = phoneSignInVerdict({ target, error, signedInUserId: null });
      assert.equal(v.ok, false);
      if (v.ok) continue;
      assert.deepEqual(v.error, { ...UNIFORM_CREDENTIALS_REFUSAL }, JSON.stringify(error));
      assert.equal(v.undo, false);
      assert.equal(isCredentialFailure(v.error), true, "the lockout counts it like a wrong password");
      // …and the page shows exactly what a wrong e-mail password shows.
      assert.equal(translateAuthError(v.error, { context: "login", isAr: true }), translateAuthError(WRONG, { context: "login", isAr: true }));
    }
  }
});

test("number-independent refusals pass through unchanged (security check, rate limit, network, the lock hook)", () => {
  const through = [
    { message: "captcha protection: request disallowed", code: "captcha_failed", status: 400 },
    { message: "Request rate limit reached", code: "over_request_rate_limit", status: 429 },
    { name: "AuthRetryableFetchError", message: "fetch failed", status: 0 },
    { message: "أُوقف الدخول إلى هذا الحساب مؤقتاً بعد محاولات", status: 400 },
  ];
  for (const target of [TARGET, null]) {
    for (const error of through) {
      const v = phoneSignInVerdict({ target, error, signedInUserId: null });
      assert.deepEqual(v, { ok: false, error, undo: false }, JSON.stringify(error));
    }
  }
});

test("a session on any other account — or on the throw-away address — is undone and refused", () => {
  const other = phoneSignInVerdict({ target: TARGET, error: null, signedInUserId: "00000000-0000-0000-0000-0000000018ff" });
  assert.deepEqual(other, { ok: false, error: { ...UNIFORM_CREDENTIALS_REFUSAL }, undo: true });
  const sink = phoneSignInVerdict({ target: null, error: null, signedInUserId: "00000000-0000-0000-0000-0000000018ff" });
  assert.deepEqual(sink, { ok: false, error: { ...UNIFORM_CREDENTIALS_REFUSAL }, undo: true });
  const none = phoneSignInVerdict({ target: TARGET, error: null, signedInUserId: null });
  assert.deepEqual(none, { ok: false, error: { ...UNIFORM_CREDENTIALS_REFUSAL }, undo: false });
});

test("route wiring: the number is resolved on the server; unknown numbers still reach GoTrue; the e-mail path is unchanged", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "..", "app", "api", "v1", "auth", "sign-in", "route.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.match(route, /service\.rpc\("phone_sign_in_target", \{ p_phone: e164 \}\)/);
  assert.match(route, /const target = body\.id\.kind === "phone" \? await phoneTarget\(service, body\.id\.value\) : null;/);
  assert.match(route, /\? \{ email: body\.id\.value, password: body\.password, \.\.\.options \}/, "the e-mail path signs in exactly as before");
  assert.match(route, /: \{ email: target\?\.email \?\? phoneSignInSinkAddress\(crypto\.randomUUID\(\)\), password: body\.password, \.\.\.options \};/);
  assert.doesNotMatch(route, /\{ phone: body\.id\.value/, "GoTrue is never asked for a phone sign-in");
  assert.match(route, /phoneSignInVerdict\(\{ target, error: gotrueError, signedInUserId: user\?\.id \?\? null \}\)/);
  assert.match(route, /if \(verdict\.undo\) \{\s*try \{\s*await supabase\.auth\.signOut\(\{ scope: "local" \}\);/);
  // The resolution comes before the lock check, the lock check before GoTrue.
  const resolve = route.indexOf("await phoneTarget(service, body.id.value)");
  const lock = route.indexOf("lockStatusAll(service, keys, lockId)");
  const signIn = route.indexOf("supabase.auth.signInWithPassword(credentials)");
  assert.ok(resolve > 0 && lock > resolve && signIn > lock);
  // A lookup that fails reads as "no account" (fail closed).
  assert.match(route, /console\.error\("\[auth\/sign-in\] phone lookup failed:", error\.code\);\s*\}\s*return null;/);
});

// l18 review S1: the typed mobile and the account's address share one budget.
test("phoneSignInLockKeys: the typed key, plus the account address's key when the number names one", () => {
  assert.deepEqual(phoneSignInLockKeys("i:phone", null), ["i:phone"]);
  assert.deepEqual(phoneSignInLockKeys("i:phone", "i:mail"), ["i:phone", "i:mail"]);
  assert.deepEqual(phoneSignInLockKeys("i:mail", "i:mail"), ["i:mail"]);
});

// l18 review S3: every refusal on the mobile path waits out the same floor.
test("route wiring: every mobile-path refusal is held to the floor; the e-mail path is not", () => {
  const route = readFileSync(join(import.meta.dirname, "..", "..", "app", "api", "v1", "auth", "sign-in", "route.ts"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(PHONE_SIGN_IN_REFUSAL_FLOOR_MS >= 500);
  assert.match(route, /const startedAt = Date\.now\(\);\n\s+let raw: unknown;/);
  assert.match(route, /if \(body\.id\.kind === "phone"\) \{\n\s+const wait = startedAt \+ PHONE_SIGN_IN_REFUSAL_FLOOR_MS - Date\.now\(\);/);
  // the 423s and the 401 all go through refuse(); no bare return locked() left
  assert.equal((route.match(/return refuse\(locked\(\)\);/g) ?? []).length, 3);
  assert.doesNotMatch(route, /return locked\(\);/);
  assert.match(route, /return refuse\(NextResponse\.json\(\n\s+\{\n\s+authError:/);
});
