-- =============================================================================
-- Migration: 20261209_70_ind_ai_fair_use.sql   (verify id: l19_ind_ai_fair_use)
-- =============================================================================
-- PURPOSE (batch l19, builder «plans»; owner decision ق٢٦-٦, package 26 Nov 2026)
--
--   The individual's smart plan `ind-ai` (249 SAR a year) includes, under the
--   fair-use policy, every CALENDAR MONTH (Asia/Riyadh), with no carry-over:
--     * 30 questions  — «المجيب القانوني السريع», registry tool `quick-answer`;
--     * 2 works       — «صائغ العقود المبسّط», registry tool `simple-contract`
--                       (the only AI drafting tool an individual has: the
--                       «صائغ الخطابات» page builds letters from a template
--                       and calls no model, so there is nothing to count).
--   Inside the allowance the run starts at price 0; past it, the normal price
--   in points (the app falls back to ai_start_run), and the screen offers the
--   100 / 250 top-ups.
--
--   1. public.ai_plan_allowance_uses — one row per run started from the
--      allowance (PRIMARY KEY run_id: one use per run, a retried request never
--      adds a second). A run that FAILED (refunded by ai_fail_run / the sweep)
--      is not counted, so it gives its use back. The month is the Riyadh
--      calendar month of the run's ai_runs.created_at.
--   2. platform_settings 'ind_ai_fair_use' = {"questions_per_month": 30,
--      "works_per_month": 2} (insert only; a missing / malformed number reads
--      as the owner's default, never as 0, so a bad setting never blocks a
--      subscriber).
--   3. public.ai_plan_allowance_kind(tool)      → 'question' | 'work' | null
--      public.ind_ai_plan_active(user)          → an active, unexpired
--                                                  subscription to plan id
--                                                  'ind-ai' (by plan id, never
--                                                  by tier — the office_plan
--                                                  lesson of 20261206_70)
--      public.ai_plan_allowance_status(user)    → plan_active, the two limits,
--                                                  the two counts, month_start
--      public.ai_start_plan_allowance_run(…)    → ai_start_free_question's
--        shape (same 14 arguments): under ai_start_run's lock (and a per-kind
--        lock), duplicate key → ai_start_run's duplicate; points_enforcement
--        off or an exempt caller → a plain run that spends none of the
--        allowance; no plan / a tool that is not counted → P0001
--        plan_allowance_not_eligible; this month's allowance used → P0001
--        plan_allowance_used; else ai_start_run at price 0 + one use row.
--
-- WHO CAN DO WHAT
--   Every function: SECURITY DEFINER, search_path '', EXECUTE for service_role
--   only. The table: RLS on, no policy, nothing for anon / authenticated.
--   No existing function, table, policy or row is changed.
--
-- HOW TO RUN (file on the server at its repo path):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261209_70_ind_ai_fair_use.sql
--   Expect: NOTICE  l19_ind_ai_fair_use verify: OK …  and a row with `t`.
--
-- RUN ORDER: after 20261108_41 (ai_start_run) and 20261022_10 (subscriptions).
--   BEFORE THE DEPLOY of the l19 code. The old code never calls these
--   functions, so running it first changes nothing; deploying first would let
--   the new code find no counter, and its fail-open rule (below) would then
--   start a subscriber's question free and uncounted until this file runs.
--   Safe to re-run (create or replace / if not exists / on conflict do nothing).
--
-- FAIL-OPEN RULE (app side, src/lib/ai/planAllowance.ts + runCore.ts): when
--   the counter itself cannot answer (this file not run, a read error) for an
--   account whose ind-ai subscription the app has read directly, the run
--   starts at price 0, uncounted, and the server logs it — a paying
--   subscriber is never refused because the counter broke. The tool's daily
--   limit (quick-answer 30, simple-contract 5) still applies.
--
-- ROLLBACK (one transaction):
--   drop function if exists public.ai_start_plan_allowance_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb);
--   drop function if exists public.ai_plan_allowance_status(uuid);
--   drop function if exists public.ind_ai_plan_active(uuid);
--   drop function if exists public.ai_plan_allowance_kind(text);
--   drop table if exists public.ai_plan_allowance_uses;
--   delete from public.platform_settings where key = 'ind_ai_fair_use';
--   notify pgrst, 'reload schema';
--   (The app then finds no counter and follows the fail-open rule above.)
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261209_70: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
  if to_regclass('public.subscriptions') is null then
    raise exception '20261209_70: public.subscriptions is missing';
  end if;
  if to_regclass('public.ai_runs') is null
     or to_regprocedure('public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)') is null then
    raise exception '20261209_70: public.ai_start_run is missing (run 20261027_10_ai_runs.sql and 20261108_41 first)';
  end if;
end $$;

