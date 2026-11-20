/**
 * The SMTP path of the one e-mail sender (batch l11-smtp: the operator's own
 * mailbox, no Resend for now). No network: the transport factory and the sink
 * check are injected; a fetch that records calls proves Resend is not reached.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  emailConfigured,
  emailProvider,
  sendEmail,
  smtpMessageId,
  smtpTransportOptions,
  SMTP_SEND_TIMEOUT_MS,
  type SmtpMail,
  type SmtpTransportFactory,
  type SmtpTransportOptions,
} from "./sendEmail.ts";
import { smtpPort, smtpSecure, smtpSettings } from "./emailConfig.ts";
import { resendEmailAdapter } from "../lawyerSignup/channels.ts";
import { readSignupProviderConfig } from "../lawyerSignup/providerConfig.ts";

const SMTP_ENV = {
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "mailbox-user-77",
  SMTP_PASS: "pw-SECRET-xyz",
  EMAIL_FROM: "noreply@example.test",
  EMAIL_FROM_NAME: "نظامي",
};
const RESEND_ENV = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "noreply@example.test" };
const NO_SINK = async () => ({ sink: false });
const MSG = { to: "user@example.test", subject: "عنوان", text: "نص" };

function fakeFetch() {
  const calls: string[] = [];
  const impl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

function fakeSmtp(opts: { fail?: unknown; info?: unknown; hang?: boolean; factoryThrows?: boolean } = {}) {
  const made: SmtpTransportOptions[] = [];
  const sent: SmtpMail[] = [];
  const factory: SmtpTransportFactory = (o) => {
    made.push(o);
    if (opts.factoryThrows) throw new Error(`cannot connect as ${o.auth.user}:${o.auth.pass}`);
    return {
      async sendMail(m: SmtpMail) {
        sent.push(m);
        if (opts.hang) return new Promise(() => undefined);
        if (opts.fail) throw opts.fail;
        return "info" in opts ? opts.info : { accepted: [m.to], rejected: [], response: "250 OK" };
      },
    };
  };
  return { factory, made, sent };
}

/** Everything written to console.error / warn / info while `fn` runs. */
async function captureLogs<T>(fn: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const orig = { error: console.error, warn: console.warn, info: console.info, log: console.log };
  const lines: string[] = [];
  const grab = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  console.error = grab;
  console.warn = grab;
  console.info = grab;
  console.log = grab;
  try {
    return { result: await fn(), logged: lines.join("\n") };
  } finally {
    Object.assign(console, orig);
  }
}

test("SMTP is chosen over Resend when both are set; Resend is never called", async () => {
  const f = fakeFetch();
  const s = fakeSmtp();
  const env = { ...RESEND_ENV, ...SMTP_ENV };
  assert.equal(emailProvider(env), "smtp");
  const r = await sendEmail(
    { ...MSG, html: "<p>نص</p>", tag: "hearing reminder!" },
    { env, fetchImpl: f.impl, sinkCheck: NO_SINK, createSmtpTransport: s.factory },
  );
  assert.equal(r, "sent");
  assert.equal(f.calls.length, 0, "no Resend request");
  assert.equal(s.sent.length, 1);
  const m = s.sent[0];
  assert.deepEqual(m.from, { name: "نظامي", address: "noreply@example.test" });
  assert.equal(m.to, "user@example.test");
  assert.equal(m.subject, "عنوان");
  assert.equal(m.text, "نص");
  assert.equal(m.html, "<p>نص</p>");
  assert.deepEqual(m.headers, { "X-Nzamy-Category": "hearing_reminder_" });
  assert.equal(m.messageId, undefined, "no Message-ID without an idempotency key");
  assert.equal(s.made[0].auth.user, "mailbox-user-77");
  assert.equal(s.made[0].auth.pass, "pw-SECRET-xyz");
  assert.equal(s.made[0].host, "smtp.example.test");
});

test("only Resend set → Resend exactly as before, no SMTP transport", async () => {
  const f = fakeFetch();
  const s = fakeSmtp();
  assert.equal(emailProvider(RESEND_ENV), "resend");
  const r = await sendEmail(MSG, { env: RESEND_ENV, fetchImpl: f.impl, sinkCheck: NO_SINK, createSmtpTransport: s.factory });
  assert.equal(r, "sent");
  assert.deepEqual(f.calls, ["https://api.resend.com/emails"]);
  assert.equal(s.made.length, 0);
});

test("neither set → 'unavailable', nothing attempted; a half-filled SMTP block is not SMTP", async () => {
  const half = [
    { SMTP_HOST: "smtp.example.test", SMTP_USER: "u", EMAIL_FROM: "a@example.test" }, // no password
    { SMTP_HOST: "smtp.example.test", SMTP_PASS: "p", EMAIL_FROM: "a@example.test" }, // no user
    { SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "p" }, // no sender
    { SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "a@example.test" }, // no host
    { SMTP_HOST: " ", SMTP_USER: "u", SMTP_PASS: "p", EMAIL_FROM: "a@example.test" },
  ];
  for (const env of [{}, ...half]) {
    const f = fakeFetch();
    const s = fakeSmtp();
    const r = await sendEmail(MSG, { env, fetchImpl: f.impl, sinkCheck: NO_SINK, createSmtpTransport: s.factory });
    assert.equal(r, "unavailable", JSON.stringify(env));
    assert.equal(emailConfigured(env), false);
    assert.equal(f.calls.length + s.made.length, 0);
  }
  // A half SMTP block next to a Resend key falls through to Resend.
  assert.equal(emailProvider({ ...RESEND_ENV, SMTP_HOST: "smtp.example.test", SMTP_USER: "u" }), "resend");
  assert.equal(emailConfigured(SMTP_ENV), true);
});

