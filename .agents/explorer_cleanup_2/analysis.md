# Analysis Report: Markdown Cleanup & Documentation Updates

**Date:** 2026-07-16  
**Agent:** teamwork_preview_explorer  
**Status:** Read-only Investigation Complete  

---

## 1. File Migration Plan (Root to `OLD/`)
A new directory `OLD/` (distinct from the existing lowercase `old/`) will be created at the repository root. The following 29 historical/obsolete Markdown files will be moved there, after which the empty lowercase `old/` directory will be deleted.

| Original File Path | New Target File Path | Description |
|--------------------|----------------------|-------------|
| `ORIGINAL_REQUEST.md` | `OLD/ORIGINAL_REQUEST.md` | Historical requirements |
| `PRODUCTION_FIX_IMPLEMENTATION.md` | `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` | Round 1 audit fixes reference |
| `PRODUCTION_FIX_PLAN.md` | `OLD/PRODUCTION_FIX_PLAN.md` | Round 1 audit fix plan |
| `PRODUCT_COMPLETENESS_BACKLOG.md` | `OLD/PRODUCT_COMPLETENESS_BACKLOG.md` | Obsolete product backlog |
| `TEST_REVIEW_FIX_PLAN.md` | `OLD/TEST_REVIEW_FIX_PLAN.md` | Round 2 QA fix plan |
| `TEST_REVIEW_RECONCILIATION.md` | `OLD/TEST_REVIEW_RECONCILIATION.md` | QA tester findings reconciliation |
| `blog-system-newblog-migration.md` | `OLD/blog-system-newblog-migration.md` | Historical blog migration |
| `client_dashboard_audit.md` | `OLD/client_dashboard_audit.md` | Pre-fix client dashboard audit |
| `client_lawyer_functional_audit.md` | `OLD/client_lawyer_functional_audit.md` | Pre-fix functional audit |
| `client_lawyer_testing_arabic (1).md` | `OLD/client_lawyer_testing_arabic (1).md` | Old Arabic testing instructions |
| `comprehensive_review_09072026.md` | `OLD/comprehensive_review_09072026.md` | Obsolete audit findings |
| `library_testing_arabic.md` | `OLD/library_testing_arabic.md` | Old library test script |
| `manual_seeding_guide.md` | `OLD/manual_seeding_guide.md` | Hand-seeding SQL reference |
| `master_checklist.md` | `OLD/master_checklist.md` | Obsolete master checklist |
| `master_checklist2.md` | `OLD/master_checklist2.md` | Obsolete checklist variant |
| `n8n_BUILD_LOG_AND_TEST_GUIDE.md` | `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md` | Historical n8n logs |
| `n8n_FINAL_MASTER_PLAN.md` | `OLD/n8n_FINAL_MASTER_PLAN.md` | Obsolete n8n master plan |
| `n8n_workflows.md` | `OLD/n8n_workflows.md` | Old n8n workflows reference |
| `n8n_workflows_list.md` | `OLD/n8n_workflows_list.md` | Old n8n workflows technical list |
| `nzamy-audit-fix-status.md` | `OLD/nzamy-audit-fix-status.md` | Old audit fix ledger |
| `payments-gateway-admin-gate.md` | `OLD/payments-gateway-admin-gate.md` | Gated payments mechanism reference |
| `production_readiness_audit.md` | `OLD/production_readiness_audit.md` | Original readiness audit findings |
| `project_reference.md` | `OLD/project_reference.md` | Stale project references |
| `search_implementation_guide.md` | `OLD/search_implementation_guide.md` | Pre-FTS search design |
| `workflows_roadmap.md` | `OLD/workflows_roadmap.md` | Historical workflows roadmap |
| `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | `OLD/ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | Entitlements build log |
| `legal_library_guide.md` | `OLD/legal_library_guide.md` | Legacy library seeding guide |
| `project_guide.md` | `OLD/project_guide.md` | Outdated onboarding project guide |
| `old/BLOG_SEEDING_GUIDE.md` | `OLD/BLOG_SEEDING_GUIDE.md` | Archived seeder runbook |

