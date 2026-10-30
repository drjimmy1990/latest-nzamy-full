# Owner package of 30 Oct 2026: pricing and coupons (answers ٢٩٩–٣٠٦)

**Branch:** `batch/2026-10-30-pricing-coupons`, based on main `235e1bef`. Not merged, not pushed, not deployed.

**Source:** the owner's handoff `Nezamy-Developer-Handoff-2026-10-30`, which was read only:
- the answers: `05-traceability/developer-questions-299-321.csv`, rows ٢٩٩–٣٠٦;
- the final revised pricing document: `07-references/REF0049.md` (`وثيقة_التسعير_الكنوني_الشامل_المنقحة_النهائية_2026-10-26.md`);
- the 28-Oct handover, whose conflict table wins over the document where they differ: `07-references/REF0037.md` §١/٣;
- the backlog: `00_START_HERE.md` rows LIVE-F11, UX14 and CODE-F28.

**Status words:** nothing here is marked closed. Each row says what changed, which files and tests prove it, and what to check on the live site after the deploy.

**Payments:** still in test mode. No live Moyasar setting was read or touched.

---

## 1. Per answer

### ٢٩٩: the revised pricing document is final, so P2–P6 are unfrozen

**Change:** the price book now holds the final document's prices for every item checkout already sells. The source is `REF0049.md`, with the conflict table of `REF0037` §١/٣ applied on top.

**Files:** `src/lib/pricing/priceBook.ts` (the one source); everything else derives from it. That includes `catalog.ts`, the `/pricing` cards (`cardPrice.ts`), `plans.ts` and the admin pricing page numbers.

**Tests:** `priceBook.test.ts` ("owner package 30 Oct 2026 (٢٩٩–٣٠٢)…") and `catalog.test.ts` ("prices and grants as the owner set them"). The "derivation" tests keep a second copy of any number out.

**Not built in this batch (documented, not guessed):**
- **P2:** the ERP / bundle plans, and retiring `lawyer-pro` into the doc's new lawyer tiers.
- **P3:** founder memberships (for example «عضوية الحماية القانونية» at 365, founder price 296 for the first 496 clients).
- **P4:** the per-tool point prices (see §3).
- **P5:** the per-service catalogue, with its own «سعر عرض الإطلاق −٢٥٪» lines (`REF0049` lines 640–693).
- **P6:** the business, legal-department, NGO and provider online entries.

Each of these needs new items, grants and screens, not a price change. They are listed for the next batch.

**Left unchanged on purpose:**
- `ind-preventive` (149 / 1,490) and `ind-litigation` (399 / 3,990).
- **Why:** the final document no longer prices `ind-preventive` at all and describes `ind-litigation` as yearly only. Which price applies is an owner question (§5, Q1).

**Check live:** `/pricing` on each tab. Every number on a card equals the checkout total before VAT.

### ٣٠٠: library-only yearly is 3,490 (3,790 and 5,000 are cancelled)

**Change:**

| Item | Before | After |
|---|---|---|
| `lib-annual` | 5,000 | 3,490 |
| `lib-q2` | 2,750 | 1,920 |
| `lib-q1` | 1,500 | 1,050 |

The quarterly and half-yearly prices are the document's (§4ج).

**Files:**
- `priceBook.ts`;
- `plans.ts` (header);
- the library cards read the book by id.

**Tests:**
- `priceBook.test.ts`, which pins 3,490 and fails on 3,790 or 5,000;
- `catalog.test.ts` (٢٥٨ library, VAT on top: 1,050 → 1,207.50);
- `checkoutCore.test.ts` (library 120,750 halalas);
- `cardPrice.test.ts`.

**Check live:**
- `/pricing` (library tab) and `/laws/subscribe` show 3,490 / 1,920 / 1,050.
- In test mode, `/checkout?item=lib-annual&billing=once` shows 3,490 + VAT = 4,013.50.

**Not built:** «المكتبة للمهنيين فقط» (`REF0037` §١/٢). It overlaps the library session's work (`library-owner-2026-10-30-CLAIM.md`), so `lib-*` stays `buyers: "any"`.

