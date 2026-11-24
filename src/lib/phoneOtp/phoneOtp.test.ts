import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readZernioConfig,
  sendWhatsAppCode,
  zernioParticipantId,
  ZERNIO_SEND_URL,
} from "./zernioWhatsApp.ts";
import {
  isPhoneGatedApiPath,
  maskSaudiMobile,
  mayBeHeld,
  safePhoneNext,
  signupPhoneOtpFrom,
  signupPhoneOtpIssue,
} from "./phoneOtpRules.ts";

// Synthetic values only.
const ENV = { ZERNIO_API_KEY: "test-key", ZERNIO_WHATSAPP_ACCOUNT_ID: "acct-test" };
const PHONE = "+966500000000";

type Call = { url: string; init: { method: string; headers: Record<string, string>; body: string } };

function fakeFetch(status: number, body: unknown, calls: Call[]) {
  return async (url: string, init: { method: string; headers: Record<string, string>; body: string }) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
}

test("zernio: the request body — participantId without +, template params [code, code], language ar", async () => {
  const calls: Call[] = [];
  const out = await sendWhatsAppCode({
    e164: PHONE,
    code: "012345",
    env: ENV,
    fetchImpl: fakeFetch(201, { success: true, data: { messageId: "m" } }, calls),
  });
  assert.deepEqual(out, { result: "sent", httpStatus: 201 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ZERNIO_SEND_URL);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    accountId: "acct-test",
    participantId: "966500000000",
    templateName: "nezamy_otp",
    templateLanguage: "ar",
    templateParams: ["012345", "012345"],
  });
});

test("zernio: optional template name / language from the environment", async () => {
  const calls: Call[] = [];
  await sendWhatsAppCode({
    e164: PHONE,
    code: "111111",
    env: { ...ENV, ZERNIO_OTP_TEMPLATE: "other_tpl", ZERNIO_OTP_TEMPLATE_LANG: "en" },
    fetchImpl: fakeFetch(200, {}, calls),
  });
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.templateName, "other_tpl");
  assert.equal(body.templateLanguage, "en");
});

test("zernio: missing key or account → unavailable, nothing sent", async () => {
  for (const env of [{}, { ZERNIO_API_KEY: "k" }, { ZERNIO_WHATSAPP_ACCOUNT_ID: "a" }, { ZERNIO_API_KEY: " ", ZERNIO_WHATSAPP_ACCOUNT_ID: "a" }]) {
    const calls: Call[] = [];
    const out = await sendWhatsAppCode({ e164: PHONE, code: "123456", env, fetchImpl: fakeFetch(201, {}, calls) });
    assert.deepEqual(out, { result: "unavailable", httpStatus: null });
    assert.equal(calls.length, 0);
  }
  assert.equal(readZernioConfig({}).ready, false);
});

test("zernio: non-2xx, success:false, a thrown fetch → failed (HTTP status kept)", async () => {
  assert.deepEqual(await sendWhatsAppCode({ e164: PHONE, code: "123456", env: ENV, fetchImpl: fakeFetch(401, {}, []) }), {
    result: "failed",
    httpStatus: 401,
  });
  assert.deepEqual(await sendWhatsAppCode({ e164: PHONE, code: "123456", env: ENV, fetchImpl: fakeFetch(200, { success: false }, []) }), {
    result: "failed",
    httpStatus: 200,
  });
  const throwing = async () => {
    throw new Error("network");
  };
  assert.deepEqual(await sendWhatsAppCode({ e164: PHONE, code: "123456", env: ENV, fetchImpl: throwing }), {
    result: "failed",
    httpStatus: null,
  });
});

test("zernio: a non-Saudi number or a malformed code is never sent", async () => {
  const calls: Call[] = [];
  for (const [e164, code] of [["+201000000000", "123456"], ["0500000000", "123456"], [PHONE, "12345"], [PHONE, "abcdef"]]) {
    const out = await sendWhatsAppCode({ e164, code, env: ENV, fetchImpl: fakeFetch(201, {}, calls) });
    assert.equal(out.result, "failed");
  }
  assert.equal(calls.length, 0);
  assert.equal(zernioParticipantId("+966512345678"), "966512345678");
  assert.equal(zernioParticipantId("966512345678"), null);
});

