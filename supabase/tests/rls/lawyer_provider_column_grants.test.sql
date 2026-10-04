-- RLS/GRANT acceptance test for 20260922_03_lawyer_provider_column_grants.sql
-- — review item A6 (F04): "any lawyer can self-verify and self-credit".
--
-- CHAIN — copy/paste, verified green on 2026-09-22 (docker postgres:16-alpine):
--
--   supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_profiles_rls_chain.sql \
--     supabase/tests/rls/prelude_entity_rls_chain.sql \
--     supabase/migrations/20260603_phase1_001_profiles.sql \
--     supabase/migrations/20260614_auto_create_role_profiles.sql \
--     supabase/migrations/20260616_production_readiness_fixes.sql \
--     supabase/migrations/20260616_entities_setup_and_rls_fix.sql \
--     supabase/migrations/20260625_fix_rls_recursion.sql \
--     supabase/migrations/20260821_fix_provider_signup_sub_role.sql \
--     supabase/migrations/20260826_corporate_identity_persisted.sql \
--     supabase/migrations/20260906_court_costs_and_firm_profile_fields.sql \
--     supabase/migrations/20260906_phase6_settings_out_of_browser.sql \
--     supabase/migrations/20260907_phase7_profile_services_reviews.sql \
--     supabase/migrations/20260921_03_entity_rls_recursion_fix.sql \
--     supabase/migrations/20260922_03_lawyer_provider_column_grants.sql \
--     supabase/tests/rls/lawyer_provider_column_grants.test.sql
--
-- Why each link is there (none is decoration — each one was added because the
-- run before it stopped):
--   prelude_profiles_rls_chain.sql  stubs.sql creates its OWN minimal
--       public.profiles and public.lawyer_profiles, with hand-written copies of
--       policy names 20260603 also creates, and 20260603 uses `create table if
--       not exists` — so without this drop the stub shape survives (no bio_en,
--       no credit_balance, no display_mode) and the chain dies on 42710. The
--       file is reused as-is; it also adds the auth.users columns
--       handle_new_user reads. Shared with profiles_cross_user_read.test.sql.
--   prelude_entity_rls_chain.sql    the same problem for the FIRM pair:
--       stubs.sql stubs firm_profiles/firm_members with a reduced shape and the
--       pre-fix policies, and 20260616_entities_setup also uses `create table if
--       not exists`, so without this drop firm_profiles would have no
--       verification_status, no plan_id and no display_mode and T12 would be
--       testing a table that does not exist in production. Reused as-is;
--       shared with entity_members_no_recursion.test.sql.
--   20260603_phase1_001   lawyer_profiles + provider_profiles + micro_profiles
--                         and the three row-scoped UPDATE policies this test
--                         must not break.
--   20260614              the "users insert own …" INSERT policies.
--   20260616_production_readiness_fixes
--                         lawyer_profiles.city (:19-21); also re-creates
--                         handle_new_user with the user_settings insert.
--   20260616_entities_setup_and_rls_fix
--                         the four entity tables + their members tables, in
--                         dependency order. 20260603_phase1_002_entities.sql is
--                         deliberately NOT in the chain: it creates each
--                         *_profiles policy that selects from *_members BEFORE
--                         creating *_members, so it stops at 42P01 on any
--                         database that does not already hold all eight tables.
--                         prelude_entity_rls_chain.sql documents this at length;
--                         20260616 re-creates every one of that file's policies
--                         verbatim, so the end state is identical.
--   20260625              without it, "admins read all lawyer profiles" inlines
--                         a read of profiles whose own admin policy reads
--                         profiles → 42P17 infinite recursion on the first
--                         UPDATE. The fix is a prerequisite of the fixtures,
--                         not of the grant layer.
--   20260821              20260616's handle_new_user provider branch omits
--                         sub_role (NOT NULL, no default) → 23502 on P's signup.
--                         This is the migration that repaired it.
--   20260826              business_profiles.legal_rep_name / legal_rep_capacity,
--                         which 20260922_03 grants by name — without it the
--                         migration dies on 42703. It also carries
--                         handle_new_user forward with branches for all seven
--                         role tables, which is what builds the F/C/G/N/M
--                         fixtures below.
--   20260906_court_costs  lawyer_profiles.bar_membership_number and the four
--                         firm_profiles statutory columns (cr_number,
--                         unified_number_700, managing_partner_name,
--                         managing_partner_license). It is placed BEFORE
--                         20260922_03 deliberately: the table-level revoke has
--                         to run AFTER these columns exist, or they would keep
--                         the default grant and verify check 8c would fire.
--                         With it in the chain T5 SKIPs nothing, and 8c really
--                         exercises the four firm columns the migration header
--                         calls out as deliberately ungranted.
--   20260906_phase6       license_issued_on, office_address (:125-127).
--   20260907              slug, education, courts, languages, headline_ar,
--                         show_contact.
--   20260921_03           re-creates the entity UPDATE policies under their
--                         final names; 20260922_03's verify block asserts those
--                         exact names, so the chain must reach this file.
--   20260922_03           the fix under test.
-- NOTHING IS LEFT OUT ANY MORE: 20260906_court_costs was once missing from
-- this chain, which made T5 SKIP bar_membership_number and left the four firm
-- statutory columns unexercised by check 8c. It was added on 2026-09-22 and
-- the suite now runs with NO skips at all: 78 PASS, 0 FAIL, 0 SKIP, exit 0.
-- T5 keeps its column guard anyway, so a deliberately partial chain still
-- SKIPs loudly instead of passing silently.
--
-- NEGATIVE CONTROL (run it before believing a green run), both halves,
-- both verified 2026-09-22:
--   * drop 20260922_03 from the chain above and re-run — T0 flips to `true`
--     and T2 stops the run with «T2 FAIL: L self-verified — A6/F04 is open»
--     (exit 3).
--   * put the PRE-F3 file in its place — the same migration with sections 1-2
--     only, i.e. lawyer_profiles + provider_profiles and no entity tables — and
--     the run gets all the way to «T12 FAIL: F wrote
--     firm_profiles.verification_status — it is not in the allowlist» (exit 3).
--     That second control is the one that proves T12..T18 are doing work: T1-T11
--     are all green against it.
-- IDEMPOTENCE: listing 20260922_03 twice in the chain is also green (78 PASS,
-- 0 FAIL, 0 SKIP, the verify block raising its OK notice from both copies).
-- Re-verified 2026-09-22 on the chain above, court_costs link included.
--
-- Actors, all created through `insert into auth.users` so the real
-- handle_new_user() trigger builds their rows exactly as signup does:
--   L  aaaaaaaa-…001  lawyer
--   L2 bbbbbbbb-…002  lawyer   (proves the ROW layer is untouched)
--   P  cccccccc-…003  provider (sub_role notary)
--   F  dddddddd-…004  firm
--   C  eeeeeeee-…005  corporate (business_profiles)
--   G  ffffffff-…006  government
--   N  11111111-…007  ngo
--   M  22222222-…008  micro
-- The last five are created only when the entity tables are in the chain; each
-- of T12..T16 then SKIPs loudly instead of reporting a pass it never made.
--
-- WHY app_user's DIRECT grants are revoked below: stubs.sql gives app_user
-- `grant all on all tables` AND makes it a member of `authenticated`. The
-- migration revokes from `authenticated` only, so without these two REVOKEs the
-- direct grant survives and every 42501 assertion would be testing the wrong
-- privilege set (and would pass on an unpatched database). After them,
-- app_user's privileges on these two tables come only through `authenticated`,
-- exactly as they do for a signed-in PostgREST request.
--
-- No `\set ON_ERROR_STOP 0`: every `raise exception` below fails the run.
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (RLS bypassed on purpose) ─────────────────────────
-- 20260616_production_readiness_fixes.sql:163 re-creates handle_new_user() with
-- an `insert into public.user_settings (user_id)`, and that table is created by
-- 20260603_phase1_004_community_features.sql — a migration this chain has no
-- other reason to carry. The two columns the trigger needs are stood up here
-- instead (shape copied from …phase1_004:275-289); nothing below reads it.
create table if not exists public.user_settings (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'l@example.com',
     '{"user_type":"lawyer","display_name":"محامٍ"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'l2@example.com',
     '{"user_type":"lawyer","display_name":"محامٍ ٢"}'::jsonb),
  ('cccccccc-0000-0000-0000-000000000003', 'p@example.com',
     '{"user_type":"provider","sub_role":"notary","display_name":"موثّق"}'::jsonb);

