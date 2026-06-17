# ✅ NZAMY Master Checklist
> Last Updated: 2026-06-17 | **Overall: 148/289 items (51%)**

---

## Phase 1 — Foundation (Auth + DB + SDK) — ✅ 28/28 (100%)

- [x] Supabase project setup
- [x] Auth provider configuration
- [x] Session management (SSR cookies)
- [x] Role-based middleware + proxy routing
- [x] `handle_new_user` trigger (auto-create profiles)
- [x] 58 database tables created
- [x] RLS policies for all core tables
- [x] TypeScript types (`database.ts`)
- [x] API helper (`api.ts` — `apiGet`, `apiMutate`, `dualMode`)
- [x] Environment configuration (`.env.example`)
- [x] All other Phase 1 items (28 total) ✅

---

## Phase 2 — Core Backend (localStorage → Supabase) — ✅ 54/54 (100%)

- [x] Service request API (CRUD + events)
- [x] Cases API (list + detail)
- [x] Consultations API (list + create + detail)
- [x] Documents API (list + upload)
- [x] Chat API (rooms + messages)
- [x] Community API (posts + answers + votes)
- [x] Groups API (CRUD + members + invite)
- [x] Research API (sessions + desktop)
- [x] Notifications API (list + mark-read)
- [x] Profile API (read + update)
- [x] Settings API (read + update)
- [x] Dashboard summary API (client + lawyer)
- [x] Lawyer search API (public directory)
- [x] Lawyer dashboard APIs (clients, tasks, activity, finance)
- [x] Wallet API route (GET balance + transactions)
- [x] Referrals API route (GET stats + code)
- [x] Admin verifications API
- [x] All other Phase 2 items (54 total) ✅

---

## Phase 2.5 — Client Dashboard Mock→Real — ✅ 20/20 (100%)

- [x] Main dashboard → `getDashboardSummary()`
- [x] Cases list → workflow service
- [x] Cases `[id]` → `getCaseDetail()` + mock fallback
- [x] Consultation list → `getConsultations()`
- [x] Find Lawyer → `getLawyers()` + mock fallback
- [x] Documents → `getDocuments()`
- [x] Contracts → workflow service
- [x] Messages → `useChat()` hook
- [x] My Group → `getGroupState()`
- [x] Wallet → `/api/v1/wallet` + demo banner
- [x] Letters → AI client-side (no backend needed)
- [x] All other Phase 2.5 items ✅

### Still mocked (low priority — deferred features):
- [ ] Consultation `[id]` detail → needs chat integration
- [ ] Consultation/new → needs live lawyer selection
- [ ] Referral page → needs referral tracking system
- [ ] Celebrity features (3 pages) → premium feature, post-launch

---

## Phase 2.5L — Lawyer Dashboard Mock→Real — ✅ 35/35 (100%)

- [x] Main dashboard → `getLawyerDashboardSummary()`
- [x] Cases → workflow service
- [x] Consultations → workflow service
- [x] Contracts → workflow service
- [x] Documents → `getDocuments()`
- [x] Tasks → `getLawyerTasks()` + mutations
- [x] Clients list → `getLawyerClients()`
- [x] Clients `[id]` → API + mock fallback
- [x] Hearings → workflow service
- [x] Finance → `apiGet('/api/v1/lawyer/finance')`
- [x] Profile → `/api/v1/profile` + mock fallback
- [x] Activity → `getLawyerActivity()` + mock fallback
- [x] All other Phase 2.5L items ✅

### Still mocked (low priority — deferred features):
- [ ] Reviews → needs `/api/v1/reviews` endpoint
- [ ] Network → needs team/secondment API
- [ ] Analytics → needs analytics aggregation API
- [ ] Marketplace → shared mock data
- [ ] Secondment / Promotions / Archive → demo banners only

---

## Phase 2.5B — Sector Dashboard Migration — ⬜ 0/50 (0%) 🆕

