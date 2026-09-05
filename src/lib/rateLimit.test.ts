/**
 * rateLimit.test.ts — run with: node --test src/lib/rateLimit.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { RateLimiter, resolveClientIp } from "./rateLimit.ts";

const POLICY = { windowMs: 10_000, max: 3 };

/** A mutable injectable clock: `tick(ms)` advances it, `clock` reads it. */
function fakeClock(start = 0) {
  let now = start;
  return {
    clock: () => now,
    tick(ms: number) {
      now += ms;
    },
  };
}

test("allow: the first `max` requests in a window are all allowed, with decreasing remaining", () => {
  const { clock } = fakeClock();
  const limiter = new RateLimiter({ clock });

  const first = limiter.check("bucket", "1.1.1.1", POLICY);
  const second = limiter.check("bucket", "1.1.1.1", POLICY);
  const third = limiter.check("bucket", "1.1.1.1", POLICY);

  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 1);
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
});
test("deny: the (max + 1)th request in the same window is refused with remaining 0 and a positive Retry-After", () => {
  const { clock, tick } = fakeClock();
  const limiter = new RateLimiter({ clock });

  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  tick(1_000); // still inside the 10s window
  const fourth = limiter.check("bucket", "1.1.1.1", POLICY);

  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.equal(fourth.limit, POLICY.max);
  assert.ok(fourth.retryAfterSeconds >= 1, "retryAfterSeconds must be at least 1 when denied");
  // 10s window, 1s elapsed => 9s left, rounded up.
  assert.equal(fourth.retryAfterSeconds, 9);
});
test("reset: once the window elapses, the same key is allowed again with a fresh count", () => {
  const { clock, tick } = fakeClock();
  const limiter = new RateLimiter({ clock });

  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  const denied = limiter.check("bucket", "1.1.1.1", POLICY);
  assert.equal(denied.allowed, false);

  tick(POLICY.windowMs); // window fully elapsed
  const afterReset = limiter.check("bucket", "1.1.1.1", POLICY);

  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.remaining, POLICY.max - 1);
});
test("manual reset(): clears one key without touching a sibling key in the same bucket", () => {
  const { clock } = fakeClock();
  const limiter = new RateLimiter({ clock });

  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "2.2.2.2", POLICY);

  limiter.reset("bucket", "1.1.1.1");

  const afterReset = limiter.check("bucket", "1.1.1.1", POLICY);
  assert.equal(afterReset.allowed, true);
  assert.equal(afterReset.remaining, POLICY.max - 1);

  // The sibling key's count survives the targeted reset.
  const sibling = limiter.check("bucket", "2.2.2.2", POLICY);
  assert.equal(sibling.remaining, POLICY.max - 2);
});
test("buckets are independent: exhausting one bucket does not affect another bucket for the same key", () => {
  const { clock } = fakeClock();
  const limiter = new RateLimiter({ clock });

  limiter.check("strict", "1.1.1.1", POLICY);
  limiter.check("strict", "1.1.1.1", POLICY);
  limiter.check("strict", "1.1.1.1", POLICY);
  const strictDenied = limiter.check("strict", "1.1.1.1", POLICY);
  assert.equal(strictDenied.allowed, false);

  const generalStillAllowed = limiter.check("general", "1.1.1.1", POLICY);
  assert.equal(generalStillAllowed.allowed, true);
});
test("keys are independent: exhausting one key's allowance does not affect a different key", () => {
  const { clock } = fakeClock();
  const limiter = new RateLimiter({ clock });

  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  limiter.check("bucket", "1.1.1.1", POLICY);
  const denied = limiter.check("bucket", "1.1.1.1", POLICY);
  assert.equal(denied.allowed, false);

  const otherKey = limiter.check("bucket", "9.9.9.9", POLICY);
  assert.equal(otherKey.allowed, true);
});
test("a bucket name and a key that could concatenate to the same string do not collide", () => {
  const { clock } = fakeClock();
  const limiter = new RateLimiter({ clock });

  // Without a separator, ("ab", "c") and ("a", "bc") would both stringify to "abc".
  limiter.check("ab", "c", POLICY);
  limiter.check("ab", "c", POLICY);
  limiter.check("ab", "c", POLICY);
  const abcDenied = limiter.check("ab", "c", POLICY);
  assert.equal(abcDenied.allowed, false);

  const differentSplit = limiter.check("a", "bc", POLICY);
  assert.equal(differentSplit.allowed, true, "a different (bucket, key) split must not share the exhausted counter");
});
test("evictStale: removes only entries whose window has elapsed, leaving live entries untouched", () => {
  const { clock, tick } = fakeClock();
  const limiter = new RateLimiter({ clock });

  limiter.check("bucket", "stale-1", { windowMs: 1_000, max: 5 });
  limiter.check("bucket", "stale-2", { windowMs: 1_000, max: 5 });
  tick(2_000); // both of the above are now stale
  limiter.check("bucket", "fresh", { windowMs: 10_000, max: 5 }); // started "now", still live

  assert.equal(limiter.size, 3);
  const removed = limiter.evictStale();
  assert.equal(removed, 2);
  assert.equal(limiter.size, 1);
});
test("bounded memory: check() sweeps stale entries once the store crosses maxEntries", () => {
  const { clock, tick } = fakeClock();
  const limiter = new RateLimiter({ clock, maxEntries: 3 });
  const shortPolicy = { windowMs: 1_000, max: 5 };

  limiter.check("bucket", "a", shortPolicy);
  limiter.check("bucket", "b", shortPolicy);
  limiter.check("bucket", "c", shortPolicy);
  assert.equal(limiter.size, 3, "still at the cap, no sweep triggered yet");

  tick(2_000); // a, b, c are all now stale
  // This 4th distinct key pushes size to 4, past maxEntries=3, triggering a sweep
  // that removes the three stale entries above before this one is stored.
  limiter.check("bucket", "d", shortPolicy);

  assert.equal(limiter.size, 1, "the sweep must have evicted the stale entries, keeping only the new one");
});
test("bounded memory: a flood of distinct, still-live keys cannot grow the store past maxEntries", () => {
  // The scenario evictStale alone cannot handle: every key is inside its own
  // still-open window (e.g. a botnet spraying a fresh spoofed IP on every
  // request), so nothing is stale and the opportunistic sweep frees zero.
  // check() must fall back to a hard cap regardless.
  const { clock } = fakeClock();
  const limiter = new RateLimiter({ clock, maxEntries: 3 });
  const longLivedPolicy = { windowMs: 10 * 60 * 1000, max: 5 }; // nothing goes stale during this test

  for (let i = 0; i < 25; i += 1) {
    limiter.check("bucket", `spoofed-${i}`, longLivedPolicy);
    assert.ok(limiter.size <= 3, `store must never exceed maxEntries=3; was ${limiter.size} after key ${i}`);
  }

  assert.equal(limiter.size, 3);
});

