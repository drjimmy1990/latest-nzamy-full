-- =============================================================================
-- Migration: 20261121_10_library_graph_call_log.sql
-- =============================================================================
-- PURPOSE
--   Since 2026-11-15 the AI tools ask the graph first (NZAMY_GRAPH_RAG=on) and
--   fall back to the keyword search when it times out, is not ready, or finds
--   nothing. retrieval.ts already knows which happened for every question,
--   but nothing kept it: there was no way to tell how often customers get a
--   graph answer, or how often (and why) it falls back.
--
--   1. library_graph.call_log (new table): one row per graph call — where it
--      came from (an AI run, the graph-retrieve endpoint, or the explorer's
--      lab), which path answered, the graph's time and miss reason, and the
--      lab's options. NO question text, NO user id, NO embedding: counts and
--      timings only. Rows older than 30 days are deleted as new ones arrive.
--
--   2. public.graph_rag_log_call(jsonb) (new): writes one row. Unknown keys
--      are ignored; text is cut short; a bad `source` or `path` is refused.
--      The site calls it after the answer is built and ignores any error, so
--      it can never change or slow an answer.
--
--   3. public.graph_rag_explore_live_stats(integer) (new): the explorer's
--      status tab — for the last N hours (default 24): customer calls, the
--      share the graph answered, each fallback reason, graph time p50 / p95 /
--      max; and the lab's calls and its last failures with their options.
--
-- PRIVILEGES
--   Table and both functions are service_role only (RLS on, no policies; the
--   site uses the service client, the explorer route is behind requireStaff).
--
-- COST
--   One small insert per AI question. Not a library table: it never marks the
--   graph dirty and never triggers a rebuild.
--
-- RUN ORDER
--   After 20261110_10 (required). Before or after the code deploy: until this
--   file runs, the site's log calls fail quietly and the status tab says
--   which file to run.
--
-- ROLLBACK
--   drop function if exists public.graph_rag_explore_live_stats(integer);
--   drop function if exists public.graph_rag_log_call(jsonb);
--   drop table if exists library_graph.call_log;
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $$
begin
  if to_regnamespace('library_graph') is null or to_regclass('library_graph.sync_state') is null then
    raise exception '20261121_10: apply 20261110_10_library_graph_rag.sql first';
  end if;
end $$;

-- 1. The log table
create table if not exists library_graph.call_log (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  source          text        not null check (source in ('ai_run', 'graph_api', 'lab')),
  path            text        not null check (path in ('graph', 'keyword', 'error')),
  graph_fn        text,
  graph_ms        integer     check (graph_ms is null or graph_ms >= 0),
  graph_miss      text,
  seed_count      smallint    not null default 0,
  vector_used     boolean     not null default false,
  scope           text,
  decrees         boolean     not null default false,
  feqh            boolean     not null default false,
  size            text,
  links           boolean     not null default true,
  route_section   text,
  route_source    text,
  route_confident boolean
);

create index if not exists idx_lg_call_log_created_at on library_graph.call_log (created_at);

alter table library_graph.call_log enable row level security;
alter table library_graph.call_log force row level security;
revoke all on table library_graph.call_log from public, anon, authenticated;
grant select, insert, delete on table library_graph.call_log to service_role;

-- 2. Write one row
create or replace function public.graph_rag_log_call(p_row jsonb)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '2s'
as $$
declare
  v_source text := p_row ->> 'source';
  v_path   text := p_row ->> 'path';
  v_ms     integer;
  v_seeds  integer;
