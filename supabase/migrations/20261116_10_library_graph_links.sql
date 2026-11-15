-- =============================================================================
-- Migration: 20261116_10_library_graph_links.sql
-- =============================================================================
-- PURPOSE
--   More kinds of legal links in the graph (the code that ships with this file
--   builds the text-based ones; this file lets the database hold them, builds
--   the vector-based ones, and walks all of them):
--
--   1. Types. The CHECK lists gain:
--        node_type  'term'          one node per defined legal term (a word a
--                                   law's definitions article defines); a term
--                                   defined in two or more documents bridges them
--        edge_type  'SUBJECT_TO'    article → the article it is "subject to"
--                                   («مع مراعاة», «مع عدم الإخلال», «بما لا يتعارض مع»)
--                   'PENALIZES'     penalty article → the article (or, mostly,
--                                   the law node) whose violation it punishes
--                   'DEFINES_TERM'  article → the term it defines
--                   'SIMILAR_TO'    article ↔ article in ANOTHER law, principle ↔
--                                   principle: close in meaning (vectors)
--                   'REPLACED_BY'   repealed article → the closest active article,
--                                   in the law that replaced its law first (vectors)
--        origin     'auto_similarity'  the two vector-built edge types. The
--                                   watchdog's prune never deletes them; they are
--                                   rebuilt per node when its text, its status or
--                                   the thresholds change (library_graph.similarity_state).
--   2. public.graph_rag_build_similarity(model, limit, params): builds the
--      SIMILAR_TO / REPLACED_BY edges for the next `limit` article/principle
--      nodes whose vector is new or changed. service_role only. The watchdog
--      calls it on quiet polls, a page at a time.
--   3. graph_rag_retrieve:
--        - the vector legs never return term nodes (they would crowd articles);
--        - hop 1 also walks SUBJECT_TO, PENALIZES, REPLACED_BY and SIMILAR_TO
--          (SIMILAR_TO only with vectors and query affinity >= 0.42);
--        - a terms leg: a defined term the question matches brings in its
--          definition article, only from the laws of the strongest results;
--        - a penalty leg: a question about a penalty brings in up to three
--          penalty articles of each law among the strongest results;
--        - hop 2 also walks SUBJECT_TO, PENALIZES and REPLACED_BY.
--      Same signature, so the service_role-only grant stays as it is.
--   4. Explorer: similarity and definition links never make a "top hub", sort
--      after legal links, and hop 2 never fans out through a term node.
--   5. The library's own article → regulation link: edge_type 'IMPLEMENTED_BY'
--      (system article → the executive-regulation article that implements it,
--      from article_regulations.ref + reg_num). Walked at 0.50 from the
--      regulation side, 0.15 from the system side (whose node already holds
--      the regulation text).
--   6. Routing by section and judicial track. Retrieve now lives in
--      public.graph_rag_retrieve_scoped(… nine arguments …, p_scope); the
--      nine-argument graph_rag_retrieve calls it with 'auto' (one function per
--      name, so PostgREST never sees an overload). library_graph.route_factor
--      scores each result:
--        - the question's section: the pinned law's section, else a vote of the
--          twelve strongest results (an administrative principle votes '02', a
--          Board of Grievances commercial / criminal circuit votes '04' / '01';
--          '00' procedure and '29' agreements never vote); decided at half the
--          vote weight, confident at two thirds with two votes or more;
--        - articles of another section: x0.88, or x0.7 when confident; the
--          procedural section '00' is never routed away;
--        - Board of Grievances principles: administrative questions; others only
--          when they cite / are governed by a law of the question's strongest
--          articles (dropped when the section is confidently not '02');
--        - ordinary courts: every question except a confidently administrative one;
--        - committees: their governing laws (node metadata) must meet the question's;
--        - a result reached through an explicit legal link (exception, condition,
--          amendment, interpretation, penalty, citation, regulation…) is never
--          routed away, whatever its section;
--        - p_scope 'section' drops everything outside the section (links still
--          cross); 'all' turns routing off. The answer carries a 'routing' object.
--
-- RUN ORDER
--   After 20261115_10 (required). Run this file BEFORE deploying the code that
--   ships with it: that code writes the new node and edge types, which the old
--   CHECK lists reject. After the deploy, mark the graph dirty once:
--     select public.graph_rag_sync_control('mark_dirty_now', '{"reason":"graph_links_20261116"}'::jsonb);
--   The vector links then build by themselves once the graph is settled.
--   To rebuild every vector link from scratch (e.g. after a threshold change
--   the watchdog does not see):  truncate library_graph.similarity_state;
--
-- IDEMPOTENT — CHECK constraints are found by what they check, dropped and
-- re-added; the table is create-if-not-exists; functions are create or replace.
-- =============================================================================

begin;

set local lock_timeout = '10s';

do $$
begin
  if to_regclass('library_graph.nodes') is null
     or to_regprocedure('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)') is null then
    raise exception '20261116_10: apply 20261110_10 first';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'nodes_node_type_check' and c.conrelid = 'library_graph.nodes'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%chapter%') then
    raise exception '20261116_10: apply 20261115_10_library_graph_depth.sql first';
  end if;
end $$;

-- ── 1. Node, edge and origin type lists ─────────────────────────────────────
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
         or
         (c.conrelid = 'library_graph.edges'::regclass
          and pg_catalog.pg_get_constraintdef(c.oid) like '%origin%'
          and pg_catalog.pg_get_constraintdef(c.oid) like '%owner_curated%')
       )
  loop
    execute pg_catalog.format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end $$;

