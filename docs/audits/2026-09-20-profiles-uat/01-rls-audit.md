# 01 — DB / RLS audit (UAT-SEC-001, UAT-SUB-001, UAT-STORAGE-001, UAT-TEAM-001, UAT-BIZ-001, UAT-COST-001)

> Audit date 2026-09-20 against the owner's technical package `nzamy-developer-test-نهائي-2026-09-20/web/` (71 migrations, last `20260919_*`).
> Paths below are relative to that `web/` folder. Migrations are applied in **filename (lexicographic) order** — that ordering matters to several findings.

---

## 1. UAT-SEC-001 (P0) — foreign `public.profiles` row readable by any authenticated user

### Every policy ever created on `public.profiles`, chronologically

| # | File:line | Statement | Expression |
|---|---|---|---|
| 1 | `supabase/migrations/20260603_phase1_001_profiles.sql:64` | `alter table public.profiles enable row level security;` | — |
| 2 | `…20260603_phase1_001_profiles.sql:66-68` | `create policy "users read own profile" on public.profiles for select` | `using (id = auth.uid())` |
| 3 | `…20260603_phase1_001_profiles.sql:70-77` | `create policy "admins read all profiles" for select` | `using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))` — self-referential |
| 4 | `…20260603_phase1_001_profiles.sql:79-82` | `create policy "users update own profile" for update` | `using (id = auth.uid()) with check (id = auth.uid())` |
| 5 | `supabase/migrations/20260625_fix_rls_recursion.sql:31` | `DROP POLICY IF EXISTS "admins read all profiles" ON public.profiles;` | replaces #3 |
| 6 | `…20260625_fix_rls_recursion.sql:34-36` | `CREATE POLICY "admins read all profiles" ON public.profiles FOR SELECT` | `USING (public.is_admin())` |

`public.is_admin()` — `…20260625_fix_rls_recursion.sql:16-26`:
```sql
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND user_type = 'admin');
$$;
```

**That is the complete set** (verified with a multiline regex over the whole `supabase/` tree). Other migrations touch `public.profiles` only with `ALTER TABLE … ADD COLUMN` (`20260616_production_readiness_fixes.sql:16`, `20260827_signup_contact_fields.sql:108`, `20260906_phase6_settings_out_of_browser.sql:122`) and the `trg_lock_user_type` BEFORE UPDATE trigger (`20260716_security_hardening.sql:152-155`).

### Conclusion: there is no permissive policy on `public.profiles` anywhere in the repository

Ruled out: no `using (true)` on profiles (the only `using (true)` policies are on unrelated tables and the `library.*` loop in `20260626_legal_library_schema.sql:790-795`); no `disable row level security` anywhere; no broad grants to `anon`/`authenticated` on `public`; no view or SECURITY DEFINER RPC that returns `public.profiles` rows. The UAT harness (`scripts/uat/verify-auth-and-profile-rls.ps1`) uses the anon key + a password-grant user JWT — not the service key. The leak is real.

**So the responsible SQL is not in the repo.** The live DB must have either (a) RLS turned off on `public.profiles`, or (b) an out-of-band policy (Dashboard "Enable read access for all users", i.e. `for select to public using (true)`) that no migration created or drops. Evidence supports "everything visible": `evidence/uat-20260915/auth-and-profile-rls.json` shows `"foreignProfileHidden": 0` for **all 47** actors — including the admin actor.

### Lawyer public directory mechanism (`/lawyers/[slug]`)
No column-subset view. The directory bypasses RLS with the service-role key and an explicit column allow-list:
- `src/app/api/v1/lawyers/route.ts:54` — `createServiceClient()`; projection at lines 68-73 excludes `phone`/`email`; gates on `user_type='lawyer'`, `lawyer_profiles.verification_status='verified'`, `marketplace_visible=true`.
- `src/app/api/v1/lawyers/[id]/route.ts:182,188-194` — same pattern, resolves by UUID or `lawyer_profiles.slug`.
- The table-level public-read subset that exists is on `public.lawyer_profiles`: `20260603_phase1_001_profiles.sql:127-129` `"public read verified lawyers"`.

**Therefore no legitimate need exists for any public read on `public.profiles`.**

---

## 2. UAT-SUB-001 (P0) — user could INSERT and `PATCH tier='max'` on `subscriptions`

