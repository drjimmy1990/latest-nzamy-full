-- =============================================================================
-- Migration: 20261117_10_library_graph_seeds.sql
-- =============================================================================
-- PURPOSE
--   Named articles lead the graph answer. When a question names an article
--   outright («المادة ٧٧ من نظام العمل», or «المادة ٧٧» on a law's page), the
--   AI already looks that article up and puts it first. Until now the graph
--   did not know about it: it searched the words only, so the named article's
--   exceptions, regulation, interpretations and penalties came back only if the
--   search happened to find the article itself.
--
--   public.graph_rag_retrieve_scoped gains a last argument p_seed_keys text[]
--   (node keys such as 'article:<id>'; at most four are used). Each seed:
--     - enters the results just above the strongest search result (first named
--       first), so it leads the answer and votes for the question's section;
--     - is never routed away, and its law counts as one of the question's laws;
--     - seeds the hops like any strong result: its exceptions, amendments,
--       interpretations, penalties, regulations and citations follow it.
--   Each item carries 'seed' (true/false); 'routing' carries 'seeds' (the count).
--   With no seeds the answer is the same as before this file.
--
--   The old ten-argument signature is dropped and the eleven-argument one
--   created (one function per name: PostgREST answers PGRST203 to overloads).
--   The nine-argument public.graph_rag_retrieve stays as it is: no seeds,
--   routing 'auto'. Code from before this file calls it, and the new code falls
--   back to it when graph_rag_retrieve_scoped is missing.
--
-- RUN ORDER
--   After 20261116_10 (required). Run it before or after deploying the code
--   that ships with it: that code falls back to graph_rag_retrieve until this
--   file is run. No rebuild and no mark_dirty_now: the graph is unchanged.
--   Do NOT re-run 20261116_10 after this file: it would recreate the old
--   ten-argument function next to this one (its own verify then stops it).
--
-- IDEMPOTENT — drop if exists + create or replace.
-- =============================================================================

begin;

set local lock_timeout = '10s';

do $$
begin
  if to_regprocedure('library_graph.route_factor(text, text, text, text, boolean, text[])') is null
     or to_regprocedure('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)') is null then
    raise exception '20261117_10: apply 20261116_10_library_graph_links.sql first';
  end if;
end $$;

drop function if exists public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text);

