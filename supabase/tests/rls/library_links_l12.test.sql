-- library_links_l12.test.sql — proves 20261202_30 (batch l12 «lib-links», owner
-- package 20 Nov 2026):
--   * L1: one read gives every article of a law its link groups, true totals,
--     at most p_per_type items, each node once with its library rows' state;
--     no text; service_role only.
--   * Q132 / file 02 #43: flagged owner links are ordinary links; an article
--     that cannot be pinned (fraction, not found, ambiguous, regulation not in
--     a block) links to its LAW; amended_by / amends → AMENDS_ARTICLE,
--     repealed_by / superseded_by / repeals / supersedes / replaces →
--     SUPERSEDES_LAW (new → old); scheduled_repeal_by stays out; a link onto
--     itself is never written.
--   * ب34: the broken-reference check finds a node whose library row is gone,
--     stores one row per run, and the history lists them.
--
-- CHAIN (needs pgvector; repo root, Git Bash): as library_owner_edges.test.sql,
-- then the l12_lib_links _verify block BEFORE the file (must answer false, not
-- fail), 20261202_30 TWICE (idempotent), the _verify block again, this file:
--   R=supabase/tests/rls; M=supabase/migrations; T=$(mktemp -d)
--   sed -n '/^-- >>> verify:l12_lib_links/,/^-- <<< verify:l12_lib_links/p' $M/_verify.sql > "$T/v.sql"
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
--     $M/20261130_30_library_regulation_ref.sql $M/20261130_40_library_owner_edges.sql "$T/v.sql" \
--     $M/20261202_30_library_links.sql $M/20261202_30_library_links.sql \
--     "$T/v.sql" $R/library_links_l12.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without 20261130_40 →
-- "20261202_30: library_graph.owner_edges missing — apply 20261130_40 first".
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- ── fixture (as the migration owner) ─────────────────────────────────────────
insert into library.laws (slug, title, type, description, status, instrument_id) values
  ('law-a', 'نظام أ', 'نظام', 'وصف', 'active', 'LAW-00-0001'),
  ('law-b', 'نظام ب', 'نظام', 'وصف', 'repealed', null),
  ('law-c', 'نظام ج المعدِّل', 'نظام', 'وصف', 'active', 'LAW-30-0001');
insert into library.chapters (id, law_slug, number, title, order_index, regulation_ref) values
  ('00000000-0000-5000-8000-0000000000a1', 'law-a', 1, 'الباب الأول', 1, null),
  ('00000000-0000-5000-8000-0000000000a2', 'law-a', 1, 'الفصل الأول من اللائحة', 2, 'لائحة التفتيش');
insert into library.articles (id, law_slug, chapter_id, number, text, regulation_ref, status) values
  ('law-a__art-1', 'law-a', '00000000-0000-5000-8000-0000000000a1', '1', 'المادة الأولى من النظام', null, 'active'),
  ('law-a__art-1__ch1_i0', 'law-a', '00000000-0000-5000-8000-0000000000a2', '1', 'المادة الأولى من اللائحة', 'لائحة التفتيش', 'active'),
  ('law-a__art-10', 'law-a', '00000000-0000-5000-8000-0000000000a1', '10', 'ملغاة', null, 'repealed'),
  ('law-a__art-10-added', 'law-a', '00000000-0000-5000-8000-0000000000a1', '10', 'مضافة', null, 'active'),
  ('law-a__art-7', 'law-a', '00000000-0000-5000-8000-0000000000a1', '7', 'مادة بلا عقدة في الجراف', null, 'active'),
  ('law-b__art-3', 'law-b', null, '3', 'نظام ب مادة 3', null, 'repealed');
insert into library.judicial_collections (id, title, metadata) values ('COLL-1', 'مجموعة 1', '{}'::jsonb);
insert into library.principles (id, collection_id, principle_number, text, metadata) values
  ('COLL-1__pr-5', 'COLL-1', '5', 'مبدأ 5', '{}'::jsonb),
  ('COLL-1__pr-6', 'COLL-1', '6', 'مبدأ 6', '{}'::jsonb);
