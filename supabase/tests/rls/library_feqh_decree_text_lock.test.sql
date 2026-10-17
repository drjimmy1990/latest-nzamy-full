-- library_feqh_decree_text_lock.test.sql — proves 20261018_02 (owner answer ١٨٣).
-- Chain (run.sh, postgres:16) — the library chain, then 20261018_02 TWICE
-- (idempotent), then 20260922_01 + 20261018_02 again (the documented re-open
-- and its repair). Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_feqh_locator_labels.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql $M/20261018_02_library_feqh_decree_text_lock.sql \
--     $M/20260922_01_library_grants.sql $M/20261018_02_library_feqh_decree_text_lock.sql \
--     supabase/tests/rls/library_feqh_decree_text_lock.test.sql
-- NEGATIVE CONTROL: the same chain without the three 20261018_02 files, with
-- supabase/tests/rls/prelude_decree_pages_live_columns.sql in their place (the
-- fixture needs decree_pages.order_index) → T1 fails: «anon can read locked
-- column feqh_blocks.matn» (run 2026-10-17).
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.feqh_books (id, title, author, school, type)
  values ('book-1', 'المغني', 'ابن قدامة', 'حنبلي', 'sharia');
insert into library.feqh_chapters (id, book_id, title, order_index)
  values ('00000000-0000-0000-0000-0000000000c1', 'book-1', 'كتاب البيوع', 1);
insert into library.feqh_sections (id, chapter_id, title, order_index)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'باب الشروط', 1);
insert into library.feqh_blocks (id, section_id, book_id, topic, page_number, matn, sharh, order_index)
  values ('b-1', '00000000-0000-0000-0000-0000000000a1', 'book-1', 'الشرط الأول', 2, 'العقد شريعة المتعاقدين', 'شرح العقد', 0),
         ('b-2', '00000000-0000-0000-0000-0000000000a1', 'book-1', 'الشرط الثاني', 3, 'نص الصفحة الثالثة', '', 1),
         ('b-3', '00000000-0000-0000-0000-0000000000a1', 'book-1', 'الشرط الثالث', 5, 'نص الصفحة الخامسة', '', 2);
insert into library.decrees_circulars (id, title, type, issuer)
  values ('00000000-0000-0000-0000-0000000000d1', 'تعميم تجريبي', 'circular', 'وزارة العدل');
insert into library.decree_pages (decree_id, page_number, content, order_index)
  values ('00000000-0000-0000-0000-0000000000d1', 1, 'نص الصفحة الأولى من التعميم', 0),
         ('00000000-0000-0000-0000-0000000000d1', 2, 'نص الصفحة الثانية', 1),
         ('00000000-0000-0000-0000-0000000000d1', 3, 'نص الصفحة الثالثة', 2);

-- T1 privileges: the place columns only; no text, no fts; no writes
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    foreach col in array array['id', 'section_id', 'topic', 'volume_number', 'page_number', 'order_index',
                               'created_at', 'updated_at', 'page_label', 'volume_label', 'book_id'] loop
      if not has_column_privilege(r, 'library.feqh_blocks', col, 'SELECT') then
        raise exception 'T1 FAIL: % cannot read public column feqh_blocks.%', r, col;
      end if;
    end loop;
    foreach col in array array['matn', 'sharh', 'hashiyah', 'fts'] loop
      if has_column_privilege(r, 'library.feqh_blocks', col, 'SELECT') then
        raise exception 'T1 FAIL: % can read locked column feqh_blocks.%', r, col;
      end if;
    end loop;
    foreach col in array array['id', 'decree_id', 'page_number', 'created_at', 'updated_at', 'number_text', 'order_index'] loop
      if not has_column_privilege(r, 'library.decree_pages', col, 'SELECT') then
        raise exception 'T1 FAIL: % cannot read public column decree_pages.%', r, col;
      end if;
    end loop;
    if has_column_privilege(r, 'library.decree_pages', 'content', 'SELECT') then
      raise exception 'T1 FAIL: % can read decree_pages.content', r;
    end if;
    if has_any_column_privilege(r, 'library.feqh_blocks', 'UPDATE') or has_any_column_privilege(r, 'library.feqh_blocks', 'INSERT')
       or has_table_privilege(r, 'library.feqh_blocks', 'DELETE')
       or has_any_column_privilege(r, 'library.decree_pages', 'UPDATE') or has_table_privilege(r, 'library.decree_pages', 'DELETE') then
      raise exception 'T1 FAIL: % can write feqh_blocks / decree_pages', r;
    end if;
  end loop;
  raise notice 'T1 PASS: anon / authenticated / app_user read the place columns only; no matn, sharh, hashiyah, fts or content; no writes';
end $$;

-- T2 a guest reads the place of each block and page (the read policy survived), never the text
set role anon;
do $$
declare
  n int;
