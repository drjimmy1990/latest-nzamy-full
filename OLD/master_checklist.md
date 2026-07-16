# ✅ Nzamy (نظامي) — Master Checklist

> **Last Updated**: 2026-06-23 (Post Onboarding Redirect Fixes)
> **Purpose**: Every deliverable across all 6 phases, with checkboxes and details.
> Legend: `[x]` = Done · `[ ]` = Not started · `[/]` = In progress

---

## 📦 Phase 1 — Foundation (Auth + DB + SDK) ✅ 100%

### 1A — Database Schema (47 new tables)
- [x] Write `001_profiles.sql` — `profiles`, `lawyer_profiles`, `provider_profiles`, `micro_profiles` + auto-signup trigger
- [x] Write `002_entities.sql` — `firm_profiles`, `business_profiles`, `government_profiles`, `ngo_profiles` + RBAC membership tables (8 tables)
- [x] Write `003_subscriptions_billing.sql` — `subscription_plans`, `subscriptions`, `credit_packages`, `credit_transactions`, `coupons`, `escrow_transactions` (8 tables + seed data)
- [x] Write `004_community_features.sql` — Community Q&A, groups, real-time chat, research sessions, user_settings (14 tables)
- [x] Write `005_advanced_features.sql` — Marketplace, secondment, reviews, audit log, feature flags (13 tables + 9 jurisdiction seeds)
- [x] Execute all 5 migration files in Supabase SQL Editor ✅ **User confirmed executed**

### 1B — Supabase SDK Setup
- [x] Install `@supabase/supabase-js` and `@supabase/ssr`
- [x] Create `src/lib/supabase/client.ts` — Browser-side Supabase client (cookie sessions)
- [x] Create `src/lib/supabase/server.ts` — Server client (SSR) + Admin service client
- [x] Create `src/lib/supabase/middleware.ts` — Auth session refresh helper
- [x] Create `src/lib/supabase/index.ts` — Barrel export
- [x] Create `src/types/database.ts` — TypeScript types for all 58 tables (557 lines)
- [x] Create `.env.example` — All environment variables documented

### 1C — Authentication Overhaul (Dual-Mode)
- [x] Create `src/proxy.ts` — Next.js 16 proxy with dual-mode auth (Supabase SSR + demo cookies)
- [x] Migrate `middleware.ts` → `proxy.ts` (Next.js 16 requires proxy, not middleware)
- [x] Delete old `src/middleware.ts`
- [x] Modify `src/hooks/useUser.ts` — `mapSupabaseUser()`, real-time `onAuthStateChange`, dual-mode `logout()`
- [x] Modify `src/app/login/page.tsx` — `signInWithPassword` (email/phone) + Google OAuth
- [x] Create `src/app/auth/callback/route.ts` — OAuth code exchange → dashboard redirect
- [x] Wire `src/app/register/client/page.tsx` → `supabase.auth.signUp()`
- [x] Wire `src/app/register/provider/page.tsx` → `supabase.auth.signUp()` + Google OAuth
- [x] Wire `src/app/onboarding/page.tsx` → `updateUser({ data: { onboarding_completed: true } })`

### 1D — Core API Routes (3 endpoints)
- [x] Create `/api/v1/profile` — GET + PATCH
- [x] Create `/api/v1/notifications` — GET + PATCH
- [x] Create `/api/v1/settings` — GET + PUT

### 1E — Verification
- [x] `tsc --noEmit` — 0 errors
- [x] `next build` — succeeds
- [x] Git commit: `feat: Phase 1A+1B` (hash: `0301325`)
- [x] Git commit: `feat: Phase 1C+1D` (hash: `9a1b798`)

---

## 📦 Phase 2 — Core Backend (localStorage → Supabase) ✅ 100%

