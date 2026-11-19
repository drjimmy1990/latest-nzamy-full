-- l9_public_free_questions.test.sql — proves 20261129_60 (batch l9-public,
-- owner register 14 rows 4 and 36): an individual's 5 free questions are on
-- the GENERAL assistant (quick-answer) and do not depend on the library being
-- open for individuals; a lawyer's 10 stay on the library assistant (library
-- rule kept); the e-mail rule holds for both; a tool that is not the account's
-- own free tool is refused as free_question_not_eligible (the app then charges
-- the normal price). The migration runs TWICE (re-runnable) and the l9_public
-- block of _verify.sql runs after it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l9_public.sql
--   sed -n '/^-- >>> verify:l9_public/,/^-- <<< verify:l9_public/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261127_40_points_wallets.sql \
--     $R/prelude_l8_liblock.sql \
--     $M/20261128_20_library_access_by_account_type.sql \
--     $M/20261129_60_free_questions_general_assistant.sql \
--     $M/20261129_60_free_questions_general_assistant.sql \
--     "$B" \
--     $R/l9_public_free_questions.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261129_60
-- files and the verify block → "T0 FAIL: ai_start_free_question does not take quick-answer".
--
-- Every assertion RAISES.

do $$
begin
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure(
       'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)')), '''quick-answer''') = 0 then
    raise exception 'T0 FAIL: ai_start_free_question does not take quick-answer (20261129_60 not applied)';
  end if;
end $$;

insert into auth.users (id, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000c0001', now()),   -- lawyer
  ('00000000-0000-0000-0000-0000000c0002', now()),   -- individual
  ('00000000-0000-0000-0000-0000000c0003', null),    -- individual, e-mail NOT verified
  ('00000000-0000-0000-0000-0000000c0004', now()),   -- corporate (no allowance in the setting)
  ('00000000-0000-0000-0000-0000000c0005', now());   -- firm (library closed for firms)
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000c0001', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000c0002', 'individual', 'I'),
  ('00000000-0000-0000-0000-0000000c0003', 'individual', 'IU'),
  ('00000000-0000-0000-0000-0000000c0004', 'corporate', 'C'),
  ('00000000-0000-0000-0000-0000000c0005', 'firm', 'F');
insert into public.lawyer_profiles (user_id, practice_kind) values
  ('00000000-0000-0000-0000-0000000c0001', 'advocate');
update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';
-- the seeded switch (20261128_20): lawyers open, individuals and firms closed
update public.platform_settings set value = value || '{"firm": 10}'::jsonb where key = 'free_questions_by_account_type';

create or replace function pg_temp.ask(p_user uuid, p_tool text, p_key text)
returns table (run_id uuid, created boolean, charged boolean, charged_points int) language sql as $$
  select x.run_id, x.created, x.charged, x.charged_points
    from public.ai_start_free_question(p_user, p_tool, null, 'fast', 0, 60, p_key,
      now() + interval '90 seconds', false, '{"question":"q","message":"q"}'::jsonb) x;
$$;
create or replace function pg_temp.refusal(p_user uuid, p_tool text, p_key text)
returns text language plpgsql as $$
begin
  perform * from pg_temp.ask(p_user, p_tool, p_key);
  return 'started';
exception when sqlstate 'P0001' then
  return sqlerrm;
when sqlstate '22023' then
  return 'invalid';
end $$;
create or replace function pg_temp.allow(p uuid) returns int language sql as $$
  select s.allowance from public.ai_free_question_status(p) s $$;
create or replace function pg_temp.left_(p uuid) returns int language sql as $$
  select s.allowance - s.used from public.ai_free_question_status(p) s $$;

-- T1 an individual has 5 although the library is closed for individuals, and
--    they are spent on quick-answer, free (price 0, nothing charged)
do $$
declare r record;
begin
  if coalesce((select a.allowed from public.library_access_for('00000000-0000-0000-0000-0000000c0002') a), false) then
    raise exception 'T1 SETUP: individuals should be closed by the seeded switch';
  end if;
  if pg_temp.allow('00000000-0000-0000-0000-0000000c0002') <> 5 then
    raise exception 'T1 FAIL: a verified individual does not have 5 (got %)', pg_temp.allow('00000000-0000-0000-0000-0000000c0002');
  end if;
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'quick-answer', 'l9-i-0001');
  if not r.created or r.charged then raise exception 'T1 FAIL: the individual quick-answer question was not free: %', r; end if;
  if (select u.tool from public.ai_free_question_uses u where u.run_id = r.run_id) <> 'quick-answer' then
    raise exception 'T1 FAIL: the use row does not name quick-answer';
  end if;
  if pg_temp.left_('00000000-0000-0000-0000-0000000c0002') <> 4 then
    raise exception 'T1 FAIL: 4 should be left';
  end if;
  raise notice 'T1 PASS: an individual''s 5 are on quick-answer, library closed or not';
