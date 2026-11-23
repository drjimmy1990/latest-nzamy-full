-- =============================================================================
-- Migration: 20261203_50_l13_assistant.sql   (verify id: l13_assistant)
-- =============================================================================
-- PURPOSE (batch l13, builder «assistant»; the owner's replies of 22 Nov 2026)
--
--   Q181 (ب) — an individual's 5 free legal questions are answered in the
--     site's floating help window, «مساعد نظامي», not in the quick answer.
--     platform_settings 'free_question_tool_by_account_type' gains the value
--       {"individual": "floating"}   (the registry tool `floating`: the quick
--                                     answer's workflow, free questions only,
--                                     never charged — src/lib/ai/tools.ts)
--     and it is the individual's DEFAULT:
--       * the row still on l12's seeded "quick-answer" is moved to "floating"
--         ONCE (its description then names Q181, so a re-run never undoes an
--         admin who later chose "quick-answer" again); an admin's "assistant"
--         is left alone;
--       * public.ai_free_question_tool(p_user) RE-CREATED from its latest body
--         (20261202_50 §3): 'floating' accepted, and a missing / malformed
--         value now reads as 'floating' (was 'quick-answer');
--       * public.ai_start_free_question RE-CREATED from its latest body
--         (20261202_50 §3) with one change: p_tool may be 'floating'.
--       public.ai_free_question_status is NOT re-created (its latest body,
--       20261202_50, already asks ai_free_question_tool; the library-open
--       rule stays for the library assistant only).
--     platform_settings 'ai_tools': the new tool `floating` is OFF in the
--       registry until switched on; this file copies the general assistant's
--       stored mode into ai_tools.floating once (only when ai_tools has no
--       'floating' entry), so the window answers wherever the quick answer is
--       already open. An admin switches it like any tool afterwards.
--
--   Q182 — «استمع للإجابة» is FREE (the browser's speech synthesis). The voice
--     is an admin setting until the owner chooses among his three:
--       platform_settings 'listen_voice' {"voice": ""}  ("" = the browser's
--       first ar-SA voice; src/lib/ai/listenVoice.ts). Read by the public
--       GET /api/v1/ai/listen-voice with the service client (no grant here).
--
-- WHO CAN DO WHAT
--   Both functions: SECURITY DEFINER, search_path '', EXECUTE for service_role
--   only (unchanged). No table, no policy, no grant to anon / authenticated.
--
-- HOW TO RUN (file on the server at its repo path):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261203_50_l13_assistant.sql
--   Expect: NOTICE  l13_assistant verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261202_50 (l12 rules). AFTER THE DEPLOY of the l13 code:
--   * SQL first with the old code would move individuals to 'floating', which
--     the old code does not know (it reads the setting as "quick-answer",
--     while the database answers 'floating'): the quick answer would then
--     charge individuals their 10 points, as the database refuses its free
--     question — so deploy first, then run this file.
--   * code first without this file: the new code reads the seeded
--     "quick-answer" row and keeps the 5 on the quick answer (the window
--     offers nothing), exactly as today, until this file runs.
--   RE-RUN HAZARD: re-running 20261202_50 after this file brings back its
--   functions without 'floating' (an individual's floating question is then
--   refused, never charged; the window says none are available). Re-run this
--   file after it; the verify block names the function that went back. This
--   file itself is safe to re-run.
--
-- ROLLBACK (one transaction):
--   1. re-run §3 of 20261202_50 (both functions as they were);
--   2. update public.platform_settings set value = '{"individual": "quick-answer"}'::jsonb
--        where key = 'free_question_tool_by_account_type';
--      update public.platform_settings set value = value - 'floating' where key = 'ai_tools';
--      delete from public.platform_settings where key = 'listen_voice';
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261203_50: public.platform_settings is missing';
  end if;
  if to_regprocedure('public.ai_free_question_tool(uuid)') is null
     or to_regprocedure('public.ai_free_question_status(uuid)') is null
     or to_regprocedure('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)') is null then
    raise exception '20261203_50: run 20261202_50_l12_rules.sql first';
  end if;
  if to_regprocedure('public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)') is null then
    raise exception '20261203_50: public.ai_start_run is missing (run 20261027_10_ai_runs.sql)';
  end if;
end $$;

-- ── 1. Q181: the individual's tool → the floating window (once) ──────────────
insert into public.platform_settings (key, value, description) values
  ('free_question_tool_by_account_type', '{"individual": "floating"}'::jsonb,
   'الأداة التي تُستخدم فيها الأسئلة المجانية للفرد: floating (مساعد نظامي العائم، الافتراضي — قرار المالك Q181) أو quick-answer أو assistant؛ بقية الأنواع على مساعد المكتبة (20261203_50)')
on conflict (key) do nothing;

update public.platform_settings
   set value = '{"individual": "floating"}'::jsonb,
       description = 'الأداة التي تُستخدم فيها الأسئلة المجانية للفرد: floating (مساعد نظامي العائم، الافتراضي — قرار المالك Q181) أو quick-answer أو assistant؛ بقية الأنواع على مساعد المكتبة (20261203_50)'
 where key = 'free_question_tool_by_account_type'
   and coalesce(description, '') not like '%Q181%'
   and (jsonb_typeof(value) is distinct from 'object' or coalesce(value ->> 'individual', 'quick-answer') = 'quick-answer');

-- An admin's "assistant" stays; only the description learns the new choice.
update public.platform_settings
   set description = 'الأداة التي تُستخدم فيها الأسئلة المجانية للفرد: floating (مساعد نظامي العائم، الافتراضي — قرار المالك Q181) أو quick-answer أو assistant؛ بقية الأنواع على مساعد المكتبة (20261203_50)'
 where key = 'free_question_tool_by_account_type'
   and coalesce(description, '') not like '%Q181%';

-- The new tool follows the general assistant's stored mode, once.
update public.platform_settings
   set value = value || jsonb_build_object('floating', jsonb_build_object('mode',
         case when value -> 'quick-answer' ->> 'mode' in ('off', 'staff', 'live') then value -> 'quick-answer' ->> 'mode'
              when value -> 'quick-answer' ->> 'mode' = 'review' then 'staff'
              else 'off' end))
 where key = 'ai_tools'
   and jsonb_typeof(value) = 'object'
   and not (value ? 'floating');

-- ── 2. Q182: the listening voice (a setting) ─────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('listen_voice', '{"voice": ""}'::jsonb,
   'صوت «استمع للإجابة» (قراءة المتصفح، مجانية): اسم الصوت، والقيمة الفارغة = أول صوت عربي سعودي في متصفح الزائر — Q182 (20261203_50)')
on conflict (key) do nothing;

-- ── 3. the free-question functions ───────────────────────────────────────────
-- Copied from 20261202_50 §3 (its latest body): 'floating' accepted; the
-- default for a missing or malformed value is now 'floating'.
create or replace function public.ai_free_question_tool(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type text;
  v_tool text;
begin
  if p_user is null then
    raise exception 'ai_free_question_tool: p_user is required' using errcode = '22023';
  end if;
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type is distinct from 'individual' then
    return 'library-assistant';
  end if;
  select ps.value ->> 'individual' into v_tool from public.platform_settings ps
   where ps.key = 'free_question_tool_by_account_type' and jsonb_typeof(ps.value) = 'object';
  -- 20261203_50 (Q181): 'floating' («مساعد نظامي»), the default.
  return case when v_tool in ('floating', 'quick-answer', 'assistant') then v_tool else 'floating' end;
end;
$$;

comment on function public.ai_free_question_tool(uuid) is
  'Q121 (20261202_50) + Q181 (20261203_50, l13_assistant): the tool that carries this account''s free questions — an individual''s from platform_settings.free_question_tool_by_account_type (floating | quick-answer | assistant; anything else: floating, «مساعد نظامي»), every other type the library assistant. Service role only.';

revoke all on function public.ai_free_question_tool(uuid) from public, anon, authenticated;
grant execute on function public.ai_free_question_tool(uuid) to service_role;

-- Copied from 20261202_50 §3 (its latest body): 'floating' accepted.
create or replace function public.ai_start_free_question(
  p_user            uuid,
  p_tool            text,
  p_variant         text,
  p_class           text,
  p_price           int,
  p_daily_limit     int,
  p_idempotency_key text,
  p_deadline        timestamptz,
  p_exempt          boolean default false,
  p_input           jsonb default null,
  p_file_ids        text[] default '{}',
  p_pages           int default null,
  p_conversation    uuid default null,
  p_source_ids      jsonb default null)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allow int;
  v_used  int;
  v_run   record;
begin
  -- 20261127_40: 'library-assistant'; 20261129_60: 'quick-answer';
  -- 20261202_50 (Q121): 'assistant' (an individual's tool when the setting says so);
  -- 20261203_50 (Q181): 'floating' («مساعد نظامي», the individual's default).
  if p_user is null or p_tool is null or p_tool not in ('library-assistant', 'quick-answer', 'assistant', 'floating')
     or p_idempotency_key is null then
    raise exception 'ai_start_free_question: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  -- A retried request: ai_start_run answers it as the duplicate it is.
  if exists (select 1 from public.ai_runs r where r.user_id = p_user and r.idempotency_key = p_idempotency_key) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- Nothing is charged while points_enforcement is off, nor for an exempt
  -- caller: the question starts as a normal run and uses up NONE of the
  -- account's allowance.
  if not coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false)
     or coalesce(p_exempt, false) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, p_price, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- The account's own free tool only (public.ai_free_question_tool). Another
  -- tool: not eligible, and the app charges the normal price (the floating
  -- window, free questions only, is refused instead — runCore).
  if p_tool is distinct from public.ai_free_question_tool(p_user) then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;

  -- The allowance and the count, under the start lock.
  select s.allowance, s.used into v_allow, v_used from public.ai_free_question_status(p_user) s;
  if coalesce(v_allow, 0) <= 0 then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;
  if v_used >= v_allow then
    raise exception 'free_question_used' using errcode = 'P0001',
      detail = format('used %s of %s', v_used, v_allow);
  end if;

  select * into v_run from public.ai_start_run(
    p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
    p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);

  if v_run.created then
    insert into public.ai_free_question_uses (run_id, user_id, tool)
      values (v_run.run_id, p_user, p_tool)
      on conflict on constraint ai_free_question_uses_pkey do nothing;
  end if;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'Owner ٣٠ (20261127_40) + register 4/36 (20261129_60) + Q121 (20261202_50) + Q181 (20261203_50): a free question from the account''s lifetime allowance on the account''s own tool (public.ai_free_question_tool: an individual''s from the setting, floating «مساعد نظامي» by default; library-assistant for every other type). Under ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; another tool or allowance 0 → P0001 free_question_not_eligible; allowance used → P0001 free_question_used; else ai_start_run at price 0 and one ai_free_question_uses row. Service role only.';

revoke all on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── 4. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn  text;
  def text;
begin
  foreach fn in array array[
    'public.ai_free_question_tool(uuid)',
    'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                       from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)), false) then
      raise exception 'l13_assistant verify: % is not SECURITY DEFINER with an empty search_path', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
       or not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'l13_assistant verify: wrong EXECUTE grants on %', fn;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_start_free_question') <> 1 then
    raise exception 'l13_assistant verify: ai_start_free_question has more than one overload';
  end if;
  def := coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.ai_free_question_tool(uuid)')), '');
  if pg_catalog.strpos(def, 'then v_tool else ''floating'' end') = 0 then
    raise exception 'l13_assistant verify: ai_free_question_tool does not default to floating (20261202_50 re-run after this file? re-run this file)';
  end if;
  def := coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)')), '');
  if pg_catalog.strpos(def, '''assistant'', ''floating'')') = 0
     or pg_catalog.strpos(def, 'p_tool is distinct from public.ai_free_question_tool(p_user)') = 0
     or pg_catalog.strpos(def, 'ai_free_question_uses') = 0 then
    raise exception 'l13_assistant verify: ai_start_free_question does not accept floating under the account''s-tool rule (20261202_50 re-run after this file? re-run this file)';
  end if;
  if not coalesce((select jsonb_typeof(value) = 'object' and value ->> 'individual' in ('floating', 'quick-answer', 'assistant')
                     from public.platform_settings where key = 'free_question_tool_by_account_type'), false) then
    raise exception 'l13_assistant verify: free_question_tool_by_account_type is missing or malformed';
  end if;
  if not coalesce((select jsonb_typeof(value -> 'voice') = 'string' from public.platform_settings where key = 'listen_voice'), false) then
    raise exception 'l13_assistant verify: listen_voice is missing or malformed';
  end if;
  raise notice 'l13_assistant verify: OK';
end $verify$;

commit;

notify pgrst, 'reload schema';

select 'l13_assistant: free questions in «مساعد نظامي» (floating, the individual default) + listen_voice setting' as migration, true;
