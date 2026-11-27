-- l19_office_plan_level.test.sql — proves 20261209_60 (batch l19 «office», ق٢٦-٥):
--   office_plan_level(uid): null for a non-professional / admin / demo account,
--   'none' exactly where office_features_locked (20261206_70) is true, 'office'
--   for lawyer-pro / founder / firm-basic (+ their firm members), 'enterprise'
--   for firm-enterprise (own, the owner's, or the firm entity's) and the
--   members of such a firm; an expired enterprise plan falls back to the rest.
--   my_office_plan_level() answers for auth.uid() only; anon cannot run it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash — the chain of roles_office_plan_l16.test.sql, then this file twice:
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
--     $M/20261209_60_l19_office_plan_level.sql \
--     $M/20261209_60_l19_office_plan_level.sql \
--     $T/l19_office_plan_level.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261209_60
-- lines → T1 «function public.office_plan_level(uuid) does not exist».
--
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

-- ── fixtures (postgres) ──────────────────────────────────────────────────────
-- a1 free lawyer, a2 lawyer-pro, a3 founder, a4 demo lawyer, a5 admin with a paid plan,
-- b0 unpaid firm + m0 member, b1 firm-basic + m1 member, b2 firm-enterprise + m2 member,
-- b3 firm whose ENTITY holds firm-enterprise + m3 member, b4 expired enterprise + basic,
-- c1 client, a6 lawyer with an own firm-enterprise row (an admin grant to a lawyer).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000019a1', 'a1@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019a2', 'a2@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019a3', 'a3@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019a4', 'a4@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019a5', 'a5@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019a6', 'a6@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019b0', 'b0@l19.test', '{"user_type": "firm", "firm_name": "مكتب مجاني"}'),
  ('00000000-0000-0000-0000-0000000019b1', 'b1@l19.test', '{"user_type": "firm", "firm_name": "مكتب أساسي"}'),
  ('00000000-0000-0000-0000-0000000019b2', 'b2@l19.test', '{"user_type": "firm", "firm_name": "شركة محاماة"}'),
  ('00000000-0000-0000-0000-0000000019b3', 'b3@l19.test', '{"user_type": "firm", "firm_name": "شركة كيان"}'),
  ('00000000-0000-0000-0000-0000000019b4', 'b4@l19.test', '{"user_type": "firm", "firm_name": "شركة منتهية"}'),
  ('00000000-0000-0000-0000-0000000019d0', 'm0@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019d1', 'm1@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019d2', 'm2@l19.test', '{}'),
  ('00000000-0000-0000-0000-0000000019d3', 'm3@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019d4', 'm4@l19.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000019c1', 'c1@l19.test', '{}');
