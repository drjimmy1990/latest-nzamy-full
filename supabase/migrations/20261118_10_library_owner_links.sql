-- =============================================================================
-- Migration: 20261118_10_library_owner_links.sql
-- =============================================================================
-- PURPOSE
--   The graph reads the owner's own links. The owner's files name, in their
--   frontmatter, what replaced or repealed a law (superseded_by, repealed_by),
--   what a law replaced or repealed (supersedes, repeals), which laws and
--   articles an instrument amends (affected_laws) and which laws are related
--   (related_laws). Until now the parser dropped all of it, and the graph only
--   guessed supersession from titles.
--
--   1. library.laws.owner_links and library.decrees_circulars.owner_links
--      (jsonb): the parser normalises those fields into
--      [{kind, name?, slug?, id?, guid?, articles?}] (src/lib/library/ownerLinks.ts)
--      and the seeder writes them on EVERY row (NULL when the file has none),
--      so a link the owner removes is gone after his next load. Never the
--      editorial notes. The graph watchdog resolves each link strictly against
--      the live laws (slug, registry id, BOE guid, then a title that names
--      exactly one law) and writes SUPERSEDES_LAW / AMENDS_ARTICLE edges; what
--      it cannot resolve it counts and logs, it never guesses.
--
--   2. public.graph_rag_refresh_replacements(): a repealed article's
--      REPLACED_BY link (graph_rag_build_similarity) is computed once and not
--      revisited when its law gains or loses a successor. This function keeps
--      the (replaced law → successor law) pairs of the last settled graph in
--      library_graph.replacement_pairs; when the pairs change, it clears the
--      similarity state of the repealed articles of the laws concerned only,
--      so the next similarity pages recompute their REPLACED_BY. The watchdog
--      calls it once before each similarity step. On a graph that is not
--      settled it does nothing (and keeps the old pairs, so the change is seen
--      on the next settled call).
--
-- PRIVILEGES — SERVER-ONLY
--   library.laws (20261004_01) and library.decrees_circulars (20261108_10) are
--   column-locked: a new column is readable by no API role. This file revokes
--   it explicitly too and verifies it. The function and the pairs table are
--   service_role only.
--
-- RUN ORDER
--   After 20261117_10 (required). BEFORE the deploy of this batch's code and
--   BEFORE the owner's next library load: the seeder writes owner_links on
--   every law and decree row, and the owner loader's preflight
--   (ownerLoaderTables.ts requiredColumns) stops with exit 1 before the first
--   write when the column is missing. The deployed watchdog reads the columns
--   only when they exist, so SQL → deploy is safe in that order.
--   Then: the owner re-parses and loads; the graph rebuilds after the load
--   (mark_dirty_now); the replacement refresh is automatic.
--
-- IDEMPOTENT — add column if not exists, create … if not exists, create or
--   replace. The pairs are seeded from the current graph only when the table is
--   empty, so the first refresh reacts to what the owner's links change, not to
--   every pair the graph already had.
--
-- ROLLBACK (only after a code rollback — the seeder writes the key)
--   drop function if exists public.graph_rag_refresh_replacements();
--   drop table if exists library_graph.replacement_pairs;
--   alter table library.laws drop column if exists owner_links;
--   alter table library.decrees_circulars drop column if exists owner_links;
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $$
declare
  t text;