`supabase/migrations/20260603_phase1_003_subscriptions_billing.sql`
- `:167` RLS enabled
- `:185-187` `"users read own subscriptions"` SELECT `using (user_id = auth.uid())`
- `:189-191` `"users create own subscriptions"` INSERT `with check (user_id = auth.uid())` ← mint primitive
- `:193-196` `"users update own subscriptions"` UPDATE ← self-upgrade primitive (nothing constrains `tier`)

Related tables in the same file: `credit_transactions` (`:204`, `:208` — users can INSERT their own credit transactions too), `coupons`, `coupon_usage`, `promo_links`, `escrow_transactions`. No `subscription_history` / `entitlements` tables exist.

`supabase/migrations/20260906_fix_subscriptions_rls_security.sql` (whole file):
```sql
begin;
alter table public.subscriptions enable row level security;
drop policy if exists "users create own subscriptions" on public.subscriptions;
drop policy if exists "users update own subscriptions" on public.subscriptions;
drop policy if exists "users read own subscriptions" on public.subscriptions;
create policy "users read own subscriptions"
  on public.subscriptions for select using (user_id = auth.uid());
commit;
```
Correct *if applied* (no permissive policy ⇒ deny). `evidence/uat-20260915/subscription-rls.json` (`persistedTier:"max"`) proves **20260906 was not deployed** at UAT time. It issues no `REVOKE`, so the table-level `GRANT INSERT/UPDATE` to `authenticated` remains — any future stray policy re-opens the hole.

Intended write path: application-level, service-role only — `src/lib/entitlements.ts:15,107,117`; `entitlement_requests` (`20260706_entitlement_requests.sql`) records only the ask; admin routes under `src/app/api/v1/admin/subscriptions/`.

---

## 3. UAT-STORAGE-001 (P0) — user B could download and delete `documents/<A-uid>/…`

Policies live **only in the side file** `supabase/storage_policies_documents.sql` (4 policies on `storage.objects`, all `to authenticated`, `bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]`). Header (lines 4-10): deliberately outside `migrations/` because `storage.objects` is owned by `supabase_storage_admin` and `db push` / SQL Editor fail with `42501`.

Migrations touching storage: `20260628_documents_upload.sql:15-17` creates the bucket (`public=false`); lines 28-49 are the four policies **commented out**. `20260629_payments_and_storage_policies.sql:15-21` says they were removed. → **The bucket is created by a migration while its RLS is a manual Dashboard step** (`APPLY_MIGRATIONS_GUIDE.md` STEP 2b). `evidence/uat-20260915/document-storage-isolation.json` (foreign download + delete both HTTP 200) shows that step was never done — a private bucket with zero policies denies everything, so what is live is a permissive policy (most likely a Dashboard "allow authenticated" rule).

Path convention: `<uid>/…` — `src/lib/services/documentService.ts:384`, `src/app/api/v1/documents/[id]/copy/route.ts:85`, `src/lib/services/articleNotesService.ts:87`, `src/lib/services/contractsService.ts:257`. So `(storage.foldername(name))[1] = auth.uid()::text` is exactly right. Non-owner downloads go through service-role signed URLs after a row-level check (`…/service-requests/[id]/deliverable/route.ts:98`, `…/attachments/[attachmentId]/route.ts:94`, `…/client/contracts/[id]/versions/[vid]/url/route.ts:60`). Share model (`20260909_document_shares_hashes.sql`) is service-role verified (`src/app/api/v1/share/[token]/verify/route.ts:96`) and needs no cross-user storage policy.

---

## 4. UAT-TEAM-001 (P1) — `42P17 infinite recursion` on the four `*_members` tables

### Recursive shapes
**(a) Self-reference** — `20260603_phase1_002_entities.sql`, restated in `20260616_entities_setup_and_rls_fix.sql:394-402` (firm), `:475-483` (business), `:556-565` (government), `:637-646` (ngo): `"X_members: active members can read co-members"` whose USING selects from `X_members`.

**(b) Mutual cycle `X_members ↔ X_profiles`** — `20260616…`: `"firm_profiles: members can read their firm"` (`:354-363`) reads `firm_members`; `"firm_members: firm owner can read all members"` (`:384-392`) reads `firm_profiles`. Mirrored for business (`:435-444` / `:465-473`), government (`:516-525` / `:546-554`), ngo (`:597-606` / `:627-635`).

### What `20260903_phase2` fixed
`20260903_phase2_clients_and_firm_membership.sql:283-292` creates `public.is_active_firm_member(p_firm uuid)` (security definer, `search_path=''`) and replaces only the co-members policy; `:296-334` does the same for business/government/ngo inside a `to_regclass(...)` guard — creating `is_active_business_member(p_business uuid)`, `is_active_government_member(p_gov uuid)`, `is_active_ngo_member(p_ngo uuid)`. **Leaves cycle (b) untouched** — which is why UAT still saw `42P17` on all four tables (`entity-membership-rls.json`, 11/11 HTTP 500).

