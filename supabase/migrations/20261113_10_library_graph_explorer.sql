-- =============================================================================
-- Migration: 20261113_10_library_graph_explorer.sql
-- =============================================================================
-- PURPOSE
--   Read-only, service_role-only RPCs behind the admin Legal Graph Explorer
--   (/dashboard/admin/graph-explorer, GET /api/v1/admin/graph-explorer):
--
--     public.graph_rag_explore_overview()                      corpus stats,
--         vector coverage per type, link mix, top hubs, the 32 concept nodes
--     public.graph_rag_explore_search(text, text[], integer)   title / key /
--         full-text node search (tashkeel-folded), with degree + vector flag
--     public.graph_rag_explore_neighborhood(text, integer, text[], integer)
--         a node's 1- or 2-hop neighbourhood (nodes + typed edges + evidence)
--     public.graph_rag_explore_node(text)                      one node in full
--
-- INVARIANTS
--   * Requires 20261110_10_library_graph_rag.sql (the library_graph schema).
--   * READ-ONLY: no table, column, trigger, policy or row is created or changed.
--   * service_role only (anon / authenticated get no EXECUTE), SECURITY INVOKER,
--     empty search_path, a statement_timeout on every function.
--
-- PRE-RUN REQUIREMENT
--   Always take a schema backup first (npm run db:backup-schema).
--
-- IDEMPOTENT — safe to run any number of times.
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- ── 0. Preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('library_graph.nodes') is null
     or to_regclass('library_graph.edges') is null
     or to_regprocedure('library_graph.fold_tashkeel(text)') is null then
    raise exception '20261113_10: library_graph does not exist — apply 20261110_10_library_graph_rag.sql first';
  end if;
end $$;

-- ── 1. Overview: corpus stats, coverage, link mix, hubs, concepts ────────────
create or replace function public.graph_rag_explore_overview()
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
    'node_counts', coalesce((
      select pg_catalog.jsonb_object_agg(s.node_type, s.cnt)
        from (select n.node_type, pg_catalog.count(*)::integer as cnt
                from library_graph.nodes n group by n.node_type) s
    ), '{}'::jsonb),
    'embeddable_counts', coalesce((
      select pg_catalog.jsonb_object_agg(s.node_type, s.cnt)
        from (select n.node_type, pg_catalog.count(*)::integer as cnt
                from library_graph.nodes n where n.is_embeddable = true group by n.node_type) s
    ), '{}'::jsonb),
    'embedded_counts', coalesce((
      select pg_catalog.jsonb_object_agg(s.node_type, s.cnt)
        from (select ne.node_type, pg_catalog.count(*)::integer as cnt
                from library_graph.node_embeddings ne where ne.model_id = v_model group by ne.node_type) s
    ), '{}'::jsonb),
    'edge_counts', coalesce((
      select pg_catalog.jsonb_object_agg(s.edge_type, s.cnt)
        from (select e.edge_type, pg_catalog.count(*)::integer as cnt
                from library_graph.edges e group by e.edge_type) s
    ), '{}'::jsonb),
    'origin_counts', coalesce((
      select pg_catalog.jsonb_object_agg(s.origin, s.cnt)
        from (select e.origin, pg_catalog.count(*)::integer as cnt
                from library_graph.edges e group by e.origin) s
    ), '{}'::jsonb),
    'repealed_nodes', (
      select pg_catalog.count(*)::integer
        from library_graph.nodes n
       where n.doc_status = 'repealed' or n.item_status = 'repealed'
    ),
    'top_hubs', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'node_key',  n.node_key,
                 'node_type', n.node_type,
                 'title',     n.title,
                 'law_slug',  n.law_slug,
                 'degree',    h.degree
               )
               order by h.degree desc, n.node_key
             )
        from (
          select x.node_key, pg_catalog.count(*)::integer as degree
            from (
              select e.source_key as node_key from library_graph.edges e where e.edge_type <> 'HAS_CONCEPT'
              union all
              select e.target_key from library_graph.edges e where e.edge_type <> 'HAS_CONCEPT'
            ) x
           group by x.node_key
           order by degree desc
           limit 24
        ) h
        join library_graph.nodes n on n.node_key = h.node_key
    ), '[]'::jsonb),
    'concepts', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'node_key', c.node_key,
                 'title',    c.title,
                 'degree',   c.degree
               )
               order by c.degree desc, c.title
             )
        from (
          select n.node_key, n.title,
                 (select pg_catalog.count(*)::integer from library_graph.edges e where e.source_key = n.node_key)
               + (select pg_catalog.count(*)::integer from library_graph.edges e where e.target_key = n.node_key) as degree
            from library_graph.nodes n
           where n.node_type = 'concept'
        ) c
    ), '[]'::jsonb),
    'last_synced_at', (select s.last_synced_at from library_graph.sync_state s where s.id = 1)
  );
