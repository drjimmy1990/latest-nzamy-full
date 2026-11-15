-- library_owner_links.test.sql — 20261118_10: owner_links on laws and decrees
-- is server-only; graph_rag_refresh_replacements() resets the REPLACED_BY state
-- of exactly the repealed articles whose law gained or lost a successor.
--
-- CHAIN (needs pgvector; repo root, Git Bash): the library chain up to the
-- column locks (20261004_01 for laws, 20261108_10 for decrees), the graph chain
-- up to 20261117_10, the fixture (a settled graph that exists before this
-- file), 20261118_10 TWICE (idempotent; the second run must not re-seed), both
-- column locks again (their own sweeps must still pass with the new column),
-- the _verify block, then this file. Between the two 20261118_10 runs,
-- prelude_owner_links_between_runs.sql adds law c → law b: the second run
-- must NOT seed it (T1), so the first refresh sees it as a change (T2):
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_library_owner_links_block.sql
--   sed -n '/^-- >>> verify:library_owner_links/,/^-- <<< verify:library_owner_links/p' $M/_verify.sql > "$B"
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
--     $R/prelude_owner_links_graph_fixture.sql \
--     $M/20261118_10_library_owner_links.sql $R/prelude_owner_links_between_runs.sql \
--     $M/20261118_10_library_owner_links.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261108_10_library_decree_tier_columns_lock.sql \
--     "$B" $R/library_owner_links.test.sql
-- NEGATIVE CONTROL: the same chain without 20261004_01 / 20261108_10 → the
-- 20261118_10 precondition stops: «anon / authenticated hold table-level SELECT».
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

grant usage on schema extensions to service_role;

create or replace function pg_temp.pairs() returns text
language sql as $$
  select coalesce(string_agg(target_law || '>' || succ_law, ',' order by target_law, succ_law), '')
    from library_graph.replacement_pairs
$$;
create or replace function pg_temp.states() returns text
language sql as $$
  select coalesce(string_agg(node_key, ',' order by node_key), '')
    from library_graph.similarity_state
$$;

-- T1: seeded once from the graph that existed before the file; the second
-- run did not re-seed (law c → law b, added between the runs, is not in it).
do $$
begin
  if pg_temp.pairs() <> 'a>b' then
    raise exception 'T1 FAIL: seeded pairs %, expected a>b', pg_temp.pairs();
  end if;
  raise notice 'T1 ok: seeded once from the existing graph, not re-seeded';
end $$;

-- T2: law b gained a successor (c) after the seed; b's only article is in
-- force, so nothing is reset, and the pairs catch up.
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":1,"reset":0}'::jsonb then
    raise exception 'T2 FAIL: %', v;
  end if;
  if pg_temp.states() <> 'article:a1,article:a2,article:b1,article:c1' or pg_temp.pairs() <> 'a>b,b>c' then
    raise exception 'T2 FAIL: states % pairs %', pg_temp.states(), pg_temp.pairs();
  end if;
  raise notice 'T2 ok: a change after the seed is seen; in-force articles kept';
end $$;

-- T3: law c gains a successor → only c's repealed article is reset.
insert into library_graph.edges (source_key, target_key, edge_type) values ('law:b', 'law:c', 'SUPERSEDES_LAW');
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":1,"reset":1}'::jsonb then
    raise exception 'T3 FAIL: %', v;
  end if;
  if pg_temp.states() <> 'article:a1,article:a2,article:b1' then
    raise exception 'T3 FAIL: states %', pg_temp.states();
  end if;
  if pg_temp.pairs() <> 'a>b,b>c,c>b' then
    raise exception 'T3 FAIL: pairs %', pg_temp.pairs();
  end if;
  raise notice 'T3 ok: an added pair resets only its law''s repealed articles';
end $$;

-- T4: idempotent.
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":0,"reset":0}'::jsonb then
    raise exception 'T4 FAIL: %', v;
  end if;
  raise notice 'T4 ok: a second call does nothing';
end $$;