*Note: `NEXT_STEPS.md` is NOT included in the move list because it remains an active roadmap reference in the root directory (status ✅).*

---

## 2. Proposed Updates to `DOCUMENTATION_INDEX.md`
To reflect new paths and accurately catalog newly added documents:

### A. Update paths and status indicators in the Quick Reference Table:
- Prefix all moved files with `OLD/`.
- Update status to `🔴` (Stale / Historical only) for all moved files.
- Add missing active files (`REMAINING_WORK.md`, `project_review_report.md`, and `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md`) with status `✅`.

#### Target replacements:
```markdown
| File | Category | Status | When you need it |
|------|----------|--------|------------------|
| `CLAUDE.md` | AI instructions | 🤖 ✅ | Every session — Claude Code rules (GitNexus mandate) |
| `AGENTS.md` | AI instructions | 🤖 ✅ | Same as CLAUDE.md, for other agents |
| `../CLAUDE.md` + `../AGENTS.md` (parent) | AI instructions | 🤖 ✅ | Parent-repo GitNexus rules (repo `SITE MAPS NZAMY`) |
| `ARCHITECTURE.md` | Orientation | ✅ | "How is the codebase structured?" / "How does X work?" |
| `OLD/project_guide.md` | Orientation | 🔴 | Onboarding overview, 9 user types, stack |
| `OLD/project_reference.md` | Orientation | 🔴 | 6-phase progress overview (phases 3–6 outdated) |
| `PROJECT.md` | Orientation | 🟡 | Working on the **Admin Panel** (milestones + API contracts) |
| `OLD/ORIGINAL_REQUEST.md` | Orientation | 🔴 | The original audit + admin-panel ask + acceptance criteria |
| `NEXT_STEPS.md` | Roadmap | ✅ | "What do I do next?" — phased action plan |
| `OLD/ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | Build log | 🔴 | **2026-07-06 entitlements + wiring build** — what shipped (7 phases) + apply/operate runbook (AR/EN) |
| `docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md` | Plan | ✅ | The implementation plan for the entitlements+wiring build |
| `docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md` | Spec | ✅ | The approved design (now implemented) |
| `BLOG_GUIDE.md` | Runbook | ✅ | **Seed the blog** — where to put `test/newblog/blog_final/`, the SQL-Editor migration, and `npm run blog:reseed` (clear → images → seed) for 608 articles + 614 WebP covers (AR/EN) |
| `OLD/BLOG_SEEDING_GUIDE.md` | Runbook | 🔴 | Archived — superseded by `BLOG_GUIDE.md` (old scalar-only seeder on `blog_final/`) |
| `OLD/nzamy-audit-fix-status.md` | Roadmap | 🔴 | What's fixed vs deferred (audit fix ledger) |
| `OLD/master_checklist.md` | Roadmap | 🔴 | Granular 6-phase deliverables checklist |
| `OLD/master_checklist2.md` | Roadmap | 🔴 | Older checklist variant (same purpose) |
| `OLD/production_readiness_audit.md` | Audit | 🔴 | Finding bugs / pre-fix mock-data + RLS reference |
| `OLD/client_dashboard_audit.md` | Audit | 🔴 | Client dashboard dummy-data inventory (mostly fixed now) |
| `OLD/client_lawyer_functional_audit.md` | Audit | 🔴 | Client+lawyer functional audit + fix plan + resolution status |
| `n8n_master_guide_latest.md` | n8n | ✅ | **Building n8n** — canonical 38-workflow spec |
| `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md` | n8n | 🔴 | **What's actually built** (AR/EN) — per-branch state + curl tests + go-live steps |
| `DEPLOY_AND_SMOKETEST_RUNBOOK.md` | Deployment | ✅ | Deploy this session's work + activate n8n + smoke-test the loop (AR/EN) |
| `n8n/README.md` | n8n | ✅ | Importing the 7 templates / payload contract / credentials |
| `OLD/n8n_workflows_list.md` | n8n | 🔴 | Deep technical reference (superseded by master guide) |
| `OLD/n8n_workflows.md` | n8n | 🔴 | Phase-4 AI workflow reference (superseded) |
| `OLD/workflows_roadmap.md` | n8n | 🔴 | Older roadmap (superseded) |
| `OLD/legal_library_guide.md` | Library | 🔴 | Seeding the library (parse → seed → verify flow) |
| `OLD/manual_seeding_guide.md` | Library | 🔴 | Seeding by hand via Supabase SQL Editor (no scripts) |
| `OLD/search_implementation_guide.md` | Library | 🔴 | Search schema / FTS plan (predates the FTS route rewrite) |
| `OLD/library_testing_arabic.md` | Testing | 🔴 | QA-testing the library (Arabic, step-by-step) |
| `OLD/client_lawyer_testing_arabic (1).md` | Testing | 🔴 | QA-testing client + lawyer flows (Arabic) |
| `OLD/payments-gateway-admin-gate.md` | Payments | 🔴 | Working on payments / the admin gate mechanism |
| `deployment_guide.md` | Deployment | 🟡 | Deploying to a Linux VPS (aaPanel + PM2 + Nginx) |
| `OLD/PRODUCTION_FIX_PLAN.md` | Fix cycle | 🔴 | Round-1 production-blocker remediation spec (§7 = 8 per-blocker specs) |
| `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` | Fix cycle | 🔴 | What round-1 actually changed, file-by-file (companion to the plan) |
| `OLD/TEST_REVIEW_RECONCILIATION.md` | Fix cycle | 🔴 | The owner's QA review (109 findings) classified vs our fixes |
| `OLD/TEST_REVIEW_FIX_PLAN.md` | Fix cycle | 🔴 | Round-2 remediation spec (§4.1–§4.9, exact code/SQL) |
| `IMPLEMENTATION_STATUS.md` | Fix cycle | ✅ | Round-2 done-vs-deferred ledger; **current deploy state** |
| `PROJECT_STATUS_REVIEW_2026-07-06.md` | Fix cycle | ✅ | **Current** full-surface "what's actually left" audit (~411 pages/routes) + prioritized build order |
| `OLD/PRODUCT_COMPLETENESS_BACKLOG.md` | Roadmap | 🔴 | **Full-product backlog** — 104 unbuilt/mock features (registration, community, blog, academy/LMS, media, sectors, admin, cross-cutting) + 5-wave build order |
| `دليل_اختبار_المالك.md` | Testing | ✅ | Arabic owner test guide (what to re-test on live) |
| `REMAINING_WORK.md` | Roadmap | ✅ | Consolidated remaining items & n8n workflows checklist |
| `project_review_report.md` | Audit | ✅ | Canonical audit report containing static analysis findings |
| `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md` | Testing | ✅ | Round 3 Arabic owner test guide (14 fixes + remaining work) |
| `test/` (folder) | Testing | 📄 | The owner's returned QA review — `README.md` (52 cases), `modifications/` (10 proposed edits), `screenshots/` |
```

### B. Update Detail Section Headers:
Rename individual headers to include `OLD/` paths:
- `### `project_guide.md`` -> `### `OLD/project_guide.md``
- `### `project_reference.md`` -> `### `OLD/project_reference.md``
- `### `ORIGINAL_REQUEST.md`` -> `### `OLD/ORIGINAL_REQUEST.md``
- `### `nzamy-audit-fix-status.md`` -> `### `OLD/nzamy-audit-fix-status.md``
- `### `master_checklist.md`` -> `### `OLD/master_checklist.md``
- `### `master_checklist2.md`` -> `### `OLD/master_checklist2.md``
- `### `production_readiness_audit.md`` -> `### `OLD/production_readiness_audit.md``
- `### `client_dashboard_audit.md`` -> `### `OLD/client_dashboard_audit.md``
- `### `client_lawyer_functional_audit.md`` -> `### `OLD/client_lawyer_functional_audit.md``
- `### `n8n_workflows_list.md`` -> `### `OLD/n8n_workflows_list.md``
- `### `n8n_workflows.md`` -> `### `OLD/n8n_workflows.md``
- `### `workflows_roadmap.md`` -> `### `OLD/workflows_roadmap.md``
- `### `legal_library_guide.md`` -> `### `OLD/legal_library_guide.md``
- `### `manual_seeding_guide.md`` -> `### `OLD/manual_seeding_guide.md``
- `### `search_implementation_guide.md`` -> `### `OLD/search_implementation_guide.md``
- `### `library_testing_arabic.md`` -> `### `OLD/library_testing_arabic.md``
- `### `client_lawyer_testing_arabic (1).md`` -> `### `OLD/client_lawyer_testing_arabic (1).md``
- `### `payments-gateway-admin-gate.md`` -> `### `OLD/payments-gateway-admin-gate.md``
- `### `PRODUCTION_FIX_PLAN.md` (round 1 — spec)` -> `### `OLD/PRODUCTION_FIX_PLAN.md` (round 1 — spec)`
- `### `PRODUCTION_FIX_IMPLEMENTATION.md` (round 1 — what shipped)` -> `### `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` (round 1 — what shipped)`
- `### `TEST_REVIEW_RECONCILIATION.md` (round 2 — the owner's QA, classified)` -> `### `OLD/TEST_REVIEW_RECONCILIATION.md` (round 2 — the owner's QA, classified)`
- `### `TEST_REVIEW_FIX_PLAN.md` (round 2 — spec)` -> `### `OLD/TEST_REVIEW_FIX_PLAN.md` (round 2 — spec)`