begin
  if to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])') is null
     or to_regclass('library_graph.similarity_state') is null then
    raise exception '20261118_10: apply 20261117_10_library_graph_seeds.sql first';
  end if;
  foreach t in array array['library.laws', 'library.decrees_circulars'] loop
    if to_regclass(t) is null then
      raise exception '20261118_10: % does not exist', t;
    end if;
    if (exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') and has_table_privilege('anon', t, 'SELECT'))
       or (exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') and has_table_privilege('authenticated', t, 'SELECT')) then
      raise exception '20261118_10: anon / authenticated hold table-level SELECT on % — apply its column lock (20261004_01 / 20261108_10) first, or the new column would be readable with the public key', t;
    end if;
  end loop;
end $$;

-- 1. the columns (nullable, no default: no rewrite)
alter table library.laws
  add column if not exists owner_links jsonb;
alter table library.decrees_circulars
  add column if not exists owner_links jsonb;

comment on column library.laws.owner_links is
  '20261118_10: the owner''s own links from the file''s frontmatter (superseded_by, repealed_by, supersedes, repeals, affected_laws, related_laws) — [{kind, name?, slug?, id?, guid?, articles?}], written by the seeder on every load (NULL when the file has none). Read by the graph watchdog only. Server-only (no API-role grant).';
comment on column library.decrees_circulars.owner_links is
  '20261118_10: the owner''s own links from the file''s frontmatter (mostly affected_laws: the laws and articles this instrument amends) — [{kind, name?, slug?, id?, guid?, articles?}], written by the seeder on every load (NULL when the file has none). Read by the graph watchdog only. Server-only (no API-role grant).';

-- 2. never readable by the API roles
do $$
declare
  r text;
  t text;
begin
  foreach t in array array['library.laws', 'library.decrees_circulars'] loop
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
        execute pg_catalog.format('revoke select (owner_links), insert (owner_links), update (owner_links) on %s from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;

-- 3. the (replaced law → successor law) pairs of the last settled graph
create table if not exists library_graph.replacement_pairs (
  target_law text not null,
  succ_law   text not null,
  primary key (target_law, succ_law)
);

alter table library_graph.replacement_pairs enable row level security;
alter table library_graph.replacement_pairs force row level security;
revoke all on table library_graph.replacement_pairs from public, anon, authenticated;
grant select, insert, update, delete on table library_graph.replacement_pairs to service_role;
drop policy if exists lg_service_role_all on library_graph.replacement_pairs;
create policy lg_service_role_all on library_graph.replacement_pairs
  for all to service_role using (true) with check (true);

comment on table library_graph.replacement_pairs is
  '20261118_10: the (replaced law, successor law) pairs of SUPERSEDES_LAW at the last settled graph_rag_refresh_replacements() call. When they change, the repealed articles of the laws concerned get their REPLACED_BY recomputed.';

-- Seed once from the current graph: the similarity states already computed
-- were computed against these pairs.
insert into library_graph.replacement_pairs (target_law, succ_law)
select distinct tn.law_slug, sn.law_slug
  from library_graph.edges e
  join library_graph.nodes tn on tn.node_key = e.target_key
  join library_graph.nodes sn on sn.node_key = e.source_key
 where e.edge_type = 'SUPERSEDES_LAW'
   and tn.law_slug is not null
   and sn.law_slug is not null
   and tn.law_slug <> sn.law_slug
   and not exists (select 1 from library_graph.replacement_pairs)
on conflict do nothing;

-- 4. the refresh
create or replace function public.graph_rag_refresh_replacements()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '60s'
as $$
declare
  v_changed text[];
  v_reset   integer := 0;
begin
  -- Only on a settled graph: during a pass the edges are half-written. The
  -- row lock holds a pass that starts now (start_run updates this row) until
  -- this call commits, so the edges cannot change under the diff.
  perform 1 from library_graph.sync_state s
   where s.id = 1 and s.dirty = false and s.last_synced_at is not null
     for update;
  if not found then
    return pg_catalog.jsonb_build_object('changed_laws', 0, 'reset', 0, 'skipped', 'graph_not_ready');
  end if;

  -- The replaced laws whose successors changed: a pair added OR removed.
  with cur as (
    select distinct tn.law_slug as target_law, sn.law_slug as succ_law
      from library_graph.edges e
      join library_graph.nodes tn on tn.node_key = e.target_key
      join library_graph.nodes sn on sn.node_key = e.source_key
     where e.edge_type = 'SUPERSEDES_LAW'
       and tn.law_slug is not null
       and sn.law_slug is not null
       and tn.law_slug <> sn.law_slug
  ),
  diff as (
    (select c.target_law, c.succ_law from cur c
     except
     select p.target_law, p.succ_law from library_graph.replacement_pairs p)
    union
    (select p.target_law, p.succ_law from library_graph.replacement_pairs p
     except
     select c.target_law, c.succ_law from cur c)
  )
  select pg_catalog.array_agg(distinct d.target_law order by d.target_law) into v_changed
    from diff d;

  if v_changed is null then
    return pg_catalog.jsonb_build_object('changed_laws', 0, 'reset', 0);
  end if;

  -- Their repealed articles lose their state: the next similarity pages
  -- recompute their REPLACED_BY (graph_rag_build_similarity deletes a node's
  -- old auto_similarity edges itself before writing new ones).
  delete from library_graph.similarity_state s
   using library_graph.nodes n
   where n.node_key = s.node_key
     and n.node_type = 'article'
     and n.law_slug = any(v_changed)
     and s.was_active = false;
  get diagnostics v_reset = row_count;

  -- In the same call: the pairs now match the graph.
  delete from library_graph.replacement_pairs;
  insert into library_graph.replacement_pairs (target_law, succ_law)
  select distinct tn.law_slug, sn.law_slug
    from library_graph.edges e
    join library_graph.nodes tn on tn.node_key = e.target_key
    join library_graph.nodes sn on sn.node_key = e.source_key
   where e.edge_type = 'SUPERSEDES_LAW'
     and tn.law_slug is not null
     and sn.law_slug is not null
     and tn.law_slug <> sn.law_slug
  on conflict do nothing;

  return pg_catalog.jsonb_build_object('changed_laws', pg_catalog.cardinality(v_changed), 'reset', v_reset);
end;
$$;

comment on function public.graph_rag_refresh_replacements() is
  '20261118_10: when the SUPERSEDES_LAW pairs (replaced law → successor law) changed since the last settled call, clears the similarity state of the repealed articles of the replaced laws concerned so their REPLACED_BY is recomputed. Does nothing on a graph that is not settled. Returns {changed_laws, reset}. service_role only.';

revoke all on function public.graph_rag_refresh_replacements() from public, anon, authenticated;
grant execute on function public.graph_rag_refresh_replacements() to service_role;

-- 5. verify
do $$
declare
  t       text;
  r       text;
  p       text;
  typ     text;
  missing text := '';
begin
  foreach t in array array['library.laws', 'library.decrees_circulars'] loop
    select pg_catalog.format_type(a.atttypid, a.atttypmod) into typ
      from pg_catalog.pg_attribute a
     where a.attrelid = t::regclass and a.attname = 'owner_links' and not a.attisdropped;
    if typ is distinct from 'jsonb' then
      missing := missing || pg_catalog.format(' %s.owner_links is %s, not jsonb;', t, coalesce(typ, 'missing'));
      continue;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
        foreach p in array array['SELECT', 'INSERT', 'UPDATE'] loop
          if has_column_privilege(r, t, 'owner_links', p) then
            missing := missing || pg_catalog.format(' %s has %s on %s.owner_links;', r, p, t);
          end if;
        end loop;
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      foreach p in array array['SELECT', 'INSERT', 'UPDATE'] loop
        if not has_column_privilege('service_role', t, 'owner_links', p) then
          missing := missing || pg_catalog.format(' service_role lacks %s on %s.owner_links (the loader and the watchdog need it);', p, t);
        end if;
      end loop;
    end if;
  end loop;

  if to_regprocedure('public.graph_rag_refresh_replacements()') is null then
    missing := missing || ' graph_rag_refresh_replacements() missing;';
  else
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r)
         and has_function_privilege(r, 'public.graph_rag_refresh_replacements()', 'EXECUTE') then
        missing := missing || pg_catalog.format(' %s can EXECUTE graph_rag_refresh_replacements;', r);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', 'public.graph_rag_refresh_replacements()', 'EXECUTE') then
      missing := missing || ' service_role cannot EXECUTE graph_rag_refresh_replacements;';
    end if;
  end if;
  -- One function per name: a second overload makes PostgREST answer PGRST203.
  if (select pg_catalog.count(*) from pg_catalog.pg_proc f
       where f.pronamespace = 'public'::regnamespace and f.proname = 'graph_rag_refresh_replacements') <> 1 then
    missing := missing || ' public.graph_rag_refresh_replacements is not exactly one function;';
  end if;

  if to_regclass('library_graph.replacement_pairs') is null then
    missing := missing || ' library_graph.replacement_pairs missing;';
  else
    if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c
             where c.oid = 'library_graph.replacement_pairs'::regclass) then
      missing := missing || ' replacement_pairs has no forced RLS;';
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r)
         and has_table_privilege(r, 'library_graph.replacement_pairs', 'SELECT') then
        missing := missing || pg_catalog.format(' %s can read replacement_pairs;', r);
      end if;
    end loop;
  end if;

  if missing <> '' then
    raise exception '20261118_10 verify:%', missing;
  end if;
  raise notice '20261118_10 verify: OK';
end $$;

-- 6. PostgREST: see the new columns and function now
notify pgrst, 'reload schema';

commit;

-- ── Final check for the SQL editor (it hides NOTICEs): expect ok = true ─────
select '20261118_10 owner links: columns server-only, replacement refresh ready' as check,
       exists (select 1 from information_schema.columns
                where table_schema = 'library' and table_name = 'laws'
                  and column_name = 'owner_links' and data_type = 'jsonb')
       and exists (select 1 from information_schema.columns
                    where table_schema = 'library' and table_name = 'decrees_circulars'
                      and column_name = 'owner_links' and data_type = 'jsonb')
       and not has_column_privilege('anon', 'library.laws', 'owner_links', 'SELECT')
       and not has_column_privilege('anon', 'library.decrees_circulars', 'owner_links', 'SELECT')
       and to_regprocedure('public.graph_rag_refresh_replacements()') is not null
       and not has_function_privilege('anon', 'public.graph_rag_refresh_replacements()', 'EXECUTE')
       as ok;