alter table library_graph.nodes
  add constraint nodes_node_type_check
  check (node_type in ('article', 'principle', 'decree', 'feqh', 'concept', 'law', 'chapter', 'term'));

alter table library_graph.node_embeddings
  add constraint node_embeddings_node_type_check
  check (node_type in ('article', 'principle', 'decree', 'feqh', 'concept', 'law', 'chapter', 'term'));

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
      'NEXT_ARTICLE',
      'SUBJECT_TO',
      'PENALIZES',
      'DEFINES_TERM',
      'SIMILAR_TO',
      'REPLACED_BY',
      'IMPLEMENTED_BY'
    )
  );

alter table library_graph.edges
  add constraint edges_origin_check
  check (origin in ('auto_watchdog', 'owner_curated', 'auto_similarity'));

-- ── 2. Vector links: per-node state + builder ───────────────────────────────
create table if not exists library_graph.similarity_state (
  node_key       text primary key references library_graph.nodes(node_key) on delete cascade,
  model_id       text not null,
  content_sha256 text not null,
  params_key     text not null,
  was_active     boolean not null,
  computed_at    timestamptz not null default now()
);

alter table library_graph.similarity_state enable row level security;
alter table library_graph.similarity_state force row level security;
revoke all on table library_graph.similarity_state from public, anon, authenticated;
grant select, insert, update, delete on table library_graph.similarity_state to service_role;
drop policy if exists lg_service_role_all on library_graph.similarity_state;
create policy lg_service_role_all on library_graph.similarity_state
  for all to service_role using (true) with check (true);

