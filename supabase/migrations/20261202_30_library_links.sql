-- =============================================================================
-- Migration: 20261202_30_library_links.sql   (verify id: l12_lib_links)
-- =============================================================================
-- PURPOSE (batch l12 «lib-links», owner package 20 Nov 2026)
--
--   1. L1 — the links under EVERY article (file 03, lib02 / lib04):
--      public.graph_rag_law_article_links(p_law_slug, p_per_type, p_types)
--        one read for a whole law: per article node of the law, its links of
--        the asked types grouped by (type, direction) with the TRUE total and
--        at most p_per_type items each (closest first: weight, then key), and
--        every linked node ONCE with its title, status and whether its
--        library row / document still exists (library.articles / laws /
--        principles / judicial_collections / decrees_circulars). The reader's
--        route (GET /api/library/laws/[slug]/citations?bulk=1) shapes it
--        through a whitelist: titles, statuses, links — never article text,
--        never snippet or evidence (none is selected here either).
--        The type list stays in ONE place, the app (graphLinkTypes.ts): a null
--        or empty p_types answers no links.
--
--   2. Q132 / file 02 #43 — the owner's links as ordinary links
--      (public.graph_rag_resolve_owner_edges() replaced, same signature):
--        * quality = flagged (his «308» and our importer's doubts) is no
--          longer held out: «شغّلهم من غير وسم» (20 Nov, 22:16). The quality
--          stays in the edge metadata for staff, the reader never shows it.
--        * an article that cannot be pinned (missing, not found, ambiguous, a
--          regulation not in an ATTACHED block) links to its LAW node instead
--          — status resolved_doc — «وإن تعذّر تحديد المادة يفتح الرابط المستند
--          الهدف». Nothing is guessed: an ambiguous article is never picked.
--        * his amendment, repeal and replacement links merge too:
--            amended_by  (from law+article, to the amending instrument) and
--            amends      (from the instrument, to the law[+article])
--                → AMENDS_ARTICLE  instrument → article (or law)
--            repealed_by / superseded_by  (from the old law, to the new)
--            repeals / supersedes / replaces  (from the new law, to the old)
--                → SUPERSEDES_LAW  new law → old law  (graphBuilder's direction)
--          scheduled_repeal_by (not in force yet), related_to, regulation_*,
--          contains_merged_regulation, cites_precedent and refers_to_article
--          stay type_not_merged.
--        * a link whose two ends are one node: self_link (never written).
--      Every other rule of 20261130_40 is kept: his edge_id, his stable ids
--      looked up (never built), full reconcile each call, deleted ids leave,
--      an automatic edge on the same pair is taken over, other curated edges
--      untouched.
--
--   3. File 10 ب34 — a daily broken-reference check:
--      library_graph.link_checks (server-only) keeps one row per check;
--      public.graph_rag_link_check(p_sample)    read-only: graph nodes that
--          carry reader links but whose library row (or document) is gone,
--          with a sample; and the owner links by resolve status.
--      public.graph_rag_link_check_run(p_sample) re-points the owner's links
--          by their stable ids (the resolver above), then stores the check and
--          keeps 90 days. POST /api/v1/cron/library-link-check runs it daily
--          and alerts the admins when something is broken.
--      public.graph_rag_link_check_history(p_limit) the staff explorer's list.
--
-- SECURITY
--   Every function: search_path = '', EXECUTE revoked from public / anon /
--   authenticated, granted to service_role only (the routes use the service
--   client behind libraryGate / requireStaff / CRON_SECRET). The law read is
--   SECURITY INVOKER (service_role already reads library_graph and library.*);
--   the resolver and the check run stay SECURITY DEFINER like 20261130_40.
--   library_graph.link_checks: RLS on and forced, no policy, no privilege for
--   anon / authenticated. No existing grant is widened.
--
-- RUN ORDER
--   * AFTER 20261130_40 (this file stops with an error without it) and the
--     graph chain (20261110_10 … 20261121_10).
--   * Before or after the deploy:
--       - code first: the reader's ?bulk=1 answers {available:false} and the
--         reader falls back to one article at a time (as before); the cron
--         answers {skipped:"schema_missing"};
--       - SQL first: old code never calls the new functions; the resolver is
--         only called by the importer (--apply) and the watchdog, and its
--         answer keeps the same keys.
--   * The owner's links reach the graph only after his RE-EXPORT, the 50-link
--     sample (N12 / file 02 #43) and the user's importer --apply.
--
-- RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261202_30_library_links.sql
--   → NOTICE  l12_lib_links verify: OK   and a final row with ok = t.
--   Then supabase/migrations/_verify.sql section verify:l12_lib_links.
--
-- ROLLBACK
--   drop function if exists public.graph_rag_law_article_links(text, integer, text[]);
--   drop function if exists public.graph_rag_link_check_run(integer);
--   drop function if exists public.graph_rag_link_check(integer);
--   drop function if exists public.graph_rag_link_check_history(integer);
--   drop table if exists library_graph.link_checks;
--   then re-run 20261130_40 (the l10 resolver: flagged held, cites_article only;
--   its next call removes the merged amendment / repeal links from the graph).
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. what this file builds on must be in force
do $$
begin
  if to_regclass('library_graph.edges') is null or to_regclass('library_graph.nodes') is null then
    raise exception '20261202_30: library_graph.edges / nodes missing — apply the graph chain (20261110_10 …) first';
  end if;
  if to_regclass('library_graph.owner_edges') is null
     or to_regprocedure('public.graph_rag_resolve_owner_edges()') is null then
    raise exception '20261202_30: library_graph.owner_edges missing — apply 20261130_40 first';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'library_graph.edges'::regclass and conname = 'edges_edge_type_check'
       and pg_catalog.pg_get_constraintdef(oid) like '%SIMILAR_TO%'
  ) then
    raise exception '20261202_30: library_graph.edges has no SIMILAR_TO type — apply 20261116_10 first';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. L1: every article of a law at once
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.graph_rag_law_article_links(
  p_law_slug text,
  p_per_type integer default 3,
  p_types    text[]  default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '10s'
as $$
declare
  v_per    integer := least(greatest(coalesce(p_per_type, 3), 1), 10);
  v_result jsonb;
begin
  if p_law_slug is null or pg_catalog.btrim(p_law_slug) = '' then
    return pg_catalog.jsonb_build_object('found', false);
  end if;
  if p_types is null or coalesce(pg_catalog.cardinality(p_types), 0) = 0 then
    return pg_catalog.jsonb_build_object('found', true, 'law_slug', p_law_slug, 'per_type', v_per,
                                         'articles', '[]'::jsonb, 'nodes', '[]'::jsonb);
  end if;

  with arts as (
    select n.node_key
      from library_graph.nodes n
     where n.law_slug = p_law_slug and n.node_type = 'article'
  ),
  links as (
    select a.node_key as center, e.edge_type, 'out'::text as dir, e.target_key as other,
           e.weight, e.origin, e.metadata->>'source' as src
      from arts a
      join library_graph.edges e on e.source_key = a.node_key
     where e.edge_type = any(p_types) and e.target_key <> a.node_key
    union all
    select a.node_key, e.edge_type, 'in', e.source_key, e.weight, e.origin, e.metadata->>'source'
      from arts a
      join library_graph.edges e on e.target_key = a.node_key
     where e.edge_type = any(p_types) and e.source_key <> a.node_key
  ),
  ranked as (
    select l.*,
           pg_catalog.row_number() over (partition by l.center, l.edge_type, l.dir order by l.weight desc, l.other) as rn,
           pg_catalog.count(*) over (partition by l.center, l.edge_type, l.dir) as total
      from links l
  ),
  picked as (
    select * from ranked r where r.rn <= v_per
  ),
  groups as (
    select p.center, p.edge_type, p.dir, pg_catalog.max(p.total)::integer as total,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('k', p.other, 'o', p.origin, 's', pg_catalog.left(p.src, 40))
             order by p.rn) as items
      from picked p
     group by p.center, p.edge_type, p.dir
  ),
  per_article as (
    select g.center,
           pg_catalog.jsonb_agg(
             pg_catalog.jsonb_build_object('t', g.edge_type, 'd', g.dir, 'n', g.total, 'items', g.items)
             order by g.edge_type, g.dir) as links
      from groups g
     group by g.center
  ),
  other_nodes as (
    select distinct p.other as node_key from picked p
  ),
  node_rows as (
    select n.node_key, n.node_type, n.title, n.law_slug, n.url, n.item_status, n.doc_status, n.collection_id,
           pg_catalog.substr(n.node_key, pg_catalog.strpos(n.node_key, ':') + 1) as id
      from other_nodes o
      join library_graph.nodes n on n.node_key = o.node_key
  )
  select pg_catalog.jsonb_build_object(
    'found',    true,
    'law_slug', p_law_slug,
    'per_type', v_per,
    'articles', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'id', pg_catalog.substr(pa.center, 9),
                 'links', pa.links)
               order by pa.center)
        from per_article pa
    ), '[]'::jsonb),
    'nodes', coalesce((
      select pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'node_key',    nr.node_key,
                 'node_type',   nr.node_type,
                 'title',       pg_catalog.left(nr.title, 200),
                 'law_slug',    nr.law_slug,
                 'url',         nr.url,
                 'item_status', nr.item_status,
                 'doc_status',  nr.doc_status,
                 -- the library's own rows, read now (never the graph's copy)
                 'lib', case nr.node_type
                   when 'article' then pg_catalog.jsonb_build_object(
                     'anchor',     exists (select 1 from library.articles a where a.id = nr.id),
                     'status',     (select a.status from library.articles a where a.id = nr.id),
                     'doc',        exists (select 1 from library.laws l where l.slug = nr.law_slug),
                     'doc_status', (select l.status from library.laws l where l.slug = nr.law_slug),
                     'doc_title',  (select pg_catalog.left(l.title, 200) from library.laws l where l.slug = nr.law_slug))
                   when 'law' then pg_catalog.jsonb_build_object(
                     'doc',        exists (select 1 from library.laws l where l.slug = coalesce(nr.law_slug, nr.id)),
                     'doc_status', (select l.status from library.laws l where l.slug = coalesce(nr.law_slug, nr.id)),
                     'doc_title',  (select pg_catalog.left(l.title, 200) from library.laws l where l.slug = coalesce(nr.law_slug, nr.id)))
                   when 'principle' then pg_catalog.jsonb_build_object(
                     'anchor',     exists (select 1 from library.principles p where p.id = nr.id),
                     'doc',        exists (select 1 from library.judicial_collections c where c.id = nr.collection_id),
                     'doc_title',  (select pg_catalog.left(c.title, 200) from library.judicial_collections c where c.id = nr.collection_id))
                   when 'decree' then pg_catalog.jsonb_build_object(
                     'doc',        exists (select 1 from library.decrees_circulars d where d.id::text = nr.id))
                   else '{}'::jsonb
                 end)
               order by nr.node_key)
        from node_rows nr
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.graph_rag_law_article_links(text, integer, text[]) from public, anon, authenticated;
grant execute on function public.graph_rag_law_article_links(text, integer, text[]) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Q132 / #43: the owner's links as ordinary links, his amendment / repeal /
--    replacement links merged, an unpinned article → its law
-- ─────────────────────────────────────────────────────────────────────────────
alter table library_graph.owner_edges drop constraint if exists owner_edges_resolve_status_check;
alter table library_graph.owner_edges add constraint owner_edges_resolve_status_check check (resolve_status in (
  'pending', 'resolved', 'resolved_doc', 'held_flagged', 'deleted', 'type_not_merged', 'self_link',
  'source_doc_unknown', 'source_doc_ambiguous', 'source_principle_missing',
  'source_principle_ambiguous', 'source_principle_not_found',
  'target_doc_unknown', 'target_article_missing', 'target_article_ambiguous',
  'target_article_not_found', 'regulation_not_in_attached_block', 'node_missing'));

