-- library_owner_edges.test.sql — proves 20261130_40 (owner file 19 Nov §2/§3,
-- batch l10-relations): the owner's links in their own server-only table, keyed
-- by his edge_id; the resolver maps his stable ids to our node keys (never a
-- guess), keeps flagged links out of the graph, removes deleted ones, and
-- brings a link back after an article re-key.
--
-- CHAIN (needs pgvector; repo root, Git Bash): the library chain with the
-- column locks, the graph chain up to 20261121_10, 20261130_30, the
-- l10_owner_edges _verify block BEFORE the file (must answer false, not fail),
-- 20261130_40 TWICE (idempotent), the _verify block again, then this file:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l10_owner_edges_block.sql
--   sed -n '/^-- >>> verify:l10_owner_edges/,/^-- <<< verify:l10_owner_edges/p' $M/_verify.sql > "$B"
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
--     $M/20261130_30_library_regulation_ref.sql "$B" \
--     $M/20261130_40_library_owner_edges.sql $M/20261130_40_library_owner_edges.sql \
--     "$B" $R/library_owner_edges.test.sql
-- FULL CHAIN (batch l12): the same chain with 20261202_30 appended before this
-- file must pass too. 20261202_30 (Q132 / 308) replaces the resolver: a flagged
-- link is no longer held and an article it cannot pin (fraction, not found,
-- ambiguous, regulation outside an ATTACHED block) links to the target LAW node;
-- amended_by is merged instruments → article. This fixture's graph has no law
-- node and no LAW-30-0001 instrument, so those rows read node_missing /
-- source_doc_unknown (T3, l12 branch); library_links_l12.test.sql proves the
-- law-node fallback itself. Every other assertion is the same on both chains.
-- NEGATIVE CONTROL (must FAIL): the same chain without 20261130_30 →
-- "20261130_40: library.articles.regulation_ref missing — apply 20261130_30 first".
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- ── fixture (as the migration owner) ─────────────────────────────────────────
insert into library.laws (slug, title, type, description, status, instrument_id) values
  ('law-a', 'نظام أ', 'نظام', 'وصف', 'active', 'LAW-00-0001'),
  ('law-b', 'نظام ب', 'نظام', 'وصف', 'active', null);
insert into library.chapters (id, law_slug, number, title, order_index, regulation_ref) values
  ('00000000-0000-5000-8000-0000000000a1', 'law-a', 1, 'الباب الأول', 1, null),
  ('00000000-0000-5000-8000-0000000000a2', 'law-a', 1, 'الفصل الأول من اللائحة', 2, 'لائحة التفتيش');
insert into library.articles (id, law_slug, chapter_id, number, text, regulation_ref, status) values
  ('law-a__art-1', 'law-a', '00000000-0000-5000-8000-0000000000a1', '1', 'المادة الأولى من النظام', null, 'active'),
  ('law-a__art-1__ch1_i0', 'law-a', '00000000-0000-5000-8000-0000000000a2', '1', 'المادة الأولى من اللائحة', 'لائحة التفتيش', 'active'),
  ('law-a__art-23-mukarrar', 'law-a', '00000000-0000-5000-8000-0000000000a1', '23 مكرر', 'مادة مكررة', null, 'active'),
  ('law-a__art-10', 'law-a', '00000000-0000-5000-8000-0000000000a1', '10', 'ملغاة', null, 'repealed'),
  ('law-a__art-10-added', 'law-a', '00000000-0000-5000-8000-0000000000a1', '10', 'مضافة', null, 'active'),
  ('law-a__art-7', 'law-a', '00000000-0000-5000-8000-0000000000a1', '7', 'مادة بلا عقدة في الجراف', null, 'active'),
  ('law-b__art-3', 'law-b', null, '3', 'نظام ب مادة 3', null, 'active');
insert into library.judicial_collections (id, title, metadata) values
  ('COLL-1', 'مجموعة 1', '{}'::jsonb),
  ('coll-slug', 'مجموعة بمعرّف في الترويسة', '{"id":"FILE-777"}'::jsonb),
  ('prec-group', 'أحكام', '{}'::jsonb);
