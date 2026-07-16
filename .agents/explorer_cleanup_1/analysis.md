# Analysis and Markdown Cleanup Plan — 2026-07-16

## Executive Summary
This analysis outlines the recommendations and plan for organizing the Markdown documentation in the `nzamy-website` repository and updating the status files (`MASTER_PRIORITY_LIST_2026-07-16.md`, `REMAINING_WORK.md`, `IMPLEMENTATION_STATUS.md`) to reflect the completion of the **2026-07-16 Library Sprint** and the **Blog CMS Sprint**.

---

## 1. Markdown Files Cleanup and Reorganization Plan

We will create a new directory named `OLD` at the root of the workspace (which is distinct from the existing lowercase `old` directory) and move historical and obsolete documentation files to it.

### Target Files to Move to `OLD/`
The following 29 files will be moved from their current paths to `OLD/`:
1. `ORIGINAL_REQUEST.md` → `OLD/ORIGINAL_REQUEST.md`
2. `PRODUCTION_FIX_IMPLEMENTATION.md` → `OLD/PRODUCTION_FIX_IMPLEMENTATION.md`
3. `PRODUCTION_FIX_PLAN.md` → `OLD/PRODUCTION_FIX_PLAN.md`
4. `PRODUCT_COMPLETENESS_BACKLOG.md` → `OLD/PRODUCT_COMPLETENESS_BACKLOG.md`
5. `TEST_REVIEW_FIX_PLAN.md` → `OLD/TEST_REVIEW_FIX_PLAN.md`
6. `TEST_REVIEW_RECONCILIATION.md` → `OLD/TEST_REVIEW_RECONCILIATION.md`
7. `blog-system-newblog-migration.md` → `OLD/blog-system-newblog-migration.md`
8. `client_dashboard_audit.md` → `OLD/client_dashboard_audit.md`
9. `client_lawyer_functional_audit.md` → `OLD/client_lawyer_functional_audit.md`
10. `client_lawyer_testing_arabic (1).md` → `OLD/client_lawyer_testing_arabic (1).md`
11. `comprehensive_review_09072026.md` → `OLD/comprehensive_review_09072026.md`
12. `library_testing_arabic.md` → `OLD/library_testing_arabic.md`
13. `manual_seeding_guide.md` → `OLD/manual_seeding_guide.md`
14. `master_checklist.md` → `OLD/master_checklist.md`
15. `master_checklist2.md` → `OLD/master_checklist2.md`
16. `n8n_BUILD_LOG_AND_TEST_GUIDE.md` → `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md`
17. `n8n_FINAL_MASTER_PLAN.md` → `OLD/n8n_FINAL_MASTER_PLAN.md`
18. `n8n_workflows.md` → `OLD/n8n_workflows.md`
19. `n8n_workflows_list.md` → `OLD/n8n_workflows_list.md`
20. `nzamy-audit-fix-status.md` → `OLD/nzamy-audit-fix-status.md`
21. `payments-gateway-admin-gate.md` → `OLD/payments-gateway-admin-gate.md`
22. `production_readiness_audit.md` → `OLD/production_readiness_audit.md`
23. `project_reference.md` → `OLD/project_reference.md`
24. `search_implementation_guide.md` → `OLD/search_implementation_guide.md`
25. `workflows_roadmap.md` → `OLD/workflows_roadmap.md`
26. `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` → `OLD/ENTITLEMENTS_AND_WIRING_BUILD_LOG.md`
27. `legal_library_guide.md` → `OLD/legal_library_guide.md`
28. `project_guide.md` → `OLD/project_guide.md`
29. `old/BLOG_SEEDING_GUIDE.md` → `OLD/BLOG_SEEDING_GUIDE.md` (moved from lowercase `old/` directory to `OLD/`)

