/**
 * couponAttempts.ts — the per-buyer budget of coupon tries (P7 review,
 * finding 4). A coupon answer is a small oracle (does this code exist for me,
 * what minimum does it need), so guesses are limited per SIGNED-IN USER —
 * both routes that answer one require a session — not per forgeable header:
 *
 *   - POST /api/v1/coupons/validate spends one try per preview;
 *   - POST /api/v1/payments/checkout spends one try per coupon REFUSAL
 *     (unknown / used / below the minimum / not for this item / pending in
 *     another order), so a buyer who previewed once and pays is never
 *     counted twice, while a script that skips the preview and guesses
 *     through checkout drains the same budget.
 * Both look first (`check`) and answer 429 RATE_LIMITED_AR before reading the
 * database once the budget is spent. src/proxy.ts keeps an X-Real-IP ceiling
 * on the preview route in front of this.
 *
 * STORAGE: one process's memory, fixed window — the same guarantee and the
 * same limits as src/lib/rateLimit.ts (single pm2 instance today; resets on a
 * deploy). Bounded: past MAX_KEYS entries the expired ones go, then the
 * oldest.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const COUPON_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const COUPON_ATTEMPT_MAX = 20;
export const RATE_LIMITED_AR = "طلبات كثيرة — حاول بعد قليل.";

const MAX_KEYS = 20_000;

export interface CouponAttemptBudget {
  /** May this buyer try a code now? Spends nothing. */
  check(userId: string): { ok: true } | { ok: false; retryAfterSeconds: number };
  /** One try spent. */
  spend(userId: string): void;
}

export function createCouponAttemptBudget(
  opts: { max?: number; windowMs?: number; clock?: () => number } = {},
): CouponAttemptBudget {
  const max = opts.max ?? COUPON_ATTEMPT_MAX;
  const windowMs = opts.windowMs ?? COUPON_ATTEMPT_WINDOW_MS;
  const clock = opts.clock ?? Date.now;
  const store = new Map<string, { start: number; count: number }>();

  const live = (userId: string, now: number) => {
    const e = store.get(userId);
    return e && now - e.start < windowMs ? e : null;
  };

  function trim(now: number): void {
    if (store.size <= MAX_KEYS) return;
    for (const [k, e] of store) if (now - e.start >= windowMs) store.delete(k);
    for (const k of store.keys()) {
      if (store.size <= MAX_KEYS) break;
      store.delete(k);
    }
  }

  return {
    check(userId) {
      const now = clock();
      const e = live(userId, now);
      if (!e || e.count < max) return { ok: true };
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((e.start + windowMs - now) / 1000)) };
    },
    spend(userId) {
      const now = clock();
      const e = live(userId, now);
      if (e) e.count += 1;
      else {
        store.delete(userId);
        store.set(userId, { start: now, count: 1 });
      }
      trim(now);
    },
  };
}

/** The one budget both routes share in this process. */
export const COUPON_ATTEMPTS: CouponAttemptBudget = createCouponAttemptBudget();
