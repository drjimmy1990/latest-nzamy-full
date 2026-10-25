# Gap analysis: owner's canonical pricing doc (2026-10-25) vs code on main fa0228c7

**Source documents**

| What | Path |
|---|---|
| Pricing doc (1,311 lines; Lnnn = its line) | `C:\Users\LOQ\Downloads\حزمة_التسعير_والشعار_المعتمدة_للدكتور_محمد_2026-10-25\وثيقة_التسعير_الكنوني_الشامل_المعتمدة_منصة_نظامي_2026-10-25.md` |
| Cover letter | `…\رسالة_التكليف_النهائية_للدكتور_محمد_2026-10-25.md` |
| Open questions for the owner, with defaults | `أسئلة_للمالك_حزمة_التسعير_٢٥_أكتوبر.md` (repo root). Use its (أ) defaults. |

## 0. Problems that affect every section

1. **Billing is monthly or yearly only.** The doc needs quarterly (3 months) and half-yearly (6 months) for every professional or business audience. Individuals get monthly, quarterly, half-yearly and yearly. Where the code limits it:

   | Location | What it allows |
   |---|---|
   | `Billing` type: `catalog.ts:23`, `checkoutRules.ts:12`, `pricing.types.ts:4` | `"monthly" \| "yearly" \| "once"` |
   | `planWindow` (`fulfillDecision.ts:236-239`) | 1 or 12 months |
   | DB check `payment_orders_billing_check` (`20261022_10_payments_core.sql:98-99`) | monthly / yearly / once |
   | `subscription_plans` (`:274`) | `price_monthly` and `price_yearly` columns only |
   | `pricing.common.ts:40` | a monthly/yearly toggle |

2. **VAT.** All prices become VAT-exclusive (L24, answer ٢٥٨). Today the individuals' plans are VAT-inclusive (`catalog.ts:120-122`) and the library uses a "buyer" mode (`:87-98`). The notice text is in `vatNotice.ts:20-44`.
3. **Little can be paid online.** `PAYABLE_ITEMS` holds 14 items (`catalog.ts:115-130`). Micro, `biz-*`, `dept-*`, NGO, provider and `lib-firm-*` plans are missing, and `checkoutView.test.ts:51` asserts they return null.
4. **Prices live in 5 places:**
   - `catalog.ts`;
   - `src/lib/pricing/plans.ts`;
   - `src/constants/pricing/*`;
   - the `subscription_plans` seed (`20261022_10:274-281`);
   - the `admin_pricing_catalog` B2C seed (`20260518_client_workflow_backend_ready.sql:255-312`).

   `catalog.test.ts` checks they agree, so every price change must be synced.

## §2 Rules (L20-26)

| Rule | Code today | What's missing |
|---|---|---|
| Remove lawyer 399/month; professionals buy quarterly / half / yearly only | `lawyer-pro` 399/3,990: `catalog.ts:116`, `pricing.lawyers.ts:23-39`, seed `:278` | Remove it; server logic; DB migration |
| Founder badge only after payment | A trigger grants the badge and 90 days of library on every new lawyer row (`20261021_50_founder_campaign.sql:198-240`, trigger `:257`). The banner (`campaigns.ts:57-58`) still promises «سجّل الآن واحصل على ٣ أشهر من المكتبة القانونية مجاناً وشارة المؤسس» | Server logic, migration, wording |
| 1 point = 1 SAR. Top-ups give points only, valid 12 months | Points only, but valid 3/3/6/12 months (`catalog.ts:126-129`) | New validity |
| One server price book; no prices hard-coded in the UI | Several conflicting lists | Server logic |
| VAT-exclusive | See §0.2 | Server logic, wording |
| Government fees take no discount and no VAT | No discount engine | New |
| Discounts never stack | No discount engine | New |

## §4 Lawyer and Art. 18 consultant (L66-215)