begin
  if p_row is null or pg_catalog.jsonb_typeof(p_row) <> 'object' then
    raise exception 'graph_rag_log_call: p_row must be a JSON object' using errcode = '22023';
  end if;
  if v_source is null or v_source not in ('ai_run', 'graph_api', 'lab') then
    raise exception 'graph_rag_log_call: unknown source %', coalesce(v_source, 'null') using errcode = '22023';
  end if;
  if v_path is null or v_path not in ('graph', 'keyword', 'error') then
    raise exception 'graph_rag_log_call: unknown path %', coalesce(v_path, 'null') using errcode = '22023';
  end if;

  v_ms := case when pg_catalog.jsonb_typeof(p_row -> 'graph_ms') = 'number'
               then least(greatest((p_row ->> 'graph_ms')::numeric, 0), 600000)::integer end;
  v_seeds := case when pg_catalog.jsonb_typeof(p_row -> 'seed_count') = 'number'
                  then least(greatest((p_row ->> 'seed_count')::numeric, 0), 50)::integer else 0 end;

  insert into library_graph.call_log (
    source, path, graph_fn, graph_ms, graph_miss, seed_count, vector_used,
    scope, decrees, feqh, size, links, route_section, route_source, route_confident
  ) values (
    v_source,
    v_path,
    left(p_row ->> 'graph_fn', 60),
    v_ms,
    left(p_row ->> 'graph_miss', 40),
    v_seeds,
    coalesce(p_row ->> 'vector_used' = 'true', false),
    left(p_row ->> 'scope', 20),
    coalesce(p_row ->> 'decrees' = 'true', false),
    coalesce(p_row ->> 'feqh' = 'true', false),
    left(p_row ->> 'size', 10),
    coalesce(p_row ->> 'links', 'true') <> 'false',
    left(p_row ->> 'route_section', 10),
    left(p_row ->> 'route_source', 10),
    case p_row ->> 'route_confident' when 'true' then true when 'false' then false end
  );

  -- Keep 30 days: a few old rows go with each new one (indexed, bounded).
  delete from library_graph.call_log
   where id in (select c.id from library_graph.call_log c
                 where c.created_at < now() - interval '30 days'
                 order by c.created_at
                 limit 200);
end;
$$;

-- 3. The status tab's live numbers
create or replace function public.graph_rag_explore_live_stats(p_hours integer default 24)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '5s'
as $$
declare
  v_hours  integer := least(greatest(coalesce(p_hours, 24), 1), 720);
  v_since  timestamptz := now() - pg_catalog.make_interval(hours => least(greatest(coalesce(p_hours, 24), 1), 720));
  v_cust   jsonb;
  v_lab    jsonb;
  v_first  timestamptz;
begin
  select pg_catalog.min(c.created_at) into v_first from library_graph.call_log c;

  with w as (
    select * from library_graph.call_log c
     where c.created_at >= v_since and c.source in ('ai_run', 'graph_api')
  ), misses as (
    select coalesce(pg_catalog.jsonb_object_agg(m.graph_miss, m.n), '{}'::jsonb) as by_reason
      from (select r.graph_miss, pg_catalog.count(*) as n
              from w r
             where r.path <> 'graph' and r.graph_miss is not null
             group by r.graph_miss) m
  ), sources as (
    select coalesce(pg_catalog.jsonb_object_agg(s.source, s.n), '{}'::jsonb) as by_source
      from (select r.source, pg_catalog.count(*) as n from w r group by r.source) s
  )
  select pg_catalog.jsonb_build_object(
           'total', (select pg_catalog.count(*) from w),
           'graph', (select pg_catalog.count(*) from w r where r.path = 'graph'),
           'keyword', (select pg_catalog.count(*) from w r where r.path <> 'graph'),
           'vector_used', (select pg_catalog.count(*) from w r where r.vector_used),
           'by_reason', (select m.by_reason from misses m),
           'by_source', (select s.by_source from sources s),
           'graph_ms_p50', (select pg_catalog.percentile_cont(0.5) within group (order by r.graph_ms)
                              from w r where r.graph_ms is not null),
           'graph_ms_p95', (select pg_catalog.percentile_cont(0.95) within group (order by r.graph_ms)
                              from w r where r.graph_ms is not null),
           'graph_ms_max', (select pg_catalog.max(r.graph_ms) from w r)
         )
    into v_cust;

  with w as (
    select * from library_graph.call_log c
     where c.created_at >= v_since and c.source = 'lab'
  )
  select pg_catalog.jsonb_build_object(
           'total', (select pg_catalog.count(*) from w),
           'failed', (select pg_catalog.count(*) from w r where r.path = 'error'),
           'timeouts', (select pg_catalog.count(*) from w r where r.path = 'error' and r.graph_miss = '57014'),
           'graph_ms_p95', (select pg_catalog.percentile_cont(0.95) within group (order by r.graph_ms)
                              from w r where r.graph_ms is not null and r.path <> 'error'),
           'recent_failures', coalesce((
             select pg_catalog.jsonb_agg(f.j order by f.created_at desc)
               from (select r.created_at,
                            pg_catalog.jsonb_build_object(
                              'at', r.created_at, 'miss', r.graph_miss, 'ms', r.graph_ms,
                              'scope', r.scope, 'decrees', r.decrees, 'feqh', r.feqh,
                              'size', r.size, 'links', r.links, 'vector_used', r.vector_used,
                              'seed_count', r.seed_count) as j
                       from w r
                      where r.path = 'error'
                      order by r.created_at desc
                      limit 10) f), '[]'::jsonb)
         )
    into v_lab;

  return pg_catalog.jsonb_build_object(
    'hours', v_hours,
    'since', v_since,
    'logging_since', v_first,
    'customer', v_cust,
    'lab', v_lab
  );
