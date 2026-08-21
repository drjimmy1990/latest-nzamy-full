/**
 * openOrderStatuses.ts
 *
 * Single source of truth for "which statuses count as an order still being
 * open" — nothing delivered or cancelled yet. Three call sites each ask a
 * related but distinct question that starts from this same set:
 *
 *   - page.tsx's TIMELINE_STATUSES: whether to show the progress strip at
 *     all (that set is this one plus "completed" — completed orders still
 *     get a maxed-out timeline, just not the delivery-time card below).
 *   - OrderTimeline.tsx: whether to show the owner-ruled delivery-time card
 *     ("متوسط وقت التسليم المتوقع: خلال ٤ – ٢٤ ساعة") — must show on these
 *     three and only these three, never on "completed" or "cancelled".
 *   - OrderActions.tsx: whether to offer the cancel button — a deliberate
 *     client-side subset of what the server accepts (see that file's own
 *     comment: since owner decision س٢ the server's ai_workspace gate does
 *     check the source status, against the five in REQUESTER_CANCELLABLE —
 *     src/lib/services/orderTransitions.ts:115-121 — so these three have
 *     always been a subset of it, and `draft`/`pending_payment` are withheld
 *     here by choice rather than by the server).
 *
 * These three used to be three independently hand-written literals that
 * happened to agree. A future edit to "what counts as open" in one of them
 * without the other two would have silently desynced the cancel button from
 * the delivery-time card — and that card's wording/visibility is the
 * owner's explicit ruling (2026-08-20 review), not something to drift by
 * accident. One shared constant instead.
 *
 * Typed as ReadonlySet<string>, not ReadonlySet<ServiceOrder["status"]>:
 * OrderTimeline.tsx's `status` prop is deliberately plain `string` (it's
 * handed order.status but shouldn't have to import ServiceOrder just to
 * type-check a prop it only ever compares by value), and a narrower
 * ReadonlySet<ServiceOrder["status"]>.has() would reject that wider string
 * at the call site.
 */

export const OPEN_ORDER_STATUSES: ReadonlySet<string> = new Set([
  "pending_assignment",
  "assigned",
  "in_review",
]);
