# 📚 NZAMY — Documentation Index

> **What this is:** a map of every Markdown file in the project — what each one contains, when you need it, and how fresh it is.
> **Generated:** 2026-06-29 · **Last updated:** 2026-07-16 (cleanup and sprint status updates) · **Location:** `nzamy-website/`.
>
> **Legend:** ✅ Current/canonical · 🟡 Partially stale (trust the dated sections) · 🔴 Stale (historical only) · 📄 Reference · 🤖 Machine-read (AI instructions) · 🗄️ Archived

---

## Quick reference table

| File | Category | Status | When you need it |
|------|----------|--------|------------------|
| `CLAUDE.md` | AI instructions | 🤖 ✅ | Every session — Claude Code rules (GitNexus mandate) |
| `AGENTS.md` | AI instructions | 🤖 ✅ | Same as CLAUDE.md, for other agents |
| `../CLAUDE.md` + `../AGENTS.md` (parent) | AI instructions | 🤖 ✅ | Parent-repo GitNexus rules (repo `SITE MAPS NZAMY`) |
| `ARCHITECTURE.md` | Orientation | ✅ | "How is the codebase structured?" / "How does X work?" |
| `OLD/project_guide.md` | Orientation | 🗄️ | Archived — onboarding overview, 9 user types, stack |
| `OLD/project_reference.md` | Orientation | 🔴 | Archived — 6-phase progress overview (phases 3–6 outdated) |
| `PROJECT.md` | Orientation | 🟡 | Working on the **Admin Panel** (milestones + API contracts) |
| `OLD/ORIGINAL_REQUEST.md` | Orientation | 🗄️ | Archived — original request log |
| `OLD/NEXT_STEPS.md` | Roadmap | 🔴 | Archived — old phased action plan (superseded by REMAINING_WORK.md) |
| `OLD/ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | Build log | 🗄️ | Archived — 2026-07-06 entitlements + wiring build |
| `docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md` | Plan | ✅ | The implementation plan for the entitlements+wiring build |
| `docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md` | Spec | ✅ | The approved design (now implemented) |
| `BLOG_GUIDE.md` | Runbook | ✅ | **Seed the blog** — where to put `test/newblog/blog_final/`, the SQL-Editor migration, and `npm run blog:reseed` for 608 articles + 614 WebP covers |
| `OLD/BLOG_SEEDING_GUIDE.md` | Runbook | 🗄️ | Archived — superseded by `BLOG_GUIDE.md` |
| `OLD/nzamy-audit-fix-status.md` | Roadmap | 🔴 | Archived — old audit fix status |
| `OLD/master_checklist.md` | Roadmap | 🔴 | Archived — old granular deliverables checklist |
| `OLD/master_checklist2.md` | Roadmap | 🔴 | Archived — older checklist variant |
| `OLD/production_readiness_audit.md` | Audit | 🔴 | Archived — production readiness audit findings |
| `OLD/client_dashboard_audit.md` | Audit | 🔴 | Archived — client dashboard mock data audit |
| `OLD/client_lawyer_functional_audit.md` | Audit | 🔴 | Archived — client+lawyer functional audit |
| `n8n_master_guide_latest.md` | n8n | ✅ | **Building n8n** — canonical 38-workflow spec |
| `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md` | n8n | 🗄️ | Archived — n8n build log and test guide |
| `DEPLOY_AND_SMOKETEST_RUNBOOK.md` | Deployment | ✅ | Deploy this session's work + activate n8n + smoke-test the loop |
| `n8n/README.md` | n8n | ✅ | Importing the 7 templates / payload contract / credentials |
| `OLD/n8n_workflows_list.md` | n8n | 🔴 | Archived — deep technical reference (superseded by master guide) |
| `OLD/n8n_workflows.md` | n8n | 🔴 | Archived — Phase-4 AI workflow reference |
| `OLD/workflows_roadmap.md` | n8n | 🔴 | Archived — older n8n workflows roadmap |
| `OLD/legal_library_guide.md` | Library | 🗄️ | Archived — library seeding and execution flow |
| `OLD/manual_seeding_guide.md` | Library | 🗄️ | Archived — hand-seeding via Supabase SQL Editor |
| `OLD/search_implementation_guide.md` | Library | 🔴 | Archived — search/advanced-search implementation plan |
| `OLD/library_testing_arabic.md` | Testing | 🗄️ | Archived — library testing arabic QA guide |
| `OLD/client_lawyer_testing_arabic (1).md` | Testing | 🗄️ | Archived — client+lawyer testing arabic QA guide |
| `OLD/payments-gateway-admin-gate.md` | Payments | 🗄️ | Archived — payments admin-gate mechanism |
| `deployment_guide.md` | Deployment | 🟡 | Deploying to a Linux VPS (aaPanel + PM2 + Nginx) |
| `OLD/PRODUCTION_FIX_PLAN.md` | Fix cycle | 🗄️ | Archived — Round-1 production-blocker remediation spec |
| `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` | Fix cycle | 🗄️ | Archived — Round-1 implementation details |
| `OLD/TEST_REVIEW_RECONCILIATION.md` | Fix cycle | 🗄️ | Archived — owner's QA review reconciliation |
| `OLD/TEST_REVIEW_FIX_PLAN.md` | Fix cycle | 🗄️ | Archived — Round-2 remediation spec |
| `IMPLEMENTATION_STATUS.md` | Fix cycle | ✅ | Round-2 done-vs-deferred ledger; **current deploy state** |
| `PROJECT_STATUS_REVIEW_2026-07-06.md` | Fix cycle | ✅ | **Current** full-surface "what's actually left" audit (~411 pages/routes) + prioritized build order |
| `OLD/PRODUCT_COMPLETENESS_BACKLOG.md` | Roadmap | 🔴 | Archived — full-product backlog (superseded by REMAINING_WORK.md) |
| `دليل_اختبار_المالك.md` | Testing | ✅ | Arabic owner test guide (what to re-test on live) |
| `test/` (folder) | Testing | 📄 | The owner's returned QA review — `README.md` (52 cases), `modifications/` |
| `REMAINING_WORK.md` | Roadmap | ✅ | "What's left to build" — canonical remaining work ledger (post July 16 sprint) |
| `MASTER_PRIORITY_LIST_2026-07-16.md` | Roadmap | ✅ | Master priorities, roadmap, and Sprint checklist (last updated July 16) |
| `project_review_report.md` | Audit | ✅ | Canonical review report outlining full codebase status review |
| `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md` | Testing | ✅ | Step-by-step Arabic QA test guide for Round 3 (14 fixes + remaining work) |
| `OLD/blog-system-newblog-migration.md` | Content | 🗄️ | Archived — migration guide for new blog system |
| `OLD/comprehensive_review_09072026.md` | Audit | 🔴 | Archived — comprehensive review of the project as of 2026-07-09 |
| `OLD/n8n_FINAL_MASTER_PLAN.md` | n8n | 🔴 | Archived — final master plan for n8n workflows |

---

## 🤖 A. AI agent instructions (read every session)

### `CLAUDE.md` · `AGENTS.md` (in `nzamy-website/`)
- **Contains:** GitNexus code-intelligence rules — `MUST run impact() before editing any symbol`, `MUST run detect_changes() before commit`, `MUST warn on HIGH/CRITICAL risk`, `NEVER rename with find-and-replace`. Lists the index name (`latest-nzamy-full`), resources, and skill-file pointers.
- **When you need it:** It's auto-loaded into every Claude Code session — you don't open it manually. It's the contract the AI follows for safe edits.
- **Status:** ✅ Current.

### `../CLAUDE.md` + `../AGENTS.md` (parent `SITE MAPS NZAMY/` dir)
- **Contains:** The same GitNexus rules, scoped to the parent repo index `SITE MAPS NZAMY`.
- **When you need it:** Only relevant when working from the parent directory.

---

## 🧭 B. Project orientation & architecture

### `ARCHITECTURE.md`
- **Contains:** Auto-generated codebase map from the GitNexus graph — 948 files, 15k+ symbols, 300 execution flows, 83 functional areas, 66 API routes.
- **Status:** ✅ 2026-06-28.

### `OLD/project_guide.md`
- **Contains:** "Complete Project Guide" v3.1 — architecture overview table, user types, and scope.
- **Status:** 🗄️ Archived.

### `OLD/project_reference.md`
- **Contains:** progress overview with ASCII progress bars.
- **Status:** 🔴 Archived / Stale.

### `PROJECT.md`
- **Contains:** Admin Panel Integration plan — 3 milestones, interface contracts, code layout.
- **Status:** 🟡 Milestones are marked PLANNED but most are now implemented.

### `OLD/ORIGINAL_REQUEST.md`
- **Contains:** The original user request logs.
- **Status:** 🗄️ Archived.

---

## 🗺️ C. Roadmap, status & next steps

### `REMAINING_WORK.md`
- **Contains:** The canonical remaining work ledger (post-July 16 sprint) — "What's left to build".
- **Status:** ✅ Current.

### `MASTER_PRIORITY_LIST_2026-07-16.md`
- **Contains:** Master priorities, roadmap, and Sprint checklist.
- **Status:** ✅ Current.

### `OLD/NEXT_STEPS.md`
- **Contains:** Old phased action roadmap (Phase 0–5) with checkboxes.
- **Status:** 🔴 Archived / Stale.

### `OLD/nzamy-audit-fix-status.md`
- **Contains:** Old audit fix ledger.
- **Status:** 🔴 Archived / Stale.

### `OLD/master_checklist.md` · `OLD/master_checklist2.md`
- **Contains:** Granular deliverables checklist.
- **Status:** 🔴 Archived / Stale.

---

## 🔍 D. Audits & reviews (findings)

### `project_review_report.md`
- **Contains:** Canonical review report outlining full codebase status review.
- **Status:** ✅ Current.

### `OLD/production_readiness_audit.md`
- **Contains:** Production readiness audit details.
- **Status:** 🔴 Archived / Stale.

### `OLD/client_dashboard_audit.md`
- **Contains:** Client dashboard dummy-data inventory.
- **Status:** 🔴 Archived / Stale.

### `OLD/client_lawyer_functional_audit.md`
- **Contains:** Client + lawyer dashboard functional audit and fix plans.
- **Status:** 🔴 Archived / Stale.

### `OLD/comprehensive_review_09072026.md`
- **Contains:** Comprehensive review of the project as of 2026-07-09.
- **Status:** 🔴 Archived / Stale.

---

## 🤖 E. n8n / automation

### `n8n_master_guide_latest.md`
- **Contains:** 38 workflows, webhook registry, progress tracker.
- **Status:** ✅ Current.

### `n8n/README.md`
- **Contains:** payload shapes, event vocabulary, integration steps.
- **Status:** ✅ Current.

### `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md`
- **Contains:** Curl tests and go-live steps for initial built workflows.
- **Status:** 🗄️ Archived.

### `OLD/n8n_workflows_list.md` · `OLD/n8n_workflows.md` · `OLD/workflows_roadmap.md` · `OLD/n8n_FINAL_MASTER_PLAN.md`
- **Contains:** Older workflows, specs, roadmaps, and plans.
- **Status:** 🔴 Archived / Stale.

---

## 📚 F. Legal library, search & seeding

### `library-toolkit/README.md`
- **Contains:** CLI toolkit guide (`parse`, `seed`, `clear`, `verify`, `status`, `reseed`).
- **Status:** ✅ Current.

### `OLD/legal_library_guide.md` · `OLD/manual_seeding_guide.md` · `OLD/search_implementation_guide.md`
- **Contains:** Legacy seeding and search plans.
- **Status:** 🗄️/🔴 Archived.

---

## 🧪 G. QA testing guides (Arabic)

### `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md`
- **Contains:** Step-by-step Arabic QA test guide for Round 3 (14 fixes + remaining work).
- **Status:** ✅ Current.

### `OLD/library_testing_arabic.md` · `OLD/client_lawyer_testing_arabic (1).md`
- **Contains:** Older Arabic QA testing guides.
- **Status:** 🗄️ Archived.

---

## 💳 H. Payments & deployment

### `deployment_guide.md`
- **Contains:** aaPanel PM2 Nginx VPS deployment guide.
- **Status:** 🟡 Partially stale.

### `OLD/payments-gateway-admin-gate.md`
- **Contains:** Old payments admin gate spec.
- **Status:** 🗄️ Archived.

---

## 🚀 I. Production-fix cycle

### `IMPLEMENTATION_STATUS.md`
- **Contains:** The current deploy state and remediation log.
- **Status:** ✅ Current.

### `PROJECT_STATUS_REVIEW_2026-07-06.md`
- **Contains:** Full status review of pages/routes.
- **Status:** ✅ Current.

### `OLD/PRODUCTION_FIX_PLAN.md` · `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` · `OLD/TEST_REVIEW_RECONCILIATION.md` · `OLD/TEST_REVIEW_FIX_PLAN.md`
- **Contains:** Round 1 and Round 2 fix specs and plans.
- **Status:** 🗄️ Archived.

---

## ⚡ Where to start (cheat sheet)

| You want to… | Read this first |
|--------------|-----------------|
| Know the current production-fix + deploy state | `IMPLEMENTATION_STATUS.md` (then `PROJECT_STATUS_REVIEW_2026-07-06.md`) |
| See the canonical remaining work ledger | `REMAINING_WORK.md` |
| View the sprint priority checklist | `MASTER_PRIORITY_LIST_2026-07-16.md` |
| Read the full codebase status review report | `project_review_report.md` |
| Run Round 3 QA step-by-step in Arabic | `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md` |
| Seed the library or check status | `library-toolkit/README.md` |
| See what n8n workflows are planned | `n8n_master_guide_latest.md` |
| Work on the admin panel | `PROJECT.md` |

---

> **Trust hierarchy when docs conflict:** for **"what's left to build" / current state**, `REMAINING_WORK.md` and `MASTER_PRIORITY_LIST_2026-07-16.md` win (updated July 16, 2026). For overall codebase status review, `project_review_report.md` is the canonical reference. For the **production-fix cycle / deploy state**, `IMPLEMENTATION_STATUS.md` is the source of truth. All files located in `OLD/` are archived or stale and should not be relied upon for active development.