# S6 — Pricing, plans and admin (owner-free parts of gap-analysis Wave 2)

**Spec:** `docs/audits/2026-11-02-owner-package/A-security-pricing.md`. Every row was re-checked at HEAD 1103812d, which already includes Wave 1. Where a slice line and HEAD disagree, HEAD wins (noted per task).

**Migration range used:** `20261103_20`, `_21` and `_22`. `_23`–`_29` are unused.

**GitNexus:** the worktree is not indexed. Before editing an exported symbol, grep its callers and list them in the task report (blast radius). If a caller sits outside the files named in the task, stop and report it.

**Unit baseline:** 6 known CRLF failures. The same 6 may fail; nothing new may fail. Every task also runs `npx tsc --noEmit` (0 errors) and `npx eslint <changed files>`.

## What is already true at HEAD (nothing to plan)

| Slice A row | HEAD evidence |
|---|---|
| §6.1.1 NOTE-22 | `src/lib/nav/shellContext.ts` keeps `nzamy_admin_view_as`; `resolveAiShell` has the admin branch |
| §6.1.2b no credit banner for admin | `runCore.ts` `p_exempt: isAdmin`; there is no global banner |
| §6.2.2a offer period | `priceBook.ts` `launch-2026` |
| §1.5 forgot password | `src/app/reset-password/page.tsx` exists; `forgot-password/page.tsx` calls `resetPasswordForEmail` (Wave 1) |
| §1.2a privacy line | `privacy/page.tsx:34` reads «أي نماذج» (Wave 1) |
| §6.2.1a retire cancelled plans | `retired` flags in `priceBook.ts` (Wave 1) |
| §6.2.1d «99» claims | Only comments remain (`clientServiceCatalog.ts:245`, `consultation/constants.ts:55`, `servicesData.ts:25`) |
| §6.2.3 NZAMY50 | Its value lives only in `public.coupons` (20261026_20). No non-test file under `src/` compares the code |

## Corrections to the slice that this section relies on

1. **The audience column already exists.** `admin_pricing_catalog.audience` has been there since 20260518. The real limit is that `service_id` is the **primary key**, so one service can have only one row (`20261102_10` header).
   - This section does **not** change the primary key. The 20260518 seed upserts `on conflict (service_id)`, so a hand re-run would break.
   - Instead, the business price gets its **own row**: id `contract-review-business`, audience `'corporate'`, `metadata.variantOf = 'contract-review'`.
   - `'corporate'` is the value `profiles.user_type` and `subscription_plans.audience` use for companies. There is no `'business'` user type.
2. **There is no checkout for contract review, so «checkout charges the business price» is not literally possible today.**
   - Contract review is a **service request**, not a price-book item. The client form submits it free (`requests/new/page.tsx:131-133`: `payment: { amount: 0, status: "not_required" }`).
   - Paid service requests get a 402 while Moyasar is on (`serviceRequestPaymentGate.ts`), until B3.
   - Today the team charges by hand, issuing a receipt in `/dashboard/admin/service-orders` (ReceiptPanel).
   - So "charging 800 to companies" is built in three parts: the request carries a **server-stamped** estimate for the requester's real audience (S6-T5); the team's queue shows it (S6-T6); and one resolver, `resolveClientService(serviceId, audience, catalog)`, is the interface the future B3 service checkout must call. No checkout is invented.
3. **Micro accounts cannot reach the client intake.** `routeAccess.ts:72-75` admits only individual and corporate. Business pricing therefore applies to `corporate`, and to any account whose request resolves a `businessId` (a company member filing for the company). `micro` is left out deliberately.

## Run order (for the release README)

| File | When | Why the other order is safe |
|---|---|---|
| `20261103_21_newclient_first_order_flag.sql` | **Before** the deploy of S6-T10 | 20261030_16 already stamped NEWCLIENT on prod (run 2026-10-31). NEWCLIENT also excludes `plan`/`library`/`topup` (and `membership` in code), and services are not sold online. So even the wrong order changes no charge |
| `20261103_20_contract_review_business_row.sql` | Any time; recommended right **after** the deploy | Old code reads `audience=eq.individual` only and never sees the row. Before the migration, new code serves the code-catalogue variant at 800 |
| `20261103_22_coupon_business_role.sql` | **After** the deploy of S6-T11/T12 | Before the deploy, the old coupons page maps `corporate` to nothing and then to `["client"]`, so an edit would narrow the coupon. Once the new page is live, the rename is safe at any time |

No STOP-POINT is required by this design: no live n8n, no npm dependency, and no RLS change. Three conditional STOP-POINTs are marked below (S6-T1, S6-T3, S6-T13).

---

## Part A — Business contract review at 800 (slice A §6.2.1d)

### S6-T1: Business contract-review row (migration 20261103_20)

**Row:** §6.2.1d. **Shared files:** none.
**Files:**
- Create `supabase/migrations/20261103_20_contract_review_business_row.sql`.
- Create `supabase/tests/rls/contract_review_business_row.test.sql`.
- Modify `supabase/migrations/_verify.sql`: append block `verify:s6_contract_review_business`, and add `and audience = 'individual'` to the two `service_id = 'contract-draft'` selects in block `verify:wave1_pricing_rows` (lines ~5306 and ~5321).

**Interfaces:** produces one row in `public.admin_pricing_catalog`:
- `service_id = 'contract-review-business'`, `audience = 'corporate'`, `category_id = 'contracts'`, `label_ar = 'مراجعة من محام متخصص'`;
- `base_price = 800`, `price_mode = 'starting_from'`, `receiver_type = 'lawyer'`, `beta_visibility = 'public'`, `requires_payment = true`, `enabled = true`;
- `metadata = {"route":"/dashboard/client/requests/new?type=contract-review","icon":"MagnifyingGlass","requestType":"service","priceNote":"سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد","humanService":true,"variantOf":"contract-review","addedBy":"20261103_20"}`.

Steps:
- [ ] **Failing test** `contract_review_business_row.test.sql`. Build the chain exactly like the header of `retire_cancelled_prices.test.sql` (sed-cut the table, RLS, public policy and seed out of 20260518), then run `20261102_10`, `20261102_11`, `20261103_20`, a between-runs prelude, and `20261103_20` again. Assertions (each a `raise exception` on failure):
  - (a) exactly one row `contract-review-business` with `audience = 'corporate'`, `base_price = 800`, `metadata->>'variantOf' = 'contract-review'`, `metadata->>'priceNote' = 'سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد'`;
  - (b) the `contract-review` row is unchanged: `audience = 'individual'`, `base_price = 600`, note `'سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد'`;
  - (c) the second run changed nothing: same `xmin` and `updated_at` as snapshotted by the prelude;
  - (d) an admin edit survives a re-run: set `base_price = 850` before a third run, and it reads 850 after;
  - (e) under `set role anon`, `select count(*) from admin_pricing_catalog where service_id = 'contract-review-business'` = 0. The RLS policy is unchanged, and the row is served only by the service-role API;
  - (f) the row count of the table is 28 (27 seed + 1).
- [ ] **Run:** `bash supabase/tests/rls/run.sh "$F" supabase/migrations/20261102_10_retire_cancelled_prices.sql supabase/migrations/20261102_11_contract_draft_points_price.sql supabase/tests/rls/contract_review_business_row.test.sql`. Expect FAIL on (a).
- [ ] **Code (SQL).**
  - `begin;` then a prerequisite `do` block: raise if `to_regclass('public.admin_pricing_catalog') is null`.
  - `insert … values (…) on conflict (service_id) do nothing;` then `commit;`.
  - Final SELECT from `(values ('contract-review-business'))` left join the table, with columns `service_id`, `in_table`, `audience`, `base_price`, `variant_of`, `ok`.
  - `ok = coalesce(c.service_id is not null and c.audience = 'corporate' and c.metadata->>'variantOf' = 'contract-review' and c.base_price > 0, false)`. It is never NULL.
  - Header: why a new id rather than a PK change; RUN ORDER «any time — see table above»; ROLLBACK `delete from public.admin_pricing_catalog where service_id = 'contract-review-business';`.
- [ ] **`_verify` block.**
  - NOTICE (pass) when the row is missing: the code catalogue serves 800.
  - RAISE when the row exists with `audience <> 'corporate'` or no `variantOf`.
  - NOTICE (pass) on any `base_price > 0`: admin edits are legal.
- [ ] **Verify:** run the chain. Expect PASS, and the migration's SELECT prints `ok = t` twice.
  - **Negative controls:** without `_20` the test fails on (a); with `audience 'individual'` hand-edited in, the `_verify` block raises.
  - Run the `_verify` sed recipe of `wave1_pricing_rows` over the new chain; it still passes.
