/**
 * signupFlowGuard.test.ts — LIVE-01 (batch l18, owner package 26 Nov 2026):
 * after the WhatsApp code the user was sent back to step 1 of /register, then
 * through the onboarding wizard again. Pinned here:
 *   - the global 403 handler and the idle guard stay quiet on the sign-up
 *     pages, so a sign-up in progress (the lawyer's inline code and licence
 *     photo included) is never pulled away;
 *   - /verify-phone never returns to a sign-up page (phoneOtp.test.ts);
 *   - a signed-in visitor of /register* or /login is sent home by the proxy;
 *   - a form sign-up is marked onboarded when its mobile is confirmed; a
 *     Google sign-up keeps the wizard.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/phoneOtp/signupFlowGuard.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isFormSignup, isSignedInHomePath } from "./phoneOtpRules.ts";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the proxy sends a signed-in visitor home from the sign-up pages, never from a reset page", () => {
  for (const p of ["/register", "/register/", "/register/client", "/register/provider", "/login", "/login/"]) {
    assert.equal(isSignedInHomePath(p), true, p);
  }
  for (const p of ["/forgot-password", "/reset-password", "/register/provider/verify", "/verify-phone", "/onboarding", "/"]) {
    assert.equal(isSignedInHomePath(p), false, p);
  }
});

test("a form sign-up (e-mail, no Google, a user_type) is the only one marked onboarded", () => {
  const form = { identities: [{ provider: "email" }], user_metadata: { user_type: "individual" } };
  assert.equal(isFormSignup(form), true);
  assert.equal(isFormSignup({ identities: [{ provider: "email" }], user_metadata: { user_type: "provider" } }), true);
  assert.equal(isFormSignup({ identities: [{ provider: "google" }], user_metadata: { user_type: "individual" } }), false);
  assert.equal(
    isFormSignup({ identities: [{ provider: "email" }, { provider: "google" }], user_metadata: { user_type: "lawyer" } }),
    false,
    "a linked Google identity keeps the wizard",
  );
  assert.equal(isFormSignup({ identities: [{ provider: "email" }], user_metadata: {} }), false, "no user_type from a form");
  assert.equal(isFormSignup({ identities: [{ provider: "email" }], user_metadata: { user_type: "  " } }), false);
  assert.equal(isFormSignup({ identities: [], app_metadata: { providers: ["email"] }, user_metadata: { user_type: "ngo" } }), true);
  assert.equal(isFormSignup({ identities: null, app_metadata: { providers: ["google"] }, user_metadata: { user_type: "ngo" } }), false);
  assert.equal(isFormSignup({ identities: [{ provider: "phone" }], user_metadata: { user_type: "individual" } }), false);
  assert.equal(isFormSignup(null), false);
});

test("the global 403 handler and the idle guard stay quiet on the sign-up pages", () => {
  const redirect = code("src/components/auth/PhoneGateRedirect.tsx");
  assert.match(redirect, /if \(isSignupFlowPath\(window\.location\.pathname\)\) return res;/);
  const idx = redirect.indexOf("isSignupFlowPath(window.location.pathname)");
  assert.ok(idx > 0 && idx < redirect.indexOf("window.location.assign(target)"), "checked before the trip");
  const idle = code("src/hooks/useSessionIdleGuard.ts");
  assert.match(idle, /const onSignupPage = isSignupFlowPath\(usePathname\(\) \?\? ""\);/);
  assert.match(idle, /if \(!isSupabaseMode \|\| !signedIn \|\| onSignupPage\) \{/);
  assert.match(idle, /\}, \[signedIn, onSignupPage\]\);/);
});

test("proxy: the signed-in guard runs before the public-page early return, fails open, and costs a guest nothing", () => {
  // Raw text: a `/*` inside a // comment of proxy.ts would fool code()'s stripping.
  const proxy = read("src/proxy.ts");
  const call = proxy.indexOf("const signedInPage = await signedInSignupPageRedirect(req, pathname);");
  const publicReturn = proxy.indexOf("if (!isProtected) return NextResponse.next();");
  assert.ok(call > 0 && publicReturn > call, "1d runs before step 2's early return");
  const fn = proxy.slice(proxy.indexOf("async function signedInSignupPageRedirect"), proxy.indexOf("async function applyLibraryReadQuota"));
  assert.match(fn, /if \(!isSupabaseMode \|\| !isSignedInHomePath\(pathname\)\) return null;/);
  assert.match(fn, /if \(!hasSupabaseAuthCookie\(req\.cookies\.getAll\(\)\.map\(\(c\) => c\.name\)\)\) return null;/);
  assert.match(fn, /if \(!user\) return passThrough;/);
  assert.match(fn, /\(await phoneGateVerdict\(user\)\) === "held"\) \{\s*dest = VERIFY_PHONE_PATH;/);
  assert.match(fn, /if \(profileError\) return passThrough;/);
  assert.match(fn, /postLoginPath\(params\.get\("next"\) \?\? params\.get\("from"\), home\)/);
  assert.match(fn, /response\.cookies\.getAll\(\)\.forEach\(\(cookie\) => redirect\.cookies\.set\(cookie\)\);/);
  // l18 review N6: the redirect depends on the session cookie — never kept by a shared cache
  assert.match(fn, /redirect\.headers\.set\("Cache-Control", "private, no-store"\);/);
  assert.match(fn, /\} catch \{\s*return null;\s*\}/);
});

test("verifyPhoneOtp marks a form sign-up onboarded (best-effort) before choosing the home", () => {
  const svc = code("src/lib/phoneOtp/service.ts");
  assert.match(svc, /if \(j\.ok\) return \{ ok: true, home: homeAfterVerify\(await markFormSignupOnboarded\(svc, user, profile\)\) \};/);
  const fn = svc.slice(svc.indexOf("async function markFormSignupOnboarded"), svc.indexOf("export async function verifyPhoneOtp"));
  assert.match(fn, /if \(profile\.onboarding_completed === true \|\| !isFormSignup\(user\)\) return profile;/);
  assert.match(fn, /\.update\(\{ onboarding_completed: true \}\)\s*\.eq\("id", user\.id\)\s*\.eq\("onboarding_completed", false\);/);
  assert.match(fn, /if \(error\) \{[\s\S]*?return profile;\s*\}/, "a failed write never fails the confirmation");
});