-- ── Retrieve with seeds ──────────────────────────────────────────────────────
create or replace function public.graph_rag_retrieve_scoped(
  p_tsqueries        text[]  default '{}'::text[],
  p_query_embedding  text    default null,
  p_model_id         text    default null,
  p_law_slug         text    default null,
  p_limit_laws       integer default 8,
  p_limit_principles integer default 4,
  p_limit_decrees    integer default 0,
  p_limit_feqh       integer default 0,
  p_enable_graph_hop boolean default true,
  p_scope            text    default 'auto',
  p_seed_keys        text[]  default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '4s'
as $$
declare
  v_scope      text := case
                         when pg_catalog.lower(pg_catalog.btrim(coalesce(p_scope, ''))) in ('section', 'all')
                           then pg_catalog.lower(pg_catalog.btrim(p_scope))
                         else 'auto'
                       end;
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

  -- One dynamic query, with `v_dims` and `v_model` written in as literals so the
  -- planner binds the partial expression HNSW index
  -- ((embedding::extensions.halfvec(v_dims)) halfvec_cosine_ops) WHERE model_id = v_model AND is_active_corpus.
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
    -- Leg 2: Dense Semantic HNSW Vector Search. Term nodes are left out: they
    -- are reached through the terms leg, and would crowd articles here.
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
         and ne.node_type in ('article', 'principle', 'decree', 'feqh', 'concept')
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
         and n.node_type in ('article', 'principle', 'decree', 'feqh', 'concept')
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
    -- Seeds: the articles the question names outright («المادة ٧٧ من نظام
    -- العمل»), found by the caller and passed as node keys. At most four; an
    -- unknown key, a law or chapter node, or a term is ignored.
    seed_in as (
      select s.k as node_key, pg_catalog.min(s.ord) as ord
        from pg_catalog.unnest(coalesce($10::text[], '{}'::text[])) with ordinality as s(k, ord)
       where s.k is not null and btrim(s.k) <> ''
       group by s.k
    ),
    seed_nodes as materialized (
      select si.node_key,
             pg_catalog.row_number() over (order by si.ord, si.node_key)::integer as seed_ord
        from seed_in si
        join library_graph.nodes n on n.node_key = si.node_key
       where n.node_type in ('article', 'principle', 'decree', 'feqh')
       order by si.ord, si.node_key
       limit 4
    ),
    -- Leg 4: Reciprocal Rank Fusion (RRF) over Primary Candidates
    candidate_keys as (
      select node_key from fts_hits
      union
      select node_key from vec_hits where sim >= 0.42
      union
      select node_key from concept_targets
      union
      select node_key from seed_nodes
    ),
    rrf_search as materialized (
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
             0 as hop,
             ln.metadata ->> 'section_code' as section,
             n.metadata ->> 'track_class' as track_class,
             n.metadata ->> 'subject_section' as subject_section
        from candidate_keys ck
        join library_graph.nodes n on n.node_key = ck.node_key
        left join library_graph.nodes ln on ln.node_key = 'law:' || n.law_slug
        left join fts_hits f on f.node_key = n.node_key
        left join vec_hits v on v.node_key = n.node_key
        left join concept_targets ct on ct.node_key = n.node_key
       where n.node_type in ('article', 'principle', 'decree', 'feqh')
    ),
    -- A seed scores just above the strongest search result (first named first),
    -- so it leads the answer, votes for the section and seeds the hops.
    rrf_top as (
      select coalesce(pg_catalog.max(rs.score), 0.05) as top
        from rrf_search rs
       where not exists (select 1 from seed_nodes sn where sn.node_key = rs.node_key)
    ),
    rrf_raw as materialized (
      select rs.node_key, rs.node_type, rs.law_slug,
             case when sn.node_key is not null
                  then t.top + 0.004 * (5 - sn.seed_ord)
                  else rs.score
             end as score,
             rs.via_edge_type, rs.via_from_title, rs.hop,
             rs.section, rs.track_class, rs.subject_section,
             sn.node_key is not null as is_seed
        from rrf_search rs
        cross join rrf_top t
        left join seed_nodes sn on sn.node_key = rs.node_key
    ),
    -- Routing: the question's section — the pinned law's, else a vote of the
    -- twelve strongest results by score (articles by their law's section, an
    -- administrative principle '02', a Board of Grievances commercial / criminal
    -- circuit its subject). Procedure ('00') and agreements ('29') never vote.
    q_pinned as (
      select ln.metadata ->> 'section_code' as section
        from library_graph.nodes ln
       where $3::text is not null
         and ln.node_key = 'law:' || $3::text
         and ln.metadata ->> 'section_code' not in ('00', '29')
    ),
    vote_pool as (
      select rr.score,
             case
               when rr.node_type = 'article' then rr.section
               when rr.node_type = 'principle' and rr.track_class = 'admin' then coalesce(rr.subject_section, '02')
             end as vote
        from rrf_raw rr
       order by rr.score desc, rr.node_key
       limit 12
    ),
    vote_top as (
      select v.vote, v.n, v.w / nullif(pg_catalog.sum(v.w) over (), 0) as share
        from (
          select vp.vote, pg_catalog.sum(vp.score) as w, pg_catalog.count(*) as n
            from vote_pool vp
           where vp.vote is not null and vp.vote not in ('00', '29')
           group by vp.vote
        ) v
       order by v.w desc, v.vote
       limit 1
    ),
    q_route as (
      select
        coalesce(pin.section, case when vt.share >= 0.5 then vt.vote end) as section,
        (pin.section is not null) or coalesce(vt.share >= 0.67 and vt.n >= 2, false) as confident,
        case when pin.section is not null then 'law' when vt.share >= 0.5 then 'vote' else 'none' end as source
        from (select 1) one
        left join (select qp.section from q_pinned qp limit 1) pin on true
        left join vote_top vt on true
    ),
    -- The laws of the six strongest in-section articles (and the pinned law):
    -- a principle that cites one, or a committee that applies one, fits the question.
    route_laws as (
      select coalesce(pg_catalog.array_agg(distinct x.law_slug), '{}'::text[]) as laws
        from (
          (select rr.law_slug
             from rrf_raw rr
             cross join q_route qr
            where rr.node_type = 'article'
              and rr.law_slug is not null
              -- not '00': a procedural law is cited by every track, so it says
              -- nothing about which principles fit (it counts when no section is set)
              and (qr.section is null or rr.section is null or rr.section = qr.section)
            order by rr.score desc, rr.node_key
            limit 6)
          union all
          select $3::text where $3::text is not null
          union all
          select rr.law_slug from rrf_raw rr where rr.is_seed and rr.law_slug is not null
        ) x
    ),
    -- `routed`: a direct result its section or track lowered. Such a result may
    -- still come back through a hop below (an explicit legal link scores it at
    -- full weight); `deduped` keeps the higher of the two.
    rrf_primary as materialized (
      select rr.node_key, rr.node_type, rr.law_slug,
             rr.score * rf.factor as score,
             rr.via_edge_type, rr.via_from_title, rr.hop,
             rf.factor < 1.0 as routed
        from rrf_raw rr
        cross join q_route qr
        cross join route_laws rl
        cross join lateral (
          select case when rr.is_seed then 1.0
                      else coalesce(library_graph.route_factor(rr.node_key, null, $9::text, qr.section, qr.confident, rl.laws), 1.0)
                 end as factor
        ) rf
       where rf.factor > 0
    ),
    -- Leg 5: hop 1 from the eight strongest results. PART_OF is never walked:
    -- law and chapter nodes are hubs of thousands of edges.
    top_seeds as (
      select rp.node_key, rp.score, rp.law_slug, n.title as seed_title,
             pg_catalog.row_number() over (order by rp.score desc, rp.node_key) as seed_rank
        from rrf_primary rp
        join library_graph.nodes n on n.node_key = rp.node_key
       order by rp.score desc, rp.node_key
       limit 8
    ),
    seed_laws as (
      select ts.law_slug,
             pg_catalog.max(ts.score) as seed_score,
             (pg_catalog.array_agg(ts.seed_title order by ts.score desc, ts.node_key))[1] as seed_title
        from top_seeds ts
       where ts.law_slug is not null
       group by ts.law_slug
    ),
    edge_candidates as (
      select
        case when e.source_key = ts.node_key then e.target_key else e.source_key end as neighbor_key,
        e.edge_type,
        ts.seed_title,
        ts.score as seed_score,
        e.weight * (
          case e.edge_type
            when 'EXEMPTS_FROM'       then 0.58
            when 'REPLACED_BY'        then 0.56
            when 'AMENDS_ARTICLE'     then 0.55
            when 'INTERPRETS_ARTICLE' then 0.52
            when 'PENALIZES'          then 0.50
            when 'ESTABLISHES_RULE'   then 0.48
            when 'SUBJECT_TO'         then 0.45
            when 'PARENT_LAW'         then 0.36
            when 'CITES_ARTICLE'      then 0.32
            when 'NEXT_ARTICLE'       then 0.30
            when 'SIMILAR_TO'         then 0.30
            -- The regulation article brings its system article; the system
            -- article already holds the regulation text, so the other way is weak.
            when 'IMPLEMENTED_BY'     then case when e.target_key = ts.node_key then 0.50 else 0.15 end
            else 0.28
          end
        ) as transfer_factor
      from top_seeds ts
      join library_graph.edges e
        on (e.source_key = ts.node_key or e.target_key = ts.node_key)
       and e.edge_type in ('EXEMPTS_FROM', 'REPLACED_BY', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'PENALIZES',
                           'ESTABLISHES_RULE', 'SUBJECT_TO', 'PARENT_LAW', 'CITES_ARTICLE', 'NEXT_ARTICLE', 'SIMILAR_TO',
                           'IMPLEMENTED_BY')
       and (e.edge_type <> 'NEXT_ARTICLE' or ts.seed_rank <= 3)
      where $8::boolean = true
    ),
    -- Terms leg: a defined term the question matches (by its words, or by
    -- meaning) brings in its definition article — only from the laws of the
    -- strongest results, so «العامل» brings the labour law's definition when
    -- the question is about the labour law.
    term_vec as materialized (
      select ne.node_key,
             1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s))) as sim
        from library_graph.node_embeddings ne
       where %2$L::boolean = true
         and ne.model_id = %3$L
         and ne.is_active_corpus = true
         and ne.node_type = 'term'
       order by 2 desc
       limit 4
    ),
    matched_terms as (
      select t.node_key, n.title, pg_catalog.max(t.strength) as strength
        from (
          select f.node_key, 1.0 / (1.0 + f.fts_rank) as strength
            from fts_hits f
          union all
          select tv.node_key, tv.sim from term_vec tv where tv.sim >= 0.62
        ) t
        join library_graph.nodes n on n.node_key = t.node_key and n.node_type = 'term'
       group by t.node_key, n.title
       order by strength desc, t.node_key
       limit 4
    ),
    term_candidates as (
      select e.source_key as neighbor_key,
             'DEFINES_TERM'::text as edge_type,
             mt.title as seed_title,
             sl.seed_score,
             0.40 * e.weight as transfer_factor
        from matched_terms mt
        join library_graph.edges e on e.target_key = mt.node_key and e.edge_type = 'DEFINES_TERM'
        join library_graph.nodes dn on dn.node_key = e.source_key
        join seed_laws sl on sl.law_slug = dn.law_slug
       where $8::boolean = true
    ),
    -- Penalty leg: a question about a penalty brings in up to three penalty
    -- articles (closest in meaning first) of each law among the strongest results.
    penalty_intent as (
      select exists (
        select 1 from clean_q cq where cq.q ~ '(عقوب|عاقب|غرام|جزا|سجن|حبس|مخالف)'
      ) as wanted
    ),
    penalty_ranked as (
      select e.source_key as neighbor_key,
             e.weight,
             sl.seed_title,
             sl.seed_score,
             pg_catalog.row_number() over (
               partition by sl.law_slug
               order by
                 case
                   when %2$L::boolean = true and ne.embedding is not null then
                     (ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s))
                   else 2.0
                 end,
                 e.source_key
             ) as rn
        from seed_laws sl
        join library_graph.edges e
          on e.target_key = 'law:' || sl.law_slug and e.edge_type = 'PENALIZES'
        left join library_graph.node_embeddings ne
          on ne.node_key = e.source_key and ne.model_id = %3$L and ne.is_active_corpus = true
       where $8::boolean = true
         and (select pi.wanted from penalty_intent pi)
    ),
    penalty_candidates as (
      select pr.neighbor_key, 'PENALIZES'::text as edge_type, pr.seed_title, pr.seed_score,
             0.45 * pr.weight as transfer_factor
        from penalty_ranked pr
       where pr.rn <= 3
    ),
    hop_candidates as (
      select * from edge_candidates
      union all
      select * from term_candidates
      union all
      select * from penalty_candidates
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
        ) * rf.factor as score,
        hc.edge_type as via_edge_type,
        hc.seed_title as via_from_title,
        1 as hop
      from hop_candidates hc
      join library_graph.nodes n on n.node_key = hc.neighbor_key
      left join library_graph.node_embeddings ne
        on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
      cross join q_route qr
      cross join route_laws rl
      cross join lateral (
        select coalesce(library_graph.route_factor(n.node_key, hc.edge_type, $9::text, qr.section, qr.confident, rl.laws), 1.0) as factor
      ) rf
      where n.node_type in ('article', 'principle', 'decree', 'feqh')
        and rf.factor > 0
        and coalesce(n.doc_status, 'active') <> 'repealed'
        and coalesce(n.item_status, 'active') <> 'repealed'
        and not exists (select 1 from rrf_primary rp where rp.node_key = n.node_key and not rp.routed)
        -- Exceptions, amendments, interpretations, penalties, replacements,
        -- regulations and definitions always pass. Meaning links need vectors
        -- and affinity >= 0.42. Other hops need affinity >= 0.38 when vectors are active.
        and (
          hc.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'PENALIZES', 'REPLACED_BY', 'DEFINES_TERM',
                           'IMPLEMENTED_BY')
          or (
            hc.edge_type = 'SIMILAR_TO'
            and %2$L::boolean = true
            and ne.embedding is not null
            and (1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))) >= 0.42
          )
          or (
            hc.edge_type <> 'SIMILAR_TO'
            and (
              %2$L::boolean = false
              or ne.embedding is null
              or (1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))) >= 0.38
            )
          )
        )
      order by hc.neighbor_key, score desc
    ),
    -- Leg 6: Second Hop — from the six strongest legal-hop results (not the
    -- neighbouring-article, definition or meaning ones), over legal edges only,
    -- at half the transfer. An exception, amendment, interpretation, penalty or
    -- replacement always passes; any other hop needs query affinity (>= 0.38),
    -- and with no vectors it is not taken at all.
    hop2_seeds as (
      select h.node_key, h.score, n.title as seed_title
        from hop_scored h
        join library_graph.nodes n on n.node_key = h.node_key
       where h.via_edge_type not in ('NEXT_ARTICLE', 'DEFINES_TERM', 'SIMILAR_TO')
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
            when 'REPLACED_BY'        then 0.56
            when 'AMENDS_ARTICLE'     then 0.55
            when 'INTERPRETS_ARTICLE' then 0.52
            when 'PENALIZES'          then 0.50
            when 'ESTABLISHES_RULE'   then 0.48
            when 'SUBJECT_TO'         then 0.45
            when 'PARENT_LAW'         then 0.36
            when 'CITES_ARTICLE'      then 0.32
            when 'IMPLEMENTED_BY'     then case when e.target_key = s.node_key then 0.50 else 0.15 end
            else 0.28
          end
        ) as transfer_factor
      from hop2_seeds s
      join library_graph.edges e
        on (e.source_key = s.node_key or e.target_key = s.node_key)
       and e.edge_type in ('EXEMPTS_FROM', 'REPLACED_BY', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'PENALIZES',
                           'ESTABLISHES_RULE', 'SUBJECT_TO', 'PARENT_LAW', 'CITES_ARTICLE', 'IMPLEMENTED_BY')
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
        ) * rf.factor as score,
        hc.edge_type as via_edge_type,
        hc.seed_title as via_from_title,
        2 as hop
      from hop2_candidates hc
      join library_graph.nodes n on n.node_key = hc.neighbor_key
      left join library_graph.node_embeddings ne
        on ne.node_key = n.node_key and ne.model_id = %3$L and ne.is_active_corpus = true
      cross join q_route qr
      cross join route_laws rl
      cross join lateral (
        select coalesce(library_graph.route_factor(n.node_key, hc.edge_type, $9::text, qr.section, qr.confident, rl.laws), 1.0) as factor
      ) rf
      where n.node_type in ('article', 'principle', 'decree', 'feqh')
        and rf.factor > 0
        and coalesce(n.doc_status, 'active') <> 'repealed'
        and coalesce(n.item_status, 'active') <> 'repealed'
        and not exists (select 1 from rrf_primary rp where rp.node_key = n.node_key and not rp.routed)
        and not exists (select 1 from hop_scored h1 where h1.node_key = n.node_key)
        and (
          hc.edge_type in ('EXEMPTS_FROM', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'PENALIZES', 'REPLACED_BY', 'IMPLEMENTED_BY')
          or (
            %2$L::boolean = true
            and ne.embedding is not null
            and (1.0 - ((ne.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) ($2::extensions.halfvec(%1$s)))) >= 0.38
          )
        )
      order by hc.neighbor_key, score desc
    ),
    combined as (
      select rp.node_key, rp.node_type, rp.law_slug, rp.score, rp.via_edge_type, rp.via_from_title, rp.hop
        from rrf_primary rp
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
          'hop',            d.hop,
          'seed',           exists (select 1 from seed_nodes sn where sn.node_key = d.node_key)
        ) as item
      from deduped d
      join library_graph.nodes n on n.node_key = d.node_key
    )
    select pg_catalog.jsonb_build_object(
      'ready',       true,
      'model_id',    %3$L,
      'vector_used', %2$L::boolean,
      'routing', (
        select pg_catalog.jsonb_build_object(
          'scope',     $9::text,
          'section',   qr.section,
          'confident', qr.confident,
          'source',    qr.source,
          'laws',      pg_catalog.to_jsonb(rl.laws),
          'seeds',     (select pg_catalog.count(*) from seed_nodes)
        )
          from q_route qr
          cross join route_laws rl
      ),
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
          coalesce(p_enable_graph_hop, true),
          v_scope,
          p_seed_keys;

  return v_result;
end;
$$;

-- The nine-argument entry point (no seeds, routing 'auto'): code from before
-- this file, and the fallback when graph_rag_retrieve_scoped is missing.
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
begin
  return public.graph_rag_retrieve_scoped(
    p_tsqueries, p_query_embedding, p_model_id, p_law_slug,
    p_limit_laws, p_limit_principles, p_limit_decrees, p_limit_feqh,
    p_enable_graph_hop, 'auto'
  );
end;
$$;

revoke all on function public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[]) from public, anon, authenticated;
grant execute on function public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[]) to service_role;
revoke all on function public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean) to service_role;