create or replace function public.graph_rag_build_similarity(
  p_model_id text    default null,
  p_limit    integer default 150,
  p_params   jsonb   default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_model      text;
  v_dims       integer;
  v_lim        integer := least(greatest(coalesce(p_limit, 150), 1), 500);
  v_params     jsonb   := coalesce(p_params, '{}'::jsonb);
  v_art_min    double precision := 0.80;
  v_pr_min     double precision := 0.85;
  v_succ_min   double precision := 0.80;
  v_any_min    double precision := 0.90;
  v_params_key text;
  v_keys       text[];
  v_similar    integer := 0;
  v_replaced   integer := 0;
  v_missing    bigint;
  v_total      bigint;
  v_vec_ver    text;
begin
  select m.model_id, m.dimensions into v_model, v_dims
    from library_graph.embedding_models m
   where (p_model_id is not null and m.model_id = p_model_id)
      or (p_model_id is null and m.is_default = true)
   limit 1;
  if v_model is null then
    raise exception 'graph_rag_build_similarity: unknown embedding model_id: %', coalesce(p_model_id, 'NULL');
  end if;

  -- Only on a settled graph: during a pass, nodes and vectors are half-written.
  if not exists (select 1 from library_graph.sync_state s
                  where s.id = 1 and s.dirty = false and s.last_synced_at is not null) then
    return pg_catalog.jsonb_build_object('processed', 0, 'similar', 0, 'replaced', 0, 'skipped', 'graph_not_ready');
  end if;

  -- Thresholds: a value is used only when it is a number strictly between 0 and 1.
  if pg_catalog.jsonb_typeof(v_params->'article_min') = 'number'
     and (v_params->>'article_min')::double precision > 0 and (v_params->>'article_min')::double precision < 1 then
    v_art_min := (v_params->>'article_min')::double precision;
  end if;
  if pg_catalog.jsonb_typeof(v_params->'principle_min') = 'number'
     and (v_params->>'principle_min')::double precision > 0 and (v_params->>'principle_min')::double precision < 1 then
    v_pr_min := (v_params->>'principle_min')::double precision;
  end if;
  if pg_catalog.jsonb_typeof(v_params->'replaced_successor_min') = 'number'
     and (v_params->>'replaced_successor_min')::double precision > 0 and (v_params->>'replaced_successor_min')::double precision < 1 then
    v_succ_min := (v_params->>'replaced_successor_min')::double precision;
  end if;
  if pg_catalog.jsonb_typeof(v_params->'replaced_any_min') = 'number'
     and (v_params->>'replaced_any_min')::double precision > 0 and (v_params->>'replaced_any_min')::double precision < 1 then
    v_any_min := (v_params->>'replaced_any_min')::double precision;
  end if;
  v_params_key := pg_catalog.format('v2;a=%s;p=%s;s=%s;r=%s', v_art_min, v_pr_min, v_succ_min, v_any_min);

  -- The next page: article / principle nodes with a vector and no up-to-date state.
  select pg_catalog.array_agg(b.node_key order by b.node_key) into v_keys
    from (
      select ne.node_key
        from library_graph.node_embeddings ne
        join library_graph.nodes n on n.node_key = ne.node_key
        left join library_graph.similarity_state s on s.node_key = ne.node_key
       where ne.model_id = v_model
         and n.node_type in ('article', 'principle')
         and n.is_page_numbered = false
         and (s.node_key is null
              or s.model_id <> v_model
              or s.content_sha256 <> n.content_sha256
              or s.params_key <> v_params_key
              or s.was_active <> ne.is_active_corpus)
       order by ne.node_key
       limit v_lim
    ) b;

  if v_keys is null then
    return pg_catalog.jsonb_build_object('processed', 0, 'similar', 0, 'replaced', 0);
  end if;

  -- Only once (nearly) every article and principle has its vector. A node's
  -- links are stamped current when computed and not revisited when other
  -- vectors arrive later: a repealed article processed before its successor
  -- law is embedded would keep a worse REPLACED_BY, or none. Up to 0.5 percent
  -- may still be missing (a text the embedding service keeps refusing).
  select pg_catalog.count(*) filter (where e.node_key is null), pg_catalog.count(*)
    into v_missing, v_total
    from library_graph.nodes n
    left join library_graph.node_embeddings e on e.node_key = n.node_key and e.model_id = v_model
   where n.node_type in ('article', 'principle')
     and n.is_embeddable = true;
  if v_missing * 200 > v_total then
    return pg_catalog.jsonb_build_object('processed', 0, 'similar', 0, 'replaced', 0,
                                         'skipped', 'vectors_incomplete', 'missing', v_missing);
  end if;

  delete from library_graph.edges e
   where e.origin = 'auto_similarity'
     and e.source_key = any(v_keys);

  -- The neighbour scans filter by type and law / collection INSIDE the index
  -- scan. HNSW alone returns at most ef_search rows before that filter, and the
  -- nearest rows of a large law or collection are mostly its own (57 percent of
  -- random same-collection principle pairs pass 0.85), which would leave
  -- nothing. pgvector 0.8+ keeps scanning until the filter is met (iterative
  -- scan, bounded by max_scan_tuples); older versions keep the ef_search cap.
  perform pg_catalog.set_config('hnsw.ef_search', '120', true);
  select x.extversion into v_vec_ver from pg_catalog.pg_extension x where x.extname = 'vector';
  if v_vec_ver ~ '^[0-9]+\.[0-9]+'
     and (pg_catalog.split_part(v_vec_ver, '.', 1)::integer > 0
          or pg_catalog.split_part(v_vec_ver, '.', 2)::integer >= 8) then
    perform pg_catalog.set_config('hnsw.iterative_scan', 'relaxed_order', true);
    perform pg_catalog.set_config('hnsw.max_scan_tuples', '5000', true);
  end if;

  -- SIMILAR_TO: up to three neighbours per active node. An article links only to
  -- articles of OTHER laws (its own law is already linked by structure), one per
  -- law; a principle links to principles of OTHER collections, one per collection
  -- (inside one collection the shared header alone puts most pairs above 0.85:
  -- measured 2026-11-16, 57 percent of random same-collection pairs vs none across
  -- collections). A near-copy (>= 0.985) adds nothing.
  execute pg_catalog.format($q$
    with
    batch as (
      select n.node_key, n.node_type, n.law_slug, n.collection_id, ne.embedding
        from pg_catalog.unnest($1::text[]) as k(node_key)
        join library_graph.nodes n on n.node_key = k.node_key
        join library_graph.node_embeddings ne on ne.node_key = n.node_key and ne.model_id = %2$L
       where ne.is_active_corpus = true
    ),
    nearest as (
      select b.node_key as source_key, b.node_type as source_type, b.law_slug as source_law,
             b.collection_id as source_collection,
             c.node_key as target_key, c.sim
        from batch b
        cross join lateral (
          select ne2.node_key,
                 1.0 - ((ne2.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) (b.embedding::extensions.halfvec(%1$s))) as sim
            from library_graph.node_embeddings ne2
            join library_graph.nodes n3 on n3.node_key = ne2.node_key
           where ne2.model_id = %2$L
             and ne2.is_active_corpus = true
             and ne2.node_key <> b.node_key
             and n3.node_type = b.node_type
             and n3.is_page_numbered = false
             and case when b.node_type = 'article' then n3.law_slug is distinct from b.law_slug
                      else n3.collection_id is distinct from b.collection_id end
           order by (ne2.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) (b.embedding::extensions.halfvec(%1$s))
           limit 30
        ) c
    ),
    filtered as (
      select x.source_key, x.source_type, x.target_key, x.sim,
             case when x.source_type = 'article' then n2.law_slug else n2.collection_id end as target_group
        from nearest x
        join library_graph.nodes n2 on n2.node_key = x.target_key
       where n2.node_type = x.source_type
         and n2.is_page_numbered = false
         and x.sim < 0.985
         and (
           (x.source_type = 'article' and x.sim >= $2 and n2.law_slug is distinct from x.source_law)
           or (x.source_type = 'principle' and x.sim >= $3 and n2.collection_id is distinct from x.source_collection)
         )
    ),
    one_per_law as (
      select f.*,
             pg_catalog.row_number() over (
               partition by f.source_key, f.target_group
               order by f.sim desc, f.target_key
             ) as law_rank
        from filtered f
    ),
    ranked as (
      select o.source_key, o.target_key, o.sim,
             pg_catalog.row_number() over (partition by o.source_key order by o.sim desc, o.target_key) as rnk
        from one_per_law o
       where o.law_rank = 1
    ),
    kept as (
      select r.* from ranked r where r.rnk <= 3
    )
    insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence, metadata, updated_at)
    select k.source_key, k.target_key, 'SIMILAR_TO', 'auto_similarity', k.sim::real,
           'تقارب في المعنى: ' || pg_catalog.round(k.sim::numeric, 3)::text,
           pg_catalog.jsonb_build_object('sim', pg_catalog.round(k.sim::numeric, 4), 'params', $4::text),
           now()
      from kept k
     -- one edge per pair: skip when the other direction already exists or is
     -- being written in this same page
     where not exists (select 1 from library_graph.edges e2
                        where e2.source_key = k.target_key and e2.target_key = k.source_key
                          and e2.edge_type = 'SIMILAR_TO')
       and not (k.source_key > k.target_key
                and exists (select 1 from kept k2
                             where k2.source_key = k.target_key and k2.target_key = k.source_key))
    on conflict (source_key, target_key, edge_type) do nothing
  $q$, v_dims, v_model)
  using v_keys, v_art_min, v_pr_min, v_params_key;
  get diagnostics v_similar = row_count;

  -- REPLACED_BY: a repealed article → the closest active article, first among
  -- the articles of the laws that replaced its law (SUPERSEDES_LAW, exact scan),
  -- else anywhere (HNSW) at a stricter threshold. At most one per article.
  execute pg_catalog.format($q$
    with
    batch as (
      select n.node_key, n.law_slug, ne.embedding
        from pg_catalog.unnest($1::text[]) as k(node_key)
        join library_graph.nodes n on n.node_key = k.node_key and n.node_type = 'article'
        join library_graph.node_embeddings ne on ne.node_key = n.node_key and ne.model_id = %2$L
       where ne.is_active_corpus = false
    ),
    successor_laws as (
      select distinct b.node_key, sn.law_slug as succ_law
        from batch b
        join library_graph.edges e on e.edge_type = 'SUPERSEDES_LAW'
        join library_graph.nodes tn on tn.node_key = e.target_key and tn.law_slug = b.law_slug
        join library_graph.nodes sn on sn.node_key = e.source_key
       where sn.law_slug is not null
         and sn.law_slug <> b.law_slug
    ),
    by_successor as (
      select b.node_key as source_key, c.node_key as target_key, c.sim, 'successor_law'::text as method
        from batch b
        cross join lateral (
          select n2.node_key,
                 1.0 - ((ne2.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) (b.embedding::extensions.halfvec(%1$s))) as sim
            from successor_laws sl
            join library_graph.nodes n2
              on n2.law_slug = sl.succ_law and n2.node_type = 'article' and n2.is_page_numbered = false
            join library_graph.node_embeddings ne2
              on ne2.node_key = n2.node_key and ne2.model_id = %2$L and ne2.is_active_corpus = true
           where sl.node_key = b.node_key
           order by 2 desc
           limit 1
        ) c
       where c.sim >= $2
    ),
    by_nearest as (
      select b.node_key as source_key, c.node_key as target_key, c.sim, 'nearest_active'::text as method
        from batch b
        cross join lateral (
          select ne2.node_key,
                 1.0 - ((ne2.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) (b.embedding::extensions.halfvec(%1$s))) as sim
            from library_graph.node_embeddings ne2
            join library_graph.nodes n3
              on n3.node_key = ne2.node_key and n3.node_type = 'article' and n3.is_page_numbered = false
           where ne2.model_id = %2$L
             and ne2.is_active_corpus = true
           order by (ne2.embedding::extensions.halfvec(%1$s)) OPERATOR(extensions.<=>) (b.embedding::extensions.halfvec(%1$s))
           limit 10
        ) c
       where c.sim >= $3
         and c.sim < 0.995
    ),
    best as (
      select distinct on (u.source_key) u.source_key, u.target_key, u.sim, u.method
        from (select * from by_successor union all select * from by_nearest) u
       order by u.source_key, (u.method = 'successor_law') desc, u.sim desc, u.target_key
    )
    insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence, metadata, updated_at)
    select b.source_key, b.target_key, 'REPLACED_BY', 'auto_similarity', b.sim::real,
           case b.method
             when 'successor_law' then 'أقرب مادة في النظام الذي حلّ محله: '
             else 'أقرب مادة سارية في المعنى: '
           end || pg_catalog.round(b.sim::numeric, 3)::text,
           pg_catalog.jsonb_build_object('sim', pg_catalog.round(b.sim::numeric, 4), 'method', b.method, 'params', $4::text),
           now()
      from best b
    on conflict (source_key, target_key, edge_type) do nothing
  $q$, v_dims, v_model)
  using v_keys, v_succ_min, v_any_min, v_params_key;
  get diagnostics v_replaced = row_count;

  insert into library_graph.similarity_state (node_key, model_id, content_sha256, params_key, was_active, computed_at)
  select n.node_key, v_model, n.content_sha256, v_params_key, ne.is_active_corpus, now()
    from pg_catalog.unnest(v_keys) as k(node_key)
    join library_graph.nodes n on n.node_key = k.node_key
    join library_graph.node_embeddings ne on ne.node_key = n.node_key and ne.model_id = v_model
  on conflict (node_key) do update set
    model_id       = excluded.model_id,
    content_sha256 = excluded.content_sha256,
    params_key     = excluded.params_key,
    was_active     = excluded.was_active,
    computed_at    = excluded.computed_at;

  return pg_catalog.jsonb_build_object(
    'processed', pg_catalog.cardinality(v_keys),
    'similar',   v_similar,
    'replaced',  v_replaced
  );
