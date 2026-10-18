-- library_search_law_articles_page.test.sql — proves 20261019_41 (the laws search window, 4s).
-- Chain (run.sh, postgres:16) — the article lock chain (with the article
-- history columns that add original_text), then 20261019_41 TWICE
-- (idempotent). Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_article_history_columns.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261019_41_library_search_law_articles_page.sql $M/20261019_41_library_search_law_articles_page.sql \
--     supabase/tests/rls/library_search_law_articles_page.test.sql
-- NEGATIVE CONTROL: the same chain without the two 20261019_41 files → T1
-- fails (the function does not exist).
--
-- THE TIME LIMIT: a function's `set statement_timeout` bounds the call only
-- when PostgREST (v12+, db-hoisted-tx-settings) applies it before the call;
-- library_search_principles_page.test.sql T6 proves that mechanism in Docker.
-- This file asserts the 4s value sits in the function's proconfig (T6).
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.laws (slug, title, type, section_code) values
  ('companies-law', 'نظام الشركات',                   'نظام',          '05'),
  ('labor-exec',    'اللائحة التنفيذية لنظام العمل', 'لائحة تنفيذية', '06'),
  ('labor-law',     'نظام العمل',                     'نظام',          '06');

insert into library.articles (id, law_slug, number, number_text, text, original_text, status) values
  ('companies-law__art-1', 'companies-law', '1', 'الأولى', 'عقد الشركة يلتزم به الشركاء', null, 'active'),
  ('labor-exec__art-1',    'labor-exec',    '1', null,     'عقد العمل المكتوب بنسختين',    null, 'active'),
  ('labor-law__art-1',     'labor-law',     '1', null,     'يسمى هذا النظام نظام العمل',    null, 'active'),
  ('labor-law__art-2',     'labor-law',     '2', null,     'عقد العمل يبرم بين صاحب العمل والعامل', null, 'active'),
  -- a repealed article: empty text, its wording in original_text (fts covers it)
  ('labor-law__art-3',     'labor-law',     '3', null,     '', 'كان عقد العمل يحرر بنسختين', 'repealed');

-- 1,100 matches of one word, to prove the window never returns more than 1001 rows
insert into library.articles (id, law_slug, number, text, status)
  select 'bulk__art-' || lpad(g::text, 5, '0'), 'companies-law', g::text, 'كلمةاختبار رقم ' || g, 'active'
    from generate_series(1, 1100) g;

-- T1 rows and count for a word, id order, the route's row shape (no embed)
set role service_role;
do $$
declare
  res jsonb;
  ids text;
  r   jsonb;
begin
  res := library.search_law_articles_page('''عقد''', 0, 50);
  if jsonb_typeof(res -> 'rows') <> 'array' or jsonb_typeof(res -> 'count') <> 'number' then
    raise exception 'T1 FAIL: unexpected shape %', res;
  end if;
  select string_agg(x ->> 'id', ',' order by ord) into ids
    from jsonb_array_elements(res -> 'rows') with ordinality as t(x, ord);
  if ids is distinct from 'companies-law__art-1,labor-exec__art-1,labor-law__art-2,labor-law__art-3'
     or (res ->> 'count')::int <> 4 then
    raise exception 'T1 FAIL: ids=% count=%', ids, res ->> 'count';
  end if;
  r := res -> 'rows' -> 0;
  if (select array_agg(k order by k) from jsonb_object_keys(r) k)
       <> array['id', 'law_slug', 'number', 'number_text', 'original_text', 'status', 'text']::text[] then
    raise exception 'T1 FAIL: row keys %', (select array_agg(k order by k) from jsonb_object_keys(r) k);
  end if;
  if r ->> 'law_slug' <> 'companies-law' or r ->> 'number' <> '1' or r ->> 'number_text' <> 'الأولى'
     or r ->> 'text' <> 'عقد الشركة يلتزم به الشركاء' or r ->> 'status' <> 'active' then
    raise exception 'T1 FAIL: row values %', r;
  end if;
  r := res -> 'rows' -> 3;
  if r ->> 'text' <> '' or r ->> 'original_text' <> 'كان عقد العمل يحرر بنسختين' or r ->> 'status' <> 'repealed' then
    raise exception 'T1 FAIL: the repealed row %', r;
  end if;
  -- an OR query, as parseSearchQuery writes one
  res := library.search_law_articles_page('''الشركاء'' | ''بنسختين''', 0, 50);
  if (res ->> 'count')::int <> 3 then raise exception 'T1 FAIL or-query: %', res; end if;
  raise notice 'T1 PASS: 4 rows in id order with id, number, number_text, status, text, original_text, law_slug (no embed); count 4; an OR query';
