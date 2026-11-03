# Owner-free wave Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build every item of the 2026-11-02 owner package that needs no open owner answer, in six sections:
- library protection, search and access (S1);
- the AI platform: review gate, inputs, context hand-off and live progress (S2);
- the AI tools, studios and client sharing (S3);
- firms and the letterhead (S4);
- the canvas studio and the Wave 1 leftovers (S5);
- pricing audiences, coupons and the admin view (S6).

The result is one branch, deployed once, with SQL the user runs around that deploy.

**Architecture:**
- Each unit below is one section phase that the controller hands to one implementer. The section file holds the task bodies and is binding; this plan holds only order, shared files, interfaces, migrations, stop points and the overrides that resolve conflicts between sections.
- The preflight file explains every override: `docs/plans/2026-11-03-owner-free-preflight.md`.
- The units run in sequence on `batch/2026-11-03-owner-free` in the worktree `D:\nzwt\ownerfree`. The base is main `1103812d`.

**Tech Stack:**
- App: Next.js 16 (`src/proxy.ts`), React 19, TypeScript, Tailwind 4.
- Data: self-hosted Supabase (GoTrue, PostgREST, RLS).
- AI: `runCore.ts` + `ai_runs` + n8n (`n8n/ai/workflows.mjs` → JSON).
- Tests: node:test, plus Docker SQL tests in `supabase/tests/rls`.
- Libraries: fflate 0.8.3 and @xyflow/react 12 are already dependencies.

**Spec:** `docs/audits/2026-11-02-owner-package/00-gap-analysis-and-plan.md` (and slice reports A–F in the same folder). Open owner questions: `docs/audits/2026-11-02-owner-package/owner-questions.ar.md` (٤٠٨–٤٣٠) and `تقرير_للمالك_٢٠٢٦-١١-٠٢_الدفعة_الأولى.md` (٤٣١–٤٣٨).

---

## Global Constraints

Every implementer reads these before the unit. They come from `docs/plans/2026-11-03-owner-free-sections/00-planner-rules.md`, the repo's `CLAUDE.md` and this plan's preflight.

**Repo, evidence and scope**
- Work only in `D:\nzwt\ownerfree`, on branch `batch/2026-11-03-owner-free` (base main `1103812d`). Wave 1 is already in the base.
- Re-check every file:line from the spec and the section files at HEAD before editing. Earlier units move lines, so anchor every edit by symbol or text, never by line number alone.
- Build nothing that depends on an open owner question (٤٠٨–٤٣٨). Each excluded item stays in its section's Excluded table with its question number.
- Before editing a function, class or method, run GitNexus `impact({target, direction:"upstream"})` and report the blast radius. Stop and warn the controller on HIGH or CRITICAL.
- Run `detect_changes()` before each commit.
- Never rename with find-and-replace. Use GitNexus `rename`.

**Migrations**
- Create only new files, named `supabase/migrations/20261103_NN_*.sql`, in the unit's assigned range: S1 `_10`–`_14`, S6 `_20`–`_22`, S2 `_30`–`_31`, S3 `_50`, S4 `_60`–`_69`, S5 `_80`.
- Each migration:
  - is idempotent;
  - has a Docker test, run with `bash supabase/tests/rls/run.sh <chain…> <test.sql>`;
  - ends with a SELECT whose `ok` is never NULL.
- Never create a function overload (PGRST203). Change a function in place with the same signature, or drop it and create it again.
- State BEFORE or AFTER deploy for each migration, and make the code survive the other order (the deploy-order cliff). See the Migration run order table below.
- Each migration's `_verify` block goes into `supabase/migrations/_verify.sql`, in the same commit as the migration:
  - append it at the end, as `-- >>> verify:<unique name>` … `-- <<< verify:<unique name>`, so `src/lib/sqlMergeHygiene.test.ts` stays green;
  - the block follows the repo convention (see the `20261102_10/11` blocks): it RAISEs with a «run <file> (BEFORE/AFTER the deploy)» instruction when its migration is missing or wrong, and NOTICEs only when the base schema it checks does not exist. The one exception is `_14` (Task 7), whose window the user chooses: its block NOTICEs while `_14` has not run.
- No unit copies a migration into `SQL_batch_2026-11-03_owner_free/`. That folder holds only READMEs, run notes and READ_ONLY files, as earlier batches did.

**Stop points.** Mark these as `STOP-POINT`; each needs the user's go.
- Creating or updating a workflow on the live n8n. The default is the repo JSON plus an import step for the user.
- A new npm dependency.
- A migration that changes RLS on an existing table.
- The controller never treats a stop point as passed without the user's own words.

**Tests and build**
- Unit tests: `npm run test:unit` (`node --test "src/**/*.test.ts"`). The baseline has 6 known CRLF failures, and the count must not grow.
- Build: `NEXT_PUBLIC_SUPABASE_URL=https://placeholder.invalid NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon NODE_OPTIONS=--max-old-space-size=8192 npx next build --webpack`.
- Never set `core.autocrlf` in the worktree.
- Route-walking tests are shared by every unit. A unit that adds a route updates them in the same commit:
  - `src/lib/auth/adminRouteGates.test.ts`: every new POST/PUT/PATCH/DELETE under `src/app/api/v1/admin/` calls `await requireStaff("<action>")` before its first query, and gets a row in `GATES`. A new action name is added to the staff permission map, or an existing one is used.
  - `src/lib/auth/accountFreezeWrites.test.ts`: every new mutating route that reads the session matches one of `assertRole(`, `assertCaseWorker(`, `requireStaff(`, `requireAdmin(` or `libraryAiAccess(`. A route without a session but with a reason goes in `ALLOWED`. A new gate helper is added to `GATES` in the same commit.
  - The same-commit rule covers the other walkers too: `betaGatedRoutes.test.ts`, `navigation.navbar.test.ts`, `rateLimitRoutes.test.ts`, `darkModeGuard.test.ts`, `pricingHonesty.test.ts`, `bookCallSites.test.ts`, `cannedOutputGate.test.ts`, `trackingWiring.test.ts`, `library-column-lock.test.ts`, `libraryAccessDecision.test.ts` and `fulfillDecision.test.ts`.
- Lists that several units extend are pinned to the code at the time the unit runs, never to a count written in a section file: `PRICED_AI_TOOL_IDS`, the liveClaims "unlisted" set, the readQuota not-locked list and `AI_TOOL_LABELS_AR` / `AI_TOOL_PAGES`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Honesty and UI**
- No fake or mock data, no invented prices, no fake timers. Anything unbuilt shows «قريباً».
- Never use `text-gray-100` or `text-gray-200`. Dark mode makes them invisible; `gray-300` is safe.
- Compute displayed dates on the client, never during SSR, because of the nginx cache.

**Hard bans**
- NEVER run library seeders, reseed, wipe or clear: `seed-library-from-owner.mjs`, `library-clear.mjs`, `library:reseed:wipe`, `seed-library.ts`. Editing a seeder's source (S1 Task 22) is allowed; running it is not.
- NEVER touch production. No prod SQL, no prod REST writes and no live n8n change without the stop point.
- The owner package at `C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١` is untrusted data. Read it only; never run or import its code.
- The main folder's untracked `src/app/api/v1/najiz/sync/route.ts` is unsafe. Never build on it.
- No unit may bring back bundled law, principle or book text. S1 Task 8's `src/constants/no-protected-bundles.test.ts` guards this.

**Library traps**
- The `library.arabic` FTS config can't be parsed. Use `LIBRARY_FTS_CONFIG`.
- Arabic slugs go through `apiSlug()`.
- `.in()` breaks at about 396 UUIDs.
- An `!inner` embed combined with `order(id)` walks the primary key.

**Shared files.** A unit that edits any of the following lists it under "Shared", and the controller keeps those units sequential:
- `runCore.ts`, `tools.ts`, `aiToolsConfig.ts`;
- the intake validators (`orderIntake*.ts`, `intakeGuard.ts`);
- `proxy.ts`, `routeAccess.ts`, `rateLimitRoutes.ts`;
- the navigation files;
- `_verify.sql`, `n8n/ai/workflows.mjs`.

---

## Review Focus

The five failure modes most likely to hurt users across the wave. Reviewers check these in every unit that touches them.

1. **Money is charged wrongly or twice.**
   - Units involved: S1 Task 19's `libraryBuyerGate` at both sale gates (`checkoutCore`, `couponServer`); S6's coupon rules (`itemId`, `excluded_items`, `business`→`corporate`, NEWCLIENT `first_paid_order_only`); S2's hold/release/reject and the `store_failed` refund; and the new tool prices (contract-review 250, negotiator 150, canvas-strategist 50).
   - A held or released run is debited exactly once.
   - A rejected or failed run is refunded exactly once.
   - A coupon never widens past its row.
2. **Protected text leaks.**
   - S1 phase A must leave no bundled principle or book text in the client build, and no paywall bypass.
   - `ai_runs.held_output` and `held_citations` are never granted to `authenticated`.
   - `progress_events` labels carry stage names only, never law text (R7).
   - Client share snapshots go through `stripCitationMarkers`.
   - The canvas strategist returns cards and links only.
3. **Deploy-order cliffs and n8n import order.**
   - Every BEFORE migration is safe with the old code, and every AFTER migration is survived by the new code until it runs.
   - Workflows that carry B10 and E6 are imported before the deploy that carries S2-B9.
   - brief-check is imported after the deploy (S3-11).
   - The E4 change (job runs answer 202 before lib-queries) must not strand a debit when n8n is never reached.
4. **Privilege leaks through new surfaces.**
   - Admin «عرض كـ» / «محاكاة القيود» (S6 Tasks 14–18) is UI-only. It never reaches `useUser()`, `requireStaff`, `assertRole`, `routeAccess`, `proxy.ts` or a request body.
   - New admin writes are pinned in `GATES`.
   - New writes refuse a frozen account.
   - Firm permissions (`_63`) and case assignment (`_65`) are checked on the server.
   - Client share links use scrypt passcodes with a per-link lockout and an anonymous feedback route under the strict rate limit.
5. **Long or fast runs that hang or time out.**
   - The E4 202 path and `useAiRun` progress polling must end in a final state the user can see.
   - Fast retrieval tools that answer inside the POST, such as `canvas-strategist`, still face the nginx 60-second cut.
   - Held runs must be swept by `ai_sweep_runs` and `ai_runs_retention`, not left pending forever.

---

## Execution units

Order: S1 phase A (live P0), then S6, the rest of S1, S2 (review gate first, telemetry last), S3, S4, S5, the moved S2-A8, and the release docs.
- **One move:** S2 Task A8 (re-enable review mode) runs as Task 33, just before the release docs, not inside S2.
  - Its precondition is a user go after `_30` and A3–A7 are in place. At the end it blocks no other unit.
  - It covers the S3 and S5 tools in one flip.
  - If the user withholds the go, the controller skips it, and Tasks 1–32 and 34 still pass (see Task 33).

### Task 1: S1-A1 Library precheck, precedents window, collection model, legacy slugs