end;
$$;

revoke all on function public.graph_rag_build_similarity(text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.graph_rag_build_similarity(text, integer, jsonb) to service_role;

-- ── 3a. Routing factor ──────────────────────────────────────────────────────
-- 1 = keep as scored, 0 = drop, in between = lower. NULL (unknown node) counts as 1.
create or replace function library_graph.route_factor(
  p_node_key  text,
  p_via       text,     -- the link a hop arrived by; null for a direct result
  p_scope     text,     -- 'auto' | 'section' | 'all'
  p_q_section text,     -- the question's section, or null
  p_confident boolean,
  p_laws      text[]    -- the laws of the question's strongest in-section articles
)
returns double precision
language sql
stable
parallel safe
security invoker
set search_path = ''
as $f$
  select case
    when p_scope = 'all' then 1.0
    -- An explicit legal link is followed across sections.
    when p_via in ('EXEMPTS_FROM', 'SUBJECT_TO', 'AMENDS_ARTICLE', 'INTERPRETS_ARTICLE', 'PENALIZES',
                   'REPLACED_BY', 'IMPLEMENTED_BY', 'PARENT_LAW', 'SUPERSEDES_LAW', 'CITES_ARTICLE',
                   'ESTABLISHES_RULE') then 1.0
    when n.node_type = 'article' then
      case
        when p_q_section is null or s.section is null or s.section in ('00', p_q_section) then 1.0
        when p_scope = 'section' then 0.0
        when p_confident then 0.7
        else 0.88
      end
    when n.node_type = 'principle' then
      case
        -- Governed by (committee / learned) or citing a law of the question's articles.
        when coalesce(n.metadata -> 'governing_laws', '[]'::jsonb) ?| coalesce(p_laws, '{}'::text[])
          or exists (
               select 1
                 from library_graph.edges ie
                 join library_graph.nodes an on an.node_key = ie.target_key
                where ie.source_key = n.node_key
                  and ie.edge_type = 'INTERPRETS_ARTICLE'
                  and an.law_slug = any (p_laws)
             ) then 1.0
        -- A Board of Grievances commercial / criminal circuit: judged by its subject.
        when n.metadata ->> 'track_class' = 'admin' and n.metadata ->> 'subject_section' is not null then
          case
            when p_q_section is null or n.metadata ->> 'subject_section' = p_q_section then 1.0
            when p_scope = 'section' then 0.0
            when p_confident then 0.7
            else 0.88
          end
        when n.metadata ->> 'track_class' = 'admin' then
          case
            when p_q_section = '02' then 1.0
            when p_q_section is null then 0.85
            when p_confident or p_scope = 'section' then 0.0
            else 0.6
          end
        when n.metadata ->> 'track_class' = 'ordinary' then
          case
            when p_q_section is distinct from '02' then 1.0
            when p_confident or p_scope = 'section' then 0.0
            else 0.7
          end
        when n.metadata ->> 'track_class' = 'semi' then
          case
            when coalesce(pg_catalog.cardinality(p_laws), 0) = 0 then 0.8
            when p_scope = 'section' then 0.0
            when n.metadata ? 'committee_families' then case when p_confident then 0.0 else 0.5 end
            else 0.8
          end
        else 1.0
      end
    else 1.0
  end
  from library_graph.nodes n
  left join lateral (
    select ln.metadata ->> 'section_code' as section
      from library_graph.nodes ln
     where ln.node_key = 'law:' || n.law_slug
  ) s on true
  where n.node_key = p_node_key
$f$;

revoke all on function library_graph.route_factor(text, text, text, text, boolean, text[]) from public, anon, authenticated;
grant execute on function library_graph.route_factor(text, text, text, text, boolean, text[]) to service_role;

-- ── 3. Retrieve: new link types, terms leg, penalty leg, routing ────────────
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
  p_scope            text    default 'auto'
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
    -- Leg 4: Reciprocal Rank Fusion (RRF) over Primary Candidates
    candidate_keys as (
      select node_key from fts_hits
      union
      select node_key from vec_hits where sim >= 0.42
      union
      select node_key from concept_targets
    ),
    rrf_raw as materialized (
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
          select coalesce(library_graph.route_factor(rr.node_key, null, $9::text, qr.section, qr.confident, rl.laws), 1.0) as factor
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
          'hop',            d.hop
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
          'laws',      pg_catalog.to_jsonb(rl.laws)
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
          v_scope;

  return v_result;
end;
$$;

-- The nine-argument entry point the AI tools call: routing on ('auto').
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

revoke all on function public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text) from public, anon, authenticated;
grant execute on function public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text) to service_role;
revoke all on function public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean) from public, anon, authenticated;
grant execute on function public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean) to service_role;

