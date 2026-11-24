-- =============================================================================
-- 20261204_40_library_link_coverage.sql — batch l14 «links» (owner file 07 §2,
-- §12; «لوحة تغطية الإحالات» approved 23 Nov §15)
-- =============================================================================
--
-- WHAT
--   public.graph_rag_link_coverage(p_types, p_anomaly_min, p_sample) — one
--   read-only answer for the staff page «تغطية الإحالات»
--   (/dashboard/admin/library-links-coverage):
--     * per law (library.laws): its articles (library.articles), how many have
--       at least one LEGAL link of p_types (the app passes the reader's legal
--       types, SIMILAR_TO never among them), how many links that is, how many
--       have a similar-meaning link (counted apart: not a legal link, file 07
--       §12.9), the owner's links that could not be pinned to an article and
--       sit on the whole law (owner_edges resolve_status 'resolved_doc',
--       20261202_30), and graph article nodes of the law whose library row is
--       gone but still carry links (the «308» kind);
--     * the totals, and the owner's links by resolve status;
--     * file 07 §12.8 (anomaly): an article that receives or sends more than
--       p_anomaly_min - 1 links of ONE type with articles of ONE other document
--       (the owner's example: nine «آلية العمل التنفيذية…» items "implementing"
--       article 1 of نظام القضاء) — a sample of p_sample, worst first.
--   A link of an article to itself is never counted (file 07 §12.1).
--   Titles, keys and counts only: no article text, no evidence.
--
-- SECURITY
--   SECURITY INVOKER (service_role already reads library_graph and library.*),
--   search_path = '', statement_timeout 60 s, EXECUTE revoked from public /
--   anon / authenticated and granted to service_role only. The page's route is
--   requireStaff("read"). No table, no policy, no existing grant is touched.
--
-- RUN ORDER
--   AFTER 20261130_40 (library_graph.owner_edges) and the graph chain
--   (20261110_10 …); this file stops with an error without them. Before or
--   after the deploy: code first → the page says the migration is missing; SQL
--   first → nothing calls the function yet.
--
-- RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261204_40_library_link_coverage.sql
--   → NOTICE  l14_links verify: OK   and a final row with ok = t.
--   Then supabase/migrations/_verify.sql section verify:l14_links.
--
-- ROLLBACK
--   drop function if exists public.graph_rag_link_coverage(text[], integer, integer);
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('library_graph.edges') is null or to_regclass('library_graph.nodes') is null then
    raise exception '20261204_40: library_graph.edges / nodes missing — apply the graph chain (20261110_10 …) first';
  end if;
  if to_regclass('library_graph.owner_edges') is null then
    raise exception '20261204_40: library_graph.owner_edges missing — apply 20261130_40 first';
  end if;
  if to_regclass('library.articles') is null or to_regclass('library.laws') is null then
    raise exception '20261204_40: library.laws / articles missing';
  end if;
end $$;

