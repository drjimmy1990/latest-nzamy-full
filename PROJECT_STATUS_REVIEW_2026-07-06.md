# NZAMY — Project Status Review

**Date:** 2026-07-06
**Scope:** Full-surface audit of the NZAMY app (Next.js 16 App Router + Supabase, Arabic/RTL legal-tech) in **scoped beta** (`BETA_MONOPOLY_MODE=true`, `BETA_REVIEW_MODE=true`, `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`).

**State of the project (one paragraph):** The beta's actual product — the **client ↔ Nzamy-lawyer core loop** (client creates a service-request → lawyer is assigned → chat/consultation → completed) — is genuinely built and Supabase/RLS-backed end to end on both the client and lawyer dashboards, and the API/auth layer that carries it is in good shape (58/67 routes auth-gated, 233 RLS policies, no service-role IDOR). The legal-library backend is real (10 `/api/library/*` routes, FTS, paywall) and only lacks a seeded corpus. **The single thing that makes the loop feel broken is that zero notifications fire** — no n8n workflow is active, and even the intended trigger mechanism (Supabase DB webhooks) was never created. Everything else that is mock is either outside the beta (5 sector dashboards + firm dashboard, 116 mock pages) or an honesty gap that should be gated (a handful of ungated `setTimeout` AI-result fakes). The operator-side beta ops (verify lawyers, manage users, flip payments mode, curate library) are real on the **admin** dashboard, not the firm dashboard.

**This document supersedes drift in older roadmaps.** Where they disagree with the audit findings below, this doc wins. Cross-references:
- [NEXT_STEPS.md](./NEXT_STEPS.md)
- [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md)
- [n8n_FINAL_MASTER_PLAN.md](./n8n_FINAL_MASTER_PLAN.md) (still the authoritative n8n build plan — 0 of its workflows are live yet)

**Status legend:** ✅ done · 🟡 partial · ⬜ not started

---

## 1. Executive summary

**Total audited:** ~411 pages/routes across 9 areas (client 22, lawyer 24, firm 48, other sectors 68, admin 39, AI 75, public+library 55, API 70, n8n 10).

**Reality per area** — "real" = live Supabase/API fetch (or BetaReviewGate-wrapped AI = honest-for-beta); "mock/stub" = hardcoded data presented as real; "coming-soon" = honest placeholder:

| Area | Audited | ✅ Real | 🟡 Mock/stub | ⬜ Coming-soon | Broken | Beta-relevant? |
|---|---:|---:|---:|---:|---:|---|
| Client dashboard | 22 | 16 | 2 | 4 | 0 | **YES — core loop lives here** |
| Lawyer dashboard | 24 | 15 | 3 | 6 | 0 | **YES — assign→work→complete** |
| Firm dashboard | 48 | 0 | 47 | 1 | 0 | Operator = admin, not this. Out of loop |
| Sector dashboards (biz/provider/micro/ngo/gov) | 68 | 0 | 68 | 0 | 0 | No — hidden by monopoly mode |
| Admin dashboard | 39 | 6 | 33 | 0 | 0 | **YES — 6 real ops tools carry the beta** |
| AI tools | 75 | 0 (44 gated-honest) | 3 | 28 | 0 | Partial — client/lawyer tools gated OK |
| Public + legal library | 55 | 14 | 30 | 3 | 0 | **YES — library real, corpus empty** |
| API + auth/RLS | 70 | 66 | 0 | 2 | 0 | **YES — solid backstop** |
| n8n automation | 10 | 1 | 0 | 0 | 3 | **YES — #1 blocker** |

**Headline:** The parts a beta client and beta lawyer actually touch are real. The mock mass (firm 47 + sectors 68 + admin 33 + AI shells) is overwhelmingly **outside** the client↔lawyer loop and behind `BETA_MONOPOLY_MODE`. The launch risk is concentrated in **n8n notifications (silence)** plus a **few ungated AI-fabrication fakes** and **one inconsistency in monopoly-mode gating**.

---

## 2. Beta launch blockers (do first)

These block or corrupt the client ↔ Nzamy-lawyer loop. Ranked.

> **✅ UPDATE 2026-07-06 — Phase 0 honesty-gates shipped** (commit `41007a5`; tsc 0 / eslint 0 / build exit 0). Blockers **#2, #3, #4, #5 below are now fixed**: the ungated AI fabrications (report-generator, smart-inspector, legal-opinion cross-exam + letter) are wrapped in `BetaReviewGate`; `/marketplace` + the services Featured-Lawyers block are gated behind `BETA_MONOPOLY_MODE`; the lawyer `sharing`/`activity`/`profile` surfaces are made honest. **Redeploy to make live.** Blocker **#1 (n8n notifications) remains — it is the launch gate.**

