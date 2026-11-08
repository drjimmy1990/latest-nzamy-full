-- drafter_section_edits_1108.test.sql — proves 20261108_40 (owner ٤١٠ «عدّل
-- هذا القسم»): public.ai_start_section_edit prices a legal-drafter section
-- edit under ai_start_run's lock — free while the memo has used < 5 free edits
-- and the section < 2, else 10; a failed (refunded) edit gives its free edit
-- back; 30 edits per memo at most; a stale price is refused; a duplicate key
-- is ai_start_run's duplicate; two sessions cannot both take the 5th free edit.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_40_drafter_section_edits.sql \
--     $M/20261108_40_drafter_section_edits.sql \
--     $R/drafter_section_edits_1108.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261108_40
-- files → "T0 FAIL: ai_start_section_edit does not exist".
--
-- Every assertion RAISES on failure.

do $$
begin
  if to_regprocedure('public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)') is null then
    raise exception 'T0 FAIL: ai_start_section_edit does not exist (20261108_40 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
-- L …b001 a lawyer with 100 points; memo conversation …c001 (draft succeeded),
-- memo …c002 (draft still running).
insert into auth.users values ('00000000-0000-0000-0000-00000000b001');
insert into public.profiles (id, user_type, display_name) values ('00000000-0000-0000-0000-00000000b001', 'lawyer', 'L');
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at) values
  ('00000000-0000-0000-0000-0000000bb001', '00000000-0000-0000-0000-00000000b001', 'grant', 100, 100, now() + interval '1 year');
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, conversation_id, input, output, deadline_at) values
  ('00000000-0000-0000-0000-00000000b001', 'legal-drafter', 'job', 'succeeded', 200, 'memo1-issues', '00000000-0000-0000-0000-00000000c001',
   '{"phase":"issues","kind":"claim"}', '{"phase":"issues"}', now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b001', 'legal-drafter', 'job', 'succeeded', 0, 'memo1-draft', '00000000-0000-0000-0000-00000000c001',
   '{"phase":"draft","kind":"claim"}', '{"phase":"draft","sections":[{},{},{},{}]}', now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b001', 'legal-drafter', 'job', 'succeeded', 200, 'memo2-issues', '00000000-0000-0000-0000-00000000c002',
   '{"phase":"issues","kind":"claim"}', '{"phase":"issues"}', now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000b001', 'legal-drafter', 'job', 'running', 0, 'memo2-draft', '00000000-0000-0000-0000-00000000c002',
   '{"phase":"draft","kind":"claim"}', null, now() + interval '15 minutes');
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- One edit of memo c001 (or another memo); returns ai_start_run's row.
create or replace function pg_temp.edit(p_section int, p_price int, p_key text,
  p_conv uuid default '00000000-0000-0000-0000-00000000c001')
returns table (run_id uuid, created boolean, charged boolean, charged_points int) language sql as $$
  select x.run_id, x.created, x.charged, x.charged_points
    from public.ai_start_section_edit('00000000-0000-0000-0000-00000000b001', 'legal-drafter', null, 'job',
      p_price, 10, p_key, now() + interval '15 minutes', false,
      jsonb_build_object('phase', 'section', 'kind', 'claim', 'section_index', p_section),
      '{}', null, p_conv, '{}'::jsonb, p_section, 5, 2, 10, 30) x;
$$;
-- The P0001 message of an edit that must be refused, or 'started'.
create or replace function pg_temp.refusal(p_section int, p_price int, p_key text,
  p_conv uuid default '00000000-0000-0000-0000-00000000c001')
returns text language plpgsql as $$
begin
  perform * from pg_temp.edit(p_section, p_price, p_key, p_conv);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
end $$;

-- T1 a session role cannot run it; the draft must have succeeded
do $$
begin
  if has_function_privilege('authenticated',
       'public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)', 'EXECUTE')
     or has_function_privilege('anon',
       'public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)', 'EXECUTE') then
    raise exception 'T1 FAIL: a session role can execute ai_start_section_edit';
  end if;
  if pg_temp.refusal(0, 0, 'memo2-edit-01', '00000000-0000-0000-0000-00000000c002') <> 'section_no_draft' then
    raise exception 'T1 FAIL: an edit of a memo whose draft is still running was not refused';
  end if;