### The two 20260916 files — and two blocking bugs
`20260916_fix_all_entities_rls_infinite_recursion.sql` creates 8 helpers `is_business_owner(p_business_id)`, `is_active_business_member(p_business_id)`, `is_government_owner(p_gov_id)`, `is_active_government_member(p_gov_id)`, `is_ngo_owner(p_ngo_id)`, `is_active_ngo_member(p_ngo_id)`, `is_firm_owner(p_firm_id)`, `is_active_firm_member(p_firm_id)` (lines 27, 35, 80, 88, 133, 141, 186, 194) and rewrites ~24 policies. `20260916_fix_firm_profiles_and_members_rls_recursion.sql:15` creates `is_firm_owner(p_firm uuid)` and rewrites 5 firm policies.

> **BLOCKER 1 — `20260916_fix_all_entities…` cannot execute.** `CREATE OR REPLACE FUNCTION` cannot rename an input parameter. 20260903 created the four `is_active_*_member` helpers with `p_firm/p_business/p_gov/p_ngo`; 20260916 re-declares them with `p_firm_id/…` ⇒ `ERROR 42P13: cannot change name of input parameter`. The file is `begin; … commit;` so **the whole migration rolls back**. The two 20260916 files also disagree (`is_firm_owner(p_firm_id)` vs `is_firm_owner(p_firm)`) — whichever runs second hits the same 42P13.

> **BLOCKER 2 — policy-name mismatches leave old recursive policies in place** (`DROP POLICY IF EXISTS` on a never-used name is a silent no-op; policies are OR-combined):

| Live policy name (20260603/20260616) | Name 20260916 tries to drop | Result |
|---|---|---|
| `firm_profiles: members can read their firm` (`20260616:354`) | `…their org` | survives — recursive |
| `business_profiles: members can read their org` (`:435`) | `…their business` | survives — recursive |
| `business_members: org owner can read all members` (`:465`) | `business owner can read all members` | survives — recursive |
| `business_members: org owner can insert` (`:486`) / `… can update` | `business owner can insert/update` | survive |
| `government_members: entity owner can read all` (`:546`) | `entity owner can read all members` | survives |
| `ngo_members: org owner can read all` (`:627`) | `org owner can read all members` | survives |
| `firm_members: firm owner can read all members` (`:384`) | identical | replaced |
| `government_profiles: members can read their entity` (`:516`) | identical | replaced |
| `ngo_profiles: members can read their org` (`:597`) | identical | replaced |
| all four `*_members: active members can read co-members` | identical | replaced (already by 20260903) |

### Verdict after applying all four files in order (even if Blocker 1 were fixed)
- `firm_members` — clean. `firm_profiles` — residual inline read of `firm_members` (fragile).
- **`business_members` / `business_profiles` — STILL RECURSIVE** (`business_members: org owner can read all members` ↔ `business_profiles: members can read their org`). 42P17 persists.
- `government_*` / `ngo_*` — cycle broken but residual policies inline the other table (one rename away from re-opening).
- `micro_profiles` — never affected (no members table).

Also: UAT ran 2026-09-15; both 20260916 files are dated after — intended fix, certainly **not deployed**.

---

## 5. UAT-BIZ-001 (P1) — `service_requests.business_id` missing (PGRST204/42703)

Added at `20260914_entity_memberships_and_business_requests.sql:9-11`. Evidence it is absent live: `deployed-migration-objects.json` → `42703`.

Object inventory of 20260914 (whole file `begin;…commit;`): column `service_requests.business_id` FK → `business_profiles(id)` on delete set null (9-11); index `idx_service_requests_business` (13-14); unique index `uq_business_members_business_user` (18-19); function `public.ensure_business_owner_membership()` plpgsql security definer `search_path=''` (21-36); trigger `trg_business_profiles_owner_membership` AFTER INSERT ON `business_profiles` (38-41); backfill INSERT…SELECT with `on conflict … do update` (43-47); policy `"business members read business service requests"` on `service_requests` FOR SELECT `using (business_id is not null and public.is_active_business_member(business_id))` (52-59).

Prerequisites: `service_requests` (20260518), `business_profiles` + `business_members` (20260603_phase1_002:253/311), **`public.is_active_business_member(uuid)`** — created only at `20260903_phase2…:299-304` inside a `to_regclass('public.business_members')` guard; if absent, 20260914 aborts at line 54. Does not need `handle_updated_at`.