comment on column library_graph.owner_edges.resolve_status is
  'resolved: on its article; resolved_doc: the article could not be pinned, the link is on the target law (Q132, 20261202_30); held_flagged is no longer used (his flagged links are ordinary links since 20261202_30).';

create or replace function public.graph_rag_resolve_owner_edges()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upserted integer := 0;
  v_removed  integer := 0;
  v_changed  integer := 0;
  v_status   jsonb;
begin
  drop table if exists pg_temp.owner_edge_resolution;
  create temporary table owner_edge_resolution on commit drop as
  select o.edge_id, o.type, o.quality, o.article_check, o.evidence,
         (d.edge_id is not null) as is_deleted,
         -- the graph's direction (filled below per type)
         null::text as edge_type,
         null::text as src_doc, null::text as from_principle,
         null::text as tgt_doc, null::text as tgt_article, null::text as tgt_regref,
         o.from_doc, o.from_principle as o_from_principle, o.from_article, o.from_regulation_ref,
         o.to_doc, o.to_article, o.to_regulation_ref,
         null::text as coll_id, null::text as principle_id,
         null::text as src_key, null::text as tgt_law, null::text as tgt_key, null::text as article_id,
         false as doc_level,
         null::text as status
    from library_graph.owner_edges o
    left join library_graph.owner_edges_deleted d on d.edge_id = o.edge_id;

  update pg_temp.owner_edge_resolution set status = 'deleted' where is_deleted;

  -- ── the type → the graph's edge and its two ends ──
  update pg_temp.owner_edge_resolution set
         edge_type = 'INTERPRETS_ARTICLE', src_doc = from_doc, from_principle = o_from_principle,
         tgt_doc = to_doc, tgt_article = to_article, tgt_regref = to_regulation_ref
   where status is null and type = 'cites_article';
  -- the instrument amends the law's article: instrument → article
  update pg_temp.owner_edge_resolution set
         edge_type = 'AMENDS_ARTICLE', src_doc = to_doc,
         tgt_doc = from_doc, tgt_article = from_article, tgt_regref = from_regulation_ref
   where status is null and type = 'amended_by';
  update pg_temp.owner_edge_resolution set
         edge_type = 'AMENDS_ARTICLE', src_doc = from_doc,
         tgt_doc = to_doc, tgt_article = to_article, tgt_regref = to_regulation_ref
   where status is null and type = 'amends';
  -- the new law replaces the old one: new → old (law level)
  update pg_temp.owner_edge_resolution set
         edge_type = 'SUPERSEDES_LAW', src_doc = to_doc, tgt_doc = from_doc
   where status is null and type in ('repealed_by', 'superseded_by');
  update pg_temp.owner_edge_resolution set
         edge_type = 'SUPERSEDES_LAW', src_doc = from_doc, tgt_doc = to_doc
   where status is null and type in ('repeals', 'supersedes', 'replaces');
  update pg_temp.owner_edge_resolution set status = 'type_not_merged' where status is null and edge_type is null;

  -- ── source, cites_article: the collection, by id, else by its frontmatter id (unique) ──
  update pg_temp.owner_edge_resolution r set coll_id = c.id
    from library.judicial_collections c
   where r.status is null and r.edge_type = 'INTERPRETS_ARTICLE' and c.id = r.src_doc;
  with by_meta as (
    select c.metadata->>'id' as mid, pg_catalog.min(c.id) as id, pg_catalog.count(*) as n
      from library.judicial_collections c
     where c.metadata ? 'id'
     group by 1
  )
  update pg_temp.owner_edge_resolution r
     set coll_id = case when m.n = 1 then m.id end,
         status  = case when m.n > 1 then 'source_doc_ambiguous' end
    from by_meta m
   where r.status is null and r.edge_type = 'INTERPRETS_ARTICLE' and r.coll_id is null and m.mid = r.src_doc;

  update pg_temp.owner_edge_resolution set status = 'source_principle_missing'
   where status is null and edge_type = 'INTERPRETS_ARTICLE' and coll_id is not null and from_principle is null;
  with by_num as (
    select p.collection_id, pg_catalog.btrim(p.principle_number) as num, pg_catalog.min(p.id) as id, pg_catalog.count(*) as n
      from library.principles p
     group by 1, 2
  )
  update pg_temp.owner_edge_resolution r
     set principle_id = case when b.n = 1 then b.id end,
         status       = case when b.n > 1 then 'source_principle_ambiguous' end
    from by_num b
   where r.status is null and r.edge_type = 'INTERPRETS_ARTICLE' and r.coll_id is not null
     and b.collection_id = r.coll_id and b.num = r.from_principle;
  update pg_temp.owner_edge_resolution r set principle_id = p.id
    from library.principles p
   where r.status is null and r.edge_type = 'INTERPRETS_ARTICLE' and r.coll_id is not null and r.principle_id is null
     and p.collection_id = r.coll_id and p.id = r.coll_id || '__pr-' || r.from_principle;
  update pg_temp.owner_edge_resolution set status = 'source_principle_not_found'
   where status is null and edge_type = 'INTERPRETS_ARTICLE' and coll_id is not null and principle_id is null;

  -- a standalone ruling: the principle row itself, by id, else by its frontmatter id (unique)
  update pg_temp.owner_edge_resolution r set principle_id = p.id
    from library.principles p
   where r.status is null and r.edge_type = 'INTERPRETS_ARTICLE' and r.coll_id is null and p.id = r.src_doc;
  with by_meta as (
    select p.metadata->>'id' as mid, pg_catalog.min(p.id) as id, pg_catalog.count(*) as n
      from library.principles p
     where p.metadata ? 'id'
     group by 1
  )
  update pg_temp.owner_edge_resolution r
     set principle_id = case when m.n = 1 then m.id end,
         status       = case when m.n > 1 then 'source_doc_ambiguous' end
    from by_meta m
   where r.status is null and r.edge_type = 'INTERPRETS_ARTICLE' and r.coll_id is null and r.principle_id is null
     and m.mid = r.src_doc;
  update pg_temp.owner_edge_resolution set src_key = 'principle:' || principle_id
   where status is null and edge_type = 'INTERPRETS_ARTICLE' and principle_id is not null;

  -- ── source, the other types: a document — a law (file id, else slug), else a decree (its id) ──
  with by_iid as (
    select l.instrument_id as iid, pg_catalog.min(l.slug) as slug, pg_catalog.count(*) as n
      from library.laws l where l.instrument_id is not null group by 1
  )
  update pg_temp.owner_edge_resolution r
     set src_key = case when b.n = 1 then 'law:' || b.slug end,
         status  = case when b.n > 1 then 'source_doc_ambiguous' end
    from by_iid b
   where r.status is null and r.edge_type <> 'INTERPRETS_ARTICLE' and b.iid = r.src_doc;
  update pg_temp.owner_edge_resolution r set src_key = 'law:' || l.slug
    from library.laws l
   where r.status is null and r.edge_type <> 'INTERPRETS_ARTICLE' and r.src_key is null and l.slug = r.src_doc;
  update pg_temp.owner_edge_resolution r set src_key = 'decree:' || d.id::text
    from library.decrees_circulars d
   where r.status is null and r.edge_type <> 'INTERPRETS_ARTICLE' and r.src_key is null and d.id::text = r.src_doc;
  update pg_temp.owner_edge_resolution set status = 'source_doc_unknown'
   where status is null and src_key is null;

  -- ── target: the law by its file id (unique), else by slug; a decree for an amendment / replacement ──
  with by_iid as (
    select l.instrument_id as iid, pg_catalog.min(l.slug) as slug, pg_catalog.count(*) as n
      from library.laws l where l.instrument_id is not null group by 1
  )
  update pg_temp.owner_edge_resolution r
     set tgt_law = case when b.n = 1 then b.slug end,
         status  = case when b.n > 1 then 'target_doc_unknown' end
    from by_iid b
   where r.status is null and b.iid = r.tgt_doc;
  update pg_temp.owner_edge_resolution r set tgt_law = l.slug
    from library.laws l
   where r.status is null and r.tgt_law is null and l.slug = r.tgt_doc;
  update pg_temp.owner_edge_resolution r set tgt_key = 'decree:' || d.id::text
    from library.decrees_circulars d
   where r.status is null and r.tgt_law is null and r.edge_type <> 'INTERPRETS_ARTICLE' and d.id::text = r.tgt_doc;
  update pg_temp.owner_edge_resolution set status = 'target_doc_unknown'
   where status is null and tgt_law is null and tgt_key is null;

  -- the article by (law, merged regulation, printed number); never picked when ambiguous
  with by_num as (
    select a.law_slug, coalesce(a.regulation_ref, '') as rr, a.number, pg_catalog.min(a.id) as id, pg_catalog.count(*) as n
      from library.articles a
     where a.law_slug in (select x.tgt_law from pg_temp.owner_edge_resolution x where x.status is null and x.tgt_law is not null)
     group by 1, 2, 3
  )
  update pg_temp.owner_edge_resolution r
     set article_id = case when b.n = 1 then b.id end
    from by_num b
   where r.status is null and r.tgt_law is not null and r.tgt_article is not null
     and b.law_slug = r.tgt_law and b.rr = coalesce(r.tgt_regref, '') and b.number = r.tgt_article;
  -- Q132: an article that cannot be pinned → the law itself (the reader opens the document)
  update pg_temp.owner_edge_resolution
     set tgt_key = case when article_id is not null then 'article:' || article_id else 'law:' || tgt_law end,
         doc_level = (article_id is null and edge_type <> 'SUPERSEDES_LAW')
   where status is null and tgt_law is not null;

  update pg_temp.owner_edge_resolution set status = 'self_link'
   where status is null and src_key = tgt_key;

  -- ── both graph nodes must exist ──
  update pg_temp.owner_edge_resolution r set status = 'node_missing'
   where r.status is null
     and (not exists (select 1 from library_graph.nodes n where n.node_key = r.src_key)
          or not exists (select 1 from library_graph.nodes n where n.node_key = r.tgt_key));
  update pg_temp.owner_edge_resolution
     set status = case when doc_level then 'resolved_doc' else 'resolved' end
   where status is null;

  -- ── write the statuses back (only what changed) ──
  update library_graph.owner_edges o
     set resolve_status      = r.status,
         resolved_source_key = case when r.status in ('resolved', 'resolved_doc') then r.src_key end,
         resolved_target_key = case when r.status in ('resolved', 'resolved_doc') then r.tgt_key end,
         resolved_at         = pg_catalog.now()
    from pg_temp.owner_edge_resolution r
   where o.edge_id = r.edge_id
     and (o.resolve_status, o.resolved_source_key, o.resolved_target_key)
         is distinct from (r.status,
                           case when r.status in ('resolved', 'resolved_doc') then r.src_key end,
                           case when r.status in ('resolved', 'resolved_doc') then r.tgt_key end);
  get diagnostics v_changed = row_count;

  -- ── reconcile library_graph.edges: the desired set ──
  drop table if exists pg_temp.owner_edge_desired;
  create temporary table owner_edge_desired on commit drop as
  select r.src_key as source_key,
         r.tgt_key as target_key,
         r.edge_type,
         (pg_catalog.array_agg(r.evidence order by r.edge_id))[1] as evidence,
         pg_catalog.jsonb_build_object(
           'source', 'owner_edges',
           'edge_id', pg_catalog.min(r.edge_id),
           'edge_ids', pg_catalog.to_jsonb(pg_catalog.array_agg(r.edge_id order by r.edge_id)),
           'owner_types', pg_catalog.to_jsonb(pg_catalog.array_agg(distinct r.type)),
           -- for staff only: the reader never shows it (Q132)
           'quality', case when pg_catalog.bool_and(r.quality = 'ok') then 'ok' else 'flagged' end,
           'doc_level', pg_catalog.bool_or(r.doc_level),
           'article_check', (pg_catalog.array_agg(r.article_check order by r.edge_id))[1]
         ) as metadata
    from pg_temp.owner_edge_resolution r
   where r.status in ('resolved', 'resolved_doc')
   group by 1, 2, 3;

  delete from library_graph.edges e
   where e.origin = 'owner_curated'
     and e.metadata->>'source' = 'owner_edges'
     and not exists (select 1 from pg_temp.owner_edge_desired d
                      where d.source_key = e.source_key and d.target_key = e.target_key and d.edge_type = e.edge_type);
  get diagnostics v_removed = row_count;

  -- An automatic edge on the same pair is taken over (the watchdog never
  -- overwrites owner_curated); it is the same link, now his.
  insert into library_graph.edges as e (source_key, target_key, edge_type, origin, weight, evidence, metadata, updated_at)
  select d.source_key, d.target_key, d.edge_type, 'owner_curated', 1.0, d.evidence, d.metadata, pg_catalog.now()
    from pg_temp.owner_edge_desired d
  on conflict (source_key, target_key, edge_type) do update set
    origin     = 'owner_curated',
    weight     = excluded.weight,
    evidence   = excluded.evidence,
    metadata   = excluded.metadata,
    updated_at = excluded.updated_at
  where (e.origin, e.evidence, e.metadata) is distinct from ('owner_curated', excluded.evidence, excluded.metadata);
  get diagnostics v_upserted = row_count;

  select coalesce(pg_catalog.jsonb_object_agg(s.status, s.n), '{}'::jsonb)
    into v_status
    from (select r.status, pg_catalog.count(*) as n from pg_temp.owner_edge_resolution r group by 1) s;

  return pg_catalog.jsonb_build_object(
    'owner_edges', (select pg_catalog.count(*) from pg_temp.owner_edge_resolution),
    'by_status', v_status,
    'graph_edges', (select pg_catalog.count(*) from pg_temp.owner_edge_desired),
    'upserted', v_upserted,
    'removed', v_removed,
    'status_changed', v_changed
  );
