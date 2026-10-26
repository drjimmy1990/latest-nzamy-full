-- =============================================================================
-- Migration: 20261027_10_ai_runs.sql
-- AI services wave 0 (docs/plans/2026-10-26-ai-services-n8n-plan.md §1.2, §3).
-- Requires 20261022_20 (points_lots / points_ledger / debit_points) and
-- 20260627 (platform_settings). Safe to re-run.
-- =============================================================================
--
-- One row per AI tool run. The app does every check before it calls n8n, and
-- the money moves only through the three functions below:
--   ai_start_run   daily limit + duplicate key + insert + debit, ONE transaction
--                  (too few points / over the limit → nothing is created)
--   ai_fail_run    final failure; gives the points back to the lots they came
--                  from (an expired lot → a new 30-day refund_restore lot)
--   ai_sweep_runs  fails every running run past its deadline (the 10-min cron)
-- Success is a plain service-role UPDATE … WHERE status = 'running': a result
-- that arrives after a timeout updates nothing, and a failure after a success
-- refunds nothing (ai_fail_run only touches running / review).
--
-- Idempotency sits on ai_runs (charged_at / refunded_at), NOT on the ledger:
-- debit_points writes one ledger row per lot it draws from, so a unique ref
-- would break every debit that spans two lots.
-- =============================================================================

begin;

-- ── 1. ai_runs ───────────────────────────────────────────────────────────────
create table if not exists public.ai_runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  tool             text not null,
  variant          text,
  class            text not null constraint ai_runs_class_check check (class in ('fast','job')),
  status           text not null default 'running'
                   constraint ai_runs_status_check
                   check (status in ('running','review','succeeded','failed')),
  model            text,
  price_points     int  not null constraint ai_runs_price_check check (price_points >= 0),
  charged_points   int  not null default 0,
  charged          boolean not null default false,
  idempotency_key  text not null,
  conversation_id  uuid,
  input            jsonb,
  file_ids         text[] not null default '{}',
  pages            int,
  source_ids       jsonb,
  output           jsonb,
  citations        jsonb,
  error_code       text,
  error_message    text,
  usage            jsonb,
  progress_step    text,
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz,
  deadline_at      timestamptz not null,
  charged_at       timestamptz,
  refunded_at      timestamptz,
  constraint ai_runs_user_key unique (user_id, idempotency_key),
  constraint ai_runs_charge_check check (charged = (charged_at is not null) and charged_points >= 0)
);

create index if not exists ai_runs_user_tool_created_idx on public.ai_runs (user_id, tool, created_at desc);
create index if not exists ai_runs_running_deadline_idx on public.ai_runs (deadline_at) where status = 'running';
create index if not exists ai_runs_conversation_idx on public.ai_runs (conversation_id, created_at) where conversation_id is not null;

comment on table public.ai_runs is
  'One row per AI tool run (20261027_10, AI wave 0). A user reads own rows (no input / usage / model / source_ids); only the server writes, money through ai_start_run / ai_fail_run.';

alter table public.ai_runs enable row level security;
drop policy if exists "own ai runs" on public.ai_runs;
create policy "own ai runs" on public.ai_runs
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.ai_runs from anon, authenticated, public;
grant select (id, user_id, tool, variant, class, status, price_points, charged_points, charged,
              conversation_id, pages, output, citations, error_code, progress_step,
              created_at, finished_at, deadline_at, refunded_at)
  on public.ai_runs to authenticated;
grant all on public.ai_runs to service_role;

-- ── 2. points_ledger: the refund reason ──────────────────────────────────────
alter table public.points_ledger drop constraint if exists points_ledger_reason_check;
alter table public.points_ledger add constraint points_ledger_reason_check
  check (reason in ('credit','usage','expiry','refund_revoke','admin_adjustment','usage_refund'));

