-- library_search_scoped_page.test.sql — proves 20261025_41 (owner-free P5,
-- N2.6: the search inside one law / collection series / book series, 4s) and
-- its _verify section.
-- Chain (run.sh, postgres:16) — the library chain with the article history
-- columns, the fiqh locator labels and every text lock in force, the _verify
-- block (must only NOTICE), 20261025_41 TWICE (idempotent), the _verify block
-- again (must pass), then this file. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_search_scoped_page_block.sql
--   sed -n '/^-- >>> verify:search_scoped_page/,/^-- <<< verify:search_scoped_page/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_article_history_columns.sql $M/20260729_feqh_locator_labels.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261016_01_library_principles_text_lock.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql \
--     "$B" $M/20261025_41_library_search_scoped_page.sql $M/20261025_41_library_search_scoped_page.sql "$B" \
--     $R/library_search_scoped_page.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261025_41 files → T1
-- fails (the function does not exist).
--
-- THE TIME LIMIT: `set statement_timeout` bounds the call when PostgREST
-- (v12+) applies it before the call — library_search_principles_page.test.sql
-- T6 proves that mechanism; this file asserts the 4s value is in proconfig.
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- ── Fixtures ────────────────────────────────────────────────────────────────
insert into library.laws (slug, title, type, section_code) values
  ('sc-law',   'نظام المنافسات', 'نظام', '04'),
  ('sc-other', 'نظام آخر',       'نظام', '04');
insert into library.articles (id, law_slug, number, number_text, text, original_text, executive_reg_text, status, order_index) values
  ('sc-law__a3', 'sc-law', '3', 'الثالثة', 'فسخ العقد عند التأخير مع غرامة تأخير', null, null, 'active', 3),
  ('sc-law__a1', 'sc-law', '1', 'الأولى',  'فسخ العقد بالتراضي', null, null, 'active', 1),
  ('sc-law__a2', 'sc-law', '2', 'الثانية', 'التحكيم في فسخ العقد', null, null, 'active', 2),
  -- the regulation text is in fts: a hit there belongs to the law too
  ('sc-law__a5', 'sc-law', '5', null,      'نص عام', null, 'يجوز فسخ الاتفاقية عند الإخلال', 'active', 5),
  ('sc-other__a1', 'sc-other', '1', null,  'فسخ العقد في نظام آخر', null, null, 'active', 1);

insert into library.judicial_collections (id, title, court, part, series_id) values
  ('sc-v02', 'مجموعة الأحكام', 'ديوان المظالم', 1, 'sc-series'),
  ('sc-v01', 'مجموعة الأحكام', 'ديوان المظالم', 1, 'sc-series'),
  ('sc-out', 'مجموعة أخرى',    'ديوان المظالم', 1, null);
insert into library.principles (id, collection_id, principle_number, issuing_body, text, facts, reasons, ruling, order_index) values
  ('sc-v01__p2', 'sc-v01', '2', 'المحكمة الإدارية العليا', 'غرامة التأخير تسقط بالقوة القاهرة', 'وقائع', 'أسباب', 'منطوق', 2),
  ('sc-v01__p1', 'sc-v01', '1', 'المحكمة الإدارية العليا', 'لا تحكيم في العقد الإداري', null, null, null, 1),
  ('sc-v02__p1', 'sc-v02', '1', 'المحكمة الإدارية العليا', 'غرامة التأخير لا تجاوز عشرة في المائة', null, null, null, 1),
  ('sc-out__p1', 'sc-out', '1', 'المحكمة الإدارية العليا', 'غرامة التأخير في مجموعة أخرى', null, null, null, 1);

insert into library.feqh_books (id, title, author) values
  ('sc-b-2', 'المغني — الجزء 2', 'ابن قدامة'),
  ('sc-b-1', 'المغني — الجزء 1', 'ابن قدامة'),
  ('sc-b-x', 'كتاب آخر', 'مؤلف');
insert into library.feqh_chapters (id, book_id, title, order_index) values
  ('00000000-0000-0000-0000-0000000000c1', 'sc-b-1', 'كتاب البيوع', 1),
  ('00000000-0000-0000-0000-0000000000c2', 'sc-b-2', 'كتاب القضاء', 1),
  ('00000000-0000-0000-0000-0000000000c3', 'sc-b-x', 'باب', 1);
insert into library.feqh_sections (id, chapter_id, title, order_index) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'باب خيار الغبن', 1),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', 'باب البينات', 1),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000c3', 'فصل', 1);
insert into library.feqh_blocks (id, section_id, book_id, topic, volume_number, page_number, volume_label, page_label, matn, sharh, hashiyah, order_index) values
  ('sc-b-2__blk-1', '00000000-0000-0000-0000-0000000000d2', 'sc-b-2', 'البينات', 14, 312, null, null, 'إذا ادعى الغبن', 'فصل في خيار الغبن والفسخ', '["حاشية"]', 1),
  ('sc-b-1__blk-9', '00000000-0000-0000-0000-0000000000d1', 'sc-b-1', 'خيار الغبن', 4, 218, null, null, 'من غبن غبنا فله الخيار', 'يثبت خيار الغبن فيفسخ', null, 9),
  ('sc-b-1__blk-3', '00000000-0000-0000-0000-0000000000d1', 'sc-b-1', 'الإجارة', 4, 100, 'مقدمة', null, 'خيار الغبن في الإجارة', null, null, 3),
  ('sc-b-x__blk-1', '00000000-0000-0000-0000-0000000000d3', 'sc-b-x', 'غبن', 1, 1, null, null, 'خيار الغبن', null, null, 1);

