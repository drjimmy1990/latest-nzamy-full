/**
 * Batch l19 (LIVE-18): sendEmailDetailed's failure stage + codes, the admin
 * diagnostic of the e-mail variables, the Arabic explanation of a test send,
 * and the wiring of «اختبار إرسال بريد». No network: transports and fetch are
 * injected.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sendEmail, sendEmailDetailed, type SmtpTransportFactory } from "./sendEmail.ts";
import { EMAIL_ENV_NAMES, emailEnvReport, explainEmailSend } from "./emailDiagnostics.ts";

const SMTP_ENV = {
  SMTP_HOST: "smtp.example.test",
  SMTP_USER: "mailbox-user-77",
  SMTP_PASS: "pw-SECRET-xyz",
  EMAIL_FROM: "noreply@example.test",
  EMAIL_FROM_NAME: "نظامي",
};
const NO_SINK = async () => ({ sink: false });
const MSG = { to: "admin@example.test", subject: "رسالة اختبار", text: "نص" };

function failingSmtp(err: unknown, where: "factory" | "send" = "send"): SmtpTransportFactory {
  return () => {
    if (where === "factory") throw err;
    return {
      async sendMail() {
        throw err;
      },
    };
  };
}

const smtpErr = (code: string, responseCode?: number, originalCode?: string) =>
  Object.assign(new Error(`server said something with ${SMTP_ENV.SMTP_USER}`), {
    code,
    ...(responseCode ? { responseCode } : {}),
    ...(originalCode ? { originalCode } : {}),
  });

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const orig = console.error;
  console.error = () => undefined;
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
}

// ── emailEnvReport ───────────────────────────────────────────────────────────

test("env report: full SMTP → provider smtp, nothing missing, no secret value anywhere", () => {
  const r = emailEnvReport(SMTP_ENV);
  assert.equal(r.provider, "smtp");
  assert.deepEqual(r.smtpMissing, []);
  assert.equal(r.host, "smtp.example.test");
  assert.equal(r.port, 587);
  assert.equal(r.security, "starttls");
  assert.equal(r.senderAddress, "noreply@example.test");
  assert.equal(r.senderName, "نظامي");
  assert.equal(r.set.SMTP_PASS, true);
  const json = JSON.stringify(r);
  assert.ok(!json.includes(SMTP_ENV.SMTP_PASS), "the password never leaves");
  assert.ok(!json.includes(SMTP_ENV.SMTP_USER), "the mailbox user never leaves");
});

test("env report: a half-filled SMTP block names what is missing and sends nothing", () => {
  const r = emailEnvReport({ SMTP_HOST: "smtp.example.test", SMTP_USER: "u" });
  assert.equal(r.provider, null);
  assert.deepEqual(r.smtpMissing, ["SMTP_PASS", "EMAIL_FROM"]);
});

test("env report: the Supabase names SMTP_ADMIN_EMAIL / SMTP_SENDER_NAME are accepted; 465 = implicit TLS", () => {
  const r = emailEnvReport({
    SMTP_HOST: "h.example.test",
    SMTP_USER: "u",
    SMTP_PASS: "p",
    SMTP_PORT: "465",
    SMTP_ADMIN_EMAIL: "no-reply@example.test",
    SMTP_SENDER_NAME: "نظامي",
  });
  assert.equal(r.provider, "smtp");
  assert.equal(r.senderAddress, "no-reply@example.test");
  assert.equal(r.senderName, "نظامي");
  assert.equal(r.security, "tls");
  assert.equal(r.set.EMAIL_FROM, false);
  assert.equal(r.set.SMTP_ADMIN_EMAIL, true);
});

test("env report: lists exactly the names emailConfig.ts reads", () => {
  const src = readFileSync(new URL("./emailConfig.ts", import.meta.url), "utf8");
  const read = new Set([...src.matchAll(/env\.([A-Z_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...read].sort(), [...EMAIL_ENV_NAMES].sort());
});

// ── sendEmailDetailed ────────────────────────────────────────────────────────

test("detailed: sent / unavailable / sunk, and sendEmail still answers the plain result", async () => {
  const ok: SmtpTransportFactory = () => ({ sendMail: async (m) => ({ accepted: [m.to], rejected: [] }) });
  assert.deepEqual(await sendEmailDetailed(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: ok }), {
    result: "sent",
    provider: "smtp",
    failure: null,
  });
  assert.equal(await sendEmail(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: ok }), "sent");
  assert.deepEqual(await sendEmailDetailed(MSG, { env: {} }), { result: "unavailable", provider: null, failure: null });
  const sunk = await sendEmailDetailed(MSG, { env: SMTP_ENV, sinkCheck: async () => ({ sink: true }), createSmtpTransport: ok });
  assert.equal(sunk.result, "sunk");
  assert.equal(explainEmailSend(sunk).errorClass, "sunk");
});

test("detailed: nodemailer that cannot be loaded fails at the transport stage → «module»", async () => {
  const d = await quiet(() =>
    sendEmailDetailed(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: failingSmtp(smtpErr("MODULE_NOT_FOUND"), "factory") }),
  );
  assert.equal(d.result, "failed");
  assert.deepEqual(d.failure, { stage: "transport", code: "MODULE_NOT_FOUND", originalCode: null, responseCode: null, httpStatus: null });
  assert.equal(explainEmailSend(d).errorClass, "module");
});

const CASES: Array<[string, unknown, string]> = [
  ["EAUTH 535", smtpErr("EAUTH", 535), "auth"],
  ["ECONNECTION", smtpErr("ECONNECTION"), "connect"],
  ["ETIMEDOUT", smtpErr("ETIMEDOUT"), "connect"],
  ["EDNS", smtpErr("EDNS"), "dns"],
  ["ESOCKET", smtpErr("ESOCKET"), "tls"],
  // nodemailer 10 keeps the system code apart (originalCode)
  ["ESOCKET / ECONNREFUSED", smtpErr("ESOCKET", undefined, "ECONNREFUSED"), "connect"],
  ["ESOCKET / ENOTFOUND", smtpErr("ESOCKET", undefined, "ENOTFOUND"), "dns"],
  ["ESOCKET / ERR_SSL_WRONG_VERSION_NUMBER", smtpErr("ESOCKET", undefined, "ERR_SSL_WRONG_VERSION_NUMBER"), "tls"],
  ["ECONNECTION / ETIMEDOUT", smtpErr("ECONNECTION", undefined, "ETIMEDOUT"), "connect"],
  ["ETLS", smtpErr("ETLS"), "tls"],
  ["EENVELOPE 553", smtpErr("EENVELOPE", 553), "refused"],
  ["EMESSAGE 451", smtpErr("EMESSAGE", 451), "temporary"],
  ["no code at all", new Error("x"), "unexpected"],
];
for (const [label, err, cls] of CASES) {
  test(`detailed: SMTP ${label} → stage send, class ${cls}`, async () => {
    const d = await quiet(() => sendEmailDetailed(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: failingSmtp(err) }));
    assert.equal(d.result, "failed");
    assert.equal(d.failure?.stage, "send");
    const e = explainEmailSend(d);
    assert.equal(e.errorClass, cls);
    assert.equal(e.ok, false);
    for (const secret of [SMTP_ENV.SMTP_PASS, SMTP_ENV.SMTP_USER, SMTP_ENV.SMTP_HOST, MSG.to]) {
      assert.ok(!e.messageAr.includes(secret), `the explanation never repeats ${secret}`);
      assert.ok(!JSON.stringify(d).includes(secret), `the detail never carries ${secret}`);
    }
  });
}

test("detailed: a hung server → «timeout»; a recipient not accepted → «refused»", async () => {
  const hang: SmtpTransportFactory = () => ({ sendMail: () => new Promise(() => undefined) });
  const t = await quiet(() => sendEmailDetailed(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: hang, smtpTimeoutMs: 20 }));
  assert.equal(t.failure?.stage, "timeout");
  assert.equal(explainEmailSend(t).errorClass, "timeout");
  const notAccepted: SmtpTransportFactory = () => ({ sendMail: async (m) => ({ accepted: [], rejected: [m.to] }) });
  const r = await quiet(() => sendEmailDetailed(MSG, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: notAccepted }));
  assert.equal(r.failure?.stage, "rejected");
  assert.equal(explainEmailSend(r).errorClass, "refused");
});

test("detailed: a bad recipient is «input», nothing attempted", async () => {
  let made = 0;
  const f: SmtpTransportFactory = () => {
    made++;
    return { sendMail: async () => ({}) };
  };
  const d = await quiet(() => sendEmailDetailed({ ...MSG, to: "not an address" }, { env: SMTP_ENV, sinkCheck: NO_SINK, createSmtpTransport: f }));
  assert.equal(d.failure?.stage, "input");
  assert.equal(made, 0);
  assert.equal(explainEmailSend(d).errorClass, "bad_recipient");
});

test("detailed: Resend statuses → http stage (401 auth, 422 refused, 500 provider)", async () => {
  const env = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "noreply@example.test" };
  for (const [status, cls] of [[401, "auth"], [422, "refused"], [500, "provider"]] as const) {
    const fetchImpl = (async () => new Response("{}", { status })) as typeof fetch;
    const d = await quiet(() => sendEmailDetailed(MSG, { env, sinkCheck: NO_SINK, fetchImpl }));
    assert.deepEqual(d.failure, { stage: "http", code: null, originalCode: null, responseCode: null, httpStatus: status });
    assert.equal(explainEmailSend(d).errorClass, cls);
  }
});

test("explain: «not configured» names the missing variables", () => {
  const e = explainEmailSend({ result: "unavailable", provider: null, failure: null }, ["SMTP_PASS", "EMAIL_FROM"]);
  assert.equal(e.errorClass, "not_configured");
  assert.match(e.messageAr, /SMTP_PASS، EMAIL_FROM/);
});

// ── wiring ───────────────────────────────────────────────────────────────────

const root = new URL("../../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");

test("wiring: the test send is super-admin only, rate-limited, audited, and mails the account's own address", () => {
  const src = read("src/app/api/v1/admin/email/test-send/route.ts");
  assert.match(src, /requireStaff\("settings\.write"\)/);
  assert.match(src, /rateLimit\(`admin-email-test:\$\{gate\.userId\}`/);
  assert.match(src, /getUserById\(gate\.userId\)/);
  assert.match(src, /logAdminAction\(/);
  assert.match(src, /sendEmailDetailed\(/);
  assert.doesNotMatch(src, /request\.json|req\.json|await request/, "the address never comes from the request");
  const diag = read("src/app/api/v1/admin/email/route.ts");
  assert.match(diag, /requireStaff\("read"\)/);
});

test("wiring: the card fetches only (no sender in the browser bundle) and sits on the settings page", () => {
  const card = read("src/app/dashboard/admin/settings/_components/EmailTestCard.tsx");
  assert.doesNotMatch(card, /from\s+["']@\/lib\/email\//);
  assert.match(card, /\/api\/v1\/admin\/email\/test-send/);
  assert.match(read("src/app/dashboard/admin/settings/page.tsx"), /<EmailTestCard \/>/);
});

test("wiring: nodemailer is loaded from node_modules at run time (serverExternalPackages)", () => {
  assert.match(read("next.config.ts"), /serverExternalPackages:\s*\[[^\]]*"nodemailer"/);
});
