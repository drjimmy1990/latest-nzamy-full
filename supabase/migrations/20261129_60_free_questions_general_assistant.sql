-- =============================================================================
-- Migration: 20261129_60_free_questions_general_assistant.sql
-- =============================================================================
-- PURPOSE (owner register 14 rows 4 and 36, 19 Nov 2026; batch l9-public)
--
--   The free questions stay ONCE per verified account — 10 for a lawyer, 5 for
--   an individual (platform_settings free_questions_by_account_type, unchanged)
--   — but each account type has its OWN tool:
--     individual  → 'quick-answer'      («المجيب القانوني السريع», the general
--                                        assistant open to individuals)
--     every other → 'library-assistant' (unchanged: the lawyer's 10)
--   Until now only the library assistant gave them, and the library is locked
--   for individuals (20261128_20), so an individual's 5 could never be used.
--
--   1. public.ai_free_question_status(p_user) — copied from its LATEST
--      definition (20261128_20) with one change: the "library open for the
--      account" condition applies only when the account's free tool is the
--      library assistant. The e-mail rule stays for everyone. Same signature
--      and return type (no DROP; the app and _verify keep reading it).
--   2. public.ai_start_free_question(...) — copied from its LATEST definition
--      (20261127_40) with one change: it accepts 'library-assistant' OR
--      'quick-answer', and a tool that is not the caller's own free tool
--      raises free_question_not_eligible (P0001), so the request is charged
--      the normal way (the app falls back on that error). Same 14-argument
--      signature, one overload. ai_start_run (latest: 20261108_41) is called
--      exactly as before.
--
-- WHO CAN DO WHAT
--   Both functions: EXECUTE for service_role only, SECURITY DEFINER,
--   search_path ''. No table or setting changes.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_60_free_questions_general_assistant.sql
--   Expect: NOTICE  l9_public verify: OK  and a row with `t`.
--
-- RUN ORDER: any time after 20261128_20 (batch 8, live); before or after the
--   l9 deploy.
--   * Code first: the app asks for an individual's free question on
--     quick-answer; the old function refuses the tool (22023), the app falls
--     back to the normal price, and GET /api/v1/ai/free-question?tool=
--     quick-answer reads the old status (0 for a locked individual), so
--     nothing free is promised that the server would not keep.
--   * SQL first with the old code: the old code never asks quick-answer for a
--     free question; the library assistant behaves exactly as before.
--   RE-RUN HAZARD: re-running 20261127_40 or 20261128_20 brings back their
--   versions (library-only). Re-run this file after them. This file itself is
--   safe to run any number of times.
--
-- ROLLBACK (in one transaction):
--   re-run the «ai_start_free_question» section (5) of 20261127_40 and the
--   «ai_free_question_status» section (4) of 20261128_20, then
--   notify pgrst, 'reload schema';
--   Questions already given free on quick-answer stay counted (rows in
--   ai_free_question_uses with tool 'quick-answer').
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 1. the allowance: the library rule only for the library assistant ───────
create or replace function public.ai_free_question_status(p_user uuid)
returns table (allowance int, used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_set   jsonb;
  v_allow int;
begin
  if p_user is null then
    raise exception 'ai_free_question_status: p_user is required' using errcode = '22023';
  end if;
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  select ps.value into v_set from public.platform_settings ps where ps.key = 'free_questions_by_account_type';
  v_allow := case
    when v_type is null then 0
    when v_set is null then case v_type when 'lawyer' then 10 when 'individual' then 5 else 0 end
    when jsonb_typeof(v_set -> v_type) = 'number' then greatest(0, floor((v_set ->> v_type)::numeric))::int
    else 0 end;
  -- 20261128_20 (٥٨, owner item 9.7): only an e-mail-verified account.
  -- 20261129_60 (register 4 / 36): an individual's questions are on the
  -- general assistant (quick-answer), so the library being locked for his
  -- type does not take them away; every other type's are on the library
  -- assistant and still need the library open. Nothing is used up meanwhile.
  if v_allow > 0 and (
       not exists (select 1 from auth.users u where u.id = p_user and u.email_confirmed_at is not null)
       or (v_type is distinct from 'individual'
           and not coalesce((select a.allowed from public.library_access_for(p_user) a), false))) then
    v_allow := 0;
  end if;
  return query
    select v_allow,
           (select count(*)::int from public.ai_free_question_uses u
              join public.ai_runs r on r.id = u.run_id
             where u.user_id = p_user and r.status <> 'failed');
end;
$$;

comment on function public.ai_free_question_status(uuid) is
  'Owner ٣٠ (20261127_40) + ٥٨ (20261128_20) + register 4/36 (20261129_60): the account''s lifetime free questions — allowance from platform_settings.free_questions_by_account_type by profiles.user_type (no row: lawyer 10, individual 5), 0 unless the e-mail is verified and, for every type but individual (whose questions are on quick-answer), library_access_for says the library is open; used = its free runs that did not fail. Service role only.';

revoke all on function public.ai_free_question_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_free_question_status(uuid) to service_role;

-- ── 2. the start: each account type on its own tool ─────────────────────────
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
  v_type  text;
  v_tool  text;
begin
  -- 20261127_40 (owner ٣٠): the library assistant ('library-assistant');
  -- 20261129_60 (register 4 / 36): or the general assistant ('quick-answer')
  -- for an individual.
  if p_user is null or p_tool is null or p_tool not in ('library-assistant', 'quick-answer')
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

  -- Nothing is charged while points_enforcement is off (ai_start_run reads it
  -- the same way), nor for an exempt caller: the question is free anyway, so
  -- it starts as a normal run and uses up NONE of the account's allowance.
  if not coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false)
     or coalesce(p_exempt, false) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, p_price, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- 20261129_60: the account's own free tool only (individual → quick-answer,
  -- every other type → library-assistant). Another tool: not eligible, and
  -- the app charges the normal price.
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  v_tool := case when v_type = 'individual' then 'quick-answer' else 'library-assistant' end;
  if p_tool is distinct from v_tool then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;

  -- The allowance and the count, under the start lock: two questions at once
  -- cannot both take the last free one. A failed run does not count.
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
  'Owner ٣٠ (20261127_40) + register 4/36 (20261129_60): a free question from the account''s lifetime allowance (platform_settings.free_questions_by_account_type by user_type) on the account''s own tool — quick-answer for an individual, library-assistant for every other type. Under ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; another tool or allowance 0 → P0001 free_question_not_eligible; allowance used (failed runs not counted) → P0001 free_question_used; else ai_start_run at price 0 and one ai_free_question_uses row, one transaction. Service role only.';

revoke all on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn text;
begin
  foreach fn in array array[
    'public.ai_free_question_status(uuid)',
    'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l9_public verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')) then
      raise exception 'l9_public verify: a session role can EXECUTE %', fn;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'ai_start_free_question') <> 1 then
    raise exception 'l9_public verify: ai_start_free_question must have exactly one overload';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'::regprocedure), '''quick-answer''') = 0 then
    raise exception 'l9_public verify: ai_start_free_question does not accept quick-answer (20261127_40 re-run after this file?)';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'library_access_for') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'email_confirmed_at') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'is distinct from ''individual''') = 0 then
    raise exception 'l9_public verify: ai_free_question_status is not the 20261129_60 version (20261127_40 / 20261128_20 re-run after this file?)';
  end if;
  raise notice 'l9_public verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261129_60 free questions: individual on quick-answer, others on the library assistant' as step,
       (pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'::regprocedure), '''quick-answer''') > 0
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.ai_free_question_status(uuid)'::regprocedure), 'is distinct from ''individual''') > 0) as ok;