- [ ] **STOP-POINT (conditional):** if anything seems to need a policy change on `admin_pricing_catalog`, stop and ask. This design needs none.
- [ ] **Commit:** `feat(pricing): business contract-review row at 800 (20261103_20, q327)`.

### S6-T2: Catalogue variants and audience resolver (pure)

**Row:** §6.2.1d. **Shared files:** none.
**Files:**
- Modify `src/constants/clientServiceCatalog.ts`:
  - the type at line 25;
  - the contract-review comment at `:321-325`, rewritten: the business 800 now lives in its own variant;
  - add a code-fallback entry `contract-review-business`.
- Modify `src/lib/pricingRepository.ts`.
- Create `src/lib/pricing/clientPricingAudience.ts` and `src/lib/pricing/clientPricingAudience.test.ts`.
- Create `src/lib/pricingRepository.test.ts`.

**Interfaces (produces):**
- `ClientServiceCatalogItem` gains `audience?: ClientPricingAudience` (absent = `"individual"`) and `variantOf?: string`.
- `AdminPricingCatalogRow` gains `audience?: string` and `metadata.variantOf?: string`.
- `export type ClientPricingAudience = "individual" | "corporate";`
- `export function clientPricingAudience(input: { userType: string | null | undefined; hasBusinessScope: boolean }): ClientPricingAudience` returns `"corporate"` iff `userType === "corporate" || hasBusinessScope`.
- `export function resolveClientService(serviceId: string, audience: ClientPricingAudience, catalog: ClientServiceCatalogItem[]): ClientServiceCatalogItem & { priceAudience: ClientPricingAudience }`:
  - for `corporate`, if an item with `variantOf === serviceId && audience === "corporate" && enabled !== false` exists, it returns that item's `basePrice`, `priceMode`, `priceNote` and `requiresPayment` on the **base** item's `serviceId`, `route`, `label` and `requestType`, with `priceAudience: "corporate"`;
  - otherwise it returns `getClientServiceById(serviceId, catalog)` with `priceAudience: "individual"`.
- `mergeAdminPricingCatalogRows(rows)` carries `audience` and `variantOf` from the row: `row.audience`, `metadata.variantOf`.
- `getVisibleClientServiceCatalog`, `getClientServicesByCategory` and `getClientServiceById` never return an item with `variantOf` set. The variant is never a card and never a fallback.

Steps:
- [ ] **Failing tests.** In `clientPricingAudience.test.ts`, test "S6: who pays the business price":
  - `clientPricingAudience({userType:"corporate",hasBusinessScope:false})` → `"corporate"`;
  - `({userType:"individual",hasBusinessScope:true})` → `"corporate"`;
  - `({userType:"individual",hasBusinessScope:false})` → `"individual"`;
  - `({userType:"micro",hasBusinessScope:false})` → `"individual"`;
  - `({userType:null,hasBusinessScope:false})` → `"individual"`.

  In `pricingRepository.test.ts`:
  - "S6: the code catalogue's contract review is 600 for individuals and 800 for companies": `resolveClientService("contract-review","individual",CLIENT_SERVICE_CATALOG)` has `basePrice` 600 and `priceAudience` `"individual"`; the `"corporate"` call has `basePrice` 800, `serviceId` `"contract-review"`, route `"/dashboard/client/requests/new?type=contract-review"`, and `priceNote` `"سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد"`.
  - "S6: a DB variant row wins over the code variant": merge `[{service_id:"contract-review-business", audience:"corporate", base_price:"850", price_mode:"starting_from", …, metadata:{variantOf:"contract-review"}}]`, then the `corporate` resolve has `basePrice` 850, and the `individual` resolve still has 600.
  - "S6: a variant is never a card": `getVisibleClientServiceCatalog().some(s => s.variantOf)` is false; `getClientServicesByCategory("contracts").map(s=>s.serviceId)` does not include `"contract-review-business"`; `getClientServiceById("contract-review-business").serviceId` is `"general"`.
  - "S6: corporate falls back to the base price when no variant exists": `resolveClientService("video-short","corporate",CLIENT_SERVICE_CATALOG).basePrice` is 500.
  - "S6: a disabled variant falls back to the individual price": merge `[{service_id:"contract-review-business", audience:"corporate", base_price:"800", enabled:false, …, metadata:{variantOf:"contract-review"}}]`, then the `corporate` resolve has `basePrice` 600 and `priceAudience` `"individual"`.
- [ ] **Run:** `node --test src/lib/pricing/clientPricingAudience.test.ts src/lib/pricingRepository.test.ts`. Expect FAIL (module missing).
- [ ] **Code.**
  - Add the type fields.
  - Add the code entry `{ serviceId:"contract-review-business", audience:"corporate", variantOf:"contract-review", basePrice:800, priceMode:"starting_from", priceNote:"سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد", …same label/route/icon/receiver/requestType/betaVisibility/requiresPayment/humanService as contract-review }`.
  - Implement the two functions with relative `.ts` imports only (node:test).
  - Add `!s.variantOf` to the three helpers.
- [ ] **Blast radius:** grep for direct iterations of the catalogue that bypass the helpers (`CLIENT_SERVICE_CATALOG\.(map|filter|forEach)` and `catalog\.(map|filter|forEach)` under `src/`).
  - Add `!s.variantOf` wherever one would render a card.
  - List each hit in the report: expected hits are `consultationPrices.ts`, `waChatPrices.ts`, `client/services/page.tsx` and `liveClaims.test.ts`.
  - Run `src/lib/services/liveClaims.test.ts`, `src/components/ai/advisoryHandoff.test.ts` and `src/lib/services/pricingApprovals.test.ts`. If one pins the catalogue length (27), update it to 28 in the same commit and say so.
- [ ] **Verify:** `node --test src/lib/pricing/clientPricingAudience.test.ts src/lib/pricingRepository.test.ts src/lib/services/liveClaims.test.ts src/components/ai/advisoryHandoff.test.ts` → PASS. Then `npm run test:unit`: baseline only.
- [ ] **Commit:** `feat(pricing): audience variants in the client catalogue; contract review 800 for companies (q327)`.

### S6-T3: `/api/client-pricing` serves both audiences from one server loader

**Row:** §6.2.1d. **Shared files:** none.
**Files:**
- Create `src/lib/pricing/clientPricingServer.ts`.
- Modify `src/app/api/client-pricing/route.ts`.
- Create `src/lib/pricing/clientPricingServer.test.ts`.

**Interfaces:**
- `export const CLIENT_PRICING_REST_QUERY = "select=*&audience=in.(individual,corporate)&order=category_id.asc,service_id.asc";`
  - There is **no `enabled` filter**. A row an admin disables (S6-T7) must reach the merge as `enabled: false`; otherwise the code entry silently wins and the toggle does nothing.
  - The helpers already drop `enabled === false`.
- `export async function loadClientPricingCatalog(fetchImpl?: typeof fetch): Promise<{ catalog: ClientServiceCatalogItem[]; source: PricingCatalogSource }>`:
  - the service-role REST read moves here from the route;
  - on a missing env, a non-ok response or a throw, it returns `{ catalog: CLIENT_SERVICE_CATALOG, source: "admin-seed" }`.
- `GET /api/client-pricing` returns `await loadClientPricingCatalog()`, and the response shape is unchanged. Variants travel inside `catalog`; the browser resolves per audience. The prices are public anyway.

Steps:
- [ ] **Failing test** "S6: the loader asks for both audiences and falls back to the code catalogue". Pass a fake `fetchImpl` that records the URL.
  - Assert the URL ends with `/rest/v1/admin_pricing_catalog?` + `CLIENT_PRICING_REST_QUERY`.
  - A fake 500 → `source === "admin-seed"`, and the catalogue includes the code variant `contract-review-business` (`basePrice` 800).
  - A fake 200 with `[]` → `source === "backend"`.
  - Set `process.env.SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` inside the test, and restore them after.
- [ ] **Run:** `node --test src/lib/pricing/clientPricingServer.test.ts`. Expect FAIL.
- [ ] **Code:** move the fetch from `route.ts:21-29` into the loader. Keep `cache: "no-store"`. The loader takes no request input.
- [ ] **Deliberate change check.** Under the old query, a DB row with `enabled = false` was never fetched, so its **code** entry won. Under the new query, the disabled DB row arrives and hides the item.
  - The 20260518 seed has rows with `enabled` false: `file-lawsuit`, `appeal`, `cassation` and others; grep `', false,` in the seed.
  - Add the test "S6: visible cards before and after the enabled change". With the 20260518 seed rows as a fixture, compute the visible service ids of the old path (merge of the enabled rows only) and of the new path (merge of all rows). Pin both lists as literals.
  - List every id that leaves in the report and in the commit message. One that was `beta_hidden` in code too changes nothing visible.
  - **STOP-POINT (conditional):** stop and ask if a `public` card would disappear. That is a visible change the user must approve.