create function pg_temp.ids(j jsonb) returns text
language sql as $$ select coalesce(string_agg(r->>'id', ',' order by o), '') from jsonb_array_elements(j->'rows') with ordinality as t(r, o) $$;

-- T1 the function: INVOKER, 4s, search_path '', service_role only
do $$
declare
  fn  constant text := 'library.search_scoped_page(text, text[], text, integer, integer)';
  cfg text[];
  definer boolean;
begin
  if to_regprocedure(fn) is null then raise exception 'T1 FAIL: % does not exist', fn; end if;
  select p.proconfig, p.prosecdef into cfg, definer from pg_proc p where p.oid = to_regprocedure(fn);
  if definer then raise exception 'T1 FAIL: SECURITY DEFINER'; end if;
  if not ('statement_timeout=4s' = any (cfg)) or not ('search_path=""' = any (cfg)) then
    raise exception 'T1 FAIL: proconfig %', cfg;
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
    raise exception 'T1 FAIL: an API role can EXECUTE it';
  end if;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'T1 FAIL: service_role cannot EXECUTE it';
  end if;
  raise notice 'T1 PASS: INVOKER, statement_timeout 4s, search_path empty, service_role only';
end $$;

-- T2 anon / authenticated get 42501 (it would return the server-only text)
set role anon;
do $$
begin
  perform library.search_scoped_page('law', array['sc-law'], '''فسخ''', 0, 10);
  raise exception 'T2 FAIL: anon ran search_scoped_page';
exception when insufficient_privilege then
  raise notice 'T2 PASS: anon gets 42501';
end $$;
reset role;
set role authenticated;
do $$
begin
  perform library.search_scoped_page('book', array['sc-b-1'], '''غبن''', 0, 10);
  raise exception 'T2 FAIL: authenticated ran search_scoped_page';
exception when insufficient_privilege then
  raise notice 'T2 PASS: authenticated gets 42501';
end $$;
reset role;

-- The rest runs as the route does: service_role.
set role service_role;