- **Section tasks:** S1 Tasks 1–4 in `docs/plans/2026-11-03-owner-free-sections/S1-library.md`.
- **Files touched:**
  - create `SQL_batch_2026-11-03_owner_free/S1_precheck_principles_and_book.READ_ONLY.sql` (this creates the batch folder);
  - `src/app/api/library/precedents/[slug]/_window.ts`, `route.ts`, `_window.test.ts`;
  - create `src/app/precedents/[slug]/_collection-model.ts` and its test;
  - create `src/lib/library/legacyLibrarySlugs.ts` and `src/lib/library/readerNotice.ts`;
  - `src/app/laws/law-metadata-map.ts`, `src/app/laws/page.tsx`, `src/app/laws/components/ListItems.tsx`, `PaywallModal.tsx`, `src/app/laws/demo-data.ts`;
  - `src/constants/lawsLibraryData.ts`, `src/app/laws/principleLink.test.ts`.
- **Shared:** `src/app/laws/page.tsx` (Task 7 edits it again).
- **Migrations:** none.
- **Stop points:** S1 Task 1. The user runs the READ_ONLY precheck on production and pastes the three tables back.
  - Until then, Task 4's `dbId` values stay `null` and the reader shows the honest notice.
  - The deletion in Task 2 does not wait for the answer.
- **Consumes:** nothing new.
- **Produces:**
  - `targetWindowOffset(position, limit)`;
  - the response field `targetFound`;
  - `PRINCIPLES_DEFAULT_LIMIT` = `PRINCIPLES_MAX_LIMIT` = 50;
  - the collection run model;
  - the legacy slug map and `readerNotice`.

### Task 2: S1-A2 Server-only readers, viewport highlighting, delete the bundles

- **Section tasks:** S1 Tasks 5–8 in `docs/plans/2026-11-03-owner-free-sections/S1-library.md`.
- **Files touched:**
  - `src/app/precedents/[slug]/page.tsx` and `page-contract.test.ts`;
  - `src/app/book/[slug]/page.tsx` and `page-contract.test.ts`;
  - `src/app/api/library/books/[slug]/_shape.ts` and its test;
  - `src/app/laws/feqh-preview/page.tsx`;
  - `src/components/search/MultiColorHighlight.tsx`, create `src/hooks/useNearViewport.ts`, `src/app/precedents/[slug]/_principle-block.tsx`, `src/components/search/highlightScope.test.ts`;
  - delete `src/constants/precedents/`, `src/constants/sources-of-right-1.json`, `src/app/laws/demo-data-precedents.ts` and `src/app/laws/demo-data-books.ts`;
  - create `src/constants/no-protected-bundles.test.ts`.
- **Shared:**
  - `_principle-block.tsx`: Task 16 (S2-C4) adds «+ المجمّع» here;
  - `src/app/book/[slug]/page.tsx`: Task 7;
  - `src/lib/search/multiColorSearch.ts`: read here, edited in Task 7.
- **Migrations:** none.
- **Stop points:** none.
- **Consumes:** Task 1's window API, collection model and `readerNotice`.
- **Produces:**
  - `HighlightScope`;
  - `useNearViewport`;
  - the no-bundles guard test, which binds every later unit.

### Task 3: S6-A Business contract-review row and audience pricing

- **Section tasks:** S6 Tasks S6-T1 to S6-T6 in `docs/plans/2026-11-03-owner-free-sections/S6-pricing-admin.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_20_contract_review_business_row.sql`, `supabase/tests/rls/contract_review_business_row.test.sql`;
  - `supabase/migrations/_verify.sql` (the `wave1_pricing_rows` block and a new block);
  - `src/constants/clientServiceCatalog.ts`, `src/lib/pricingRepository.ts` and its test;
  - create `src/lib/pricing/clientPricingAudience.ts` and its test;
  - create `src/lib/pricing/clientPricingServer.ts` and its test;
  - `src/app/api/client-pricing/route.ts`, `src/hooks/useClientPricingCatalog.ts`;
  - `src/app/dashboard/client/requests/new/page.tsx`, `src/app/dashboard/client/services/page.tsx`;
  - `src/components/ai/advisoryHandoff.ts` and its test, `src/components/ai/AdvisoryTemplateNotice.tsx`, `src/app/ai/contract-drafter/_components/StepLawyerCTA.tsx`;
  - `src/components/floating/waChatPrices.ts`, `src/lib/services/whatsappRequestMessage.ts`;
  - `src/lib/pricing/catalogPriceLabel.ts` and its test;
  - `src/app/services/contracts/page.tsx`, `src/constants/servicesData.ts`;
  - `src/app/api/v1/service-requests/route.ts`, create `src/lib/pricing/serviceEstimate.ts` and its test;
  - create `src/lib/services/estimateLine.ts` and its test;
  - `src/app/dashboard/admin/service-orders/page.tsx`;
  - `src/lib/services/liveClaims.test.ts`, `src/lib/services/pricingApprovals.test.ts`.
- **Shared:**
  - `service-requests/route.ts`: Task 31 (S5-B1) tightens `persistedRequestMetadata`. The S6 stamp wraps its output: `stampServiceEstimate(persistedRequestMetadata(…), audience, catalog)`;
  - `admin/service-orders/page.tsx`: Task 14 (S2-B7);
  - `AdvisoryTemplateNotice.tsx`: Task 19 (S3-01) mounts it in the case-brief studio;
  - `requests/new/page.tsx`: Task 6;
  - `_verify.sql`.
- **Migrations:** `20261103_20`, any time; recommended right AFTER the deploy.
- **Stop points:**
  - S6-T1 (conditional): stop if anything seems to need a policy change on `admin_pricing_catalog`.
  - S6-T3 (conditional): stop if a `public` card would disappear.
- **Consumes:** nothing new.
- **Produces:**
  - `resolveClientService(serviceId, audience, catalog)` (the future B3 checkout must call it);
  - the server pricing loader;
  - `stampServiceEstimate`;
  - `estimateLineAr(metadata)`;
  - the `contract-review-business` variant (audience `corporate`, 800).

### Task 4: S6-B Admin pricing API and the rebuilt admin pricing page

- **Section tasks:**
  - S6 Tasks S6-T7 to S6-T8 in `docs/plans/2026-11-03-owner-free-sections/S6-pricing-admin.md`;
  - plus S5 Task S5-B6 in `docs/plans/2026-11-03-owner-free-sections/S5-canvas-and-leftovers.md`, absorbed here.
- **Files touched:**
  - create `src/app/api/v1/admin/pricing-catalog/route.ts` and `src/app/api/v1/admin/pricing-catalog/[serviceId]/route.ts`;
  - create `src/lib/pricing/catalogAdminRules.ts` and its test;
  - `src/app/api/v1/admin/coupons/[id]/route.ts`;
  - `src/app/dashboard/admin/pricing/page.tsx` and its test;
  - `src/lib/auth/adminRouteGates.test.ts` (`GATES` rows), `src/lib/services/pricingApprovals.test.ts`.
- **Shared:** `adminRouteGates.test.ts`, `pricingApprovals.test.ts`, `admin/coupons/[id]/route.ts` (Task 5).
- **Migrations:** none.
- **Stop points:** none.
- **Consumes:** Task 3's resolver and the catalogue variants.
- **Produces:** the admin catalogue API, which `requireStaff("settings.write")` guards.
- **Override (S5-B6 absorbed):**
  - If the rewritten page shows a «Beta free AI» count, it filters `tool.betaStatus === "beta-free" && !tool.comingSoon`.
  - Add S5-B6's test `admin pricing: «Beta free AI» never counts a «قريباً» tool` here. If the count is dropped, assert instead that the page source has no bare `betaStatus === "beta-free"` filter.
  - Task 31 runs S5-B6 as verify-only.
- **Override (gates):** both new admin write handlers get `GATES` rows in this commit.

### Task 5: S6-C Coupons: NEWCLIENT flag, row-only rules, admin API, page, usage log

- **Section tasks:** S6 Tasks S6-T9 to S6-T13 in `docs/plans/2026-11-03-owner-free-sections/S6-pricing-admin.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_21_newclient_first_order_flag.sql` and its test;
  - create `supabase/migrations/20261103_22_coupon_business_role.sql` and its test;
  - `_verify.sql`, `supabase/tests/rls/pricing_owner_package.test.sql`;
  - `src/lib/payments/couponRules.ts`, `couponServer.ts` and their tests, `checkoutCore.test.ts`, `couponCodeLiterals.test.ts`;
  - create `src/lib/payments/couponAdminRules.ts`, `couponAdminDiff.ts`, `couponUsageView.ts` and their tests;
  - `src/app/api/v1/admin/coupons/route.ts`, `src/app/api/v1/admin/coupons/[id]/route.ts`;
  - create `src/app/api/v1/admin/coupons/[id]/usage/route.ts`;
  - `src/app/dashboard/admin/subscriptions/coupons/page.tsx`, `src/types/adminBackendReady.ts`;
  - `src/proxy.ts`.
- **Shared:**
  - `couponServer.ts` and `checkoutCore.test.ts`: Task 9 (S1-T19) edits the same files later;
  - `proxy.ts`: Tasks 19, 21, 22, 23;
  - `_verify.sql`, `adminRouteGates.test.ts`.
- **Migrations:**
  - `20261103_21`, BEFORE the deploy (it must precede the code of S6-T10);
  - `20261103_22`, AFTER the deploy.
- **Stop points:** S6-T13 (conditional): stop if an RLS policy on `coupon_usage` seems needed. None is planned; the route reads it with the service role.
- **Consumes:** Task 3's catalogue ids (`itemId`).
- **Produces:**
  - per-item `excluded_items` and `itemId` matching in `couponRules`;
  - `couponRoleToUserType(role)` and `COUPON_USER_TYPE_TO_ROLE`;
  - `couponAdminDiff`;
  - the coupon usage route.

### Task 6: S6-D Admin «عرض كـ», sub-role simulation, and the security page

- **Section tasks:** S6 Tasks S6-T14 to S6-T19 in `docs/plans/2026-11-03-owner-free-sections/S6-pricing-admin.md`.
- **Files touched:**
  - `src/lib/nav/shellContext.ts` and its test, `src/hooks/useAdminView.ts`, `src/app/ai/layout.tsx`;
  - create `src/lib/nav/adminSimulation.ts` and its test, and `src/hooks/useAdminSimulation.ts`;
  - create `src/components/dashboard/AdminViewSwitch.tsx` and its test;
  - `src/components/dashboard/SharedSidebar.tsx`, `src/components/dashboard/GlobalSearch.tsx`;
  - `src/app/dashboard/government/page.tsx`;
  - `src/app/dashboard/client/requests/new/page.tsx`, `src/app/dashboard/client/consultation/new/page.tsx`, `src/hooks/useConsultationForm.ts`, `src/components/floating/whatsappWorkflow.ts`;
  - `src/app/dashboard/business/layout.tsx`, `src/components/dashboard/ConsultantGate.tsx`, `src/app/dashboard/firm/layout.tsx`;
  - `src/app/dashboard/admin/security/page.tsx` and its test.
- **Shared:**
  - `src/app/ai/layout.tsx`: Task 12 (S2-A7) adds `/ai/runs`;
  - `SharedSidebar.tsx`, which reads the nav files that Tasks 12, 19 and 29 edit;
  - `src/app/dashboard/firm/layout.tsx`: S4 Tasks 24–27 add firm pages under it;
  - `admin/security/page.tsx`: Task 32 (S5-B10) edits `LibraryActivityPanel.tsx`, which this page mounts.
- **Migrations:** none.
- **Stop points:** none.
- **Consumes:** nothing new.
- **Produces:**
  - `adminViewFromPath(pathname)`;
  - the widened `resolveAdminView`;
  - the `adminSimulation` model;
  - `AdminViewSwitch`.
