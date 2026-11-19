-- =============================================================================
-- Migration: 20261130_40_library_owner_edges.sql   (verify id: l10_owner_edges)
-- =============================================================================
-- PURPOSE
--   Owner file 19 Nov 2026 §2 («جدول علاقات مستقل بمعرّف edge_id») and §3/§5
--   (merge his principle → article links, «مبدأ قضائي يستند لمادة», after his
--   four fixes). His links are kept in their OWN table, keyed by HIS edge_id,
--   never mixed with ours, and can be withdrawn at any time:
--
--   library_graph.owner_edges          one row per link of his export
--                                      (scripts/library-owner-edges.mjs writes it)
--   library_graph.owner_edges_deleted  his deletion list (edge ids)
--   public.graph_rag_resolve_owner_edges()
--       maps each row's stable ids to our node keys and reconciles
--       library_graph.edges: every resolvable row with quality = ok becomes ONE
--       INTERPRETS_ARTICLE edge (principle → article) with origin
--       'owner_curated' and metadata {source:'owner_edges', edge_id, edge_ids,
--       quality, article_check}; an owner edge that no longer resolves, was
--       deleted, or left the table is removed from library_graph.edges. Nothing
--       is guessed: zero or several matches is a status, never a pick.
--   public.graph_rag_owner_edges_load(p_rows jsonb, p_source_sha256 text)
--   public.graph_rag_owner_edges_retire(p_source_sha256 text)
--   public.graph_rag_owner_edges_mark_deleted(p_edge_ids jsonb)
--       the importer's three writes (library_graph is not exposed to the API).
--
--   Why a re-resolve every pass: library_graph.edges cascade-delete with their
--   node, so an article re-key (a «مكرر» id, a renamed file) silently dropped
--   any curated edge (20261116_10 comment). The watchdog now calls the resolver
--   after every prune (src/lib/ai/graphWatchdogCore.ts), and the resolver works
--   from the owner's stable ids, so the edge comes back on the new key.
--
-- RESOLUTION (gap report l10 §3; ids looked up in tables, never built)
--   source  from_doc = the collection's frontmatter id
--             → library.judicial_collections.id, else .metadata->>'id' (unique)
--             + from_principle = the PRINCIPLE_START number
--             → library.principles of that collection with that
--               principle_number (unique), else the id <coll>__pr-<number>.
--           a standalone ruling (no collection of that id): principles.id =
--           from_doc, else principles.metadata->>'id' = from_doc (unique).
--   target  to_doc = the law file's id → library.laws.instrument_id, else slug
--             + to_article (number as printed: «5», «23 مكرر»)
--             + to_regulation_ref (merged regulation; NULL = the law's own text)
--             → library.articles (law_slug, number, regulation_ref) — needs
--               20261130_30 and a load with the l10 parser.
--   then both graph nodes must exist (principle:<id>, article:<id>).
--   Statuses: resolved, held_flagged (quality = flagged: kept OUT of the graph
--   until the owner decides how a reader sees them), deleted, type_not_merged,
--   source_doc_unknown, source_doc_ambiguous, source_principle_missing,
--   source_principle_ambiguous, source_principle_not_found, target_doc_unknown,
--   target_article_missing, target_article_ambiguous, target_article_not_found,
--   regulation_not_in_attached_block (the law has no article carrying that
--   regulation_ref: the regulation is an inline REGULATION series, or the law
--   was not re-loaded with the l10 parser yet), node_missing (resolved in the
--   library, graph not synced yet), pending (not resolved yet).
--
-- SECURITY
--   Both tables: RLS on and forced, no policy, no privilege for anon /
--   authenticated (server-only, like the rest of library_graph). The four
--   functions: security definer, search_path = '', EXECUTE revoked from
--   public / anon / authenticated, granted to service_role only.
--
-- RUN ORDER
--   * AFTER 20261130_30 (the resolver reads library.articles.regulation_ref;
--     this file stops with an error without it), and after the graph chain
--     (20261110_10 … 20261121_10).
--   * Deploy order is free: the watchdog tolerates the resolver's absence
--     (PGRST202 / 42883) and the importer is a script.
--   * Nothing is merged until the importer loads his RE-EXPORTED file with
--     --apply (it then calls the resolver once).
--
-- RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261130_40_library_owner_edges.sql
--   → NOTICE  l10_owner_edges verify: OK   and a final row with ok = t.
--   Then supabase/migrations/_verify.sql section verify:l10_owner_edges.
--
-- ROLLBACK (his links leave the graph; his file still holds them):
--   begin;
--     delete from library_graph.edges where origin = 'owner_curated' and metadata->>'source' = 'owner_edges';
--     drop function if exists public.graph_rag_resolve_owner_edges();
--     drop function if exists public.graph_rag_owner_edges_load(jsonb, text);
--     drop function if exists public.graph_rag_owner_edges_retire(text);
--     drop function if exists public.graph_rag_owner_edges_mark_deleted(jsonb);
--     drop table if exists library_graph.owner_edges_deleted;
--     drop table if exists library_graph.owner_edges;
--   commit;
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- 0. what this file builds on must be in force
do $$
begin
  if to_regclass('library_graph.edges') is null or to_regclass('library_graph.nodes') is null then
    raise exception '20261130_40: library_graph.edges / nodes missing — apply the graph chain (20261110_10 …) first';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute
     where attrelid = 'library.articles'::regclass and attname = 'regulation_ref' and not attisdropped
  ) then
    raise exception '20261130_40: library.articles.regulation_ref missing — apply 20261130_30 first';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'library_graph.edges'::regclass and conname = 'edges_origin_check'
       and pg_catalog.pg_get_constraintdef(oid) like '%owner_curated%'
  ) then
    raise exception '20261130_40: library_graph.edges does not accept origin owner_curated — apply 20261116_10 first';
  end if;