-- The five entity owners. Guarded as ONE block on the four entity tables being
-- present: handle_new_user inserts the sector row inside the auth.users insert,
-- so on a chain without those tables this INSERT would abort with 42P01 and
-- take the whole run with it rather than skipping the five tests it feeds.
-- micro_profiles always exists (20260603_phase1_001), but M rides along in the
-- same block so the fixture has one condition, not two.
do $$
begin
  if to_regclass('public.firm_profiles')       is null
  or to_regclass('public.business_profiles')   is null
  or to_regclass('public.government_profiles') is null
  or to_regclass('public.ngo_profiles')        is null then
    raise notice 'FIXTURE SKIP: the entity profile tables are not in this chain — T12..T16 will skip';
    return;
  end if;
  insert into auth.users (id, email, raw_user_meta_data) values
    ('dddddddd-0000-0000-0000-000000000004', 'f@example.com',
       '{"user_type":"firm","company_name":"مكتب المحاماة"}'::jsonb),
    ('eeeeeeee-0000-0000-0000-000000000005', 'c@example.com',
       '{"user_type":"corporate","company_name":"شركة نظامي","cr_number":"1010000001"}'::jsonb),
    ('ffffffff-0000-0000-0000-000000000006', 'g@example.com',
       '{"user_type":"government","entity_name":"وزارة العدل","entity_type":"ministry"}'::jsonb),
    ('11111111-0000-0000-0000-000000000007', 'n@example.com',
       '{"user_type":"ngo","org_name":"جمعية خيرية","org_type":"charity"}'::jsonb),
    ('22222222-0000-0000-0000-000000000008', 'm@example.com',
       '{"user_type":"micro","business_name":"مؤسسة صغيرة"}'::jsonb);
  raise notice 'FIXTURE: F/C/G/N/M created through handle_new_user';