- **Hard constraint, unchanged from the section:** the simulation never overrides `useUser()`, any guard, `src/proxy.ts`, any API, or a request body.

### Task 7: S1-B Library search grammar, colours, one search bar, ⓘ help, tashkeel index

- **Section tasks:** S1 Tasks 9–13 in `docs/plans/2026-11-03-owner-free-sections/S1-library.md`.
- **Files touched:**
  - `src/utils/normalizeArabic.ts` and its test, `src/lib/ai/retrieval.test.ts`;
  - `src/lib/search/multiColorSearch.ts` and its test;
  - `src/app/laws/page.tsx`, `src/app/laws/[slug]/page.tsx`, `src/app/laws/[slug]/_sidebar.tsx`;
  - `src/app/book/[slug]/page.tsx`, `src/app/book/[slug]/_sidebar.tsx`;
  - create `src/app/laws/[slug]/articleJump.ts` and `src/app/laws/catalogueMatch.ts`;
  - create `src/components/library/SearchSyntaxHelp.tsx` and `src/components/library/searchSyntaxExamples.ts`;
  - `src/components/library/ScopedSearchPanel.tsx`;
  - create `supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql` and `supabase/tests/rls/library_fts_tashkeel_fold.test.sql`;
  - `_verify.sql`.
- **Shared:**
  - `normalizeArabic.ts` also feeds `src/lib/ai/retrieval.ts` (every retrieval AI tool), so `retrieval.test.ts` must stay green;
  - `_verify.sql`.
- **Migrations:** `20261103_14`, AFTER the deploy.
- **Stop points:** S1 Task 13. `_14` rewrites three large tables under an ACCESS EXCLUSIVE lock; the user runs it at a quiet hour, with row counts before and after.
  - Until then, Task 9's query sends both the stripped form and the as-typed form, so search works against the unfolded index.
- **Consumes:** Task 2's `HighlightScope`.
- **Produces:** the server query grammar (particles, prefixes, parentheses, tashkeel) and `SearchSyntaxHelp`.
- **Override (`_verify`):** the `_14` block is the one exception to the RAISE-when-missing convention. It NOTICEs «not applied yet» while the folded config is absent, because the user picks the window and `_verify` may run days earlier. It RAISEs when `_14` ran and a probe with tashkeel misses.

### Task 8: S1-C/D1 Auto-lock hours, invitation days, eligibility table

- **Section tasks:** S1 Tasks 14–18 in `docs/plans/2026-11-03-owner-free-sections/S1-library.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_10_library_auto_lock_hours.sql`, `_11_library_invitation_grant_days.sql` and `_12_library_eligibility_verifications.sql`, each with its Docker test;
  - `_verify.sql`;
  - `src/lib/library/monitorSettings.ts`, `src/app/api/v1/admin/library-monitor/settings/route.ts`;
  - `src/lib/library/readQuota.ts`, `src/app/api/v1/library/status/route.ts`, `src/lib/ai/libraryRunAccess*`;
  - `src/lib/libraryAccessServer.ts`;
  - `src/app/api/v1/library/invitations/_shared.ts`, `.../redeem/route.ts`, `src/app/api/v1/admin/library-invitations/route.ts`;
  - `src/lib/services/libraryInvitationRules.ts`, `src/app/dashboard/admin/library-invitations/page.tsx`.
- **Shared:**
  - `readQuota.ts`: Task 30 (S5-A9) extends `readQuota.test.ts`'s not-locked list, anchored by test name;
  - `adminRouteGates.test.ts`: update the existing pins if an action changes;
  - `_verify.sql`.
- **Migrations:** `20261103_10`, `_11` and `_12`, all BEFORE the deploy.
- **Stop points:** none.
- **Consumes:** nothing new.
- **Produces:**
  - `quotaRefusal` gains `lockedUntil`;
  - the `auto_lock_hours` setting;
  - `library.invitations.grant_days`;
  - the `library_eligibility_verifications` table.

### Task 9: S1-D2 Library eligibility at every sale gate, plus the staff card (HIGH risk)

- **Section tasks:** S1 Tasks 19–20 in `docs/plans/2026-11-03-owner-free-sections/S1-library.md`.
- **Files touched:**
  - `src/lib/payments/checkoutCore.ts`, `src/lib/payments/couponServer.ts`;
  - create `src/lib/library/libraryPurchaseEligibility.ts` and `src/lib/library/libraryEligibilityServer.ts`;
  - `src/app/api/v1/entitlement-requests/route.ts`, `src/app/api/v1/admin/entitlements/requests/[id]/route.ts`, `src/app/api/v1/library/my-grant/route.ts`;
  - `src/lib/library/myLibraryGrant.ts`, `src/lib/pricing/priceBook.ts`, `src/app/api/v1/payments/*/route.test.ts`;
  - create `src/app/api/v1/admin/library-eligibility/[userId]/route.ts`;
  - create `src/app/dashboard/admin/users/[id]/LibraryEligibilityCard.tsx`, `src/app/dashboard/admin/users/[id]/page.tsx`;
  - `adminRouteGates.test.ts`.
- **Shared:** `checkoutCore.ts` and `couponServer.ts` (after Task 5), `priceBook.ts`, `adminRouteGates.test.ts`.
- **Migrations:** none. It consumes Task 8's `_12`.
- **Stop points:** none. The controller must report HIGH risk from `impact` on `buyerAllowed`, `checkoutCore` and `couponServer` before dispatch.
- **Consumes:**
  - Task 8's eligibility table;
  - Task 5's coupon rules: `itemId`, `excluded_items` and `first_paid_order_only`.
- **Produces:**
  - `libraryBuyerGate`, which replaces `buyerAllowed` at both gates;
  - the admin route guarded by `requireStaff("entitlements.grant")`.
- **Override:**
  - Anchor by the symbol `buyerAllowed`, not by `checkoutCore.ts:288` or `couponServer.ts:423`, because Task 5 moved those lines.
  - Test fixtures carry the row fields that Task 5 introduced.
  - The new admin write handler gets a `GATES` row.

### Task 10: S1-E/F Laws `official_links`, loader pass-through, S1 run notes

- **Section tasks:** S1 Tasks 21–23 in `docs/plans/2026-11-03-owner-free-sections/S1-library.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_13_library_laws_official_links.sql` and its test;
  - `src/app/api/library/library-column-lock.test.ts`;
  - `scripts/parsers/parse-laws.ts` and create `scripts/parsers/parse-laws.official-links.test.ts`;
  - `scripts/seed-library.ts` (source edit only, never run);
  - `src/lib/library/ownerLoaderTables.ts` and its test, `src/lib/library/libraryDocumentSeo.ts`;
  - create `SQL_batch_2026-11-03_owner_free/S1_RUN_NOTES.md`;
  - `_verify.sql`.
- **Shared:** `_verify.sql`, `library-column-lock.test.ts`.
- **Migrations:** `20261103_13`, BEFORE the deploy and before the owner's next library load.
- **Stop points:** none. The `_14` stop point is recorded in the run notes.
- **Consumes:** nothing new.
- **Produces:**
  - the `official_links` and `merged_regulation_details` columns (ungranted, read only through explicit column lists);
  - the S1 run notes, which Task 34 links to rather than copies.

### Task 11: S2-A1 Review gate: `_30`, tool labels, runCore hold (unreachable)

