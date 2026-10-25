# Phases unblocked by the owner's 25-Oct answers (2026-10-25)

**Source:** `C:\Users\LOQ\Downloads\حزمة_التسعير_والشعار_المعتمدة_للدكتور_محمد_2026-10-25\`

| File | What it is |
|---|---|
| `رسالة_التكليف_النهائية_…md` | Cover letter. Answers ٢٥٥–٢٧٧ (except ٢٦٩) and sets the priority: **lawyer and firm dashboard, pricing document, legal library**. |
| `وثيقة_التسعير_الكنوني_الشامل_…md` | Pricing document, 1,311 lines. He calls it the single source of truth for every price. |
| `ملحق_إصلاح_مشكلات_المكتبة_الثلاث_…md` + `.patch` + code folder | Three library fixes, ready to merge. |
| `nezamy_authentic_logo_preview.png`, `nezamy_qr_with_arabic_logo_preview.png` | Arabic logo and QR code (Level H). Used on letterhead and the platform stamp. |

This plan replaces Part 2 of `2026-10-25-upcoming-work-and-owner-package-10-22.md`.

**Do first:** finish the current deploy of fa0228c7, after SQL files 20–22 have run.

---

## Answers → work

| Q | Answer | Work it creates | Phase |
|---|---|---|---|
| ٢٥٥ SMS sign-in | Low priority, our call | Later | L1 |
| ٢٥٦ ZIP + branding | A ZIP button wherever there are several attachments (case file, requests, consultations, contracts). Letterhead open to **both** the individual lawyer and the firm, with the Arabic logo and QR. | ZIP bundles; branding vault | D3, D4 |
| ٢٥٧ library assistant | **5 points flat** | Price label now; the actual charge waits for the debit path (B2) | P4 |
| ٢٥٨ VAT | **Everything VAT-exclusive**, individuals included, with one notice on every price and checkout page | Pricing foundation | P1 |
| ٢٥٩ laws with no status | (أ) Remove «لم يُتحقّق من الحالة» | S | L-B |
| ٢٦٠ summary and card | (أ) Public to everyone. **Card only in the side column, preamble only in the middle column**, never both | M | L-B |
| ٢٦١ card fields | 5 always shown + «المزيد» | S | L-B |
| ٢٦٢ multi-volume collections | (أ) His library agent adds `series_id`/`collection_id` + volume number in the source. We switch on the volume picker and cross-volume search for sections 97–99 | Parser ready now; data when his files arrive | L-B |
| ٢٦٣ decree and fiqh summaries | (أ) His agent adds `summary`; we read and show it | Parser + display | L-B |
| ٢٦٤ «مبسّطة» | (أ) Remove the sidebar «مبسّطة / كاملة» toggle; the sidebar is always full | S | D1 |
| ٢٦٥ reminder times | The report's four times approved. The client gets them on WhatsApp once the Business account is live | Built in P4; WhatsApp waits on ops | D-ops |
| ٢٦٦ Google Calendar | (ب) **Real live OAuth sync** per lawyer; keep `.ics` | L + a verified Google app | D5 |
| ٢٦٧ canvas % | Percentages stay in the lawyer's canvas | Nothing to undo: the canvas never had them (55e0ec9f touched only the legal-opinion tool). No invented numbers if we ever add them. | — |
| ٢٦٨ profile switches | (أ) Keep current behaviour + switches; hourly rate hidden unless the lawyer turns it on | Check the P6 switches; add the hourly-rate default | D1 |
| ٢٦٩ "my profile isn't listed" | **Not answered** | Ask again | Q |
| ٢٧٠ branches, devices, agencies, hours, firm invoices | Low priority, our call | Later | L1 |
| ٢٧١ names | Owner **أ. أشرف ويح** («أ.», not «د.»); «من نحن» unchanged; lead developer د. محمد | Text and data sweep | D1 |
| ٢٧٢ staff mail | Only **bassam@** and **majed@** | Ops: mailboxes. Code: replace any essam@/bessam@ | D1 |
| ٢٧٣ Moyasar entity | The account is «منصة نظامي»; he enters company details in admin | Ops (O5) | — |
| ٢٧٤ CRM | Low priority, our call | Later | L1 |
| ٢٧٥ AI models | (أ) Haiku for quick tasks, Sonnet for deep work, no Opus | n8n config | D-ops |
| ٢٧٦ tracking link | The lawyer picks the lifetime (7 / 30 / 90 days / until the stage ends). On expiry or by hand the link is **paused, not deleted**, and can be reactivated in one click; revoking stays possible. The client enters the **last 4 digits of the phone number on file** to open it. | M + SQL. Rework of the P4 link | D2 |
| ٢٧٧ sort | (أ) Browsing: latest official amendment, then latest issue. Search: relevance | Matches what we built (`catalogue_recency_key` + relevance). Verify only. | L-B |
| Founder badge (new) | **Never on free signup.** Only verified licence + an actual payment for founder membership (1,996 or 2,996/yr, pool of 1,096 paid seats) | **Urgent.** The live trigger `trg_lawyer_profiles_founder` (20261021_50) gives every new lawyer the badge + 90 days of library | P0 |
| Refunds (new) | 14 days, ≤5% consumed, no full export, plus a 90-minute instant-cancel window | Settles the old conflict with ١٨٠ | P7 |
| Lawyer 399/month (new) | Removed. Professionals are billed quarterly, half-yearly or yearly only; individuals keep monthly too | Pricing | P1–P2 |

---

## Phases, in order

Sizes: S < half a day, M ≈ 1–2 days, L = several days. "SQL" means a file for the user to run.

### P0 — Stop the founder grant on signup (S, SQL) — FIRST

- [ ] **SQL:** drop `trg_lawyer_profiles_founder` and its function. Keep the `founder_badge` column and `founder_campaign_active()`.
- [ ] **What happens to badges and 90-day grants already given?** Default: remove the badge, keep the library days already granted. This needs his yes (Q1).
- [ ] **Wording:** the `campaigns.ts:57-58` banner («سجّل الآن واحصل على ٣ أشهر … وشارة المؤسس») becomes the paid founder offer, or is hidden until P3 ships.
- [ ] **Tests:** update `founderBadge` and campaign tests, and add a `_verify` section.

### L-A — Merge his three library fixes (S–M, SQL)

Status: already merged in a scratch worktree (`D:/nzwt/libpatch-check`). His patch was built on f9d3219b. One test-file conflict, resolved by keeping both sides. tsc clean, **3,638/3,638 tests pass**. Security reviewed: every folder route checks ownership, and the RLS policies it relies on are already owner-only (20260626:804-855).

- [ ] Port onto a real branch. Copy files with their **original line endings** (his files are LF; `laws/page.tsx`, `LawsTabContent.tsx` and `normalizeArabic.ts` are mixed on main). Never `git apply` his patch as is: it has CRLF headers.
- [ ] Hardening: cap the folder name length; validate `color` (hex) and `icon` (short); whitelist `entityType` (`law|precedent|book|decree`); cap the `title` length.
- [ ] Move his `20261025_01_smart_folders_authenticated_grants.sql` into a new SQL batch folder, add its `_verify` section, and test it in Docker.
- [ ] Owner report row for each of the three fixes.

### L-B — Library answers (M)

- [ ] ٢٥٩: remove «لم يُتحقّق من الحالة» and its 3 pinned tests.
- [ ] ٢٦٠: the summary and public card fields are open to everyone. `LAW_SUMMARY_AUDIENCE` goes from `"subscribers"` to everyone; the paywall on article text is unchanged. The card goes in the side column only; the preamble in the middle column only. Remove any duplicate.
- [ ] ٢٦١: 5 card fields + «المزيد». Which 5? Default: type, issue date, latest amendment, status, issuing body. See Q14.
- [ ] ٢٦٢/٢٦٣: the parser and loader read `series_id`/`collection_id`/`volume_number` and `summary` for sections 30, 97, 98, 99. Volume picker and cross-volume search for 97–99. The data arrives with his next export. **We never run the loader**; he does, dry-run first.
- [ ] ٢٧٧: verify the browse order and search relevance against live data. No code change expected.

### P1 — Pricing foundation (L, SQL) — needed by every other pricing phase

- [ ] **One server price book.** Today the same price lives in five places: `catalog.ts`, `lib/pricing/plans.ts`, `constants/pricing/*`, the `subscription_plans` seed, and `admin_pricing_catalog`. Pricing pages, checkout, the WhatsApp chat and admin all read the book. Pages built from it can't show a price checkout doesn't charge.
- [ ] **VAT-exclusive everywhere** (٢٥٨): individuals' plans switch from inclusive to exclusive, with the unified notice in `vatNotice.ts`.
- [ ] **Quarterly and half-yearly billing end to end:**
  - `Billing` type;
  - `payment_orders_billing_check` (**SQL**);
  - `planWindow` (3 and 6 months);
  - `subscription_plans` columns (**SQL**);
  - renewals;
  - pricing page toggle: professionals see quarterly/half/yearly; individuals also see monthly.
- [ ] Remove the dead `payPerUseItems` (`pricing.common.ts:43-69`, imported nowhere, old prices).

### P2 — Lawyer and Art. 18 plans (L, SQL)

- [ ] Remove `lawyer-pro` 399/3,990 and the 1,500 points a month (`PLAN_MONTHLY_POINTS`).
- [ ] **Three separate paths, each its own entitlement:**
  - library `lib-*` 1,500 / 2,750 / 5,000;
  - ERP `erp-*` 1,200 / 2,190 / 3,990 + 250/500/1,000 welcome points;
  - bundle `bundle-*` 2,200 / 3,990 / 6,990 + storage + points.

  Today `pro` unlocks the library, so selling ERP-only needs a split in `access-control`.
- [ ] The Art. 18 consultant gets the same prices with no extra points; pleading and Najiz stay blocked.
- [ ] **Top-ups:** 7 packs, 100 → 10,000. Points only, all valid **12 months**. Packs of 500 and up are professionals only. The 10,000 pack gives 25,000 points normally and 30,000 during a campaign.
- [ ] Founder colleague invite: 90 days + 1 drafter job, up to 3. Ordinary invite stays at 30 days.

### P3 — Paid founder membership (L, SQL)

- [ ] `lawyer-founder-2026` 1,996/yr and `lawyer-founder-plus` 2,996/yr, each with the contents listed in the letter. Upgrade from one to the other for +1,000.
- [ ] **Seat pool of 1,096:**
  - an atomic seat counter;
  - the seat is granted only when the licence is verified **and** the order is paid;
  - the seat returns on refund;
  - 30-day grace.
- [ ] Badge, title and the permanent 15% discount come from that grant, not from signup.
- [ ] Founder top-up price: 85 SAR for 100 points. It does not stack with the bonus on larger packs.

### P4 — AI tool point prices (M; the charge itself is payments B2)

- [ ] Price labels for all 39 tools from §5.
  - Drafter: lawsuit, reply, rejoinder, supplementary and closing briefs 500; appeal 1,000; cassation and petition for review 1,500. These need per-variant ids.
  - Library assistant: 5.
  - Tools marked «قريباً» keep their price **stored but hidden**, per his own rule L446.
- [ ] Don't price the demo pages until they're real: `contract-reviewer` and `contract-negotiator` render fixed sample findings. This is the honesty rule; see Q11.
- [ ] Note: no point is charged today, because `debit_points` has no caller. The real charge, and overage billing by page, word or minute, join payments B2.

### P5 — Individuals (B2C) (M; family coverage L)

- [ ] **Plans and prices:**
  - `ind-ai` 39 / 110 / 210 / **365** (296 for the first 496 founder clients);
  - `ind-preventive` 149 / 420 / 790 / 1,490;
  - `ind-litigation` «التأمين القانوني \*» 399 / 1,140 / 2,190 / 3,990, with his full footnote and the ق٢١٣ terms.
- [ ] Remove «ذكاء اصطناعي قانوني غير محدود» and replace each plan's features with the doc's allowances.
- [ ] **Per-service catalogue.** Update the prices that changed:
  - AI consultation 49→29;
  - video consultation, short 500→350 and full 500→550;
  - written opinion 250→900;
  - contract analysis 79→299;
  - AI case evaluation 79→249;
  - second opinion 600→650;
  - administrative objection 800→850;
  - mediation 800→850;
  - full arbitration 3,000→3,500;
  - settlement 399→450;
  - in-person consultation 700→750;
  - AI letter 49→50;
  - translation 150 a page, minimum 300.
- [ ] **Per-service catalogue.** Split contract drafting into AI 499 and lawyer 750.
- [ ] **Per-service catalogue.** New services:
  - phone consultation 249;
  - instant consultation 700;
  - single hearing 800;
  - follow-up of a government transaction: single online 99, single in person 250, bundles 99 / 249 / 499 capped at 1 / 3 / 10;
  - notarisation 199 / 349 / 599.
- [ ] **Per-service catalogue.** The content-creators page is marked «قريباً». Tracking tier 3 loses «غير محدود».
- [ ] Sync the `admin_pricing_catalog` seed (**SQL**) so admin and the pages agree.
- [ ] **Later (L):** family dependants (319/279/239 and 3,190/2,790/2,390), member discount tiers, the founder-client seat pool.

### P6 — Firms, companies, NGOs, government, providers (M)

- [ ] **Firms:**
  - `firm-basic` 2,990 / 5,490 / 9,900;
  - `firm-enterprise` 4,490 / 8,190 / 14,900;
  - remove monthly;
  - seat caps;
  - 21+ seats by sales quote;
  - firm library plans gain quarterly and half-yearly.
- [ ] **Companies:** feature text fixes. Users: md-pro 10, md-full 20, lg-pro 25; md-full gets 4 cases. Micro-shield gains quarterly and half-yearly.
- [ ] **The four corporate service pages:**
  - seconded counsel: quarterly/half/yearly with an SLA. Exec hours need confirming (Q12);
  - health check: free self-check;
  - trademark, kept apart from SAIP fees;
  - company formation, kept apart from government fees.

  Extra seats stay «تواصل مع المبيعات».
- [ ] **NGOs:** quarterly and half-yearly cycles; endowment plan by quote.
- [ ] **Government:** optional wording.
- [ ] **Providers and marketplace:**
  - free plan at 15% commission, capped at 1,500;
  - Pro and Elite at 0%;
  - **lawyers always 0%**;
  - remove every «Escrow / حساب الضمان» claim (marketplace pages and terms).

  Don't promise Split Payment until it exists (Q7).
- [ ] Online checkout for these audiences waits until P1 lands; then each one is just a catalogue entry.

### P7 — Coupons, WhatsApp chat, refund page (M, SQL)

- [ ] **Coupons checked on the server.** NZAMY50 needs a net order of 200 or more, NEWCLIENT 300 or more. Discount capped at 25%, once per user. Not valid on top-ups, government fees or already-discounted plans. Delete the client map in `pricingRepository.ts`.
- [ ] **SQL:** remove the policy that lets anyone read active coupon codes.
- [ ] The floating WhatsApp chat (`StepPayment.tsx`, `StepConsult.tsx`) reads prices from the book.
- [ ] **Refund page:** add the 90-minute instant-cancel window (0 points used, no export). Keep 14 days / ≤5%.

### D1 — Lawyer dashboard: small answers (S)

- [ ] ٢٦٤: remove the sidebar toggle; the sidebar is always full.
- [ ] ٢٦٨: hourly rate hidden by default; check the P6 switches.
- [ ] ٢٧١/٢٧٢: «أ. أشرف ويح» everywhere (blog authors, owner docs); only bassam@/majed@.

### D2 — Tracking link v2 (M, SQL)

- [ ] **Lifetime chosen at creation:** 7, 30 or 90 days, or until the stage ends.
- [ ] **States:** active, paused (on expiry or by hand), revoked. Reactivating keeps the same URL.
- [ ] **Client check:** the client enters the last 4 digits of the phone number on the case file. Rate-limit the attempts; do this on the server and never send the phone number to the browser. `/track` headers stay `no-store` / `noindex`.

### D3 — ZIP download of attachments (M)

- [ ] **Placement:** a server-side ZIP of the files the user may see, on the case file, request follow-up, consultations and contracts.
- [ ] **Limits:** streamed, size-capped, and respecting the soft-delete and storage guards.

### D4 — Letterhead and branding (M–L, SQL)

- [ ] **Branding vault:** for an individual lawyer and for a firm, holding the logo, colours and footer.
- [ ] **Output:** printable letterhead, with the platform's Arabic logo and QR (Level H) in the footer or stamp.
- [ ] His old `20261019_vault_lawyer_branding.sql` can't run (it reads a missing `profiles.role`), so this phase rewrites it.

### D5 — Google Calendar live sync (L, ops first)

- [ ] **Ops first:** a Google Cloud app with the calendar scope, and Google's verification. That takes weeks, so start it now.
- [ ] **Storage and hookup:** an OAuth token table (encrypted, owner-only), and hearings pushed on create, edit and delete.
- [ ] **Disconnect button;** `.ics` stays.

### L1 — Low priority (his words)

- ٢٥٥ SMS sign-in
- ٢٧٠ branches, devices, agencies, hours, firm invoices
- ٢٧٤ CRM
- The secondary panels: hide ID and IBAN on the server; isolate permissions.

### Later (L, no date)

- Firm shared point wallets (needs a firm-level model; `firm_members` is never written)
- Family dependants
- Storage quotas and add-ons (no quota is enforced today)
- Student and trainee audiences (new user types + verification)
- Paid academy
- Provider commission engine and payouts
- Overage metering

---

## Suggested order

1. **P0** (urgent, small).
2. **L-A** (ready, tested).
3. **D1**.
4. **P1** (foundation).
5. In parallel: **L-B** + **D2** + **P7**.
6. **P2 → P3** (lawyer plans, then founder seats).
7. **P4**, **P5**, **P6**.
8. **D3**, **D4**.
9. **D5** once Google approves the app.
10. L1 and Later.

## Ops on your side

- Google Cloud OAuth app + verification (D5)
- Meta WhatsApp Business (client reminders)
- Mailboxes bassam@ and majed@ on nezamy.sa
- Company details in Admin → Settings (he enters them)
- n8n model choice: Haiku and Sonnet

Still open from before: O2–O6 in the 10-22 backlog (deadline cron, payments sweep, `N8N_WEBHOOK_BASE_URL`, payments SQL 08, founder file 03).

---

## Questions for the owner (from ٢٧٨)

The final numbered version, in Arabic, is `للمالك_دفعة_٢٥_أكتوبر/أسئلة_للمالك_حزمة_التسعير_٢٥_أكتوبر.md`, questions ٢٧٨–٢٩٨ plus ٢٦٩ again. **Its numbers win over the draft list below.**

Each has the default we use until he answers.

1. **Founder badges already given by the signup trigger.** Default: remove the badge, keep the library days already granted.
2. **Founder campaign window.** The doc says 23 Sep – 23 Dec 2026 (L155). The platform setting is 25 Oct 2026 – 25 Jan 2027 (from his ٢٢٥). Default: keep the platform dates.
3. **Discount stacking.** His rule 7 forbids stacking, but the health-check launch prices stack −20% on top of the subscriber price («وفر ٥٢٪», L972-982). Default: no stacking; the customer gets the better of the two.
4. **Provider Pro at 0% "up to 50 completed orders a year"** (L1171). What applies after 50? Default: 0% throughout.
5. **Academy bundle.** The four courses add up to 1,146, not 1,246 (L1250), so 990 is about −14%, not −20%. Default: keep 990 and correct the stated saving.
6. **Renewal reminder: 7 days** (L1305) **or 3 days** (٢٤١)? Default: 7.
7. **Split Payment (SAMA).** Not built, and ٢٣٦ said no split payments at launch. Default: delete the Escrow claim and promise nothing until it is built.
8. **Launch prices inside the cards** («−٢٠٪ أول دورة»). This conflicts with ١٧٩ (offers only in a dated banner). Default: show them in a dated campaign banner. Also: until when do they apply?
9. **Welcome and founder points: how long are they valid?** Promotional points last 90 days. Paid points last 12 months. Are the ERP welcome points and the founder's drafter points promotional? Also: does «٤ أعمال صائغ» mean 4 jobs or 2,000 points? One appeal costs 1,000. Default: 12 months, counted in points.
10. **«مخرج أداة مستقلة»** in the 1,996 tier (L162) isn't defined. Default: one tool output worth up to 250 points.
11. **Tools that are still demos** (contract reviewer, negotiator). Default: no price until they're real.
12. **Seconded counsel, exec tier.** It changes from 3 days a week (about 96 hours a month) to 20 hours a month at the same price. Is that intended?
13. **Unanswered or open values:**
    - **Ranges that need one number:**
      - legal-insurance cover, 10k–25k;
      - family shared cap, 35k–50k;
      - micro-shield waiting period, 60–90 days.
    - **Monthly subscribers:** can a monthly `ind-litigation` subscriber reach the 90-day cover?
    - **Founder-company seats:** 9 in total or 9 per plan?
    - **Company billing periods:** which periods are sold? The doc shows annual only, but rule 1 says quarterly, half-yearly and yearly.
    - **Possible copy error:** `trainee-firm` (L1218-1221) has exactly the same numbers as `storage-50g`.
14. **٢٦١: which 5 card fields?** Default: type, issue date, latest amendment, status, issuing body.
15. **Still unanswered:**
    - ٢٦٩ (which account isn't showing in the directory);
    - account deletion: do the office's notes and documents survive when an account is deleted?
16. **His reversals.** These change his own earlier answers, so the owner report will say «استُبدل بقرار ٢٥ أكتوبر», not «كان خطأ»:
    - the 399/month plan and 15-point prices (١٧٤, ١٧٨);
    - top-ups up to 10,000 return (removed under ١٧٤/١٧٩);
    - top-up validity becomes 12 months for all (was ٢٤٩);
    - individuals become VAT-exclusive (was ٢٤٨).

---

## Progress (2026-10-26, branch `batch/2026-10-26-owner-answers`)

✅ = built and reviewed on the branch. **Nothing is deployed, and no SQL file of this batch has run on prod.** Run order: `SQL_batch_2026-10-26_owner_answers/README.md`. Owner report: `تقرير_للمالك_٢٠٢٦-١٠-٢٦_تنفيذ_أجوبة_٢٥_أكتوبر.md`. New questions ٢٩٩–٣٢١: `أسئلة_للمالك_دفعة_٢٦_أكتوبر.md`.

| Phase | Status | Commits |
|---|---|---|
| P0: no founder grant on signup (20261026_01) | ✅ made | bd5852bb, 4ea293e3, a8d42d51, 15d074c0 |
| P0b: unpaid founder badges removed, library days kept (٢٧٨ أ, 20261026_02) | ✅ made | 56eedd30 |
| P1: price book, VAT-exclusive, quarterly / half-yearly groundwork (20261026_10), professionals' monthly retired, no plan points (٢٩١) | ✅ made (no q/s prices yet) | 57fd9ac9, 5e4b193e, 32b83306, d3f913b0, 199808a3, 5ec7347e, 5d7bc83d, b4491c86, f904fa07, 4f56367f, 6ae757cf, 7816fb9d, 55cce552 |
| P2: lawyer and Art. 18 plans, top-ups 500–10,000 | ⏳ waiting for the revised pricing doc (q ٢٩٩, ٣٠٠, ٣٠٢) | — |
| P3: paid founder membership (2,996, 1,096 seats), launch prices in cards (٢٩٠) | ⏳ waiting for the revised pricing doc (q ٢٩٩, ٣٠٣) | — |
| P4: AI tool point prices | ⏳ waiting for the revised pricing doc; the charge itself is payments B2 | — |
| P5: individuals (insurance 549 / 365, family add-on, smart plan) | ⏳ waiting for the revised pricing doc (q ٣٠١, ٣٠٢) | — |
| P6: firms, companies, NGOs, providers, commissions (٢٨١), Escrow copy in marketplace pages (٢٨٩), academy prices out (٢٨٢) | ⏳ waiting for the revised pricing doc | — |
| P7: server-side coupons (20261026_20), WhatsApp chat prices, refund page | ✅ made (NEWCLIENT unusable until a single-service checkout exists; reminders hidden until B2) | 4b5817b8, 6d7f3318, f6752e88, b0d1cbe2, 9fcba108, c529f5ab, 2c900b39, 9f786f40, f66f2fde, b89dba53, 7988cce3, 98b9c5f5 |
| D1: ٢٦٤ sidebar toggle gone; ٢٧١ / ٢٧٢ sweep; ٢٦٨ checked (hourly rate already hidden by default since ١٦٨) | ✅ made | 98c8d9f7, a15a4314 |
| D2: tracking link v2 (٢٧٦, 20261026_62) | ✅ made | 29aa631b, e09438b2, 6efa400d, 847680cb, fbbf7c97, eaf3b764, 0e22c0ef, 1a589305, 45e92b2e, e90e8cab |
| D3: ZIP download (٢٥٦) | ✅ made | 1ded9bb0, fbaa3184, 3e915e20, aa15f519 |
| D4: letterhead, branding vault, wordmark and smart QR (٢٥٦, 20261026_63 + 64) | ✅ made | 5f0d6f48, b2689620, 59445b35, 0e9de847, 3b1721e6 |
| D5: Google Calendar live sync (٢٦٦) | ⏳ ops: needs a verified Google Cloud app | — |
| D6: account deletion (٢٩٨, 20261026_70 + 71) | ✅ made (ops: daily n8n POST /api/v1/cron/account-purge) | 0e0b66ea, a7f048e4, a82c0d5c, cc934afe, 00c57643, 61b210cf, 23fa982c, 50290bdc, 5cb01e6f, 95089d73, 1865ac1c, da7fb661, d596a789, 6bdae14a, f055839f, 7174d4a3, ca1af107 |
| L-A: the owner's three library fixes + hardening (20261026_50) | ✅ made | ecf0b357, 0764d6e3, 62a5e1d4, d1ced0bc |
| L-B: ٢٥٩ / ٢٦٠ / ٢٦١ / ٢٦٢ / ٢٦٣ / ٢٧٧ / ٢٩٧ (20261026_51, 52) | ✅ made (٢٦٢ data arrives with his next export; run 51 before that load) | 1d1d85f8, 64be7e90, b8077b03, 750a1194, 8f46ddd5, b0317922, 31e54fe5, fe1024dc, 9e0be047, 91f76bd6, ab82de0c, fb69d226, 72f918e9, 81295e33, 9dddfbc2, 71c12c22 |
| Security: attachments path ownership (20261026_65) | ✅ made (hole live today: run now) | 3cf9bd17, ef360b4d, b47aa066, d5fcc239 |
| Security: share links (20261026_66) | ✅ made (hole live today: run now, after 65) | d55acf09, bf8d318a, 70aad707, 4517988b |
| Security: file folder owner, so 65 and 70 work together (20261026_72; order 65 → 66 → 72 → 70 → 71) | ✅ made | 9b0c6480, c655ecae, 04f79a24, 1359d538 |

Docs and merges, not counted above: d9e2f409, 9196a79d (docs); f9acf72f, 092c7acf, 4ec75de8 (track merges).
