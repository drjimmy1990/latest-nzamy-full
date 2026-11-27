/**
 * whatsappReset.test.ts — batch l17, «نسيت كلمة المرور» by a WhatsApp code.
 * Runs the real core (./whatsappReset.ts) with fakes for every outside
 * effect, plus source contracts for the routes, the page and /login.
 *
 *   1. start answers the same (status, body, nothing account-dependent before
 *      the answer) for an unknown address, no confirmed mobile, staff,
 *      suspended / frozen, a database limit, a per-e-mail-address limit and a real
 *      account; only the real account gets a WhatsApp message.
 *   2. verify answers one refusal (and one minimum time) for an unknown
 *      address, a wrong code and a malformed code; nothing is changed.
 *   3. a sign-up code can never pass the reset check, and the reverse.
 *   4. the password rule is the Settings / reset-page rule.
 *   5. the WhatsApp button exists only while the status says so.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  authUserMayReset,
  START_UNIFORM_BODY,
  startWhatsAppReset,
  VERIFY_FAILURE_FLOOR_MS,
  verifyWhatsAppReset,
  type ResetDeps,
  type ResetTarget,
} from "./whatsappReset.ts";
import {
  normalizeResetEmail,
  whatsappFromStatus,
  whatsappResetAvailable,
  WHATSAPP_CODE_INVALID_AR,
  WHATSAPP_START_SENT_AR,
} from "./passwordResetRules.ts";
import { hashOtpCode, hashOtpTarget } from "../lawyerSignup/otpCode.ts";
import { MAX_PASSWORD_BYTES, PASSWORD_TOO_LONG_AR, validateNewPassword } from "../../app/settings/components/tabs/_securityFields.ts";
import { resetPasswordProblem } from "../auth/passwordRecovery.ts";
import { PASSWORD_CHANGED_MAIL_BODY_AR } from "./passwordResetRules.ts";

const PEPPER = "p".repeat(40);
const USER = "00000000-0000-0000-0000-0000000017a1";
const PHONE = "+966500001701";
const GOOD_PASSWORD = "NewPass123!";

type Calls = {
  lookups: string[];
  phoneLookups: string[];
  allowKeys: string[];
  issued: Array<{ userId: string; targetHash: string; codeHash: string }>;
  sent: Array<{ e164: string; code: string }>;
  verified: Array<{ codeHash: string; phone: string }>;
  passwords: Array<{ userId: string; password: string }>;
  revoked: string[];
  audits: number;
  notices: string[];
  logs: string[];
  sleeps: number[];
};

/** A fake world: `accounts` maps an address to its target (null = must not receive a code). */
function world(opts: {
  accounts?: Record<string, ResetTarget | null>;
  /** Batch l18: a confirmed mobile (E.164) → its one account (null = none / shared / may not reset). */
  phones?: Record<string, ResetTarget | null>;
  available?: boolean;
  pepper?: string | undefined;
  captcha?: "ok" | "failed" | "misconfigured";
  issueRefused?: boolean;
  allow?: boolean;
  /** Codes stored by issue(): their hashes, as the database would keep them. */
  stored?: string[];
  setPasswordFails?: boolean;
  notify?: "sent" | "failed" | "throws";
}) {
  const calls: Calls = { lookups: [], phoneLookups: [], allowKeys: [], issued: [], sent: [], verified: [], passwords: [], revoked: [], audits: 0, notices: [], logs: [], sleeps: [] };
  const stored = opts.stored ?? [];
  let clock = 1_000_000;
  const deps: ResetDeps = {
    pepperRaw: "pepper" in opts ? opts.pepper : PEPPER,
    available: async () => opts.available ?? true,
    allow: (key) => {
      calls.allowKeys.push(key);
      return opts.allow ?? true;
    },
    captcha: async () => opts.captcha ?? "ok",
    lookup: async (email) => {
      calls.lookups.push(email);
      return opts.accounts?.[email] ?? null;
    },
    lookupByPhone: async (e164) => {
      calls.phoneLookups.push(e164);
      return opts.phones?.[e164] ?? null;
    },
    issue: async (args) => {
      calls.issued.push(args);
      if (opts.issueRefused) return null;
      stored.push(args.codeHash);
      return { id: "challenge-1" };
    },
    send: async (e164, code) => {
      calls.sent.push({ e164, code });
      return "sent";
    },
    markDelivery: async () => {},
    verify: async ({ codeHash, phone }) => {
      calls.verified.push({ codeHash, phone });
      const at = stored.indexOf(codeHash);
      if (at === -1) return false;
      stored.splice(at, 1);
      return true;
    },
    setPassword: async (userId, password) => {
      calls.passwords.push({ userId, password });
      return opts.setPasswordFails ? { ok: false, code: "weak_password" } : { ok: true };
    },
    revokeSessions: async (userId) => {
      calls.revoked.push(userId);
      return 2;
    },
    audit: async () => {
      calls.audits += 1;
    },
    notify: async (userId) => {
      calls.notices.push(userId);
      if (opts.notify === "throws") throw new Error("smtp down");
      return opts.notify ?? "sent";
    },
    log: (m) => calls.logs.push(m),
    now: () => clock,
    sleep: async (ms) => {
      calls.sleeps.push(ms);
      clock += ms;
    },
  };
  return { deps, calls, stored };
}