-- ── 1. the uses ──────────────────────────────────────────────────────────────
create table if not exists public.ai_plan_allowance_uses (
  run_id     uuid primary key references public.ai_runs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null constraint ai_plan_allowance_uses_kind_check check (kind in ('question', 'work')),
  tool       text not null,
  plan_id    text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_plan_allowance_uses_user_kind_idx on public.ai_plan_allowance_uses (user_id, kind);

comment on table public.ai_plan_allowance_uses is
  'ق٢٦-٦ (20261209_70): one row per AI run started from the ind-ai fair-use allowance (30 questions + 2 works a Riyadh calendar month). Counted by the run''s ai_runs.created_at month; a failed run does not count. Written only by ai_start_plan_allowance_run. Server only.';

alter table public.ai_plan_allowance_uses enable row level security;
revoke all on public.ai_plan_allowance_uses from anon, authenticated, public;
grant all on public.ai_plan_allowance_uses to service_role;

-- ── 2. the limits (a setting; insert only) ───────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('ind_ai_fair_use', '{"questions_per_month": 30, "works_per_month": 2}'::jsonb,
   'الاستخدام العادل للباقة الذكية للأفراد (ind-ai): عدد الأسئلة (المجيب القانوني السريع) وعدد الأعمال (صائغ العقود المبسّط) المشمولة كل شهر ميلادي بتوقيت الرياض، بلا ترحيل — قرار المالك ق٢٦-٦ (20261209_70)')
on conflict (key) do nothing;

-- ── 3. functions ─────────────────────────────────────────────────────────────
create or replace function public.ai_plan_allowance_kind(p_tool text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_tool when 'quick-answer' then 'question' when 'simple-contract' then 'work' else null end;
$$;

comment on function public.ai_plan_allowance_kind(text) is
  'ق٢٦-٦ (20261209_70): the ind-ai fair-use bucket of a registry tool — quick-answer → question, simple-contract → work, anything else → null (not counted). Service role only.';

revoke all on function public.ai_plan_allowance_kind(text) from public, anon, authenticated;
grant execute on function public.ai_plan_allowance_kind(text) to service_role;

create or replace function public.ind_ai_plan_active(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1 from public.subscriptions s
     where s.user_id = p_user
       and s.status = 'active'
       and s.plan_id = 'ind-ai'
       and (s.current_period_end is null or s.current_period_end > pg_catalog.now()));
$$;

comment on function public.ind_ai_plan_active(uuid) is
  'ق٢٦-٦ (20261209_70): true when p_user holds an active, unexpired subscription to plan id ind-ai (by plan id, never by tier). Service role only.';

revoke all on function public.ind_ai_plan_active(uuid) from public, anon, authenticated;
grant execute on function public.ind_ai_plan_active(uuid) to service_role;

create or replace function public.ai_plan_allowance_status(p_user uuid)
returns table (plan_active boolean, questions_limit int, questions_used int, works_limit int, works_used int, month_start date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_set    jsonb;
  v_q      int := 30;
  v_w      int := 2;
  v_month  timestamp := date_trunc('month', pg_catalog.now() at time zone 'Asia/Riyadh');
begin
  if p_user is null then
    raise exception 'ai_plan_allowance_status: p_user is required' using errcode = '22023';
  end if;
  select ps.value into v_set from public.platform_settings ps where ps.key = 'ind_ai_fair_use';
  -- A missing or malformed number keeps the owner's default (never 0).
  -- l19 review N6: clamped to 0..1000 BEFORE the int cast, so a typo such as
  -- 1e12 neither overflows (every subscriber's status call failing → the
  -- run route's «degraded» free path) nor makes the allowance unlimited.
  if jsonb_typeof(v_set -> 'questions_per_month') = 'number' then
    v_q := least(1000, greatest(0, floor((v_set ->> 'questions_per_month')::numeric)))::int;
  end if;
  if jsonb_typeof(v_set -> 'works_per_month') = 'number' then
    v_w := least(1000, greatest(0, floor((v_set ->> 'works_per_month')::numeric)))::int;
  end if;
  return query
    select public.ind_ai_plan_active(p_user),
           v_q,
           (select count(*)::int from public.ai_plan_allowance_uses u
              join public.ai_runs r on r.id = u.run_id
             where u.user_id = p_user and u.kind = 'question' and r.status <> 'failed'
               and date_trunc('month', r.created_at at time zone 'Asia/Riyadh') = v_month),
           v_w,
           (select count(*)::int from public.ai_plan_allowance_uses u
              join public.ai_runs r on r.id = u.run_id
             where u.user_id = p_user and u.kind = 'work' and r.status <> 'failed'
               and date_trunc('month', r.created_at at time zone 'Asia/Riyadh') = v_month),
           v_month::date;
end;
$$;

comment on function public.ai_plan_allowance_status(uuid) is
  'ق٢٦-٦ (20261209_70): the ind-ai fair use of p_user this Riyadh calendar month — plan_active (ind_ai_plan_active), the limits from platform_settings.ind_ai_fair_use (default 30 questions / 2 works), the uses whose run did not fail and was created this month, and the month''s first day. Service role only.';

revoke all on function public.ai_plan_allowance_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_plan_allowance_status(uuid) to service_role;

create or replace function public.ai_start_plan_allowance_run(
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
  v_kind  text := public.ai_plan_allowance_kind(p_tool);
  v_st    record;
  v_limit int;
  v_used  int;
  v_run   record;
begin
  if p_user is null or p_tool is null or p_idempotency_key is null then
    raise exception 'ai_start_plan_allowance_run: invalid arguments' using errcode = '22023';
  end if;

  -- The bucket's lock first (two tools may one day share a bucket), then
  -- ai_start_run's own lock for this tool (ai_start_run takes it again; an
  -- advisory lock is re-entrant inside one transaction).
  perform pg_advisory_xact_lock(hashtextextended('ai_plan_allowance:' || p_user::text || ':' || coalesce(v_kind, p_tool), 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  -- A retried request: ai_start_run answers it as the duplicate it is.
  if exists (select 1 from public.ai_runs r where r.user_id = p_user and r.idempotency_key = p_idempotency_key) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- Nothing is charged while points_enforcement is off, nor for an exempt
  -- caller: a normal run that uses up NONE of the allowance.
  if not coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false)
     or coalesce(p_exempt, false) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, p_price, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  if v_kind is null then
    raise exception 'plan_allowance_not_eligible' using errcode = 'P0001';
  end if;

  select * into v_st from public.ai_plan_allowance_status(p_user);
  if not coalesce(v_st.plan_active, false) then
    raise exception 'plan_allowance_not_eligible' using errcode = 'P0001';
  end if;
  v_limit := case v_kind when 'question' then v_st.questions_limit else v_st.works_limit end;
  v_used  := case v_kind when 'question' then v_st.questions_used  else v_st.works_used  end;
  if coalesce(v_used, 0) >= coalesce(v_limit, 0) then
    raise exception 'plan_allowance_used' using errcode = 'P0001',
      detail = format('%s: used %s of %s this month', v_kind, v_used, v_limit);
  end if;

  select * into v_run from public.ai_start_run(
    p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
    p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);

  if v_run.created then
    insert into public.ai_plan_allowance_uses (run_id, user_id, kind, tool, plan_id)
      values (v_run.run_id, p_user, v_kind, p_tool, 'ind-ai')
      on conflict on constraint ai_plan_allowance_uses_pkey do nothing;
  end if;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_plan_allowance_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'ق٢٦-٦ (20261209_70): an AI run from the ind-ai fair-use allowance (30 questions on quick-answer + 2 works on simple-contract a Riyadh calendar month, platform_settings.ind_ai_fair_use). Under a per-kind lock and ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; points_enforcement off or exempt → a plain run, nothing counted; no active ind-ai plan or a tool not counted → P0001 plan_allowance_not_eligible; the month''s allowance used → P0001 plan_allowance_used; else ai_start_run at price 0 and one ai_plan_allowance_uses row. Service role only.';

revoke all on function public.ai_start_plan_allowance_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_plan_allowance_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── 4. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  fn text;
begin
  foreach fn in array array[
    'public.ind_ai_plan_active(uuid)',
    'public.ai_plan_allowance_status(uuid)',
    'public.ai_start_plan_allowance_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                       from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)), false) then
      raise exception 'l19_ind_ai_fair_use verify: % is not SECURITY DEFINER with an empty search_path', fn;
    end if;
  end loop;
  foreach fn in array array[
    'public.ai_plan_allowance_kind(text)',
    'public.ind_ai_plan_active(uuid)',
    'public.ai_plan_allowance_status(uuid)',
    'public.ai_start_plan_allowance_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)'] loop
    if has_function_privilege('anon', to_regprocedure(fn), 'EXECUTE')
       or has_function_privilege('authenticated', to_regprocedure(fn), 'EXECUTE')
       or not has_function_privilege('service_role', to_regprocedure(fn), 'EXECUTE') then
      raise exception 'l19_ind_ai_fair_use verify: % must be service_role only', fn;
    end if;
  end loop;
  if not coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('public.ai_plan_allowance_uses')), false)
     or has_table_privilege('anon', 'public.ai_plan_allowance_uses', 'SELECT')
     or has_table_privilege('authenticated', 'public.ai_plan_allowance_uses', 'SELECT') then
    raise exception 'l19_ind_ai_fair_use verify: ai_plan_allowance_uses must have RLS on and no session access';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'ind_ai_fair_use') then
    raise exception 'l19_ind_ai_fair_use verify: the ind_ai_fair_use setting is missing';
  end if;
  if public.ai_plan_allowance_kind('quick-answer') is distinct from 'question'
     or public.ai_plan_allowance_kind('simple-contract') is distinct from 'work'
     or public.ai_plan_allowance_kind('floating') is not null then
    raise exception 'l19_ind_ai_fair_use verify: the tool → bucket map is wrong';
  end if;
  raise notice 'l19_ind_ai_fair_use verify: OK (ind-ai fair use: 30 questions + 2 works a Riyadh month, server-side, service role only)';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select 'l19 ind-ai fair use (20261209_70): ai_plan_allowance_uses + ind_ai_fair_use + ai_start_plan_allowance_run' as migration, true as ok;
