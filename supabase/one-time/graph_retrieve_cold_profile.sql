-- =============================================================================
-- graph_retrieve_cold_profile.sql — READ-ONLY. Where does the graph search
-- spend its reads? (step 2 of the 2026-11-16 GraphRAG plan)
-- =============================================================================
-- The AI's graph search is fast only while its data sits in memory (the
-- hourly prewarm). Before making any part of it lighter we measure which part
-- touches the most pages: a part that touches many pages is slow when they
-- are not in memory (after a restart, or when other work pushed them out).
--
-- WHAT IT DOES (nothing is written; it runs in a READ ONLY transaction and
-- ends with ROLLBACK):
--   1. sizes of the graph's tables and indexes (what has to fit in memory);
--   2. since the last statistics reset: pages each graph table / index read
--      from disk versus found in memory (the real-life cold reads);
--   3. EXPLAIN (ANALYZE, BUFFERS) of the search's parts, pulled out as plain
--      SQL with one real question's search strings and a real vector:
--        A. the keyword (full-text) part,
--        B. the vector part (whole library),
--        C. the whole search function (A + B + links + hops), for the total;
--      C minus A minus B is roughly what the links and hops cost.
--
-- HOW TO RUN (server, /www/wwwroot/nzamy/latest-nzamy-full). Without
-- ON_ERROR_STOP on purpose, and with ON_ERROR_ROLLBACK (set below): a part
-- that fails (a 4 s limit, say) is reported and the other parts still run.
-- The output is screen text, saved to a file by the redirect:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < supabase/one-time/graph_retrieve_cold_profile.sql > /root/graph-cold-profile.txt 2>&1
--   cut -c1-400 /root/graph-cold-profile.txt
-- Then send the whole of /root/graph-cold-profile.txt to the team.
--
-- Run it twice if you can: once a few minutes after the hourly prewarm (:17),
-- and once long after it (or after a database restart). The difference
-- between the two is the cold cost.
-- =============================================================================

\pset pager off
\set ON_ERROR_ROLLBACK on
\timing on

begin transaction read only;
set local statement_timeout = '60s';

\echo '== 0. model and a real query vector (the embedding of an article about wrongful dismissal) =='
select m.model_id as model, m.dimensions as dims
  from library_graph.embedding_models m
 where m.is_default = true
 limit 1 \gset

select :'model' as model, :dims as dims;

-- An article about wrongful dismissal; any article's vector if none matches.
select v.qvec from (
  (select ne.embedding::text as qvec, 1 as pick
     from library_graph.node_embeddings ne
     join library_graph.nodes n on n.node_key = ne.node_key
    where ne.model_id = :'model'
      and ne.is_active_corpus = true
      and n.node_type = 'article'
      and n.fts @@ pg_catalog.to_tsquery('simple'::regconfig,
            $q$(('الفصل' | 'والفصل' | 'بالفصل' | 'للفصل') & ('التعسفي' | 'والتعسفي' | 'بالتعسفي' | 'للتعسفي' | 'التعسفى'))$q$)
    limit 1)
  union all
  (select ne.embedding::text, 2
     from library_graph.node_embeddings ne
    where ne.model_id = :'model' and ne.is_active_corpus = true
    limit 1)
) v
order by v.pick
limit 1 \gset

select pg_catalog.length(:'qvec') as qvec_chars;

\echo '== 1. sizes: what has to be in memory =='
select c.relname,
       case c.relkind when 'r' then 'table' when 'i' then 'index' when 't' then 'toast' else c.relkind::text end as kind,
       pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(c.oid)) as size
  from pg_catalog.pg_class c
 where (c.relnamespace = 'library_graph'::regnamespace
        or c.oid in (select t.reltoastrelid from pg_catalog.pg_class t
                      where t.relnamespace = 'library_graph'::regnamespace and t.reltoastrelid <> 0))
   and c.relkind in ('r', 'i', 't')
 order by pg_catalog.pg_relation_size(c.oid) desc
 limit 20;

