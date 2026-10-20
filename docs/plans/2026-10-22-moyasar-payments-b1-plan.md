# Moyasar Payments B1 (pay online, test mode first) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can buy a plan, a library plan or a points top-up with mada / Visa / Mastercard / Apple Pay through Moyasar, and get it activated automatically. An admin can see every order and refund it. Everything works in Moyasar test mode before the live keys exist.

**Architecture:**
- **One server-side price catalog** quotes every sold item in halalas, with VAT.
- **Checkout.** The browser fulfils a Moyasar *payment intent* the server created, so the server fixes the amount.
- **Fulfilment.** One idempotent function, `fulfillOrder`, re-fetches the payment from Moyasar with the secret key and grants the purchase. Three paths reach it: the callback page, the webhook, and a sweep. One conditional UPDATE makes sure it runs once.
- **Points.** Points live in expiring batches ("lots"). This is W8 redesigned.

**Tech Stack:** Next.js 16 (src/proxy.ts), self-hosted Supabase (Postgres, PostgREST v12), Moyasar REST API v1 + `moyasar-payment-form@2.3.0` (npm, exact pin), node:test, the Docker RLS harness.

**Spec:**
- The Moyasar docs: the user's `C:\Users\LOQ\Desktop\moyasar.txt`. Sections: Payment Intents, Tokenization, Payment Operations (void / refund), Webhook Reference, Idempotency, Metadata, Test Cards.
- The owner's answers of 2026-10-20 (project memory `payments-moyasar-owner-answers-2026-10-20.md`):
  - ٢٣٥ (ب): everything is paid online;
  - ٢٣٨ (أ): an aggregator account for the platform;
  - ٢٣٩ / ٢٤٨ (ب): VAT-exclusive for businesses, VAT-inclusive for individuals and insurance;
  - ٢٤٠ / ٢٥٠: the platform issues a receipt, and the accountant issues the tax invoice;
  - ٢٤١: auto-renew from the saved card (built in B2; B1 saves the card);
  - ٢٤٣: mada + Visa + Mastercard + Apple Pay;
  - ٢٤٤ / ٢٤٩: top-up validity 100→3m, 250→3m, 500→6m, 1000→12m, nearest-expiry used first; plan points reset each cycle;
  - ٢٤٦: manual requests stay;
  - ٢٥١: statement name NEZAMY;
  - ٢٥٢: refunds by the super admin only, audited;
  - ٢٢٤: points balances are kept;
  - ٢٢٧: the assistant costs 1 point (B2).
- Refund policy (`src/app/refund-policy/page.tsx`, owner ١٨٠): a 14-day withdrawal right on digital plans, refunded to the original card. Points are prepaid AI usage units only: they are never transferred, never pay a lawyer and are never cashed out (owner ١٧٨, `src/constants/pricing/pricing.lawyers.ts:9-13`).

**Later batches (separate plans, not in B1):**
- **B2:** auto-renewal from the saved token, with a reminder 3 days before, retries on day 0/+3/+6, and a downgrade after 7 days. A declined 3-D Secure or CVC charge sends a pay-yourself link. Also in B2:
  - monthly plan points;
  - the assistant's 1-point charge and switching enforcement on;
  - pro-rata upgrades (٢٥٣): they need a saved card with auto-renew on, and turning auto-renew off while a difference is owed charges it now.
- **B3:**
  - admin payment links (Moyasar invoices) for contact-only plans (٢٤٥);
  - marking a bank transfer paid;
  - consultations and services through مكتب نظامي's own Moyasar account (٢٤٧): «ادفع الآن» after the office confirms the fee, fixed-price services paid at booking (٢٥٤). B3 also fixes the `payments.status 'pending'` CHECK bug in `src/app/api/v1/service-requests/route.ts:646-656` with a test.

## Global Constraints

The 18 Oct batch's global constraints apply (the SDD workspace copy `global-constraints.md`), with these additions:

- **Branch and migrations:** branch `batch/2026-10-22-payments-b1`. Migration range `20261022_10–49`.
- **Money:** every amount in payment code is an integer number of halalas (1 SAR = 100). SAR strings are produced only by `formatHalalas` in `catalog.ts`. Never use floats for money.
- **VAT is 15%.**
  - `exclusive`: `vat = round(net * 15 / 100)` and `total = net + vat`.
  - `inclusive`: `total = listed price` and `vat = total - round(total * 100 / 115)`.
  - Rounding is half-up on halalas.
- **Keys** come from the environment only and are never logged, returned or committed:
  - `MOYASAR_SECRET_KEY`
  - `NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY`
  - `MOYASAR_WEBHOOK_SECRET`
  
  The office variables (`MOYASAR_OFFICE_*`) belong to B3.
- **Mode guard.**
  - `platform_settings.payments_gateway = {status: 'disabled'|'test'|'live', provider: 'moyasar'}`.
  - `test` requires `sk_test_` / `pk_test_` keys, and `live` requires `sk_live_` / `pk_live_`. Any mismatch, missing key or other status resolves to disabled.
  - `live` also requires a complete `billing_company` setting.