end $$;

-- T2 an individual cannot take a free LIBRARY question, and a lawyer cannot
--    take a free quick-answer one: not eligible (the app charges the normal way)
do $$
begin
  if pg_temp.refusal('00000000-0000-0000-0000-0000000c0002', 'library-assistant', 'l9-i-0002') <> 'free_question_not_eligible' then
    raise exception 'T2 FAIL: an individual got a free library-assistant question';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-0000000c0001', 'quick-answer', 'l9-l-0001') <> 'free_question_not_eligible' then
    raise exception 'T2 FAIL: a lawyer got a free quick-answer question';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-0000000c0001', 'assistant', 'l9-l-0002') <> 'invalid' then
    raise exception 'T2 FAIL: a third tool was not refused as invalid';
  end if;
  raise notice 'T2 PASS: each account type on its own tool only';
end $$;

-- T3 a lawyer keeps his 10 on the library assistant; the library rule still
--    applies to him (and to a firm); the e-mail rule applies to an individual
do $$
declare r record;
begin
  if pg_temp.allow('00000000-0000-0000-0000-0000000c0001') <> 10 then
    raise exception 'T3 FAIL: a verified lawyer does not have 10';
  end if;
  select * into r from pg_temp.ask('00000000-0000-0000-0000-0000000c0001', 'library-assistant', 'l9-l-0003');
  if not r.created or r.charged then raise exception 'T3 FAIL: the lawyer library question was not free: %', r; end if;
  if pg_temp.allow('00000000-0000-0000-0000-0000000c0005') <> 0 then
    raise exception 'T3 FAIL: a firm got free library questions while firms are closed';
  end if;
  update public.platform_settings set value = value || '{"lawyer": false}'::jsonb where key = 'library_access_by_account_type';
  if pg_temp.allow('00000000-0000-0000-0000-0000000c0001') <> 0 then
    raise exception 'T3 FAIL: a lawyer kept free library questions while lawyers are closed';
  end if;
  update public.platform_settings set value = value || '{"lawyer": true}'::jsonb where key = 'library_access_by_account_type';
  if pg_temp.allow('00000000-0000-0000-0000-0000000c0003') <> 0
     or pg_temp.refusal('00000000-0000-0000-0000-0000000c0003', 'quick-answer', 'l9-iu-0001') <> 'free_question_not_eligible' then
    raise exception 'T3 FAIL: an unverified individual got free questions';
  end if;
  if pg_temp.allow('00000000-0000-0000-0000-0000000c0004') <> 0 then
    raise exception 'T3 FAIL: a corporate account got an allowance it has not been given';
  end if;
  raise notice 'T3 PASS: lawyer 10 on the library (library rule kept), e-mail rule for everyone';
end $$;

-- T4 the allowance runs out: the 6th individual question is refused as used
do $$
declare i int;
begin
  for i in 2..5 loop
    perform * from pg_temp.ask('00000000-0000-0000-0000-0000000c0002', 'quick-answer', 'l9-i-01' || i);
  end loop;
  if pg_temp.left_('00000000-0000-0000-0000-0000000c0002') <> 0 then
    raise exception 'T4 FAIL: 0 should be left';
  end if;
  if pg_temp.refusal('00000000-0000-0000-0000-0000000c0002', 'quick-answer', 'l9-i-0199') <> 'free_question_used' then
    raise exception 'T4 FAIL: a 6th free question was not refused as used';
  end if;
  raise notice 'T4 PASS: five, then free_question_used';
end $$;

-- T5 grants: service role only, one overload each
do $$
begin
  if has_function_privilege('authenticated', 'public.ai_free_question_status(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ai_free_question_status(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE') then
    raise exception 'T5 FAIL: wrong EXECUTE grants';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('ai_start_free_question', 'ai_free_question_status')) <> 2 then
    raise exception 'T5 FAIL: an extra overload exists';
  end if;
  raise notice 'T5 PASS: service role only, one overload each';
end $$;