end $$;

select 'T0 handle_new_user built the role rows (expect 2 lawyer / 1 provider): '
       || (select count(*) from public.lawyer_profiles)::text || ' / '
       || (select count(*) from public.provider_profiles)::text;

-- The pre-fix state, for the record: on an unpatched database this is 't'.
select 'T0 authenticated may UPDATE lawyer_profiles.verification_status (expect f): '
       || has_column_privilege('authenticated', 'public.lawyer_profiles', 'verification_status', 'UPDATE')::text;
select 'T0 authenticated may UPDATE lawyer_profiles.bio_ar (expect t): '
       || has_column_privilege('authenticated', 'public.lawyer_profiles', 'bio_ar', 'UPDATE')::text;

revoke all on public.lawyer_profiles   from app_user;
revoke all on public.provider_profiles from app_user;
-- The same REVOKE for the five tables 20260922_03 added, for the same reason:
-- stubs.sql's `alter default privileges … grant all on tables` (stubs.sql:347)
-- hands app_user a DIRECT grant on every table a later migration creates, and a
-- direct grant would satisfy every UPDATE below even on an unpatched database.
do $$
declare t text;
begin
  foreach t in array array['firm_profiles','business_profiles',
                           'government_profiles','ngo_profiles','micro_profiles'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'REVOKE SKIP: public.% is not in this chain', t;
      continue;
    end if;
    execute format('revoke all on public.%I from app_user', t);
  end loop;
end $$;

-- ── from here on: app_user (a member of `authenticated`), RLS enforced ─────
set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- T1 — the lawyer can still edit what the product lets him edit
do $$
declare n int;
begin
  update public.lawyer_profiles set bio_ar = 'نبذة محدّثة'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T1 FAIL: L updated % rows setting his own bio_ar (expected 1) — the fix over-revoked', n;
  end if;
  raise notice 'T1 PASS: L''s UPDATE … set bio_ar touched 1 row';
end $$;

-- T2 — THE finding: self-verification
do $$
begin
  update public.lawyer_profiles set verification_status = 'verified'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'T2 FAIL: L self-verified — A6/F04 is open';
exception
  when insufficient_privilege then
    raise notice 'T2 PASS: L''s UPDATE … set verification_status refused (42501)';
end $$;

-- T3 — the other half: self-credit
do $$
begin
  update public.lawyer_profiles set credit_balance = 999999
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'T3 FAIL: L minted credits on his own profile — A6/F04 is open';
exception
  when insufficient_privilege then
    raise notice 'T3 PASS: L''s UPDATE … set credit_balance refused (42501)';
end $$;

-- T4 — the exact PATCH from the review, both columns in one statement
do $$
begin
  update public.lawyer_profiles set verification_status = 'verified', credit_balance = 999999
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'T4 FAIL: the review''s PATCH body succeeded verbatim';
exception
  when insufficient_privilege then
    raise notice 'T4 PASS: {verification_status, credit_balance} refused (42501)';
end $$;

-- T5 — the rest of the privileged surface, one column at a time
do $$
declare
  c text;
  stmt text;
begin
  foreach c in array array['credit_package','credit_expiry','free_briefs_remaining',
                           'active_roles','metadata','license_expiry','bar_membership_number'] loop
    -- bar_membership_number/license_expiry may be absent on a partial chain;
    -- skip what does not exist rather than reporting a false pass.
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'lawyer_profiles'
                      and column_name = c) then
      raise notice 'T5 SKIP: lawyer_profiles.% is not in this chain', c;
      continue;
    end if;
    stmt := format(
      'update public.lawyer_profiles set %I = %L where user_id = %L',
      c,
      case c
        when 'credit_package'        then '{"unlimited"}'
        when 'credit_expiry'         then '2099-01-01'
        when 'free_briefs_remaining' then '9999'
        when 'active_roles'          then '{lawyer,admin}'
        when 'metadata'              then '{"verified":true}'
        when 'license_expiry'        then '2099-01-01'
        else 'X'
      end,
      'aaaaaaaa-0000-0000-0000-000000000001');
    begin
      execute stmt;
      raise exception 'T5 FAIL: L wrote lawyer_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T5 PASS: lawyer_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;