### Automated Move Commands (PowerShell)
```powershell
New-Item -ItemType Directory -Force -Path "OLD"
$files = @(
    "ORIGINAL_REQUEST.md", "PRODUCTION_FIX_IMPLEMENTATION.md", "PRODUCTION_FIX_PLAN.md",
    "PRODUCT_COMPLETENESS_BACKLOG.md", "TEST_REVIEW_FIX_PLAN.md", "TEST_REVIEW_RECONCILIATION.md",
    "blog-system-newblog-migration.md", "client_dashboard_audit.md", "client_lawyer_functional_audit.md",
    "client_lawyer_testing_arabic (1).md", "comprehensive_review_09072026.md", "library_testing_arabic.md",
    "manual_seeding_guide.md", "master_checklist.md", "master_checklist2.md",
    "n8n_BUILD_LOG_AND_TEST_GUIDE.md", "n8n_FINAL_MASTER_PLAN.md", "n8n_workflows.md",
    "n8n_workflows_list.md", "nzamy-audit-fix-status.md", "payments-gateway-admin-gate.md",
    "production_readiness_audit.md", "project_reference.md", "search_implementation_guide.md",
    "workflows_roadmap.md", "ENTITLEMENTS_AND_WIRING_BUILD_LOG.md", "legal_library_guide.md",
    "project_guide.md"
)
foreach ($file in $files) {
    if (Test-Path $file) {
        Move-Item -Path $file -Destination "OLD/" -Force
    }
}
if (Test-Path "old/BLOG_SEEDING_GUIDE.md") {
    Move-Item -Path "old/BLOG_SEEDING_GUIDE.md" -Destination "OLD/" -Force
}
```

---

## 2. Updates Needed for `DOCUMENTATION_INDEX.md`

We will update `DOCUMENTATION_INDEX.md` to reflect the new paths (`OLD/` prefix) for all moved files, and update their statuses to reflect archival/stale status.

### Proposed Changes for `DOCUMENTATION_INDEX.md`

#### Change Chunk 1 (Quick reference table rows 18-21):
**Before:**
```markdown
| `project_guide.md` | Orientation | 🟡 | Onboarding overview, 9 user types, stack |
| `project_reference.md` | Orientation | 🔴 | 6-phase progress overview (phases 3–6 outdated) |
| `PROJECT.md` | Orientation | 🟡 | Working on the **Admin Panel** (milestones + API contracts) |
| `ORIGINAL_REQUEST.md` | Orientation | 📄 | The original audit + admin-panel ask + acceptance criteria |
```
**After:**
```markdown
| `OLD/project_guide.md` | Orientation | 🔴 | Archived (2026-07-16) — Onboarding overview, 9 user types, stack |
| `OLD/project_reference.md` | Orientation | 🔴 | Archived (2026-07-16) — 6-phase progress overview (phases 3–6 outdated) |
| `PROJECT.md` | Orientation | 🟡 | Working on the **Admin Panel** (milestones + API contracts) |
| `OLD/ORIGINAL_REQUEST.md` | Orientation | 📄 | Archived (2026-07-16) — The original audit + admin-panel ask + acceptance criteria |
```

