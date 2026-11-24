-- library_link_coverage_l14.test.sql — proves 20261204_40 (batch l14 «links»,
-- owner file 07 §2/§12, the staff page «تغطية الإحالات»):
--   * per law: articles, articles with at least one LEGAL link (SIMILAR_TO and
--     an article's link to itself never count), links, similar-only coverage,
--     the owner's links on the whole law (resolved_doc), gone anchors;
--   * an anomaly: more than five links of one type between one article and the
--     articles of one other document (the owner's nine «تنفّذ» items);
--   * service_role only; titles and counts only (no text, no evidence).
--
-- CHAIN (needs pgvector; repo root, Git Bash): the l12 lib-links chain, then the
-- l14_links _verify block BEFORE the file (must answer false, not fail),
-- 20261204_40 TWICE (idempotent), the _verify block again, this file:
--   R=supabase/tests/rls; M=supabase/migrations; T=$(mktemp -d)
--   sed -n '/^-- >>> verify:l14_links/,/^-- <<< verify:l14_links/p' $M/_verify.sql > "$T/v.sql"
--   PG_IMAGE=pgvector/pgvector:pg16 bash $R/run.sh $R/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_feqh_locator_labels.sql $M/20260729_decree_instrument_taxonomy.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql $M/20261019_40_library_decree_preamble_lock.sql \
--     $M/20261108_10_library_decree_tier_columns_lock.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql $M/20261117_10_library_graph_seeds.sql \
--     $M/20261118_10_library_owner_links.sql $M/20261119_10_library_graph_explorer_parity.sql \
--     $M/20261120_10_library_graph_title_search_index.sql $M/20261121_10_library_graph_call_log.sql \
--     $M/20261130_30_library_regulation_ref.sql $M/20261130_40_library_owner_edges.sql \
--     $M/20261202_30_library_links.sql "$T/v.sql" \
--     $M/20261204_40_library_link_coverage.sql $M/20261204_40_library_link_coverage.sql \
--     "$T/v.sql" $R/library_link_coverage_l14.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without 20261130_40 and
-- 20261202_30 → "20261204_40: library_graph.owner_edges missing — apply
-- 20261130_40 first".
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- ── fixture (as the migration owner) ─────────────────────────────────────────
insert into library.laws (slug, title, type, description, status) values
  ('jud', 'نظام القضاء', 'نظام', 'وصف', 'active'),
  ('jud-1428', 'نظام القضاء الصادر بالمرسوم الملكي رقم (م/78)', 'نظام', 'وصف', 'active'),
  ('mech', 'آلية العمل التنفيذية لنظام القضاء', 'لائحة', 'وصف', 'active'),
  ('empty', 'نظام بلا مواد', 'نظام', 'وصف', 'active');
insert into library.articles (id, law_slug, number, text, status) values
  ('jud__art-1', 'jud', '1', 'نص سري للمادة الأولى', 'active'),
  ('jud__art-2', 'jud', '2', 'نص سري', 'active'),
  ('jud__art-3', 'jud', '3', 'نص سري', 'active'),
  ('jud__art-4', 'jud', '4', 'نص سري', 'active'),
  ('jud-1428__art-1', 'jud-1428', '1', 'نص سري', 'active');
insert into library.articles (id, law_slug, number, text, status)
select 'mech__art-' || g, 'mech', g::text, 'نص سري', 'active' from generate_series(1, 9) g;

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, collection_id, is_embeddable, title, url, display_text, content_sha256)
select 'article:' || a.id, 'article', a.id, a.law_slug, null, true, a.law_slug || ' — المادة ' || a.number, '', 'نص سري', pg_catalog.md5(a.id) || pg_catalog.md5(a.id)
  from library.articles a;
insert into library_graph.nodes (node_key, node_type, source_id, law_slug, collection_id, is_embeddable, title, url, display_text, content_sha256) values
  ('law:jud', 'law', 'jud', 'jud', null, false, 'نظام القضاء', '/laws/jud', 'نص', repeat('a', 64)),
  -- a graph article whose library row is gone, still linked (the «308» kind)
  ('article:jud__art-gone', 'article', 'jud__art-gone', 'jud', null, true, 'jud — مادة حُذفت', '', 'نص سري', repeat('b', 64));

-- art-1: nine regulation articles «implement» it (anomaly), one link to itself (never counted),
-- one similar link only to its copy (not a legal link)
insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence)
select 'article:jud__art-1', 'article:mech__art-' || g, 'IMPLEMENTED_BY', 'auto_watchdog', 1.0, 'دليل سري' from generate_series(1, 9) g;
insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence) values
  ('article:jud__art-1', 'article:jud__art-1', 'CITES_ARTICLE', 'auto_watchdog', 1.0, 'دليل سري'),
  ('article:jud__art-2', 'article:jud__art-3', 'CITES_ARTICLE', 'auto_watchdog', 1.0, 'دليل سري'),
  ('article:jud__art-4', 'article:jud-1428__art-1', 'SIMILAR_TO', 'auto_similarity', 0.9, null),
  ('article:jud__art-gone', 'article:jud__art-2', 'CITES_ARTICLE', 'auto_watchdog', 1.0, 'دليل سري');