-- T6 — PATCH /api/v1/settings/preferences' display_mode mirror still works
do $$
declare n int;
begin
  update public.lawyer_profiles set display_mode = 'light'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T6 FAIL: the display_mode mirror touched % rows (expected 1)', n;
  end if;
  raise notice 'T6 PASS: display_mode mirror still writes 1 row';
end $$;

-- T7 — the WHOLE PATCH /api/v1/profile allowlist in one statement, as the route sends it
do $$
declare n int;
begin
  update public.lawyer_profiles set
      bio_ar = 'نبذة', bio_en = 'bio', specialties = '{"تجاري"}', years_experience = 9,
      hourly_rate = 750, license_number = 'LIC-1', bar_association = 'هيئة المحامين',
      city = 'الرياض', marketplace_visible = true, is_accepting_clients = true,
      show_contact = true, slug = 'ahmad-alghamdi', education = '[]'::jsonb,
      courts = '{"المحكمة التجارية"}', languages = '{"ar","en"}', headline_ar = 'محامٍ',
      license_issued_on = '2020-01-01', office_address = 'طريق الملك فهد'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T7 FAIL: the full profile allowlist touched % rows (expected 1)', n;
  end if;
  raise notice 'T7 PASS: the full PATCH /api/v1/profile allowlist writes 1 row';
end $$;

-- T8 — nothing self-service creates the row any more (the INSERT policy survives,
--      the INSERT grant does not)
do $$
begin
  insert into public.lawyer_profiles (user_id, verification_status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'verified');
  raise exception 'T8 FAIL: L inserted a lawyer_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T8 PASS: L''s INSERT into lawyer_profiles refused (42501)';
end $$;

-- T9 — the ROW layer is untouched: L2 still cannot write L's row even on an
--      allowed column (0 rows, no error — that is what RLS does)
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  update public.lawyer_profiles set bio_ar = 'اختُرقت'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'T9 FAIL: L2 wrote % of L''s rows', n;
  end if;
  raise notice 'T9 PASS: L2''s UPDATE of L''s row touched 0 rows';
end $$;

-- T10 — provider_profiles: metadata is the only self-writable column
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare n int;
begin
  update public.provider_profiles set metadata = '{"settings":{"bio":"نبذة"}}'::jsonb
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T10 FAIL: P updated % rows setting his own metadata (expected 1)', n;
  end if;
  raise notice 'T10 PASS: P''s UPDATE … set metadata touched 1 row';
end $$;
do $$
begin
  update public.provider_profiles set verification_status = 'verified'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  raise exception 'T10 FAIL: P self-verified — provider half of A6/F04 is open';
exception
  when insufficient_privilege then
    raise notice 'T10 PASS: P''s UPDATE … set verification_status refused (42501)';
end $$;
do $$
declare
  c text;
begin
  foreach c in array array['sub_role','license_number','hourly_rate',
                           'marketplace_visible','service_areas'] loop
    begin
      execute format('update public.provider_profiles set %I = %L where user_id = %L',
        c,
        case c
          when 'sub_role'            then 'arbitrator'
          when 'license_number'      then 'LIC-9'
          when 'hourly_rate'         then '9999'
          when 'marketplace_visible' then 'true'
          else '{"الرياض"}'
        end,
        'cccccccc-0000-0000-0000-000000000003');
      raise exception 'T10 FAIL: P wrote provider_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T10 PASS: provider_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;
