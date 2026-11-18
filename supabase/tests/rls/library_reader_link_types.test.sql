-- library_reader_link_types.test.sql — 20261128_60 (owner decision ٦٠): the
-- reader's law map counts only the link types it is given, sends no text, and
-- is callable by service_role only. The app passes the types matching the
-- owner's graph file (src/lib/library/graphLinkTypes.ts).
--
-- CHAIN (needs pgvector; repo root, Git Bash): the chain of
-- library_reader_links.test.sql up to 20261126_10, then 20261128_60 TWICE
-- (idempotent), the _verify block, then this file:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l8_refbox_block.sql
--   sed -n '/^-- >>> verify:l8_refbox/,/^-- <<< verify:l8_refbox/p' $M/_verify.sql > "$B"
--   PG_IMAGE=pgvector/pgvector:pg16 bash $R/run.sh $R/prelude_extensions_schema.sql \
--     $M/20260626_legal_library_schema.sql $M/20260730_article_regulations.sql \
--     $M/20261110_10_library_graph_rag.sql $M/20261113_10_library_graph_explorer.sql \
--     $M/20261114_10_library_graph_rag_fixes.sql $M/20261115_10_library_graph_depth.sql \
--     $M/20261116_10_library_graph_links.sql $M/20261126_10_library_reader_links.sql \
--     $M/20261128_60_library_reader_link_types.sql $M/20261128_60_library_reader_link_types.sql \
--     "$B" $R/library_reader_link_types.test.sql
-- NEGATIVE CONTROL: without 20261126_10 the precondition stops:
-- «run 20261126_10_library_reader_links.sql first».
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.laws (slug, title, type, status)
values ('labor', 'نظام العمل', 'نظام', 'active'),
       ('civil', 'نظام المعاملات المدنية', 'نظام', 'active'),
       ('old-labor', 'نظام العمل القديم', 'نظام', 'repealed'),
       ('labor-reg', 'اللائحة التنفيذية لنظام العمل', 'لائحة', 'active')
on conflict (slug) do nothing;

insert into library_graph.nodes (node_key, node_type, source_id, law_slug, is_embeddable, title, display_text, content_sha256)
values
  ('law:labor', 'law', 'labor', 'labor', false, 'نظام العمل', 'نظام العمل', repeat('a', 64)),
  ('law:old-labor', 'law', 'old-labor', 'old-labor', false, 'نظام العمل القديم', 'نظام العمل القديم', repeat('b', 64)),
  ('article:l1', 'article', 'l1', 'labor', true, 'نظام العمل — المادة 1', 'نص سري للمادة', repeat('1', 64)),
  ('article:l2', 'article', 'l2', 'labor', true, 'نظام العمل — المادة 2', 'نص سري للمادة', repeat('2', 64)),
  ('article:c1', 'article', 'c1', 'civil', true, 'نظام المعاملات — المادة 1', 'نص سري للمادة', repeat('3', 64)),
  ('article:r1', 'article', 'r1', 'labor-reg', true, 'اللائحة — المادة 1', 'نص سري للمادة', repeat('4', 64));

insert into library_graph.edges (source_key, target_key, edge_type, origin, weight, evidence)
values
  ('article:l1', 'article:c1', 'CITES_ARTICLE', 'auto_watchdog', 0.9, 'دليل سري'),    -- hidden by ٦٠
  ('article:c1', 'article:l2', 'SUBJECT_TO', 'auto_watchdog', 1.1, 'دليل سري'),      -- hidden by ٦٠
  ('law:labor', 'law:old-labor', 'SUPERSEDES_LAW', 'auto_watchdog', 1.0, null),      -- shown
  ('article:r1', 'article:l1', 'PARENT_LAW', 'auto_watchdog', 1.0, null),            -- shown
  ('article:l1', 'article:r1', 'IMPLEMENTED_BY', 'auto_watchdog', 1.0, null);        -- hidden by ٦٠

-- T1: privileges.
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.library_reader_law_links_typed(text, text[], integer)', 'EXECUTE') then
      raise exception 'T1 FAIL: % can execute library_reader_law_links_typed', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.library_reader_law_links_typed(text, text[], integer)', 'EXECUTE') then
    raise exception 'T1 FAIL: service_role cannot execute library_reader_law_links_typed';
  end if;
  raise notice 'T1 ok: service_role only';
end $$;

set role service_role;

-- T2: only the given types count; a law linked by hidden types only is absent;
-- no text or evidence.
do $$
declare
  shown text[] := array['INTERPRETS_ARTICLE', 'AMENDS_ARTICLE', 'SUPERSEDES_LAW', 'PARENT_LAW'];
  v jsonb := public.library_reader_law_links_typed('labor', shown, 24);
  reg jsonb;
begin
  if jsonb_array_length(v->'links') <> 2 then
    raise exception 'T2 FAIL: expected labor-reg and old-labor only, got %', v->'links';
  end if;
  if v::text like '%"civil"%' then
    raise exception 'T2 FAIL: civil is linked by hidden types only: %', v;
  end if;
  select l into reg from jsonb_array_elements(v->'links') l where l->>'slug' = 'labor-reg';
  if reg is null or (reg->>'in')::int <> 1 or (reg->>'out')::int <> 0 or reg->'types' <> '["PARENT_LAW"]'::jsonb then
    raise exception 'T2 FAIL: labor-reg in 1 / out 0 / PARENT_LAW only (IMPLEMENTED_BY hidden), got %', reg;
  end if;
  if v::text like '%سري%' or v::text like '%CITES_ARTICLE%' or v::text like '%IMPLEMENTED_BY%' then
    raise exception 'T2 FAIL: text, evidence or a hidden type leaked: %', v;
  end if;
  raise notice 'T2 ok: %', v;
end $$;

-- T3: the old untyped map still counts the hidden types (why the app moved);
-- null / empty types and an empty slug answer an empty map; the limit truncates.
do $$
declare v jsonb;
begin
  v := public.library_reader_law_links('labor', 24);
  if not v::text like '%"civil"%' then
    raise exception 'T3 FAIL: control — the untyped map should list civil, got %', v;
  end if;
  v := public.library_reader_law_links_typed('labor', null, 24);
  if jsonb_array_length(v->'links') <> 0 then raise exception 'T3 FAIL: null types, got %', v; end if;
  v := public.library_reader_law_links_typed('labor', '{}', 24);
  if jsonb_array_length(v->'links') <> 0 then raise exception 'T3 FAIL: empty types, got %', v; end if;
  v := public.library_reader_law_links_typed('', array['PARENT_LAW'], 24);
  if jsonb_array_length(v->'links') <> 0 then raise exception 'T3 FAIL: empty slug, got %', v; end if;
  v := public.library_reader_law_links_typed('labor', array['PARENT_LAW', 'SUPERSEDES_LAW'], 1);
  if jsonb_array_length(v->'links') <> 1 or not (v->>'truncated')::boolean then
    raise exception 'T3 FAIL: limit 1 should truncate, got %', v;
  end if;
  raise notice 'T3 ok';
end $$;

reset role;

select 'library_reader_link_types: all assertions passed' as result;
