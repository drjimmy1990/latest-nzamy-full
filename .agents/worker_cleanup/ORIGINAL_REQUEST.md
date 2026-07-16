## 2026-07-16T19:01:40Z

You are teamwork_preview_worker. Your working directory is d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\worker_cleanup.
Your task is to execute the Markdown files cleanup and organization for the nzamy-website repository as follows:

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Milestone 1: File Moves (Root to OLD/)
1. Create a directory named `OLD` at the root of the workspace (keep it separate from the existing lowercase `old` directory).
2. Move the following 30 files from the root (or their current path) to `OLD/`. Please use `git mv` or a standard file move tool, but since this is a git repo, `git mv` is preferred to preserve git history:
   - `ORIGINAL_REQUEST.md`
   - `PRODUCTION_FIX_IMPLEMENTATION.md`
   - `PRODUCTION_FIX_PLAN.md`
   - `PRODUCT_COMPLETENESS_BACKLOG.md`
   - `TEST_REVIEW_FIX_PLAN.md`
   - `TEST_REVIEW_RECONCILIATION.md`
   - `blog-system-newblog-migration.md`
   - `client_dashboard_audit.md`
   - `client_lawyer_functional_audit.md`
   - `client_lawyer_testing_arabic (1).md`
   - `comprehensive_review_09072026.md`
   - `library_testing_arabic.md`
   - `manual_seeding_guide.md`
   - `master_checklist.md`
   - `master_checklist2.md`
   - `n8n_BUILD_LOG_AND_TEST_GUIDE.md`
   - `n8n_FINAL_MASTER_PLAN.md`
   - `n8n_workflows.md`
   - `n8n_workflows_list.md`
   - `nzamy-audit-fix-status.md`
   - `payments-gateway-admin-gate.md`
   - `production_readiness_audit.md`
   - `project_reference.md`
   - `search_implementation_guide.md`
   - `workflows_roadmap.md`
   - `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md`
   - `legal_library_guide.md`
   - `project_guide.md`
   - `old/BLOG_SEEDING_GUIDE.md` (relocate from `old/BLOG_SEEDING_GUIDE.md` to `OLD/BLOG_SEEDING_GUIDE.md`)
   - `NEXT_STEPS.md`

Milestone 2: DOCUMENTATION_INDEX.md updates
1. Update `DOCUMENTATION_INDEX.md` at root. Update the table and headings to reflect the new paths (`OLD/` prefix) and statuses for all moved files. Change the status to `🔴` or `🗄️` as appropriate.
2. Add the following active files to `DOCUMENTATION_INDEX.md`'s quick reference table and headings details (in their appropriate category sections):
   - `REMAINING_WORK.md` | Roadmap | ✅ | "What's left to build" — canonical remaining work ledger (post July 16 sprint)
   - `MASTER_PRIORITY_LIST_2026-07-16.md` | Roadmap | ✅ | Master priorities, roadmap, and Sprint checklist (last updated July 16)
   - `project_review_report.md` | Audit | ✅ | Canonical review report outlining full codebase status review
   - `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md` | Testing | ✅ | Step-by-step Arabic QA test guide for Round 3 (14 fixes + remaining work)
3. Update "Where to start (cheat sheet)" and "Trust hierarchy" references to include the correct paths (with `OLD/` prefix) for the moved files.

Milestone 3: Status Tracking Updates
1. Edit `MASTER_PRIORITY_LIST_2026-07-16.md`:
   - Change `Last updated:` to: `2026-07-16 21:00 (after commit 9fe1949 - Library & Blog CMS Sprints)`
   - Mark `P6` item `A3 — In-memory search bypass` as checked/completed: `- [x] ✅ DONE (2026-07-16) A3 — In-memory search bypass — Server-side search + pagination now implemented via POST /api/library/search. /laws/page.tsx queries DB directly instead of loading 100 rows + JS .filter().`
   - Under `P7` -> `Wave 3 — Content system`, mark Blog CMS as completed: `- [x] ✅ DONE (2026-07-16) Blog CMS — DB-driven articles schema (31 fields), storage bucket covers, server JSON-LD + metadata, GFM-alert renderer, and blog-toolkit CLI. (Note: analytics and Meta Pixel/GA4 integrations remain in P5).`
2. Edit `REMAINING_WORK.md`:
   - Update header block (`Post 9fe1949`, and `What's done:` text).
   - Under `2026-07-16 Library Sprint Completion` section, add a new sibling section `2026-07-16 Blog CMS Sprint Completion` highlighting the achievements.
   - Under `Wave 3 — Content system`, mark `Blog CMS` as done and cross it out.
   - In the Summary table: update `P7 Backlog` row and `TOTAL` row.
3. Edit `IMPLEMENTATION_STATUS.md`:
   - Update date in the header block to `2026-07-16` and mention `9fe1949`.
   - Directly after the header section, insert a new section `## ✅ Round 4 (2026-07-16) — Library Sprint & Blog CMS Sprint` outlining the achievements (Library CLI, search/pagination, paywall, Blog CMS schema, coverage, toolkit, etc.).

Verification:
- Run `npm run build` or verification commands to confirm no TS errors or layout issues.
- Confirm only the 16 active files remain in the root directory.
- Verify all links inside `DOCUMENTATION_INDEX.md` are valid.
- Write a report detailing all files moved and files updated to `handoff.md` and message the orchestrator (ID: 94031392-f9f7-4abf-abe0-23d352ba7c15).