- [ ] **Verify:** the test passes; `tsc`; the build command from the rules file.
- [ ] **Commit:** `refactor(pricing): one server loader for the client catalogue, both audiences`.

### S6-T4: Show the price for the viewer's audience

**Row:** §6.2.1d «display per audience». **Shared files:** none (no nav file is touched).
**Files:**
- Modify `src/hooks/useClientPricingCatalog.ts`. It also returns `audience`, computed from `useUser()`: `clientPricingAudience({ userType, hasBusinessScope: Boolean(businessMembership) })`.
- Modify `src/app/dashboard/client/requests/new/page.tsx:86-89`: `resolveClientService(typeParam, audience, catalog)` replaces `getClientServiceById`.
- Modify `src/app/dashboard/client/services/page.tsx`. This is the catalogue a company browses inside the shared intake (`routeAccess.ts` `CLIENT_INTAKE_PREFIXES`). Each card's price goes through `resolveClientService(item.serviceId, audience, catalog)`, so a company's contract-review card reads «يبدأ من ٨٠٠ ر.س».
- Modify `src/components/ai/advisoryHandoff.ts` (`resolveAdvisoryHandoff(serviceId, catalog?, audience = "individual")`), plus `src/components/ai/AdvisoryTemplateNotice.tsx` and `src/app/ai/contract-drafter/_components/StepLawyerCTA.tsx`, which pass the hook's audience.
- Modify `src/components/floating/waChatPrices.ts` and `src/lib/services/whatsappRequestMessage.ts:536`. Each takes an `audience` parameter (default `"individual"`), and the callers pass the hook's value.
- Modify `src/lib/pricing/catalogPriceLabel.ts`: add `dualAudiencePriceLabel`.
- Modify `src/app/services/contracts/page.tsx:91-95` and `src/constants/servicesData.ts:53,135`: public pages show both audiences to everyone.
- Extend `src/components/ai/advisoryHandoff.test.ts` and create `src/lib/pricing/catalogPriceLabel.test.ts`.

**Interfaces:** `export function dualAudiencePriceLabel(serviceId: string, catalog: ClientServiceCatalogItem[], lang: "ar" | "en"): string | null`:
- returns `catalogPriceLabel` for the individual price when no corporate variant exists, or when the variant's price equals the individual one;
- otherwise returns AR `"يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال"` and EN `"From 600 SAR (individuals) · From 800 SAR (business)"`.

Steps:
- [ ] **Failing tests.**
  - `catalogPriceLabel.test.ts`, "S6: public pages state both contract-review prices": `dualAudiencePriceLabel("contract-review", CLIENT_SERVICE_CATALOG, "ar") === "يبدأ من ٦٠٠ ر.س للأفراد · يبدأ من ٨٠٠ ر.س للأعمال"`; the EN string as pinned above; `dualAudiencePriceLabel("video-short", CLIENT_SERVICE_CATALOG, "ar") === "٥٠٠ ر.س"`.
  - `advisoryHandoff.test.ts`, "S6: a company's hand-off shows 800": `resolveAdvisoryHandoff("contract-review", CLIENT_SERVICE_CATALOG, "corporate").priceLabel === "يبدأ من ٨٠٠ ر.س"`, and the default call still returns `"يبدأ من ٦٠٠ ر.س"`.
- [ ] **Run:** `node --test src/lib/pricing/catalogPriceLabel.test.ts src/components/ai/advisoryHandoff.test.ts`. Expect FAIL.
- [ ] **Code:** as listed under Files. `requests/new` keeps sending `metadata.service = serviceInfo.serviceId`, which stays `"contract-review"` (the base id). S6-T5 makes the server authoritative anyway.
- [ ] **Blast radius:** grep callers of `resolveAdvisoryHandoff`, `catalogPrice(`, `catalogPriceLabel(` and the `waChatPrices` exports, and list them. Every caller not listed above keeps the default `"individual"`.
- [ ] **Verify:** the tests pass; `npm run test:unit` (baseline); `tsc`; build.
  - Manual: as a corporate test account, `/dashboard/client/services` (the contract-review card) and `/dashboard/client/requests/new?type=contract-review` both show «يبدأ من ٨٠٠ ر.س». As an individual, both show «يبدأ من ٦٠٠ ر.س».
  - Manual: a guest on `/services/contracts` sees both prices.
- [ ] **Commit:** `feat(pricing): companies see the 800 contract review; public pages state both prices (q327)`.

### S6-T5: The server stamps the estimate for the requester's real audience

**Row:** §6.2.1d «charging» (see Correction 2). **Shared files:** the intake POST route `src/app/api/v1/service-requests/route.ts`. It does **not** edit `intakeGuard.ts`.
**Files:**
- Create `src/lib/pricing/serviceEstimate.ts` and `src/lib/pricing/serviceEstimate.test.ts`.
- Modify `src/app/api/v1/service-requests/route.ts`, after `persistedRequestMetadata` (~line 535).

**Interfaces:** `export function stampServiceEstimate(metadata: unknown, audience: ClientPricingAudience, catalog: ClientServiceCatalogItem[]): unknown`.
- It acts only when `metadata` is a plain object that **already carries** `originalPrice` and whose `metadata.service` names a non-variant catalogue id exactly (no `"general"` fallback).
- It then sets `originalPrice` = `item.requiresPayment ? item.basePrice : 0` (from `resolveClientService`), `priceMode`, `priceAudience` and `quoteSource: "server"`.
- In every other case it returns `metadata` unchanged.
- This is the price interface the future B3 service checkout must use (state this in the module doc).

Steps:
- [ ] **Failing test** "S6: the stored estimate is the server's, per audience":
  - `stampServiceEstimate({service:"contract-review", originalPrice:1, intake:{}}, "corporate", CLIENT_SERVICE_CATALOG)` deep-includes `{originalPrice:800, priceMode:"starting_from", priceAudience:"corporate", quoteSource:"server"}` and keeps `intake`;
  - the same call with `"individual"` gives `originalPrice` 600;
  - `{service:"xyz", originalPrice:5}` → returned unchanged (same object contents);
  - `{service:"contract-review"}` (no `originalPrice`) → unchanged;
  - `"text"` → `"text"`.
- [ ] **Run:** `node --test src/lib/pricing/serviceEstimate.test.ts`. Expect FAIL.
- [ ] **Code.**
  - In the route, the audience is `clientPricingAudience({ userType: actorProfile?.user_type ?? null, hasBusinessScope: businessId != null })`.
  - The catalogue is `(await loadClientPricingCatalog()).catalog`. Load it only when `metadata.originalPrice` is present, so other intake paths make no extra fetch.
  - `metadata: stampServiceEstimate(persistedRequestMetadata(requestData.metadata), audience, catalog)`.
  - `payment` and `status` stay untouched: the request stays free at submission.
- [ ] **Verify:** the test passes; `npm run test:unit` (baseline, including `src/app/api/v1/service-requests/*.test.ts`); `tsc`; build.
- [ ] **Commit:** `feat(service-requests): the stored estimate is server-priced for the requester's audience`.

### S6-T6: The admin queue shows the estimate and its audience

**Row:** §6.2.1d (the team does the charging today). **Shared files:** none.
**Files:**
- Create `src/lib/services/estimateLine.ts` and `src/lib/services/estimateLine.test.ts`.
- Modify `src/app/dashboard/admin/service-orders/page.tsx`: the order detail, next to the requester badge (~`:1210`).

**Interfaces:** `export function estimateLineAr(metadata: unknown): string | null`:
- `{originalPrice:800, priceMode:"starting_from", priceAudience:"corporate"}` → `"السعر التقديري: يبدأ من ٨٠٠ ر.س (أعمال)"`;
- `{originalPrice:600, priceMode:"starting_from", priceAudience:"individual"}` → `"السعر التقديري: يبدأ من ٦٠٠ ر.س (أفراد)"`;
- `{originalPrice:500, priceMode:"fixed"}` → `"السعر التقديري: ٥٠٠ ر.س"`;
- `{originalPrice:0}`, a missing price or a non-object → `null`.

Steps:
- [ ] **Failing test** "S6: the queue's estimate line" with the four pinned cases above.
- [ ] **Run:** `node --test src/lib/services/estimateLine.test.ts`. Expect FAIL.
- [ ] **Code:** a pure function, plus one `<p>` in the order detail rendered only when the line is non-null. Use `text-gray-300`/zinc tokens, never `text-gray-100/200`. ReceiptPanel is unchanged: the team still types the amount.
- [ ] **Verify:** the test passes; `tsc`; eslint on the page.
- [ ] **Commit:** `feat(admin): service orders show the audience estimate`.

