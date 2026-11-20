-- l11_remind_reminder_kinds.test.sql — proves 20261201_45: the kind CHECK of
-- public.email_reminder_log accepts the seven new kinds (task, contract
-- installment, firm invitation), keeps the five old ones AND a kind another
-- migration added (the union rebuild), still refuses an unknown kind, keeps
-- the once-only key, and a signed-in user still can neither read nor write it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The new file
-- runs three times (idempotent), with a foreign kind added in between to
-- prove it is never dropped. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20261125_20_email_reminder_log.sql \
--     $M/20261201_45_task_payment_invite_reminders.sql \
--     $R/l11_remind_foreign_kind.fixture.sql \
--     $M/20261201_45_task_payment_invite_reminders.sql \
--     $M/20261201_45_task_payment_invite_reminders.sql \
--     $R/l11_remind_reminder_kinds.test.sql
-- (the fixture rebuilds the CHECK WITHOUT the new kinds, as a later migration
-- with a fixed list would; the next run must add them back and keep its kind;
-- the last run is the no-op path.)
-- NEGATIVE CONTROL: the same chain without 20261201_45 fails at T1 (the old
-- CHECK refuses 'task_due_1d' with check_violation — the code path the cron
-- reads as "schema missing").
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regclass('public.email_reminder_log') is null then
    raise exception 'T0 FAIL: email_reminder_log does not exist (20261125_20 not applied)';
  end if;
end $$;

insert into auth.users values ('00000000-0000-0000-0000-0000000045a1'), ('00000000-0000-0000-0000-0000000045a2')
on conflict do nothing;

-- T1 the seven new kinds are accepted
do $$
declare n int;
begin
  begin
    insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
    values ('task_due_1d',              't-1', '2026-11-21', '00000000-0000-0000-0000-0000000045a1'),
           ('task_due_1d_app',          't-1', '2026-11-21', '00000000-0000-0000-0000-0000000045a1'),
           ('contract_pay_due',         'p-1', '2026-11-22', '00000000-0000-0000-0000-0000000045a1'),
           ('contract_pay_due_app',     'p-1', '2026-11-22', '00000000-0000-0000-0000-0000000045a1'),
           ('contract_pay_overdue',     'p-2', '2026-11-10', '00000000-0000-0000-0000-0000000045a1'),
           ('contract_pay_overdue_app', 'p-2', '2026-11-10', '00000000-0000-0000-0000-0000000045a1'),
           ('firm_invite',              'f-1:abc', '2026-11-20', '00000000-0000-0000-0000-0000000045a1');
  exception when check_violation then
    raise exception 'T1 FAIL: a new kind is refused (20261201_45 not applied)';
  end;
  select count(*) into n from public.email_reminder_log where recipient_user_id = '00000000-0000-0000-0000-0000000045a1';
  if n <> 7 then raise exception 'T1 FAIL: expected 7 rows, got %', n; end if;
end $$;

-- T2 the old kinds and the foreign kind survived the rebuild (run twice)
do $$
begin
  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('hearing_1d', 'h-1', '2026-11-21', '00000000-0000-0000-0000-0000000045a2'),
         ('poa_30d',    'c-1', '2026-12-20', '00000000-0000-0000-0000-0000000045a2'),
         ('poa_7d',     'c-1', '2026-12-20', '00000000-0000-0000-0000-0000000045a2'),
         ('library_7d', 'g-1', '2026-11-27', '00000000-0000-0000-0000-0000000045a2'),
         ('library_3d', 'g-1', '2026-11-27', '00000000-0000-0000-0000-0000000045a2'),
         ('test_foreign_kind', 'x-1', '2026-11-20', '00000000-0000-0000-0000-0000000045a2');
exception when check_violation then
  raise exception 'T2 FAIL: an old kind or the other migration''s kind was dropped by the rebuild';
end $$;

-- T3 an unknown kind is still refused; exactly one kind CHECK exists
do $$
declare n int;
begin
  begin
    insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
    values ('marketing', 'x', '2026-11-20', '00000000-0000-0000-0000-0000000045a1');
    raise exception 'T3 FAIL: an unknown kind was accepted';
  exception when check_violation then null;
  end;
  select count(*) into n from pg_catalog.pg_constraint
   where conrelid = 'public.email_reminder_log'::regclass and contype = 'c'
     and pg_catalog.pg_get_constraintdef(oid) ~ '\mkind\M';
  if n <> 1 then raise exception 'T3 FAIL: % kind CHECKs (expected 1)', n; end if;
end $$;

-- T4 once per (kind, subject, recipient, day) still holds for the new kinds
do $$
declare n int;
begin
  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('task_due_1d_app', 't-1', '2026-11-21', '00000000-0000-0000-0000-0000000045a1')
  on conflict (kind, subject_id, recipient_user_id, due_on) do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T4 FAIL: the same in-app reminder was claimed twice'; end if;
  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('task_due_1d_app', 't-1', '2026-11-22', '00000000-0000-0000-0000-0000000045a1')
  on conflict (kind, subject_id, recipient_user_id, due_on) do nothing;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T4 FAIL: a re-dated task was blocked'; end if;
end $$;

-- T5 a signed-in user can neither read nor write the table
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000045a1', false);
do $$
begin
  begin
    perform 1 from public.email_reminder_log limit 1;
    raise exception 'T5 FAIL: authenticated can read email_reminder_log';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
    values ('firm_invite', 'f-2:abc', '2026-11-20', '00000000-0000-0000-0000-0000000045a1');
    raise exception 'T5 FAIL: authenticated can insert into email_reminder_log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'l11_remind_reminder_kinds: ALL PASS' as result;