end $$;

-- 1. his links, keyed by his edge_id
create table if not exists library_graph.owner_edges (
  edge_id             text primary key check (edge_id ~ '^[0-9a-f]{16}$'),
  type                text not null check (type ~ '^[a-z_]{3,40}$'),
  from_doc            text not null check (pg_catalog.btrim(from_doc) <> '' and pg_catalog.char_length(from_doc) <= 200),
  from_principle      text check (pg_catalog.char_length(from_principle) <= 50),
  from_article        text check (pg_catalog.char_length(from_article) <= 50),
  from_regulation_ref text check (pg_catalog.char_length(from_regulation_ref) <= 500),
  to_doc              text not null check (pg_catalog.btrim(to_doc) <> '' and pg_catalog.char_length(to_doc) <= 200),
  to_article          text check (pg_catalog.char_length(to_article) <= 50),
  to_regulation_ref   text check (pg_catalog.char_length(to_regulation_ref) <= 500),
  to_principle        text check (pg_catalog.char_length(to_principle) <= 50),
  quality             text not null check (quality in ('ok', 'flagged')),
  article_check       text check (pg_catalog.char_length(article_check) <= 200),
  evidence            text check (pg_catalog.char_length(evidence) <= 300),
  source_sha256       text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  loaded_at           timestamptz not null default now(),
  resolve_status      text not null default 'pending' check (resolve_status in (
                        'pending', 'resolved', 'held_flagged', 'deleted', 'type_not_merged',
                        'source_doc_unknown', 'source_doc_ambiguous', 'source_principle_missing',
                        'source_principle_ambiguous', 'source_principle_not_found',
                        'target_doc_unknown', 'target_article_missing', 'target_article_ambiguous',
                        'target_article_not_found', 'regulation_not_in_attached_block', 'node_missing')),
  resolved_source_key text,
  resolved_target_key text,
  resolved_at         timestamptz
);

create index if not exists idx_lg_owner_edges_status on library_graph.owner_edges (resolve_status);

comment on table library_graph.owner_edges is
  'Owner file 19 Nov 2026 §2/§3: the owner''s graph links, keyed by HIS edge_id, written only by scripts/library-owner-edges.mjs. public.graph_rag_resolve_owner_edges() maps them to node keys and reconciles library_graph.edges (origin owner_curated). Server-only. Added by 20261130_40.';

create table if not exists library_graph.owner_edges_deleted (
  edge_id    text primary key check (edge_id ~ '^[0-9a-f]{16}$'),
  deleted_at timestamptz not null default now()
);

comment on table library_graph.owner_edges_deleted is
  'The owner''s deletion list (edge ids). An id here is never in library_graph.edges, whatever owner_edges holds. Server-only. Added by 20261130_40.';