test("an SMTP failure → 'failed', never a throw; the log holds the code only — no address, user, password or reply text", async () => {
  const err = Object.assign(new Error("550 5.1.1 <someone.private@example.test> rejected for mailbox-user-77 pw-SECRET-xyz"), {
    code: "EENVELOPE",
    responseCode: 550,
    response: "550 5.1.1 <someone.private@example.test> rejected",
  });
  const cases = [fakeSmtp({ fail: err }), fakeSmtp({ factoryThrows: true }), fakeSmtp({ fail: "a string, not an Error" })];
  for (const s of cases) {
    const { result, logged } = await captureLogs(() =>
      sendEmail(
        { to: "someone.private@example.test", subject: "s", text: "SECRET-BODY 123456", idempotencyKey: "invite:abc" },
        { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: s.factory },
      ),
    );
    assert.equal(result, "failed");
    for (const secret of ["someone.private@example.test", "mailbox-user-77", "pw-SECRET-xyz", "SECRET-BODY", "rejected", "invite:abc"]) {
      assert.ok(!logged.includes(secret), `"${secret}" must not be logged`);
    }
    assert.ok(logged.includes("s***@e***.test"), "the masked address is logged");
  }
  const { logged } = await captureLogs(() =>
    sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: fakeSmtp({ fail: err }).factory }),
  );
  assert.match(logged, /EENVELOPE 550/);
});

test("SMTP: a recipient the server did not accept → 'failed'", async () => {
  for (const info of [{ accepted: [], rejected: ["user@example.test"] }, { accepted: ["other@example.test"] }, null, "250 OK"]) {
    const s = fakeSmtp({ info });
    const { result } = await captureLogs(() => sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: s.factory }));
    assert.equal(result, "failed", JSON.stringify(info));
  }
  const ok = fakeSmtp({ info: { accepted: [{ address: "USER@example.test" }], rejected: [] } });
  assert.equal(await sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: ok.factory }), "sent");
});

test("SMTP: a server that never answers is cut off → 'failed', no hang", async () => {
  const s = fakeSmtp({ hang: true });
  const started = Date.now();
  const { result, logged } = await captureLogs(() =>
    sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: s.factory, smtpTimeoutMs: 30 }),
  );
  assert.equal(result, "failed");
  assert.ok(Date.now() - started < 2000);
  assert.match(logged, /timed out/);
  assert.ok(SMTP_SEND_TIMEOUT_MS <= 20_000);
});

test("the test mail sink still applies on SMTP: sunk, and no transport is even made", async () => {
  const s = fakeSmtp();
  const seen: unknown[] = [];
  const { result } = await captureLogs(() =>
    sendEmail(
      { ...MSG, userIds: ["11111111-1111-4111-8111-111111111111"] },
      {
        env: SMTP_ENV,
        createSmtpTransport: s.factory,
        sinkCheck: async (i) => {
          seen.push(i);
          return { sink: true, reason: "test_account" };
        },
      },
    ),
  );
  assert.equal(result, "sunk");
  assert.equal(seen.length, 1);
  assert.equal(s.made.length + s.sent.length, 0);
});

test("port and TLS defaults: 587 + STARTTLS required; 465 implicit TLS; SMTP_SECURE overrides; timeouts ≤ 20 s", () => {
  const opts = (extra: Record<string, string>) => smtpTransportOptions(smtpSettings({ ...SMTP_ENV, ...extra })!);
  const d = opts({});
  assert.equal(d.port, 587);
  assert.equal(d.secure, false);
  assert.equal(d.requireTLS, true, "the password never goes over a clear connection");
  assert.ok(d.connectionTimeout <= 20_000 && d.greetingTimeout <= 20_000 && d.socketTimeout <= 20_000);
  assert.equal(d.disableFileAccess, true);
  assert.equal(d.disableUrlAccess, true);
  const tls = opts({ SMTP_PORT: "465" });
  assert.equal(tls.port, 465);
  assert.equal(tls.secure, true);
  assert.equal(tls.requireTLS, false);
  assert.equal(opts({ SMTP_PORT: "465", SMTP_SECURE: "false" }).secure, false);
  assert.equal(opts({ SMTP_PORT: "587", SMTP_SECURE: "true" }).secure, true);
  assert.equal(opts({ SMTP_PORT: "2525" }).port, 2525);
  for (const bad of ["", "abc", "0", "70000", "58 7", "-1"]) assert.equal(smtpPort({ SMTP_PORT: bad }), 587, bad);
  assert.equal(smtpSecure({ SMTP_SECURE: "maybe" }, 465), true);
  assert.equal(smtpSecure({ SMTP_SECURE: "maybe" }, 587), false);
});