select pg_catalog.current_setting('shared_buffers') as shared_buffers,
       pg_catalog.current_setting('effective_cache_size') as effective_cache_size;

\echo '== 2. real-life reads since the last statistics reset: from disk (read) vs in memory (hit) =='
select s.relname,
       s.heap_blks_read, s.heap_blks_hit,
       s.idx_blks_read, s.idx_blks_hit,
       s.toast_blks_read, s.toast_blks_hit
  from pg_catalog.pg_statio_user_tables s
 where s.schemaname = 'library_graph'
 order by coalesce(s.heap_blks_read, 0) + coalesce(s.idx_blks_read, 0) + coalesce(s.toast_blks_read, 0) desc;

select s.indexrelname, s.idx_blks_read, s.idx_blks_hit
  from pg_catalog.pg_statio_user_indexes s
 where s.schemaname = 'library_graph'
 order by s.idx_blks_read desc
 limit 12;

select d.stats_reset from pg_catalog.pg_stat_database d where d.datname = pg_catalog.current_database();

\echo '== A. the keyword (full-text) part, three search strings as the AI writes them =='
explain (analyze, buffers, costs off)
with clean_q as (
  select q, ord::integer
    from pg_catalog.unnest(array[
      $q$(('الفصل' | 'والفصل' | 'بالفصل' | 'للفصل') & ('التعسفي' | 'والتعسفي' | 'بالتعسفي' | 'للتعسفي' | 'التعسفى'))$q$,
      $q$((('مكافأة' | 'المكافأة' | 'والمكافأة' | 'مكافأه') & ('نهاية' | 'النهاية' | 'نهايه')) & ('الخدمة' | 'والخدمة' | 'الخدمه'))$q$,
      $q$(('العامل' | 'والعامل' | 'بالعامل' | 'للعامل'))$q$
    ]) with ordinality as t(q, ord)
),
fts_raw as materialized (
  select n.node_key, n.node_type,
         pg_catalog.row_number() over (
           partition by cq.ord, n.node_type
           order by pg_catalog.ts_rank_cd(n.fts, pg_catalog.to_tsquery('simple'::regconfig, cq.q), 1) desc, n.node_key
         ) as rnk
    from clean_q cq
    join lateral (
      select cand.node_key, cand.node_type, cand.fts
        from library_graph.nodes cand
       where cand.fts @@ pg_catalog.to_tsquery('simple'::regconfig, cq.q)
       limit 1500
    ) n on true
)
select pg_catalog.count(*) filter (where rnk <= 40) as kept, pg_catalog.count(*) as candidates from fts_raw;

\echo '== B. the vector part (whole library, the search asks for 65) =='
select pg_catalog.set_config('hnsw.ef_search', '100', true);
explain (analyze, buffers, costs off)
select ne.node_key
  from library_graph.node_embeddings ne
 where ne.model_id = :'model'
   and ne.is_active_corpus = true
   and ne.node_type in ('article', 'principle', 'decree', 'feqh', 'concept')
 order by (ne.embedding::extensions.halfvec(:dims)) OPERATOR(extensions.<=>) (:'qvec'::extensions.halfvec(:dims)) asc
 limit 65;

\echo '== C. the whole search function, as the AI calls it (total time and pages) =='
explain (analyze, buffers, costs off)
select public.graph_rag_retrieve(
  array[
    $q$(('الفصل' | 'والفصل' | 'بالفصل' | 'للفصل') & ('التعسفي' | 'والتعسفي' | 'بالتعسفي' | 'للتعسفي' | 'التعسفى'))$q$,
    $q$((('مكافأة' | 'المكافأة' | 'والمكافأة' | 'مكافأه') & ('نهاية' | 'النهاية' | 'نهايه')) & ('الخدمة' | 'والخدمة' | 'الخدمه'))$q$,
    $q$(('العامل' | 'والعامل' | 'بالعامل' | 'للعامل'))$q$
  ],
  :'qvec', :'model', null, 10, 4, 0, 0, true
);

rollback;

\echo '== done: nothing was written =='