-- ── Verify inside the transaction (rolls back on any failure) ───────────────
do $$
declare
  fn      text;
  r       text;
  def     text;
  missing text := '';
begin
  if to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])') is null then
    missing := missing || ' graph_rag_retrieve_scoped(… text[]) missing;';
  else
    def := pg_catalog.pg_get_functiondef('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])'::regprocedure);
    if def not like '%last_synced_at is not null and s.dirty = false%' then
      missing := missing || ' graph_rag_retrieve_scoped lost its readiness check;';
    end if;
    if def not like '%hop2_scored%' or def not like '%term_candidates%penalty_candidates%' then
      missing := missing || ' graph_rag_retrieve_scoped lost a hop / terms / penalty leg;';
    end if;
    if def not like '%route_factor(%q_route%' then
      missing := missing || ' graph_rag_retrieve_scoped does not route;';
    end if;
    if def not like '%seed_nodes%rr.is_seed then 1.0%' then
      missing := missing || ' graph_rag_retrieve_scoped does not keep its seeds;';
    end if;
  end if;
  if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
       not like '%graph_rag_retrieve_scoped(%' then
    missing := missing || ' graph_rag_retrieve does not call graph_rag_retrieve_scoped;';
  end if;

  -- One function per name: a second overload makes PostgREST answer PGRST203.
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'graph_rag_retrieve') <> 1 then
    missing := missing || ' public.graph_rag_retrieve is not exactly one function;';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'graph_rag_retrieve_scoped') <> 1 then
    missing := missing || ' public.graph_rag_retrieve_scoped is not exactly one function;';
  end if;

  foreach fn in array array['public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)', 'public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])'] loop
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
    raise exception '20261117_10 verify:%', missing;
  end if;
  raise notice '20261117_10 verify: OK';
end $$;

notify pgrst, 'reload schema';

commit;

-- ── Final check for the SQL editor (it hides NOTICEs): expect ok = true ─────
select '20261117_10 graph seeds: named articles lead the graph answer' as check,
       coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])'))
           like '%seed_nodes%rr.is_seed then 1.0%', false)
       and (select pg_catalog.count(*) from pg_catalog.pg_proc p
             where p.pronamespace = 'public'::regnamespace and p.proname = 'graph_rag_retrieve_scoped') = 1
       and not has_function_privilege('anon', 'public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])', 'EXECUTE')
       as ok;
