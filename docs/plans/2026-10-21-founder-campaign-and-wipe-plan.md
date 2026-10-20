# Founder Campaign + Subscriptions Wipe (Batch A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the founder-lawyer campaign (owner ٢١٨, dates ٢٢٥) before it starts on Sunday 25 Oct 2026, and make the held subscriptions wipe (owner ٢٠٤ / ٢٢٤) runnable without touching test accounts.

**Architecture:** W6 of the 18 Oct plan (tasks 6.1 and 6.2, held until now) is carried over unchanged except that the setting is seeded with the owner's dates. The wipe is the existing one-time file plus one more SPARED class: every account in `public.test_accounts`.

**Tech Stack:** Next.js 16 (src/proxy.ts), self-hosted Supabase (Postgres 15, PostgREST v12), node:test, the Docker RLS harness.

**Spec:** the owner's decisions — ٢١٨ in `docs/plans/2026-10-18-owner-decisions-batch-plan.md` (W6) and his answers of 2026-10-20: ٢٢٥ «تاريخ البدء: الأحد ٢٥ أكتوبر ٢٠٢٦م · تاريخ الانتهاء: ٢٥ يناير ٢٠٢٧م (مدة ٣ أشهر)»; ٢٢٤ «(أ) — نلغي الاشتراكات والتجارب السابقة وتبقى أرصدة النقاط (مع الإبقاء الإلزامي على الحسابات التجريبية Test Accounts الخاصة باختباراتنا)».

## Global Constraints

The 18 Oct batch's global constraints apply verbatim (copied into this plan's SDD workspace as `global-constraints.md`), with these changes:
- Branch `batch/2026-10-21-founder-campaign` in `D:/nzwt/integ`.
- Migration range `20261021_50–59`.
- Campaign dates are Riyadh calendar dates, both ends inclusive: starts `2026-10-25`, ends `2027-01-25`. Library days: `90`.

## Review Focus

1. **A lawyer who signs up on 24 Oct (Riyadh) or 26 Jan** must get nothing; one who signs up at 00:30 Riyadh on 25 Oct must get the grant (UTC is still 24 Oct). Task 1 and Task 2 test the Riyadh boundary.
2. **The same person inserting a second `lawyer_profiles` row** (re-registration, a support fix) must not get a second grant. Task 1 tests it.
3. **The site deployed before the migration runs:** the banner falls back to the code `CAMPAIGNS` list and the profile reads tolerate the missing `founder_badge` column (42703). Task 2 tests the fallback.
4. **A test account holding a subscription created before the cutoff** must keep it, and its tier must not be reset. Task 3 tests it.
5. **`public.test_accounts` missing on the database** (an old restore): the wipe must raise and change nothing, not silently wipe test accounts. Task 3 tests it.

---

### Task 1: Campaign setting and automatic grant at signup

This is task 6.1 of `docs/plans/2026-10-18-owner-decisions-batch-plan.md`, with these differences:
- the migration is `supabase/migrations/20261021_50_founder_campaign.sql`;
- the `founder_campaign` setting is seeded with `{"starts_on": "2026-10-25", "ends_on": "2027-01-25", "library_days": 90}`. The seed uses `on conflict (key) do nothing`, so an admin's later edit is never overwritten by a re-run.

**Files:**
- Create: `supabase/migrations/20261021_50_founder_campaign.sql`
- Create: `supabase/tests/rls/founder_campaign.test.sql`
- Modify: `supabase/migrations/_verify.sql`, `src/app/api/v1/admin/settings/route.ts` (allowlist `founder_campaign`)

**Interfaces:**
- Consumes:
  - `public.library_access_grants` (20261019_10): `plan_ref 'lib-founder'`, `source 'founder_campaign'`;
  - `public.lawyer_profiles`.
- Produces:
  - `platform_settings` key `founder_campaign`: `{"starts_on": "YYYY-MM-DD" | null, "ends_on": "YYYY-MM-DD" | null, "library_days": 90}`;
  - `public.founder_campaign_active(p_at timestamptz default now()) returns boolean`: Riyadh date, inclusive both ends, false when either date is null;
  - `lawyer_profiles.founder_badge boolean not null default false`, with `grant select (founder_badge)` to anon and authenticated and no UPDATE grant;
  - BEFORE INSERT trigger `trg_lawyer_profiles_founder` (SECURITY DEFINER, `search_path ''`). While the campaign is active it:
    - sets `NEW.founder_badge = true`;
    - inserts one `library_access_grants` row with `ends_at = now() + library_days days`, once per user (it checks for an existing `lib-founder` row);
    - applies to every new `lawyer_profiles` row, consultants included. It fires before `trg_lawyer_profiles_from_signup`, so it must not branch on `practice_kind`.

- [ ] **Step 1: Write the Docker test** `founder_campaign.test.sql` with its header holding the exact `run.sh` chain and a negative control (the chain without the migration must FAIL). It covers:
  - dates null → no grant and `founder_badge` false;
  - the seeded dates with `now()` faked inside the window (call `founder_campaign_active('2026-10-24 21:30+00')`: 00:30 Riyadh on 25 Oct) → true; `'2026-10-24 20:59+00'` (23:59 Riyadh on 24 Oct) → false; `'2027-01-25 20:59+00'` → true; `'2027-01-25 21:00+00'` → false;
  - dates around the real today → an insert gets a 90-day grant and `founder_badge` true; anon can `select founder_badge` and still cannot `select metadata`;
  - dates in the past → no grant;
  - a second profile insert for the same user → no second grant;
  - a re-run of the migration keeps an admin-edited setting;
  - negative control.