insert into library.principles (id, collection_id, principle_number, text, metadata) values
  ('COLL-1__pr-5', 'COLL-1', '5', 'مبدأ 5', '{}'::jsonb),
  ('COLL-1__pr-6', 'COLL-1', '6', 'مبدأ 6', '{}'::jsonb),
  ('COLL-1__pr-8', 'COLL-1', '8', 'مبدأ 8 الأول', '{}'::jsonb),
  ('COLL-1__pr-8-dup', 'COLL-1', '8', 'مبدأ 8 الثاني', '{}'::jsonb),
  ('coll-slug__pr-2', 'coll-slug', '2', 'مبدأ 2', '{}'::jsonb),
  ('idari-x', 'prec-group', '', 'حكم مستقل', '{"id":"idari-x"}'::jsonb),
  ('standalone-slug', 'prec-group', '', 'حكم مستقل آخر', '{"id":"FILE-900"}'::jsonb);

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, is_embeddable, title, display_text, content_sha256) values
  ('article:law-a__art-1', 'article', 'law-a__art-1', 'law-a', true, 'أ — 1', 'نص', repeat('1', 64)),
  ('article:law-a__art-1__ch1_i0', 'article', 'law-a__art-1__ch1_i0', 'law-a', true, 'أ — لائحة 1', 'نص', repeat('2', 64)),
  ('article:law-a__art-23-mukarrar', 'article', 'law-a__art-23-mukarrar', 'law-a', true, 'أ — 23 مكرر', 'نص', repeat('3', 64)),
  ('article:law-b__art-3', 'article', 'law-b__art-3', 'law-b', true, 'ب — 3', 'نص', repeat('4', 64)),
  ('principle:COLL-1__pr-5', 'principle', 'COLL-1__pr-5', null, true, 'مبدأ 5', 'نص', repeat('5', 64)),
  ('principle:COLL-1__pr-6', 'principle', 'COLL-1__pr-6', null, true, 'مبدأ 6', 'نص', repeat('6', 64)),
  ('principle:coll-slug__pr-2', 'principle', 'coll-slug__pr-2', null, true, 'مبدأ 2', 'نص', repeat('7', 64)),
  ('principle:idari-x', 'principle', 'idari-x', null, true, 'حكم', 'نص', repeat('8', 64)),
  ('principle:standalone-slug', 'principle', 'standalone-slug', null, true, 'حكم', 'نص', repeat('9', 64));

-- an automatic edge on e1's pair (taken over), and an owner_curated edge of another origin (never touched)
insert into library_graph.edges (source_key, target_key, edge_type, origin, metadata) values
  ('principle:COLL-1__pr-5', 'article:law-a__art-1', 'INTERPRETS_ARTICLE', 'auto_watchdog', '{"rule":"text"}'::jsonb),
  ('principle:COLL-1__pr-6', 'article:law-b__art-3', 'INTERPRETS_ARTICLE', 'owner_curated', '{"source":"curator_ui"}'::jsonb);

create or replace function pg_temp.st(p_edge text) returns text
language sql as $$ select resolve_status from library_graph.owner_edges where edge_id = p_edge $$;
create or replace function pg_temp.edge_count() returns bigint
language sql as $$ select count(*) from library_graph.edges where origin = 'owner_curated' and metadata->>'source' = 'owner_edges' $$;

-- ── T1 anon / authenticated: no table, no function ───────────────────────────
do $$
declare r text; denied int;
begin
  foreach r in array array['anon', 'authenticated'] loop
    denied := 0;
    begin
      execute format('set local role %I', r);
      perform 1 from library_graph.owner_edges limit 1;
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
    begin
      execute format('set local role %I', r);
      perform public.graph_rag_resolve_owner_edges();
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
    begin
      execute format('set local role %I', r);
      perform public.graph_rag_owner_edges_load('[]'::jsonb, repeat('a', 64));
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
    begin
      execute format('set local role %I', r);
      perform public.graph_rag_owner_edges_mark_deleted('[]'::jsonb);
    exception when insufficient_privilege then denied := denied + 1;
    end;
    reset role;
    if denied <> 4 then raise exception 'T1 FAIL: % was denied % of 4', r, denied; end if;
  end loop;
  raise notice 'T1 PASS: anon and authenticated denied the table, the resolver, the load and the delete list';
end $$;

