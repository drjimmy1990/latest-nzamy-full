-- =============================================================================
-- Migration: 20261119_10_library_graph_explorer_parity.sql
-- =============================================================================
-- PURPOSE
--   The admin graph explorer (/dashboard/admin/graph-explorer) catches up with
--   the 16-18 November graph batches. Functions only: no table changes.
--
--   1. public.graph_rag_explore_neighborhood: every link now carries a small
--      `metadata` object: `source` ("owner_links" for a link read from the
--      owner's own files, 20261118_10), and a vector link's `sim` and `method`
--      (20261116_10). Same signature, same ordering and limits as before; with
--      no link types named, hop 2 still leaves out DEFINES_TERM / SIMILAR_TO
--      (the screen now names the types when staff ask for meaning links).
--
--   2. public.graph_rag_explore_status() (new): the explorer's status tab.
--      The sync row, the running pass and the last finished one, the last
--      owner-link reading (sync_runs.details.owner_links, written by the
--      watchdog from this batch on), vector-link progress, the replacement
--      pairs, and how many laws / decrees carry owner links and how many graph
--      links came from them. Cheap by design: it never scans the nodes heap
--      (node_embeddings, similarity_state, sync_runs, replacement_pairs, the
--      edge_type index and the two library tables only).
--
-- PRIVILEGES
--   Both are service_role only (the explorer route uses the service client
--   behind requireStaff). Read-only (stable, security invoker).
--
-- RUN ORDER
--   After 20261118_10 (required). Before or after the code deploy: the old
--   screen ignores the new field, and the new screen shows «نفّذ ملف قاعدة
--   البيانات» in its status tab only, until this file runs.
--
-- ROLLBACK
--   drop function if exists public.graph_rag_explore_status();
--   then re-run section 5 of 20261116_10_library_graph_links.sql
--   (graph_rag_explore_neighborhood without metadata).
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $$
begin
  if to_regprocedure('public.graph_rag_explore_neighborhood(text, integer, text[], integer)') is null then
    raise exception '20261119_10: apply 20261113_10_library_graph_explorer.sql and 20261116_10_library_graph_links.sql first';
  end if;
  if to_regclass('library_graph.replacement_pairs') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'library' and table_name = 'laws' and column_name = 'owner_links')
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'library' and table_name = 'decrees_circulars' and column_name = 'owner_links') then
    raise exception '20261119_10: apply 20261118_10_library_owner_links.sql first';
  end if;
end $$;

