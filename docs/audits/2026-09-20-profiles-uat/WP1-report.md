# WP-1 report — database security & migrations

**Branch:** `wp1` · **Date:** 2026-09-20 · **Plan:** `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` §WP-1 A–F
**Evidence read first:** `01-rls-audit.md` (full) · `06-live-db-probe.md`
**Closes (pending staging proof):** UAT-SEC-001 · UAT-SUB-001 · UAT-STORAGE-001 · UAT-TEAM-001, and unblocks UAT-BIZ-001 / UAT-COST-001 / UAT-TENANT-003.

> **Revision 2 (2026-09-20, evening).** Rewritten after the independent review of waves 1-2 (`REVIEW-wave1-wp4-wp5.md` §B.3 and MUST FIX 1). Three things were wrong with revision 1, all of them the same mistake — this report was filed from `wp1` and never re-checked after `wp3` merged. (1) `20260921_04_profiles_phone_e164_check.sql` exists now; §2's order said "when it exists it goes between 6 and 7" and §4's rehearsal ran without it. It is in its plan §3 position in both, and the order is renumbered to nine steps. (2) The §4 rehearsal was **ad hoc** — the script was never committed, so nobody could re-run it after the merge, which is precisely why nobody noticed (1). It is now `supabase/tests/rls/rehearse-staging-order.sh`, and §4 carries a verbatim fresh run of it. (3) `_verify.sql` carried gates for `_01`, `_02`, `_03`, `20260906` and `20260914` and **none for `_04`**, so a bulk apply that silently skipped the phone migration still left `deploy.sh` green. It now gates `_04`, and also gates the three plan §3b files that must never be applied. §5 E and §6 risk 5 are updated to match.

> Nothing in this work package was applied to any live database. Everything below was executed against a throwaway **PostgreSQL 16.13** database on the local harness (`supabase/tests/rls/run-local.sh`, same contract as the Docker `run.sh`: fresh database per run, migrations in order, assertions as a non-superuser with RLS enforced, fails closed).

---

## 1. What was produced

| Item | File | State |
|---|---|---|
| A | `supabase/migrations/20260921_01_profiles_rls_lockdown.sql` | new |
| B | `supabase/migrations/20260921_02_subscriptions_write_revoke.sql` | new |
| C | `supabase/storage_policies_documents.sql` | rewritten (still a hand-applied side file) |
| D | `supabase/migrations/20260921_03_entity_rls_recursion_fix.sql` | new |
| E | `supabase/migrations/_verify.sql` | extended (deploy gates) |
| F | `supabase/tests/rls/profiles_cross_user_read.test.sql` | new |
| F | `supabase/tests/rls/subscriptions_write_guard.test.sql` | new |
| F | `supabase/tests/rls/entity_members_no_recursion.test.sql` | new |
| F | `supabase/tests/rls/prelude_profiles_rls_chain.sql` · `prelude_profiles_leak_injection.sql` · `prelude_entity_rls_chain.sql` · `prelude_entity_recursion_defect_proof.sql` | new (chain steps, not migrations) |
| F | `supabase/tests/rls/stubs.sql` | extended |

No existing migration was edited. No file was deleted. The three `_superseded_` / `_staging_only_` files were left untouched.

---

## 2. Staging apply order (plan §3)

Back up first. The runner stops at the first SQL error; every file below is `begin;…commit;` or idempotent, so a stop leaves the database in the state before that file.

```
1.  supabase/migrations/20260906_court_costs_and_firm_profile_fields.sql     # UAT-COST-001
2.  supabase/migrations/20260906_fix_subscriptions_rls_security.sql          # UAT-SUB-001 (policy half)
3.  supabase/migrations/20260914_entity_memberships_and_business_requests.sql# UAT-BIZ-001 / UAT-TENANT-003
4.  supabase/migrations/20260921_01_profiles_rls_lockdown.sql                # UAT-SEC-001
5.  supabase/migrations/20260921_02_subscriptions_write_revoke.sql           # UAT-SUB-001 (grant half)
6.  supabase/migrations/20260921_03_entity_rls_recursion_fix.sql             # UAT-TEAM-001
7.  supabase/migrations/20260921_04_profiles_phone_e164_check.sql            # UAT-REG-002  ⓡ2
8.  supabase/storage_policies_documents.sql   ← NOT a migration: run as
                                                 supabase_storage_admin / Dashboard   # UAT-STORAGE-001
9.  supabase/migrations/_verify.sql            ← read-only; raises if 1–8 left a gap
```

