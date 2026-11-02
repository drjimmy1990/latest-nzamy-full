# Founder kit R7: gap analysis (1 Nov 2026)

**Source:** `C:\Users\LOQ\Downloads\33-founder-complete-kit-r7\` (243 files, 93 MB). I read it only and ran nothing from it.

**Compared against:** `origin/main` at e25edba2.

**Commercial source of truth:** `campaign.manifest.json` (schema `2026-10-30-erp-release-clarification`). The developer spec is `02-PROGRAMMER-HANDOFF.md`.

## 0. Urgent

The kit puts the campaign start at **Sun 1 Nov 2026 00:00 Riyadh**, which is today. The kit itself says none of it is certified:

- `release_status`: "production implementation and live checkout not certified";
- `agent-knowledge.json`: `checkout_e2e_passed: false`, `campaign_live: false`.

Every WhatsApp message and the brochure point to
`https://nezamy.sa/pricing?audience=lawyers&campaign=founder-2026#founder-plan`.
On the live site that link lands on a page with **no founder offer**:

- the price book has no founder plan;
- `FOUNDER_MEMBERSHIP_ON_SALE = false` (`src/lib/pricing/campaigns.ts`);
- `/pricing` has no `?audience=` or `?campaign=` handling;
- there is no `#founder-plan` anchor.

**So no WhatsApp send can go out until the site work in §2 (P3) is deployed and tested.**

## 1. What the kit contains

