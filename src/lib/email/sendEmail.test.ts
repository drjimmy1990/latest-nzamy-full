import test from "node:test";
import assert from "node:assert/strict";
import {
  emailConfigured,
  escapeHtml,
  fromHeader,
  isPlainEmail,
  maskEmail,
  renderEmailAr,
  REMINDER_FOOTER_AR,
  RESEND_ENDPOINT,
  sanitizeTag,
  sendEmail,
  siteLink,
} from "./sendEmail.ts";
import { resendEmailAdapter } from "../lawyerSignup/channels.ts";

const ENV = { RESEND_API_KEY: "re_test_key", EMAIL_FROM: "noreply@example.test", EMAIL_FROM_NAME: "نظامي" };

type Call = { url: string; init: RequestInit };
function fakeFetch(status = 200, opts: { throws?: boolean } = {}) {
  const calls: Call[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (opts.throws) throw new Error("network down");
    return new Response(JSON.stringify({ id: "x", echo: "user@example.test" }), { status });
  }) as typeof fetch;
  return { impl, calls };
}

/** Collects console.error output while `fn` runs. */
async function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; logged: string }> {
  const orig = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(" ")); };
  try {
    const result = await fn();
    return { result, logged: lines.join("\n") };
  } finally {
    console.error = orig;
  }
}

test("no key or no sender → 'unavailable' and no request", async () => {
  for (const env of [{}, { RESEND_API_KEY: "k" }, { EMAIL_FROM: "a@b.test" }, { RESEND_API_KEY: " ", EMAIL_FROM: "a@b.test" }]) {
    const f = fakeFetch();
    assert.equal(await sendEmail({ to: "u@example.test", subject: "s", text: "t" }, { env, fetchImpl: f.impl }), "unavailable");
    assert.equal(f.calls.length, 0);
    assert.equal(emailConfigured(env), false);
  }
  assert.equal(emailConfigured(ENV), true);
});

test("a send posts one Resend request with from, to, subject, text, html, tag and idempotency key", async () => {
  const f = fakeFetch(200);
  const r = await sendEmail(
    { to: " user@example.test ", subject: "عنوان\r\nBcc: x@y.z", text: "نص", html: "<p>نص</p>", tag: "hearing reminder!", idempotencyKey: "k-1" },
    { env: ENV, fetchImpl: f.impl },
  );
  assert.equal(r, "sent");
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, RESEND_ENDPOINT);
  const headers = f.calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer re_test_key");
  assert.equal(headers["Idempotency-Key"], "k-1");
  const body = JSON.parse(String(f.calls[0].init.body));
  assert.equal(body.from, "نظامي <noreply@example.test>");
  assert.deepEqual(body.to, ["user@example.test"]);
  assert.equal(body.subject, "عنوان Bcc: x@y.z", "CR/LF cannot open a new header");
  assert.equal(body.text, "نص");
  assert.equal(body.html, "<p>نص</p>");
  assert.deepEqual(body.tags, [{ name: "category", value: "hearing_reminder_" }]);
  assert.ok(f.calls[0].init.signal, "the request has a timeout");
});

test("a non-2xx answer or a network error → 'failed', never a throw; the log masks the address and holds no body", async () => {
  for (const f of [fakeFetch(422), fakeFetch(500), fakeFetch(200, { throws: true })]) {
    const { result, logged } = await captureErrors(() =>
      sendEmail({ to: "someone.private@example.test", subject: "s", text: "SECRET-BODY 123456" }, { env: ENV, fetchImpl: f.impl }),
    );
    assert.equal(result, "failed");
    assert.ok(!logged.includes("someone.private@example.test"), "full address never logged");
    assert.ok(!logged.includes("SECRET-BODY"), "body never logged");
    assert.ok(!logged.includes("user@example.test"), "the response body (which may echo addresses) is not logged");
    assert.ok(logged.includes("s***@e***.test"));
  }
});

test("an unusable address or an empty message → 'failed' without a request", async () => {
  for (const to of ["", "no-at-sign", "a@b", "a@b.test, c@d.test", "a@b.test\r\nBcc: c@d.test", "<a@b.test>"]) {
    const f = fakeFetch();
    const { result } = await captureErrors(() => sendEmail({ to, subject: "s", text: "t" }, { env: ENV, fetchImpl: f.impl }));
    assert.equal(result, "failed", to);
    assert.equal(f.calls.length, 0, to);
  }
  const f = fakeFetch();
  const { result } = await captureErrors(() => sendEmail({ to: "a@b.test", subject: " ", text: "t" }, { env: ENV, fetchImpl: f.impl }));
  assert.equal(result, "failed");
  assert.equal(f.calls.length, 0);
});