- **Truth:**
  - A payment counts as paid only after the server fetches it from Moyasar with the secret key. Its `status` must be `paid`, `amount` and `currency` must equal the order's, and `live` must match the mode.
  - The browser's report and the webhook body are only triggers.
- **Webhook:**
  - compare `secret_token` with `crypto.timingSafeEqual` over equal-length buffers;
  - store the event `id` and ignore repeats (Moyasar retries 6 times);
  - always return 2xx quickly once the secret is valid;
  - exclude the route from the general rate limiter, like `/api/v1/cron/`.
- **Idempotency:** the order id (uuid v4) is sent to Moyasar as `metadata.order_id`, and as `given_id` on any server-created payment.
- **Copy:**
  - Arabic only on new screens. No «فاتورة ضريبية» on receipts: the receipt says «إيصال دفع», and the tax invoice is issued by the accountant (٢٥٠).
  - Business prices carry the owner's sentence verbatim: «الأسعار غير شاملة ضريبة القيمة المضافة ١٥٪ وتُضاف عند الدفع ويصدر بها فاتورة ضريبية رسمية».
  - Individual prices carry «الأسعار شاملة ضريبة القيمة المضافة».
- **Points are not money:** they cannot be transferred or cashed out, and a refunded top-up goes back to the original card only (owner ١٧٨).
- **Pure logic lives in modules with relative imports and node:test tests.** That covers:
  - the quote;
  - the fulfilment decision;
  - the webhook check;
  - the lot-consumption order;
  - the refund-reversal decision;
  - the gateway resolution.
  
  Route tests in this repo are source-contract tests (see `src/app/api/v1/admin/entitlements/requests/[id]/route.test.ts`). SQL behaviour is proven with Docker tests.

## Rulings carried into this plan (owner report lists them)

1. **Tier per sold item.** Nothing maps plans to tiers today; an admin picks the tier by hand. The ruling, in the order of price and rank:

   | Item | Tier |
   |---|---|
   | `ind-ai` | `ai` |
   | `ind-preventive` | `pro` |
   | `ind-litigation` | `max` |
   | `lawyer-pro` | `pro` |
   | `consultant-independent` | `pro` |
   | `firm-basic` | `corp` |
   | `firm-enterprise` | `enterprise` |

2. **VAT mode.**
   - For items with one audience, the item fixes it:
     - business (exclusive): `lawyer-pro`, `consultant-independent`, `firm-*`, `topup-*`;
     - individual (inclusive): `ind-*`.
   - For library plans (`lib-q1`, `lib-q2`, `lib-annual`), the **buyer** decides: `profiles.user_type` of `lawyer`, `provider`, `firm`, `corporate`, `business`, `government` or `ngo` → exclusive; anything else → inclusive.
3. **«التأمين القانوني» (`ind-litigation`, `requiresUnderwriting`).** Payment buys the main holder's cover. Dependents stay by request, as the pricing card already says.
4. **Firm plans** grant the tier to the paying account only, because firm seats are not modelled (`firm_members` is never written). Checkout promises nothing more.
5. **Existing points.** Every non-zero `lawyer_profiles.credit_balance` becomes one lot with source `migrated`, expiring 12 months after the migration runs. The owner kept balances (٢٢٤); the expiry is our ruling.
6. **Sold online in B1:**
   - `lawyer-pro`, `consultant-independent`, `ind-ai`, `ind-preventive`, `ind-litigation`, `firm-basic` and `firm-enterprise`, each monthly and yearly;
   - `lib-q1`, `lib-q2`, `lib-annual`;
   - `topup-100`, `topup-250`, `topup-500`, `topup-1000`.
   
   Everything whose CTA goes to `/contact` waits for B3 payment links.
7. **Without auto-renew (B2), a B1 plan ends at its period end.** The card is still saved now (`save_card: true`), so B2 can renew without asking again.

## Review Focus

1. **The same payment arriving three times** (callback, webhook and sweep at once) must grant exactly once. Task 5's Docker test drives the conditional update twice; the unit test drives `fulfillDecision` with an already-paid order.
2. **A tampered amount:** a Moyasar payment of a different amount, a different currency, or `live` disagreeing with the mode must never grant. Task 5 tests all three.
3. **Keys and mode disagreeing** (`sk_live_` while the admin chose test, or keys missing) must resolve to disabled, and checkout must return 503 with Arabic copy. Task 4 tests it.
4. **Expired lots must not count, and debits use the nearest expiry first,** including a debit that spans two lots. Task 2 tests it in Docker.
5. **A refund after points were used, or after the library was opened,** must reverse what can be reversed and never make a balance negative. Task 9 tests the decision.

---

### Task 1: Payments schema

**Files:**
- Create: `supabase/migrations/20261022_10_payments_core.sql`
- Create: `supabase/tests/rls/payments_core.test.sql`
- Modify: `supabase/migrations/_verify.sql`

