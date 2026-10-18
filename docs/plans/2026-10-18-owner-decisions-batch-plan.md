# Owner decisions of 18 Oct (١٩٩–٢٢٣) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner's 18 Oct decisions plus the leftovers carried from the 16 Oct batch.
- Separate the library subscription from the AI tools.
- Add the independent consultant account.
- Add an internal staff-role matrix with an audit trail.
- Lock the decree preamble.
- Give the laws search a time limit.
- Make the pricing and copy changes.
- Add the founder campaign.
- Close the small and honesty items.
- Build a points ledger, kept switched off.

**Architecture:** Eight workstreams (W1–W8), each shippable on its own, plus W9 (ship).
- **Data changes** go into idempotent, self-verifying migrations in per-workstream number ranges. Each migration has a Docker RLS test with a negative control and a `_verify.sql` section.
- **Library access** becomes its own grant table that `checkLibraryAccess` reads beside the tier. It is not a new tier, because 30+ tier consumers and the `subscriptions.tier` CHECK stay untouched.
- **The consultant** is a `lawyer` account with `lawyer_profiles.practice_kind = 'consultant'`. It uses the lawyer dashboard, and court features are refused on the server.
- **Staff roles** live in a new `platform_staff` table; `user_type = 'admin'` still means staff.

**Tech Stack:** Next.js 16.3 (`src/proxy.ts`, Promise params), self-hosted Supabase (PostgREST v12+, RLS, column grants), TypeScript, `node --test` on Node 22, Docker `postgres:16-alpine` harness at `supabase/tests/rls/run.sh`.

**Spec:**
- `C:\Users\LOQ\Downloads\حزمة_قرارات_وتسليم_١٨_أكتوبر_الرشيقة\01_القرارات_المعتمدة\ردود_وقرارات_المالك_على_المبرمج_٢٠٢٦-١٠-١٨.md` (decisions ١٩٩–٢٢٣).
- The ١٧٦ family-plan details are in `C:\Users\LOQ\Downloads\حزمة_تسليم_المبرمج_المعتمدة_2026-10-16\الإجابات_المعتمدة_لأسئلة_المالك_٢٠٢٦-١٠-١٦.md` line 16.
- The 4 Oct leftovers are on lines 66–72 of the same file.
- The live schema is `C:\Users\LOQ\Downloads\latest_schema_20261010.sql` (dated before 20261016+).

## Global Constraints

- **Copy:** user-facing copy is Arabic. Pages that are already bilingual keep their English twin. No invented numbers, no superlatives, and nothing that claims a feature which does not exist (`src/lib/pricing/pricingHonesty.test.ts` enforces part of this).
- **Production SQL:** the user runs every production SQL file in the SQL Editor. Every migration is idempotent and wrapped in one `begin … commit`. It ends with a raising verify block and a `notify pgrst, 'reload schema'` after commit when grants or functions change.
- **Locks:** `revoke all` on the table, then `grant select (<allow-list>)`. Never rely on a column-level REVOKE: every public/library table carries GRANT ALL from the self-host restore. Verify the EFFECTIVE privilege with a `pg_attribute` sweep.
- **Docker tests:** each migration gets a Docker test whose header holds its exact `run.sh` chain. It runs the migration twice and has a negative control, a chain without the migration that must FAIL.
- **Migration ranges:** W1 `20261019_10–19`, W2 `_20–29`, W3 `_30–39`, W4 `_40–49`, W6 `_50–59`, W8 `_60–69`. One-time SQL goes in `supabase/one-time/2026-10-19_*.sql` with a preview block and a typed-confirm guard.
- **Unit tests:** `npx -y node@22 --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/**/*.test.ts"`. Test files import modules with a relative `.ts` extension, so pure modules carry no `@/` imports.
- **Line endings:** keep each file's endings. Check with `git ls-files --eol`. Use the scratchpad `mixed-edit.cjs` for `i/crlf` and `i/mixed` files. In `D:/nzwt/integ`, use `git -c core.autocrlf=false`.
- **Never** run library seeders. Never print keys. Put no server IP in the repo.
- **Subagents** use `model: opus`.
- **The owner report** (`تقرير_للمالك_…`) and the questions file change in the same commit set as the batch. An item reads «نُفِّذ ✓» only after the user has applied it and the result has been checked live.
- **Do not sync `owner-edits`** until his patch is merged.

## Owner gates (build behind a default; do not guess past the default)

| Gate | Decision | Default the code ships with | Unblocks |
|---|---|---|---|
| **G1** | ٢٠٤ «اللغي كل الداتا» — scope | The one-time SQL cancels every subscription and library grant and resets each account's tier to free. It deletes NO accounts and NO credits. It does not run until the user confirms the scope | T1.7 run |
| **G2** | ٢١٨ founder campaign dates | `founder_campaign` setting is empty, so the campaign is inactive. The admin can set the dates in Settings; no code change is needed | T6.x live |
| **G3** | ٢٢١ says the decree preview is «٥٪ أو ٣ مواد»; ١٨٣ said «أول صفحتين» | Keep two pages (١٨٣, live) | none |
| **G4** | ٢٠٦ 1–2 points per assistant question for non-Pro | `points_enforcement = false`: nothing is charged. Ledger and debit RPC are built | W8 switch-on |
| **G5** | ٢٠٠ says «تبقى كما هي» but quotes 4,800 (3 seats) / 18,000 (7) / 32,000 (15); the page shows 4,800 (1–5 seats) / 12,000 (6–20) / 24,000 (large) | Keep the page as it is («تبقى كما هي في صفحة الأسعار») and ask about the numbers | T5.4 |
| **G6** | 4 Oct items 103 (letterhead) and 130 (eight visual tweaks) name no screens | Not built; asked | none |

Add G1–G6 to the owner questions file as ٢٢٤–٢٢٩ in W9.

**Answered with no build in this batch:**
- **٢٢٠:** ⚖️ is removed from the QR only (done in fc743eeb); other screens change when they are redesigned.
- **٢٢٢ / ١٨٦:** his library agent moves the three charters into a «الأنظمة الأساسية للشركات والهيئات» subfolder first; the subsection is added after his re-upload.
- **٢٢٣ / ١٨٧:** requests go to the Nezamy office only at launch, which is already how it works (N16).

The report says so in one line each.

## Review Focus

1. **An admin with no subscription, or a user with both Pro and a library grant,** opens a law, a fiqh book and the library assistant. The admin gets everything (٢٠٩). The library-only user gets the full library and a 403 on the assistant (٢٠٧). This is tested in T1.3 and T1.4.
2. **A library grant whose `ends_at` has passed** must not open anything. Several overlapping grants open access while any one is active. This is tested in T1.2.
3. **A consultant who calls a court API directly** (`POST /api/v1/lawyer/hearings`, `case-stages`, `najiz/sync`) gets 403 and no row is written. Hiding the nav is not enough. This is tested in T2.3.
4. **An `operations` staffer who calls a destructive admin endpoint directly** gets 403 and nothing changes. A `super_admin` succeeds, and exactly one `admin_audit_events` row is written. This is tested in T3.3.
5. **A guest who opens a decree** still gets HTTP 200 after the column lock (no `select('*')`). With an empty preamble there is no lock card; with a non-empty one there is a lock card and no text. A subscriber sees the preamble. This is tested in T4.2.

---

## W1 · Library subscription ⟂ AI tools (١٩٩–٢٠٩)

### Task 1.1: `library_access_grants` table

