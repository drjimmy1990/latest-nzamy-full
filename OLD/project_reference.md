# 📋 Nzamy (نظامي) — Project Reference

> **Last Updated**: 2026-06-05 (Post Lawyer Dashboard Migration)
> **Purpose**: Single source of truth for the Nzamy production readiness project. Covers what's done, what's pending, and what's planned across all 6 phases.

---

## 📊 Overall Progress

```
Phase 1   ████████████████████ 100% — Foundation (Auth + DB + SDK) ✅
Phase 2   ████████████████████ 100% — Core Backend (localStorage → Supabase) ✅
Phase 2.5 ████████████████████ 100% — Client Dashboard Mock→Real Migration ✅
Phase 2.5L████████████████████ 100% — Lawyer Dashboard Mock→Real Migration ✅
Phase 3   ░░░░░░░░░░░░░░░░░░░░   0% — Payments & Billing
Phase 4   ░░░░░░░░░░░░░░░░░░░░   0% — n8n Automation & Integrations
Phase 5   ░░░░░░░░░░░░░░░░░░░░   0% — Security & Beta Teardown
Phase 6   ░░░░░░░░░░░░░░░░░░░░   0% — Deployment & Monitoring
```

---

## 🔑 User Decisions (Confirmed)

These decisions were made during planning and **are locked in**:

| Decision | Answer | Notes |
|----------|--------|-------|
| **Payment Gateway** | ❓ **Not decided yet** | User said: *"iam not very sure about the payment procidor yet"* |
| **Supabase Hosting** | ☁️ **Cloud for now, self-hosted later** | *"will be cloud until all things ready and then i will use selfhosted supabase"* |
| **n8n Hosting** | 🏠 **Self-hosted** | *"i have my own n8n"* |
| **WhatsApp API** | 📱 **Evolution API** | *"i will use evolution api, and i have already deployed"* |
| **Deployment Target** | 🖥️ **Own VPS** | *"i will deploy on my vps for now"* |
| **AI Provider** | 🤖 **Via n8n** | *"any ai will be in n8n"* |
| **International Expansion** | 🌍 **From the beginning** | *"yes better be from the beginning"* |
| **Multi-tenancy** | 🔒 **Row-level isolation** | Via `firm_id` FKs and RLS |
| **Real-time Chat** | 💬 **From the beginning** | *"make that from the beginning better"* |

---

## ✅ Phase 1 — Foundation (COMPLETE)

### Phase 1A — SQL Migrations ✅ EXECUTED

Created **5 migration files** adding **47 new tables** (total: 58 with 11 pre-existing). **All migrations executed by user.**

| File | Tables | Highlights |
|------|--------|------------|
| [001_profiles.sql](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/supabase/migrations/20260603_phase1_001_profiles.sql) | 4 | `profiles`, `lawyer_profiles`, `provider_profiles`, `micro_profiles` + auto-signup trigger |
| [002_entities.sql](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/supabase/migrations/20260603_phase1_002_entities.sql) | 8 | `firm_profiles`, `business_profiles`, `government_profiles`, `ngo_profiles` + RBAC membership tables |
| [003_subscriptions_billing.sql](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/supabase/migrations/20260603_phase1_003_subscriptions_billing.sql) | 8 | `subscription_plans`, `subscriptions`, `credit_packages`, `credit_transactions`, `coupons`, `escrow_transactions` + **seed data** |
| [004_community_features.sql](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/supabase/migrations/20260603_phase1_004_community_features.sql) | 14 | Community Q&A, groups, **real-time chat** (`chat_rooms`, `chat_messages`, `chat_participants`), research sessions, `user_settings` |
| [005_advanced_features.sql](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/supabase/migrations/20260603_phase1_005_advanced_features.sql) | 13 | Marketplace, secondment, reviews, audit log, feature flags, `admin_jurisdictions` (9 countries seeded) |

**Pre-existing tables (11)** — from [20260518_client_workflow_backend_ready.sql](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/supabase/migrations/20260518_client_workflow_backend_ready.sql):
`service_requests`, `request_events`, `payments`, `attachments`, `consultations`, `cases`, `contracts`, `messages`, `admin_pricing_catalog`, `wallet_transactions`, `notifications`

---

### Phase 1B — Supabase SDK Setup ✅