const target: ResetTarget = { userId: USER, phone: PHONE };

// ── 1. start: one answer for everyone ────────────────────────────────────────
test("start: the same 200 and body for every kind of address; the lookup runs only after the answer", async () => {
  const cases: Array<{ label: string; email: string; opts: Parameters<typeof world>[0]; sends: boolean }> = [
    { label: "real account with a confirmed mobile", email: "reset.ok@example.test", opts: { accounts: { "reset.ok@example.test": target } }, sends: true },
    { label: "no such account", email: "nobody@example.test", opts: { accounts: {} }, sends: false },
    // pw_reset_target / authUserMayReset turn these into null — the core never learns why.
    { label: "no confirmed mobile", email: "unconfirmed@example.test", opts: { accounts: { "unconfirmed@example.test": null } }, sends: false },
    { label: "staff", email: "admin@example.test", opts: { accounts: { "admin@example.test": null } }, sends: false },
    { label: "suspended", email: "banned@example.test", opts: { accounts: { "banned@example.test": null } }, sends: false },
    { label: "a database limit (cooldown / per hour / per number)", email: "reset.ok@example.test", opts: { accounts: { "reset.ok@example.test": target }, issueRefused: true }, sends: false },
    { label: "the per-e-mail-address limit of this process", email: "reset.ok@example.test", opts: { accounts: { "reset.ok@example.test": target }, allow: false }, sends: false },
  ];
  const answers: string[] = [];
  for (const c of cases) {
    const { deps, calls } = world(c.opts);
    const out = await startWhatsAppReset(deps, { email: `  ${c.email.toUpperCase()} ` });
    assert.equal(calls.lookups.length, 0, `${c.label}: nothing about the account is read before the answer`);
    answers.push(JSON.stringify({ status: out.status, body: out.body }));
    if (out.background) await out.background();
    assert.equal(calls.sent.length, c.sends ? 1 : 0, `${c.label}: WhatsApp messages sent`);
    if (c.sends) {
      assert.equal(calls.sent[0].e164, PHONE, "the code goes to the account's confirmed mobile");
      assert.match(calls.sent[0].code, /^\d{6}$/);
    }
    for (const line of calls.logs) {
      assert.ok(!line.includes(PHONE) && !line.includes("@") && !calls.sent.some((s) => line.includes(s.code)), `${c.label}: a log line leaks: ${line}`);
    }
  }
  assert.equal(new Set(answers).size, 1, `every case answers the same: ${[...new Set(answers)].join(" | ")}`);
  assert.deepEqual(JSON.parse(answers[0]), { status: 200, body: { ok: true, message: WHATSAPP_START_SENT_AR } });
  assert.equal(START_UNIFORM_BODY.message, "إن كان للحساب جوال مؤكَّد فسيصله رمز عبر واتساب خلال دقيقة. إن لم يصلك، فاستعمل رابط البريد.");
});

test("start: the answer never carries a number, a hint or a code", async () => {
  const { deps } = world({ accounts: { "reset.ok@example.test": target } });
  const out = await startWhatsAppReset(deps, { email: "reset.ok@example.test" });
  const text = JSON.stringify(out.body);
  assert.ok(!text.includes("9665") && !text.includes("•") && !/\d{6}/.test(text));
});