-- ── 4. Explorer overview: similarity / definition links never make a hub ────
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
              select e.source_key as node_key from library_graph.edges e
               where e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE', 'DEFINES_TERM', 'SIMILAR_TO', 'PENALIZES')
              union all
              select e.target_key from library_graph.edges e
               where e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE', 'DEFINES_TERM', 'SIMILAR_TO', 'PENALIZES')
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

-- ── 5. Explorer neighbourhood: meaning / definition links last, hop 2 skips terms
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
     order by (e.edge_type in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE', 'DEFINES_TERM', 'SIMILAR_TO')),
              e.weight desc, e.edge_type, other
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
          join library_graph.nodes kn on kn.node_key = k.node_key and kn.node_type not in ('concept', 'law', 'chapter', 'term')
          join library_graph.edges e on e.source_key = k.node_key
         where v_depth = 2
           and e.target_key <> p_node_key
           and e.edge_type not in ('HAS_CONCEPT', 'PART_OF', 'NEXT_ARTICLE')
           and (v_all or e.edge_type = any(p_edge_types))
           -- meaning / definition links fan out only when asked for by name
           and (e.edge_type not in ('DEFINES_TERM', 'SIMILAR_TO') or not v_all)
        union
        select e.source_key, e.target_key, e.edge_type, e.origin, e.weight, e.evidence
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
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint c
       where c.contype = 'c'
         and c.conrelid = 'library_graph.edges'::regclass
         and pg_catalog.pg_get_constraintdef(c.oid) like '%origin%') <> 1 then
    missing := missing || ' origin must have exactly one CHECK;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'nodes_node_type_check' and c.conrelid = 'library_graph.nodes'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%''term''%') then
    missing := missing || ' nodes does not accept term;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'node_embeddings_node_type_check' and c.conrelid = 'library_graph.node_embeddings'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%''term''%') then
    missing := missing || ' node_embeddings does not accept term;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'edges_edge_type_check' and c.conrelid = 'library_graph.edges'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%REPLACED_BY%'
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%SUBJECT_TO%'
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%DEFINES_TERM%'
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%IMPLEMENTED_BY%') then
    missing := missing || ' edges does not accept the new link types;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conname = 'edges_origin_check' and c.conrelid = 'library_graph.edges'::regclass
                    and pg_catalog.pg_get_constraintdef(c.oid) like '%auto_similarity%') then
    missing := missing || ' edges does not accept origin auto_similarity;';
  end if;
  if to_regclass('library_graph.similarity_state') is null then
    missing := missing || ' library_graph.similarity_state missing;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r)
       and has_table_privilege(r, 'library_graph.similarity_state', 'SELECT') then
      missing := missing || format(' %s can read similarity_state;', r);
    end if;
  end loop;

  if to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)') is null
     or to_regprocedure('library_graph.route_factor(text, text, text, text, boolean, text[])') is null then
    missing := missing || ' graph_rag_retrieve_scoped / route_factor missing;';
  elsif pg_catalog.pg_get_functiondef('public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)'::regprocedure)
       not like '%graph_rag_retrieve_scoped(%' then
    missing := missing || ' graph_rag_retrieve does not call graph_rag_retrieve_scoped;';
  else
    if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)'::regprocedure)
         not like '%last_synced_at is not null and s.dirty = false%' then
      missing := missing || ' graph_rag_retrieve_scoped lost its readiness check;';
    end if;
    if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)'::regprocedure)
         not like '%hop2_scored%' then
      missing := missing || ' graph_rag_retrieve_scoped has no second hop;';
    end if;
    if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)'::regprocedure)
         not like '%term_candidates%penalty_candidates%' then
      missing := missing || ' graph_rag_retrieve_scoped has no terms / penalty legs;';
    end if;
    if pg_catalog.pg_get_functiondef('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)'::regprocedure)
         not like '%route_factor(%q_route%' then
      missing := missing || ' graph_rag_retrieve_scoped does not route;';
    end if;
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'library_graph'::regnamespace)
       and p.proname like 'graph_rag_%'
       and (p.prosrc like '%halfvec_dims(%' or p.prosrc like '%pg_catalog.greatest(%' or p.prosrc like '%pg_catalog.least(%')
  ) then
    missing := missing || ' a graph function calls halfvec_dims() or pg_catalog.greatest/least();';
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

  foreach fn in array array[
    'public.graph_rag_retrieve(text[], text, text, text, integer, integer, integer, integer, boolean)',
    'public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)',
    'library_graph.route_factor(text, text, text, text, boolean, text[])',
    'public.graph_rag_explore_overview()',
    'public.graph_rag_explore_neighborhood(text, integer, text[], integer)',
    'public.graph_rag_build_similarity(text, integer, jsonb)'
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
    raise exception '20261116_10 verify:%', missing;
  end if;
  raise notice '20261116_10 verify: OK';
end $$;

notify pgrst, 'reload schema';

commit;

-- ── Final check for the SQL editor (it hides NOTICEs): expect ok = true ─────
select '20261116_10 graph links: terms, SUBJECT_TO/PENALIZES/DEFINES_TERM/IMPLEMENTED_BY, vector SIMILAR_TO/REPLACED_BY, section routing' as check,
       exists (select 1 from pg_catalog.pg_constraint c
                where c.conname = 'nodes_node_type_check' and c.conrelid = 'library_graph.nodes'::regclass
                  and pg_catalog.pg_get_constraintdef(c.oid) like '%''term''%')
       and exists (select 1 from pg_catalog.pg_constraint c
                    where c.conname = 'edges_edge_type_check' and c.conrelid = 'library_graph.edges'::regclass
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%REPLACED_BY%'
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%IMPLEMENTED_BY%')
       and exists (select 1 from pg_catalog.pg_constraint c
                    where c.conname = 'edges_origin_check' and c.conrelid = 'library_graph.edges'::regclass
                      and pg_catalog.pg_get_constraintdef(c.oid) like '%auto_similarity%')
       and to_regclass('library_graph.similarity_state') is not null
       and to_regprocedure('public.graph_rag_build_similarity(text, integer, jsonb)') is not null
       and to_regprocedure('library_graph.route_factor(text, text, text, text, boolean, text[])') is not null
       and coalesce(pg_catalog.pg_get_functiondef(to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)'))
           like '%penalty_candidates%route_factor(%', false)
       as ok;