end $$;

-- T2 the status filter (articles.status, no join)
do $$
declare res jsonb;
begin
  res := library.search_law_articles_page('''عقد''', 0, 50, p_status => 'repealed');
  if (res ->> 'count')::int <> 1 or (res -> 'rows' -> 0 ->> 'id') <> 'labor-law__art-3' then
    raise exception 'T2 FAIL repealed: %', res;
  end if;
  res := library.search_law_articles_page('''عقد''', 0, 50, p_status => 'active');
  if (res ->> 'count')::int <> 3 then raise exception 'T2 FAIL active: %', res; end if;
  raise notice 'T2 PASS: status filter (repealed 1, active 3)';
end $$;

-- T3 the section and law-type filters (through library.laws)
do $$
declare res jsonb;
begin
  res := library.search_law_articles_page('''عقد''', 0, 50, p_section_code => '05');
  if (res ->> 'count')::int <> 1 or (res -> 'rows' -> 0 ->> 'id') <> 'companies-law__art-1' then
    raise exception 'T3 FAIL section 05: %', res;
  end if;
  res := library.search_law_articles_page('''عقد''', 0, 50, p_law_type => 'لائحة تنفيذية');
  if (res ->> 'count')::int <> 1 or (res -> 'rows' -> 0 ->> 'id') <> 'labor-exec__art-1' then
    raise exception 'T3 FAIL law type: %', res;
  end if;
  res := library.search_law_articles_page('''عقد''', 0, 50, p_section_code => '06', p_law_type => 'نظام');
  if (res ->> 'count')::int <> 2 or (res -> 'rows' -> 0 ->> 'id') <> 'labor-law__art-2' then
    raise exception 'T3 FAIL section 06 + نظام: %', res;
  end if;
  res := library.search_law_articles_page('''عقد''', 0, 50, p_status => 'active', p_section_code => '06');
  if (res ->> 'count')::int <> 2 then raise exception 'T3 FAIL section 06 + active: %', res; end if;
  res := library.search_law_articles_page('''عقد''', 0, 50, p_section_code => '99');
  if res <> '{"rows": [], "count": 0}'::jsonb then raise exception 'T3 FAIL unknown section: %', res; end if;
  raise notice 'T3 PASS: section / law-type filters through laws (05 → 1, لائحة تنفيذية → 1, 06+نظام → 2, 06+active → 2, 99 → 0)';
end $$;

-- T4 the window: an offset page, a page past the end keeps the count, the 1001-row cap, no match
do $$
declare res jsonb;
begin
  res := library.search_law_articles_page('''عقد''', 1, 1);
  if jsonb_array_length(res -> 'rows') <> 1 or (res -> 'rows' -> 0 ->> 'id') <> 'labor-exec__art-1'
     or (res ->> 'count')::int <> 4 then
    raise exception 'T4 FAIL window: %', res;
  end if;
  res := library.search_law_articles_page('''عقد''', 50, 50);
  if jsonb_array_length(res -> 'rows') <> 0 or (res ->> 'count')::int <> 4 then
    raise exception 'T4 FAIL past end: %', res;
  end if;
  res := library.search_law_articles_page('''كلمةاختبار''', 0, 5000);
  if jsonb_array_length(res -> 'rows') <> 1001 or (res ->> 'count')::int <> 1100 then
    raise exception 'T4 FAIL cap: % rows, count %', jsonb_array_length(res -> 'rows'), res ->> 'count';
  end if;
  res := library.search_law_articles_page('''كلمةاختبار''', 1050, 100);
  if jsonb_array_length(res -> 'rows') <> 50 or (res -> 'rows' -> 0 ->> 'id') <> 'bulk__art-01051' then
    raise exception 'T4 FAIL deep window: % rows, first %', jsonb_array_length(res -> 'rows'), res -> 'rows' -> 0 ->> 'id';
  end if;
  res := library.search_law_articles_page('''كوفيد''', 0, 50);
  if res <> '{"rows": [], "count": 0}'::jsonb then raise exception 'T4 FAIL no match: %', res; end if;
  res := library.search_law_articles_page('''عقد''', 0, 0);
  if jsonb_array_length(res -> 'rows') <> 0 or (res ->> 'count')::int <> 4 then
    raise exception 'T4 FAIL fetch 0: %', res;
  end if;
  raise notice 'T4 PASS: offset window; past-end page keeps count 4; fetch 5000 → 1001 rows of 1100; deep window; no match; fetch 0';
