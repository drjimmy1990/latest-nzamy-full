-- l9_secroles_business.test.sql — proves sections B and C of 20261129_10
--   (owner file 15 rows 3 and 36): company requests and the company roster by
--   ROLE, on the server; the company seat cap.
--
-- CHAIN (docker postgres:16-alpine; the business_delegations.test.sql chain,
-- plus the case files 20261125_40 needs). The migration runs TWICE:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_profiles_rls_chain.sql \
--     $T/prelude_entity_rls_chain.sql \
--     $M/20260603_phase1_001_profiles.sql \
--     $M/20260614_auto_create_role_profiles.sql \
--     $M/20260616_production_readiness_fixes.sql \
--     $M/20260616_entities_setup_and_rls_fix.sql \
--     $M/20260617_fix_remaining_rls.sql \
--     $M/20260625_fix_rls_recursion.sql \
--     $M/20260821_fix_provider_signup_sub_role.sql \
--     $M/20260826_corporate_identity_persisted.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260906_court_costs_and_firm_profile_fields.sql \
--     $M/20260906_phase6_settings_out_of_browser.sql \
--     $M/20260907_phase7_profile_services_reviews.sql \
--     $M/20260914_entity_memberships_and_business_requests.sql \
--     $M/20260921_03_entity_rls_recursion_fix.sql \
--     $M/20260922_02_members_accept_own_invitation.sql \
--     $M/20260922_03_lawyer_provider_column_grants.sql \
--     $M/20261016_02_profiles_members_write_lock.sql \
--     $M/20261017_30_business_delegations.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $M/20261129_10_firm_company_roles_seats.sql \
--     $M/20261129_10_firm_company_roles_seats.sql \
--     $T/l9_secroles_business.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261129_10
--   lines → «B1 FAIL: the employee reads requests [r-e,r-o] — expected [r-e]»
--   (every active member read every company request before this file).
--
-- People (company B, owner O built by handle_new_user from the signup metadata):
--   LM legal_manager · LS legal_staff · E employee · H hr_manager — all active
--   X  an outsider (individual)
-- Requests: r-o filed by O, r-e filed by E (both on B), r-x filed by X (none).
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- handle_new_user writes a user_settings row (the business_delegations test's stub).
create table if not exists public.user_settings (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-0000000009b0', 'o9@example.com',
     '{"user_type":"corporate","company_name":"شركة الأدوار","cr_number":"1010000009"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000009b1', 'lm9@example.com', '{"user_type":"individual","display_name":"مدير قانوني"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000009b2', 'ls9@example.com', '{"user_type":"individual","display_name":"أخصائي"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000009b3', 'e9@example.com',  '{"user_type":"individual","display_name":"موظف"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000009b4', 'h9@example.com',  '{"user_type":"individual","display_name":"موارد بشرية"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000009b5', 'x9@example.com',  '{"user_type":"individual","display_name":"غريب"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-0000000009b6', 'y9@example.com',  '{"user_type":"individual","display_name":"مرشح"}'::jsonb);

do $$
declare b uuid;
begin
  select id into b from public.business_profiles where owner_user_id = 'eeeeeeee-0000-0000-0000-0000000009b0';
  if b is null then raise exception 'FIXTURE FAIL: handle_new_user built no business_profiles row for O'; end if;
  insert into public.business_members (business_id, user_id, role, status, accepted_at) values
    (b, 'aaaaaaaa-0000-0000-0000-0000000009b1', 'legal_manager', 'active', now()),
    (b, 'aaaaaaaa-0000-0000-0000-0000000009b2', 'legal_staff',   'active', now()),
    (b, 'aaaaaaaa-0000-0000-0000-0000000009b3', 'employee',      'active', now()),
    (b, 'aaaaaaaa-0000-0000-0000-0000000009b4', 'hr_manager',    'active', now());
  insert into public.service_requests (id, requester_user_id, title, business_id) values
    ('r-o', 'eeeeeeee-0000-0000-0000-0000000009b0', 'طلب المالك', b),
    ('r-e', 'aaaaaaaa-0000-0000-0000-0000000009b3', 'طلب الموظف', b),
    ('r-x', 'aaaaaaaa-0000-0000-0000-0000000009b5', 'طلب الغريب', null);
  perform set_config('test.bid', b::text, false);
end $$;

revoke all on public.business_profiles from app_user;
revoke all on public.business_members  from app_user;

create or replace function pg_temp.view() returns text language sql as $$
  select 'requests [' || coalesce((select string_agg(id, ',' order by id) from public.service_requests where id like 'r-%'), '') || ']'
      || ' | roster ' || (select count(*) from public.business_members where business_id = current_setting('test.bid')::uuid);
$$;
grant execute on function pg_temp.view() to app_user;

create or replace function pg_temp.expect(p_who text, p_uid text, p_label text, p_expected text) returns void language plpgsql as $$
declare got text;
begin
  perform set_config('test.uid', p_uid, false);
  got := pg_temp.view();
  if got is distinct from p_expected then
    raise exception '% FAIL: % reads % — expected %', p_label, p_who, got, p_expected;
  end if;
  raise notice '% PASS: % reads %', p_label, p_who, got;
end $$;
grant execute on function pg_temp.expect(text, text, text, text) to app_user;

set role app_user;

-- ── B1 an employee: the request he filed and his own roster row ────────────
select pg_temp.expect('the employee', 'aaaaaaaa-0000-0000-0000-0000000009b3', 'B1', 'requests [r-e] | roster 1');
-- ── B2 legal staff: every company request, but not the roster (his own row) ─
select pg_temp.expect('legal staff', 'aaaaaaaa-0000-0000-0000-0000000009b2', 'B2', 'requests [r-e,r-o] | roster 1');
-- ── B3 the legal manager: requests and roster ───────────────────────────────
select pg_temp.expect('the legal manager', 'aaaaaaaa-0000-0000-0000-0000000009b1', 'B3', 'requests [r-e,r-o] | roster 5');
-- ── B4 the HR manager: the roster, not the requests ─────────────────────────
select pg_temp.expect('the HR manager', 'aaaaaaaa-0000-0000-0000-0000000009b4', 'B4', 'requests [] | roster 5');
-- ── B5 the owner: everything ─────────────────────────────────────────────────
select pg_temp.expect('the owner', 'eeeeeeee-0000-0000-0000-0000000009b0', 'B5', 'requests [r-e,r-o] | roster 5');
-- ── B6 an outsider: his own request only, no roster ─────────────────────────
select pg_temp.expect('an outsider', 'aaaaaaaa-0000-0000-0000-0000000009b5', 'B6', 'requests [r-x] | roster 0');

-- ── B7 the seat status is for roster managers only ──────────────────────────
do $$
declare u int; c int;
begin
  perform set_config('test.uid', 'eeeeeeee-0000-0000-0000-0000000009b0', false);
  select used, cap into u, c from public.business_seat_status(current_setting('test.bid')::uuid);
  if (u, c) is distinct from (5, 5) then raise exception 'B7 FAIL: owner seat status (%, %) — expected (5, 5)', u, c; end if;
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-0000000009b3', false);
  begin
    perform public.business_seat_status(current_setting('test.bid')::uuid);
    raise exception 'B7 FAIL: the employee read the seat status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.business_seat_cap(current_setting('test.bid')::uuid);
    raise exception 'B7 FAIL: a session executed business_seat_cap';
  exception when insufficient_privilege then null;
  end;
  raise notice 'B7 PASS: the owner reads (5 used, 5 cap); the employee and the raw cap function are refused (42501)';
end $$;

-- ── S1 the company is full (owner + 4 = the default 5): a new invitation is refused ─
do $$
begin
  perform set_config('test.uid', 'eeeeeeee-0000-0000-0000-0000000009b0', false);
  begin
    insert into public.business_members (business_id, user_id, role, status)
    values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-0000000009b5', 'employee', 'invited');
    raise exception 'S1 FAIL: a sixth seat was invited';
  exception when raise_exception then
    if sqlerrm <> 'business_seats_full' then raise; end if;
  end;
  raise notice 'S1 PASS: a sixth invitation is refused with business_seats_full';
end $$;

-- ── S2 changes that keep the count pass; a freed seat is reusable; a removed
--      member cannot come back into a full company ──────────────────────────
do $$
declare n int;
begin
  perform set_config('test.uid', 'eeeeeeee-0000-0000-0000-0000000009b0', false);
  update public.business_members set status = 'suspended'
   where business_id = current_setting('test.bid')::uuid and user_id = 'aaaaaaaa-0000-0000-0000-0000000009b3';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'S2 FAIL: suspending a member of a full company was refused'; end if;
  update public.business_members set status = 'removed'
   where business_id = current_setting('test.bid')::uuid and user_id = 'aaaaaaaa-0000-0000-0000-0000000009b4';
  insert into public.business_members (business_id, user_id, role, status)
  values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-0000000009b5', 'employee', 'invited');
  begin
    update public.business_members set status = 'invited', accepted_at = null
     where business_id = current_setting('test.bid')::uuid and user_id = 'aaaaaaaa-0000-0000-0000-0000000009b4';
    raise exception 'S2 FAIL: a removed member was re-invited into a full company';
  exception when raise_exception then
    if sqlerrm <> 'business_seats_full' then raise; end if;
  end;
  raise notice 'S2 PASS: suspend passes, a removal frees a seat, a re-invite into a full company is refused';
end $$;

-- ── S3 the server is held too; invited → active is not a new seat ─────────
reset role;
do $$
begin
  -- the invitee answers his own invitation (the 20260922_02 consent guard)
  perform set_config('test.uid', 'aaaaaaaa-0000-0000-0000-0000000009b5', false);
  update public.business_members set status = 'active', accepted_at = now()
   where business_id = current_setting('test.bid')::uuid and user_id = 'aaaaaaaa-0000-0000-0000-0000000009b5';
  perform set_config('test.uid', '', false);
  begin
    insert into public.business_members (business_id, user_id, role, status)
    values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-0000000009b6', 'employee', 'invited');
    raise exception 'S3 FAIL: the server added a seat to a full company';
  exception when raise_exception then
    if sqlerrm <> 'business_seats_full' then raise; end if;
  end;
  raise notice 'S3 PASS: invited → active passes; a server-side insert into a full company is refused too';
end $$;

-- ── S4 the cap: max_seats (sales/admin) and the plan's users (/pricing) ────
do $$
begin
  if public.business_plan_seat_cap('biz-md-pro') <> 15 or public.business_plan_seat_cap('dept-lg-full') <> 50
     or public.business_plan_seat_cap('biz-lg-full') is not null or public.business_plan_seat_cap('firm-basic') is not null then
    raise exception 'S4 FAIL: business_plan_seat_cap does not follow the /pricing users row';
  end if;
  update public.business_profiles set max_seats = 6 where id = current_setting('test.bid')::uuid;
  insert into public.business_members (business_id, user_id, role, status)
  values (current_setting('test.bid')::uuid, 'aaaaaaaa-0000-0000-0000-0000000009b6', 'employee', 'invited');
  if public.business_seat_cap(current_setting('test.bid')::uuid) <> 6 then raise exception 'S4 FAIL: max_seats 6 not read'; end if;
  update public.business_profiles set plan_id = 'biz-md-pro' where id = current_setting('test.bid')::uuid;
  if public.business_seat_cap(current_setting('test.bid')::uuid) <> 15 then raise exception 'S4 FAIL: the plan''s 15 users not read'; end if;
  update public.business_profiles set plan_id = null where id = current_setting('test.bid')::uuid;
  raise notice 'S4 PASS: max_seats raises the cap; a biz-md-pro plan gives 15; the mapping follows /pricing';
end $$;

-- ── S5 a session cannot raise its own seats ─────────────────────────────────
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', 'eeeeeeee-0000-0000-0000-0000000009b0', false);
  begin
    update public.business_profiles set max_seats = 100 where id = current_setting('test.bid')::uuid;
    get diagnostics n = row_count;
    raise exception 'S5 FAIL: the owner set his own max_seats (% row)', n;
  exception when insufficient_privilege then null;
  end;
  raise notice 'S5 PASS: the owner cannot write max_seats (42501)';
end $$;

-- ── S6 the owner's own row is never refused (the owner-membership trigger) ──
reset role;
do $$
begin
  update public.business_profiles set max_seats = 1 where id = current_setting('test.bid')::uuid;
  update public.business_members set status = 'removed'
   where business_id = current_setting('test.bid')::uuid and user_id = 'eeeeeeee-0000-0000-0000-0000000009b0';
  update public.business_members set status = 'active'
   where business_id = current_setting('test.bid')::uuid and user_id = 'eeeeeeee-0000-0000-0000-0000000009b0';
  raise notice 'S6 PASS: the owner''s seat comes back even in an over-full company';
end $$;

-- ── B8 anon: no EXECUTE on the helpers, and a guest read is not turned into a helper error ─
do $$
declare f text;
begin
  foreach f in array array['public.business_case_reader(uuid)', 'public.business_roster_reader(uuid)',
                           'public.business_seat_status(uuid)', 'public.business_seat_cap(uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then raise exception 'B8 FAIL: anon can execute %', f; end if;
  end loop;
  raise notice 'B8 PASS: anon cannot execute the company helpers';
end $$;

-- ── B9 a guest read of service_requests / business_members is not broken by the
--      new policies (they are TO authenticated; anon has no EXECUTE on the helpers) ─
set role anon;
select set_config('test.uid', '', false);
do $$
declare n int;
begin
  select count(*) into n from public.service_requests;
  select count(*) into n from public.business_members;
  raise notice 'B9 PASS: guest reads of service_requests and business_members run (no 42501 from the helpers)';
exception when insufficient_privilege then
  if sqlerrm ilike '%business_%reader%' then raise exception 'B9 FAIL: a guest read hits a helper: %', sqlerrm; end if;
  raise notice 'B9 PASS: guest refused by table grants only (%), not by the helpers', sqlerrm;
end $$;
reset role;

select 'l9_secroles_business: ALL PASS';
