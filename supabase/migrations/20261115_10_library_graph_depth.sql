-- =============================================================================
-- Migration: 20261115_10_library_graph_depth.sql
-- =============================================================================
-- PURPOSE
--   A deeper legal graph (the code that ships with this file builds it; this
--   file only lets the database hold it and walk it):
--
--   1. Two node types and two edge types. The CHECK lists of
--      library_graph.nodes.node_type, library_graph.node_embeddings.node_type
--      and library_graph.edges.edge_type gain:
--        node_type  'law'      one node per law / regulation (its outline)
--                   'chapter'  one node per titled chapter that holds articles
--        edge_type  'PART_OF'       article → chapter → law (article → law
--                                   when the article has no titled chapter)
--                   'NEXT_ARTICLE'  article → the next article in reading order
--      Law and chapter nodes are never embedded (is_embeddable = false): they
--      add no embedding cost and no missing vectors.
--   2. graph_rag_retrieve walks two hops instead of one:
--        hop 1  as before, plus the neighbouring articles (NEXT_ARTICLE) of the
--               three strongest results;
--        hop 2  from the six strongest legal hop-1 results, over legal edges
--               only, at half the transfer. Exceptions, amendments and
--               interpretations always pass; a citation or enabling-law hop
--               needs query affinity (>= 0.38) and is skipped with no vectors.
--      PART_OF is never walked, and law / chapter / concept nodes are never
--      returned. Every item gains "hop" (0 direct, 1, 2). Same signature, so
--      the service_role-only grant stays as it is.
--   3. graph_rag_explore_overview: PART_OF / NEXT_ARTICLE do not count toward
--      "top_hubs" (a law node would take every slot).
--   4. graph_rag_explore_neighborhood: legal links sort before structural
--      ones, and hop 2 never fans out through a law, chapter or concept node.
--
-- RUN ORDER
--   After 20261110_10, 20261113_10 and 20261114_10 (all required). Run this
--   file BEFORE deploying the code that ships with it: that code writes the
--   new node and edge types, which the old CHECK lists reject. After the
--   deploy, mark the graph dirty once so the watchdog rebuilds it:
--     select public.graph_rag_sync_control('mark_dirty_now', '{"reason":"graph_depth_20261115"}'::jsonb);
--
-- IDEMPOTENT — the CHECK constraints are found by what they check, dropped and
-- re-added; functions are create or replace with unchanged signatures.
-- =============================================================================

begin;

set local lock_timeout = '10s';

do $$
begin
  if to_regclass('library_graph.nodes') is null
     or to_regprocedure('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)') is null
     or to_regprocedure('public.graph_rag_explore_neighborhood(text, integer, text[], integer)') is null
     or to_regprocedure('public.graph_rag_explore_overview()') is null then
    raise exception '20261115_10: apply 20261110_10 and 20261113_10 first';
  end if;
  if pg_catalog.pg_get_functiondef('public.graph_rag_sync_control(text, jsonb)'::regprocedure) not like '%abandon_running%' then
    raise exception '20261115_10: apply 20261114_10_library_graph_rag_fixes.sql first';
  end if;
end $$;

-- ── 1. Node and edge type lists ─────────────────────────────────────────────
-- The 20261110_10 lists are unnamed inline CHECKs: find them by what they
-- check (and the named ones a previous run of this file added), then re-add.
do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass::text as tbl
      from pg_catalog.pg_constraint c
     where c.contype = 'c'
       and (
         (c.conrelid in ('library_graph.nodes'::regclass, 'library_graph.node_embeddings'::regclass)
          and pg_catalog.pg_get_constraintdef(c.oid) like '%node_type%'
          and pg_catalog.pg_get_constraintdef(c.oid) like '%concept%')
         or
         (c.conrelid = 'library_graph.edges'::regclass
          and pg_catalog.pg_get_constraintdef(c.oid) like '%edge_type%'
          and pg_catalog.pg_get_constraintdef(c.oid) like '%HAS_CONCEPT%')
       )
  loop
    execute pg_catalog.format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table library_graph.nodes
  add constraint nodes_node_type_check
  check (node_type in ('article', 'principle', 'decree', 'feqh', 'concept', 'law', 'chapter'));

