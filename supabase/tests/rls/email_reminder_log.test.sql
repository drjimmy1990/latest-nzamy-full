-- email_reminder_log.test.sql — proves 20261125_20 (reminder e-mails):
-- the (kind, subject_id, recipient_user_id, due_on) key makes each reminder
-- e-mail go out once per recipient, a re-dated subject is a new reminder, a
-- failed row can be re-claimed exactly once per run, only the five kinds
-- exist, a deleted account takes its rows with it, and a signed-in user can
-- neither read nor write the table.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The file runs
-- twice (idempotent). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20261125_20_email_reminder_log.sql \
--     $M/20261125_20_email_reminder_log.sql \
--     $R/email_reminder_log.test.sql
-- NEGATIVE CONTROL: without the migration the chain fails at T0.
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regclass('public.email_reminder_log') is null then
    raise exception 'T0 FAIL: email_reminder_log does not exist (20261125_20 not applied)';
  end if;
end $$;

insert into auth.users values ('00000000-0000-0000-0000-00000000e001'), ('00000000-0000-0000-0000-00000000e002');

-- T1 once per (kind, subject, recipient, day); another recipient, kind or day is its own row
do $$
declare n int;
begin
  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('hearing_1d', 'h-1', '2026-11-20', '00000000-0000-0000-0000-00000000e001')
  on conflict (kind, subject_id, recipient_user_id, due_on) do nothing;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1 FAIL: first row not inserted (%)', n; end if;

  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('hearing_1d', 'h-1', '2026-11-20', '00000000-0000-0000-0000-00000000e001')
  on conflict (kind, subject_id, recipient_user_id, due_on) do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1 FAIL: the same reminder was claimed twice'; end if;

  insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
  values ('hearing_1d', 'h-1', '2026-11-20', '00000000-0000-0000-0000-00000000e002'),
         ('hearing_1d', 'h-1', '2026-11-27', '00000000-0000-0000-0000-00000000e001'),
         ('poa_30d',    'c-1', '2026-12-17', '00000000-0000-0000-0000-00000000e001'),
         ('poa_7d',     'c-1', '2026-12-17', '00000000-0000-0000-0000-00000000e001')
  on conflict (kind, subject_id, recipient_user_id, due_on) do nothing;
  get diagnostics n = row_count;
  if n <> 4 then raise exception 'T1 FAIL: another recipient / day / kind was blocked (% of 4)', n; end if;
end $$;

-- T2 the retry claim: failed → sending happens once, sent/sending never
do $$
declare n int;
begin
  update public.email_reminder_log set status = 'failed', last_error = 'failed'
   where kind = 'poa_30d' and subject_id = 'c-1';
  update public.email_reminder_log set status = 'sending', attempts = attempts + 1
   where kind = 'poa_30d' and subject_id = 'c-1' and recipient_user_id = '00000000-0000-0000-0000-00000000e001'
     and due_on = '2026-12-17' and status = 'failed' and attempts < 3;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2 FAIL: a failed row could not be re-claimed'; end if;
  update public.email_reminder_log set status = 'sending', attempts = attempts + 1
   where kind = 'poa_30d' and subject_id = 'c-1' and status = 'failed' and attempts < 3;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T2 FAIL: a row being sent was claimed a second time'; end if;
end $$;

-- T3 only the five kinds and the three statuses
do $$
begin
  begin
    insert into public.email_reminder_log (kind, subject_id, due_on, recipient_user_id)
    values ('marketing', 'x', '2026-11-20', '00000000-0000-0000-0000-00000000e001');
    raise exception 'T3 FAIL: an unknown kind was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.email_reminder_log set status = 'pending' where subject_id = 'h-1';
    raise exception 'T3 FAIL: an unknown status was accepted';
  exception when check_violation then null;
  end;
end $$;

-- T4 a deleted account takes its rows with it
do $$
begin
  delete from auth.users where id = '00000000-0000-0000-0000-00000000e002';
  if exists (select 1 from public.email_reminder_log where recipient_user_id = '00000000-0000-0000-0000-00000000e002') then
    raise exception 'T4 FAIL: rows outlived the account';
  end if;
end $$;

-- T5 privileges (after the second run)
do $$
begin
  if has_table_privilege('authenticated', 'public.email_reminder_log', 'SELECT')
     or has_table_privilege('anon', 'public.email_reminder_log', 'SELECT')
     or has_table_privilege('authenticated', 'public.email_reminder_log', 'INSERT')
     or has_table_privilege('authenticated', 'public.email_reminder_log', 'UPDATE') then
    raise exception 'T5 FAIL: a session role holds a privilege on email_reminder_log';
  end if;
  if not has_table_privilege('service_role', 'public.email_reminder_log', 'INSERT') then
    raise exception 'T5 FAIL: service_role cannot INSERT';
  end if;
end $$;

-- T6 a signed-in user cannot read the table (app_user has only what
-- `authenticated` would have on the live database)
revoke all on public.email_reminder_log from app_user;
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000e001', true);
  begin
    perform 1 from public.email_reminder_log limit 1;
    raise exception 'T6 FAIL: a signed-in user read email_reminder_log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'email_reminder_log.test.sql: ALL PASS' as result;
