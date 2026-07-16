# NZAMY — Remaining Work (Post 9fe1949)

> **Generated:** 2026-07-16 from MASTER_PRIORITY_LIST, workflows_roadmap.md, TEST_REVIEW_RECONCILIATION.md
> **Last commit:** `9fe1949` on `main` | **Build:** ✅ GREEN
> **What's done:** 14 fixes shipped, Library Sprint (FTS search, pagination, paywall, CLI, smart folders), and Blog CMS Sprint (DB-driven articles schema, storage covers, metadata, blog-toolkit CLI)
>
> ### 🆕 2026-07-16 Library Sprint Completion
> Major library implementation work completed this session:
> - ✅ **library-toolkit CLI** created with 6 commands (parse, seed, clear, verify, status, reseed)
> - ✅ **supabaseLibrary.ts table names fixed** (law_chapters→chapters, law_articles→articles, law_amendments→article_amendments, removed phantom law_executive_regs)
> - ✅ **SmartFolders wired to Supabase API** (dual-mode: API for auth, localStorage for guest)
> - ✅ **feqh-preview, civil-procedure, law-metadata-map connected to DB** (were 100% hardcoded)
> - ✅ **Server-side search + pagination** on `/laws` page (replaced in-memory JS filtering)
> - ✅ **Paywall enforcement fixed** (`free: true` override → `free: !isLocked`)
>
> ### 🆕 2026-07-16 Blog CMS Sprint Completion
> Major blog CMS implementation work completed this session:
> - ✅ **DB-driven articles schema** (31 fields) implemented in database
> - ✅ **Storage bucket covers** configured for blog cover images
> - ✅ **Server JSON-LD + metadata** integrated for SEO dynamic article generation
> - ✅ **GFM-alert renderer** for rich content display
> - ✅ **blog-toolkit CLI** created to manage content and publishing pipeline

---

## 🔴 DEPLOY FIRST (Before anything else)

- [ ] Apply `20260716_security_hardening.sql` on Supabase SQL Editor
- [ ] Apply `20260716_missing_fk_indexes.sql` on Supabase SQL Editor
- [ ] Apply all 9 pending migrations from June–July (`20260630_handle_new_user_sectors.sql` → `20260706_articles_seed.sql`)
- [ ] Add `supabase db push` to `deploy.sh`
- [ ] Deploy current `main` to `nezamy.sa` (`git pull && npm run build && pm2 reload nzamy`)
- [ ] Re-run owner's 42-step July test guide — record which fails auto-resolve

---

## 🟠 P1 — Security (remaining 4 of 8)

- [ ] **Dev role-switcher in production** — verify `runtimeMode.ts` actually removes it from prod build
- [ ] **`DELETE /api/library/folders` IDOR** — two-account ownership test
- [ ] **`smart_folder_items` IDOR** — re-verify ownership guard
- [ ] **Rate-limit AI proxy routes** — `/api/ai/explain-article` and `/api/ai/library-chat` are uncapped (abuse/cost risk)

---

## 🟠 P2 — Owner's Blocking Functional Failures (7 remaining)

- [ ] **Upgrade buttons dead on `/pricing`** (step 19) — CTAs not wired to entitlement-request pipeline
- [ ] **Referral link invalid** (step 32) — "رابط الدعوة غير صالح"
- [ ] **Create-group fails** (step 15) — `/dashboard/client/my-group` returns error
- [ ] **Broadcasts not delivered** (step 23) — admin send succeeds but never reaches lawyer dashboard + missing "الأفراد/العملاء" audience
- [ ] **Community moderation not synced** (step 26) — admin approval doesn't reach `/community`
- [ ] **Payments log UI broken** (step 27) — overlapping text, no user-type filters, no charts
- [ ] **`/find-lawyer` hardcoded mock** — `find-lawyer/data.ts` (8 fake lawyers), DB never queried

---

## 🟡 P3 — Owner's `modifications/` Folder (merge pending)

- [ ] Copy `public/ashraf_profile.png` → `public/`
- [ ] Merge `src/app/blog/page.tsx` + `[slug]/` — "احجز استشارة" header, Dr. Ashraf author, likes/comments, consultation CTAs
- [ ] Merge `src/app/library-launch/` — landing page + countdown to 31 Jul 2026 + waitlist form
- [ ] Merge `src/app/api/library-waitlist/` — Supabase insert + WhatsApp notify
- [ ] Merge `src/components/FloatingButtons.tsx` + `DraftDrawer.tsx` — accordion, smart copy, productivity features, folder content buttons, notes list/grid toggle
- [ ] Merge full `src/app/settings/` tab set (17 tabs)
- [ ] Run migration `20260711_library_waitlist.sql`
- [ ] Add env vars `WHATSAPP_ADMIN_NUMBER`, `WHATSAPP_WEBHOOK_URL`