alter table library_graph.node_embeddings
  add constraint node_embeddings_node_type_check
  check (node_type in ('article', 'principle', 'decree', 'feqh', 'concept', 'law', 'chapter'));

alter table library_graph.edges
  add constraint edges_edge_type_check
  check (
    edge_type in (
      'PARENT_LAW',
      'SUPERSEDES_LAW',
      'EXEMPTS_FROM',
      'CITES_ARTICLE',
      'AMENDS_ARTICLE',
      'INTERPRETS_ARTICLE',
      'ESTABLISHES_RULE',
      'DECONSTRUCTS_CONCEPT',
      'HAS_CONCEPT',
      'PART_OF',
      'NEXT_ARTICLE'
    )
  );

-- ── 2. Retrieve: second hop, neighbouring articles, `hop` on every item ──────
create or replace function public.graph_rag_retrieve(
  p_tsqueries        text[]  default '{}'::text[],
  p_query_embedding  text    default null,
  p_model_id         text    default null,
  p_law_slug         text    default null,
  p_limit_laws       integer default 8,
  p_limit_principles integer default 4,
  p_limit_decrees    integer default 0,
  p_limit_feqh       integer default 0,
  p_enable_graph_hop boolean default true
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
declare
  v_model      text;
  v_dims       integer;
  v_has_nodes  boolean;
  v_in_sync    boolean;
  v_has_vec    boolean := false;
  v_vec_sql    text;
  v_result     jsonb;
begin
  select exists (select 1 from library_graph.nodes limit 1) into v_has_nodes;
  -- Ready = a full pass has finished AND no library write landed since. Before
  -- the first sync, during a load or a clean wipe, and until the next pass after
  -- any edit, the caller uses the keyword search instead of a partial or stale graph.
  select s.last_synced_at is not null and s.dirty = false
    into v_in_sync
    from library_graph.sync_state s
   where s.id = 1;
  if not v_has_nodes or not coalesce(v_in_sync, false) then
    return pg_catalog.jsonb_build_object(
      'ready', false,
      'model_id', null,
      'vector_used', false,
      'articles', '[]'::jsonb,
      'principles', '[]'::jsonb,
      'decrees', '[]'::jsonb,
      'feqh', '[]'::jsonb
    );
  end if;

  select m.model_id, m.dimensions into v_model, v_dims
    from library_graph.embedding_models m
   where (p_model_id is not null and m.model_id = p_model_id)
      or (p_model_id is null and m.is_default = true)
   limit 1;

  if p_query_embedding is not null and btrim(p_query_embedding) <> '' and v_model is not null then
    begin
      if extensions.vector_dims(p_query_embedding::extensions.halfvec) = v_dims then
        select exists (
          select 1 from library_graph.node_embeddings ne
           where ne.model_id = v_model and ne.is_active_corpus = true
           limit 1
        ) into v_has_vec;
        -- HNSW returns at most ef_search rows (default 40); the global leg asks for 65.
        if v_has_vec then
          perform pg_catalog.set_config('hnsw.ef_search', '100', true);
        end if;
      end if;
    exception when others then
      v_has_vec := false;
    end;
  end if;

  -- Create a session-temp staging table? NO: function is STABLE (read-only)!
  -- Execute a single dynamic CTE query parameterized with `v_dims` and `v_model`
  -- so PostgreSQL's planner binds the exact Partial Expression HNSW Index
  -- `((embedding::extensions.halfvec(v_dims)) extensions.halfvec_cosine_ops) WHERE model_id = v_model AND is_active_corpus = true`!
  v_vec_sql := pg_catalog.format($q$
    with
    -- Leg 1: Lexical FTS across cleaned tsquery strings (GIN-indexed, capped per query)
    clean_q as (
      select q, ord::integer
        from pg_catalog.unnest(coalesce($1::text[], '{}'::text[])) with ordinality as t(q, ord)
       where btrim(q) <> ''
       limit 6
    ),
    fts_raw as materialized (
      select n.node_key,
             n.node_type,
             n.law_slug,
             pg_catalog.row_number() over (
               partition by cq.ord, n.node_type
               order by
                 case when $3::text is not null and n.law_slug = $3::text then 0 else 1 end,
                 pg_catalog.ts_rank_cd(n.fts, pg_catalog.to_tsquery('simple'::regconfig, cq.q), 1) desc,
                 n.node_key asc
             ) as rnk
        from clean_q cq
        join lateral (
          select cand.node_key, cand.node_type, cand.law_slug, cand.fts
            from library_graph.nodes cand
           where cand.fts @@ pg_catalog.to_tsquery('simple'::regconfig, cq.q)
           limit 1500
        ) n on true
    ),
    fts_hits as (
      select node_key, pg_catalog.min(rnk)::integer as fts_rank
        from fts_raw
       where rnk <= 40
       group by node_key
    ),
    -- Leg 2: Dense Semantic HNSW Vector Search (Partial Expression Index on halfvec(%1$s))
    vec_global as materialized (
      select ne.node_key,
             ne.node_type,
             1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s))) as sim,
             pg_catalog.row_number() over (
               order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
             )::integer as vec_rank
        from library_graph.node_embeddings ne
       where %2$L::boolean = true
         and ne.model_id = %3$L
         and ne.is_active_corpus = true
       order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
       limit 65
    ),
    vec_scoped as materialized (
      select n.node_key,
             n.node_type,
             1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s))) as sim,
             pg_catalog.row_number() over (
               order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
             )::integer as scoped_rank
        from library_graph.nodes n
        join library_graph.node_embeddings ne
          on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
       where %2$L::boolean = true
         and $3::text is not null
         and n.law_slug = $3::text
       order by (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)) asc
       limit 15
    ),
    vec_hits as (
      select coalesce(g.node_key, s.node_key) as node_key,
             greatest(coalesce(g.sim, 0), coalesce(s.sim, 0)) as sim,
             least(coalesce(g.vec_rank, 999), coalesce(s.scoped_rank, 999)) as vec_rank
        from vec_global g
        full outer join vec_scoped s on s.node_key = g.node_key
    ),
    -- Leg 3: High-Level Legal Concept Bridge (Dual-Level Retrieval)
    matched_concepts as (
      select n.node_key,
             coalesce(1.0 / (50.0 + f.fts_rank), 0.0) +
             case when v.sim >= 0.52 then coalesce(1.2 / (50.0 + v.vec_rank), 0.0) else 0.0 end as concept_score
        from library_graph.nodes n
        left join fts_hits f on f.node_key = n.node_key
        left join vec_hits v on v.node_key = n.node_key
       where n.node_type = 'concept'
         and (f.node_key is not null or (v.node_key is not null and v.sim >= 0.52))
       order by concept_score desc
       limit 5
    ),
    concept_targets as (
      select case when e.source_key = mc.node_key then e.target_key else e.source_key end as node_key,
             pg_catalog.max(mc.concept_score * e.weight) as concept_boost
        from matched_concepts mc
        join library_graph.edges e
          on (e.source_key = mc.node_key or e.target_key = mc.node_key)
         and e.edge_type in ('HAS_CONCEPT', 'DECONSTRUCTS_CONCEPT', 'ESTABLISHES_RULE')
       group by 1
    ),
    -- Leg 4: Reciprocal Rank Fusion (RRF) over Primary Candidates
    candidate_keys as (
      select node_key from fts_hits
      union
      select node_key from vec_hits where sim >= 0.42
      union
      select node_key from concept_targets
    ),
    rrf_primary as materialized (
      select n.node_key,
             n.node_type,
             n.law_slug,
             (
               coalesce(1.0 / (60.0 + f.fts_rank), 0.0) +
               coalesce(1.15 / (60.0 + v.vec_rank), 0.0) +
               coalesce(0.75 * ct.concept_boost, 0.0) +
               case when $3::text is not null and n.law_slug = $3::text then 0.025 else 0.0 end +
               case when coalesce(n.doc_status, 'active') <> 'repealed'
                     and coalesce(n.item_status, 'active') <> 'repealed' then 0.004 else 0.0 end
             ) as score,
             null::text as via_edge_type,
             null::text as via_from_title,
             0 as hop
        from candidate_keys ck
        join library_graph.nodes n on n.node_key = ck.node_key
        left join fts_hits f on f.node_key = n.node_key
        left join vec_hits v on v.node_key = n.node_key
        left join concept_targets ct on ct.node_key = n.node_key
       where n.node_type in ('article', 'principle', 'decree', 'feqh')
    ),
    -- Leg 5: Query-Conditioned 1-Hop Legal Graph Walk (Exceptions, Amendments, Judicial Interpretations, Enabling Laws)
    -- plus the neighbouring articles (NEXT_ARTICLE) of the three strongest seeds only.
    -- PART_OF is never walked: law and chapter nodes are hubs of thousands of edges.
    top_seeds as (
      select rp.node_key, rp.score, n.title as seed_title,
             pg_catalog.row_number() over (order by rp.score desc, rp.node_key) as seed_rank
        from rrf_primary rp
        join library_graph.nodes n on n.node_key = rp.node_key
       order by rp.score desc, rp.node_key
       limit 8
    ),
    hop_candidates as (
      select
        case when e.source_key = ts.node_key then e.target_key else e.source_key end as neighbor_key,
        e.edge_type,
        ts.seed_title,
        ts.score as seed_score,
        e.weight * (
          case e.edge_type
            when 'EXEMPTS_FROM'       then 0.58
            when 'AMENDS_ARTICLE'     then 0.55
            when 'INTERPRETS_ARTICLE' then 0.52
            when 'ESTABLISHES_RULE'   then 0.48
            when 'PARENT_LAW'         then 0.36
            when 'CITES_ARTICLE'      then 0.32
            when 'NEXT_ARTICLE'       then 0.30
            else 0.28
          end
        ) as transfer_factor
      from top_seeds ts
      join library_graph.edges e
        on (e.source_key = ts.node_key or e.target_key = ts.node_key)
       and e.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'ESTABLISHES_RULE', 'PARENT_LAW', 'CITES_ARTICLE', 'NEXT_ARTICLE')
       and (e.edge_type <> 'NEXT_ARTICLE' or ts.seed_rank <= 3)
      where $8::boolean = true
    ),
    hop_scored as materialized (
      select distinct on (hc.neighbor_key)
        n.node_key,
        n.node_type,
        n.law_slug,
        (
          hc.seed_score * hc.transfer_factor +
          case
            when %2$L::boolean = true and ne.embedding is not null then
              0.012 * greatest(
                0.0,
                1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))
              )
            else 0.004
          end
        ) as score,
        hc.edge_type as via_edge_type,
        hc.seed_title as via_from_title,
        1 as hop
      from hop_candidates hc
      join library_graph.nodes n on n.node_key = hc.neighbor_key
      left join library_graph.node_embeddings ne
        on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
      where n.node_type in ('article', 'principle', 'decree', 'feqh')
        and coalesce(n.doc_status, 'active') <> 'repealed'
        and coalesce(n.item_status, 'active') <> 'repealed'
        and not exists (select 1 from rrf_primary rp where rp.node_key = n.node_key)
        -- Hub-pollution guard: CITES_ARTICLE / PARENT_LAW hops must show minimum query semantic affinity (>= 0.38) when vectors are active
        and (
          hc.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE')
          or %2$L::boolean = false
          or ne.embedding is null
          or (1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))) >= 0.38
        )
      order by hc.neighbor_key, score desc
    ),
    -- Leg 6: Second Hop — from the six strongest legal-hop results (not the
    -- neighbouring-article ones), over legal edges only, at half the transfer.
    -- An exception, amendment or interpretation always passes; a citation or
    -- enabling-law hop needs query affinity (>= 0.38), and with no vectors it
    -- is not taken at all: two citation hops away is noise without a meaning check.
    hop2_seeds as (
      select h.node_key, h.score, n.title as seed_title
        from hop_scored h
        join library_graph.nodes n on n.node_key = h.node_key
       where h.via_edge_type <> 'NEXT_ARTICLE'
       order by h.score desc, h.node_key
       limit 6
    ),
    hop2_candidates as (
      select
        case when e.source_key = s.node_key then e.target_key else e.source_key end as neighbor_key,
        e.edge_type,
        s.seed_title,
        s.score as seed_score,
        0.5 * e.weight * (
          case e.edge_type
            when 'EXEMPTS_FROM'       then 0.58
            when 'AMENDS_ARTICLE'     then 0.55
            when 'INTERPRETS_ARTICLE' then 0.52
            when 'ESTABLISHES_RULE'   then 0.48
            when 'PARENT_LAW'         then 0.36
            when 'CITES_ARTICLE'      then 0.32
            else 0.28
          end
        ) as transfer_factor
      from hop2_seeds s
      join library_graph.edges e
        on (e.source_key = s.node_key or e.target_key = s.node_key)
       and e.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'ESTABLISHES_RULE', 'PARENT_LAW', 'CITES_ARTICLE')
      where $8::boolean = true
    ),
    hop2_scored as (
      select distinct on (hc.neighbor_key)
        n.node_key,
        n.node_type,
        n.law_slug,
        (
          hc.seed_score * hc.transfer_factor +
          case
            when %2$L::boolean = true and ne.embedding is not null then
              0.012 * greatest(
                0.0,
                1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))
              )
            else 0.004
          end
        ) as score,
        hc.edge_type as via_edge_type,
        hc.seed_title as via_from_title,
        2 as hop
      from hop2_candidates hc
      join library_graph.nodes n on n.node_key = hc.neighbor_key
      left join library_graph.node_embeddings ne
        on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
      where n.node_type in ('article', 'principle', 'decree', 'feqh')
        and coalesce(n.doc_status, 'active') <> 'repealed'
        and coalesce(n.item_status, 'active') <> 'repealed'
        and not exists (select 1 from rrf_primary rp where rp.node_key = n.node_key)
        and not exists (select 1 from hop_scored h1 where h1.node_key = n.node_key)
        and (
          hc.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE')
          or (
            %2$L::boolean = true
            and ne.embedding is not null
            and (1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))) >= 0.38
          )
        )
      order by hc.neighbor_key, score desc
    ),
    combined as (
      select * from rrf_primary
      union all
      select * from hop_scored
      union all
      select * from hop2_scored
    ),
    deduped as (
      select distinct on (c.node_key)
        c.node_key, c.node_type, c.score, c.via_edge_type, c.via_from_title, c.hop
      from combined c
      order by c.node_key, c.score desc
    ),
    enriched as (
      select
        d.node_type,
        d.score,
        pg_catalog.row_number() over (partition by d.node_type order by d.score desc, d.node_key asc) as section_rank,
        pg_catalog.jsonb_build_object(
          'node_key',       n.node_key,
          'kind',           n.node_type,
          'id',             n.source_id,
          'law_slug',       n.law_slug,
          'collection_id',  n.collection_id,
          'article_number', n.article_number,
          'status',         coalesce(n.item_status, n.doc_status, 'active'),
          'title',          n.title,
          'url',            n.url,
          'text',           n.display_text,
          'score',          pg_catalog.round(d.score::numeric, 6),
          'via_edge_type',  d.via_edge_type,
          'via_from_title', d.via_from_title,
          'hop',            d.hop
        ) as item
      from deduped d
      join library_graph.nodes n on n.node_key = d.node_key
    )
    select pg_catalog.jsonb_build_object(
      'ready',       true,
      'model_id',    %3$L,
      'vector_used', %2$L::boolean,
      'articles', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'article' and e.section_rank <= greatest(coalesce($4::integer, 0), 0)
      ), '[]'::jsonb),
      'principles', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'principle' and e.section_rank <= greatest(coalesce($5::integer, 0), 0)
      ), '[]'::jsonb),
      'decrees', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'decree' and e.section_rank <= greatest(coalesce($6::integer, 0), 0)
      ), '[]'::jsonb),
      'feqh', coalesce((
        select pg_catalog.jsonb_agg(e.item order by e.score desc)
          from enriched e
         where e.node_type = 'feqh' and e.section_rank <= greatest(coalesce($7::integer, 0), 0)
      ), '[]'::jsonb)
    )
  $q$,
    coalesce(v_dims, 768),
    v_has_vec,
    coalesce(v_model, 'gemini-embedding-2-768')
  );

  execute v_vec_sql
    into v_result
    using p_tsqueries,
          case when v_has_vec then p_query_embedding else null end,
          p_law_slug,
          p_limit_laws,
          p_limit_principles,
          p_limit_decrees,
          p_limit_feqh,
          coalesce(p_enable_graph_hop, true);

  return v_result;
