-- =============================================================================
-- graph_owner_compare_export.sql — READ-ONLY. Our legal graph, as JSON lines,
-- for the comparison with the owner's graph file (question ٣٩).
-- =============================================================================
-- The owner sent his graph (LEGAL_GRAPH_EDGES_CLEAN.json) and asked us to
-- compare ours with it and send him the differences. This file reads our
-- graph and the library identities the comparison needs. A mapper on the PC
-- (scripts/graph-owner-compare.mjs export) turns the output into his format.
-- Nothing is imported, merged or deleted, here or anywhere else.
--
-- WHAT IT DOES (nothing is written; one REPEATABLE READ, READ ONLY
-- transaction, so every part sees the same moment, ending with ROLLBACK).
-- Every output line is one JSON object with a "kind":
--   1. kind=snapshot (one line): edge counts by type x origin, node counts by
--      type, library_graph.sync_state (last_synced_at, dirty, status), the
--      library's row counts and max(updated_at) of laws / decrees. This is
--      the "nothing deleted, nothing merged" record: run the file again later
--      and compare the two snapshot lines (the mapper's `snapshot` command).
--   2. kind=doc: our document identities, for the id coverage table:
--        family=law        slug, instrument_id
--        family=decree     id (uuid)
--        family=collection id, meta_id (= metadata->>'id', server-only)
--        family=principle  id, collection_id, meta_id — standalone rulings
--                          (synthetic 'prec-…' collections) and any principle
--                          whose metadata carries an id
--   3. kind=edge: every edge of the six types that have a counterpart in his
--      file (INTERPRETS_ARTICLE, CITES_ARTICLE, AMENDS_ARTICLE, SUPERSEDES_LAW,
--      PARENT_LAW, IMPLEMENTED_BY) with, for both ends: node_type, law_slug,
--      article_number, source_id, collection_id, laws.instrument_id,
--      principles.metadata->>'id', judicial_collections.metadata->>'id'.
--      The other twelve types are only counted (part 1).
--
-- HOW TO RUN (server, /www/wwwroot/nzamy/latest-nzamy-full). The output is
-- data, saved to a file by the redirect; errors go to the screen:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -q -At -v ON_ERROR_STOP=1 < supabase/one-time/graph_owner_compare_export.sql > /root/graph-owner-export.jsonl
--   head -c 600 /root/graph-owner-export.jsonl; echo; wc -l /root/graph-owner-export.jsonl
-- The first line must start with {"kind" : "snapshot". Copy
-- /root/graph-owner-export.jsonl to the PC (docs/graph-rag/OWNER_GRAPH_COMPARE.md).
--
-- The file is a few MB (one line per exported edge). It holds library titles'
-- slugs and short evidence quotes from public law text, no user data.
-- =============================================================================

\set QUIET on
\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

begin transaction isolation level repeatable read read only;
set local statement_timeout = '300s';

-- ── 1. snapshot ──────────────────────────────────────────────────────────────
select json_build_object(
  'kind', 'snapshot',
  'schema', 'nzamy_graph_owner_compare_export/1',
  'taken_at', now(),
  'edge_counts', (
    select coalesce(json_agg(json_build_object('edge_type', x.edge_type, 'origin', x.origin, 'n', x.n)
                             order by x.edge_type, x.origin), '[]'::json)
      from (select e.edge_type, e.origin, count(*) as n
              from library_graph.edges e
             group by e.edge_type, e.origin) x
  ),
  'node_counts', (
    select coalesce(json_agg(json_build_object('node_type', x.node_type, 'n', x.n)
                             order by x.node_type), '[]'::json)
      from (select n.node_type, count(*) as n
              from library_graph.nodes n
             group by n.node_type) x
  ),
  'sync_state', (
    select json_build_object(
             'last_synced_at', s.last_synced_at,
             'dirty', s.dirty,
             'last_sync_status', s.last_sync_status,
             'last_write_at', s.last_write_at)
      from library_graph.sync_state s
     where s.id = 1
  ),
  'library', json_build_object(
    'laws', (select count(*) from library.laws),
    'laws_max_updated_at', (select max(l.updated_at) from library.laws l),
    'decrees', (select count(*) from library.decrees_circulars),
    'decrees_max_updated_at', (select max(d.updated_at) from library.decrees_circulars d),
    'judicial_collections', (select count(*) from library.judicial_collections),
    'principles', (select count(*) from library.principles)
  )
)::text;

-- ── 2. document identities ───────────────────────────────────────────────────
select json_build_object(
  'kind', 'doc', 'family', 'law',
  'slug', l.slug,
  'instrument_id', nullif(btrim(l.instrument_id), ''))::text
  from library.laws l
 order by l.slug;

select json_build_object(
  'kind', 'doc', 'family', 'decree',
  'id', d.id)::text
  from library.decrees_circulars d
 order by d.id;

select json_build_object(
  'kind', 'doc', 'family', 'collection',
  'id', c.id,
  'meta_id', nullif(btrim(c.metadata ->> 'id'), ''))::text
  from library.judicial_collections c
 order by c.id;

select json_build_object(
  'kind', 'doc', 'family', 'principle',
  'id', p.id,
  'collection_id', p.collection_id,
  'meta_id', nullif(btrim(p.metadata ->> 'id'), ''))::text
  from library.principles p
 where p.collection_id like 'prec-%'
    or nullif(btrim(p.metadata ->> 'id'), '') is not null
 order by p.id;

-- ── 3. edges of the six exported types, with both ends' identities ──────────
select json_build_object(
  'kind', 'edge',
  'edge_type', e.edge_type,
  'source_key', e.source_key,
  'target_key', e.target_key,
  'origin', e.origin,
  'source_tag', e.metadata ->> 'source',
  'evidence', e.evidence,
  'from', json_build_object(
    'node_type', s.node_type,
    'law_slug', s.law_slug,
    'article_number', s.article_number,
    'source_id', s.source_id,
    'collection_id', s.collection_id,
    'instrument_id', nullif(btrim(sl.instrument_id), ''),
    'principle_meta_id', nullif(btrim(sp.metadata ->> 'id'), ''),
    'collection_meta_id', nullif(btrim(sc.metadata ->> 'id'), '')),
  'to', json_build_object(
    'node_type', t.node_type,
    'law_slug', t.law_slug,
    'article_number', t.article_number,
    'source_id', t.source_id,
    'collection_id', t.collection_id,
    'instrument_id', nullif(btrim(tl.instrument_id), ''),
    'principle_meta_id', nullif(btrim(tp.metadata ->> 'id'), ''),
    'collection_meta_id', nullif(btrim(tc.metadata ->> 'id'), ''))
)::text
  from library_graph.edges e
  join library_graph.nodes s on s.node_key = e.source_key
  join library_graph.nodes t on t.node_key = e.target_key
  left join library.laws sl on sl.slug = s.law_slug
  left join library.laws tl on tl.slug = t.law_slug
  left join library.principles sp on s.node_type = 'principle' and sp.id = s.source_id
  left join library.principles tp on t.node_type = 'principle' and tp.id = t.source_id
  left join library.judicial_collections sc on s.node_type = 'principle' and sc.id = s.collection_id
  left join library.judicial_collections tc on t.node_type = 'principle' and tc.id = t.collection_id
 where e.edge_type in ('INTERPRETS_ARTICLE', 'CITES_ARTICLE', 'AMENDS_ARTICLE', 'SUPERSEDES_LAW', 'PARENT_LAW', 'IMPLEMENTED_BY')
 order by e.edge_type, e.source_key, e.target_key;

rollback;