**Files:**
- Create: `supabase/migrations/20261019_10_library_access_grants.sql`
- Create: `supabase/tests/rls/library_access_grants.test.sql`
- Modify: `supabase/migrations/_verify.sql` (append a section keyed on the table's existence)

**Interfaces:**
- Produces the table `public.library_access_grants` with these columns:
  - `id uuid pk default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `plan_ref text not null check (plan_ref in ('lib-q1','lib-q2','lib-annual','lib-invite','lib-trial','lib-founder','lib-admin'))`
  - `source text not null check (source in ('request','invite_code','colleague_invite','founder_campaign','admin'))`
  - `starts_at timestamptz not null default now()`
  - `ends_at timestamptz not null`
  - `granted_by uuid null`
  - `created_at timestamptz not null default now()`
  - `check (ends_at > starts_at)`
  - index `(user_id, ends_at)`
- Privileges:
  - RLS on; policy «own library grants» `for select to authenticated using (user_id = auth.uid())`.
  - `revoke all … from anon, authenticated, public`; `grant select … to authenticated`; `grant all … to service_role`.

- [ ] **Step 1: Write the Docker test** with these checks:
  - T1: app_user (uid U) reads only its own grants.
  - T2: app_user cannot INSERT/UPDATE/DELETE (42501).
  - T3: anon has no privilege.
  - T4: service_role inserts. An `ends_at <= starts_at` row and an unknown `plan_ref` raise `check_violation`.
  - T5: two runs leave one table, one policy.
  - Header: the chain is `prelude stubs → migration ×2 → test`; the negative control is the chain without the migration, where T1 fails.
- [ ] **Step 2: Run** `bash supabase/tests/rls/run.sh <chain>`. Expected: FAIL (the relation does not exist).
- [ ] **Step 3: Write the migration** with the columns, policy and grants above. Verify block:
  - the table exists with RLS on;
  - the anon/authenticated privilege sweep shows SELECT only for authenticated;
  - service_role has ALL.
- [ ] **Step 4: Run** the chain. Expected: T1–T5 PASS, and the negative control FAILs at T1.
- [ ] **Step 5: Append the `_verify.sql` section.** It gives a NOTICE when the table is absent, and checks the policy count, RLS, and the absence of anon privileges. Test it in Docker before and after the migration.
- [ ] **Step 6: Commit** `feat(library): library_access_grants — the library subscription as its own grant (owner ١٩٩)`.

### Task 1.2: `src/lib/libraryAccess.ts`

**Files:**
- Create: `src/lib/libraryAccess.ts` (pure part)
- Create: `src/lib/libraryAccessServer.ts` (IO)
- Create: `src/lib/libraryAccess.test.ts`

**Interfaces:**
- Produces, in `libraryAccess.ts`:
  - `export type LibraryPlanRef = 'lib-q1'|'lib-q2'|'lib-annual'|'lib-invite'|'lib-trial'|'lib-founder'|'lib-admin'`
  - `export type LibraryGrantSource = 'request'|'invite_code'|'colleague_invite'|'founder_campaign'|'admin'`
  - `export const LIBRARY_PLAN_DAYS = { 'lib-q1': 90, 'lib-q2': 180, 'lib-annual': 365 } as const`
  - `export function libraryPlanDays(ref: unknown): number | null`
  - `export function isGrantActive(grant: { starts_at: string; ends_at: string }, now: Date): boolean`
- Produces, in `libraryAccessServer.ts`:
  - `export async function hasActiveLibraryGrant(userId: string): Promise<boolean>` — service client; true when a row exists with `starts_at <= now() < ends_at`.
  - `export async function grantLibraryAccess(input: { userId: string; planRef: LibraryPlanRef; days: number; source: LibraryGrantSource; grantedBy?: string | null }): Promise<{ ok: true; endsAt: string } | { ok: false; error: string }>` — inserts one row starting now; rejects `days` outside 1–3660.

- [ ] **Step 1: Write the failing tests.**
  - `libraryPlanDays('lib-q1') === 90`, `('lib-q2') === 180`, `('lib-annual') === 365`.
  - `('lib-firm-small')`, `(null)` and `(42)` return `null`.
  - `isGrantActive`: true inside the window; false at exactly `ends_at`; false before `starts_at`.
- [ ] **Step 2: Run** `npx -y node@22 … --test src/lib/libraryAccess.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** both files. The server file imports `createServiceClient` from `@/lib/supabase/server`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): libraryAccess helpers (plan days, active grant, grant)`.

### Task 1.3: Full library access = Pro+ OR library grant OR admin (٢٠٥, ٢٠٩)

**Files:**
- Modify: `src/lib/access-control.ts:101-114` (getUserTier unchanged), `:174-255` (checkLibraryAccess), `:270-…` (getLibraryAccessForUser)
- Modify: `src/app/api/library/enactments/route.ts:55`, `src/app/api/library/laws/[slug]/route.ts:261`, `src/app/api/library/monitor/route.ts:77` (inline pro checks → helper)
- Create: `src/lib/libraryAccessDecision.ts`
- Create: `src/lib/libraryAccessDecision.test.ts`

**Interfaces:**
- Consumes `hasActiveLibraryGrant` (T1.2).
- Produces:
  - `export function fullLibraryAccess(input: { tier: string; isAdmin: boolean; hasLibraryGrant: boolean }): boolean` — true when tier rank ≥ pro, or admin, or grant.
  - `export async function isPlatformAdmin(userId: string | null): Promise<boolean>` in access-control (service read of `profiles.user_type`).
  - `export async function hasFullLibraryAccess(userId: string | null): Promise<boolean>`.
  - `getLibraryAccessForUser` returns `hasFullAccess` from these, and `checkLibraryAccess` returns `freeLimit: -1` when they hold.
- The three inline checks call `hasFullLibraryAccess`. The laws route's `isSubscriber` (official-meta rule) uses the same helper.

- [ ] **Step 1: Write the failing tests** for `fullLibraryAccess`: free+grant → true; free+admin → true; pro → true; max → true; ai with no grant → false; free with nothing → false.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** and wire. `getUserTier` stays as it is, so tier consumers are unaffected.
- [ ] **Step 4: Run the full unit suite and `npm run -s type-check`.** Update the source-pin tests that assert the old inline pro check (`_official-meta.routes.test.ts`, `regulation-paywall.routes.test.ts`, `library-column-lock.test.ts:692`) to the helper call, keeping their intent. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(library): full library = Pro+, a library grant, or an admin (owner ٢٠٥/٢٠٩)`.

### Task 1.4: The AI assistant is Pro+ or admin, never library-only (٢٠٦ default, ٢٠٧, ٢٠٩)

**Files:**
- Modify: `src/app/api/ai/_libraryAiAccess.ts:28-48`
- Test: `src/app/api/ai/library-ai-access.test.ts`

**Interfaces:**
- Consumes `isPlatformAdmin` (T1.3).
- Produces `export function libraryAiDecision(input: { signedIn: boolean; tier: string; isAdmin: boolean }): 'allow' | 'sign_in' | 'upgrade'` (pure, in the same file or a sibling).

- [ ] **Step 1: Extend the test:**
  - not signed in → `sign_in`;
  - admin with tier free → `allow`;
  - pro → `allow`;
  - free with a library grant (grant ignored) → `upgrade`;
  - ai → `upgrade`.