end $$;
reset role;

-- T5 the API roles cannot call it (it returns server-only article text)
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    if has_function_privilege(r, 'library.search_law_articles_page(text, integer, integer, text, text, text)', 'EXECUTE') then
      raise exception 'T5 FAIL: % can EXECUTE library.search_law_articles_page', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', 'library.search_law_articles_page(text, integer, integer, text, text, text)', 'EXECUTE') then
    raise exception 'T5 FAIL: service_role cannot EXECUTE library.search_law_articles_page';
  end if;
end $$;
set role anon;
do $$
begin
  perform library.search_law_articles_page('''عقد''', 0, 50);
  raise exception 'T5 FAIL: anon called library.search_law_articles_page';
exception when insufficient_privilege then
  raise notice 'T5 PASS: anon gets 42501';
end $$;
reset role;
set role authenticated;
do $$
begin
  perform library.search_law_articles_page('''عقد''', 0, 50);
  raise exception 'T5 FAIL: authenticated called library.search_law_articles_page';
exception when insufficient_privilege then
  raise notice 'T5 PASS: authenticated gets 42501';
end $$;
reset role;

-- T6 INVOKER, search_path '', statement_timeout 4s in proconfig (what PostgREST hoists)
do $$
declare
  cfg text[];
  definer boolean;
begin
  select proconfig, prosecdef into cfg, definer from pg_proc
   where oid = 'library.search_law_articles_page(text, integer, integer, text, text, text)'::regprocedure;
  if definer or not ('statement_timeout=4s' = any (cfg)) or not ('search_path=""' = any (cfg)) then
    raise exception 'T6 FAIL: prosecdef=% proconfig=%', definer, cfg;
  end if;
  raise notice 'T6 PASS: SECURITY INVOKER, proconfig %', cfg;
end $$;

-- T7 the article lock of 20260929_01 is untouched
do $$
begin
  if has_any_column_privilege('anon', 'library.articles', 'SELECT')
     or has_any_column_privilege('authenticated', 'library.articles', 'SELECT') then
    raise exception 'T7 FAIL: an API role can read library.articles';
  end if;
  raise notice 'T7 PASS: library.articles is still server-only';
end $$;

-- T8 the plan: an unfiltered window never reads library.laws (the route's
-- lawWindowNeedsJoin rule), a section filter does; the ids are collected in the
-- MATERIALIZED CTE and only then sorted (no primary-key walk). The function's
-- own body (pg_proc.prosrc) is prepared as a generic plan, which is how a SQL
-- function's statements are planned (parameters, not values).
do $$
declare
  body text;
  line text;
  plan text;
begin
  select p.prosrc into body from pg_proc p
   where p.oid = 'library.search_law_articles_page(text, integer, integer, text, text, text)'::regprocedure;
  body := replace(replace(replace(replace(replace(replace(body,
            'p_section_code', '$5'), 'p_law_type', '$6'), 'p_tsquery', '$1'),
            'p_offset', '$2'), 'p_fetch', '$3'), 'p_status', '$4');
  execute format('prepare t8 (text, integer, integer, text, text, text) as %s', body);
  set local plan_cache_mode = force_generic_plan;

  plan := '';
  for line in execute $q$explain (analyze, costs off, timing off, summary off) execute t8('''عقد''', 0, 50, null, null, null)$q$ loop
    plan := plan || line || E'\n';
  end loop;
  if plan !~ 'on laws l[^\n]*\(never executed\)' then
    raise exception 'T8 FAIL: the unfiltered window read library.laws:%', E'\n' || plan;
  end if;
  if plan !~ 'CTE matched' or plan !~ 'Sort Key: m\.id' or plan !~ 'CTE Scan on matched m' then
    raise exception 'T8 FAIL: the window does not sort the collected ids:%', E'\n' || plan;
  end if;

  plan := '';
  for line in execute $q$explain (analyze, costs off, timing off, summary off) execute t8('''عقد''', 0, 50, null, '05', null)$q$ loop
    plan := plan || line || E'\n';
  end loop;
  if plan !~ 'on laws l' or plan ~ 'on laws l[^\n]*\(never executed\)' then
    raise exception 'T8 FAIL: the section filter did not read library.laws:%', E'\n' || plan;
  end if;
  deallocate t8;
  raise notice 'T8 PASS: unfiltered → library.laws never executed; section filter → laws read; ids materialized, then sorted';
end $$;

select 'library_search_law_articles_page: ALL PASS' as result;