end;
$$;

revoke all on function public.graph_rag_log_call(jsonb) from public, anon, authenticated;
grant execute on function public.graph_rag_log_call(jsonb) to service_role;
revoke all on function public.graph_rag_explore_live_stats(integer) from public, anon, authenticated;
grant execute on function public.graph_rag_explore_live_stats(integer) to service_role;

-- 4. verify
do $$
declare
  missing text := '';
  r text;
  f text;
begin
  if to_regclass('library_graph.call_log') is null then
    missing := missing || ' library_graph.call_log missing;';
  elsif not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'library_graph.call_log'::regclass) then
    missing := missing || ' RLS off on call_log;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      if has_table_privilege(r, 'library_graph.call_log', 'SELECT')
         or has_table_privilege(r, 'library_graph.call_log', 'INSERT') then
        missing := missing || pg_catalog.format(' %s can read or write call_log;', r);
      end if;
      foreach f in array array['public.graph_rag_log_call(jsonb)', 'public.graph_rag_explore_live_stats(integer)'] loop
        if has_function_privilege(r, f, 'EXECUTE') then
          missing := missing || pg_catalog.format(' %s can EXECUTE %s;', r, f);
        end if;
      end loop;
    end if;
  end loop;
  foreach f in array array['public.graph_rag_log_call(jsonb)', 'public.graph_rag_explore_live_stats(integer)'] loop
    if to_regprocedure(f) is null then
      missing := missing || pg_catalog.format(' %s missing;', f);
    elsif exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
          and not has_function_privilege('service_role', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' service_role cannot EXECUTE %s;', f);
    end if;
  end loop;
  -- One function per name: a second overload makes PostgREST answer PGRST203.
  foreach f in array array['graph_rag_log_call', 'graph_rag_explore_live_stats'] loop
    if (select pg_catalog.count(*) from pg_catalog.pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = f) <> 1 then
      missing := missing || pg_catalog.format(' public.%s is not exactly one function;', f);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261121_10 verify:%', missing;
  end if;
  raise notice '20261121_10 verify: OK';
end $$;

-- 5. PostgREST: see the new functions now
notify pgrst, 'reload schema';

commit;

select '20261121_10 graph call log + live stats' as step,
       to_regprocedure('public.graph_rag_log_call(jsonb)') is not null
       and to_regprocedure('public.graph_rag_explore_live_stats(integer)') is not null as ok;