### Firm Dashboard (مكتب محاماة) — 0/15
- [ ] Create `firmService.ts`
- [ ] Create `/api/v1/firm/members` route (CRUD)
- [ ] Create `/api/v1/firm/branches` route (CRUD)
- [ ] Create `/api/v1/firm/compliance` route (KYC + conflicts)
- [ ] Wire firm main dashboard (`page.tsx`)
- [ ] Wire firm/cases → reuse `service-requests` API
- [ ] Wire firm/clients → firm-specific client view
- [ ] Wire firm/contracts → reuse `service-requests` API
- [ ] Wire firm/documents → reuse `documents` API
- [ ] Wire firm/team → `/api/v1/firm/members`
- [ ] Wire firm/finance → reuse `wallet` API
- [ ] Wire firm/profile → reuse `profile` API
- [ ] Wire firm/compliance (KYC/walls) → `/api/v1/firm/compliance`
- [ ] Wire firm/analytics → aggregation queries
- [ ] Wire remaining firm pages (32 total)

### Business Dashboard (شركة) — 0/10
- [ ] Create `businessService.ts`
- [ ] Create `/api/v1/business/departments` route
- [ ] Create `/api/v1/business/employees` route
- [ ] Wire business main dashboard
- [ ] Wire business/cases → reuse `service-requests` API
- [ ] Wire business/departments → new API
- [ ] Wire business/governance → new API
- [ ] Wire business/requests → reuse `service-requests` API
- [ ] Wire business/team → entity members API
- [ ] Wire remaining business pages (18 total)

### Provider Dashboard (مزود خدمة) — 0/7
- [ ] Create `providerService.ts`
- [ ] Create `/api/v1/provider/requests` route
- [ ] Create `/api/v1/provider/earnings` route
- [ ] Wire provider main dashboard
- [ ] Wire provider/requests → new API
- [ ] Wire provider/earnings → new API
- [ ] Wire provider/profile → reuse `profile` API

### Admin Dashboard (مدير) — 0/8
- [ ] Wire `adminService.ts` to admin pages (exists but unused!)
- [ ] Create `/api/v1/admin/users` route
- [ ] Create `/api/v1/admin/analytics` route
- [ ] Create `/api/v1/admin/content` route
- [ ] Wire admin main dashboard → `adminService`
- [ ] Wire admin/users → new API
- [ ] Wire admin/verifications → existing `adminService`
- [ ] Wire remaining admin pages (26 total)

### Government Dashboard (جهة حكومية) — 0/4
- [ ] Create `governmentService.ts`
- [ ] Create `/api/v1/government/cases` route
- [ ] Wire government main dashboard
- [ ] Wire government/cases + compliance + contracts

### NGO Dashboard (جمعية خيرية) — 0/4
- [ ] Create `ngoService.ts`
- [ ] Create `/api/v1/ngo/programs` route
- [ ] Wire ngo main dashboard
- [ ] Wire ngo/programs + finance + volunteers

### Micro Dashboard (مؤسسة صغيرة) — 0/3
- [ ] Create `microService.ts`
- [ ] Wire micro main dashboard
- [ ] Wire micro pages (reuse service-requests + documents APIs)

---

## Phase 3 — Payments & Billing — ⬜ 0/25 (0%)

> ⚠️ **BLOCKED** — Payment gateway not chosen yet

- [ ] **DECISION**: Choose gateway (Moyasar / Tap / HyperPay)
- [ ] Payment intent endpoint (`POST /api/v1/payments/create-intent`)
- [ ] Payment webhook handler (`POST /api/v1/payments/webhook`)
- [ ] Refund endpoint (`POST /api/v1/payments/refund`)
- [ ] Credit purchase (5 endpoints)
- [ ] Subscription management (create/upgrade/cancel/check/gate)
- [ ] Wallet top-up + withdrawal
- [ ] Escrow for marketplace
- [ ] Coupon system (validate + redeem)
- [ ] Invoice generation
- [ ] Payment history page
- [ ] Subscription management page
- [ ] All other Phase 3 items (25 total)

---

## Phase 4 — n8n Automation — ⬜ 0/32 (0%)