---

## 6. UAT-COST-001 (P1) — `court_cost_notices`, `case_disbursements` missing

Created by `20260906_court_costs_and_firm_profile_fields.sql` (`begin;…commit;`): `firm_profiles` += `cr_number, unified_number_700, managing_partner_name, managing_partner_license` (7-11); `lawyer_profiles` += `bar_membership_number` (13-14); enums `court_cost_kind`, `sadad_status`, `disbursement_recovery_status` (26-38, guarded); table `court_cost_notices` (40-72, incl. statutory-cap CHECK); table `case_disbursements` (74-104, generated `vat_treatment`); 4 indexes; 2 updated_at triggers; RLS + 4 policies (128-182) using `public.is_admin()`.

Prerequisites: `public.cases` (20260518:66-76), `service_requests`, `firm_profiles`/`lawyer_profiles`, `public.handle_updated_at()` (20260603_phase1_001:12), **`public.is_admin()`** (20260625:16).

> Design flag: both new tables FK to `public.cases`, but `20260903_phase1_case_tables.sql:36-42` documents `public.cases` has ZERO INSERTs anywhere in the repo — the real case file is `service_requests`. Applying the migration fixes `PGRST205` but does not make court-cost entry reachable. Raise with owner (also listed in 02_تعليمات §7-أ).

---

## 7. Migration tooling
- No `supabase/config.toml` (CLI not linked). No npm `db:*`/`migrate` script. Method per `supabase/APPLY_MIGRATIONS_GUIDE.md`: manual paste into Dashboard SQL Editor, one file at a time, in order. Root README §6 allows "the team's installed runner" or `supabase db push` after linking staging, stopping at first SQL error.
- `deploy.sh` is referenced (`_verify.sql:2`, `one-time/2026-09-02_clear_test_data.sql:5`) but **missing from the package**; it exists in the developer's root repo.
- No `schema_migrations` tracking table — nothing records which files landed (hence `deployed-migration-objects.json` probes objects).
- Naming: `YYYYMMDD_<snake_case>.sql`, lexicographic; leading underscore excludes a file from `db push` (`_verify.sql`). Same-day files order by suffix (`20260916_fix_all…` runs before `20260916_fix_firm…`).
- `_verify.sql` asserts 7 things; **nothing about profiles/subscriptions/storage/member policies**.

## 8. Existing RLS tests (to extend)
Harness `supabase/tests/rls/run.sh <migration.sql> [more…] <test.sql>` — throwaway Postgres in Docker, applies migrations in order, then assertions via `psql -v ON_ERROR_STOP=1`. `stubs.sql:10-17` stubs `public.profiles` with exactly one correct policy (`own profile`), `:20-23` stubs `is_admin()`, `:41-58` reproduces the pre-fix 20260616 `firm_members` policies **including the self-referential one**, `:281-287` role `app_user`; impersonation via `set_config('test.uid', …)`.

| File | Asserts |
|---|---|
| `phase2_clients_and_membership.test.sql` | T10 firm-owner auto-membership; T0 owner sees 2 members; **T0b member reads co-members without recursion**; outsider sees 0; T1–T3 `lawyer_clients` isolation; T7 firm case read via membership; T11–T12 notes + suspended member. **Covers `firm_members` only.** |
| `phase7_profile_services_reviews.test.sql` | 5 new `lawyer_profiles` columns; slug own/unique/format/reserved; B cannot touch A's profile (write side, `lawyer_profiles`); services visibility; reviews once per completed request; stats view. |
| `phase3_…`, `phase5_…`, `phase6_…`, `case_notes`, `community_reports`, `document_shares_hashes`, `business_case_stages_no_requester_access` | see file headers |

**Gaps:** zero tests for `public.profiles` cross-user *read*; zero for `subscriptions`; zero for `business_members`/`government_members`/`ngo_members`; zero for `storage.objects`.

---

## Recommended new migrations (deploy order A → B → C → D → E; staging with restored snapshot first)

