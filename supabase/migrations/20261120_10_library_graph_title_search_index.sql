-- =============================================================================
-- Migration: 20261120_10_library_graph_title_search_index.sql
-- =============================================================================
-- PURPOSE
--   The admin graph explorer's search box (public.graph_rag_explore_search,
--   20261113_10) timed out on prod (57014, its own 8 s limit). Measured on prod
--   2026-11-15 (364k+ nodes, warm cache):
--     · the title "contains" leg
--         library_graph.fold_tashkeel(title) ilike '%…%'
--       had no index and read every node: 4.36 s for a rare phrase
--       («الفصل التعسفي», 1 row), 1.67 s for a common one («نظام العمل»);
--     · the full-text leg (idx_lg_nodes_fts) took 0.1 s and 0.7 ms.
--   One search ran past 8 s on its own; a few typed in a row piled up.
--
--   This file adds ONE trigram index on exactly the expression the search
--   filters on, so the "contains" leg reads matching rows only. No function
--   changes, no data changes.
--
-- PRECONDITIONS
--   · 20261110_10 (library_graph.nodes, library_graph.fold_tashkeel).
--   · pg_trgm (installed in `extensions` by 20261030_62; created here if
--     missing). Arabic trigrams need a non-C LC_CTYPE: prod is en_US.UTF-8
--     and show_trgm('نظام العمل') returned 11 trigrams (2026-11-15).
--
-- COST
--   Built once (seconds at prod size; writes to library_graph.nodes wait
--   while it builds, reads do not). The graph watchdog rewrites only nodes
--   whose content changed (20261114_10), so it maintains the index for those
--   rows only.
--
-- RUN ORDER
--   Any time, before or after the code deploy. No rebuild needed.
--
-- ROLLBACK
--   drop index if exists library_graph.idx_lg_nodes_title_fold_trgm;
-- =============================================================================

begin;

set local statement_timeout = '10min';

do $$
begin
  if to_regclass('library_graph.nodes') is null
     or to_regprocedure('library_graph.fold_tashkeel(text)') is null then
    raise exception '20261120_10: apply 20261110_10_library_graph_rag.sql first';
  end if;
end $$;

create extension if not exists pg_trgm with schema extensions;

do $$
begin
  if (select pg_catalog.cardinality(extensions.show_trgm('نظام'))) = 0 then
    raise exception '20261120_10: pg_trgm makes no Arabic trigrams on this database (LC_CTYPE C?); the index would not help';
  end if;
end $$;

create index if not exists idx_lg_nodes_title_fold_trgm
  on library_graph.nodes
  using gin (library_graph.fold_tashkeel(title) extensions.gin_trgm_ops);

analyze library_graph.nodes;

do $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_indexdef(i.indexrelid) into v_def
    from pg_catalog.pg_index i
   where i.indexrelid = to_regclass('library_graph.idx_lg_nodes_title_fold_trgm')
     and i.indisvalid;
  if v_def is null
     or v_def not like '%fold_tashkeel(title)%'
     or v_def not like '%gin_trgm_ops%' then
    raise exception '20261120_10 verify: index missing, invalid or on another expression (%)', coalesce(v_def, 'none');
  end if;
  raise notice '20261120_10 verify: OK';
end $$;

commit;

select '20261120_10 graph title search index' as step,
       to_regclass('library_graph.idx_lg_nodes_title_fold_trgm') is not null as ok;
