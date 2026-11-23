-- legislative_journal.test.sql — proves 20261203_70 (owner Q190–Q195):
-- a visitor (anon) and a signed-in non-admin («subscriber» at database
-- level — the subscriber's extra fields are shaped by the server, never read
-- from these tables by his session) read and write NOTHING, approved rows
-- included; an admin reads and writes entries and issues through RLS; an
-- issue cannot leave the draft state without an approval stamp; an entry is
-- in at most one issue; the send log is once per (issue, recipient) and
-- written by the service role only.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The file runs
-- twice (idempotent). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20261203_70_legislative_journal.sql \
--     $M/20261203_70_legislative_journal.sql \
--     $R/legislative_journal.test.sql
-- NEGATIVE CONTROLS: without the migration the chain fails at T0; T7 adds a
-- permissive policy and proves the leak assertion of T5 would catch it.
-- Every assertion RAISES on failure.

-- T0 precondition
do $$
begin
  if to_regclass('public.journal_entries') is null or to_regclass('public.journal_issue_sends') is null then
    raise exception 'T0 FAIL: the journal tables do not exist (20261203_70 not applied)';
  end if;
end $$;

-- fixtures (superuser): an admin, a subscriber, an approved and a draft entry
insert into auth.users values ('00000000-0000-0000-0000-00000000a701'), ('00000000-0000-0000-0000-00000000a702');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-00000000a701', 'admin'),
  ('00000000-0000-0000-0000-00000000a702', 'individual');

insert into public.journal_entries (id, title, published_on, issuing_body, impact_lines, badge, effective_on, status, approved_by, approved_at)
values ('00000000-0000-0000-0000-0000000e0001', 'تعديل نظام تجريبي', '2026-11-10', 'مجلس الوزراء',
        array['سطر أثر أول'], 'amended', '2027-01-01', 'approved', '00000000-0000-0000-0000-00000000a701', now()),
       ('00000000-0000-0000-0000-0000000e0002', 'مسودة خبر', '2026-11-12', null, '{}', null, null, 'draft', null, null);

-- T1 checks: approval stamp, badge list, link scheme, impact cap
do $$
begin
  begin
    insert into public.journal_entries (title, published_on, status) values ('خبر بلا اعتماد', '2026-11-01', 'approved');
    raise exception 'T1 FAIL: an approved entry without approved_at was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.journal_entries (title, published_on, badge) values ('خبر بشارة غريبة', '2026-11-01', 'hot');
    raise exception 'T1 FAIL: an unknown badge was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.journal_entries (title, published_on, source_url) values ('خبر برابط', '2026-11-01', 'javascript:alert(1)');
    raise exception 'T1 FAIL: a non-http link was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.journal_entries (title, published_on, impact_lines)
    values ('خبر بأثر طويل', '2026-11-01', array['1','2','3','4','5','6','7','8','9','10','11']);
    raise exception 'T1 FAIL: more than 10 impact lines were accepted';
  exception when check_violation then null;
  end;
end $$;

-- T2 issues: one per month, the 1st only, no send without approval
do $$
begin
  insert into public.journal_issues (id, period_month, title)
  values ('00000000-0000-0000-0000-0000000f0001', '2026-11-01', 'عدد نوفمبر ٢٠٢٦');
  begin
    insert into public.journal_issues (period_month, title) values ('2026-11-01', 'عدد مكرر');
    raise exception 'T2 FAIL: a second issue for the same month was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.journal_issues (period_month, title) values ('2026-10-15', 'عدد منتصف الشهر');
    raise exception 'T2 FAIL: a period that is not the 1st was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.journal_issues set status = 'sending' where id = '00000000-0000-0000-0000-0000000f0001';
    raise exception 'T2 FAIL: an issue went to sending without an approval stamp';
  exception when check_violation then null;
  end;
  begin
    update public.journal_issues set status = 'sent', approved_at = now() where id = '00000000-0000-0000-0000-0000000f0001';
    raise exception 'T2 FAIL: an issue was marked sent without sent_at';
  exception when check_violation then null;
  end;
end $$;

-- T3 an entry is in one issue only, and cannot be deleted while in it
do $$
begin
  insert into public.journal_issue_entries (issue_id, entry_id) values
    ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000e0001')
  on conflict do nothing;
  insert into public.journal_issues (id, period_month, title)
  values ('00000000-0000-0000-0000-0000000f0002', '2026-12-01', 'عدد ديسمبر ٢٠٢٦')
  on conflict (period_month) do nothing;
  begin
    insert into public.journal_issue_entries (issue_id, entry_id) values
      ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000e0001');
    raise exception 'T3 FAIL: one entry was put in two issues';
  exception when unique_violation then null;
  end;
  begin
    delete from public.journal_entries where id = '00000000-0000-0000-0000-0000000e0001';
    raise exception 'T3 FAIL: an entry inside an issue was deleted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- T4 send log: once per (issue, recipient); a deleted account takes its rows
do $$
declare n int;
begin
  insert into public.journal_issue_sends (issue_id, user_id) values
    ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000a702')
  on conflict (issue_id, user_id) do nothing;
  insert into public.journal_issue_sends (issue_id, user_id) values
    ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000a702')
  on conflict (issue_id, user_id) do nothing;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T4 FAIL: the same recipient was claimed twice'; end if;
  begin
    update public.journal_issue_sends set status = 'queued' where user_id = '00000000-0000-0000-0000-00000000a702';
    raise exception 'T4 FAIL: an unknown send status was accepted';
  exception when check_violation then null;
  end;