end;
$$;

revoke all on function public.graph_rag_resolve_owner_edges() from public, anon, authenticated;
grant execute on function public.graph_rag_resolve_owner_edges() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ب34: the daily broken-reference check
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists library_graph.link_checks (
  id          bigint generated always as identity primary key,
  checked_at  timestamptz not null default now(),
  broken      integer not null default 0 check (broken >= 0),
  summary     jsonb not null default '{}'::jsonb
);
create index if not exists idx_lg_link_checks_at on library_graph.link_checks (checked_at desc);

comment on table library_graph.link_checks is
  'File 10 ب34 (batch l12): one row per broken-reference check (graph_rag_link_check_run, daily cron). Server-only. Added by 20261202_30.';

alter table library_graph.link_checks enable row level security;
alter table library_graph.link_checks force row level security;
revoke all on table library_graph.link_checks from public, anon, authenticated;
grant select, insert, delete on table library_graph.link_checks to service_role;

-- Read-only: what is broken now. "Broken" = a graph node that carries a reader
-- link (any type but the outline) while its library row — or the document that
-- holds it — no longer exists. The reader already shows such a link as its
-- document (or drops it); this list is for the team to fix the data.
create or replace function public.graph_rag_link_check(p_sample integer default 50)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_sample integer := least(greatest(coalesce(p_sample, 50), 0), 200);
  v_result jsonb;