create or replace function public.graph_rag_link_coverage(
  p_types       text[],
  p_anomaly_min integer default 6,
  p_sample      integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_min    integer := least(greatest(coalesce(p_anomaly_min, 6), 2), 1000);
  v_sample integer := least(greatest(coalesce(p_sample, 50), 0), 200);
  v_types  text[]  := coalesce(p_types, array[]::text[]);
  v_result jsonb;
begin
  with legal as (
    select e.source_key, e.target_key, e.edge_type
      from library_graph.edges e
     where e.edge_type = any(v_types)
       and e.edge_type <> 'SIMILAR_TO'
       and e.source_key <> e.target_key
  ),
  ends as (
    select l.source_key as k from legal l where l.source_key like 'article:%'
    union all
    select l.target_key from legal l where l.target_key like 'article:%'
  ),
  per_article as (
    select x.k, pg_catalog.count(*)::integer as n from ends x group by x.k
  ),
  similar_ends as (
    select e.source_key as k from library_graph.edges e
     where e.edge_type = 'SIMILAR_TO' and e.source_key <> e.target_key and e.source_key like 'article:%'
    union
    select e.target_key from library_graph.edges e
     where e.edge_type = 'SIMILAR_TO' and e.source_key <> e.target_key and e.target_key like 'article:%'
  ),
  per_law as (
    select a.law_slug,
           pg_catalog.count(*)::integer as articles,
           pg_catalog.count(p.k)::integer as linked,
           coalesce(pg_catalog.sum(p.n), 0)::integer as links,
           pg_catalog.count(s.k)::integer as similar_linked
      from library.articles a
      left join per_article p on p.k = 'article:' || a.id
      left join similar_ends s on s.k = 'article:' || a.id
     group by a.law_slug
  ),
  doc_level as (
    select pg_catalog.substr(o.resolved_target_key, 5) as law_slug, pg_catalog.count(*)::integer as n
      from library_graph.owner_edges o
     where o.resolve_status = 'resolved_doc' and o.resolved_target_key like 'law:%'
     group by 1
  ),
  gone as (
    select n.law_slug, pg_catalog.count(*)::integer as n
      from library_graph.nodes n
     where n.node_type = 'article'
       and not exists (select 1 from library.articles a where a.id = pg_catalog.substr(n.node_key, 9))
       and (exists (select 1 from library_graph.edges e
                     where e.source_key = n.node_key and e.target_key <> n.node_key
                       and e.edge_type = any(v_types) and e.edge_type <> 'SIMILAR_TO')
            or exists (select 1 from library_graph.edges e
                        where e.target_key = n.node_key and e.source_key <> n.node_key
                          and e.edge_type = any(v_types) and e.edge_type <> 'SIMILAR_TO'))
     group by n.law_slug
  ),
  laws as (
    select l.slug, l.title,
           coalesce(p.articles, 0) as articles, coalesce(p.linked, 0) as linked,
           coalesce(p.links, 0) as links, coalesce(p.similar_linked, 0) as similar_linked,
           coalesce(d.n, 0) as doc_level, coalesce(g.n, 0) as gone_anchors
      from library.laws l
      left join per_law p on p.law_slug = l.slug
      left join doc_level d on d.law_slug = l.slug
      left join gone g on g.law_slug = l.slug
  ),
  pairs as (
    select l.source_key as center, l.edge_type, 'out'::text as dir, n2.law_slug as other_doc
      from legal l
      join library_graph.nodes n2 on n2.node_key = l.target_key and n2.node_type = 'article'
     where l.source_key like 'article:%'
    union all
    select l.target_key, l.edge_type, 'in', n2.law_slug
      from legal l
      join library_graph.nodes n2 on n2.node_key = l.source_key and n2.node_type = 'article'
     where l.target_key like 'article:%'
  ),
  anomalies as (
    select p.center, p.edge_type, p.dir, p.other_doc, pg_catalog.count(*)::integer as n
      from pairs p
     where p.other_doc is not null
     group by p.center, p.edge_type, p.dir, p.other_doc
    having pg_catalog.count(*) >= v_min
  )
  select pg_catalog.jsonb_build_object(
    'laws', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'slug', x.slug, 'title', pg_catalog.left(x.title, 200),
               'articles', x.articles, 'linked', x.linked, 'links', x.links,
               'similar_linked', x.similar_linked, 'doc_level', x.doc_level, 'gone_anchors', x.gone_anchors)
             order by x.articles desc, x.slug)
        from laws x
       where x.articles > 0 or x.doc_level > 0 or x.gone_anchors > 0
    ), '[]'::jsonb),
    'totals', (
      select pg_catalog.jsonb_build_object(
               'laws', pg_catalog.count(*) filter (where x.articles > 0),
               'articles', coalesce(pg_catalog.sum(x.articles), 0),
               'linked', coalesce(pg_catalog.sum(x.linked), 0),
               'links', coalesce(pg_catalog.sum(x.links), 0),
               'similar_linked', coalesce(pg_catalog.sum(x.similar_linked), 0),
               'doc_level', coalesce(pg_catalog.sum(x.doc_level), 0),
               'gone_anchors', coalesce(pg_catalog.sum(x.gone_anchors), 0))
        from laws x
    ),
    'owner_edges', coalesce((
      select pg_catalog.jsonb_object_agg(o.resolve_status, o.n)
        from (select resolve_status, pg_catalog.count(*)::integer as n
                from library_graph.owner_edges group by 1) o
    ), '{}'::jsonb),
    'anomaly_min', v_min,
    'anomaly_count', (select pg_catalog.count(*)::integer from anomalies),
    'anomalies', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'article_key', s.center,
               'article_title', pg_catalog.left(nc.title, 200),
               'law_slug', nc.law_slug,
               'edge_type', s.edge_type,
               'direction', s.dir,
               'other_doc', s.other_doc,
               'other_title', pg_catalog.left(lo.title, 200),
               'n', s.n)
             order by s.n desc, s.center, s.edge_type)
        from (select * from anomalies order by n desc, center, edge_type limit v_sample) s
        left join library_graph.nodes nc on nc.node_key = s.center
        left join library.laws lo on lo.slug = s.other_doc
    ), '[]'::jsonb)
  )
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.graph_rag_link_coverage(text[], integer, integer) from public, anon, authenticated;
grant execute on function public.graph_rag_link_coverage(text[], integer, integer) to service_role;

comment on function public.graph_rag_link_coverage(text[], integer, integer) is
  'Batch l14 (owner file 07 §2/§12): per law, the share of articles with at least one legal link (p_types, never SIMILAR_TO), links, similar-only coverage, owner links on the whole law (resolved_doc), gone anchors; plus anomalies (>= p_anomaly_min links of one type between one article and one other document). Titles and counts only. Service role only. Added by 20261204_40.';

do $verify$
declare
  r text;
  f constant text := 'public.graph_rag_link_coverage(text[], integer, integer)';
begin
  if to_regprocedure(f) is null then
    raise exception 'l14_links verify: % missing', f;
  end if;
  if not (select p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
    raise exception 'l14_links verify: % has no empty search_path', f;
  end if;
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
    raise exception 'l14_links verify: % must be SECURITY INVOKER', f;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, f, 'EXECUTE') then
      raise exception 'l14_links verify: % can EXECUTE %', r, f;
    end if;
  end loop;
  if not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception 'l14_links verify: service_role cannot EXECUTE %', f;
  end if;
  raise notice 'l14_links verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261204_40 library link coverage (staff page «تغطية الإحالات»: per-law coverage, owner links on the whole law, gone anchors, anomalies)' as migration,
       to_regprocedure('public.graph_rag_link_coverage(text[], integer, integer)') is not null
       and not has_function_privilege('anon', 'public.graph_rag_link_coverage(text[], integer, integer)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.graph_rag_link_coverage(text[], integer, integer)', 'EXECUTE')
       as ok;