| File | Purpose |
|------|---------|
| [client.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/supabase/client.ts) | Browser-side Supabase client (cookie-based sessions) |
| [server.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/supabase/server.ts) | Server client (SSR) + Admin service client |
| [middleware.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/supabase/middleware.ts) | Auth session refresh helper |
| [index.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/supabase/index.ts) | Barrel export |
| [database.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/types/database.ts) | TypeScript types for all 58 tables (557 lines) |
| [.env.example](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/.env.example) | All environment variables documented |

**NPM packages added**: `@supabase/supabase-js`, `@supabase/ssr`

---

### Phase 1C — Authentication Overhaul ✅

**Architecture: Dual-Mode** — Everything controlled by `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND`:
- `"demo"` (default) → Existing localStorage/cookie demo system (zero breakage)
- `"supabase"` → Real Supabase Auth sessions, RLS-enforced queries

| File | Change | What It Does |
|------|--------|-------------|
| [proxy.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/proxy.ts) | **NEW** (migrated from middleware.ts) | Next.js 16 proxy: session refresh, protected routes, RBAC per dashboard, onboarding redirect |
| [useUser.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/hooks/useUser.ts) | **MODIFIED** | `mapSupabaseUser()` maps Supabase user → `UserSession` shape; real-time `onAuthStateChange`; dual-mode `logout()` |
| [login/page.tsx](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/login/page.tsx) | **MODIFIED** | `signInWithPassword` (email/phone) + Google OAuth via `signInWithOAuth` |
| [auth/callback/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/auth/callback/route.ts) | **NEW** | OAuth code exchange → dashboard redirect |
| [register/client/page.tsx](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/register/client/page.tsx) | **MODIFIED** | Wired to `supabase.auth.signUp()` |
| [register/provider/page.tsx](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/register/provider/page.tsx) | **MODIFIED** | Wired to `supabase.auth.signUp()` + Google OAuth |
| [onboarding/page.tsx](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/onboarding/page.tsx) | **MODIFIED** | Wired to `updateUser({ data: { onboarding_completed: true } })` |

---

### Phase 1D — Core API Routes ✅

| Route | Methods | File |
|-------|---------|------|
| `/api/v1/profile` | `GET`, `PATCH` | [profile/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/profile/route.ts) |
| `/api/v1/notifications` | `GET`, `PATCH` | [notifications/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/notifications/route.ts) |
| `/api/v1/settings` | `GET`, `PUT` | [settings/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/settings/route.ts) |

---

## ✅ Phase 2 — Core Backend (COMPLETE)

### Phase 2A — Full API Routes (22 endpoints) ✅

All under `src/app/api/v1/` with Supabase SSR auth.

| Route | Methods |
|-------|---------|
| `/api/v1/service-requests` | GET, POST |
| `/api/v1/service-requests/[id]` | GET, PATCH |
| `/api/v1/service-requests/[id]/events` | GET, POST |
| `/api/v1/community/posts` | GET, POST |
| `/api/v1/community/posts/[id]` | GET, PATCH |
| `/api/v1/community/posts/[id]/answers` | POST |
| `/api/v1/community/posts/[id]/vote` | POST (upsert) |
| `/api/v1/groups` | GET, POST |
| `/api/v1/groups/[id]` | GET, PATCH, DELETE |
| `/api/v1/groups/[id]/members` | GET, DELETE |
| `/api/v1/groups/[id]/invite` | POST |
| `/api/v1/research/sessions` | GET, POST |
| `/api/v1/research/sessions/[id]` | GET, PATCH, DELETE |
| `/api/v1/research/sessions/[id]/items` | GET, POST |
| `/api/v1/research/desktop` | GET, POST, DELETE |
| `/api/v1/drafts/cart` | GET, PUT |
| `/api/v1/cases` | GET |
| `/api/v1/cases/[id]` | GET |
| `/api/v1/consultations` | GET, POST |
| `/api/v1/consultations/[id]` | GET, PATCH |
| `/api/v1/chat/rooms` | GET, POST |
| `/api/v1/chat/rooms/[id]/messages` | GET, POST |

---

### Phase 2B — Dual-Mode Service Layer (8 services) ✅

Every service checks `isSupabaseMode`: in production it calls API routes → Supabase; in demo it falls back to localStorage stores.