-- 1. Explorer neighbourhood: each link carries where it came from
create or replace function public.graph_rag_explore_neighborhood(
  p_node_key   text,
  p_depth      integer default 1,
  p_edge_types text[]  default null,
  p_limit      integer default 60
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_depth  integer := least(greatest(coalesce(p_depth, 1), 1), 2);
  v_lim    integer := least(greatest(coalesce(p_limit, 60), 5), 200);
  v_all    boolean := p_edge_types is null or coalesce(pg_catalog.cardinality(p_edge_types), 0) = 0;
  v_model  text;
  v_total  integer;
  v_result jsonb;
begin
  if not exists (select 1 from library_graph.nodes n where n.node_key = p_node_key) then
    return pg_catalog.jsonb_build_object('found', false, 'center_key', p_node_key);
  end if;

  select m.model_id into v_model
    from library_graph.embedding_models m
   where m.is_default = true
   limit 1;

  select pg_catalog.count(*)::integer into v_total
    from library_graph.edges e
   where (e.source_key = p_node_key or e.target_key = p_node_key)
     and (v_all or e.edge_type = any(p_edge_types));

  with hop1 as (
    select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence, e.metadata,
           case when e.source_key = p_node_key then e.target_key else e.source_key end as other
      from library_graph.edges e
     where (e.source_key = p_node_key or e.target_key = p_node_key)
       and (v_all or e.edge_type = any(p_edge_types))
     order by (e.edge_type in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE', 'DEFINES_TERM', 'SIMILAR_TO')),
              e.weight desc, e.edge_type, other
     limit v_lim
  ),
  hop1_keys as (
    select distinct h.other as node_key from hop1 h
  ),
  hop2 as (
    select x.source_key, x.target_key, x.edge_type, x.origin, x.weight, x.evidence, x.metadata
      from (
        select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence, e.metadata
          from hop1_keys k
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type not in ('concept', 'law', 'chapter', 'term')
          join library_graph.edges e on e.source_key = k.node_key
         where v_depth = 2
           and e.target_key <> p_node_key
           and e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
           and (v_all or e.edge_type = any(p_edge_types))
           -- meaning / definition links fan out only when asked for by name
           and (e.edge_type not in ('DEFINES_TERM', 'SIMILAR_TO') or not v_all)
        union
        select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence, e.metadata
          from hop1_keys k
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type not in ('concept', 'law', 'chapter', 'term')
          join library_graph.edges e on e.target_key = k.node_key
         where v_depth = 2
           and e.source_key <> p_node_key
           and e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
           and (v_all or e.edge_type = any(p_edge_types))
           and (e.edge_type not in ('DEFINES_TERM', 'SIMILAR_TO') or not v_all)
      ) x
     order by x.weight desc, x.edge_type, x.source_key, x.target_key
     limit v_lim
  ),
  all_edges as (
    select h.source_key, h.target_key, h.edge_type, h.origin, h.weight, h.evidence, h.metadata, 1 as hop from hop1 h
    union all
    select h2.source_key, h2.target_key, h2.edge_type, h2.origin, h2.weight, h2.evidence, h2.metadata, 2 from hop2 h2
  ),
  node_hops as (
    select z.node_key, pg_catalog.min(z.hop) as hop
      from (
        select p_node_key as node_key, 0 as hop
        union all select k.node_key, 1 from hop1_keys k
        union all select h2.source_key, 2 from hop2 h2
        union all select h2.target_key, 2 from hop2 h2
      ) z
     group by z.node_key
  )
  select pg_catalog.jsonb_build_object(
    'found',              true,
    'center_key',         p_node_key,
    'depth',              v_depth,
    'limit',              v_lim,
    'total_center_edges', v_total,
    'truncated',          v_total > v_lim,
    'center_edge_counts', coalesce((
      select pg_catalog.jsonb_object_agg(c.edge_type, pg_catalog.jsonb_build_object('out', c.out_cnt, 'in', c.in_cnt))
        from (
          select e.edge_type,
                 (pg_catalog.count(*) filter (where e.source_key = p_node_key))::integer as out_cnt,
                 (pg_catalog.count(*) filter (where e.target_key = p_node_key))::integer as in_cnt
            from library_graph.edges e
           where e.source_key = p_node_key or e.target_key = p_node_key
           group by e.edge_type
        ) c
    ), '{}'::jsonb),
    'nodes', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'node_key',       n.node_key,
                 'node_type',      n.node_type,
                 'title',          n.title,
                 'law_slug',       n.law_slug,
                 'article_number', n.article_number,
                 'doc_status',     n.doc_status,
                 'item_status',    n.item_status,
                 'url',            n.url,
                 'snippet',        pg_catalog.left(n.display_text, 160),
                 'hop',            nh.hop,
                 'degree',         (select pg_catalog.count(*)::integer from library_graph.edges e where e.source_key = n.node_key)
                                 + (select pg_catalog.count(*)::integer from library_graph.edges e where e.target_key = n.node_key),
                 'has_vector',     exists (
                                     select 1 from library_graph.node_embeddings ne
                                      where ne.node_key = n.node_key and ne.model_id = v_model
                                   )
               )
               order by nh.hop, n.node_key
             )
        from node_hops nh
        join library_graph.nodes n on n.node_key = nh.node_key
    ), '[]'::jsonb),
    'edges', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'source',    a.source_key,
                 'target',    a.target_key,
                 'edge_type', a.edge_type,
                 'origin',    a.origin,
                 'weight',    a.weight,
                 'evidence',  pg_catalog.left(a.evidence, 400),
                 -- Only the keys the screen reads: where the link came from
                 -- (source = owner_links), and a vector link's score and method.
                 'metadata',  pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
                                'source', pg_catalog.left(a.metadata->>'source', 40),
                                'sim',    case when pg_catalog.jsonb_typeof(a.metadata->'sim') = 'number' then a.metadata->'sim' end,
                                'method', pg_catalog.left(a.metadata->>'method', 40))),
                 'hop',       a.hop
               )
             )
        from all_edges a
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

-- 2. Explorer status: sync, passes, owner links, vector links
create or replace function public.graph_rag_explore_status()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '15s'
as $$
declare
  v_model text;