---

## 3. Proposed Updates to `MASTER_PRIORITY_LIST_2026-07-16.md`
To reflect findings from the July 16 Library Sprint and the Blog CMS commits:

### A. Update Header Metadata:
- **Before:**
  ```markdown
  > **Last updated:** 2026-07-16 17:30 (after commit `bfb3a5f`)
  ```
- **After:**
  ```markdown
  > **Last updated:** 2026-07-16 21:58 (after Library Sprint and Blog CMS commits up to `9fe1949`)
  ```

### B. Update Migrations List (under P0):
- **Before:**
  ```markdown
  - [ ] Apply **all pending Supabase migrations** (deploy-critical): `20260630_handle_new_user_sectors.sql`, `20260701_client_workflow_rls_assert.sql`, `20260701_smart_folder_items_display_cols.sql`, `20260705_lawyer_show_contact.sql` (without it `/api/v1/lawyers` 500s), `20260706_entitlement_requests.sql`, `20260706_draft_cart_payload.sql`, `20260706_content_and_ops.sql`, `20260706_articles_seed.sql`, `20260706_reminder_flags.sql`.
  ```
- **After:**
  ```markdown
  - [ ] Apply **all pending Supabase migrations** (deploy-critical): `20260630_handle_new_user_sectors.sql`, `20260701_client_workflow_rls_assert.sql`, `20260701_smart_folder_items_display_cols.sql`, `20260705_lawyer_show_contact.sql`, `20260706_entitlement_requests.sql`, `20260706_draft_cart_payload.sql`, `20260706_content_and_ops.sql`, `20260706_articles_seed.sql`, `20260706_reminder_flags.sql`, `20260716_blog_seo_aeo_geo.sql` (SEO optimization columns + section DB tables + storage bucket policies), `20260716_missing_fk_indexes.sql` (missing foreign key performance indexes), `20260716_security_hardening.sql` (security role lock triggers + signup whitelist restriction).
  ```