test("sender fallbacks: EMAIL_FROM / EMAIL_FROM_NAME first, else the Supabase SMTP_ADMIN_EMAIL / SMTP_SENDER_NAME", async () => {
  const base = { SMTP_HOST: "smtp.example.test", SMTP_USER: "u", SMTP_PASS: "p" };
  const supa = { ...base, SMTP_ADMIN_EMAIL: "admin@example.test", SMTP_SENDER_NAME: "منصة نظامي" };
  assert.equal(emailProvider(supa), "smtp", "the Supabase names alone are enough");
  const s1 = fakeSmtp();
  assert.equal(await sendEmail(MSG, { env: supa, sinkCheck: NO_SINK, createSmtpTransport: s1.factory }), "sent");
  assert.deepEqual(s1.sent[0].from, { name: "منصة نظامي", address: "admin@example.test" });

  const s2 = fakeSmtp();
  const own = { ...supa, EMAIL_FROM: "noreply@example.test", EMAIL_FROM_NAME: 'نظامي" <x@y.z>\r\n' };
  await sendEmail(MSG, { env: own, sinkCheck: NO_SINK, createSmtpTransport: s2.factory });
  assert.deepEqual(s2.sent[0].from, { name: "نظامي x@y.z", address: "noreply@example.test" }, "name cleaned, EMAIL_* preferred");

  const s3 = fakeSmtp();
  await sendEmail(MSG, { env: { ...base, EMAIL_FROM: "noreply@example.test" }, sinkCheck: NO_SINK, createSmtpTransport: s3.factory });
  assert.equal(s3.sent[0].from, "noreply@example.test", "no name → the bare address");

  // The Supabase fallbacks never make Resend configured: Resend still needs EMAIL_FROM.
  assert.equal(emailProvider({ RESEND_API_KEY: "k", SMTP_ADMIN_EMAIL: "admin@example.test" }), null);
});

test("idempotency key → a stable hashed Message-ID on the sender's domain; the key never appears", async () => {
  const s = fakeSmtp();
  const deps = { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: s.factory };
  await sendEmail({ ...MSG, idempotencyKey: "hearing:4f1c:2026-11-21" }, deps);
  await sendEmail({ ...MSG, idempotencyKey: "hearing:4f1c:2026-11-21" }, deps);
  await sendEmail({ ...MSG, to: "other@example.test", idempotencyKey: "hearing:4f1c:2026-11-21" }, deps);
  const [a, b, c] = s.sent.map((m) => m.messageId);
  assert.match(a!, /^<[0-9a-f]{40}@example\.test>$/);
  assert.equal(a, b, "a retry carries the same Message-ID");
  assert.notEqual(a, c, "another recipient gets another Message-ID");
  assert.ok(!a!.includes("4f1c") && !a!.includes("hearing"));
  assert.equal(await smtpMessageId("k", "x@y.test", "no-at-sign"), await smtpMessageId("k", "X@Y.test ", "no-at-sign"));
  assert.match(await smtpMessageId("k", "x@y.test", "no-at-sign"), /@localhost>$/);
});

test("one transport per process for the same settings; new settings → a new transport", async () => {
  const s = fakeSmtp();
  const deps = { sinkCheck: NO_SINK, createSmtpTransport: s.factory };
  await sendEmail(MSG, { ...deps, env: SMTP_ENV });
  await sendEmail(MSG, { ...deps, env: SMTP_ENV });
  assert.equal(s.made.length, 1);
  assert.equal(s.sent.length, 2);
  await sendEmail(MSG, { ...deps, env: { ...SMTP_ENV, SMTP_PORT: "465" } });
  assert.equal(s.made.length, 2);
  // A factory that failed is not kept: the next send tries again.
  const bad = fakeSmtp({ factoryThrows: true });
  await captureLogs(() => sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: bad.factory }));
  await captureLogs(() => sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: bad.factory }));
  assert.equal(bad.made.length, 2);
});

test("the lawyer-signup e-mail code follows the same rule: SMTP alone is enough", async () => {
  const pepper = "p".repeat(40);
  assert.equal(readSignupProviderConfig({ ...SMTP_ENV, LAWYER_OTP_PEPPER: pepper, LAWYER_OTP_EMAIL: "on" }).email, true);
  assert.equal(readSignupProviderConfig({ ...SMTP_ENV, LAWYER_OTP_PEPPER: pepper }).email, false, "the switch is still needed");
  assert.equal(readSignupProviderConfig({ SMTP_HOST: "h", LAWYER_OTP_PEPPER: pepper, LAWYER_OTP_EMAIL: "on" }).email, false);
  // The adapter itself only answers 'unavailable' without any provider.
  const f = fakeFetch();
  assert.equal(await resendEmailAdapter({}, { email: true }, f.impl).sendOtp("u@example.test", "123456", "ar"), "unavailable");
  assert.equal(f.calls.length, 0);
});