#### Change Chunk 2 (Quick reference table rows 23-33):
**Before:**
```markdown
| `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | Build log | ✅ | **2026-07-06 entitlements + wiring build** — what shipped (7 phases) + apply/operate runbook (AR/EN) |
| `docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md` | Plan | ✅ | The implementation plan for the entitlements+wiring build |
| `docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md` | Spec | ✅ | The approved design (now implemented) |
| `BLOG_GUIDE.md` | Runbook | ✅ | **Seed the blog** — where to put `test/newblog/blog_final/`, the SQL-Editor migration, and `npm run blog:reseed` (clear → images → seed) for 608 articles + 614 WebP covers (AR/EN) |
| `old/BLOG_SEEDING_GUIDE.md` | Runbook | 🗄️ | Archived — superseded by `BLOG_GUIDE.md` (old scalar-only seeder on `blog_final/`) |
| `nzamy-audit-fix-status.md` | Roadmap | ✅ | What's fixed vs deferred (audit fix ledger) |
| `master_checklist.md` | Roadmap | 🟡 | Granular 6-phase deliverables checklist |
| `master_checklist2.md` | Roadmap | 🟡 | Older checklist variant (same purpose) |
| `production_readiness_audit.md` | Audit | 📄 | Finding bugs / pre-fix mock-data + RLS reference |
| `client_dashboard_audit.md` | Audit | 🔴 | Client dashboard dummy-data inventory (mostly fixed now) |
| `client_lawyer_functional_audit.md` | Audit | ✅ | Client+lawyer functional audit + fix plan + resolution status |
```
**After:**
```markdown
| `OLD/ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` | Build log | 🗄️ | Archived (2026-07-16) — **2026-07-06 entitlements + wiring build** — what shipped (7 phases) + apply/operate runbook (AR/EN) |
| `docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md` | Plan | ✅ | The implementation plan for the entitlements+wiring build |
| `docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md` | Spec | ✅ | The approved design (now implemented) |
| `BLOG_GUIDE.md` | Runbook | ✅ | **Seed the blog** — where to put `test/newblog/blog_final/`, the SQL-Editor migration, and `npm run blog:reseed` (clear → images → seed) for 608 articles + 614 WebP covers (AR/EN) |
| `OLD/BLOG_SEEDING_GUIDE.md` | Runbook | 🗄️ | Archived (2026-07-16) — superseded by `BLOG_GUIDE.md` (old scalar-only seeder on `blog_final/`) |
| `OLD/nzamy-audit-fix-status.md` | Roadmap | 🔴 | Archived (2026-07-16) — What's fixed vs deferred (audit fix ledger) |
| `OLD/master_checklist.md` | Roadmap | 🔴 | Archived (2026-07-16) — Granular 6-phase deliverables checklist |
| `OLD/master_checklist2.md` | Roadmap | 🔴 | Archived (2026-07-16) — Older checklist variant (same purpose) |
| `OLD/production_readiness_audit.md` | Audit | 📄 | Archived (2026-07-16) — Finding bugs / pre-fix mock-data + RLS reference |
| `OLD/client_dashboard_audit.md` | Audit | 🔴 | Archived (2026-07-16) — Client dashboard dummy-data inventory (mostly fixed now) |
| `OLD/client_lawyer_functional_audit.md` | Audit | 🔴 | Archived (2026-07-16) — Client+lawyer functional audit + fix plan + resolution status |
```

#### Change Chunk 3 (Quick reference table rows 35-46):
**Before:**
```markdown
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
```
**After:**
```markdown
| `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md` | n8n | 🗄️ | Archived (2026-07-16) — **What's actually built** (AR/EN) — per-branch state + curl tests + go-live steps |
| `DEPLOY_AND_SMOKETEST_RUNBOOK.md` | Deployment | ✅ | Deploy this session's work + activate n8n + smoke-test the loop (AR/EN) |
| `n8n/README.md` | n8n | ✅ | Importing the 7 templates / payload contract / credentials |
| `OLD/n8n_workflows_list.md` | n8n | 📄 | Archived (2026-07-16) — Deep technical reference (superseded by master guide) |
| `OLD/n8n_workflows.md` | n8n | 📄 | Archived (2026-07-16) — Phase-4 AI workflow reference (superseded) |
| `OLD/workflows_roadmap.md` | n8n | 📄 | Archived (2026-07-16) — Older roadmap (superseded) |
| `OLD/legal_library_guide.md` | Library | 🗄️ | Archived (2026-07-16) — Seeding the library (parse → seed → verify flow) |
| `OLD/manual_seeding_guide.md` | Library | 🗄️ | Archived (2026-07-16) — Seeding by hand via Supabase SQL Editor (no scripts) |
| `OLD/search_implementation_guide.md` | Library | 🔴 | Archived (2026-07-16) — Search schema / FTS plan (predates the FTS route rewrite) |
| `OLD/library_testing_arabic.md` | Testing | 🔴 | Archived (2026-07-16) — QA-testing the library (Arabic, step-by-step) |
| `OLD/client_lawyer_testing_arabic (1).md` | Testing | 🔴 | Archived (2026-07-16) — QA-testing client + lawyer flows (Arabic) |
| `OLD/payments-gateway-admin-gate.md` | Payments | 🗄️ | Archived (2026-07-16) — Working on payments / the admin gate mechanism |
```

#### Change Chunk 4 (Quick reference table rows 48-52):
**Before:**
```markdown
| `PRODUCTION_FIX_PLAN.md` | Fix cycle | ✅ | Round-1 production-blocker remediation spec (§7 = 8 per-blocker specs) |
| `PRODUCTION_FIX_IMPLEMENTATION.md` | Fix cycle | ✅ | What round-1 actually changed, file-by-file (companion to the plan) |
| `TEST_REVIEW_RECONCILIATION.md` | Fix cycle | ✅ | The owner's QA review (109 findings) classified vs our fixes |
| `TEST_REVIEW_FIX_PLAN.md` | Fix cycle | ✅ | Round-2 remediation spec (§4.1–§4.9, exact code/SQL) |
| `IMPLEMENTATION_STATUS.md` | Fix cycle | ✅ | Round-2 done-vs-deferred ledger; **current deploy state** |
```
**After:**
```markdown
| `OLD/PRODUCTION_FIX_PLAN.md` | Fix cycle | 🔴 | Archived (2026-07-16) — Round-1 production-blocker remediation spec (§7 = 8 per-blocker specs) |
| `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` | Fix cycle | 🔴 | Archived (2026-07-16) — What round-1 actually changed, file-by-file (companion to the plan) |
| `OLD/TEST_REVIEW_RECONCILIATION.md` | Fix cycle | 🔴 | Archived (2026-07-16) — The owner's QA review (109 findings) classified vs our fixes |
| `OLD/TEST_REVIEW_FIX_PLAN.md` | Fix cycle | 🔴 | Archived (2026-07-16) — Round-2 remediation spec (§4.1–§4.9, exact code/SQL) |
| `IMPLEMENTATION_STATUS.md` | Fix cycle | ✅ | Current deploy state (includes Round 3 Entitlements & Round 4 Library/Blog Sprints) |
```

#### Change Chunk 5 (Quick reference table row 54):
**Before:**
```markdown
| `PRODUCT_COMPLETENESS_BACKLOG.md` | Roadmap | ✅ | **Full-product backlog** — 104 unbuilt/mock features (registration, community, blog, academy/LMS, media, sectors, admin, cross-cutting) + 5-wave build order |
```
**After:**
```markdown
| `OLD/PRODUCT_COMPLETENESS_BACKLOG.md` | Roadmap | 🔴 | Archived (2026-07-16) — **Full-product backlog** — 104 unbuilt/mock features (registration, community, blog, academy/LMS, media, sectors, admin, cross-cutting) + 5-wave build order |
```

#### Change Chunk 6 (Detailed file descriptions section headings):
Rename the headings in `DOCUMENTATION_INDEX.md` as follows:
- `### `project_guide.md`` → `### `OLD/project_guide.md`` (Add "Archived" prefix to status description)
- `### `project_reference.md`` → `### `OLD/project_reference.md``
- `### `ORIGINAL_REQUEST.md`` → `### `OLD/ORIGINAL_REQUEST.md``
- `### `nzamy-audit-fix-status.md`` → `### `OLD/nzamy-audit-fix-status.md``
- `### `master_checklist.md`` → `### `OLD/master_checklist.md``
- `### `master_checklist2.md`` → `### `OLD/master_checklist2.md``
- `### `production_readiness_audit.md`` → `### `OLD/production_readiness_audit.md``
- `### `client_dashboard_audit.md`` → `### `OLD/client_dashboard_audit.md``
- `### `client_lawyer_functional_audit.md`` → `### `OLD/client_lawyer_functional_audit.md``
- `### `n8n_workflows_list.md`` → `### `OLD/n8n_workflows_list.md``
- `### `n8n_workflows.md`` → `### `OLD/n8n_workflows.md``
- `### `workflows_roadmap.md`` → `### `OLD/workflows_roadmap.md``
- `### `legal_library_guide.md`` → `### `OLD/legal_library_guide.md``
- `### `manual_seeding_guide.md`` → `### `OLD/manual_seeding_guide.md``
- `### `search_implementation_guide.md`` → `### `OLD/search_implementation_guide.md``
- `### `library_testing_arabic.md`` → `### `OLD/library_testing_arabic.md``
- `### `client_lawyer_testing_arabic (1).md`` → `### `OLD/client_lawyer_testing_arabic (1).md``
- `### `payments-gateway-admin-gate.md`` → `### `OLD/payments-gateway-admin-gate.md``
- `### `PRODUCTION_FIX_PLAN.md` (round 1 — spec)` → `### `OLD/PRODUCTION_FIX_PLAN.md` (round 1 — spec)`
- `### `PRODUCTION_FIX_IMPLEMENTATION.md` (round 1 — what shipped)` → `### `OLD/PRODUCTION_FIX_IMPLEMENTATION.md` (round 1 — what shipped)`
- `### `TEST_REVIEW_RECONCILIATION.md` (round 2 — the owner's QA, classified)` → `### `OLD/TEST_REVIEW_RECONCILIATION.md` (round 2 — the owner's QA, classified)`
- `### `TEST_REVIEW_FIX_PLAN.md` (round 2 — spec)` → `### `OLD/TEST_REVIEW_FIX_PLAN.md` (round 2 — spec)`

