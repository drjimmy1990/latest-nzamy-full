import test from "node:test";
import assert from "node:assert/strict";
import {
  UNLOCK_COOKIE_NAME,
  UNLOCK_TTL_MS,
  signUnlock,
  unlockCookieKey,
  unlockCookiePath,
  verifyUnlock,
} from "./trackingUnlockCookie.ts";

const HASH = "f".repeat(64);
const OTHER = "e".repeat(64);
const NOW = Date.parse("2026-10-26T12:00:00Z");

test("the key: derived from the server secret with a purpose label; no secret → no key (fail closed)", () => {
  assert.equal(unlockCookieKey(undefined), null);
  assert.equal(unlockCookieKey(""), null);
  assert.equal(unlockCookieKey("   "), null);
  const k = unlockCookieKey("service-key");
  assert.ok(k && k.length === 32);
  assert.notDeepEqual(k, Buffer.from("service-key"), "the raw secret is never the HMAC key");
  assert.deepEqual(unlockCookieKey("service-key"), k, "deterministic across processes");
  assert.notDeepEqual(unlockCookieKey("another-key"), k);
});

test("sign → verify: bound to the link's hash and to its expiry", () => {
  const key = unlockCookieKey("service-key")!;
  const v = signUnlock(HASH, NOW + UNLOCK_TTL_MS, key);
  assert.match(v, /^\d+\.[0-9a-f]{64}$/);
  assert.equal(verifyUnlock(v, HASH, NOW, key), true);
  assert.equal(verifyUnlock(v, OTHER, NOW, key), false, "a cookie of one link never opens another");
  assert.equal(verifyUnlock(v, HASH, NOW + UNLOCK_TTL_MS, key), false, "expired at its instant");
  assert.equal(verifyUnlock(v, HASH, NOW, unlockCookieKey("another-key")!), false, "a rotated secret ends every unlock");
  const [exp, mac] = v.split(".");
  assert.equal(verifyUnlock(`${Number(exp) + 1000}.${mac}`, HASH, NOW, key), false, "the expiry cannot be stretched");
  assert.equal(verifyUnlock(`${exp}.${"0".repeat(64)}`, HASH, NOW, key), false);
  for (const bad of [undefined, "", "x", "1.2", `${exp}.${mac}x`, `${exp}`, `.${mac}`]) {
    assert.equal(verifyUnlock(bad, HASH, NOW, key), false, String(bad));
  }
  assert.equal(verifyUnlock(v, HASH, NOW, null), false, "no key → never unlocked");
});

test("a cookie never lives longer than the TTL even if signed further out", () => {
  const key = unlockCookieKey("service-key")!;
  const far = signUnlock(HASH, NOW + UNLOCK_TTL_MS * 10, key);
  assert.equal(verifyUnlock(far, HASH, NOW, key), false);
});

test("name and path: one cookie per link, scoped to its own page", () => {
  assert.equal(UNLOCK_COOKIE_NAME, "nz_track_unlock");
  assert.equal(unlockCookiePath("a".repeat(64)), `/track/${"a".repeat(64)}`);
  assert.equal(UNLOCK_TTL_MS, 12 * 60 * 60 * 1000);
});
