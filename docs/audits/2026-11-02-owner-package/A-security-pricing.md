# Slice A: §1 security, PDPL and keys; §6 admin, plans, coupons and commission; every price and points number in §3 and §8

**Code checked:** `D:\nzwt\founder` (main 80ea10ad, read only). All file:line references below point into it.
**Owner side:**
- master guide `00_الدليل_الشامل_المنقح_للمبرمج_٢٠٢٦-١١-٠١.md`, lines 63–73, 135–185, 241–255 and 277–302;
- pricing doc `04_…/وثيقة_التسعير_الكنوني_الشامل_المعتمدة_منصة_نظامي_2026-10-25.md` (cited as "pricing doc L<n>");
- patches `05_…/src_patches/app/{privacy,terms}/page.tsx`.

Status values used below: DONE / PARTIAL / MISSING / CONFLICT / NOT-CODE.

---

## 1. Item table

### §1 P0: security, PDPL and production environment

| id | Owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| §1.1 | Make GitHub `drjimmy1990/latest-nzamy-full` private; anonymous visitors get 404 | NOT-CODE | A repo setting. Earlier review found a leaked UAT admin password in the public repo (memory: post-profiles review 2026-09-21). Making the repo private does not un-leak anything: every key or password ever committed must be **rotated** as well. | S | keys (rotate) |
| §1.2a | Remove the AI-training clause from `privacy/page.tsx` | MISSING (patch ready, safe) | The live page still says it: `src/app/privacy/page.tsx:34` (AR) and `:129` (EN), «تدريب نماذج الذكاء الاصطناعي على بيانات مُجهَّلة». The patch changes **only these two lines**; the rest of the file is byte-identical. The `**` markup renders as bold through `markdownBoldToSafeHtml` (`privacy/page.tsx:9`). | S | none |
| §1.2b | Privacy page: data controller/processor roles, DPA, zero-data-retention disclosure | MISSING (the patch does not contain them) | The privacy patch adds no controller/processor, DPA or ZDR text. The roles appear only in the **terms** patch (§9). | S (text) | owner decision + legal review |
| §1.2c | Replace `terms/page.tsx` with the patch (7–15% commission, DPA, explicit consent, no implied acceptance) | CONFLICT (partly unbackable) | **Live:** commission 5–15% (`terms/page.tsx:81`); implied acceptance (`:129`); claims an e-arbitration system exists (`:120`). **Patch:** commission 7–15% (patch L80); new §9 DPA (patch L106–112); explicit consent for material data changes (patch L136). See §2 and §3 for the clauses the code cannot back. | S to apply; M to make every clause true | owner decision (commission) + legal review; SQL if consent capture is built |
| §1.2d | ZDR disclosure "to open the AI tools gate" | CONFLICT | The platform itself keeps inputs and outputs: the `ai_runs.input` and `ai_runs.output` jsonb columns (`supabase/migrations/20261027_10_ai_runs.sql`, lines ~42 and ~46). Retention is the plan's 90 days (`docs/plans/2026-10-26-ai-services-n8n-plan.md:687`, D6). ZDR wording can only describe the **model provider** (Anthropic; plan D10 at `:691`), and only once ZDR is confirmed on the account. Any wording must also pass `src/lib/dataProtectionClaims.test.ts`. | S (text) | keys/ops (Anthropic ZDR) + owner decision |
| §1.2e | Turn off n8n "Save successful production executions" | NOT-CODE | n8n instance setting (n8n.asra3.com). Until it is off, n8n keeps a copy of every AI input, which contradicts any "zero retention" text. | S | ops |
| §1.3 | Live Turnstile keys on login, registration, password reset and the library challenges | PARTIAL / NOT-CODE | **Login and registration: code DONE.** `src/app/login/page.tsx:192,219,720`; `register/client` and `register/provider` use `TurnstileWidget`; real protection is in GoTrue (`src/lib/auth/captcha.ts:1-30`; operator guide `docs/security/captcha-turnstile-operator-guide.md`). **Ops still needed:** `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is read at **build time** (`src/components/auth/useTurnstile.ts:22`), so setting it means a rebuild; GoTrue `GOTRUE_SECURITY_CAPTCHA_*` must be set on auth.nezamy.sa. **Password reset:** no real flow to protect (see §1.5). **Library challenges (B1–B18, q366):** nothing; no captcha or turnstile reference anywhere under `src/app/laws`, `src/app/api/v1/library` or `src/lib/library` (library slice). | S code (reset) + ops | keys |
| §1.4 | Moyasar live keys (`sk_live_`); wallet payouts stay a manual admin request (q359) | NOT-CODE + note | Live mode needs `sk_live_`/`pk_live_` **and** a complete `billing_company` (`src/lib/payments/moyasarConfig.ts:6-7`). While the mode is test, only staff and `test_accounts` can pay (`src/lib/payments/testModeAccess.ts:44`). There is **no payout or withdrawal route at all**: `src/app/api/v1/wallet/route.ts` only; the marketplace is parked. So "settlement by admin request" is not built, but nothing is owed yet. **Going live before batches 1, 3 and 6 starts selling prices the owner has just cancelled (see Risks).** | S | keys + owner decision (timing) |
| §1.5 | Real "forgot password": Supabase `resetPasswordForEmail`, a set-new-password page, Turnstile | MISSING, and **the current page is fake** | `src/app/forgot-password/page.tsx:505-532`: the steps only call `setStep(...)`. The page has no Supabase import and no fetch. It shows an OTP box and then «تم بنجاح» **without changing anything**. It is linked from `src/app/login/page.tsx:668`. `resetPasswordForEmail` is called nowhere in `src`. `auth/callback/route.ts` handles OAuth `code` only and would send a recovery link to a dashboard, not to a set-password page. A working pattern to reuse: `supabase.auth.updateUser({ password })` (`src/app/settings/components/tabs/SecurityTab.tsx:159`). Once GoTrue captcha is on, `/recover` refuses a request without `captchaToken` (`captcha.ts:12-15`), so the new page must send one. | M | ops (SMTP on self-hosted GoTrue, redirect allow-list for `/reset-password`, captcha secret) |
| §1.6 | Remove developer words ("Mock", "Backend-ready") from the pricing panel and internal dashboards (items ٣٦/٣٧) | PARTIAL, and an **honesty trap** | 24 files still show the words, e.g.: `dashboard/admin/pricing/page.tsx:150,241` ("local only until Pricing API"); `dashboard/admin/platform/page.tsx:45-46,109`; `dashboard/firm/{archive,branches,departments,…}`; `dashboard/ngo/{programs,board,awqaf}`; `components/dashboard/sector/*Readiness*`. **Most of these labels are true**: they tell the viewer the screen is local-only. Deleting a label without wiring the screen makes a fake screen look real. **One label is simply wrong:** `dashboard/admin/subscriptions/coupons/page.tsx:369` says "Backend-ready" but the page is wired to the real API (`/api/v1/admin/coupons` GET/POST, `[id]` PATCH/DELETE). | S (coupons badge + rewording); L to wire the rest (other slices) | owner decision (hide vs wire) |

### §6: admin, plans, coupons, commission

| id | Owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| §6.1.1 NOTE-22 | Admin's menus no longer bleed into other shells; default to the lawyer shell; the chosen view persists in `sessionStorage` | DONE | `src/app/ai/layout.tsx:46-77` delegates to `resolveAiShell`. `src/lib/nav/shellContext.ts:34-42` keeps the per-tab key `nzamy_admin_view_as`; `:102-110` is the admin decision. Built in the 30-Oct package (LIVE-F01 / NOTE-22-C01). | — | none |
| §6.1.2 | One-click switcher across **all** roles and sub-roles (lawyer, consultant (Art. 18 licence), managing partner, firm member, individual, company, micro, government ×4, NGO, provider), with a "simulate real restrictions" vs "admin override" toggle | PARTIAL | `src/components/dashboard/AdminViewSwitch.tsx:23-26` offers **two** views only (lawyer, admin), and `AdminView = "admin" \| "lawyer"` (`shellContext.ts:39`). The other dashboards' layouts and UserTypeGuards would have to admit admin. Simulating restrictions must stay UI-only: every API reads the real role. | L | none (owner decision on scope) |
| §6.1.2b | Admin never sees the credit-exhausted banner | DONE (server) | Admins are exempt from points: `runCore.ts:410` (`p_exempt: isAdmin`) and `:398`. No global low-balance banner exists to suppress; the only signal is the per-run 402 at `runCore.ts:427`. | — | none |
| §6.2.1a | Individuals: yearly plans only; drop 1,490 / 3,990, the 29 monthly price and the 99 review | CONFLICT / MISSING | Still sold today (`src/lib/pricing/priceBook.ts`): **ind-ai** 29/79/149/249 + launch 199 (`:309-316`); **ind-preventive** 149 a month / 1,490 a year (`:318`); **ind-litigation** 399 a month / 3,990 a year (`:319`). Cards and the comparison table: `src/constants/pricing/pricing.individuals.ts:86-173` and `:375,383-384` (they call `bookPriceText(...,"monthly")`, which throws at module scope once a cycle is retired; `bookCallSites.test.ts` guards those calls). | M | owner decision (VAT, see Conflicts) |
| §6.2.1b | `ind-smart` = **249 SAR a year including VAT**, no separate 199 launch price | CONFLICT | The code sells 249 **before VAT** (286.35 with VAT) plus a 199 launch price (owner ٣٠١, `priceBook.ts:309-316`). The pricing doc says 249 before VAT, monthly allowed (L402, L406). Answer ٢٥٨ makes every price VAT-exclusive (`priceBook.ts:5-7`). | S once decided | owner decision |
| §6.2.1c | `ind-litigation`: 365 a year; founder offer for the first **496** clients at 296 before VAT (340.40 with VAT); 12 consultations, one simple contract review, one case capped at 10,000 SAR in fees | MISSING | Code: 399 / 3,990 (`priceBook.ts:319`). There is **no client founder plan or seat counter**: the book comment says «There is no client or business founder plan» (`priceBook.ts` header, ~L283). The lawyer founder pattern to copy: `lawyer-founder-2026` + `founder_reserve_seat` (migration 20261101_10). | M–L | SQL migration (seats), owner decision (VAT of the 365 price; are lawyers there to fulfil it?) |
| §6.2.1d | Licensed-lawyer contract review from 600 (individuals) / 800 (business); remove the "fake 99" | PARTIAL / CONFLICT | The B2C truth is the `admin_pricing_catalog` table (`priceBook.ts:15-17`). Its seed has `contract-review` at **800** for `individual` and `contract-draft` at **99** («أو ابتداء من 99 ر.س للطلب») in `supabase/migrations/20260518_client_workflow_backend_ready.sql:268-273`. The constants mirror it: `src/constants/clientServiceCatalog.ts:241-243` (99) and `:298-300` (800, «2x سعر مراجعة المحامي»). Other visible 99s: `src/components/consultation/constants.ts:56,77` (AI consult on /book/consultation) and `src/constants/servicesData.ts:14`. | S | SQL (UPDATE `admin_pricing_catalog`, or an admin edit) + constants |
| §6.2.2a | Offer period 25 Oct 2026 – 25 Jan 2027; every firm subscribing yearly in it gets the launch price | DONE | `priceBook.ts:118-120` (`launch-2026` 2026-10-25 → 2027-01-25). firm-basic yearly 8,415 and firm-enterprise 12,665 (`:292-306`), on the server clock. | — | none |
| §6.2.2b | Top-up offer-period balances (500→700, 1,000→1,500, 2,500→5,000, 5,000→12,500, 10,000→30,000; pricing doc L113-148) | MISSING | The code grants the everyday balance only. `priceBook.ts:275-277` says the larger offer balance «is not dated by the owner, so it is not granted». §6.2.2 now dates the offer period, **but** it names «حزم الشحن والتدشين» without saying the bonus balances apply. | S–M (campaign-aware `points` in fulfilment) | owner decision (confirm the bonus applies) |
| §6.2.2c | Cap of **9 seats** for the founding-companies offer | MISSING | Company plans (`biz-*`, `dept-*`) are not in the price book or sold online; no seat cap exists. | M (after company plans are sold) | SQL + owner decision |
| §6.2.3 | Coupons managed 100% from admin; no hard-coded LAUNCH2026/NEWCLIENT rules; tab bound to `coupons` + `coupon_redemptions` | PARTIAL | **Admin screen exists and is wired:** `src/app/dashboard/admin/subscriptions/coupons/page.tsx` (644 lines; POST and PATCH at `:237-286`) and `src/app/api/v1/admin/coupons/route.ts:36,78`, `[id]/route.ts:33,153`. **LAUNCH2026:** comments plus an old seed only; switched off by `20261026_20_coupons_server_only.sql:302-345`. **Still hard-coded:** `src/lib/payments/couponRules.ts:81`, `code === "NEWCLIENT"` means first paid order only. `metadata.first_paid_order_only` already exists, but the admin UI does not expose it (no hit in the page). The usage table is `coupon_usage`, not `coupon_redemptions` (`20260603_phase1_003…sql:116`). | S | SQL (stamp the metadata on NEWCLIENT) |
| §6.2.4 / q334 | Marketplace commission: 15% free tier / 10% sub-plans / **7% floor**; abolish 5% | CONFLICT (display only, no engine) | **No commission engine exists.** `src/constants/platformOwnerCatalog.ts:117-118` notes commission and escrow are unbuilt; the marketplace is parked (BETA_MONOPOLY_MODE). **Display text today:** the providers tab on /pricing shows **20% / 10% / 5%** (`src/constants/pricing/pricing.providers.ts:15,19,28,41,47,59,129,145`; tab at `pricing.common.ts:28`); terms say 5–15% (`terms/page.tsx:81`). **Package contradicts itself:** see Conflicts. | S (text) | owner decision |

### Points and prices: master guide §3 (L135–185) and §8 (L277–302) against the live code

Server prices are in `src/lib/ai/tools.ts` (AI_TOOLS, L1128-1392) and `src/lib/ai/draftKinds.ts`. Display prices are in `src/constants/pricing/pricing.lawyers.ts:162-217` (/pricing list) and `src/constants/lawyerAiCatalog.ts:328-334` (`TOOL_POINT_LABELS`, the hub badges). `src/lib/services/pricingApprovals.test.ts:53-84` pins the display table, so it changes in the same commit.

| id | Item | Owner (guide; pricing doc) | Server charges today | Shown today | Status | Effort | Needs |
|---|---|---|---|---|---|---|---|
| q324/333 | Drafter: claim (صحيفة دعوى ابتدائية) | 200 | **500** (`draftKinds.ts:16`) | **15** (`pricing.lawyers.ts:169`, `lawyerAiCatalog.ts:329`) | CONFLICT | S | none |
| q324 | Drafter: reply, rejoinder, supplementary, closing | 500 | 500 (`draftKinds.ts:17-20`) | 15 | DONE server / display wrong | S | none |
| q324 | Drafter: appeal | 1,000 | 1,000 (`:21`) | 15 | DONE server / display wrong | S | none |
| q324 | Drafter: cassation / petition | 1,500 | 1,500 (`:22-23`) | 15 | DONE server / display wrong | S | none |
| q323/326 | Simple contract (`contract-drafter`), same price for everyone, plan discount for subscribers | 500 | 500 (`tools.ts:577`); roles include individual/corporate/micro (`:1310-1316`) | not in the /pricing list | DONE (the "plan discount" is MISSING: no such mechanism) | S | owner decision (what discount) |
| q323 | Pro / bilingual contract (`contracts-pro`) | 1,000 | 1,000 (`tools.ts:794`) | **10** (`pricing.lawyers.ts:170`, `lawyerAiCatalog.ts:330`) | display CONFLICT | S | none |
| §3.2 | Contract review up to 15 pages / negotiator | 250 / 150 | no tool | — | MISSING (the tool is another slice) | S (constant) | — |
| q322 | Unified wargaming (incl. analyze-strength) | **150**, or 75 for the single analysis; doc item 18/19: 75 each | **250** both (`tools.ts:440`, used at `:1285,1300`) | **15–20** (`pricing.lawyers.ts:193`, `lawyerAiCatalog.ts:332`) | CONFLICT | S | owner decision (150 vs 75) |
| §3.3a | Direction support | 75 | no tool (`comingSoon`, `lawyerAiCatalog.ts:200`) | — | MISSING (other slice) | S | — |
| q283 | Attachment digest, L1 (1–5 pages) / L2 (6–30 pages), +5 per page above 30 | 30 / 150 / +5 per page | 30 / 150 (`tools.ts:324-325,1253`); max 30 pages (`:326`), so there is no >30-page tier | not listed (comingSoon note) | DONE except the +5 per page above 30 | S–M | none |
| §3.3a | Compare | 50 | no tool | — | MISSING (other slice) | S | — |
| §3.3a | Global research | 100 | no tool | — | MISSING (other slice) | S | — |
| q325 | Legal opinion: written consult | **100** | **400** (`tools.ts:638`, `legal-opinion-consult` `:1331`) | **15–20** (`pricing.lawyers.ts:195`, `lawyerAiCatalog.ts:333`) | CONFLICT | S | none |
| q325 | Legal opinion: letter / notice | **50** | **400** (`legal-opinion-letter` `:1346`) | 15–20 | CONFLICT | S | none |
| q325 | Opinion: medium 350 / full study 750 / due diligence 2,000 / cross-exam 60 | 350 / 750 / 2,000 / 60 | no tools (the plan had 800 / 3,000 / 150, `ai-services-n8n-plan.md:651`) | due diligence «١٥–٢٠» (`pricing.lawyers.ts:194`); cross-exam «٥–٨» (`:184`) | MISSING tools; **display wrong** | S | — |
| §3.3b | Transcriber | 10 per 15 minutes | no tool (comingSoon) | — | MISSING (other slice) | S | — |
| §3.3b | Legal translator | 50 up to 2,000 words, +10 per 1,000 | no tool | — | MISSING (other slice) | S | — |
| §3.3b | Secretary | 5 | no tool (comingSoon) | — | MISSING (other slice) | S | — |
| §3.3b | Mail advisor / quick client message | 15 / 5 | `communicate` = 5 (`tools.ts:1163`) | — | quick message DONE; mail advisor MISSING | S | — |
| §3.3b | Legislation monitor: browse / impact analysis | 0 / 15 | no AI tool | — | MISSING (other slice) | S | — |
| q328 | Vault: storage 0 / AI identity 20 | 0 / 20 | no AI identity tool (`src/lib/branding/letterheadIdentity.ts` has no points) | — | MISSING | S | — |
| §3.3b | Quick answer | **15**, plus **one free per day for individuals** | **20** (`tools.ts:1192`); roles `lawyer`/`firm` only (`:1190`) | not listed | CONFLICT + MISSING (individual role, free daily quota) | S price; M quota | none |
| §3.3b | Interactive session | **40 for up to 15 messages** | **100 for 5 messages** (`tools.ts:260-261`, D3) | assistant page `src/app/ai/assistant/page.tsx:449` | CONFLICT | S | none |
| §3.3b | Smart template customisation | 50 | no tool | «الصياغة من نموذج ٥–٨» (`pricing.lawyers.ts:171`) | MISSING; display wrong | S | — |
| §3.3b | Najiz optimizer: rules 0 / smart condensing 5–15 (doc item 28: 15) | 0 / 5–15 | **5** flat (`tools.ts:1179`, owner ٢١٦) | «٥–٨» (`pricing.lawyers.ts:185`, `lawyerAiCatalog.ts:331`) | PARTIAL (no free rules tier; the AI price sits inside the range) | S | owner decision (exact number) |
| §3.3b | Calculators, guide, collector | 0 | 0 (no tools) | "free" (`pricing.lawyers.ts:212-215`) | DONE | — | — |
| q374/379 | Library assistant | 5 | 5 (`tools.ts:1207`) | «١–٢» (`pricing.lawyers.ts:204`) | display CONFLICT | S | none |
| — | Brief-check (`/ai/brief-check`) | 200 | 200 (`tools.ts:392`) | **5** (`pricing.lawyers.ts:183`) | display CONFLICT | S | none |
| — | Canvas AI card (doc item 29) | 10 | 10 (`tools.ts:1238`) | not listed | DONE | — | — |
| q335 | Drafter and auto-consult open to every registered subscriber, paid in points, no Pro required | — | Gate is role plus points; there is no Pro tier check in `runCore.startRunWith` (`runCore.ts:272-284`). Drafter roles `lawyer`/`firm` (`tools.ts:1371`) | — | DONE for lawyers; individuals have no drafter role (by design) | — | none |
| q329 etc. | Plan prices | see §6.2 rows | | | | | |

---

## 2. Conflicts

1. **Wargaming points.**
   - Guide §3.3(a) L148: «`150 نقطة` للمحاكي الموحد (أو `75 نقطة` للتحليل المنفرد)».
   - Guide §8 q322 L285: the same.
   - Pricing doc item 18 (wargaming) and item 19 (analyze-strength): **75 each**.
   - Code: `WAVE4_PRICE = 250` (`tools.ts:440`), from the 26-Oct plan (`ai-services-n8n-plan.md:571-572`).
   - Display: «١٥–٢٠» (`pricing.lawyers.ts:193`).
2. **ind-smart price, cycle and VAT.**
   - Guide §6.2.1 L247: «سنوي فقط … `249 ر.س / سنة شاملة الضريبة` … بدون باقة تدشين ١٩٩».
   - Pricing doc L402/L406: «متاحة بالشهر أو ربع/نصف/سنوي … `249 ر.س / سنة` غير شامل الضريبة (`286.35` شامل)».
   - Owner ٢٥٨ (`priceBook.ts:5-7`): every price is VAT-exclusive.
   - Code: 29 / 79 / 149 / 249 before VAT, launch 199 (owner ٣٠١, `priceBook.ts:309-316`).
3. **Marketplace commission.**
   - Guide §6.2.4 L254 and §8 q334 L292: «`7%` الحد الأدنى … إلغاء `5%` نهائياً», with founders on 7%.
   - Terms patch L80: 7–15%.
   - Pricing doc L83: «ولحاملي شارة المؤسس تستمر `5%`».
   - Pricing doc L317: firm launch «عمولة سوق `5%` للسنة الأولى».
   - Pricing doc L321: firm-enterprise «أقل رسوم سوق طلبات `5%`».
   - Pricing doc L838-843: provider-elite 5%.
   - Founder kit r7 brochure promised a 5% fee (`docs/audits/2026-11-01-founder-kit-r7-gap-analysis.md:54`); it was deferred and left off the card (`docs/audits/2026-11-01-owner-note-founder-membership.ar.md:57`, question ٤٠٣).
   - Live /pricing providers tab: 20 / 10 / 5 (`pricing.providers.ts:129`).
   - Live terms: 5–15% (`terms/page.tsx:81`).
   - **Founders who bought on the 5% brochure would get 7%.**
4. **Drafter claim price.**
   - Guide L139 and q324 L287: claim = 200.
   - Code: claim = 500 (`draftKinds.ts:16`; comment `:5-7` cites plan §5).
   - The founder credits are 6 drafter works of any kind (`founderPlan.ts:46`), so this does not affect them.
5. **Legal opinion.**
   - Guide q325: 100 quick / 350 medium / 750 full / 50 letter.
   - Code: consult = letter = 400 (`tools.ts:631-638`, D4: "400 medium / 800 full").
6. **Assistant.**
   - Guide L169: «جلسة تفاعلية (حتى ١٥ رسالة): `40 نقطة`».
   - Code: 100 per conversation of 5 messages (`tools.ts:260-261`, D3).
7. **Quick answer.**
   - Guide L169: 15 points, one free per day for individuals.
   - Code: 20 points, lawyers and firms only (`tools.ts:1185-1192`).
8. **Small top-ups.**
   - Pricing doc L22: «تُلغى شحنتا `100` و`250 ر.س`» for lawyers and professionals.
   - Code keeps them for **individuals only** (owner ٣٠٢, `priceBook.ts:323-324`).
   - Consistent if the doc means professionals only; worth a one-line confirmation.
9. **Displayed versus charged points.**
   - The /pricing list and hub badges show draft 15, contracts 10, wargaming / opinion / due diligence 15–20, brief-check 5, library 1–2.
   - The server charges 500–1,500 / 1,000 / 250 / 400 / 200 / 5.
   - The guide itself orders «شطب «١٥ نقطة» القديمة» (L139, L142).
   - Points enforcement is off for now: the disclaimer at `PricingCards.tsx:433-435` says deduction starts with e-payment. The gap becomes real money the day charging turns on.
10. **Terms patch: VAT sentence.** Patch L78 says plan **and points** prices are «شاملة لضريبة القيمة المضافة» before confirmation. That is true at checkout. But cards show VAT-exclusive prices (٢٥٨), so a reader may take the cards as VAT-inclusive. Suggest «يُعرض المبلغ الإجمالي شاملاً الضريبة قبل الدفع».
11. **Terms patch: express consent versus the consent model.** The patch banner (L307) says using the site is «الموافقة الصريحة». Using a site is not express consent. Checkout deliberately has «one consent line … no checkbox» (`src/app/checkout/page.test.ts:69`). Express consent for material data changes (patch L136) has no capture mechanism.
12. **Terms patch: provider types.** The patch drops «المعقب» from the provider definition (patch L28) and «تعقيب المعاملات» from services (patch L38). The pricing doc still sells tracking (L466 `tracking-bundle-3`) and lists معقب as a provider type (L825).

## 3. Risks

- **Money and consumer protection.** /pricing and the AI hub advertise 15 / 10 / 15–20 points while the server will charge 500 / 1,000 / 250 / 400. Today points enforcement is off and Moyasar is in test mode. Turning on Moyasar live (§1.4) or points charging before batch 1 sells at prices the page contradicts.
- **Going live sells cancelled plans.** With live keys today, checkout would sell ind-preventive (1,490), ind-litigation (3,990), monthly ind-ai (29) and the 199 launch price, all of which the owner has just cancelled. Retire them in the price book (never delete: `priceBook.ts:19-22`; existing orders and renewals resolve by id). Repricing `ind-litigation` in place changes existing holders' renewal price (`renewalPrice`, `priceBook.ts:~405`).
- **Fake security flow.** `/forgot-password` tells a user their password was reset when nothing happened (`forgot-password/page.tsx:505-532`). Locked-out users believe they have recovered. This breaks the honesty gate; replace it or hide the link (`login/page.tsx:668`) until the real flow ships.
- **Legal: terms patch clauses the code cannot back.**
  - (a) «تمكين المشترك في أي وقت من محو أرشيفه السحابي المستورد فوراً» (patch §9 L110, §10 L117): account deletion is a **60-day freeze then purge** (`src/lib/auth/accountFreeze.ts:3,53`), and no imported-archive eraser exists.
  - (b) §9 describes the Chrome extension «نظامي | مساعد المزامنة والأرشفة المكتبية». It exists only on owner-edits and in the uncommitted `api/v1/najiz/sync`; it is not on main or production. Publishing §9 now describes a product that is not live. Its claim that the servers contact no external portal does hold for the WIP route (no outbound fetch in `api/v1/najiz/sync/route.ts`).
  - (c) «عدم الاطلاع عليها إلا بإذن موثق من المشترك»: there is no consent-for-support mechanism; staff consoles read user data through staff roles.
  - (d) The ZATCA Phase 2 e-invoicing claim (live `terms/page.tsx:84,204`; kept by the patch L83/L213) is unverified: the receipts route says the ZATCA QR package is not installed (`src/app/api/v1/admin/receipts/route.ts:27`). Add terms to `dataProtectionClaims.test.ts` CLAIM_SURFACES.
  - (e) «معالج بيانات … بالعمولة» and the PDPL Art. 8 / Reg. Art. 17 citations need a lawyer's check. Nezamy is the **controller** for its own account, payment and marketplace data (the privacy page says «نجمع»). Scope the processor role to the subscriber's imported case files only.
  - (f) The privacy patch bans training on «نماذج ذكاء اصطناعي عامة أو خارجية» only. That leaves "internal" models open; say «أي نماذج».
- **ZDR overclaim.** The platform keeps AI inputs and outputs in `ai_runs` (90 days by plan D6), and n8n keeps executions unless switched off. A blanket «Zero-Data-Retention» line would be false.
- **Selling a lawyer-backed individual membership** (12 consultations plus a case) while the public lawyer directory has 0 lawyers (memory: owner-free batch 2026-10-17) re-creates a promise nobody can fulfil. The «التأمين القانوني» label also deserves a regulatory check (insurance wording).
- **§1.6 label stripping** re-introduces fake data. «Backend-ready: local only» on firm, NGO and admin screens is the honest disclosure the gate asked for. Remove it only together with real wiring, or hide those screens.
- **Repo was public:** rotate every secret ever committed, not only flip visibility.

## 4. Suggested batches (dependency order)

1. **Display and text truth (S, no SQL).**
   - Rewrite the /pricing points list and `TOOL_POINT_LABELS` to the server prices, removing 15 / 10 / 15–20 / 5 / 1–2. Change `pricingApprovals.test.ts` in the same commit.
   - Apply the **privacy** patch (2 lines) and change «عامة أو خارجية» to «أي».
   - Remove the wrong "Backend-ready" badge on the coupons page.
   - Change the providers tab and terms commission text only after decision 2.
2. **Owner decisions (block 3, 5 and 6):**
   - wargaming 150 vs 75;
   - ind-smart: VAT-inclusive 249 and yearly-only vs the pricing doc;
   - commission floor 7% vs the 5% promised to founders, firms and elite providers;
   - VAT treatment of the 365 price;
   - whether the offer-period top-up bonus applies now;
   - najiz smart-condensing price;
   - the "subscriber discount" on the 500-point simple contract.
3. **Points repricing (S).** `draftKinds` claim 500→200; `LEGAL_OPINION_PRICE` split into consult 100 / letter 50; assistant 40 for 15 messages; quick-answer 15. Then the wargaming price decided in 2. Each change needs its tool test, the page price strings, and the founder-credit price text checked.
4. **Real forgot-password (M) plus ops.** `resetPasswordForEmail` with `captchaToken`; a `/reset-password` page using `updateUser({password})`; recovery handling in `auth/callback`. Ops: SMTP and redirect allow-list on auth.nezamy.sa, the GoTrue captcha secret, and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` followed by a **rebuild**.
5. **Terms (S text, after legal review).** Apply the patch minus the unbackable clauses: the immediate archive erase (say «وفق مهلة الحذف المعلنة»), §9 extension text until the extension ships, the support-access consent claim, ZATCA Phase 2, and the "use = express consent" banner. Keep 7–15% only if decision 2 says so.
6. **Individual plans (M–L, SQL).** Retire ind-preventive and the monthly, quarterly, semiannual and launch-199 cycles of ind-ai. Fix the module-scope `bookPriceText(...,"monthly")` calls (`pricing.individuals.ts:383`). Reprice or replace ind-litigation by retiring the old id and adding a new one. Add the client founder plan with a 496-seat SQL counter (copy `founder_reserve_seat`). `admin_pricing_catalog` UPDATE: contract-review 600 individual / 800 business, and remove the 99s (`contract-draft`, the AI consult in `consultation/constants.ts`, `servicesData.ts`).
7. **Top-up offer bonus (S–M).** A campaign-aware `points` per top-up between 2026-10-25 and 2027-01-25 (700 / 1,500 / 5,000 / 12,500 / 30,000), granted by the server clock. Stamp `first_paid_order_only` on NEWCLIENT by SQL and drop the `code === "NEWCLIENT"` branch (`couponRules.ts:81`). Expose the flag in the coupons UI.
8. **Multi-role admin switcher (L).** Extend `AdminView` and the guards; the "simulate restrictions" mode stays UI-only.
9. **Ops (NOT-CODE):**
   - GitHub private, plus rotation of every key ever committed;
   - Moyasar `sk_live_` and `billing_company`, **after** batches 1, 3 and 6;
   - Turnstile live keys;
   - n8n "Save successful production executions" off;
   - Anthropic ZDR confirmation before any ZDR wording.