### 🥇 #1 — No notifications fire for the entire core loop · CRITICAL
- **Files:** `src/lib/n8n/dispatch.ts`, `supabase/migrations/`, `n8n/workflows/wf-*.json`
- **Why:** Client registers → creates request → lawyer assigned → completed, with **zero email/WhatsApp at any step**. Three independent failures stack:
  1. `dispatchToN8n` is inert (`N8N_WEBHOOK_BASE_URL` unset) **and nothing auto-calls it** — its only caller is `POST /api/v1/n8n/trigger`, which itself has **no caller anywhere in `src/`**.
  2. The intended production trigger — Supabase **DB webhooks** (INSERT `profiles`, INSERT `lawyer_profiles`, UPDATE `service_requests`) — **does not exist in any migration** (`grep net.http_post|supabase_functions.http_request` → nothing).
  3. **0 of 7** authored workflow JSONs are imported/active on `n8n.asra3.com` (6 empty draft containers); SMTP (Resend), WhatsApp (Evolution API), and LLM credentials are unconfigured.
- **Effort:** Large (multi-day). This is a build-from-zero: create DB-webhook migrations, import+activate ≥4 Section-A workflows (welcome, request-received, request-assigned, review-request), configure SMTP/WhatsApp/LLM creds, add `X-Webhook-Secret` validation. Blocked sub-item: WF 4.2 needs `consultations.reminder_sent`/`reminder_1h_sent` columns; WF 2.x needs `request_events.metadata jsonb` — both unmigrated.

### 🥈 #2 — report-generator fabricates a full legal report, offers download + vault-save, NO review gate · HIGH
- **File:** `src/app/ai/report-generator/page.tsx`
- **Why:** After `setTimeout(2800)` it renders `MOCK_REPORT` (fabricated case "نزاع تجاري شركة الأفق") under "اكتمل التوليد! جاهز للتنزيل", wired to `AiResultActions text={MOCK_REPORT}` with `showVault` + Download. A beta user gets fabricated legal analysis presented as a finished, savable, downloadable deliverable — exactly what `BETA_REVIEW_MODE` exists to prevent.
- **Effort:** Small — wrap result in `<BetaReviewGate>` or mark coming-soon (same pattern as the 44 already-gated AI pages).