begin
  with linked as (
    select distinct k.node_key
      from (
        select e.source_key as node_key from library_graph.edges e
         where e.edge_type not in ('PART_OF', 'NEXT_ARTICLE', 'HAS_CONCEPT', 'DEFINES_TERM', 'DECONSTRUCTS_CONCEPT', 'ESTABLISHES_RULE')
        union
        select e.target_key from library_graph.edges e
         where e.edge_type not in ('PART_OF', 'NEXT_ARTICLE', 'HAS_CONCEPT', 'DEFINES_TERM', 'DECONSTRUCTS_CONCEPT', 'ESTABLISHES_RULE')
      ) k
  ),
  nodes as (
    select n.node_key, n.node_type, n.title, n.law_slug, n.collection_id,
           pg_catalog.substr(n.node_key, pg_catalog.strpos(n.node_key, ':') + 1) as id
      from linked l
      join library_graph.nodes n on n.node_key = l.node_key
     where n.node_type in ('article', 'law', 'principle', 'decree')
  ),
  broken as (
    select x.node_key, x.node_type, x.title, x.law_slug,
           case
             when x.node_type = 'article' and not exists (select 1 from library.laws l where l.slug = x.law_slug) then 'document_gone'
             when x.node_type = 'article' and not exists (select 1 from library.articles a where a.id = x.id) then 'article_gone'
             when x.node_type = 'law' and not exists (select 1 from library.laws l where l.slug = coalesce(x.law_slug, x.id)) then 'document_gone'
             when x.node_type = 'principle' and not exists (select 1 from library.principles p where p.id = x.id) then 'principle_gone'
             when x.node_type = 'decree' and not exists (select 1 from library.decrees_circulars d where d.id::text = x.id) then 'document_gone'
           end as reason
      from nodes x
  ),
  bad as (
    select b.*,
           (select pg_catalog.count(*) from library_graph.edges e where e.source_key = b.node_key or e.target_key = b.node_key)::integer as links
      from broken b
     where b.reason is not null
  )
  select pg_catalog.jsonb_build_object(
    'broken', (select pg_catalog.count(*) from bad)::integer,
    'by_reason', coalesce((select pg_catalog.jsonb_object_agg(s.reason, s.n)
                             from (select b.reason, pg_catalog.count(*)::integer as n from bad b group by 1) s), '{}'::jsonb),
    'sample', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                                 'node_key', s.node_key, 'node_type', s.node_type,
                                 'title', pg_catalog.left(s.title, 160), 'law_slug', s.law_slug,
                                 'reason', s.reason, 'links', s.links) order by s.links desc, s.node_key)
                          from (select * from bad order by links desc, node_key limit v_sample) s), '[]'::jsonb),
    'owner_edges', coalesce((select pg_catalog.jsonb_object_agg(o.resolve_status, o.n)
                               from (select resolve_status, pg_catalog.count(*)::integer as n
                                       from library_graph.owner_edges group by 1) o), '{}'::jsonb)
  )
  into v_result;
  return v_result;