begin
  select m.model_id into v_model
    from library_graph.embedding_models m
   where m.is_default = true
   limit 1;

  return pg_catalog.jsonb_build_object(
    'default_model_id', v_model,
    'sync', (
      select pg_catalog.jsonb_build_object(
               'dirty',            s.dirty,
               'dirty_tables',     s.dirty_tables,
               'first_dirty_at',   s.first_dirty_at,
               'last_write_at',    s.last_write_at,
               'last_synced_at',   s.last_synced_at,
               'last_sync_status', s.last_sync_status,
               'last_error',       pg_catalog.left(s.last_error, 400))
        from library_graph.sync_state s
       where s.id = 1
    ),
    'running_run', (
      select pg_catalog.jsonb_build_object(
               'id',             r.id,
               'started_at',     r.started_at,
               'trigger_source', r.trigger_source)
        from library_graph.sync_runs r
       where r.status = 'running'
       order by r.started_at desc
       limit 1
    ),
    'last_run', (
      select pg_catalog.jsonb_build_object(
               'id',             r.id,
               'status',         r.status,
               'trigger_source', r.trigger_source,
               'started_at',     r.started_at,
               'finished_at',    r.finished_at,
               'nodes_upserted', r.nodes_upserted,
               'nodes_deleted',  r.nodes_deleted,
               'edges_upserted', r.edges_upserted,
               'api_embedded',   r.api_embedded,
               'embed_only',     coalesce((r.details->>'embed_only')::boolean, false),
               'error_message',  pg_catalog.left(r.error_message, 400))
        from library_graph.sync_runs r
       where r.status <> 'running'
       order by r.started_at desc
       limit 1
    ),
    -- Written by the watchdog's full passes from 20261119 on; an embed-only
    -- pass has none, so the newest pass that read them.
    'owner_links_run', (
      select pg_catalog.jsonb_build_object(
               'finished_at', r.finished_at,
               'stats',       r.details->'owner_links')
        from library_graph.sync_runs r
       where r.details ? 'owner_links'
       order by r.started_at desc
       limit 1
    ),
    'owner_links', pg_catalog.jsonb_build_object(
      'laws', (
        select pg_catalog.count(*)::integer from library.laws l
         where pg_catalog.jsonb_typeof(l.owner_links) = 'array'
           and pg_catalog.jsonb_array_length(l.owner_links) > 0),
      'decrees', (
        select pg_catalog.count(*)::integer from library.decrees_circulars d
         where pg_catalog.jsonb_typeof(d.owner_links) = 'array'
           and pg_catalog.jsonb_array_length(d.owner_links) > 0),
      'edges', coalesce((
        select pg_catalog.jsonb_object_agg(x.edge_type, x.cnt)
          from (select e.edge_type, pg_catalog.count(*)::integer as cnt
                  from library_graph.edges e
                 where e.edge_type in ('SUPERSEDES_LAW', 'AMENDS_ARTICLE')
                   and e.metadata->>'source' = 'owner_links'
                 group by e.edge_type) x
      ), '{}'::jsonb)
    ),
    -- Vector links: article / principle vectors of the default model against
    -- the similarity state (an upper bound: page-numbered texts are skipped
    -- by the builder but have vectors).
    'similarity', pg_catalog.jsonb_build_object(
      'with_vector', (
        select pg_catalog.count(*)::integer from library_graph.node_embeddings ne
         where ne.model_id = v_model and ne.node_type in ('article', 'principle')),
      'done', (
        select pg_catalog.count(*)::integer from library_graph.similarity_state s
         where s.model_id = v_model),
      'repealed_done', (
        select pg_catalog.count(*)::integer from library_graph.similarity_state s
         where s.model_id = v_model and s.was_active = false),
      'last_computed_at', (
        select pg_catalog.max(s.computed_at) from library_graph.similarity_state s
         where s.model_id = v_model)
    ),
    'replacement_pairs', (select pg_catalog.count(*)::integer from library_graph.replacement_pairs)
  );
end;
$$;

revoke all on function public.graph_rag_explore_status() from public, anon, authenticated;
grant execute on function public.graph_rag_explore_status() to service_role;
revoke all on function public.graph_rag_explore_neighborhood(text, integer, text[], integer) from public, anon, authenticated;
grant execute on function public.graph_rag_explore_neighborhood(text, integer, text[], integer) to service_role;

-- 3. verify
do $$
declare
  f       text;
  r       text;
  missing text := '';
begin
  if coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.graph_rag_explore_neighborhood(text, integer, text[], integer)'))
              not like '%''metadata'',%a.metadata->>''source''%', true) then
    missing := missing || ' graph_rag_explore_neighborhood does not return link metadata;';
  end if;
  foreach f in array array['public.graph_rag_explore_status()',
                           'public.graph_rag_explore_neighborhood(text, integer, text[], integer)'] loop
    if to_regprocedure(f) is null then
      missing := missing || pg_catalog.format(' %s missing;', f);
      continue;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
        missing := missing || pg_catalog.format(' %s can EXECUTE %s;', r, f);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', f, 'EXECUTE') then
      missing := missing || pg_catalog.format(' service_role cannot EXECUTE %s;', f);
    end if;
  end loop;
  -- One function per name: a second overload makes PostgREST answer PGRST203.
  foreach f in array array['graph_rag_explore_status', 'graph_rag_explore_neighborhood'] loop
    if (select pg_catalog.count(*) from pg_catalog.pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = f) <> 1 then
      missing := missing || pg_catalog.format(' public.%s is not exactly one function;', f);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261119_10 verify:%', missing;
  end if;
  raise notice '20261119_10 verify: OK';
end $$;

-- 4. PostgREST: see the new function now
notify pgrst, 'reload schema';

commit;

select '20261119_10 explorer parity: link metadata + status' as step,
       to_regprocedure('public.graph_rag_explore_status()') is not null as ok;