insert into library.decrees_circulars (id, title, type) values
  ('11111111-1111-4111-8111-111111111111', 'مرسوم ملكي رقم م/1', 'royal');

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, collection_id, is_embeddable, title, url, display_text, content_sha256) values
  ('law:law-a', 'law', 'law-a', 'law-a', null, false, 'نظام أ', '/laws/law-a', 'نص', repeat('a', 64)),
  ('law:law-b', 'law', 'law-b', 'law-b', null, false, 'نظام ب', '/laws/law-b', 'نص', repeat('b', 64)),
  ('law:law-c', 'law', 'law-c', 'law-c', null, false, 'نظام ج', '/laws/law-c', 'نص', repeat('c', 64)),
  ('decree:11111111-1111-4111-8111-111111111111', 'decree', '11111111-1111-4111-8111-111111111111', null, null, true, 'مرسوم م/1', '/laws/orders/11111111-1111-4111-8111-111111111111', 'نص', repeat('d', 64)),
  ('article:law-a__art-1', 'article', 'law-a__art-1', 'law-a', null, true, 'أ — 1', '/laws/law-a#law-a__art-1', 'نص المادة السري', repeat('1', 64)),
  ('article:law-a__art-1__ch1_i0', 'article', 'law-a__art-1__ch1_i0', 'law-a', null, true, 'أ — لائحة 1', '', 'نص', repeat('2', 64)),
  ('article:law-b__art-3', 'article', 'law-b__art-3', 'law-b', null, true, 'ب — 3', '', 'نص', repeat('4', 64)),
  -- a node whose library row is gone (ب34: broken)
  ('article:law-b__art-gone', 'article', 'law-b__art-gone', 'law-b', null, true, 'ب — مادة حُذفت', '', 'نص', repeat('5', 64)),
  ('principle:COLL-1__pr-5', 'principle', 'COLL-1__pr-5', null, 'COLL-1', true, 'مبدأ 5', '/precedents/COLL-1#COLL-1__pr-5', 'نص', repeat('6', 64)),
  ('principle:COLL-1__pr-6', 'principle', 'COLL-1__pr-6', null, 'COLL-1', true, 'مبدأ 6', '/precedents/COLL-1#COLL-1__pr-6', 'نص', repeat('7', 64));

create or replace function pg_temp.st(p_edge text) returns text
language sql as $$ select resolve_status from library_graph.owner_edges where edge_id = p_edge $$;
create or replace function pg_temp.tgt(p_edge text) returns text
language sql as $$ select resolved_source_key || ' -> ' || resolved_target_key from library_graph.owner_edges where edge_id = p_edge $$;

-- ── T1 anon / authenticated: no new function, no check table ─────────────────
do $$
declare r text; f text; denied int;
begin
  foreach r in array array['anon', 'authenticated'] loop
    denied := 0;
    foreach f in array array[
      'select public.graph_rag_law_article_links(''law-a'', 3, array[''CITES_ARTICLE''])',
      'select public.graph_rag_link_check(5)',
      'select public.graph_rag_link_check_run(5)',
      'select public.graph_rag_link_check_history(5)',
      'select public.graph_rag_resolve_owner_edges()',
      'select 1 from library_graph.link_checks limit 1'] loop
      begin
        execute format('set local role %I', r);
        execute f;
      exception when insufficient_privilege then denied := denied + 1;
      end;
      reset role;
    end loop;
    if denied <> 6 then raise exception 'T1 FAIL: % was denied % of 6', r, denied; end if;
  end loop;
  raise notice 'T1 PASS: anon and authenticated denied the law read, the check, its run and history, the resolver and the check table';
end $$;

