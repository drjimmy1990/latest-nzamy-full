-- library_graph_routing.test.sql — 20261116_10: routing by section and judicial
-- track (library_graph.route_factor, graph_rag_retrieve_scoped) and the
-- library's own IMPLEMENTED_BY regulation link. No vectors: every result comes
-- from the keyword leg, so the routing alone decides what is kept.
--
-- Needs pgvector (repo root, Git Bash):
--   M=supabase/migrations
--   PG_IMAGE=pgvector/pgvector:pg16 bash supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql \
--     supabase/tests/rls/library_graph_routing.test.sql

grant usage on schema extensions to service_role;

insert into library.laws (slug, title, type, section_code)
values ('civ', 'نظام المعاملات المدنية', 'نظام', '03');

do $$
declare
  v_run jsonb;
  v_t   timestamptz;
begin
  v_run := public.graph_rag_sync_control('start_run', '{"trigger_source":"watchdog_test"}'::jsonb);
  v_t := (v_run->>'started_at')::timestamptz;

  perform public.graph_rag_upsert_nodes(jsonb_build_array(
    -- Law nodes carry the section (metadata only).
    jsonb_build_object('node_key', 'law:civ', 'node_type', 'law', 'source_id', 'civ', 'law_slug', 'civ',
      'is_embeddable', false, 'title', 'نظام المعاملات المدنية', 'display_text', 'نظام المعاملات المدنية',
      'content_sha256', repeat('1', 64), 'metadata', '{"section_code":"03"}'::jsonb),
    jsonb_build_object('node_key', 'law:adm', 'node_type', 'law', 'source_id', 'adm', 'law_slug', 'adm',
      'is_embeddable', false, 'title', 'نظام إداري', 'display_text', 'نظام إداري',
      'content_sha256', repeat('2', 64), 'metadata', '{"section_code":"02"}'::jsonb),
    jsonb_build_object('node_key', 'law:proc', 'node_type', 'law', 'source_id', 'proc', 'law_slug', 'proc',
      'is_embeddable', false, 'title', 'نظام المرافعات', 'display_text', 'نظام المرافعات',
      'content_sha256', repeat('3', 64), 'metadata', '{"section_code":"00"}'::jsonb),
    jsonb_build_object('node_key', 'law:bank', 'node_type', 'law', 'source_id', 'bank', 'law_slug', 'bank',
      'is_embeddable', false, 'title', 'نظام مراقبة البنوك', 'display_text', 'نظام مراقبة البنوك',
      'content_sha256', repeat('4', 64), 'metadata', '{"section_code":"08"}'::jsonb),
    jsonb_build_object('node_key', 'law:reg', 'node_type', 'law', 'source_id', 'reg', 'law_slug', 'reg',
      'is_embeddable', false, 'title', 'اللائحة التنفيذية', 'display_text', 'اللائحة التنفيذية',
      'content_sha256', repeat('5', 64), 'metadata', '{"section_code":"03"}'::jsonb),

    -- «فسخ» matches these. Civil articles: the majority.
    jsonb_build_object('node_key', 'article:civ1', 'node_type', 'article', 'source_id', 'civ1', 'law_slug', 'civ',
      'article_number', 107, 'title', 'المعاملات المدنية — 107', 'display_text', 'فسخ العقد وديعة',
      'content_sha256', repeat('6', 64)),
    jsonb_build_object('node_key', 'article:civ2', 'node_type', 'article', 'source_id', 'civ2', 'law_slug', 'civ',
      'article_number', 108, 'title', 'المعاملات المدنية — 108', 'display_text', 'فسخ العقد بالتراضي وديعة',
      'content_sha256', repeat('7', 64)),
    jsonb_build_object('node_key', 'article:civx', 'node_type', 'article', 'source_id', 'civx', 'law_slug', 'civ',
      'article_number', 109, 'title', 'المعاملات المدنية — 109', 'display_text', 'فسخ العقد للعذر وديعة',
      'content_sha256', repeat('8', 64)),
    -- An administrative article the words also match; a procedural one.
    jsonb_build_object('node_key', 'article:adm1', 'node_type', 'article', 'source_id', 'adm1', 'law_slug', 'adm',
      'article_number', 5, 'title', 'نظام إداري — 5', 'display_text', 'فسخ العقد الإداري وديعة',
      'content_sha256', repeat('9', 64)),
    jsonb_build_object('node_key', 'article:proc1', 'node_type', 'article', 'source_id', 'proc1', 'law_slug', 'proc',
      'article_number', 31, 'title', 'المرافعات — 31', 'display_text', 'دعوى فسخ',
      'content_sha256', repeat('a', 64)),
    -- adm2: reached only by an exception link from civx.
    jsonb_build_object('node_key', 'article:adm2', 'node_type', 'article', 'source_id', 'adm2', 'law_slug', 'adm',
      'article_number', 6, 'title', 'نظام إداري — 6', 'display_text', 'استثناء',
      'content_sha256', repeat('b', 64)),
    -- IMPLEMENTED_BY: sys (civil article) → regart (its regulation's article).
    jsonb_build_object('node_key', 'article:sys', 'node_type', 'article', 'source_id', 'sys', 'law_slug', 'civ',
      'article_number', 200, 'title', 'المعاملات المدنية — 200', 'display_text', 'حكم عام',
      'content_sha256', repeat('c', 64)),
    jsonb_build_object('node_key', 'article:regart', 'node_type', 'article', 'source_id', 'regart', 'law_slug', 'reg',
      'article_number', 4, 'title', 'اللائحة التنفيذية — 4', 'display_text', 'مهلة التنفيذ',
      'content_sha256', repeat('d', 64)),

    -- Principles, all matching «فسخ».
    jsonb_build_object('node_key', 'principle:pa', 'node_type', 'principle', 'source_id', 'pa', 'collection_id', 'bog',
      'title', 'ديوان المظالم — 1', 'display_text', 'فسخ عقد إداري',
      'content_sha256', repeat('e', 64), 'metadata', '{"track":"admin","track_class":"admin","subject_section":null}'::jsonb),
    jsonb_build_object('node_key', 'principle:pa_com', 'node_type', 'principle', 'source_id', 'pa_com', 'collection_id', 'bogc',
      'title', 'ديوان المظالم التجارية — 1', 'display_text', 'فسخ عقد تجاري',
      'content_sha256', repeat('f', 64), 'metadata', '{"track":"admin","track_class":"admin","subject_section":"04"}'::jsonb),
    jsonb_build_object('node_key', 'principle:pa_cite', 'node_type', 'principle', 'source_id', 'pa_cite', 'collection_id', 'bog',
      'title', 'ديوان المظالم — 2', 'display_text', 'فسخ وفق المادة 107',
      'content_sha256', repeat('0', 63) || '1', 'metadata', '{"track":"admin","track_class":"admin"}'::jsonb),
    jsonb_build_object('node_key', 'principle:po', 'node_type', 'principle', 'source_id', 'po', 'collection_id', 'moj',
      'title', 'السوابق القضائية — 1', 'display_text', 'فسخ البيع',
      'content_sha256', repeat('0', 63) || '2', 'metadata', '{"track":"ordinary","track_class":"ordinary"}'::jsonb),
    jsonb_build_object('node_key', 'principle:ps_bank', 'node_type', 'principle', 'source_id', 'ps_bank', 'collection_id', 'bankc',
      'title', 'لجنة المنازعات المصرفية — 1', 'display_text', 'فسخ عقد التمويل',
      'content_sha256', repeat('0', 63) || '3',
      'metadata', '{"track":"semi","track_class":"semi","committee_families":["banking"],"governing_laws":["bank"]}'::jsonb),
    jsonb_build_object('node_key', 'principle:ps_civ', 'node_type', 'principle', 'source_id', 'ps_civ', 'collection_id', 'semic',
      'title', 'لجنة — 1', 'display_text', 'فسخ عقد مدني',
      'content_sha256', repeat('0', 63) || '4',
      'metadata', '{"track":"semi","track_class":"semi","governing_laws":["civ"]}'::jsonb)
  ), v_t);

  perform public.graph_rag_upsert_edges(jsonb_build_array(
    jsonb_build_object('source_key', 'article:civx', 'target_key', 'article:adm2', 'edge_type', 'EXEMPTS_FROM', 'weight', 1.1),
    jsonb_build_object('source_key', 'article:sys', 'target_key', 'article:regart', 'edge_type', 'IMPLEMENTED_BY', 'weight', 0.9),
    jsonb_build_object('source_key', 'principle:pa_cite', 'target_key', 'article:civ1', 'edge_type', 'INTERPRETS_ARTICLE', 'weight', 1.15)
  ), v_t);

  perform public.graph_rag_sync_control('finish_run', jsonb_build_object(
    'run_id', v_run->'run_id', 'started_at', v_run->>'started_at', 'status', 'succeeded'));
  raise notice 'R0 ok — five sections, four judicial tracks, an exception and a regulation link';
end $$;

set role service_role;


-- R1: pinned civil law, scope auto — confident section 03.
do $$
declare
  v_res  jsonb;
  v_keys text[];
begin
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true);
  select array_agg(i->>'node_key') into v_keys
    from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i;
  if v_res->'routing'->>'section' is distinct from '03' or (v_res->'routing'->>'confident')::boolean is not true
     or v_res->'routing'->>'source' <> 'law' or v_res->'routing'->>'scope' <> 'auto' then
    raise exception 'R1: routing must be 03 / confident / by the pinned law / auto: %', v_res->'routing';
  end if;
  if not v_keys @> array['article:civ1', 'article:proc1', 'article:adm1'] then
    raise exception 'R1: auto keeps every article (other sections only lower): %', v_keys;
  end if;
  if 'principle:pa' = any (v_keys) or 'principle:ps_bank' = any (v_keys) then
    raise exception 'R1: an administrative principle / a banking committee came for a civil question: %', v_keys;
  end if;
  if not v_keys @> array['principle:po', 'principle:pa_cite', 'principle:pa_com', 'principle:ps_civ'] then
    raise exception 'R1: ordinary courts, a Board principle citing a civil article, a commercial circuit and a civil committee must stay: %', v_keys;
  end if;
  if (select (i->>'score')::numeric from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:adm1')
     >= (select (i->>'score')::numeric from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:civ2') then
    raise exception 'R1: the administrative article must score below the civil ones: %', v_res->'articles';
  end if;
  raise notice 'R1 ok — auto: other-section articles lowered, admin principles and an unrelated committee dropped, citing/governed ones kept';
end $$;

-- R2: the same, scope 'section' — only section 03 (and 00), but explicit links still cross.
do $$
declare
  v_res  jsonb;
  v_keys text[];
  v_item jsonb;
begin
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'section');
  select array_agg(i->>'node_key') into v_keys
    from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i;
  if v_res->'routing'->>'scope' <> 'section' then
    raise exception 'R2: scope must be reported: %', v_res->'routing';
  end if;
  if 'article:adm1' = any (v_keys) or 'principle:pa_com' = any (v_keys) or 'principle:pa' = any (v_keys) then
    raise exception 'R2: section scope let another section in: %', v_keys;
  end if;
  if not v_keys @> array['article:civ1', 'article:proc1', 'principle:po', 'principle:pa_cite', 'principle:ps_civ'] then
    raise exception 'R2: section scope dropped an in-section / procedural / governed result: %', v_keys;
  end if;
  select i into v_item from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:adm2';
  if v_item is null or v_item->>'via_edge_type' <> 'EXEMPTS_FROM' then
    raise exception 'R2: an exception link must cross sections even in section scope: %', v_keys;
  end if;
  raise notice 'R2 ok — section scope keeps the section and procedure; explicit links still cross';
end $$;

-- R3: scope 'all' — routing off.
do $$
declare
  v_res  jsonb;
  v_keys text[];
begin
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'all');
  select array_agg(i->>'node_key') into v_keys
    from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i;
  if not v_keys @> array['article:adm1', 'principle:pa', 'principle:ps_bank', 'principle:pa_com'] then
    raise exception 'R3: scope all must keep everything: %', v_keys;
  end if;
  -- An unknown scope falls back to auto.
  v_res := public.graph_rag_retrieve_scoped(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true, 'bogus');
  if v_res->'routing'->>'scope' <> 'auto' then
    raise exception 'R3: an unknown scope must be auto: %', v_res->'routing';
  end if;
  raise notice 'R3 ok — scope all turns routing off; unknown scope = auto';