| Item | What the doc wants | Code today | What's missing |
|---|---|---|---|
| `lawyer-free` | 0 SAR, no badge, 0 AI points | Badge and 90 days on signup | Server logic (phase P0) |
| `colleague-invite` | 30 days of library | The `colleague_invite` source exists | Probably matches |
| `founder-colleague-invite` | 90 days + 1 drafter job, up to 3 invites | Not built | New |
| `lib-q1` / `lib-q2` / `lib-annual` | 1,500 / 2,750 / 5,000. Launch −20%; founder renewal 4,250 | Prices match (`catalog.ts:123-125`, `plans.ts:55-148`), but they're one-off passes (`kind:"library"`, `saveCard:false`) | Launch and renewal prices; recurring billing |
| `erp-q1` / `erp-q2` / `erp-annual` | 1,200 / 2,190 / 3,990 + 250 / 500 / 1,000 welcome points | Not built. There is one tier ladder, and `pro` unlocks `library-full-access` (`access-control.ts:90`) | New item and new entitlement model |
| `bundle-q1` / `bundle-q2` / `bundle-annual` | 2,200 / 3,990 / 6,990, with 10 / 15 / 20 GB and 300 / 750 / 1,500 points | Not built | New |
| `lawyer-founder-2026` | 1,996/yr, from a pool of 1,096 paid seats | Not built | New item. Migration for a seat counter; seat returned on refund; 30-day grace |
| `lawyer-founder-plus` | 2,996/yr, or an upgrade for +1,000 | Not built | New; pro-rata upgrade |
| Top-ups 100 / 250 / 500 / 1,000 | Same packs, all valid 12 months; founder pays 85 for 100 | Validity 3 / 3 / 6 / 12 | Validity; founder price |
| Top-ups 2,500 / 5,000 / 10,000 | 5,000 / 12,500 / 25,000 points (30,000 during a campaign) | Removed under ١٧٤ (`pricing.lawyers.ts:16-17`) | New items |
| Packs of 500 and up | Professionals only | `buyers:"any"` (`catalog.ts:111`) | Server logic |
| 1,500 points a month (`PLAN_MONTHLY_POINTS`, `fulfillDecision.ts:286`, `grantPurchase.ts:208-214`) | Replaced by welcome points per cycle | Still granted | Remove |
| `consultant-independent` | Same plans as the lawyer; no pleading or Najiz | 399 / 3,990 (`catalog.ts:117`, `plans.ts:277-310`, `pricing.providers.ts:51-54`) | Price change; keep the Art. 18 gate |

## §5 AI tool points (L220-446)

**Nothing is charged today.** `debit_points` (`20261022_20_points_lots.sql:273`) has no caller in `src`, and `pricing.lawyers.ts:125-126` says «Points are not deducted yet». Every row below is display-only until a debit path exists (payments B2).

| Doc | Code today |
|---|---|
| Drafter: lawsuit / reply / rejoinder / supplementary / closing 500; appeal 1,000; cassation / petition for review 1,500 | One `ai:draft` at 15 (`lawyerAiCatalog.ts:327`, `pricing.lawyers.ts:155`). Needs a separate id per variant |
| `contracts` 1,000; `contract-drafter` 500 | `ai:contracts` 10 (`:328`); `ai:contract-drafter` is beta-free (`:121-125`) |
| `contract-reviewer` 300 (+15 a page), `contract-negotiator` 200 | Both pages are demos: `src/app/ai/contract-reviewer/page.tsx:51`, `contract-negotiator/page.tsx:68`. **No price until they're real (default for owner question ٢٩٦)** |
| `due-diligence` 3,000 | 15–20 (`pricing.lawyers.ts:180`) |
| `legal-opinion-full` 800 / `-medium` 400; `consult` 100 | One `ai:legal-opinion` at 15–20 (`:331`); `ai:consult` is beta-free (`:54-61`) |
| wargaming 250; analyze-strength 250; brief-check 200 | 15–20 / beta-free / beta-free (brief-check is done by the team, Q77) |
| interrogation 150; najiz-optimizer 15 | 5–8 / 5–8 |
| quick-answer / case-brief 20 | Priced, but no label shown (`lawyerAiCatalog.ts:310-312`) |
| `/laws` assistant (RAG) 5 | «١–٢» (`pricing.lawyers.ts:190`) |
| communicate 5, templates 50, canvas 100 / 20, interactive-ai-session 50 | communicate is beta-free; the others have no tool ids |
| analyze 250, transcriber 15, secretary 5, compare 10, legal-translate 50, direction-support 100 | `comingSoon` (`lawyerAiCatalog.ts:159, 210, 223, 236, 248, 260`). **Store the price but keep it hidden (L446, default for ٢٨٣)** |
| Overage per page / word / 10 minutes | Not built: needs server-side metering |
| Free tools (L440-445) | Already free (`pricing.lawyers.ts:194-202`) |

## §6 Law firms (L450-521)

