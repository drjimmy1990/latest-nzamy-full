/**
 * Owner ٤٠ (18 Nov 2026; batch l7 decision 14): e-mail code per new library
 * device, never two devices open at once — all behind device_limit_enabled.
 * Owner ٦٣ (18 Nov evening, batch l8): the third device is REFUSED with the
 * list of devices, never suspended. The SQL half is proven by
 * supabase/tests/rls/l7_community.test.sql (T12–T19).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEVICE_CODE_REQUIRED_CODE,
  DEVICE_LIMIT_CODE,
  deviceCodePepper,
  deviceCodeVerifyMessageAr,
  deviceGateDecision,
  hashDeviceCode,
  parseDeviceCheckRow,
  RETIRED_DEVICE_CODE,
  RETIRED_DEVICE_CODE_AR,
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

test("decision: a new device needs the code; the third device is refused with the list (owner ٦٣); neither is remembered", () => {
  const code = deviceGateDecision({ ...base, status: "needs_code" });
  assert.equal(code.action, "refuse");
  if (code.action === "refuse") {
    assert.equal(code.status, 403);
    assert.equal(code.body.code, DEVICE_CODE_REQUIRED_CODE);
    assert.match(code.body.error, /رمز تحقق/);
  }
  const devices = [{ id: "d1", label: "كمبيوتر", firstSeen: null, lastSeen: null }];
  const third = deviceGateDecision({ ...base, devices, status: "suspend" });
  assert.equal(third.action, "refuse");
  if (third.action === "refuse") {
    assert.equal(third.status, 403);
    assert.equal(third.body.code, DEVICE_LIMIT_CODE);
    assert.deepEqual(third.body.devices, devices, "the list to remove an old device from");
    assert.doesNotMatch(third.body.error, /أُوقف|إيقاف|الدعم/);
    assert.match(third.body.error, /جهازين/);
    assert.match(third.body.error, /«مكتبتي»/);
  }
  assert.deepEqual(third, deviceGateDecision({ ...base, devices, status: "refused" }), "same as a full list");
});

test("reader: the code renders with its mode; an old suspension code reads as the plain refusal", () => {
  const c = readerRefusalFrom(403, { code: "device_code_required", error: "رمز", limit: 2 }, 0);
  assert.deepEqual(c, { kind: "device", messageAr: "رمز", limit: 2, devices: [], mode: "code" });
  const s = readerRefusalFrom(403, { code: "device_limit_suspended", error: "أُوقف الحساب", limit: 2 }, 0);
  assert.equal(s?.kind === "device" && "mode" in s, false);
  assert.doesNotMatch(s?.kind === "device" ? s.messageAr : "", /أُوقف/);
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

// Batch l19 (owner ٢٣٣): the library reads go through the whole-account gate (one mobile + one
// computer, registered silently — no e-mail code); library_device_gate / library_device_check
// are no longer called by a read. The pins on what must NEVER happen stay.
test("server: the account gate, no e-mail code on a read; nothing suspends or freezes the account (owner ٦٣)", () => {
  const src = read("lib/library/deviceLimitServer.ts");
  assert.ok(src.includes("await accountDeviceOutcome({"));
  assert.equal(src.includes('.rpc("library_device_gate"'), false);
  assert.equal(src.includes("p_code_required"), false, "a new device is never held for an e-mail code");
  for (const gone of ["suspendForThirdDevice", "suspendAccountWith", "freezeEntitlementsWith", "user_suspended_device_limit", "logAdminAction"]) {
    assert.equal(src.includes(gone), false, `no ${gone} in the device gate`);
  }
  const notice = read("components/library/LibraryDeviceLimitNotice.tsx");
  assert.equal(notice.includes("أُوقف الحساب"), false);
  assert.ok(notice.includes('href="/laws/my#devices"'), "the refusal links to «مكتبتي» where devices are removed");
  const admin = read("app/dashboard/admin/security/LibraryDevicesPanel.tsx");
  assert.equal(admin.includes("توقف الحساب"), false, "the admin text no longer promises a suspension");
});

test("l19 review B3: the retired code routes answer 410 with an honest line and call nothing", () => {
  for (const f of ["app/api/v1/library/devices/code/route.ts", "app/api/v1/library/devices/verify/route.ts"]) {
    const src = read(f);
    assert.match(src, /\{ error: RETIRED_DEVICE_CODE_AR, code: RETIRED_DEVICE_CODE \},\s*\{ status: 410,/, f);
    assert.doesNotMatch(src, /\.rpc\(|createServiceClient|createClient|request\.json\(|library_device_code_(issue|verify)|sendEmail/, `${f}: no database call, no body, no mail`);
  }
  assert.equal(RETIRED_DEVICE_CODE, "device_code_retired");
  assert.match(RETIRED_DEVICE_CODE_AR, /تواصل مع الإدارة/);
  assert.doesNotMatch(RETIRED_DEVICE_CODE_AR, /[A-Za-z]/, "no technical words");
  const server = read("lib/library/deviceLimitServer.ts");
  assert.equal(server.includes("library_device_code_issue"), false, "a read never sends a code");
});

test("lifting a legacy device-limit suspension (batch 7) still resets the devices", () => {
  const route = read("app/api/v1/admin/users/[id]/route.ts");
  const at = route.indexOf('if (thaw.reason === "device_limit") {');
  assert.ok(at > 0);
  assert.ok(route.slice(at, at + 200).includes('revokeLibraryDevice(userId, {}, "admin_reset", actorId)'));
});