## Part B — A real admin pricing screen (slice A §1.6 for `admin/pricing`, and §6.2.1d «admin edit»)

### S6-T7: Admin API for `admin_pricing_catalog`

**Row:** §1.6 (`dashboard/admin/pricing/page.tsx:150,241`, "local only until Pricing API"). **Shared files:** none.
**Files:**
- Create `src/app/api/v1/admin/pricing-catalog/route.ts` (GET).
- Create `src/app/api/v1/admin/pricing-catalog/[serviceId]/route.ts` (PATCH).
- Create `src/lib/pricing/catalogAdminRules.ts` and `src/lib/pricing/catalogAdminRules.test.ts`.

**Interfaces:**
- `GET`: `requireAdmin()`; service client; `select("*")` ordered by `category_id`, `service_id` → `{ data: AdminPricingCatalogRow[] }`. A read error is a 500 with «تعذّر تحميل قائمة الأسعار.», never `[]`.
- `PATCH /[serviceId]` with body `{ basePrice?: number; priceMode?: ClientServicePriceMode; priceNote?: string; enabled?: boolean }`:
  - `requireStaff("settings.write")`;
  - fetch the row (404 «البند غير موجود»);
  - `validateCatalogPatch(existing, body)`;
  - update the columns plus `metadata = { ...existing.metadata, priceNote }` (every other metadata key kept) and `updated_at`;
  - `logAdminAction({ action: "pricing_catalog_updated", targetType: "pricing_catalog", targetId: serviceId, before, after })`.
- There is no create and no delete: rows come from migrations.
- `export function validateCatalogPatch(existing: { price_mode: string; base_price: number | string }, body: Record<string, unknown>): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string }`. Rules:
  - `basePrice` finite and `0 ≤ x ≤ 1_000_000`, else `"السعر غير صالح"`;
  - `priceMode` one of `free|included|fixed|starting_from|custom|per_page|points`, else `"طريقة التسعير غير صالحة"`;
  - for `fixed`/`starting_from`, the effective `base_price` must be `> 0`, else `"السعر مطلوب وأكبر من صفر لهذه الطريقة"`;
  - `priceNote` a string of at most 200 characters, else `"الملاحظة أطول من ٢٠٠ حرف"`;
  - `enabled` a boolean;
  - unknown keys ignored.

Steps:
- [ ] **Failing test** "S6: catalogue patch rules", with exact cases:
  - `validateCatalogPatch({price_mode:"starting_from",base_price:600},{basePrice:650})` → `{ok:true, fields:{base_price:650}}`;
  - `{basePrice:-1}` → error `"السعر غير صالح"`;
  - `{priceMode:"fixed", basePrice:0}` → `"السعر مطلوب وأكبر من صفر لهذه الطريقة"`;
  - `{priceMode:"weird"}` → `"طريقة التسعير غير صالحة"`;
  - `{priceNote:"x".repeat(201)}` → `"الملاحظة أطول من ٢٠٠ حرف"`;
  - `{enabled:false}` → `fields {enabled:false}`.
- [ ] **Run:** `node --test src/lib/pricing/catalogAdminRules.test.ts`. Expect FAIL.
- [ ] **Code:** the two routes, following `src/app/api/v1/admin/coupons/[id]/route.ts` (gate, fetch, validate, update, audit).
- [ ] **Verify:** the test passes; `tsc`; build.
- [ ] **Commit:** `feat(admin): pricing-catalog API (read, audited edit)`.

### S6-T8: Rebuild `/dashboard/admin/pricing` on real data

**Row:** §1.6. **Shared files:** none.
**Files:**
- Modify `src/app/dashboard/admin/pricing/page.tsx` (377 lines, mostly rewritten).
- Create `src/app/dashboard/admin/pricing/page.test.ts` (source test).

**What changes:**
- **Section 1, «أسعار خدمات العملاء»:** rows from `GET /api/v1/admin/pricing-catalog`, each with an audience badge («الأفراد» for `individual`, «الأعمال» for `corporate`), label, mode, price, note and enabled.
  - Inline edit → PATCH. The toast says saved or the server's error.
  - Loading, unreadable and empty states are honest, as on the coupons page.
- **Section 2, «الباقات والشحن — من دفتر الأسعار»:** the existing `bookSar`/`PRICE_BOOK` numbers, read-only, with the caption «تتغيّر بنشر الكود، لا من هذه الشاشة».
- **Removed:**
  - the local `INITIAL_PRICING` rows that invent facts: `individual-quick-question` 10 SAR marked "Live"; `marketplace-platform-fee` 15 %; `provider-verification-fee`;
  - the local draft editor;
  - every «محلياً» toast;
  - the "Backend-ready" badge.
- **Commission:** one line, «عمولة السوق: قريباً» with no number (٤٢١ is open).

Steps:
- [ ] **Failing source test** "S6: the pricing screen is real":
  - the file contains `"/api/v1/admin/pricing-catalog"` and `"قريباً"`;
  - it contains none of `"محلياً"`, `"Backend-ready"`, `"individual-quick-question"`, `"platformFeePct: 15"`, `"حفظ محلي"`.
- [ ] **Run:** `node --test src/app/dashboard/admin/pricing/page.test.ts`. Expect FAIL.
- [ ] **Code:** a client component. The admin console is always dark (`admin-console`), so use zinc tokens. Prices are formatted with `toLocaleString("ar-SA")`; there are no dates.
- [ ] **Verify:** the test passes; `tsc`; eslint; build. Manual: change the corporate row to 850, and the corporate request form shows «يبدأ من ٨٥٠ ر.س»; then set it back to 800.
- [ ] **Commit:** `feat(admin): pricing screen edits the real client catalogue; invented rows removed`.

## Part C — Coupons (slice A §6.2.3)

### S6-T9: Re-assert NEWCLIENT's flag (migration 20261103_21, BEFORE deploy)

**Row:** §6.2.3. **Shared files:** none.
**Files:**
- Create `supabase/migrations/20261103_21_newclient_first_order_flag.sql`.
- Create `supabase/tests/rls/newclient_first_order_flag.test.sql`.
- Modify `supabase/migrations/_verify.sql`: append block `verify:s6_newclient_flag`.

**Interfaces:**
```sql
update public.coupons
   set metadata = coalesce(metadata,'{}'::jsonb)
                  || jsonb_build_object('first_paid_order_only', true, 'first_order_rule', '20261103_21'),
       updated_at = now()
 where upper(code) = 'NEWCLIENT'
   and coalesce(metadata->>'first_order_rule','') <> '20261103_21';
```
- The marker means a later admin un-tick (S6-T12) is never re-stamped by a re-run.
- Final SELECT from `(values ('NEWCLIENT'))` left join coupons, with `ok = coalesce(k.code is null or k.metadata->>'first_order_rule' = '20261103_21', false)`.

Steps:
- [ ] **Failing test.** Build the coupons table the way `supabase/tests/rls/pricing_owner_package.test.sql`'s header builds it (20260603 coupons part, then 20261026_20). Assert:
  - (a) after `_21`, NEWCLIENT has `first_paid_order_only = 'true'` and marker `'20261103_21'`;
  - (b) an existing `metadata.owner_rules` and `rules` survive;
  - (c) set `first_paid_order_only = false` by hand, run `_21` again, and it stays false;
  - (d) NZAMY50's metadata is untouched;
  - (e) with no NEWCLIENT row, the SELECT returns `ok = t`.
- [ ] **Run:** `bash supabase/tests/rls/run.sh <chain> supabase/tests/rls/newclient_first_order_flag.test.sql`. Expect FAIL (no migration yet).
- [ ] **Code:** as above, in `begin; … commit;`. The header carries RUN ORDER «BEFORE the deploy of S6-T10» plus the zero-money-effect note from the run-order table.
- [ ] **Verify:** PASS with `ok = t`, twice. Negative control: without `_21`, (a) fails.
- [ ] **Commit:** `feat(coupons): NEWCLIENT's first-order rule lives in its row (20261103_21)`.

### S6-T10: Coupon rules read the row only (drop the code-name branch; per-item exclusion)

**Row:** §6.2.3 (`couponRules.ts:81` at HEAD), and item 3 of the dispatch (NZAMY50 must be table-driven). **Shared files:** none.
**Files:**
- Modify `src/lib/payments/couponRules.ts:74-82`: `isFirstOrderCoupon`, `CouponContext`, `evaluateCoupon`.
- Modify `src/lib/payments/couponServer.ts:351-360`: pass `itemId: input.item.id`.
- Modify `src/lib/payments/couponRules.test.ts`.
- Modify `src/lib/payments/checkoutCore.test.ts` (fixture `FIRST_ORDER_ROW`, line 671).
- Modify `src/lib/payments/couponServer.test.ts` if its fixtures rely on the name.
- Create `src/lib/payments/couponCodeLiterals.test.ts`.