### 2A — API Routes (22 endpoints)
- [x] `/api/v1/service-requests` — GET + POST
- [x] `/api/v1/service-requests/[id]` — GET + PATCH
- [x] `/api/v1/service-requests/[id]/events` — GET + POST
- [x] `/api/v1/community/posts` — GET + POST
- [x] `/api/v1/community/posts/[id]` — GET + PATCH
- [x] `/api/v1/community/posts/[id]/answers` — POST
- [x] `/api/v1/community/posts/[id]/vote` — POST (upsert)
- [x] `/api/v1/groups` — GET + POST
- [x] `/api/v1/groups/[id]` — GET + PATCH + DELETE
- [x] `/api/v1/groups/[id]/members` — GET + DELETE
- [x] `/api/v1/groups/[id]/invite` — POST
- [x] `/api/v1/research/sessions` — GET + POST
- [x] `/api/v1/research/sessions/[id]` — GET + PATCH + DELETE
- [x] `/api/v1/research/sessions/[id]/items` — GET + POST
- [x] `/api/v1/research/desktop` — GET + POST + DELETE
- [x] `/api/v1/drafts/cart` — GET + PUT
- [x] `/api/v1/cases` — GET
- [x] `/api/v1/cases/[id]` — GET
- [x] `/api/v1/consultations` — GET + POST
- [x] `/api/v1/consultations/[id]` — GET + PATCH
- [x] `/api/v1/chat/rooms` — GET + POST
- [x] `/api/v1/chat/rooms/[id]/messages` — GET + POST

### 2B — Dual-Mode Service Layer (8 services)
- [x] `src/lib/services/api.ts` — Base helpers: `apiGet`, `apiMutate`, `dualMode`, `isSupabaseMode`
- [x] `src/lib/services/notificationService.ts` — wraps `notificationsStore` → `/api/v1/notifications`
- [x] `src/lib/services/communityService.ts` — wraps `communityStore` → `/api/v1/community/posts`
- [x] `src/lib/services/groupService.ts` — wraps `clientGroupStore` → `/api/v1/groups`
- [x] `src/lib/services/casesService.ts` — wraps `casesStore` → `/api/v1/cases`
- [x] `src/lib/services/chatService.ts` — new service → `/api/v1/chat/rooms`
- [x] `src/lib/services/researchService.ts` — wraps `draftInboxStore` → `/api/v1/research/*` (22+ functions)
- [x] `src/lib/services/workflowService.ts` — wraps `workflowStore` → `/api/v1/service-requests`
- [x] `src/lib/services/index.ts` — barrel export for all 8 services

### 2C — Realtime Hooks (2 hooks)
- [x] `src/hooks/useNotifications.ts` — Realtime subscription on `notifications` table
- [x] `src/hooks/useChat.ts` — Realtime subscription on `chat_messages` table

### 2D — Component Integration (Client Flow)
- [x] `Navbar.tsx` — notification bell → `useNotifications` hook
- [x] `useClientGroupMembership.ts` → `groupService.getGroupState()`
- [x] `useDraftCart.ts` → API `PUT/GET` in supabase mode
- [x] `community/page.tsx` → `communityService.getCommunityPosts()`
- [x] `community/ask/page.tsx` → `communityService.createCommunityPost()`
- [x] `community/[id]/page.tsx` → `communityService.getCommunityPost()` + `addCommunityAnswer()`
- [x] `client/my-group/page.tsx` → `groupService.createGroup()`
- [x] `clientWorkflowRepository.ts` — already dual-mode (built-in `BACKEND_ENABLED` flag)

### 2D — Component Integration (Lawyer Flow)
- [x] `lawyer/cases/page.tsx` → `workflowService.getWorkflowRequestsByReceiver("lawyer")` (sync→async)
- [x] `lawyer/consultations/page.tsx` → `workflowService.getWorkflowRequestsByReceiver("lawyer")` (sync→async)
- [x] `lawyer/tasks/page.tsx` → `casesService.getActiveCases()` (sync→async)

### 2D — Component Integration (AI/Research Tools — 9 files)
- [x] `ai/analyze/_components/AttachmentSqueezer.tsx` → `researchService` (addToDesktop, addToSession, getActiveSessions, createSession)
- [x] `ai/collector/_components/DesktopPanel.tsx` → `researchService`
- [x] `ai/collector/_components/SessionsPanel.tsx` → `researchService`
- [x] `ai/collector/page.tsx` → `researchService` (kept `runAutoArchive` from store — not in service)
- [x] `ai/direction-support/page.tsx` → `researchService` (addToInbox)
- [x] `ai/legal-opinion/_components/CrossExamResultView.tsx` → `researchService` (addToDesktop, addToSession, getActiveSessions)
- [x] `ai/legal-opinion/_components/ResultView.tsx` → `researchService` (addToInbox)
- [x] `components/AiResultActions.tsx` → `researchService` (addToInbox)
- [x] `components/draft/steps/StepLaws.tsx` → `researchService`

