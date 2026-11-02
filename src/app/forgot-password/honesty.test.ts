/**
 * Owner package 2026-11-02, slice A §1.5: /forgot-password used to step
 * through «رمز التحقق» → «كلمة مرور جديدة» → «تم بنجاح» on local state alone.
 * These checks pin the real flow: the page asks GoTrue for a reset email,
 * carries the Turnstile token, and shows its "sent" answer only after that
 * call came back without an error. Also the reset page and the callback.
 *
 * Source-read (.tsx and the route cannot load under node --test); comments
 * are stripped and CRLF normalised.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const strip = (src: string) =>
  src
    .replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");
const read = (f: string) => strip(readFileSync(new URL(f, import.meta.url), "utf8"));

const forgot = read("./page.tsx");
const reset = read("../reset-password/page.tsx");
const callback = read("../auth/callback/route.ts");

test("forgot-password calls resetPasswordForEmail with the callback redirect and the captcha token", () => {
  assert.match(forgot, /supabase\.auth\.resetPasswordForEmail\(email\.trim\(\), \{/);
  assert.match(forgot, /redirectTo: recoveryRedirectTo\(window\.location\.origin\)/);
  assert.match(forgot, /\.\.\.\(captchaToken \? \{ captchaToken \} : \{\}\)/);
  assert.match(forgot, /useTurnstile\(\{ isAr, theme, action: "password_reset" \}\)/);
  assert.match(forgot, /canSubmitWithCaptcha\(captcha\.state\)/);
  assert.match(forgot, /captcha\.spend\(\)/);
  assert.match(forgot, /<TurnstileWidget control=\{captcha\} isAr=\{isAr\} \/>/);
});

test("forgot-password never shows its 'sent' state without the real call", () => {
  const sets = [...forgot.matchAll(/setSent\(true\)/g)];
  assert.equal(sets.length, 1, "exactly one place may set the sent state");
  const call = forgot.indexOf("resetPasswordForEmail(");
  const classify = forgot.indexOf("classifyRecoverError(result.error)");
  const sent = sets[0].index!;
  assert.ok(call > 0 && classify > call && sent > classify, "sent only after the call and its error check");
  // every non-neutral outcome returns before the sent line
  for (const outcome of ["captcha", "network", "server", "invalid_email"]) {
    const at = forgot.indexOf(`outcome === "${outcome}"`);
    assert.ok(at > classify && at < sent, outcome);
  }
  // the neutral wording, verbatim from the brief
  assert.match(forgot, /إن كان البريد مسجلاً فستصلك رسالة/);
});

test("forgot-password no longer fakes an OTP, a phone path or «تم بنجاح»", () => {
  assert.doesNotMatch(forgot, /setStep\(/);
  assert.doesNotMatch(forgot, /\botp\b|رمز التحقق/i);
  assert.doesNotMatch(forgot, /تم بنجاح/);
  assert.doesNotMatch(forgot, /type="tel"/);
});

test("reset-password requires a live session, saves through updateUser and signs out after", () => {
  assert.match(reset, /supabase\.auth\.getUser\(\)/);
  assert.match(reset, /linkErrorInUrl\(window\.location\.search, window\.location\.hash\)/);
  assert.match(reset, /if \(data\.user\) setPhase\("ready"\)/);
  assert.match(reset, /resetPasswordProblem\(password, confirm, isAr\)/);
  assert.match(reset, /supabase\.auth\.updateUser\(\{ password \}\)/);
  const update = reset.indexOf("updateUser({ password })");
  const errCheck = reset.indexOf("if (updateError)", update);
  const signOut = reset.indexOf("signOut(", update);
  const done = reset.indexOf('setPhase("done")');
  assert.ok(update > 0 && errCheck > update && signOut > errCheck && done > signOut);
  assert.equal([...reset.matchAll(/setPhase\("done"\)/g)].length, 1);
  // the honest dead end links back to a new request
  assert.match(reset, /href=\{FORGOT_PASSWORD_PATH\}/);
});

test("callback: recovery is decided before the onboarding/dashboard routing, OAuth path kept", () => {
  assert.match(callback, /const plan = planAuthCallback\(searchParams\)/);
  assert.match(callback, /verifyOtp\(\{\s*type: "recovery",\s*token_hash: plan\.tokenHash,?\s*\}\)/);
  assert.match(callback, /exchangeCodeForSession\(plan\.code\)/);
  const landing = callback.indexOf("if (recoveryLanding) return redirectRelative(recoveryLanding)");
  const profiles = callback.indexOf('.from("profiles")');
  const onboarding = callback.indexOf('redirectRelative("/onboarding")');
  assert.ok(landing > 0 && profiles > landing && onboarding > landing);
  // next is still validated by the shared open-redirect guard
  assert.match(callback, /safeLocalPath\(searchParams\.get\("next"\), FALLBACK_DASHBOARD_PATH\)/);
  assert.match(callback, /return redirectRelative\("\/login\?error=auth_callback_failed"\)/);
});
