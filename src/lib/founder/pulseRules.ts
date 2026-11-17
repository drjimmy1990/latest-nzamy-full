/**
 * pulseRules.ts — when the /founder pulse popup («الحق قبل فوات الأوان») may
 * show (owner F4, BACKEND-SPEC §11 and §12.5):
 *   - never before 25 s on the page;
 *   - hidden while the visitor scrolls; back after 2.5 s without scrolling;
 *   - × hides it for 90 s;
 *   - never while the join card is in view, when the seats are full, or
 *     outside the pre/opening/live phases;
 *   - never on a narrow (phone) screen, where a fixed card would cover the
 *     text being read — the page's own buttons serve phones.
 * `prefers-reduced-motion` only removes the pulse and the slide (CSS); it
 * does not change these rules.
 *
 * `pulseDecision` answers whether it is visible now and, when only time is
 * in the way, the instant to look again — so the component schedules one
 * timeout instead of polling.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const PULSE_FIRST_DELAY_MS = 25_000;
export const PULSE_IDLE_MS = 2_500;
export const PULSE_SNOOZE_MS = 90_000;
/** Widths up to this (px) count as narrow: Tailwind's `sm` breakpoint minus one. */
export const PULSE_NARROW_MAX_PX = 639;

export interface PulseInput {
  /** Now, ms (any monotonic-enough clock, the same one for every field). */
  now: number;
  /** When the page mounted. */
  mountedAt: number;
  /** The last scroll event, or null when the visitor has not scrolled. */
  lastScrollAt: number | null;
  /** When × was pressed last, or null. */
  dismissedAt: number | null;
  /** The join card intersects the viewport. */
  joinInView: boolean;
  /** The offer can be joined or is about to open (pre / opening / live) and seats are not full. */
  offerActive: boolean;
  /** The viewport is ≤ PULSE_NARROW_MAX_PX wide. */
  narrow: boolean;
}

export interface PulseDecision {
  visible: boolean;
  /** When to evaluate again (same clock as `now`), or null when only an event can change the answer. */
  recheckAt: number | null;
}

export function pulseDecision(i: PulseInput): PulseDecision {
  if (!i.offerActive || i.joinInView || i.narrow) return { visible: false, recheckAt: null };
  const notBefore = Math.max(
    i.mountedAt + PULSE_FIRST_DELAY_MS,
    i.lastScrollAt === null ? -Infinity : i.lastScrollAt + PULSE_IDLE_MS,
    i.dismissedAt === null ? -Infinity : i.dismissedAt + PULSE_SNOOZE_MS,
  );
  if (i.now >= notBefore) return { visible: true, recheckAt: null };
  return { visible: false, recheckAt: notBefore };
}