end;
$$;

-- ── 2. Search: exact key, folded title, then full text ───────────────────────
create or replace function public.graph_rag_explore_search(
  p_query text,
  p_types text[]  default null,
  p_limit integer default 24
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_q         text    := pg_catalog.btrim(coalesce(p_query, ''));
  v_fold      text;
  v_like      text;
  v_ts        tsquery;
  v_lim       integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_all_types boolean := p_types is null or coalesce(pg_catalog.cardinality(p_types), 0) = 0;
  v_model     text;
begin
  if v_q = '' then
    return '[]'::jsonb;
  end if;

  v_fold := library_graph.fold_tashkeel(v_q);
  v_like := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(v_fold, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  begin
    v_ts := pg_catalog.plainto_tsquery('simple'::regconfig, v_fold);
  exception when others then
    v_ts := null;
  end;

  select m.model_id into v_model
    from library_graph.embedding_models m
   where m.is_default = true
   limit 1;

  return coalesce((
    select pg_catalog.jsonb_agg(r.row_json order by r.score desc, r.title_len asc)
      from (
        select pg_catalog.jsonb_build_object(
                 'node_key',    n.node_key,
                 'node_type',   n.node_type,
                 'title',       n.title,
                 'law_slug',    n.law_slug,
                 'doc_status',  n.doc_status,
                 'item_status', n.item_status,
                 'url',         n.url,
                 'snippet',     pg_catalog.left(n.display_text, 220),
                 'degree',      (select pg_catalog.count(*)::integer from library_graph.edges e where e.source_key = n.node_key)
                              + (select pg_catalog.count(*)::integer from library_graph.edges e where e.target_key = n.node_key),
                 'has_vector',  exists (
                                  select 1 from library_graph.node_embeddings ne
                                   where ne.node_key = n.node_key and ne.model_id = v_model
                                )
               ) as row_json,
               c.score,
               pg_catalog.char_length(n.title) as title_len
          from (
            select cand.node_key, pg_catalog.max(cand.score) as score
              from (
                select n1.node_key, 100.0::float8 as score
                  from library_graph.nodes n1
                 where n1.node_key = v_q
                union all
                (select n2.node_key, 10.0::float8
                   from library_graph.nodes n2
                  where library_graph.fold_tashkeel(n2.title) ilike v_like
                    and (v_all_types or n2.node_type = any(p_types))
                  limit 300)
                union all
                (select n3.node_key, (1.0 + pg_catalog.ts_rank_cd(n3.fts, v_ts))::float8
                   from library_graph.nodes n3
                  where v_ts is not null
                    and pg_catalog.numnode(v_ts) > 0
                    and n3.fts @@ v_ts
                    and (v_all_types or n3.node_type = any(p_types))
                  order by pg_catalog.ts_rank_cd(n3.fts, v_ts) desc
                  limit 300)
              ) cand
             group by cand.node_key
             order by score desc
             limit v_lim
          ) c
          join library_graph.nodes n on n.node_key = c.node_key
         where v_all_types or n.node_type = any(p_types)
      ) r
  ), '[]'::jsonb);
end;
$$;

-- ── 3. Neighbourhood: 1 or 2 hops of typed edges around one node ─────────────
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
    select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence,
           case when e.source_key = p_node_key then e.target_key else e.source_key end as other
      from library_graph.edges e
     where (e.source_key = p_node_key or e.target_key = p_node_key)
       and (v_all or e.edge_type = any(p_edge_types))
     order by (e.edge_type = 'HAS_CONCEPT'), e.weight desc, e.edge_type, other
     limit v_lim
  ),
  hop1_keys as (
    select distinct h.other as node_key from hop1 h
  ),
  hop2 as (
    select x.source_key, x.target_key, x.edge_type, x.origin, x.weight, x.evidence
      from (
        select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence
          from hop1_keys k
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type <> 'concept'
          join library_graph.edges e on e.source_key = k.node_key
         where v_depth = 2
           and e.target_key <> p_node_key
           and e.edge_type <> 'HAS_CONCEPT'
           and (v_all or e.edge_type = any(p_edge_types))
        union
        select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence
          from hop1_keys k
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type <> 'concept'
          join library_graph.edges e on e.target_key = k.node_key
         where v_depth = 2
           and e.source_key <> p_node_key
           and e.edge_type <> 'HAS_CONCEPT'
           and (v_all or e.edge_type = any(p_edge_types))
      ) x
     order by x.weight desc, x.edge_type, x.source_key, x.target_key
     limit v_lim
  ),
  all_edges as (
    select h.source_key, h.target_key, h.edge_type, h.origin, h.weight, h.evidence, 1 as hop from hop1 h
    union all
    select h2.source_key, h2.target_key, h2.edge_type, h2.origin, h2.weight, h2.evidence, 2 from hop2 h2
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

-- ── 4. One node in full (inspector) ──────────────────────────────────────────
create or replace function public.graph_rag_explore_node(p_node_key text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '6s'
as $$
declare
  v_result jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'found',             true,
    'node_key',          n.node_key,
    'node_type',         n.node_type,
    'source_id',         n.source_id,
    'title',             n.title,
    'law_slug',          n.law_slug,
    'collection_id',     n.collection_id,
    'article_number',    n.article_number,
    'doc_status',        n.doc_status,
    'item_status',       n.item_status,
    'is_page_numbered',  n.is_page_numbered,
    'is_embeddable',     n.is_embeddable,
    'url',               n.url,
    'contextual_header', n.contextual_header,
    'display_text',      pg_catalog.left(n.display_text, 8000),
    'text_length',       pg_catalog.char_length(n.display_text),
    'metadata',          n.metadata,
    'updated_at',        n.updated_at,
    'embeddings', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'model_id',   ne.model_id,
                 'is_default', m.is_default,
                 'updated_at', ne.updated_at
               )
               order by m.is_default desc, ne.model_id
             )
        from library_graph.node_embeddings ne
        join library_graph.embedding_models m on m.model_id = ne.model_id
       where ne.node_key = n.node_key
    ), '[]'::jsonb),
    'edge_counts', coalesce((
      select pg_catalog.jsonb_object_agg(c.edge_type, pg_catalog.jsonb_build_object('out', c.out_cnt, 'in', c.in_cnt))
        from (
          select e.edge_type,
                 (pg_catalog.count(*) filter (where e.source_key = n.node_key))::integer as out_cnt,
                 (pg_catalog.count(*) filter (where e.target_key = n.node_key))::integer as in_cnt
            from library_graph.edges e
           where e.source_key = n.node_key or e.target_key = n.node_key
           group by e.edge_type
        ) c
    ), '{}'::jsonb)
  )
  into v_result
  from library_graph.nodes n
  where n.node_key = p_node_key;

  return coalesce(v_result, pg_catalog.jsonb_build_object('found', false, 'node_key', p_node_key));
