-- firm_points_overview_l4.test.sql — proves the Q468–Q470 half of 20261125_40:
--   * firm_member_points_usage: an active finance_manager may read it (Q469),
--     a plain lawyer may not; join-date counting unchanged (Q468);
--   * firm_points_overview: the firm account's unexpired balance and each
--     active member's founder-credit runs since joining, restored runs excluded (Q470).
--
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $R/prelude_l4_points_min.sql \
--     $M/20261108_30_firm_member_points_usage.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $R/firm_points_overview_l4.test.sql
--
-- NEGATIVE CONTROL: without the two 20261125_40 lines, P1 fails (the finance
-- manager is refused by the 20261108_30 check) and P3 has no firm_points_overview.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000b0'), ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b2'), ('00000000-0000-0000-0000-0000000000b3');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000b0', 'firm',   'O'),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer', 'FM'),
  ('00000000-0000-0000-0000-0000000000b2', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000000b3', 'lawyer', 'R');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000b0', 'مكتب النقاط');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at, created_at) values
  ('ffffffff-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000b1', 'finance_manager', 'active',  now() - interval '30 days', now() - interval '30 days'),
  ('ffffffff-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000b2', 'lawyer',          'active',  now() - interval '10 days', now() - interval '10 days'),
  ('ffffffff-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000b3', 'lawyer',          'removed', now() - interval '30 days', now() - interval '30 days');

-- the firm account: 500 live points + 99 expired
insert into public.points_lots (user_id, points_total, points_left, expires_at) values
  ('00000000-0000-0000-0000-0000000000b0', 600, 500, now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000000b0', 99, 99, now() - interval '1 day');
-- L: 3 founder runs after joining (one restored), 1 before joining; R (removed): 1
insert into public.ai_runs (id, user_id, created_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000b2', now() - interval '2 days'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000b2', now() - interval '3 days'),
  ('aaaaaaaa-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000b2', now() - interval '4 days'),
  ('aaaaaaaa-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000b2', now() - interval '20 days'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000000b3', now() - interval '2 days');
insert into public.membership_credit_uses (run_id, used_at, restored_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', now() - interval '2 days', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', now() - interval '3 days', null),
  ('aaaaaaaa-0000-0000-0000-000000000003', now() - interval '4 days', now() - interval '4 days'),
  ('aaaaaaaa-0000-0000-0000-000000000004', now() - interval '20 days', null),
  ('aaaaaaaa-0000-0000-0000-000000000005', now() - interval '2 days', null);

set role authenticated;

-- P1 the finance manager reads the per-member counter (Q469)
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
do $$
declare n int;
begin
  select count(*) into n from public.firm_member_points_usage('ffffffff-0000-0000-0000-0000000000b9');
  if n < 2 then raise exception 'P1 FAIL: finance manager got % rows', n; end if;
  raise notice 'P1 PASS: an active finance manager reads the points counter (% active members)', n;
end $$;

-- P2 a plain lawyer is refused by both functions
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b2', false);
do $$
begin
  begin
    perform * from public.firm_member_points_usage('ffffffff-0000-0000-0000-0000000000b9');
    raise exception 'P2 FAIL: a plain lawyer read the counter';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.firm_points_overview('ffffffff-0000-0000-0000-0000000000b9');
    raise exception 'P2 FAIL: a plain lawyer read the overview';
  exception when insufficient_privilege then null;
  end;
  raise notice 'P2 PASS: a plain lawyer is refused (42501)';
end $$;

-- P3 the overview: the owner's live balance, founder runs per active member
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', false);
do $$
declare o jsonb; l jsonb;
begin
  o := public.firm_points_overview('ffffffff-0000-0000-0000-0000000000b9');
  if (o->>'owner_balance')::int <> 500 then raise exception 'P3 FAIL: owner_balance %, want 500', o->>'owner_balance'; end if;
  select x into l from jsonb_array_elements(o->'founder_works') x where x->>'user_id' = '00000000-0000-0000-0000-0000000000b2';
  if l is null or (l->>'works_total')::int <> 2 then
    raise exception 'P3 FAIL: L founder works % (want 2: restored and pre-join runs excluded)', l;
  end if;
  if exists (select 1 from jsonb_array_elements(o->'founder_works') x where x->>'user_id' = '00000000-0000-0000-0000-0000000000b3') then
    raise exception 'P3 FAIL: a removed member is listed';
  end if;
  raise notice 'P3 PASS: overview = owner balance 500 (expired lot excluded); L = 2 founder runs; removed member absent';
end $$;

-- P4 the owner reads it too
select set_config('test.uid', '00000000-0000-0000-0000-0000000000b0', false);
do $$
begin
  if not (public.firm_points_overview('ffffffff-0000-0000-0000-0000000000b9') ? 'owner_balance') then
    raise exception 'P4 FAIL: the owner cannot read the overview';
  end if;
  raise notice 'P4 PASS: the firm owner reads the overview';
end $$;

reset role;
select 'firm_points_overview_l4: ALL PASS' as result;
