-- l19_office_insert_guard.test.sql — proves 20261209_91 (l19 review, access S5):
-- a session on the free side (office_features_locked(auth.uid()), 20261206_70)
-- cannot insert into time_entries / lawyer_expenses / client_trust_ledger /
-- contracts directly; a paying lawyer, a founder, a paid firm's member, an
-- admin, a client and the service role (no auth.uid()) can. The rows are
-- inserted as postgres with test.uid set (auth.uid() answers it), so the
-- trigger is what is under test — RLS is the routes' and 20261126_40's.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash — the chain of l19_office_plan_level.test.sql, then the
-- finance tables, then this file's migration twice:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $M/20260921_03_entity_rls_recursion_fix.sql \
--     $T/prelude_accounts_limits.sql \
--     $M/20261126_50_accounts_limits.sql \
--     $T/prelude_roles_l16.sql \
--     $M/20261017_31_firm_reviews_opt_in.sql \
--     $M/20261206_70_roles_office_plan.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261126_40_time_trust_expenses.sql \
--     $M/20261209_91_l19_office_plan_insert_guard.sql \
--     $M/20261209_91_l19_office_plan_insert_guard.sql \
--     $T/l19_office_insert_guard.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261209_91
-- lines → «G1 FAIL: G1 the free lawyer inserted into time_entries (got ok)».
--
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

-- a1 free lawyer, a2 lawyer-pro, a3 founder, a5 admin, b0 unpaid firm + m0 member,
-- b1 firm-basic + m1 member, c1 client.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000091a1', 'a1@l19g.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000091a2', 'a2@l19g.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000091a3', 'a3@l19g.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000091a5', 'a5@l19g.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000091b0', 'b0@l19g.test', '{"user_type": "firm", "firm_name": "مكتب مجاني"}'),
  ('00000000-0000-0000-0000-0000000091b1', 'b1@l19g.test', '{"user_type": "firm", "firm_name": "مكتب أساسي"}'),
  ('00000000-0000-0000-0000-0000000091d0', 'm0@l19g.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000091d1', 'm1@l19g.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000091c1', 'c1@l19g.test', '{}');
update public.profiles set user_type = 'admin' where id = '00000000-0000-0000-0000-0000000091a5';
insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end) values
  ('00000000-0000-0000-0000-0000000091a2', 'lawyer-pro', 'pro', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-0000000091b1', 'firm-basic', 'corp', 'active', now() + interval '300 days');
insert into public.founder_seats (user_id, status, ends_at) values
  ('00000000-0000-0000-0000-0000000091a3', 'active', now() + interval '300 days');
do $$
declare v_b0 uuid; v_b1 uuid;
begin
  select id into v_b0 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000091b0';
  select id into v_b1 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000091b1';
  if v_b0 is null or v_b1 is null then raise exception 'fixtures: the firm signups made no firm row'; end if;
  insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
    (v_b0, '00000000-0000-0000-0000-0000000091d0', 'lawyer', 'active', now()),
    (v_b1, '00000000-0000-0000-0000-0000000091d1', 'lawyer', 'active', now());
end $$;

-- one insert into each table as `who` (auth.uid() via test.uid; '' = no session) → 'ok' or the error
create or replace function pg_temp.try_insert(who text, tbl text) returns text language plpgsql as $$
begin
  perform set_config('test.uid', who, true);
  begin
    if tbl = 'time_entries' then
      insert into public.time_entries (created_by, duration_min, description)
      values (nullif(who, '')::uuid, 30, 'اختبار');
    elsif tbl = 'lawyer_expenses' then
      insert into public.lawyer_expenses (created_by, category, description, amount_halalas)
      values (nullif(who, '')::uuid, 'other', 'اختبار', 100);
    elsif tbl = 'client_trust_ledger' then
      insert into public.client_trust_ledger (created_by, kind, amount_halalas, description)
      values (nullif(who, '')::uuid, 'deposit', 100, 'اختبار');
    else
      insert into public.contracts (owner_user_id, title) values (nullif(who, '')::uuid, 'عقد اختبار');
    end if;
    perform set_config('test.uid', '', true);
    return 'ok';
  exception when others then
    perform set_config('test.uid', '', true);
    return sqlstate || ':' || sqlerrm;
  end;
end $$;

do $$
declare
  t text;
  r record;
  got text;
begin
  foreach t in array array['time_entries', 'lawyer_expenses', 'client_trust_ledger', 'contracts'] loop
    for r in select * from (values
        ('00000000-0000-0000-0000-0000000091a1', '42501:office_plan_required', 'G1 the free lawyer'),
        ('00000000-0000-0000-0000-0000000091b0', '42501:office_plan_required', 'G2 the unpaid firm'),
        ('00000000-0000-0000-0000-0000000091d0', '42501:office_plan_required', 'G3 the unpaid firm''s member'),
        ('00000000-0000-0000-0000-0000000091a2', 'ok', 'G4 the lawyer-pro'),
        ('00000000-0000-0000-0000-0000000091a3', 'ok', 'G5 the founder'),
        ('00000000-0000-0000-0000-0000000091b1', 'ok', 'G6 the paid firm'),
        ('00000000-0000-0000-0000-0000000091d1', 'ok', 'G7 the paid firm''s member'),
        ('00000000-0000-0000-0000-0000000091a5', 'ok', 'G8 the admin'),
        ('00000000-0000-0000-0000-0000000091c1', 'ok', 'G9 a client'),
        ('',                                     'ok', 'G10 the service role (no session)')) as v(who, want, label)
    loop
      got := pg_temp.try_insert(r.who, t);
      if got is distinct from r.want then
        if r.want <> 'ok' then
          raise exception '% FAIL: % inserted into % (got %)', split_part(r.label, ' ', 1), r.label, t, got;
        end if;
        raise exception '% FAIL: % was refused on % (got %)', split_part(r.label, ' ', 1), r.label, t, got;
      end if;
    end loop;
    raise notice 'PASS %: free side refused (42501 office_plan_required), paid / founder / member / admin / client / service role pass', t;
  end loop;
end $$;

-- G11 the trigger function is no session's to call; reads stay open (no grant changed)
do $$
begin
  if has_function_privilege('authenticated', 'public.office_plan_insert_guard()', 'EXECUTE') then
    raise exception 'G11 FAIL: authenticated may execute the guard function';
  end if;
  if not has_table_privilege('authenticated', 'public.time_entries', 'SELECT')
     or not has_column_privilege('authenticated', 'public.time_entries', 'description', 'INSERT') then
    raise exception 'G11 FAIL: a session grant the app relies on changed';
  end if;
  raise notice 'G11 PASS: no session grant on the guard; the app''s grants unchanged';
end $$;

-- G12 the real direct path: a session (role authenticated, RLS on) inserting a contract it may own
grant execute on function pg_temp.try_insert(text, text) to authenticated;
set role authenticated;
do $$
declare got text;
begin
  got := pg_temp.try_insert('00000000-0000-0000-0000-0000000091a2', 'contracts');
  if got <> 'ok' then raise exception 'G12 FAIL: the lawyer-pro''s own session was refused (%)', got; end if;
  got := pg_temp.try_insert('00000000-0000-0000-0000-0000000091a1', 'contracts');
  if got <> '42501:office_plan_required' then raise exception 'G12 FAIL: the free lawyer''s own session got %', got; end if;
  raise notice 'G12 PASS: through RLS, the paid session inserts, the free one is refused by the guard';
end $$;
reset role;

select 'l19_office_insert_guard: ALL PASS' as result;