### (A) profiles lockdown — UAT-SEC-001
Discover first (read-only):
```sql
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr, polroles::regrole[]
  from pg_policy where polrelid = 'public.profiles'::regclass order by polname;
select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass;
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema='public' and table_name='profiles';
```
Migration (idempotent; drops any policy name not in the sanctioned three):
```sql
begin;
alter table public.profiles enable row level security;
do $$
declare p record;
begin
  for p in select polname from pg_policy
            where polrelid = 'public.profiles'::regclass
              and polname not in ('users read own profile','admins read all profiles','users update own profile')
  loop
    execute format('drop policy %I on public.profiles', p.polname);
  end loop;
end $$;
drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile" on public.profiles for select
  to authenticated using (id = auth.uid());
drop policy if exists "admins read all profiles" on public.profiles;
create policy "admins read all profiles" on public.profiles for select
  to authenticated using (public.is_admin());
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles for update
  to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke select, insert, update, delete on public.profiles from anon;
commit;
```
[unverified] whether any live code path relies on an anon read of `profiles` — the lawyer directory does not (service client). Grep anon-key client usage before shipping the `revoke`.

### (B) subscriptions writes service-role only — UAT-SUB-001
Deploy `20260906_fix_subscriptions_rls_security.sql` as-is, then belt-and-braces:
```sql
begin;
alter table public.subscriptions enable row level security;
revoke insert, update, delete on public.subscriptions from authenticated, anon;
revoke insert, update, delete on public.credit_transactions from authenticated, anon;
drop policy if exists "users create own credit transactions" on public.credit_transactions;
commit;
```
[unverified] whether any non-admin route inserts `credit_transactions` with a user-scoped client — `src/lib/entitlements.ts:193` uses the service client; confirm before dropping.

### (C) storage `documents` owner-only — UAT-STORAGE-001
Cannot run as a normal migration (42501). Apply `supabase/storage_policies_documents.sql` as `supabase_storage_admin` / via Dashboard, **after removing whatever permissive policy is live** (build the drop list from `select polname from pg_policy where polrelid='storage.objects'::regclass` — do not guess). Add a deploy assertion that the expected 4 policies exist.

### (D) entity recursion fix — UAT-TEAM-001 (**replaces both 20260916 files; do not deploy them as written**)
Two things must change vs 20260916: keep 20260903's parameter names (`p_firm`, `p_business`, `p_gov`, `p_ngo`) and simply `CREATE OR REPLACE` bodies (no DROP, no CASCADE), and drop the old policies by their **real** names:
```sql
drop policy if exists "firm_profiles: members can read their firm"        on public.firm_profiles;
drop policy if exists "business_profiles: members can read their org"     on public.business_profiles;
drop policy if exists "business_members: org owner can read all members"  on public.business_members;
drop policy if exists "business_members: org owner can insert"            on public.business_members;
drop policy if exists "business_members: org owner can update"            on public.business_members;
drop policy if exists "government_members: entity owner can read all"     on public.government_members;
drop policy if exists "ngo_members: org owner can read all"               on public.ngo_members;
```
Then re-create every policy from `20260916_fix_all_entities…` (lines 45-231) using only helper calls / `user_id = auth.uid()`. If `DROP FUNCTION … CASCADE` is used anywhere, enumerate dependents first: `select polrelid::regclass, polname from pg_policy where pg_get_expr(polqual,polrelid) like '%is_active_%member%'` — notably `"business members read business service requests"` (20260914:54) must be re-created. Neutralise both 20260916 files so nobody runs them and mistakes a rolled-back transaction for success.

### (E) Deploy 20260914 and 20260906 — UAT-BIZ-001 / UAT-COST-001
No SQL change. Preflight:
```sql
select to_regprocedure('public.is_active_business_member(uuid)') is not null as biz_helper;
select to_regprocedure('public.is_admin()') is not null as is_admin;
select to_regprocedure('public.handle_updated_at()') is not null as upd_fn;
select to_regclass('public.cases') is not null as cases_tbl;
```
Order: 20260903_phase2 (helper) → (D) → 20260914. Add the new objects to `_verify.sql`.

### (F) Test coverage to add under `supabase/tests/rls/`
- `profiles_cross_user_read.test.sql` — A reads own (1), A reads B (0), admin reads both, anon reads 0. Requires loading the **real** profile policies instead of the hand-written stub in `stubs.sql:17`.
- `subscriptions_write_guard.test.sql` — run `20260603_phase1_003` then `20260906_fix…` (+ B); assert A's INSERT fails, A's `update … set tier='max'` affects 0 rows, A reads own = 1, B = 0.
- `entity_members_no_recursion.test.sql` — extend `phase2…` T0b to **all four** tables + mutual-cycle probes (`select count(*) from public.business_profiles` as member; `… from public.business_members` as owner). Migration chain `20260603_phase1_002 → 20260616 → 20260903_phase2 → 20260914 → (D)` so the test would have caught both 20260916 bugs.