end $$;

-- T5 privileges: anon holds nothing; authenticated cannot write the send log
do $$
declare t text; p text;
begin
  foreach t in array array['journal_entries', 'journal_issues', 'journal_issue_entries', 'journal_issue_sends'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.' || t, p) then
        raise exception 'T5 FAIL: anon holds % on %', p, t;
      end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'public.journal_issue_sends', 'INSERT')
     or has_table_privilege('authenticated', 'public.journal_issue_sends', 'UPDATE') then
    raise exception 'T5 FAIL: authenticated may write the send log';
  end if;
end $$;

-- app_user = exactly what `authenticated` holds on the live database
revoke all on public.journal_entries, public.journal_issues, public.journal_issue_entries, public.journal_issue_sends from app_user;

-- T6a the visitor (anon role): every table refuses
set role anon;
do $$
declare t text;
begin
  perform set_config('test.uid', '', true);
  foreach t in array array['journal_entries', 'journal_issues', 'journal_issue_entries', 'journal_issue_sends'] loop
    begin
      execute format('select 1 from public.%I limit 1', t);
      raise exception 'T6a FAIL: a visitor read %', t;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;
reset role;

-- T6b the signed-in subscriber: sees no row (approved included), writes nothing
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a702', true);
  select count(*) into n from public.journal_entries;
  if n <> 0 then raise exception 'T6b FAIL: a non-admin read % journal entries', n; end if;
  select count(*) into n from public.journal_issues;
  if n <> 0 then raise exception 'T6b FAIL: a non-admin read % issues', n; end if;
  select count(*) into n from public.journal_issue_sends;
  if n <> 0 then raise exception 'T6b FAIL: a non-admin read % send rows (his own included)', n; end if;
  begin
    insert into public.journal_entries (title, published_on) values ('خبر من غير مسؤول', '2026-11-01');
    raise exception 'T6b FAIL: a non-admin added an entry';
  exception when insufficient_privilege then null;
  end;
  update public.journal_entries set title = 'مُعدّل من غير مسؤول' where id = '00000000-0000-0000-0000-0000000e0002';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6b FAIL: a non-admin edited an entry'; end if;
  update public.journal_issues set status = 'approved', approved_at = now() where id = '00000000-0000-0000-0000-0000000f0001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6b FAIL: a non-admin approved an issue'; end if;
  begin
    insert into public.journal_issue_sends (issue_id, user_id) values
      ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-00000000a702');
    raise exception 'T6b FAIL: a non-admin wrote the send log';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T6c the admin: reads both entries, adds / approves one, approves an issue,
-- reads the send log but cannot write it
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a701', true);
  select count(*) into n from public.journal_entries where id in ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0002');
  if n <> 2 then raise exception 'T6c FAIL: the admin read % of 2 entries', n; end if;
  insert into public.journal_entries (id, title, published_on)
  values ('00000000-0000-0000-0000-0000000e0003', 'خبر من المسؤول', '2026-11-20')
  on conflict (id) do nothing;
  update public.journal_entries set status = 'approved', approved_at = now(), approved_by = '00000000-0000-0000-0000-00000000a701'
   where id = '00000000-0000-0000-0000-0000000e0003';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T6c FAIL: the admin could not approve an entry'; end if;
  update public.journal_issues set status = 'approved', approved_at = now(), approved_by = '00000000-0000-0000-0000-00000000a701'
   where id = '00000000-0000-0000-0000-0000000f0002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T6c FAIL: the admin could not approve an issue'; end if;
  select count(*) into n from public.journal_issue_sends;
  if n < 1 then raise exception 'T6c FAIL: the admin cannot read the send log'; end if;
  begin
    insert into public.journal_issue_sends (issue_id, user_id) values
      ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-00000000a701');
    raise exception 'T6c FAIL: the admin session wrote the send log (service role only)';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T7 NEGATIVE CONTROL: a permissive policy WOULD leak to the subscriber, and
-- T6b's assertion sees it — then the policy is removed and the leak is gone.
create policy journal_entries_leak_probe on public.journal_entries for select to authenticated using (true);
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a702', true);
  select count(*) into n from public.journal_entries;
  if n = 0 then raise exception 'T7 FAIL: the leak probe did not leak — T6b proves nothing'; end if;
end $$;
reset role;
drop policy journal_entries_leak_probe on public.journal_entries;
set role app_user;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a702', true);
  select count(*) into n from public.journal_entries;
  if n <> 0 then raise exception 'T7 FAIL: rows still visible after the probe was dropped'; end if;
end $$;
reset role;

-- T8 a deleted account takes its send rows; the entry keeps its approval
do $$
begin
  delete from public.journal_issue_sends where user_id = '00000000-0000-0000-0000-00000000a701';
  delete from auth.users where id = '00000000-0000-0000-0000-00000000a702';
  if exists (select 1 from public.journal_issue_sends where user_id = '00000000-0000-0000-0000-00000000a702') then
    raise exception 'T8 FAIL: send rows outlived the account';
  end if;
end $$;

select 'legislative_journal.test.sql: ALL PASS' as result;