-- ── T2 the importer's load (service_role) ────────────────────────────────────
set role service_role;
select public.graph_rag_owner_edges_load($j$[
  {"edge_id":"00000000000000e1","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"1","quality":"ok","evidence":"المادة الأولى من النظام"},
  {"edge_id":"00000000000000e2","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"1","to_regulation_ref":"لائحة التفتيش","quality":"ok"},
  {"edge_id":"00000000000000e3","type":"cites_article","from_doc":"COLL-1","from_principle":"6","to_doc":"LAW-00-0001","to_article":"23 مكرر","quality":"ok"},
  {"edge_id":"00000000000000e4","type":"cites_article","from_doc":"COLL-1","from_principle":"6","to_doc":"LAW-00-0001","to_article":"2/59","quality":"flagged","article_check":"fractional_article_number"},
  {"edge_id":"00000000000000e5","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-99-9999","to_article":"1","quality":"ok"},
  {"edge_id":"00000000000000e6","type":"cites_article","from_doc":"FILE-777","from_principle":"2","to_doc":"law-b","to_article":"3","quality":"ok"},
  {"edge_id":"00000000000000e7","type":"cites_article","from_doc":"idari-x","to_doc":"law-b","to_article":"3","quality":"ok"},
  {"edge_id":"00000000000000e8","type":"cites_article","from_doc":"COLL-1","from_principle":"8","to_doc":"law-b","to_article":"3","quality":"ok"},
  {"edge_id":"00000000000000e9","type":"cites_article","from_doc":"COLL-1","to_doc":"law-b","to_article":"3","quality":"ok"},
  {"edge_id":"0000000000000e10","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"1","to_regulation_ref":"لائحة غير مدمجة بكتلة","quality":"ok"},
  {"edge_id":"0000000000000e11","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"99","quality":"ok"},
  {"edge_id":"0000000000000e12","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"7","quality":"ok"},
  {"edge_id":"0000000000000e13","type":"cites_article","from_doc":"FILE-900","to_doc":"law-b","to_article":"3","quality":"ok"},
  {"edge_id":"0000000000000e14","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"1","quality":"ok","evidence":"نص آخر للرابط نفسه"},
  {"edge_id":"0000000000000e15","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"10","quality":"ok"},
  {"edge_id":"0000000000000e16","type":"amended_by","from_doc":"LAW-00-0001","to_doc":"LAW-30-0001","quality":"ok"}
]$j$::jsonb, repeat('a', 64));
reset role;

do $$
begin
  if (select count(*) from library_graph.owner_edges) <> 16 or exists (select 1 from library_graph.owner_edges where resolve_status <> 'pending') then
    raise exception 'T2 FAIL: 16 pending rows expected';
  end if;
  raise notice 'T2 PASS: the load stored 16 rows, all pending';
end $$;

-- ── T3 resolve ───────────────────────────────────────────────────────────────
set role service_role;
select public.graph_rag_resolve_owner_edges() as first_resolve;
reset role;

do $$
declare
  want text[][] := array[
    ['00000000000000e1', 'resolved'], ['00000000000000e2', 'resolved'], ['00000000000000e3', 'resolved'],
    ['00000000000000e4', 'held_flagged'], ['00000000000000e5', 'target_doc_unknown'], ['00000000000000e6', 'resolved'],
    ['00000000000000e7', 'resolved'], ['00000000000000e8', 'source_principle_ambiguous'],
    ['00000000000000e9', 'source_principle_missing'], ['0000000000000e10', 'regulation_not_in_attached_block'],
    ['0000000000000e11', 'target_article_not_found'], ['0000000000000e12', 'node_missing'],
    ['0000000000000e13', 'resolved'], ['0000000000000e14', 'resolved'], ['0000000000000e15', 'target_article_ambiguous'],
    ['0000000000000e16', 'type_not_merged']];
  i int;
begin
  -- l12 (20261202_30): the resolver that holds nothing flagged and falls back to the law node.
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.graph_rag_resolve_owner_edges()'::regprocedure), 'resolved_doc') > 0 then
    want := array[
      ['00000000000000e1', 'resolved'], ['00000000000000e2', 'resolved'], ['00000000000000e3', 'resolved'],
      ['00000000000000e4', 'node_missing'], ['00000000000000e5', 'target_doc_unknown'], ['00000000000000e6', 'resolved'],
      ['00000000000000e7', 'resolved'], ['00000000000000e8', 'source_principle_ambiguous'],
      ['00000000000000e9', 'source_principle_missing'], ['0000000000000e10', 'node_missing'],
      ['0000000000000e11', 'node_missing'], ['0000000000000e12', 'node_missing'],
      ['0000000000000e13', 'resolved'], ['0000000000000e14', 'resolved'], ['0000000000000e15', 'node_missing'],
      ['0000000000000e16', 'source_doc_unknown']];
    if exists (select 1 from library_graph.owner_edges where resolve_status = 'held_flagged') then
      raise exception 'T3 FAIL (l12): a flagged link is still held';
    end if;
    raise notice 'T3 (l12 resolver): flagged / unpinned links fall back to the law node — absent from this graph, so node_missing';
  end if;
  for i in 1 .. array_length(want, 1) loop
    if pg_temp.st(want[i][1]) is distinct from want[i][2] then
      raise exception 'T3 FAIL: % is %, expected %', want[i][1], pg_temp.st(want[i][1]), want[i][2];
    end if;
  end loop;
  if (select resolved_target_key from library_graph.owner_edges where edge_id = '00000000000000e1') <> 'article:law-a__art-1'
     or (select resolved_target_key from library_graph.owner_edges where edge_id = '00000000000000e2') <> 'article:law-a__art-1__ch1_i0'
     or (select resolved_target_key from library_graph.owner_edges where edge_id = '00000000000000e3') <> 'article:law-a__art-23-mukarrar'
     or (select resolved_source_key from library_graph.owner_edges where edge_id = '00000000000000e6') <> 'principle:coll-slug__pr-2'
     or (select resolved_source_key from library_graph.owner_edges where edge_id = '0000000000000e13') <> 'principle:standalone-slug' then
    raise exception 'T3 FAIL: a resolved key is wrong';
  end if;
  if exists (select 1 from library_graph.owner_edges where resolve_status <> 'resolved' and (resolved_source_key is not null or resolved_target_key is not null)) then
    raise exception 'T3 FAIL: an unresolved row carries a key';
  end if;
  raise notice 'T3 PASS: 16 statuses as expected — law article 1 vs regulation article 1, «23 مكرر», collection by frontmatter id, standalone rulings; ambiguous / missing / unknown never guessed';
end $$;

-- ── T4 the graph: resolved ok rows only, one edge per pair, takeover, others untouched ──
do $$
declare m jsonb;
begin
  -- e1 + e14 share one pair; e2, e3, e6, e7, e13 → 6 edges
  if pg_temp.edge_count() <> 6 then raise exception 'T4 FAIL: % owner edges in the graph, expected 6', pg_temp.edge_count(); end if;
  select metadata into m from library_graph.edges
   where source_key = 'principle:COLL-1__pr-5' and target_key = 'article:law-a__art-1' and edge_type = 'INTERPRETS_ARTICLE';
  if (select origin from library_graph.edges where source_key = 'principle:COLL-1__pr-5' and target_key = 'article:law-a__art-1') <> 'owner_curated'
     or m->>'edge_id' <> '00000000000000e1' or m->'edge_ids' <> '["00000000000000e1","0000000000000e14"]'::jsonb
     or m->>'quality' <> 'ok' or m->>'source' <> 'owner_edges' then
    raise exception 'T4 FAIL: the shared pair (taken over from the automatic edge) carries %', m;
  end if;
  if (select evidence from library_graph.edges where source_key = 'principle:COLL-1__pr-5' and target_key = 'article:law-a__art-1') <> 'المادة الأولى من النظام' then
    raise exception 'T4 FAIL: evidence';
  end if;
  if exists (select 1 from library_graph.edges where metadata->>'edge_id' = '00000000000000e4' or target_key like '%2/59%') then
    raise exception 'T4 FAIL: a flagged link reached the graph';
  end if;
  if (select metadata->>'source' from library_graph.edges where source_key = 'principle:COLL-1__pr-6' and target_key = 'article:law-b__art-3') <> 'curator_ui' then
    raise exception 'T4 FAIL: an owner_curated edge of another origin was touched';
  end if;
  raise notice 'T4 PASS: 6 graph edges (two edge ids on one pair kept as edge_ids), automatic edge taken over, flagged held out, other curated edge untouched';
end $$;

-- ── T5 idempotent ────────────────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  set local role service_role;
  r := public.graph_rag_resolve_owner_edges();
  reset role;
  if (r->>'upserted')::int <> 0 or (r->>'removed')::int <> 0 or (r->>'status_changed')::int <> 0 or (r->>'graph_edges')::int <> 6 then
    raise exception 'T5 FAIL: second resolve %', r;
  end if;
  raise notice 'T5 PASS: a second resolve changes nothing (%)', r->'by_status';
end $$;

-- ── T6 deleted: his deletion list removes the link from the graph ────────────
set role service_role;
select public.graph_rag_owner_edges_mark_deleted('["0000000000000e13"]'::jsonb);
select public.graph_rag_resolve_owner_edges() is not null;
reset role;
do $$
begin
  if pg_temp.st('0000000000000e13') <> 'deleted' or pg_temp.edge_count() <> 5
     or exists (select 1 from library_graph.edges where source_key = 'principle:standalone-slug') then
    raise exception 'T6 FAIL: deleted edge still there (status %, % edges)', pg_temp.st('0000000000000e13'), pg_temp.edge_count();
  end if;
  raise notice 'T6 PASS: a deleted edge id leaves the graph and keeps status deleted';
end $$;

-- ── T7 re-key survival: the article gets a new id (its node and edges go by cascade) ──
delete from library_graph.nodes where node_key = 'article:law-a__art-23-mukarrar';
delete from library.articles where id = 'law-a__art-23-mukarrar';
insert into library.articles (id, law_slug, chapter_id, number, text, regulation_ref, status)
values ('law-a__art-23-mukarrar-v2', 'law-a', '00000000-0000-5000-8000-0000000000a1', '23 مكرر', 'مادة مكررة', null, 'active');
do $$
begin
  if exists (select 1 from library_graph.edges where target_key like 'article:law-a__art-23-mukarrar%') then
    raise exception 'T7 FAIL: fixture — the cascade should have dropped the edge';
  end if;
end $$;
-- the graph pass has not built the new node yet → node_missing, no edge
set role service_role;
select public.graph_rag_resolve_owner_edges() is not null;
reset role;
do $$
begin
  if pg_temp.st('00000000000000e3') <> 'node_missing' then raise exception 'T7 FAIL: before the node: %', pg_temp.st('00000000000000e3'); end if;
end $$;
insert into library_graph.nodes (node_key, node_type, source_id, law_slug, is_embeddable, title, display_text, content_sha256)
values ('article:law-a__art-23-mukarrar-v2', 'article', 'law-a__art-23-mukarrar-v2', 'law-a', true, 'أ — 23 مكرر', 'نص', repeat('3', 64));
set role service_role;
select public.graph_rag_resolve_owner_edges() is not null;
reset role;
do $$
begin
  if pg_temp.st('00000000000000e3') <> 'resolved'
     or (select resolved_target_key from library_graph.owner_edges where edge_id = '00000000000000e3') <> 'article:law-a__art-23-mukarrar-v2'
     or not exists (select 1 from library_graph.edges where source_key = 'principle:COLL-1__pr-6'
                     and target_key = 'article:law-a__art-23-mukarrar-v2' and origin = 'owner_curated'
                     and metadata->>'edge_id' = '00000000000000e3') then
    raise exception 'T7 FAIL: the link did not come back on the new key';
  end if;
  raise notice 'T7 PASS: after a re-key the link waits (node_missing) and comes back on the new key once the node exists';
end $$;

-- ── T8 a newer export replaces the older one (retire) ────────────────────────
set role service_role;
select public.graph_rag_owner_edges_load($j$[
  {"edge_id":"00000000000000e1","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"1","quality":"ok"}
]$j$::jsonb, repeat('b', 64));
select public.graph_rag_owner_edges_retire(repeat('b', 64));
select public.graph_rag_resolve_owner_edges() is not null;
reset role;
do $$
declare ok boolean := false;
begin
  if (select count(*) from library_graph.owner_edges) <> 1 or pg_temp.edge_count() <> 1
     or not exists (select 1 from library_graph.edges where metadata->'edge_ids' = '["00000000000000e1"]'::jsonb) then
    raise exception 'T8 FAIL: % rows, % graph edges', (select count(*) from library_graph.owner_edges), pg_temp.edge_count();
  end if;
  if (select metadata->>'source' from library_graph.edges where source_key = 'principle:COLL-1__pr-6' and target_key = 'article:law-b__art-3') <> 'curator_ui' then
    raise exception 'T8 FAIL: the other curated edge left';
  end if;
  begin
    set local role service_role;
    perform public.graph_rag_owner_edges_retire(repeat('c', 64));
  exception when others then ok := sqlerrm like '%nothing was retired%';
  end;
  reset role;
  if not ok then raise exception 'T8 FAIL: retiring with a source that was never loaded must refuse'; end if;
  raise notice 'T8 PASS: retire keeps only the newest export; its leftovers leave the graph; an unknown source is refused';
end $$;

-- ── T9 the table refuses malformed rows ──────────────────────────────────────
do $$
declare bad text; n int := 0;
begin
  foreach bad in array array[
    '[{"edge_id":"XYZ","type":"cites_article","from_doc":"A","to_doc":"B","quality":"ok"}]',
    '[{"edge_id":"00000000000000f1","type":"cites_article","from_doc":"A","to_doc":"B","quality":"maybe"}]',
    '[{"edge_id":"00000000000000f2","type":"cites_article","from_doc":"A","to_doc":"B","quality":"ok","evidence":"' || repeat('x', 301) || '"}]'] loop
    begin
      set local role service_role;
      perform public.graph_rag_owner_edges_load(bad::jsonb, repeat('d', 64));
    exception when check_violation then n := n + 1;
    end;
    reset role;
  end loop;
  if n <> 3 then raise exception 'T9 FAIL: % of 3 malformed rows refused', n; end if;
  raise notice 'T9 PASS: bad edge_id, unknown quality and evidence over 300 characters are refused';
end $$;