| Service | Wraps | Key Functions |
|---------|-------|---------------|
| [api.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/api.ts) | — | `apiGet`, `apiMutate`, `dualMode`, `isSupabaseMode` |
| [notificationService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/notificationService.ts) | `notificationsStore` | getNotifications, markRead, markAllRead |
| [communityService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/communityService.ts) | `communityStore` | getCommunityPosts, getCommunityPost, createCommunityPost, addCommunityAnswer, voteCommunityPost |
| [groupService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/groupService.ts) | `clientGroupStore` | getGroupState, createGroup, updateGroup, inviteMember, removeMember |
| [casesService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/casesService.ts) | `casesStore` | getActiveCases, getCaseById |
| [chatService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/chatService.ts) | — (new) | getChatRooms, getChatMessages, sendChatMessage, createRoom |
| [researchService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/researchService.ts) | `draftInboxStore` | 22+ functions (sessions, desktop, inbox, CRUD) |
| [workflowService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/workflowService.ts) | `workflowStore` | getWorkflowRequestsByReceiver, getWorkflowRequestById |
| [index.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/index.ts) | — | Barrel export for all services |

---

### Phase 2C — Realtime Hooks ✅

| Hook | Table | Purpose |
|------|-------|---------|
| [useNotifications.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/hooks/useNotifications.ts) | `notifications` | Live notification bell updates |
| [useChat.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/hooks/useChat.ts) | `chat_messages` | Real-time chat messages |

---

### Phase 2D — Component Integration ✅

All UI components now use the service layer instead of raw localStorage stores.

**Client Dashboard** — community, groups, notifications, draft cart
**Lawyer Dashboard** — cases, consultations, tasks
**AI/Research Tools** — 9 files migrated from `draftInboxStore` to `researchService`
**Pre-existing dual-mode** — `clientWorkflowRepository.ts` (built-in `BACKEND_ENABLED` flag)

---

### Phase 2E — Verification ✅

| Check | Result |
|-------|--------|
| `tsc --noEmit` | **0 errors** ✅ |
| `next build` | **Succeeds** ✅ |
| Store migration coverage | **8/8 stores** wrapped ✅ |
| Component migration coverage | **All flows** wired ✅ |
| Middleware → Proxy migration | Done (Next.js 16 compat) ✅ |

---

## ✅ Phase 2.5 — Client Dashboard Mock→Real Migration (COMPLETE)

> Replaced all hardcoded mock data in 10 client dashboard pages with real service calls.

### Phase 2.5A — New API Routes (4 endpoints) ✅

| Route | Methods | Auth | File |
|-------|---------|------|------|
| `/api/v1/lawyers` | GET | Public | [lawyers/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyers/route.ts) |
| `/api/v1/lawyers/[id]` | GET | Public | [lawyers/[id]/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyers/%5Bid%5D/route.ts) |
| `/api/v1/documents` | GET, POST | Auth | [documents/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/documents/route.ts) |
| `/api/v1/dashboard/summary` | GET | Auth | [dashboard/summary/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/dashboard/summary/route.ts) |

### Phase 2.5B — New Services (3 dual-mode) ✅

| Service | Functions | Demo Fallback |
|---------|-----------|---------------|
| [lawyerService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/lawyerService.ts) | `getLawyers()`, `getLawyerById()` | `MOCK_LAWYERS` from `find-lawyer/data.ts` |
| [documentService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/documentService.ts) | `getDocuments()`, `uploadDocument()` | Empty array |
| [dashboardService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/dashboardService.ts) | `getDashboardSummary()` | Free tier defaults |

### Phase 2.5C — Page Migrations (10 pages) ✅

| Page | Mock Removed | Data Source |
|------|-------------|-------------|
| Main Dashboard | `MY_CASES`, `NEXT_APPOINTMENT`, `RECENT_MESSAGES`, `USER_PLAN`, `QUICK_SERVICES`, `COMMUNITY_PREVIEW` | `dashboardService` |
| Cases | `MOCK_CASES` | `casesService.getActiveCases()` |
| Consultation | `CONSULTATIONS` | `casesService.getConsultations()` + workflow requests |
| My Group | `GROUP`, `MEMBERS`, `ROTATION`, `CURRENT_USER_ID` | `groupService.getGroupState()` |
| Messages | `THREADS` | `useChat()` hook (real-time) |
| Contracts | `MOCK_CONTRACTS`, `ACTIVITY_LOG` | `listClientWorkflowRequests()` |
| Find Lawyer | Used `MOCK_LAWYERS` directly | `lawyerService.getLawyers()` (MOCK fallback) |
| Documents | `MOCK_DOCS` | `documentService.getDocuments()` |
| Wallet | — (no mock removed) | Added "بيانات تجريبية" banner (deferred) |
| Referral | — (no mock removed) | Added "بيانات تجريبية" banner (deferred) |