| Plan | Doc | Code today | What's missing |
|---|---|---|---|
| `firm-basic` | 2,990 / 5,490 / 9,900; launch 8,415; 3→5 seats; 100 GB | 990 monthly / 9,900 yearly (`catalog.ts:118`, `pricing.firms.ts:21`, seed `:280`) | Quarterly/half; remove monthly; seat cap |
| `firm-enterprise` | 4,490 / 8,190 / 14,900; launch 12,665; 5→20 seats | 1,490 / 14,900 (`catalog.ts:119`, `pricing.firms.ts:42`) | Same as above |
| `firm-custom-21plus` | Sales quote, from 29,900 | Not built | New item |
| `lib-firm-small` / `-medium` / `-large` | Quarterly and half added; annual 4,800 / 12,000 / 24,000; launch −15% | Annual only (`pricing.library.ts:219-285`); can't be paid online | Quarterly/half; online payment |
| `lib-firm-enterprise` | Sales quote | Sales quote | Already matches |
| `pool-54k` / `160k` / `350k` / `700k` | Shared firm point wallets | Not built (`points_lots` is per user) | New feature (later) |
| Extra seats | Sales | Sales | Already matches |

## §7 Individuals (L526-824). All prices exclude VAT.

| Plan | Doc | Code today (VAT-inclusive) | What's missing |
|---|---|---|---|
| `ind-ai` | 39 / 110 / 210 / **365**; 296 for the first 496 founder clients | 39 / **390** (`catalog.ts:120`, `pricing.individuals.ts:55-56`, `plans.ts:161-162`) | Prices; quarterly/half; founder-client pool (later) |
| `ind-ai` features | 4 consultations, 300 points a year, 1 contract check, 2 GB, 10% off | «ذكاء اصطناعي قانوني غير محدود» (`pricing.individuals.ts:68`, `plans.ts:172`) | Remove the "unlimited" claim |
| `ind-preventive` | 149 / 420 / 790 / 1,490; launch 1,341; 12 consultations, 4 reviews, 1,500 points | 149 / 1,490; 4 consultations, 2 reviews (`pricing.individuals.ts:112-113`, `plans.ts:208-209`) | Features; quarterly/half |
| `ind-litigation` «التأمين القانوني \*» | 399 / 1,140 / 2,190 / 3,990; 5,000 points a year; 10k–25k cover after 90 days | 399 / 3,990. The family line says «٣٬٠٠٠–٥٬٠٠٠ نقطة شهرياً» (`pricing.individuals.ts:153`) | Features; quarterly/half |
| Footnote (L532) | The long footnote, verbatim | Only «* تطبق الشروط والأحكام» (`:159`) | Wording |
| `family-dep-1` / `-2` / `-3plus` | Priced on preventive and litigation | A line of text that says a team member reviews it (`:151-155`) | Later (L) |

**Per-service catalogue.** Lives in `src/constants/clientServiceCatalog.ts` (27 items) and the DB seed `20260518…sql:255+`.

- **Prices that change:**

  | Service | Code today | Doc |
  |---|---|---|
  | ai-consult | 49 | 29, plus 1 free a day |
  | video-short | 500 | 350 |
  | video-full | 500 | 550 |
  | in-person | 700 | 750 |
  | written-opinion | 250 | 900 |
  | ai-letter | 49 | 50 |
  | contract-analyze | 79 | 299 |
  | ai-case-eval | 79 | 249 |
  | second-opinion | 600 | 650 |
  | admin-objection | 800 | 850 |
  | mediation | 800 | 850 |
  | full-arbitration | 3,000 | 3,500 |
  | settlement | 399 | 450 |
  | translation | 300 per page | 150 per page, minimum 300 |

- **Split:** contract-draft (99, "included") becomes `contract-draft-ai` 499 and `contract-draft-lawyer` 750.
- **Already match:**
  - contract-review, case-study, legal-research, file-lawsuit;
  - appeal, cassation, defense, legal-notice, power-of-attorney;
  - inheritance, enforce-judgment, general.
- **New:**
  - phone-consult 249, consult-instant 700, single-hearing 800;
  - transaction follow-up: single online 99, single in person 250;
  - follow-up bundles 99 / 249 / 499, capped at 1 / 3 / 10 transactions over 60 days (ق١٩٩);
  - notary 199 / 349 / 599 (the notary page shows no prices today);
  - legal-representation (quote).
- **Wording:** the creators page gets a `comingSoon` mark. Tracking tier 3 loses «معاملات غير محدودة» (`components/tracking/constants.ts:170`).
- **Later:** member discount tiers (−10 / −15 / −20%) and the allowances each plan includes.

## §8 Companies and small businesses (L828-1083)