end;
$$;


-- ── 3. Explorer overview: structural edges never make a hub ─────────────────
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
              select e.source_key as node_key from library_graph.edges e where e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
              union all
              select e.target_key from library_graph.edges e where e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
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


-- ── 4. Explorer neighbourhood: legal links first, hop 2 skips outlines ──────
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
     order by (e.edge_type in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')), e.weight desc, e.edge_type, other
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
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type not in ('concept', 'law', 'chapter')
          join library_graph.edges e on e.source_key = k.node_key
         where v_depth = 2
           and e.target_key <> p_node_key
           and e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
           and (v_all or e.edge_type = any(p_edge_types))
        union
        select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence
          from hop1_keys k
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type not in ('concept', 'law', 'chapter')
          join library_graph.edges e on e.target_key = k.node_key
         where v_depth = 2
           and e.source_key <> p_node_key
           and e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
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


-- ── Verify inside the transaction (rolls back on any failure) ───────────────
do $$
declare
  fn      text;
  r       text;
  missing text := '';
begin
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint c
       where c.contype = 'c'
         and c.conrelid in ('library_graph.nodes'::regclass, 'library_graph.node_embeddings'::regclass)
         and pg_catalog.pg_get_constraintdef(c.oid) like '%node_type%') <> 2 then
    missing := missing || ' node_type must have exactly one CHECK on nodes and one on node_embeddings;';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint c
       where c.contype = 'c'
         and c.conrelid = 'library_graph.edges'::regclass
         and pg_catalog.pg_get_constraintdef(c.oid) like '%edge_type%') <> 1 then
    missing := missing || ' edge_type must have exactly one CHECK;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'nodes_node_type_check' and c.conrelid = 'library_graph.nodes'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%chapter%') then
    missing := missing || ' nodes does not accept law / chapter;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'edges_edge_type_check' and c.conrelid = 'library_graph.edges'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%NEXT_ARTICLE%') then
    missing := missing || ' edges does not accept PART_OF / NEXT_ARTICLE;';
  end if;

  if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
       not like '%last_synced_at is not null and s.dirty = false%' then
    missing := missing || ' graph_rag_retrieve lost its readiness check;';
  end if;
  if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
       not like '%hop2_scored%' then
    missing := missing || ' graph_rag_retrieve has no second hop;';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'library_graph'::regnamespace)
       and p.proname like 'graph_rag_%'
       and (p.prosrc like '%halfvec_dims(%' or p.prosrc like '%pg_catalog.greatest(%' or p.prosrc like '%pg_catalog.least(%')
  ) then
    missing := missing || ' a graph function calls halfvec_dims() or pg_catalog.greatest/least();';
  end if;

  -- create or replace keeps the grants: still service_role only.
  foreach fn in array array[
    'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)',
    'public.graph_rag_explore_overview()',
    'public.graph_rag_explore_neighborhood(text, integer, text[], integer)'
  ] loop
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
  end loop;

  if missing <> '' then
    raise exception '20261115_10 verify:%', missing;
  end if;
  raise notice '20261115_10 verify: OK';
end $$;

notify pgrst, 'reload schema';

commit;

-- ── Final check for the SQL editor (it hides NOTICEs): expect ok = true ─────
select '20261115_10 graph depth: law/chapter nodes, PART_OF/NEXT_ARTICLE, two-hop retrieve' as check,
       exists (select 1 from pg_catalog.pg_constraint c
                where c.conname = 'nodes_node_type_check' and c.conrelid = 'library_graph.nodes'::regclass
                  and pg_catalog.pg_get_constraintdef(c.oid) like '%chapter%')
       and exists (select 1 from pg_catalog.pg_constraint c
                    where c.conname = 'node_embeddings_node_type_check' and c.conrelid = 'library_graph.node_embeddings'::regclass
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%chapter%')
       and exists (select 1 from pg_catalog.pg_constraint c
                    where c.conname = 'edges_edge_type_check' and c.conrelid = 'library_graph.edges'::regclass
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%NEXT_ARTICLE%')
       and pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
           like '%hop2_scored%'
       and pg_catalog.pg_get_functiondef('public.graph_rag_explore_overview()'::regprocedure) like '%NEXT_ARTICLE%'
       as ok;
