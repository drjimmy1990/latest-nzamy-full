-- RLS acceptance test for 20260921_03_entity_rls_recursion_fix.sql — UAT-TEAM-001
-- (and the business arm of UAT-BIZ-001 / UAT-TENANT-003, which cannot run while
-- business_members raises 42P17).
--
-- CHAIN (run.sh / run-local.sh, in this order):
--   supabase/tests/rls/prelude_entity_rls_chain.sql                     ← drops the stub firm
--       tables; its header explains why the chain starts at 20260616 and not at
--       20260603_phase1_002_entities.sql (that file's entity policies reference the
--       *_members tables dozens of lines before it creates them, so it cannot load
--       standalone; 20260616 re-creates every one of its policies verbatim).
--   supabase/migrations/20260616_entities_setup_and_rls_fix.sql         ← the 8 tables + the recursive policy pairs
--   supabase/migrations/20260617_fix_remaining_rls.sql                  ← the 8 "admins read all …" policies
--   supabase/migrations/20260903_phase2_clients_and_firm_membership.sql ← is_active_*_member() helpers, co-members arm only
--   supabase/migrations/20260914_entity_memberships_and_business_requests.sql ← service_requests.business_id + its policy
--   supabase/tests/rls/prelude_entity_recursion_defect_proof.sql        ← PROVES 42P17 on all four membership tables
--   supabase/migrations/20260921_03_entity_rls_recursion_fix.sql
--   supabase/migrations/20260922_02_members_accept_own_invitation.sql  ← the 5th
--       policy on every *_members table: the arm an invitee uses to answer their
--       own invitation (review A5/F03). It is in this chain so that T1-T8 below
--       prove 20260921_03's matrix still behaves with it present; what the arm
--       itself does is proved in members_accept_own_invitation.test.sql.
--   supabase/tests/rls/entity_members_no_recursion.test.sql             ← this file
--
-- Actors (one set, reused across all four entities):
--   O  00000000-…00f  owner of the firm, company, government entity and NGO
--   M  cccccccc-…003  active member of all four
--   X  bbbbbbbb-…002  outsider
--   D  dddddddd-…004  admin
--
-- No `\set ON_ERROR_STOP 0`: every `raise exception` below fails the run.
\pset format unaligned
\pset tuples_only on