- [ ] **Step 2: Run.** Expected: FAIL on the admin case.
- [ ] **Step 3: Implement** — 401 for `sign_in`, 403 for `upgrade`, keeping the existing messages.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): the library assistant is Pro+ or admin; a library-only subscription does not open it (owner ٢٠٧/٢٠٩)`.

### Task 1.5: Grant paths write library grants, not Pro (٢٠١, ٢٠٢, ٢٠٣)

**Files:**
- Modify:
  - `src/app/api/v1/admin/entitlements/requests/[id]/route.ts:88-107`
  - `src/app/dashboard/admin/entitlements/requests/page.tsx:41,72-76` (library requests show a days field prefilled from `requested_ref`; no tier picker for `kind='library'`)
  - `src/app/api/v1/library/invitations/redeem/route.ts:40-41,166-194`
  - `src/app/api/v1/invite/[code]/accept/route.ts:135-157`
- Tests: the three matching `route.test.ts` files.

**Interfaces:**
- Consumes `grantLibraryAccess` and `libraryPlanDays` (T1.2).
- Approving `kind='library'`:
  - `days = body.durationDays ?? libraryPlanDays(requested_ref) ?? 90`;
  - `planRef = requested_ref` if it is one of the three plan refs, else `'lib-admin'`;
  - `source = 'request'`.
- Redeem: `planRef: 'lib-invite'`, `days: 30`, `source: 'invite_code'`. The use is refunded when the grant fails (keep the existing refund).
- Accept: `planRef: 'lib-trial'`, `days: invitation.trial_days ?? 30`, `source: 'colleague_invite'`. The invitation's `tier` is no longer used.

- [ ] **Step 1: Update the tests:**
  - approving a `lib-annual` request inserts a grant ending at now+365;
  - with an explicit `durationDays: 120`, ends at now+120;
  - no `subscriptions` row is written for a library request;
  - redeem writes a 30-day `lib-invite` grant and no `pro`;
  - accept writes `lib-trial`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(library): plan requests, invite codes and colleague invites grant the library only, for the plan's real duration (owner ٢٠١–٢٠٣)`.

### Task 1.6: The client shows full library from the server's answer

**Files:**
- Modify:
  - `src/app/api/library/init/route.ts` (add `viewer: { hasFullAccess: boolean }` to the response)
  - `src/app/laws/page.tsx` (pass it down)
  - `FeqhTabContent.tsx:61`, `LawsTabContent.tsx:238`, `PrecedentsTabContent.tsx:90`, `laws/[slug]/_article-components.tsx:657` (that one reads `paywall.hasFullAccess` from its own API), `laws/subscribe/page.tsx:253`
- Test: `src/app/api/library/init-route-contract.test.ts`

**Interfaces:**
- Consumes `getLibraryAccessForUser().hasFullAccess` (T1.3).
- The tabs receive a `viewerHasFullAccess: boolean` prop. `featureAccess("library-full-access")` is no longer used by them.

- [ ] **Step 1: Test:** the init route source returns `viewer: { hasFullAccess }`, and the five sites no longer call `can("library-full-access")`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the unit suite and type-check.** Expected: PASS.
- [ ] **Step 5: Commit** `fix(library): the library tabs read full access from the server, so a library subscriber is not shown locks`.

### Task 1.7: One-time wipe of earlier subscriptions (٢٠٤ — gate G1)

**Files:**
- Create: `supabase/one-time/2026-10-19_wipe_subscriptions_and_trials.sql`
- Create: `supabase/tests/rls/wipe_subscriptions.test.sql`

**Interfaces:** none in code.

Block 1 is a read-only preview: counts of active subscriptions by tier, library grants, and accounts whose `raw_user_meta_data->>'tier'` is not free. Block 2 is one transaction:
- guard: `select current_setting('nzamy.confirm_wipe', true) = 'WIPE-2026-10-19'` or raise;
- `update public.subscriptions set status = 'cancelled', cancelled_at = now(), auto_renew = false, current_period_end = least(coalesce(current_period_end, now()), now()), metadata = metadata || jsonb_build_object('wiped_at', now(), 'wipe', 'owner-204')` where status in ('active','trialing','past_due');
- `delete from public.library_access_grants`;
- `update auth.users set raw_user_meta_data = jsonb_set(coalesce(raw_user_meta_data,'{}'), '{tier}', '"free"')` for all non-admin users;
- verify zero active subscriptions remain.

- [ ] **Step 1: Write the Docker test:**
  - fixture with two active subscriptions, one grant, and metadata tier pro;
  - without the confirm setting, block 2 raises;
  - with it, 0 active rows, 0 grants, and tier free — admin metadata untouched;
  - a second run is a no-op.
- [ ] **Step 2: Run** (expect FAIL before the file exists), write the file, run it again. Expected: PASS.
- [ ] **Step 3: Commit** `chore(owner-204): one-time wipe of earlier subscriptions and trial grants (held for the scope confirmation)`.

---

## W2 · The independent consultant account (١٧٣, ٢١٩)

### Task 2.1: `practice_kind`, licence image path, signup fill

**Files:**
- Create: `supabase/migrations/20261019_20_lawyer_practice_kind.sql`
- Create: `supabase/tests/rls/lawyer_practice_kind.test.sql`
- Modify: `_verify.sql`

**Interfaces:**
- Produces:
  - `lawyer_profiles.practice_kind text not null default 'advocate' check (practice_kind in ('advocate','consultant'))`
  - `lawyer_profiles.licence_image_path text null`
  - BEFORE INSERT trigger `trg_lawyer_profiles_from_signup` → `public.lawyer_profile_from_signup()` (SECURITY DEFINER, `search_path ''`). It reads `auth.users.raw_user_meta_data` for `new.user_id`:
    - sets `practice_kind = 'consultant'` only when the metadata `practice_kind` is exactly `consultant`;
    - fills `license_number` from metadata `license_number` when the new row's is null.
- Privileges: `lawyer_profiles` already has table-level INSERT/UPDATE revoked with a column UPDATE list (20260922_03:265-290) and a SELECT column lock (20261016_10:100-115). The new columns therefore start with no API privilege at all. Add exactly `grant select (practice_kind) on public.lawyer_profiles to anon, authenticated` (a public profile shows «مستشار قانوني»). Grant nothing on `licence_image_path` (only the service role reads it). Do NOT re-run any `revoke`/`grant update` on the table.
- Do not touch `handle_new_user`.

- [ ] **Step 1: Docker test** on a prelude of the live `lawyer_profiles` (the columns and column grants from the dump):
  - insert with metadata `{practice_kind:'consultant', license_number:'MOJ-1'}` → consultant and MOJ-1;
  - `{practice_kind:'admin'}` → advocate;
  - app_user cannot update its own `practice_kind` (42501) but can still update the profile columns it could before;
  - negative control.
- [ ] **Step 2: Run** → FAIL. **Step 3:** write the migration. **Step 4:** run → PASS, and the negative control fails.
- [ ] **Step 5: `_verify` section** and commit `feat(consultant): lawyer_profiles.practice_kind filled at signup; licence number persisted (owner ١٧٣/٢١٩)`.

### Task 2.2: `src/lib/auth/practiceKind.ts`

**Files:**
- Create: `src/lib/auth/practiceKind.ts`
- Create: `src/lib/auth/practiceKind.test.ts`

**Interfaces:**
- `export type PracticeKind = 'advocate' | 'consultant'`
- `export function toPracticeKind(v: unknown): PracticeKind` (anything but `'consultant'` → `'advocate'`)
- `export const CONSULTANT_BLOCKED_PREFIXES = ['/dashboard/lawyer/hearings', '/dashboard/lawyer/deadlines', '/ai/najiz-optimizer', '/ai/wargaming', '/ai/brief-check'] as const`
- `export function isConsultantBlockedPath(pathname: string): boolean`
- `export const CONSULTANT_BLOCKED_MESSAGE = 'هذه الأداة للمحامي المرخّص بالترافع؛ المستشار القانوني لا يترافع ولا يدير الجلسات (المادة ١٨ من نظام المحاماة).'`

