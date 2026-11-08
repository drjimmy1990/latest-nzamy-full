-- drafter_daily_limit_1108.test.sql — proves 20261108_41 (final review of
-- batch 2026-11-08, item 2): in public.ai_start_run, a legal-drafter section
-- edit no longer counts toward the drafter's daily limit, and the free draft
-- that follows a succeeded analysis is never refused for the day — while the
-- limit still holds for analyses, for a second draft, for a run with no input,
-- and for every other tool.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261108_41
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
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $R/drafter_daily_limit_1108.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261108_41
-- files → "T1 FAIL: … section edits were counted against the memo (daily_limit)".
--
-- Every assertion RAISES on failure.

-- ── fixtures as postgres ────────────────────────────────────────────────────
-- L …d001 a lawyer with 10 000 points. Memo c001: analysis + draft succeeded
-- and 10 section edits today (paid, so the next edit would still be free).
insert into auth.users values ('00000000-0000-0000-0000-00000000d001'), ('00000000-0000-0000-0000-00000000d002'),
                              ('00000000-0000-0000-0000-00000000d003');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000d001', 'lawyer', 'L1'),
  ('00000000-0000-0000-0000-00000000d002', 'lawyer', 'L2'),
  ('00000000-0000-0000-0000-00000000d003', 'lawyer', 'L3');
insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at) values
  ('00000000-0000-0000-0000-0000000dd001', '00000000-0000-0000-0000-00000000d001', 'grant', 10000, 10000, now() + interval '1 year'),
  ('00000000-0000-0000-0000-0000000dd002', '00000000-0000-0000-0000-00000000d002', 'grant', 10000, 10000, now() + interval '1 year');
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, conversation_id, input, output, deadline_at) values
  ('00000000-0000-0000-0000-00000000d001', 'legal-drafter', 'job', 'succeeded', 200, 'm1-issues', '00000000-0000-0000-0000-00000000c001',
   '{"phase":"issues","kind":"claim"}', '{"phase":"issues"}', now() + interval '15 minutes'),
  ('00000000-0000-0000-0000-00000000d001', 'legal-drafter', 'job', 'succeeded', 0, 'm1-draft', '00000000-0000-0000-0000-00000000c001',
   '{"phase":"draft","kind":"claim"}', '{"phase":"draft","sections":[{},{},{},{}]}', now() + interval '15 minutes');
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, conversation_id, input, deadline_at)
  select '00000000-0000-0000-0000-00000000d001', 'legal-drafter', 'job', 'succeeded', 10, 'm1-sec-' || i,
         '00000000-0000-0000-0000-00000000c001', jsonb_build_object('phase', 'section', 'kind', 'claim', 'section_index', 3), now()
    from generate_series(1, 10) i;
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- One legal-drafter start through ai_start_run (limit 10, as tools.ts); 'started' or the P0001 message.
create or replace function pg_temp.start(p_user uuid, p_key text, p_input jsonb, p_conv uuid, p_price int,
                                         p_tool text default 'legal-drafter', p_limit int default 10)
returns text language plpgsql as $$
begin
  perform * from public.ai_start_run(p_user, p_tool, null, 'job', p_price, p_limit, p_key,
    now() + interval '15 minutes', false, p_input, '{}', null, p_conv, '{}'::jsonb);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
end $$;

-- T1 ten section edits today do not stop a new memo
do $$
declare msg text;
begin
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm3-issues', '{"phase":"issues","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c003', 200);
  if msg <> 'started' then
    raise exception 'T1 FAIL: a new analysis after 2 memo runs and 10 section edits was refused (%) — section edits were counted against the memo (daily_limit)', msg;
  end if;
  raise notice 'T1 PASS: section edits are not counted for the day';
end $$;

-- T2 the limit still holds for analyses: 10 non-section runs today → the 11th analysis is refused
update public.ai_runs set status = 'succeeded', output = '{"phase":"issues"}'
 where idempotency_key = 'm3-issues';
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, conversation_id, input, deadline_at)
  select '00000000-0000-0000-0000-00000000d001', 'legal-drafter', 'job', 'succeeded', 200, 'fill-issues-' || i,
         gen_random_uuid(), '{"phase":"issues","kind":"claim"}', now()
    from generate_series(1, 7) i;