end $$;

-- R4: no pinned law — the section comes from the vote.
do $$
declare
  v_res jsonb;
begin
  -- «وديعة»: three civil articles, one administrative → 03, confident.
  v_res := public.graph_rag_retrieve(array['وديعة:*'], null, null, null, 20, 10, 0, 0, true);
  if v_res->'routing'->>'section' is distinct from '03' or (v_res->'routing'->>'confident')::boolean is not true
     or v_res->'routing'->>'source' <> 'vote' then
    raise exception 'R4: three civil votes of four must decide 03 confidently: %', v_res->'routing';
  end if;
  if not (v_res->'routing'->'laws') ? 'civ' or (v_res->'routing'->'laws') ? 'adm' then
    raise exception 'R4: the route laws are the in-section articles'' laws: %', v_res->'routing';
  end if;
  -- «فسخ» with no pin: civil 3, administrative 1 article + 2 admin principles, commercial 1 → no majority.
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, null, 20, 10, 0, 0, true);
  if v_res->'routing'->>'section' is not null or (v_res->'routing'->>'confident')::boolean then
    raise exception 'R4: a split vote must leave the section open: %', v_res->'routing';
  end if;
  if not exists (select 1 from jsonb_array_elements(v_res->'principles') i where i->>'node_key' = 'principle:pa') then
    raise exception 'R4: with no section, administrative principles stay (lowered): %', v_res->'principles';
  end if;
  raise notice 'R4 ok — the vote decides the section; a split vote leaves it open';
