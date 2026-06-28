---
name: payments-gateway-admin-gate
description: How the admin payment-gateway toggle works and where its call-sites are gated
metadata: 
  node_type: memory
  type: project
  originSessionId: d4d12ca2-bdbe-44d9-9bc4-15d6f3a55652
---

The real payment provider is **not decided yet**. Instead of wiring a gateway, an admin-controlled runtime flag gates all payment flows.

- `platform_settings.payments_gateway` = `{ status: "disabled" | "test" | "live", provider?: string | null }` (seed default `disabled`).
- Server reader: `getPaymentGatewayStatus()` in `src/lib/access-control.ts`. Public mirror: `GET /api/v1/payments/status` + `usePaymentsStatus()` hook.
- Admin UI: `src/app/dashboard/admin/settings/page.tsx` Section "بوابة الدفع" (3 status buttons + provider field); sidebar link added in `AdminSidebar.tsx`. `ALLOWED_SETTINGS_KEYS` includes `payments_gateway` (and `tier_limits`).
- The 3 `createPaymentIntentStub` call-sites (`client/consultation/new`, `client/requests/new`, `client/find-lawyer`) short-circuit when `status === "disabled"`: submit blocked with "الدفع غير متاح حالياً", no request created. In `test`/`live` the stub still runs (real provider wiring stays deferred).
- Server-side defense in `src/app/api/client-workflow/_supabase.ts` rejects stub-paid requests when disabled.
- Wallet/finance amber "gateway being activated" banners should render only when `status !== "live"`.

When the user picks a real provider later: replace `createPaymentIntentStub` body + flip status to `test`/`live`. See [[nzamy-audit-fix-status]].