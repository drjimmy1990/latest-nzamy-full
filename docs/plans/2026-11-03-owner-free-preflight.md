# Owner-free wave: pre-flight conflict scan

**Plan:** `docs/plans/2026-11-03-owner-free-plan.md` (34 units).
**Sections:** `docs/plans/2026-11-03-owner-free-sections/S1`–`S6`.
**Base:** main `1103812d`. Checked at HEAD of `batch/2026-11-03-owner-free`.

**What was checked at HEAD before writing this scan:**
- No `supabase/migrations/20261103_*` file exists.
- ٤٣٩ is not yet used as an owner-question number. The only hits are the Hijri year 1439 in library data and an old report.
- `fflate` 0.8.3 and `@xyflow/react` 12 are already in `package.json`, so neither S2 nor S5 adds a dependency.
- No section migration changes RLS on an existing table. A grep of S2–S5 for `create/alter/drop policy`, `enable row level`, `grant` and `revoke` finds policies and grants only on new tables (`progress_events`, `client_shares`/`share_feedback`/`share_access`, `firm_member_permissions`, the S4 billing and reversal tables, `canvas_boards`). `_30` adds ungranted columns only. S4's two RLS-widening designs are rejected alternatives, which would be stop points.
- `_verify.sql` uses `-- >>> verify:<name>` / `-- <<< verify:<name>` blocks, which `src/lib/sqlMergeHygiene.test.ts` guards.
- Earlier `SQL_batch_*` folders hold only a README.
- 21 tests walk the source tree with `readdirSync`. Of these:
  - `adminRouteGates.test.ts` requires `requireStaff` plus a `GATES` row for every admin write;
  - `accountFreezeWrites.test.ts` requires one of five gate helpers, or an `ALLOWED` row, for every mutating route that reads the session.

**Unit ↔ section map**, used in the rows below:

| Units | Section tasks |
|---|---|
| 1–2 | S1 T1–8 |
| 3–6 | S6 T1–19 (Task 4 absorbs S5-B6) |
| 7–10 | S1 T9–23 |
| 11–18 | S2 A1–A7, B, C, D, E |
| 19–23 | S3 |
| 24–28 | S4 |
| 29–30 | S5-A |
| 31–32 | S5-B |
| 33 | S2-A8 |
| 34 | `sqlMergeHygiene.test.ts` gains the new block names; full unit run (≤ 6 CRLF failures) and the build; an opus-pinned re-check of every «built» row against HEAD before the owner report | Links `S1_RUN_NOTES.md` and `S4_README.md`; keeps the S3-20 and S5-B13 README parts | OK under R14 and R17 |

---

## 1. Pair rows (cross-section shared files and interfaces)

"Producer" is the earlier unit, "consumer" the later one. "Conflict" means a section's literal text breaks against another section. Its ruling is in §3, and the override is written into the unit in the plan.