end $$;

-- T2 section 0: two free edits, the third is 10 (memo has used only 2)
do $$
declare r record; msg text;
begin
  select * into r from pg_temp.edit(0, 0, 'edit-0001');
  if not r.created or r.charged then raise exception 'T2 FAIL: 1st edit of section 0 not a new free run: %', r; end if;
  select * into r from pg_temp.edit(0, 0, 'edit-0002');
  if not r.created or r.charged then raise exception 'T2 FAIL: 2nd edit of section 0 not free: %', r; end if;
  msg := pg_temp.refusal(0, 0, 'edit-0003');
  if msg <> 'section_price_changed' then raise exception 'T2 FAIL: 3rd edit of section 0 offered free (%)', msg; end if;
  if exists (select 1 from public.ai_runs where idempotency_key = 'edit-0003') then
    raise exception 'T2 FAIL: a refused edit left a run behind';
  end if;
  select * into r from pg_temp.edit(0, 10, 'edit-0004');
  if not r.created or not r.charged or r.charged_points <> 10 then raise exception 'T2 FAIL: 3rd edit of section 0 not charged 10: %', r; end if;
  if public.points_balance('00000000-0000-0000-0000-00000000b001') <> 90 then
    raise exception 'T2 FAIL: balance after one paid edit is not 90';
  end if;
  raise notice 'T2 PASS: section 0 — free, free, then 10 points';
end $$;