### Phase 2.5D — Skeleton Components ✅

Created [DashboardSkeleton.tsx](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/dashboard/client/_components/DashboardSkeleton.tsx):
- `SkeletonList`, `SkeletonCard`, `SkeletonThreadList`, `SkeletonMessages`, `DashboardPageSkeleton`

### Phase 2.5E — Cleanup ✅

- `_data.ts` cleaned: Removed 6 mock exports, kept `STATUS_COLOR`, `fadeUp`, `ClientCase`
- `services/index.ts` updated with 3 new barrel exports

---

## ✅ Phase 2.5L — Lawyer Dashboard Mock→Real Migration (COMPLETE)

> Replaced all hardcoded mock data in 17 lawyer dashboard pages with real service calls, empty states, and demo banners.

### Phase 2.5L-A — New API Routes (5 endpoints) ✅

| Route | Methods | Auth | File |
|-------|---------|------|------|
| `/api/v1/lawyer/dashboard/summary` | GET | Auth | [dashboard/summary/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyer/dashboard/summary/route.ts) |
| `/api/v1/lawyer/clients` | GET | Auth | [clients/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyer/clients/route.ts) |
| `/api/v1/lawyer/tasks` | GET, PATCH | Auth | [tasks/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyer/tasks/route.ts) |
| `/api/v1/lawyer/activity` | GET | Auth | [activity/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyer/activity/route.ts) |
| `/api/v1/lawyer/finance` | GET | Auth | [finance/route.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/app/api/v1/lawyer/finance/route.ts) |

### Phase 2.5L-B — New Services (4 dual-mode) ✅