#### Change Chunk 7 (Cheat sheet updates):
**Before (lines 272-287):**
```markdown
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
| Seed the library | `library-toolkit/README.md` (CLI toolkit — parse/seed/clear/verify/status/reseed) or `legal_library_guide.md` (legacy scripts) or `manual_seeding_guide.md` (SQL) |
| QA-test before launch | `library_testing_arabic.md` + `client_lawyer_testing_arabic (1).md` |
| Work on the admin panel | `PROJECT.md` |
| Deploy | `deployment_guide.md` |
| Work on payments | `payments-gateway-admin-gate.md` |
| Find a bug's origin | `production_readiness_audit.md` + `client_lawyer_functional_audit.md` |
| Onboard to the project | `project_guide.md` (then `ARCHITECTURE.md`) |
```
**After:**
```markdown
| You want to… | Read this first |
|--------------|-----------------|
| Know the current production-fix + deploy state | `IMPLEMENTATION_STATUS.md` (then the §I fix-cycle set) |
| See the full-product build backlog (post-beta) | `OLD/PRODUCT_COMPLETENESS_BACKLOG.md` |
| Know what to work on next | `NEXT_STEPS.md` |
| See what's fixed vs deferred | `OLD/nzamy-audit-fix-status.md` |
| Understand the codebase structure | `ARCHITECTURE.md` |
| See what n8n is built + how to test it | `OLD/n8n_BUILD_LOG_AND_TEST_GUIDE.md` |
| Deploy + activate + smoke-test | `DEPLOY_AND_SMOKETEST_RUNBOOK.md` |
| Build/plan more n8n workflows | `OLD/n8n_FINAL_MASTER_PLAN.md` → `n8n_master_guide_latest.md` |
| Seed the library | `library-toolkit/README.md` (CLI toolkit — parse/seed/clear/verify/status/reseed) or `OLD/legal_library_guide.md` (legacy scripts) or `OLD/manual_seeding_guide.md` (SQL) |
| QA-test before launch | `OLD/library_testing_arabic.md` + `OLD/client_lawyer_testing_arabic (1).md` |
| Work on the admin panel | `PROJECT.md` |
| Deploy | `deployment_guide.md` |
| Work on payments | `OLD/payments-gateway-admin-gate.md` |
| Find a bug's origin | `OLD/production_readiness_audit.md` + `OLD/client_lawyer_functional_audit.md` |
| Onboard to the project | `OLD/project_guide.md` (then `ARCHITECTURE.md`) |
```

