# Owner-free work, phases P1–P6: implementation plan

> **For agentic workers:** use superpowers:subagent-driven-development. One implementer per phase, then a reviewer, then fix rounds. Steps are checkboxes.

**Goal:** build every item in Part 1 of `docs/plans/2026-10-25-upcoming-work-and-owner-package-10-22.md` (the backlog file, in the main checkout) in the suggested order, without waiting for the owner's answers ٢٥٧–٢٧٧.

**Branch:** `batch/2026-10-25-owner-free` in `D:/nzwt/integ`, cut from main f9d3219b plus the docs commit cbc9f46d. Commit locally. **Merging or pushing needs the user's explicit go.**

**Source of the owner's ideas:** `C:/Users/LOQ/Downloads/حزمة_تسليم_المبرمج_المعتمدة_2026-10-22`. Read it for intent only. **Never copy a staging file or patch in.** Many are unsafe; see Part 5 of the backlog.

## Global constraints (each item inherits all of them)
- Arabic UI copy. Light and dark mode both supported: the dark-mode guard test `src/lib/ui/darkModeGuard.test.ts` must pass. Never use `text-gray-100`/`200` for text.
- No fake or mock data, no `localStorage` for real data, no invented percentages (owner ١٩٣), no escrow wording (owner ١٨٠).
- A user's own data is read through RLS with the user client, never the service client. Library reads keep the existing paywall rules: `hasFullLibraryAccess`, `effectiveFreeLimit`, column locks `20261016_01`/`20261018_02`/`20261019_40`, `LIBRARY_FTS_CONFIG`, `apiSlug()`.
- **SQL:**
  - new migrations go in `supabase/migrations/20261025_NN_*.sql`, wrapped in `begin … commit` and re-runnable (`drop policy if exists`, `if not exists`);
  - text FKs to `service_requests(id)`;
  - policies use the existing helpers (`is_active_firm_member`, `can_access_case_row`, …);
  - every migration gets a Docker RLS test under `supabase/tests/rls/` and a `_verify.sql` section;
  - **never run SQL against prod;** the user does that. Also copy each migration into a SQL folder `SQL_batch_2026-10-25_owner_free/` with a README giving the run order.
- **Never run any seeder or library loader,** never `library:*` scripts, and never write to the live DB.
- **Before each commit:**
  - `npm run test:unit` must end with `# fail 0`; read that line, never pipe it into grep;
  - `npx tsc --noEmit` must have no new errors;
  - `npx eslint <changed files>` must show 0 errors.
- **Before the phase is done:** `next build --webpack` with dummy `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` must compile. This catches server-only modules reaching a client bundle.
- **Git hygiene:** keep each file's line endings; use `git -c core.autocrlf=false` when needed; never `git stash`; stage files explicitly.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Don't touch the najiz WIP or `.agents/`.

## Review focus (the inputs most likely to bite)
1. A guest or non-subscriber reaching library text or fields through a new route or prop.
2. A new public token page leaking a field beyond the allowed set: notes, memos, phones, IDs.
3. Firm members seeing another firm's rows; a staff member deleting what directive 5 protects.
4. Time zones: hearing times and reminders stay floating local time, as the existing Google link does.
5. Arabic search input with operators, empty strings, or very long queries.

---

## P1: fixes and honesty (backlog N1.1–N1.9; no SQL)

| Item | Files (starting points) | Done when |
|---|---|---|
| N1.1 Moyasar key check | `src/lib/payments/moyasarConfig.ts`, `gatewayDiagnostic.ts`, and the admin gateway card in `src/app/dashboard/admin/settings/page.tsx` | A key with `*`, whitespace, or a length outside what Moyasar issues → the config is invalid, the gateway is disabled, and the card shows the Arabic reason. Unit tests cover the bad shapes and that valid test/live keys still pass. No key value is ever printed |
| N1.2 Preamble split | `src/app/api/library/laws/[slug]/route.ts:276-287` and its preamble/regulation split | A preamble whose `***` separates the template's card and H1 is no longer labelled «اللائحة التنفيذية». Split only on a real regulation marker. Test against fixture text shaped like `precious-metals-customer-due-diligence-guide` |
| N1.3 Fake `/cases/[id]` | `src/app/cases/[id]/page.tsx` | No escrow box, no fake rating, no invented figures. Either a real "not found"/redirect, or an honest placeholder until P4 replaces it with the tracking link. Source test pins the absence |
| N1.4 Legal-opinion mock | `src/app/ai/legal-opinion/_constants.ts`, page | No percentage scores and no model label; same treatment as the earlier LegalCanvas «قوة الموقف» removal. Source test |
| N1.5 Blog author link | `src/app/blog/.../ArticleView.tsx:345-346` | The author name/link no longer opens an outside site. Consultation CTAs go to `/book/consultation`. Test |
| N1.6 Blog TOC | `ArticleView.tsx` (TOC around :113 and :448) | Hover and the active section are gold `#C8A762` in light and dark. Scroll-spy uses IntersectionObserver, with no layout thrash |
| N1.7 Blog spacing | `ArticleView.tsx:246` | No `<br/>` per blank line; paragraphs and headings get sensible margins. Test on the renderer output |
| N1.8 Transcriber → drafter | `src/app/ai/transcriber/*`, `src/app/ai/draft/*` | A «إرسال النص للصائغ القانوني» button opens `/ai/draft` with the text prefilled, through `sessionStorage` handoff or the existing prefill mechanism (check how other tools hand off: `universal_service_transfer` / prefill helpers already in our code). No `localStorage`. Test |
| N1.9 Firm Article-18 | `src/constants/entityRouteAccess.ts` (`FIRM_LEGAL_ROLES` :87) | Firm hearings and procedures-expert routes are limited to litigation roles: no `legal_consultant` / `in_house_counsel` / `external_of_counsel`, matching `20261019_21_consultant_court_write_guard`. Keep every other rule; don't change the null-role default. Test |