| # | Shared file / interface | Producer (unit · task) | Consumer (unit · task) | What one produces vs what the other consumes | Finding |
|---|---|---|---|---|---|
| P1 | `src/lib/ai/runCore.ts` | 11 · S2-A3 (hold path), 13 · B4 (`pasteAsFile`), 17 · E3/E4 (events, `dispatchRunWith`), 18 · E6 (callback detail) | 20 · S3-07 (exports `readAiToolsSetting`), 30 · S5-A9 (settlement test), 33 · S2-A8 (refusal reads `runHoldsForReview`) | A8 changes the refusal at the old `:294-300`. S3-07 adds a client-readable "may I run" answer that must match that refusal | **Conflict C5**: after A8, S3-07's answer and runCore's refusal can drift. → R5 |
| P2 | `runCore.ts`, A8 precondition | 11–12 · S2-A1..A7 | 33 · S2-A8 | A8 needs "`_30` on prod, A3–A7 deployed, user go", which can't hold mid-branch | **Conflict C6**: the stop point blocks every later unit if it stays in S2. → R6 (moved to Task 33, skippable) |
| P3 | `src/lib/ai/tools.ts` | 13 · B4, 15 · B9 (branch/area optional), 20 · S3-10 (brief-check output) | 21 · S3-13/16 (new tools, `PERCENT_PATTERN`), 30 · S5-A9 (`canvas-strategist`) | Registry entries are added in sequence. S5-A9 writes its own percent regex | **Conflict C8**: two percent rules. → R8 |
| P4 | `AI_TOOL_LABELS_AR` / `AI_TOOL_PAGES` (`toolLabels.ts`, test: every `AI_TOOLS` id has both) | 11 · S2-A2 | 21 · S3-13/16, 30 · S5-A9 | New registry ids with no label or page entry | **Conflict C2**: `toolLabels.test.ts` goes red at the first new id. → R2 |
| P5 | `AI_TOOL_PAGES["case-brief"] = "/ai/case-brief"` | 11 · S2-A2 | 19 · S3-01/02 (deletes the page, 301 → `/ai/analyze`) | The page points at a route that now redirects | **Conflict C3**: the review "open" link and `/ai/runs/[id]` back-link would 301. → R3 |
| P6 | `aiThinkingStage.mounts.test.ts` and the mounts in `case-brief/page.tsx`, `quick-answer/page.tsx` | 18 · S2-E10 | 19 · S3-01/02 (moves case-brief to `CaseBriefStudio.tsx`), S3-06 (rewrites quick-answer) | The test names a file that S3 deletes; S3-06's rewrite may drop the mount | **Conflict C4**. → R4 |
| P7 | `PRICED_AI_TOOL_IDS`, the liveClaims unlisted set, `pricingApprovals` `TODAY` | 21 · S3-13/16 (may add 2 ids) | 30 · S5-A9 (adds 1 id; text says "seven") | S5's count assumes S3 added nothing | **Conflict C7**: the literal "seven" is wrong if S3 adds ids. → R7 |
| P8 | `src/lib/ai/toolPointsDisplay.ts` | 19 · S3-05 (micro), 21 · S3-13/16 | 30 · S5-A9 (`:16-32`) | Line anchors move | Compatible: anchor by symbol (global constraint) |
| P9 | `src/lib/ai/aiToolsConfig.ts` | 11 · A3, 20 · S3-07 (`toolAvailability`) | 33 · A8 (`WRITABLE_MODES` += review, `effectiveToolMode` passthrough) | A8 rewrites the functions S3-07 builds on | Covered by R5 (parity through one helper) |
| P10 | `src/lib/ai/toolLabels.ts` `REVIEWABLE_AI_TOOLS` | 33 · A8 (rule: no conversation and a non-null page) | 21, 30 (new tools) | `contract-review` and `contract-negotiator` (pages) become reviewable; `canvas-strategist` (null page) does not | Compatible by design. R2 sets the strategist's page to `null` deliberately: it is fast and must return in the POST reply (A11) |
| P11 | `src/lib/ai/contextHandoff.ts`, canvas target | 16 · S2-C1 (canvas target `live:false`, reason ٤٢٨) | 29 · S5-A (builds `/dashboard/lawyer/canvas`) | S2 says canvas is blocked by ٤٢٨, yet S5 ships the studio in the same wave | **Conflict C1**: wrong reason shown or recorded. → R1 |
| P12 | `src/lib/services/orderIntake.contracts.ts` → `intakeGuard.persistedRequestMetadata` | 14 · S2-B7 (`contractText`) | 31 · S5-B1 (keeps only validated keys plus 2 contracts extras) | If B7 puts `contractText` outside the validated value, B1 strips it | **Conflict C12**. → R12 |
| P13 | `src/app/api/v1/service-requests/route.ts` | 3 · S6-T5 (`stampServiceEstimate(persistedRequestMetadata(…))`) | 31 · S5-B1 (tightens `persistedRequestMetadata`) | The stamp wraps the guard's output, so B1 cannot strip it | Compatible. B1 adds a test that the stamp and `contractText` survive (R12) |
| P14 | Contracts orders vs S6 estimate | 3 · S6-T5 | 14 · S2-B7 | `useContractsState` sends `service:"contracts"` and no `originalPrice` (`originalPrice` is set only at `requests/new/page.tsx:165` and `whatsappRequestMessage.ts:536`) | Compatible: no overlap |
| P15 | `src/components/draft/steps/StepIdentify.tsx` | 15 · S2-B9 (legal-branch group at base `:218` becomes optional) | 32 · S5-B9 (asserts 4 `role="radiogroup" aria-required="true"`) | After B9 only 3 groups are required | **Conflict C11**. → R11 |
| P16 | `StepRUpload.tsx` | 14 · S2-B7 (tabs), B8 (preview), 21 · S3-15 (AI review step) | 32 · S5-B9 (dropzone at base `:72-77`) | The lines move three times | Compatible: anchor by content (in the Task 32 override) |
| P17 | `StepCase.tsx` | 14 · S2-B8 (preview modal) | 32 · S5-B9 (dropzone at base `:191-199`) | The lines move | Compatible: anchor by content |
| P18 | `StepAiDraft.tsx` | 18 · S2-E9 (stage) → 20 · S3-08 (section editor) → 23 · S3-25 (`ClientSharePanel`) | 27 · S4-27 (letterhead bar, `pleadingBlocks`) | S4-27 must print the edited pleading, not the raw AI text | **Conflict C13**: two sources of pleading text, and two citation strippers. → R13 |
| P19 | `StepGenerate.tsx` | 18 · E9, 20 · S3-09 (clause editor) | 23 · S3-25 | Sequential edits of separate blocks | Compatible |
| P20 | `src/components/draft/legalDraft.ts` | 20 · S3-08 (edited sections) | 27 · S4-27 (`pleadingBlocks`) | The edited model goes into the export | Covered by R13 |
| P21 | `stripCitationMarkers` | 23 · S3-25 (pure export) | 27 · S4-27 | One stripper | Covered by R13 |
| P22 | `AiOpinionPanel.tsx` | 18 · E10 (stage) | 27 · S4-27 (export bar) | Separate blocks | Compatible |
| P23 | `src/app/dashboard/admin/pricing/page.tsx:153` | 4 · S6-T8 (full rewrite) | 31 · S5-B6 (one-line filter at `:153`) | The line no longer exists after T8 | **Conflict C9**. → R9 (absorbed into Task 4) |
| P24 | `src/constants/betaGatedRoutes.ts` and inline links (`ngo/volunteers:44,66`, `ngo/contracts:47`, `micro/contracts:186`) | 19 · S3-04 (repoints them to the live `/ai/contracts`; removes them from `betaGatedRoutes` and `betaConfig`) | 31 · S5-B7 (wraps 7 pinned "terminal" links in «قريباً»; asserts `href:'/ai/ngo/volunteer-contract'` at `volunteers:66`) | S5-B7 would mark live links «قريباً» and assert a literal that S3-04 removed | **Conflict C10**. → R10 |
| P25 | `betaGatedRoutes.ts`, `betaConfig.ts` | 19 · S3-01/04/05, 21 · S3-15/18 | 31 · S5-B7 | Sequential edits of the gate list; `betaGatedRoutes.test.ts` walks the tree | Compatible under R10 |
| P26 | `src/proxy.ts` `REDIRECTS` / `PROTECTED` | 5 · S6-T13 (usage route) | 19 · S3-02/03/04, 21 · S3-15, 22 · S3-23, 23 · S3-26 | Separate keys in one map; S3-26 removes `"/ai/share-history": "/settings"` | Compatible (sequential). See self-consistency for Task 23 (`PROTECTED`) |
| P27 | `src/lib/rateLimitRoutes.ts` (and its test) | 20 · S3-07 (tool-status) | 22 · S3-23 (feedback POST, strict) | Two additions to one list | Compatible |
| P28 | `src/lib/auth/routeAccess.ts` | — | 29 · S5-A8 (reads: `/dashboard/lawyer` prefix at `:67`) | No section edits it | Compatible |
| P29 | Nav files: `navigation.sidebars.primary.ts`, `.legal.ts`, `.business.ts`, `navigation.navbar.ts`, `adminNavByRole.ts`, `adminNavAccess.ts` | 6 · S6-T14/17 (consumers), 12 · S2-A6 (admin AI review row) | 19 · S3-02/04/06, 23 · S3-26, 29 · S5-A8 (row after «خطة القضايا») | Several row inserts into one sidebar | Compatible: anchor by label, not line (`:19`, `:32`, `:268` move) |
| P30 | `src/app/ai/layout.tsx` | 6 · S6-T14 (`resolveAdminView` widened) | 12 · S2-A7 (`/ai/runs`) | Different concerns in one file | Compatible |
| P31 | `src/app/ai/contracts/page.tsx` | 14 · B7, 16 · C3, 18 · E10 | 20 · S3-09, 21 · S3-15 | Five edits to separate blocks | Compatible (sequential) |
| P32 | `brief-check/page.tsx`, `wargaming/page.tsx`, `legal-opinion/page.tsx`, `draft/page.tsx` | 14 · B6/B8, 15 · B9, 16 · C3 | 18 · E9/E10, 20 · S3-12 | Sequential edits | Compatible |
| P33 | `src/app/ai/quick-answer/page.tsx` | 18 · E10 (mount) | 19 · S3-06 (rewrite) | The rewrite must keep the mount | Covered by R4 |
| P34 | `src/app/precedents/[slug]/_principle-block.tsx` | 2 · S1-T7 (`HighlightScope`) | 16 · S2-C4 («+ المجمّع») | Separate additions | Compatible |
| P35 | `src/utils/normalizeArabic.ts` → `src/lib/ai/retrieval.ts` | 7 · S1-T9 (grammar, tashkeel) | every retrieval AI tool (13, 21, 30) | Retrieval output changes for AI tools | Compatible if `retrieval.test.ts` stays green (in S1-T9) |
| P36 | `src/lib/library/readQuota.ts` and its test | 8 · S1-T15 (`quotaRefusal.lockedUntil`) | 30 · S5-A9 (not-locked list at base `:96-110`) | Lines move | Compatible: anchor by test name (Task 30 override) |
| P37 | `src/lib/payments/couponServer.ts`, `checkoutCore.ts`, `checkoutCore.test.ts` | 5 · S6-T10 (`couponServer:351-360`, `itemId`, `excluded_items`) | 9 · S1-T19 (`libraryBuyerGate` at `checkoutCore:288` and `couponServer:423`) | Different lines, but T19's line numbers are pre-S6 and its fixtures predate S6's row fields | **Conflict C16**: wrong anchors and stale fixtures. → R16 |
| P38 | `adminRouteGates.test.ts` `GATES` | 4 · S6-T7 (2 new admin routes), 5 · S6-T11/13, 9 · S1-T20 (new `library-eligibility/[userId]`), 12 · S2-A5 (3 routes), 24 · S4-T5 (new `firms/[id]/office-kind`) | the walker test | Only S2-A5 says it updates `GATES`; S6-T7, S1-T20 and S4-T5 don't | **Conflict C18**: the "every admin write handler has a pinned action" test fails. → R18 |
| P39 | `accountFreezeWrites.test.ts` | 22 · S3-21/22/23, 23 · S3-26, 25/26/27 · S4 firm, finance and branding routes, 29 · S5-A3/A4 | the walker test | S3-21 and S3-23 address it; S4 and S5 do not mention it | Same conflict C18. → R18 |
| P40 | `supabase/migrations/_verify.sql` | 3 (S6 `_20` + edit to `wave1_pricing_rows`), 5 (`_21`, `_22`), 7 (`_14`), 8, 10, 11, 17, 22, 24–27, 29 | 34 (sweep) and `sqlMergeHygiene.test.ts` | Many appends. The repo convention (the `20261102_10/11` blocks) RAISEs «run X» when a migration is missing and NOTICEs only when its base schema is absent. S1-T13 does not say how the `_14` block behaves in the days before the user's quiet-hour window | **Conflict C14**: under the convention, `_verify` (ON_ERROR_STOP) would stop on a prod that is correct but has not reached the `_14` window. → R14 |
| P41 | `n8n/ai/workflows.mjs` → regenerated JSON | 15 · B10 (prompts infer branch), 18 · E6 (progress branches on every job) | 20 · S3-11 (brief-check prompt), 21 · S3-14/17, 30 · S5-A10 | Several units regenerate overlapping JSON files with different import timing | **Conflict C15**: one JSON may need importing before the deploy for one reason and after it for another. → R15 |
| P42 | `n8n/README.md` | 12 · S2-A4 (wf-5.1 row) | 31 · S5-B3 (§11 hosting line) | Different sections | Compatible |
| P43 | `SQL_batch_2026-11-03_owner_free/` | 1 (creates the folder), 10 (`S1_RUN_NOTES.md`), 22 · S3-20 ("copy plus README line"), 28 (`S4_README.md`), 32 · S5-B13 (README section) | 34 (release README) | S3-20 copies a migration into the folder (earlier batches never did); README written by three units | **Conflict C17**: duplicate copies drift, and the README gets overwritten. → R17 |
| P44 | `src/lib/services/liveClaims.test.ts` | 3 · S6-T2, 21 · S3-13/16 | 30 · S5-A9, 31 · S5-B4/B5, 32 · S5-B8/B14 | Several units add assertions | Compatible apart from the count (C7) |
| P45 | `src/lib/services/pricingApprovals.test.ts` | 3 · S6-T2, 4 (absorbed S5-B6), 19 · S3-01 | 30 · S5-A9 | Sequential additions | Compatible apart from the count (C7) |
| P46 | `cannedOutputGate.test.ts` | 19 · S3-01/05 | 21 · S3-18 | Sequential | Compatible |
| P47 | `AdvisoryTemplateNotice.tsx`, `advisoryHandoff.ts` | 3 · S6-T4 (audience price) | 19 · S3-01 (mounted in `CaseBriefStudio`) | S3 mounts the component that S6 changed; the prop is unchanged | Compatible |
| P48 | `admin/service-orders/page.tsx` | 3 · S6-T6 (estimate line) | 14 · S2-B7 (shows `contractText`) | Separate blocks | Compatible |
| P49 | `src/app/dashboard/firm/layout.tsx` | 6 · S6-T18 («محاكاة القيود» UI gates) | 25–27 · S4 (new firm pages under it) | S6 only adds a UI wrapper; S4 adds pages | Compatible |
| P50 | `src/app/dashboard/lawyer/activity/page.tsx` | 16 · S2-D1 (`ai_runs` rows) | 32 · S5-B10 (live region at base `:627-640`) | Lines move | Compatible: anchor by content |
| P51 | `CaseGraphView.tsx` | 29 · S5-A7 (store prop) | 30 · S5-A11 (AI button), 32 · S5-B10 (live region at base `:521-525`) | Same section, sequential | Compatible |
| P52 | `admin/security/page.tsx` ↔ `LibraryActivityPanel.tsx` | 6 · S6-T19 (removes illustrative data) | 32 · S5-B10 (panel live region) | The page is rewritten and the panel edited | Compatible: T19 must keep mounting the panel (self-consistency, Task 6) |
| P53 | AI tool id `contract-review` vs catalogue service id `contract-review` | 3 · S6 (human review 600/800 + `contract-review-business`) | 21 · S3-13 (AI tool `contract-review`, 250 points) | Same string in two namespaces (`AI_TOOLS`/`ai_runs.tool` vs `CLIENT_SERVICE_CATALOG`/`admin_pricing_catalog`) | **Conflict C19** (latent). → R19 |
| P54 | `ai_runs` columns (`hold_for_review`, `held_*`, `review_*`; `progress_events` FK; `client_shares` reads) | 11 · `_30`, 17 · `_31` | 22 · `_50`, 12 · admin API, 23 · share snapshot | New columns are ungranted to `authenticated`; reads use explicit column lists | Compatible. `held_output` stays service-role only (Review Focus 2) |
| P55 | `admin_pricing_catalog` | 3 · `_20` (new row `contract-review-business`, audience `corporate`) | 4 · S6-T7/T8 (admin API/page), old `/pricing` | Old code reads `audience=eq.individual` and never sees the row | Compatible either order |
| P56 | `/pricing` (`PricingCards.tsx`) | 30 · S5-A9 (comment only) | — | No price surface changes in this wave; `pricingHonesty` and `bookCallSites` walkers are unaffected | Compatible |
| P57 | `src/lib/ai/runErrors.ts` / `useAiRun.ts` | 12 · A7 | 17 · E4, 18 · E7 | Sequential within S2 | Compatible |
| P58 | `ai-usage/page.tsx` | 18 · E10 | 33 · A8 (mode select gets `review`) | Separate blocks | Compatible |

