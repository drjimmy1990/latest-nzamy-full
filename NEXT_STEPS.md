# NZAMY — Next Development Steps & Phased Roadmap

> **Generated:** 2026-06-28
> **Source:** synthesized from GitNexus codebase graph (`latest-nzamy-full` — 948 files · 15,214 symbols · 300 execution flows · 83 functional areas · 66 API routes) plus every project markdown doc (`master_checklist2.md`, `workflows_roadmap.md`, `production_readiness_audit.md`, `legal_library_guide.md`, `deployment_guide.md`, `nzamy-audit-fix-status.md`, `payments-gateway-admin-gate.md`, `ARCHITECTURE.md`).
> **Purpose:** one file that tells you exactly what is left to build, in what order, with files, acceptance criteria, and effort.
> **Status legend:** ✅ done · 🟡 partial / deferred · ⬜ not started

> ⚠️ **GitNexus index is 1 commit behind HEAD.** Before any code work, run `npx gitnexus analyze` to refresh, then re-open `ARCHITECTURE.md`. Per `CLAUDE.md` you **must** run `gitnexus_impact` before editing any symbol and `gitnexus_detect_changes()` before committing.

---

> ## 🆕 UPDATE 2026-07-05 — production-blocker rounds done + deployed
> This roadmap was written 2026-06-28. Since then, two focused remediation rounds landed on `main` and are **deployed** (PM2 reload 2026-07-05 18:43):
> - **Round 1** (`a5b10c3`, from [`PRODUCTION_FIX_PLAN.md`](./PRODUCTION_FIX_PLAN.md) → [`PRODUCTION_FIX_IMPLEMENTATION.md`](./PRODUCTION_FIX_IMPLEMENTATION.md)): closed the client-workflow **IDOR**, the **library paywall bypass**, the **always-mock lawyer profile**, fabricated my-group billing, and fake-content leaks; added `assertRole` gates + proxy API-401 + startup env assertion.
> - **Round 2** (`c7b0867` + `5e23b6c`, from [`TEST_REVIEW_FIX_PLAN.md`](./TEST_REVIEW_FIX_PLAN.md) → [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md)): beta teardown / dev-switcher out of prod, honest **AI review-gate** on all result surfaces, lawyer dashboard misroutes, the lawyer **profile edit-form + contact-PII fix**.
> - **Still deferred** (need real seeded library data or a live-DB maintenance window): library search + Arabic FTS (§4.6/§7.2), book detail (§4.5), persistence→DB (§4.7), the tester's 10 modifications (§4.8). See [`IMPLEMENTATION_STATUS.md`](./IMPLEMENTATION_STATUS.md).
> - **Pending DB migrations are now 4, not 2** (see the corrected Phase 0 below): everything after `20260629`.

---

## 0. Current-state snapshot (what is already finished)

| Area | Status | Evidence |
|------|--------|----------|
| Auth + DB + SDK foundation | ✅ 100% | 58 tables, RLS, `handle_new_user` trigger, `api.ts` helpers (Phase 1) |
| Core backend (localStorage → Supabase) | ✅ 100% | 54 services/routes (Phase 2) |
| Client dashboard mock→real | ✅ 100% | 20/20 pages wired (Phase 2.5) |
| Lawyer dashboard mock→real | ✅ 100% | 35/35 pages wired (Phase 2.5L) |
| 16-finding audit pass + post-review fixes | ✅ done | commits `c6a7564`, `432380d`; tsc + build green |
| Admin payment-gating toggle | ✅ done | `platform_settings.payments_gateway` runtime flag gates all 3 payment call-sites |
| Build & type gates | ✅ green | `npx tsc --noEmit` = 0 errors, `npx next build` = exit 0 |
| Deployment infra | 🟡 partial | VPS + aaPanel + Nginx + SSL + PM2 guide exists; `deploy.sh` runs; monitoring/CI/SEO not done |
| Sector dashboards (firm/business/provider/gov/ngo/micro/admin) | ⬜ 0% | Phase 2.5B (50 items) |
| Payments real provider | ⬜ blocked | gateway not chosen; admin toggle gates instead |
| n8n automation | ⬜ 0% | 18 workflows + 9 email templates |
| Security hardening + beta teardown | ⬜ 0% | Phase 5 |
| Library finishing (FTS, dev-flag gate, metadata table) | 🟢 mostly done | P2 #15 dev-flag ✅, #16 pagination/FTS/--clean/IDOR/AI-stubs/precedents-judgment ✅; `law_metadata` table + per-type whitelist + parse-feqh volume ⬜ deferred; ⚠️ FTS regressed Arabic normalization |