test("start: what may differ reveals nothing about the account (malformed address, security check, switch off)", async () => {
  const bad = await startWhatsAppReset(world({}).deps, { email: "not-an-address" });
  assert.equal(bad.status, 400);
  assert.equal(bad.background, null);

  const captchaFail = world({ captcha: "failed", accounts: { "reset.ok@example.test": target } });
  const c = await startWhatsAppReset(captchaFail.deps, { email: "reset.ok@example.test" });
  assert.equal(c.status, 403);
  assert.equal(c.body.code, "captcha");
  assert.equal(c.background, null);
  assert.equal(captchaFail.calls.lookups.length, 0);

  const misconfigured = await startWhatsAppReset(world({ captcha: "misconfigured" }).deps, { email: "reset.ok@example.test" });
  assert.equal(misconfigured.status, 503);

  const off = world({ available: false, accounts: { "reset.ok@example.test": target } });
  const o = await startWhatsAppReset(off.deps, { email: "reset.ok@example.test" });
  assert.equal(o.status, 503);
  assert.equal(o.body.code, "unavailable");
  assert.equal(o.background, null);

  const noPepper = await startWhatsAppReset(world({ pepper: "short" }).deps, { email: "reset.ok@example.test" });
  assert.equal(noPepper.status, 503);
});

test("authUserMayReset: a suspended (ban or app_metadata copy) or frozen account gets no code", () => {
  assert.equal(authUserMayReset({ id: USER, app_metadata: {} }), true);
  assert.equal(authUserMayReset({ id: USER, banned_until: new Date(Date.now() + 86_400_000).toISOString() }), false);
  assert.equal(authUserMayReset({ id: USER, app_metadata: { account_suspension: { status: "suspended" } } }), false);
  assert.equal(authUserMayReset({ id: USER, app_metadata: { account_deletion: { status: "frozen" } } }), false);
  assert.equal(authUserMayReset({ id: USER, banned_until: new Date(Date.now() - 86_400_000).toISOString() }), true);
  assert.equal(authUserMayReset(null), false);
});

// ── 2. verify: one refusal ──────────────────────────────────────────────────
async function sentCode(w: ReturnType<typeof world>, email: string): Promise<string> {
  const out = await startWhatsAppReset(w.deps, { email });
  await out.background?.();
  return w.calls.sent.at(-1)!.code;
}

