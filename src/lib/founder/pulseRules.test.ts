import assert from "node:assert/strict";
import test from "node:test";
import {
  PULSE_FIRST_DELAY_MS,
  PULSE_IDLE_MS,
  PULSE_SNOOZE_MS,
  pulseDecision,
  type PulseInput,
} from "./pulseRules.ts";

const at = (over: Partial<PulseInput> = {}): PulseInput => ({
  now: 0,
  mountedAt: 0,
  lastScrollAt: null,
  dismissedAt: null,
  joinInView: false,
  offerActive: true,
  narrow: false,
  ...over,
});

test("never before 25 s on the page; asks to be re-checked at 25 s", () => {
  assert.deepEqual(pulseDecision(at({ now: 24_999 })), { visible: false, recheckAt: PULSE_FIRST_DELAY_MS });
  assert.deepEqual(pulseDecision(at({ now: 25_000 })), { visible: true, recheckAt: null });
});

test("hidden while scrolling; back 2.5 s after the last scroll", () => {
  const scrolling = pulseDecision(at({ now: 40_000, lastScrollAt: 39_000 }));
  assert.deepEqual(scrolling, { visible: false, recheckAt: 39_000 + PULSE_IDLE_MS });
  assert.equal(pulseDecision(at({ now: 41_500, lastScrollAt: 39_000 })).visible, true);
  // A scroll before 25 s does not shorten the first delay.
  assert.deepEqual(pulseDecision(at({ now: 10_000, lastScrollAt: 9_000 })).recheckAt, PULSE_FIRST_DELAY_MS);
});

test("× hides it for 90 s", () => {
  const d = pulseDecision(at({ now: 60_000, dismissedAt: 50_000 }));
  assert.deepEqual(d, { visible: false, recheckAt: 50_000 + PULSE_SNOOZE_MS });
  assert.equal(pulseDecision(at({ now: 140_000, dismissedAt: 50_000 })).visible, true);
});

test("never over the join card, when the offer is not active (full/ended), or on a phone", () => {
  for (const over of [{ joinInView: true }, { offerActive: false }, { narrow: true }]) {
    assert.deepEqual(pulseDecision(at({ now: 100_000, ...over })), { visible: false, recheckAt: null });
  }
});