test("rules: the setting is read defensively", () => {
  assert.deepEqual(signupPhoneOtpFrom(null), { enabled: false, enabledAt: null });
  assert.deepEqual(signupPhoneOtpFrom({ enabled: "true" }), { enabled: false, enabledAt: null });
  assert.deepEqual(signupPhoneOtpFrom({ enabled: true, enabled_at: "nope" }), { enabled: true, enabledAt: null });
  assert.deepEqual(signupPhoneOtpFrom({ enabled: true, enabled_at: "2026-12-01T00:00:00Z" }), {
    enabled: true,
    enabledAt: "2026-12-01T00:00:00Z",
  });
  assert.equal(signupPhoneOtpIssue({ enabled: true }), null);
  assert.equal(signupPhoneOtpIssue({ enabled: false, enabled_at: null }), null);
  assert.notEqual(signupPhoneOtpIssue({ enabled: "yes" }), null);
  assert.notEqual(signupPhoneOtpIssue({ enabled: true, other: 1 }), null);
  assert.notEqual(signupPhoneOtpIssue([true]), null);
});

test("rules: only accounts created at/after the switch-on may be held", () => {
  const on = { enabled: true, enabledAt: "2026-12-01T00:00:00Z" };
  assert.equal(mayBeHeld(on, "2026-12-01T00:00:00Z"), true);
  assert.equal(mayBeHeld(on, "2026-12-02T10:00:00Z"), true);
  assert.equal(mayBeHeld(on, "2026-11-30T23:59:59Z"), false);
  assert.equal(mayBeHeld({ enabled: false, enabledAt: on.enabledAt }, "2026-12-02T10:00:00Z"), false);
  assert.equal(mayBeHeld({ enabled: true, enabledAt: null }, "2026-12-02T10:00:00Z"), false);
  assert.equal(mayBeHeld(on, undefined), true, "an unreadable creation time asks the database");
});

test("rules: which /api/v1 paths a held account may still call", () => {
  for (const p of [
    "/api/v1/auth/phone-otp/start",
    "/api/v1/auth/phone-otp/verify",
    "/api/v1/auth/phone-otp/status",
    "/api/v1/auth/session",
    "/api/v1/auth/sign-in",
    "/api/v1/legal/terms-acceptance",
    "/api/v1/cron/deadlines",
    "/api/v1/n8n/callback",
    "/api/v1/payments/webhook",
  ]) {
    assert.equal(isPhoneGatedApiPath(p), false, p);
  }
  for (const p of [
    "/api/v1/lawyer/cases",
    "/api/v1/profile",
    "/api/v1/payments/checkout",
    "/api/v1/authx",
    "/api/v1/lawyer/signup-verification/email/start",
    "/api/v1",
  ]) {
    assert.equal(isPhoneGatedApiPath(p), true, p);
  }
  assert.equal(isPhoneGatedApiPath("/api/library/search"), false);
});

test("rules: the post-verify destination is a short same-origin list", () => {
  assert.equal(safePhoneNext("/register/provider/verify"), "/register/provider/verify");
  assert.equal(safePhoneNext("/dashboard/lawyer?x=1"), "/dashboard/lawyer");
  assert.equal(safePhoneNext("/onboarding"), "/onboarding");
  for (const bad of ["//evil.example", "https://evil.example", "/\\evil", "/settings", "/dashboardx", "javascript:alert(1)", null, 5]) {
    assert.equal(safePhoneNext(bad), null, String(bad));
  }
});

test("rules: the masked number shows the last four digits only", () => {
  assert.equal(maskSaudiMobile("+966512345678"), "•••• 5678");
  assert.equal(maskSaudiMobile(null), null);
  assert.equal(maskSaudiMobile("+9661"), null);
});