do $$
begin
  insert into public.provider_profiles (user_id, sub_role, verification_status)
  values ('cccccccc-0000-0000-0000-000000000003', 'arbitrator', 'verified');
  raise exception 'T10 FAIL: P inserted a provider_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T10 PASS: P''s INSERT into provider_profiles refused (42501)';
end $$;

-- T11 — reads are untouched (the routes in the migration header all SELECT)
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select 'T11 L reads own lawyer_profiles row (expect 1): ' || count(*)
  from public.lawyer_profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$
declare v text;
begin
  select verification_status into v from public.lawyer_profiles
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if v is distinct from 'pending' then
    raise exception 'T11 FAIL: verification_status is % — something above landed', v;
  end if;
  raise notice 'T11 PASS: verification_status is still ''pending'' after every attempt';
end $$;
do $$
declare b int;
begin
  select credit_balance into b from public.lawyer_profiles
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if b <> 0 then
    raise exception 'T11 FAIL: credit_balance is % — something above landed', b;
  end if;
  raise notice 'T11 PASS: credit_balance is still 0 after every attempt';
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- T12..T16 — the five entity profile tables 20260922_03 added.
--
-- Same three questions on each: does the owner still write what the product
-- lets him write, is the trust/money column refused with 42501, and is INSERT
-- gone? The uid is re-set per table because an INSERT refused by RLS raises
-- 42501 too — the only way an INSERT test proves the GRANT is gone is to make
-- the row one the INSERT policy would have allowed.
-- ═══════════════════════════════════════════════════════════════════════════

-- T12 — firm_profiles (display_mode + metadata allowed; the badge and the budget not)
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
do $$
declare n int;
begin
  if to_regclass('public.firm_profiles') is null then
    raise notice 'T12 SKIP: public.firm_profiles is not in this chain';
    return;
  end if;
  update public.firm_profiles set display_mode = 'light'
   where owner_user_id = 'dddddddd-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T12 FAIL: the firm display_mode mirror touched % rows (expected 1) — the fix over-revoked', n;
  end if;
  update public.firm_profiles set metadata = '{"settings":{"city":"الرياض"}}'::jsonb
   where owner_user_id = 'dddddddd-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T12 FAIL: the firm entitySettings write touched % rows (expected 1)', n;
  end if;
  raise notice 'T12 PASS: F writes display_mode and metadata, 1 row each';
end $$;
do $$
declare c text;
begin
  if to_regclass('public.firm_profiles') is null then return; end if;
  foreach c in array array['verification_status','plan_id','annual_points_budget',
                           'points_spent','max_seats','license_number','name_ar'] loop
    begin
      execute format('update public.firm_profiles set %I = %L where owner_user_id = %L',
        c,
        case c
          when 'verification_status' then 'verified'
          when 'plan_id'             then 'enterprise'
          when 'license_number'      then 'LIC-F'
          when 'name_ar'             then 'مكتب مزوَّر'
          else '999999'
        end,
        'dddddddd-0000-0000-0000-000000000004');
      raise exception 'T12 FAIL: F wrote firm_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T12 PASS: firm_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;
do $$
begin
  if to_regclass('public.firm_profiles') is null then return; end if;
  insert into public.firm_profiles (owner_user_id, name_ar, verification_status)
  values ('dddddddd-0000-0000-0000-000000000004', 'مكتب ثانٍ', 'verified');
  raise exception 'T12 FAIL: F inserted a firm_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T12 PASS: F''s INSERT into firm_profiles refused (42501)';
end $$;

-- T13 — business_profiles (the six identity columns PATCH /api/v1/profile validates)
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare n int;
begin
  if to_regclass('public.business_profiles') is null then
    raise notice 'T13 SKIP: public.business_profiles is not in this chain';
    return;
  end if;
  update public.business_profiles set
      company_name_ar    = 'شركة نظامي المحدودة',
      cr_number          = '1010000002',
      legal_rep_name     = 'عبدالعزيز القرني',
      legal_rep_capacity = 'manager',
      service_model      = 'hybrid',
      has_legal_dept     = true
   where owner_user_id = 'eeeeeeee-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T13 FAIL: the whole businessProfile patch touched % rows (expected 1) — the fix over-revoked', n;
  end if;
  update public.business_profiles set metadata = '{"settings":{"department":"الشؤون القانونية"}}'::jsonb
   where owner_user_id = 'eeeeeeee-0000-0000-0000-000000000005';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T13 FAIL: the corporate entitySettings write touched % rows (expected 1)', n;
  end if;
  raise notice 'T13 PASS: C writes all six identity columns in one statement, and metadata';