### 2E — Verification
- [x] `tsc --noEmit` — 0 errors ✅
- [x] `next build` — succeeds ✅ (all pages compile)
- [x] All 8 localStorage stores have dual-mode service wrappers ✅
- [x] All client dashboard pages wired to services ✅
- [x] All lawyer dashboard pages wired to services ✅
- [x] All AI/research tool pages wired to services ✅
- [x] Middleware → Proxy migration (Next.js 16 compat) ✅

---

## 📦 Phase 2.5 — Dashboard Mock→Real Migration ✅ 100%

### 2.5A — New API Routes (4 endpoints)
- [x] `/api/v1/lawyers` — GET (public, with filters: specialty, city, sort, available)
- [x] `/api/v1/lawyers/[id]` — GET (public, single lawyer profile)
- [x] `/api/v1/documents` — GET + POST (auth required)
- [x] `/api/v1/dashboard/summary` — GET (auth, 7 parallel sub-queries)

### 2.5B — New Services (3 dual-mode)
- [x] `lawyerService.ts` — `getLawyers()`, `getLawyerById()` (fallback: MOCK_LAWYERS)
- [x] `documentService.ts` — `getDocuments()`, `uploadDocument()` (fallback: empty)
- [x] `dashboardService.ts` — `getDashboardSummary()` (fallback: free tier defaults)
- [x] `services/index.ts` — updated barrel exports

### 2.5C — Page Migrations (10 pages)
- [x] Main Dashboard `page.tsx` — replaced 6 mock constants → `getDashboardSummary()`
- [x] Cases `cases/page.tsx` — `MOCK_CASES` → `getActiveCases()`
- [x] Consultation `consultation/page.tsx` — `CONSULTATIONS` → `getConsultations()` + workflow
- [x] My Group `my-group/page.tsx` — `GROUP/MEMBERS/ROTATION` → `getGroupState()`
- [x] Messages `messages/page.tsx` — `THREADS` → `useChat()` hook
- [x] Contracts `contracts/page.tsx` — `MOCK_CONTRACTS` → workflow requests only
- [x] Find Lawyer `find-lawyer/page.tsx` — `MOCK_LAWYERS` → `getLawyers()` (with fallback)
- [x] Documents `documents/page.tsx` — `MOCK_DOCS` → `getDocuments()`
- [x] Wallet `wallet/page.tsx` — added "بيانات تجريبية" demo banner (deferred)
- [x] Referral `referral/page.tsx` — added "بيانات تجريبية" demo banner (deferred)

### 2.5D — Skeleton Components
- [x] Create `DashboardSkeleton.tsx` — `SkeletonList`, `SkeletonCard`, `SkeletonThreadList`, `SkeletonMessages`, `DashboardPageSkeleton`

### 2.5E — Cleanup
- [x] Clean `_data.ts` — removed all 6 mock exports, kept `STATUS_COLOR`, `fadeUp`, `ClientCase`

### 2.5F — Verification
- [x] `tsc --noEmit` — 0 errors ✅
- [x] `next build` — succeeds ✅

---

## 📦 Phase 2.5L — Lawyer Dashboard Mock→Real Migration ✅ 100%

### 2.5L-A — New API Routes (5 endpoints)
- [x] `/api/v1/lawyer/dashboard/summary` — GET (aggregated lawyer stats)
- [x] `/api/v1/lawyer/clients` — GET (clients derived from requests)
- [x] `/api/v1/lawyer/tasks` — GET, PATCH (tasks from request_events)
- [x] `/api/v1/lawyer/activity` — GET (combined request_events + audit_log)
- [x] `/api/v1/lawyer/finance` — GET (invoices + wallet transactions)

### 2.5L-B — New Services (4 dual-mode)
- [x] `lawyerDashboardService.ts` — `getLawyerDashboardSummary()` (fallback: empty defaults)
- [x] `lawyerClientsService.ts` — `getLawyerClients()` (fallback: empty array)
- [x] `lawyerTasksService.ts` — `getLawyerTasks()`, `updateLawyerTaskStatus()` (fallback: empty)
- [x] `lawyerActivityService.ts` — `getLawyerActivity()` (fallback: empty array)
- [x] `services/index.ts` — updated barrel exports with 4 new services