end;
$$;

-- ── 5. Lock the explorer RPCs down to service_role ONLY ──────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.graph_rag_explore_overview()',
    'public.graph_rag_explore_search(text, text[], integer)',
    'public.graph_rag_explore_neighborhood(text, integer, text[], integer)',
    'public.graph_rag_explore_node(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ── 6. Self-verification inside the transaction (rolls back on any failure) ──
do $$
declare
  fn      text;
  r       text;
  missing text := '';
begin
  foreach fn in array array[
    'public.graph_rag_explore_overview()',
    'public.graph_rag_explore_search(text, text[], integer)',
    'public.graph_rag_explore_neighborhood(text, integer, text[], integer)',
    'public.graph_rag_explore_node(text)'
  ] loop
    if to_regprocedure(fn) is null then
      missing := missing || format(' %s is missing;', fn);
    else
      foreach r in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_catalog.pg_roles where rolname = r)
           and has_function_privilege(r, fn, 'EXECUTE') then
          missing := missing || format(' %s can EXECUTE %s;', r, fn);
        end if;
      end loop;
      if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
         and not has_function_privilege('service_role', fn, 'EXECUTE') then
        missing := missing || format(' service_role cannot EXECUTE %s;', fn);
      end if;
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261113_10 verify:%', missing;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;

-- ── 7. Final SQL Editor Check (expect `ok = true`) ───────────────────────────
select 'graph explorer RPCs exist, service_role only (run 20261113_10)' as check,
       to_regprocedure('public.graph_rag_explore_overview()') is not null
       and to_regprocedure('public.graph_rag_explore_search(text, text[], integer)') is not null
       and to_regprocedure('public.graph_rag_explore_neighborhood(text, integer, text[], integer)') is not null
       and to_regprocedure('public.graph_rag_explore_node(text)') is not null
       and not has_function_privilege('anon', 'public.graph_rag_explore_neighborhood(text, integer, text[], integer)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.graph_rag_explore_neighborhood(text, integer, text[], integer)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.graph_rag_explore_neighborhood(text, integer, text[], integer)', 'EXECUTE')
       as ok;
