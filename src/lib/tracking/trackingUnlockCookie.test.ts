import test from "node:test";
import assert from "node:assert/strict";
import {
  UNLOCK_COOKIE_NAME,
  UNLOCK_TTL_MS,
  isUnlockEpoch,
  parseTrackingGate,
  parseTrackingUnlock,
  signUnlock,
  unlockCookieKey,
  unlockCookiePath,
  verifyUnlock,
} from "./trackingUnlockCookie.ts";

const HASH = "f".repeat(64);
const OTHER = "e".repeat(64);
const NOW = Date.parse("2026-10-26T12:00:00Z");
const EPOCH = 3;

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

test("sign → verify: bound to the link's hash, its unlock epoch and its expiry", () => {
  const key = unlockCookieKey("service-key")!;
  const v = signUnlock(HASH, EPOCH, NOW + UNLOCK_TTL_MS, key);
  assert.match(v, /^\d+\.[0-9a-f]{64}$/);
  assert.equal(verifyUnlock(v, HASH, EPOCH, NOW, key), true);
  assert.equal(verifyUnlock(v, OTHER, EPOCH, NOW, key), false, "a cookie of one link never opens another");
  assert.equal(verifyUnlock(v, HASH, EPOCH, NOW + UNLOCK_TTL_MS, key), false, "expired at its instant");
  assert.equal(verifyUnlock(v, HASH, EPOCH, NOW, unlockCookieKey("another-key")!), false, "a rotated secret ends every unlock");
  const [exp, mac] = v.split(".");
  assert.equal(verifyUnlock(`${Number(exp) + 1000}.${mac}`, HASH, EPOCH, NOW, key), false, "the expiry cannot be stretched");
  assert.equal(verifyUnlock(`${exp}.${"0".repeat(64)}`, HASH, EPOCH, NOW, key), false);
  for (const bad of [undefined, "", "x", "1.2", `${exp}.${mac}x`, `${exp}`, `.${mac}`]) {
    assert.equal(verifyUnlock(bad, HASH, EPOCH, NOW, key), false, String(bad));
  }
  assert.equal(verifyUnlock(v, HASH, EPOCH, NOW, null), false, "no key → never unlocked");
});

test("the epoch: a pause, a re-activation or a new phone (a later epoch) ends the cookie", () => {
  const key = unlockCookieKey("service-key")!;
  const v = signUnlock(HASH, EPOCH, NOW + UNLOCK_TTL_MS, key);
  assert.equal(verifyUnlock(v, HASH, EPOCH + 1, NOW, key), false, "signed under epoch 3, the link is at 4");
  assert.equal(verifyUnlock(v, HASH, EPOCH - 1, NOW, key), false);
  for (const bad of [null, undefined, -1, 1.5, Number.NaN, "3", 2 ** 31]) {
    assert.equal(verifyUnlock(v, HASH, bad, NOW, key), false, `epoch ${String(bad)} → never unlocked`);
  }
  assert.equal(isUnlockEpoch(0), true);
  assert.equal(isUnlockEpoch(2 ** 31 - 1), true);
  assert.equal(isUnlockEpoch(-1), false);
  assert.throws(() => signUnlock(HASH, -1, NOW + UNLOCK_TTL_MS, key));
});

test("a cookie never lives longer than the TTL even if signed further out", () => {
  const key = unlockCookieKey("service-key")!;
  const far = signUnlock(HASH, EPOCH, NOW + UNLOCK_TTL_MS * 10, key);
  assert.equal(verifyUnlock(far, HASH, EPOCH, NOW, key), false);
});

test("name and path: one cookie per link, scoped to its own page", () => {
  assert.equal(UNLOCK_COOKIE_NAME, "nz_track_unlock");
  assert.equal(unlockCookiePath("a".repeat(64)), `/track/${"a".repeat(64)}`);
  assert.equal(UNLOCK_TTL_MS, 12 * 60 * 60 * 1000);
});

test("the gate's jsonb answer: the epoch only with 'active'; anything unexpected fails closed", () => {
  assert.deepEqual(parseTrackingGate({ state: "active", epoch: 4 }), { state: "active", epoch: 4 });
  assert.deepEqual(parseTrackingGate({ state: "active", epoch: 0 }), { state: "active", epoch: 0 });
  for (const s of ["none", "unavailable", "paused", "expired"]) {
    assert.deepEqual(parseTrackingGate({ state: s, epoch: 9 }), { state: s, epoch: null }, s);
  }
  // an active answer without a valid epoch can never be verified → error, not active
  for (const bad of [{ state: "active" }, { state: "active", epoch: "4" }, { state: "active", epoch: -1 }]) {
    assert.deepEqual(parseTrackingGate(bad), { state: "error", epoch: null }, JSON.stringify(bad));
  }
  // the v1 text answer, or junk → error (never the snapshot)
  for (const bad of ["active", null, undefined, 42, [], { state: "v1" }, { state: "ACTIVE", epoch: 1 }]) {
    assert.equal(parseTrackingGate(bad).state, "error", JSON.stringify(bad));
  }
});

test("the unlock's jsonb answer: 'ok' carries the epoch; anything else is denied / locked / error", () => {
  assert.deepEqual(parseTrackingUnlock({ result: "ok", epoch: 2 }), { result: "ok", epoch: 2 });
  assert.deepEqual(parseTrackingUnlock({ result: "ok" }), { result: "error" }, "ok without an epoch cannot sign a cookie");
  assert.deepEqual(parseTrackingUnlock({ result: "locked" }), { result: "locked" });
  assert.deepEqual(parseTrackingUnlock({ result: "denied" }), { result: "denied" });
  for (const bad of ["ok", null, {}, { result: "OK", epoch: 1 }]) {
    assert.deepEqual(parseTrackingUnlock(bad), { result: "error" }, JSON.stringify(bad));
  }
});