end $$;
do $$
declare c text;
begin
  if to_regclass('public.business_profiles') is null then return; end if;
  foreach c in array array['verification_status','plan_id','size',
                           'legal_structure','company_name_en'] loop
    begin
      execute format('update public.business_profiles set %I = %L where owner_user_id = %L',
        c,
        case c
          when 'verification_status' then 'verified'
          when 'plan_id'             then 'enterprise'
          when 'size'                then 'enterprise'
          when 'legal_structure'     then 'holding'
          else 'Forged Co.'
        end,
        'eeeeeeee-0000-0000-0000-000000000005');
      raise exception 'T13 FAIL: C wrote business_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T13 PASS: business_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;
do $$
begin
  if to_regclass('public.business_profiles') is null then return; end if;
  insert into public.business_profiles (owner_user_id, company_name_ar, verification_status)
  values ('eeeeeeee-0000-0000-0000-000000000005', 'شركة ثانية', 'verified');
  raise exception 'T13 FAIL: C inserted a business_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T13 PASS: C''s INSERT into business_profiles refused (42501)';
end $$;

-- T14 — government_profiles (`role` is a claim about state office;
--       `restricted_from` is the conflict-of-interest wall)
select set_config('test.uid', 'ffffffff-0000-0000-0000-000000000006', false);
do $$
declare n int;
begin
  if to_regclass('public.government_profiles') is null then
    raise notice 'T14 SKIP: public.government_profiles is not in this chain';
    return;
  end if;
  update public.government_profiles set metadata = '{"settings":{"govRole":"مراجع قانوني"}}'::jsonb
   where owner_user_id = 'ffffffff-0000-0000-0000-000000000006';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T14 FAIL: the government entitySettings write touched % rows (expected 1)', n;
  end if;
  raise notice 'T14 PASS: G writes metadata, 1 row';
end $$;
do $$
declare c text;
begin
  if to_regclass('public.government_profiles') is null then return; end if;
  foreach c in array array['verification_status','role','restricted_from',
                           'integrations','entity_type','plan_id'] loop
    begin
      execute format('update public.government_profiles set %I = %L where owner_user_id = %L',
        c,
        case c
          when 'verification_status' then 'verified'
          when 'role'                then 'judge'
          when 'restricted_from'     then '{}'
          when 'integrations'        then '[]'
          when 'entity_type'         then 'court'
          else 'enterprise'
        end,
        'ffffffff-0000-0000-0000-000000000006');
      raise exception 'T14 FAIL: G wrote government_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T14 PASS: government_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;
do $$
begin
  if to_regclass('public.government_profiles') is null then return; end if;
  insert into public.government_profiles (owner_user_id, entity_name_ar, entity_type, verification_status)
  values ('ffffffff-0000-0000-0000-000000000006', 'محكمة', 'court', 'verified');
  raise exception 'T14 FAIL: G inserted a government_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T14 PASS: G''s INSERT into government_profiles refused (42501)';
end $$;

-- T15 — ngo_profiles
select set_config('test.uid', '11111111-0000-0000-0000-000000000007', false);
do $$
declare n int;
begin
  if to_regclass('public.ngo_profiles') is null then
    raise notice 'T15 SKIP: public.ngo_profiles is not in this chain';
    return;
  end if;
  update public.ngo_profiles set metadata = '{"settings":{"roleTitle":"مدير البرامج"}}'::jsonb
   where owner_user_id = '11111111-0000-0000-0000-000000000007';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T15 FAIL: the ngo entitySettings write touched % rows (expected 1)', n;
  end if;
  raise notice 'T15 PASS: N writes metadata, 1 row';
end $$;
do $$
declare c text;
begin
  if to_regclass('public.ngo_profiles') is null then return; end if;
  foreach c in array array['verification_status','compliance_status','plan_id',
                           'org_type','board_seats'] loop
    begin
      execute format('update public.ngo_profiles set %I = %L where owner_user_id = %L',
        c,
        case c
          when 'verification_status' then 'verified'
          when 'compliance_status'   then 'compliant'
          when 'plan_id'             then 'enterprise'
          when 'org_type'            then 'waqf'
          else '99'
        end,
        '11111111-0000-0000-0000-000000000007');
      raise exception 'T15 FAIL: N wrote ngo_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T15 PASS: ngo_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;
do $$
begin
  if to_regclass('public.ngo_profiles') is null then return; end if;
  insert into public.ngo_profiles (owner_user_id, org_name_ar, org_type, verification_status)
  values ('11111111-0000-0000-0000-000000000007', 'جمعية ثانية', 'waqf', 'verified');
  raise exception 'T15 FAIL: N inserted an ngo_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T15 PASS: N''s INSERT into ngo_profiles refused (42501)';