end $$;

-- R5: IMPLEMENTED_BY — the regulation article brings the system article it implements.
do $$
declare
  v_res  jsonb;
  v_item jsonb;
begin
  v_res := public.graph_rag_retrieve(array['مهلة:*'], null, null, null, 20, 10, 0, 0, true);
  select i into v_item from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:sys';
  if v_item is null or v_item->>'via_edge_type' <> 'IMPLEMENTED_BY' or (v_item->>'hop')::int <> 1 then
    raise exception 'R5: the system article must arrive by IMPLEMENTED_BY: %', v_res->'articles';
  end if;
  raise notice 'R5 ok — regulation article → its system article';
end $$;

reset role;

-- R6: grants — service_role only.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    -- 20261117_10 adds p_seed_keys: test whichever signature is installed.
    coalesce(to_regprocedure('public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text, text[])')::text,
             'public.graph_rag_retrieve_scoped(text[], text, text, text, integer, integer, integer, integer, boolean, text)'),
    'library_graph.route_factor(text, text, text, text, boolean, text[])'
  ] loop
    if exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', fn, 'EXECUTE') then
      raise exception 'R6: anon can run %', fn;
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') and has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception 'R6: authenticated can run %', fn;
    end if;
  end loop;
  if (select count(*) from pg_proc where proname = 'graph_rag_retrieve' and pronamespace = 'public'::regnamespace) <> 1 then
    raise exception 'R6: graph_rag_retrieve must have exactly one signature (PostgREST overloads)';
  end if;
  raise notice 'R6 ok — service_role only; one graph_rag_retrieve';