begin
  select count(*) into n from library.feqh_blocks where book_id = 'book-1' and page_number is not null;
  if n <> 3 then raise exception 'T2 FAIL: anon read % block places, expected 3', n; end if;
  select count(*) into n from library.decree_pages where decree_id = '00000000-0000-0000-0000-0000000000d1';
  if n <> 3 then raise exception 'T2 FAIL: anon read % decree page places, expected 3', n; end if;
  select count(*) into n from library.feqh_books;
  if n <> 1 then raise exception 'T2 FAIL: anon lost the book catalogue'; end if;
  select count(*) into n from library.decrees_circulars;
  if n <> 1 then raise exception 'T2 FAIL: anon lost the decree catalogue'; end if;
  begin
    select count(*) into n from library.feqh_blocks where matn is not null;
    raise exception 'T2 FAIL: anon filtered on feqh_blocks.matn (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.feqh_blocks where fts @@ to_tsquery('simple', 'العقد');
    raise exception 'T2 FAIL: anon searched feqh_blocks.fts (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform b.* from library.feqh_blocks b limit 1;
    raise exception 'T2 FAIL: anon read feqh_blocks with *';
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decree_pages where content is not null;
    raise exception 'T2 FAIL: anon read decree_pages.content (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform library.search_feqh_page('''العقد''', 0, 10);
    raise exception 'T2 FAIL: anon executed search_feqh_page';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: anon reads 3 block places, 3 page places and both catalogues; matn / fts / * / content / search_feqh_page raise insufficient_privilege';
end $$;
reset role;

-- T3 the same for a signed-in request (app_user is a member of authenticated)
set role app_user;
do $$
declare n int;
begin
  begin
    select count(*) into n from library.feqh_blocks where sharh is not null or hashiyah is not null;
    raise exception 'T3 FAIL: app_user read sharh / hashiyah (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.decree_pages where content is not null;
    raise exception 'T3 FAIL: app_user read decree_pages.content (% rows)', n;
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a signed-in request cannot read the fiqh text or the decree content either';
end $$;
reset role;

-- T4 the service role reads everything, and search_feqh_page returns the window with its book
set role service_role;
do $$
declare
  n   int;
  res jsonb;
  row jsonb;
begin
  select count(*) into n from library.feqh_blocks where matn is not null;
  if n <> 3 then raise exception 'T4 FAIL: service_role read % blocks of text, expected 3', n; end if;
  select count(*) into n from library.decree_pages where content is not null;
  if n <> 3 then raise exception 'T4 FAIL: service_role read % pages of text, expected 3', n; end if;
  res := library.search_feqh_page('''العقد''', 0, 10);
  if (res->>'count')::int < 1 or jsonb_array_length(res->'rows') < 1 then
    raise exception 'T4 FAIL: search_feqh_page found nothing for العقد: %', res;
  end if;
  row := res->'rows'->0;
  if row->>'id' <> 'b-1' or row->>'matn' <> 'العقد شريعة المتعاقدين'
     or row->'feqh_sections'->'feqh_chapters'->'feqh_books'->>'id' <> 'book-1'
     or row->'feqh_sections'->'feqh_chapters'->'feqh_books'->>'author' <> 'ابن قدامة' then
    raise exception 'T4 FAIL: search_feqh_page row has the wrong shape: %', row;
  end if;
  res := library.search_feqh_page('''العقد''', 5, 10);
  if jsonb_array_length(res->'rows') <> 0 or (res->>'count')::int < 1 then
    raise exception 'T4 FAIL: a window past the end should be empty with the full count: %', res;
  end if;
  raise notice 'T4 PASS: service_role reads the text; search_feqh_page returns the row nested section → chapter → book, and an empty window past the end keeps the count';
end $$;
reset role;

-- T5 the function: INVOKER, 4s, search_path '', service_role only; RLS on; a read policy each
do $$
declare
  cfg text[];
  definer boolean;
begin
  select p.proconfig, p.prosecdef into cfg, definer
    from pg_proc p where p.oid = to_regprocedure('library.search_feqh_page(text, integer, integer)');
  if definer or not ('statement_timeout=4s' = any (cfg)) or not ('search_path=""' = any (cfg)) then
    raise exception 'T5 FAIL: search_feqh_page config is % (definer %)', cfg, definer;
  end if;
  if has_function_privilege('anon', 'library.search_feqh_page(text, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'library.search_feqh_page(text, integer, integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'library.search_feqh_page(text, integer, integer)', 'EXECUTE') then
    raise exception 'T5 FAIL: EXECUTE is not service_role only';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'library.feqh_blocks'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'library.decree_pages'::regclass) then
    raise exception 'T5 FAIL: RLS is off';
  end if;
  if obj_description('library.feqh_blocks'::regclass, 'pg_class') not like '%TEXT SERVER-ONLY since 20261018_02%' then
    raise exception 'T5 FAIL: the marker is missing';
  end if;
  raise notice 'T5 PASS: INVOKER, statement_timeout 4s, search_path empty, service_role only; RLS on; marker present';
end $$;