**Overall master checklist:** 137/289 items (~47–51%). The remaining ~150 items are concentrated in 6 phases below.

---

## Phase 0 — Apply pending DB migrations (CRITICAL, do first)

> **Corrected 2026-07-05.** The `20260628_*` + `20260629_payments_and_storage_policies.sql` set (documents bucket, payment-gate seed, storage RLS) was applied on 2026-06-29 — those are live. The **4 pending** migrations are the ones added *after* `20260629`. All idempotent.

- [ ] `npx supabase db push` (or `npx supabase migration up --linked`) to apply:
  - `20260630_handle_new_user_sectors.sql` — `handle_new_user()` trigger provisions government/NGO/business sector profiles on signup.
  - `20260701_client_workflow_rls_assert.sql` — assertion-only guard (fails deploy if client-workflow RLS policies are missing; no data change).
  - `20260701_smart_folder_items_display_cols.sql` — `title`/`title_en`/`cat_id` columns + unique index on `smart_folder_items`.
  - `20260705_lawyer_show_contact.sql` — **required:** `show_contact` opt-in flag on `lawyer_profiles`; the public `/api/v1/lawyers` route now `SELECT`s it, so **until applied that route 500s.**
- [ ] Run `supabase/migrations/_verify.sql` (read-only) to confirm the schema landed.
- [ ] **Add `supabase db push` to `deploy.sh`** so future migrations apply automatically on every deploy (currently `deploy.sh` does `git pull → npm install → npm run build → pm2 reload`).
- [ ] After apply, smoke-test: browse `/services/lawyers` (confirms `show_contact` column exists); register a sector user (confirms trigger); admin flips `payments_gateway` → `consultation/new`, `requests/new`, `find-lawyer` submit blocks.

**Acceptance:** the 4 migrations applied on staging + production; `_verify.sql` clean; lawyer directory loads; sector signup provisions the right profile row.

---

## Phase 1 — Close audit deferrals (P1/P2 leftovers)

From `nzamy-audit-fix-status.md` — small, contained, no new backend needed.

### 1a. Detail pages → real API (P1 #7 full rewire) 🟡
Currently shows clean not-found instead of mock, but not yet fetching real detail.
- [ ] `lawyer/cases/[id]/page.tsx` → `casesService.getCaseDetail(id)` (remove `CASES_DB`).
- [ ] `lawyer/consultations/[id]/page.tsx` → `/api/v1/consultations/[id]` (remove `MOCK[params.id] ?? MOCK["1"]`).
- [ ] `lawyer/clients/[id]/page.tsx` → uncomment the cases/contracts/consultations fetches with `client_id` filter (remove `MOCK_CASES[clientId]`).
- [ ] `client/cases/[id]/page.tsx` → proper 404 state (remove `?? MOCK_CASES["2025-001"]`).
- [ ] Run `gitnexus_impact({target:"getCaseDetail"})` before touching the service.

