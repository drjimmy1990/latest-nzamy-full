-- library_graph_call_log.test.sql — 20261121_10: the graph call log and the
-- explorer's live numbers.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations; B=$(mktemp -d)/verify_call_log_block.sql
--   sed -n '/^-- >>> verify:library_graph_call_log/,/^-- <<< verify:library_graph_call_log/p' $M/_verify.sql > "$B"
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql \
--     $M/20261121_10_library_graph_call_log.sql $M/20261121_10_library_graph_call_log.sql \
--     "$B" supabase/tests/rls/library_graph_call_log.test.sql

-- T1: customer calls — graph answers, fallbacks with their reasons, timings
select public.graph_rag_log_call('{"source":"ai_run","path":"graph","graph_fn":"graph_rag_retrieve","graph_ms":300,"seed_count":1,"vector_used":true,"route_section":"07","route_source":"vote","route_confident":true}'::jsonb);
select public.graph_rag_log_call('{"source":"ai_run","path":"graph","graph_fn":"graph_rag_retrieve","graph_ms":500,"vector_used":true}'::jsonb);
select public.graph_rag_log_call('{"source":"graph_api","path":"graph","graph_fn":"graph_rag_retrieve","graph_ms":700}'::jsonb);
select public.graph_rag_log_call('{"source":"ai_run","path":"keyword","graph_fn":"graph_rag_retrieve","graph_ms":2500,"graph_miss":"timeout"}'::jsonb);
select public.graph_rag_log_call('{"source":"ai_run","path":"keyword","graph_fn":"graph_rag_retrieve","graph_ms":40,"graph_miss":"no_hits","unknown_key":"ignored"}'::jsonb);
-- lab: one success, two failures (one timeout with fiqh on)
select public.graph_rag_log_call('{"source":"lab","path":"graph","graph_fn":"graph_rag_retrieve_scoped","graph_ms":900,"scope":"auto","size":"1"}'::jsonb);
select public.graph_rag_log_call('{"source":"lab","path":"error","graph_fn":"graph_rag_retrieve_scoped","graph_ms":4001,"graph_miss":"57014","scope":"all","decrees":true,"feqh":true,"size":"3","links":true}'::jsonb);
select public.graph_rag_log_call('{"source":"lab","path":"error","graph_fn":"graph_rag_retrieve","graph_ms":10,"graph_miss":"XX000","links":false}'::jsonb);

do $$
declare
  s jsonb := public.graph_rag_explore_live_stats(24);
  c jsonb := s -> 'customer';
  l jsonb := s -> 'lab';
begin
  if (c ->> 'total')::int <> 5 or (c ->> 'graph')::int <> 3 or (c ->> 'keyword')::int <> 2 then
    raise exception 'T1: customer counts wrong: %', c;
  end if;
  if (c -> 'by_reason' ->> 'timeout')::int <> 1 or (c -> 'by_reason' ->> 'no_hits')::int <> 1 then
    raise exception 'T1: fallback reasons wrong: %', c -> 'by_reason';
  end if;
  if (c -> 'by_source' ->> 'ai_run')::int <> 4 or (c -> 'by_source' ->> 'graph_api')::int <> 1 then
    raise exception 'T1: sources wrong: %', c -> 'by_source';
  end if;
  if (c ->> 'graph_ms_p50')::numeric <> 500 or (c ->> 'graph_ms_max')::int <> 2500 or (c ->> 'vector_used')::int <> 2 then
    raise exception 'T1: timings wrong: %', c;
  end if;
  if (l ->> 'total')::int <> 3 or (l ->> 'failed')::int <> 2 or (l ->> 'timeouts')::int <> 1 then
    raise exception 'T1: lab counts wrong: %', l;
  end if;
  if pg_catalog.jsonb_array_length(l -> 'recent_failures') <> 2
     or not exists (select 1 from pg_catalog.jsonb_array_elements(l -> 'recent_failures') e
                     where e ->> 'miss' = '57014' and (e ->> 'feqh')::boolean and (e ->> 'decrees')::boolean
                       and e ->> 'scope' = 'all' and e ->> 'size' = '3') then
    raise exception 'T1: lab failure options missing: %', l -> 'recent_failures';
  end if;
  if s ->> 'logging_since' is null or (s ->> 'hours')::int <> 24 then
    raise exception 'T1: header wrong: %', s;
  end if;
end $$;

-- T2: bad rows are refused; long text is cut
do $$
begin
  begin
    perform public.graph_rag_log_call('{"source":"someone","path":"graph"}'::jsonb);
    raise exception 'T2: an unknown source was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.graph_rag_log_call('{"source":"ai_run","path":"maybe"}'::jsonb);
    raise exception 'T2: an unknown path was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.graph_rag_log_call('[1,2]'::jsonb);
    raise exception 'T2: a non-object was accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.graph_rag_log_call(pg_catalog.jsonb_build_object('source', 'ai_run', 'path', 'keyword', 'graph_miss', pg_catalog.repeat('x', 500), 'graph_ms', 99999999));
  if (select pg_catalog.length(c.graph_miss) from library_graph.call_log c order by c.id desc limit 1) <> 40
     or (select c.graph_ms from library_graph.call_log c order by c.id desc limit 1) <> 600000 then
    raise exception 'T2: long text or a huge time was not cut';
  end if;
end $$;

-- T3: rows older than 30 days go when a new one arrives; the window excludes them
insert into library_graph.call_log (created_at, source, path) values (now() - interval '31 days', 'ai_run', 'graph');
insert into library_graph.call_log (created_at, source, path) values (now() - interval '2 days', 'ai_run', 'graph');
do $$
begin
  if (public.graph_rag_explore_live_stats(24) -> 'customer' ->> 'total')::int <> 6 then
    raise exception 'T3: a 2-day-old row was counted in the 24-hour window';
  end if;
  if (public.graph_rag_explore_live_stats(72) -> 'customer' ->> 'total')::int <> 7 then
    raise exception 'T3: the 72-hour window missed the 2-day-old row';
  end if;
  perform public.graph_rag_log_call('{"source":"ai_run","path":"graph","graph_ms":1}'::jsonb);
  if exists (select 1 from library_graph.call_log c where c.created_at < now() - interval '30 days') then
    raise exception 'T3: a 31-day-old row survived a new insert';
  end if;
end $$;

-- T4: service_role only
do $$
begin
  if has_table_privilege('anon', 'library_graph.call_log', 'SELECT')
     or has_table_privilege('authenticated', 'library_graph.call_log', 'INSERT')
     or has_function_privilege('anon', 'public.graph_rag_log_call(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.graph_rag_explore_live_stats(integer)', 'EXECUTE') then
    raise exception 'T4: anon or authenticated can reach the call log';
  end if;
  if not has_function_privilege('service_role', 'public.graph_rag_log_call(jsonb)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.graph_rag_explore_live_stats(integer)', 'EXECUTE') then
    raise exception 'T4: service_role cannot call the log functions';
  end if;
end $$;

-- T5: a library write does not mark the graph dirty (the log is not a library table)
do $$
declare
  v_dirty boolean;
begin
  update library_graph.sync_state set dirty = false where id = 1;
  perform public.graph_rag_log_call('{"source":"ai_run","path":"graph"}'::jsonb);
  select s.dirty into v_dirty from library_graph.sync_state s where s.id = 1;
  if v_dirty then
    raise exception 'T5: logging a call marked the graph dirty';
  end if;
end $$;

select 'library_graph_call_log: all tests passed' as result;