---

## 🟡 P4 — Admin Subscriptions Spec (`modifications/specs_admin_subscriptions.md`)

- [ ] Subscription extension — individual + collective bulk-extend
- [ ] Temporary free access — global (`system_configs.global_free_until`) + selective (`laws.free_until`)
- [ ] Compensation logic — auto-extend when global free enabled
- [ ] UI — Free Access Control Panel, Bulk Extension Modal, Audit Logs

---

## 🟡 P5 — Routing & UX Fixes

- [ ] Lawyer "upgrade package" → `/settings?tab=subscription` (not `/pricing`)
- [ ] Client "subscribe now" → package upgrade page (not wallet)
- [ ] Client "my plan" sidebar → subscription details
- [ ] Lawyer sidebar "سؤال قانوني سريع" → `/ai/assistant` (not `/ai/consult`)
- [ ] Block lawyers from `/ai/consult`
- [ ] Restrict `EscalationFlow` card to `userType === 'individual'`
- [ ] Filter `/pricing` packages by logged-in user type
- [ ] Entitlements direct-grant page: default user list, audit, filters
- [ ] Audit log: real admin name, user-type filter, user-ID search
- [ ] Hide WhatsApp widget for admins
- [ ] Coupons: "Select All" roles, delete/archive/schedule, admin-identity
- [ ] Broadcasts: add "individuals/clients" audience + fix delivery
- [ ] Community: sync approved posts to `/community`
- [ ] Payments log: fix overlap, user-type tabs, recurring indicator, charts
- [ ] Partners: fix dead "تعرف على المزيد" links, real Saudi phone validation
- [ ] Blog admin: categories, analytics, Meta Pixel/GA4/GTM, markdown bulk-uploader, add `/blog` to lawyer sidebar
- [ ] Notifications: wire to real server-side system
- [ ] Event Mapper — translate raw events into Arabic titles
- [ ] Court dropdown — all courts + quasi-judicial committees + "Other"
- [ ] Smart folders UI — fix vertical compression + clipped form
- [ ] Gamification meter — wire to real reading activity
- [ ] Remove orange beta banner from `/dashboard/client/consultation/new`
- [ ] Fix mobile menu overlap on `/laws`
- [ ] Real NZAMY logo (replace placeholder "ن")
- [ ] Remove legal-library from client sidebar; fix settings sidebar duplication
- [ ] Fix dark-mode subtext contrast
- [ ] Link activity-log cards to cases/clients
- [ ] Hide `LegalMail` for solo lawyers
- [ ] Auto-refresh dashboard after adds
- [ ] Make tracker cards clickable
- [ ] Wrap research-collector in `DashboardLayout`
- [ ] Trim contract-review grid to 4–5 + Other + Show more
- [ ] Build merged "Smart Audio" tool
- [ ] DB-driven subscription tab
- [ ] Gate time-tracker billing to hourly cases
- [ ] Case finance-structure fields
- [ ] Hide lawyer personal contact from public profile
- [x] ~~Persist smart folders to Supabase~~ — ✅ DONE (2026-07-16): SmartFolders wired to `/api/library/folders` API, dual-mode (API for auth, localStorage for guest). **Notes/drafts still pending.**

---

## 🟡 P6 — Static Analysis / SEO / Performance (9 remaining of 13)

- [x] ~~**A3 — In-memory search bypass**~~ — ✅ DONE (2026-07-16): Server-side FTS search implemented via `POST /api/library/search`, pagination with "Load More" buttons added. No longer loads all data into memory.
- [ ] **Q1 — Silent `.catch(()=>{})` sweep** — `chatService`, `documentService`, `groupService` still have mock fallbacks
- [ ] **U1+SE1 — FOUC + crawler language** — server hardcodes `<html lang="ar" dir="rtl">`, client JS flips → FOUC + crawler mismatch
- [ ] **SE3 — Static blog sitemap** — `sitemap.ts:19-20` hardcoded URL → dynamic query of `articles`
- [ ] **SE2 — No JSON-LD** → add `LegalService` schema to homepage
- [ ] **Q2 — 2,000+ hardcoded `#0B3D2E`** → theme token (breaks dark mode + rebrand)
- [ ] **Q3 — Google Fonts via `<link>`** → `next/font/google` migration
- [ ] **U2 — CSS `text-align` overrides** — load-bearing with 261 usages across 136 files → needs full `text-start`/`text-end` migration
- [ ] **N1 — Arabic normalization regression** — `الإثبات`↔`الاثبات`, `١٤٤٤`↔`1444` not normalized → needs real Arabic FTS config

---

## 🔵 AI Tools — Fake `setTimeout` Mocks (8 surfaces still fabricating output)

> **Critical:** These AI pages return hardcoded/fake results via `setTimeout` — NOT gated by n8n dispatch. Must be replaced with "قريباً / قيد التفعيل" or wired to real n8n webhooks.