-- 2. server-only
alter table library_graph.owner_edges enable row level security;
alter table library_graph.owner_edges force row level security;
alter table library_graph.owner_edges_deleted enable row level security;
alter table library_graph.owner_edges_deleted force row level security;
revoke all on table library_graph.owner_edges from public, anon, authenticated;
revoke all on table library_graph.owner_edges_deleted from public, anon, authenticated;
grant all on table library_graph.owner_edges to service_role;
grant all on table library_graph.owner_edges_deleted to service_role;

-- 3. the resolver
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
  select o.edge_id, o.type, o.from_doc, o.from_principle, o.to_doc, o.to_article, o.to_regulation_ref,
         o.quality, o.article_check, o.evidence,
         (d.edge_id is not null) as is_deleted,
         null::text as coll_id, null::text as principle_id, null::text as law_slug, null::text as article_id,
         null::text as status
    from library_graph.owner_edges o
    left join library_graph.owner_edges_deleted d on d.edge_id = o.edge_id;

  update pg_temp.owner_edge_resolution set status = 'deleted' where is_deleted;
  update pg_temp.owner_edge_resolution set status = 'type_not_merged' where status is null and type <> 'cites_article';
  update pg_temp.owner_edge_resolution set status = 'held_flagged' where status is null and quality <> 'ok';

  -- ── source: the collection, by id, else by its frontmatter id (unique) ──
  update pg_temp.owner_edge_resolution r set coll_id = c.id
    from library.judicial_collections c
   where r.status is null and c.id = r.from_doc;
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
   where r.status is null and r.coll_id is null and m.mid = r.from_doc;

  -- a collection: the principle by its number (unique), else by the plain id
  update pg_temp.owner_edge_resolution set status = 'source_principle_missing'
   where status is null and coll_id is not null and from_principle is null;
  with by_num as (
    select p.collection_id, pg_catalog.btrim(p.principle_number) as num, pg_catalog.min(p.id) as id, pg_catalog.count(*) as n
      from library.principles p
     group by 1, 2
  )
  update pg_temp.owner_edge_resolution r
     set principle_id = case when b.n = 1 then b.id end,
         status       = case when b.n > 1 then 'source_principle_ambiguous' end
    from by_num b
   where r.status is null and r.coll_id is not null
     and b.collection_id = r.coll_id and b.num = r.from_principle;
  update pg_temp.owner_edge_resolution r set principle_id = p.id
    from library.principles p
   where r.status is null and r.coll_id is not null and r.principle_id is null
     and p.collection_id = r.coll_id and p.id = r.coll_id || '__pr-' || r.from_principle;
  update pg_temp.owner_edge_resolution set status = 'source_principle_not_found'
   where status is null and coll_id is not null and principle_id is null;

  -- a standalone ruling: the principle row itself, by id, else by its frontmatter id (unique)
  update pg_temp.owner_edge_resolution r set principle_id = p.id
    from library.principles p
   where r.status is null and r.coll_id is null and p.id = r.from_doc;
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
   where r.status is null and r.coll_id is null and r.principle_id is null and m.mid = r.from_doc;
  update pg_temp.owner_edge_resolution set status = 'source_doc_unknown'
   where status is null and principle_id is null;

  -- ── target: the law by its file id (instrument_id), else by slug ──
  update pg_temp.owner_edge_resolution r set law_slug = l.slug
    from library.laws l
   where r.status is null and l.instrument_id = r.to_doc;
  update pg_temp.owner_edge_resolution r set law_slug = l.slug
    from library.laws l
   where r.status is null and r.law_slug is null and l.slug = r.to_doc;
  update pg_temp.owner_edge_resolution set status = 'target_doc_unknown'
   where status is null and law_slug is null;
  update pg_temp.owner_edge_resolution set status = 'target_article_missing'
   where status is null and (to_article is null or pg_catalog.btrim(to_article) = '');

  -- the article by (law, merged regulation, printed number)
  with by_num as (
    select a.law_slug, coalesce(a.regulation_ref, '') as rr, a.number, pg_catalog.min(a.id) as id, pg_catalog.count(*) as n
      from library.articles a
     where a.law_slug in (select x.law_slug from pg_temp.owner_edge_resolution x where x.status is null)
     group by 1, 2, 3
  )
  update pg_temp.owner_edge_resolution r
     set article_id = case when b.n = 1 then b.id end,
         status     = case when b.n > 1 then 'target_article_ambiguous' end
    from by_num b
   where r.status is null and b.law_slug = r.law_slug
     and b.rr = coalesce(r.to_regulation_ref, '') and b.number = r.to_article;
  update pg_temp.owner_edge_resolution r set status = 'regulation_not_in_attached_block'
   where r.status is null and r.article_id is null and r.to_regulation_ref is not null
     and not exists (select 1 from library.articles a
                      where a.law_slug = r.law_slug and a.regulation_ref = r.to_regulation_ref);
  update pg_temp.owner_edge_resolution set status = 'target_article_not_found'
   where status is null and article_id is null;

  -- ── both graph nodes must exist ──
  update pg_temp.owner_edge_resolution r set status = 'node_missing'
   where r.status is null
     and (not exists (select 1 from library_graph.nodes n where n.node_key = 'principle:' || r.principle_id)
          or not exists (select 1 from library_graph.nodes n where n.node_key = 'article:' || r.article_id));
  update pg_temp.owner_edge_resolution set status = 'resolved' where status is null;

  -- ── write the statuses back (only what changed) ──
  update library_graph.owner_edges o
     set resolve_status      = r.status,
         resolved_source_key = case when r.status = 'resolved' then 'principle:' || r.principle_id end,
         resolved_target_key = case when r.status = 'resolved' then 'article:' || r.article_id end,
         resolved_at         = pg_catalog.now()
    from pg_temp.owner_edge_resolution r
   where o.edge_id = r.edge_id
     and (o.resolve_status, o.resolved_source_key, o.resolved_target_key)
         is distinct from (r.status,
                           case when r.status = 'resolved' then 'principle:' || r.principle_id end,
                           case when r.status = 'resolved' then 'article:' || r.article_id end);
  get diagnostics v_changed = row_count;

  -- ── reconcile library_graph.edges: the desired set ──
  drop table if exists pg_temp.owner_edge_desired;
  create temporary table owner_edge_desired on commit drop as
  select 'principle:' || r.principle_id as source_key,
         'article:' || r.article_id as target_key,
         'INTERPRETS_ARTICLE'::text as edge_type,
         (pg_catalog.array_agg(r.evidence order by r.edge_id))[1] as evidence,
         pg_catalog.jsonb_build_object(
           'source', 'owner_edges',
           'edge_id', pg_catalog.min(r.edge_id),
           'edge_ids', pg_catalog.to_jsonb(pg_catalog.array_agg(r.edge_id order by r.edge_id)),
           'quality', 'ok',
           'article_check', (pg_catalog.array_agg(r.article_check order by r.edge_id))[1]
         ) as metadata
    from pg_temp.owner_edge_resolution r
   where r.status = 'resolved'
   group by 1, 2;

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