### Critical Workflows (build first):
- [ ] WF-01: Welcome email + WhatsApp on signup
- [ ] WF-02: New service request notification
- [ ] WF-03: Request assigned to lawyer
- [ ] WF-04: Request completed notification
- [ ] WF-05: Lawyer verification workflow
- [ ] WF-06: Consultation reminder (24h + 1h)
- [ ] WF-07: WhatsApp triage router

### Payment-Dependent (after Phase 3):
- [ ] WF-08: Payment confirmation
- [ ] WF-09: Subscription renewal
- [ ] WF-10: Invoice generation
- [ ] WF-11: Credit purchase confirmation

### Operational:
- [ ] WF-12: Request escalation (SLA breach)
- [ ] WF-13: Hearing reminder
- [ ] WF-14: Firm onboarding
- [ ] WF-15: Provider verification
- [ ] WF-16: Daily admin digest
- [ ] WF-17: Content moderation
- [ ] WF-18: Security alert
- [ ] WF-19: Wallet balance sync
- [ ] WF-20: Referral reward processing

### Infrastructure:
- [ ] Set up Supabase database webhooks
- [ ] Configure Evolution API connection
- [ ] Create 9 Arabic email templates
- [ ] All other Phase 4 items (32 total)

---

## Phase 5 — Security & Beta Teardown — ⬜ 0/22 (0%)

### Security:
- [ ] Server-side RBAC (`assertUserRole`, `assertPermission`)
- [ ] Zod validation on all API inputs (53 handlers)
- [ ] Rate limiting (auth: 5/min, API: 100/min, AI: 20/min)
- [ ] CORS configuration
- [ ] CSP headers

### Beta Teardown:
- [ ] Delete `src/lib/demo-accounts.ts`
- [ ] Delete `src/lib/test-credentials.ts`
- [ ] Remove `BETA_MONOPOLY_MODE` flag
- [ ] Remove `BETA_REVIEW_MODE` flag
- [ ] Remove `BetaReviewGate` component
- [ ] Remove `nzamy_demo_role` cookie
- [ ] Remove `nzamy_session` cookie
- [ ] Remove all localStorage fallbacks from services

### Saudi Compliance (PDPL):
- [ ] Data residency verification
- [ ] Encryption at rest + in transit
- [ ] Audit logging for data access
- [ ] Right-to-delete implementation
- [ ] Privacy policy update
- [ ] Terms of service update

---

## Phase 6 — Deployment & Monitoring — ⬜ 0/23 (0%)

- [ ] VPS provisioning
- [ ] aaPanel + Node.js setup
- [ ] PM2 process management
- [ ] Nginx reverse proxy config
- [ ] SSL certificate (Let's Encrypt)
- [ ] Domain configuration (`nezamy.sa`)
- [ ] Environment variables on server
- [ ] Sentry error tracking
- [ ] Uptime monitoring
- [ ] GitHub Actions CI/CD pipeline
- [ ] Automated testing in CI
- [ ] Staging environment
- [ ] Production build optimization
- [ ] CDN for static assets
- [ ] Database backups (Supabase)
- [ ] SEO: sitemap.xml generation
- [ ] SEO: structured data (JSON-LD)
- [ ] SEO: Open Graph meta tags
- [ ] SEO: hreflang for Arabic/English
- [ ] Analytics (Google/Plausible)
- [ ] All other Phase 6 items (23 total)

---

## 📊 Summary

| Phase | Items | Done | % |
|-------|-------|------|---|
| 1 — Foundation | 28 | 28 | ✅ 100% |
| 2 — Core Backend | 54 | 54 | ✅ 100% |
| 2.5 — Client Migration | 20 | 20 | ✅ 100% |
| 2.5L — Lawyer Migration | 35 | 35 | ✅ 100% |
| 2.5B — Sector Migration | 50 | 0 | 🔴 0% |
| 3 — Payments | 25 | 0 | ⬜ 0% |
| 4 — n8n Automation | 32 | 0 | ⬜ 0% |
| 5 — Security | 22 | 0 | ⬜ 0% |
| 6 — Deployment | 23 | 0 | ⬜ 0% |
| **TOTAL** | **289** | **137** | **47%** |