- [ ] **Step 2:** Run it and confirm it fails (RED).
- [ ] **Step 3:** Write the migration, in one `begin … commit` with a raising verify block and `notify pgrst, 'reload schema'`. Allowlist the key in the admin settings route.
- [ ] **Step 4:** Run it and confirm it passes (GREEN). Add the `_verify.sql` section, which prints a NOTICE when not applied and raises on drift.
- [ ] **Step 5: Commit** `feat(campaign): the founder campaign grants 3 months of library and the founder badge at signup, 25 Oct 2026 – 25 Jan 2027 (owner ٢١٨/٢٢٥)`

### Task 2: Banner, admin dates, badge

This is task 6.2 of `docs/plans/2026-10-18-owner-decisions-batch-plan.md`, unchanged.

**Files:**
- Create: `src/app/api/v1/campaigns/active/route.ts` (public GET, `Cache-Control: public, max-age=300`)
- Modify:
  - `src/components/pricing/PromotionalCampaignBanner.tsx` (fetch the route; fall back to the code `CAMPAIGNS` when the route fails or returns nothing usable)
  - `src/lib/pricing/campaigns.ts` (`founderCampaignFromSetting(value: unknown, today: string): Campaign | null`, where `today` is a Riyadh `YYYY-MM-DD`)
  - the admin settings page (two date fields for `founder_campaign`)
  - the lawyer profile pages (a «المحامي المؤسس» badge when `founder_badge` is true; the select tolerates the column being absent, per the deploy-order rule)
- Test: `src/lib/pricing/campaigns.test.ts`

**Interfaces:** `founderCampaignFromSetting` returns a `Campaign` whose copy is exactly:
- `badgeAr`: «فترة المحامي المؤسس»
- `messageAr`: «سجّل الآن واحصل على ٣ أشهر من المكتبة القانونية مجاناً وشارة المؤسس»
- `ctaAr`: «سجّل محامياً»
- `ctaHref`: `/register/provider?type=lawyer`

It returns null outside the dates, with either date null, or for a malformed value.

- [ ] **Step 1: Tests:**
  - null dates → null;
  - `today` `2026-10-25` and `2027-01-25` → the campaign;
  - `2026-10-24` and `2027-01-26` → null;
  - a malformed value (a number, a missing key, `ends_on` before `starts_on`) → null;
  - the Riyadh date helper turns `2026-10-24T21:30:00Z` into `2026-10-25`.
- [ ] **Step 2:** Run them and confirm they fail (RED).
- [ ] **Step 3:** Implement. The route reads the setting server-side, computes the Riyadh today, and returns `{ campaign: Campaign | null }`. On 42P01/42703 or any read error it returns `{ campaign: null }` with 200.
- [ ] **Step 4:** Run them and confirm they pass (GREEN). Then run the full suite, type-check and lint.
- [ ] **Step 5: Commit** `feat(campaign): founder banner and badge from the admin-set dates`

### Task 3: The subscriptions wipe spares test accounts (owner ٢٢٤)

**Files:**
- Modify: `supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql`
- Modify: `supabase/tests/rls/wipe_subscriptions.test.sql` and its fixture `supabase/tests/rls/prelude_wipe_subscriptions_fixture.sql`

**Interfaces:** `public.test_accounts(user_id uuid pk → auth.users)` (20261017_44).

The file changes in four places:
- **Header:** the ⛔ HELD notice is replaced with the owner's answer to ٢٢٤ (أ), quoted. Points / credits stay untouched; test accounts are spared.
- **SPARED:** a third spared class. Every account in `public.test_accounts` keeps all its subscription rows, and its `tier` is not reset.
- **Block 1 preview:** lists the spared test accounts, with `spared_because 'a test account (owner ٢٢٤)'`.
- **Block 2:**
  - raises before any change when `public.test_accounts` does not exist;
  - excludes test accounts from the cancel and from the tier reset;
  - its verify and its final NOTICE count the spared test accounts.

- [ ] **Step 1:** Extend the Docker test and fixture:
  - a test account with an old live subscription → still live, and its tier unchanged;
  - an ordinary account with an old live subscription → cancelled, tier reset to free (unchanged behaviour);
  - the run without `public.test_accounts` (drop it in a separate negative chain) → raises, and nothing changes;
  - a second run changes nothing.
- [ ] **Step 2:** Run it and confirm it fails (RED).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it and confirm it passes (GREEN).
- [ ] **Step 5: Commit** `fix(one-time): the subscriptions wipe spares test accounts and is no longer held (owner ٢٢٤)`

### Task 4: Ship (controller)

- Run the full unit suite, type-check, lint and `next build --webpack`.
- Write the owner report `تقرير_للمالك_٢٠٢٦-١٠-٢١_حملة_المؤسس.md` (what is built, the SQL run order, his answers ٢٢٤–٢٥٤ recorded as received, «بانتظار النشر» until the user deploys).
- Copy the SQL into a new `SQL_batch_2026-10-21_founder_campaign/` folder in the main folder:
  - `01_BEFORE_DEPLOY_20261021_50_founder_campaign.sql`;
  - `02_AFTER_ALL_verify.sql`;
  - `03_ONE_TIME_wipe_subscriptions_and_trials.sql`;
  - a README with the run order.
- Merge and push only on the user's go.
