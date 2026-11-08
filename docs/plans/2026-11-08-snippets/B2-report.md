# B2 — owner answer ٤٤٤: the firm's own AI-run log and a per-member points counter

Branch `t/firm` (worktree `D:\nzwt\b1108-firm`). Date 2026-11-08.

## What the code looked like before (findings)

- **Where AI runs are stored.** They live in `public.ai_runs` (migration `20261027_10_ai_runs.sql`).
  - RLS policy "own ai runs" means a user can read only their own rows, and only through a column grant that excludes `input`, `usage` and `model`.
  - Only the server writes. Money moves only through `ai_start_run`, `ai_fail_run` and `ai_sweep_runs`.
- **Where the run log is.**
  - `GET /api/v1/ai/runs` returns the user's last 50 runs, but no screen lists them. Only the `/ai/runs/[id]` detail page and the tool clients use the route.
  - The visible log is the lawyer activity feed. `/api/v1/lawyer/activity` folds in `readAiRunActivity()` from `src/lib/ai/aiRunActivity.ts`, and `src/app/dashboard/lawyer/activity/page.tsx` renders it.
- **Firm accounts had no run log.**
  - `/dashboard/firm/activity` reads only `activity_events` (hearings and tasks).
  - `/dashboard/lawyer/*` is closed to `user_type='firm'`.
  - So a firm account could see none of its own AI runs anywhere, even though `POST /api/v1/ai/runs` accepts firm accounts.
  - `/ai/runs/[id]` is open to any signed-in user (proxy `PROTECTED` list) and reads the run through RLS, so a firm can open its own run.
- **Where points consumption is recorded.**
  - `public.points_ledger` (migration `20261022_20`) has one row per lot touched.
    - `usage` is a debit (negative delta).
    - `usage_refund` is an AI refund (positive delta, migration `20261027_10`).
    - `expiry`, `refund_revoke`, `admin_adjustment` and `credit` are the other reasons.
  - The only debiter is `debit_points`, which only `ai_start_run` calls. Contract-draft pricing also goes through an AI run.
  - **Authoritative source of "consumed"** = −sum(delta) over `usage` + `usage_refund`.
  - `ai_runs.charged_points` was not chosen: it is per run and would not net refunds per lot.
- **How firm membership is modelled.**
  - `public.firm_members` holds `firm_id`, `user_id`, `role`, `status` (one of invited/active/suspended/removed), `accepted_at` and `created_at`, with `unique(firm_id, user_id)`.
  - The firm owner is `firm_profiles.owner_user_id`. A trigger (migration `20260903` phase 2) gives the owner a `managing_partner` / `active` member row.
  - Members join by invitation: the owner invites, and the invitee accepts their own row (migration `20260922_02`).
  - `resolveCallerFirm()` (`src/lib/auth/firmMembershipAccess.ts`) resolves the caller's owned firm, or else their first active membership.
- **Who can reach the firm dashboard.** `/dashboard/firm/*` is behind UserTypeGuard `firm`/`admin`. In practice only the firm account itself opens the finance page; a member lawyer has no access to `/dashboard/firm`.
- **The finance page was a mock.** In production it rendered only `DashboardComingSoon`. In demo mode everything is a fixture:
  - the KPIs: monthly revenue, pending statements, collected fees, expenses
  - the monthly revenue chart (`MONTHLY_DATA`)
  - the revenue split by service
  - the fee-statements table (`MOCK_INVOICES`)
  - the dead «تصدير PDF», «بيان أتعاب جديد» and «عرض كل بيانات الأتعاب» buttons

  These were **not touched** (out of scope) and stay demo-only. `src/app/dashboard/firm/finance/reports/page.tsx` is separate and was not touched.

## What changed

### Part 1: the firm account's own AI runs in the firm log

- **Route** `src/app/api/v1/firm/activity/route.ts` (CRLF, byte-level edit):
  - Calls `readAiRunActivity(supabase, user.id, before, PAGE_SIZE)` with the session client, keyed on **the caller's own id only**. It never reads the member list (`.from("firm_members")`), never uses the service role, and never uses `.in("user_id")`.
  - Merges these rows with the `activity_events` rows, sorts newest first and slices to the page size. `nextCursor` is set when either stream came back full (the same rule as the lawyer feed).
  - Each AI item has id `ai:<uuid>`, a description line ("completed — N points debited", etc.) and `href` → `/ai/runs/<id>`.
  - A failed AI read sets `degraded: true` and does not fail the hearings/tasks feed.
  - An account with no firm row still gets its own runs; before this change it got `[]`.
- **Page** `src/app/dashboard/firm/activity/page.tsx`:
  - The item type is widened (string or number `id`, optional `description` and `href`).
  - The description line is rendered.
  - The subtitle and empty-state copy now mention AI tools.
  - A small notice shows when `degraded` is set.
- **Members' runs are not merged** into the firm log; each stays in that member's own log. Merging is the later item «23».

### Part 2: points-consumption counter per member

