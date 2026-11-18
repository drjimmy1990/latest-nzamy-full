/**
 * Owner ٤٠ (18 Nov 2026; batch l7 decision 14): e-mail code per new library
 * device, the third device suspends the account, never two devices open at
 * once — all behind device_limit_enabled. The SQL half is proven by
 * supabase/tests/rls/l7_community.test.sql (T12–T19).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEVICE_CODE_REQUIRED_CODE,
  DEVICE_LIMIT_SUSPENDED_CODE,
  deviceCodePepper,
  deviceCodeVerifyMessageAr,
  deviceGateDecision,
  hashDeviceCode,
  parseDeviceCheckRow,
} from "./deviceLimit.ts";
import { readerRefusalFrom } from "./readerRefusal.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const base = { limit: 2, deviceId: null, devices: [] };

test("parse: the gate's new answers and the sessions it ended", () => {
  assert.deepEqual(parseDeviceCheckRow([{ status: "needs_code", device_limit: 2, device_id: "d", devices: [], sessions_ended: 0 }]), {
    status: "needs_code", limit: 2, deviceId: "d", devices: [], sessionsEnded: 0,
  });
  assert.equal(parseDeviceCheckRow({ status: "suspend", device_limit: 2 })?.status, "suspend");
  assert.equal(parseDeviceCheckRow({ status: "ok", sessions_ended: 1 })?.sessionsEnded, 1);
});

test("decision: a new device needs the code; the third device suspends; neither is remembered", () => {
  const code = deviceGateDecision({ ...base, status: "needs_code" });
  assert.equal(code.action, "refuse");
  if (code.action === "refuse") {
    assert.equal(code.status, 403);
    assert.equal(code.body.code, DEVICE_CODE_REQUIRED_CODE);
    assert.match(code.body.error, /رمز تحقق/);
  }
  const third = deviceGateDecision({ ...base, status: "suspend" });
  assert.equal(third.action, "suspend");
  if (third.action === "suspend") {
    assert.equal(third.body.code, DEVICE_LIMIT_SUSPENDED_CODE);
    assert.match(third.body.error, /أُوقف الحساب/);
    assert.match(third.body.error, /جهازين/);
  }
});

test("reader: the code and the suspension render as device refusals with their mode", () => {
  const c = readerRefusalFrom(403, { code: "device_code_required", error: "رمز", limit: 2 }, 0);
  assert.deepEqual(c, { kind: "device", messageAr: "رمز", limit: 2, devices: [], mode: "code" });
  const s = readerRefusalFrom(403, { code: "device_limit_suspended", limit: 2 }, 0);
  assert.equal(s?.kind === "device" && s.mode, "suspended");
  const old = readerRefusalFrom(403, { code: "device_limit", limit: 2 }, 0);
  assert.equal(old?.kind === "device" && "mode" in old, false, "the old refusal keeps its shape");
});

test("the code key: DEVICE_CODE_PEPPER, else LAWYER_OTP_PEPPER, at least 32 characters", () => {
  const long = "x".repeat(32);
  assert.equal(deviceCodePepper({}), null);
  assert.equal(deviceCodePepper({ DEVICE_CODE_PEPPER: "short" }), null);
  assert.equal(deviceCodePepper({ LAWYER_OTP_PEPPER: long }), long);
  assert.equal(deviceCodePepper({ DEVICE_CODE_PEPPER: `a${long}`, LAWYER_OTP_PEPPER: long }), `a${long}`);
});

test("the stored hash is bound to the user and the device, and is 64 hex characters", () => {
  const p = "p".repeat(32);
  const h = hashDeviceCode(p, "u1", "d1", "123456");
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.notEqual(h, hashDeviceCode(p, "u2", "d1", "123456"));
  assert.notEqual(h, hashDeviceCode(p, "u1", "d2", "123456"));
  assert.notEqual(h, hashDeviceCode(p, "u1", "d1", "123457"));
});

test("verify answers in Arabic, with the attempts left", () => {
  assert.equal(deviceCodeVerifyMessageAr("verified", null), null);
  assert.match(deviceCodeVerifyMessageAr("wrong", 3) ?? "", /3 محاولات/);
  assert.match(deviceCodeVerifyMessageAr("wrong", 1) ?? "", /محاولة واحدة/);
  assert.match(deviceCodeVerifyMessageAr("expired", null) ?? "", /انتهت/);
  assert.match(deviceCodeVerifyMessageAr("too_many", null) ?? "", /المحاولات/);
});

test("server: the gate first, the old check until 20261127_60 runs; the third device is suspended and frozen", () => {
  const src = read("lib/library/deviceLimitServer.ts");
  assert.ok(src.includes('.rpc("library_device_gate", {'));
  assert.ok(src.includes("p_code_required: deviceCodesAvailable(),"), "no e-mail → no lock-out");
  assert.ok(src.includes('.rpc("library_device_check", { p_user: userId, p_device_hash: hash, p_label: label })'));
  const susp = src.slice(src.indexOf("async function suspendForThirdDevice("));
  assert.ok(susp.includes("await suspendAccountWith(service,"));
  assert.ok(susp.includes('reason: "device_limit"'));
  assert.ok(susp.includes('"user_suspended_device_limit"'));
});

test("routes: the code is sent on request only (never by a read) and checked with the session", () => {
  const send = read("app/api/v1/library/devices/code/route.ts");
  assert.ok(send.includes('rpc("library_device_code_issue"'));
  assert.ok(send.includes("supabase.auth.getUser()"));
  assert.equal(send.includes("request.json("), false, "nothing from the body");
  const verify = read("app/api/v1/library/devices/verify/route.ts");
  assert.ok(verify.includes('rpc("library_device_code_verify"'));
  assert.ok(verify.includes("p_session: await currentSessionId()"));
  const server = read("lib/library/deviceLimitServer.ts");
  assert.equal(server.includes("library_device_code_issue"), false, "a read never sends a code");
});

test("lifting a device-limit suspension resets the devices", () => {
  const route = read("app/api/v1/admin/users/[id]/route.ts");
  const at = route.indexOf('if (thaw.reason === "device_limit") {');
  assert.ok(at > 0);
  assert.ok(route.slice(at, at + 200).includes('revokeLibraryDevice(userId, {}, "admin_reset", actorId)'));
});