---

## 2. Self-consistency rows (one per unit)

| Unit | Tests match the code? | Created files later touched consistently? | Finding |
|---|---|---|---|
| 1 | `_window.test.ts` pins 50/50 and `targetWindowOffset`; `principleLink.test.ts` covers legacy slugs | The batch folder is created here; Tasks 10, 22, 28, 32 and 34 add to it | OK |
| 2 | `page-contract.test.ts` (×2) and `no-protected-bundles.test.ts` assert the readers never import the bundles | `src/app/laws/demo-data.ts` (edited in Task 1) must not re-export the deleted `demo-data-precedents`/`demo-data-books` | OK, provided Task 2 greps `demo-data` importers before deleting |
| 3 | DB test (`_20`) + resolver/loader/estimate unit tests + `_verify` edit | `clientPricingAudience.ts` is consumed in Task 4 and `serviceEstimate.ts` in Task 31 | OK |
| 4 | `page.test.ts` for the rewritten page. The absorbed S5-B6 test must match whatever T8 keeps (R9) | `catalogAdminRules.ts` stays inside Task 4 | OK with R9; `GATES` rows per R18 |
| 5 | Two DB tests (`_21`, `_22`) + coupon unit tests; `couponCodeLiterals.test.ts` walks `src/lib/payments` and the coupon routes | `couponRules` `itemId` is consumed by Task 9 | OK. The `_21` and `_22` `_verify` blocks follow the RAISE-when-missing convention; both run before `_verify` in the run sequence (R14) |
| 6 | `shellContext`/`adminSimulation`/`AdminViewSwitch` tests; security page test | `admin/security/page.tsx` is rewritten here, and Task 32 edits its `LibraryActivityPanel` | T19 must keep mounting `LibraryActivityPanel`; confirm in review |
| 7 | `normalizeArabic`/`multiColorSearch`/`retrieval` tests + `_14` Docker test with a negative control | `laws/page.tsx` (from Task 1) and `book/[slug]/page.tsx` (from Task 2) are edited again | OK. The `_14` block is the one block that NOTICEs while not applied (R14) |
| 8 | Three DB tests + `readQuota` tests | `readQuota.test.ts` is extended later by Task 30 | OK |
| 9 | Payments route tests + eligibility tests; HIGH risk | Consumes `_12` (Task 8) | OK with R16; `GATES` row per R18 |
| 10 | `_13` DB test + `library-column-lock.test.ts` + parser test | `S1_RUN_NOTES.md` is linked by Task 34 | OK. Editing `scripts/seed-library.ts` is allowed; running it is BANNED |
| 11 | `ai_review_gate.test.sql` (with a legacy-row prelude) + `toolLabels`/`runOutputBlocks`/`runCore` tests | `toolLabels.ts` is extended by Tasks 19, 21, 30 and 33 | OK under R2/R3 |
| 12 | `reviewDecision`, `reviewAlerts`, `adminNavByRole` and `runErrors` tests; `adminRouteGates.test.ts` gets 3 rows | `runErrors.ts` is extended by Tasks 17 and 18 | **Finding:** the new page `/ai/runs/[id]` is not covered by `PROTECTED` in `proxy.ts`, and `src/app/ai/layout.tsx` renders a signed-out visitor's page unwrapped (it leaves the redirect to the proxy). Fixed by R29 |
| 13 | `textExtract`/`fileTextToken`/`aiFiles` tests; flags default off | `aiFiles` is consumed in Task 14 | OK. The `file-text` route is GET only, so the freeze walker skips it |
| 14 | `aiReadable`/`orderIntake.contracts`/`previewKind` tests | `orderIntake.contracts.ts` is consumed by Task 31 | Needs R12's test (`contractText` in the validated value) |
| 15 | `legalDrafter`/`caseAnalysis`/`orderIntake` tests + `n8nWorkflows.test.ts` | `StepIdentify.tsx` is edited again in Task 32 | OK under R11 |
| 16 | `contextHandoff`/`principleCollectorItem`/`events` tests | `contextHandoff.ts` canvas target | Needs R1's reason text |
| 17 | `progress_events.test.sql` + `progressEvents`/`progressRead`/`runCore` tests | `runErrors.ts` (from Task 12) | E4's test must prove a dispatch failure after the debit is refunded (Review Focus 1/5) |
| 18 | `aiThinkingStage.logic` + `mounts` tests + `n8nWorkflows.test.ts` | The mount test lists `case-brief/page.tsx`, which Task 19 deletes | Fixed by R4 in Task 19 |
| 19 | Many walker tests (`betaGatedRoutes`, `cannedOutputGate`, `darkModeGuard`, `pricingApprovals`, `navbar`, `ngo/honesty`) | Deletes `case-brief/page.tsx` → updates the mount test and `AI_TOOL_PAGES` (R3/R4) | OK under R3/R4 |
| 20 | `aiToolsConfig`/`rateLimitRoutes`/`legalDraft`/`contractsProRun`/`briefCheck`/`_dimensions` tests | `toolAvailability` is re-checked by Task 33 | OK under R5 |
| 21 | `contractReview`/`contractNegotiator`/`n8nWorkflows` tests; `defaultMode` off | `PERCENT_PATTERN` is consumed by Task 30 | Needs R2 (labels), R7 (counts) and R19 |
| 22 | `shareSecrets` + `client_shares.test.sql` + `workSnapshot` + route tests | The README line in the batch folder | S3-20's copy step overridden by R17; freeze walker per R18 |
| 23 | `sharePage.test.ts`; mounts `ClientSharePanel` | Removes the `/ai/share-history` redirect; `/ai/share-history` is not in `PROTECTED` | **Finding:** after the redirect goes, the page is reachable signed out (the `/ai` layout does not redirect; the proxy does). Fixed by R29 |
| 24 | Three DB tests + `signupMetadata` test | The `office-kind` admin route | Needs a `GATES` row (R18) |
| 25 | Three DB tests + `firmPermissions`/`firmLetterheadPermissions`/branding route tests | `branding/route.ts` is edited again in Task 27 | Freeze walker per R18 |
| 26 | Three DB tests + firm finance page test | `invoiceFinanceCore.ts` is edited in T15 and T20 of the same unit | OK; freeze walker per R18 |
| 27 | `ooxml`/`letterheadDocx`/`aiPath` tests + `_69` DB test | Consumes `legalDraft.ts` (Task 20) and `stripCitationMarkers` (Task 23) | OK under R13 |
| 28 | Full `_60`–`_69` Docker sweep, including the re-run chains | `S4_README.md` is linked by Task 34 | OK |
| 29 | `canvas_boards.test.sql` + `canvasBoards`/`graphClient`/`graphStore`/route-contract/wiring tests | `CaseGraphView.tsx` is edited again in Tasks 30 and 32 | OK; freeze walker per R18 |
| 30 | `n8nWorkflows`/`runCore`/`readQuota`/`liveClaims`/`pricingApprovals`/`_graph-ai-strategy` tests | Consumes `PERCENT_PATTERN` (Task 21) | OK under R2, R7 and R8 |
| 31 | `intakeGuard` test; `betaGatedRoutes.test.ts`; `liveClaims` | S5-B2 deletes `tests/pricing-plans.test.mjs`; `scripts/run-script-tests.mjs` must not still list it | OK under R10 and R12; S5-B6 verify-only (R9) |
| 32 | `radioGroupKeys`, `requiredGroups.a11y`, `liveRegions.a11y`, `_details-block` and `lawSuccessors` tests | Adds a section to the batch README | OK under R11 and R17 |
| 33 | `runCore`/`runVisibility`/`aiToolsConfig` tests; `toolAvailability` test re-checked | Edits `toolLabels.ts` (`REVIEWABLE_AI_TOOLS`) after Tasks 21 and 30 | OK under R5 and R6; skippable |
| 34 | `sqlMergeHygiene.test.ts` gains the new block names; full unit run (≤ 6 CRLF failures) and the build | Links `S1_RUN_NOTES.md` and `S4_README.md`; keeps the S3-20 and S5-B13 README parts | OK under R14 and R17 |