-- 4. the importer's writes
create or replace function public.graph_rag_owner_edges_load(p_rows jsonb, p_source_sha256 text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_rows is null or pg_catalog.jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a jsonb array';
  end if;
  if pg_catalog.jsonb_array_length(p_rows) > 1000 then
    raise exception 'batch size exceeds 1000 owner edges';
  end if;
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'p_source_sha256 must be 64 lowercase hex characters';
  end if;

  insert into library_graph.owner_edges as o (
    edge_id, type, from_doc, from_principle, from_article, from_regulation_ref,
    to_doc, to_article, to_regulation_ref, to_principle, quality, article_check, evidence,
    source_sha256, loaded_at, resolve_status, resolved_source_key, resolved_target_key, resolved_at)
  select r->>'edge_id', r->>'type', r->>'from_doc', nullif(r->>'from_principle', ''), nullif(r->>'from_article', ''),
         nullif(r->>'from_regulation_ref', ''), r->>'to_doc', nullif(r->>'to_article', ''),
         nullif(r->>'to_regulation_ref', ''), nullif(r->>'to_principle', ''), r->>'quality',
         nullif(r->>'article_check', ''), nullif(r->>'evidence', ''),
         p_source_sha256, pg_catalog.now(), 'pending', null, null, null
    from pg_catalog.jsonb_array_elements(p_rows) as r
  on conflict (edge_id) do update set
    type                = excluded.type,
    from_doc            = excluded.from_doc,
    from_principle      = excluded.from_principle,
    from_article        = excluded.from_article,
    from_regulation_ref = excluded.from_regulation_ref,
    to_doc              = excluded.to_doc,
    to_article          = excluded.to_article,
    to_regulation_ref   = excluded.to_regulation_ref,
    to_principle        = excluded.to_principle,
    quality             = excluded.quality,
    article_check       = excluded.article_check,
    evidence            = excluded.evidence,
    source_sha256       = excluded.source_sha256,
    loaded_at           = excluded.loaded_at,
    resolve_status      = 'pending',
    resolved_source_key = null,
    resolved_target_key = null,
    resolved_at         = null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Rows of an older export that are not in this one leave (his file is the
-- whole set). Called by the importer only after every batch was stored.
create or replace function public.graph_rag_owner_edges_retire(p_source_sha256 text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_source_sha256 is null or p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'p_source_sha256 must be 64 lowercase hex characters';
  end if;
  if not exists (select 1 from library_graph.owner_edges where source_sha256 = p_source_sha256) then
    raise exception 'no owner edge carries source %: load the file first, nothing was retired', p_source_sha256;
  end if;
  delete from library_graph.owner_edges where source_sha256 <> p_source_sha256;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.graph_rag_owner_edges_mark_deleted(p_edge_ids jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if p_edge_ids is null or pg_catalog.jsonb_typeof(p_edge_ids) <> 'array' then
    raise exception 'p_edge_ids must be a jsonb array';
  end if;
  insert into library_graph.owner_edges_deleted (edge_id)
  select pg_catalog.jsonb_array_elements_text(p_edge_ids)
  on conflict (edge_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.graph_rag_resolve_owner_edges() from public, anon, authenticated;
revoke all on function public.graph_rag_owner_edges_load(jsonb, text) from public, anon, authenticated;
revoke all on function public.graph_rag_owner_edges_retire(text) from public, anon, authenticated;
revoke all on function public.graph_rag_owner_edges_mark_deleted(jsonb) from public, anon, authenticated;
grant execute on function public.graph_rag_resolve_owner_edges() to service_role;
grant execute on function public.graph_rag_owner_edges_load(jsonb, text) to service_role;
grant execute on function public.graph_rag_owner_edges_retire(text) to service_role;
grant execute on function public.graph_rag_owner_edges_mark_deleted(jsonb) to service_role;

-- 5. verify
do $verify$
declare
  r text;
  f text;
  t text;
begin
  foreach t in array array['library_graph.owner_edges', 'library_graph.owner_edges_deleted'] loop
    if to_regclass(t) is null then
      raise exception 'l10_owner_edges verify: % missing', t;
    end if;
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = t::regclass) then
      raise exception 'l10_owner_edges verify: RLS is not enabled and forced on %', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT')
         or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE') then
        raise exception 'l10_owner_edges verify: % holds a privilege on %', r, t;
      end if;
    end loop;
    if not has_table_privilege('service_role', t, 'SELECT') or not has_table_privilege('service_role', t, 'INSERT') then
      raise exception 'l10_owner_edges verify: service_role cannot read / write %', t;
    end if;
  end loop;
  foreach f in array array['public.graph_rag_resolve_owner_edges()', 'public.graph_rag_owner_edges_load(jsonb, text)',
                           'public.graph_rag_owner_edges_retire(text)', 'public.graph_rag_owner_edges_mark_deleted(jsonb)'] loop
    if to_regprocedure(f) is null then
      raise exception 'l10_owner_edges verify: % missing', f;
    end if;
    if not (select p.prosecdef and p.proconfig @> array['search_path=""']
              from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      raise exception 'l10_owner_edges verify: % is not security definer with an empty search_path', f;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, f, 'EXECUTE') then
        raise exception 'l10_owner_edges verify: % can EXECUTE %', r, f;
      end if;
    end loop;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception 'l10_owner_edges verify: service_role cannot EXECUTE %', f;
    end if;
  end loop;
  raise notice 'l10_owner_edges verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261130_40 owner edges (library_graph.owner_edges + owner_edges_deleted, server-only; resolver + importer functions, service_role only)' as migration,
       to_regclass('library_graph.owner_edges') is not null
       and to_regclass('library_graph.owner_edges_deleted') is not null
       and to_regprocedure('public.graph_rag_resolve_owner_edges()') is not null
       and not has_function_privilege('anon', 'public.graph_rag_resolve_owner_edges()', 'EXECUTE')
       as ok;