**Interfaces:**
- `isFirstOrderCoupon(row) = row.metadata?.first_paid_order_only === true` (the name is no longer read).
- `CouponContext` gains `itemId: string`.
- New `export function excludedItemsOf(row: Pick<CouponRow,"metadata">): string[]` returns the strings in `metadata.excluded_items` when it is an array, else `[]`.
- `evaluateCoupon` returns `{ok:false, reason:"not_for_item"}` when `excludedItemsOf(row).includes(ctx.itemId)`. Place it after the kinds check.
- This lets any answer to ٤٣٦ (keep, disable, change value, or «not on ind-ai») be an admin edit. **No coupon value changes.**

Steps:
- [ ] **Failing tests.** In `couponRules.test.ts`, replace test `:160-166` with "S6: only the row makes a first-order coupon":
  - `isFirstOrderCoupon(NEWCLIENT) === false` (fixture without metadata);
  - `isFirstOrderCoupon({...NEWCLIENT, metadata:{first_paid_order_only:true}}) === true`;
  - `isFirstOrderCoupon({...NZAMY50, metadata:{first_paid_order_only:"true"}}) === false`.

  Add "S6: metadata.excluded_items refuses that item only":
  - with `row = {...NZAMY50, metadata:{excluded_items:["ind-ai"]}}`, `evaluateCoupon(row, ctx({itemId:"ind-ai", netHalalas:24900}))` deep-equals `{ok:false, reason:"not_for_item"}`;
  - `evaluateCoupon(row, ctx({itemId:"lawyer-pro"}))` deep-equals `{ok:true, discountHalalas:5000}`;
  - `evaluateCoupon({...NZAMY50, metadata:{excluded_items:"ind-ai"}}, ctx({itemId:"ind-ai", netHalalas:24900}))` deep-equals `{ok:true, discountHalalas:5000}` (a malformed list is ignored).

  The `ctx()` default gains `itemId: "lawyer-pro"`. The ٣٠٥ tests' `firstOrder` fixture gains `metadata:{first_paid_order_only:true}`.

  `couponCodeLiterals.test.ts`, "S6: no coupon is special-cased by its name". It scans every non-test `.ts` under `src/lib/payments`, `src/app/api/v1/coupons`, `src/app/api/v1/payments` and `src/app/api/v1/admin/coupons`, with `//` and `/* */` comments stripped. Assertions:
  - 0 matches of `/["'](NZAMY50|NEWCLIENT|LAUNCH2026)["']/`;
  - 0 matches of `/\b(row|coupon|c|k)\.code(\.toUpperCase\(\))?\s*[!=]==?\s*["'][A-Z0-9_-]{2,32}["']/`. Only a coupon row's code is checked, never Postgres/PostgREST error codes;
  - the second regex does **not** match the fixture line `if (error.code === "23505") {`.
- [ ] **Run:** `node --test src/lib/payments/couponRules.test.ts src/lib/payments/couponCodeLiterals.test.ts`. Expect FAIL.
- [ ] **Code:** as listed. Update `FIRST_ORDER_ROW` in `checkoutCore.test.ts` with `metadata:{first_paid_order_only:true}`. Grep callers of `evaluateCoupon` and `CouponContext` and report them; expected: `couponServer.ts` and its tests.
- [ ] **Verify:** `node --test src/lib/payments/*.test.ts` → PASS; `npm run test:unit` (baseline); `tsc`.
- [ ] **Commit:** `refactor(coupons): first-order and item exclusions come from the coupon row, never its name`.

### S6-T11: Admin coupon API edits every rule

**Row:** §6.2.3 («managed 100% from admin»). **Shared files:** none.
**Files:**
- Modify `src/lib/payments/couponAdminRules.ts`.
- Modify `src/lib/payments/couponAdminRules.test.ts`.
- Modify `src/app/api/v1/admin/coupons/route.ts`: POST, and the role mapping `:21-23`.
- Modify `src/app/api/v1/admin/coupons/[id]/route.ts`: PATCH, and the role mapping `:29-31`.

**Interfaces:**
- **Role mapping.** `export function couponRoleToUserType(role: string): string` maps `client`→`individual` and `business`→`corporate`; others are unchanged. `export const COUPON_USER_TYPE_TO_ROLE: Record<string, string>` adds `corporate: "business"`.
  - **Bug fixed:** the page role «الشركات» was stored as `'business'`, which no `profiles.user_type` has, so a company never matched.
- **Patch rules.** `adminDiscountPatch(existing, body, nextActive)` now also accepts `maxDiscountPct` and `excludedKinds`, with the same rules and errors as `adminDiscountFields`. It returns `max_discount_pct`, and `excluded_kinds` with `topup` always added.
- **Metadata patch.** `export function adminCouponMetadataPatch(existing: Record<string, unknown> | null, body: Record<string, unknown>): { ok: true; metadata: Record<string, unknown> | null } | { ok: false; error: string }`:
  - `firstPaidOrderOnly` (boolean) → `first_paid_order_only`;
  - `excludedItems` (string[], each an `Object.hasOwn(PRICE_BOOK, id)`) → `excluded_items`. An unknown id gives `"منتج مستثنى غير معروف"`.
  - It returns `metadata: null` when neither key is sent.
  - Every other key (`owner_rules`, `rules`, `first_order_rule`, `status`) is kept.
- POST and PATCH both apply it. The audit `after` includes `metadata` when it changed.
- **One metadata build in PATCH.** Today `[id]/route.ts:113-122` rewrites `metadata` as the previous metadata plus `status` on any status change. Replace it with a single expression: `{ ...existing.metadata, ...(flagsPatch ?? {}), ...(statusChanged ? { status: nextStatus } : {}) }`. A body carrying both a status and a flag then keeps both. Export it as `export function buildCouponPatchMetadata(existing: Record<string, unknown> | null, flags: Record<string, unknown> | null, nextStatus: string | null): Record<string, unknown> | null`, which returns `null` when nothing changes.
- **Leftover rows.** Coupons already saved with the role `'business'` still never match a company. New migration `supabase/migrations/20261103_22_coupon_business_role.sql`, run **AFTER** the deploy:
  - `update public.coupons set eligible_user_types = array_replace(eligible_user_types, 'business', 'corporate'), updated_at = now() where 'business' = any(eligible_user_types);`
  - Final SELECT: `select count(*) filter (where 'business' = any(eligible_user_types)) as left_business, (count(*) filter (where 'business' = any(eligible_user_types)) = 0) as ok from public.coupons;` (`ok` is never NULL), plus a second SELECT listing the codes now holding `corporate`.
  - Why after the deploy: the old page maps `corporate` to nothing and then to `["client"]`, so an edit before the deploy would narrow the coupon.
  - Docker test `supabase/tests/rls/coupon_business_role.test.sql` (coupons chain as in S6-T9). A row `{business, lawyer}` becomes `{corporate, lawyer}`; a second run changes nothing (same `xmin`); a row without `business` is untouched.

Steps:
- [ ] **Failing tests** (append to `couponAdminRules.test.ts`).
  - "S6: company coupons target corporate": `couponRoleToUserType("business") === "corporate"`, `couponRoleToUserType("client") === "individual"`, `couponRoleToUserType("lawyer") === "lawyer"`.
  - "S6: PATCH may change the cap and the excluded kinds":
    - `adminDiscountPatch({discount_type:"fixed",min_order_amount:200,active:true},{maxDiscountPct:20, excludedKinds:["plan"]},undefined)` → `{ok:true, fields:{max_discount_pct:20, excluded_kinds:["topup","plan"]}}`;
    - `{maxDiscountPct:30}` → error `MAX_PCT_AR`;
    - `{excludedKinds:["x"]}` → `KINDS_AR`.
  - "S6: metadata flags keep the owner's stamps":
    - `adminCouponMetadataPatch({owner_rules:"r", first_order_rule:"20261103_21"},{firstPaidOrderOnly:false})` → `{ok:true, metadata:{owner_rules:"r", first_order_rule:"20261103_21", first_paid_order_only:false}}`;
    - `{excludedItems:["ind-ai"]}` → `metadata.excluded_items` deep-equals `["ind-ai"]`;
    - `{excludedItems:["nope"]}` → `{ok:false, error:"منتج مستثنى غير معروف"}`;
    - `({}, {})` → `{ok:true, metadata:null}`.
  - "S6: a status change and a flag in one PATCH both survive": `buildCouponPatchMetadata({owner_rules:"r", status:"active"}, {first_paid_order_only:false}, "disabled")` deep-equals `{owner_rules:"r", status:"disabled", first_paid_order_only:false}`; `buildCouponPatchMetadata({a:1}, null, null) === null`.