### C. Resolve Library Item under P2:
- **Before:**
  ```markdown
  - [x] ✅ **`/book/[slug]` broken** — PARTIALLY FIXED: `fetchBookBySlug` now queries `feqh_books` with correct `feqh_chapters/sections/blocks` joins. `fetchDecreeById` queries `decrees_circulars`. Search table maps corrected (6 fixes total). *(Hydration errors and fiqh-vs-secular classification still need review.)* *(commit bfb3a5f)*
  ```
- **After:**
  ```markdown
  - [x] ✅ **`/book/[slug]` and `/laws` database connection** — FULLY FIXED (shipped 2026-07-16): All table name mismatches resolved; `feqh-preview`, `civil-procedure`, and `law-metadata-map` connected to Supabase DB. Search, pagination, and paywall gating enforced against live DB records instead of mocks.
  ```

### D. Update Blog CMS Status under P5:
- **Before:**
  ```markdown
  - [ ] Blog admin: categories, article analytics, Meta Pixel/GA4/GTM, markdown bulk-uploader; add `/blog` to `LAWYER_SIDEBAR`/`LAWYER_SIDEBAR_LITE` in `navigation.sidebars.legal.ts`.
  ```
- **After:**
  ```markdown
  - [x] ✅ **Blog Categories & Rendering:** Dynamic category taxonomy from DB, server-side category filters, GFM-alert markdown renderer, resilient server-side rendering, and Table of Contents scroll-margin offsets.
  - [ ] Blog Admin Analytics & Tools: Article analytics, Meta Pixel/GA4/GTM, markdown bulk-uploader, and adding `/blog` to lawyer sidebars.
  ```

