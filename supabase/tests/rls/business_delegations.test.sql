-- RLS/GRANT acceptance test for 20261017_30_business_delegations.sql
-- (owner decision ٣٦: company data is edited by the owner account or a
-- delegate registered in جدول التفويضات; owner decision ٥ «التفويض»).
--
-- CHAIN (docker postgres:16-alpine):
--
--   supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_profiles_rls_chain.sql \
--     supabase/tests/rls/prelude_entity_rls_chain.sql \
--     supabase/migrations/20260603_phase1_001_profiles.sql \
--     supabase/migrations/20260614_auto_create_role_profiles.sql \
--     supabase/migrations/20260616_production_readiness_fixes.sql \
--     supabase/migrations/20260616_entities_setup_and_rls_fix.sql \
--     supabase/migrations/20260617_fix_remaining_rls.sql \
--     supabase/migrations/20260625_fix_rls_recursion.sql \
--     supabase/migrations/20260821_fix_provider_signup_sub_role.sql \
--     supabase/migrations/20260826_corporate_identity_persisted.sql \
--     supabase/migrations/20260903_phase2_clients_and_firm_membership.sql \
--     supabase/migrations/20260906_court_costs_and_firm_profile_fields.sql \
--     supabase/migrations/20260906_phase6_settings_out_of_browser.sql \
--     supabase/migrations/20260907_phase7_profile_services_reviews.sql \
--     supabase/migrations/20260914_entity_memberships_and_business_requests.sql \
--     supabase/migrations/20260921_03_entity_rls_recursion_fix.sql \
--     supabase/migrations/20260922_03_lawyer_provider_column_grants.sql \
--     supabase/migrations/20261016_02_profiles_members_write_lock.sql \
--     supabase/migrations/20261017_30_business_delegations.sql \
--     supabase/tests/rls/business_delegations.test.sql
--
-- The chain is the 20260922_03 chain (lawyer_provider_column_grants.test.sql,
-- which explains every link) plus 20260617, 20260903_phase2 and 20260914 for
-- business_members, its owner-membership trigger and the helpers, and
-- 20261016_02 for the live no-delete posture of the membership tables.
--
-- WHAT IT PROVES
--   N1  NEGATIVE CONTROL — before any delegation, an active member (even a
--       legal_manager) updates 0 company rows. This is the WP-6 owner-only
--       state the migration must keep for everyone who is not delegated.
--   D1  the owner registers a delegate; granted_by/granted_at are the server's
--   D2  the delegate updates company_name_ar (1 row)
--   D3  …but not verification_status / plan_id (42501 — 20260922_03's columns)
--   D4  …and cannot register delegations themselves (42501 RLS)
--   D5  metadata.features stays as the admin set it, for the delegate AND the
--       owner; metadata.settings is still written
--   D6  another member without a delegation still updates 0 rows
--   G1  the owner cannot delegate to an outsider, to themselves, or with a past
--       expiry (23514); a second live delegation for the same member is 23505
--   R1  revoke → the delegate updates 0 rows; revoked_at/revoked_by are the
--       server's; a revoked row cannot be revived or edited (23514)
--   R2  an expired delegation grants nothing
--   R3  suspending the member lapses a live delegation by itself
--   V1  anon reads nothing (42501); an outsider reads 0 rows; a member reads
--       the register; nobody deletes (42501)
--   V2  the server (no auth.uid()) can still write metadata.features
--
-- NEGATIVE CONTROL OF THE WHOLE FILE: drop 20261017_30 from the chain and the
-- run stops at D1 (relation business_delegations does not exist), and the
-- policy half is shown by N1 itself: it is the state before the migration.
--
-- WHY app_user's DIRECT grants are revoked below: see
-- lawyer_provider_column_grants.test.sql — stubs.sql hands app_user a direct
-- `grant all` on every table, which would satisfy every 42501 assertion here.
\pset format unaligned
\pset tuples_only on

create table if not exists public.user_settings (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── fixtures as postgres ────────────────────────────────────────────────────
--   O  eeeeeeee-…005  corporate owner (handle_new_user builds business_profiles)
--   D  aaaaaaaa-…001  individual, active member, will be the delegate
--   M  bbbbbbbb-…002  individual, active member (legal_manager), never delegated
--   X  cccccccc-…003  individual, outsider
insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000005', 'o@example.com',
     '{"user_type":"corporate","company_name":"شركة نظامي","cr_number":"1010000001"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'd@example.com',
     '{"user_type":"individual","display_name":"المفوّض"}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'm@example.com',
     '{"user_type":"individual","display_name":"مدير قانوني"}'::jsonb),
  ('cccccccc-0000-0000-0000-000000000003', 'x@example.com',
     '{"user_type":"individual","display_name":"غريب"}'::jsonb);

do $$
declare b uuid;
begin
  select id into b from public.business_profiles where owner_user_id = 'eeeeeeee-0000-0000-0000-000000000005';
  if b is null then raise exception 'FIXTURE FAIL: handle_new_user built no business_profiles row for O'; end if;
  insert into public.business_members (business_id, user_id, role, status, accepted_at) values
    (b, 'aaaaaaaa-0000-0000-0000-000000000001', 'legal_staff',   'active', now()),
    (b, 'bbbbbbbb-0000-0000-0000-000000000002', 'legal_manager', 'active', now());
  -- the admin console's flag bag, as /api/v1/admin/corporates writes it
  update public.business_profiles
     set metadata = jsonb_build_object('features', jsonb_build_object('hasLitigation', false))
   where id = b;
  perform set_config('test.bid', b::text, false);
end $$;

revoke all on public.business_profiles    from app_user;
revoke all on public.business_members     from app_user;
revoke all on public.business_delegations from app_user;

-- ── from here on: app_user (a member of `authenticated`), RLS enforced ─────
set role app_user;

-- N1 — negative control: membership alone (even legal_manager) edits nothing
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  update public.business_profiles set company_name_ar = 'تعديل عضو'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'N1 FAIL: a member with no delegation updated % company rows', n; end if;
  raise notice 'N1 PASS: an active legal_manager with no delegation updates 0 company rows';
end $$;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  update public.business_profiles set company_name_ar = 'تعديل قبل التفويض'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'N1 FAIL: D updated % company rows before any delegation', n; end if;
  if public.is_business_profile_editor(current_setting('test.bid')::uuid) then
    raise exception 'N1 FAIL: is_business_profile_editor is true for D before any delegation';
  end if;
  raise notice 'N1 PASS: D (member) updates 0 rows and is not an editor before the delegation';
end $$;

-- D1 — the owner registers D; the server sets granted_by/granted_at
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare row public.business_delegations%rowtype;
begin
  insert into public.business_delegations (business_id, delegate_user_id, scope, note)
  values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001', 'company_profile', 'تحديث بيانات المنشأة')
  returning * into row;
  if row.granted_by is distinct from 'eeeeeeee-0000-0000-0000-000000000005'::uuid then
    raise exception 'D1 FAIL: granted_by is % (expected the owner)', row.granted_by;
  end if;
  if row.revoked_at is not null then raise exception 'D1 FAIL: the row was born revoked'; end if;
  raise notice 'D1 PASS: the owner registered D; granted_by = owner, not revoked';
end $$;

-- D2 — the delegate edits the company data
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  if not public.is_business_profile_editor(current_setting('test.bid')::uuid) then
    raise exception 'D2 FAIL: is_business_profile_editor is false for the registered delegate';
  end if;
  update public.business_profiles set company_name_ar = 'شركة نظامي المحدودة', cr_number = '1010000002'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'D2 FAIL: the delegate updated % rows (expected 1)', n; end if;
  raise notice 'D2 PASS: the registered delegate updated the company name and CR (1 row)';
end $$;

-- D3 — the privileged columns stay closed to the delegate
do $$
begin
  update public.business_profiles set verification_status = 'verified'
   where id = current_setting('test.bid')::uuid;
  raise exception 'D3 FAIL: the delegate set verification_status';
exception when insufficient_privilege then
  raise notice 'D3 PASS: verification_status refused for the delegate (42501)';
end $$;
do $$
begin
  update public.business_profiles set plan_id = 'enterprise'
   where id = current_setting('test.bid')::uuid;
  raise exception 'D3 FAIL: the delegate set plan_id';
exception when insufficient_privilege then
  raise notice 'D3 PASS: plan_id refused for the delegate (42501)';
end $$;

-- D4 — a delegate cannot delegate
do $$
begin
  insert into public.business_delegations (business_id, delegate_user_id)
  values (current_setting('test.bid')::uuid, 'bbbbbbbb-0000-0000-0000-000000000002');
  raise exception 'D4 FAIL: the delegate registered another delegate';
exception when insufficient_privilege then
  raise notice 'D4 PASS: the delegate cannot register delegations (42501 RLS)';
end $$;

-- D5 — metadata.features is the admin's, for the delegate and for the owner
do $$
declare f jsonb; s jsonb;
begin
  update public.business_profiles
     set metadata = jsonb_build_object('features', jsonb_build_object('hasLitigation', true),
                                       'settings', jsonb_build_object('city', 'الرياض'))
   where id = current_setting('test.bid')::uuid;
  select metadata -> 'features', metadata -> 'settings' into f, s
    from public.business_profiles where id = current_setting('test.bid')::uuid;
  if f is distinct from '{"hasLitigation": false}'::jsonb then
    raise exception 'D5 FAIL: the delegate changed metadata.features to %', f;
  end if;
  if s ->> 'city' is distinct from 'الرياض' then
    raise exception 'D5 FAIL: metadata.settings was not written (%)', s;
  end if;
  raise notice 'D5 PASS: the delegate wrote metadata.settings; metadata.features kept the admin value';
end $$;
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare f jsonb;
begin
  update public.business_profiles set metadata = '{}'::jsonb
   where id = current_setting('test.bid')::uuid;
  select metadata -> 'features' into f from public.business_profiles where id = current_setting('test.bid')::uuid;
  if f is distinct from '{"hasLitigation": false}'::jsonb then
    raise exception 'D5 FAIL: the owner erased or changed metadata.features (now %)', f;
  end if;
  raise notice 'D5 PASS: the owner cannot erase metadata.features either';
end $$;

-- D6 — another member, still not delegated, edits nothing
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  update public.business_profiles set company_name_ar = 'تعديل عضو آخر'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'D6 FAIL: an undelegated member updated % rows', n; end if;
  raise notice 'D6 PASS: an undelegated member still updates 0 rows';
end $$;

-- G1 — what the owner cannot register
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
begin
  insert into public.business_delegations (business_id, delegate_user_id)
  values (current_setting('test.bid')::uuid, 'cccccccc-0000-0000-0000-000000000003');
  raise exception 'G1 FAIL: an outsider was registered as a delegate';
exception when check_violation then
  raise notice 'G1 PASS: an outsider cannot be a delegate (23514)';
end $$;
do $$
begin
  insert into public.business_delegations (business_id, delegate_user_id)
  values (current_setting('test.bid')::uuid, 'eeeeeeee-0000-0000-0000-000000000005');
  raise exception 'G1 FAIL: the owner registered themselves';
exception when check_violation then
  raise notice 'G1 PASS: the owner cannot be their own delegate (23514)';
end $$;
do $$
begin
  insert into public.business_delegations (business_id, delegate_user_id, expires_on)
  values (current_setting('test.bid')::uuid, 'bbbbbbbb-0000-0000-0000-000000000002', current_date - 2);
  raise exception 'G1 FAIL: a delegation was registered with a past expiry';
exception when check_violation then
  raise notice 'G1 PASS: a past expires_on is refused (23514)';
end $$;
do $$
begin
  insert into public.business_delegations (business_id, delegate_user_id)
  values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001');
  raise exception 'G1 FAIL: a second live delegation for D was accepted';
exception when unique_violation then
  raise notice 'G1 PASS: one live delegation per member and power (23505)';
end $$;
do $$
begin
  delete from public.business_delegations where business_id = current_setting('test.bid')::uuid;
  raise exception 'G1 FAIL: the owner deleted the register';
exception when insufficient_privilege then
  raise notice 'G1 PASS: the register cannot be deleted (42501)';
end $$;

-- R1 — revoke
do $$
declare row public.business_delegations%rowtype;
begin
  update public.business_delegations
     set revoked_at = '2000-01-01'::timestamptz
   where business_id = current_setting('test.bid')::uuid
     and delegate_user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  returning * into row;
  if row.revoked_at is null or row.revoked_at < now() - interval '1 minute' then
    raise exception 'R1 FAIL: revoked_at was taken from the request (%)', row.revoked_at;
  end if;
  if row.revoked_by is distinct from 'eeeeeeee-0000-0000-0000-000000000005'::uuid then
    raise exception 'R1 FAIL: revoked_by is %', row.revoked_by;
  end if;
  raise notice 'R1 PASS: revoked with the server''s time and the owner as revoked_by';
end $$;
do $$
begin
  update public.business_delegations set revoked_at = null
   where business_id = current_setting('test.bid')::uuid
     and delegate_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise exception 'R1 FAIL: a revoked delegation was revived';
exception when check_violation then
  raise notice 'R1 PASS: a revoked delegation cannot be revived (23514)';
end $$;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  update public.business_profiles set company_name_ar = 'بعد الإلغاء'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'R1 FAIL: the revoked delegate updated % rows', n; end if;
  raise notice 'R1 PASS: after revocation the former delegate updates 0 rows';
end $$;

-- R2 — expiry: a delegation whose last day has passed grants nothing
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
insert into public.business_delegations (business_id, delegate_user_id, expires_on)
values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-000000000001', current_date + 30);
-- The guard refuses any edit of expires_on (even by postgres), so the clock is
-- moved past the last day by skipping triggers for this one fixture write.
reset role;
set session_replication_role = replica;
update public.business_delegations set expires_on = current_date - 1
 where delegate_user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and revoked_at is null;
set session_replication_role = origin;
set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare n int;
begin
  update public.business_profiles set company_name_ar = 'بعد الانتهاء'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'R2 FAIL: an expired delegation still edited % rows', n; end if;
  raise notice 'R2 PASS: an expired delegation grants nothing';
end $$;

-- R3 — suspending the member lapses the delegation
reset role;
set session_replication_role = replica;
update public.business_delegations set expires_on = null
 where delegate_user_id = 'aaaaaaaa-0000-0000-0000-000000000001' and revoked_at is null;
set session_replication_role = origin;
set role app_user;
do $$
begin
  if not public.is_business_profile_editor(current_setting('test.bid')::uuid) then
    raise exception 'R3 FAIL: setup — the renewed delegation is not live';
  end if;
end $$;
reset role;
update public.business_members set status = 'suspended'
 where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role app_user;
do $$
declare n int;
begin
  update public.business_profiles set company_name_ar = 'بعد الإيقاف'
   where id = current_setting('test.bid')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'R3 FAIL: a suspended member''s delegation still edited % rows', n; end if;
  raise notice 'R3 PASS: suspending the member lapses the delegation';
end $$;

-- V1 — who reads the register
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.business_delegations;
  if n < 2 then raise exception 'V1 FAIL: an active member reads % register rows (expected 2)', n; end if;
  raise notice 'V1 PASS: an active member reads the company register (% rows)', n;
end $$;
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.business_delegations;
  if n <> 0 then raise exception 'V1 FAIL: an outsider reads % register rows', n; end if;
  raise notice 'V1 PASS: an outsider reads 0 register rows';
end $$;
reset role;
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  perform count(*) from public.business_delegations;
  raise exception 'V1 FAIL: anon read the register';
exception when insufficient_privilege then
  raise notice 'V1 PASS: anon holds no privilege on the register (42501)';
end $$;
do $$
begin
  perform public.is_business_profile_editor(gen_random_uuid());
  raise exception 'V1 FAIL: anon executed is_business_profile_editor';
exception when insufficient_privilege then
  raise notice 'V1 PASS: anon cannot execute is_business_profile_editor (42501)';
end $$;

-- V2 — the server (service role: no auth.uid()) still writes the flags
reset role;
set role service_role;
do $$
declare f jsonb;
begin
  update public.business_profiles
     set metadata = jsonb_set(metadata, '{features}', '{"hasLitigation": true}'::jsonb)
   where id = current_setting('test.bid')::uuid;
  select metadata -> 'features' into f from public.business_profiles where id = current_setting('test.bid')::uuid;
  if f is distinct from '{"hasLitigation": true}'::jsonb then
    raise exception 'V2 FAIL: the server could not write metadata.features (%)', f;
  end if;
  raise notice 'V2 PASS: the server still writes metadata.features';
end $$;
reset role;

select 'business_delegations: all checks passed';
