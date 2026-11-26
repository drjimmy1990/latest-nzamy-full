/**
 * whatsappReset.test.ts — batch l17, «نسيت كلمة المرور» by a WhatsApp code.
 * Runs the real core (./whatsappReset.ts) with fakes for every outside
 * effect, plus source contracts for the routes, the page and /login.
 *
 *   1. start answers the same (status, body, nothing account-dependent before
 *      the answer) for an unknown address, no confirmed mobile, staff,
 *      suspended / frozen, a database limit, a per-address limit and a real
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
import { validateNewPassword } from "../../app/settings/components/tabs/_securityFields.ts";

const PEPPER = "p".repeat(40);
const USER = "00000000-0000-0000-0000-0000000017a1";
const PHONE = "+966500001701";
const GOOD_PASSWORD = "NewPass123!";

type Calls = {
  lookups: string[];
  issued: Array<{ userId: string; targetHash: string; codeHash: string }>;
  sent: Array<{ e164: string; code: string }>;
  verified: Array<{ codeHash: string }>;
  passwords: Array<{ userId: string; password: string }>;
  revoked: string[];
  audits: number;
  logs: string[];
  sleeps: number[];
};

/** A fake world: `accounts` maps an address to its target (null = must not receive a code). */
function world(opts: {
  accounts?: Record<string, ResetTarget | null>;
  available?: boolean;
  pepper?: string | undefined;
  captcha?: "ok" | "failed" | "misconfigured";
  issueRefused?: boolean;
  allow?: boolean;
  /** Codes stored by issue(): their hashes, as the database would keep them. */
  stored?: string[];
  setPasswordFails?: boolean;
}) {
  const calls: Calls = { lookups: [], issued: [], sent: [], verified: [], passwords: [], revoked: [], audits: 0, logs: [], sleeps: [] };
  const stored = opts.stored ?? [];
  let clock = 1_000_000;
  const deps: ResetDeps = {
    pepperRaw: "pepper" in opts ? opts.pepper : PEPPER,
    available: async () => opts.available ?? true,
    allow: () => opts.allow ?? true,
    captcha: async () => opts.captcha ?? "ok",
    lookup: async (email) => {
      calls.lookups.push(email);
      return opts.accounts?.[email] ?? null;
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
    verify: async ({ codeHash }) => {
      calls.verified.push({ codeHash });
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
    { label: "the per-address limit of this process", email: "reset.ok@example.test", opts: { accounts: { "reset.ok@example.test": target }, allow: false }, sends: false },
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
  assert.deepEqual(ok, { status: 200, body: { ok: true } });
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