-- ── T2 his links, the 308 and his amendment / repeal / replacement links ────
set role service_role;
select public.graph_rag_owner_edges_load($j$[
  {"edge_id":"00000000000000e1","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"1","quality":"ok","evidence":"المادة الأولى"},
  {"edge_id":"00000000000000e2","type":"cites_article","from_doc":"COLL-1","from_principle":"6","to_doc":"LAW-00-0001","to_article":"1","to_regulation_ref":"لائحة التفتيش","quality":"flagged","article_check":"target_article_anchor_not_found"},
  {"edge_id":"00000000000000e3","type":"cites_article","from_doc":"COLL-1","from_principle":"6","to_doc":"LAW-00-0001","to_article":"2/59","quality":"flagged","article_check":"fractional_article_number"},
  {"edge_id":"00000000000000e4","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"99","quality":"flagged","article_check":"article_not_found_in_target"},
  {"edge_id":"00000000000000e5","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"10","quality":"ok"},
  {"edge_id":"00000000000000e6","type":"cites_article","from_doc":"COLL-1","from_principle":"6","to_doc":"LAW-00-0001","to_article":"1","to_regulation_ref":"لائحة غير مدمجة بكتلة","quality":"ok"},
  {"edge_id":"00000000000000e7","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-99-9999","to_article":"1","quality":"ok"},
  {"edge_id":"00000000000000e8","type":"cites_article","from_doc":"COLL-1","from_principle":"5","to_doc":"LAW-00-0001","to_article":"7","quality":"ok"},
  {"edge_id":"00000000000000e9","type":"amended_by","from_doc":"LAW-00-0001","from_article":"1","to_doc":"LAW-30-0001","quality":"ok","evidence":"المرسوم الملكي رقم (م/1)"},
  {"edge_id":"0000000000000e10","type":"amended_by","from_doc":"law-b","from_article":"3","to_doc":"11111111-1111-4111-8111-111111111111","quality":"flagged"},
  {"edge_id":"0000000000000e11","type":"repealed_by","from_doc":"law-b","to_doc":"LAW-30-0001","quality":"ok"},
  {"edge_id":"0000000000000e12","type":"superseded_by","from_doc":"law-b","to_doc":"LAW-30-0001","quality":"ok"},
  {"edge_id":"0000000000000e13","type":"scheduled_repeal_by","from_doc":"law-a","to_doc":"LAW-30-0001","quality":"ok"},
  {"edge_id":"0000000000000e14","type":"supersedes","from_doc":"law-a","to_doc":"LAW-00-0001","quality":"ok"},
  {"edge_id":"0000000000000e15","type":"amends","from_doc":"LAW-30-0001","to_doc":"law-b","quality":"flagged"},
  {"edge_id":"0000000000000e16","type":"related_to","from_doc":"law-a","to_doc":"law-b","quality":"ok"},
  {"edge_id":"0000000000000e17","type":"repeals","from_doc":"LAW-77-0000","to_doc":"law-b","quality":"ok"}
]$j$::jsonb, repeat('a', 64));
select public.graph_rag_resolve_owner_edges() as first_resolve;
reset role;

-- ── T3 statuses ──────────────────────────────────────────────────────────────
do $$
declare
  want text[][] := array[
    ['00000000000000e1', 'resolved', 'principle:COLL-1__pr-5 -> article:law-a__art-1'],
    ['00000000000000e2', 'resolved', 'principle:COLL-1__pr-6 -> article:law-a__art-1__ch1_i0'],
    ['00000000000000e3', 'resolved_doc', 'principle:COLL-1__pr-6 -> law:law-a'],
    ['00000000000000e4', 'resolved_doc', 'principle:COLL-1__pr-5 -> law:law-a'],
    ['00000000000000e5', 'resolved_doc', 'principle:COLL-1__pr-5 -> law:law-a'],
    ['00000000000000e6', 'resolved_doc', 'principle:COLL-1__pr-6 -> law:law-a'],
    ['00000000000000e7', 'target_doc_unknown', null],
    ['00000000000000e8', 'node_missing', null],
    ['00000000000000e9', 'resolved', 'law:law-c -> article:law-a__art-1'],
    ['0000000000000e10', 'resolved', 'decree:11111111-1111-4111-8111-111111111111 -> article:law-b__art-3'],
    ['0000000000000e11', 'resolved', 'law:law-c -> law:law-b'],
    ['0000000000000e12', 'resolved', 'law:law-c -> law:law-b'],
    ['0000000000000e13', 'type_not_merged', null],
    ['0000000000000e14', 'self_link', null],
    ['0000000000000e15', 'resolved_doc', 'law:law-c -> law:law-b'],
    ['0000000000000e16', 'type_not_merged', null],
    ['0000000000000e17', 'source_doc_unknown', null]];
  i int;
begin
  for i in 1 .. array_length(want, 1) loop
    if pg_temp.st(want[i][1]) is distinct from want[i][2] or pg_temp.tgt(want[i][1]) is distinct from want[i][3] then
      raise exception 'T3 FAIL: % is % (%), expected % (%)', want[i][1], pg_temp.st(want[i][1]), pg_temp.tgt(want[i][1]), want[i][2], want[i][3];
    end if;
  end loop;
  if exists (select 1 from library_graph.owner_edges where resolve_status = 'held_flagged') then
    raise exception 'T3 FAIL: a flagged link is still held';
  end if;
  raise notice 'T3 PASS: 17 statuses — flagged links ordinary, unpinned / ambiguous / fractional articles on their law, amendment / repeal / replacement merged new → old, scheduled repeal and related_to left out, a self link never written';
end $$;

-- ── T4 the graph ─────────────────────────────────────────────────────────────
do $$
declare m jsonb;
begin
  -- e1, e2, (e3+e4+e5 on one law pair? no: e3/e6 pr-6 → law-a, e4/e5 pr-5 → law-a), e9, e10, e11+e12 (one pair), e15
  if (select count(*) from library_graph.edges where origin = 'owner_curated' and metadata->>'source' = 'owner_edges') <> 8 then
    raise exception 'T4 FAIL: % owner edges, expected 8',
      (select count(*) from library_graph.edges where origin = 'owner_curated' and metadata->>'source' = 'owner_edges');
  end if;
  select metadata into m from library_graph.edges
   where source_key = 'principle:COLL-1__pr-6' and target_key = 'law:law-a' and edge_type = 'INTERPRETS_ARTICLE';
  if m is null or m->>'quality' <> 'flagged' or (m->>'doc_level')::boolean is not true
     or m->'edge_ids' <> '["00000000000000e3","00000000000000e6"]'::jsonb then
    raise exception 'T4 FAIL: the flagged fraction link on its law carries %', m;
  end if;
  if not exists (select 1 from library_graph.edges where source_key = 'law:law-c' and target_key = 'article:law-a__art-1' and edge_type = 'AMENDS_ARTICLE')
     or not exists (select 1 from library_graph.edges where source_key = 'decree:11111111-1111-4111-8111-111111111111' and target_key = 'article:law-b__art-3' and edge_type = 'AMENDS_ARTICLE')
     or not exists (select 1 from library_graph.edges where source_key = 'law:law-c' and target_key = 'law:law-b' and edge_type = 'SUPERSEDES_LAW'
                     and metadata->'edge_ids' = '["0000000000000e11","0000000000000e12"]'::jsonb)
     or not exists (select 1 from library_graph.edges where source_key = 'law:law-c' and target_key = 'law:law-b' and edge_type = 'AMENDS_ARTICLE') then
    raise exception 'T4 FAIL: an amendment / repeal / replacement edge is missing';
  end if;
  if exists (select 1 from library_graph.edges where source_key = target_key) then
    raise exception 'T4 FAIL: a self link was written';
  end if;
  raise notice 'T4 PASS: 8 graph edges — flagged and unpinned links on their law (quality kept for staff), amendment / repeal / replacement edges in the graph''s direction';
end $$;

-- ── T5 idempotent ────────────────────────────────────────────────────────────
do $$
declare r jsonb;
begin
  set local role service_role;
  r := public.graph_rag_resolve_owner_edges();
  reset role;
  if (r->>'upserted')::int <> 0 or (r->>'removed')::int <> 0 or (r->>'status_changed')::int <> 0 or (r->>'graph_edges')::int <> 8 then
    raise exception 'T5 FAIL: second resolve %', r;
  end if;
  raise notice 'T5 PASS: a second resolve changes nothing (%)', r->'by_status';
end $$;

-- ── T6 L1: the whole law in one read ─────────────────────────────────────────
-- article 1 of law-a cites five articles (more than per_type), an automatic one included
insert into library_graph.nodes (node_key, node_type, source_id, law_slug, is_embeddable, title, url, display_text, content_sha256)
select 'article:law-b__x' || g, 'article', 'law-b__x' || g, 'law-b', true, 'ب — ' || g, '', 'نص سري ' || g, repeat(g::text, 64)
  from generate_series(1, 5) g;
insert into library.articles (id, law_slug, chapter_id, number, text, regulation_ref, status)
select 'law-b__x' || g, 'law-b', null, (20 + g)::text, 'نص', null, 'repealed' from generate_series(1, 5) g;
insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence, metadata)
select 'article:law-a__art-1', 'article:law-b__x' || g, 'CITES_ARTICLE', 'auto_watchdog', 1.0 + g / 10.0, 'دليل سري', '{}'::jsonb
  from generate_series(1, 5) g;
insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, metadata) values
  ('article:law-a__art-1', 'article:law-b__art-gone', 'SIMILAR_TO', 'auto_similarity', 0.8, '{"sim":0.8}'::jsonb),
  ('article:law-a__art-1', 'article:law-a__art-1__ch1_i0', 'NEXT_ARTICLE', 'auto_watchdog', 1.0, '{}'::jsonb);

do $$
declare
  r jsonb; a jsonb; g jsonb; n jsonb;
begin
  set local role service_role;
  r := public.graph_rag_law_article_links('law-a', 3, array['CITES_ARTICLE', 'INTERPRETS_ARTICLE', 'AMENDS_ARTICLE', 'SIMILAR_TO']);
  reset role;
  if r->>'found' <> 'true' or r->>'law_slug' <> 'law-a' or (r->>'per_type')::int <> 3 then raise exception 'T6 FAIL: header %', r; end if;
  if r::text like '%سري%' then raise exception 'T6 FAIL: text, snippet or evidence leaked'; end if;
  select x into a from jsonb_array_elements(r->'articles') x where x->>'id' = 'law-a__art-1';
  if a is null then raise exception 'T6 FAIL: article 1 missing in %', r->'articles'; end if;
  select x into g from jsonb_array_elements(a->'links') x where x->>'t' = 'CITES_ARTICLE' and x->>'d' = 'out';
  if (g->>'n')::int <> 5 or jsonb_array_length(g->'items') <> 3 or g->'items'->0->>'k' <> 'article:law-b__x5'
     or g->'items'->0->>'o' <> 'auto_watchdog' then
    raise exception 'T6 FAIL: the «إحالة» group (true total 5, three items, closest first) is %', g;
  end if;
  if not exists (select 1 from jsonb_array_elements(a->'links') x where x->>'t' = 'INTERPRETS_ARTICLE' and x->>'d' = 'in' and (x->>'n')::int = 1)
     or not exists (select 1 from jsonb_array_elements(a->'links') x where x->>'t' = 'AMENDS_ARTICLE' and x->>'d' = 'in')
     or not exists (select 1 from jsonb_array_elements(a->'links') x where x->>'t' = 'SIMILAR_TO')
     or exists (select 1 from jsonb_array_elements(a->'links') x where x->>'t' = 'NEXT_ARTICLE') then
    raise exception 'T6 FAIL: the asked types only: %', a->'links';
  end if;
  -- Q132: the links whose article could not be pinned sit on the law itself ('@law')
  select x into a from jsonb_array_elements(r->'articles') x where x->>'id' = '@law';
  if a is null or not exists (select 1 from jsonb_array_elements(a->'links') x
                               where x->>'t' = 'INTERPRETS_ARTICLE' and x->>'d' = 'in' and (x->>'n')::int = 2) then
    raise exception 'T6 FAIL: the law''s own links (principle → law) are %', a;
  end if;
  select x into n from jsonb_array_elements(r->'nodes') x where x->>'node_key' = 'article:law-b__art-gone';
  if n->'lib'->>'anchor' <> 'false' or n->'lib'->>'doc' <> 'true' or n->'lib'->>'doc_status' <> 'repealed' then
    raise exception 'T6 FAIL: the gone article''s library state is %', n;
  end if;
  select x into n from jsonb_array_elements(r->'nodes') x where x->>'node_key' = 'article:law-b__x1';
  if n is not null then raise exception 'T6 FAIL: a node no group lists (x1, fourth and fifth) was sent'; end if;
  if (select count(*) from jsonb_array_elements(r->'nodes')) <> (select count(distinct x->>'node_key') from jsonb_array_elements(r->'nodes') x) then
    raise exception 'T6 FAIL: a node sent twice';
  end if;
  set local role service_role;
  if jsonb_array_length(public.graph_rag_law_article_links('law-a', 3, null)->'articles') <> 0
     or jsonb_array_length(public.graph_rag_law_article_links('law-a', 3, array[]::text[])->'articles') <> 0 then
    raise exception 'T6 FAIL: no types must answer no links';
  end if;
  if jsonb_array_length(public.graph_rag_law_article_links('no-such-law', 3, array['CITES_ARTICLE'])->'articles') <> 0 then
    raise exception 'T6 FAIL: an unknown law has no links';
  end if;
  reset role;
  raise notice 'T6 PASS: one read per law (its articles and the law itself) — true totals, three closest items per group, each node once with its library state, asked types only, no text';
end $$;

-- ── T7 ب34: the broken-reference check ───────────────────────────────────────
do $$
declare r jsonb; h jsonb;
begin
  set local role service_role;
  r := public.graph_rag_link_check_run(10);
  reset role;
  if (r->>'broken')::int <> 1 or r->'by_reason'->>'article_gone' <> '1' or r->>'previous_broken' is not null
     or r->'owner_edges'->>'resolved_doc' <> '5' then
    raise exception 'T7 FAIL: first run %', r;
  end if;
  set local role service_role;
  r := public.graph_rag_link_check_run(10);
  h := public.graph_rag_link_check_history(5);
  reset role;
  if (r->>'previous_broken')::int <> 1 or jsonb_array_length(h) <> 2 or h->0->'sample'->0->>'node_key' <> 'article:law-b__art-gone' then
    raise exception 'T7 FAIL: second run % / history %', r, h;
  end if;
  -- the data is fixed: the row comes back
  insert into library.articles (id, law_slug, chapter_id, number, text, regulation_ref, status)
  values ('law-b__art-gone', 'law-b', null, '4', 'عادت', null, 'repealed');
  set local role service_role;
  r := public.graph_rag_link_check(10);
  reset role;
  if (r->>'broken')::int <> 0 then raise exception 'T7 FAIL: after the fix %', r; end if;
  raise notice 'T7 PASS: the check finds the node whose article is gone, keeps one row per run with the previous count, and clears once the row is back';
end $$;