end $$;

-- T16 — micro_profiles (no verification_status; `litigation_boundary` is the
--       capability switch this table has instead)
select set_config('test.uid', '22222222-0000-0000-0000-000000000008', false);
do $$
declare n int;
begin
  if to_regclass('public.micro_profiles') is null then
    raise notice 'T16 SKIP: public.micro_profiles is not in this chain';
    return;
  end if;
  if not exists (select 1 from public.micro_profiles
                  where user_id = '22222222-0000-0000-0000-000000000008') then
    raise notice 'T16 SKIP: no micro fixture row (the entity fixture block skipped)';
    return;
  end if;
  update public.micro_profiles set metadata = '{"settings":{"activityType":"تجارة تجزئة"}}'::jsonb
   where user_id = '22222222-0000-0000-0000-000000000008';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T16 FAIL: the micro entitySettings write touched % rows (expected 1)', n;
  end if;
  raise notice 'T16 PASS: M writes metadata, 1 row';
end $$;
do $$
declare c text;
begin
  if to_regclass('public.micro_profiles') is null then return; end if;
  foreach c in array array['litigation_boundary','requirements_score',
                           'license_count','employee_count','business_name'] loop
    begin
      execute format('update public.micro_profiles set %I = %L where user_id = %L',
        c,
        case c
          when 'litigation_boundary' then 'case_tracking'
          when 'business_name'       then 'منشأة مزوَّرة'
          else '99'
        end,
        '22222222-0000-0000-0000-000000000008');
      raise exception 'T16 FAIL: M wrote micro_profiles.% — it is not in the allowlist', c;
    exception
      when insufficient_privilege then
        raise notice 'T16 PASS: micro_profiles.% refused (42501)', c;
    end;
  end loop;
end $$;
do $$
begin
  if to_regclass('public.micro_profiles') is null then return; end if;
  insert into public.micro_profiles (user_id, business_name, litigation_boundary)
  values ('22222222-0000-0000-0000-000000000008', 'منشأة ثانية', 'case_tracking');
  raise exception 'T16 FAIL: M inserted a micro_profiles row — INSERT is still granted';
exception
  when insufficient_privilege then
    raise notice 'T16 PASS: M''s INSERT into micro_profiles refused (42501)';
end $$;

-- T17 — the ROW layer on the entity tables is untouched either: C holds the
--       same column grants F holds, so only RLS can stop him writing F's firm
--       row — and it does, with 0 rows and no error.
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare n int;
begin
  if to_regclass('public.firm_profiles') is null then
    raise notice 'T17 SKIP: public.firm_profiles is not in this chain';
    return;
  end if;
  update public.firm_profiles set display_mode = 'full'
   where owner_user_id = 'dddddddd-0000-0000-0000-000000000004';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'T17 FAIL: C wrote % of F''s firm rows', n;
  end if;
  raise notice 'T17 PASS: C''s UPDATE of F''s firm row touched 0 rows';
end $$;

-- T18 — the anon key writes NOTHING on any of the seven tables. This is the
--       half the first version of the verify block checked on one table only:
--       a REVOKE that names `authenticated` and forgets `anon` leaves the key
--       that ships to every browser holding the whole surface.
reset role;
set role anon;
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('lawyer_profiles',     'verification_status', 'verified',      'user_id'),
      ('provider_profiles',   'verification_status', 'verified',      'user_id'),
      ('firm_profiles',       'verification_status', 'verified',      'owner_user_id'),
      ('business_profiles',   'verification_status', 'verified',      'owner_user_id'),
      ('government_profiles', 'verification_status', 'verified',      'owner_user_id'),
      ('ngo_profiles',        'verification_status', 'verified',      'owner_user_id'),
      ('micro_profiles',      'litigation_boundary', 'case_tracking', 'user_id')
    ) as v(tbl, col, val, owner_col)
  loop
    if to_regclass('public.' || t.tbl) is null then
      raise notice 'T18 SKIP: public.% is not in this chain', t.tbl;
      continue;
    end if;
    -- the trust column
    begin
      execute format('update public.%I set %I = %L where %I = %L',
        t.tbl, t.col, t.val, t.owner_col, '00000000-0000-0000-0000-000000000000');
      raise exception 'T18 FAIL: anon may UPDATE %.% — the revoke named authenticated only', t.tbl, t.col;
    exception
      when insufficient_privilege then
        raise notice 'T18 PASS: anon UPDATE of %.% refused (42501)', t.tbl, t.col;
    end;
    -- and the column `authenticated` IS allowed to write: anon gets nothing,
    -- not "the same list minus the dangerous ones".
    begin
      execute format('update public.%I set metadata = %L where %I = %L',
        t.tbl, '{}', t.owner_col, '00000000-0000-0000-0000-000000000000');
      raise exception 'T18 FAIL: anon may UPDATE %.metadata', t.tbl;
    exception
      when insufficient_privilege then
        raise notice 'T18 PASS: anon UPDATE of %.metadata refused (42501)', t.tbl;
    end;
  end loop;