- [ ] **Step 1: Tests:**
  - `isConsultantBlockedPath('/dashboard/lawyer/hearings')` → true; `('/dashboard/lawyer/hearings/123')` → true;
  - `('/dashboard/lawyer/contracts')` → false; `('/ai/legal-opinion')` → false; `('/dashboard/lawyer/hearings-old')` → false (segment-exact);
  - `toPracticeKind('CONSULTANT')` → advocate.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(consultant): the Art. 18 path list`.

### Task 2.3: Court APIs refuse consultants

**Files:**
- Create: `src/lib/auth/assertCourtPractice.ts`
- Modify:
  - `src/app/api/v1/lawyer/hearings/route.ts` (POST/PATCH)
  - `src/app/api/v1/lawyer/case-stages/route.ts` and `[caseId]/route.ts` (writes)
  - `src/app/api/v1/lawyer/deadlines/route.ts` (POST)
  - `src/app/api/v1/najiz/sync/route.ts`
- Test: `src/lib/auth/assertCourtPractice.test.ts` (source pins for every route above)

**Interfaces:**
- `export async function assertCourtPractice(supabase: SupabaseClient, userId: string): Promise<NextResponse | null>` — reads `lawyer_profiles.practice_kind` for `userId`. It returns a 403 JSON `{ error: CONSULTANT_BLOCKED_MESSAGE }` for a consultant and `null` otherwise. Admins pass.

- [ ] **Step 1: Test:** each listed route file imports `assertCourtPractice` and calls it before its first insert/update.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(consultant): hearings, case stages, deadlines and Najiz refuse a consultant on the server (Art. 18)`.

### Task 2.4: Dashboard for the consultant

**Files:**
- Modify:
  - `src/hooks/useUser.ts` (expose `practiceKind` read from `lawyer_profiles.practice_kind` in the profile fetch)
  - `src/constants/navigation.sidebars.ts:361-370` (for a lawyer with `practiceKind === 'consultant'`, drop items whose href satisfies `isConsultantBlockedPath`)
  - `src/lib/lawyerQuickTools.ts` (same filter)
  - the blocked lawyer pages (`src/app/dashboard/lawyer/hearings/page.tsx`, `deadlines/page.tsx`) and the three AI tools — render a lock panel with `CONSULTANT_BLOCKED_MESSAGE` for consultants
- Test: `src/constants/navigation.consultant.test.ts`

- [ ] **Step 1: Test:** `getSidebar('lawyer', { practiceKind: 'consultant' })` contains no blocked hrefs and still contains contracts, consultations, `/ai/legal-opinion`, clients and documents. The advocate sidebar is unchanged.
- [ ] **Step 2–4:** red, implement, green. Then run type-check.
- [ ] **Step 5: Commit** `feat(consultant): the consultant's dashboard has no pleading or hearings tools`.

### Task 2.5: Registration — the «مستشار قانوني» card, Saudi only

**Files:**
- Modify: `src/app/register/provider/types.ts:1`, `data.ts:4-19`, `page.tsx:45-46,383-433`, `components/Steps.tsx:204-212`
- Create: `src/app/register/provider/signupMetadata.ts`
- Create: `src/app/register/provider/signupMetadata.test.ts`
- Modify: `src/constants/pricing/pricing.providers.ts:55,111` (link `/register/provider?type=consultant`)

**Interfaces:**
- `ProviderType` gains `'consultant'`.
- `export function providerSignupMetadata(type: Exclude<ProviderType, null>): { user_type: 'lawyer'|'firm'|'provider'; sub_role: 'notary'|'arbitrator'|'bailiff'|null; practice_kind?: 'consultant' }` — consultant → `{ user_type: 'lawyer', sub_role: null, practice_kind: 'consultant' }`.
- The page reads `?type=` (useSearchParams) to preselect the card. For a consultant the country is fixed to SA (the select is disabled).
- Card copy: «مستشار قانوني» / «الاستشارات والعقود والدراسات — دون ترافع (المادة ١٨)».

- [ ] **Step 1: Tests** for the mapping of all six types, with consultant as above. The other five are unchanged from `page.tsx:383-386`.
- [ ] **Step 2–4:** red, implement, green. The pricing tests (`pricingHonesty`, `pricingApprovals`) still pass.
- [ ] **Step 5: Commit** `feat(consultant): register as «مستشار قانوني» — a Saudi-licensed consultant (owner ٢١٩)`.

### Task 2.6: Licence image upload and admin review

**Files:**
- Create: `src/app/api/v1/lawyer/licence-image/route.ts` (POST)
- Modify:
  - the lawyer profile edit page's verification section (`src/app/dashboard/lawyer/profile/edit/page.tsx`)
  - `src/app/api/v1/admin/verifications/route.ts:53-91,205-222` (return `licenceImageUrl`, a 10-minute signed URL, service role)
  - `src/app/dashboard/admin/provider-verification/page.tsx:428-461` (the eye button opens it; show «مستشار قانوني» when `practice_kind = 'consultant'`)
- Test: `src/app/api/v1/lawyer/licence-image/route.test.ts`

**Interfaces:**
- The browser uploads to storage bucket `documents` at `${userId}/licence/<timestamp>-<safeName>` (the existing own-folder policy).
- POST `{ path }` validates that `path` starts with `${userId}/licence/` and that the object exists (service role). It then sets `lawyer_profiles.licence_image_path` via the service role.
- The verification list exposes `licenceImageUrl: string | null`.

- [ ] **Step 1: Tests:** a path outside the caller's folder → 400; another user's folder → 400; a valid path → 200 and the update is called with that path.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(verification): lawyers and consultants upload the licence image; admins open it from the verification queue`.

---

## W3 · Internal staff roles and audit (٢١٠, option a)

### Task 3.1: `platform_staff`, role functions, append-only audit

**Files:**
- Create: `supabase/migrations/20261019_30_platform_staff_roles.sql`
- Create: `supabase/tests/rls/platform_staff_roles.test.sql`
- Modify: `_verify.sql`

**Interfaces:**
- `public.platform_staff`:
  - columns: `user_id uuid pk references auth.users(id) on delete cascade`, `staff_role text not null check (staff_role in ('super_admin','operations','auditor'))`, `granted_by uuid`, `granted_at timestamptz not null default now()`;
  - RLS on; select `to authenticated using (public.is_admin())`; no write policy; service_role ALL.
- Backfill: `insert … select id, 'super_admin' from profiles where user_type = 'admin' on conflict do nothing`. That way no current admin loses access; the user downgrades staff afterwards.
- `public.staff_role() returns text`: SECURITY DEFINER, stable, `search_path ''`. It returns the role of `auth.uid()` or null.
- `public.is_super_admin() returns boolean`.
- `admin_audit_events`:
  - `add column if not exists actor_email text`;
  - trigger `trg_admin_audit_append_only` raises on UPDATE or DELETE unless `current_user in ('postgres','supabase_admin')`.

- [ ] **Step 1: Docker test:**
  - the backfill makes the existing admin a super_admin;
  - a non-admin app_user reads no staff rows;
  - an admin reads them;
  - nobody but service_role writes;
  - `staff_role()` returns the role;
  - UPDATE/DELETE on `admin_audit_events` as service_role raises;
  - INSERT works;
  - negative control.
- [ ] **Step 2–4:** red, migration, green.
- [ ] **Step 5: `_verify` section** and commit `feat(admin): platform_staff roles (super_admin / operations / auditor) and an append-only audit log (owner ٢١٠)`.

### Task 3.2: `src/lib/auth/staffRoles.ts`

**Files:**
- Create: `src/lib/auth/staffRoles.ts`
- Create: `src/lib/auth/staffRoles.test.ts`

**Interfaces:**
- `export type StaffRole = 'super_admin' | 'operations' | 'auditor'`
- `export type StaffAction = 'users.delete' | 'users.change_type' | 'users.suspend' | 'staff.manage' | 'settings.write' | 'library.delete' | 'content.delete' | 'coupons.delete' | 'subscriptions.write' | 'entitlements.grant' | 'entitlements.decide' | 'credits.adjust' | 'orders.manage' | 'verifications.decide' | 'community.moderate' | 'tickets.manage' | 'broadcasts.send' | 'read'`
- `export const STAFF_MATRIX: Readonly<Record<StaffRole, ReadonlySet<StaffAction>>>` with these rows:
  - **super_admin:** every action.
  - **operations:** `orders.manage`, `verifications.decide`, `community.moderate`, `tickets.manage`, `entitlements.decide`, `read`.
  - **auditor:** `read`.
- `export function staffCan(role: StaffRole | null | undefined, action: StaffAction): boolean`
- `export function toStaffRole(v: unknown): StaffRole | null`

- [ ] **Step 1: Tests:**
  - super_admin can do every action;
  - operations cannot do `users.delete`, `library.delete`, `content.delete`, `settings.write`, `staff.manage`, `entitlements.grant` or `credits.adjust`;
  - auditor can do only `read`;
  - `staffCan(null, 'read')` → false.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(admin): the staff action matrix`.

