-- RLS acceptance tests for 20260904_phase5_deadline_radar.sql
-- Users: A (solo lawyer), B (another solo lawyer), O (owner of firm F),
-- C (lawyer, active member of F). Non-superuser role throughout.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

-- fixtures as postgres
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000000f');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','B'),
  ('cccccccc-0000-0000-0000-000000000003','lawyer','C'),
  ('00000000-0000-0000-0000-00000000000f','firm','O');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','مكتب الاختبار');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','managing_partner','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','lawyer','active', now());
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('req-a','aaaaaaaa-0000-0000-0000-000000000001','قضية أ','aaaaaaaa-0000-0000-0000-000000000001'),
  ('req-c','cccccccc-0000-0000-0000-000000000003','قضية ج','cccccccc-0000-0000-0000-000000000003');

select 'T0 seeded platform rules (expect 5): ' || count(*) from public.deadline_rules where owner_user_id is null;
select 'T0 seeded holidays (expect 4): ' || count(*) from public.court_holidays;

set role app_user;

-- T1 any signed-in user reads the platform rules and the holidays
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T1 B reads platform rules (expect 5): ' || count(*) from public.deadline_rules;
select 'T1 B reads holidays (expect 4): ' || count(*) from public.court_holidays;
select 'T1 every platform rule is unverified (expect 0 verified): ' || count(*) from public.deadline_rules where verified_by_owner;

-- T2 a lawyer's own rule is theirs alone; an outsider sees only platform rules
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.deadline_rules (code, owner_user_id, title_ar, trigger_kind, period_days)
values ('appeal_general','aaaaaaaa-0000-0000-0000-000000000001','استئناف — قاعدتي','judgment', 30);
select 'T2 A sees 6 rules (5 platform + own): ' || count(*) from public.deadline_rules;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T2 B still sees 5: ' || count(*) from public.deadline_rules;
do $$ begin
  insert into public.deadline_rules (code, owner_user_id, title_ar, trigger_kind, period_days)
  values ('x', null, 'قاعدة منصّة مزوّرة', 'judgment', 10);
  raise notice 'T2 FAIL: a lawyer inserted a platform rule';
exception when insufficient_privilege then
  raise notice 'T2 PASS: only admin may insert platform rules (42501)';
end $$;
do $$ begin
  insert into public.court_holidays (title_ar, kind, greg_month, greg_day)
  values ('عطلة مزوّرة','gregorian_fixed', 1, 1);
  raise notice 'T2 FAIL: a lawyer inserted a holiday';
exception when insufficient_privilege then
  raise notice 'T2 PASS: only admin may insert holidays (42501)';
end $$;

-- T3 deadlines: owner + firm, not strangers
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.deadlines (id, owner_user_id, case_request_id, title, trigger_date, due_date, days_count, computed_by_rule)
values ('d1d1d1d1-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','req-a','مهلة استئناف','2026-09-01','2026-10-01', 30, true);
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
insert into public.deadlines (id, owner_user_id, firm_id, case_request_id, title, trigger_date, due_date)
values ('d2d2d2d2-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','ffffffff-0000-0000-0000-0000000000f1','req-c','مهلة نقض','2026-09-01','2026-10-01');
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
select 'T3 O (firm owner) sees C''s deadline (expect 1): ' || count(*) from public.deadlines;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T3 B sees deadlines (expect 0): ' || count(*) from public.deadlines;
do $$ begin
  insert into public.deadlines (owner_user_id, title, trigger_date, due_date)
  values ('aaaaaaaa-0000-0000-0000-000000000001','مزوّرة','2026-09-01','2026-09-02');
  raise notice 'T3 FAIL: B inserted a deadline owned by A';
exception when insufficient_privilege then
  raise notice 'T3 PASS: insert under another owner refused (42501)';
end $$;
do $$ begin
  insert into public.deadlines (owner_user_id, title, trigger_date, due_date)
  values ('bbbbbbbb-0000-0000-0000-000000000002','قبل بدايتها','2026-09-10','2026-09-01');
  raise notice 'T3 FAIL: due before trigger accepted';
exception when check_violation then
  raise notice 'T3 PASS: due_date before trigger_date refused (23514)';
end $$;

-- T4 outbox: queue once, never twice; recipient reads own; stranger neither reads nor queues
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.notification_outbox (deadline_id, recipient_user_id, channel, kind, scheduled_for)
values ('d1d1d1d1-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','in_app','deadline_reminder_7d','2026-09-24 06:00+03');
do $$ begin
  insert into public.notification_outbox (deadline_id, recipient_user_id, channel, kind, scheduled_for)
  values ('d1d1d1d1-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','in_app','deadline_reminder_7d','2026-09-24 07:00+03');
  raise notice 'T4 FAIL: the same reminder was queued twice';
exception when unique_violation then
  raise notice 'T4 PASS: second identical reminder refused (23505) — DECISION 3';
end $$;
select 'T4 A reads own queue (expect 1): ' || count(*) from public.notification_outbox;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T4 B reads A''s queue (expect 0): ' || count(*) from public.notification_outbox;
do $$ begin
  insert into public.notification_outbox (deadline_id, recipient_user_id, channel, kind, scheduled_for)
  values ('d1d1d1d1-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000002','in_app','deadline_reminder_3d','2026-09-28 06:00+03');
  raise notice 'T4 FAIL: B queued a reminder on A''s deadline';
exception when insufficient_privilege then
  raise notice 'T4 PASS: queueing on an inaccessible deadline refused (42501)';
end $$;
-- firm owner may queue on a member's deadline (firm arm)
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
insert into public.notification_outbox (deadline_id, recipient_user_id, channel, kind, scheduled_for)
values ('d2d2d2d2-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-000000000003','in_app','deadline_reminder_7d','2026-09-24 06:00+03');
select 'T4 O queued a reminder on C''s deadline and can read it (expect 1): ' || count(*) from public.notification_outbox;

-- T5 the owner/firm may cancel a pending reminder but not mark it sent
update public.notification_outbox set status = 'cancelled' where deadline_id = 'd2d2d2d2-0000-0000-0000-000000000002';
select 'T5 cancelled by firm owner (expect cancelled): ' || status from public.notification_outbox where deadline_id = 'd2d2d2d2-0000-0000-0000-000000000002';
do $$ begin
  update public.notification_outbox set status = 'sent' where deadline_id = 'd2d2d2d2-0000-0000-0000-000000000002';
  raise notice 'T5 FAIL: a user marked a reminder as sent';
exception when insufficient_privilege then
  raise notice 'T5 PASS: only the scheduler (service role) may mark sent (42501)';
end $$;

-- footer
reset role;
select 'policies: ' || string_agg(tablename || '=' || cnt, ' · ' order by tablename)
  from (select tablename, count(*) as cnt from pg_policies
         where schemaname = 'public'
           and tablename in ('deadline_rules','court_holidays','deadlines','notification_outbox')
         group by tablename) p;