- **Migration** `supabase/migrations/20261108_30_firm_member_points_usage.sql` adds `public.firm_member_points_usage(p_firm uuid)`.
  - It is `stable security definer set search_path = ''`.
  - Execute is revoked from public and anon, and granted to authenticated and service_role.
  - The check is inside the function: `auth.uid()` must be the firm owner or an **active** `managing_partner` of that firm. Anyone else gets 42501.
  - It returns, per active member: `user_id`, `display_name`, `role`, `is_owner`, `joined_at`, `points_month` and `points_total`. That is totals only: no tool, ref, e-mail or run.
  - The migration's own DO block verifies itself.
- **Route** `GET /api/v1/firm/members/points-usage` (`src/app/api/v1/firm/members/points-usage/route.ts`):
  - `assertRole()` → `resolveCallerFirm(supabase, user.id)` → 404 if there is no firm → 403 unless `canViewMemberPoints` (owner or managing partner) → `supabase.rpc("firm_member_points_usage", { p_firm })`.
  - An RPC error 42883 or PGRST202 returns `200 { available: false }`. The migration is not applied yet, and the card never shows zeros in that case.
  - 42501 returns 403. The `user_id` is dropped from the response.
  - **Deviation from the brief:** the brief said to read with the service role. This route uses the session client instead. Under the service role `auth.uid()` is null, so the function's owner check could not work and would have to trust a parameter. With the session client the database itself enforces the check, as a second gate after the route's own check.
- **Shared logic** `src/lib/services/firmMemberPoints.ts` (pure, no imports): `canViewMemberPoints`, `memberPointsRpcOutcome`, `toMemberPointsUsage`, `sumMemberPoints`.
- **Card** `src/app/dashboard/firm/finance/_components/MemberPointsUsageCard.tsx`:
  - Arabic and RTL, with zinc/slate colours only (no gray-50/100/200 text).
  - Five states: loading, error with retry, refused (403), «not available yet», and an empty state (no active members).
  - The table has columns member / role / this month / total, plus a firm-total footer. The owner row is marked «(حساب المكتب)».
- **Finance page** `src/app/dashboard/firm/finance/page.tsx` (CRLF, byte-level):
  - Production now renders `FirmFinancePageLive`: a header, the existing LIVE-F07 `<UnfinishedModuleNote href="/dashboard/firm/finance" />` banner (invoicing is still unfinished), and the card.
  - Demo mode is unchanged.

### Rulings made (for the controller and the owner)

1. **Definition of "consumed".** Consumed = AI debits net of their refunds. The ledger's `usage` + `usage_refund` rows count; expiry, admin adjustment, refund-revoke and credits do not.
2. **Active members only.** A removed, suspended or invited member is not listed. Their consumption history is not deleted; it stays in their own wallet and ledger and is simply not shown to the firm. A managing partner who is removed loses access to the counter at once (test T8).
3. **Since joining only.** Rows are counted from `coalesce(accepted_at, created_at)` of the membership. Points are a personal wallet, so what a lawyer spent before joining is not shown to the firm. → owner question (A) below.
4. **"This month"** is the Gregorian calendar month in Riyadh time. A refund counts in the month it was written; in the rare case of a debit on the 31st refunded on the 1st, the month column can be lower than expected.
5. **Who sees the counter.** Only the firm owner and an active `managing_partner`. `office_admin`, `hr_manager` and `finance_manager` do not see it, even though `finance_manager` is in `FIRM_BILLING_ROLES` for the route. → owner question (B).
6. **Enforcement switch.** While `platform_settings.points_enforcement` is off, nothing is debited and every counter reads 0. That is correct, not a bug.

## Tests

- **Unit tests:**
  - `src/lib/services/firmMemberPoints.test.ts`: four tests covering authorisation, error→state mapping, the DTO with no user id, and the sums.
  - `src/app/api/v1/firm/members/points-usage/route.test.ts`: four source-contract tests:
    - the route checks authorisation before the RPC and never uses the service client
    - the migration's definer settings, grants, active-only filter, net reasons, since-joining window and totals-only return
    - the finance page's live branch renders the card with no fixtures, and the card has all its states and no light-gray text
    - the activity route passes `user.id`, reads neither `firm_members` nor the service role, keeps runs with no firm row, and pages on both streams
- **Full unit suite** (`npm run -s test:unit`): **6308 tests, 6302 pass, 6 fail.** The 6 failures are the known baseline: grantPurchase, review 2026-10-26 v1 fallback, T28-24 series, end read, insert/revoke maker rule, lawyer dashboard consultant.
  - LIVE-F07 failed transiently mid-work, while the live page had no banner; it passes now.