| Part | Files | Dev work? |
|---|---|---|
| Commercial facts | `campaign.manifest.json`, `decisions.json`, `docs/04-LATEST-COPY-AND-ERP-DECISION.md` | Yes: prices and entitlements |
| Developer spec | `02-PROGRAMMER-HANDOFF.md` (§1 P0 list, §2 commercial, §3 contact data, §4 Zernio, §6 AI assistant, §7 webhooks, §8 checkout, §9 ERP/library tests, §10 acceptance, §11 ops screen) | Yes |
| WhatsApp templates | `templates/{recommended,alternate}_{named,general}.json`, all `MARKETING`, `ar`. Each has `accountId: REPLACE_WITH_VERIFIED_ACCOUNT_ID`, so none is uploaded yet | Zernio track |
| Message copy and assistant facts | `messages/*.txt`, `messages.json`, `agent-knowledge.json` (FAQ intents) | Zernio track |
| Marketing assets | `brochures/founder-offer.pdf`, `lawyer-platform.pdf`, `legal-library.pdf`; `video/promo-whatsapp-720p.mp4` (15 MB, under Zernio's 16 MB cap), `promo-master-1080p.mp4` | Hosting only |
| Proposal | `docs/01-CAMPAIGN-PROPOSAL.md`: 1 Nov opening line, Black Friday (27 Nov) angle with **no** extra discount, funnel metrics | Ops screen metrics |
| Production and QA records | `production/`, `qa/`, `sources/` (contains `rebuild.py`, **not run**) | No |

## 2. What already exists vs what is missing (lawyer founder plan)

| Requirement (manifest / handoff) | On main today | Gap |
|---|---|---|
| Plan `lawyer-founder-2026`, 2,996 SAR before VAT (3,445.40 with VAT), 12 months from activation | Not in `PRICE_BOOK`. Moyasar checkout, VAT and fulfilment exist (B1) | Add the entry, its fulfilment, and the card on `/pricing` |
| Checkout link `?audience=lawyers&campaign=founder-2026#founder-plan`, keeping the plan and campaign through login | None | Build it |
| Activation needs a verified licence, a captured payment and an atomic seat | `lawyer_profiles.verification_status = 'verified'` (set by an admin) exists. Payment verification exists. No seat counter | Seat allocation (cap 1,096, race-safe, idempotent), plus a licence gate before checkout **and** again at fulfilment |
| 6 drafter works (any eligible type, repeats allowed) + **1** shared output from the four tools (contract pro, decisive opinion, comprehensive simulator, direction support) | No voucher or credit system. The drafter and the tools charge points only (`draftKinds.ts`, `tools.ts`) | A voucher ledger (6 + 1 per membership year) that the tools spend **before** points, refunded on failure in the same way as points |
| Library 12 months | Library grants exist (`lib-*`, admin grants) | Grant 365 days at activation |
| ERP shown as «قريبًا», term from activation, no new term when it launches later | No ERP plan; there is a `comingSoon` flag in the book | Card and receipt copy only |
| 25 GB storage, 20 MB upload limit | Upload limit is 20 MB (`fileValidation.ts`). No per-plan storage quota | The 25 GB quota is a gap. Defer it, but say so in the copy |
| Campaign window 1 Nov 2026 – 25 Jan 2027, or 1,096 paid verified seats | Setting `founder_campaign` and book campaign `launch-2026` both start **25 Oct** | Change the setting date (admin), and close the plan when the seats run out |
| Founder badge only when paid | Badge column + `founderBadgeFrom` exist; unpaid badges removed (20261026_02) | Set the badge at activation |
| Renewal example 5,941.50 (founder) vs 6,990 standard | — | **5,941.50 is not a whole riyal.** `formatSarAmount` and the book are whole-SAR only. Show it as display copy only until renewals (B2) are built |
| Ops screen (§11) with metrics and a pause button | None | Admin page: seats sold/left, orders, activations, pause sale (a setting) |
| Benefits the brochure promises: 3 guest invites a month, 1-year continuity + 30-day grace, marketplace fee 5%, profile recommendation, private founder room, academy deferred | Partly: invites exist (Pro 30 days), others not | Defer, but the card must not promise what is not granted (`pricingHonesty`) |

**Client founder** (`client-founder-2026`, 296 SAR, 496 seats). The manifest's own `requires_before_purchase` blocks it: there is no case-eligibility policy, personal case catalog, human capacity or AI limits yet. **Not now.**

**Business founder** (`business-founder-national-2026`, 21,096 SAR, 9 seats, inherits `biz-sm-pro`). `biz-sm-pro` is not in the book. **Not now; ask the owner.**

## 3. Conflicts between the kit and live code. These are owner decisions; do not change code on our own

1. **Library annual price.**
   - Live `lib-annual` = **3,490**, from owner answer ٣٠٠ (30 Oct).
   - The manifest's ordinary price for library 12 months = **3,790**, and it lists `library_annual_3490: false` under *unapproved proposals*.
   - Both are dated 30 Oct.
2. **Drafter "initial claim" price.**
   - The manifest has `initial_claim: 200` points.
   - `draftKinds.ts` charges a claim **500**.
3. **Eligible drafter types for the 6 works.**
   - The manifest lists initial claim, reply, supplementary, closing, appeal, cassation and reconsideration.
   - The code also has **rejoinder (تعقيب)**, which the manifest leaves out. Does it count?
4. **Top-up campaign balances.**
   - The manifest lists `campaign_points` (500 → 700, 1,000 → 1,500, 2,500 → 5,000, 5,000 → 12,500, 10,000 → 30,000).
   - The book grants the normal balance, because «فترة العروض» had no date.
   - Is the founder-2026 window that date?
5. **P2 prices may now be unblocked.**
   - The manifest gives bundle 1,990 / 3,790 / 6,990 and ERP 1,200 / 2,190 / 3,990 (3 / 6 / 12 months).
   - The book has been waiting for these (lawyer-pro → erp-* / bundle-*).
   - Confirm that they are final, and say what happens to the existing `lawyer-pro` 3,990 subscribers.
6. **Campaign start date.** The site setting says 25 Oct and the manifest says 1 Nov. The admin can change the setting, but which one is correct?

## 4. Zernio WhatsApp track (separate; needs accounts, not just code)

The handoff asks for the following:

- Zernio templates, broadcasts, inbox and webhooks;
- HMAC-SHA256 `X-Zernio-Signature` checked on the raw body;
- store the event, then answer 2xx;
- a unique event id, plus a per-contact/intent idempotency key;
- STOP handling («إيقاف») that is deterministic and permanent;
- human handoff;
- an assistant that answers only from `agent-knowledge.json` facts;
- a contact table with consent tracking (§3 fields, E.164 phone numbers, no guessed titles, the general template when the name is missing).

Prerequisites only the owner or the user can provide:

- a Zernio account linked to the WhatsApp number;
- the account and profile ids;
- an API key and webhook secret, which go into the server env and never into chat;
- Meta template approval, which has a lead time;
- a lawful consented contact list.

Our n8n instance can host the webhook worker and assistant, as with L9–L11.

## 5. Proposed order

1. **P3 lawyer founder membership:**
   - the book entry;
   - the founder card and checkout link on `/pricing`;
   - licence gate, seat allocation and activation;
   - the 6 + 1 voucher ledger spent by الصائغ and the four tools;
   - a 365-day library grant;
   - ERP «قريبًا» copy;
   - the paid badge;
   - an admin ops panel with a pause switch;
   - then flip `FOUNDER_MEMBERSHIP_ON_SALE`.

   It ships as one migration plus code, with a Docker test for the seat race and voucher double-spend, and an owner report.
2. **Owner questions ٣٩٨ onward** for the conflicts in §3, the business founder, and which deferred benefits to drop from the copy.
3. **Zernio** once the accounts exist: a webhook route or n8n workflow, the contacts and consent table, opt-out, handoff, and the ops metrics.
4. **P2** (bundle / ERP / library prices) once conflicts 1 and 5 are answered.