-- T3 law: only this law, reading order (order_index), regulation text counts,
-- operators (AND NOT, OR, prefix), paging
do $$
declare j jsonb;
begin
  j := library.search_scoped_page('law', array['sc-law'], '''فسخ''', 0, 10);
  if pg_temp.ids(j) <> 'sc-law__a1,sc-law__a2,sc-law__a3,sc-law__a5' or (j->>'count')::int <> 4 then
    raise exception 'T3 FAIL: law scope gave % (count %)', pg_temp.ids(j), j->>'count';
  end if;
  if j->'rows'->3->>'executive_reg_text' <> 'يجوز فسخ الاتفاقية عند الإخلال' or j->'rows'->0->>'volume_id' <> 'sc-law' then
    raise exception 'T3 FAIL: row shape %', j->'rows'->3;
  end if;
  j := library.search_scoped_page('law', array['sc-law'], '''فسخ'' & !''التحكيم''', 0, 10);
  if pg_temp.ids(j) <> 'sc-law__a1,sc-law__a3,sc-law__a5' then raise exception 'T3 FAIL: NOT gave %', pg_temp.ids(j); end if;
  j := library.search_scoped_page('law', array['sc-law'], '''بالتراضي'' | ''غرامة''', 0, 10);
  if pg_temp.ids(j) <> 'sc-law__a1,sc-law__a3' then raise exception 'T3 FAIL: OR gave %', pg_temp.ids(j); end if;
  j := library.search_scoped_page('law', array['sc-law'], '''غرامة'' <-> ''تأخير''', 0, 10);
  if pg_temp.ids(j) <> 'sc-law__a3' then raise exception 'T3 FAIL: phrase gave %', pg_temp.ids(j); end if;
  j := library.search_scoped_page('law', array['sc-law'], '''الاتفاق'':*', 0, 10);
  if pg_temp.ids(j) <> 'sc-law__a5' then raise exception 'T3 FAIL: prefix gave %', pg_temp.ids(j); end if;
  j := library.search_scoped_page('law', array['sc-law'], '''فسخ''', 2, 1);
  if pg_temp.ids(j) <> 'sc-law__a3' or (j->>'count')::int <> 4 then
    raise exception 'T3 FAIL: page 3 of 1 gave % (count %)', pg_temp.ids(j), j->>'count';
  end if;
  j := library.search_scoped_page('law', array['sc-law'], '''فسخ''', 10, 5);
  if jsonb_array_length(j->'rows') <> 0 or (j->>'count')::int <> 4 then
    raise exception 'T3 FAIL: a page past the end gave %', j;
  end if;
  raise notice 'T3 PASS: law scope — this law only, reading order, regulation text, AND NOT / OR / phrase / prefix, paging';
end $$;

-- T4 collection series: every volume, in the order the route passes (volume
-- order, not id order), nothing from outside the series
do $$
declare j jsonb;
begin
  j := library.search_scoped_page('collection', array['sc-v01', 'sc-v02'], '''غرامة''', 0, 10);
  if pg_temp.ids(j) <> 'sc-v01__p2,sc-v02__p1' or (j->>'count')::int <> 2 then
    raise exception 'T4 FAIL: series gave % (count %)', pg_temp.ids(j), j->>'count';
  end if;
  j := library.search_scoped_page('collection', array['sc-v02', 'sc-v01'], '''غرامة''', 0, 10);
  if pg_temp.ids(j) <> 'sc-v02__p1,sc-v01__p2' then
    raise exception 'T4 FAIL: the volume order is not the order of p_ids: %', pg_temp.ids(j);
  end if;
  j := library.search_scoped_page('collection', array['sc-v01', 'sc-v02'], '''غرامة''', 0, 10);
  if j->'rows'->0->>'facts' <> 'وقائع' or j->'rows'->0->>'ruling' <> 'منطوق' or j->'rows'->0->>'volume_id' <> 'sc-v01' then
    raise exception 'T4 FAIL: row shape %', j->'rows'->0;
  end if;
  raise notice 'T4 PASS: collection scope — every volume of the series, in volume order, nothing outside it';
end $$;

-- T5 book series: every volume, volume order then reading order, the place
-- (volume / page / labels / chapter / section) on each row
do $$
declare j jsonb;
begin
  j := library.search_scoped_page('book', array['sc-b-1', 'sc-b-2'], '''الغبن''', 0, 10);
  if pg_temp.ids(j) <> 'sc-b-1__blk-3,sc-b-1__blk-9,sc-b-2__blk-1' or (j->>'count')::int <> 3 then
    raise exception 'T5 FAIL: book series gave % (count %)', pg_temp.ids(j), j->>'count';
  end if;
  if j->'rows'->0->>'volume_label' <> 'مقدمة' or j->'rows'->1->>'chapter_title' <> 'كتاب البيوع'
     or j->'rows'->1->>'section_title' <> 'باب خيار الغبن' or (j->'rows'->1->>'page_number')::int <> 218
     or j->'rows'->2->'hashiyah'->>0 <> 'حاشية' then
    raise exception 'T5 FAIL: row shape %', j->'rows';
  end if;
  raise notice 'T5 PASS: book scope — every volume, reading order, place and layers on each row';
end $$;

-- T6 bounds: unknown kind refused (22023), empty ids / query → nothing, at
-- most 101 rows a window and 200 ids a call
do $$
declare j jsonb; many text[];
begin
  begin
    perform library.search_scoped_page('decree', array['x'], '''فسخ''', 0, 10);
    raise exception 'T6 FAIL: an unknown kind was accepted';
  exception when invalid_parameter_value then null;
  end;
  j := library.search_scoped_page('law', array[]::text[], '''فسخ''', 0, 10);
  if (j->>'count')::int <> 0 then raise exception 'T6 FAIL: empty ids gave %', j; end if;
  j := library.search_scoped_page('law', null, '''فسخ''', 0, 10);
  if (j->>'count')::int <> 0 then raise exception 'T6 FAIL: null ids gave %', j; end if;
  j := library.search_scoped_page('law', array['sc-law'], '   ', 0, 10);
  if (j->>'count')::int <> 0 then raise exception 'T6 FAIL: a blank query gave %', j; end if;
  select array_agg('pad-' || g) || array['sc-law'] into many from generate_series(1, 200) g;
  j := library.search_scoped_page('law', many, '''فسخ''', 0, 10);
  if (j->>'count')::int <> 0 then raise exception 'T6 FAIL: an id past the 200th was searched: %', j; end if;
  j := library.search_scoped_page('law', array['sc-law'], '''فسخ''', -5, 100000);
  if (j->>'count')::int <> 4 or jsonb_array_length(j->'rows') <> 4 then raise exception 'T6 FAIL: negative offset / huge fetch gave %', j; end if;
  raise notice 'T6 PASS: unknown kind 22023, empty ids or query → 0, 200-id and 101-row caps, negative offset clamped';
end $$;

do $$
declare j jsonb;
begin
  insert into library.articles (id, law_slug, number, text, status, order_index)
    select 'sc-law__bulk-' || g, 'sc-law', g::text, 'فسخ مكرر', 'active', 100 + g from generate_series(1, 150) g;
  j := library.search_scoped_page('law', array['sc-law'], '''فسخ''', 0, 5000);
  if jsonb_array_length(j->'rows') <> 101 or (j->>'count')::int <> 154 then
    raise exception 'T6 FAIL: the window is not capped at 101 rows (% rows, count %)', jsonb_array_length(j->'rows'), j->>'count';
  end if;
  delete from library.articles where id like 'sc-law__bulk-%';
  raise notice 'T6 PASS: one window is at most 101 rows; count is the whole match set';
end $$;
reset role;
