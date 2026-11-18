-- =============================================================================
-- Migration: 20261128_60_library_reader_link_types.sql
-- =============================================================================
-- PURPOSE (batch l8-refbox, owner decision ٦٠, 18 Nov 2026)
--   «تظهر فقط الأنواع المتطابقة مع ملف المالك، وتُخفى الباقية من المستكشف
--   وشريط القارئ حتى المراجعة». The reader's law map
--   («خريطة التشابك التشريعي») reads public.library_reader_law_links
--   (20261126_10), whose link types are fixed inside it — six of its eight are
--   types decision ٦٠ hides (CITES_ARTICLE, EXEMPTS_FROM, SUBJECT_TO,
--   PENALIZES, REPLACED_BY, IMPLEMENTED_BY), and its per-law counts and its
--   ranking cannot be split by type afterwards.
--
--   One new read-only function, the same map with the link types passed in:
--
--     public.library_reader_law_links_typed(p_law_slug text, p_types text[], p_limit integer default 24)
--       → {"law_slug", "links": [{slug, title, status, out, in, types}], "truncated"}
--
--   The allow-list itself stays in ONE place, the app
--   (src/lib/library/graphLinkTypes.ts → READER_LINK_TYPES); no type list is
--   written here. A null or empty p_types answers an empty map. Body copied
--   from the LATEST definition of library_reader_law_links (20261126_10, the
--   only one) with v_types := p_types. Titles and statuses only — no article
--   text, no evidence (20260929_01). SECURITY INVOKER, search_path '',
--   statement_timeout 8s, executable by service_role only; the reader reaches
--   it through GET /api/library/laws/[slug]/citations?map=1.
--   No table changes. library_reader_law_links (20261126_10) is left as it is
--   (nothing in the app calls it after this batch; its verify row still holds).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261128_60_library_reader_link_types.sql
--   Expect: NOTICE  20261128_60 verify: OK  and a row with `t`.
-- RUN ORDER: any time, before or after the deploy, after 20261126_10.
--   Before it runs the new code's map says «خريطة التشابك غير متاحة بعد»
--   (honest, and it never shows a hidden type). The links box and the
--   citation chips do not need it.
-- ROLLBACK:
--   drop function if exists public.library_reader_law_links_typed(text, text[], integer);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('library_graph.edges') is null or to_regclass('library.laws') is null then
    raise exception '20261128_60: run 20261110_10_library_graph_rag.sql first';
  end if;
  if to_regprocedure('public.library_reader_law_links(text, integer)') is null then
    raise exception '20261128_60: run 20261126_10_library_reader_links.sql first';
  end if;
end
$pre$;

create or replace function public.library_reader_law_links_typed(
  p_law_slug text,
  p_types    text[],
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
  v_types text[]  := coalesce(p_types, '{}'::text[]);
  v_total integer;
  v_links jsonb;
begin
  if p_law_slug is null or pg_catalog.btrim(p_law_slug) = ''
     or coalesce(pg_catalog.cardinality(v_types), 0) = 0 then
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

comment on function public.library_reader_law_links_typed(text, text[], integer) is
  'Law reader map (20261128_60, decision 60): laws linked with p_law_slug through the given edge types only, counted both ways. Titles and statuses only. Service role only.';

revoke all on function public.library_reader_law_links_typed(text, text[], integer) from public, anon, authenticated;
grant execute on function public.library_reader_law_links_typed(text, text[], integer) to service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  f text := 'public.library_reader_law_links_typed(text, text[], integer)';
  r text;
begin
  if to_regprocedure(f) is null then
    raise exception '20261128_60 verify: % missing', f;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, f, 'EXECUTE') then
      raise exception '20261128_60 verify: % can EXECUTE %', r, f;
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', f, 'EXECUTE') then
    raise exception '20261128_60 verify: service_role cannot EXECUTE %', f;
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = 'library_reader_law_links_typed') <> 1 then
    raise exception '20261128_60 verify: public.library_reader_law_links_typed is not exactly one function';
  end if;
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
    raise exception '20261128_60 verify: % must be SECURITY INVOKER', f;
  end if;
  if pg_catalog.jsonb_array_length(public.library_reader_law_links_typed('x', null, 24)->'links') <> 0 then
    raise exception '20261128_60 verify: null types must answer an empty map';
  end if;
  raise notice '20261128_60 verify: OK';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261128_60 reader law map, shown link types only (decision 60)' as step,
       to_regprocedure('public.library_reader_law_links_typed(text, text[], integer)') is not null as ok;