### 🥉 #3 — Two more ungated `setTimeout` AI fabrications · MEDIUM
- **Files:** `src/app/ai/smart-inspector/page.tsx`, `src/app/ai/legal-opinion/page.tsx`
- **Why:** `smart-inspector` renders a fabricated case analysis after `setTimeout(2200)` with only a soft disclaimer, no gate. `legal-opinion` is a **priced (100 pts) lawyer core tool** whose `setTimeout(600)` → fabricated "الرأي الفصل" is both a trust and billing-legitimacy risk.
- **Effort:** Small — gate both with `<BetaReviewGate>` (batch with #2).

### #4 — `/marketplace` subtree not gated by `BETA_MONOPOLY_MODE` · HIGH (contradicts single-firm beta)
- **File:** `src/app/marketplace/layout.tsx` (+ `src/app/services/page.tsx`)
- **Why:** `lawyers/layout.tsx` correctly redirects the whole subtree to `/services/lawyers`, but the **larger** multi-vendor surface — `marketplace/` — has **no monopoly guard**. It renders mock data (hardcoded 248 requests) and is linked from `navigation.sidebars.business.ts` / `.legal.ts` (`/marketplace`, `/marketplace/post`, `/marketplace/collaborate`). Separately, `services/page.tsx` renders `FEATURED_LAWYERS` mock and a visible `Link href="/lawyers"` (line 421) that dead-end round-trips through the redirect. This exposes the very multi-vendor world the beta is meant to hide.
- **Effort:** Small — add the same redirect guard to `marketplace/layout.tsx`; remove/gate the `/lawyers` link and mock featured-lawyers on `services/page.tsx`.

### #5 — Lawyer-side honesty gaps on the client-visible path · HIGH/MEDIUM
- **Files:** `src/app/dashboard/lawyer/cases/[id]/sharing/page.tsx` (HIGH), `src/app/dashboard/lawyer/activity/page.tsx` (MEDIUM), `src/app/dashboard/lawyer/profile/page.tsx` (MEDIUM)
- **Why:**
  - **sharing** — 573-line page renders hardcoded `SHAREABLE_ITEMS` + guest-token/scope toggles that **do not persist** and have no coming-soon gate. It governs what the client sees of a case; the lawyer believes they're controlling client visibility while nothing saves.
  - **activity** — in supabase mode `getLawyerActivity()` runs, but on empty result it **keeps `MOCK_ACTIVITIES`** with no demo banner, so a brand-new beta lawyer sees invented history as real. Should render `EmptyState`.
  - **profile** — overview/identity is real (`apiGet /api/v1/profile`), but the **achievements** and **reviews** tabs render static arrays as-if-real — fabricated reputation on a client-facing surface.
- **Effort:** Small each — gate `sharing` قريباً (or wire a share store); `EmptyState` on empty activity; gate the two profile tabs.

> **Not blockers (verified real, don't re-audit):** client `createWorkflowRequest` re-throws on API failure and posts to the RLS-scoped `/api/v1/service-requests` (no silent localStorage fallback); `consultation/[id]` chat is genuinely wired (`getChatMessages` + `SessionChatPane` + Supabase realtime) with an honest pre-assignment state; lawyer consultations/hearings/contracts/cases are real via `workflowService.getWorkflowRequestsByReceiver`.

---

## 3. Beta operations gaps (operator tools)

The operator runs the beta from the **admin** dashboard (not firm). Six admin tools are **real and DB-backed** and cover the make-or-break ops:

| Ops tool | Status | Note |
|---|---|---|
| Lawyer/provider **verification** | ✅ | `/api/v1/admin/verifications` — `user_type==='admin'` gate → `createServiceClient()` over `lawyer_profiles`/`provider_profiles`; approve/reject wired |
| **User** list + detail | ✅ | real `/api/v1/admin/users` with admin RBAC |
| **Payments mode** toggle | ✅ | `payments_gateway.status` (disabled\|test\|live) via GET/PATCH `/api/v1/admin/settings` — fails **closed** |
| **Subscriptions** overview | ✅ | `/api/v1/admin/stats` |
| **Library** manager (browse/edit/delete/toggle-free) | 🟡 | real GET/DELETE/PATCH over `laws/decrees/principles/feqh_books` — **but cannot ADD** |

**Gaps the operator will hit:**

- 🟡 **Library manager cannot seed new records** — `src/app/dashboard/admin/tabs/LibraryTab.tsx` line 176 "إضافة سجل جديد" button has **no `onClick`**, and `/api/v1/admin/library` exposes only GET/DELETE/PATCH (**no POST**). Content admin is browse+prune only. This is the operational corollary of the known corpus-seeding deferral — **MEDIUM**, effort small (add POST + wire the form) but pairs with the seeding work.
- 🟡 **content/articles, community/moderation, tickets, team** (`src/app/dashboard/admin/community/moderation/page.tsx` et al.) mutate local `useState` from const arrays with **no persist** — if the beta needs live moderation/ticketing/team-role admin, these evaporate on reload. **MEDIUM**, only if those ops are needed during beta.
- ⚠️ **First admin screen is fabricated** — `admin/page.tsx` is entirely hardcoded charts (`MRR_DATA`, `USERS_TABLE`, `PLAN_DIST`, `AI_TOOLS`, `ALERTS`). `useAdminSettings.ts` is 100% localStorage (per-browser flags that evaporate on cache clear). Not blocking, but the operator's landing view is fake.

> **Note on the firm dashboard:** all 48 firm pages are mock (only `useUser()` name is live). Under monopoly mode the operator uses **admin**, not firm, so firm being mock does **not** block ops — but do not mistake firm for the operator surface.

---

## 4. Post-launch / not-blocking

Grouped. Known-deferred items are folded in and **not re-litigated**.

**A. Sector dashboards (quantified — 116 mock pages, out of the beta loop):**
- ⬜ **Firm dashboard: 47 of 48 pages mock** — clients/cases/cases-assign/consultations/team all hardcoded (`MOCK_CLIENTS`, `@/constants/firmCasesData`, `UNASSIGNED_CASES`, `MOCK_CONSULTS`, `MOCK_TEAM`). Only `governance` is an honest قريباً. **Not blocking because the operator uses admin, not firm** — but if firm is ever the intended operator surface, this is a full build.
- ⬜ **5 other sectors: 68 of 68 pages mock** (business 22, provider, micro 12, ngo 9, government 5) — **zero** real fetches anywhere; `provider/_data.tsx` fans a single mock module across all provider pages. Unreachable under `BETA_MONOPOLY_MODE`.
- Action when monopoly lifts: wire to Supabase, or gate with real `DashboardComingSoon` instead of mock arrays.

**B. AI tools:**
- ⬜ **0 of 75 AI pages hit a real backend** — every result is client-side `setTimeout` theater; `dispatch.ts` is inert until an n8n NZAMY workflow exists. 44/75 correctly `BetaReviewGate`-wrap example output (honest-for-beta).
- ⬜ 34 corp/gov/ngo AI tools target unbuilt sectors (30/34 already gated) — decide product status before exposing navbar entries.
- 🟡 Audit `contract-drafter` result surface (framing honest, draft not behind a gate).

**C. Legal library data-seeding (known-deferred — code complete, corpus empty):**
- ⬜ Seed corpus so `/api/library/search` + Arabic FTS return results.
- ⬜ Seed feqh books (`/book/[slug]` reader is real, data empty).
- ⬜ Seed judgments + wire `/api/library/judgment` (route intentionally `DashboardComingSoon`).
- 🟡 Verify paywall free/paid split once corpus exists (`checkLibraryAccess` tier + `order_index` gating is built).

**D. Persistence → DB (known-deferred):**
- ⬜ Client `cases/updates` hardcoded `SHARED_FROM_LAWYER`; `letters` workflow fabricates letter text via `setTimeout` with no gate → wire or mark قريباً.
- ⬜ Folders/notes/drafts, per-case notes, add-task/add-hearing, archive stores → DB.
- ⬜ academy (`COURSES`), community (`ALL_QUESTIONS`, localStorage), blog (`ARTICLES`) → CMS/DB.
- ⬜ Admin content/moderation/tickets/team/disputes/audit-log/broadcasts → DB; migrate `useAdminSettings` off localStorage to server settings.

**E. Cross-cutting hardening (known-deferred):**
- 🟡 **Zod validation** — 0/67 routes validate bodies (`request.json()` → Supabase). RLS + column projections contain blast radius; malformed/oversized payloads risk 500s. Start with write routes (`service-requests`, consultations, chat, community).
- 🟡 **Rate-limiting** — 0/67 routes. Must land **before/with** n8n webhooks: `/api/ai/explain-article` and `/api/ai/library-chat` are **unauthenticated** POST proxies to n8n → uncapped AI cost/abuse the moment webhooks go live. Public `/api/v1/lawyers` + `/api/library/*` scrape/DoS-able.
- ⬜ PDPL pass (data-retention, audit logging); per-request payload size limits.

**F. QA tester's 10 modifications** — merge (known-deferred).

---

## 5. Recommended sequence (critical path)

The goal is a **real** client↔lawyer beta, then expand. Order matters: notifications and honesty gates are cheap-to-medium and unblock trust; the n8n build is the long pole.

**Phase 0 — Honesty gates — ✅ DONE 2026-07-06 (commit `41007a5`):**
1. ✅ Gated `report-generator`, `smart-inspector`, `legal-opinion` (cross-exam + letter) with `<BetaReviewGate>` (blocker #2, #3).
2. ✅ Added monopoly redirect to `marketplace/layout.tsx`; hid `services/page.tsx` Featured-Lawyers block + `/lawyers` link (blocker #4).
3. ✅ Gated lawyer `sharing` قريباً; honest empty state on `activity`; removed profile achievements/reviews tabs (blocker #5).

**Phase 1 — n8n Section A build (the #1 blocker, multi-day, the long pole):**
4. Add the **missing migrations first**: `consultations.reminder_sent`/`reminder_1h_sent`, `request_events.metadata jsonb`.
5. Create **Supabase DB-webhook migrations** (INSERT `profiles`→/new-user, INSERT `lawyer_profiles`→/verification, UPDATE `service_requests`→/request-assigned|/request-completed) with `X-Webhook-Secret`. *(The app-side `dispatch.ts`/`trigger` path is a manual fallback with no auto-caller — the DB-webhook path is the production design.)*
6. Configure n8n creds (Resend SMTP, Evolution WhatsApp, LLM); import + **activate** the 4 Section-A workflows (welcome, request-received, request-assigned, review-request). Split shared `/request-status` into `/request-assigned` + `/request-completed` (plan §8.4).
7. Add **rate-limiting** on the two unauthenticated AI proxy routes **at the same time** webhooks go live (Section 4E).

**Phase 2 — Beta ops completeness (1–2 days):**
8. Add POST to `/api/v1/admin/library` + wire the "إضافة سجل جديد" form so the corpus can be seeded from the UI (Section 3).
9. Seed the initial legal corpus (laws + a few books) so library search/readers return content.

**Phase 3 — Hardening (before/with wider public exposure):**
10. Zod on write routes; PDPL retention/audit pass; payload size limits (Section 4E).
11. Merge the QA tester's 10 modifications.

**Phase 4 — Expansion (post-beta, when `BETA_MONOPOLY_MODE` lifts):**
12. Wire firm + 5 sector dashboards to Supabase (or gate honestly) — 116 mock pages.
13. Wire real AI paths through n8n (Phase 4 of the master plan — 18 AI legal-tool webhooks).
14. Real payments provider → un-gate paid submissions + billing dashboards.

---

*End of review. This is a decision doc for the owner: build order is Phase 0 → 1 → 2. The beta is closer than the mock-page count suggests — the real loop works; it just needs a voice (n8n) and a few honest gates.*
