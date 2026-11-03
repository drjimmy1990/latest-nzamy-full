-- Tests for 20261030_50_stage_auto_deadline_guard.sql
-- Run (stubs.sql already defines case_stages):
--   supabase/tests/rls/run.sh supabase/migrations/20260904_phase5_deadline_radar.sql \
--        supabase/migrations/20261030_50_stage_auto_deadline_guard.sql \
--        supabase/tests/rls/stage_auto_deadline_guard.test.sql
-- The migration ran once already (as the harness's last migration) on an
-- EMPTY deadlines table, so the index exists; T1–T4 check it, T5–T6 check the
-- "duplicates present → skip, report, change nothing" branch.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001');
insert into public.profiles (id, user_type, display_name) values ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('req-a','aaaaaaaa-0000-0000-0000-000000000001','قضية أ','aaaaaaaa-0000-0000-0000-000000000001');
insert into public.case_stages (id, case_request_id, owner_user_id, degree, outcome, closed_on) values
  ('11111111-0000-0000-0000-000000000001','req-a','aaaaaaaa-0000-0000-0000-000000000001','appeal','pending','2026-10-29'),
  ('11111111-0000-0000-0000-000000000002','req-a','aaaaaaaa-0000-0000-0000-000000000001','first_instance','lost','2026-10-29');

select 'T1 guard index exists (expect 1): ' || count(*) from pg_indexes
 where schemaname = 'public' and indexname = 'uq_deadlines_one_open_auto_per_stage';

insert into public.deadlines (id, owner_user_id, case_request_id, stage_id, title, trigger_date, due_date, computed_by_rule, status)
values ('22222222-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','req-a',
        '11111111-0000-0000-0000-000000000002','الاعتراض بطلب الاستئناف','2026-10-29','2026-11-29', true, 'open');

-- T2: a second OPEN auto deadline on the same stage is refused (23505)
do $$ begin
  insert into public.deadlines (owner_user_id, case_request_id, stage_id, title, trigger_date, due_date, computed_by_rule, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001','req-a','11111111-0000-0000-0000-000000000002','dup','2026-10-31','2026-11-30', true, 'open');
  raise notice 'T2 FAIL: duplicate open auto deadline accepted';
exception when unique_violation then raise notice 'T2 PASS: duplicate open auto deadline refused';
end $$;
select 'T2 open auto deadlines on stage 2 (expect 1): ' || count(*) from public.deadlines
 where stage_id = '11111111-0000-0000-0000-000000000002' and status = 'open';

-- T3: a cancelled one beside it, and a manual (not computed) one, are allowed
insert into public.deadlines (owner_user_id, case_request_id, stage_id, title, trigger_date, due_date, computed_by_rule, status)
values ('aaaaaaaa-0000-0000-0000-000000000001','req-a','11111111-0000-0000-0000-000000000002','old','2026-10-20','2026-11-20', true, 'cancelled'),
       ('aaaaaaaa-0000-0000-0000-000000000001','req-a','11111111-0000-0000-0000-000000000002','manual','2026-10-20','2026-11-20', false, 'open');
select 'T3 rows on stage 2 (expect 3): ' || count(*) from public.deadlines where stage_id = '11111111-0000-0000-0000-000000000002';

-- T4: an auto deadline on the PENDING stage 1 (what the LIVE-F15 bug made) is reported by check 2
insert into public.deadlines (owner_user_id, case_request_id, stage_id, title, trigger_date, due_date, computed_by_rule, status)
values ('aaaaaaaa-0000-0000-0000-000000000001','req-a','11111111-0000-0000-0000-000000000001','الاعتراض بطلب النقض','2026-10-29','2026-11-29', true, 'open');
select 'T4 pending-born open auto deadlines (expect 1): ' || count(*)
  from public.deadlines d join public.case_stages s on s.id = d.stage_id
 where d.computed_by_rule and d.status = 'open' and (s.outcome is null or s.outcome = 'pending');

-- T5/T6: with duplicates present, re-running the migration skips the index and changes no row
drop index public.uq_deadlines_one_open_auto_per_stage;
insert into public.deadlines (owner_user_id, case_request_id, stage_id, title, trigger_date, due_date, computed_by_rule, status)
values ('aaaaaaaa-0000-0000-0000-000000000001','req-a','11111111-0000-0000-0000-000000000002','dup','2026-10-31','2026-11-30', true, 'open');
\i /tmp/mig2.sql
select 'T5 guard index after re-run with duplicates (expect 0): ' || count(*) from pg_indexes
 where schemaname = 'public' and indexname = 'uq_deadlines_one_open_auto_per_stage';
select 'T6 rows untouched (expect 5 total, 4 open): ' || count(*) || ' total, '
       || count(*) filter (where status = 'open') || ' open' from public.deadlines;