| Surface | File | Line | What It Does |
|---|---|---|---|
| `/ai/consult` | `ai/consult/page.tsx` | L200 | `getMockResponse()` — fake legal consultation |
| `/ai/assistant` | `ai/assistant/page.tsx` | L365-367 | `setTimeout` + `getMockResponse()` |
| `/ai/analyze` | `ai/analyze/_components/SmartAnalyzer.tsx` | L212 | `buildEvalReport()` after `setTimeout(2200)` |
| `/ai/analyze-strength` | `ai/analyze-strength/page.tsx` | L49 | `setTimeout` → canned output |
| `/ai/brief-check` | `ai/brief-check/page.tsx` | L68 | `setTimeout` → canned output |
| `/ai/case-brief` | `ai/case-brief/page.tsx` | L177 | `setTimeout` → canned output |
| `/ai/communicate` | `ai/communicate/page.tsx` | L66 | `setTimeout` → canned output |
| `/ai/compare` | `ai/compare/_result-view.tsx` | L170 | Hardcoded Arabic comparison result |

**Only `/api/ai/library-chat` is honestly n8n-gated** — returns "قريباً" when `N8N_LIBRARY_CHAT_WEBHOOK_URL` is unset.

---

## 🔵 n8n Workflows — Section A: BUILD NOW (0/7 built)

> **Status:** Trigger layer is code-complete (`/api/v1/n8n/trigger` + `payload.ts` + `events.ts`). 7 JSON templates exist in `n8n/workflows/` but are **NOT imported or hosted anywhere.** No n8n instance is running.

### Prerequisites (before any workflow)
- [ ] Host n8n instance (self-hosted or n8n.cloud)
- [ ] Connect n8n to Supabase (Postgres node or HTTP + service role key)
- [ ] Set `N8N_WEBHOOK_URL` in `.env.local`
- [ ] Set `N8N_API_KEY` in `.env.local`
- [ ] Configure Evolution API webhook → n8n receives WhatsApp messages
- [ ] Create email templates: `welcome` + `request-received` + `request-assigned` + `review-request`

### A1. Welcome Email + WhatsApp (~2h)
- [ ] Build `welcome` email template (Arabic)
- [ ] Create Supabase DB webhook on `profiles` → INSERT
- [ ] Create n8n workflow: webhook → fetch user → email → WhatsApp
- [ ] Handle: no phone → skip WhatsApp

### A2. New Service Request → Notify Lawyers (~4h)
- [ ] Build `request-received` email template
- [ ] Create Supabase webhook on `service_requests` → INSERT
- [ ] Create n8n workflow: fetch request → find matching lawyers → email/WhatsApp/notification → confirm to client

### A3. Request Assigned → Notify Client (~2h)
- [ ] Build `request-assigned` email template
- [ ] Create Supabase webhook on `service_requests` → UPDATE (`status = 'assigned'`)
- [ ] Create n8n workflow

### A4. Request Completed + Review (~3h)
- [ ] Build `review-request` email template
- [ ] Create webhook on `service_requests` → UPDATE (`status = 'completed'`)
- [ ] Create n8n workflow with 24h delay node → send review request

### A5. Lawyer Verification (~3h)
- [ ] Create webhook on `lawyer_profiles` → INSERT
- [ ] Create n8n workflow: notify admin → wait approval → update `is_verified` → confirm to lawyer

### A6. Consultation Reminder (~3h)
- [ ] Add `reminder_sent` + `reminder_1h_sent` columns to `consultations`
- [ ] Create n8n cron workflow (every 30 min): 24h + 1h reminders via email + WhatsApp

### A7. WhatsApp Service Triage (~5h)
- [ ] Create `/api/v1/whatsapp/webhook` POST endpoint
- [ ] Configure Evolution API → n8n
- [ ] Create n8n workflow with AI intent classification (consultation/request/inquiry/complaint)
- [ ] Map intents to Supabase inserts + send WhatsApp confirmation reply

**Section A Total: ~18-25h | 7 workflows + 4 email templates**

---

## 🔵 n8n Workflows — Section B: BUILD LATER (0/11 built)

### Operational (ready to build, not blocking launch)
- [ ] **B1. Request Escalation** — cron hourly: pending > 48h → escalate + notify admin
- [ ] **B2. Hearing Reminder** — cron 30min: upcoming hearings → remind both parties
- [ ] **B3. Firm Onboarding** — webhook on `firm_profiles` INSERT → welcome + notify admin
- [ ] **B4. Provider Verification** — webhook on `provider_profiles` INSERT → same pattern as A5
- [ ] **B5. Daily Admin Digest** — cron 8AM: aggregate stats → email admin
- [ ] **B6. Content Moderation (AI)** — webhook on `community_posts` → AI spam/offensive check → flag
- [ ] **B7. Security Alert** — Auth webhook: 5+ failed logins → alert admin