## P2: payments, before going live (N4.1)
- **N4.1:** make `grantPlan`'s cancel-old plus insert-new atomic, either in one SQL function called through RPC or inside the existing `claim`/fulfil RPC. Files: `src/lib/payments/grantPurchase.ts` and the new migration `20261025_10_grant_plan_atomic.sql` (security definer, owner-only EXECUTE, `search_path` pinned).
  - **Docker test:** an error mid-upgrade leaves the old plan intact, and the success path is the same as today.
  - Keep renewal-days carry-over and the refund restore rules.
- **N4.2:** live checks on the user's side. Not code; listed in the SQL README.

## P3: quick wins (N2.1, N2.2, N2.3, N3.1, N3.3)
- **N2.1 Identity card V2 + موجز in the law reader.**
  - Server-side extraction from `laws.preamble`: the card table and the `<details><summary>📝 موجز…` block. The route returns `summary` and `metadata_card` **only when `hasFullLibraryAccess`**, the same rule as the preamble today (owner ٢٦٠ pending). Keep the rule a single named flag so ٢٦٠ is a one-line change.
  - The reader shows the card in `_sidebar.tsx`, which can already draw it, and the موجز as `<details open>` above the preamble. The preamble then excludes the moved blocks.
  - Never invent values: a field missing in the source stays missing.
  - Pure parser module plus tests on real-shaped fixtures.
- **N2.2 Outer cards موجز.**
  - The init route must not ship the full preamble per law. Options: a SQL-derived short موجز column (migration `20261025_20_law_summary_brief.sql`, filled by an `UPDATE` from the preamble; the user runs it), or extraction at read time over a capped substring.
  - Pick the column; it keeps the payload small and is indexable.
  - Same visibility flag as N2.1. Cards show two lines plus «قراءة المزيد / طي الموجز» in place.
- **N2.3 Fiqh layers.** Add «الشرح فقط» and «الحاشية فقط» to `src/app/book/[slug]/page.tsx`, beside «الكل» and «المتن فقط». The state type already has `sharh-only`. Layer filtering goes in `_reader-model.ts`, with tests.
- **N3.1 `.ics` with 4 alarms.**
  - A pure builder in `src/lib/calendar/hearingIcs.ts`: RFC 5545, CRLF line endings, folding, escaping; floating local `DTSTART` to match the Google link.
  - VALARMs at −7 days, −3 days, the previous day at 20:00 and the same day at 07:00. Relative triggers are computed from the floating time; document it.
  - A «تنزيل ملف التقويم (.ics)» button per hearing on `src/app/dashboard/lawyer/hearings/page.tsx`.
  - Tests cover the builder.
- **N3.3 Quick add.**
  - A floating «+ إضافة سريعة» button on lawyer and firm dashboards, plus an item at the top of the sidebar.
  - Alt+N toggles it. Ignore the shortcut when focus is in an input, textarea or contenteditable; on macOS use `event.code === 'KeyN'` with `altKey`.
  - Items open the existing modals: AddCaseModal, AddHearingModal, AddTaskModal, AddDeadlineModal, AddClientModal. Note and ledger items are added once P4 builds them.
  - Keyboard and screen-reader accessible; dark mode. Tests on the shortcut predicate.

## P4: one SQL batch (N3.2, N3.4, N3.6, N3.7)
- **N3.2 Hearing reminders.**
  - Migration `20261025_30_hearing_reminders.sql`: `notification_outbox.hearing_id` (FK to hearings), and the unique key widened to cover hearings without breaking the deadline rows.
  - Engine `src/lib/hearingReminders.ts`. Stages: 7d, 3d, previous day 20:00, same day 07:00, all configurable.
  - Recipients: the lawyer, the assigned consultant (if any) and the office owner (firm). Platform accounts only, in-platform channel.
  - Queued by the existing cron route next to deadlines (`/api/v1/cron/deadlines` or a sibling), idempotent.
  - Tests for the stage math, including late-created hearings (skip past stages) and same-day early hearings.