### 1b. Error-UI sweep (P1 #12 full sweep) 🟡
Representative error UI added; ~15 bare `.catch(()=>{})` sites remain.
- [ ] Client: `cases/[id]`, `consultation`, `consultation/[id]`, `my-group`.
- [ ] Lawyer: `cases`, `contracts`, `hearings`, `clients`, `finance`, `profile`, `activity`, `clients/[id]`, `tasks`.
- [ ] Pattern: replace `.catch(()=>{})` with `catch(err){ setError(...); setLoading(false); }` + a shared `<ErrorState/>` banner (reuse the one already added in P1 #12).

### 1c. Mock remnants (P2 #13 remainder) 🟡
- [ ] `consultation/new/page.tsx` — replace `MOCK_LAWYERS` import with real `getLawyers()` for lawyer selection.
- [ ] Admin celebrity pages — remove `AHMED20` mock code (admin-side, low priority).

**Acceptance:** `grep -rE "MOCK_LAWYERS|MOCK_CASES|CASES_DB|JUDGE47|AHMED20|demo-client"` returns only dev-flagged fallbacks or `DashboardComingSoon` sections. No page silently renders another entity's data.

---

## Phase 2 — DB schema & RLS blockers (pre-launch correctness)

From `production_readiness_audit.md` §2. These block real DB-mode operation end-to-end. Several overlap with already-fixed audit items (2.2 documents ✅ done) — verify each against current migrations before re-applying.

- [ ] **2.1 Lawyer search crash** — `lawyer_profiles.is_accepting_clients` and `city` columns referenced by `/api/v1/lawyers/route.ts` but missing from table.
  ```sql
  ALTER TABLE public.lawyer_profiles ADD COLUMN IF NOT EXISTS is_accepting_clients BOOLEAN NOT NULL DEFAULT true;
  ALTER TABLE public.lawyer_profiles ADD COLUMN IF NOT EXISTS city TEXT;
  ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS city TEXT;
  ```
- [ ] **2.3 Service-requests POST wrapper + status CHECK** — route expects `body.request` wrapper but `workflowService` sends flat payload; `"pending"` not in CHECK constraint.
  - API: `const requestData = body.request ?? body;` + `statusValue = requestData.status ?? "pending_assignment"`.
  - SQL: add `'pending'` to `service_requests_status_check` (or map to `pending_assignment`).
- [ ] **2.4 Service-requests PATCH camelCase→snake_case** — `/api/v1/service-requests/[id]` forwards camelCase (`sourcePath`, `assignedTo`) directly to Supabase. Add the mapping table (`sourcePath→source_path`, `assignedTo→assigned_to`, …) before `.update()`.
- [ ] **2.5 Marketplace RLS block** — only SELECT policy is `requester_user_id = auth.uid() OR assigned_to = auth.uid()`, so lawyers can't see unassigned requests. Replace with a policy that also allows verified lawyers to read `assigned_to IS NULL` rows.
- [ ] **2.6 Conflicting `attachments` RLS** — `20260518…` (participant check) vs `20260616…` (owner-only check) conflict; owner-only blocks lawyers from client uploads. Drop both, create one unified `attachments_select_policy` (owner OR request participant) + `attachments_insert_policy` (`owner_user_id = auth.uid()`).
- [ ] **2.7 Case detail envelope** — `/api/v1/cases/[id]` wraps in `{data:…}` but `getCaseDetail()` forwards it directly. Fix service to `return response.data`. *(likely already addressed by P1 #7 rewire — verify.)*
- [ ] **2.8 Lawyer tasks field mismatch** — `/api/v1/lawyer/tasks` returns `type`/`created_at` but UI wants `category`/`createdAt`. Map DB service types → `TaskCategory` union and return camelCase dates.
- [ ] **2.9 `handle_new_user` trigger gaps** — only provisions `lawyer_profiles`/`provider_profiles`; no provisioning for `firm`/`corporate`/`micro`/`government`/`ngo` (needed for Phase 4 sector dashboards). Update the trigger to branch on `user_type` and insert `firm_profiles` + default `user_settings`.

**Acceptance:** a real client can register → create request → a verified lawyer sees it in marketplace → assigns → client sees assignment, with no RLS/shape errors in server logs. Run `gitnexus_detect_changes()` to confirm scope after each route edit.

---

## Phase 3 — Library finishing (P2 #15 + #16)

From `nzamy-audit-fix-status.md` + `legal_library_guide.md`. Library works but has cleanup + scale issues.

- [x] **#15 Dev-flag the demo-data fallbacks.** ✅ Done (2026-06-29) via new `src/app/laws/demo-data-access.ts` — re-exports the demo arrays but returns `[]` in prod unless `NEXT_PUBLIC_LIB_DEMO_FALLBACK=1`; types/taxonomy constants re-exported unconditionally. Import sites repointed (`laws/page.tsx`, `orders/[slug]`, `components/*`, `_sidebar`). `law-metadata-map.ts` left as-is (lookup, not fake content).
- [ ] **#15 `law_metadata` table** — ⬜ still deferred; `law-metadata-map.ts` (584 lines) remains. Replace with a `law_metadata` table + migration (future).
- [x] **#16 Library init pagination** — ✅ Done: `/api/library/init` now reads `?limit` (1-200, default 100) + `?page` and uses `.range()` on all 5 tables instead of unbounded `select('*')`.
- [x] **#16 FTS/GIN indexes** — ✅ Done (route side): `search` + `autocomplete` routes switched from `.ilike` to `.textSearch('fts', ..., {config:'library.arabic', type:'plain'})` → `fts @@ plainto_tsquery`. The `fts` generated columns + GIN indexes already exist in `20260626_legal_library_schema.sql`; they were dead weight before, now used.
- [x] **#16 `seed-library.ts --clean`** — ✅ Done: `clean` param wired to `seedLaws`/`seedDecrees`/`seedPrecedents`/`seedFeqh`; delete-before-insert (children-first) when `clean && !dryRun`.
- [x] **#16 `smart_folder_items` DELETE ownership** — ✅ Done: item DELETE now verifies parent `smart_folders.user_id = auth.uid()` (404 if missing, 403 if not owner) before deleting.
- [ ] **#16 `parse-feqh.ts:357`** — ⬜ Not fixed (honest TODO): `volume: 1` kept as placeholder with an explicit TODO comment; no real volume detection implemented.
- [ ] **#16 Per-type whitelist keys** — ⬜ still deferred; `checkLibraryAccess` whitelist still law-slug-keyed.
- [x] **#16 `precedents/judgment/[slug]/page.tsx`** — ✅ Gated (not built): replaced `DEMO_PRECEDENTS.find()` mock with `DashboardComingSoon` ("تفاصيل صك الحكم", back to `/laws`). No `/api/library/judgment` route or `library.judgments` table exists, so gated honestly قريباً rather than fabricating.
- [x] **#16 AI stubs gate** — ✅ Done: `LibraryAI` now calls real `/api/ai/library-chat` (fallback قريباً); `ArticleExplainModal` + `CommunityQuestionModal` gated قريباً (no more `setTimeout` fakes); `POST /api/community/questions` TODO resolved by gating honestly (no localStorage fake-success).

**Acceptance:** library init paginated ✅; indexed (FTS used) ✅; prod shows empty state on seed failure ✅; `--clean` actually truncates ✅. ⚠️ **REGRESSION on Arabic normalization:** search of `الإثبات` matching stored `الاثبات` (and `١٤٤٤`↔`1444`) may NO LONGER work — the FTS rewrite uses `library.arabic` (`copy=simple`, no normalization) with the raw query, and `normalizeSearch` is no longer applied for matching. Fix options: (A) re-add `normalizeSearch`+`.ilike` as an OR fallback alongside FTS, or (B) add a SQL normalize function and rebuild `fts` as `to_tsvector('library.arabic', normalize_arabic_text(...))`. Tracked in `library_testing_arabic.md` note #4.

---

## Phase 4 — Payments: gateway decision + real wiring (BLOCKED on decision)

From `master_checklist2.md` Phase 3 + `payments-gateway-admin-gate.md`. The admin toggle currently gates everything as `disabled`. This phase is gated on a business decision.

- [ ] **DECISION:** choose gateway — Moyasar (KSA-native, Mada/Apple Pay) / Tap / HyperPay.
- [ ] Replace `createPaymentIntentStub` body in `src/lib/paymentAdapter.ts` with real provider SDK call; flip `payments_gateway` to `test` then `live`.
- [ ] `POST /api/v1/payments/create-intent`, `POST /api/v1/payments/webhook`, `POST /api/v1/payments/refund`.
- [ ] Credit purchase (5 endpoints), subscription CRUD (create/upgrade/cancel/check/gate).
- [ ] Wallet top-up + withdrawal + escrow for marketplace.
- [ ] Coupon system (validate + redeem) + invoice generation.
- [ ] Payment history page + subscription management page.
- [ ] Drive wallet/finance "gateway being activated" banners only when `status !== "live"` (already coded — verify after wiring).

**Acceptance:** real test card → intent → webhook → `payments` row → receipt email (WF-08). Admin can flip disabled/test/live and all 3 call-sites react.

---

## Phase 5 — n8n automation (Section A first, then B)

From `workflows_roadmap.md`. 18 workflows + 9 email templates. **Section A (7 workflows) is the launch blocker** — completes the client↔lawyer flow.

### 5.0 Prerequisites (before ANY workflow)
- [ ] n8n connected to Supabase (Postgres node or HTTP + service-role key).
- [ ] `N8N_WEBHOOK_URL` + `N8N_API_KEY` in `.env.local`.
- [ ] `/api/v1/n8n/trigger` generic webhook endpoint.
- [ ] Evolution API webhook → n8n receives WhatsApp messages.
- [ ] Build first 2 email templates: `welcome` + `request-received`.

### 5.1 Section A — BUILD NOW (~18–25h, blocks launch)
| # | Workflow | Trigger | Est |
|---|----------|---------|-----|
| A1 | Welcome email + WhatsApp | `profiles` INSERT | 1–2h |
| A2 | New request → notify lawyers | `service_requests` INSERT | 3–4h |
| A3 | Request assigned → notify client | status → `assigned` | 1–2h |
| A4 | Request completed + review request | status → `completed` (+24h delay) | 2–3h |
| A5 | Lawyer verification | `lawyer_profiles` INSERT | 2–3h |
| A6 | Consultation reminder (24h + 1h) | cron 30 min | 2–3h |
| A7 | WhatsApp triage (AI intent) | Evolution webhook | 4–5h |

Plus 4 email templates: `welcome`, `request-received`, `request-assigned`, `review-request`.

### 5.2 Section B — BUILD LATER (operational, not blocking)
- B1 Request escalation (48h SLA, hourly cron) · B2 Hearing reminder · B3 Firm onboarding · B4 Provider verification · B5 Daily admin digest · B6 Content moderation (AI) · B7 Security alert (failed logins).
- **Billing (after Phase 4):** B8 Payment success/receipt · B9 Subscription renewal · B10 Credit expiry · B11 Invoice generation.

**Acceptance (Section A):** client registers → welcome (A1) → creates request → lawyers notified (A2) + client confirmed → lawyer assigns → client notified (A3) → consultation scheduled → reminders (A6) → completed → review request (A4). Or via WhatsApp (A7).

---

## Phase 6 — Sector dashboards (Phase 2.5B, 0/50)

From `master_checklist2.md`. Six sector dashboards are UI shells only. Pattern: create a `*Service.ts` + `/api/v1/<sector>/*` routes, then wire pages reusing `service-requests`/`documents`/`wallet` APIs where possible. Depends on Phase 2 #9 (`handle_new_user` provisioning).

- [ ] **Firm (مكتب محاماة) — 15 items:** `firmService.ts`, `/api/v1/firm/{members,branches,compliance}`, wire 32 pages (cases/clients/contracts/documents/team/finance/profile/compliance/analytics).
- [ ] **Business (شركة) — 10 items:** `businessService.ts`, `/api/v1/business/{departments,employees}`, wire 18 pages.
- [ ] **Provider (مزود خدمة) — 7 items:** `providerService.ts`, `/api/v1/provider/{requests,earnings}`.
- [ ] **Admin (مدير) — 8 items:** wire existing `adminService.ts` (currently unused!) + `/api/v1/admin/{users,analytics,content}`, wire 26 pages.
- [ ] **Government (جهة حكومية) — 4 items:** `governmentService.ts`, `/api/v1/government/cases`, cases+compliance+contracts.
- [ ] **NGO (جمعية خيرية) — 4 items:** `ngoService.ts`, `/api/v1/ngo/programs`, programs+finance+volunteers.
- [ ] **Micro (مؤسسة صغيرة) — 3 items:** `microService.ts`, reuse service-requests + documents.

**Acceptance:** each sector's main dashboard loads real data from its service; no `MOCK_*` arrays; role gating via `BuildDefault<Role>Features` (the dominant flow in §4.5 of `ARCHITECTURE.md`).

---

## Phase 7 — Security hardening + beta teardown (Phase 5, 0/22)

- [ ] Server-side RBAC: `assertUserRole`, `assertPermission` on all 66 routes.
- [ ] Zod validation on all 53 API inputs.
- [ ] Rate limiting: auth 5/min, API 100/min, AI 20/min.
- [ ] CORS + CSP headers.
- [ ] **Beta teardown:** delete `src/lib/demo-accounts.ts`, `src/lib/test-credentials.ts`; remove `BETA_MONOPOLY_MODE`, `BETA_REVIEW_MODE`, `BetaReviewGate`, `nzamy_demo_role` cookie, `nzamy_session` cookie, all localStorage fallbacks in services.
- [ ] **Saudi PDPL compliance:** data residency, encryption at rest + transit, audit logging for data access, right-to-delete, privacy policy + terms of service updates.

**Acceptance:** no beta/demo credentials in repo; every route validates + authorizes; PDPL checklist signed off.

---

## Phase 8 — Deployment hardening, monitoring & SEO (Phase 6 remainder)

From `deployment_guide.md` (infra exists) + `master_checklist2.md` Phase 6.

- [ ] **`deploy.sh`** — add `npx supabase db push` step (see Phase 0) + `pm2 reload nzamy` for zero-downtime (Step 9.2).
- [ ] Sentry error tracking + uptime monitoring.
- [ ] GitHub Actions CI/CD: `tsc --noEmit` → `next build` → deploy on push to `main`; automated tests in CI.
- [ ] Staging environment (separate Supabase project + subdomain).
- [ ] Production build optimization + CDN for static assets.
- [ ] Database backups (Supabase automated PITR).
- [ ] **SEO:** `sitemap.xml` generation, JSON-LD structured data, Open Graph meta, `hreflang` for Arabic/English.
- [ ] Analytics (Plausible or Google).

**Acceptance:** push to `main` → CI green → auto-deploy; Sentry captures prod errors; sitemap + structured data live.

---

## Cross-cutting rules (apply to every phase)

1. **Before editing any symbol:** `gitnexus_impact({target, direction:"upstream"})` → report blast radius; warn on HIGH/CRITICAL. Never edit a function/class/method without it.
2. **Before committing:** `gitnexus_detect_changes()` to confirm only expected symbols/flows changed. Never rename with find-and-replace — use `gitnexus_rename`.
3. **After each phase:** `npx tsc --noEmit` = 0 errors AND `npx next build` = exit 0. Both must stay green.
4. **No silent mocks:** every wired page reads real data or shows a clean "قريباً" / not-found state. Nothing fakes being real. Grep `MOCK_|بيانات تجريبية|createPaymentIntentStub|JUDGE47|AHMED20|demo-client` → only inside explicitly-gated sections.
5. **Payments stay gated** behind the `payments_gateway` flag until Phase 4 provider decision. Never wire a real provider without explicit authorization.
6. **Never commit `.env.local`** (contains `SUPABASE_SERVICE_ROLE_KEY` + n8n keys).

---

## Suggested order (critical path)

```
Phase 0  (apply migrations)        ──┐
Phase 2  (DB schema/RLS blockers)   ──┤── unblock real end-to-end DB mode
Phase 1  (audit deferrals)          ──┘
        ↓
Phase 3  (library finishing)            ← independent, can parallelize
Phase 5.1 (n8n Section A)               ← launch blocker (client↔lawyer flow)
        ↓
Phase 6  (sector dashboards)            ← depends on Phase 2 #9 trigger
        ↓
Phase 4  (payments real provider)       ← business decision gates this
Phase 5.2 (n8n Section B + billing WFs)  ← depends on Phase 4
        ↓
Phase 7  (security + beta teardown)      ← pre-prod hardening
Phase 8  (deploy hardening + SEO + CI)  ← prod launch readiness
```

**Minimum viable launch = Phase 0 + 2 + 1 + 5.1.** Everything else is post-launch hardening, new sectors, or revenue (payments).

---

## Effort summary

| Phase | Scope | Est. effort |
|-------|-------|-------------|
| 0 — Migrations | 2 migrations + deploy.sh | 0.5 day |
| 1 — Audit deferrals | detail pages, error sweep, mock remnants | 2–3 days |
| 2 — DB/RLS blockers | 7 SQL/API fixes | 1–2 days |
| 3 — Library finishing | dev-flag, FTS, pagination, parser fixes | 2–3 days |
| 4 — Payments | full gateway integration | 5–8 days (gated on decision) |
| 5 — n8n | Section A (launch) + Section B | 18–25h (A) + 15–20h (B) |
| 6 — Sector dashboards | 6 sectors, ~50 items | 8–12 days |
| 7 — Security + beta teardown | RBAC, Zod, rate-limit, PDPL | 4–6 days |
| 8 — Deploy hardening | CI/CD, Sentry, SEO, monitoring | 3–5 days |

**To a real, hardened production launch: ~6–8 weeks of focused work**, with the client↔lawyer MVP achievable in ~1 week (Phases 0+2+1+5.1).