-- T5: a removed pair on a graph that is not settled → nothing touched; once
-- settled, the removal is seen; the in-force article of the same law is kept.
delete from library_graph.edges where source_key = 'law:b' and target_key = 'law:a';
update library_graph.sync_state set dirty = true where id = 1;
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v->>'skipped' is distinct from 'graph_not_ready' or (v->>'reset')::int <> 0 then
    raise exception 'T5 FAIL (dirty): %', v;
  end if;
  if pg_temp.pairs() <> 'a>b,b>c,c>b' or pg_temp.states() <> 'article:a1,article:a2,article:b1' then
    raise exception 'T5 FAIL (dirty touched): pairs % states %', pg_temp.pairs(), pg_temp.states();
  end if;
end $$;
update library_graph.sync_state set dirty = false where id = 1;
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":1,"reset":1}'::jsonb then
    raise exception 'T5 FAIL (settled): %', v;
  end if;
  if pg_temp.states() <> 'article:a2,article:b1' or pg_temp.pairs() <> 'b>c,c>b' then
    raise exception 'T5 FAIL (settled): states % pairs %', pg_temp.states(), pg_temp.pairs();
  end if;
  raise notice 'T5 ok: a removed pair is seen once the graph is settled; in-force articles kept';
end $$;

-- T6: a successor swapped (c: b → a) is one changed law, reset once.
insert into library_graph.similarity_state (node_key, model_id, content_sha256, params_key, was_active)
values ('article:c1', 'test-model', repeat('4', 64), 'v2', false);
delete from library_graph.edges where source_key = 'law:b' and target_key = 'law:c';
insert into library_graph.edges (source_key, target_key, edge_type) values ('law:a', 'law:c', 'SUPERSEDES_LAW');
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":1,"reset":1}'::jsonb then
    raise exception 'T6 FAIL: %', v;
  end if;
  if pg_temp.pairs() <> 'b>c,c>a' then
    raise exception 'T6 FAIL: pairs %', pg_temp.pairs();
  end if;
  raise notice 'T6 ok: a swapped successor counts its law once';
end $$;

-- T7: an edge inside one law is not a replacement.
insert into library_graph.edges (source_key, target_key, edge_type) values ('article:a2', 'law:a', 'SUPERSEDES_LAW');
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":0,"reset":0}'::jsonb or pg_temp.pairs() <> 'b>c,c>a' then
    raise exception 'T7 FAIL: % pairs %', v, pg_temp.pairs();
  end if;
  raise notice 'T7 ok: a same-law edge is ignored';
end $$;

-- T8: the API roles read and write none of it; service_role does.
do $$
declare
  r text;
  q text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach q in array array[
      'select owner_links from library.laws limit 1',
      'select owner_links from library.decrees_circulars limit 1',
      'update library.laws set owner_links = null where false',
      'select public.graph_rag_refresh_replacements()',
      'select 1 from library_graph.replacement_pairs limit 1'
    ] loop
      begin
        execute pg_catalog.format('set local role %I', r);
        execute q;
        reset role;
        raise exception 'T8 FAIL: % could run: %', r, q;
      exception when insufficient_privilege then
        reset role;
      end;
    end loop;
  end loop;
  raise notice 'T8 ok: anon / authenticated are refused';
end $$;

-- A real change for service_role: law b replaces law a again.
insert into library_graph.edges (source_key, target_key, edge_type) values ('law:b', 'law:a', 'SUPERSEDES_LAW');
insert into library_graph.similarity_state (node_key, model_id, content_sha256, params_key, was_active)
values ('article:a1', 'test-model', repeat('1', 64), 'v2', false);

set role service_role;
select owner_links from library.laws limit 1;
select owner_links from library.decrees_circulars limit 1;
do $$
declare v jsonb;
begin
  v := public.graph_rag_refresh_replacements();
  if v <> '{"changed_laws":1,"reset":1}'::jsonb then
    raise exception 'T9 FAIL (service_role): %', v;
  end if;
  raise notice 'T9 ok: service_role reads the columns and runs a refresh that resets';
end $$;
reset role;
do $$
begin
  if pg_temp.pairs() <> 'a>b,b>c,c>a' or pg_temp.states() like '%article:a1%' then
    raise exception 'T9 FAIL (service_role): pairs % states %', pg_temp.pairs(), pg_temp.states();
  end if;
  raise notice 'T9b ok: the service_role refresh deleted the state and rewrote the pairs';
end $$;
