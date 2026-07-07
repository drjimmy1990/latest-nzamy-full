# 📚 NZAMY — Documentation Index

> **What this is:** a map of every Markdown file in the project — what each one contains, when you need it, and how fresh it is.
> **Generated:** 2026-06-29 · **Last updated:** 2026-07-05 (added the **production-fix cycle** docs — see §I, and the QA `test/` folder) · **Location:** `nzamy-website/` (plus 2 files in the parent `SITE MAPS NZAMY/` dir).
>
> **Legend:** ✅ Current/canonical · 🟡 Partially stale (trust the dated sections) · 🔴 Stale (historical only) · 📄 Reference · 🤖 Machine-read (AI instructions)

---

## Quick reference table

| File | Category | Status | When you need it |
|------|----------|--------|------------------|
| `CLAUDE.md` | AI instructions | 🤖 ✅ | Every session — Claude Code rules (GitNexus mandate) |
| `AGENTS.md` | AI instructions | 🤖 ✅ | Same as CLAUDE.md, for other agents |
| `../CLAUDE.md` + `../AGENTS.md` (parent) | AI instructions | 🤖 ✅ | Parent-repo GitNexus rules (repo `SITE MAPS NZAMY`) |
| `ARCHITECTURE.md` | Orientation | ✅ | "How is the codebase structured?" / "How does X work?" |
| `project_guide.md` | Orientation | 🟡 | Onboarding overview, 9 user types, stack |
| `project_reference.md` | Orientation | 🔴 | 6-phase progress overview (phases 3–6 outdated) |
| `PROJECT.md` | Orientation | 🟡 | Working on the **Admin Panel** (milestones + API contracts) |
| `ORIGINAL_REQUEST.md` | Orientation | 📄 | The original audit + admin-panel ask + acceptance criteria |
| `NEXT_STEPS.md` | Roadmap | ✅ | "What do I do next?" — phased action plan |
| `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | Build log | ✅ | **2026-07-06 entitlements + wiring build** — what shipped (7 phases) + apply/operate runbook (AR/EN) |
| `docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md` | Plan | ✅ | The implementation plan for the entitlements+wiring build |
| `docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md` | Spec | ✅ | The approved design (now implemented) |
| `BLOG_SEEDING_GUIDE.md` | Runbook | ✅ | **Seed the blog** — run `npm run seed:blog` to load `blog_final/` (608 articles) into `articles` (AR/EN) |
| `nzamy-audit-fix-status.md` | Roadmap | ✅ | What's fixed vs deferred (audit fix ledger) |
| `master_checklist.md` | Roadmap | 🟡 | Granular 6-phase deliverables checklist |
| `master_checklist2.md` | Roadmap | 🟡 | Older checklist variant (same purpose) |
| `production_readiness_audit.md` | Audit | 📄 | Finding bugs / pre-fix mock-data + RLS reference |
| `client_dashboard_audit.md` | Audit | 🔴 | Client dashboard dummy-data inventory (mostly fixed now) |
| `client_lawyer_functional_audit.md` | Audit | ✅ | Client+lawyer functional audit + fix plan + resolution status |
| `n8n_master_guide_latest.md` | n8n | ✅ | **Building n8n** — canonical 38-workflow spec |
| `n8n_BUILD_LOG_AND_TEST_GUIDE.md` | n8n | ✅ | **What's actually built** (AR/EN) — per-branch state + curl tests + go-live steps |
| `DEPLOY_AND_SMOKETEST_RUNBOOK.md` | Deployment | ✅ | Deploy this session's work + activate n8n + smoke-test the loop (AR/EN) |
| `n8n/README.md` | n8n | ✅ | Importing the 7 templates / payload contract / credentials |
| `n8n_workflows_list.md` | n8n | 📄 | Deep technical reference (superseded by master guide) |
| `n8n_workflows.md` | n8n | 📄 | Phase-4 AI workflow reference (superseded) |
| `workflows_roadmap.md` | n8n | 📄 | Older roadmap (superseded) |
| `legal_library_guide.md` | Library | ✅ | Seeding the library (parse → seed → verify flow) |
| `manual_seeding_guide.md` | Library | ✅ | Seeding by hand via Supabase SQL Editor (no scripts) |
| `search_implementation_guide.md` | Library | 🟡 | Search schema / FTS plan (predates the FTS route rewrite) |
| `library_testing_arabic.md` | Testing | ✅ | QA-testing the library (Arabic, step-by-step) |
| `client_lawyer_testing_arabic (1).md` | Testing | ✅ | QA-testing client + lawyer flows (Arabic) |
| `payments-gateway-admin-gate.md` | Payments | ✅ | Working on payments / the admin gate mechanism |
| `deployment_guide.md` | Deployment | 🟡 | Deploying to a Linux VPS (aaPanel + PM2 + Nginx) |
| `PRODUCTION_FIX_PLAN.md` | Fix cycle | ✅ | Round-1 production-blocker remediation spec (§7 = 8 per-blocker specs) |
| `PRODUCTION_FIX_IMPLEMENTATION.md` | Fix cycle | ✅ | What round-1 actually changed, file-by-file (companion to the plan) |
| `TEST_REVIEW_RECONCILIATION.md` | Fix cycle | ✅ | The owner's QA review (109 findings) classified vs our fixes |
| `TEST_REVIEW_FIX_PLAN.md` | Fix cycle | ✅ | Round-2 remediation spec (§4.1–§4.9, exact code/SQL) |
| `IMPLEMENTATION_STATUS.md` | Fix cycle | ✅ | Round-2 done-vs-deferred ledger; **current deploy state** |
| `PROJECT_STATUS_REVIEW_2026-07-06.md` | Fix cycle | ✅ | **Current** full-surface "what's actually left" audit (~411 pages/routes) + prioritized build order |
| `PRODUCT_COMPLETENESS_BACKLOG.md` | Roadmap | ✅ | **Full-product backlog** — 104 unbuilt/mock features (registration, community, blog, academy/LMS, media, sectors, admin, cross-cutting) + 5-wave build order |
| `دليل_اختبار_المالك.md` | Testing | ✅ | Arabic owner test guide (what to re-test on live) |
| `test/` (folder) | Testing | 📄 | The owner's returned QA review — `README.md` (52 cases), `modifications/` (10 proposed edits), `screenshots/` |

---

## 🤖 A. AI agent instructions (read every session)

### `CLAUDE.md` · `AGENTS.md` (in `nzamy-website/`)
- **Contains:** GitNexus code-intelligence rules — `MUST run impact() before editing any symbol`, `MUST run detect_changes() before commit`, `MUST warn on HIGH/CRITICAL risk`, `NEVER rename with find-and-replace`. Lists the index name (`latest-nzamy-full`), resources, and skill-file pointers.
- **When you need it:** It's auto-loaded into every Claude Code session — you don't open it manually. It's the contract the AI follows for safe edits.
- **Status:** ✅ Current.

### `../CLAUDE.md` + `../AGENTS.md` (parent `SITE MAPS NZAMY/` dir)
- **Contains:** The same GitNexus rules, scoped to the parent repo index `SITE MAPS NZAMY` (12406 symbols).
- **When you need it:** Only relevant when working from the parent directory / that index. The `nzamy-website/` copies take precedence for this codebase.

---

## 🧭 B. Project orientation & architecture

### `ARCHITECTURE.md`
- **Contains:** Auto-generated codebase map from the GitNexus graph — 948 files, 15k+ symbols, 300 execution flows, 83 functional areas, 66 API routes. The 4 audience dashboards, public surfaces, backend layer.
- **When you need it:** "How is the project structured?", "Where does X live?", "How many API routes / functional areas are there?" Refresh with `npx gitnexus analyze` then re-generate.
- **Status:** ✅ 2026-06-28.

### `project_guide.md`
- **Contains:** "Complete Project Guide" v3.1 — architecture overview table (frontend/backend/automation/WhatsApp/payments/hosting status), the 9 user types, and broad scope.
- **When you need it:** Onboarding / a friendly overview of the whole platform and who it serves.
- **Status:** 🟡 2026-06-23 — the n8n/payments/hosting status columns are outdated (n8n trigger layer is now built; see `n8n_master_guide_latest.md`).

### `project_reference.md`
- **Contains:** "Single source of truth" 6-phase progress overview with ASCII progress bars (Phase 1 / 2 / 2.5 / 2.5L = 100%; Phases 3–6 = 0%).
- **When you need it:** A quick progress snapshot.
- **Status:** 🔴 2026-06-05 — **stale.** Phases 3–6 figures and many "pending" notes are outdated. Trust `NEXT_STEPS.md` + `nzamy-audit-fix-status.md` for current progress instead.

### `PROJECT.md`
- **Contains:** Admin Panel Integration plan — 3 milestones, interface contracts for `/api/v1/admin/{library,verifications,marketplace,erp,teams}`, code layout.
- **When you need it:** Specifically when working on the **admin panel** backend/tabs.
- **Status:** 🟡 Milestones are marked PLANNED but most are now implemented — use as a contract reference, not a status source.

### `ORIGINAL_REQUEST.md`
- **Contains:** The original user requests (2026-06-16 audit ask + 2026-06-27 admin-panel ask) with full requirements R1–R4 and acceptance criteria.
- **When you need it:** Understanding the original scope/ask, or checking acceptance criteria for the audit + admin panel.
- **Status:** 📄 Historical record.

---

## 🗺️ C. Roadmap, status & next steps

### `NEXT_STEPS.md`
- **Contains:** The phased action roadmap (Phase 0–5) with checkboxes — client/lawyer flow finishing, library finishing, payments, deployment. Cross-cutting rules (never commit `.env.local`, payments stay gated, no silent mocks).
- **When you need it:** "What should I work on next?" / planning the next chunk of work.
- **Status:** ✅ Updated 2026-06-29 (Phase 3 library items marked done + FTS regression noted).

### `nzamy-audit-fix-status.md`
- **Contains:** The audit fix ledger — what each finding was, what's fixed, what's deferred. Includes the 2026-06-29 full audit + fix-pass sections (library, client/lawyer dashboards, events/n8n, migrations).
- **When you need it:** Tracking what's been fixed vs still deferred; the most accurate "current state of fixes" doc.
- **Status:** ✅ Updated 2026-06-29.

### `master_checklist.md`
- **Contains:** Granular 6-phase deliverables checklist (148/289 items, 51%) — Phase 1 foundation through deployment, item by item.
- **When you need it:** Detailed progress tracking across every deliverable.
- **Status:** 🟡 2026-06-23 — percentages drift; cross-check with `nzamy-audit-fix-status.md`.

### `master_checklist2.md`
- **Contains:** An older checklist variant (same 6-phase structure, per-item checkboxes).
- **When you need it:** Redundant with `master_checklist.md` — pick one. Prefer `master_checklist.md`.
- **Status:** 🟡 2026-06-23.

---

## 🔍 D. Audits (findings)

### `production_readiness_audit.md`
- **Contains:** The big production-readiness audit — hardcoded mock-data locations (client + lawyer), data-shape mismatches, schema/RLS blocks, with exact TypeScript + SQL remediation code. §1 dashboards, §2 schema/RLS issues 2.1–2.9.
- **When you need it:** Investigating a bug's origin, or the pre-fix reference for what was wrong. The remediations are largely applied now.
- **Status:** 📄 Reference (findings pre-date the fix passes).

### `client_dashboard_audit.md`
- **Contains:** Client dashboard dummy-data inventory — per-page data sources + status (real vs deferred).
- **When you need it:** Historical view of which client pages were mock vs real.
- **Status:** 🔴 2026-06-04 — **stale.** Most "deferred" pages (wallet, referral) are now wired; consult `nzamy-audit-fix-status.md` instead.

### `client_lawyer_functional_audit.md`
- **Contains:** Client + lawyer dashboard functional audit + fix plan (F0–F8, L1–L18, C1–C12, B1–B14) with severity ratings and a resolution-status section tracking what's now fixed.
- **When you need it:** Deep functional review of client/lawyer write-actions and which findings are resolved.
- **Status:** ✅ 2026-06-28 (resolution-status section kept current).

---

## 🤖 E. n8n / automation

> **Reality (2026-06-29):** 0 workflows are built/running in any n8n instance. The Next.js trigger layer is built; 7 JSON templates are importable files only. Building n8n is the next step.

### `n8n_master_guide_latest.md` ← **CANONICAL**
- **Contains:** The one n8n doc you need — 38 workflows (20 operational + 18 AI), phased build plan, payload contract, webhook URL registry, API routes to create, credentials, progress tracker. Has the build-status banner.
- **When you need it:** Building/importing n8n workflows.
- **Status:** ✅ Updated 2026-06-29.

### `n8n/README.md` ← **integration contract**
- **Contains:** The contract binding the 7 template files to the app — payload shape, event vocabulary table, import steps, trigger options (A: Next.js push / B: Supabase DB webhooks), env vars, Supabase DB webhooks table, credentials, per-workflow index, known gaps.
- **When you need it:** Importing templates, wiring credentials, understanding the payload/event contract.
- **Status:** ✅ Updated 2026-06-29.

### `n8n_workflows_list.md`
- **Contains:** Full 38-workflow technical spec — exact triggers, node sequences, input/output payloads, target DB updates. Has a "superseded" banner.
- **When you need it:** Deep technical reference for a specific workflow's payload/node detail.
- **Status:** 📄 Superseded by `n8n_master_guide_latest.md`; kept for detail.

### `n8n_workflows.md`
- **Contains:** Phase-4 / 18 AI-workflow spec with implementation checkboxes. Has a "superseded" banner.
- **When you need it:** Reference for AI-tool workflows only.
- **Status:** 📄 Superseded.

### `workflows_roadmap.md`
- **Contains:** Two lists — build-now (client/lawyer flows) vs later. Points to `n8n/README.md` as the contract.
- **When you need it:** Historical prioritization reference.
- **Status:** 📄 Superseded.

---

## 📚 F. Legal library, search & seeding

### `legal_library_guide.md`
- **Contains:** Library seeding & execution-flow blueprint — env setup, parsing, seeding, verification commands, architectural flow.
- **When you need it:** Seeding the legal library from parsed data.
- **Status:** ✅ Current (reflects `seed-library.ts` + `--clean` which is now implemented).

### `manual_seeding_guide.md`
- **Contains:** Hand-seeding via Supabase SQL Editor — no scripts, paste SQL queries one record at a time. Schema-emptiness check + per-table inserts.
- **When you need it:** Seeding a few records manually without running the scripts.
- **Status:** ✅ Current.

### `search_implementation_guide.md`
- **Contains:** Search/advanced-search implementation plan — DB schema for laws/articles/principles/books, GIN indexes, generated `tsvector` columns, API + UI plan.
- **When you need it:** Understanding the search schema design. ⚠️ Predates the 2026-06-29 FTS route rewrite (routes now use `textSearch('fts',...)`); the schema part is still accurate, the route behavior has changed (and Arabic normalization regressed — see `library_testing_arabic.md` #4).
- **Status:** 🟡 Schema accurate, route section outdated.

---

## 🧪 G. QA testing guides (Arabic)

### `library_testing_arabic.md`
- **Contains:** Step-by-step Arabic QA guide for the legal library — 30 numbered test scenarios (browse, search, autocomplete, detail pages, smart folders, notes, AI tools, paywalls, admin, RTL/print) + a "known notes" status table + bug-report template + final launch checklist.
- **When you need it:** QA-testing the library before launch.
- **Status:** ✅ Updated 2026-06-29 (known-notes table reflects fixes + FTS regression).

### `client_lawyer_testing_arabic (1).md`
- **Contains:** Step-by-step Arabic QA guide for client + lawyer dashboards — client-only tests, lawyer-only tests, shared flows (request → assign → chat), with checkboxes.
- **When you need it:** QA-testing client/lawyer flows end-to-end.
- **Status:** ✅ Current.

---

## 💳 H. Payments & deployment

### `payments-gateway-admin-gate.md`
- **Contains:** The payments admin-gate mechanism — `platform_settings.payments_gateway` flag (`disabled`/`test`/`live`), `getPaymentGatewayStatus()`, admin UI, the 3 client call-sites that short-circuit when disabled, server-side defense, banner rules. How to wire a real provider later.
- **When you need it:** Working on payments, or understanding why payments are gated.
- **Status:** ✅ Current.

### `deployment_guide.md`
- **Contains:** Linux VPS deployment guide — aaPanel (SSL + Nginx) + PM2, prerequisites, server prep, step-by-step.
- **When you need it:** Deploying the app to production.
- **Status:** 🟡 2026-06-05 — steps are sound but predate recent migrations/code; re-verify env var list against current `.env.example`.

---

## 🚀 I. Production-fix cycle (2026-07-01 → 2026-07-05)

> **What this is:** the two remediation rounds that took the app from the 2026-07-01 production-readiness review to a deployed beta. All committed + pushed + **deployed** (`a5b10c3` round 1; `c7b0867` + `5e23b6c` round 2; PM2 reload 2026-07-05 18:43). Read these as: **plan → implementation → status**, in order.

### `PRODUCTION_FIX_PLAN.md` (round 1 — spec)
- **Contains:** the full remediation spec for the 6 verified production blockers (client-workflow IDOR, dead library search, paywall bypass, always-mock lawyer profile, fabricated my-group billing, fake content) — §7 = 8 per-blocker specs (exact code/SQL/acceptance), §8 = hardening gaps, sequencing, migration order, deploy checklist.
- **When you need it:** the "why + how" behind round 1; the source of truth for the deferred hardening items.
- **Status:** ✅ 2026-07-01 (one cosmetic `$`-artifact in an example SQL block; real migration files are correct).

### `PRODUCTION_FIX_IMPLEMENTATION.md` (round 1 — what shipped)
- **Contains:** file-by-file record of what round 1 changed, with decisions/deviations. Companion to the plan.
- **When you need it:** verifying exactly which files/behaviours round 1 touched.
- **Status:** ✅ Updated 2026-07-05 (committed + deployed; the §7.5 edit-form deferral is now resolved in round 2).

### `TEST_REVIEW_RECONCILIATION.md` (round 2 — the owner's QA, classified)
- **Contains:** the owner's QA tester review (52 cases run against live nezamy.sa, 10 proposed modifications, ~50 screenshots) reconciled into 109 findings, each classified FIXED_BY_US / STILL_OPEN / PRODUCT_UX / etc. against the current source.
- **When you need it:** deciding what the QA round actually requires vs. what our commits already cover.
- **Status:** ✅ Updated 2026-07-05 (fixes now deployed; LAWYER-6.1/6.3 marked resolved).

### `TEST_REVIEW_FIX_PLAN.md` (round 2 — spec)
- **Contains:** the round-2 remediation spec (§4.1–§4.9) with exact code/SQL, reviewer corrections folded in — beta teardown, honest AI gating, lawyer/client UX bugs, lawyer profile PII + edit-form, plus the deferred library work (search/FTS, book detail, persistence).
- **When you need it:** implementing any remaining §4.x item (esp. the deferred library work when real data is seeded).
- **Status:** ✅ 2026-07-05.

### `IMPLEMENTATION_STATUS.md` (round 2 — done vs deferred) ← **current deploy state**
- **Contains:** what round 2 implemented (§4.1/§4.4/§4.3/§4.9/§4.2) vs. what's deferred and why (library search+FTS, book detail, persistence→DB, tester-mod merge). Header carries the live commit + deploy + pending-migration state.
- **When you need it:** "where are we right now, and what's the next safe chunk?"
- **Status:** ✅ 2026-07-05 — the most current fix-cycle status doc.

### `test/` (folder) — the owner's returned QA review
- **Contains:** `README.md` (52 numbered Arabic test cases + findings), `modifications/` (10 proposed code edits — 2 conflict with our fixes, 4 would reintroduce removed fake data; merge deliberately), `screenshots/` (~50 bug shots). Excluded from `tsconfig` (the modification files have broken imports by design).
- **When you need it:** re-testing on live, or cherry-picking the tester's modifications (§4.8, deferred).
- **Status:** 📄 Input artifact (committed `4a043cb`).

### `دليل_اختبار_المالك.md` — Arabic owner test guide
- **Contains:** the Arabic guide sent to the owner describing what to re-test on the live site after deploy.
- **Status:** ✅ (committed `b93521a`).

---

## ⚡ Where to start (cheat sheet)

| You want to… | Read this first |
|--------------|-----------------|
| Know the current production-fix + deploy state | `IMPLEMENTATION_STATUS.md` (then the §I fix-cycle set) |
| See the full-product build backlog (post-beta) | `PRODUCT_COMPLETENESS_BACKLOG.md` |
| Know what to work on next | `NEXT_STEPS.md` |
| See what's fixed vs deferred | `nzamy-audit-fix-status.md` |
| Understand the codebase structure | `ARCHITECTURE.md` |
| See what n8n is built + how to test it | `n8n_BUILD_LOG_AND_TEST_GUIDE.md` |
| Deploy + activate + smoke-test | `DEPLOY_AND_SMOKETEST_RUNBOOK.md` |
| Build/plan more n8n workflows | `n8n_FINAL_MASTER_PLAN.md` → `n8n_master_guide_latest.md` |
| Seed the library | `legal_library_guide.md` (scripts) or `manual_seeding_guide.md` (SQL) |
| QA-test before launch | `library_testing_arabic.md` + `client_lawyer_testing_arabic (1).md` |
| Work on the admin panel | `PROJECT.md` |
| Deploy | `deployment_guide.md` |
| Work on payments | `payments-gateway-admin-gate.md` |
| Find a bug's origin | `production_readiness_audit.md` + `client_lawyer_functional_audit.md` |
| Onboard to the project | `project_guide.md` (then `ARCHITECTURE.md`) |

---

> **Trust hierarchy when docs conflict:** for **"what's left to build" / current state**, `PROJECT_STATUS_REVIEW_2026-07-06.md` wins (newest, verified page-by-page). For the **production-fix cycle / deploy state**, `IMPLEMENTATION_STATUS.md` + the §I set win (2026-07-05). For everything else, `nzamy-audit-fix-status.md` + `NEXT_STEPS.md` + `ARCHITECTURE.md` + `n8n_master_guide_latest.md` are the source of truth. `project_reference.md`, `client_dashboard_audit.md`, and the three superseded n8n docs are historical — don't rely on them for current status.