end;
$$;

-- The cron's call: re-point the owner's links by their stable ids, then store
-- the check (90 days kept). Returns the stored summary, the previous count and
-- the resolver's answer.
create or replace function public.graph_rag_link_check_run(p_sample integer default 50)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '120s'
as $$
declare
  v_resolve  jsonb;
  v_check    jsonb;
  v_previous integer;
  v_id       bigint;
begin
  v_resolve := public.graph_rag_resolve_owner_edges();
  v_check := public.graph_rag_link_check(p_sample);
  select c.broken into v_previous from library_graph.link_checks c order by c.checked_at desc, c.id desc limit 1;
  insert into library_graph.link_checks (broken, summary)
  values (coalesce((v_check->>'broken')::integer, 0),
          v_check || pg_catalog.jsonb_build_object('resolver', v_resolve))
  returning id into v_id;
  delete from library_graph.link_checks where checked_at < pg_catalog.now() - interval '90 days';
  return pg_catalog.jsonb_build_object(
    'id', v_id,
    'broken', coalesce((v_check->>'broken')::integer, 0),
    'previous_broken', v_previous,
    'by_reason', v_check->'by_reason',
    'owner_edges', v_check->'owner_edges',
    'resolver', v_resolve
  );
end;
$$;

create or replace function public.graph_rag_link_check_history(p_limit integer default 14)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'id', c.id, 'checked_at', c.checked_at, 'broken', c.broken,
           'by_reason', c.summary->'by_reason', 'owner_edges', c.summary->'owner_edges',
           'sample', c.summary->'sample') order by c.checked_at desc, c.id desc), '[]'::jsonb)
    from (select * from library_graph.link_checks
           order by checked_at desc, id desc
           limit least(greatest(coalesce(p_limit, 14), 1), 60)) c;