test("helpers: mask, tag, from header, address check", () => {
  assert.equal(maskEmail("mohammed@nezamy.sa"), "m***@n***.sa");
  assert.equal(maskEmail("x"), "(no address)");
  assert.equal(maskEmail(undefined), "(no address)");
  assert.equal(sanitizeTag("library_7d"), "library_7d");
  assert.equal(sanitizeTag("تذكير"), "_____");
  assert.equal(fromHeader({ EMAIL_FROM: "a@b.test" }), "a@b.test");
  assert.equal(fromHeader({ EMAIL_FROM: "a@b.test", EMAIL_FROM_NAME: 'Evil" <x@y.z>\r\n' }), "Evil x@y.z <a@b.test>");
  assert.equal(isPlainEmail("a.b+c@sub.example.sa"), true);
  assert.equal(isPlainEmail("a b@example.sa"), false);
});

test("the RTL template escapes every value, links only https, and has a matching plain text", () => {
  const { html, text } = renderEmailAr({
    heading: "تذكير <b>",
    paragraphs: ["جلسة \"غداً\" & <script>alert(1)</script>"],
    details: [["المحكمة", "المحكمة <العامة>"], ["المكان", ""], ["الوقت", null]],
    action: { label: "افتح", href: "https://nezamy.sa/dashboard/lawyer/hearings" },
    footer: REMINDER_FOOTER_AR,
  });
  assert.match(html, /<html lang="ar" dir="rtl">/);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("المحكمة &lt;العامة&gt;"));
  assert.ok(!html.includes("المكان"), "an empty detail is dropped");
  assert.ok(!/<img|https?:\/\/(?!nezamy\.sa)/.test(html), "no remote image or other remote resource");
  assert.match(html, /role="presentation"/);
  assert.ok(text.includes("المحكمة: المحكمة <العامة>"));
  assert.ok(text.includes("افتح: https://nezamy.sa/dashboard/lawyer/hearings"));
  assert.ok(text.includes(REMINDER_FOOTER_AR[0]));

  const noLink = renderEmailAr({ heading: "h", paragraphs: ["p"], action: { label: "x", href: "javascript:alert(1)" } });
  assert.ok(!noLink.html.includes("javascript:"));
  assert.ok(!noLink.text.includes("javascript:"));
  assert.equal(escapeHtml(`'"&<>`), "&#39;&quot;&amp;&lt;&gt;");
});

test("siteLink: only with an https NEXT_PUBLIC_SITE_URL", () => {
  assert.equal(siteLink("/laws/subscribe", { NEXT_PUBLIC_SITE_URL: "https://nezamy.sa/" }), "https://nezamy.sa/laws/subscribe");
  assert.equal(siteLink("/x", { NEXT_PUBLIC_SITE_URL: "http://nezamy.sa" }), null);
  assert.equal(siteLink("/x", {}), null);
});

// ── the signup e-mail code goes through the shared sender ─────────────────────
test("resendEmailAdapter: its LAWYER_OTP_EMAIL gate still holds, and a send goes through sendEmail", async () => {
  const off = fakeFetch();
  assert.equal(await resendEmailAdapter(ENV, { email: false }, off.impl).sendOtp("u@example.test", "123456", "ar"), "unavailable");
  assert.equal(off.calls.length, 0);
  const noKey = fakeFetch();
  assert.equal(await resendEmailAdapter({ EMAIL_FROM: "a@b.test" }, { email: true }, noKey.impl).sendOtp("u@example.test", "123456", "ar"), "unavailable");
  assert.equal(noKey.calls.length, 0);

  const f = fakeFetch(200);
  assert.equal(await resendEmailAdapter(ENV, { email: true }, f.impl).sendOtp("u@example.test", "123456", "ar"), "sent");
  const body = JSON.parse(String(f.calls[0].init.body));
  assert.equal(body.subject, "رمز تأكيد بريدك في منصة نظامي");
  assert.ok(String(body.text).includes("123456"));
  assert.deepEqual(body.tags, [{ name: "category", value: "lawyer_signup_otp" }]);

  const bad = fakeFetch(500);
  const { result, logged } = await captureErrors(() => resendEmailAdapter(ENV, { email: true }, bad.impl).sendOtp("u@example.test", "654321", "en"));
  assert.equal(result, "failed");
  assert.ok(!logged.includes("654321"), "the code is never logged");
});
