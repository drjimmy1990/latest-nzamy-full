# P1 — the price book (design note, 2026-10-26)

Phase P1 of `2026-10-25-owner-answers-10-25-phases-plan.md`. Owner rules: pricing doc §2 rules 1, 4, 5 and §13ب, answer ٢٥٨. **No price changes in P1.** P1 changes only how VAT is presented and the shape everything reads.

## 1. Where each price lives, and what is the truth

| Prices | Truth | Who reads it |
|---|---|---|
| Plans, library passes, top-ups (later: memberships, ERP, bundles) | **`src/lib/pricing/priceBook.ts`** (code) | checkout (`catalog.ts` derives `PAYABLE_ITEMS` from it), `/pricing` cards, `plans.ts`, `/laws/subscribe`, the `/laws` paywall, `/pro`, the admin pricing screen, the `subscription_plans` seed |
| B2C per-service estimates (`ai-consult`, `video-full`, …) | **`admin_pricing_catalog`** (DB) merged over `CLIENT_SERVICE_CATALOG` (code fallback) | the client dashboard pages, through `/api/client-pricing` + `useClientPricingCatalog` |

**Decision: `admin_pricing_catalog` is the truth for per-service prices today, but only as the displayed estimate.** Nothing charges for a per-service order yet. The evidence:

- `dashboard/client/requests/new/page.tsx:140` sends `payment: { amount: 0, status: "not_required" }`, and keeps the figure only as `metadata.originalPrice` ("an estimate, not a charge", `:162-165`).
- `serviceRequestPaymentGate.ts:27-30` refuses any paid request while Moyasar is on (payments B3).
- `api/client-pricing/route.ts:22` reads the enabled individual rows, and `pricingRepository.ts:150` (`mergeAdminPricingCatalogRows`) lays them over the code catalogue. That merged list is what `requests/new` (`:79`), `consultation/new` (`:148`) and `services` (`:277`) show.
- No admin screen writes the table. `dashboard/admin/pricing/page.tsx:186` says publishing "waits for the admin_pricing_catalog API", and no `api/v1/admin/*pricing*` route exists. Today the only way to change these prices is SQL.

So the DB stays the truth for those services. P1 closes the one leak where a DB edit would silently do nothing: `components/ai/advisoryHandoff.ts:28` read the code constant. It now takes the fetched catalogue. The admin screen keeps saying, plainly, that it does not publish. The admin write API and the B3 charge belong to P5/B3.

Plans, top-ups and memberships come from the code book because checkout already trusts code: `checkoutCore.ts:150-154` quotes `catalog.ts`, never the browser or the DB.

## 2. The book's shape

`priceBook.ts` is pure (relative imports only, `node --test` loads it). It is frozen, and keyed by the same id the cards, the orders (`payment_orders.item_id`) and `subscription_plans.id` use.

```ts
type Cycle = "monthly" | "quarterly" | "semiannual" | "yearly";   // 1 / 3 / 6 / 12 months
type Billing = Cycle | "once";
interface BookEntry {
  id; kind: "plan" | "library" | "topup";        // P3 adds "membership"
  labelAr; buyers: readonly UserType[] | "any";
  prices: Partial<Record<Billing, { sar: number; retired?: true }>>;  // SAR, VAT-exclusive
  tier?; libraryPlanRef?; libraryDays?; points?; pointsValidityMonths?;
  retired?: true;       // not for sale; still resolvable for old orders and subscriptions
  comingSoon?: true;    // price stored but never shown or sold (owner L446)
  launchPrices?: readonly { campaignId; prices }[];  // dated, banner only, never in a card (١٧٩)
}
```

- **VAT.** Every price is VAT-exclusive (٢٥٨). The book has no VAT field. `quote()` always adds 15% on top. `VatMode` keeps `"inclusive"` only so receipts can still read old orders: `payment_orders.vat_mode` stays as written.
- **The notice.** There is one, in `vatNotice.ts`: the §13ب.2 sentence, verbatim. It is shown under every price list and on `/checkout`.
- **The effect.** An individual, or a non-business library buyer, now pays 15% more at checkout. Before, 39 meant 39 with VAT inside; now it means 44.85.

## 3. Sell or resolve

`catalog.ts` builds two views from the book:

- **`PAYABLE_ITEMS` — resolve.** It holds every entry, retired ones included. The callers that find an item by id use it:
  - fulfilment (`fulfillCore`, `grantPurchase`);
  - receipts and labels (`billingView`, `resultView`, `currentPlanLabel`);
  - refunds and admin.
- **Sell: `sellableItem(id)` and `quote()`.** A retired entry, or a retired cycle, is refused. The callers:
  - `checkoutCore` (403 with «لم تعد هذه الباقة متاحة للشراء»);
  - `checkoutHref` and `parseCheckoutQuery`;
  - `retryHrefFor`;
  - `pickPlanRow` ("sold today").

