-- =============================================================================
-- Migration: 20261126_10_library_reader_links.sql
-- =============================================================================
-- PURPOSE (batch l6-reader, owner TODO N06-40..43 «خريطة التشابك التشريعي»)
--   One read-only function for the law reader's map: the laws a law is linked
--   with through the graph — its articles citing theirs (CITES_ARTICLE,
--   EXEMPTS_FROM, SUBJECT_TO, PENALIZES), theirs citing its, and the law-level
--   relations (PARENT_LAW, SUPERSEDES_LAW, REPLACED_BY, IMPLEMENTED_BY) —
--   counted per linked law, both directions, strongest first.
--
--     public.library_reader_law_links(p_law_slug text, p_limit integer default 24)
--       → {"law_slug", "links": [{slug, title, status, out, in, types}], "truncated"}
--
--   Titles and statuses only: no article text, no evidence (20260929_01). The
--   function is SECURITY INVOKER and executable by service_role only; the
--   reader reaches it through GET /api/library/laws/[slug]/citations?map=1.
--   No table changes. Until it runs the reader's map says «غير متاحة بعد».
--
-- HOW TO RUN: any time, before or after the deploy:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261126_10_library_reader_links.sql
--   Expect: NOTICE  20261126_10 verify: OK  and a row with `t`.
-- RUN ORDER: after 20261116_10_library_graph_links.sql (edge types it reads).
-- ROLLBACK:
--   drop function if exists public.library_reader_law_links(text, integer);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('library_graph.edges') is null or to_regclass('library.laws') is null then
    raise exception '20261126_10: run 20261110_10_library_graph_rag.sql first';
  end if;
  if to_regprocedure('public.graph_rag_explore_neighborhood(text, integer, text[], integer)') is null then
    raise exception '20261126_10: run 20261116_10_library_graph_links.sql first';
  end if;
end
$pre$;

create or replace function public.library_reader_law_links(
  p_law_slug text,
  p_limit    integer default 24
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '8s'
as $$
declare
  v_lim   integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_types text[]  := array['CITES_ARTICLE', 'EXEMPTS_FROM', 'SUBJECT_TO', 'PENALIZES',
                           'PARENT_LAW', 'SUPERSEDES_LAW', 'REPLACED_BY', 'IMPLEMENTED_BY'];
  v_total integer;
  v_links jsonb;
begin
  if p_law_slug is null or pg_catalog.btrim(p_law_slug) = '' then
    return pg_catalog.jsonb_build_object('law_slug', p_law_slug, 'links', '[]'::jsonb, 'truncated', false);
  end if;

  with mine as (
    select n.node_key
      from library_graph.nodes n
     where n.law_slug = p_law_slug
       and n.node_type in ('article', 'law')
  ),
  pairs as (
    -- this law → another law
    select t.law_slug as other_slug, e.edge_type, 1 as out_cnt, 0 as in_cnt
      from mine m
      join library_graph.edges e on e.source_key = m.node_key
      join library_graph.nodes t on t.node_key = e.target_key
     where e.edge_type = any(v_types)
       and t.node_type in ('article', 'law')
       and t.law_slug is not null
       and t.law_slug <> p_law_slug
    union all
    -- another law → this law
    select s.law_slug, e.edge_type, 0, 1
      from mine m
      join library_graph.edges e on e.target_key = m.node_key
      join library_graph.nodes s on s.node_key = e.source_key
     where e.edge_type = any(v_types)
       and s.node_type in ('article', 'law')
       and s.law_slug is not null
       and s.law_slug <> p_law_slug
  ),
  per_law as (
    select p.other_slug,
           pg_catalog.sum(p.out_cnt)::integer as out_cnt,
           pg_catalog.sum(p.in_cnt)::integer  as in_cnt,
           pg_catalog.array_agg(distinct p.edge_type order by p.edge_type) as types
      from pairs p
     group by p.other_slug
  ),
  ranked as (
    select pl.*, pg_catalog.count(*) over () as total
      from per_law pl
     order by pl.out_cnt + pl.in_cnt desc, pl.other_slug
     limit v_lim
  )
  select coalesce(pg_catalog.max(r.total), 0)::integer,
         coalesce(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'slug',   r.other_slug,
             'title',  coalesce(l.title, r.other_slug),
             'status', l.status,
             'out',    r.out_cnt,
             'in',     r.in_cnt,
             'types',  pg_catalog.to_jsonb(r.types)
           )
           order by r.out_cnt + r.in_cnt desc, r.other_slug
         ), '[]'::jsonb)
    into v_total, v_links
    from ranked r
    left join library.laws l on l.slug = r.other_slug;

  return pg_catalog.jsonb_build_object(
    'law_slug',  p_law_slug,
    'links',     v_links,
    'truncated', v_total > v_lim
  );
end;
$$;

comment on function public.library_reader_law_links(text, integer) is
  'Law reader map (20261126_10): laws linked with p_law_slug through citation and law-relation edges, counted both ways. Titles and statuses only. Service role only.';

revoke all on function public.library_reader_law_links(text, integer) from public, anon, authenticated;
grant execute on function public.library_reader_law_links(text, integer) to service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  f text := 'public.library_reader_law_links(text, integer)';
  r text;
begin
  if to_regprocedure(f) is null then
    raise exception '20261126_10 verify: % missing', f;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
      raise exception '20261126_10 verify: % can EXECUTE %', r, f;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception '20261126_10 verify: service_role cannot EXECUTE %', f;
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'library_reader_law_links') <> 1 then
    raise exception '20261126_10 verify: public.library_reader_law_links is not exactly one function';
  end if;
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
    raise exception '20261126_10 verify: % must be SECURITY INVOKER', f;
  end if;
  raise notice '20261126_10 verify: OK';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261126_10 reader law links (map)' as step,
       to_regprocedure('public.library_reader_law_links(text, integer)') is not null as ok;
