/**
 * accountDevice.test.ts — batch l19, owner ٢٣٣ (LIVE-17): the pure half of
 * the whole-account device limit (one mobile + one computer).
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/devices/accountDevice.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ACCOUNT_DEVICE_COOKIE,
  ACCOUNT_DEVICE_LIMIT_AR,
  ACCOUNT_DEVICE_LIMIT_CODE,
  ACCOUNT_DEVICE_LIMIT_PATH,
  accountDeviceCookieOptions,
  accountDeviceHash,
  accountDeviceIdFrom,
  accountDeviceLabel,
  accountDeviceRefusalBody,
  accountGateDecision,
  accountSwitchFrom,
  deviceKindFrom,
  isAccountDeviceId,
  isMissingAccountDeviceSchema,
  newAccountDeviceId,
  parseAccountGateRow,
  parseAccountSwitchPatch,
} from "./accountDevice.ts";
import { LIBRARY_DEVICE_COOKIE, hashDeviceId, isValidDeviceId, newDeviceId } from "../library/deviceLimit.ts";

const UA = {
  chromeWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  ipadOld: "Mozilla/5.0 (iPad; CPU OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  androidDesktopMode: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

// ── the cookie: the SAME one the library limit set, so no registered browser becomes "new" ──
test("the cookie is the library's nz_lib_device, httpOnly, Lax, 400 days", () => {
  assert.equal(ACCOUNT_DEVICE_COOKIE, LIBRARY_DEVICE_COOKIE);
  assert.equal(ACCOUNT_DEVICE_COOKIE, "nz_lib_device");
  const o = accountDeviceCookieOptions(true);
  assert.equal(o.httpOnly, true);
  assert.equal(o.secure, true);
  assert.equal(o.sameSite, "lax");
  assert.equal(o.path, "/");
  assert.equal(o.maxAge, 400 * 24 * 60 * 60);
  assert.equal(accountDeviceCookieOptions(false).secure, false);
});

test("the WebCrypto hash the proxy uses equals the node:crypto hash already stored (fixed vector + random ids)", async () => {
  const fixed = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  assert.equal(await accountDeviceHash(fixed), hashDeviceId(fixed));
  assert.equal(await accountDeviceHash(fixed), createHash("sha256").update(fixed, "utf8").digest("hex"));
  for (let i = 0; i < 50; i++) {
    const id = newDeviceId(randomBytes(32));
    assert.equal(await accountDeviceHash(id), hashDeviceId(id));
  }
});

test("a minted id is the same 43-character base64url form as the library's (Buffer-free)", () => {
  for (let i = 0; i < 200; i++) {
    const bytes = randomBytes(32);
    assert.equal(accountDeviceIdFrom(new Uint8Array(bytes)), newDeviceId(bytes));
  }
  const id = newAccountDeviceId();
  assert.ok(isAccountDeviceId(id));
  assert.ok(isValidDeviceId(id));
  assert.notEqual(newAccountDeviceId(), newAccountDeviceId());
  assert.throws(() => accountDeviceIdFrom(new Uint8Array(31)));
  for (const bad of [null, undefined, "", "short", "x".repeat(44), "a+b/" + "c".repeat(39), 42]) {
    assert.equal(isAccountDeviceId(bad), false, String(bad));
  }
});

// ── the class ──
test("mobile: phones and tablets, by the client hint or the user-agent", () => {
  assert.equal(deviceKindFrom(UA.safariIphone, null), "mobile");
  assert.equal(deviceKindFrom(UA.chromeAndroidPhone, "?1"), "mobile");
  assert.equal(deviceKindFrom(UA.chromeAndroidTablet, "?0"), "mobile", "an Android tablet is the handheld class");
  assert.equal(deviceKindFrom(UA.ipadOld, null), "mobile");
  // Sec-CH-UA-Mobile wins even over a desktop-looking user-agent.
  assert.equal(deviceKindFrom(UA.androidDesktopMode, "?1"), "mobile");
});

test("desktop: everything else — and the two honest edges (iPadOS Safari, a phone in «desktop site» mode)", () => {
  assert.equal(deviceKindFrom(UA.chromeWindows, "?0"), "desktop");
  assert.equal(deviceKindFrom(UA.safariMac, null), "desktop");
  assert.equal(deviceKindFrom(null, null), "desktop");
  assert.equal(deviceKindFrom("", ""), "desktop");
  // iPadOS 13+ Safari sends the Mac user-agent: it takes the computer slot.
  assert.equal(deviceKindFrom(UA.safariMac, null), "desktop");
  // «Request desktop site» on Android: a Linux user-agent and ?0.
  assert.equal(deviceKindFrom(UA.androidDesktopMode, "?0"), "desktop");
});

test("the label names the class the server decided", () => {
  assert.equal(accountDeviceLabel(UA.chromeWindows, "desktop"), "كمبيوتر — Chrome / Windows");
  assert.equal(accountDeviceLabel(UA.safariIphone, "mobile"), "جوال — Safari / iPhone");
  assert.equal(accountDeviceLabel(UA.androidDesktopMode, "mobile"), "جوال — Chrome / Linux");
});

// ── the database's answer → the decision ──
test("parseAccountGateRow reads PostgREST's array and refuses anything else", () => {
  assert.deepEqual(parseAccountGateRow([{ status: "registered", device_id: "d1", device_kind: "mobile" }]), {
    status: "registered",
    deviceId: "d1",
    kind: "mobile",
  });
  assert.deepEqual(parseAccountGateRow({ status: "disabled", device_id: null, device_kind: null }), {
    status: "disabled",
    deviceId: null,
    kind: null,
  });
  for (const bad of [null, [], [{}], [{ status: "suspend" }], [{ status: "needs_code" }], "refused", [{ status: 1 }]]) {
    assert.equal(parseAccountGateRow(bad), null, JSON.stringify(bad));
  }
});

test("ONLY an explicit refused refuses; no row allows (fail open); a refusal is never remembered", () => {
  const row = (status: string) => parseAccountGateRow([{ status }]);
  assert.deepEqual(accountGateDecision(row("refused")), { action: "refuse" });
  assert.deepEqual(accountGateDecision(null), { action: "allow", remember: null });
  assert.deepEqual(accountGateDecision(row("disabled")), { action: "allow", remember: "switch_off" });
  assert.deepEqual(accountGateDecision(row("exempt")), { action: "allow", remember: "user" });
  assert.deepEqual(accountGateDecision(row("ok")), { action: "allow", remember: "device" });
  assert.deepEqual(accountGateDecision(row("registered")), { action: "allow", remember: "device" });
  // A candidate (its class free, not confirmed yet) is allowed like a known device.
  assert.deepEqual(accountGateDecision(row("pending")), { action: "allow", remember: "device" });
});

test("the switch row: true / false, anything else unknown", () => {
  assert.equal(accountSwitchFrom([{ account_device_limit_enabled: true }]), true);
  assert.equal(accountSwitchFrom([{ account_device_limit_enabled: false }]), false);
  assert.equal(accountSwitchFrom([]), null);
  assert.equal(accountSwitchFrom([{}]), null);
  assert.equal(accountSwitchFrom(null), null);
  assert.equal(accountSwitchFrom([{ account_device_limit_enabled: "true" }]), null);
});

test("missing-schema codes (20261209_40 not run) are recognised", () => {
  for (const c of ["42703", "42883", "PGRST202", "PGRST204", "PGRST205", "42P01"]) assert.ok(isMissingAccountDeviceSchema(c), c);
  for (const c of ["23514", "PGRST301", null, undefined, 42]) assert.equal(isMissingAccountDeviceSchema(c), false, String(c));
});

test("the admin's patch is { enabled: boolean } only", () => {
  assert.deepEqual(parseAccountSwitchPatch({ enabled: true }), { ok: true, enabled: true });
  assert.deepEqual(parseAccountSwitchPatch({ enabled: false, limit: 5 }), { ok: true, enabled: false });
  for (const bad of [null, {}, { enabled: "true" }, { limit: 1 }, "x"]) {
    assert.equal(parseAccountSwitchPatch(bad).ok, false, JSON.stringify(bad));
  }
});

// ── the refusal ──
test("the refusal is the owner's exact ٢٣٣ sentence, on a public page", () => {
  assert.equal(
    ACCOUNT_DEVICE_LIMIT_AR,
    "تم الوصول إلى الحد الأقصى للأجهزة المسموحة لهذا الحساب (جوال واحد وحاسوب واحد). لفتح جهاز جديد أو تبديله يُرجى التواصل مع الدعم / إدارة نظامي",
  );
  assert.deepEqual(accountDeviceRefusalBody(), { error: ACCOUNT_DEVICE_LIMIT_AR, code: ACCOUNT_DEVICE_LIMIT_CODE });
  assert.equal(ACCOUNT_DEVICE_LIMIT_PATH, "/device-limit");
});

test("the pure file has no node: import (the proxy bundle loads it)", () => {
  const src = readFileSync(join(import.meta.dirname, "accountDevice.ts"), "utf8");
  assert.doesNotMatch(src, /from\s+["']node:/);
  assert.doesNotMatch(src, /\bBuffer\.from\(/);
  for (const f of ["accountDeviceGate.ts", "accountDeviceProxy.ts"]) {
    const io = readFileSync(join(import.meta.dirname, f), "utf8");
    assert.doesNotMatch(io, /from\s+["']node:/, f);
    assert.doesNotMatch(io, /server-only|@supabase\//, f);
  }
});