| Service | Functions | Demo Fallback |
|---------|-----------|---------------|
| [lawyerDashboardService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/lawyerDashboardService.ts) | `getLawyerDashboardSummary()` | Empty defaults |
| [lawyerClientsService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/lawyerClientsService.ts) | `getLawyerClients()` | Empty array |
| [lawyerTasksService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/lawyerTasksService.ts) | `getLawyerTasks()`, `updateLawyerTaskStatus()` | Empty array |
| [lawyerActivityService.ts](file:///d:/DEV/projects/SITE%20MAPS%20NZAMY%20(1)/SITE%20MAPS%20NZAMY/nzamy-website/src/lib/services/lawyerActivityService.ts) | `getLawyerActivity()` | Empty array |

### Phase 2.5L-C — Page Migrations (17 pages) ✅

**Group A — Wired to Real Services (8 pages)**

| Page | Mock Removed | Data Source |
|------|-------------|-------------|
| Main Dashboard | `STATS`, `TASKS`, `RECENT_CASES`, `ACTIVITY_TIMELINE`, `UPCOMING_DEADLINES` | `lawyerDashboardService` |
| Cases | `MOCK_CASES` merge removed | `workflowService` only |
| Consultations | `MOCK_CONSULTS` array removed | `workflowService` only |
| Contracts | `MOCK_CONTRACTS` removed | `workflowService` + `workflowToContract()` |
| Documents | `MOCK_DOCS` import removed | `documentService.getDocuments()` |
| Tasks | `INIT_TASKS` removed | `lawyerTasksService.getLawyerTasks()` |
| Clients | `MOCK_CLIENTS` removed | `lawyerClientsService.getLawyerClients()` |
| Hearings | `MOCK_EVENTS` removed | `workflowService` (derived hearing events) |

**Group B — Real Data + Demo Banners (2 pages)**

| Page | Change | Banner |
|------|--------|--------|
| Finance | `INVOICES`/`EXPENSES` → `apiGet('/api/v1/lawyer/finance')` | "بوابة الدفع قيد التفعيل" |
| Profile | `MOCK_PROFILE.name` → `useUser().name` | "بعض الإحصائيات تجريبية" |

**Group C — Demo Banner Only (7 pages)**

| Page | Banner Description |
|------|-------------------|
| Analytics | التحليلات ستتوفر تلقائياً بعد استخدام المنصة |
| Network | شبكة العمل والإحالات — قريباً |
| Secondment | نظام الانتداب القانوني — قريباً |
| Promotions | العروض الترويجية — قريباً |
| Archive | الأرشيف سيعرض البيانات الحقيقية قريباً |
| Reviews | التقييمات ستظهر بعد تفعيل نظام التقييم |
| Activity | سجل النشاط سيعرض البيانات الحقيقية تلقائياً |

### Phase 2.5L-D — Verification ✅

| Check | Result |
|-------|--------|
| `tsc --noEmit` | **0 errors** ✅ |

---

## ⬜ Phases 3-6 — What's Coming

### Phase 3 — Payments & Billing

> **Goal**: Real payment gateway, credit system, subscriptions, wallet, escrow

#### Key Components
| Component | Details |
|-----------|---------|
| **Payment Gateway** | ❓ TBD — abstracted behind `PaymentGateway` interface |
| **Credit System** | 5 packages (Direct→Royal), purchase/usage/expiry/refund ledger |
| **Subscriptions** | 5 tiers (free→max), monthly/yearly, auto-renew |
| **Wallet** | Top-up via gateway, balance from `wallet_transactions` |
| **Escrow** | Marketplace orders: held → released (minus 15%) → disputed → refunded |
| **Coupons** | Admin-managed, replace hardcoded `NZAMY50`/`NEWCLIENT` |

#### New API Routes (12)
| Route Group | Routes |
|-------------|--------|
| `/api/v1/payments/` | `create-intent`, `webhook`, `refund` |
| `/api/v1/credits/` | `packages`, `purchase`, `balance`, `consume`, `history` |
| `/api/v1/subscriptions/` | `plans`, `current`, `subscribe`, `cancel`, `webhook` |
| `/api/v1/wallet/` | `balance`, `topup`, `history` |
| `/api/v1/coupons/` | `validate`, `redeem` |

---

### Phase 4 — n8n Automation & Integrations

> **Goal**: 18 n8n workflows + WhatsApp (Evolution API) + email notifications

#### n8n Workflows (18)

| Category | Workflows |
|----------|-----------|
| **Onboarding** (4) | Welcome email, Lawyer verification, Firm onboarding, Provider verification |
| **Service Requests** (4) | New request notification, Request assigned, Request completed, Request escalation (48h) |
| **Billing** (4) | Payment success, Subscription renewal, Credit expiry warning, Invoice generation |
| **Communication** (3) | WhatsApp service triage (Evolution API), Consultation reminder, Hearing reminder |
| **Admin** (3) | Daily admin digest, Security alert (5+ failed logins), Content moderation (AI) |

#### Email Templates (Arabic-first, 9 templates)
`welcome`, `verify-email`, `password-reset`, `request-received`, `request-assigned`, `payment-receipt`, `subscription-expiring`, `credit-low`, `review-request`

#### WhatsApp Integration
- Provider: **Evolution API** (self-hosted, already deployed)
- Webhook: `/api/v1/whatsapp/webhook`
- Flow: incoming message → n8n → parse intent → create `service_requests`

---

### Phase 5 — Security, Compliance & Beta Teardown

> **Goal**: Server-side RBAC, input validation, rate limiting, remove all demo artifacts

#### Key Components
| Component | Details |
|-----------|---------|
| **RBAC** | `src/lib/auth/rbac.ts` — `assertUserRole()`, `assertPermission()`, `assertResourceAccess()` |
| **Validation** | Zod schemas for all API inputs |
| **Rate Limiting** | Auth: 5/min, API: 100/min, AI: 20/min, Uploads: 10/min, Payments: 5/min |
| **Beta Teardown** | Delete `BETA_MONOPOLY_MODE`, `BETA_REVIEW_MODE`, demo accounts, `BetaReviewGate`, all localStorage fallbacks |
| **Saudi Compliance** | Data residency (Bahrain region), encryption, audit logging, right to delete |

---

### Phase 6 — Deployment, Monitoring & CI/CD

> **Goal**: Production deployment on VPS + monitoring + CI/CD pipeline

#### Key Components
| Component | Details |
|-----------|---------|
| **Deployment** | Own VPS (user's choice), Supabase Cloud |
| **Monitoring** | Sentry (errors), Vercel Analytics (vitals), Supabase Dashboard (DB metrics) |
| **CI/CD** | GitHub Actions: type-check → lint → test → build → deploy |
| **SEO** | Sitemap + robots.txt already exist; Lighthouse target: 90+ |
| **Performance** | Bundle analysis, image optimization (AVIF/WebP already configured) |

---

## 🏗️ Infrastructure & Tech Stack

| Layer | Technology | Status |
|-------|-----------|--------|
| **Framework** | Next.js 16 (App Router), React 19, TypeScript 5 | ✅ Running |
| **Styling** | Tailwind CSS 4, Framer Motion 11 | ✅ Running |
| **Icons** | Phosphor Icons React | ✅ Running |
| **Database** | Supabase (PostgreSQL) — Cloud now, self-hosted later | ✅ **58 tables live** |
| **Auth** | Supabase Auth (email/phone/Google) | ✅ Code ready |
| **Backend mode** | `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=demo\|supabase` | ✅ Dual-mode working |
| **API Routes** | 34 endpoints (3 Phase 1 + 22 Phase 2 + 4 Phase 2.5 + 5 Phase 2.5L) | ✅ All created |
| **Service Layer** | 15 dual-mode services (8 Phase 2 + 3 Phase 2.5 + 4 Phase 2.5L) | ✅ All wired |
| **Realtime** | Supabase Realtime (notifications + chat) | ✅ Hooks ready |
| **Automation** | n8n (self-hosted) | ⬜ Phase 4 |
| **WhatsApp** | Evolution API (self-hosted, deployed) | ⬜ Phase 4 |
| **Email** | TBD (SendGrid / Resend) | ⬜ Phase 4 |
| **Payments** | TBD | ⬜ Phase 3 |
| **Hosting** | Own VPS | ⬜ Phase 6 |

---

## 🗄️ Database State

### Total Tables: 58 ✅ ALL LIVE

| Source | Count | Status |
|--------|-------|--------|
| Pre-existing migration (20260518) | 11 | ✅ Executed |
| Phase 1 migration 001 (profiles) | 4 | ✅ Executed |
| Phase 1 migration 002 (entities) | 8 | ✅ Executed |
| Phase 1 migration 003 (billing) | 8 | ✅ Executed |
| Phase 1 migration 004 (community) | 14 | ✅ Executed |
| Phase 1 migration 005 (advanced) | 13 | ✅ Executed |

### Seed Data (inserted with migrations)
- **5 credit packages** (Direct, Basic, Advanced, Elite, Royal)
- **10 subscription plans** (free/ai/pro/corp/max × individual/lawyer)
- **3 coupons** (NZAMY50, NEWCLIENT, NZAMY100)
- **9 jurisdictions** (SA, AE, KW, BH, QA, OM, EG, JO, IQ)

---

## 👥 User Types & Tiers

### 9 User Types

| # | Type | Arabic | Dashboard Path | Sub-roles |
|---|------|--------|---------------|-----------|
| 1 | `individual` | عميل فرد | `/dashboard/client` | — |
| 2 | `lawyer` | محامي فرد | `/dashboard/lawyer` | — |
| 3 | `firm` | مكتب محاماة | `/dashboard/firm` | 13 sub-roles |
| 4 | `corporate` | شركة/مؤسسة | `/dashboard/business` | 9 sub-roles |
| 5 | `micro` | منشأة صغيرة | `/dashboard/micro` | — |
| 6 | `provider` | مقدم خدمة | `/dashboard/provider` | notary, arbitrator, bailiff |
| 7 | `government` | جهة حكومية | `/dashboard/government` | judge, prosecutor, officer, counsel |
| 8 | `ngo` | جمعية خيرية | `/dashboard/ngo` | — |
| 9 | `admin` | مدير النظام | `/dashboard/admin` | 5 sub-roles |

### 5 Subscription Tiers
| Tier | Rank | Price (Individual, Monthly SAR) |
|------|------|------|
| `free` | 0 | 0 |
| `ai` | 1 | 49 |
| `pro` | 2 | 149 |
| `corp` | 3 | 499 |
| `max` | 4 | 999 |

---

## 🔗 Quick Reference

### Environment Variables
```bash
# Required for Supabase mode
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Backend mode switch
NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=demo  # or "supabase"

# n8n (Phase 4)
N8N_WEBHOOK_URL=https://your-n8n.example.com/webhook
N8N_API_KEY=your-n8n-key

# WhatsApp / Evolution API (Phase 4)
EVOLUTION_API_URL=https://your-evolution.example.com
EVOLUTION_API_KEY=your-evolution-key

# Payment (Phase 3 — TBD)
# MOYASAR_API_KEY= or TAP_API_KEY=
```

### How to Activate Supabase Mode
1. ~~Execute 5 SQL migration files~~ ✅ Done
2. Copy `.env.example` → `.env.local`, fill in credentials
3. Set `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`
4. Restart dev server

### How to Stay in Demo Mode
- Leave `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=demo` (or don't set it)
- Everything works as before — zero changes to existing functionality