### Task 3.3: Gate the destructive admin routes and log them

**Files:**
- Modify: `src/lib/access-control.ts` (add `requireStaff`)
- Create: `src/lib/auth/adminAudit.ts`
- Modify these routes (the research table):
  - `admin/users/[id]` DELETE (`users.delete`) and PATCH (`users.change_type` when `user_type` changes; `users.suspend`)
  - `admin/teams` POST (`staff.manage`)
  - `admin/subscriptions` POST, `[id]` PATCH/DELETE (`subscriptions.write`)
  - `admin/entitlements/grant` (`entitlements.grant`), `requests/[id]` (`entitlements.decide`)
  - `admin/credits` (`credits.adjust`)
  - `admin/settings` PATCH (`settings.write`)
  - `admin/library` DELETE (`library.delete`) and PATCH (`settings.write`)
  - `admin/articles/[id]` DELETE (`content.delete`)
  - `admin/coupons/[id]` DELETE (`coupons.delete`)
  - `admin/service-orders/[id]` (`orders.manage`)
  - `admin/verifications/[id]` (`verifications.decide`)
  - `admin/community/*` (`community.moderate`)
  - broadcasts POST/PATCH (`broadcasts.send`)
- Test: `src/lib/auth/adminRouteGates.test.ts` (source pins)

**Interfaces:**
- Consumes `staffCan` and `toStaffRole` (T3.2) and `public.platform_staff` (T3.1).
- `export async function requireStaff(action: StaffAction): Promise<{ ok: true; userId: string; role: StaffRole } | { ok: false; response: NextResponse }>` — calls the existing `requireAdmin()` (`access-control.ts:118`) first and passes its 503/401/403 through unchanged; then 403 `{ error: 'هذا الإجراء لقيادة المنصة فقط' }` when `staffCan` is false. It reads the role with the service client from `platform_staff`, treating an admin with no row as auditor (fail-closed).
- `export async function logAdminAction(input: { actorId: string; action: string; targetType: string; targetId: string | null; before?: unknown; after?: unknown; metadata?: Record<string, unknown> }): Promise<void>` — a service-role insert into `admin_audit_events` (`before` → `before_state`, `after` → `after_state`) with `actor_type 'admin'` and `actor_email` looked up once. It logs (and never throws) on failure.
- `admin/users/[id]` PATCH also refuses `user_type: 'admin'` on the server (closing the missing allowlist). Only `staff.manage` (T3.4) creates staff.

- [ ] **Step 1: Test:** each route file listed calls `requireStaff('<its action>')` before any write, and calls `logAdminAction` after a successful write. Users PATCH rejects `user_type: 'admin'`.
- [ ] **Step 2–4:** red, implement, green. Run type-check.
- [ ] **Step 5: Commit** `feat(admin): destructive admin actions need a super admin and each one is audited (owner ٢١٠)`.

### Task 3.4: Staff role management and role-aware admin UI

**Files:**
- Modify:
  - `src/app/api/v1/admin/teams/route.ts` (GET returns `staffRole`; PATCH `{ userId, staffRole }` upserts `platform_staff`, gated on `staff.manage` and audited; POST creates the admin plus a `platform_staff` row, default role `operations`)
  - `src/app/dashboard/admin/team/page.tsx` (a role selector for super admins)
  - `src/components/admin/AdminSidebar.tsx:20-77,278-320` and `src/constants/navigation.sidebars.primary.ts:131-212` (hide `/dashboard/admin/settings`, `/team`, `/pricing` and the user-delete affordances unless super_admin)
  - `src/hooks/useUser.ts` (expose `staffRole` via `/api/v1/me` or the profile fetch)
- Test: `src/components/admin/adminNavByRole.test.ts`

**Interfaces:** `export function adminNavForRole(role: StaffRole | null): typeof NAV`.