-- ── 3. ai_start_run ──────────────────────────────────────────────────────────
-- p_exempt: the caller is a platform admin (never charged). Charging follows
-- platform_settings.points_enforcement; with it off the run records its price
-- and debits nothing. The daily limit counts today's runs (Riyadh day) of this
-- user and tool that did not fail, under a per-user-and-tool advisory lock, so
-- two requests at once cannot both slip under it.
create or replace function public.ai_start_run(
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
  v_run     public.ai_runs;
  v_today   timestamptz := (date_trunc('day', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
  v_used    int;
  v_enforce boolean;
  v_charge  boolean;
begin
  if p_user is null or p_tool is null or p_class is null or p_price is null or p_price < 0
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100
     or p_deadline is null or p_daily_limit is null or p_daily_limit < 0 then
    raise exception 'ai_start_run: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  select * into v_run from public.ai_runs r
   where r.user_id = p_user and r.idempotency_key = p_idempotency_key;
  if found then
    return query select v_run.id, false, v_run.status, v_run.charged, v_run.charged_points;
    return;
  end if;

  select count(*) into v_used from public.ai_runs r
   where r.user_id = p_user and r.tool = p_tool and r.created_at >= v_today and r.status <> 'failed';
  if v_used >= p_daily_limit then
    raise exception 'daily_limit' using errcode = 'P0001',
      detail = format('used %s of %s today', v_used, p_daily_limit);
  end if;

  select coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false) into v_enforce;
  v_charge := v_enforce and not coalesce(p_exempt, false) and p_price > 0;

  insert into public.ai_runs (user_id, tool, variant, class, price_points, idempotency_key, deadline_at,
                              input, file_ids, pages, conversation_id, source_ids)
    values (p_user, p_tool, p_variant, p_class, p_price, p_idempotency_key, p_deadline,
            p_input, coalesce(p_file_ids, '{}'), p_pages, p_conversation, p_source_ids)
    returning * into v_run;

  if v_charge then
    -- raises P0001 insufficient_points and rolls the whole call back: no run
    perform public.debit_points(p_user, p_price, p_tool, 'ai_run:' || v_run.id::text);
    update public.ai_runs r
       set charged = true, charged_points = p_price, charged_at = now()
     where r.id = v_run.id and r.charged_at is null
     returning * into v_run;
  end if;

  return query select v_run.id, true, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'Starts an AI run: duplicate key → the existing run; over the daily limit → P0001 daily_limit; with points_enforcement on and the caller not exempt, debits the price (P0001 insufficient_points → no run). One transaction (20261027_10). Service role only.';

revoke all on function public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── 4. ai_fail_run ───────────────────────────────────────────────────────────
-- Final failure of a running / review run, and its refund, once. Points go
-- back to the lots the debit took them from (locked in debit_points' order, so
-- a refund and a debit of the same user queue instead of deadlocking); a lot
-- that expired since gets a new refund_restore lot valid 30 days. Returns
-- false when the run was already final (nothing changes).
create or replace function public.ai_fail_run(p_run uuid, p_code text, p_message text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run  public.ai_runs;
  r      record;
  v_lot  uuid;
begin
  if p_run is null or p_code is null then
    raise exception 'ai_fail_run: p_run and p_code are required' using errcode = '22023';
  end if;

  update public.ai_runs a
     set status = 'failed', error_code = left(p_code, 60), error_message = left(p_message, 500),
         finished_at = now()
   where a.id = p_run and a.status in ('running','review')
   returning * into v_run;
  if not found then
    return false;
  end if;

  if not v_run.charged or v_run.refunded_at is not null then
    return true;
  end if;

  update public.ai_runs a set refunded_at = now() where a.id = p_run and a.refunded_at is null;
  if not found then
    return true;
  end if;

  for r in
    select g.lot_id, g.pts, pl.expires_at
      from (select l.lot_id, sum(-l.delta)::int as pts
              from public.points_ledger l
             where l.user_id = v_run.user_id and l.reason = 'usage'
               and l.ref = 'ai_run:' || p_run::text
             group by l.lot_id) g
      join public.points_lots pl on pl.id = g.lot_id
     order by pl.expires_at, pl.created_at, pl.id
       for update of pl
  loop
    if r.pts <= 0 then
      continue;
    end if;
    if r.expires_at > now() then
      update public.points_lots set points_left = least(points_total, points_left + r.pts) where id = r.lot_id;
      insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
        values (v_run.user_id, r.lot_id, r.pts, 'usage_refund', v_run.tool, 'ai_run:' || p_run::text);
    else
      insert into public.points_lots (user_id, source, points_total, points_left, expires_at)
        values (v_run.user_id, 'refund_restore', r.pts, r.pts, now() + interval '30 days')
        returning id into v_lot;
      insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
        values (v_run.user_id, v_lot, r.pts, 'usage_refund', v_run.tool, 'ai_run:' || p_run::text);
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.ai_fail_run(uuid, text, text) is
  'Fails a running / review AI run once and refunds its debit to the original lots (expired → new 30-day refund_restore lot), ledger reason usage_refund (20261027_10). Service role only.';

revoke all on function public.ai_fail_run(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_fail_run(uuid, text, text) to service_role;

-- ── 5. ai_sweep_runs ─────────────────────────────────────────────────────────
create or replace function public.ai_sweep_runs()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n  int := 0;
begin
  for v_id in
    select a.id from public.ai_runs a
     where a.status = 'running' and a.deadline_at < now()
     order by a.deadline_at
     limit 500
  loop
    if public.ai_fail_run(v_id, 'timeout', 'no result before the deadline') then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

comment on function public.ai_sweep_runs() is
  'Fails (and refunds) running AI runs past their deadline, up to 500 per call; returns how many (20261027_10). Service role only.';

revoke all on function public.ai_sweep_runs() from public, anon, authenticated;
grant execute on function public.ai_sweep_runs() to service_role;

-- ── 6. ai_runs_retention (owner decision D6: 90 days) ────────────────────────
-- Clears what the user sent and got back; keeps the money facts and dates.
create or replace function public.ai_runs_retention()
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  with cleared as (
    update public.ai_runs a
       set input = null, output = null, citations = null, source_ids = null, error_message = null
     where a.created_at < now() - interval '90 days'
       and (a.input is not null or a.output is not null or a.citations is not null or a.source_ids is not null)
    returning 1)
  select count(*)::int from cleared;
$$;

comment on function public.ai_runs_retention() is
  'Clears input / output / citations of AI runs older than 90 days, keeping price, charge, status and dates (20261027_10). Service role only.';

revoke all on function public.ai_runs_retention() from public, anon, authenticated;
grant execute on function public.ai_runs_retention() to service_role;

-- ── 7. verify ────────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)',
    'public.ai_fail_run(uuid,text,text)', 'public.ai_sweep_runs()', 'public.ai_runs_retention()'] loop
    if to_regprocedure(fn) is null then
      raise exception '20261027_10 verify: % is missing', fn;
    end if;
    if has_function_privilege('authenticated', fn, 'EXECUTE') or has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception '20261027_10 verify: a session role can EXECUTE %', fn;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.ai_runs', 'INSERT')
     or has_table_privilege('authenticated', 'public.ai_runs', 'UPDATE')
     or has_column_privilege('authenticated', 'public.ai_runs', 'input', 'SELECT') then
    raise exception '20261027_10 verify: authenticated can write ai_runs or read its input';
  end if;
  raise notice '20261027_10 verify: OK — ai_runs (% rows), start / fail / sweep / retention service role only; points_enforcement = %',
    (select count(*) from public.ai_runs),
    coalesce((select value::text from public.platform_settings where key = 'points_enforcement'), 'no row');
end $$;

commit;
notify pgrst, 'reload schema';