ⓡ2 Step 7 was written on `wp3` (plan §3d #4) and was not part of this branch when revision 1 was filed. It is merged, and it goes exactly where plan §3 puts it: after `_03`, before the storage side file. `_verify.sql` (step 9) now raises if it was skipped — see §5 E.

`20260827_signup_contact_fields.sql` is applied **only** if the WP-0 inventory shows `handle_new_user` does not already carry the phone column (plan WP-1 E).

### 2a. Preflight — run these read-only queries before step 1 and keep the output

```sql
-- prerequisites the files in the order above assume
select to_regprocedure('public.is_admin()')                        is not null as is_admin_fn;        -- 1, 3, 6
select to_regprocedure('public.handle_updated_at()')               is not null as upd_fn;             -- 1
select to_regclass('public.cases')                                 is not null as cases_tbl;          -- 1
select to_regprocedure('public.is_active_business_member(uuid)')   is not null as biz_member_fn;      -- 3 aborts without it
select to_regclass('public.service_requests')                      is not null as service_requests;   -- 1, 3

-- the parameter names 20260921_03 depends on (CREATE OR REPLACE cannot rename them;
-- the wrong name here is what makes _superseded_20260916_fix_all_entities… die with 42P13)
select p.proname, pg_get_function_arguments(p.oid) as args
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_active_firm_member','is_active_business_member',
                     'is_active_government_member','is_active_ngo_member',
                     'is_firm_owner','is_business_owner','is_government_owner','is_ngo_owner')
 order by 1;
-- EXPECT: the four is_active_*_member with p_firm / p_business / p_gov / p_ngo,
--         and NO is_*_owner rows (they are created by 20260921_03).

-- the defect record: what 20260921_01 is about to drop (audit 06 could not read this)
select polname, polcmd, polroles::regrole[] as roles,
       pg_get_expr(polqual, polrelid) as using_expr
  from pg_policy where polrelid = 'public.profiles'::regclass order by polname;
select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass;
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'profiles' order by 1, 2;

-- the defect record: what 20260921_02 is about to drop
select polname, polcmd from pg_policy
 where polrelid in ('public.subscriptions'::regclass, 'public.credit_transactions'::regclass)
 order by 1;

-- the defect record: the 42P17 shape, before and after step 6
select c.relname, pol.polname, pg_get_expr(pol.polqual, pol.polrelid) as using_expr
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
 where c.relname in ('firm_profiles','firm_members','business_profiles','business_members',
                     'government_profiles','government_members','ngo_profiles','ngo_members')
 order by c.relname, pol.polname;

-- the defect record: step 8 (ⓡ2 was step 7 in revision 1). KEEP THIS OUTPUT — it is the
-- only record of what is dropped.
select polname, polcmd, polroles::regrole[] as roles,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
  from pg_policy where polrelid = 'storage.objects'::regclass order by polname;
```

### 2b. Post-apply re-checks

Each migration ends with its own verify block, so a failure rolls the file back. After the whole order, `supabase/migrations/_verify.sql` must print ⓡ2 **23** rows and exit 0 (§5 below), and the two PostgREST probes that returned `42P17` on 2026-09-20 must return `200 []`:

```
GET /rest/v1/business_members?select=id&limit=1
GET /rest/v1/firm_members?select=id&limit=1
```

Then the UAT scripts listed under *Proof to close WP-1* in the plan.

---

## 3. Harness runs

Environment: `export PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres`. Every run below exited **0**; the runner fails closed (`set -euo pipefail`, `psql -v ON_ERROR_STOP=1`), and the test files deliberately do **not** set `ON_ERROR_STOP 0`, so every `raise exception` inside them fails the run.

### 3.1 UAT-SEC-001 — `profiles_cross_user_read.test.sql` · exit 0

```
bash supabase/tests/rls/run-local.sh \
  supabase/tests/rls/prelude_profiles_rls_chain.sql \
  supabase/migrations/20260603_phase1_001_profiles.sql \
  supabase/migrations/20260625_fix_rls_recursion.sql \
  supabase/tests/rls/prelude_profiles_leak_injection.sql \
  supabase/migrations/20260921_01_profiles_rls_lockdown.sql \
  supabase/tests/rls/profiles_cross_user_read.test.sql
```

```
── migration 1: prelude_profiles_rls_chain.sql ──
psql:supabase/tests/rls/prelude_profiles_rls_chain.sql:29: NOTICE:  drop cascades to 7 other objects
DETAIL:  drop cascades to constraint firm_profiles_owner_user_id_fkey on table firm_profiles
drop cascades to constraint firm_members_user_id_fkey on table firm_members
drop cascades to constraint reviews_reviewer_id_fkey on table reviews
drop cascades to constraint reviews_reviewee_id_fkey on table reviews
drop cascades to constraint research_sessions_user_id_fkey on table research_sessions
drop cascades to constraint admin_audit_events_actor_id_fkey on table admin_audit_events
drop cascades to constraint notifications_user_id_fkey on table notifications
── migration 2: 20260603_phase1_001_profiles.sql ──
── migration 3: 20260625_fix_rls_recursion.sql ──
── migration 4: prelude_profiles_leak_injection.sql ──
              set_config              
--------------------------------------
 aaaaaaaa-0000-0000-0000-000000000001
(1 row)

psql:supabase/tests/rls/prelude_profiles_leak_injection.sql:59: NOTICE:  DEFECT REPRODUCED (UAT-SEC-001): A reads B's profile row (foreign rows visible: 1, total rows visible: 4 of 4)
 set_config 
------------
 
(1 row)

── migration 5: 20260921_01_profiles_rls_lockdown.sql ──
psql:supabase/migrations/20260921_01_profiles_rls_lockdown.sql:94: NOTICE:  20260921_01: dropping unsanctioned policy on public.profiles: Enable read access for all users
psql:supabase/migrations/20260921_01_profiles_rls_lockdown.sql:177: NOTICE:  20260921_01 verify: OK — 3 sanctioned policies, RLS on, no anon DML grant
── tests (non-superuser, RLS on) ──
psql:supabase/tests/rls/profiles_cross_user_read.test.sql:44: NOTICE:  T1 PASS: the dynamic drop removed the unsanctioned policy; survivors = admins read all profiles · users read own profile · users update own profile
T1 policies on public.profiles (expect 3): 3
T2 A reads own profile (expect 1): 1
T2 A reads B's profile (expect 0): 0
T2 A reads the whole table (expect 1 — its own row): 1
psql:supabase/tests/rls/profiles_cross_user_read.test.sql:70: NOTICE:  T2 PASS: A sees no foreign profile row (UAT-SEC-001 closed for the leaking policy)
T3 B reads own profile (expect 1): 1
T3 B reads A's profile (expect 0): 0
T4 admin reads A and B (expect 2): 2
psql:supabase/tests/rls/profiles_cross_user_read.test.sql:92: NOTICE:  T4 PASS: admin reads all 4 rows via public.is_admin()
T5 B updated own display_name (expect 1): 1
psql:supabase/tests/rls/profiles_cross_user_read.test.sql:111: NOTICE:  T5 PASS: B's UPDATE of A's profile touched 0 rows

psql:supabase/tests/rls/profiles_cross_user_read.test.sql:124: NOTICE:  T6 PASS: anon SELECT on public.profiles refused (42501 — grant revoked)
policies: admins read all profiles[r] · users read own profile[r] · users update own profile[w]
anon DML grants on public.profiles (expect 0): 0
relrowsecurity (expect t): true
```

### 3.2 UAT-SUB-001 — `subscriptions_write_guard.test.sql` · exit 0

```
bash supabase/tests/rls/run-local.sh \
  supabase/migrations/20260603_phase1_003_subscriptions_billing.sql \
  supabase/migrations/20260906_fix_subscriptions_rls_security.sql \
  supabase/migrations/20260921_02_subscriptions_write_revoke.sql \
  supabase/tests/rls/subscriptions_write_guard.test.sql
```

```
── migration 1: 20260603_phase1_003_subscriptions_billing.sql ──
── migration 2: 20260906_fix_subscriptions_rls_security.sql ──
── migration 3: 20260921_02_subscriptions_write_revoke.sql ──
psql:supabase/migrations/20260921_02_subscriptions_write_revoke.sql:132: NOTICE:  20260921_02 verify: OK — no write policy and no write grant for authenticated/anon
── tests (non-superuser, RLS on) ──
T0 SELECT grants for authenticated+anon on subscriptions+credit_transactions (expect 4 — reads survive): 4
psql:supabase/tests/rls/subscriptions_write_guard.test.sql:65: NOTICE:  T1 PASS: A's INSERT into public.subscriptions refused (42501)
psql:supabase/tests/rls/subscriptions_write_guard.test.sql:81: NOTICE:  T2 PASS: A's UPDATE … set tier='max' refused (42501)
psql:supabase/tests/rls/subscriptions_write_guard.test.sql:96: NOTICE:  T3 PASS: A's DELETE refused (42501)
T4 A reads own subscription (expect 1): 1
T4 A's tier is unchanged (expect free): free
T4 B reads own subscription (expect 1): 1
psql:supabase/tests/rls/subscriptions_write_guard.test.sql:113: NOTICE:  T4 PASS: B sees none of A's subscriptions
psql:supabase/tests/rls/subscriptions_write_guard.test.sql:125: NOTICE:  T5 PASS: A's INSERT into public.credit_transactions refused (42501)
T5 A still reads own ledger (expect 1): 1
subscriptions policies: users read own subscriptions[r]
credit_transactions policies: users read own credit transactions[r]
INSERT/UPDATE/DELETE grants for authenticated+anon (expect 0): 0
```

### 3.3 UAT-TEAM-001 — `entity_members_no_recursion.test.sql` · exit 0

```
bash supabase/tests/rls/run-local.sh \
  supabase/tests/rls/prelude_entity_rls_chain.sql \
  supabase/migrations/20260616_entities_setup_and_rls_fix.sql \
  supabase/migrations/20260617_fix_remaining_rls.sql \
  supabase/migrations/20260903_phase2_clients_and_firm_membership.sql \
  supabase/migrations/20260914_entity_memberships_and_business_requests.sql \
  supabase/tests/rls/prelude_entity_recursion_defect_proof.sql \
  supabase/migrations/20260921_03_entity_rls_recursion_fix.sql \
  supabase/tests/rls/entity_members_no_recursion.test.sql
```

```
── migration 1: prelude_entity_rls_chain.sql ──
psql:supabase/tests/rls/prelude_entity_rls_chain.sql:36: NOTICE:  drop cascades to 2 other objects
DETAIL:  drop cascades to constraint case_stages_firm_id_fkey on table case_stages
drop cascades to constraint hearings_firm_id_fkey on table hearings
── migration 2: 20260616_entities_setup_and_rls_fix.sql ──
── migration 3: 20260617_fix_remaining_rls.sql ──
── migration 4: 20260903_phase2_clients_and_firm_membership.sql ──
── migration 5: 20260914_entity_memberships_and_business_requests.sql ──
── migration 6: prelude_entity_recursion_defect_proof.sql ──
              set_config              
--------------------------------------
 aaaaaaaa-0000-0000-0000-000000000001
(1 row)

psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:47: NOTICE:  DEFECT REPRODUCED (UAT-TEAM-001): select from public.firm_members → 42P17 infinite recursion
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:47: NOTICE:  DEFECT REPRODUCED (UAT-TEAM-001): select from public.business_members → 42P17 infinite recursion
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:47: NOTICE:  DEFECT REPRODUCED (UAT-TEAM-001): select from public.government_members → 42P17 infinite recursion
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:47: NOTICE:  DEFECT REPRODUCED (UAT-TEAM-001): select from public.ngo_members → 42P17 infinite recursion
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:66: NOTICE:  before 20260921_03: select from public.firm_profiles → 42P17 infinite recursion detected in policy for relation "firm_profiles"
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:66: NOTICE:  before 20260921_03: select from public.business_profiles → 42P17 infinite recursion detected in policy for relation "business_profiles"
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:66: NOTICE:  before 20260921_03: select from public.government_profiles → 42P17 infinite recursion detected in policy for relation "government_profiles"
psql:supabase/tests/rls/prelude_entity_recursion_defect_proof.sql:66: NOTICE:  before 20260921_03: select from public.ngo_profiles → 42P17 infinite recursion detected in policy for relation "ngo_profiles"
 set_config 
------------
 
(1 row)

── migration 7: 20260921_03_entity_rls_recursion_fix.sql ──
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all business_members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read business members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: active members can read co-members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: member can read own membership" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: org owner can insert" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: org owner can read all members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: org owner can update" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all business_profiles" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read business profiles" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: members can read their org" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: owner can insert" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: owner can read own" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: owner can update" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all firm_members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read firm members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: active members can read co-members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can insert" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can read all members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can update" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: member can read own membership" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all firm_profiles" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read firm profiles" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: members can read their firm" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: owner can insert" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: owner can read own firm" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: owner can update" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all government_members" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read government members" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: active members can read co-members" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: entity owner can insert" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: entity owner can read all" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: entity owner can update" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: member can read own membership" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all government_profiles" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read government profiles" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: members can read their entity" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: owner can insert" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: owner can read own" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: owner can update" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all ngo_members" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read ngo members" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: active members can read co-members" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: member can read own membership" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: org owner can insert" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: org owner can read all" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: org owner can update" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all ngo_profiles" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read ngo profiles" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: members can read their org" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: owner can insert" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: owner can read own" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: owner can update" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:305: NOTICE:  20260921_03: firm — 3 policies on firm_profiles, 4 on firm_members, helpers is_active_firm_member/is_firm_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:373: NOTICE:  20260921_03: business — 3 policies on business_profiles, 4 on business_members, helpers is_active_business_member/is_business_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:441: NOTICE:  20260921_03: government — 3 policies on government_profiles, 4 on government_members, helpers is_active_government_member/is_government_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:509: NOTICE:  20260921_03: ngo — 3 policies on ngo_profiles, 4 on ngo_members, helpers is_active_ngo_member/is_ngo_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:609: NOTICE:  20260921_03 verify: OK — matrix in place, no policy on the eight tables reads any of them inline
── tests (non-superuser, RLS on) ──
T0 policy counts after 20260921_03 (expect 3 per *_profiles, 4 per *_members): business_members=4 · business_profiles=3 · firm_members=4 · firm_profiles=3 · government_members=4 · government_profiles=3 · ngo_members=4 · ngo_profiles=3
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T1 PASS [firm]: owner reads firm_members (2 rows) and firm_profiles (1 row) without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T2 PASS [firm]: member reads co-members (2) and the entity profile without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T3 PASS [firm]: outsider sees 0 rows in firm_members and firm_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T4 PASS [firm]: owner inserted and updated a membership row in firm_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [firm]: a member's INSERT into firm_members refused (42501)
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [firm]: a member's UPDATE and DELETE on firm_members touched 0 rows
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T6 PASS [firm]: owner deleted the membership row from firm_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T7 PASS [firm]: admin reads firm_members and firm_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T1 PASS [business]: owner reads business_members (2 rows) and business_profiles (1 row) without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T2 PASS [business]: member reads co-members (2) and the entity profile without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T3 PASS [business]: outsider sees 0 rows in business_members and business_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T4 PASS [business]: owner inserted and updated a membership row in business_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [business]: a member's INSERT into business_members refused (42501)
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [business]: a member's UPDATE and DELETE on business_members touched 0 rows
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T6 PASS [business]: owner deleted the membership row from business_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T7 PASS [business]: admin reads business_members and business_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T1 PASS [government]: owner reads government_members (1 rows) and government_profiles (1 row) without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T2 PASS [government]: member reads co-members (1) and the entity profile without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T3 PASS [government]: outsider sees 0 rows in government_members and government_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T4 PASS [government]: owner inserted and updated a membership row in government_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [government]: a member's INSERT into government_members refused (42501)
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [government]: a member's UPDATE and DELETE on government_members touched 0 rows
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T6 PASS [government]: owner deleted the membership row from government_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T7 PASS [government]: admin reads government_members and government_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T1 PASS [ngo]: owner reads ngo_members (1 rows) and ngo_profiles (1 row) without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T2 PASS [ngo]: member reads co-members (1) and the entity profile without recursion
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T3 PASS [ngo]: outsider sees 0 rows in ngo_members and ngo_profiles
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T4 PASS [ngo]: owner inserted and updated a membership row in ngo_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [ngo]: a member's INSERT into ngo_members refused (42501)
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T5 PASS [ngo]: a member's UPDATE and DELETE on ngo_members touched 0 rows
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T6 PASS [ngo]: owner deleted the membership row from ngo_members
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:196: NOTICE:  T7 PASS [ngo]: admin reads ngo_members and ngo_profiles
T8 business member reads the company request (expect 1): 1
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:210: NOTICE:  T8 PASS: the business member reads the company request through public.is_active_business_member()
T8 outsider reads the company request (expect 0): 0
psql:supabase/tests/rls/entity_members_no_recursion.test.sql:222: NOTICE:  T8 PASS: an outsider reads none of the company requests
policies: business_members=4 · business_profiles=3 · firm_members=4 · firm_profiles=3 · government_members=4 · government_profiles=3 · ngo_members=4 · ngo_profiles=3
helper functions (expect 8): 8
policies on the 8 tables that read an entity table inline (expect 0): 0
```

### 3.4 No regression — `phase2_clients_and_membership.test.sql` with `20260921_03` appended · exit 0

```
bash supabase/tests/rls/run-local.sh \
  supabase/migrations/20260903_phase2_clients_and_firm_membership.sql \
  supabase/migrations/20260921_03_entity_rls_recursion_fix.sql \
  supabase/tests/rls/phase2_clients_and_membership.test.sql
```

```
── migration 1: 20260903_phase2_clients_and_firm_membership.sql ──
── migration 2: 20260921_03_entity_rls_recursion_fix.sql ──
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: active members can read co-members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can insert" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can read all members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can update" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: member can read own membership" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "owner reads firm" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:305: NOTICE:  20260921_03: firm — 3 policies on firm_profiles, 4 on firm_members, helpers is_active_firm_member/is_firm_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:373: NOTICE:  20260921_03: public.business_profiles / public.business_members absent — business block skipped
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:441: NOTICE:  20260921_03: public.government_profiles / public.government_members absent — government block skipped
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:509: NOTICE:  20260921_03: public.ngo_profiles / public.ngo_members absent — ngo block skipped
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:609: NOTICE:  20260921_03 verify: OK — matrix in place, no policy on the eight tables reads any of them inline
── tests (non-superuser, RLS on) ──
T10 owner auto-membership (expect 1): 1
T0 owner added C as member (expect 2 rows visible to O): 2
T0b member C reads co-members without recursion (expect 2): 2
T0b outsider B reads firm F members (expect 0): 0
T1 A sees own client (expect 1): 1
T1 B sees A's client (expect 0): 0
T2 C sees firm client (expect 1): 1
T2 O (owner, auto-member) sees firm client (expect 1): 1
T2 A sees firm client (expect 0): 0
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:70: NOTICE:  T3 PASS: duplicate national id inside the firm refused (23505)
T3 solo A may hold the same id as firm F (expect 2 own clients): 2
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:83: NOTICE:  T4 PASS: flag bad refused (23514)
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:90: NOTICE:  T4 PASS: flag late_pay refused (23514)
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:99: NOTICE:  T5 PASS: paid without total refused (23514)
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:108: NOTICE:  T6 PASS: insert under another owner refused (42501)
T7 O reads firm case via membership (expect 1): 1
T7 B reads firm case (expect 0): 0
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:130: NOTICE:  T8 PASS: the old null-requester client insert is still 42501 (why lawyer_clients exists)
T9 A inserted+updated own consultation (expect scheduled): scheduled
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:146: NOTICE:  T9 PASS: stranger insert refused (42501)
T11 C sees own notes (expect 2): 2
T11 O sees only the firm note (expect 1): 1
T11 B sees notes (expect 0): 0
psql:supabase/tests/rls/phase2_clients_and_membership.test.sql:166: NOTICE:  T11 PASS: note on an unreadable card refused (42501)
T12 suspended C still owns their own card (expect 1): 1
T12 O still sees the firm card after suspending C (expect 1): 1
T12 O reads req-firm-1 after suspending C (expect 1): 1
policies: cases=3 · consultations=3 · contracts=3 · lawyer_client_notes=4 · lawyer_clients=4 · service_requests=4
service_requests new columns (expect 2): 2
```

### 3.5 No regression — `phase7_profile_services_reviews.test.sql`, chain unchanged · exit 0

```
bash supabase/tests/rls/run-local.sh \
  supabase/migrations/20260907_phase7_profile_services_reviews.sql \
  supabase/tests/rls/phase7_profile_services_reviews.test.sql
```

```
── migration 1: 20260907_phase7_profile_services_reviews.sql ──
── tests (non-superuser, RLS on) ──
T0 new columns exist (expect 5): 5
T1 A sets own slug (expect 1): 1
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:39: NOTICE:  T1 PASS: slug format is checked (23514)
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:45: NOTICE:  T1 PASS: reserved slugs are refused (23514)
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:52: NOTICE:  T1 PASS: a slug is unique (23505)
T1 B cannot touch A's profile (expect 0 rows): 0
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:60: NOTICE:  T1 PASS: education must be a JSON array (23514)
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:74: NOTICE:  T2 PASS: fixed/from/hourly need a price (23514)
T2 A reads own services incl. inactive (expect 2): 2
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:83: NOTICE:  T2 PASS: cannot write another lawyer's services (42501)
T2 client sees only A's ACTIVE service, none of B (unlisted) (expect 1): 1
T3 K reviews the completed request (expect 1): 1
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:98: NOTICE:  T3 PASS: one review per request (23505)
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:104: NOTICE:  T3 PASS: a review needs a request (42501)
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:111: NOTICE:  T3 PASS: only a COMPLETED request can be reviewed (42501)
psql:supabase/tests/rls/phase7_profile_services_reviews.test.sql:118: NOTICE:  T3 PASS: only the requester reviews (42501)
T3 anyone reads the active review and the stats (expect 1|5.00): 1|5.00
policies lawyer_services=3 reviews=4 (expect 3 4)
```

### 3.6 Other existing RLS tests (stubs.sql changed, so all of them were re-run)

| Test | Chain used | Result |
|---|---|---|
| `phase6_settings_out_of_browser.test.sql` | `20260906_phase6_settings_out_of_browser.sql` | exit 0 |
| `community_reports.test.sql` | `20260911_community_reports.sql` | exit 0 |
| `case_notes.test.sql` | `20260903_phase2…` → `20260910_case_notes.sql` | exit 0 |
| `phase3_consultations_and_contracts.test.sql` | `20260903_phase2…` → `20260904_phase5…` → `20260905_phase3…` | exit 0 |
| `phase5_deadline_radar.test.sql` | `20260904_phase5_deadline_radar.sql` | exit 0 |
| `business_case_stages_no_requester_access.test.sql` | `20260903_phase2…` | exit 0 |
| `document_shares_hashes.test.sql` | `20260628_documents_upload.sql` → `20260909…` | **not runnable** — `20260628` needs `storage.buckets`, which the harness does not stub. Pre-existing limitation, unrelated to this branch. |

Before this branch, **none** of these ran on this machine: `run-local.sh` reuses one cluster and roles are cluster-wide, so the second run onwards died in `stubs.sql` with `role "app_user" already exists`. The idempotent role block fixes that.

---

## 4. Full staging-apply rehearsal

ⓡ2 The rehearsal is a committed script now: **`supabase/tests/rls/rehearse-staging-order.sh`**. Revision 1 described an ad-hoc run that nobody could reproduce; this one is re-runnable, and it is what produced the output below.

```
PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres supabase/tests/rls/rehearse-staging-order.sh
```

It creates a throwaway PostgreSQL 16.13 database, loads `stubs.sql`, the two existing chain preludes (`prelude_profiles_rls_chain.sql`, `prelude_entity_rls_chain.sql`) and `prelude_rehearsal_base.sql`, then the seven migrations the live project already has (`20260603_phase1_001`, `20260625`, `20260616`, `20260617`, `20260603_phase1_003`, `20260903_phase2`, `20260827`), then three live-shaped fixtures:

* `public.platform_settings` with the value probed read-only on the live database on 2026-09-20 (appendix 06): `{"status":"disabled","provider":null}` — deliberately the live value, so `_verify`'s new plan §3b gate can tell it apart from the `{"status":"test","provider":"stub"}` that `_staging_only_20260916_enable_test_payment_gateway.sql` would write;
* `storage.objects` + `storage.foldername()` (mirroring Supabase's own: `'a/b/c.pdf'` → `{a,b}`, asserted in the fixture) carrying the permissive `"Enable all for authenticated users" … using (true) with check (true)` rule audit 01 §3 says is live — the one step 8 is there to remove;
* two profiles seeded **through `auth.users`**, the way the bad rows actually got there, with `0512345678` (salvageable) and `letters-and-email@example.test` (not), so `_04`'s backfill has real work.

`prelude_profiles_phone.sql` is deliberately **not** in that chain: it assumes the four-column `profiles` stub survives, while `prelude_profiles_rls_chain.sql` drops it so the real `20260603_phase1_001` builds the live shape. The two genuinely conflict and neither may be edited (several branches share them), so the rehearsal carries `prelude_rehearsal_base.sql` instead — which is one table, `public.user_settings`, because the real migration already supplies every column `prelude_profiles_phone.sql` adds. That file's header explains it.

⚠️ It is a rehearsal **on stubs**. It proves the nine files apply in this order against a schema shaped like the parts they touch, and that `_verify`'s gates fire. It proves nothing about live data volume, lock contention, live policies the chain does not model, or the `42501` that makes step 8 a hand-applied side file in the first place (here it runs as the owner). Back up, apply on staging, read `_verify` there.

### 4.1 Full output — the whole plan §3 order, `_04` included, `rc=0`

```
=========== BASE (stubs + the migrations the live DB already has) ===========
── stubs.sql
── prelude_profiles_rls_chain.sql
psql:supabase/tests/rls/prelude_profiles_rls_chain.sql:29: NOTICE:  drop cascades to 7 other objects
DETAIL:  drop cascades to constraint firm_profiles_owner_user_id_fkey on table firm_profiles
drop cascades to constraint firm_members_user_id_fkey on table firm_members
drop cascades to constraint reviews_reviewer_id_fkey on table reviews
drop cascades to constraint reviews_reviewee_id_fkey on table reviews
drop cascades to constraint research_sessions_user_id_fkey on table research_sessions
drop cascades to constraint admin_audit_events_actor_id_fkey on table admin_audit_events
drop cascades to constraint notifications_user_id_fkey on table notifications
── prelude_entity_rls_chain.sql
psql:supabase/tests/rls/prelude_entity_rls_chain.sql:36: NOTICE:  drop cascades to 2 other objects
DETAIL:  drop cascades to constraint case_stages_firm_id_fkey on table case_stages
drop cascades to constraint hearings_firm_id_fkey on table hearings
── prelude_rehearsal_base.sql
── 20260603_phase1_001_profiles.sql
── 20260625_fix_rls_recursion.sql
── 20260616_entities_setup_and_rls_fix.sql
── 20260617_fix_remaining_rls.sql
── 20260603_phase1_003_subscriptions_billing.sql
── 20260903_phase2_clients_and_firm_membership.sql
── 20260827_signup_contact_fields.sql
=========== FIXTURES (live-shaped: platform_settings · storage · bad phones) ===========
── fixture: platform_settings (live value: payments_gateway disabled)
── fixture: storage.objects + storage.foldername + the permissive live policy
── fixture: two profiles with malformed phones (so 20260921_04 has work)
                  id                  |     phone_before_the_order     
--------------------------------------+--------------------------------
 11111111-1111-1111-1111-111111111111 | 0512345678
 22222222-2222-2222-2222-222222222222 | letters-and-email@example.test
(2 rows)

=========== STAGING APPLY ORDER (plan §3) ===========
── 20260906_court_costs_and_firm_profile_fields.sql
── 20260906_fix_subscriptions_rls_security.sql
── 20260914_entity_memberships_and_business_requests.sql
── 20260921_01_profiles_rls_lockdown.sql
psql:supabase/migrations/20260921_01_profiles_rls_lockdown.sql:177: NOTICE:  20260921_01 verify: OK — 3 sanctioned policies, RLS on, no anon DML grant
── 20260921_02_subscriptions_write_revoke.sql
psql:supabase/migrations/20260921_02_subscriptions_write_revoke.sql:132: NOTICE:  20260921_02 verify: OK — no write policy and no write grant for authenticated/anon
── 20260921_03_entity_rls_recursion_fix.sql
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all business_members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read business members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: active members can read co-members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: member can read own membership" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: org owner can insert" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: org owner can read all members" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_members: org owner can update" on public.business_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all business_profiles" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read business profiles" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: members can read their org" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: owner can insert" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: owner can read own" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "business_profiles: owner can update" on public.business_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all firm_members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read firm members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: active members can read co-members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can insert" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can read all members" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: firm owner can update" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_members: member can read own membership" on public.firm_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all firm_profiles" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read firm profiles" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: members can read their firm" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: owner can insert" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: owner can read own firm" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "firm_profiles: owner can update" on public.firm_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all government_members" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read government members" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: active members can read co-members" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: entity owner can insert" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: entity owner can read all" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: entity owner can update" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_members: member can read own membership" on public.government_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all government_profiles" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read government profiles" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: members can read their entity" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: owner can insert" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: owner can read own" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "government_profiles: owner can update" on public.government_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all ngo_members" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read ngo members" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: active members can read co-members" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: member can read own membership" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: org owner can insert" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: org owner can read all" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_members: org owner can update" on public.ngo_members
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read all ngo_profiles" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "admins read ngo profiles" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: members can read their org" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: owner can insert" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: owner can read own" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:235: NOTICE:  20260921_03: dropping policy "ngo_profiles: owner can update" on public.ngo_profiles
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:305: NOTICE:  20260921_03: firm — 3 policies on firm_profiles, 4 on firm_members, helpers is_active_firm_member/is_firm_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:373: NOTICE:  20260921_03: business — 3 policies on business_profiles, 4 on business_members, helpers is_active_business_member/is_business_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:441: NOTICE:  20260921_03: government — 3 policies on government_profiles, 4 on government_members, helpers is_active_government_member/is_government_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:509: NOTICE:  20260921_03: ngo — 3 policies on ngo_profiles, 4 on ngo_members, helpers is_active_ngo_member/is_ngo_owner installed
psql:supabase/migrations/20260921_03_entity_rls_recursion_fix.sql:609: NOTICE:  20260921_03 verify: OK — matrix in place, no policy on the eight tables reads any of them inline
── 20260921_04_profiles_phone_e164_check.sql
psql:supabase/migrations/20260921_04_profiles_phone_e164_check.sql:451: NOTICE:  20260921_04 OK — no_phone=1 e164_ok=1 quarantined=1
── storage_policies_documents.sql
            policy_name             | cmd |      roles      | using_expr | with_check_expr 
------------------------------------+-----+-----------------+------------+-----------------
 Enable all for authenticated users | *   | {authenticated} | true       | true
(1 row)

psql:supabase/storage_policies_documents.sql:107: NOTICE:  storage_policies_documents: dropping policy "Enable all for authenticated users" on storage.objects (expression: true true)
     policy_name      | cmd |      roles      |                                         using_expr                                         |                                      with_check_expr                                       
----------------------+-----+-----------------+--------------------------------------------------------------------------------------------+--------------------------------------------------------------------------------------------
 documents delete own | d   | {authenticated} | ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])) | 
 documents insert own | a   | {authenticated} |                                                                                            | ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))
 documents select own | r   | {authenticated} | ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])) | 
 documents update own | w   | {authenticated} | ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])) | ((bucket_id = 'documents'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))
(4 rows)

psql:supabase/storage_policies_documents.sql:185: NOTICE:  storage_policies_documents: OK — 4 owner-only policies, nothing else can match bucket documents
── _verify.sql
lawyer_profiles.is_accepting_clients | f
lawyer_profiles.city | f
profiles.city | t
handle_new_user fn | t
on_auth_user_created trigger | t
service_requests RLS enabled | t
platform_settings.payments_gateway seeded | t
court_cost_notices table | t
case_disbursements table | t
firm_profiles.cr_number | t
service_requests.business_id | t
business members read business service requests policy | t
entity RLS helper functions (expect 8) | 8
policies on the 8 entity tables that read an entity table inline (expect 0) | 0
public.profiles policy count (expect 3) | 3
anon DML grants on public.profiles (expect 0) | 0
subscriptions INSERT/UPDATE policies (expect 0) | 0
authenticated/anon write grants on subscriptions+credit_transactions (expect 0) | 0
profiles phone E.164 constraint (validated) | t
documents owner-only storage policies (expect 4) | 4
other storage.objects policies that can match bucket documents (expect 0) | 0
platform_settings.payments_gateway status (expect disabled or live, never test/stub) | disabled
is_active_firm_member overloads taking p_firm_id (expect 0) | 0
rc=0
=========== post-rehearsal phone state ===========
                  id                  |     phone     |      quarantined_original      
--------------------------------------+---------------+--------------------------------
 11111111-1111-1111-1111-111111111111 | +966512345678 | -
 22222222-2222-2222-2222-222222222222 | (null)        | letters-and-email@example.test
(2 rows)
```

### 4.2 The same run with step 7 left out — the new `_verify` gate stops it

```
SKIP=20260921_04 supabase/tests/rls/rehearse-staging-order.sh
```

```
── 20260921_04_profiles_phone_e164_check.sql   ⟨SKIPPED — SKIP=20260921_04⟩
⟨steps 1-6 and 8, and the 18 _verify rows above this one, are byte-identical to §4.1⟩
── _verify.sql
profiles phone E.164 constraint (validated) | f
psql:supabase/migrations/_verify.sql:238: ERROR:  _verify: public.profiles carries no constraint profiles_phone_e164_saudi_mobile — 20260921_04_profiles_phone_e164_check.sql was not applied
CONTEXT:  PL/pgSQL function inline_code_block line 14 at RAISE
rc=3
```

`SKIP` exists for exactly this proof and nothing else uses it. Before revision 2 this run ended `rc=0`: `_verify.sql` had no assertion about `_04` at all, so a bulk apply that dropped the phone migration on the floor left `deploy.sh` green.

The `f` values in the first two `_verify` rows are migrations outside this rehearsal's seed (`20260616_production_readiness_fixes.sql`, `20260906_phase6_settings_out_of_browser.sql`); they are report-only rows and were already in `_verify.sql` before this branch. `profiles.city` reads `t` because `20260827_signup_contact_fields.sql` is in the base chain here.

---

## 5. Per-item notes

### A · `20260921_01_profiles_rls_lockdown.sql` (UAT-SEC-001)
The offending policy is not in the repository and its name is unknown, so the file drops **every** policy on `public.profiles` outside the allow-list of three, with one `raise notice` per drop, then re-creates the three `to authenticated` using the expressions from `20260603_phase1_001_profiles.sql:66-82` and `20260625_fix_rls_recursion.sql:34-36`, then `revoke select, insert, update, delete … from anon`.

**Grep result before shipping the revoke (required by the plan):** all 52 files containing `from("profiles")` were checked. Every path that can run without a session uses `createServiceClient()` — `api/v1/lawyers/route.ts:54`, `api/v1/lawyers/[id]/route.ts:182`, `lawyers/[slug]/layout.tsx:123`, `api/v1/invite/[code]/route.ts:60`, `lib/broadcastFanout.ts:47`. The only two anon-key clients that read `profiles` both run with a session: `src/proxy.ts:306` (inside `if (user)`) and `src/app/login/page.tsx:200` (after `signInWithPassword`). **No anon-key read of `profiles` exists**; the revoke is safe.

### B · `20260921_02_subscriptions_write_revoke.sql` (UAT-SUB-001)
Idempotently repeats `20260906_fix_subscriptions_rls_security.sql` and adds the grant layer for `subscriptions` **and** `credit_transactions`.

**Write-path audit before shipping the revoke (required by the plan)** — all nine writes use the service-role client, so neither revoke breaks a user-scoped route:

| Table | Site | Op | Client |
|---|---|---|---|
| subscriptions | `src/app/api/v1/admin/subscriptions/route.ts:266` | update | `createServiceClient()` (:191) |
| subscriptions | `src/app/api/v1/admin/subscriptions/route.ts:282` | insert | `createServiceClient()` (:191) |
| subscriptions | `src/app/api/v1/admin/subscriptions/[id]/route.ts:145` | update | `createServiceClient()` (:70) |
| subscriptions | `src/app/api/v1/admin/subscriptions/[id]/route.ts:247` | update | `createServiceClient()` (:227) |
| subscriptions | `src/app/api/v1/admin/users/[id]/route.ts:213` | update | `createServiceClient()` (:174) |
| subscriptions | `src/lib/entitlements.ts:107` | update | `createServiceClient()` (:55) |
| subscriptions | `src/lib/entitlements.ts:117` | insert | `createServiceClient()` (:55) |
| credit_transactions | `src/lib/entitlements.ts:180` | insert | `createServiceClient()` (:55) |
| credit_transactions | `src/app/api/v1/admin/credits/route.ts:108` | insert | `createServiceClient()` (:76) |

The remaining hits are SELECTs (`api/v1/profile/route.ts:255`, `api/v1/dashboard/summary/route.ts:112`, `lib/access-control.ts:96` and `:298`, plus admin read dashboards), all served by the surviving read-own policies.

### C · `supabase/storage_policies_documents.sql` (UAT-STORAGE-001)
Still a side file — `storage.objects` is owned by `supabase_storage_admin`, so `CREATE POLICY` on it is `42501` from `db push` and the SQL Editor. It now prints every `pg_policy` row on `storage.objects` first, then drops by name, in a loop, every policy that is not one of the four owner-only ones **and** whose expression either mentions `documents` or mentions no bucket at all; a policy scoped to another bucket is kept, with a notice saying so. Then it creates the four `documents … own` policies and re-reads.

Rehearsed against a fixture holding `"Enable all for authenticated users"` (`using (true)`), `"documents legacy open"` (`bucket_id = 'documents'`) and `"avatars are public"` (`bucket_id = 'avatars'`): the first two dropped, the avatars policy kept, the four created.

### D · `20260921_03_entity_rls_recursion_fix.sql` (UAT-TEAM-001)
Header carries the full matrix and every policy it replaces with `file:line`. Structure as specified: `begin;` → prerequisite check on `public.is_admin()` → a loop dropping every policy on the eight tables → four per-entity blocks (helpers + matrix) → verify → `commit;`.

Two deviations from the brief, both deliberate and documented in the file:

1. **Each entity block is guarded with `to_regclass`** — the same pattern `20260903_phase2…:296-334` already uses. Without it the file cannot be appended to the phase-2 test chain (the harness stubs only the firm pair), and it would fail on any database that never created the other six tables. On the live database all eight exist, so all four blocks run; the rehearsal in §4 shows all four.
2. **Column names verified, one differs from the brief's shorthand:** `firm_members.firm_id`, `business_members.business_id`, **`government_members.gov_id`** (not `government_id`), `ngo_members.ngo_id`; every `*_profiles` keys on `id` / `owner_user_id`.

**Semantics check against the old set** (required by the brief): "member can read own membership" → the `user_id = auth.uid()` arm; "members can read their &lt;entity&gt;" → `is_active_X_member(id)`; "&lt;x&gt; owner can read all members" → `is_X_owner(<fk>)`; the three admin spellings per table → one `public.is_admin()` arm. No old policy let a member update their own membership row, and no policy on these eight tables was ever public — the only `public read verified …` policy in the tree is on `lawyer_profiles` (`20260603_phase1_001_profiles.sql:127-129`) and is untouched. **One behaviour change:** the matrix adds a `DELETE` arm on `*_members` for the owner/admin. No DELETE policy has ever existed on any of those tables, so removing a member is impossible today even for the owner; `_superseded_20260916_fix_all_entities…:82/135/188/241` intended the same arm.

The four member helpers are `CREATE OR REPLACE`d and never dropped: `20260914…:52-59` has a policy on `service_requests` that calls `is_active_business_member`, and a DROP would either fail or (with CASCADE) silently delete it. Test 3.3 T8 proves that policy still works after the migration.

### E · `supabase/migrations/_verify.sql`
ⓡ2 Extended in the file's existing style: report `SELECT`s plus `DO` blocks whose only effect is `RAISE`. The header note now says so. **Twenty-three rows and five gates** (revision 1: twenty rows, three gates). Asserted: `court_cost_notices`, `case_disbursements`, `firm_profiles.cr_number`, `service_requests.business_id` and 20260914's policy, the 8 helper functions, `0` entity policies reading an entity table inline, `profiles` policy count `= 3`, `0` anon DML grants on `profiles`, `0` INSERT/UPDATE policies on `subscriptions`, `0` write grants for `authenticated`/`anon` on `subscriptions` + `credit_transactions`, and the four `documents … own` storage policies with nothing else able to match that bucket.

ⓡ2 Two sections were added after the review:

* **`20260921_04` (UAT-REG-002)** — one report row (`profiles phone E.164 constraint (validated)`) and one gate that raises when (a) `profiles_phone_e164_saudi_mobile` is absent, or present but `NOT VALID` (a `NOT VALID` CHECK guards new writes and says nothing about the rows that were already there); (b) `pg_get_functiondef('public.handle_new_user()')` has no `v_phone` — with (a) in place and the clamp missing, a bad number typed at signup becomes a `23514` inside the `AFTER INSERT` trigger on `auth.users` and aborts the account creation; (c) any `profiles` row still holds a phone that is not `^\+9665[0-9]{8}$`. §4.2 is the proof that it bites.
* **plan §3b — the three files that must never be applied.** The leading underscore keeps them out of `supabase db push` and out of nothing else. `_staging_only_20260916_enable_test_payment_gateway.sql` writes `{"status":"test","provider":"stub"}` over `platform_settings.payments_gateway` with `ON CONFLICT DO UPDATE`, so the gate raises when that status is `test` or `stub`. The two `_superseded_20260916_*` files redeclare `is_active_firm_member` with `p_firm_id` instead of `20260903`'s `p_firm` — which is what makes them die with `42P13` — so the gate counts overloads whose `pg_get_function_arguments` mentions `p_firm_id` and raises on any. Both were proved to fire on a scratch database seeded with each fingerprint in turn.

### F · Tests and harness
Each test reproduces its defect through the chain of real migrations **before** loading the fix, and fails the run if the defect does not reproduce:

* `prelude_profiles_leak_injection.sql` creates the four actors through the real `handle_new_user()` trigger, injects `"Enable read access for all users" … to authenticated using (true)` — the Dashboard one-click shape, which is the only shape consistent with audit 06 probe B — and raises unless A can read B. `20260921_01` then drops it by the dynamic loop (the notice in §3.1 names it), and the test proves the closure.
* `prelude_entity_recursion_defect_proof.sql` raises unless all four `*_members` tables answer `42P17`. No fixtures are needed: the cycle is detected while the query is rewritten, so an empty table raises it too.

`stubs.sql` changes: idempotent role creation (fixes the harness for repeat local runs); the `anon` / `authenticated` / `service_role` roles with Supabase's own grant defaults, without which a migration containing `to authenticated` or `revoke … from anon` cannot even parse; `grant authenticated to app_user`, because a signed-in PostgREST request runs as `authenticated`; and stubs for `handle_updated_at()`, `admin_audit_events` and `notifications`, which real migrations in these chains reference but do not create.

---

## 6. Open risks and things this package could not do

1. **The live `profiles` policy has still never been read.** Audit 06 could not reach `pg_policy`. The dynamic drop does not need the name, but the preflight query in §2a must be run and its output kept, or there will be no record of what was removed.
2. **`20260603_phase1_002_entities.sql` is not loadable standalone** — its entity policies reference the `*_members` tables dozens of lines before it creates them (`:79` vs `:118`, `:259` vs `:298`, `:436` vs `:475`, `:606` vs `:645`). The entity test chain therefore starts at `20260616`, which re-creates every one of those policies verbatim after dropping them by name. The end state is identical, but the chain in the plan's WP-1 F is one file shorter than written there.
3. **The `DELETE` arm on `*_members` is new privilege surface.** Owner and admin only, and nothing can delete a membership row today, but it is a change of behaviour and is called out in the migration header.
4. **`20260921_03` is guarded per entity.** On a database missing one of the eight tables, that entity is skipped with a notice instead of failing. The verify block also skips absent tables. Run the §2a helper-name query and the §2b policy read to confirm all four blocks ran on staging.
5. **Parameter names are an assumption about the live database.** `CREATE OR REPLACE FUNCTION` cannot rename a parameter, so `20260921_03` assumes the live `is_active_*_member` helpers still carry `20260903`'s names (`p_firm`, `p_business`, `p_gov`, `p_ngo`). That holds only because neither `_superseded_20260916_*` file was ever applied — which audit 01 §4 establishes, and which the §2a query confirms in one read. If either had landed, `20260921_03` fails with `42P13` and the whole file rolls back (no partial state). ⓡ2 `_verify.sql` now also asserts this after the fact, by counting `is_active_firm_member` overloads that take `p_firm_id`; the §2a query remains the pre-flight.
6. **Storage is verified, not tested.** `storage.objects` cannot be exercised by the RLS harness (no `storage` schema, no `storage.foldername`, no `buckets` table), so item C was rehearsed against a hand-built fixture, not against Supabase Storage. The real proof is `verify-document-storage-isolation.ps1` on staging.
7. **`public.cases` still has zero writers** (audit 01 §6). Applying `20260906_court_costs_and_firm_profile_fields.sql` fixes `PGRST205` but does not make court-cost entry reachable, because both new tables FK to a table nothing inserts into. Raised, out of scope here (plan Q9).
8. **`profiles.email` direct-PATCH hole is untouched** (plan Q8). `"users update own profile"` still permits `update (email, user_type, verification_status)`; only the `trg_lock_user_type` trigger stands in the way. That revoke was deliberately left for its own migration.
9. **Nothing was applied to any live database**, and no UAT script was run: item E's deployment half is manual and out of this package's hands.