- [ ] **Step 1: Test:** operations sees no settings/team/pricing items; super_admin sees all 31; auditor sees no write pages.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(admin): super admins set staff roles; the admin console shows each role its own tools`.

---

## W4 · Decree preamble lock (٢٢١) and the laws search time limit

### Task 4.1: Column-lock `decrees_circulars.preamble`

**Files:**
- Create: `supabase/migrations/20261019_40_library_decree_preamble_lock.sql`
- Create: `supabase/tests/rls/library_decree_preamble_lock.test.sql`
- Modify: `supabase/tests/rls/library_column_lock.test.sql:264-269` (T7: `has_table_privilege` → `has_any_column_privilege`), `_verify.sql`

**Interfaces:**
- Lock: `revoke all on library.decrees_circulars from anon, authenticated, public; grant select (id, title, type, issuer, ref, date, summary, summary_brief, category, hashtags, official_url, fts, created_at, updated_at, instrument_ar) on library.decrees_circulars to anon, authenticated; grant all … to service_role`.
- Keep RLS and the read policy.
- Marker comment `PREAMBLE SERVER-ONLY since 20261019_40`.
- Verify uses the sweep. `fts` stays public because it does not index the preamble (dump :5175).

- [ ] **Step 1: Docker test:**
  - anon reads the metadata columns;
  - `select preamble` → 42501; `select *` → 42501;
  - `fts` search works as anon;
  - service_role reads the preamble;
  - negative control.
- [ ] **Step 2–4:** red, migration, green. The amended `library_column_lock` harness passes on its full chain.
- [ ] **Step 5: `_verify` section** and commit `feat(library): the decree preamble is subscriber-only (owner ٢٢١)`.

### Task 4.2: Decree route and reader

**Files:**
- Modify:
  - `src/app/api/library/decrees/[id]/route.ts:22-34,81` (explicit metadata columns on the request client; preamble via the service client only when `hasFullAccess`; response `preamble`, `preambleLocked`)
  - `src/app/laws/orders/[slug]/page.tsx:547-557` (lock card «الديباجة متاحة للمشتركين» when `preambleLocked`)
  - `src/app/laws/demo-data.ts:70-86` (`preambleLocked?: boolean`)
  - `src/app/api/library/library-column-lock.test.ts` (add `decrees_circulars` to `TABLES` / `LIVE_COLUMNS`; parse its allow-list from 20261019_40)

**Interfaces:**
- Consumes `hasFullLibraryAccess` (T1.3).
- `preambleLocked = !hasFullAccess && preamble.trim() !== ''`; `preamble: hasFullAccess ? preamble : ''`.

- [ ] **Step 1: Tests:**
  - the column-lock scanner, now including `decrees_circulars`, passes over `src/` (no `select('*')`);
  - a route source pin checks that the preamble read uses `serverOnly` and is masked.
- [ ] **Step 2–4:** red, implement, green. Run type-check.
- [ ] **Step 5: Commit** `feat(library): the decree route serves the preamble to subscribers only; the reader shows a lock card`.

### Task 4.3: `library.search_law_articles_page` (4s)

**Files:**
- Create: `supabase/migrations/20261019_41_library_search_law_articles_page.sql`
- Create: `supabase/tests/rls/library_search_law_articles_page.test.sql`
- Modify: `_verify.sql`

**Interfaces:**
- `library.search_law_articles_page(p_tsquery text, p_offset integer, p_fetch integer, p_status text default null, p_section_code text default null, p_law_type text default null) returns jsonb` → `{"count": int, "rows": [{id, number, number_text, status, text, original_text, law_slug}]}`.
- `language sql stable security invoker set search_path = '' set statement_timeout = '4s'`.
- Matches come from a MATERIALIZED CTE of ids over `articles.fts @@ pg_catalog.to_tsquery('simple'::regconfig, p_tsquery)` (`simple` = `LIBRARY_FTS_CONFIG`; never `library.arabic`). `law_slug` is a column of `library.articles` and `id` is varchar. It joins `library.laws` (on `laws.slug = articles.law_slug`) only when `p_section_code` or `p_law_type` is set. The page is ordered by id, with offset and `limit least(p_fetch, 1001)`.
- EXECUTE for service_role only.

- [ ] **Step 1: Docker test:**
  - rows and count for a fixture word;
  - the status filter;
  - the section filter (join);
  - an empty window past the end keeps the count;
  - anon/authenticated cannot execute;
  - proconfig has `statement_timeout=4s` and `search_path=""`;
  - negative control.
- [ ] **Step 2–4:** red, migration, green.
- [ ] **Step 5: `_verify` section** and commit `feat(search): the laws search window gets its own 4-second limit (database side)`.

### Task 4.4: Laws section uses the RPC

**Files:**
- Modify: `src/app/api/library/search/route.ts:256-427` (CRLF file — `mixed-edit.cjs`)
- Tests: `route-fail-closed.test.ts`, `articles-server-only.test.ts`

**Interfaces:**
- `const LAWS_RPC = 'search_law_articles_page'`, plus a missing-function memo of 10 minutes (the precedents/fiqh pattern).
- RPC rows have no embed, so `articleRows = await withLaws(rows)` always takes the RPC path.
- The inline `lawQuery` stays for the missing-function fallback only, keeping its join rule.
- A 57014 from the RPC fails the section and is never retried inline.

- [ ] **Step 1: Update the source pins** (the counts of `.order('id')` and `count: 'estimated'`, the new RPC call and fallback lines), plus a test mirroring the fiqh RPC test (`route-fail-closed.test.ts:193-205`).
- [ ] **Step 2–4:** red, implement, green. Run the full suite.
- [ ] **Step 5: Commit** `feat(search): laws search through the time-limited RPC, inline only while it is missing`.

---

## W5 · Pricing and copy (١٩٩, ٢٠٠, ٢٠٨, ٢١٣/١٧٦, ٢١٦, ٢١٧)

### Task 5.1: Tool costs (٢١٦) and one source for point badges

**Files:**
- Modify:
  - `src/constants/pricing/pricing.lawyers.ts:116-175` (add rows)
  - `src/components/pricing/PricingCards.tsx:343,362` (drop «تُخصم مع كل استخدام»; say the table is the price list and that automatic deduction starts with electronic payment)
  - `src/constants/lawyerAiCatalog.ts:86-246,266-310` (hub badges read the table via a shared map, or drop the badge where the table has no row)
- Test: `src/lib/services/pricingApprovals.test.ts`

**Interfaces:**
- New `ServiceRow`s:
  - `الصياغة من نموذج` (`/ai/templates`): points 5, `pointsLabel: '٥–٨'`.
  - `مولّد أسئلة الاستجواب` (legal-opinion mode): points 5, `pointsLabel: '٥–٨'`.
  - `منقح ناجز`: points 5, `pointsLabel: '٥–٨'`.
  - `المحاكي القضائي` (`/ai/wargaming`): points 15, `pointsLabel: '١٥–٢٠'`.
  - `تقرير العناية الواجبة`: points 15, `pointsLabel: '١٥–٢٠'`.
  - `الرأي الفصل`: points 15, `pointsLabel: '١٥–٢٠'`.
- Archive note: «الأرشيف السحابي: ضمن سعة الباقة».
- **Not listed:** `المقارن الذكي` and `المترجم القانوني`, because both return canned output (W7 T7.6 marks them «قريباً»). `pricingHonesty.test.ts:264-278` forbids pricing a «قريباً» tool. Tell the owner.
- `export const TOOL_POINT_LABELS: Record<string, string>` keyed by catalog id, used by the hub.

- [ ] **Step 1: Tests:**
  - the six rows exist with those labels;
  - no row for compare / legal-translate;
  - every hub badge equals the table label or is absent;
  - the word «تُخصم … كل استخدام» is gone.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(pricing): the owner's point ranges for the remaining tools; one source for tool costs (owner ٢١٦)`.

### Task 5.2: Extra seats → sales (٢١٧)