$$;

revoke all on function public.graph_rag_link_check(integer) from public, anon, authenticated;
revoke all on function public.graph_rag_link_check_run(integer) from public, anon, authenticated;
revoke all on function public.graph_rag_link_check_history(integer) from public, anon, authenticated;
grant execute on function public.graph_rag_link_check(integer) to service_role;
grant execute on function public.graph_rag_link_check_run(integer) to service_role;
grant execute on function public.graph_rag_link_check_history(integer) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. verify
-- ─────────────────────────────────────────────────────────────────────────────
do $verify$
declare
  r text;
  f text;
begin
  foreach f in array array['public.graph_rag_law_article_links(text, integer, text[])', 'public.graph_rag_resolve_owner_edges()',
                           'public.graph_rag_link_check(integer)', 'public.graph_rag_link_check_run(integer)',
                           'public.graph_rag_link_check_history(integer)'] loop
    if to_regprocedure(f) is null then
      raise exception 'l12_lib_links verify: % missing', f;
    end if;
    if not (select p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      raise exception 'l12_lib_links verify: % has no empty search_path', f;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'l12_lib_links verify: % can EXECUTE %', r, f;
      end if;
    end loop;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'l12_lib_links verify: service_role cannot EXECUTE %', f;
    end if;
  end loop;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = 'library_graph.link_checks'::regclass) then
    raise exception 'l12_lib_links verify: RLS is not enabled and forced on library_graph.link_checks';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'library_graph.link_checks', 'SELECT') or has_table_privilege(r, 'library_graph.link_checks', 'INSERT') then
      raise exception 'l12_lib_links verify: % holds a privilege on library_graph.link_checks', r;
    end if;
  end loop;
  if pg_catalog.pg_get_functiondef('public.graph_rag_resolve_owner_edges()'::regprocedure) like '%''held_flagged'' where status is null%' then
    raise exception 'l12_lib_links verify: the resolver still holds flagged links out of the graph';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'library_graph.owner_edges'::regclass and conname = 'owner_edges_resolve_status_check'
                    and pg_catalog.pg_get_constraintdef(oid) like '%resolved_doc%') then
    raise exception 'l12_lib_links verify: owner_edges does not accept resolved_doc';
  end if;
  raise notice 'l12_lib_links verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261202_30 library links (law-wide links read; owner links as ordinary links + amendment/repeal/replacement merge + document fallback; daily broken-reference check)' as migration,
       to_regprocedure('public.graph_rag_law_article_links(text, integer, text[])') is not null
       and to_regprocedure('public.graph_rag_link_check_run(integer)') is not null
       and to_regclass('library_graph.link_checks') is not null
       and not has_function_privilege('anon', 'public.graph_rag_law_article_links(text, integer, text[])', 'EXECUTE')
       as ok;