---

## 3. Rulings

Format: `Ruling: <decision> — <why> — <cost if wrong>`. Ctrl = the controller's attention is needed: "yes" when the ruling overrides a section task's literal text, touches a stop point, or depends on ٤٠٨–٤٣٨.

| ID | Conflict | Ruling | Ctrl |
|---|---|---|---|
| R1 | C1 | Ruling: keep the canvas hand-off target `live:false` «قريباً», but give the reason «لا يوجد مستقبِل للسياق على اللوحة بعد» instead of ٤٢٨; board-reads-hand-off is a follow-up — no board consumes a hand-off in this wave, and ٤٢٨ is about the office map, not the studio — the owner report would blame an open question for a gap that is ours | yes |
| R2 | C2 | Ruling: each new registry id gets its `AI_TOOL_LABELS_AR` and `AI_TOOL_PAGES` entries in the same commit: `contract-review` → `/ai/contracts`, `contract-negotiator` → `/ai/contract-negotiator`, `canvas-strategist` → `null` — A2's test demands both entries, and a null page keeps a fast tool that returns in the POST reply out of `REVIEWABLE_AI_TOOLS` — a red unit test, or a strategist put into review that the board can never show | yes |
| R3 | C3 | Ruling: S3-01/02 set `AI_TOOL_PAGES["case-brief"] = "/ai/analyze"` — the old page is deleted and 301s — the review queue and `/ai/runs/[id]` back-link hop through a redirect and drop state | yes |
| R4 | C4 | Ruling: S3-01 moves the case-brief entry in `aiThinkingStage.mounts.test.ts` to `src/components/ai/caseBrief/CaseBriefStudio.tsx`; the studio and S3-06's quick-answer rewrite both keep `<AiThinkingStage` — E10's mounts must survive the S3 moves — the mount test goes red, or the stage silently disappears from two tools | yes |
| R5 | C5 | Ruling: S3-07's `toolAvailability(mode, isAdmin)` and runCore's refusal share one helper, and the test pins parity over every mode × admin pair through `effectiveToolMode` — A8 changes what review means; one source of truth keeps the screen and the server agreeing whether or not A8 runs — a screen offers a run that the server refuses, or hides a runnable tool | yes |
| R6 | C6 | Ruling: move S2-A8 to Task 33 (after all of S3–S5, before the release docs). The controller asks the user; without an explicit go it skips A8, and A8 becomes a listed follow-up. With a go, "deployed" means `_30` before the deploy and A3–A7 in the same deploy — A8's stop point would otherwise block 20 later units, and placed last one flip covers the S3/S5 tools. A missing `_30` fails safely (`store_failed` + refund) — review mode ships before the queue is proven on prod; mitigated because selecting review stays an admin action | yes |
| R7 | C7 | Ruling: pin `PRICED_AI_TOOL_IDS`, the liveClaims unlisted set and `pricingApprovals` from the code at the time each unit runs; drop S5-A9's literal "seven" — S3-13/16 may already have added ids — a test pinned to the wrong count, or a priced tool missing from the points display | yes |
| R8 | C8 | Ruling: S5-A9 imports `PERCENT_PATTERN`/`hasPercent` from `tools.ts` (exported by S3-13) — one rule for "no percentages/scores in output" — two regexes drift, and a percentage leaks through one tool | yes |
| R9 | C9 | Ruling: S6-T8 (Task 4) absorbs S5-B6: any beta-free count uses `betaStatus === "beta-free" && !tool.comingSoon`, and S5-B6's test moves to Task 4; Task 31 runs B6 verify-only — T8 rewrites the page, so `:153` no longer exists — the admin page counts consult as beta-free again, or B6 re-edits a rewritten page | yes |
| R10 | C10 | Ruling: S5-B7 derives the links to wrap from `isTerminalToolHref` and `betaGatedRoutes` at HEAD; it drops the pinned count of 7 and the `volunteers:66` literal; links that S3-04 repointed to `/ai/contracts` stay live — S3-04 made those links live — live contract links shown as «قريباً» to NGO and micro users (a false "not available") | yes |
| R11 | C11 | Ruling: S5-B9 asserts four `role="radiogroup"` groups in `StepIdentify`, of which three carry `aria-required="true"` — S2-B9 made the legal-branch group optional (the AI infers it) — a screen reader announces a required choice the form does not require, or B9's test fails | yes |
| R12 | C12 | Ruling: S2-B7's validator returns `contractText` inside its validated `value`; S5-B1 adds a test that `contractText` and the S6 estimate stamp survive `persistedRequestMetadata` — B1 keeps only validated keys plus two extras — pasted contract text is silently dropped from team orders | yes |
| R13 | C13 | Ruling: S4-27's `pleadingBlocks` reads S3-08's edited pleading from `legalDraft.ts` and strips citations with S3-25's pure `stripCitationMarkers`; no second stripper — the lawyer's manual edits must reach the letterhead export, and citations must be stripped the same way for clients and for print — the exported Word file drops the lawyer's edits, or prints raw `[S1]` markers | yes |
| R14 | C14 | Ruling: every `20261103_*` `_verify` block follows the repo convention — it RAISEs with a «run <file> (BEFORE/AFTER the deploy)» instruction when its migration is missing or wrong, and NOTICEs only when its base schema is absent. The single exception is `_14`: it NOTICEs «not applied yet» while the folded config is absent, and RAISEs once `_14` ran and a probe with tashkeel misses. `_20` and `_22` follow the convention because both run before `_verify` in the run sequence — `_verify` exists to catch a skipped migration, but `_14`'s window is the user's choice and may come days after the deploy — a blanket NOTICE would pass a prod with `_30`/`_50`/`_63` skipped; a RAISE on `_14` would stop `_verify` on a correct prod | yes |
| R15 | C15 | Ruling: one import schedule. **Before the deploy:** wargaming, analyze-strength and legal-drafter (B10 + E6). **After the deploy:** brief-check (E6 + S3-11), contract-review, contract-negotiator, canvas-strategist and `wf-5.1`. **Any time:** the other E6 jobs. Each unit regenerates JSON in the repo only; the release README carries the schedule — the B10 prompts must be live before B9 stops sending the branch, and the S3-11 prompt must not reach the old code — empty "area" inputs for the AI, or a brief-check report that the old UI can't render | yes |
| R16 | C16 | Ruling: S1-T19 anchors on the symbol `buyerAllowed`, not `checkoutCore:288`/`couponServer:423`, and its fixtures carry S6-T10's `itemId`, `excluded_items` and `first_paid_order_only` — S6 (Task 5) runs first and moves those lines — an edit in the wrong place on the payment path | no |
| R17 | C17 | Ruling: no unit copies a migration into `SQL_batch_2026-11-03_owner_free/`; S3-20 adds only a README line with the full path; S5-B13 appends its section; Task 34 completes the README and links (does not copy) `S1_RUN_NOTES.md` and `S4_README.md` — earlier batch folders hold a README only, and copies drift from `supabase/migrations/` — the user runs a stale copy, or a later unit overwrites an earlier README section | yes |
| R18 | C18 | Ruling: every new admin write handler gets a `GATES` row (S6-T7 ×2, S1-T20, S4-T5, plus S2-A5's three); every new mutating route that reads the session uses one of the five gate helpers (S4 firm/finance/branding routes and S5 canvas routes use `assertRole`/`assertCaseWorker`); session-free POSTs (S3 verify and feedback) go in `ALLOWED` with a reason — the two walker tests fail otherwise, and they exist because an ungated write once slipped through — a red suite, or a frozen account still able to write | no |
| R19 | C19 | Ruling: keep the AI tool id `contract-review` (it is pinned through S3-13/14/15, the n8n path and its tests), and forbid any lookup that resolves an `ai_runs.tool` through `CLIENT_SERVICE_CATALOG`/`admin_pricing_catalog`, or the reverse — the namespaces never meet at HEAD (no n8n or `src/lib/ai` use of the catalogue id) — an analytics or label lookup shows the 600/800 SAR human service for a 250-point AI run | no |
| R20 | Owner | Ruling: build contract review (250) and the negotiator (150) — prices come from the canonical items 9/10, q296 (answered) hides them until live, and both ship with `defaultMode` off; ٤٠٨ governs restoring golden screens, not these registry tools. Flag both in the owner report — if the owner reads ٤٠٨ as covering every Wave 4 tool, two built tools stay off until he answers; nothing is charged meanwhile | yes |
| R21 | Owner | Ruling: contract review uses the six contracts-pro roles that `/ai/contracts` already admits (corporate, micro and NGO included), with no widening and no narrowing; list it under ٤١٧, with no new question number — the tool sits inside an existing screen with existing access — if ٤١٧ narrows access, the role list is one constant | yes |
| R22 | Owner | Ruling: build the canvas studio at `/dashboard/lawyer/canvas` as a separate route, leaving `/dashboard/lawyer/graph` untouched — ٤٢٨ bullet 5 (map as the studio's mode) is open, and a separate route doesn't foreclose either answer — a later merge moves one route | yes |
| R23 | Owner | Ruling: the library suspension does not stop `canvas-strategist` (or `canvas-card`); pinned by the readQuota not-locked test — the ٤٣٢ default is "no" until answered — if he answers "yes", it is a one-list change | yes |
| R24 | Owner | Ruling: `canvas-strategist` is `consultantBlocked: false`, roles lawyer and firm — matches today's case-graph users; ٤١٧ (opening tools to more roles) is not widened — consultants get a tool the owner may want closed; one flag | yes |
| R25 | Owner | Ruling: the quick answer stays at 20 points and today's roles (S3-06) — ٤١٢ (15 + a free daily question) is open — none; status quo | no |
| R26 | Owner | Ruling: firm case visibility is unchanged; S4-T10/11 change only the lead (`assigned_to`) — ٤٢٨ (case-team-only access) is open — none; status quo | no |
| R27 | Review | Ruling: admin «عرض كـ» / «محاكاة القيود» is UI-only (sessionStorage); S6's hard constraint holds: never `useUser()`, guards, `proxy.ts`, APIs or a request body — it was checked against the section text (S6 :508, :625) — if it leaked, an admin could stamp a request as another role; review must grep each D-task for those calls | no |
| R28 | Owner | Ruling: S1-T20's eligibility verify/revoke is gated by `entitlements.grant` (super_admin), leaving ٤٢٧ (operations approving library requests) open — neutral default — none; one action name | no |
| R29 | Self-consistency (Tasks 12, 23) | Ruling: Task 12 adds `/ai/runs` and Task 23 adds `/ai/share-history` to `PROTECTED` in `src/proxy.ts` — `src/app/ai/layout.tsx` renders a signed-out visitor's page unwrapped and relies on the proxy to redirect; neither new page is in `PROTECTED`, and S2-A7/S3-26 do not add them — a signed-out visitor lands on an empty or error screen instead of the login page (the APIs still refuse, so no data leaks) | yes |

**Rulings that need the controller's attention: 22** (R1–R15, R17, R20–R24, R29).

---

## 4. Owner check: tasks that might depend on an open question (٤٠٨–٤٣٨)

| Task(s) | Open question | Risk | Handling |
|---|---|---|---|
| S3-13..15 contract review 250; S3-16..18 negotiator 150 | ٤٠٨ (golden screens return only with their real engine) | The gap analysis frames all of Wave 4 under ٤٠٨ | R20: built, `defaultMode` off, price hidden (q296), flagged in the report |
| S3-13 roles (contracts-pro six, including corporate/micro/NGO) | ٤١٧ | Wider than canonical item 9's lawyer list | R21: rides existing `/ai/contracts` access; noted under ٤١٧ |
| S3-06 quick answer at 20 points | ٤١٢ | Price and the free daily question | R25: unchanged |
| S3-01 case-brief «٣٠ / ١٥٠ نقطة», 30-page cap | ٤٢٨ (files over 30 pages at +5/page) | Page pricing above 30 | Excluded in S3; the cap stands |
| S2-B1 `TEXT_CHARS_PER_PAGE = 3000` | ٤٢٨ (page pricing) | It feeds case-brief's page price | Pinned default; new question ٤٤٠ |
| S2-A5 release/reject by `settings.write` only | ٤٢٧-like ops scope | Ops role excluded | New question ٤٤١ |
| S5-A canvas studio route | ٤٢٨ bullet 5 | Map-as-mode | R22 |
| S5-A9 strategist not locked | ٤٣٢ | Lock scope | R23 |
| S5-A9 `consultantBlocked: false` | ٤١٧ (and ٤٠٧ answered) | Role scope | R24 |
| S2-C1 canvas hand-off «قريباً» | (cited ٤٢٨) | Wrong citation | R1: our gap, not ٤٢٨ |
| S4-T10/11 case assignment | ٤٢٨ (firm access) | Visibility | R26: lead only |
| S4-T15..18 firm billing | ٤٣٠ (VAT) | VAT on firm invoices | Excluded in S4; no VAT fields |
| S1-T20 staff verify/revoke | ٤٢٧ | Who approves | R28 |
| S1-T15 auto-lock hours | ٤٢٥/٤٢٦ (numbers, five locks) | Quota numbers | Only the existing lock gains an hours setting; the numbers stay as they are |
| S6-T10..T12 NZAMY50 row-driven | ٤٣٦ | Its value | Only the code path; the value stays in the row |
| S6-T1 business contract-review 800 | (q327 answered) | — | OK |
| S6-T14..18 admin view | — | — | No dependency |

**New owner questions for the report (٤٣٩ upwards):**
- ٤٣٩: default `ai_review_hours`, 24 h (S2);
- ٤٤٠: 3,000 characters = one page for Word and text pricing and caps (S2);
- ٤٤١: may `operations` release or reject held runs? (S2);
- ٤٤٢: AI «صياغة بديلة لبند» in contracts, and its price (S3);
- ٤٤٣: what a client sees of a shared case, beyond the chosen documents (S3);
- ٤٤٤: hide, wire or relabel the 22 files still showing «Backend-ready»/«Mock» (S6);
- ٤٤٥: the «subscriber discount» on the 500-point simple contract (S6).

S4 and S5 raise no new numbers. S1's deferred items (subsidiary names, sidebar `official_links`, batched laws) wait on the owner's re-export or on a separate plan, not on a question.