**Files:**
- Modify:
  - `src/constants/pricing/pricing.firms.ts:32,52,74,94`
  - `src/app/pro/page.tsx:50-87` (also drop the office plan's «ما في باقة المحامي المحترف», which implies points the firm plans do not include)
  - `src/app/register/provider/data.ts:49-57,81-89`
  - `src/app/dashboard/admin/pricing/page.tsx:52-59` and `src/constants/firmProfileReadiness.ts:54-91` (stale 2,988 / 3,588 / 17,988 / 2,388 → the current plans)
- Tests: `pricingApprovals.test.ts:54-62`, `pricingHonesty.test.ts:234-248`

The line reads «مقاعد إضافية: تواصل مع المبيعات», linking to `/contact?type=firm-seats`. The internal 200–250 range does NOT appear on any public page.

- [ ] **Step 1: Tests:** each firm plan has the sales line; no «17,988», «2,988», «3,588» or «2,388» remain in `src`; no public file contains «٢٠٠–٢٥٠».
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(pricing): extra seats through sales; stale seat prices removed (owner ٢١٧)`.

### Task 5.3: «التأمين القانوني» with family coverage (٢١٣ + ١٧٦)

**Files:**
- Modify:
  - `src/constants/pricing/pricing.individuals.ts:118-185,283-347,352-433`
  - `src/lib/pricing/plans.ts:222-291`
  - `src/app/services/individuals/page.tsx:344` (render the footnote)
- Tests: `pricingApprovals.test.ts:38-47`, `pricingHonesty.test.ts`

**Interfaces:**
- `ind-litigation` keeps its id. Its name becomes «التأمين القانوني», 399 / 3,990.
- The features follow ١٧٦ line 16:
  - family option: dependants at 20% (٣١٩), 30% (٢٧٩), 40% (٢٣٩) for the third and beyond;
  - shared family cap of «٣٥٬٠٠٠–٥٠٬٠٠٠ ر.س سنوياً»;
  - a family pool of preventive consultations;
  - «٣٬٠٠٠–٥٬٠٠٠ نقطة شهرياً» for families;
  - each adult's account private.
- New field `footnote?: string` on the plan type. Here it is `'* تطبق الشروط والأحكام'`, rendered small and grey under the card.
- `ind-family` (699) is deleted, along with its comparison column.
- One honest line: «تُضاف التغطية العائلية بطلب يراجعه الفريق», because no dependants mechanism is built.

- [ ] **Step 1: Tests:**
  - no `ind-family`, and no «٦٩٩» in the individuals files;
  - `ind-litigation.name === 'التأمين القانوني'`;
  - the footnote renders;
  - the dependant prices are ٣١٩ / ٢٧٩ / ٢٣٩;
  - the existing honesty tests still pass.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(pricing): «التأمين القانوني» with family coverage; the 699 family plan merged into it (owner ٢١٣/١٧٦)`.

### Task 5.4: Library copy (١٩٩, ٢٠٨) — firm plans untouched (G5)

**Files:**
- Modify:
  - `src/constants/pricing/pricing.library.ts:21,47,75,107,141,169,198,235,265,295,325,357,387,417,447` (AI search lines → «بحث متقدّم في المكتبة القانونية»)
  - `pricing.providers.ts:43,99,131,147` («المكتبة القانونية مجاناً» → «المكتبة القانونية باشتراك»)
  - `src/app/invite/[code]/page.tsx:247-266,356` (library-only wording, 30 days)
  - `src/app/laws/subscribe/page.tsx:112` (a code opens the library for 30 days, not Pro)
- Tests: `pricingHonesty.test.ts`, `inviteTrialLabel.test.ts`, `libraryInvitationDisplay.test.ts`

- [ ] **Step 1: Tests:**
  - no library plan mentions AI;
  - no provider plan says the library is free;
  - the subscribe FAQ says «المكتبة القانونية لمدة ٣٠ يوماً».
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `fix(pricing): the library subscription is texts only; no «free library» claims (owner ١٩٩/٢٠٨)`.

---

## W6 · Founder campaign (٢١٨ — dates gate G2)

### Task 6.1: Campaign setting and automatic grant at signup

**Files:**
- Create: `supabase/migrations/20261019_50_founder_campaign.sql`
- Create: `supabase/tests/rls/founder_campaign.test.sql`
- Modify: `_verify.sql`, `src/app/api/v1/admin/settings/route.ts:6-14` (allowlist `founder_campaign`)

**Interfaces:**
- Consumes `library_access_grants` (T1.1) and the `lawyer_profiles` signup trigger (T2.1).
- `platform_settings` key `founder_campaign` with value `{"starts_on": "YYYY-MM-DD" | null, "ends_on": … | null, "library_days": 90}`, seeded with nulls.
- `public.founder_campaign_active(p_at timestamptz default now()) returns boolean` (Riyadh date, inclusive).
- AFTER INSERT trigger `trg_lawyer_profiles_founder` (SECURITY DEFINER): when active, insert a `library_access_grants` row (`'lib-founder'`, `'founder_campaign'`, `ends_at = now() + library_days`) and set `lawyer_profiles.metadata = metadata || '{"badges":["founder"]}'`. The grant fires once per user (guarded on an existing `lib-founder` row).

- [ ] **Step 1: Docker test:**
  - dates null → no grant;
  - dates around today → a grant of 90 days and the badge;
  - dates in the past → none;
  - a second profile insert for the same user → no second grant;
  - negative control.
- [ ] **Step 2–4:** red, migration, green.
- [ ] **Step 5: `_verify` section** and commit `feat(campaign): the founder campaign grants 3 months of library and the founder badge at signup, while its dates are set (owner ٢١٨)`.

### Task 6.2: Banner, admin dates, badge

**Files:**
- Create: `src/app/api/v1/campaigns/active/route.ts` (public GET, `Cache-Control: public, max-age=300`)
- Modify:
  - `src/components/pricing/PromotionalCampaignBanner.tsx` (fetch the route; fall back to code `CAMPAIGNS`)
  - `src/lib/pricing/campaigns.ts` (`founderCampaignFromSetting(value, today): Campaign | null`)
  - admin settings page (two date fields)
  - lawyer profile pages (a «المحامي المؤسس» badge when `metadata.badges` includes `founder`)
- Test: `src/lib/pricing/campaigns.test.ts`

**Interfaces:** `founderCampaignFromSetting` returns the copy:
- `badgeAr`: «فترة المحامي المؤسس»
- `messageAr`: «سجّل الآن واحصل على ٣ أشهر من المكتبة القانونية مجاناً وشارة المؤسس»
- `ctaAr`: «سجّل محامياً»
- `ctaHref`: `/register/provider?type=lawyer`

It returns null outside the dates or with nulls.

- [ ] **Step 1: Tests:** null dates → null; inside → the campaign; the day after `ends_on` → null; Riyadh midnight boundary.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(campaign): founder banner and badge from the admin-set dates`.

---

## W7 · Small items and honesty (٢١١, ٢١٢, ٢١٤, ٢١٥, 4 Oct 59/99/129, ١١٥)

### Task 7.1: The 81 documents' type (٢١١)

**Files:**
- Modify:
  - `scripts/parsers/schema_manifest.json` (`enums.type` += «دليل إرشادي / تنظيم إداري»; bump the manifest version; note that the governing copy under `00_عقل_القوانين` must match)
  - `src/app/laws/data.ts:130-142`, `src/constants/lawsLibraryData.ts:40-56` (type lists)
- Tests: `scripts/parsers/parse-laws.rejected-enum.test.ts` (the new value is accepted, an unknown one is still rejected), `src/app/laws/page-numbered-guides.test.ts`

- [ ] **Step 1–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(library): «دليل إرشادي / تنظيم إداري» is an accepted type (owner ٢١١)`.
- [ ] **Step 6: W9 run order:** the user runs the held `supabase/one-time/2026-10-17_q102_page_numbered_documents.sql` after the deploy. The owner's agent may then write the type in his files.

### Task 7.2: LAW-00-1150 in force (٢١٢)

**Files:**
- Create: `supabase/one-time/2026-10-19_law_00_1150_in_force.sql` (preview; `update library.laws set status = 'active' where slug = 'regulation-364-5-30-1430-11-02' and status <> 'active'`; verify 1 row)

The owner report tells his library agent to set `status: active` in the source file, because a reload would undo the SQL.

- [ ] **Step 1:** Docker test on a fixture row (one update; idempotent). **Step 2:** commit `chore(owner-212): لائحة التفتيش القضائي ١٤٣٠هـ marked in force`.

### Task 7.3: Live counts wording (٢١٤, ٢١٥)

**Files:**
- Modify: `src/app/dashboard/admin/users/page.tsx:779-803` (label `الكل (${countTileAr(n)})`), `src/app/blog/page.tsx:212-216` (the «الكل» pill uses the exact total from `/api/v1/blog`, not the sum of categories, which skips blank categories)
- Test: `src/app/blog/blogCounts.test.ts` (a pure `allPillCount(total, categoryCounts)` returns `total`)

- [ ] **Step 1–4:** red, implement, green. **Step 5:** commit `fix(counts): «الكل (N)» and the blog total are the live numbers (owner ٢١٤/٢١٥)`.

### Task 7.4: Item 59 — duration, assignee, document source

**Files:**
- Modify:
  - `src/app/api/v1/lawyer/hearings/route.ts` (return `duration_minutes`)
  - `src/app/dashboard/lawyer/hearings/page.tsx:395` (column «مدة الجلسة»)
  - `src/app/api/v1/lawyer/tasks/route.ts:105` (return `assignee_user_id` plus the display name)
  - the tasks page (column «المحامي المُكلَّف»)
  - the case documents tab `src/app/dashboard/lawyer/cases/[id]/page.tsx:352-361,1878-1890` (column «مصدر المستند»: upload «رفع» / generated «مُنشأ» / imported «مستورد» / contract_version «نسخة عقد»)
- Test: `src/lib/services/item59Labels.test.ts` (pure label maps and the minutes formatter `formatDurationAr(min)`: 90 → «ساعة و٣٠ دقيقة»)

- [ ] **Step 1–4:** red, implement, green. **Step 5:** commit `feat(lawyer): hearing duration, task assignee and document source columns (4 Oct item 59)`.

### Task 7.5: Item 99 — blog category pages

**Files:**
- Create: `src/app/blog/category/[slug]/page.tsx` (server; `generateStaticParams` from `src/app/blog/_categories.ts`; await `params`)
- Modify: `src/app/blog/page.tsx:187-216` (pills link to the routes), `src/app/sitemap.ts:113-162` (category URLs)
- Test: `src/app/blog/categoryRoutes.test.ts` (every category in `_categories.ts` has a slug; the sitemap source lists `/blog/category/`)

- [ ] **Step 1–4:** red, implement, green; type-check. **Step 5:** commit `feat(blog): a page per category, linked from the tabs and the sitemap (4 Oct item 99)`.

### Task 7.6: Item 129 — services mega menu

**Files:**
- Modify: `src/constants/navigation.navbar.ts:10-26` (group the service links into columns: «للأفراد», «للشركات», «للمحامين», «أدوات»), `src/components/Navbar.tsx:254-288,374-408` (a multi-column dropdown for «الخدمات», keyboard accessible, collapsed list on mobile)
- Test: `src/constants/navigation.navbar.test.ts` (every existing service href still appears exactly once; no group is empty)

- [ ] **Step 1–4:** red, implement, green. **Step 5:** commit `feat(nav): services mega menu (4 Oct item 129)`.

### Task 7.7: Honesty — tools that show canned output (١١٥)

**Files:**
- Modify (mark «قريباً» with the existing coming-soon component, or remove the fake numbers):
  - `src/app/ai/legal-translate`
  - `src/app/ai/analyze/_components/AttachmentSqueezer.tsx:143-212,323-330` (remove the canned report and its export to the collector)
  - `src/app/ai/transcriber` (verbatim mode)
  - `src/app/ai/mail-advisor` (the fake inbox and «قمنا بإنشاء بريد…»)
  - `src/app/ai/share-history` (read `/api/v1/share` or mark «قريباً»)
  - `src/app/ai/templates/_data.tsx:36,44` (remove the usage counters)
  - `src/app/ai/corp/{clm,corpmind,hr,compliance}`
  - `src/app/ai/najiz-optimizer/page.tsx:154-160` (drop the fake 1.2s "AI" delay; call it a text cleaner)
  - `src/app/ai/compare`
  - admin `system/backup/page.tsx:7,31,40-42`, `system/page.tsx:7`, `reports/page.tsx:20-32`
- Delete: `src/hooks/useDraftState.ts:193-198` (the unstored share link) and its dead consumer `src/components/draft/steps/StepApproval.tsx` if still unimported.
- Test: `src/lib/services/cannedOutputGate.test.ts` — each listed page's source no longer contains its canned constant, and either renders the coming-soon marker or reads a real API.

- [ ] **Step 1–4:** red, implement, green; type-check. **Step 5:** commit `fix(honesty): AI tools and admin pages that showed canned output say «قريباً» (owner ١١٥)`.

---

## W8 · Points ledger, switched off (١٩٩, ٢٠٦ — gate G4)

### Task 8.1: Ledger, balance and debit RPC

**Files:**
- Create: `supabase/migrations/20261019_60_points_ledger.sql`
- Create: `supabase/tests/rls/points_ledger.test.sql`
- Modify: `_verify.sql`

**Interfaces:**
- `public.points_balances`:
  - columns: `user_id uuid pk references auth.users on delete cascade`, `balance integer not null default 0 check (balance >= 0)`, `updated_at`;
  - owner reads own; service writes.
- `public.points_ledger`:
  - columns: `id`, `user_id`, `delta integer not null`, `reason text not null check (reason in ('grant','monthly','purchase','usage','refund','admin_adjustment','wipe'))`, `tool text`, `ref text`, `balance_after integer not null`, `created_at`;
  - owner reads own; service writes.
- `public.debit_points(p_user uuid, p_amount integer, p_tool text, p_ref text) returns integer`: SECURITY DEFINER, `search_path ''`, EXECUTE for service_role only. It is atomic (`update … where balance >= p_amount returning`), raises `P0001 'insufficient_points'`, and writes the ledger.
- `public.credit_points(p_user, p_amount, p_reason, p_ref)` likewise.
- `platform_settings` key `points_enforcement` = `false`.

- [ ] **Step 1: Docker test:**
  - a debit lowers the balance and writes one ledger row;
  - a debit above the balance raises and changes nothing;
  - a debit of exactly the balance leaves 0, and the next debit of 1 raises (the harness is single-session, so the race is covered by the shape: `pg_get_functiondef` shows one conditional `update … where balance >= p_amount`, and the `balance >= 0` CHECK is the backstop);
  - anon/authenticated cannot execute;
  - owner read only;
  - negative control.
- [ ] **Step 2–4:** red, migration, green.
- [ ] **Step 5: `_verify` section** and commit `feat(points): ledger, balances and atomic debit — enforcement off (owner ١٩٩/٢٠٦)`.

### Task 8.2: `chargePoints`, wired to the library assistant for non-Pro subscribers

**Files:**
- Create: `src/lib/points/chargePoints.ts`
- Create: `src/lib/points/chargePoints.test.ts`
- Modify: `src/app/api/ai/_libraryAiAccess.ts`, `src/app/api/ai/library-chat/route.ts:52`

**Interfaces:**
- `export async function chargePoints(input: { userId: string; tool: string; amount: number; ref: string }): Promise<{ charged: boolean; balance: number | null } | { error: 'insufficient_points' }>` — reads `points_enforcement`. When it is false, it returns `{ charged: false, balance: null }` without calling the RPC.
- The assistant: when enforcement is ON and the caller has a library grant but is below Pro, `libraryAiDecision` → `'charge'` with amount 1. A 402 `{ error: 'رصيد النقاط لا يكفي' }` comes back on insufficient points. With enforcement off the behaviour stays exactly as T1.4.

- [ ] **Step 1: Tests:**
  - enforcement off → no RPC call, decision unchanged;
  - on with a library-only user → one debit of 1;
  - insufficient → 402;
  - Pro → no debit.
- [ ] **Step 2–4:** red, implement, green.
- [ ] **Step 5: Commit** `feat(points): chargePoints and the assistant's per-question charge, both inert until points_enforcement is on`.

---

## W9 · Ship

### Task 9.1: Owner documents, run order, merge, deploy, verify

**Files:**
- Create: `تقرير_للمالك_٢٠٢٦-١٠-١٩.md` (standalone Arabic report; every item «بانتظار النشر»)
- Modify: `أسئلة_المالك_٢٠٢٦-١٠-١٦.md` (mark ١٩٩–٢٢٣ answered; new ٢٢٤–٢٢٩ = G1–G6 with defaults)
- Create: `docs/plans/2026-10-19-owner-decisions-run-order.md`

- [ ] **Step 1:** Full checks — unit suite, type-check, lint (0 errors), every new Docker test plus its negative control, the `_verify` sections tested before and after, and a local webpack build (`npx next build --webpack`; the four known extra-export flags only).
- [ ] **Step 2:** `detect_changes({scope:"compare", base_ref:"main"})` and review.
- [ ] **Step 3:** Write the report, the questions and the run order. The run order:
  - **any time:** W1 `_10`, W2 `_20`, W3 `_30`, W8 `_60`;
  - **then the deploy;**
  - **after the deploy:** W4 `_40` (the decree route must stop using `*` first), W4 `_41`, W6 `_50`;
  - **then** `_verify`;
  - **then the held one-time SQL:** q102 (T7.1), LAW-00-1150 (T7.2), and the wipe (T1.7) only after G1.
- [ ] **Step 4:** Merge to main and push (fast-forward the main folder; never touch its untracked files). Do not sync `owner-edits`.
- [ ] **Step 5:** After the user deploys and runs the SQL, check live from outside:
  - anon `decrees_circulars?select=preamble` → 401;
  - a guest decree → 200 with no preamble;
  - laws search «الدعوى» and «من» answer;
  - `/api/v1/campaigns/active` → null.
  Then flip the report items to «نُفِّذ ✓» and commit.