### Billing (blocked by payment gateway — Phase 3)
- [ ] **B8. Payment Success** — webhook on `payments` INSERT → receipt email + PDF invoice
- [ ] **B9. Subscription Renewal Reminder** — cron 9AM: expiring in 3 days → remind
- [ ] **B10. Credit Expiry Warning** — cron 9AM: credits expiring in 7 days → warn
- [ ] **B11. Invoice Generation** — webhook on `payments` INSERT → generate PDF → upload to Storage

### Remaining Email Templates (5)
- [ ] `verify-email` (Supabase handles natively)
- [ ] `password-reset` (Supabase handles natively)
- [ ] `payment-receipt` (Phase 3)
- [ ] `subscription-expiring` (Phase 3)
- [ ] `credit-low` (Phase 3)

---

## 🟣 P7 — Product Backlog (post-beta, 5-wave order)

### Wave 1 — Unlock money & trust
- [ ] **Payments gateway** — pick Moyasar/Tap/HyperPay; checkout + webhook + ledger
- [ ] **Provider document upload + verification** + wire admin verification pages
- [ ] **Force supabase mode in production** — kill demo/localStorage fake-session
- [ ] **In-app notifications table** — verify inserts are live after P0 deploy

### Wave 2 — Wire "schema built, client never wired"
- [x] ~~Migrate localStorage → Smart Folders~~ — ✅ DONE (2026-07-16): SmartFolders wired to Supabase API with dual-mode (auth/guest)
- [ ] Migrate localStorage → remaining tables: Community, Research Collector, Client Groups, Draft Cart, sticky notes
- [ ] Contact form real submission + shared document review real token/passcode/approve
- [ ] Client documents storage (enable bucket) + wallet/referral/finance population + payout wiring
- [ ] E-signature flow on contracts — real capture + audit trail

### Wave 3 — Content system
- [x] ~~Blog CMS — verify `articles` table is live + add categories/analytics/tracking~~ — ✅ DONE (2026-07-16): Blog CMS implemented with DB-driven articles schema (31 fields), storage bucket covers, server JSON-LD + metadata, GFM-alert renderer, and blog-toolkit CLI. (Analytics and Meta Pixel/GA4 integrations remain in P5).
- [ ] **Academy LMS** — courses/sections/lessons/enrollments/progress/quiz/certificates + media hosting (**largest single effort**)
- [ ] Media library table + asset hosting + subscription wired to payments
- [x] ~~Library corpus seeding~~ — ✅ DONE (2026-07-16): `library-toolkit/` created with full parse→seed→verify pipeline (6 CLI commands: parse, seed, clear, verify, status, reseed). Demo-slug fallbacks replaced with DB queries.

### Wave 4 — Admin console persistence
- [ ] Admin financial ops (escrow/disputes/payouts/revenue)
- [ ] Content, tickets, team/RBAC, audit log, AI-usage

### Wave 5 — Sector expansion (lift `BETA_MONOPOLY_MODE`)
- [ ] Build sector-scoped tables: micro + business first, then firm, provider, ngo, government (~116 mock pages)
- [ ] Secondary lawyer growth features (network, promotions, secondment, reviews, celebrity rewards)
- [ ] i18n / English layer (next-intl; `titleEn` fields already exist)

---

## 📊 Summary

| Category | Done | Remaining | Notes |
|---|---|---|---|
| P0 Security | 5/5 ✅ | 0 | Shipped in `bfb3a5f` |
| P1 Security (remaining) | 4/8 ✅ | 4 | IDOR, rate-limits, role-switcher |
| P2 Owner Blocking | 4/12 ✅ | 7 | Upgrade buttons, referral, groups, broadcasts, community, payments UI, find-lawyer |
| P3 Modifications Merge | 0 | 8 items | Owner-prepared code in `test/modifications/` |
| P4 Admin Subscriptions | 0 | 4 items | Spec ready in `modifications/specs_admin_subscriptions.md` |
| P5 Routing/UX | 2 ✅ | ~35 items | Largest category of small fixes |
| P6 Static Analysis | 4/13 ✅ | 9 | SEO, fonts, Arabic FTS, brand colors |
| AI Mock Cleanup | 0 | 8 surfaces | Replace `setTimeout` fakes with "قريباً" |
| n8n Section A (NOW) | 0/7 | 7 workflows + 4 templates | ~18-25h, blocks client↔lawyer launch |
| n8n Section B (LATER) | 0/11 | 11 workflows + 5 templates | 7 ready, 4 blocked by payments |
| P7 Backlog (5 waves) | 3 ✅ | ~17 remaining | Post-beta, gated by payments + content |
| **TOTAL** | **~19 done** | **~97 remaining** | |