- [ ] **Run:** `node --test src/lib/payments/couponAdminRules.test.ts`. Expect FAIL.
- [ ] **Code:** as listed. Replace both routes' private `roleToUserType` with the shared function. Write migration `_22` and its Docker test; run `bash supabase/tests/rls/run.sh <coupons chain> supabase/migrations/20261103_22_coupon_business_role.sql supabase/migrations/20261103_22_coupon_business_role.sql supabase/tests/rls/coupon_business_role.test.sql` → PASS, `ok = t`.
- [ ] **Verify:** the tests pass; `tsc`; build.
- [ ] **Commit:** `feat(coupons): admin edits first-order, item exclusions, cap and kinds; company coupons target corporate`.

### S6-T12: Coupons page — diff-only save, the new fields, no wrong badge

**Row:** §6.2.3, and §1.6 (the wrong "Backend-ready" badge at `coupons/page.tsx:369`, still present at HEAD). **Shared files:** none.
**Files:**
- Create `src/lib/payments/couponAdminDiff.ts` and `src/lib/payments/couponAdminDiff.test.ts`.
- Modify `src/app/dashboard/admin/subscriptions/coupons/page.tsx`: `mapRowToCoupon` `:63-98`, `USER_TYPE_TO_ROLE` `:31-41`, `saveDraft` `:222-269`, the editor `:369-445`.
- Modify `src/types/adminBackendReady.ts`: `AdminCoupon` gains `maxDiscountPct?: number; excludedKinds?: string[]; firstPaidOrderOnly?: boolean; excludedItems?: string[]`.

**Bugs this fixes** (verified at HEAD):
1. `mapRowToCoupon` turns an empty `eligible_user_types` (meaning everyone) into `["client"]`. Because `saveDraft` PATCHes the whole draft, opening NZAMY50 to change any field narrowed it to individuals.
2. `toDateInput` keeps the date only, so the same save moved `valid_until 23:59:59Z` to `00:00Z`.
3. A coupon's dates and audience were rewritten even when not touched.

**Interfaces:** `export function couponPatchDiff(original: AdminCoupon, draft: AdminCoupon): Record<string, unknown>` returns only the changed API keys (`value`, `minOrderAmount`, `usageLimit`, `startsAt`, `expiresAt`, `status`, `eligibleRoles`, `maxDiscountPct`, `excludedKinds`, `firstPaidOrderOnly`, `excludedItems`). Arrays are compared as sets. An unchanged draft gives `{}`, and the page then says «لا تغييرات للحفظ» without a request.

Steps:
- [ ] **Failing test** "S6: saving an edited coupon sends only what changed". With `base` = an NZAMY50-shaped `AdminCoupon` (`eligibleRoles: []`, `expiresAt: "2027-12-31"`):
  - `couponPatchDiff(base, base)` deep-equals `{}`;
  - `couponPatchDiff(base, {...base, value:40})` deep-equals `{value:40}`;
  - `couponPatchDiff(base, {...base, eligibleRoles:["lawyer"]})` deep-equals `{eligibleRoles:["lawyer"]}`;
  - `couponPatchDiff(base, {...base, firstPaidOrderOnly:true})` deep-equals `{firstPaidOrderOnly:true}`;
  - `couponPatchDiff(base, {...base, excludedKinds:["plan","topup"]})`, with base `["topup","plan"]`, deep-equals `{}`.
- [ ] **Run:** `node --test src/lib/payments/couponAdminDiff.test.ts`. Expect FAIL.
- [ ] **Code.**
  - An empty audience stays `[]`, and the role chips gain «الجميع», which sets `[]`.
  - `USER_TYPE_TO_ROLE` gains `corporate: "business"`.
  - The editor gains:
    - a checkbox «للطلب المدفوع الأول فقط»;
    - chips for excluded kinds (`plan|library|service`; «الشحن مستثنى دائماً» shown fixed);
    - a multi-select of on-sale price-book ids for excluded items;
    - a number field «سقف الخصم ٪» (max 25).
  - An existing coupon saves `couponPatchDiff(original, draft)`. A new one POSTs as today.
  - Delete the "Backend-ready" badge (`:369`).
  - The page header comment at `:121` stays accurate.
- [ ] **Verify:** the test passes; `tsc`; eslint. Manual on a local DB: open NZAMY50, change nothing and save → no request; change the value to 40 → PATCH body is `{"value":40}`, and `eligible_user_types` stays `{}`.
- [ ] **Commit:** `fix(admin/coupons): edits send only what changed (audience and dates kept); new rule fields; wrong badge removed`.

### S6-T13: The coupon's usage log reads `coupon_usage`

**Row:** §6.2.3 («tab bound to coupons + coupon_redemptions». The real table is `coupon_usage`, 20260603_phase1_003 `:116`).
- **Honesty defect at HEAD:** the modal shows «لم يتم استخدام الكوبون بعد» whenever `usageLog` is `[]`, which is always (`mapRowToCoupon:97`), even when `used_count > 0`.
- The CSV button (`:587-590`) does nothing.

**Shared files:** none.
**Files:**
- Create `src/app/api/v1/admin/coupons/[id]/usage/route.ts`.
- Create `src/lib/payments/couponUsageView.ts` and `src/lib/payments/couponUsageView.test.ts`.
- Modify `coupons/page.tsx`, the modal at `:570-620`.

**Interfaces:**
- `GET`: `requireAdmin()`; service client;
  - `coupon_usage.select("id, user_id, order_id, discount_applied, created_at").eq("coupon_id", id).order("created_at",{ascending:false}).limit(200)`;
  - then `profiles.select("id, display_name, user_type").in("id", userIds)` (≤ 200 ids, under the ~396 `.in()` ceiling);
  - returns `{ data: CouponUsageView[] }`. An error is a 500.
- `export type CouponUsageView = { usedBy: string; usedByRole: string; orderId: string | null; discountApplied: number; createdAt: string }`.
- `export function mapCouponUsageRows(rows, profiles): CouponUsageView[]`. A missing profile gives `usedBy "حساب محذوف"`.

Steps:
- [ ] **Failing test** "S6: usage rows":
  - `mapCouponUsageRows([{id:1,user_id:"u1",order_id:"o1",discount_applied:"50.00",created_at:"2026-11-01T10:00:00Z"}],[{id:"u1",display_name:"سارة",user_type:"corporate"}])` deep-equals `[{usedBy:"سارة", usedByRole:"business", orderId:"o1", discountApplied:50, createdAt:"2026-11-01T10:00:00Z"}]`;
  - an unknown user → `usedBy "حساب محذوف"`, `usedByRole "client"`.
- [ ] **Run:** `node --test src/lib/payments/couponUsageView.test.ts`. Expect FAIL.
- [ ] **Code.**
  - The modal fetches on open, with loading, «تعذّرت قراءة السجل» and empty («لم يُسجَّل استخدام بعد») states. The empty message shows only after a successful empty read.
  - Dates are formatted on the client, at render, in `Asia/Riyadh`.
  - Remove the dead CSV button.
- [ ] **STOP-POINT (conditional):** `coupon_usage` is read with the service role. If the implementer thinks an RLS policy is needed, stop and ask; none is planned.
- [ ] **Verify:** the test passes; `tsc`; build.
- [ ] **Commit:** `feat(admin/coupons): real usage log from coupon_usage; dead CSV button removed`.

## Part D — Admin «عرض كـ» across every role (slice A §6.1.2)

**Hard constraint for D1–D5:** simulation never overrides `useUser()`, any guard, `src/proxy.ts` or any API. `requests/new` stamps `requester.role` from `useUser()`, so simulation must never reach a request body. The server keeps treating the admin as admin: points stay exempt (`runCore.ts`), and the caption says so.

### S6-T14 (D1): Widen the admin view to every dashboard

**Row:** §6.1.2. **Shared files:** `src/lib/nav/shellContext.ts`, `src/hooks/useAdminView.ts`, `src/app/ai/layout.tsx` (navigation).
**Files:** modify `src/lib/nav/shellContext.ts` (`:39-140`, `resolveAiShell` `:196-205`) and `src/lib/nav/shellContext.test.ts`.