-- the owner's link that could not be pinned to an article: it sits on the whole law
insert into library_graph.owner_edges (edge_id, type, from_doc, to_doc, to_article, quality, source_sha256, resolve_status, resolved_source_key, resolved_target_key)
values ('00000000000000a1', 'cites_article', 'COLL-1', 'LAW-00-0001', '99', 'flagged', repeat('c', 64), 'resolved_doc', 'article:jud__art-2', 'law:jud'),
       ('00000000000000a2', 'cites_article', 'COLL-1', 'LAW-00-0001', '1', 'ok', repeat('c', 64), 'target_doc_unknown', null, null);

-- ── T1 anon / authenticated: denied ──────────────────────────────────────────
do $$
declare r text; denied int := 0;
begin
  foreach r in array array['anon', 'authenticated'] loop
    begin
      execute format('set local role %I', r);
      perform public.graph_rag_link_coverage(array['CITES_ARTICLE'], 6, 10);
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
  end loop;
  if denied <> 2 then raise exception 'T1 FAIL: denied % of 2', denied; end if;
  raise notice 'T1 PASS: anon and authenticated cannot read the coverage';
end $$;

-- ── T2 coverage per law ──────────────────────────────────────────────────────
set role service_role;
create temp table cov as
select public.graph_rag_link_coverage(array['CITES_ARTICLE', 'IMPLEMENTED_BY', 'SIMILAR_TO', 'AMENDS_ARTICLE'], 6, 10) as r;
reset role;

do $$
declare r jsonb := (select c.r from cov c); j jsonb; m jsonb;
begin
  if r::text like '%سري%' then raise exception 'T2 FAIL: text or evidence leaked'; end if;
  select x into j from jsonb_array_elements(r->'laws') x where x->>'slug' = 'jud';
  -- articles 4; linked: art-1 (9 legal), art-2 (→ art-3, ← gone), art-3 (← art-2); art-4 has a similar link only
  if (j->>'articles')::int <> 4 or (j->>'linked')::int <> 3 then raise exception 'T2 FAIL: jud coverage %', j; end if;
  -- links: art-1 9, art-2 2, art-3 1 = 12 (the self link and SIMILAR_TO never count)
  if (j->>'links')::int <> 12 then raise exception 'T2 FAIL: jud links % (the self link or similar counted?)', j; end if;
  if (j->>'similar_linked')::int <> 1 then raise exception 'T2 FAIL: jud similar %', j; end if;
  if (j->>'doc_level')::int <> 1 then raise exception 'T2 FAIL: jud owner links on the whole law %', j; end if;
  if (j->>'gone_anchors')::int <> 1 then raise exception 'T2 FAIL: jud gone anchors %', j; end if;
  select x into j from jsonb_array_elements(r->'laws') x where x->>'slug' = 'mech';
  if (j->>'articles')::int <> 9 or (j->>'linked')::int <> 9 or (j->>'links')::int <> 9 then raise exception 'T2 FAIL: mech %', j; end if;
  if exists (select 1 from jsonb_array_elements(r->'laws') x where x->>'slug' = 'empty') then
    raise exception 'T2 FAIL: a law with no article and no link is listed';
  end if;
  m := r->'totals';
  if (m->>'articles')::int <> 14 or (m->>'linked')::int <> 12 or (m->>'laws')::int <> 3 then raise exception 'T2 FAIL: totals %', m; end if;
  if (r->'owner_edges'->>'resolved_doc')::int <> 1 or (r->'owner_edges'->>'target_doc_unknown')::int <> 1 then
    raise exception 'T2 FAIL: owner edges by status %', r->'owner_edges';
  end if;
  raise notice 'T2 PASS: per-law coverage, links without the self link or similar, similar apart, owner links on the law, gone anchors, totals';
end $$;

-- ── T3 anomalies ─────────────────────────────────────────────────────────────
do $$
declare r jsonb := (select c.r from cov c); a jsonb;
begin
  if (r->>'anomaly_count')::int <> 1 or (r->>'anomaly_min')::int <> 6 then raise exception 'T3 FAIL: anomaly count %', r->>'anomaly_count'; end if;
  a := r->'anomalies'->0;
  if a->>'article_key' <> 'article:jud__art-1' or a->>'edge_type' <> 'IMPLEMENTED_BY' or a->>'direction' <> 'out'
     or a->>'other_doc' <> 'mech' or (a->>'n')::int <> 9 or a->>'other_title' <> 'آلية العمل التنفيذية لنظام القضاء' then
    raise exception 'T3 FAIL: anomaly %', a;
  end if;
  -- the mechanism side: each of its articles has ONE link to jud — no anomaly
  set local role service_role;
  if (public.graph_rag_link_coverage(array['IMPLEMENTED_BY'], 10, 10)->>'anomaly_count')::int <> 0 then
    raise exception 'T3 FAIL: nine links flagged at a threshold of ten';
  end if;
  if jsonb_array_length(public.graph_rag_link_coverage(null, 6, 10)->'anomalies') <> 0
     or (public.graph_rag_link_coverage(null, 6, 10)->'totals'->>'linked')::int <> 0 then
    raise exception 'T3 FAIL: no types asked must count no link';
  end if;
  reset role;
  raise notice 'T3 PASS: nine links of one type from one document onto one article flagged; the threshold and the empty type list hold';
end $$;
