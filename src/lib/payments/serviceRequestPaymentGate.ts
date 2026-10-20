/**
 * serviceRequestPaymentGate.ts — may POST /api/v1/service-requests accept a
 * paid request (payment.amount > 0)?
 *
 * Controller ruling (B1 Task 4, fix round 1): B1 sells plans, library access
 * and top-ups through Moyasar; paying for a service request (consultations,
 * office services) is B3. Until B3, a paid service request is accepted only
 * through the enabled staging stub. With Moyasar on (test or live) it is
 * refused with a 402, so no orphan `pending_payment` request is created with
 * nothing to pay it (B3 also owns the payments.status 'pending' CHECK bug).
 *
 * Pure: no runtime imports, so `node --test` loads it directly.
 */

import type { PaymentGatewayState } from "../paymentGatewayPolicy.ts";

/** The route's own test: a positive numeric payment.amount. */
export function isPaidServiceRequest(payment: unknown): boolean {
  return (
    typeof payment === "object" &&
    payment !== null &&
    Number((payment as { amount?: unknown }).amount) > 0
  );
}

/** A paid request passes only through the enabled stub, until B3. */
export function paidServiceRequestAllowed(gateway: PaymentGatewayState): boolean {
  return !gateway.disabled && gateway.provider === "stub";
}