**Interfaces:**
- `export type AdminView = "admin" | "lawyer" | "firm" | "individual" | "corporate" | "micro" | "provider" | "government" | "ngo";`
- `parseAdminView` accepts exactly those 9 values.
- `adminViewFromPath(pathname)` returns the dashboard of any `/dashboard/<x>` path (`client`→`individual`, `business`→`corporate`), else `null`.
- `resolveAdminView(pathname, stored)` returns, in order:
  1. the path's view;
  2. on `/ai/*`, the stored view when it is neither `null` nor `"admin"`, else `"lawyer"` (the old rule is kept for stored `admin`/`lawyer`);
  3. otherwise `stored ?? "admin"`.
- `resolveAiShell`'s admin branch maps the view to a shell: `individual`→`client`, `corporate`→`business`, and the rest map by name; `"admin"` is not reachable on `/ai`.

Steps:
- [ ] **Failing tests.** Keep every existing regression row for `admin`/`lawyer` and for non-admin sessions.
  - One existing test must change on purpose, and the change must be listed in the report: "NOTE-22-C02: the switch presses a button only for the two views" (`shellContext.test.ts:311-319`). With nine views, `switchCurrentView("corporate")` etc. now return their view; rewrite the loop to expect that.
  - `adminViewFromPath("/dashboard/lawyerish") === null` (`:185`) stays.

  Add "S6: admin views for every dashboard":
  - `parseAdminView("firm") === "firm"`, `parseAdminView("superuser") === null`;
  - `adminViewFromPath("/dashboard/business/contracts") === "corporate"`, `adminViewFromPath("/dashboard/client") === "individual"`;
  - `resolveAdminView("/ai/draft","firm") === "firm"`, `resolveAdminView("/ai/draft","admin") === "lawyer"`;
  - `resolveAiShell({loading:false,isLoggedIn:true,userType:"admin",pathname:"/ai/draft",storedView:"corporate",lastDashboard:null}) === "business"`;
  - `resolveNavUserType({pathname:"/notifications",sessionUserType:"admin",storedView:"government"}) === "government"`;
  - a non-admin with stored `"firm"` on `/ai/draft` keeps the old answer, `"lawyer"` for a lawyer.
- [ ] **Run:** `node --test src/lib/nav/shellContext.test.ts`. Expect FAIL.
- [ ] **Code:** as listed. Grep every consumer of `AdminView`, `resolveAdminView`, `adminViewFromPath` and `parseAdminView` and report them: `useAdminView.ts`, `ai/layout.tsx`, `notifications/layout.tsx`, `AdminSidebar.tsx`, `AdminViewSwitch.tsx`, `GlobalSearch.tsx`, `SharedSidebar.tsx`, `Navbar.tsx`. Each must still compile and keep its behaviour for `admin`/`lawyer`.
- [ ] **Verify:** `node --test src/lib/nav/*.test.ts` → PASS; `tsc`; build.
- [ ] **Commit:** `feat(nav): the admin view covers every dashboard (UI only)`.

### S6-T15 (D2): Sub-role simulation model (pure) and hook

**Row:** §6.1.2. **Shared files:** none (new files).
**Files:**
- Create `src/lib/nav/adminSimulation.ts` and `src/lib/nav/adminSimulation.test.ts`.
- Create `src/hooks/useAdminSimulation.ts` (`useSyncExternalStore` over sessionStorage, like `useAdminView.ts`).

**Interfaces:**
- `export const ADMIN_SIM_STORAGE_KEY = "nzamy_admin_sim";`
- `export type AdminSimMode = "override" | "simulate";`
- `export type AdminSimulation = { view: AdminView; practiceKind?: PracticeKind; affiliationRole?: "managing_partner" | "lawyer"; governmentRole?: GovernmentRole; mode: AdminSimMode };`
- `export const ADMIN_SWITCH_OPTIONS: ReadonlyArray<{ id: string; group: "المهنيون" | "العملاء" | "الجهات" | "الإدارة"; label: string; sim: Omit<AdminSimulation,"mode">; href: string }>`. Exactly 14 options:
  - lawyer advocate; lawyer consultant («مستشار (م ١٨)»);
  - firm managing partner; firm member;
  - provider; individual; corporate; micro;
  - government judge, prosecutor, officer and gov_counsel;
  - ngo; admin.
- Hrefs: `/dashboard/lawyer`, `/dashboard/firm`, `/dashboard/provider`, `/dashboard/client`, `/dashboard/business`, `/dashboard/micro`, `/dashboard/government`, `/dashboard/ngo`, `/dashboard/admin`.
- `parseAdminSimulation(raw: unknown): AdminSimulation | null` (strict, rejects unknown values), `readStoredAdminSimulation(storage)`, `writeStoredAdminSimulation(storage, sim): boolean`.
- `export function simulatedNavIdentity(realUserType: UserType, sim: AdminSimulation | null, navView: AdminView): { practiceKind: PracticeKind | null; affiliationRole: string | null; governmentRole: GovernmentRole | null } | null` returns `null` unless `realUserType === "admin"` and `sim?.view === navView`.

Steps:
- [ ] **Failing tests** "S6: the switch options and the simulation":
  - `ADMIN_SWITCH_OPTIONS.length === 14`; the ids are unique; every `href` starts with `"/dashboard/"`;
  - `parseAdminSimulation({view:"government",governmentRole:"judge",mode:"simulate"})` round-trips;
  - `parseAdminSimulation({view:"government",governmentRole:"king",mode:"simulate"}) === null`;
  - `simulatedNavIdentity("admin",{view:"lawyer",practiceKind:"consultant",mode:"override"},"lawyer")` deep-equals `{practiceKind:"consultant",affiliationRole:null,governmentRole:null}`;
  - `simulatedNavIdentity("lawyer", <same sim>, "lawyer") === null` (a stale value in a non-admin tab is ignored);
  - `simulatedNavIdentity("admin", <same sim>, "firm") === null`.
- [ ] **Run:** `node --test src/lib/nav/adminSimulation.test.ts`. Expect FAIL.
- [ ] **Code:** pure module with relative `.ts` imports and type-only `@/` imports; the hook mirrors `useAdminView`.
- [ ] **Verify:** the test passes; `tsc`.
- [ ] **Commit:** `feat(nav): admin sub-role simulation model (UI only)`.

### S6-T16 (D3): The switcher UI

**Row:** §6.1.2. **Shared files:** `src/components/dashboard/AdminViewSwitch.tsx` (rendered in SharedSidebar and AdminSidebar).
**Files:** modify `src/components/dashboard/AdminViewSwitch.tsx`. Create `src/components/dashboard/AdminViewSwitch.test.ts` (source test).

**UI:**
- A `<select>` grouped by `<optgroup>` from `ADMIN_SWITCH_OPTIONS`, replacing the 2 buttons.
- A two-state toggle: «تجاوز الأدمن» (default) / «محاكاة القيود».
- Caption: «يغيّر القوائم والعرض فقط — الخادم يعاملك كأدمن ولا تُخصم نقاطك».
- On choose: `setAdminView(opt.sim.view)`, `writeStoredAdminSimulation({...opt.sim, mode})`, then `router.push(opt.href)` when the path differs.
- Still rendered only when the **real** role is admin (`:40` unchanged).

Steps:
- [ ] **Failing source test** "S6: the switch lists every role and says it is UI-only":
  - the file imports `ADMIN_SWITCH_OPTIONS`;
  - it contains `"محاكاة القيود"` and `"الخادم يعاملك كأدمن"`;
  - it still contains `userType !== "admin"`;
  - it no longer contains the literal `OPTIONS: Array<`.
- [ ] **Run:** `node --test src/components/dashboard/AdminViewSwitch.test.ts`. Expect FAIL.
- [ ] **Code:** as listed. Theme tokens: no `text-gray-100/200`.
- [ ] **Verify:** test, `tsc`, eslint, build. Manual: as admin, choose «قاضٍ» → `/dashboard/government`; the same tab persists across a reload.
- [ ] **Commit:** `feat(admin): «عرض كـ» across all roles and sub-roles`.

### S6-T17 (D4): Menus follow the simulated sub-role

**Row:** §6.1.2. **Shared files:** `src/components/dashboard/SharedSidebar.tsx`, `src/components/dashboard/GlobalSearch.tsx` (navigation), `src/app/dashboard/government/page.tsx`.
**Files:** those three, plus `src/lib/nav/adminSimulation.test.ts` (extend).

**Interfaces:**
- SharedSidebar `:95` and GlobalSearch `:130` call `getSidebarByUserType(…)` with `governmentRole`, `affiliationRole` and `practiceKind` taken from `simulatedNavIdentity(sessionUserType, sim, navUserType)` when it is non-null; otherwise the user's own values, unchanged.
- The government home: `resolveGovernmentRole(simId?.governmentRole ?? user.governmentRole)`.