-- ── fixtures as postgres (RLS bypassed on purpose) ─────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000f'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000004'),
  ('99999999-0000-0000-0000-000000000001'),
  ('99999999-0000-0000-0000-000000000002'),
  ('99999999-0000-0000-0000-000000000003'),
  ('99999999-0000-0000-0000-000000000004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000000f','firm','O'),
  ('cccccccc-0000-0000-0000-000000000003','lawyer','M'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','X'),
  ('dddddddd-0000-0000-0000-000000000004','admin','D'),
  ('99999999-0000-0000-0000-000000000001','lawyer','N1'),
  ('99999999-0000-0000-0000-000000000002','corporate','N2'),
  ('99999999-0000-0000-0000-000000000003','government','N3'),
  ('99999999-0000-0000-0000-000000000004','ngo','N4');

-- One entity of each kind, all owned by O. The firm and the company gain an
-- owner membership row automatically (20260903:266 trigger, 20260914:38
-- trigger); government and NGO have no such trigger, which is why the expected
-- row counts below differ by entity.
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','مكتب الاختبار');
insert into public.business_profiles (id, owner_user_id, company_name_ar) values
  ('ffffffff-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000f','شركة الاختبار');
insert into public.government_profiles (id, owner_user_id, entity_name_ar, entity_type) values
  ('ffffffff-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000f','جهة الاختبار','ministry');
insert into public.ngo_profiles (id, owner_user_id, org_name_ar, org_type) values
  ('ffffffff-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000f','جمعية الاختبار','charity');

insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
  values ('ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','lawyer','active', now());
insert into public.business_members (business_id, user_id, role, status, accepted_at)
  values ('ffffffff-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-000000000003','legal_staff','active', now());
insert into public.government_members (gov_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-000000000003','officer','active');
insert into public.ngo_members (ngo_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000d1','cccccccc-0000-0000-0000-000000000003','volunteer','active');

-- A company request that only the business arm of the policy set can reach:
-- the requester is O, nobody is assigned, and firm_id is null.
insert into public.service_requests (id, requester_user_id, title, business_id)
  values ('req-biz-1','00000000-0000-0000-0000-00000000000f','طلب الشركة','ffffffff-0000-0000-0000-0000000000b1');

select 'T0 policy counts after 20260921_03 + 20260922_02 (expect 3 per *_profiles, 5 per *_members): '
       || string_agg(c.relname || '=' || (select count(*) from pg_policy p where p.polrelid = c.oid),
                     ' · ' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('firm_profiles','firm_members','business_profiles','business_members',
                     'government_profiles','government_members','ngo_profiles','ngo_members');

-- ── from here on: app_user, impersonating via test.uid ─────────────────────
set role app_user;

-- ── T1–T6, once per entity ─────────────────────────────────────────────────
do $$
declare
  e            record;
  n            int;
  owner_id     constant text := '00000000-0000-0000-0000-00000000000f';
  member_id    constant text := 'cccccccc-0000-0000-0000-000000000003';
  outsider_id  constant text := 'bbbbbbbb-0000-0000-0000-000000000002';
  admin_id     constant text := 'dddddddd-0000-0000-0000-000000000004';
begin
  for e in
    select * from (values
      ('firm',       'firm_profiles',       'firm_members',       'firm_id',     'ffffffff-0000-0000-0000-0000000000f1', 'lawyer',      '99999999-0000-0000-0000-000000000001', 2),
      ('business',   'business_profiles',   'business_members',   'business_id', 'ffffffff-0000-0000-0000-0000000000b1', 'legal_staff', '99999999-0000-0000-0000-000000000002', 2),
      ('government', 'government_profiles', 'government_members', 'gov_id',      'ffffffff-0000-0000-0000-0000000000c1', 'officer',     '99999999-0000-0000-0000-000000000003', 1),
      ('ngo',        'ngo_profiles',        'ngo_members',        'ngo_id',      'ffffffff-0000-0000-0000-0000000000d1', 'volunteer',   '99999999-0000-0000-0000-000000000004', 1)
    ) as v(label, ptbl, mtbl, fk, entity_id, member_role, new_user, expected_rows)
  loop
    -- T1 owner reads the membership list, with no 42P17
    perform set_config('test.uid', owner_id, false);
    execute format('select count(*) from public.%I', e.mtbl) into n;
    if n <> e.expected_rows then
      raise exception 'T1 FAIL [%]: owner sees % row(s) in %, expected %', e.label, n, e.mtbl, e.expected_rows;
    end if;
    execute format('select count(*) from public.%I', e.ptbl) into n;
    if n <> 1 then
      raise exception 'T1 FAIL [%]: owner sees % row(s) in %, expected 1', e.label, n, e.ptbl;
    end if;
    raise notice 'T1 PASS [%]: owner reads % (% rows) and % (1 row) without recursion', e.label, e.mtbl, e.expected_rows, e.ptbl;

    -- T2 an active member reads co-members and the entity profile
    perform set_config('test.uid', member_id, false);
    execute format('select count(*) from public.%I', e.mtbl) into n;
    if n <> e.expected_rows then
      raise exception 'T2 FAIL [%]: member sees % co-member row(s) in %, expected %', e.label, n, e.mtbl, e.expected_rows;
    end if;
    execute format('select count(*) from public.%I', e.ptbl) into n;
    if n <> 1 then
      raise exception 'T2 FAIL [%]: member sees % row(s) in %, expected 1 (this was the 42P17 cycle)', e.label, n, e.ptbl;
    end if;
    raise notice 'T2 PASS [%]: member reads co-members (%) and the entity profile without recursion', e.label, e.expected_rows;

    -- T3 an outsider sees nothing at all
    perform set_config('test.uid', outsider_id, false);
    execute format('select count(*) from public.%I', e.mtbl) into n;
    if n <> 0 then
      raise exception 'T3 FAIL [%]: outsider sees % row(s) in %', e.label, n, e.mtbl;
    end if;
    execute format('select count(*) from public.%I', e.ptbl) into n;
    if n <> 0 then
      raise exception 'T3 FAIL [%]: outsider sees % row(s) in %', e.label, n, e.ptbl;
    end if;
    raise notice 'T3 PASS [%]: outsider sees 0 rows in % and %', e.label, e.mtbl, e.ptbl;

    -- T4 the owner may add, change and remove a membership row
    perform set_config('test.uid', owner_id, false);
    execute format(
      'insert into public.%I (%I, user_id, role, status) values (%L, %L, %L, %L)',
      e.mtbl, e.fk, e.entity_id, e.new_user, e.member_role, 'invited');

    -- …with ONE exception since 20260922_02 (review 2026-09-21 A5 / F03):
    -- `invited -> active` is the owner write that is now refused, because it
    -- is the invitee's answer and nobody else's. This step used to be exactly
    -- that update — written when `invited` meant nothing and there was no
    -- acceptance flow to bypass. Only firm/business: government_members and
    -- ngo_members have no `accepted_at` column, so there is no evidence of
    -- consent to check there, and no invitation surface in the product either.
    -- What the whole flow proves is in members_accept_own_invitation.test.sql.
    if e.mtbl in ('firm_members', 'business_members') then
      begin
        execute format('update public.%I set status = %L where user_id = %L', e.mtbl, 'active', e.new_user);
        raise exception 'T4 FAIL [%]: the owner answered an invitation on the invitee''s behalf in % (A5/F03)', e.label, e.mtbl;
      exception when insufficient_privilege then
        raise notice 'T4 PASS [%]: the owner could not answer the invitation in % (A5/F03)', e.label, e.mtbl;
      end;
    end if;

    -- What the owner MAY still do with a pending invitation: cancel it.
    execute format('update public.%I set status = %L where user_id = %L', e.mtbl, 'removed', e.new_user);
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'T4 FAIL [%]: owner updated % row(s) in %, expected 1', e.label, n, e.mtbl;
    end if;
    raise notice 'T4 PASS [%]: owner inserted and cancelled a membership invitation in %', e.label, e.mtbl;

    -- T5 a plain member may not write the membership table
    perform set_config('test.uid', member_id, false);
    begin
      execute format(
        'insert into public.%I (%I, user_id, role, status) values (%L, %L, %L, %L)',
        e.mtbl, e.fk, e.entity_id, outsider_id, e.member_role, 'active');
      raise exception 'T5 FAIL [%]: a member inserted a row into %', e.label, e.mtbl;
    exception when insufficient_privilege then
      raise notice 'T5 PASS [%]: a member''s INSERT into % refused (42501)', e.label, e.mtbl;
    end;
    execute format('update public.%I set status = %L where user_id = %L', e.mtbl, 'suspended', e.new_user);
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'T5 FAIL [%]: a member updated % row(s) in %', e.label, n, e.mtbl;
    end if;
    execute format('delete from public.%I where user_id = %L', e.mtbl, e.new_user);
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'T5 FAIL [%]: a member deleted % row(s) from %', e.label, n, e.mtbl;
    end if;
    raise notice 'T5 PASS [%]: a member''s UPDATE and DELETE on % touched 0 rows', e.label, e.mtbl;

    -- T6 the owner may remove the row again (the DELETE arm 20260921_03 adds)
    perform set_config('test.uid', owner_id, false);
    execute format('delete from public.%I where user_id = %L', e.mtbl, e.new_user);
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'T6 FAIL [%]: owner deleted % row(s) from %, expected 1', e.label, n, e.mtbl;
    end if;
    raise notice 'T6 PASS [%]: owner deleted the membership row from %', e.label, e.mtbl;

    -- T7 the admin reads both tables through public.is_admin()
    perform set_config('test.uid', admin_id, false);
    execute format('select count(*) from public.%I', e.mtbl) into n;
    if n <> e.expected_rows then
      raise exception 'T7 FAIL [%]: admin sees % row(s) in %, expected %', e.label, n, e.mtbl, e.expected_rows;
    end if;
    execute format('select count(*) from public.%I', e.ptbl) into n;
    if n <> 1 then
      raise exception 'T7 FAIL [%]: admin sees % row(s) in %, expected 1', e.label, n, e.ptbl;
    end if;
    raise notice 'T7 PASS [%]: admin reads % and %', e.label, e.mtbl, e.ptbl;
  end loop;
end $$;

-- ── T8 the business arm of 20260914's service_requests policy ──────────────
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
select 'T8 business member reads the company request (expect 1): ' || count(*)
  from public.service_requests where id = 'req-biz-1';
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'req-biz-1';
  if n <> 1 then
    raise exception 'T8 FAIL: the business member cannot read the company request (20260914 policy / is_active_business_member)';
  end if;
  raise notice 'T8 PASS: the business member reads the company request through public.is_active_business_member()';
end $$;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T8 outsider reads the company request (expect 0): ' || count(*)
  from public.service_requests where id = 'req-biz-1';
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'req-biz-1';
  if n <> 0 then
    raise exception 'T8 FAIL: an outsider reads the company request';
  end if;
  raise notice 'T8 PASS: an outsider reads none of the company requests';
end $$;

-- ── footer ─────────────────────────────────────────────────────────────────
reset role;
select 'policies: ' || string_agg(c.relname || '=' || (select count(*) from pg_policy p where p.polrelid = c.oid),
                                  ' · ' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('firm_profiles','firm_members','business_profiles','business_members',
                     'government_profiles','government_members','ngo_profiles','ngo_members');
select 'helper functions (expect 8): ' || count(*)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('is_active_firm_member','is_active_business_member','is_active_government_member','is_active_ngo_member',
                     'is_firm_owner','is_business_owner','is_government_owner','is_ngo_owner')
   and p.prosecdef;
select 'policies on the 8 tables that read an entity table inline (expect 0): ' || count(*)
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('firm_profiles','firm_members','business_profiles','business_members',
                     'government_profiles','government_members','ngo_profiles','ngo_members')
   and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
        coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
       ~* '(from|join)[[:space:]]+(public\.)?(firm|business|government|ngo)_(members|profiles)';
