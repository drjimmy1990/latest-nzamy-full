-- activity_events_firm_insert.test.sql — proves 20261206_13 (l16 D-54): a
-- session can no longer plant an activity row into another firm's feed.
-- CHAIN (run.sh, postgres:16). 13 runs TWICE.
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_case_tables_real.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261206_13_activity_events_firm_insert.sql \
--     $M/20261206_13_activity_events_firm_insert.sql \
--     $T/activity_events_firm_insert.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261206_13 lines →
--   "T2 FAIL: an outsider planted an event into firm F's feed".
-- People: O owns firm F (no firm_members row needed), M active member of F,
--   X a lawyer of no firm, R a removed member of F.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-000000054a00'), ('00000000-0000-0000-0000-000000054a01'),
  ('00000000-0000-0000-0000-000000054a02'), ('00000000-0000-0000-0000-000000054a03');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-000000054a00', 'firm',   'O'),
  ('00000000-0000-0000-0000-000000054a01', 'lawyer', 'M'),
  ('00000000-0000-0000-0000-000000054a02', 'lawyer', 'X'),
  ('00000000-0000-0000-0000-000000054a03', 'lawyer', 'R');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-000000054f01', '00000000-0000-0000-0000-000000054a00', 'مكتب F');
-- the phase2 trigger may add O as managing partner; remove it so the owner arm is what is tested
delete from public.firm_members where user_id = '00000000-0000-0000-0000-000000054a00';
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-000000054f01', '00000000-0000-0000-0000-000000054a01', 'lawyer', 'active',  now()),
  ('ffffffff-0000-0000-0000-000000054f01', '00000000-0000-0000-0000-000000054a03', 'lawyer', 'removed', now());

set role authenticated;

-- T1 the writers the app has keep working
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-000000054a01', false);
  insert into public.activity_events (firm_id, owner_user_id, actor_user_id, kind)
  values ('ffffffff-0000-0000-0000-000000054f01', auth.uid(), auth.uid(), 'hearing.created');
  insert into public.activity_events (firm_id, owner_user_id, actor_user_id, kind)
  values (null, auth.uid(), auth.uid(), 'task.created');
  perform set_config('test.uid', '00000000-0000-0000-0000-000000054a00', false);
  insert into public.activity_events (firm_id, owner_user_id, actor_user_id, kind)
  values ('ffffffff-0000-0000-0000-000000054f01', auth.uid(), auth.uid(), 'task.created');
  perform set_config('test.uid', '00000000-0000-0000-0000-000000054a02', false);
  insert into public.activity_events (firm_id, owner_user_id, actor_user_id, kind)
  values (null, auth.uid(), auth.uid(), 'task.created');
  raise notice 'T1 PASS: an active member, the firm owner (no member row) and a solo lawyer still write their events';
end $$;

-- T2 an outsider and a removed member cannot write into F's feed
do $$
declare uid text;
begin
  foreach uid in array array['00000000-0000-0000-0000-000000054a02', '00000000-0000-0000-0000-000000054a03'] loop
    perform set_config('test.uid', uid, false);
    begin
      insert into public.activity_events (firm_id, owner_user_id, actor_user_id, kind, summary)
      values ('ffffffff-0000-0000-0000-000000054f01', auth.uid(), auth.uid(), 'case.updated', 'مزوّر');
      raise exception 'T2 FAIL: an outsider planted an event into firm F''s feed (%)', uid;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'T2 PASS: an outsider and a removed member cannot plant events into the firm''s feed (42501)';
end $$;
reset role;

do $$
begin
  if (select count(*) from public.activity_events where firm_id = 'ffffffff-0000-0000-0000-000000054f01') <> 2 then
    raise exception 'T3 FAIL: the firm feed holds % rows, expected 2', (select count(*) from public.activity_events where firm_id = 'ffffffff-0000-0000-0000-000000054f01');
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.activity_events'::regclass and polcmd in ('a', '*')) <> 1 then
    raise exception 'T3 FAIL: activity_events does not carry exactly one INSERT policy';
  end if;
  raise notice 'T3 PASS: the firm feed holds only its members'' rows; one INSERT policy';
end $$;