- **tsc:** `npx tsc --noEmit -p .` is clean.
- **eslint** on the touched files: 0 errors. One warning, `react-hooks/set-state-in-effect`, in the new card; the existing firm activity page carries the same warning.
- **RLS test in Docker:** `supabase/tests/rls/firm_member_points_1108.test.sql` — **ALL PASS (T1–T8)**:
  - anon cannot execute
  - the owner sees exactly the 3 active members, owner first
  - the totals are netted (refund subtracted; expiry, admin and credit ignored)
  - the month split is correct at ±1 second around the Riyadh month start
  - rows before joining are excluded
  - the managing partner gets the same rows
  - a plain member, a removed member, an outsider, another firm's owner, a caller with no session and an unknown firm each get 42501
  - a removed managing partner loses access
  - The migration was run twice (it is re-runnable).
  - **Negative control:** with the chain minus `20261108_30`, the test fails with "T0 FAIL".
  - Chain:
    ```
    R=supabase/tests/rls; M=supabase/migrations
    bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
      $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql $R/prelude_points_lots_fixture.sql \
      $M/20261022_20_points_lots.sql $M/20261027_10_ai_runs.sql \
      $M/20261108_30_firm_member_points_usage.sql $M/20261108_30_firm_member_points_usage.sql \
      $R/firm_member_points_1108.test.sql
    ```
- **Verify snippet:** `docs/plans/2026-11-08-snippets/B2-verify.sql` (block `firm_member_points_1108`) was run in Docker. Before the migration every check reads `f`; after it every check reads `t`. It also prints the `points_enforcement` value.
- **No browser check:** the pages need a signed-in firm account and Supabase, and there is no local env with a firm account.

## GitNexus impact

- The index is **1136 commits behind HEAD** and was not re-indexed (the task did not need it).
- `FirmFinancePage`: 0 callers, risk UNKNOWN (lower bound).
- `FirmActivityPage` and the `GET` in `firm/activity/route.ts`: "not found" (stale index).
- All three are framework-invoked entry points (a Next page and a route handler). A text search confirms no in-code callers: the only consumer of `/api/v1/firm/activity` is `firm/activity/page.tsx`.
- `readAiRunActivity`, `aiRunActivityItem` and `resolveCallerFirm` are reused **unchanged**.
- **Blast radius:** the 2 pages and 1 route above, plus the new files. **Risk: LOW.**
- The response of `/api/v1/firm/activity` only gained fields (`href`, `description`, `degraded`, string ids). `caseHref` is still sent.

## SQL run order

1. `supabase/migrations/20261108_30_firm_member_points_usage.sql` can run **any time, before or after the deploy**. It is purely additive (one function) and re-runnable. Until it is applied, the card says «غير متاح بعد» and the route answers `{ available: false }`.
2. Then run the verify block `firm_member_points_1108` from `docs/plans/2026-11-08-snippets/B2-verify.sql`. Every row must show `ok = t`.
3. Part 1 (the AI runs in the firm log) needs no SQL.
4. Read-only facts the user can check on prod, if wanted:
   - `select value from public.platform_settings where key = 'points_enforcement';` — if this is false, every counter reads 0.
   - `select count(*) from public.firm_members where status = 'active';`

## Owner-facing summary (Arabic, for the report)

> **٤٤٤ — سجل المكتب وعدّاد النقاط:** صار سجل نشاط المكتب يعرض أدوات الذكاء الاصطناعي التي استخدمها **حساب المكتب نفسه** (مع رابط لكل نتيجة)، أما ما يستخدمه المحامون الأعضاء فيبقى في سجل كل واحد منهم كما طلبتم (الدمج لاحقاً في البند ٢٣).
> وأُضيف في صفحة «مالية المكتب» جدول **«استهلاك النقاط لكل عضو»**: لكل عضو نشط مجموع ما استهلكه من نقاط **هذا الشهر** و**الإجمالي** (بعد خصم ما أُعيد من نقاط)، ويظهر لحساب المكتب والشريك المدير فقط، ولا يعرض تفاصيل ما استخدمه العضو.
> يُحسب الاستهلاك من تاريخ انضمام العضو إلى المكتب، ولا يظهر العضو المُزال. ما دام خصم النقاط غير مفعّل في المنصة ستظهر الأرقام أصفاراً.
> باقي صفحة المالية (الإيرادات وبيانات الأتعاب) ما زال غير مكتمل كما هو موضّح في أعلاها.

## Open questions for the owner (proposed numbering by the controller)

- **(A)** Should a member's consumption be counted **from the day they joined the firm** (what is built now), or should the firm also see what they consumed before joining?
- **(B)** Should **«المدير المالي»** (`finance_manager`) see the counter too? Today only the firm account and the managing partner see it.
- **(C)** Does a **removed member's** consumption stay hidden from the firm after removal (what is built now), or should it appear in a separate «أعضاء سابقون» section?

## Files

- M `src/app/api/v1/firm/activity/route.ts`
- M `src/app/dashboard/firm/activity/page.tsx`
- M `src/app/dashboard/firm/finance/page.tsx`
- A `src/app/api/v1/firm/members/points-usage/route.ts`
- A `src/app/api/v1/firm/members/points-usage/route.test.ts`
- A `src/app/dashboard/firm/finance/_components/MemberPointsUsageCard.tsx`
- A `src/lib/services/firmMemberPoints.ts`
- A `src/lib/services/firmMemberPoints.test.ts`
- A `supabase/migrations/20261108_30_firm_member_points_usage.sql`
- A `supabase/tests/rls/firm_member_points_1108.test.sql`
- A `docs/plans/2026-11-08-snippets/B2-verify.sql`
- A `docs/plans/2026-11-08-snippets/B2-report.md`
