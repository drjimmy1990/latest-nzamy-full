/**
 * orderTransitions.ts — Task 1 (owner decision س٢, 20 August).
 *
 * Which statuses a requester may cancel an `ai_workspace` order from.
 *
 * As of this change the client UI only ever offers the cancel button inside
 * these statuses — both of its gates are subsets, and one of them was not
 * before (audited at the bottom of this comment). But that is presentation,
 * not enforcement — a direct PATCH of
 * /api/v1/service-requests/[id] bypasses it entirely, and until this module
 * existed that route's `ai_workspace` branch checked only *who* was asking
 * and *what* they asked for, never the order's current status. So a delivered
 * order could be cancelled out from under a real deliverable. This is the
 * enforcement.
 *
 * It deliberately fails closed: a status not listed here is refused, so
 * adding a new status later cannot silently reopen the hole. That cuts both
 * ways, which is why the four non-`draft` entries are derived from the actual
 * producers of `ai_workspace` rows rather than guessed at (`draft` is in the
 * set for a different reason — see the paragraph on it below). All three
 * producers were enumerated:
 *
 *   - `createServiceOrder` (src/lib/services/serviceOrders.ts:57) —
 *     hardcodes `status: "pending_assignment"`.
 *   - /dashboard/client/consultation/new (page.tsx:164-165) — sends
 *     `receiver: "ai_workspace"` with
 *     `status: path === "lawyer" && consultationIncluded ? "pending_assignment" : "pending_payment"`,
 *     and on the AI path that ternary is always `"pending_payment"`.
 *   - /dashboard/client/requests/new (page.tsx:154-155) — sends
 *     `receiver: serviceInfo.receiverType` (five clientServiceCatalog entries
 *     carry `receiverType: "ai_workspace"`: ai-consult, contract-draft,
 *     ai-letter, contract-analyze, ai-case-eval) with
 *     `status: finalTotal > 0 ? "pending_payment" : "pending_assignment"`.
 *     Which branch fires was NOT traced — all five of those entries carry
 *     `requiresPayment: false`, but `finalTotal` comes from
 *     `quoteClientService`, not from `basePrice` directly. Treat this one as
 *     "produces pending_assignment, and possibly pending_payment"; the
 *     consultation booking above is the case that is certain.
 *
 * So `pending_payment` is a live, ordinary state for an AI order that the
 * client has always been able to cancel — and must still be able to, because
 * there is no payment provider in this codebase to advance such a row out of
 * it. `assigned` and `in_review` are the admin-side states the order passes
 * through before delivery.
 *
 * `draft` is listed, and it is the one entry not derived from a producer.
 * No producer of an `ai_workspace` row creates one as `draft`: the three
 * above all write `pending_assignment`/`pending_payment`, and
 * /ai/contract-drafter (page.tsx:103-104 — the only other writer of
 * `receiver: "ai_workspace"`) writes `completed`. It is nonetheless
 * *creatable*: the POST route's CREATE_STATUS_ALLOWLIST
 * (src/app/api/v1/service-requests/route.ts:182-187) accepts `"draft"`
 * verbatim next to a client-supplied `receiver`, and the service_requests
 * CHECK constraint
 * (supabase/migrations/20260518_client_workflow_backend_ready.sql:13) permits
 * it. It is in the set because the unified «طلباتي» page offers a cancel
 * button on it (see the gate audit below), and a button whose action the
 * server refuses is the thing this module exists to prevent. Letting a client
 * cancel their own not-yet-anything draft costs nothing — it is by definition
 * not delivered, which is the state owner decision س٢ is about — and it
 * cannot be used to launder a delivered order: reaching `draft` from
 * `completed` would itself be a status PATCH, and the `ai_workspace` branch
 * of the PATCH route permits a requester exactly one target, `"cancelled"`
 * (route.ts:255-258), so a requester can never move a row *into* `draft`.
 *
 * The fail-closed property is unchanged by including it: `completed` and
 * `cancelled` are still refused, and so is any status this module does not
 * model — `""`, `"foo"`, or whatever gets added to the schema next year.
 *
 * ── The two client-side cancel gates ──────────────────────────────────────
 *
 * For `ai_workspace` orders — the only rows this module governs — there are
 * exactly two client surfaces that decide whether to offer a cancel, and as
 * of this change both are subsets of REQUESTER_CANCELLABLE. "Exactly two" is
 * from a sweep of src/app and src/components for `status: "cancelled"` and
 * for the «إلغاء الطلب» label, not from memory; everything else that turned
 * up is out of this module's reach (the lawyer contracts/cases pages write
 * `receiver: "lawyer"` rows — see the scope note below; /dashboard/admin/
 * service-orders' cancel button goes to the admin route, which uses
 * `createServiceClient()` and never enters this handler; the rest are audit-
 * log labels or mock arrays, not gates):
 *
 *   1. `OPEN_ORDER_STATUSES` — src/app/ai/orders/[id]/_components/
 *      openOrderStatuses.ts:34. That constant has three consumers; the one
 *      that gates cancel is OrderActions.tsx (`CANCELLABLE_STATUSES`, :42),
 *      the order detail page at /ai/orders/[id]. The narrower three
 *      (`pending_assignment`, `assigned`, `in_review`); it omits
 *      `pending_payment` and `draft`. Always was a subset.
 *   2. The unified «طلباتي» page — src/app/dashboard/client/requests/
 *      page.tsx:213 (the card button) and :483 (the same gate repeated in the
 *      detail modal), both `pending_assignment || pending_payment || draft`.
 *      This one was NOT a subset until now: `draft` was absent from
 *      REQUESTER_CANCELLABLE, so that button offered a cancel the server
 *      answered with 403 «غير مسموح بتنفيذ هذا الإجراء» (the page renders it
 *      as «لا يمكن إلغاء هذا الطلب في وضعه الحالي.»). Adding `draft` here is
 *      what closed the gap; the gate itself was left alone.
 *
 * Anchor on the constant/gate names, not the line numbers, when they drift.
 * The sets are intentionally NOT shared: both client ones live inside App
 * Router `_components`/page files and answer presentation questions (show the
 * delivery-time card, offer the cancel button); this one is the server's
 * authority and must not depend on a UI module. The divergence now runs only
 * in the safe direction — a client gate may withhold a button the server
 * would have honoured (gate 1 does, for `pending_payment`), never offer one
 * the server then refuses.
 *
 * Scope note: this claim covers `ai_workspace` rows only. «طلباتي» lists the
 * client's rows of every `receiver`, and for a non-`ai_workspace` row the
 * PATCH route never consults this module — that branch (route.ts:276-277)
 * allows `isRequester && targetStatus === "cancelled"` from any source status
 * at all, so its cancels are permitted by a different mechanism, not by this
 * set.
 */

const REQUESTER_CANCELLABLE = new Set([
  "draft",
  "pending_assignment",
  "pending_payment",
  "assigned",
  "in_review",
]);

export function canRequesterCancel(currentStatus: string): boolean {
  return REQUESTER_CANCELLABLE.has(currentStatus);
}