**Renewal.** `renewalPrice(id, billing)` answers `sold`, `retired` (with the old price, for B2's notice), or `null`. A retired cycle never renews silently onto the old price.

## 4. Billing cycles end to end

| Layer | What changes |
|---|---|
| Types | `Billing` gains `quarterly` and `semiannual` in `catalog.ts`, `checkoutRules.ts`, `checkoutView.ts`, `pricing.types.ts`, `priceDisplay.ts` and `types/database.ts`. They all import one union from the book. |
| Plan window | `planPeriodEnd` gives 1 / 3 / 6 / 12 calendar months on the **Riyadh** calendar day, clamped to month end. 31 Jan +1 → 28/29 Feb; 31 Aug +6 → 28 Feb. This also moves monthly and yearly by one day for purchases made 21:00–24:00 UTC. Top-up lot expiry stays on UTC. |
| Labels | «شهري / ربع سنوي / نصف سنوي / سنوي / دفعة واحدة» on checkout, receipts and admin. |
| `/pricing` | The cycle toggle shows the cycles the audience's policy allows that the cards on screen actually price: professionals get ربع سنوي / نصف سنوي / سنوي, individuals get شهري too. With one cycle the toggle is hidden. |

**What the toggle means in P1.** No item has a quarterly or half-yearly price yet. Lawyers, consultants and firms therefore see only the yearly price, so the 399 and 990 monthly prices are **no longer advertised**, as rule 1 asks. Checkout keeps selling them until P2/P6 retire them in the book. Individuals see monthly and yearly.

**DB, migration `20261026_10_billing_cycles.sql`:**
- widens `payment_orders_billing_check` and the `subscriptions.billing_cycle` check, keeping `custom`. `grant_plan_subscription` writes `billing_cycle = p_billing`, so that check must be widened too, or a quarterly order is paid and never fulfilled;
- adds the nullable columns `subscription_plans.price_quarterly` and `price_semiannual`. Admin MRR reads `price_monthly` / `price_yearly`, and now goes through one pure helper, `monthlyEquivalent()`;
- writes no price: the new columns stay null for the 7 seeded plans, because none of them has a quarterly or half-yearly price yet. `catalog.test.ts` holds the seed to the book.

## 5. Deploy order

P1 is safe in either order. No item carries a quarterly or half-yearly price, so no order can name a cycle the DB refuses. The `_verify` section NOTICEs while file 10 has not run, and raises if the checks or columns are partial or wrong.

The user runs `10_BEFORE_DEPLOY_20261026_10_billing_cycles.sql`, then deploys. **P2 must not deploy before file 10 has run.** P2 turns the NOTICE into a raise in the same change that adds the first quarterly price.

## 6. What later phases add on top

| Phase | What it adds to the book |
|---|---|
| P2 | `lawyer-pro` / `consultant-independent` → `retired: true` (orders and subscriptions keep resolving); new `lib-*` / `erp-*` / `bundle-*` entries with q/s/y prices and welcome points; 7 top-ups with `buyers` lists (500 and up: professionals only), all valid 12 months; remove `PLAN_MONTHLY_POINTS`. |
| P3 | `kind: "membership"` (`lawyer-founder-2026`, `-plus`), the seat counter, `launchPrices` for the founder top-up. |
| P4 | Tool point prices (a separate table; `comingSoon` stores but hides). |
| P5 | `ind-*` q/s prices and new yearly prices, then the `admin_pricing_catalog` reseed SQL. |
| P6 | Firm monthly → `retired`, plus q/s; online entries for `micro`, `biz-*`, `dept-*`, NGO, providers and `lib-firm-*`. |
| P7 | Coupons on the server; the WhatsApp chat (`StepPayment.tsx`, `StepConsult.tsx`) reads the book and the per-service catalogue. |

## 7. Left open by P1 (each belongs to a later phase)

- **Per-service prices still copied in code.** These figures do not read `admin_pricing_catalog`, so an admin edit of the table does not reach them:
  - `src/constants/servicesData.ts` (the `/services/individuals` service cards);
  - the marketing pages under `src/app/services/*`: consultations, contracts, the business pages, corporate.

  P5 moves them onto the catalogue it reseeds. The /pricing pay-per-piece card no longer shows any figure: two of its four contradicted the table (٢٥٠ against 500 for `video-short`, ١,٥٠٠ against 1,000 for `defense`).
- **The VAT sentence is not yet on these price pages:**
  - `services/corporate/*`;
  - `services/business/*`;
  - `services/consultations`;
  - `services/contracts`;
  - `services/page.tsx`;
  - `academy` and `academy/[slug]`.

  P5 and P6 rewrite those prices and add the sentence with them. Marketplace budgets are fees between the parties, not platform prices.
- **Derived claims that P5 must recompute:** the `ind-ai` badge «١٫٢٥ ر.س يومياً», and «وفر شهرين» on the individuals' yearly price.