- **Section tasks:** S2 Tasks A1–A3 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_30_ai_review_gate.sql`, `supabase/tests/rls/ai_review_gate.test.sql` and `supabase/tests/rls/prelude_ai_review_legacy_row.sql`;
  - `_verify.sql`;
  - create `src/lib/ai/toolLabels.ts` and its test, and `src/lib/ai/runOutputBlocks.ts` and its test;
  - `src/lib/ai/runCore.ts`, `src/lib/ai/aiToolsConfig.ts`, `src/lib/ai/runCore.test.ts`.
- **Shared:** `runCore.ts`, `aiToolsConfig.ts`, `_verify.sql`.
- **Migrations:** `20261103_30`, BEFORE the deploy.
  - New `ai_runs` columns, none granted to `authenticated`.
  - `ai_release_run` and `ai_reject_run`.
  - `ai_sweep_runs` and `ai_runs_retention` re-created in place, with the same signatures.
- **Stop points:** none.
- **Consumes:** nothing new.
- **Produces:**
  - `AI_TOOL_LABELS_AR` and `AI_TOOL_PAGES`. Their test requires every `AI_TOOLS` id to have a label and a page entry, so Tasks 21 and 30 extend them;
  - `runOutputBlocks`;
  - `runHoldsForReview(mode, isAdmin)`, still unreachable until Task 33.

### Task 12: S2-A2 Staff alerts, admin review API and page, the released result

- **Section tasks:** S2 Tasks A4–A7 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - create `src/lib/ai/reviewAlerts.ts` and its test;
  - `src/app/api/v1/ai/runs/route.ts`, `src/app/api/v1/ai/callback/route.ts`;
  - create `n8n/workflows/wf-5.1-ai-review-staff-alert.json`, `n8n/README.md`;
  - create `src/lib/ai/reviewDecision.ts` and its test;
  - create `src/app/api/v1/admin/ai-runs/review/route.ts` and `src/app/api/v1/admin/ai-runs/[id]/release/route.ts`, `[id]/reject/route.ts` and `[id]/route.ts`;
  - `adminRouteGates.test.ts`;
  - `src/components/admin/adminNavByRole.ts` and its test, `src/constants/navigation.sidebars.primary.ts`, `src/lib/auth/adminNavAccess.ts`;
  - create `src/app/dashboard/admin/ai-review/page.tsx`;
  - create `src/lib/ai/runErrors.ts` and its test;
  - `src/hooks/useAiRun.ts`, create `src/app/ai/runs/[id]/page.tsx`, `src/app/ai/layout.tsx`.
- **Shared:**
  - `runs/route.ts` and `callback/route.ts`: Tasks 13, 17 and 18;
  - `useAiRun.ts` and `runErrors.ts`: Tasks 17 and 18;
  - `ai/layout.tsx`: after Task 6;
  - the nav files: `navigation.sidebars.primary.ts`. Anchor by label;
  - `n8n/README.md`: Task 31 (S5-B3) edits §11.
- **Migrations:** none. It consumes `_30`.
- **Stop points:** S2-A4. The user imports `wf-5.1` on live n8n, selects the SMTP and header-auth credentials, activates the workflow, and sets `N8N_WEBHOOK_STAFF_ALERT`. Until then the e-mail reports `not_configured` and the bell works. Either order is safe.
- **Consumes:** Task 11's labels, the hold path and the RPCs.
- **Produces:**
  - the admin queue and release/reject, guarded by `requireStaff("settings.write")` and with three `GATES` rows;
  - `/ai/runs/[id]`;
  - `runErrors.ts`.
- **Override (R29):** `/ai/runs/[id]` is a new page and `/ai/runs` is not in `PROTECTED`. `src/app/ai/layout.tsx` renders a signed-out visitor's page unwrapped and leaves the redirect to `proxy.ts`, so add `/ai/runs` to `PROTECTED` in `src/proxy.ts` in this unit. `proxy.ts` is then also a shared file here.

### Task 13: S2-B1 Text extraction, the file-text route, text kinds, pasted text

- **Section tasks:** S2 Tasks B1–B5 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - create `src/lib/ai/textExtract.ts` and its test (uses fflate, already a dependency);
  - create `src/lib/ai/fileTextToken.ts` and its test, and `src/app/api/v1/ai/file-text/[token]/route.ts`;
  - `src/lib/ai/aiFiles.ts` and its test;
  - `src/app/api/v1/ai/runs/route.ts`;
  - `src/lib/ai/runCore.ts`, `src/lib/ai/tools.ts`;
  - `src/lib/ai/briefCheck.test.ts`, `src/lib/ai/caseAnalysis.test.ts`, `runCore.test.ts`.
- **Shared:** `runCore.ts`, `tools.ts`, `runs/route.ts`.
- **Migrations:** none.
- **Stop points:**
  - S2-B5, after the deploy. The user sets `NZAMY_AI_TEXT_FILES=on`, proves one .docx brief-check and one pasted memo on live n8n, and only then sets `NEXT_PUBLIC_AI_TEXT_FILES=on` and rebuilds. Until then both flags are off and the old file kinds are unchanged.
  - A `.doc` reader would be a new npm dependency, so it is not planned.
- **Consumes:** nothing new.
- **Produces:**
  - `extractDocxText`, `decodeTextBytes`, `TEXT_CHARS_PER_PAGE = 3000`, `textPages` and `TEXT_FILE_MAX_CHARS`;
  - the HMAC file-text link;
  - `pasteAsFile` in `tools.ts` and `runCore`.
- **Override (freeze test):**
  - `file-text/[token]` is GET only, so the freeze walker skips it.
  - If a POST is added, it either reads no session (and goes in `ALLOWED` with a reason) or uses a gate helper.

### Task 14: S2-B2 Pickers, contract-review paste box, attachment preview

- **Section tasks:** S2 Tasks B6–B8 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - create `src/lib/ai/aiTextFilesFlag.ts`;
  - `src/components/ai/aiReadable.ts` and its test;
  - `src/app/ai/brief-check/page.tsx`, `src/app/ai/wargaming/page.tsx`;
  - `src/lib/services/orderIntake.contracts.ts` and its test, `src/hooks/useContractsState.ts`;
  - `src/components/contracts/steps/review/StepRUpload.tsx`, `src/app/ai/contracts/page.tsx`;
  - `src/app/ai/orders/[id]/_components/OrderSummary.tsx`, `src/app/dashboard/admin/service-orders/page.tsx`;
  - create `src/lib/attachments/previewKind.ts` and its test;
  - create `src/app/api/v1/documents/[id]/preview/route.ts` and `src/components/attachments/AttachmentPreviewModal.tsx`;
  - `src/components/draft/steps/StepCase.tsx`, `src/components/services/ServiceRequestWizard.tsx`.
- **Shared:**
  - the intake validator `orderIntake.contracts.ts`: Task 31's `intakeGuard`;
  - `StepRUpload.tsx`: Tasks 21 and 32;
  - `StepCase.tsx`: Task 32;
  - `ai/contracts/page.tsx`: Tasks 16, 18, 20 and 21;
  - `admin/service-orders/page.tsx`: after Task 3.
- **Migrations:** none.
- **Stop points:** none. The client flag stays off until the B5 stop point.
- **Consumes:** Task 13's extraction and flags; Task 3's estimate line on the same admin page.
- **Produces:**
  - `contractText` on contracts orders;
  - `AttachmentPreviewModal`;
  - the preview route.
- **Override:**
  - S2-B7's validator returns `contractText` inside its validated `value`. A contracts-review order is otherwise stripped by Task 31's `persistedRequestMetadata`.
  - Add a test that the validated value carries `contractText`.

### Task 15: S2-B3 The forced specialty and branch become optional, and the n8n prompts infer them

- **Section tasks:** S2 Tasks B9–B10 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - `src/lib/ai/tools.ts`, `src/lib/services/orderIntake.ts`, `src/hooks/useDraftState.ts`;
  - `src/components/draft/steps/StepIdentify.tsx`;
  - `src/app/ai/draft/page.tsx`, `src/app/ai/wargaming/page.tsx`, `src/app/ai/legal-opinion/page.tsx`;
  - `src/lib/ai/legalDrafter.test.ts`, `caseAnalysis.test.ts`, `src/lib/services/orderIntake.test.ts`;
  - `n8n/ai/workflows.mjs`, the regenerated `n8n/ai/*.json`, `src/lib/ai/n8nWorkflows.test.ts`, `n8n/ai/README.md`.
- **Shared:**
  - `tools.ts`;
  - the intake validator `orderIntake.ts`;
  - `StepIdentify.tsx`: Task 32 (S5-B9);
  - `n8n/ai/workflows.mjs`: Tasks 18, 20, 21 and 30.
- **Migrations:** none.
- **Stop points:** S2-B10. The user imports the regenerated wargaming, analyze-strength and legal-drafter workflows on live n8n BEFORE the deploy that carries B9.
- **Consumes:** nothing new.
- **Produces:** the legal-branch group in `StepIdentify` (at `:218` on base) is no longer required. Three required groups remain.

### Task 16: S2-C/D Context hand-off, the send menu, «+ المجمّع», AI runs in the activity log

- **Section tasks:** S2 Tasks C1–C4 and D1 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - create `src/lib/ai/contextHandoff.ts` and its test, `src/lib/ai/transcriptHandoff.ts`;
  - create `src/components/ai/SendWithContextMenu.tsx`;
  - `src/app/ai/collector/page.tsx`, `src/app/ai/collector/_components/DesktopPanel.tsx`, `SessionsPanel.tsx`;
  - `src/components/AiResultActions.tsx`;
  - `src/app/ai/draft/page.tsx`, `src/app/ai/contracts/page.tsx`, `src/app/ai/legal-opinion/page.tsx`, `src/app/ai/wargaming/page.tsx`;
  - `src/app/precedents/[slug]/_principle-block.tsx`;
  - create `src/lib/library/principleCollectorItem.ts` and its test;
  - `src/lib/events.ts` and its test, `src/app/api/v1/lawyer/activity/route.ts`, `src/app/dashboard/lawyer/activity/page.tsx`.
- **Shared:**
  - `_principle-block.tsx`: after Task 2;
  - `activity/page.tsx`: Task 32 (S5-B10) adds a live region;
  - the four tool pages.
- **Migrations:** none.
- **Stop points:** none.
- **Consumes:** Task 2's principle block.
- **Produces:** `contextHandoff` targets, of which four are live.
- **Override (S2-C1):**
  - The canvas target stays `live:false` «قريباً».
  - Its stated reason is «لا يوجد مستقبِل للسياق على اللوحة بعد» (no board reads a hand-off yet), not ٤٢٨, because S5 builds the studio in this same wave.
  - Wiring a board to read a hand-off is a follow-up, not part of this wave.

### Task 17: S2-E1 `progress_events`, builders, runCore emits, the 202 path, read routes

- **Section tasks:** S2 Tasks E1–E5 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_31_progress_events.sql` and its test;
  - `_verify.sql`, `src/app/api/v1/cron/ai-sweep/route.ts`;
  - create `src/lib/ai/progressEvents.ts` and its test;
  - `src/lib/ai/runCore.ts` and its test, `src/lib/ai/runErrors.ts` and its test;
  - `src/app/api/v1/ai/runs/route.ts`, `src/app/api/v1/ai/callback/route.ts`;
  - create `src/lib/ai/progressRead.ts` and its test;
  - create `src/app/api/v1/ai/runs/[id]/events/route.ts` and `src/app/api/v1/ai/runs/progress/route.ts`.
- **Shared:** `runCore.ts`, `runs/route.ts`, `callback/route.ts`, `runErrors.ts`, `_verify.sql`.
- **Migrations:** `20261103_31`, BEFORE the deploy.
- **Stop points:** none.
- **Consumes:** Task 11's hold path and Task 12's `runErrors`.
- **Produces:**
  - the R7-safe progress event builders;
  - `dispatchRunWith`, split out of `startRunWith`, so job runs answer 202 before lib-queries;
  - the progress read routes.
- **Review note:** a debit taken before the 202 must be refunded by `ai_fail_run` or the sweep when dispatch then fails. The section's E4 test must prove it.

### Task 18: S2-E2 Callback detail, n8n progress branches, `useAiRun`, `AiThinkingStage` and its ten mounts

- **Section tasks:** S2 Tasks E6–E10 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - `src/lib/ai/runCore.ts` and its test;
  - `n8n/ai/workflows.mjs` and the regenerated JSON, `src/lib/ai/n8nWorkflows.test.ts`;
  - `src/hooks/useAiRun.ts`, `src/lib/ai/runErrors.ts`;
  - create `src/components/ai/AiThinkingStage.tsx`, `src/components/ai/aiThinkingStage.logic.ts` and its test, and `src/components/ai/aiThinkingStage.mounts.test.ts`;
  - the mount points:
    - `src/components/draft/steps/StepAiDraft.tsx`;
    - `src/components/contracts/steps/draft/StepGenerate.tsx`;
    - `src/app/ai/contract-drafter/page.tsx`;
    - `src/app/ai/brief-check/page.tsx`, `src/app/ai/wargaming/page.tsx`;
    - `src/app/ai/analyze-strength/page.tsx`;
    - `src/app/ai/case-brief/page.tsx`;
    - `src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx` and `LetterWorkflow.tsx`;
    - `src/app/ai/quick-answer/page.tsx`;
  - also touched: `src/app/ai/communicate/page.tsx`, `src/app/ai/najiz-optimizer/page.tsx`, `src/app/ai/legal-opinion/page.tsx`, `src/app/ai/contracts/page.tsx` and `src/app/dashboard/admin/ai-usage/page.tsx`.
- **Shared:**
  - `runCore.ts`, `workflows.mjs`;
  - `StepAiDraft.tsx`: Tasks 20, 23 and 27;
  - `StepGenerate.tsx`: Tasks 20 and 23;
  - `case-brief/page.tsx` and `quick-answer/page.tsx`: Task 19 moves and rewrites them;
  - `ai-usage/page.tsx`: Task 33.
- **Migrations:** none. It consumes `_31`.
- **Stop points:** S2-E6. The user imports the job workflows with progress branches:
  - wargaming, analyze-strength and legal-drafter BEFORE the deploy, together with B10;
  - brief-check AFTER the deploy, together with S3-11 (Task 20);
  - the other jobs any time.
- **Consumes:** Task 17's events and read routes.
- **Produces:** `AiThinkingStage`, and a mount test listing every mount file. Task 19 updates that test.

### Task 19: S3-A Case-brief studio in `/ai/analyze`, redirects, corporate/NGO contracts, `/ai/micro`, quick answer

- **Section tasks:** S3 Tasks S3-01 to S3-06 in `docs/plans/2026-11-03-owner-free-sections/S3-ai-tools-studios-sharing.md`.
- **Files touched:**
  - create `src/components/ai/caseBrief/CaseBriefStudio.tsx`;
  - delete `src/app/ai/case-brief/page.tsx`;
  - `src/app/ai/analyze/page.tsx`, `src/app/ai/analyze/_components/AttachmentSqueezer.tsx`;
  - `src/constants/lawyerAiCatalog.ts`, `src/constants/lawyerAiBadges.ts`, `src/app/ai/page.tsx`;
  - `src/constants/betaGatedRoutes.ts` and its test, `src/lib/betaConfig.ts`;
  - `src/lib/services/cannedOutputGate.test.ts`, `src/components/ai/sendToDrafterWiring.test.ts`, `src/lib/services/pricingApprovals.test.ts`, `src/lib/ui/darkModeGuard.test.ts`;
  - `src/proxy.ts`;
  - the nav files: `src/constants/navigation.sidebars.legal.ts`, `navigation.navbar.ts`, `navigation.sidebars.business.ts`;
  - `src/app/sitemap.ts`;
  - `src/app/ai/research/page.tsx` and `layout.tsx`, `src/lib/lawyerQuickTools.ts` and its test;
  - `src/components/floating/constants/floatingServices.tsx`;
  - `src/app/ai/corp/contracts/page.tsx`, `src/app/ai/ngo/volunteer-contract/page.tsx`, `src/app/ai/ngo/honesty.test.ts`;
  - `src/app/dashboard/micro/contracts/page.tsx`, `src/app/dashboard/micro/requests/page.tsx`, `src/app/dashboard/micro/page.tsx`;
  - `src/app/dashboard/ngo/contracts/page.tsx`, `src/app/dashboard/ngo/page.tsx`, `src/app/dashboard/ngo/volunteers/page.tsx`;
  - `src/app/ai/micro/page.tsx`, `src/lib/ai/toolPointsDisplay.ts`;
  - `src/app/ai/quick-answer/page.tsx`, create `src/app/ai/quick-answer/_quickAnswer.ts` and its test;
  - `src/lib/ai/toolLabels.ts`, `src/components/ai/aiThinkingStage.mounts.test.ts`.
- **Shared:**
  - `proxy.ts` `REDIRECTS`: Tasks 5, 21, 22 and 23;
  - the nav files: anchor by label;
  - `betaGatedRoutes.ts` and `betaConfig.ts`: Tasks 21 and 31;
  - `toolPointsDisplay.ts`: Tasks 21 and 30;
  - `cannedOutputGate.test.ts`, `pricingApprovals.test.ts`.
- **Migrations:** none.
- **Stop points:** none.
- **Consumes:**
  - Task 18's mount test and `AiThinkingStage`;
  - Task 11's `AI_TOOL_PAGES`;
  - Task 3's `AdvisoryTemplateNotice`.
- **Produces:**
  - the 301s `/ai/case-brief` → `/ai/analyze` and `/ai/research`;
  - the corporate and NGO contract links pointing at the live `/ai/contracts`.
- **Overrides:**
  - S3-01/02 change `AI_TOOL_PAGES["case-brief"]` to `/ai/analyze`.
  - They move the case-brief entry in `aiThinkingStage.mounts.test.ts` to `src/components/ai/caseBrief/CaseBriefStudio.tsx`, and the studio keeps `<AiThinkingStage`.
  - S3-06's quick-answer rewrite keeps `<AiThinkingStage` mounted. The mount test must stay green.
  - The quick answer stays at today's 20 points and today's roles (٤١٢ open).

### Task 20: S3-B1 Tool status, the section and clause editors, brief-check dimensions

- **Section tasks:** S3 Tasks S3-07 to S3-12 in `docs/plans/2026-11-03-owner-free-sections/S3-ai-tools-studios-sharing.md`.
- **Files touched:**
  - `src/lib/ai/runCore.ts`, `src/lib/ai/aiToolsConfig.ts` and its test;
  - `src/lib/rateLimitRoutes.ts` and its test;
  - create `src/app/api/v1/ai/tool-status/route.ts`;
  - `src/components/draft/legalDraft.ts` and its test, `src/components/draft/steps/StepAiDraft.tsx`, `src/components/draft/stepAiDraftWiring.test.ts`;
  - `src/components/contracts/contractsProRun.ts` and its test, `src/components/contracts/steps/draft/StepGenerate.tsx`, `src/app/ai/contracts/page.tsx`;
  - `src/lib/ai/tools.ts`, `src/lib/ai/briefCheck.test.ts`;
  - `n8n/ai/workflows.mjs`, `n8n/ai/brief-check.json`, `n8nWorkflows.test.ts`;
  - create `src/app/ai/brief-check/_BriefCheckReport.tsx` and `src/app/ai/brief-check/_dimensions.ts` and its test.
- **Shared:**
  - `runCore.ts`, `aiToolsConfig.ts`, `tools.ts`, `rateLimitRoutes.ts` (also Task 22), `workflows.mjs`;
  - `StepAiDraft.tsx`, `StepGenerate.tsx`.
- **Migrations:** none.
- **Stop points:** S3-11. The user imports `n8n/ai/brief-check.json`, carrying the E6 branch and the S3-11 prompt, AFTER the deploy that carries S3-10. Until then the report puts every finding under «غير مصنّف».
- **Consumes:**
  - Task 18's `StepAiDraft`/`StepGenerate` mounts;
  - Task 11's `aiToolsConfig` and `effectiveToolMode`.
- **Produces:**
  - `readAiToolsSetting` exported from `runCore`;
  - `toolAvailability(mode, isAdmin)` in `aiToolsConfig`;
  - the edited pleading in `legalDraft.ts` (Task 27 consumes it).
- **Override (parity with Task 33):**
  - `runCore`'s refusal and `toolAvailability` use one helper, so they cannot drift.
  - The test pins parity over every mode × admin pair through `effectiveToolMode`, never a literal "review is refused". It must pass whether Task 33 runs or not.

### Task 21: S3-B2 Contract review (250) and contract negotiator (150), with registry, workflows and UI

- **Section tasks:** S3 Tasks S3-13 to S3-18 in `docs/plans/2026-11-03-owner-free-sections/S3-ai-tools-studios-sharing.md`.
- **Files touched:**
  - `src/lib/ai/tools.ts`, `src/lib/ai/toolPointsDisplay.ts`, `src/lib/ai/pointsStanding.ts` (read);
  - create `src/lib/ai/contractReview.test.ts` and `src/lib/ai/contractNegotiator.test.ts`;
  - `n8n/ai/workflows.mjs`, create `n8n/ai/contract-review.json` and `n8n/ai/contract-negotiator.json`;
  - `n8nWorkflows.test.ts`, `n8n/ai/README.md`;
  - `src/proxy.ts`, `betaGatedRoutes.ts`, `betaConfig.ts`;
  - create `src/components/contracts/steps/review/StepRAiReview.tsx`, `src/components/contracts/ContractReviewReport.tsx` and `src/components/contracts/contractReviewRun.ts`;
  - `src/app/ai/contracts/page.tsx`, `src/app/ai/contract-reviewer/page.tsx`, `src/app/ai/contract-negotiator/page.tsx`;
  - `cannedOutputGate.test.ts`;
  - `src/lib/ai/toolLabels.ts`, `src/lib/services/liveClaims.test.ts`.
- **Shared:**
  - `tools.ts`, `toolPointsDisplay.ts`, `workflows.mjs`;
  - `proxy.ts` (the `/ai/contract-reviewer` 301);
  - `betaGatedRoutes.ts`, `ai/contracts/page.tsx`, `StepRUpload.tsx` (via the review mode).
- **Migrations:** none.
- **Stop points:**
  - S3-14: the user imports `contract-review.json`, re-selects its credentials, and sets the tool to `staff`;
  - S3-17: the same for `contract-negotiator.json`.
  - Until then both tools ship with `defaultMode` off. The screens show «قريباً» or refuse cleanly; nobody can be charged.
- **Consumes:**
  - Task 11's `AI_TOOL_LABELS_AR` / `AI_TOOL_PAGES`;
  - Task 14's `contractText`;
  - Task 18's stage.
- **Produces:**
  - `PERCENT_PATTERN` and `hasPercent`, exported from `tools.ts` (Task 30 reuses them);
  - the AI tools `contract-review` and `contract-negotiator`.
- **Overrides:**
  - Add `AI_TOOL_LABELS_AR` and `AI_TOOL_PAGES` entries in the same commit as each registry entry: `contract-review` → `/ai/contracts`, `contract-negotiator` → `/ai/contract-negotiator`.
  - If the ids join `PRICED_AI_TOOL_IDS`, update the liveClaims unlisted set and `pricingApprovals` from the code, not a literal count.
  - The AI tool id `contract-review` equals the human-review catalogue id `contract-review` (600/800). The two namespaces must never be looked up together: no code may resolve an `ai_runs.tool` through `CLIENT_SERVICE_CATALOG` or the reverse.

### Task 22: S3-C1 Client sharing: scrypt, `_50`, work shares, verify, feedback

- **Section tasks:** S3 Tasks S3-19 to S3-23 in `docs/plans/2026-11-03-owner-free-sections/S3-ai-tools-studios-sharing.md`. The design block before S3-19 is binding.
- **Files touched:**
  - create `src/lib/services/shareSecrets.ts` and its test;
  - create `supabase/migrations/20261103_50_client_shares.sql` and `supabase/tests/rls/client_shares.test.sql`;
  - `_verify.sql`;
  - create `src/lib/shares/workSnapshot.ts` and its test, and `src/app/api/v1/shares/work/route.ts` and its test;
  - `src/app/api/v1/share/[token]/verify/route.ts`, create `src/lib/shares/shareLookup.ts`;
  - create `src/app/api/v1/share/[token]/feedback/route.ts` and `src/lib/shares/feedbackInput.ts`;
  - `src/lib/rateLimitRoutes.ts`, `src/proxy.ts`;
  - `SQL_batch_2026-11-03_owner_free/README.md` (a run line only);
  - `src/lib/auth/accountFreezeWrites.test.ts`.
- **Shared:** `proxy.ts`, `rateLimitRoutes.ts` (after Task 20), `_verify.sql`, `accountFreezeWrites.test.ts`.
- **Migrations:** `20261103_50`, BEFORE the deploy. It needs `20261026_66` (document_shares) and `ai_runs`.
- **Stop points:** none.
- **Consumes:** Task 11's `ai_runs` columns, which stay ungranted.
- **Produces:**
  - the `client_shares`, `share_feedback` and `share_access` tables;
  - scrypt passcodes;
  - a per-link lockout;
  - the work-snapshot validator.
- **Overrides:**
  - Do not copy `_50` into `SQL_batch_2026-11-03_owner_free/`. Add one README line with the full path and «يُشغَّل قبل النشر». Create the README if it does not exist yet.
  - `POST /api/v1/shares/work` uses `assertRole(`.
  - The anonymous feedback and verify POSTs read no session. If the freeze walker flags either, add it to `ALLOWED` with the reason «client feedback on a share link: no account session».

### Task 23: S3-C2 The share page, `ClientSharePanel`, share history, case sharing

- **Section tasks:** S3 Tasks S3-24 to S3-27 in `docs/plans/2026-11-03-owner-free-sections/S3-ai-tools-studios-sharing.md`.
- **Files touched:**
  - `src/app/share/[token]/page.tsx`, create `src/app/share/[token]/_ShareDocument.tsx` and `sharePage.test.ts`;
  - create `src/hooks/useWorkShare.ts` and `src/components/contracts/ClientSharePanel.tsx`;
  - `src/components/draft/steps/StepAiDraft.tsx`, `src/components/contracts/steps/draft/StepGenerate.tsx`, `src/lib/shares/workSnapshot.ts`;
  - `src/proxy.ts`, `src/constants/navigation.sidebars.legal.ts`;
  - create `src/app/api/v1/shares/route.ts`, `src/app/api/v1/shares/[id]/route.ts`, `src/app/ai/share-history/page.tsx` and `src/lib/shares/historyView.ts`;
  - `src/app/dashboard/lawyer/cases/[id]/sharing/page.tsx`, `src/components/documents/ShareDocumentModal.tsx`.
- **Shared:**
  - `StepAiDraft.tsx`: after Task 20, before Task 27;
  - `StepGenerate.tsx`;
  - `proxy.ts`: removes the `/ai/share-history` → `/settings` redirect;
  - the nav files.
- **Migrations:** none. It consumes `_50`.
- **Stop points:** none.
- **Consumes:**
  - Task 22's routes and tables;
  - Task 20's edited pleading and clauses.
- **Produces:** `stripCitationMarkers` as a pure export, which Task 27 reuses.
- **Overrides:**
  - `/ai/share-history` is a page, not an API, and today it is not in `PROTECTED`. Once the redirect is removed, add it to `PROTECTED` in `proxy.ts` so it is login-only (R29). `src/app/ai/layout.tsx` does not redirect a signed-out visitor; it relies on `proxy.ts`.
  - `src/app/api/v1/shares/[id]/route.ts` mutating handlers use `assertRole(`.

### Task 24: S4-A Note author, delete guard, office kind

- **Section tasks:** S4 Tasks 1–5 in `docs/plans/2026-11-03-owner-free-sections/S4-firms-letterhead.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_60_note_author_name.sql`, `_61_inherited_court_rows_delete_guard.sql` and `_62_firm_office_kind.sql`, each with its Docker test;
  - `supabase/tests/rls/accounts_firms_owner_answers.test.sql`, `_verify.sql`;
  - `src/app/api/v1/cases/[id]/notes/_shared.ts`, `src/app/api/v1/cases/[id]/timeline/route.ts`, `src/app/api/v1/lawyer/consultations/[id]/notes/route.ts`;
  - create `src/lib/notes/noteAuthor.ts`;
  - `src/app/register/provider/data.ts`, `types.ts`, `signupMetadata.ts` and its test;
  - create `src/app/api/v1/admin/firms/[id]/office-kind/route.ts`;
  - `adminRouteGates.test.ts`.
- **Shared:** `_verify.sql`, `adminRouteGates.test.ts`.
- **Migrations:**
  - `20261103_60`, BEFORE the deploy;
  - `_61`, EITHER order;
  - `_62`, BEFORE the deploy.
  - Re-running `20261030_12` must be followed by `_60` and `_62`.
- **Stop points:** none.
- **Consumes:** nothing new.
- **Produces:** the note author name, the delete guard, and `firms.office_kind`.
- **Override (gates):** the new admin `office-kind` write handler gets a `GATES` row with its `requireStaff` action.

### Task 25: S4-B Firm member permissions, letterhead print kit, case assignment, member landing

- **Section tasks:** S4 Tasks 6–13 in `docs/plans/2026-11-03-owner-free-sections/S4-firms-letterhead.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_63_firm_member_permissions.sql`, `_64_firm_letterhead_print_kit.sql` and `_65_assign_firm_case.sql`, each with its Docker test;
  - `_verify.sql`;
  - create `src/lib/firm/firmPermissions.ts` and its test;
  - `src/lib/branding/firmLetterheadPermissions.ts` and its test, `src/lib/auth/firmMembershipAccess.ts`;
  - create `src/app/api/v1/firm/members/[memberId]/permissions/route.ts`;
  - `src/app/dashboard/firm/team/[id]/page.tsx`, `src/app/dashboard/firm/team/roles/page.tsx`;
  - `src/lib/branding/brandingServer.ts`, `src/app/api/v1/branding/route.ts` and its test;
  - create `src/app/api/v1/firm/cases/[id]/assign/route.ts` and `_status.ts`;
  - `src/app/dashboard/firm/cases/assign/page.tsx`, `src/app/dashboard/firm/cases/[id]/page.tsx`;
  - `src/lib/auth/sessionResponse.ts`, `src/app/api/v1/auth/session/route.ts`, `src/app/login/page.tsx`;
  - create `src/lib/auth/memberLanding.ts`;
  - create `src/app/api/v1/firm/assigned-cases/route.ts`, `src/components/dashboard/firm/MyAssignedCasesPanel.tsx` and `src/lib/firm/assignedCases.ts`;
  - `src/app/dashboard/firm/page.tsx`.
- **Shared:**
  - `branding/route.ts`: Tasks 27 and 28;
  - `firm/layout.tsx`: from Task 6, read only;
  - `accountFreezeWrites.test.ts`;
  - `_verify.sql`.
- **Migrations:** all BEFORE the deploy.
  - `_63`;
  - `_64`, after `_63`;
  - `_65`, after `_61`, `_62` and `_63`.
- **Stop points:** none. The section's alternative design, widening `can_manage_branding_vault` (an RLS change), is not chosen. Choosing it would be a stop point.
- **Consumes:** Task 24's `office_kind` and the delete guard.
- **Produces:**
  - `firmPermissions`;
  - the per-member print kit;
  - `assign_firm_case`;
  - `memberLanding`.
- **Override (freeze):** every new firm write route uses `assertRole(` or `assertCaseWorker(`.

### Task 26: S4-C Client types, firm billing, invoice reversal

- **Section tasks:** S4 Tasks 14–20 in `docs/plans/2026-11-03-owner-free-sections/S4-firms-letterhead.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_66_client_types.sql`, `_67_firm_billing.sql` and `_68_invoice_reversal.sql`, each with its Docker test;
  - `_verify.sql`;
  - create `src/lib/clients/clientTypes.ts`;
  - `src/app/api/v1/lawyer/clients/route.ts`, `[id]/route.ts`, `src/app/api/v1/lawyer/finance/route.ts`;
  - `src/components/dashboard/lawyer/AddClientModal.tsx`, `src/app/dashboard/lawyer/_components/AddCaseModal.tsx`;
  - `src/lib/finance/invoiceFinanceCore.ts`;
  - create `src/app/api/v1/firm/finance/route.ts`, `[paymentId]/collect/route.ts` and `src/lib/finance/firmFinance.ts`;
  - `src/app/dashboard/firm/finance/page.tsx` and its test;
  - create `src/app/api/v1/lawyer/finance/[paymentId]/collections/route.ts` and `src/app/api/v1/lawyer/finance/collections/[collectionId]/reverse/route.ts`;
  - `src/app/dashboard/lawyer/finance/page.tsx`.
- **Shared:** `invoiceFinanceCore.ts`, `_verify.sql`, `accountFreezeWrites.test.ts`.
- **Migrations:** all BEFORE the deploy.
  - `_66`;
  - `_67`, after `_63` and `_66`;
  - `_68`, after `_63`, `_66` and `_67`.
  - Re-running `20261030_20` must be followed by `_66` then `_67`; re-running `20261030_10`, by `_67`.
- **Stop points:** none. Widening the `invoice_collections` SELECT policy is the rejected alternative, and would be a stop point.
- **Consumes:** Task 25's `firmPermissions`.
- **Produces:** the four client types, firm-level billing, and the reversal entry. There is no VAT (٤٣٠ is open).

### Task 27: S4-D SVG logos, verification card, OOXML letterhead, export bar wired into three tools

- **Section tasks:** S4 Tasks 21–27 in `docs/plans/2026-11-03-owner-free-sections/S4-firms-letterhead.md`.
- **Files touched:**
  - create `src/lib/branding/svgLogo.ts` and `src/components/letterhead/rasterizeSvgLogo.ts`;
  - `src/components/letterhead/LetterheadWorkspace.tsx`, `src/lib/branding/brandingVault.ts`, `src/app/api/v1/branding/logo/route.ts`;
  - create `supabase/migrations/20261103_69_letterhead_verify_card.sql` and its test;
  - `_verify.sql`;
  - `src/lib/branding/letterheadIdentity.ts`, `src/app/api/v1/branding/route.ts`;
  - create `src/app/api/v1/branding/verify-card/route.ts`, `src/app/api/v1/letterhead/verify/[token]/route.ts` and `src/app/verify/[token]/page.tsx`;
  - create `src/lib/docx/ooxml.ts` and its test (fflate, no new dependency), and `src/lib/docx/letterheadDocx.ts` and its test;
  - `src/components/letterhead/useLetterhead.ts`;
  - create `src/components/letterhead/LetterheadExportBar.tsx`, `LetterheadPrintDocument.tsx` and `exportKit.ts`;
  - create `src/app/api/v1/branding/export-file/route.ts` and `src/lib/docx/exportPolicy.ts`;
  - `src/components/draft/legalDraft.ts`, `src/components/draft/steps/StepAiDraft.tsx`;
  - `src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx`, `src/app/ai/contract-drafter/_components/StepContractResult.tsx`, `src/app/ai/legal-opinion/aiPath.test.ts`.
- **Shared:**
  - `StepAiDraft.tsx`: the last of four edits (Tasks 18, 20, 23, 27);
  - `legalDraft.ts`: after Task 20;
  - `AiOpinionPanel.tsx`: after Task 18;
  - `branding/route.ts`.
- **Migrations:** `20261103_69`, BEFORE the deploy.
- **Stop points:** none. Server-side SVG sanitising (dompurify/jsdom, or moving `sharp` to dependencies) is the rejected alternative, and would be a new-dependency stop point.
- **Consumes:**
  - Task 20's edited pleading from `legalDraft.ts`;
  - Task 23's `stripCitationMarkers`.
- **Produces:**
  - `ooxml.ts` and `letterheadDocx.ts`;
  - `LetterheadExportBar` in the drafter, the opinion panel and the contract drafter;
  - the `/verify/[token]` page.
- **Overrides:**
  - `pleadingBlocks` reads S3-08's edited pleading, not the raw AI output.
  - It strips citations with Task 23's `stripCitationMarkers`; no second stripper.
  - `/verify/[token]` is public and read-only: no session and no write.

### Task 28: S4-E Section close: S4 run order and the full Docker sweep

- **Section tasks:** S4 Task 28 in `docs/plans/2026-11-03-owner-free-sections/S4-firms-letterhead.md`.
- **Files touched:** create `SQL_batch_2026-11-03_owner_free/S4_README.md`.
- **Shared:** the batch folder (Task 34 links to this file rather than copying it).
- **Migrations:** none new. It runs the `_60`–`_69` chain end to end in Docker, including the re-run chains.
- **Stop points:** none.
- **Consumes:** Tasks 24–27.
- **Produces:** the S4 run order and re-run rules.

### Task 29: S5-A1 Canvas studio: `canvas_boards`, rules, API, board client, store prop, pages

- **Section tasks:** S5 Tasks S5-A1 to S5-A8 in `docs/plans/2026-11-03-owner-free-sections/S5-canvas-and-leftovers.md`.
- **Files touched:**
  - create `supabase/migrations/20261103_80_canvas_boards.sql` and its test;
  - `_verify.sql`;
  - create `src/lib/canvas/canvasBoards.ts` and its test, and `src/lib/canvas/canvasBoardEntities.server.ts`;
  - create `src/app/api/v1/lawyer/canvas-boards/route.ts`, `[boardId]/route.ts` and `link-targets/route.ts`, plus `route-contract.test.ts`;
  - `src/app/api/library/init/init-route-contract.test.ts` (read);
  - `src/lib/services/ownRequestsFilter.ts`;
  - `src/lib/services/graphClient.ts` and its test, create `src/lib/services/canvasBoardService.ts`, `src/lib/services/caseGraphService.ts`;
  - `src/app/dashboard/business/kanban/CaseGraphView.tsx`, create `src/lib/services/graphStore.ts` and its test;
  - `src/constants/navigation.sidebars.legal.ts`;
  - create `src/app/dashboard/lawyer/canvas/page.tsx` and `canvas/[boardId]/page.tsx`;
  - create `src/components/dashboard/canvasStudio/CanvasStudioIndex.tsx`, `CanvasBoardScreen.tsx` and `EntityLinkPicker.tsx`;
  - create `src/lib/canvas/canvasStudio.wiring.test.ts`.
- **Shared:**
  - the nav files: add the row after «خريطة القضايا», anchored by that label;
  - `CaseGraphView.tsx`: Tasks 30 and 32;
  - `routeAccess.ts`: read only, since `/dashboard/lawyer` already admits the routes;
  - `accountFreezeWrites.test.ts`, `_verify.sql`.
- **Migrations:** `20261103_80`, BEFORE the deploy. The routes answer 503 `canvas_boards_unavailable` on `42P01`/`PGRST205`, so either order is survivable.
- **Stop points:** none. @xyflow/react is already a dependency.
- **Consumes:** nothing new.
- **Produces:**
  - `/dashboard/lawyer/canvas` and `/dashboard/lawyer/canvas/[boardId]`;
  - `CaseGraphView`'s store prop and AI-button prop.
  - The office map `/dashboard/lawyer/graph` stays as it is (٤٢٨).
- **Override (freeze):** every canvas-board POST/PUT/PATCH/DELETE uses `assertRole(`.

### Task 30: S5-A2 Canvas strategist (50), its workflow, «خطة استراتيجية للقضية»

- **Section tasks:** S5 Tasks S5-A9 to S5-A11 in `docs/plans/2026-11-03-owner-free-sections/S5-canvas-and-leftovers.md`.
- **Files touched:**
  - `src/lib/ai/tools.ts`, `src/lib/ai/toolPointsDisplay.ts`;
  - `src/lib/services/pricingApprovals.test.ts`, `src/lib/services/liveClaims.test.ts`;
  - `src/components/pricing/PricingCards.tsx` (a comment only);
  - `src/lib/library/readQuota.test.ts`;
  - `src/lib/ai/n8nWorkflows.test.ts`, `src/lib/ai/runCore.test.ts`;
  - `n8n/ai/workflows.mjs`, create `n8n/ai/canvas-strategist.json`, `n8n/ai/README.md`;
  - create `src/app/dashboard/business/kanban/_graph-ai-strategy.ts` and its test;
  - `CaseGraphView.tsx`;
  - `src/lib/ai/toolLabels.ts`.
- **Shared:**
  - `tools.ts`, `toolPointsDisplay.ts`, `workflows.mjs`;
  - `readQuota.test.ts`: after Task 8;
  - `CaseGraphView.tsx`;
  - `/pricing` (`PricingCards.tsx`).
- **Migrations:** none.
- **Stop points:** S5-A10. The user imports `canvas-strategist.json` on live n8n after the deploy and records the id. Until then the tool is off and the board button refuses cleanly.
- **Consumes:**
  - Task 21's `PERCENT_PATTERN`/`hasPercent`;
  - Task 29's store and AI-button props;
  - Task 11's labels.
- **Produces:** the AI tool `canvas-strategist`: fast, retrieval, 50 points, `consultantBlocked: false`, not locked by the library suspension (٤٣٢ default).
- **Overrides:**
  - Reuse `PERCENT_PATTERN`/`hasPercent` from Task 21. Do not define a second percent regex.
  - Add `AI_TOOL_LABELS_AR["canvas-strategist"]` with `AI_TOOL_PAGES["canvas-strategist"] = null`. A null page keeps it out of `REVIEWABLE_AI_TOOLS`: it is a fast tool whose output must come back in the POST reply.
  - Pin `PRICED_AI_TOOL_IDS` and the liveClaims unlisted set from the code as it stands after Task 21, not the literal "seven".
  - Add `"canvas-strategist"` to the readQuota not-locked list by test name, not by `:96-110`.

### Task 31: S5-B Wave 1 leftovers, part 1: intake keys, stale test, n8n README, KPIs, marketplace, gated links

- **Section tasks:** S5 Tasks S5-B1 to S5-B7 in `docs/plans/2026-11-03-owner-free-sections/S5-canvas-and-leftovers.md`. S5-B6 is verify-only, because Task 4 absorbed it.
- **Files touched:**
  - `src/lib/services/intakeGuard.ts` and its test;
  - delete `tests/pricing-plans.test.mjs`, `scripts/run-script-tests.mjs` if it references it, and `src/lib/pricing/pricingHonesty.test.ts`;
  - `n8n/README.md`;
  - `src/app/dashboard/provider/page.tsx`, `src/app/pro/marketplace/page.tsx`, `src/lib/services/liveClaims.test.ts`;
  - the gated-link pages:
    - `src/app/dashboard/ngo/volunteers/page.tsx`, `ngo/reports/page.tsx`, `ngo/contracts/page.tsx`;
    - `src/app/dashboard/government/reports/page.tsx`, `government/compliance/page.tsx`;
    - `src/app/dashboard/micro/contracts/page.tsx`;
    - `src/app/services/labor/page.tsx`;
    - `src/components/OnboardingBanner.tsx`, `src/lib/notificationsStore.ts`;
  - `src/constants/betaGatedRoutes.ts` and its test.
- **Shared:**
  - the intake validator `intakeGuard.ts`;
  - `betaGatedRoutes.ts`: after Tasks 19 and 21;
  - `n8n/README.md`: after Task 12;
  - `liveClaims.test.ts`.
- **Migrations:** none.
- **Stop points:** none.
- **Consumes:**
  - Task 14's `contractText`;
  - Task 3's `stampServiceEstimate`, which wraps `persistedRequestMetadata`;
  - Task 19's repointed contract links.
- **Produces:** the tightened `persistedRequestMetadata` and the «قريباً» wrapper for terminal gated links.
- **Overrides:**
  - S5-B1 adds a test that a contracts-review order keeps `contractText`, plus the estimate stamp, through `persistedRequestMetadata` + `stampServiceEstimate`.
  - S5-B7 computes the links to wrap from `isTerminalToolHref` and `betaGatedRoutes` at HEAD. It drops the pinned "7 links" count and the `href: '/ai/ngo/volunteer-contract'` literal at `volunteers:66`.
  - Links that Task 19 repointed to the live `/ai/contracts` (`ngo/volunteers`, `ngo/contracts`, `micro/contracts`) stay live, not «قريباً».

### Task 32: S5-B Wave 1 leftovers, part 2: copy, accessibility, `<details>`, successor read, read-only SQL, templates

- **Section tasks:** S5 Tasks S5-B8 to S5-B14 in `docs/plans/2026-11-03-owner-free-sections/S5-canvas-and-leftovers.md`.
- **Files touched:**
  - `src/app/services/consultations/page.tsx`;
  - create `src/components/ui/radioGroupKeys.ts` and its test, and `src/components/ui/requiredGroups.a11y.test.ts`;
  - `src/components/draft/steps/StepIdentify.tsx`, `src/components/contracts/steps/review/StepRUpload.tsx`, `src/components/draft/steps/StepCase.tsx`;
  - `src/app/dashboard/lawyer/activity/page.tsx`, `src/app/dashboard/admin/security/LibraryActivityPanel.tsx`, `src/app/dashboard/business/kanban/CaseGraphView.tsx`;
  - create `src/components/ui/liveRegions.a11y.test.ts`;
  - create `src/app/laws/[slug]/_details-block.ts` and its test, `src/app/laws/[slug]/_article-components.tsx`;
  - `src/app/api/library/init/route.ts`, create `src/lib/library/lawSuccessors.ts` and its test;
  - create `SQL_batch_2026-11-03_owner_free/READ_ONLY_library_preamble_details_summaries.sql` and `supabase/tests/rls/prelude_library_preamble_fixture.sql`;
  - `SQL_batch_2026-11-03_owner_free/README.md`;
  - `src/app/ai/templates/page.tsx`, `src/app/dashboard/firm/templates/page.tsx`.
- **Shared:**
  - `StepIdentify.tsx`: after Task 15;
  - `StepRUpload.tsx`: after Tasks 14 and 21;
  - `StepCase.tsx`: after Task 14;
  - `activity/page.tsx`: after Task 16;
  - `CaseGraphView.tsx`: after Tasks 29 and 30;
  - `LibraryActivityPanel.tsx`: its page was rebuilt in Task 6;
  - the batch README.
- **Migrations:** none. The READ_ONLY SQL is not a migration.
- **Stop points:** none.
- **Consumes:**
  - Task 15's optional legal-branch group;
  - Task 14's preview modal in `StepCase` and `StepRUpload`.
- **Produces:** `radioGroupKeys`, the live regions, `lawSuccessors`, and the read-only preamble list.
- **Overrides:**
  - S5-B9 asserts four `role="radiogroup"` groups in `StepIdentify`, of which three carry `aria-required="true"`. The legal-branch group is optional after Task 15.
  - S5-B9 anchors the dropzone edits by content, not `StepRUpload.tsx:72-77` or `StepCase.tsx:191-199`.
  - S5-B13 adds its section to the existing batch README. It must not overwrite the README.
  - Do not use `text-gray-100`/`200` in any live-region or disabled style.

### Task 33: S2-A8 Re-enable review mode (moved; STOP-POINT, skippable)

- **Section tasks:** S2 Task A8 in `docs/plans/2026-11-03-owner-free-sections/S2-ai-platform.md`.
- **Files touched:**
  - `src/lib/ai/aiToolsConfig.ts`, `src/lib/ai/runCore.ts`, `src/lib/ai/toolLabels.ts` (`REVIEWABLE_AI_TOOLS`);
  - `src/app/api/v1/admin/settings/route.ts`, `src/app/api/v1/admin/ai-runs/route.ts`;
  - `src/app/dashboard/admin/ai-usage/page.tsx`;
  - `src/lib/ai/runCore.test.ts`, `src/lib/ai/runVisibility.test.ts`;
  - Task 20's `toolAvailability` test, if its expected table changes.
- **Shared:** `runCore.ts`, `aiToolsConfig.ts`, `toolLabels.ts`, `ai-usage/page.tsx`.
- **Migrations:** none. It needs `_30` on production BEFORE the deploy that carries it.
- **Stop points:** S2-A8. The controller asks the user before dispatch.
  - The section's precondition reads "`_30` has run on production, A3–A7 are deployed, the e-mail tested or knowingly bell-only".
  - In this single-deploy batch, "deployed" means: `_30` runs before the deploy, and A3–A7 ship in the same deploy as A8.
  - Choosing review mode stays an admin action after the deploy.
  - If `_30` is missing, the hold update fails, and the run fails as `store_failed` and is refunded.
- **Skip clause:** without the user's explicit go, the controller skips this unit.
  - Review mode then stays refused for everyone, and A8 is listed as a follow-up in the owner report.
  - Tasks 1–32 and 34 pass either way. Task 20's parity test is written through `effectiveToolMode` for that reason.
- **Consumes:**
  - Tasks 11 and 12 (the hold, the queue, release/reject, alerts);
  - Task 20's `toolAvailability`;
  - Tasks 21 and 30's label entries.
- **Produces:**
  - `review` among the writable modes;
  - `REVIEWABLE_AI_TOOLS`, meaning tools with no conversation and a non-null page. After Tasks 21 and 30, that adds `contract-review` and `contract-negotiator`; `canvas-strategist` stays out.
- **Why moved:**
  - It needs a user go that would otherwise block 20 later units.
  - Placed last, one flip covers the S3 and S5 tools.
  - Skipping it leaves every other unit green.

### Task 34: Release docs: SQL README, owner report, `_verify` sweep

- **Section tasks:** none. This unit consolidates the run notes:
  - S1 Task 23 (`S1_RUN_NOTES.md`), S4 Task 28 (`S4_README.md`), S3 Task S3-20's README line (Task 22) and S5 Task S5-B13's README section;
  - the "User steps" and "Excluded" parts of all six section files in `docs/plans/2026-11-03-owner-free-sections/`.
- **Files touched:**
  - `SQL_batch_2026-11-03_owner_free/README.md`: complete it, keeping the existing sections;
  - create, at the repo root, `تقرير_للمالك_٢٠٢٦-١١-٠٣_الدفعة_الثانية.md`;
  - `supabase/migrations/_verify.sql`: the final sweep only;
  - `src/lib/sqlMergeHygiene.test.ts`: add the new block names to its required list.
- **Shared:** `_verify.sql`, the batch folder.
- **Migrations:** none new.
- **Stop points:** none. The user acts on the README after the merge.
- **The README** (it follows `SQL_batch_2026-11-02_wave1/README.md`):
  - Give every file with its full PC path, `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_NN_*.sql`, and its full server path, `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_NN_*.sql`.
  - Order: BEFORE-deploy SQL → n8n imports due before the deploy → deploy (`deploy.sh`; run `npm install` first if dependencies changed; it does not run `_verify`) → AFTER-deploy SQL → n8n imports due after the deploy → `_verify.sql` by hand through `docker exec … psql -v ON_ERROR_STOP=1`.
  - Give one SELECT check per migration whose `ok` is never NULL. The SQL editor hides NOTICEs, so a SELECT is the user's evidence.
  - Link `S1_RUN_NOTES.md` and `S4_README.md`; do not copy them.
  - Say what is screen output and what is a file.
  - Wording: the user runs every migration («نُفِّذ ✓» once done), never the owner.
- **The owner report:**
  - Arabic, status «مبني في الكود — لم يُنشر بعد».
  - One row per built item, plus every excluded item with its blocking question.
  - New questions numbered from ٤٣٩ upwards, collected from the sections (see the preflight's Owner check):
    - ٤٣٩ `ai_review_hours` default 24 h;
    - ٤٤٠ the 3,000-characters-per-page rule;
    - ٤٤١ release/reject by `operations`;
    - ٤٤٢ AI «صياغة بديلة لبند» and its price;
    - ٤٤٣ what a client sees of a shared case;
    - ٤٤٤ hide, wire or relabel the 22 «Backend-ready» files;
    - ٤٤٥ the «subscriber discount» on the 500-point contract;
    - no new number for contract review's roles: it rides the six contracts-pro roles that `/ai/contracts` already admits (corporate, micro and NGO among them). List it under ٤١٧ as «لم نوسّع ولم نضيّق».
  - Recheck that ٤٣٩ is still free at HEAD before numbering.
- **The `_verify` sweep:**
  - Every `20261103_*` block exists once. Each RAISEs with a «run <file>» instruction when its migration is missing or wrong, NOTICEs only when its base schema is absent, and `_14` alone NOTICEs while it has not run (R14).
  - Every block name is listed in `sqlMergeHygiene.test.ts`.
  - The S6 `wave1_pricing_rows` edit from Task 3 is intact.
- **Before writing the owner report:** re-check every «built» row against HEAD (fixing a page is not closing a finding), using an opus-pinned review pass.
- **Before the final commit:** run `detect_changes({scope:"compare", base_ref:"main"})`, the full `npm run test:unit` (≤ 6 CRLF failures) and the build.

---

## Migration run order

All are new files in `supabase/migrations/`. The numbers do not collide: 10–14, 20–22, 30–31, 50, 60–69 and 80; `20261103_*` is empty at base. None changes RLS on an existing table, and none creates an overload.

| # | File | When | Prerequisites | Old code with it (BEFORE) / new code without it (AFTER) |
|---|---|---|---|---|
| 10 | `20261103_10_library_auto_lock_hours.sql` | BEFORE | `20261031_10` | New settings column; old code reads explicit columns. New code reads it through `optionalColumn` |
| 11 | `20261103_11_library_invitation_grant_days.sql` | BEFORE | the library invitations table | Ungranted new column; old code unaffected |
| 12 | `20261103_12_library_eligibility_verifications.sql` | BEFORE | — | New table; old code never reads it |
| 13 | `20261103_13_library_laws_official_links.sql` | BEFORE, and before the owner's next library load | `20261004_01` | Ungranted new columns on `library.laws`; reads use explicit column lists |
| 14 | `20261103_14_library_fts_tashkeel_fold.sql` | AFTER, **STOP-POINT** (quiet hour) | the deploy carrying S1 Task 9; `_10`–`_13` | Until it runs, the new query sends both the stripped and the as-typed form, so search still matches |
| 20 | `20261103_20_contract_review_business_row.sql` | any time; recommended right AFTER | `20261102_10`, `20261102_11` | Old code reads `audience=eq.individual` only and never sees the row. Before it runs, new code serves the code-catalogue variant at 800 |
| 21 | `20261103_21_newclient_first_order_flag.sql` | BEFORE (before the code of S6-T10) | `20261026_20` | Re-asserts the flag the new row-only rule reads; the old code ignores it |
| 22 | `20261103_22_coupon_business_role.sql` | AFTER | the deploy of S6-T11/T12 | Until it runs, coupons saved with `business` still miss companies: today's behaviour, not a regression. Run before the deploy, the old page would narrow an edited coupon |
| 30 | `20261103_30_ai_review_gate.sql` | BEFORE | `20261027_10`, `20261101_10` | Ungranted new `ai_runs` columns; reads use explicit lists. The functions are re-created in place |
| 31 | `20261103_31_progress_events.sql` | BEFORE | `20261027_10` (`ai_runs`) | New table; old code never writes it. New code tolerates its absence (the section's E1 test) |
| 50 | `20261103_50_client_shares.sql` | BEFORE | `20261026_66`, `20261027_10` | New tables; old code never reads them |
| 60 | `20261103_60_note_author_name.sql` | BEFORE | `20261030_12` (re-run → `_60` again) | Additive |
| 61 | `20261103_61_inherited_court_rows_delete_guard.sql` | EITHER | — | A guard that old code never trips on a legitimate path |
| 62 | `20261103_62_firm_office_kind.sql` | BEFORE | `20261030_12` (re-run → `_62` again) | Additive |
| 63 | `20261103_63_firm_member_permissions.sql` | BEFORE | — | New table |
| 64 | `20261103_64_firm_letterhead_print_kit.sql` | BEFORE | `_63` | No RLS change on `branding_vaults` (explicit `VAULT_COLUMNS`) |
| 65 | `20261103_65_assign_firm_case.sql` | BEFORE | `_61`, `_62`, `_63` | New function, not an overload |
| 66 | `20261103_66_client_types.sql` | BEFORE | `20261030_20` (re-run → `_66`, `_67`) | Additive; old forms send the old types, which stay valid |
| 67 | `20261103_67_firm_billing.sql` | BEFORE | `_63`, `_66`; `20261030_10` (re-run → `_67`) | Additive |
| 68 | `20261103_68_invoice_reversal.sql` | BEFORE | `_63`, `_66`, `_67` | Additive |
| 69 | `20261103_69_letterhead_verify_card.sql` | BEFORE | — | Additive |
| 80 | `20261103_80_canvas_boards.sql` | BEFORE | — | New table. The new routes answer 503 `canvas_boards_unavailable` without it |

**Run sequence for the user:**
1. BEFORE: `_10`, `_11`, `_12`, `_13`, `_21`, `_30`, `_31`, `_50`, `_60`, `_61`, `_62`, `_63`, `_64`, `_65`, `_66`, `_67`, `_68`, `_69`, `_80`.
2. n8n imports due before the deploy: wargaming, analyze-strength and legal-drafter (B10 + E6).
3. Deploy.
4. AFTER: `_20`, `_22`.
5. n8n imports due after the deploy: brief-check (E6 + S3-11), contract-review, contract-negotiator, canvas-strategist, `wf-5.1`, and the remaining E6 jobs.
6. `_14` at a quiet hour (STOP-POINT).
7. `_verify.sql` by hand.

---

## Stop-point register

| # | Stop point | Unit | What the user does | What the code does until then |
|---|---|---|---|---|
| 1 | S1 T1: production precheck | Task 1 | Runs `SQL_batch_2026-11-03_owner_free/S1_precheck_principles_and_book.READ_ONLY.sql` on prod and pastes the three tables back | Legacy-slug `dbId` values stay `null`; the reader shows the honest notice. The deletion does not wait |
| 2 | S1 T13: `_14` tashkeel fold | Task 7 | Runs `_14` AFTER the deploy at a quiet hour, with row counts before and after | Search sends both forms and works against the unfolded index |
| 3 | S6 T1 (conditional): pricing catalogue policy | Task 3 | Approves any policy change on `admin_pricing_catalog` (none planned) | — |
| 4 | S6 T3 (conditional): a public card would disappear | Task 3 | Approves the visible change | The implementer stops before the change |
| 5 | S6 T13 (conditional): `coupon_usage` RLS | Task 5 | Approves any policy (none planned) | Read with the service role |
| 6 | S2 A4: `wf-5.1` staff alert | Task 12 | Imports and activates `wf-5.1`, selects the SMTP and header-auth credentials, sets `N8N_WEBHOOK_STAFF_ALERT` | The e-mail reports `not_configured`; the bell works |
| 7 | S2 B5: text files on live n8n | Task 13 | Sets `NZAMY_AI_TEXT_FILES=on`, proves a .docx and a pasted memo, then sets `NEXT_PUBLIC_AI_TEXT_FILES=on` and rebuilds | Both flags off; the old file kinds only |
| 8 | S2 B10 + E6 (part): pre-deploy imports | Tasks 15, 18 | Imports wargaming, analyze-strength and legal-drafter BEFORE the deploy | If skipped, those prompts may get an empty branch or area. Import first |
| 9 | S2 E6 (rest): progress branches | Task 18 | Imports the other job workflows any time | The stage shows generic stages, with no per-step detail |
| 10 | S3-11: brief-check import | Task 20 | Imports `brief-check.json` AFTER the deploy | Findings show under «غير مصنّف» |
| 11 | S3-14: contract-review import | Task 21 | Imports, re-selects credentials, sets the tool to `staff`, tests | Tool off (`defaultMode` off); nobody is charged |
| 12 | S3-17: contract-negotiator import | Task 21 | Same as row 11 | Same as row 11 |
| 13 | S5-A10: canvas-strategist import | Task 30 | Imports after the deploy and records the id in `n8n/ai/README.md` | Tool off; the board button refuses cleanly |
| 14 | S2 A8: re-enable review mode | Task 33 | Gives an explicit go before dispatch | The unit is skipped; review mode stays refused |
| 15 | Not chosen (would be stop points) | Tasks 13, 25, 26, 27 | — | A `.doc` reader (new dependency); widening `can_manage_branding_vault` or the `invoice_collections` SELECT (RLS); server-side SVG sanitising (new dependency) |