end $$;

-- R7: (a) a procedural law among the question's strongest articles does not
-- admit an administrative principle once a section is decided; (b) an
-- other-section article that is a direct hit AND the target of an exception
-- from a seed is not left at its lowered score.
do $$
declare
  v_res   jsonb;
  v_keys  text[];
  v_item  jsonb;
  v_s0    numeric;
begin
  insert into library_graph.nodes (node_key, node_type, source_id, collection_id, title, display_text, content_sha256, metadata)
  values ('principle:pa_proc', 'principle', 'pa_proc', 'bog', 'ديوان المظالم — 3', 'فسخ وفق المرافعات',
          repeat('0', 63) || '5', '{"track":"admin","track_class":"admin","governing_laws":["proc"]}'::jsonb);

  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true);
  select array_agg(i->>'node_key') into v_keys
    from jsonb_array_elements((v_res->'articles') || (v_res->'principles')) i;
  if 'principle:pa_proc' = any (v_keys) then
    raise exception 'R7a: a Board principle came in only because it applies the procedural law: %', v_keys;
  end if;
  select (i->>'score')::numeric into v_s0 from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:adm1';

  insert into library_graph.edges (source_key, target_key, edge_type, weight)
  values ('article:civ1', 'article:adm1', 'EXEMPTS_FROM', 1.1);
  v_res := public.graph_rag_retrieve(array['فسخ:*'], null, null, 'civ', 20, 10, 0, 0, true);
  select i into v_item from jsonb_array_elements(v_res->'articles') i where i->>'node_key' = 'article:adm1';
  if v_item is null or v_item->>'via_edge_type' is distinct from 'EXEMPTS_FROM' or (v_item->>'score')::numeric <= v_s0 then
    raise exception 'R7b: adm1 must be lifted by the exception from civ1 (was %): %', v_s0, v_item;
  end if;
  delete from library_graph.edges where source_key = 'article:civ1' and target_key = 'article:adm1';
  delete from library_graph.nodes where node_key = 'principle:pa_proc';
  raise notice 'R7 ok — procedure does not admit Board principles; an explicit link lifts a lowered direct hit';
end $$;