**Interfaces (produces):**
- **`public.payment_orders`:**
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null → auth.users on delete restrict`
  - `merchant text not null default 'platform' check in ('platform','office')`
  - `kind text check in ('plan','library','topup','service')`
  - `item_id text not null`
  - `billing text check in ('monthly','yearly','once')`
  - `net_halalas int not null check ≥ 0`, `vat_halalas int not null check ≥ 0`, `total_halalas int not null check (total = net + vat and total > 0)`
  - `vat_mode text check in ('exclusive','inclusive')`
  - `currency text not null default 'SAR'`
  - `status text not null default 'created' check in ('created','initiated','paid','failed','refunded','voided','cancelled')`
  - `moyasar_intent_id text`, `moyasar_payment_id text unique`
  - `live boolean`
  - `source text not null default 'checkout' check in ('checkout','renewal','payment_link','admin')`
  - `receipt_number text unique`
  - `paid_at`, `fulfilled_at`, `refunded_at timestamptz`
  - `refunded_halalas int not null default 0`
  - `failure_message text`
  - `metadata jsonb not null default '{}'`
  - `created_at`, `updated_at`
  - Index `(user_id, created_at desc)`, and a partial index on `status = 'initiated'`.
  - RLS: the owner selects their own rows; only the service role writes. Column grants: `revoke all`, then `grant select (<every column except metadata>)` to authenticated.
- **`public.payment_methods`:**
  - `id uuid pk`, `user_id uuid → auth.users on delete cascade`, `merchant text`
  - `token text not null unique`
  - `brand text`, `last_four text`, `exp_month text`, `exp_year text`
  - `status text check in ('active','inactive','deleted')`
  - `created_at`
  - Authenticated users get SELECT on every column **except `token`**; only the service role writes.
- **`public.payment_webhook_events`:** `event_id text pk`, `merchant text`, `type text`, `payment_id text`, `live boolean`, `received_at timestamptz default now()`, `outcome text`. Service role only.
- **Sequence `public.payment_receipt_seq`**, and `public.next_receipt_number() returns text` producing `'NZ-' || to_char(now() at time zone 'Asia/Riyadh','YYYY') || '-' || lpad(nextval::text, 6, '0')`. EXECUTE for the service role only.
- **`public.subscriptions.tier` CHECK** gains `shield` and `enterprise` (drop and re-add the named constraint, found by `pg_constraint` lookup).
- **`public.subscription_plans`:** upsert the 7 sold plan ids from Ruling 1, with `tier`, `audience` (`individual` / `lawyer` / `provider` / `firm`), `name_ar`, and `price_monthly` / `price_yearly` in SAR as Task 3's catalog states. Use `on conflict (id) do update` on prices and names only.
- **`public.library_access_grants`:** the `source` CHECK gains `'purchase'`; add a nullable column `order_id uuid` → `payment_orders`.
- **`platform_settings`** key `billing_company`, seeded `{"legal_name_ar": null, "cr_number": null, "vat_number": null, "address_ar": null}` with `on conflict do nothing`.

- [ ] **Step 1: Docker test.** Its header holds the chain; negative control: the chain without the migration fails. It covers:
  - an order whose total ≠ net + vat is rejected;
  - an owner reads their own order and not another user's; `metadata` is not selectable by authenticated;
  - `token` is not selectable by authenticated;
  - anon gets nothing;
  - `next_receipt_number()` is denied to authenticated, and returns increasing `NZ-YYYY-000001`-shaped values for the service role;
  - a subscription with tier `enterprise` inserts;
  - a `library_access_grants` row with source `purchase` and an `order_id` inserts;
  - re-running the migration changes nothing.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Write the migration: one `begin … commit`, a raising verify, and `notify pgrst`.
- [ ] **Step 4:** GREEN. Add the `_verify` section.
- [ ] **Step 5: Commit** `feat(payments): orders, saved cards, webhook events, receipt numbers and the sold plans (Moyasar B1)`

### Task 2: Points in expiring lots (W8.1, redesigned)

**Files:**
- Create: `supabase/migrations/20261022_20_points_lots.sql`
- Create: `supabase/tests/rls/points_lots.test.sql`
- Modify: `supabase/migrations/_verify.sql`

**Interfaces (produces):**
- **`public.points_lots`:**
  - `id uuid pk`, `user_id → auth.users on delete cascade`
  - `source text check in ('purchase','plan_monthly','grant','admin','migrated','refund_restore')`
  - `points_total int > 0`, `points_left int check (points_left between 0 and points_total)`
  - `expires_at timestamptz not null`
  - `order_id uuid → payment_orders`
  - `created_at`
  - Index `(user_id, expires_at)`.
- **`public.points_ledger`:** `id bigserial`, `user_id`, `lot_id`, `delta int not null`, `reason text check in ('credit','usage','expiry','refund_revoke','admin_adjustment')`, `tool text`, `ref text`, `created_at`. One row per lot touched.
- **`public.points_balance(p_user uuid) returns int`:** the sum of `points_left` over lots with `expires_at > now()`. SECURITY DEFINER; callable by authenticated only for `auth.uid()` (it raises for another user), and by the service role for anyone.
- **`public.credit_points(p_user uuid, p_points int, p_source text, p_expires_at timestamptz, p_order uuid default null, p_ref text default null) returns uuid`** (the lot id). Service role only.
- **`public.debit_points(p_user uuid, p_points int, p_tool text, p_ref text) returns int`** (the balance after).
  - Service role only.
  - Takes `FOR UPDATE` on the user's unexpired lots ordered by `expires_at, created_at`, consumes nearest-expiry first and can span lots.
  - Raises `P0001 'insufficient_points'`, changing nothing, when the unexpired balance is too small.
- **`public.revoke_lot(p_lot uuid, p_reason text) returns int`** (the points removed): sets `points_left = 0` and writes the ledger. Service role only.
- **`platform_settings`** key `points_enforcement`, seeded `false`.
- **Migration of balances (Ruling 5):** one `migrated` lot per user with `lawyer_profiles.credit_balance > 0`, expiring `now() + interval '12 months'`. Guarded so a re-run adds nothing (skip users who already have a `migrated` lot). `credit_balance` itself is left untouched.

- [ ] **Step 1: Docker test.** It covers:
  - two lots (one expiring sooner): a debit spanning both takes the sooner one first; the ledger has one row per lot;
  - an expired lot is not counted and not debited;
  - a debit larger than the balance raises and changes nothing;
  - a debit of exactly the balance leaves 0;
  - `revoke_lot` zeroes a lot;
  - authenticated cannot execute `credit_points`, `debit_points` or `revoke_lot`, and `points_balance` for another user raises;
  - the owner reads their own lots and ledger only;
  - the migration of a `credit_balance` of 250 creates one 250-point lot, and a re-run creates none;
  - negative control.
- [ ] **Step 2:** RED.
- [ ] **Step 3:** Write the migration.
- [ ] **Step 4:** GREEN. Add the `_verify` section.
- [ ] **Step 5: Commit** `feat(points): expiring point lots, nearest-expiry debit, existing balances migrated (owner ٢٢٤/٢٤٤/٢٤٩)`

### Task 3: The price catalog and VAT quote (pure)

**Files:**
- Create: `src/lib/payments/catalog.ts`
- Create: `src/lib/payments/catalog.test.ts`

**Interfaces (produces):**
- **Types:**
  - `type ItemKind = 'plan'|'library'|'topup'`
  - `type Billing = 'monthly'|'yearly'|'once'`
  - `type VatMode = 'exclusive'|'inclusive'`
  - `type PayableItem = { id: string; kind: ItemKind; labelAr: string; prices: Partial<Record<Billing, number>> /* halalas, as listed */; vat: VatMode | 'buyer'; tier?: ServerTierLiteral; libraryPlanRef?: 'lib-q1'|'lib-q2'|'lib-annual'; libraryDays?: number; points?: number; pointsValidityMonths?: number; saveCard: boolean }`
- **`PAYABLE_ITEMS: Record<string, PayableItem>`** with exactly these entries. Listed SAR prices are taken from `src/lib/pricing/plans.ts` and `src/constants/pricing/*.ts`:

  | Item | Billing and price (SAR) | Grants | VAT |
  |---|---|---|---|
  | `lawyer-pro` | monthly 399, yearly 3,990 | `pro` | exclusive |
  | `consultant-independent` | monthly 399, yearly 3,990 | `pro` | exclusive |
  | `firm-basic` | monthly 990, yearly 9,900 | `corp` | exclusive |
  | `firm-enterprise` | monthly 1,490, yearly 14,900 | `enterprise` | exclusive |
  | `ind-ai` | monthly 39, yearly 390 | `ai` | inclusive |
  | `ind-preventive` | monthly 149, yearly 1,490 | `pro` | inclusive |
  | `ind-litigation` | monthly 399, yearly 3,990 | `max` | inclusive |
  | `lib-q1` | once 1,500 | 90 days | buyer |
  | `lib-q2` | once 2,750 | 180 days | buyer |
  | `lib-annual` | once 5,000 | 365 days | buyer |
  | `topup-100` | once 100 | 100 points, 3 months | exclusive |
  | `topup-250` | once 250 | 300 points, 3 months | exclusive |
  | `topup-500` | once 500 | 700 points, 6 months | exclusive |
  | `topup-1000` | once 1,000 | 1,500 points, 12 months | exclusive |

  `saveCard` is true for `kind 'plan'` only.
- **`BUSINESS_USER_TYPES = ['lawyer','provider','firm','corporate','business','government','ngo']`**
- **`quote(itemId: string, billing: Billing, buyerUserType: string | null): { ok: true; item: PayableItem; vatMode: VatMode; netHalalas: number; vatHalalas: number; totalHalalas: number } | { ok: false; error: 'unknown_item' | 'billing_not_offered' }`**
- **`formatHalalas(h: number): string`:** Arabic digits with `ر.س` and two decimals only when non-zero. For example, 45885 → «٤٥٨٫٨٥ ر.س» and 39900 → «٣٩٩ ر.س».

- [ ] **Step 1: Tests:**
  - `quote('lawyer-pro','monthly','lawyer')` → net 39900, vat 5985, total 45885, exclusive;
  - `quote('ind-ai','monthly','client')` → total 3900, vat 509 (3900 − round(3900·100/115) = 3900 − 3391), inclusive;
  - `lib-q1`: with buyer `lawyer` → exclusive, total 172500; with buyer `client` or `null` → inclusive, total 150000;
  - an unknown id → `unknown_item`; `lib-q1` with `monthly` → `billing_not_offered`;
  - **consistency:** every `PAYABLE_ITEMS` price equals the numeric price in `src/lib/pricing/plans.ts`, where that plan exists there, and equals the display string in `src/constants/pricing/*.ts` after Arabic-digit and thousands-separator normalisation. Use relative imports; a module that cannot be imported under node:test is read as text and parsed, as `pricingHonesty.test.ts` does;
  - every `topup-*` has `points` and `pointsValidityMonths` as listed.
- [ ] **Step 2:** RED. **Step 3:** Implement. **Step 4:** GREEN, then full suite, type-check and lint.
- [ ] **Step 5: Commit** `feat(payments): one server price catalog with VAT per owner ٢٣٩/٢٤٨`

### Task 4: Moyasar client and the gateway switch

**Files:**
- Create: `src/lib/payments/moyasarConfig.ts` (pure), `src/lib/payments/moyasarConfig.test.ts`
- Create: `src/lib/payments/moyasarClient.ts` (server-only; `import "server-only"` if the repo uses it, otherwise a header comment and no client import path)
- Create: `src/lib/payments/moyasarClient.test.ts` (with injected `fetch`)
- Modify:
  - `src/lib/paymentGatewayPolicy.ts` and its test
  - `src/lib/access-control.ts` (`getPaymentGatewayStatus`)
  - `src/app/api/v1/admin/settings/route.ts` (the validator accepts provider `moyasar` and `test` / `live`, and refuses `live` while `billing_company` is incomplete; allowlist `billing_company` and `points_enforcement`)
- Caller grep first: `resolvePaymentGatewayState`, `getPaymentGatewayStatus`.

**Interfaces (produces):**
- **`resolveMoyasarConfig(setting: unknown, env: { secretKey?: string; publishableKey?: string; webhookSecret?: string }, billingCompanyComplete: boolean): { enabled: false; reason: string } | { enabled: true; mode: 'test'|'live'; secretKey: string; publishableKey: string; webhookSecret: string }`**
  - `test` needs the `sk_test_` / `pk_test_` prefixes; `live` needs `sk_live_` / `pk_live_` and `billingCompanyComplete`.
  - It is disabled otherwise.
- **`resolvePaymentGatewayState`** keeps its existing stub behaviour for local / staging, and adds the `moyasar` provider through `resolveMoyasarConfig`.
- **`createMoyasarClient(cfg, fetchImpl = fetch)`** returns:
  - `createIntent({ amountHalalas, description, callbackUrl, metadata })` → `{ id, clientSecret, expiresAt }`. It calls POST `/v1/payment_intents` with Basic auth `base64(secretKey + ':')`. Note: Moyasar's intent create takes amount, currency, description and callback_url; metadata goes on fulfilment from the browser, so the order id must ALSO be encoded in `callback_url` as `?order=<id>`.
  - `cancelIntent(id)`
  - `fetchPayment(id)` → `{ id, status, amount, currency, live?: boolean, metadata, source: { type, token?, company?, number? }, invoice_id?, refunded, captured, createdAt }`. Note: the payment object has no `live` field in the docs. `live` comes from the webhook body; on the callback path the mode is derived from the key used.
  - `refund(id, amountHalalas?)`
  - `void(id)`
  - `fetchToken(id)`
  - `deleteToken(id)`
  - Every call times out after 15 s. Errors surface as `{ ok: false, status, type, message }` without key material.
- **Arabic error copy for a disabled gateway:** «الدفع الإلكتروني غير متاح حالياً».

- [ ] **Step 1: Tests:**
  - mode and key-prefix matrix: test + sk_live → disabled; live + sk_test → disabled; live + incomplete billing → disabled; missing webhook secret → disabled; test + test keys → enabled;
  - the client sends the right method, URL, Basic header and JSON body;
  - a 5xx surfaces as `ok: false`;
  - no key appears in any error message.
- [ ] **Step 2–4:** RED, implement, GREEN; then full suite, type-check and lint.
- [ ] **Step 5: Commit** `feat(payments): Moyasar client and a gateway switch that refuses mismatched keys`

### Task 5: Fulfilment (the one place a payment becomes a purchase)

**Files:**
- Create:
  - `src/lib/payments/fulfillDecision.ts` (pure) and its test
  - `src/lib/payments/fulfillOrder.ts` (server)
  - `src/lib/payments/grantPurchase.ts` (server)
- Create: `supabase/tests/rls/payments_fulfill_once.test.sql` (proves the conditional update)
- Modify: `src/lib/libraryAccess.ts` (`LibraryGrantSource` gains `'purchase'`), `src/lib/libraryAccessServer.ts` (an optional `orderId` on `grantLibraryAccess`). Caller grep first.

**Interfaces (produces):**
- **`fulfillDecision(order, payment, mode)`** →
  - `'grant'`
  - `'already_done'` (order paid or refunded)
  - `'record_failed'` (payment failed)
  - `'wait'` (initiated)
  - `{ reject: 'amount_mismatch'|'currency_mismatch'|'mode_mismatch'|'order_mismatch' }`
  
  `order_mismatch` means the payment's `metadata.order_id` or the callback's order ≠ `order.id`.
- **`fulfillOrder({ orderId, paymentId, merchant, liveFlag? }): Promise<{ outcome: 'granted'|'already_done'|'failed'|'pending'|'rejected'; reason? }>`**
  1. fetch the payment;
  2. run `fulfillDecision`;
  3. on `grant`, claim with `update payment_orders set status='paid', moyasar_payment_id=…, paid_at=now(), receipt_number=next_receipt_number() where id=… and status in ('created','initiated') returning *`. Zero rows → `already_done`;
  4. then `grantPurchase(order)`, then `fulfilled_at = now()`;
  5. save the card token (when `item.saveCard` and `payment.source.token`) into `payment_methods` with brand and last four from `fetchToken`;
  6. `recordNotification` in Arabic.
  
  A grant failure after the claim leaves `fulfilled_at` null for the sweep to retry. It never double-grants: plan grants are keyed on order id in `subscriptions.metadata.order_id`, library grants on `order_id`, and lots on `order_id`.
- **`grantPurchase(order)`:**
  - **plan:** cancel the user's active plan rows as `grantEntitlement` does, then insert a `subscriptions` row with:
    - `plan_id = item.id`, `tier = item.tier`;
    - `billing_cycle = order.billing`;
    - `current_period_end = now() + 1 month or 1 year`;
    - `auto_renew = false` (B2 turns it on);
    - `payment_method_id` = the saved token row id;
    - `metadata {order_id, method: 'moyasar'}`.
    
    Then stamp `user_metadata.tier`. Reuse `planGrantDecision`: a higher-ranked active plan is never replaced; it records `already_entitled` and leaves the order paid for an admin refund. Lawyer `lawyer-pro` also credits a `plan_monthly` lot of 1,500 points expiring at `current_period_end` (monthly) or after 1 month (yearly; B2 tops up later months).
  - **library:** `grantLibraryAccess({ userId, planRef, days, source: 'purchase', orderId })`.
  - **topup:** `credit_points(user, points, 'purchase', now() + validity months, order.id)`.
- **The sweep:** `POST /api/v1/cron/payments-sweep` (`x-cron-secret`, compared timing-safe). It re-runs `fulfillOrder` for orders `initiated` for more than 10 minutes with a `moyasar_payment_id` or an intent, and for paid orders whose `fulfilled_at` is null.

- [ ] **Step 1: Tests.**
  - Unit, `fulfillDecision`: every branch, including a payment of 45884 for an order of 45885 → `amount_mismatch`; currency `USD` → `currency_mismatch`; `live: true` in test mode → `mode_mismatch`.
  - Docker: the claim UPDATE run twice returns one row then zero.
  - Source-contract test for the sweep route: the cron secret is checked with `timingSafeEqual`.
- [ ] **Step 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(payments): fulfilment that grants exactly once, from callback, webhook or sweep`

### Task 6: Checkout, webhook and result routes

**Files:**
- Create:
  - `src/app/api/v1/payments/checkout/route.ts`
  - `src/app/api/v1/payments/webhook/route.ts`
  - `src/app/payments/result/page.tsx`
  - `src/lib/payments/webhookCheck.ts` (pure) and its test
  - route source-contract tests
- Modify: `src/lib/rateLimitRoutes.ts` (exclude `/api/v1/payments/webhook`) and its test.

**Interfaces:**
- **`POST /api/v1/payments/checkout`**, body `{ itemId, billing }`, signed-in only (401 otherwise).
  - Gateway disabled → 503 «الدفع الإلكتروني غير متاح حالياً».
  - It quotes using the caller's `profiles.user_type`, inserts the order, and creates the intent with:
    - `description` `"NEZAMY — <labelAr>"`;
    - `callback_url` `<origin>/payments/result?order=<id>`, where the origin is from `NEXT_PUBLIC_SITE_URL`, never the request's Host header.
  - It stores `moyasar_intent_id` and sets status `initiated`.
  - It returns `{ orderId, intentId, clientSecret, publishableKey, amountHalalas, descriptionAr, saveCard, quote: {net, vat, total, vatMode} }`.
- **`checkWebhook(body: unknown, secret: string, mode)`** → `{ ok: true; eventId; type; paymentId; live; orderId? } | { ok: false; status: 401|400 }`. It uses timing-safe compare; a missing or ill-typed body gives 400.
- **`POST /api/v1/payments/webhook`:**
  - bad secret → 401;
  - a repeat event id → 200 `{duplicate: true}`;
  - types `payment_paid`, `payment_failed` and `payment_faild` (both spellings appear in Moyasar's docs) call `fulfillOrder` with the order found by `moyasar_payment_id` or `metadata.order_id`;
  - `payment_refunded` and `payment_voided` only record the event (B1 refunds are admin-initiated);
  - it returns 200 within the request.
- **`/payments/result?order=<id>&id=<paymentId>&status=…`** (server component):
  - the order must belong to the signed-in user;
  - it calls `fulfillOrder` and shows Arabic outcomes: «تم الدفع وتفعيل …», «لم تتم عملية الدفع: <message>» with a retry link to the checkout, or «جارٍ تأكيد الدفع…» with a refresh;
  - it shows the receipt link when paid.

- [ ] **Step 1: Tests:**
  - `checkWebhook`: right secret, wrong secret of the same and of a different length, a missing `id`, both failed-event spellings;
  - rate-limit exclusion;
  - source-contract tests for checkout: the price comes from `quote`, never from the body; the origin comes from `NEXT_PUBLIC_SITE_URL`.
- [ ] **Step 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(payments): checkout intent, webhook and the result page`

### Task 7: Checkout screen and the buy buttons

**Files:**
- Modify: `package.json` / `package-lock.json` (add `moyasar-payment-form` at exactly `2.3.0`)
- Create: `src/app/checkout/page.tsx`, `src/components/payments/MoyasarCheckout.tsx` (client)
- Modify:
  - `src/components/pricing/PricingCards.tsx` (`handleSubscribe`)
  - `src/app/laws/subscribe/page.tsx`
  - the top-up cards
- Caller grep first: `handleSubscribe`, `requestEntitlement`. Keep `pricingHonesty.test.ts` passing; update its expected strings where the flow legitimately changes.

**Behaviour:**
- `/checkout?item=<id>&billing=<b>`:
  - shows the item, net, VAT, total and the VAT sentence for its mode;
  - shows the points validity for top-ups;
  - for `ind-litigation`, shows «تغطية المشترك الرئيسي؛ تُضاف التغطية العائلية بطلب يراجعه الفريق»;
  - for firm plans, does not promise seats.
- **`MoyasarCheckout`:**
  - dynamically imports `moyasar-payment-form` and its CSS;
  - calls `Moyasar.init` with:
    - `language: 'ar'`;
    - `methods: ['creditcard','applepay']` when the publishable key is set and the `apple_pay_enabled` env flag is `true`, otherwise `['creditcard']`;
    - `supported_networks: ['mada','visa','mastercard']`;
    - `use_payment_intent: true`;
    - `on_initiating` → POST checkout, which returns `{ payment_intent: { id, client_secret }, amount, metadata: { order_id }, callback_url }`;
    - `credit_card: { save_card: saveCard }`;
    - `apple_pay: { country: 'SA', label: 'NEZAMY', validate_merchant_url: 'https://api.moyasar.com/v1/applepay/initiate' }`.
- **Buy buttons:** when `GET /api/v1/payments/status` says enabled and the user is signed in, the subscribe buttons and the library subscribe page go to `/checkout`. Otherwise the existing request flow stays unchanged (٢٤٦).

- [ ] **Step 1: Tests:**
  - a pure `checkoutHref(planId, billing, gatewayEnabled, signedIn)` → `/checkout?...` or `null`, which keeps the request flow;
  - `pricingHonesty` still passes.
- [ ] **Step 2–4:** RED, implement, GREEN, then `next build --webpack` once.
- [ ] **Step 5: Commit** `feat(payments): checkout screen with the Moyasar form, and buy buttons that use it when the gateway is on`

### Task 8: Billing page for the user

**Files:**
- Create:
  - `src/app/api/v1/billing/route.ts` (GET: own orders, saved cards without token, points balance and lots)
  - `src/app/api/v1/billing/cards/[id]/route.ts` (DELETE: `deleteToken` at Moyasar, then status `deleted`)
  - `src/app/dashboard/billing/page.tsx`
  - `src/app/dashboard/billing/receipt/[orderId]/page.tsx` (printable)
- Modify: `src/app/settings/components/tabs/SubscriptionTab.tsx` (a link to the billing page)

**Behaviour:**
- **The billing page lists:** orders with status in Arabic, saved cards («بطاقة تنتهي بـ ١١١١»), and the points balance with each lot's remaining points and expiry date.
- **The receipt shows:**
  - the title «إيصال دفع»;
  - `receipt_number`, date, item, net, VAT 15%, total, and the payment method's last four;
  - the `billing_company` legal name, CR, VAT number and address;
  - the line «تصدر الفاتورة الضريبية الرسمية بشكل منفصل».
  
  When `billing_company` is incomplete it shows «بيانات المنشأة غير مكتملة» instead of blanks.

- [ ] **Step 1: Tests:** a pure `receiptView(order, company)` (the totals arithmetic, the incomplete-company branch); a source-contract test that the GET selects no `token` column.
- [ ] **Step 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(payments): billing page, saved cards and printable receipts`

### Task 9: Admin orders and refunds

**Files:**
- Create:
  - `src/app/api/v1/admin/payments/orders/route.ts` (GET, filters status / user / date)
  - `src/app/api/v1/admin/payments/orders/[id]/refund/route.ts` (POST)
  - `src/lib/payments/refundDecision.ts` (pure) and its test
  - `src/app/dashboard/admin/subscriptions/orders/page.tsx`
- Modify:
  - `src/lib/auth/staffRoles.ts`: actions `payments.read` (super_admin, operations, auditor) and `payments.refund` (super_admin only, ٢٥٢)
  - its test
  - the admin nav

**Interfaces:**
- **`refundDecision(order, now, usage)`** → `{ method: 'void'|'refund'; reverse: Array<'cancel_plan'|'end_library_grant'|'revoke_lot'>; warnings: string[] }`, where `usage = { pointsUsedFromOrderLot, planPointsUsedPct }`.
  - `void` when paid less than 2 hours ago; `refund` otherwise.
  - plan → `cancel_plan`; library → `end_library_grant`; topup → `revoke_lot`.
  - A warning when more than 5% of plan points were used (the policy's withdrawal condition), for the admin to see before confirming.
  - Refused for status ≠ paid.
- **Refund route:**
  - `requireStaff('payments.refund')` and a body `{ confirm: true }`;
  - calls Moyasar `void` or `refund`; on success sets status `voided` or `refunded`, `refunded_halalas` and `refunded_at`;
  - applies the reversals:
    - end the subscription row (`status 'cancelled'`) and reset the tier exactly as the admin subscription cancel does;
    - set the library grant's `ends_at = now()` (it needs `ends_at > starts_at`; use `greatest(starts_at + interval '1 second', now())`);
    - `revoke_lot`;
  - then `logAdminAction` and a notification to the user.
  - On a Moyasar failure it changes nothing and returns 502 with Arabic copy.

- [ ] **Step 1: Tests:**
  - `refundDecision`: paid 1h59m ago → void; 2h01m → refund; refunded order → refused; a top-up with points used → revoke and a warning;
  - `staffRoles`: only super_admin has `payments.refund`;
  - source-contract: the route checks `payments.refund` before calling Moyasar.
- [ ] **Step 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(payments): admin orders and super-admin refunds that reverse what was granted (owner ٢٥٢)`

### Task 10: VAT copy and validity on the pricing screens

**Files:**
- Modify:
  - `src/components/pricing/PricingCards.tsx` (and any card component it uses for the audience sections)
  - `src/constants/pricing/pricing.lawyers.ts` (top-up `desc` gains the validity: «صالحة ٣ أشهر», «صالحة ٦ أشهر», «صالحة ١٢ شهراً»)
  - `src/lib/pricing/pricingHonesty.test.ts`

**Behaviour:**
- Lawyer, firm, provider and company sections show the owner's VAT sentence verbatim under their prices.
- Individual sections show «الأسعار شاملة ضريبة القيمة المضافة».
- Library plans show «للأفراد: شامل الضريبة · للمحامين والمنشآت: غير شامل الضريبة».

- [ ] **Step 1: Tests (pricingHonesty):** each sentence is present in its section, and the top-up validity strings match `PAYABLE_ITEMS`.
- [ ] **Step 2–4:** RED, implement, GREEN.
- [ ] **Step 5: Commit** `feat(pricing): VAT wording per audience and top-up validity (owner ٢٣٩/٢٤٨/٢٤٩)`

### Task 11: Ship (controller)

- Final whole-branch review; full suite, type-check, lint and `next build --webpack`.
- Owner report `تقرير_للمالك_٢٠٢٦-١٠-٢٢_بوابة_الدفع_١.md`. It lists:
  - Rulings 1–7;
  - what B1 does;
  - what B2 and B3 add;
  - «بانتظار النشر».
- `SQL_batch_2026-10-22_payments_b1/` with:
  - `01_BEFORE_DEPLOY_20261022_10_payments_core.sql`;
  - `02_BEFORE_DEPLOY_20261022_20_points_lots.sql`;
  - `03_AFTER_ALL_verify.sql`;
  - a README.
- **The user's ops checklist** (in the README and the reply):
  - `npm install` before the deploy (new dependency);
  - put the test keys into the server env (`MOYASAR_SECRET_KEY`, `NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY`, `MOYASAR_WEBHOOK_SECRET`) and rebuild, because the `NEXT_PUBLIC_` key is inlined at build time;
  - in the Moyasar dashboard:
    - add a webhook `https://nezamy.sa/api/v1/payments/webhook`, method POST, the same secret, events `payment_paid`, `payment_failed`, `payment_refunded`, `payment_voided`;
    - add the server's IP to the IP whitelist for test and for live;
  - add the n8n cron for `POST /api/v1/cron/payments-sweep` every 10 minutes with `x-cron-secret`;
  - fill «بيانات المنشأة» in admin settings;
  - switch the gateway to «تجريبي» and buy with the test card `4111 1111 1111 1111`;
  - Apple Pay needs the domain registered in Moyasar first.
- Merge and push only on the user's go.