test("verify: an unknown address, a wrong code and a malformed code get the same refusal and the same minimum time", async () => {
  const answers: string[] = [];
  for (const [label, email, code] of [
    ["unknown address", "nobody@example.test", "123456"],
    ["wrong code", "reset.ok@example.test", "000000"],
    ["malformed code", "reset.ok@example.test", "12ab"],
  ] as const) {
    const w = world({ accounts: { "reset.ok@example.test": target } });
    const real = await sentCode(w, "reset.ok@example.test");
    const tried = label === "wrong code" && real === "000000" ? "000001" : code;
    const out = await verifyWhatsAppReset(w.deps, { email, code: tried, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
    answers.push(JSON.stringify(out));
    assert.equal(w.calls.passwords.length, 0, `${label}: no password set`);
    assert.equal(w.calls.revoked.length, 0, `${label}: no session ended`);
    assert.equal(w.calls.sleeps.reduce((a, b) => a + b, 0), VERIFY_FAILURE_FLOOR_MS, `${label}: held to the floor`);
  }
  assert.equal(new Set(answers).size, 1);
  assert.deepEqual(JSON.parse(answers[0]), { status: 400, body: { ok: false, code: "invalid_code", error: WHATSAPP_CODE_INVALID_AR } });
  assert.equal(WHATSAPP_CODE_INVALID_AR, "الرمز غير صحيح أو انتهت صلاحيته");
});

test("verify: the right code sets the password, ends the sessions, writes the audit row — and works once", async () => {
  const w = world({ accounts: { "reset.ok@example.test": target } });
  const code = await sentCode(w, "reset.ok@example.test");
  // Arabic-Indic digits are accepted, as on the sign-up screen.
  const arabic = code.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
  const ok = await verifyWhatsAppReset(w.deps, { email: "Reset.OK@example.test", code: arabic, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { ok: true });
  assert.equal(w.calls.notices.length, 0, "the e-mail goes after the answer");
  await ok.background?.();
  assert.deepEqual(w.calls.notices, [USER]);
  assert.deepEqual(w.calls.passwords, [{ userId: USER, password: GOOD_PASSWORD }]);
  assert.deepEqual(w.calls.revoked, [USER]);
  assert.equal(w.calls.audits, 1);
  const again = await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(again.body.code, "invalid_code");
  assert.equal(w.calls.passwords.length, 1);
});

test("verify: a password the server cannot save after the code was spent asks for a new code", async () => {
  const w = world({ accounts: { "reset.ok@example.test": target }, setPasswordFails: true });
  const code = await sentCode(w, "reset.ok@example.test");
  const out = await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(out.status, 503);
  assert.equal(out.body.code, "password_not_set");
  assert.match(String(out.body.error), /اطلب رمزًا جديدًا/);
  assert.equal(w.calls.revoked.length, 0);
});

test("verify: the switch off refuses, without reading the account", async () => {
  const w = world({ available: false, accounts: { "reset.ok@example.test": target } });
  const out = await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code: "123456", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(out.status, 503);
  assert.equal(w.calls.lookups.length, 0);
});

// ── 3. not interchangeable ──────────────────────────────────────────────────
test("codes: a reset code is hashed for its own purpose; a sign-up code never passes the reset check", async () => {
  const code = "424242";
  const reset = hashOtpCode(PEPPER, USER, "password_reset", code);
  const signup = hashOtpCode(PEPPER, USER, "phone", code);
  assert.notEqual(reset, signup);

  // The core issues reset-purpose hashes…
  const w = world({ accounts: { "reset.ok@example.test": target } });
  const sent = await sentCode(w, "reset.ok@example.test");
  assert.equal(w.calls.issued[0].codeHash, hashOtpCode(PEPPER, USER, "password_reset", sent));
  assert.notEqual(w.calls.issued[0].codeHash, hashOtpCode(PEPPER, USER, "phone", sent));
  assert.equal(w.calls.issued[0].targetHash, hashOtpTarget(PEPPER, PHONE));

  // …and a store holding only a SIGN-UP code for this account refuses it here.
  const signupOnly = world({ accounts: { "reset.ok@example.test": target }, stored: [signup] });
  const out = await verifyWhatsAppReset(signupOnly.deps, { email: "reset.ok@example.test", code, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(out.body.code, "invalid_code");
  assert.equal(signupOnly.calls.verified[0].codeHash, reset, "verify asks with the reset-purpose hash");
  assert.equal(signupOnly.calls.passwords.length, 0);

  // The sign-up service hashes "phone" and talks to phone_otp_*; the reset core never does.
  const signupService = readFileSync(new URL("../phoneOtp/service.ts", import.meta.url), "utf8");
  assert.match(signupService, /hashOtpCode\(pepper, user\.id, "phone", code\)/);
  assert.doesNotMatch(signupService, /password_reset|pw_reset_/);
  const server = readFileSync(new URL("./whatsappResetServer.ts", import.meta.url), "utf8");
  assert.doesNotMatch(server, /phone_otp_(issue|verify|challenges)/);
  assert.match(server, /"pw_reset_issue"/);
  assert.match(server, /"pw_reset_verify"/);
});

// ── 4. the password rule ────────────────────────────────────────────────────
test("verify: the Settings / reset-page password rule, checked before anything is read", async () => {
  for (const [password, confirm] of [["", ""], ["short", "short"], [GOOD_PASSWORD, ""], [GOOD_PASSWORD, "Other123!"]]) {
    const w = world({ accounts: { "reset.ok@example.test": target } });
    const out = await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code: "123456", password, confirm });
    assert.equal(out.status, 400);
    assert.equal(out.body.code, "weak_password");
    assert.equal(out.body.error, validateNewPassword(password, confirm));
    assert.equal(w.calls.lookups.length, 0);
  }
  const page = readFileSync(new URL("../../app/reset-password/page.tsx", import.meta.url), "utf8");
  const forgot = readFileSync(new URL("../../app/forgot-password/page.tsx", import.meta.url), "utf8");
  assert.match(page, /resetPasswordProblem\(password, confirm, isAr\)/);
  assert.match(forgot, /resetPasswordProblem\(waPassword, waConfirm, isAr\)/, "the WhatsApp form uses the same rule");
});

// ── 5. the switch ───────────────────────────────────────────────────────────
test("the WhatsApp choice: on only with the switch, Zernio and the pepper; the page hides it otherwise", () => {
  assert.equal(whatsappResetAvailable({ switchOn: true, zernioReady: true, pepperReady: true }), true);
  for (const off of [
    { switchOn: false, zernioReady: true, pepperReady: true },
    { switchOn: true, zernioReady: false, pepperReady: true },
    { switchOn: true, zernioReady: true, pepperReady: false },
  ]) assert.equal(whatsappResetAvailable(off), false);
  assert.equal(whatsappFromStatus({ whatsapp: true }), true);
  for (const v of [null, undefined, {}, { whatsapp: "true" }, { whatsapp: 1 }, "x"]) assert.equal(whatsappFromStatus(v), false);

  const strip = (s: string) => s.replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
  const forgot = strip(readFileSync(new URL("../../app/forgot-password/page.tsx", import.meta.url), "utf8"));
  assert.match(forgot, /const \[waOn, setWaOn\] = useState\(false\)/, "off until the server says on");
  assert.match(forgot, /setWaOn\(whatsappFromStatus\(body\)\)/);
  assert.match(forgot, /if \(!cancelled\) setWaOn\(false\)/, "a failed status read keeps it off");
  const button = forgot.indexOf(": t.submitWhatsApp}");
  const guard = forgot.lastIndexOf("{waOn && (", button);
  assert.ok(guard > 0 && button > guard, "the WhatsApp button renders only under waOn");
  assert.match(forgot, /\{waOn \? t\.introChoice : t\.intro\}/, "off: today's intro");
  assert.match(forgot, /\{sending \? t\.sending : waOn \? t\.submitEmail : t\.submit\}/, "off: today's button");
  assert.doesNotMatch(forgot, /\d{3}[\s-]?\d{4}|masked/, "the page never shows a number");
});

test("routes: start answers before the background step; verify never signs in; status says only { whatsapp }", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const start = read("../../app/api/v1/auth/password-reset/whatsapp/start/route.ts");
  assert.match(start, /if \(answer\.background\) after\(answer\.background\)/);
  assert.match(start, /turnstilePolicy\(secret, process\.env\.NODE_ENV\)/);
  assert.match(start, /verifyTurnstileToken\(/);
  const verify = read("../../app/api/v1/auth/password-reset/whatsapp/verify/route.ts");
  for (const src of [start, verify]) {
    assert.doesNotMatch(src, /signInWithPassword|setSession|verifyOtp|createClient\(\)/, "no session is made here");
    assert.doesNotMatch(src, /console\.(log|info)\(/);
  }
  const status = read("../../app/api/v1/auth/password-reset/whatsapp/status/route.ts");
  assert.match(status, /NextResponse\.json\(\{ whatsapp: await whatsappResetIsAvailable\(\) \}/);
  const server = read("./whatsappResetServer.ts");
  assert.match(server, /auth\.admin\.updateUserById\(userId, \{ password \}\)/);
  assert.match(server, /"admin_revoke_user_sessions"/);
  assert.match(server, /actor_type: "user"/);
});

test("/login: the success line and the prefilled address come from sessionStorage, never the URL", () => {
  const login = readFileSync(new URL("../../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(login, /reason === LOGIN_RESET_REASON/);
  assert.match(login, /window\.sessionStorage\.getItem\(LOGIN_PREFILL_EMAIL_KEY\)/);
  assert.match(login, /window\.sessionStorage\.removeItem\(LOGIN_PREFILL_EMAIL_KEY\)/);
  assert.match(login, /LOGIN_RESET_DONE_AR/);
  const forgot = readFileSync(new URL("../../app/forgot-password/page.tsx", import.meta.url), "utf8");
  assert.match(forgot, /window\.sessionStorage\.setItem\(LOGIN_PREFILL_EMAIL_KEY, email\.trim\(\)\)/);
  assert.match(forgot, /router\.replace\(LOGIN_AFTER_RESET_PATH\)/);
  assert.doesNotMatch(forgot, /\/login\?[^"`]*email=/);
});

test("normalizeResetEmail: trims and lower-cases; refuses malformed", () => {
  assert.equal(normalizeResetEmail("  A.B@Example.TEST "), "a.b@example.test");
  for (const v of ["", "x", "a@b", "a b@c.d", null, 5, `${"a".repeat(250)}@b.cd`]) assert.equal(normalizeResetEmail(v), null);
});

test("proxy bucket: POST start / verify only, its own bucket (not the strict one shared with the contact form)", async () => {
  const { isPasswordResetWhatsAppRoute, isStrictRateLimitedRoute } = await import("../rateLimitRoutes.ts");
  const base = "/api/v1/auth/password-reset/whatsapp";
  assert.equal(isPasswordResetWhatsAppRoute("POST", `${base}/start`), true);
  assert.equal(isPasswordResetWhatsAppRoute("POST", `${base}/verify`), true);
  assert.equal(isPasswordResetWhatsAppRoute("GET", `${base}/status`), false);
  assert.equal(isPasswordResetWhatsAppRoute("GET", `${base}/start`), false);
  assert.equal(isPasswordResetWhatsAppRoute("POST", `${base}/start/x`), false);
  assert.equal(isStrictRateLimitedRoute("POST", `${base}/start`), false);
  const proxy = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
  assert.match(proxy, /rateLimiter\.check\("password-reset-whatsapp-ip", ip, PASSWORD_RESET_WHATSAPP_IP_RATE_LIMIT\)/);
  assert.match(proxy, /rateLimiter\.check\("password-reset-whatsapp", key, PASSWORD_RESET_WHATSAPP_RATE_LIMIT\)/);
});

test("verify: the database compares the number as profiles.phone holds it; the hash and the send use E.164", async () => {
  const stored: ResetTarget = { userId: USER, phone: PHONE, storedPhone: "+966500001701" };
  const w = world({ accounts: { "reset.ok@example.test": stored } });
  const code = await sentCode(w, "reset.ok@example.test");
  await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(w.calls.verified[0].phone, "+966500001701");
  assert.equal(w.calls.sent[0].e164, PHONE);
  const server = readFileSync(new URL("./whatsappResetServer.ts", import.meta.url), "utf8");
  assert.match(server, /return \{ userId: j\.user_id, phone: phone\.e164, storedPhone: stored \}/);
});

// ── review S2: the account's e-mail is told; a failed mail never fails the reset ──
test("verify: the «password changed» e-mail goes after the answer; a failed or throwing send changes nothing", async () => {
  for (const mode of ["failed", "throws"] as const) {
    const w = world({ accounts: { "reset.ok@example.test": target }, notify: mode });
    const code = await sentCode(w, "reset.ok@example.test");
    const out = await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
    assert.equal(out.status, 200, mode);
    assert.deepEqual(out.body, { ok: true });
    await assert.doesNotReject(async () => out.background?.());
    assert.deepEqual(w.calls.notices, [USER]);
    assert.equal(w.calls.passwords.length, 1, "the password stays set");
    assert.ok(w.calls.logs.some((l) => l.includes("notice e-mail")), `${mode}: logged`);
    for (const l of w.calls.logs) assert.ok(!l.includes("@") && !l.includes(PHONE), l);
  }
  const refused = world({ accounts: { "reset.ok@example.test": target } });
  const bad = await verifyWhatsAppReset(refused.deps, { email: "reset.ok@example.test", code: "000000", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(bad.background ?? null, null, "no e-mail on a refusal");
});

test("the notice e-mail: the brief's words, the /forgot-password link, no number", () => {
  assert.equal(PASSWORD_CHANGED_MAIL_BODY_AR, "تم تغيير كلمة مرور حسابك في نظامي عبر رمز واتساب. إن لم تكن أنت، فاطلب رابط إعادة التعيين على بريدك فورًا وتواصل معنا.");
  assert.doesNotMatch(PASSWORD_CHANGED_MAIL_BODY_AR, /\d/);
  const server = readFileSync(new URL("./whatsappResetServer.ts", import.meta.url), "utf8");
  assert.match(server, /const href = siteLink\(FORGOT_PASSWORD_PATH\)/);
  assert.match(server, /paragraphs: \[PASSWORD_CHANGED_MAIL_BODY_AR\]/);
  assert.match(server, /userIds: \[userId\]/);
  const notify = server.slice(server.indexOf("notify: async"), server.indexOf("log: (message)"));
  assert.doesNotMatch(notify, /phone|e164/i, "the mail never carries the number");
  const route = readFileSync(new URL("../../app/api/v1/auth/password-reset/whatsapp/verify/route.ts", import.meta.url), "utf8");
  assert.match(route, /if \(answer\.background\) after\(answer\.background\)/);
});

// ── review S3: what GoTrue would refuse is refused before the code is spent ──
test("verify: a password over bcrypt's 72 UTF-8 bytes is refused before the code is checked", async () => {
  const arabic = "ب".repeat(37); // 37 letters, 74 bytes — under any length rule, over bcrypt's
  const latin = "a".repeat(73);
  for (const pw of [arabic, latin]) {
    assert.equal(validateNewPassword(pw, pw), PASSWORD_TOO_LONG_AR);
    const w = world({ accounts: { "reset.ok@example.test": target } });
    const code = await sentCode(w, "reset.ok@example.test");
    const out = await verifyWhatsAppReset(w.deps, { email: "reset.ok@example.test", code, password: pw, confirm: pw });
    assert.equal(out.status, 400);
    assert.equal(out.body.code, "weak_password");
    assert.match(String(out.body.error), /^كلمة المرور طويلة جدًا/);
    assert.equal(w.calls.verified.length, 0, "the code is not spent");
    assert.equal(w.calls.passwords.length, 0);
  }
  const edge = "a".repeat(MAX_PASSWORD_BYTES);
  assert.equal(validateNewPassword(edge, edge), null, "exactly 72 bytes passes");
  const arabic36 = "ب".repeat(36);
  assert.equal(validateNewPassword(arabic36, arabic36), null, "36 Arabic letters = 72 bytes passes");
  assert.equal(resetPasswordProblem(latin, latin, false), "The password is too long. Choose a shorter one.");
  assert.equal(resetPasswordProblem(latin, latin, true), PASSWORD_TOO_LONG_AR);
});

test("status: the choice is off when the security check of start is not configured in production", () => {
  const server = readFileSync(new URL("./whatsappResetServer.ts", import.meta.url), "utf8");
  const fn = server.slice(server.indexOf("export async function whatsappResetIsAvailable"));
  assert.match(fn, /if \(turnstilePolicy\(process\.env\.TURNSTILE_SECRET_KEY, process\.env\.NODE_ENV\) === "misconfigured"\) return false;/);
});

// ── 6. batch l18 (LIVE-06): the confirmed mobile in place of the e-mail ─────
test("l18 start by mobile: the same 200 for every number; only the one account with it confirmed gets a code", async () => {
  const cases: Array<{ label: string; phone: string; opts: Parameters<typeof world>[0]; sends: boolean }> = [
    { label: "one account has it confirmed", phone: "0500001701", opts: { phones: { [PHONE]: target } }, sends: true },
    { label: "unknown number", phone: "0500009999", opts: { phones: {} }, sends: false },
    // pw_reset_target_by_phone answers null for a shared number, staff, banned, a recent change…
    { label: "shared by two accounts", phone: "+966500001701", opts: { phones: { [PHONE]: null } }, sends: false },
    { label: "over the per-number limit", phone: "966500001701", opts: { phones: { [PHONE]: target }, allow: false }, sends: false },
  ];
  const answers: string[] = [];
  for (const c of cases) {
    const { deps, calls } = world(c.opts);
    const out = await startWhatsAppReset(deps, { phone: c.phone });
    assert.equal(calls.phoneLookups.length + calls.lookups.length, 0, `${c.label}: nothing is read before the answer`);
    answers.push(JSON.stringify({ status: out.status, body: out.body }));
    if (out.background) await out.background();
    assert.equal(calls.sent.length, c.sends ? 1 : 0, `${c.label}: WhatsApp messages sent`);
    assert.equal(calls.lookups.length, 0, `${c.label}: a mobile never falls back to the e-mail lookup`);
    if (c.sends) assert.equal(calls.sent[0].e164, PHONE);
    for (const line of calls.logs) assert.ok(!line.includes("9665"), `${c.label}: a log line leaks the number`);
  }
  assert.equal(new Set(answers).size, 1);
  assert.deepEqual(JSON.parse(answers[0]), { status: 200, body: { ok: true, message: WHATSAPP_START_SENT_AR } });
});

test("l18 start by mobile: every spelling is one E.164 key for the limit and the lookup; a non-Saudi number is a 400", async () => {
  for (const spelling of ["0500001701", "500001701", "+966500001701", "00966500001701", "٠٥٠٠٠٠١٧٠١"]) {
    const { deps, calls } = world({ phones: { [PHONE]: target } });
    const out = await startWhatsAppReset(deps, { phone: spelling });
    assert.equal(out.status, 200, spelling);
    assert.deepEqual(calls.allowKeys, [`pwreset:start:phone:${PHONE}`], spelling);
    await out.background?.();
    assert.deepEqual(calls.phoneLookups, [PHONE], spelling);
  }
  for (const bad of ["+201001234567", "0112345678", "123", ""]) {
    const { deps, calls } = world({});
    const out = await startWhatsAppReset(deps, { phone: bad });
    assert.equal(out.status, 400, bad);
    assert.equal(out.body.code, "invalid_phone");
    assert.equal(out.background, null);
    assert.equal(calls.allowKeys.length, 0);
  }
  // The e-mail path keeps its l17 key.
  const mail = world({ accounts: { "reset.ok@example.test": target } });
  await startWhatsAppReset(mail.deps, { email: "reset.ok@example.test" });
  assert.deepEqual(mail.calls.allowKeys, ["pwreset:start:reset.ok@example.test"]);
});

test("l18 verify by mobile: the code sent to the number resets the password; unknown / shared numbers get the one refusal", async () => {
  const w = world({ phones: { [PHONE]: target } });
  const started = await startWhatsAppReset(w.deps, { phone: "0500001701" });
  await started.background?.();
  const code = w.calls.sent[0].code;
  const out = await verifyWhatsAppReset(w.deps, { phone: "0500001701", code, password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(out.status, 200);
  assert.deepEqual(w.calls.passwords, [{ userId: USER, password: GOOD_PASSWORD }]);
  assert.ok(w.calls.allowKeys.includes(`pwreset:verify:phone:${PHONE}`));

  const refusals: string[] = [];
  const phoneWorlds: Array<Record<string, ResetTarget | null>> = [{}, { [PHONE]: null }];
  for (const phones of phoneWorlds) {
    const x = world({ phones, stored: [hashOtpCode(PEPPER, USER, "password_reset", "123456")] });
    const r = await verifyWhatsAppReset(x.deps, { phone: PHONE, code: "123456", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
    refusals.push(JSON.stringify(r));
    assert.equal(x.calls.passwords.length, 0);
    assert.ok(x.calls.sleeps.length > 0, "held to the minimum time");
  }
  const wrong = world({ phones: { [PHONE]: target } });
  const rw = await verifyWhatsAppReset(wrong.deps, { phone: PHONE, code: "000000", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  refusals.push(JSON.stringify(rw));
  assert.equal(new Set(refusals).size, 1, "unknown, shared and a wrong code answer alike");
  assert.equal(JSON.parse(refusals[0]).body.error, WHATSAPP_CODE_INVALID_AR);

  const bad = await verifyWhatsAppReset(world({}).deps, { phone: "+201001234567", code: "123456", password: GOOD_PASSWORD, confirm: GOOD_PASSWORD });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "invalid_phone");
});

test("l18 routes and server: { phone } reaches the core; the server asks pw_reset_target_by_phone", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../../app/api/v1/auth/password-reset/whatsapp/start/route.ts"), /\{ email: body\.email, phone: body\.phone \}/);
  assert.match(read("../../app/api/v1/auth/password-reset/whatsapp/verify/route.ts"), /email: body\.email,\s*phone: body\.phone,/);
  const server = read("./whatsappResetServer.ts");
  assert.match(server, /svc\.rpc\("pw_reset_target_by_phone", \{ p_phone: e164 \}\)/);
  assert.match(server, /lookupByPhone: \(e164\) => lookupByPhone\(svc, e164\)/);
  // Both lookups go through the same suspension / freeze check.
  assert.equal((server.match(/return eligibleTarget\(svc, data\);/g) ?? []).length, 2);
});