### 2.5L-C — Group A: Wire to Real Services (8 pages)
- [x] Main Dashboard — `STATS/TASKS/RECENT_CASES/ACTIVITY_TIMELINE/UPCOMING_DEADLINES` → `lawyerDashboardService`
- [x] Cases — `MOCK_CASES` merge removed → `workflowService` only
- [x] Consultations — `MOCK_CONSULTS` removed → `workflowService` only
- [x] Contracts — `MOCK_CONTRACTS` removed → `workflowService` + `workflowToContract()`
- [x] Documents — `MOCK_DOCS` import removed → `documentService.getDocuments()`
- [x] Tasks — `INIT_TASKS` removed → `lawyerTasksService.getLawyerTasks()`
- [x] Clients — `MOCK_CLIENTS` removed → `lawyerClientsService.getLawyerClients()`
- [x] Hearings — `MOCK_EVENTS` removed → `workflowService` (derived hearing events)

### 2.5L-D — Group B: Real Data + Demo Banners (2 pages)
- [x] Finance — `INVOICES/EXPENSES` → `apiGet('/api/v1/lawyer/finance')` + payment gateway banner
- [x] Profile — `MOCK_PROFILE.name` → `useUser().name` + demo stats banner

### 2.5L-E — Group C: Demo Banner Only (7 pages)
- [x] Analytics — demo banner: "التحليلات ستتوفر تلقائياً بعد استخدام المنصة"
- [x] Network — demo banner: "شبكة العمل والإحالات — قريباً"
- [x] Secondment — demo banner: "نظام الانتداب القانوني — قريباً"
- [x] Promotions — demo banner: "العروض الترويجية — قريباً"
- [x] Archive — demo banner: "الأرشيف سيعرض البيانات الحقيقية قريباً"
- [x] Reviews — demo banner: "التقييمات ستظهر بعد تفعيل نظام التقييم"
- [x] Activity — demo banner: "سجل النشاط سيعرض البيانات الحقيقية تلقائياً"

### 2.5L-F — Verification
- [x] `tsc --noEmit` — 0 errors ✅

---

## 📦 Phase 3 — Payments & Billing ⬜ 0%

### 3A — Payment Gateway Integration
- [ ] Decide on payment provider (Moyasar / Tap / Stripe) — **user decision pending**
- [ ] Create `src/lib/payments/gateway.ts` — abstract `PaymentGateway` interface
- [ ] Implement gateway adapter for chosen provider
- [ ] Create `/api/v1/payments/create-intent` — POST (create payment intent / checkout session)
- [ ] Create `/api/v1/payments/webhook` — POST (payment provider webhook handler)
- [ ] Create `/api/v1/payments/refund` — POST (process refund)
- [ ] Wire payment pages to use payment API

### 3B — Credit System
- [ ] Create `/api/v1/credits/packages` — GET (list available credit packages)
- [ ] Create `/api/v1/credits/purchase` — POST (buy credits → creates `credit_transactions`)
- [ ] Create `/api/v1/credits/balance` — GET (current credit balance)
- [ ] Create `/api/v1/credits/consume` — POST (deduct credits for service usage)
- [ ] Create `/api/v1/credits/history` — GET (transaction ledger)
- [ ] Wire credit balance in Navbar and dashboard
- [ ] Wire credit consumption to service request creation