Steps:
- [ ] **Failing test** "S6: an admin simulating a judge gets the judge's menu": `getSidebarByUserType("government","full",null,[],"judge")` vs the args produced via `simulatedNavIdentity("admin",{view:"government",governmentRole:"judge",mode:"override"},"government")` → the same group labels. Also add a guard: no file among `src/app/dashboard/client/requests/new/page.tsx`, `src/app/dashboard/client/consultation/new/page.tsx`, `src/hooks/useConsultationForm.ts` and `src/components/floating/whatsappWorkflow.ts` imports `useAdminSimulation` or `adminSimulation`.
- [ ] **Run:** `node --test src/lib/nav/adminSimulation.test.ts`. Expect FAIL on the guard (it must exist first) or the assertion.
- [ ] **Code:** as listed. Grep `getSidebarByUserType(` callers and report them; only the two shells change.
- [ ] **Verify:** test; `tsc`; build. Manual: admin as «مستشار (م ١٨)» sees the consultant lawyer menu (no pleading items).
- [ ] **Commit:** `feat(nav): admin menus follow the simulated sub-role`.

### S6-T18 (D5): «محاكاة القيود» applies the UI gates

**Row:** §6.1.2 («simulate real restrictions» vs «admin override»). **Shared files:** `src/app/dashboard/business/layout.tsx`, `src/components/dashboard/ConsultantGate.tsx`, `src/app/dashboard/firm/layout.tsx`.
**Files:** those three, plus `src/lib/nav/adminSimulation.ts`/`.test.ts`.

**Interfaces:** `export function adminBypassesUiGates(realUserType: UserType, sim: AdminSimulation | null): boolean` is true iff the real role is admin and `sim?.mode !== "simulate"`. Used in three places:
- business layout `:88`: `sectionHidden = !adminBypassesUiGates(userType, sim) && isHiddenBusinessSection(pathname)`;
- ConsultantGate `:23`: an admin in simulate mode with `practiceKind "consultant"` sees `ConsultantBlockedPanel`;
- firm layout: `activeRole` for an admin in simulate mode = `sim.affiliationRole` mapped to `FirmRole` (`managing_partner`→`managing_partner`, `lawyer`→`lawyer`).

Server checks are untouched. The switch caption from S6-T16 already says the server still treats the admin as admin.

Steps:
- [ ] **Failing test** "S6: simulate mode drops the admin's UI bypass only":
  - `adminBypassesUiGates("admin", null) === true`;
  - `adminBypassesUiGates("admin", {view:"corporate", mode:"override"}) === true`;
  - `adminBypassesUiGates("admin", {view:"corporate", mode:"simulate"}) === false`;
  - `adminBypassesUiGates("corporate", null) === false`.
- [ ] **Run:** `node --test src/lib/nav/adminSimulation.test.ts`. Expect FAIL.
- [ ] **Code:** as listed.
- [ ] **Verify:** test; `tsc`; build. Manual: admin in «شركة» + simulate sees the «قريباً» section notice on a hidden business route, and in override mode does not.
- [ ] **Commit:** `feat(admin): «محاكاة القيود» applies the dashboards' UI gates`.

## Part E — Honest admin security page (slice A §1.6; promised to the owner for Wave 2)

### S6-T19: Remove the illustrative security data

**Row:** §1.6 (internal dashboards showing mock data). The Wave 1 owner report, «ملاحظات لا تحتاج قرارًا», says: «مربعات أرقام تجريبية ليست حقيقية، وسنصلحها في الموجة الثانية». If the library section also plans this page, the controller keeps one copy. **Shared files:** none.
**Files:** modify `src/app/dashboard/admin/security/page.tsx` (`:21-48` constants, `:75-76` traffic, `:88-111` notice and KPIs, plus the four mock tabs). Create `src/app/dashboard/admin/security/page.test.ts`.

**What changes:**
- Delete `DUP_ACCOUNTS`, `BLOCKED_IPS`, `FAILED_LOGINS`, `THREAT_TYPES`, `trafficData` and the KPI row. These are invented people (e.g. «U-0005»), IPs and percentages.
- The tabs «نظرة عامة», «حسابات مكررة», «حماية البوتات» and «التهديدات» keep their place with a «قريباً» badge. Each renders one panel: «قريباً — لا يجمع النظام هذه البيانات بعد».
- The amber «بيانات توضيحية» notice is removed, since nothing illustrative remains.
- `library_activity` and `library_locks` are unchanged and stay the default.

Steps:
- [ ] **Failing source test** "S6: no invented security data":
  - the file contains none of `"U-0005"`, `"185.243"`, `"٢.١%"`, `"DUP_ACCOUNTS"`, `"trafficData"`, `"بيانات توضيحية"`;
  - it contains `"قريباً"`, `"LibraryActivityPanel"` and `"LibraryLocksPanel"`.
- [ ] **Run:** `node --test src/app/dashboard/admin/security/page.test.ts`. Expect FAIL.
- [ ] **Code:** as listed. Remove the imports left unused.
- [ ] **Verify:** test; `tsc`; eslint; build.
- [ ] **Commit:** `fix(admin/security): no invented threat data; unbuilt tabs say «قريباً»`.

---

## Estimate

| Part | Tasks | Days |
|---|---|---|
| A. Business contract review at 800 | T1–T6 | 2.25 |
| B. Real admin pricing screen | T7–T8 | 0.75 |
| C. Coupons (NEWCLIENT, NZAMY50 table-driven, admin) | T9–T13 | 2.0 |
| D. Admin «عرض كـ» across all roles | T14–T18 | 2.0 |
| E. Security page honesty | T19 | 0.25 |
| **Total** | **19 tasks** | **≈ 7.25 days** |

Migrations:
- `20261103_20`: any time; recommended after the deploy;
- `20261103_21`: before the deploy;
- `20261103_22`: after the deploy.

**Stop points:** no unconditional one: no live n8n, no new npm dependency, no RLS change. Three conditional ones:
- S6-T1, if any policy change on `admin_pricing_catalog` seems needed;
- S6-T3, if dropping the `enabled` filter would hide a `public` card;
- S6-T13, if any policy on `coupon_usage` seems needed.

## Excluded (blocked by an open owner question)

| Item | Slice A row | Blocking question |
|---|---|---|
| Points repricing: claim 200, consult 100 / letter 50, assistant 40 per 15, quick answer 15, wargaming 150/75, najiz 5→15 and a free rules tier | §3 table q322/324/325, §3.3b | ٤٠٩، ٤١٠، ٤١١، ٤١٢، ٤١٦ |
| One free quick question a day for individuals | §3.3b | ٤١٢ |
| ind-smart: 249 including or before VAT; yearly only | §6.2.1b | ٤١٩ |
| ind-litigation replacement (365), and the client founder offer 296 for 496 seats | §6.2.1c | ٤٢٠ |
| Marketplace commission (providers tab 20/10/5, terms 5–15 %, any commission number on the admin pricing screen) | §6.2.4, §1.2c | ٤٢١ |
| Top-up offer-period bonus (500→700 … 10,000→30,000) | §6.2.2b | ٤٢٢ |
| Terms patch; privacy controller/processor and DPA text; ZDR wording; express-consent capture | §1.2b, §1.2c, §1.2d | ٤٢٣ |
| Renewal of retired cycles | §6.2.1a (follow-up) | ٤٣٥ |
| NZAMY50's value (249→199 on ind-ai). Only the code path is made table-driven (S6-T10, T11, T12) | §6.2.3 | ٤٣٦ |
| Company/legal-department plan contents; the 9-seat cap for founding companies; the `/services/corporate` cards at 2,499 / 5,999 | §6.2.2c | ٤٣٧ |

**Blocked without a question number** (a new owner question is needed; not planned):
- §1.6 hide vs wire vs relabel for the other 22 files that still show «Backend-ready»/«Mock» (admin business, community moderation, content articles, features, platform, firm verification, sector profiles; firm ×9; ngo ×3; three readiness panels).
- The q323/326 «subscriber discount» on the 500-point simple contract: no discount is defined.

**Belongs to other sections or to ops (not S6):**
- §1.3 captcha on the library challenges: library section; ٤٢٦ names the locks.
- q283 «+5 points a page above 30» (cap 150 per the canonical doc): `tools.ts` and the file pipeline, so the AI-tools section (slice E C6).
- Missing AI tools in the §3 table: AI-tools section.
- §1.1 repo private plus key rotation, §1.3 Turnstile keys, §1.4 Moyasar live keys, §1.2e n8n live setting: NOT-CODE, owned by the user.
- Seen, not slice A, not planned: the mock data on `admin/escrow`, `admin/payouts` and `admin/celebrities/*`; the per-service prices on `/services/business` (not checked against the pricing doc). Voice consultation price (٤٣٣) and the «التأمين القانوني» name (٤٣٤) are not touched.