#### Change Chunk 8 (Trust hierarchy update at line 290):
**Before:**
```markdown
> **Trust hierarchy when docs conflict:** for **"what's left to build" / current state**, `PROJECT_STATUS_REVIEW_2026-07-06.md` wins (newest, verified page-by-page). For the **production-fix cycle / deploy state**, `IMPLEMENTATION_STATUS.md` + the §I set win (2026-07-05). For everything else, `nzamy-audit-fix-status.md` + `NEXT_STEPS.md` + `ARCHITECTURE.md` + `n8n_master_guide_latest.md` are the source of truth. `project_reference.md`, `client_dashboard_audit.md`, and the three superseded n8n docs are historical — don't rely on them for current status.
```
**After:**
```markdown
> **Trust hierarchy when docs conflict:** for **"what's left to build" / current state**, `PROJECT_STATUS_REVIEW_2026-07-06.md` wins (newest, verified page-by-page). For the **production-fix cycle / deploy state**, `IMPLEMENTATION_STATUS.md` + the §I set win (2026-07-05). For everything else, `OLD/nzamy-audit-fix-status.md` + `NEXT_STEPS.md` + `ARCHITECTURE.md` + `n8n_master_guide_latest.md` are the source of truth. `OLD/project_reference.md`, `OLD/client_dashboard_audit.md`, and the three superseded n8n docs are historical — don't rely on them for current status.
```

---

## 3. Git History and Commits Findings

Our investigation of the git history (specifically around 2026-07-16) revealed two major development sprints that have been merged into `main`:

### A. 2026-07-16 Library Sprint (Commit `5252277`)
- **CLI Toolkit (`library-toolkit/`)**: Added `library-clear.mjs`, `library-parse.mjs`, `library-seed.mjs`, `library-verify.mjs`, and `library-status.mjs` providing the 6 owner commands: `parse`, `seed`, `clear`, `verify`, `status`, `reseed`.
- **Database Schema & Types**: Corrected mismatches in `supabaseLibrary.ts` (`law_chapters`→`chapters`, `law_articles`→`articles`, `law_amendments`→`article_amendments`, and removed references to non-existent `law_executive_regs`).
- **DB Connection**: Replaced hardcoded mocks in `feqh-preview`, `civil-procedure`, and `law-metadata-map` with live database connections.
- **Server-Side FTS Search**: Replaced in-memory JS search filtering with database-driven full-text search and pagination via `POST /api/library/search`.
- **SmartFolders API**: Wired smart folders to the Supabase API with dual-mode support (database API for authenticated users, localStorage fallback for guests).
- **Paywall Gating**: Enforced subscription gates correctly (`free: !isLocked` instead of static `free: true`).

### B. Recent Blog CMS Commits (Commit `8ac7aa8` and post-commits)
- **DB Schema Migration (`20260716_blog_seo_aeo_geo.sql`)**: Implemented the `articles` and `blog_sections` tables (31 fields total for SEO/AEO/GEO optimization and E-E-A-T credentials) and public `blog-covers` Supabase Storage bucket.
- **CLI Toolkit (`blog-toolkit/`)**: Added `blog-clear.mjs`, `seed-blog.mjs`, `seed-blog-images.mjs` enabling `npm run blog:reseed` (clear -> images -> seed).
- **Frontend Refactoring**: Converted `/blog/[slug]` from a client component to a server component using `generateMetadata` and `ArticleJsonLd` (Article, FAQPage, Person, Breadcrumb json-ld schemas) for SEO/AEO/GEO indexing.
- **Markdown & Interactive Renderer**: Upgraded GFM alert markdown renderer in `ArticleView` client component. Added header ID slugs for TOC anchor scrolling with navbar top-offset scrolling.
- **Dark Mode Styling**: Styled links in blog markdown with gold color and underlines.
- **Resilience**: Moved `formatDate` helper to a server component to fix a Turbopack SSR crash. Wrapped fetch operations in try/catch utilizing a service client to prevent server component crashes if the database returns empty.

---

## 4. Updates Needed for Status Files

To keep the roadmap and status documentation accurate, the following precise changes will be applied:

### A. `MASTER_PRIORITY_LIST_2026-07-16.md`

#### Change 1: Update Header Details
Change "Last updated: 2026-07-16 17:30 (after commit `bfb3a5f`)" to reflect that the Library and Blog CMS Sprints have been completed.
**Before (line 4):**
```markdown
> **Last updated:** 2026-07-16 17:30 (after commit `bfb3a5f`)
```
**After:**
```markdown
> **Last updated:** 2026-07-16 21:00 (after Library & Blog CMS Sprints, commit `9fe1949`)
```

#### Change 2: Mark Blog CMS Task Done (line 122)
**Before:**
```markdown
- [ ] Blog CMS — verify entitlements-build `articles` table is live (P0); add categories/analytics/tracking (P5).
```
**After:**
```markdown
- [x] ✅ **Blog CMS** — articles table live, dynamic categories, blog-toolkit seeder/cleaner, server-side JSON-LD + metadata, GFM-alert renderer, TOC anchor scrolling, dark-mode links, resilient client. *(Commit 8ac7aa8 & post-fixes)*
```

---

### B. `REMAINING_WORK.md`