### E. Update Backlog Status under P7 Wave 3:
- **Before:**
  ```markdown
  - [ ] Blog CMS — verify entitlements-build articles table is live (P0); add categories/analytics/tracking (P5).
  ```
- **After:**
  ```markdown
  - [x] ✅ **Blog CMS Core (2026-07-16):** dynamic articles table backed by Supabase DB, public reading, admin authoring, covers in Supabase Storage, and JSON-LD structured data.
  - [ ] Blog Analytics/Tracking: Add article analytics, Meta Pixel/GA4/GTM (deferred).
  ```

---

## 4. Proposed Updates to `REMAINING_WORK.md`
To align remaining tasks with the latest status:

### A. Update Header Metadata & Recent Completions:
- **Before:**
  ```markdown
  > **Last commit:** `d1126a7` on `main` | **Build:** ✅ GREEN
  > **What's done:** 14 fixes shipped (5 P0 security + 5 P1 features + 4 P2 quality)
  >
  > ### 🆕 2026-07-16 Library Sprint Completion
  > Major library implementation work completed this session:
  > ...
  ```
- **After:**
  ```markdown
  > **Last commit:** `9fe1949` on `main` | **Build:** ✅ GREEN
  > **What's done:** 14 fixes shipped (commit `bfb3a5f`), followed by the July 16 Library and Blog CMS Sprints.
  >
  > ### 🆕 2026-07-16 Blog CMS & Library Sprint Completion
  > Major content systems completed this session:
  > - ✅ **Library Toolkit CLI** created with 6 commands (parse, seed, clear, verify, status, reseed)
  > - ✅ **supabaseLibrary.ts table names fixed** (law_chapters→chapters, law_articles→articles, law_amendments→article_amendments, removed phantom law_executive_regs)
  > - ✅ **SmartFolders wired to Supabase API** (dual-mode: API for auth, localStorage for guest)
  > - ✅ **feqh-preview, civil-procedure, law-metadata-map connected to DB**
  > - ✅ **Server-side search + pagination** on `/laws` page (replaced in-memory JS filtering)
  > - ✅ **Paywall enforcement fixed** (`free: true` override → `free: !isLocked`)
  > - ✅ **Articles-backed Blog CMS** fully implemented with public read, admin authoring, Supabase Storage covers, server-side JSON-LD structured data, category filtering, Table of Contents anchor scrolling, and a resilient Service Client connection.
  > - ✅ **Blog Toolkit CLI** created with 3 commands (`clear`, `seed`, `seed-images`) for managing the blog content.
  ```

### B. Add Blog CMS Migration to Deploy Blockers:
- Under `## 🔴 DEPLOY FIRST (Before anything else)`:
  Add a checkbox:
  ```markdown
  - [ ] Apply `20260716_blog_seo_aeo_geo.sql` on Supabase SQL Editor
  ```