update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-0000000019a4';
update public.profiles set user_type = 'admin' where id = '00000000-0000-0000-0000-0000000019a5';
insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end) values
  ('00000000-0000-0000-0000-0000000019a2', 'lawyer-pro', 'pro', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-0000000019a5', 'firm-enterprise', 'enterprise', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-0000000019a6', 'firm-enterprise', 'enterprise', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-0000000019b1', 'firm-basic', 'corp', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-0000000019b2', 'firm-enterprise', 'enterprise', 'active', null),
  ('00000000-0000-0000-0000-0000000019b4', 'firm-enterprise', 'enterprise', 'active', now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000019b4', 'firm-basic', 'corp', 'active', now() + interval '30 days'),
  -- a cancelled enterprise row lifts nothing
  ('00000000-0000-0000-0000-0000000019b0', 'firm-enterprise', 'enterprise', 'cancelled', now() + interval '300 days');
insert into public.founder_seats (user_id, status, ends_at) values
  ('00000000-0000-0000-0000-0000000019a3', 'active', now() + interval '300 days');
do $$
declare v_b0 uuid; v_b1 uuid; v_b2 uuid; v_b3 uuid; v_b4 uuid;
begin
  select id into v_b0 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000019b0';
  select id into v_b1 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000019b1';
  select id into v_b2 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000019b2';
  select id into v_b3 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000019b3';
  select id into v_b4 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000019b4';
  if v_b0 is null or v_b1 is null or v_b2 is null or v_b3 is null or v_b4 is null then
    raise exception 'fixtures: the firm signups made no firm row';
  end if;
  -- b3's plan is keyed on the firm entity (paid by the owner for the firm)
  insert into public.subscriptions (user_id, entity_type, entity_id, plan_id, tier, status, current_period_end)
  values ('00000000-0000-0000-0000-0000000019b3', 'firm', v_b3, 'firm-enterprise', 'enterprise', 'active', now() + interval '300 days');
  insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
    (v_b0, '00000000-0000-0000-0000-0000000019d0', 'lawyer', 'active', now()),
    (v_b1, '00000000-0000-0000-0000-0000000019d1', 'lawyer', 'active', now()),
    (v_b2, '00000000-0000-0000-0000-0000000019d2', 'legal_secretary', 'active', now()),
    (v_b3, '00000000-0000-0000-0000-0000000019d3', 'lawyer', 'active', now()),
    (v_b4, '00000000-0000-0000-0000-0000000019d4', 'lawyer', 'active', now());
  -- an INVITED (not active) member of the enterprise firm gets nothing from it
  insert into public.firm_members (firm_id, user_id, role, status) values
    (v_b2, '00000000-0000-0000-0000-0000000019a1', 'lawyer', 'invited');
end $$;

-- ── T1 the level of each account ─────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in select * from (values
      ('00000000-0000-0000-0000-0000000019a1'::uuid, 'none',       'free lawyer (only invited to an enterprise firm)'),
      ('00000000-0000-0000-0000-0000000019a2'::uuid, 'office',     'lawyer-pro'),
      ('00000000-0000-0000-0000-0000000019a3'::uuid, 'office',     'founder seat'),
      ('00000000-0000-0000-0000-0000000019a4'::uuid, null,         'demo lawyer'),
      ('00000000-0000-0000-0000-0000000019a5'::uuid, null,         'admin (even with a paid plan)'),
      ('00000000-0000-0000-0000-0000000019a6'::uuid, 'enterprise', 'lawyer with his own firm-enterprise row'),
      ('00000000-0000-0000-0000-0000000019b0'::uuid, 'none',       'unpaid firm (cancelled enterprise row)'),
      ('00000000-0000-0000-0000-0000000019d0'::uuid, 'none',       'member of the unpaid firm'),
      ('00000000-0000-0000-0000-0000000019b1'::uuid, 'office',     'firm-basic owner'),
      ('00000000-0000-0000-0000-0000000019d1'::uuid, 'office',     'lawyer member of firm-basic'),
      ('00000000-0000-0000-0000-0000000019b2'::uuid, 'enterprise', 'firm-enterprise owner'),
      ('00000000-0000-0000-0000-0000000019d2'::uuid, 'enterprise', 'individual member of firm-enterprise'),
      ('00000000-0000-0000-0000-0000000019b3'::uuid, 'enterprise', 'owner of a firm whose entity holds firm-enterprise'),
      ('00000000-0000-0000-0000-0000000019d3'::uuid, 'enterprise', 'member of a firm whose entity holds firm-enterprise'),
      ('00000000-0000-0000-0000-0000000019b4'::uuid, 'office',     'firm with an expired enterprise + a running basic plan'),
      ('00000000-0000-0000-0000-0000000019d4'::uuid, 'office',     'member of that firm'),
      ('00000000-0000-0000-0000-0000000019c1'::uuid, null,         'client'),
      (null::uuid, null, 'nobody')) v(uid, expected, label) loop
    if public.office_plan_level(r.uid) is distinct from r.expected then
      raise exception 'T1 FAIL: office_plan_level(%) is % not % (%)', r.uid, public.office_plan_level(r.uid), r.expected, r.label;
    end if;
  end loop;
  raise notice 'T1 PASS: none / office / enterprise / null as designed for 18 accounts';
end $$;

-- ── T2 'none' is exactly office_features_locked (one source of truth) ────────
do $$
declare
  n int;
begin
  select count(*) into n
    from public.profiles p
   where coalesce(public.office_plan_level(p.id) = 'none', false) is distinct from public.office_features_locked(p.id);
  if n <> 0 then
    raise exception 'T2 FAIL: % accounts where level = none disagrees with office_features_locked', n;
  end if;
  raise notice 'T2 PASS: level none ⇔ office_features_locked for every profile';
end $$;

-- ── T3 the session function answers for the caller only; grants ──────────────
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000019d2', false);
do $$
begin
  if public.my_office_plan_level() is distinct from 'enterprise' then
    raise exception 'T3 FAIL: my_office_plan_level() for the enterprise member is %', public.my_office_plan_level();
  end if;
  begin
    perform public.office_plan_level('00000000-0000-0000-0000-0000000019a1');
    raise exception 'T3 FAIL: a session ran office_plan_level(uuid) about someone else';
  exception when insufficient_privilege then
    null;
  end;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000019a1', false);
do $$
begin
  if public.my_office_plan_level() is distinct from 'none' then
    raise exception 'T3 FAIL: my_office_plan_level() for the free lawyer is %', public.my_office_plan_level();
  end if;
end $$;
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.my_office_plan_level()', 'EXECUTE') then
    raise exception 'T3 FAIL: anon may run my_office_plan_level()';
  end if;
  raise notice 'T3 PASS: my_office_plan_level answers for auth.uid(); office_plan_level(uuid) and anon refused';
end $$;

-- ── T4 a plan bought later lifts the level at once (no cache) ────────────────
do $$
begin
  insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end)
  values ('00000000-0000-0000-0000-0000000019b1', 'firm-enterprise', 'enterprise', 'active', now() + interval '365 days');
  if public.office_plan_level('00000000-0000-0000-0000-0000000019d1') is distinct from 'enterprise' then
    raise exception 'T4 FAIL: the basic firm''s member did not move to enterprise after the upgrade';
  end if;
  raise notice 'T4 PASS: an upgrade to firm-enterprise lifts the owner and his members at once';
end $$;

select 'l19_office_plan_level: ALL PASS' as result;