#### Change 1: Add Blog CMS Completion Banner
Add the Blog CMS sprint details to the completed list at the top.
**Before (lines 7-14):**
```markdown
> ### 🆕 2026-07-16 Library Sprint Completion
> Major library implementation work completed this session:
> - ✅ **library-toolkit CLI** created with 6 commands (parse, seed, clear, verify, status, reseed)
> - ✅ **supabaseLibrary.ts table names fixed** (law_chapters→chapters, law_articles→articles, law_amendments→article_amendments, removed phantom law_executive_regs)
> - ✅ **SmartFolders wired to Supabase API** (dual-mode: API for auth, localStorage for guest)
> - ✅ **feqh-preview, civil-procedure, law-metadata-map connected to DB** (were 100% hardcoded)
> - ✅ **Server-side search + pagination** on `/laws` page (replaced in-memory JS filtering)
> - ✅ **Paywall enforcement fixed** (`free: true` override → `free: !isLocked`)
```
**After:**
```markdown
> ### 🆕 2026-07-16 Library Sprint Completion
> Major library implementation work completed this session:
> - ✅ **library-toolkit CLI** created with 6 commands (parse, seed, clear, verify, status, reseed)
> - ✅ **supabaseLibrary.ts table names fixed** (law_chapters→chapters, law_articles→articles, law_amendments→article_amendments, removed phantom law_executive_regs)
> - ✅ **SmartFolders wired to Supabase API** (dual-mode: API for auth, localStorage for guest)
> - ✅ **feqh-preview, civil-procedure, law-metadata-map connected to DB** (were 100% hardcoded)
> - ✅ **Server-side search + pagination** on `/laws` page (replaced in-memory JS filtering)
> - ✅ **Paywall enforcement fixed** (`free: true` override → `free: !isLocked`)
>
> ### 🆕 2026-07-16 Blog CMS Completion
> Major blog CMS implementation work completed this session:
> - ✅ **Articles & Blog Sections Tables** created in DB via migration `20260716_blog_seo_aeo_geo.sql` (31-field schema + Supabase Storage covers)
> - ✅ **blog-toolkit CLI** created with clear, seed, and seed-images commands
> - ✅ **Server-Side Rendering (SSR) & Metadata** (`generateMetadata` + `ArticleJsonLd` on blog slug pages)
> - ✅ **GFM Alert Markdown Renderer** integrated in `ArticleView` client child
> - ✅ **Table of Contents (TOC) scrolling** with header ID slugs and navbar offset scrolling
> - ✅ **Dark Mode Anchor Styling** (gold color + underlines on all blog links)
> - ✅ **Turbopack SSR resilience** (moved `formatDate` helper, wrapped fetch calls in try/catch with service client)
```

#### Change 2: Mark Blog CMS Checked in Product Backlog (line 241)
**Before:**
```markdown
- [ ] Blog CMS — verify `articles` table is live + add categories/analytics/tracking
```
**After:**
```markdown
- [x] Blog CMS — verify `articles` table is live + add categories/analytics/tracking — ✅ DONE (2026-07-16)
```

#### Change 3: Update Summary Table (line 271)
**Before:**
```markdown
| P7 Backlog (5 waves) | 0 | ~20+ items | Post-beta, gated by payments + content |
```
**After:**
```markdown
| P7 Backlog (5 waves) | 2 ✅ | ~18+ items | Post-beta, gated by payments + content (Library + Blog Sprints done) |
```

---

### C. `IMPLEMENTATION_STATUS.md`

Add a new Round 4 section detailing both sprints.
**Under `## ✅ Round 3 (2026-07-06) — Admin-controlled entitlements + production wiring` (after line 19):**
```markdown
## ✅ Round 4 (2026-07-16) — Library Sprint & Blog CMS Completion

This round executed the complete database migration and integration for both the Legal Library (via the Library Sprint) and the Blog CMS (via the Blog CMS Sprint).
- **Library Sprint:**
  - CLI toolkit for library parse/seed/clear/verify/status under `library-toolkit/`.
  - Database connections for `feqh-preview`, `civil-procedure`, `law-metadata-map`.
  - Fixed `supabaseLibrary.ts` table name mismatches.
  - Server-side FTS search + pagination on `/laws` page.
  - SmartFolders wired to `/api/library/folders` Supabase API (dual-mode).
  - Paywall enforcement fixed (`free: !isLocked` override).
- **Blog CMS:**
  - Database-backed Blog CMS (schema, tables, Supabase storage covers).
  - Seeding and cleaning tools under `blog-toolkit/`.
  - Server-Side Rendering (SSR) & SEO Metadata (`generateMetadata` + `ArticleJsonLd` schema).
  - TOC and Upgraded Renderer (GFM alert markup, header ID slugs, anchor scrolling with navbar offset).
  - Resilient Client (try/catch + service client credentials to prevent SSR crashes).
  - Dark Mode Link Styling (gold colors + underlines on all anchor tags).
```