### ٣٠١: the smart AI plan is 29 / 79 / 149 / 249, with a launch price of 199 for yearly

**Change:**
- `ind-ai` now sells 29 monthly, 79 quarterly, 149 half-yearly and 249 yearly, with a launch price of 199 for yearly (see ٣٠٣).
- The cycle toggle on the individuals' tab now offers all four cycles.
- The badge reads «نحو ٠٫٦٨ ر.س يومياً بالاشتراك السنوي», from the document (§7أ.2).
- Removed:
  - «١٫٢٥ ر.س يومياً»;
  - «وفر شهرين عند الدفع السنوي», which is false at 249 against 29 × 12;
  - the «بدلاً من» 12-month figure on ind-ai, because its launch strike-through is the one reference;
  - «(شهرين مجاناً)» in `plans.ts`.

**Files:**
- `priceBook.ts`;
- `pricing.individuals.ts` (card, and the billing cell of the comparison table);
- `plans.ts`.

**Tests:**
- `priceBook.test.ts`, `cardPrice.test.ts` (29 / 79 / 249);
- `catalog.test.ts` (29 → 33.35 with VAT);
- `checkoutView.test.ts` (`ind-ai` semiannual is now accepted);
- `priceDisplay.test.ts` (no reference figure on ind-ai).

**Check live:**
- On `/pricing` → الأفراد, toggle each of the four cycles: ind-ai shows 29 / 79 / 149 / 249. The other two plans hide in quarterly and half-yearly.
- In test mode, check out ind-ai monthly: 29 + VAT = 33.35.

**DB:** `subscription_plans` is updated by `20261030_16`. The admin MRR reads it, checkout does not.

### ٣٠٢: the 100- and 250-point packs are for individuals only, valid 3 months

**Change:**
- `topup-100` and `topup-250` give 100 / 250 points for 3 months, with `buyers: ["individual"]`. Their cards moved to the individuals' tab, with the CTA `/register/client?type=individual&plan=topup-…`.
- The professionals' packs are the document's five (§4هـ), with `buyers` = lawyer, firm, corporate, micro, government, ngo, provider:

  | Pack (SAR) | Points | Valid for |
  |---|---|---|
  | 500 | 500 | 3 months |
  | 1,000 | 1,250 | 6 months |
  | 2,500 | 3,500 | 12 months |
  | 5,000 | 8,500 | 12 months |
  | 10,000 | 25,000 | 12 months |

- Before this batch, the packs were 100 / 250 / 500 / 1,000 for anyone, with 100 / 300 / 700 / 1,500 points.
- The lawyers' comparison table gained a «الصلاحية» row.
- The FAQ and the provider registration copy name the 500 pack as the first professional one.

**Files:**
- `priceBook.ts` (`INDIVIDUAL_BUYERS`, `PROFESSIONAL_BUYERS`, `topup()`);
- `pricing.lawyers.ts`, `pricing.individuals.ts`, `pricing.common.ts`;
- `register/provider/data.ts`;
- `dashboard/admin/pricing/page.tsx`.

