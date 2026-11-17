-- library_reader_links.test.sql — 20261126_10: the law reader's map counts the
-- laws a law is linked with, both ways, through citation and law-relation
-- edges only, sends no text, and is callable by service_role only.
--
-- CHAIN (needs pgvector; repo root, Git Bash): the graph chain of
-- docs/graph-rag/GRAPH_RAG_GUIDE.md §Tests up to 20261116_10, then 20261126_10
-- TWICE (idempotent), the _verify block, then this file:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l6_reader_block.sql
--   sed -n '/^-- >>> verify:l6_reader/,/^-- <<< verify:l6_reader/p' $M/_verify.sql > "$B"
--   PG_IMAGE=pgvector/pgvector:pg16 bash $R/run.sh $R/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql \
--     $M/20261126_10_library_reader_links.sql $M/20261126_10_library_reader_links.sql \
--     "$B" $R/library_reader_links.test.sql
-- NEGATIVE CONTROL: without 20261116_10 the precondition stops:
-- «run 20261116_10_library_graph_links.sql first».
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.laws (slug, title, type, status)
values ('labor', 'نظام العمل', 'نظام', 'active'),
       ('civil', 'نظام المعاملات المدنية', 'نظام', 'active'),
       ('old-labor', 'نظام العمل القديم', 'نظام', 'repealed'),
       ('penal', 'نظام العقوبات', 'نظام', 'active')
on conflict (slug) do nothing;

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, is_embeddable, title, display_text, content_sha256)
values
  ('law:labor', 'law', 'labor', 'labor', false, 'نظام العمل', 'نظام العمل', repeat('a', 64)),
  ('law:old-labor', 'law', 'old-labor', 'old-labor', false, 'نظام العمل القديم', 'نظام العمل القديم', repeat('b', 64)),
  ('article:l1', 'article', 'l1', 'labor', true, 'نظام العمل — المادة 1', 'نص سري للمادة', repeat('1', 64)),
  ('article:l2', 'article', 'l2', 'labor', true, 'نظام العمل — المادة 2', 'نص سري للمادة', repeat('2', 64)),
  ('article:c1', 'article', 'c1', 'civil', true, 'نظام المعاملات — المادة 1', 'نص سري للمادة', repeat('3', 64)),
  ('article:c2', 'article', 'c2', 'civil', true, 'نظام المعاملات — المادة 2', 'نص سري للمادة', repeat('4', 64)),
  ('article:p1', 'article', 'p1', 'penal', true, 'نظام العقوبات — المادة 1', 'نص سري للمادة', repeat('5', 64));

insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence)
values
  ('article:l1', 'article:c1', 'CITES_ARTICLE', 'auto_watchdog', 0.9, 'دليل سري'),   -- labor → civil
  ('article:l2', 'article:c2', 'EXEMPTS_FROM', 'auto_watchdog', 1.25, 'دليل سري'),   -- labor → civil
  ('article:c1', 'article:l2', 'SUBJECT_TO', 'auto_watchdog', 1.1, 'دليل سري'),     -- civil → labor
  ('law:labor', 'law:old-labor', 'SUPERSEDES_LAW', 'auto_watchdog', 1.0, null),     -- labor → old-labor
  ('article:l1', 'article:p1', 'SIMILAR_TO', 'auto_similarity', 0.9, 'تقارب'),       -- meaning link: not a citation
  ('article:l1', 'article:l2', 'NEXT_ARTICLE', 'auto_watchdog', 1.0, null);         -- same law

-- T1: privileges.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.library_reader_law_links(text, integer)', 'EXECUTE') then
      raise exception 'T1 FAIL: % can execute library_reader_law_links', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.library_reader_law_links(text, integer)', 'EXECUTE') then
    raise exception 'T1 FAIL: service_role cannot execute library_reader_law_links';
  end if;
  raise notice 'T1 ok: service_role only';
end $$;

set role service_role;

-- T2: counts both ways, strongest first, law-level relation included, meaning
-- and same-law links left out, no text.
do $$
declare
  v jsonb := public.library_reader_law_links('labor', 24);
  civil jsonb;
begin
  if jsonb_array_length(v->'links') <> 2 then
    raise exception 'T2 FAIL: expected 2 linked laws (civil, old-labor), got %', v->'links';
  end if;
  civil := v->'links'->0;
  if civil->>'slug' <> 'civil' or (civil->>'out')::int <> 2 or (civil->>'in')::int <> 1 then
    raise exception 'T2 FAIL: civil should come first with out 2 / in 1, got %', civil;
  end if;
  if civil->>'title' <> 'نظام المعاملات المدنية' or civil->>'status' <> 'active' then
    raise exception 'T2 FAIL: civil title/status from library.laws, got %', civil;
  end if;
  if not (civil->'types') @> '["CITES_ARTICLE","EXEMPTS_FROM","SUBJECT_TO"]'::jsonb then
    raise exception 'T2 FAIL: civil types, got %', civil->'types';
  end if;
  if v->'links'->1->>'slug' <> 'old-labor' or v->'links'->1->>'status' <> 'repealed' then
    raise exception 'T2 FAIL: old-labor second and repealed, got %', v->'links'->1;
  end if;
  if v::text like '%penal%' then
    raise exception 'T2 FAIL: a SIMILAR_TO link reached the map: %', v;
  end if;
  if v::text like '%سري%' then
    raise exception 'T2 FAIL: text or evidence leaked: %', v;
  end if;
  if (v->>'truncated')::boolean then
    raise exception 'T2 FAIL: not truncated at 24';
  end if;
  raise notice 'T2 ok: %', v;
end $$;

-- T3: the limit truncates and says so; the other side sees the reverse counts;
-- an unknown or empty slug answers an empty list.
do $$
declare v jsonb;
begin
  v := public.library_reader_law_links('labor', 1);
  if jsonb_array_length(v->'links') <> 1 or not (v->>'truncated')::boolean then
    raise exception 'T3 FAIL: limit 1 should truncate, got %', v;
  end if;
  v := public.library_reader_law_links('civil', 24);
  if v->'links'->0->>'slug' <> 'labor' or (v->'links'->0->>'out')::int <> 1 or (v->'links'->0->>'in')::int <> 2 then
    raise exception 'T3 FAIL: civil sees labor out 1 / in 2, got %', v;
  end if;
  v := public.library_reader_law_links('nope', 24);
  if jsonb_array_length(v->'links') <> 0 then raise exception 'T3 FAIL: unknown slug, got %', v; end if;
  v := public.library_reader_law_links('', 24);
  if jsonb_array_length(v->'links') <> 0 then raise exception 'T3 FAIL: empty slug, got %', v; end if;
  raise notice 'T3 ok';
end $$;

reset role;

select 'library_reader_links: all assertions passed' as result;