### 3C — Subscription System
- [ ] Create `/api/v1/subscriptions/plans` — GET (list all plans with features)
- [ ] Create `/api/v1/subscriptions/current` — GET (user's current subscription)
- [ ] Create `/api/v1/subscriptions/subscribe` — POST (start new subscription)
- [ ] Create `/api/v1/subscriptions/cancel` — POST (cancel subscription)
- [ ] Create `/api/v1/subscriptions/webhook` — POST (handle renewal/expiry)
- [ ] Wire pricing page to real subscription data
- [ ] Wire feature gating to subscription tier checks
- [ ] Implement upgrade/downgrade flow in settings

### 3D — Wallet System
- [ ] Create `/api/v1/wallet/balance` — GET (current wallet balance from `wallet_transactions`)
- [ ] Create `/api/v1/wallet/topup` — POST (add funds via payment gateway)
- [ ] Create `/api/v1/wallet/history` — GET (wallet transaction history)
- [ ] Wire wallet balance display in dashboard

### 3E — Escrow (Marketplace)
- [ ] Create `/api/v1/escrow/hold` — POST (hold payment for marketplace order)
- [ ] Create `/api/v1/escrow/release` — POST (release to provider, minus 15% commission)
- [ ] Create `/api/v1/escrow/dispute` — POST (flag order for manual review)
- [ ] Wire escrow flow to marketplace order lifecycle

### 3F — Coupons
- [ ] Create `/api/v1/coupons/validate` — POST (check if coupon code is valid)
- [ ] Create `/api/v1/coupons/redeem` — POST (apply coupon to purchase)
- [ ] Wire coupon input to checkout/subscription pages
- [ ] Replace hardcoded `NZAMY50`/`NEWCLIENT` with real coupon system

---

## 📦 Phase 4 — n8n Automation & Integrations ⬜ 0%

### 4A — n8n Workflows — Onboarding (4)
- [ ] Welcome email workflow — triggered by `profiles` INSERT
- [ ] Lawyer verification workflow — triggered by `lawyer_profiles` INSERT (admin approval)
- [ ] Firm onboarding workflow — triggered by `firm_profiles` INSERT
- [ ] Provider verification workflow — triggered by `provider_profiles` INSERT

### 4B — n8n Workflows — Service Requests (4)
- [ ] New request notification — triggered by `service_requests` INSERT → notify lawyer/provider
- [ ] Request assigned — triggered by `service_requests.status` = 'assigned' → notify client
- [ ] Request completed — triggered by `service_requests.status` = 'completed' → notify + ask review
- [ ] Request escalation — 48h SLA → triggered by cron, notify admin if overdue

### 4C — n8n Workflows — Billing (4)
- [ ] Payment success — triggered by `payments` INSERT → send receipt
- [ ] Subscription renewal — triggered by cron, 3 days before expiry
- [ ] Credit expiry warning — triggered by cron, when credits are about to expire
- [ ] Invoice generation — triggered by payment → generate PDF invoice

### 4D — n8n Workflows — Communication (3)
- [ ] WhatsApp service triage — Evolution API webhook → n8n → parse intent → create `service_requests`
- [ ] Consultation reminder — 24h and 1h before scheduled consultation
- [ ] Hearing reminder — 24h and 1h before court hearing

### 4E — n8n Workflows — Admin (3)
- [ ] Daily admin digest — daily summary of new signups, requests, payments, issues
- [ ] Security alert — triggered by 5+ failed login attempts from same IP
- [ ] Content moderation (AI) — flag community posts for review using AI

### 4F — Email Templates (Arabic-first, 9 templates)
- [ ] `welcome` — Welcome to Nzamy
- [ ] `verify-email` — Verify your email address
- [ ] `password-reset` — Reset your password
- [ ] `request-received` — Your request has been received
- [ ] `request-assigned` — A lawyer has been assigned to your case
- [ ] `payment-receipt` — Payment confirmation
- [ ] `subscription-expiring` — Your subscription is about to expire
- [ ] `credit-low` — Your credits are running low
- [ ] `review-request` — Please review your experience

### 4G — WhatsApp Integration (Evolution API)
- [ ] Create `/api/v1/whatsapp/webhook` — POST (Evolution API webhook receiver)
- [ ] Configure n8n workflow: incoming WhatsApp → parse intent → create service request
- [ ] Wire WhatsApp number display on service pages
- [ ] Test end-to-end: send WhatsApp → n8n processes → service request created

### 4H — n8n Infrastructure
- [ ] Create `N8N_WEBHOOK_URL` and `N8N_API_KEY` env vars
- [ ] Create `/api/v1/n8n/trigger` — POST (generic n8n trigger endpoint)
- [ ] Create Supabase database webhooks for key table events
- [ ] Test all 18 workflows end-to-end

---

## 📦 Phase 5 — Security, Compliance & Beta Teardown ⬜ 0%

### 5A — Server-Side RBAC
- [ ] Create `src/lib/auth/rbac.ts` — `assertUserRole()`, `assertPermission()`, `assertResourceAccess()`
- [ ] Apply RBAC checks to all 25 API routes
- [ ] Enforce user type matching for dashboard API calls
- [ ] Add firm sub-role checks (13 sub-roles)
- [ ] Add provider sub-type checks (notary, arbitrator, bailiff)

### 5B — Input Validation (Zod)
- [ ] Create Zod schemas for all API request bodies
- [ ] Apply validation middleware to all POST/PATCH/PUT routes
- [ ] Sanitize HTML/script injection in community posts, messages, chat
- [ ] Validate file uploads (size, type, extension)

### 5C — Rate Limiting
- [ ] Auth endpoints: 5 requests/minute
- [ ] API endpoints: 100 requests/minute
- [ ] AI tool endpoints: 20 requests/minute
- [ ] File upload endpoints: 10 requests/minute
- [ ] Payment endpoints: 5 requests/minute

### 5D — Beta Teardown (Remove Demo Artifacts)
- [ ] Delete `BETA_MONOPOLY_MODE` flag and all references
- [ ] Delete `BETA_REVIEW_MODE` flag and all references
- [ ] Delete `test-credentials.ts` and `demo-accounts.ts`
- [ ] Delete `BetaReviewGate` component
- [ ] Remove all `demo-login` page
- [ ] Remove all localStorage fallbacks from service layer (make Supabase mandatory)
- [ ] Remove `nzamy_demo_role` cookie handling
- [ ] Remove `nzamy_session` cookie handling (replaced by Supabase auth)

### 5E — Saudi Compliance (PDPL)
- [ ] Configure Supabase for Bahrain region (data residency)
- [ ] Enable encryption at rest for all tables
- [ ] Implement audit log for all user data access (`audit_log` table already exists)
- [ ] Implement right-to-delete (GDPR/PDPL) — cascade delete user data
- [ ] Add privacy policy acceptance tracking
- [ ] Add cookie consent mechanism

---

## 📦 Phase 6 — Deployment, Monitoring & CI/CD ⬜ 0%

### 6A — Production Deployment
- [ ] Set up VPS (user's choice of provider)
- [ ] Install Node.js, PM2, Nginx on VPS
- [ ] Configure Nginx reverse proxy with SSL (Let's Encrypt)
- [ ] Deploy Next.js production build to VPS
- [ ] Configure Supabase Cloud project with production credentials
- [ ] Set all environment variables in production
- [ ] Configure DNS for domain
- [ ] Test production deployment end-to-end

### 6B — Monitoring
- [ ] Set up Sentry for error tracking (client + server)
- [ ] Configure Vercel Analytics (or self-hosted alternative) for Web Vitals
- [ ] Set up Supabase Dashboard monitoring (DB metrics, auth events)
- [ ] Configure alerting for critical errors (email/WhatsApp)
- [ ] Set up uptime monitoring (UptimeRobot or similar)

### 6C — CI/CD Pipeline
- [ ] Create GitHub Actions workflow: `ci.yml`
  - [ ] Step 1: `tsc --noEmit` (type checking)
  - [ ] Step 2: ESLint (linting)
  - [ ] Step 3: Run tests (if any)
  - [ ] Step 4: `next build` (production build)
  - [ ] Step 5: Deploy to VPS (SSH + rsync or Docker)
- [ ] Add branch protection rules (require CI pass before merge)
- [ ] Add PR template with checklist

### 6D — SEO & Performance
- [ ] Verify `sitemap.xml` includes all public pages
- [ ] Verify `robots.txt` blocks admin/dashboard routes
- [ ] Run Lighthouse audit — target: 90+ on all categories
- [ ] Analyze bundle size and optimize (code splitting, lazy loading)
- [ ] Verify image optimization (AVIF/WebP already configured)
- [ ] Add structured data (JSON-LD) for lawyer profiles, services
- [ ] Add Arabic-first meta descriptions for all public pages

### 6E — Documentation
- [ ] Write deployment guide (step-by-step for VPS)
- [ ] Write admin guide (managing users, subscriptions, content)
- [ ] Write developer onboarding guide
- [ ] Document all API endpoints (OpenAPI/Swagger spec)
- [ ] Document n8n workflow configurations

---

## 📊 Summary

| Phase | Status | Items Done | Items Remaining |
|-------|--------|-----------|----------------|
| **Phase 1** | ✅ 100% | 28/28 | 0 |
| **Phase 2** | ✅ 100% | 54/54 | 0 |
| **Phase 2.5** | ✅ 100% | 20/20 | 0 |
| **Phase 2.5L** | ✅ 100% | 35/35 | 0 |
| **Phase 3** | ⬜ 0% | 0/25 | 25 |
| **Phase 4** | ⬜ 0% | 0/32 | 32 |
| **Phase 5** | ⬜ 0% | 0/22 | 22 |
| **Phase 6** | ⬜ 0% | 0/23 | 23 |
| **TOTAL** | | **137/239** | **102** |
