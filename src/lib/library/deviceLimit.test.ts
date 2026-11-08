/**
 * deviceLimit.test.ts — owner answer ٤٢٧ (the library device limit), the pure half.
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/deviceLimit.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  DEVICE_LIMIT_CODE,
  LIBRARY_DEVICE_COOKIE,
  LIBRARY_DEVICE_COOKIE_MAX_AGE_S,
  deviceGateDecision,
  deviceLabelFromUserAgent,
  deviceLimitMessageAr,
  devicesCountAr,
  hashDeviceId,
  isBearerWithoutDeviceCookie,
  isMissingDeviceSchema,
  isUuidString,
  isValidDeviceId,
  libraryDeviceCookieOptions,
  newDeviceId,
  parseDeviceCheckRow,
  parseDeviceSettingsPatch,
  toDeviceList,
} from "./deviceLimit.ts";
import { deviceLastSeenAr, readerRefusalFrom } from "./readerRefusal.ts";

const UA = {
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1",
  chromeAndroidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
};

test("labels: the owner's «computer + phone» in words a person reads", () => {
  assert.equal(deviceLabelFromUserAgent(UA.chromeWindows), "كمبيوتر — Chrome / Windows");
  assert.equal(deviceLabelFromUserAgent(UA.safariIphone), "جوال — Safari / iPhone");
  assert.equal(deviceLabelFromUserAgent(UA.chromeIphone), "جوال — Chrome / iPhone");
  assert.equal(deviceLabelFromUserAgent(UA.chromeAndroidPhone), "جوال — Chrome / Android");
  assert.equal(deviceLabelFromUserAgent(UA.chromeAndroidTablet), "جهاز لوحي — Chrome / Android");
  assert.equal(deviceLabelFromUserAgent(UA.edgeWindows), "كمبيوتر — Edge / Windows");
  assert.equal(deviceLabelFromUserAgent(UA.firefoxMac), "كمبيوتر — Firefox / macOS");
  assert.equal(deviceLabelFromUserAgent(UA.safariMac), "كمبيوتر — Safari / macOS");
  assert.equal(deviceLabelFromUserAgent(UA.samsung), "جوال — Samsung Internet / Android");
  assert.equal(deviceLabelFromUserAgent(UA.ipad), "جهاز لوحي — Safari / iPad");
});

test("labels: an empty or odd user-agent still names something, and is bounded", () => {
  assert.equal(deviceLabelFromUserAgent(null), "جهاز غير معروف");
  assert.equal(deviceLabelFromUserAgent("   "), "جهاز غير معروف");
  assert.equal(deviceLabelFromUserAgent("curl/8.0"), "كمبيوتر");
  assert.ok(deviceLabelFromUserAgent("x".repeat(10_000)).length <= 120);
});

test("cookie: httpOnly, SameSite=Lax, path /, 400 days; Secure in production", () => {
  assert.equal(LIBRARY_DEVICE_COOKIE, "nz_lib_device");
  assert.equal(LIBRARY_DEVICE_COOKIE_MAX_AGE_S, 400 * 86400);
  const prod = libraryDeviceCookieOptions(true);
  assert.deepEqual(prod, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 400 * 86400 });
  assert.equal(libraryDeviceCookieOptions(false).secure, false);
});

test("cookie value: 32 random bytes in base64url, validated strictly; only its sha-256 is stored", () => {
  const id = newDeviceId(new Uint8Array(32).fill(7));
  assert.equal(id.length, 43);
  assert.ok(isValidDeviceId(id));
  assert.equal(isValidDeviceId(id + "x"), false);
  assert.equal(isValidDeviceId("a".repeat(42)), false);
  assert.equal(isValidDeviceId("a".repeat(42) + "="), false);
  assert.equal(isValidDeviceId(undefined), false);
  assert.throws(() => newDeviceId(new Uint8Array(16)));
  const h = hashDeviceId(id);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, createHash("sha256").update(id).digest("hex"));
  assert.notEqual(h, hashDeviceId(newDeviceId(new Uint8Array(32).fill(8))));
});

test("parse: the database row, or null (no decision → fail open)", () => {
  const row = parseDeviceCheckRow([
    {
      status: "refused",
      device_limit: 2,
      device_id: null,
      devices: [
        { id: "d1", label: "كمبيوتر — Chrome / Windows", first_seen: "2026-11-01T00:00:00Z", last_seen: "2026-11-08T09:00:00Z" },
        { id: "", label: "x" },
        "junk",
      ],
    },
  ]);
  assert.deepEqual(row, {
    status: "refused",
    limit: 2,
    deviceId: null,
    devices: [{ id: "d1", label: "كمبيوتر — Chrome / Windows", firstSeen: "2026-11-01T00:00:00Z", lastSeen: "2026-11-08T09:00:00Z" }],
  });
  assert.equal(parseDeviceCheckRow([]), null);
  assert.equal(parseDeviceCheckRow(null), null);
  assert.equal(parseDeviceCheckRow({ status: "maybe" }), null);
  assert.equal(parseDeviceCheckRow({ status: "ok" })?.limit, 2);
});

test("decision: only 'refused' refuses; no row allows; what may be remembered", () => {
  assert.deepEqual(deviceGateDecision(null), { action: "allow", remember: null });
  const base = { limit: 2, deviceId: null, devices: [] };
  assert.deepEqual(deviceGateDecision({ ...base, status: "disabled" }), { action: "allow", remember: "global" });
  assert.deepEqual(deviceGateDecision({ ...base, status: "exempt" }), { action: "allow", remember: "user" });
  assert.deepEqual(deviceGateDecision({ ...base, status: "ok" }), { action: "allow", remember: "device" });
  assert.deepEqual(deviceGateDecision({ ...base, status: "registered" }), { action: "allow", remember: "device" });
  const refused = deviceGateDecision({ ...base, status: "refused", devices: [{ id: "a", label: "x", firstSeen: null, lastSeen: null }] });
  assert.equal(refused.action, "refuse");
  if (refused.action === "refuse") {
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, DEVICE_LIMIT_CODE);
    assert.equal(refused.body.limit, 2);
    assert.equal(refused.body.devices.length, 1);
    assert.equal(
      refused.body.error,
      "هذا الحساب مفعّل على جهازين بالفعل. سجّل الخروج من أحد أجهزتك المصرّحة لتفتح المكتبة من هذا الجهاز.",
    );
  }
});

test("the message follows the admin's number", () => {
  assert.equal(devicesCountAr(1), "جهاز واحد");
  assert.equal(devicesCountAr(2), "جهازين");
  assert.equal(devicesCountAr(3), "3 أجهزة");
  assert.equal(devicesCountAr(11), "11 جهازاً");
  assert.match(deviceLimitMessageAr(3), /مفعّل على 3 أجهزة بالفعل/);
});

test("missing-schema codes fail open; other codes do not count as missing", () => {
  for (const c of ["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"]) assert.ok(isMissingDeviceSchema(c), c);
  for (const c of ["42501", "22023", "", undefined, null, 42]) assert.equal(isMissingDeviceSchema(c), false);
});

test("a Bearer caller without the cookie (native app) is not device-checked", () => {
  const id = newDeviceId(new Uint8Array(32));
  assert.equal(isBearerWithoutDeviceCookie("Bearer abc.def", null), true);
  assert.equal(isBearerWithoutDeviceCookie("  bearer abc", "garbage"), true);
  assert.equal(isBearerWithoutDeviceCookie("Bearer abc", id), false);
  assert.equal(isBearerWithoutDeviceCookie(null, null), false);
  assert.equal(isBearerWithoutDeviceCookie("Bearer ", null), false);
});

test("the device list never carries the hash, marks this device, newest first", () => {
  const list = toDeviceList(
    [
      { id: "a", label: "جوال", first_seen: "2026-11-01T00:00:00Z", last_seen: "2026-11-02T00:00:00Z", device_hash: "h1" },
      { id: "b", label: "كمبيوتر", first_seen: "2026-11-01T00:00:00Z", last_seen: "2026-11-05T00:00:00Z", device_hash: "h2" },
    ],
    "h1",
  );
  assert.deepEqual(list.map((d) => [d.id, d.current]), [["b", false], ["a", true]]);
  assert.ok(list.every((d) => !("device_hash" in d)));
  assert.deepEqual(toDeviceList(null, "h1"), []);
});

test("settings patch: a boolean switch and a number 1–10", () => {
  assert.deepEqual(parseDeviceSettingsPatch({ enabled: true, limit: 2 }), { ok: true, columns: { device_limit_enabled: true, device_limit: 2 } });
  assert.equal(parseDeviceSettingsPatch({ enabled: "yes" }).ok, false);
  assert.equal(parseDeviceSettingsPatch({ limit: 0 }).ok, false);
  assert.equal(parseDeviceSettingsPatch({ limit: 11 }).ok, false);
  assert.equal(parseDeviceSettingsPatch({ limit: 2.5 }).ok, false);
  assert.equal(parseDeviceSettingsPatch({}).ok, false);
  assert.equal(parseDeviceSettingsPatch(null).ok, false);
});

test("uuid check", () => {
  assert.ok(isUuidString("00000000-0000-0000-0000-00000000d001"));
  assert.equal(isUuidString("current"), false);
});

test("reader: a 403 device_limit is the device refusal; any other 403 is not a refusal", () => {
  const r = readerRefusalFrom(
    403,
    { code: "device_limit", error: "رسالة", limit: 2, devices: [{ id: "a", label: "جوال — Safari / iPhone", lastSeen: "2026-11-08T08:00:00Z" }, { label: "no id" }] },
    Date.now(),
  );
  assert.deepEqual(r, {
    kind: "device",
    messageAr: "رسالة",
    limit: 2,
    devices: [{ id: "a", label: "جوال — Safari / iPhone", lastSeen: "2026-11-08T08:00:00Z" }],
  });
  assert.equal(readerRefusalFrom(403, { error: "forbidden" }, Date.now()), null);
  assert.equal(readerRefusalFrom(403, null, Date.now()), null);
  const fallback = readerRefusalFrom(403, { code: "device_limit" }, Date.now());
  assert.equal(fallback?.kind, "device");
  if (fallback?.kind === "device") assert.match(fallback.messageAr, /جهازين/);
});

test("reader: «آخر استخدام» is computed on the client", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  assert.equal(deviceLastSeenAr("2026-11-08T11:59:30Z", now), "الآن");
  assert.equal(deviceLastSeenAr("2026-11-08T11:55:00Z", now), "منذ 5 دقائق");
  assert.equal(deviceLastSeenAr("2026-11-08T10:00:00Z", now), "منذ ساعتين");
  assert.ok(deviceLastSeenAr("2026-11-01T10:00:00Z", now));
  assert.equal(deviceLastSeenAr(null, now), null);
  assert.equal(deviceLastSeenAr("nope", now), null);
});