end $$;
reset role;
set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);

-- ── footer ─────────────────────────────────────────────────────────────────
reset role;
select 'lawyer_profiles columns authenticated may UPDATE: ' || coalesce(string_agg(column_name, ', ' order by column_name), '(none)')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'lawyer_profiles'
   and has_column_privilege('authenticated', 'public.lawyer_profiles', column_name, 'UPDATE');
select 'lawyer_profiles columns authenticated may NOT update: ' || coalesce(string_agg(column_name, ', ' order by column_name), '(none)')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'lawyer_profiles'
   and not has_column_privilege('authenticated', 'public.lawyer_profiles', column_name, 'UPDATE');
select 'provider_profiles columns authenticated may UPDATE: ' || coalesce(string_agg(column_name, ', ' order by column_name), '(none)')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'provider_profiles'
   and has_column_privilege('authenticated', 'public.provider_profiles', column_name, 'UPDATE');
select 'INSERT still granted to authenticated/anon on either table (expect f/f/f/f): '
       || has_table_privilege('authenticated','public.lawyer_profiles','INSERT')::text   || '/'
       || has_table_privilege('anon','public.lawyer_profiles','INSERT')::text            || '/'
       || has_table_privilege('authenticated','public.provider_profiles','INSERT')::text || '/'
       || has_table_privilege('anon','public.provider_profiles','INSERT')::text;
select 'row-scoped UPDATE policies still present (expect 2): ' || count(*)
  from pg_policy
 where polrelid in ('public.lawyer_profiles'::regclass, 'public.provider_profiles'::regclass)
   and polname in ('lawyers update own profile', 'providers update own profile');

-- The same two summaries for the five tables 20260922_03 added. `(absent)`
-- rather than silence when the chain does not carry a table: a blank line is
-- indistinguishable from "nothing is writable", which is the answer this file
-- exists to establish.
select coalesce(
  (select t.tbl || ' columns authenticated may UPDATE: ' ||
          coalesce((select string_agg(column_name, ', ' order by column_name)
                      from information_schema.columns
                     where table_schema = 'public' and table_name = t.tbl
                       and has_column_privilege('authenticated', 'public.' || t.tbl, column_name, 'UPDATE')),
                   '(none)')),
  t.tbl || ': (absent from this chain)')
  from (values ('firm_profiles'), ('business_profiles'), ('government_profiles'),
               ('ngo_profiles'), ('micro_profiles')) as t(tbl)
 where to_regclass('public.' || t.tbl) is not null;
select 'anon may UPDATE nothing on the seven profile tables (expect (none)): ' ||
       coalesce(string_agg(distinct table_name || '.' || column_name, ', '), '(none)')
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('lawyer_profiles','provider_profiles','firm_profiles',
                      'business_profiles','government_profiles','ngo_profiles',
                      'micro_profiles')
   and has_column_privilege('anon', 'public.' || table_name, column_name, 'UPDATE');
select 'INSERT still granted to authenticated/anon on the five added tables (expect all f): ' ||
       coalesce(string_agg(t.tbl || '=' ||
         has_table_privilege('authenticated', 'public.' || t.tbl, 'INSERT')::text || '/' ||
         has_table_privilege('anon',          'public.' || t.tbl, 'INSERT')::text, ', ' order by t.tbl), '(absent)')
  from (values ('firm_profiles'), ('business_profiles'), ('government_profiles'),
               ('ngo_profiles'), ('micro_profiles')) as t(tbl)
 where to_regclass('public.' || t.tbl) is not null;
select 'row-scoped UPDATE policies still present on all seven (expect 7): ' || count(*)
  from pg_policy
 where polname in ('lawyers update own profile', 'providers update own profile',
                   'micro owners update own profile',
                   'firm_profiles: owner can update', 'business_profiles: owner can update',
                   'government_profiles: owner can update', 'ngo_profiles: owner can update')
   and polcmd = 'w';