**Tests:**
- `priceBook.test.ts` ("٣٠٢ / conflict ١١…");
- `catalog.test.ts` (buyers, plus `buyerAllowed` both ways);
- `pricingHonesty.test.ts` (٢٤٩ validity on each card, and each pack only on its own audience's tab);
- `pricingApprovals.test.ts` (lawyer tab = five packs, none of 100 / 250);
- `grantPurchase.test.ts` (1,000 → 1,250 points for 6 months);
- `checkoutView.test.ts`, `resultView.test.ts`, `refundPolicy.test.ts` (the validity sentence on /refund now has 7 packs).

**Check live:**
- A lawyer test account: `/checkout?item=topup-100&billing=once` answers «هذه الباقة غير متاحة لنوع حسابك» (403).
- An individual test account: `topup-500` gives the same 403.
- An individual buys `topup-250`: the points lot is 250, expiring in 3 months.

**Not built:** the document's larger «فترة العروض» balances (700 / 1,500 / 5,000 / 12,500 / 30,000). They carry no dates, so no card or checkout grants them (§5, Q2).

### ٣٠٣: launch prices are struck through, and disappear by date (decided on the server)

**Change:**
- A dated campaign `launch-2026` runs from 2026-10-25 to 2027-01-25, in Riyadh days with both ends included (`LAUNCH_CAMPAIGNS` in `priceBook.ts`).
- Launch prices exist only where the document has one:

  | Item | Listed | Launch |
  |---|---|---|
  | ind-ai yearly | 249 | 199 |
  | firm-basic yearly | 9,900 | 8,415 |
  | firm-enterprise yearly | 14,900 | 12,665 |

- **Where the date is decided:** on the server, per request.
  - Checkout charges by `catalog.quote(…, now)` and records `metadata.launch = { campaign_id, list_net_halalas }` on the order.
  - The `/pricing` cards ask `GET /api/v1/pricing/launch` (force-dynamic, `no-store`) after mount, through `useLaunchPrices`, whose first state is null. So a page cached by nginx never carries a launch price (the SSR cached-date trap), and the browser clock decides nothing.
- **What the buyer sees:**
  - the card shows the listed price struck through, a «سعر التدشين» pill, and the launch price;
  - the checkout page (server, force-dynamic) shows the same;
  - the Moyasar summary shows «السعر الأصلي (قبل سعر التدشين)» with a line-through.
- A stale map entry (one whose listed price is not the book's) shows nothing.

**Files:**
- `priceBook.ts` (`activeLaunchPrice`, `launchPriceOn`, `activeLaunchPrices`);
- `catalog.ts`, `checkoutCore.ts`, `checkoutRules.ts`;
- `app/api/v1/pricing/launch/route.ts` (new), `hooks/useLaunchPrices.ts` (new);
- `cardPrice.ts` (`cardLaunch`), `PricingCards.tsx`;
- `app/checkout/page.tsx`, `MoyasarCheckout.tsx`.

**Tests:**
- `priceBook.test.ts`:
  - the dates: 24 Oct 23:59 Riyadh has none, 25 Oct 00:00 runs, 25 Jan 23:59 runs, 26 Jan 00:00 has none;
  - only the cycle the document names;
  - no retired cycle.
- `catalog.test.ts`:
  - quote inside and outside the window;
  - all three `quote(` call sites pass the request's clock.
- `checkoutCore.test.ts`: order, intent and response carry 199; the day after, 249 and no `launch`.
- `cardPrice.test.ts` (rewritten from the old ١٧٩ test):
  - the card shows a launch price only from the server's map;
  - stale or malformed entries show nothing;
  - no clock in `cardPrice.ts`, `PricingCards.tsx` or `useLaunchPrices.ts`.

**Who can reach the route:** signed-out visitors too, which matters because most /pricing visitors are guests.
- `src/proxy.ts` sends a JSON 401 only for `isProtectedApiPath`, which covers `/api/v1/lawyer/`, `/api/v1/admin/` and `/api/v1/firm/` (`routeAccess.ts`).
- The proxy's rate limiter counts writes only (POST/PUT/PATCH/DELETE).

**What a launch order shows later:**
- Receipts, billing history and the admin order views print the order's own `net_halalas` / `vat_halalas` / `total_halalas` (`billingView.ts`: "current catalog prices never replace them").
- Fulfilment checks the payment against the order's own total (`fulfillDecision.ts`).
- So a 199 order never shows 249.

**Renewals:** none exist yet. The grant writes `auto_renew = false`, and payments B2 builds renewal.
- "لأول سنة / لأول دورة" therefore holds today because nothing renews.
- **B2 requirement:** a renewal must re-quote with `catalog.quote(item, billing, catalog, <renewal time>)` and never copy the earlier order's amount. Otherwise every launch buyer renews at 199.

**Check live (until 25 Jan 2027):**
- `curl -sI https://nezamy.sa/api/v1/pricing/launch` while signed out: 200 with `cache-control: private, no-store`.
- `curl -s https://nezamy.sa/api/v1/pricing/launch` lists three keys: `ind-ai:yearly`, `firm-basic:yearly` and `firm-enterprise:yearly`.
- On `/pricing` → الأفراد → سنوي, ind-ai shows ~~249~~ 199.
- A test checkout of ind-ai yearly charges 228.85.
- After 26 Jan 2027 the route answers `{}` and checkout charges 249, with no redeploy.

**Not built:** "or until seats run out". The document gives no seat count for these three items, so the end date is the only limit (§5, Q3).

**One reading to confirm:** the document calls the firm prices «سعر عرض إطلاق المكاتب / الشركات المهنية المؤسسة … لأول سنة». I applied them to every firm buying yearly inside the window. If «المؤسسة» means the founder cohort only, the campaign needs a cohort rule (§5, Q4).

"لأول سنة / لأول دورة": see "Renewals" above. It holds today only because nothing renews; it becomes a requirement on B2.

### ٣٠٤: LAUNCH2026 is stopped; an admin may re-enable it only with a minimum and a 25% cap

**Change:** none was needed. It was already built in P7:
- `20261026_20` switched every code besides `NZAMY50` / `NEWCLIENT` off, with `LAUNCH2026` among them.
- `couponAdminRules` refuses to switch a code on without a minimum above 0 and a value of 25% or less.

**Tests (existing, pass):**
- `couponAdminRules.test.ts`: "patch: no minimum of 0, no percentage above 25, and a discount coupon with minimum 0 cannot be switched on (LAUNCH2026)";
- `couponRules.test.ts` (the 25% cap at checkout).

**Check live:**
- On `/dashboard/admin/coupons`, `LAUNCH2026` is off.
- Switching it on with no minimum is refused, and so is a value of 30%.

### ٣٠٥: NEWCLIENT is for the buyer's first paid order on the platform

**Change:**
- `isFirstOrderCoupon(row)` is true for the code `NEWCLIENT` (any case), or for a row stamped `metadata.first_paid_order_only = true`.
- For such a code, `couponServer` reads whether the buyer has any earlier `paid` / `refunded` order of any item (`hasEarlierPaidOrder`; per user, not per service type).
  - Like the coupon's own once-per-user rule (`orderConsumedCoupon`), it does not count a test-mode payment (`live = false`) or a paid order that granted nothing (`already_entitled`). So a staff test payment never costs a real user NEWCLIENT.
- With an earlier order the code is refused with the generic «كود الخصم غير صالح أو منتهي الصلاحية», so a guesser cannot tell which codes exist.
- A failed read answers 503 and never gives the discount.
- `20261030_16` stamps the NEWCLIENT row so the rule is visible on the row.

**Files:** `couponRules.ts`, `couponServer.ts`, `20261030_16_pricing_owner_package.sql`.

**Tests:**
- `couponRules.test.ts` (two ٣٠٥ tests);
- `checkoutCore.test.ts`, five ٣٠٥ tests:
  - an earlier paid or refunded order refuses the code;
  - the first order applies it;
  - a test-mode or already-entitled earlier order does not count;
  - another code never reads the buyer's orders;
  - a failed read is 503.

**Check live:**
- In test mode, an individual with no paid order validates NEWCLIENT on a single service. After one paid order, the same code is refused.
- **Note:** NEWCLIENT's `excluded_kinds` still excludes plan, library and top-up (the document's «خدمة مفردة»). So today no online item takes it, until P5 sells single services.

### ٣٠٦: a coupon is returned on a cancellation inside 90 minutes, and stays used after a normal refund

**Change:** none was needed. It was already built:
- `refundCore` calls `releaseCouponUsage` only on a void inside `VOID_WINDOW_MS` (90 minutes).
- The order becomes `voided`, which the once-per-user read does not count.
- A normal refund leaves the order `refunded`, which still counts as used.

**Tests:** new in `couponServer.test.ts`: "٣٠٦: a void inside the 90-minute window gives the coupon back; a normal refund keeps it used".
- A void deletes the order's `coupon_usage` row.
- A refund deletes nothing.
- No earlier test covered this. The once-per-user read counting only `paid` / `refunded` orders is pinned in `checkoutCore.test.ts` ("coupon: once per user…").
- Which method applies (void inside 90 minutes, refund after) is decided by the `claim_payment_refund` RPC (`refundCore.ts`). That is not re-tested here.

**Check live:** a test order with NZAMY50:
- voided within 90 minutes: the code can be used again;
- refunded after the window: it cannot.

---

## 2. Per backlog id

### LIVE-F11: the published prices differ from the last report (39 instead of 29; deferred family cover still shown)

**Change:**
- ind-ai is now 29 (٣٠١).
- The family lines (dependants 319 / 279 / 239 and the shared cap) are withdrawn from every surface at launch (conflict ١٠ of `REF0037`):
  - In `pricing.individuals.ts`, `SHOW_FAMILY_DEPENDENTS = false`. The lines are kept in `FAMILY_LINES` behind that flag, and the comparison's members cell follows the flag.
  - In `plans.ts` and `checkoutView.ts` (`LITIGATION_COVERAGE_AR = «تغطية المشترك الرئيسي»`), the family lines are removed.
- «غير محدود» is replaced by «مساعد ذاتي» on all three individual plans and in the comparison.
- «٣ عقود شخصية سنوياً» is not promised anywhere (conflict ٧).

**Tests:**
- `pricingApprovals.test.ts`: the flag is false; the lines are kept but not written into the card; the canonical plan carries no family line.
- `checkoutView.test.ts` (the coverage sentence).

**Check live:**
- `/pricing` → الأفراد and `/services/individuals`: no «التغطية العائلية», no «٣١٩», no «غير محدود».
- The checkout of ind-litigation says «تغطية المشترك الرئيسي».

**Follow-up:** if the owner turns the family option back on, `plans.ts` needs its lines back too. Only `/pricing` reads the flag.

### UX14: show the total with VAT, the cycle and the deliverable near the button; send a signed-in account to manage its plan

**Change:**
- Every book card shows, above its button, «الإجمالي شامل الضريبة X ر.س · <الدورة>» (`cardTotalWithVat`).
  - It uses the same arithmetic as `catalog.quote`, including a running launch price.
- For a signed-in member, a sign-up button («سجّل مجاناً» on the free tiers) becomes «إدارة باقتي» → `/settings?tab=subscription` (`cardCta.ts`).
  - Subscribe and top-up buttons are left alone: the subscribe handler already sends a member to checkout or to the request flow.

**Tests:**
- `cardPrice.test.ts`: totals, and every book card's total equals `quote`'s total with and without the launch price;
- `cardCta.test.ts` (new).

**Check live:**
- On `/pricing`, a lawyer-pro card says «الإجمالي شامل الضريبة ٤٬٥٨٨٫٥٠ ر.س · سنوي».
- Signed in, the free micro card's button reads «إدارة باقتي» and opens the subscription tab.

**Not done:**
- «المخرج» (what the buyer gets) beside the button. The card's feature list is that today; there is no separate deliverable line.
- «اختيار خدمة مناسبة» for a member, beyond the existing request flow.

### CODE-F28: top-ups and tiers; the open part is market tiers, a server quote and return to the draft

**Change (price part only):** the top-up tiers, prices, points and validities are the document's, per audience (٣٠٢), and the server quote charges them.

**Not done:**
- the market tiers;
- the quote-then-return-to-draft flow (the AI tool page sending the buyer back to the draft after a top-up).

That flow belongs with the points-debit work of the AI waves (`src/lib/ai/*`), which this batch does not touch.

**Check live:** the top-up checkout for each of the seven packs (test mode); the points lot and its expiry.

### The المحاكي الشامل price conflict (250 in `tools.ts` against «١٥–٢٠» on /pricing)

**What the document settles:** the final document (`REF0049` lines 36 and 239–246) sets the judicial simulator (`wargaming`), the position-strength analyser and the direction supporter at **75 points** each («تخفيض … إلى 75 نقطة»).

**So the current values are wrong on both sides:**
- `src/lib/ai/tools.ts:421` `WAVE4_PRICE = 250`, which `wargaming` and `analyze-strength` use;
- `src/constants/lawyerAiCatalog.ts:332` `"ai:wargaming": "١٥–٢٠"`;
- `src/constants/pricing/pricing.lawyers.ts:193` (`المحاكي القضائي … pointsLabel: "١٥–٢٠"`).

**Not changed here:** `tools.ts` belongs to the AI session (parent session's AI waves). The price list moves with the P4 per-tool point prices, which re-price the whole ladder (drafting 200 / 500 / 1,000 / 1,500, contracts 500 / 1,000, …). Changing one row would leave the table half old and half new.

**Recommendation:** P4 as its own batch. It sets `WAVE4_PRICE` to 75 for those three tools and rewrites `lawyerServicesTable` and `TOOL_POINT_LABELS` together from the document.

---

## 3. SQL (the user runs it; nothing gates the deploy)

**File:** `supabase/migrations/20261030_16_pricing_owner_package.sql`. The copy to run is `SQL_batch_2026-10-30_pricing/10_ANY_TIME_20261030_16_pricing_owner_package.sql`.

**Steps:** in `SQL_batch_2026-10-30_pricing/README.md`, with full paths and the SELECT result to expect.

**What it does:**
- Writes the book's listed prices into `subscription_plans` (7 rows, four cycles). The admin MRR reads them; checkout never does.
- Stamps NEWCLIENT `first_paid_order_only`.
- It has a raising verify and ends with two SELECTs.
- Run it at any time.
- **Not run anywhere but Docker yet.**

**`_verify.sql`:** a new section, `verify:pricing_owner_package`.

**Docker test:** `supabase/tests/rls/pricing_owner_package.test.sql`, run with `run.sh` on postgres:16. The chain and the command are in the file's header.
- The `_verify` section only NOTICEs "not applied yet" before the migration runs.
- The migration runs twice, and both runs verify OK.
- After that, `_verify` passes, and:
  - T1: the 7 plans hold the book's prices;
  - T2: NEWCLIENT is stamped and no other coupon is touched;
  - T3: re-running the statements touches no row (`xmin` is unchanged).
- **Negative control:** without `20261026_10`, the migration raises "…run 20261026_10_billing_cycles.sql first" (exit 3).

**Why there is no runtime probe for the quarterly / half-yearly cycles:**
- The P1 design (`docs/plans/2026-10-26-P1-price-book-design.md` §6) asked P2 to refuse those cycles in code until a probe showed the database accepts them.
- `20261026_10` widened both checks, and it ran on prod on 2026-10-26 with `_verify` OK.
- `20261030_16` refuses to run without its columns.
- So the probe would guard only a schema restored from before 26 Oct. In that case the order insert fails with 503, and nobody is charged.
- **Recorded as accepted risk, not built.**

---

## 4. Verification on this branch

**Tests:** `node --test "src/**/*.test.ts"` gives 4,192 tests: 4,184 pass and 8 fail. **None of the 8 is in a file this batch touches.**
- `src/lib/ai/runCore.test.ts` "the start call carries the price…" is a timing flake under the full run's load (`49999 !== 50000` ms). The file passes 20 / 20 alone.
- The other 7 were already failing at `235e1bef` (the library session reports the same 7):
- **CRLF source-regex checks:**
  - `trackingWiring.test.ts` (×2);
  - `libraryAccess.test.ts`;
  - `fulfillOrder.test.ts` "grantPurchase keys every grant";
  - `navigation.consultant.test.ts`;
  - `_shape.test.ts` "volume series".
- **Missing module:** `aiFiles.test.ts`, because `pdf-lib` is not in this checkout's `node_modules`.

**`npx tsc --noEmit`:** clean, apart from the same missing `pdf-lib`.

**`next build --webpack`:** passes (exit 0, 503 static pages). `/pricing` is static (○), so it carries no launch price, while `/api/v1/pricing/launch` and `/checkout` are dynamic (ƒ). The only error lines are the sitemap's caught Supabase lookups, which fail on the placeholder key.

It was built with placeholder Supabase env. Two declared dependencies are missing from the shared `node_modules` that this worktree uses: `pdf-lib` and `moyasar-payment-form`. Both were linked in from a sibling checkout for the build, then the links were removed. **Run `npm install` before the deploy if the server lacks them.**

**GitNexus:** inconclusive, not clean. `detect_changes` mapped 0 symbols across 33 changed files, and `impact("quote")` could not find the symbol. The index does not cover this worktree. Callers were checked by grep instead: the three `quote(` call sites are pinned by a test.

**Files other sessions may also touch (for the merge order):**
- `src/app/register/provider/data.ts` (two strings: `topup-100` → `topup-500`). The captcha session works in the register pages.
- The `lib-*` prices in `priceBook.ts`: no overlap. The library session's claim note (`library-owner-2026-10-30-CLAIM.md`) says it does not touch the pricing constants and claims migrations `20261030_60..69`, while this batch uses `20261030_16`. Its baseline (4,166 tests, 7 pre-existing failures, from `235e1bef`) matches the 7 failures above.

---

## 5. Open owner questions raised by this batch

1. **ind-preventive / ind-litigation prices.** The final document no longer prices «الوقائية» and gives «التأمين القانوني» as yearly only (with «عضوية الحماية القانونية» at 365 / founder 296). The site keeps 149 / 1,490 and 399 / 3,990 until the owner says which applies.
2. **«فترة العروض» top-up balances.** Is the 25 Oct – 25 Jan launch window the «فترة العروض» for the larger balances (700 / 1,500 / 5,000 / 12,500 / 30,000)? Today the standard balances are granted.
3. **Launch seats.** "Or until seats run out": how many seats does each launch price have (ind-ai 199, firm-basic 8,415, firm-enterprise 12,665)? Today only the date ends them.
4. **Who gets the firms' launch price.** «المكاتب المؤسسة»: every firm inside the window (as built), or only the founder cohort?
5. **The lawyer-pro card's tool lines** («صياغة المذكرات واللوائح: ١٥ نقطة»). They are from the old ladder; P4 re-prices them. Remove them now, or wait for P4?

---


## 6. Owner note

The Arabic owner note is in its own file: `docs/audits/2026-10-30-owner-note-pricing.ar.md`. The shared owner reports (تقرير_للمالك) were not edited; the parent session merges each area's note into one report at integration.

---

## 7. Price fact for integration: محترف العقود (`/ai/contracts`, AI tool `contracts-pro`)

The final pricing document (`07-references/REF0049.md`, «الفئة الثانية: العقود والعناية الواجبة (`محترف العقود`)») settles it:

| Item | Document id | Points |
|---|---|---|
| Professional / detailed or bilingual contract | `contracts` (item 8) | **1,000** |
| Simple standard monolingual contract, up to 8 pages | `contract-drafter` (item 7) | **500** |
| Contract review and risk matrix, up to 15 pages | `contract-reviewer` (item 9) | 250 (+10 per page above 15, cap 100 pages); kept in the system, not shown or sold until its real AI analysis is wired (٢٩٦) |

The same two prices appear in the document's AI ladder summary (line 36: «العقد المبسّط = 500 نقطة، والعقد الاحترافي = 1,000 نقطة»).

- **So the 1,000 points charged by the L13 build (branch `feat/ai-l13-contracts`) match the document** for the professional contract. The «10 نقاط» on `/pricing` and in the lawyer services table are from the old ladder and are wrong.
- **Not edited here:** that branch, `src/lib/ai/tools.ts` and the price lines belong to the AI work; the parent session aligns them at integration.
- **One check for integration:** if `contracts-pro` also offers a simple contract, that tier is 500 points, not 1,000.