- **N3.4 Sticky notes wall.**
  - Migration `20261025_31_dashboard_notes.sql`: `dashboard_notes` (owner, body, colour among 5, pinned, optional `case_request_id text`, visibility private/firm/case_team, timestamps), RLS reusing the case_notes visibility helpers.
  - API `src/app/api/v1/lawyer/dashboard-notes/route.ts` (CRUD).
  - A wall component on the lawyer dashboard: empty state, no seed notes. Quick add gets the «ملاحظة» item.
- **N3.6 Client tracking link.**
  - Migration `20261025_32_case_tracking_links.sql`: tokens are hashed (reuse the `document_shares` pattern), with owner, `case_request_id`, `revoked_at`, `created_at`.
  - The public route returns ONLY: case title or number, court, stage, upcoming hearings (date, time, court), and decisions marked client-visible. Check which existing columns flag client visibility; if none exists, decisions are omitted.
  - Public page `src/app/track/[token]/page.tsx`, noindex, with a «إنشاء حساب على نظامي» CTA. The lawyer gets a button on the case page to create, copy and revoke.
  - Old `/cases/[id]` redirects to a not-found or info page.
  - Test that the response serializer whitelists fields.
- **N3.7 Activity log tabs + documents in/out.**
  - Migration `20261025_33_legal_ledger.sql`: `legal_ledger_entries` (`case_request_id text`, direction in/out, channel whatsapp/email/hand/najiz/registered_mail, title, notes, `occurred_at`, `created_by`, `firm_id` null), RLS the same as case rows.
  - API, a 3-tab `/dashboard/lawyer/activity` (mine / office for firm members only / ledger with direction, channel and case filters), and a case-page timeline merging hearings, stages, ledger and notes, with «إضافة قيد صادر/وارد». Quick add gets the «قيد» item.
- **Also:** an SQL folder README with the run order, and a `_verify` section per migration.

## P5: library depth (N2.4, N2.5, N2.6, N2.7, N2.8)
- **N2.4 Multi-volume precedents.** Group precedent collections by `series_id` + `part`, tagged only. Outer card: volume buttons. Inside: a volume selector.
- **N2.5 Default sort.** Migration `20261025_40_law_sort_key.sql`: a normalized latest-amendment key, from `latest_update->>'date_hijri'` in its mixed formats, and an issue key. Generated or backfilled columns, plus an index. The init route orders merged first, then amendment desc, then issue desc, in SQL (no in-page JS sort). Catalogue only; search keeps relevance.
- **N2.6 Scoped search across volumes.** A server route `/api/library/scoped-search`: scope `law:<slug>` | `collection:<series>` | `book:<series>`. Uses `parseSearchQuery`, `LIBRARY_FTS_CONFIG`, the paywall, and limits, with no raw `.or()`. Results stack inline with a location badge, «نسخ بالتوثيق» and «+ للمسودة». The book reader gets the draft cart.
- **N2.7 Seeder rule gaps (code only).** `safeInt` keeps ranges in `number_text` and doesn't silently coerce. `.substring` truncation is reported, not silent. The diff report carries a SHA-256 of the input. Tests.
- **N2.8 Parser code only.** `parse-decrees` takes the brief from the `<details>` block, keeping `summary` and `summary_brief` distinct. Tests. Not run against data.

## P6: dashboard depth (N3.5, N3.8, N3.9, N3.10, N3.11)
- **N3.5 Canvas upgrades** on `CaseGraphView`:
  - undo/redo (40 steps, Ctrl+Z / Ctrl+Shift+Z), pulsing glow for urgent nodes, link cards, checklists;
  - an «استيراد من القضية» drawer listing real hearings, documents and parties from the case, as node refs in the jsonb;
  - no percentages.
- **N3.8 Profile switches.** Migration `20261025_50_profile_visibility.sql`: `show_services`, `show_education`, `show_courts` (default true), with column grants under `20261016_10` and `_verify`. Public profile and directory respect them. The license still follows `show_contact`; reviews can't be hidden.
- **N3.9 No hard delete for staff.** Migration `20261025_51_soft_delete_case_notes_docs.sql`:
  - `deleted_at` / `deleted_by` on case notes and documents;
  - staff deletes become soft deletes (RLS plus a trigger or RPC);
  - the office owner gets a notification and a restore action;
  - a history row is kept;
  - an RLS Docker test proves a staff member can't hard-delete.
- **N3.10 Auto layout.** A «ترتيب تلقائي» button running a force layout (d3-force, pinned version) over the current nodes, with undo support.
- **N3.11 Office graph.** `/dashboard/lawyer/graph` (and firm): a read-only aggregate of the caller's cases, clients and opponents through RLS, with shared-party edges and conflict hints. Uses the conflict-check logic.

## Done criteria per phase
- The implementer finishes and commits; a reviewer subagent checks the phase diff; findings are fixed.
- Unit tests, tsc, eslint and the build pass.
- The owner report is updated in the same final commit of the phase: `تقرير_للمالك_٢٠٢٦-١٠-٢٥_الدفع_والمظهر.md` gets a new section, or a new dated report.
- The backlog file marks each finished item «✅ made (commit …)».