| Item | Code today | What's missing |
|---|---|---|
| `micro-shield` 750 / 1,390 / 2,499; launch 2,249 | Annual 2,499 only (`pricing.micro.ts:33`) | Quarterly/half |
| `biz-*` (9 plans), annual prices | Match (`pricing.companies.ts:14-208`) | — |
| `biz-*` features | md-pro shows 15 users (`:123`), md-full 25 (`:147`), lg-pro 30 (`:196`); md-full 3 cases at 300k (`:153`). Doc: 10, 20, 25 users and 4 cases | Text |
| Founder companies 21,096 (first 9, −15%) | Not built | Later; owner question ٢٩٤ |
| `dept-*` (9 plans) | Prices and points match (`pricing.companies.legaldept.ts:10-121`) | Launch −15% |
| Seconded counsel | Monthly 3,999 / 7,999 / 14,999 (`services/corporate/seconded-counsel/page.tsx:23, 40, 58`) | Doc: quarterly / half / yearly at 39,999 / 79,999 / 149,999 a year, 4 / 10 / 20 hours a month, SLA, launch −20% (question ٢٨٧) |
| Health check | Matches (`health-check/page.tsx:100-103`) | `hc-self` (free) and the launch price are new; don't stack (٢٧٩) |
| Trademark | Matches (`trademark/page.tsx:25-29`) | Discount tiers and launch −25% are new |
| Company formation | Matches (`company-formation/page.tsx:27-30`) | 7 new corporate services (`notary-corporate` … `corp-fines`) |

## §9 NGOs (L1088-1140)

- **Prices:** `ngo-impact` 2,388 and `ngo-institutional` 5,988 match (`pricing.ngo.ts:20, 31`).
- **New:**
  - the quarterly and half-yearly cycles (717 / 1,314 and 1,797 / 3,294);
  - launch prices 2,030 and 5,090;
  - `ngo-endowment` by quote;
  - 7 one-off services.

## §10 Government (L1144-1153)

Matches (`pricing.government.ts:10-33`). Optional text: «يبدأ من 45,000» and the Etimad wording.

## §11 Service providers (L1157-1195)

| Item | Code today | Doc |
|---|---|---|
| `provider-free` | 20% (`pricing.providers.ts:19`) | 15%, capped at 1,500 an order |
| `provider-pro` | 2,988 at **10%** (`:24, 32`) | 0% (897 / 1,644 / 2,988; launch 2,540) |
| `provider-elite` | **5%** (`:37, 47`) | 0% (5,988) |

- **Lawyers pay 0% always.** Two places say otherwise:
  - `marketplace/post/page.tsx:480` shows 15% for everyone;
  - `terms/page.tsx:81` says 5–15% is deducted from fees.
- **Remove every Escrow claim:**
  - `marketplace/post/page.tsx:481, 531`;
  - `marketplace/[id]/page.tsx:414, 475`;
  - `marketplace/order/[id]/page.tsx:40, 282, 316`.

  Don't promise Split Payment (owner question ٢٨٩).
- **Budget ranges:** match (`marketplace/post/_data.ts:41-90`).

## §12 Students, academy, storage (L1199-1285)

- **Students and trainees:** these aren't user types today (`20260603_phase1_001_profiles.sql:32-35`). Later. The trainee plan waits on owner question ٢٨٥.
- **Academy:**
  - Single-course prices match (`academy/page.tsx:50-129`).
  - New: −30% for subscribers, seasonal prices, the 990 bundle (sum is 1,146, owner question ٢٨٢), and the 1,990 unlimited plan.
  - Courses can't be paid online yet.
- **Storage add-ons:** new, and no storage quota is enforced anywhere today. Later.

## §13 Coupons, WhatsApp chat, refunds (L1289-1305)

- **Coupons:** today a client-side map `VALID_COUPONS` has no minimum order (`pricingRepository.ts:59-62, 121-128`). `quoteClientService` is used only in tests, and checkout has no coupon field.
  - Doc: NZAMY50 needs an order of 200 or more, NEWCLIENT 300 or more. Discount capped at 25%, once per user, checked on the server.
  - Coupons can't be used on top-ups, government fees or already-discounted plans.
  - The tables `public.coupons` and `coupon_usage` already have `min_order_amount` and `max_uses_per_user` (`20260603_phase1_003:91-127`). A policy at `:212-213` lets anyone read active codes and must be removed.
- **WhatsApp chat:** prices 50 / 700 / 150 / 499 are hard-coded (`StepPayment.tsx:37-40`, `StepConsult.tsx:165, 174`). They should come from the price book.
- **Refunds:**
  - 90-minute instant cancel (0 points used, no export): the mechanism exists (`refundDecision.ts:6`), but the policy page doesn't mention it.
  - 14 days / ≤5% / 24 h already match (`refund-policy/page.tsx:41, 52`).
  - New: a founder seat goes back to the pool on refund.
- **Points validity:** paid points 12 months, promotional points 90 days.
- **Saved cards:** `saveCard` only for recurring plans (`catalog.ts:44-45`) already matches. The 7-day renewal notice is payments B2 (owner question ٢٨٨).
- **Dead code:** `payPerUseItems` (`pricing.common.ts:43-69`) is imported nowhere and holds old prices. Remove it.