### C. Update Blog Status under P5:
- **Before:**
  ```markdown
  - [ ] Blog admin: categories, analytics, Meta Pixel/GA4/GTM, markdown bulk-uploader, add `/blog` to lawyer sidebar
  ```
- **After:**
  ```markdown
  - [x] ✅ **Blog admin categories** — dynamic category taxonomy from DB and server-side category filters.
  - [ ] Blog admin analytics & tools: Meta Pixel/GA4/GTM, markdown bulk-uploader, add `/blog` to lawyer sidebar.
  ```

### D. Update Content System status under Wave 3:
- **Before:**
  ```markdown
  - [ ] Blog CMS — verify `articles` table is live + add categories/analytics/tracking
  ```
- **After:**
  ```markdown
  - [x] ✅ **Blog CMS Core** — Articles-backed DB tables, admin authoring, cover upload to Storage, structured JSON-LD.
  - [ ] Blog analytics/tracking and bulk-uploader (deferred).
  ```

### E. Update Summary Table:
- Update the P7 Backlog row to indicate Wave 3 library and blog cores are completed:
  ```markdown
  | P7 Backlog (5 waves) | Core Library + Blog CMS Done | ~18+ items remaining | Post-beta, gated by payments |
  ```

---

## 5. Proposed Updates to `IMPLEMENTATION_STATUS.md`
To log the results of the July 16 content system sprints:

### A. Update Header Metadata:
- **Before:**
  ```markdown
  > **Date:** 2026-07-05 · **Branch:** `main` — **committed + pushed + deployed** (commits `c7b0867` = §4.1/§4.4/§4.3/§4.9 + plans, `5e23b6c` = §4.2; live via PM2 reload 2026-07-05 18:43 on port 3055) ...
  ```
- **After:**
  ```markdown
  > **Date:** 2026-07-16 · **Branch:** `main` — **committed + pushed + deployed** (commits up to `9fe1949`; live via PM2 reloads) ...
  ```

### B. Add Round 4 Milestone:
Add a new section right above "Implemented this round":
```markdown
## ✅ Round 4 (2026-07-16) — Library Sprint & Blog CMS Core

Major content system deliverables completed:
- **Library Toolkit CLI:** Created `library-toolkit/` with 6 commands (`parse`, `seed`, `clear`, `verify`, `status`, `reseed`). Fully maps, cleans, seeds, and verifies the legal corpus.
- **Library Database Gating:** Connected `feqh-preview`, `civil-procedure`, and `law-metadata-map` to Supabase. Implemented server-side FTS search and pagination (`POST /api/library/search`). Fixed paywall bypass (`free: !isLocked`).
- **SmartFolders:** Wired to Supabase API with dual-mode fallback (auth/guest).
- **Blog CMS Core:** Articles table backed by Supabase DB, public reading, admin authoring, cover upload to Supabase Storage, and JSON-LD structured data (Article/FAQPage/Person/Breadcrumb).
- **Blog Toolkit CLI:** Added scripts for `clear`, `seed`, and `seed-images`.
- **Blog Frontend Rendering:** Upgraded markdown renderer, resilient server component connections, Table of Contents anchor scrolling, and dark mode readability fixes.
- **⚠️ Migrations to apply:** `20260716_security_hardening.sql`, `20260716_missing_fk_indexes.sql`, `20260716_blog_seo_aeo_geo.sql`.
```

### C. Update Deferred Items Table:
Mark items completed on July 16 as such, and add the Blog CMS Core:
- `§4.6 — Library search + Arabic FTS` -> `✅ DONE (2026-07-16)`
- `§4.7 — Persistence (SmartFolders → DB)` -> `✅ DONE (2026-07-16)`
- `Library-toolkit CLI` -> `✅ DONE (2026-07-16)`
- `Paywall enforcement` -> `✅ DONE (2026-07-16)`
- Add: `Blog CMS Core` -> `✅ DONE (2026-07-16)` -> `Articles-backed Blog CMS, cover upload, structured JSON-LD, blog-toolkit, pagination, TOC scrolling. (Analytics and bulk-uploader deferred).`