test("resolveClientIp: prefers x-real-ip (nginx sets it to the TCP peer) over x-forwarded-for", () => {
  const headers: Record<string, string> = {
    "x-forwarded-for": "203.0.113.4, 10.0.0.1",
    "x-real-ip": "198.51.100.9",
  };
  assert.equal(resolveClientIp((name) => headers[name] ?? null), "198.51.100.9");
});

test("resolveClientIp: without x-real-ip uses the LAST forwarded entry (the one nginx appended), never the client-supplied first one", () => {
  const headers: Record<string, string> = { "x-forwarded-for": "  1.2.3.4 , 203.0.113.4  , 10.0.0.1 " };
  assert.equal(resolveClientIp((name) => headers[name] ?? null), "10.0.0.1");
});

test("resolveClientIp: a single forwarded entry is used as is, and no headers give unknown", () => {
  assert.equal(resolveClientIp((name) => (name === "x-forwarded-for" ? "203.0.113.4" : null)), "203.0.113.4");
  assert.equal(resolveClientIp(() => null), "unknown");
});

test("resolveClientIp: caps an oversized header value", () => {
  const long = "9".repeat(500);
  const ip = resolveClientIp((name) => (name === "x-real-ip" ? long : null));
  assert.ok(ip.length < 500);
});
