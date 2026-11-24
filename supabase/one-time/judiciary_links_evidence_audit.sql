-- =============================================================================
-- REUSABLE: judiciary_links_evidence_audit.sql — READ-ONLY (batch l14, owner
-- file 07 §8: «تقرير تدقيق … لنظام القضاء ولائحته»)
-- =============================================================================
-- Changes nothing. For every «تنفّذ» (IMPLEMENTED_BY) and «إحالة»
-- (CITES_ARTICLE) link that touches نظام القضاء (judiciary-law) or a law whose
-- slug starts with judiciary-: both ends, their article numbers, the link's
-- origin, and the sentence it was built from (evidence, up to 400 characters
-- — the owner reviews a sample of 20 against the official text).
-- Run in the database container with psql (-v ON_ERROR_STOP=1 < this file); to
-- keep a file add: --csv -o /tmp/judiciary_links_audit.csv
-- Another law: replace 'judiciary' below with the start of its slug.
-- =============================================================================

select e.edge_type                                   as link_type,
       s.law_slug                                    as source_law,
       a1.number                                     as source_article_number,
       pg_catalog.left(s.title, 160)                 as source_title,
       t.law_slug                                    as target_law,
       a2.number                                     as target_article_number,
       pg_catalog.left(t.title, 160)                 as target_title,
       e.origin                                      as origin,
       coalesce(e.metadata->>'source', '')           as file_source,
       pg_catalog.left(coalesce(e.evidence, ''), 400) as evidence
  from library_graph.edges e
  join library_graph.nodes s on s.node_key = e.source_key
  join library_graph.nodes t on t.node_key = e.target_key
  left join library.articles a1 on 'article:' || a1.id = e.source_key
  left join library.articles a2 on 'article:' || a2.id = e.target_key
 where e.edge_type in ('IMPLEMENTED_BY', 'CITES_ARTICLE')
   and (s.law_slug like 'judiciary%' or t.law_slug like 'judiciary%')
 order by e.edge_type, s.law_slug, a1.number nulls last, t.law_slug, a2.number nulls last;

-- The counts the owner asked about: links of one type from one document onto
-- one article (more than five = to review — the staff page «تغطية الإحالات»
-- lists the same across the whole library).
select e.source_key as article, e.edge_type, t.law_slug as other_law, pg_catalog.count(*) as links
  from library_graph.edges e
  join library_graph.nodes t on t.node_key = e.target_key
 where e.edge_type in ('IMPLEMENTED_BY', 'CITES_ARTICLE')
   and e.source_key like 'article:judiciary%'
 group by 1, 2, 3
having pg_catalog.count(*) > 5
 order by links desc;