do $$
declare msg text;
begin
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm4-issues', '{"phase":"issues","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c004', 200);
  if msg <> 'daily_limit' then raise exception 'T2 FAIL: the 11th analysis of the day was not refused (%)', msg; end if;
  if exists (select 1 from public.ai_runs where idempotency_key = 'm4-issues') then
    raise exception 'T2 FAIL: a refused analysis left a run behind';
  end if;
  raise notice 'T2 PASS: 10 memo runs a day still hold';
end $$;

-- T3 the draft of a succeeded analysis is started even at the limit; a second
--    draft of the same memo is not exempt; a failed draft can be retried
do $$
declare msg text; bal int;
begin
  bal := public.points_balance('00000000-0000-0000-0000-00000000d001');
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm3-draft-1', '{"phase":"draft","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c003', 0);
  if msg <> 'started' then raise exception 'T3 FAIL: the free draft of a paid analysis was refused at the limit (%)', msg; end if;
  if public.points_balance('00000000-0000-0000-0000-00000000d001') <> bal then raise exception 'T3 FAIL: the draft was charged'; end if;

  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm3-draft-2', '{"phase":"draft","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c003', 0);
  if msg <> 'daily_limit' then raise exception 'T3 FAIL: a second draft of the same memo was exempt (%)', msg; end if;

  perform public.ai_fail_run((select id from public.ai_runs where idempotency_key = 'm3-draft-1'), 'model_error');
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm3-draft-3', '{"phase":"draft","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c003', 0);
  if msg <> 'started' then raise exception 'T3 FAIL: the retry of a failed draft was refused (%)', msg; end if;
  raise notice 'T3 PASS: one exempt draft per succeeded analysis';
end $$;

-- T4 a draft whose analysis has not succeeded gets no exemption
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, conversation_id, input, deadline_at) values
  ('00000000-0000-0000-0000-00000000d001', 'legal-drafter', 'job', 'running', 200, 'm5-issues',
   '00000000-0000-0000-0000-00000000c005', '{"phase":"issues","kind":"claim"}', now() + interval '15 minutes');
do $$
declare msg text;
begin
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm5-draft', '{"phase":"draft","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c005', 0);
  if msg <> 'daily_limit' then raise exception 'T4 FAIL: a draft of a running analysis was exempt (%)', msg; end if;
  -- …and with no conversation at all
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d001', 'm6-draft', '{"phase":"draft","kind":"claim"}', null, 0);
  if msg <> 'daily_limit' then raise exception 'T4 FAIL: a draft with no conversation was exempt (%)', msg; end if;
  raise notice 'T4 PASS: no exemption without a succeeded analysis';
end $$;

-- T5 a section edit still starts at the day's limit (ai_start_section_edit passes no daily limit)
do $$
declare r record;
begin
  select x.created, x.charged into r
    from public.ai_start_section_edit('00000000-0000-0000-0000-00000000d001', 'legal-drafter', null, 'job',
      0, 10, 'm1-sec-new', now() + interval '15 minutes', false,
      '{"phase":"section","kind":"claim","section_index":0}'::jsonb, '{}', null,
      '00000000-0000-0000-0000-00000000c001', '{}'::jsonb, 0, 5, 2, 10, 30) x;
  if not r.created or r.charged then raise exception 'T5 FAIL: a free section edit at the limit was not started free: %', r; end if;
  raise notice 'T5 PASS: section edits still start at the limit';
end $$;

-- T6 a drafter run with no input, or no phase, is still counted
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, input, deadline_at)
  select '00000000-0000-0000-0000-00000000d002', 'legal-drafter', 'job', 'succeeded', 0, 'noinput-' || i,
         case when i % 2 = 0 then null else '{"kind":"claim"}'::jsonb end, now()
    from generate_series(1, 10) i;
do $$
declare msg text;
begin
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d002', 'l2-issues', '{"phase":"issues","kind":"claim"}',
                       '00000000-0000-0000-0000-00000000c201', 200);
  if msg <> 'daily_limit' then raise exception 'T6 FAIL: runs with no input / no phase were not counted (%)', msg; end if;
  raise notice 'T6 PASS: a run with no phase still counts';
end $$;

-- T7 another tool is untouched: its "section" runs still count
insert into public.ai_runs (user_id, tool, class, status, price_points, idempotency_key, input, deadline_at)
  select '00000000-0000-0000-0000-00000000d003', 'assistant', 'fast', 'succeeded', 0, 'asst-' || i, '{"phase":"section"}', now()
    from generate_series(1, 2) i;
do $$
declare msg text;
begin
  msg := pg_temp.start('00000000-0000-0000-0000-00000000d003', 'asst-run-0003', '{"phase":"section"}', null, 0, 'assistant', 2);
  if msg <> 'daily_limit' then raise exception 'T7 FAIL: another tool''s runs stopped counting (%)', msg; end if;
  raise notice 'T7 PASS: other tools count as before';
end $$;

-- T8 still one overload, SECURITY DEFINER, search_path '', service role only
do $$
declare fn regprocedure := to_regprocedure('public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)');
begin
  if fn is null or (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'ai_start_run') <> 1 then
    raise exception 'T8 FAIL: ai_start_run is missing or overloaded';
  end if;
  if not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p where p.oid = fn) then
    raise exception 'T8 FAIL: ai_start_run lost SECURITY DEFINER / search_path';
  end if;
  if has_function_privilege('authenticated', fn, 'EXECUTE') or has_function_privilege('anon', fn, 'EXECUTE')
     or not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'T8 FAIL: ai_start_run grants changed';
  end if;
  raise notice 'T8 PASS: one overload, definer, service role only';
end $$;

select 'drafter_daily_limit_1108: all passed' as ok;