-- T3 the memo's 5th free edit is free, the 6th is 10, and a paid price on a
--    free edit is refused too (the price must be exactly the rule's)
do $$
declare r record;
begin
  if pg_temp.refusal(1, 10, 'edit-0005') <> 'section_price_changed' then
    raise exception 'T3 FAIL: a free edit was started at 10';
  end if;
  select * into r from pg_temp.edit(1, 0, 'edit-0006');   -- memo free 3
  select * into r from pg_temp.edit(1, 0, 'edit-0007');   -- memo free 4
  select * into r from pg_temp.edit(2, 0, 'edit-0008');   -- memo free 5: the 5th is free
  if not r.created or r.charged then raise exception 'T3 FAIL: the 5th free edit was refused or charged: %', r; end if;
  if pg_temp.refusal(3, 0, 'edit-0009') <> 'section_price_changed' then
    raise exception 'T3 FAIL: a 6th free edit was given (section 3 untouched)';
  end if;
  select * into r from pg_temp.edit(3, 10, 'edit-0010');
  if not r.charged or r.charged_points <> 10 then raise exception 'T3 FAIL: the 6th edit was not charged 10: %', r; end if;
  raise notice 'T3 PASS: 5th memo edit free, 6th paid';
end $$;

-- T4 a failed edit is refunded and gives its free edit back; a duplicate key
--    is ai_start_run's duplicate, whatever the price would be now
do $$
declare r record; bal int;
begin
  perform public.ai_fail_run((select id from public.ai_runs where idempotency_key = 'edit-0008'), 'model_error');
  select * into r from pg_temp.edit(3, 0, 'edit-0011');
  if not r.created or r.charged then raise exception 'T4 FAIL: a failed free edit did not give its free edit back: %', r; end if;
  bal := public.points_balance('00000000-0000-0000-0000-00000000b001');
  perform public.ai_fail_run((select id from public.ai_runs where idempotency_key = 'edit-0010'), 'timeout');
  if public.points_balance('00000000-0000-0000-0000-00000000b001') <> bal + 10 then
    raise exception 'T4 FAIL: a failed paid edit was not refunded';
  end if;
  select * into r from pg_temp.edit(0, 0, 'edit-0001');
  if r.created then raise exception 'T4 FAIL: a repeated key created a run: %', r; end if;
  raise notice 'T4 PASS: failure frees the edit and refunds; duplicate key answered as duplicate';
end $$;

-- T5 two sessions race for the memo's last free edit (memo free = 5 after T4:
--    edits 1,2,6,7,11 → fail 11 to leave exactly one) with different keys:
--    B waits on A's lock, then recounts and is refused section_price_changed
-- (committed first: the two sessions must see it)
select public.ai_fail_run((select id from public.ai_runs where idempotency_key = 'edit-0011'), 'model_error');
create extension if not exists dblink;
do $$
declare
  ra   text;
  rb   text;
  errb text;
  conn text := format('dbname=%s user=%s', quote_ident(current_database()), quote_ident(current_user));
  q    text := 'select (x.created)::text from public.ai_start_section_edit(''00000000-0000-0000-0000-00000000b001'', '
              || '''legal-drafter'', null, ''job'', 0, 10, %L, now() + interval ''15 minutes'', false, '
              || '''{"phase":"section","kind":"claim","section_index":%s}''::jsonb, ''{}'', null, '
              || '''00000000-0000-0000-0000-00000000c001'', ''{}''::jsonb, %s, 5, 2, 10, 30) x';
begin
  perform dblink_connect('race_a', conn);
  perform dblink_connect('race_b', conn);
  perform dblink_exec('race_a', 'begin');
  select x into ra from dblink('race_a', format(q, 'race-edit-0a', 2, 2)) as t(x text);
  if ra is distinct from 'true' then raise exception 'T5 FAIL: session A returned %', ra; end if;
  perform dblink_send_query('race_b', format(q, 'race-edit-0b', 3, 3));
  perform pg_sleep(0.5);
  if dblink_is_busy('race_b') <> 1 then
    raise exception 'T5 FAIL: session B did not wait for session A''s start lock';
  end if;
  perform dblink_exec('race_a', 'commit');
  select x into rb from dblink_get_result('race_b', false) as t(x text);
  errb := dblink_error_message('race_b');
  perform x from dblink_get_result('race_b', false) as t(x text);   -- drain
  perform dblink_disconnect('race_a');
  perform dblink_disconnect('race_b');
  if rb is not null or errb not like '%section_price_changed%' then
    raise exception 'T5 FAIL: session B returned % / %', rb, errb;
  end if;
  if exists (select 1 from public.ai_runs where idempotency_key = 'race-edit-0b')
     or (select count(*) from public.ai_runs
          where conversation_id = '00000000-0000-0000-0000-00000000c001' and status <> 'failed'
            and input ->> 'phase' = 'section' and price_points = 0) <> 5 then
    raise exception 'T5 FAIL: after the race the memo does not hold exactly 5 free edits';
  end if;
  raise notice 'T5 PASS: two sessions, one free edit — A took it, B waited and was refused';
end $$;

-- T6 the 30th edit is the last: the 31st is refused section_edit_limit
do $$
declare n int; i int; msg text;
begin
  select count(*) into n from public.ai_runs
   where conversation_id = '00000000-0000-0000-0000-00000000c001' and status <> 'failed' and input ->> 'phase' = 'section';
  for i in 1 .. (30 - n) loop
    insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, conversation_id, input, deadline_at)
      values ('00000000-0000-0000-0000-00000000b001', 'legal-drafter', 'job', 'succeeded', 10, 'fill-' || i,
              '00000000-0000-0000-0000-00000000c001', '{"phase":"section","section_index":1}', now());
  end loop;
  msg := pg_temp.refusal(1, 10, 'edit-0031');
  if msg <> 'section_edit_limit' then raise exception 'T6 FAIL: the 31st edit was not refused (%)', msg; end if;
  raise notice 'T6 PASS: 30 section edits per memo';
end $$;

-- T7 bad arguments: the input must be a section edit of that index
do $$
begin
  begin
    perform public.ai_start_section_edit('00000000-0000-0000-0000-00000000b001', 'legal-drafter', null, 'job',
      0, 10, 'edit-bad-01', now() + interval '15 minutes', false,
      '{"phase":"draft","kind":"claim"}'::jsonb, '{}', null, '00000000-0000-0000-0000-00000000c001', '{}'::jsonb, 0, 5, 2, 10, 30);
    raise exception 'T7 FAIL: a draft input was started as a section edit';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'T7 PASS: invalid arguments refused';
end $$;

select 'drafter_section_edits_1108: all passed' as ok;
