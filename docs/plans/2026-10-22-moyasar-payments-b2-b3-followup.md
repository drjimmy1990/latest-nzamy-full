# Follow-up scope after B1

This is the prepared sequence for the remaining owner decisions. It does not describe shipped or implemented behavior. B1's existing branch remains the work branch unless the user instructs otherwise; no new branch, task, payment, deployment or production SQL is implied by this file.

## B2: renewal, monthly points and metering

1. Add a durable renewal job keyed by subscription and billing period. Reserve the job before any gateway charge. Ambiguous timeouts must reconcile provider evidence rather than charge again. Grant idempotency must hold across callback, webhook, sweep and retries.
2. Use only active, known-mode, platform-owned saved cards for renewals. Merchant account and test/live mode must match. Reminder three days before; attempts day 0/+3/+6; seven-day grace and downgrade after exhaustion. A 3DS/CVC requirement supplies a checkout link rather than inventing an unattended success.
3. Issue monthly points to both plans that advertise them. A yearly order must not reuse `(order_id, source='plan_monthly')` for twelve lots: use a per-cycle key/order with a unique cycle grant. Do not extend or roll unused points into the next monthly cycle. Cover repeated job delivery and yearly billing explicitly.
4. Assistant charges one point through the nearest-expiry debit RPC; enforce only after rollout checks. Decide the charge boundary around successful assistant work and handle failed generation honestly. No double debit from retries and no fabricated balance after outages.
5. Pro-rata upgrades use integer halalas, an explicit displayed quote, saved card and enabled auto-renew. Track unpaid differences durably; turning renewal off with a difference owed charges it immediately under the owner's rule. Confirm before claiming the upgrade is active.
6. Tests must drive gateway failure, racing jobs, grace expiry, mode mismatch, duplicate charge evidence, monthly grant boundaries and insufficient balance. Prepare independent review and deployment SQL with raising verifies. Keep the B1 manual purchase and refund paths compatible.

## B3: links, bank transfers and office payments

1. Admin payment links for contact-only plans through Moyasar invoices. Server fixes price, legal entity, audience and VAT. Expiring/superseded links and paid-but-unmatched events remain reviewable.
2. Bank transfers require super-admin verified evidence and an audit trail. Never write `status='paid'` and leave `fulfilled_at` null in a way that bypasses the verified B1 claim. Use a separate verified settlement function/source with the same grant idempotency.
3. Office consultations/services use the office's own environment keys and merchant, separate company data and receipts. Customer sees the fee after office confirmation; fixed-price services pay at booking. Platform tokens must not be sent to the office account.
4. Address the existing service-request `payments.status='pending'` CHECK mismatch with a reproducing test before wiring office payment. Inspect contract and live prerequisites rather than extending an enum blindly.
5. Review cancellation/refund semantics for appointments and office services, least-privilege staff actions, and replay behavior. Test synthetic HTTP first, then real test-key staging for each merchant. Prepare SQL/order/settings handoff separately.

## Carry forward

- B1 same-rank periods stack; upgrades currently have no proration. Do not erase paid remaining days during migration to renewal.
- B1 plan refund can restore recorded valid predecessors; older replaced purchases require period review. Preserve that provenance.
- Refunded, unmatched and orphan webhook rows must remain visible to administrators. No silent success after a lost write.
- Exact gateway support for payment listing, intent retries, callback parameters, token charges and invoice flows must be confirmed with the user's provider reference and test environment before dependent implementation.
