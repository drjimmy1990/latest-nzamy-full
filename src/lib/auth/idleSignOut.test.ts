/**
 * T5 (batch l11-sec): the idle sign-out enforcing the saved session timeout.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  IDLE_CHOSEN_PREF,
  IDLE_LOGIN_PATH,
  idlePhase,
  idleSecondsLeft,
  idleTimeoutMs,
  idleWarnMs,
  parseStoredActivity,
} from "./idleSignOut.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIN = 60_000;

test("T5: unset keeps today's behaviour — no row (GET's 60 default) or another tab's 60 is not enforced", () => {
  assert.equal(idleTimeoutMs({ session_timeout_minutes: 60, preferences: {} }), null);
  assert.equal(idleTimeoutMs({ session_timeout_minutes: 60 }), null);
  assert.equal(idleTimeoutMs(null), null);
  assert.equal(idleTimeoutMs({}), null);
});

test("T5: a chosen timeout is enforced — the explicit flag (60 too) or a non-default value", () => {
  assert.equal(idleTimeoutMs({ session_timeout_minutes: 60, preferences: { [IDLE_CHOSEN_PREF]: true } }), 60 * MIN);
  assert.equal(idleTimeoutMs({ session_timeout_minutes: 15, preferences: {} }), 15 * MIN);
  assert.equal(idleTimeoutMs({ session_timeout_minutes: 240 }), 240 * MIN);
});

test("T5: absurd stored values are ignored, never a lock-out", () => {
  for (const v of [0, -5, 1, 4, 100000, Number.NaN, "15", null]) {
    assert.equal(idleTimeoutMs({ session_timeout_minutes: v, preferences: { [IDLE_CHOSEN_PREF]: true } }), null, String(v));
  }
});

test("T5: the warning comes 60 s before (a quarter of a short timeout), then the sign-out", () => {
  const t = 15 * MIN;
  assert.equal(idleWarnMs(t), 60_000);
  assert.equal(idleWarnMs(2 * MIN), 30_000);
  const last = 1_000_000;
  assert.equal(idlePhase(last, last + t - 60_001, t), "active");
  assert.equal(idlePhase(last, last + t - 60_000, t), "warn");
  assert.equal(idlePhase(last, last + t - 1, t), "warn");
  assert.equal(idlePhase(last, last + t, t), "expired");
  assert.equal(idleSecondsLeft(last, last + t - 30_000, t), 30);
  assert.equal(idleSecondsLeft(last, last + t + 5_000, t), 0);
  // a clock that went backwards is not idleness
  assert.equal(idlePhase(last, last - 10_000, t), "active");
});

test("T5: the shared last-activity value is read defensively", () => {
  const now = 5_000_000;
  assert.equal(parseStoredActivity("4000000", now), 4_000_000);
  assert.equal(parseStoredActivity("9000000", now), now); // a future stamp counts as now
  assert.equal(parseStoredActivity("abc", now), null);
  assert.equal(parseStoredActivity(null, now), null);
  assert.equal(parseStoredActivity("0", now), null);
});

test("T5: wiring — root layout mounts the guard, SecurityTab saves the choice flag and the honest label changed", () => {
  assert.match(read("src/app/layout.tsx"), /<SessionIdleGuard \/>/);
  const tab = read("src/app/settings/components/tabs/SecurityTab.tsx");
  assert.match(tab, /preferences: \{ \[IDLE_CHOSEN_PREF\]: true \}/);
  assert.match(tab, /IDLE_SETTINGS_EVENT/);
  assert.doesNotMatch(tab, /لا يُنهي المنصّة جلستك تلقائياً بعد/);
  const hook = read("src/hooks/useSessionIdleGuard.ts");
  assert.match(hook, /logout\(IDLE_LOGIN_PATH\)/);
  assert.match(hook, /isSupabaseMode/);
  assert.equal(IDLE_LOGIN_PATH, "/login?reason=idle");
  assert.match(read("src/app/login/page.tsx"), /get\("reason"\) === "idle"/);
  // PUT /api/v1/settings merges the flag into preferences (it is not a PATCH-owned key)
  assert.doesNotMatch(read("src/lib/services/preferencesMerge.ts"), new RegExp(`"${IDLE_CHOSEN_PREF}"`));
});
