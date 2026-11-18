/**
 * testSeatRelease.ts — «تحرير المقاعد التجريبية» (batch l7, decision 3; launch
 * gap item 17): after a founder journey test, the admin frees the seats that
 * test accounts took, so they never sit in the founder count.
 *
 * Which seats (pure, tested in testSeatRelease.test.ts):
 *   - a seat that still holds (status not released / revoked) AND carries an
 *     order, AND
 *   - its order was paid in Moyasar TEST mode (payment_orders.live = false), OR
 *     its holder is a test account (testAccountIds.ts) and its order was never
 *     paid live (live is null: unpaid, or a reservation).
 * NEVER a seat whose order was paid LIVE (live = true), even a test
 * account's: real money was taken, so that seat goes through a refund
 * (the refund path revokes it), never through this button. Those are listed
 * apart («skippedLive») so the admin sees them.
 * A test account's seat with no order cannot be revoked by order — listed
 * apart too («skippedNoOrder»).
 *
 * The route (api/v1/admin/founder/test-seats) revokes each one through the
 * existing public.founder_revoke(order, reason) — the seat becomes 'revoked',
 * its credits go to 0, its library grant closes and the founder badge drops
 * when no other active seat is left. No seat SQL of its own.
 *
 * Pure: no imports, so `node --test` loads it.
 */

export const TEST_SEAT_RELEASE_REASON = "test_account_release";

export interface SeatForRelease {
  seatId: string;
  userId: string | null;
  orderId: string | null;
  status: string;
  /** payment_orders.live of the seat's order (null: no payment yet / no order / unknown). */
  orderLive: boolean | null;
}

export interface TestSeatPlan {
  release: SeatForRelease[];
  skippedLive: SeatForRelease[];
  skippedNoOrder: SeatForRelease[];
}

const DONE = new Set(["released", "revoked"]);

export function planTestSeatRelease(seats: readonly SeatForRelease[], testIds: ReadonlySet<string>): TestSeatPlan {
  const plan: TestSeatPlan = { release: [], skippedLive: [], skippedNoOrder: [] };
  for (const s of seats) {
    if (DONE.has(s.status)) continue;
    const isTest = typeof s.userId === "string" && testIds.has(s.userId);
    if (s.orderLive === true) {
      if (isTest) plan.skippedLive.push(s);
      continue;
    }
    if (s.orderLive === false || isTest) {
      if (!s.orderId) plan.skippedNoOrder.push(s);
      else plan.release.push(s);
    }
  }
  return plan;
}

export type RevokeOutcome = "revoked" | "none" | "error";

export interface ReleaseSummary {
  revoked: number;
  none: number;
  failed: number;
}

export function summarizeRelease(outcomes: readonly RevokeOutcome[]): ReleaseSummary {
  return {
    revoked: outcomes.filter((o) => o === "revoked").length,
    none: outcomes.filter((o) => o === "none").length,
    failed: outcomes.filter((o) => o === "error").length,
  };
}

/** The admin's one-line answer, Arabic, honest about what did not happen. */
export function releaseMessageAr(s: ReleaseSummary, skippedLive: number): string {
  const parts = [`حُرِّر ${s.revoked} مقعد تجريبي.`];
  if (s.none > 0) parts.push(`${s.none} لم يعد محجوزاً عند التنفيذ.`);
  if (s.failed > 0) parts.push(`تعذّر تحرير ${s.failed} — أعد المحاولة.`);
  if (skippedLive > 0) parts.push(`${skippedLive} مقعد لحساب تجريبي دُفع دفعاً حقيقياً لم يُمسّ؛ يُحرَّر بالاسترداد.`);
  return parts.join(" ");
}
