-- library_text_server_only.test.sql — proves 20260929_01 (owner decision T28-21).
-- Chain (run.sh, postgres:16) — the migration is listed TWICE to prove it is idempotent:
--   20260626_legal_library_schema.sql → 20260627_platform_settings.sql →
--   20260729_library_status.sql → 20260730_article_regulations.sql →
--   20260824_laws_effective_date_gregorian_columns.sql →
--   20260911_library_laws_enactment_gazette_schema.sql →
--   20260922_01_library_grants.sql → 20260922_04_library_view_security_invoker.sql →
--   20260929_01_library_text_server_only.sql → 20260929_01_library_text_server_only.sql → this file
-- Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260729_library_status.sql $M/20260730_article_regulations.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql $M/20260911_library_laws_enactment_gazette_schema.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260929_01_library_text_server_only.sql $M/20260929_01_library_text_server_only.sql \
--     supabase/tests/rls/library_text_server_only.test.sql
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- Fixture: one law with a chapter, an article, an amendment and a regulation row.
insert into library.laws (slug, title, type, section_code)
  values ('labor-law', 'نظام العمل', 'نظام', '06');
insert into library.chapters (law_slug, number, title, order_index)
  values ('labor-law', 1, 'التعريفات', 1);
insert into library.articles (id, law_slug, number, text, status)
  values ('labor-law__art-1', 'labor-law', '1', 'يسمى هذا النظام نظام العمل', 'active');
insert into library.article_amendments (article_id, date, source, type, summary, full_text)
  values ('labor-law__art-1', '1442/01/01', 'مرسوم ملكي', 'تعديل', 'ملخص', 'النص الكامل للتعديل');
insert into library.article_regulations (id, article_id, law_slug, ref, reg_num, text)
  values (gen_random_uuid(), 'labor-law__art-1', 'labor-law', 'اللائحة التنفيذية لنظام العمل', '1', 'نص اللائحة');

-- T1 no table or column privilege for the request roles (nor for app_user, a member of authenticated)
do $$
declare
  t text;
  r text;
begin
  foreach t in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    foreach r in array array['anon', 'authenticated', 'app_user']
    loop
      if has_table_privilege(r, t, 'SELECT') or has_any_column_privilege(r, t, 'SELECT') then
        raise exception 'T1 FAIL: % can SELECT %', r, t;
      end if;
      if has_table_privilege(r, t, 'INSERT') or has_table_privilege(r, t, 'UPDATE')
         or has_table_privilege(r, t, 'DELETE') then
        raise exception 'T1 FAIL: % can write %', r, t;
      end if;
    end loop;
  end loop;
  raise notice 'T1 PASS: anon / authenticated / app_user hold no privilege on articles, article_regulations, article_amendments';
end $$;

-- T2 an actual read as anon is refused with insufficient_privilege (42501) on all three
set role anon;
do $$
declare
  t text;
  n int;
begin
  foreach t in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    begin
      execute format('select count(*) from %s', t) into n;
      raise exception 'T2 FAIL: anon read % (% rows)', t, n;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'T2 PASS: anon SELECT on the three article tables raises insufficient_privilege';
end $$;
reset role;

-- T3 same for a signed-in request (app_user runs as a member of authenticated) and for authenticated itself
set role app_user;
do $$
declare
  t text;
  n int;
begin
  foreach t in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    begin
      execute format('select count(*) from %s', t) into n;
      raise exception 'T3 FAIL: app_user read % (% rows)', t, n;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  -- The law-detail embed shape, through a join, is refused too.
  begin
    select count(*) into n
      from library.articles a
      join library.article_regulations r on r.article_id = a.id;
    raise exception 'T3 FAIL: app_user read the articles/regulations join (% rows)', n;
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'T3 PASS: a signed-in (authenticated) SELECT on the three raises insufficient_privilege';
end $$;
reset role;

set role authenticated;
do $$
declare n int;
begin
  begin
    select count(*) into n from library.articles;
    raise exception 'T3b FAIL: authenticated read library.articles (% rows)', n;
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'T3b PASS: role authenticated itself is refused on library.articles';
end $$;
reset role;

-- T4 service_role (BYPASSRLS, as on Supabase) reads the text and the embeds the route needs
set role service_role;
do $$
declare
  n_art int;
  n_amd int;
  n_reg int;
  body text;
begin
  select count(*) into n_art from library.articles;
  select count(*) into n_amd from library.article_amendments;
  select count(*) into n_reg from library.article_regulations;
  select a.text into body from library.articles a where a.id = 'labor-law__art-1';
  if n_art <> 1 or n_amd <> 1 or n_reg <> 1 or body is distinct from 'يسمى هذا النظام نظام العمل' then
    raise exception 'T4 FAIL: service_role read articles=% amendments=% regulations=% text=%', n_art, n_amd, n_reg, body;
  end if;
  raise notice 'T4 PASS: service_role reads articles (1), amendments (1), regulations (1) with their text';
end $$;
reset role;

do $$
begin
  if not has_table_privilege('service_role', 'library.articles', 'INSERT')
     or not has_table_privilege('service_role', 'library.article_regulations', 'UPDATE')
     or not has_table_privilege('service_role', 'library.article_amendments', 'DELETE') then
    raise exception 'T4b FAIL: service_role lost write privileges (the seeder needs them)';
  end if;
  raise notice 'T4b PASS: service_role keeps write privileges on the three (seeder)';
end $$;

-- T5 the catalogue stays public: anon reads laws and chapters rows under RLS, and holds SELECT on the rest
set role anon;
do $$
declare
  n_laws int;
  n_ch   int;
begin
  select count(*) into n_laws from library.laws;
  select count(*) into n_ch from library.chapters;
  perform count(*) from library.principles;
  perform count(*) from library.decrees_circulars;
  perform count(*) from library.feqh_books;
  perform count(*) from library.judicial_collections;
  if n_laws <> 1 or n_ch <> 1 then
    raise exception 'T5 FAIL: anon reads laws=% chapters=% (expected 1 and 1)', n_laws, n_ch;
  end if;
  raise notice 'T5 PASS: anon still reads laws (1 row), chapters (1 row), principles, decrees, feqh books, collections';
end $$;
reset role;

do $$
begin
  if not has_table_privilege('anon', 'library.v_laws_enactment_status', 'SELECT') then
    raise exception 'T5b FAIL: anon lost SELECT on v_laws_enactment_status';
  end if;
  raise notice 'T5b PASS: v_laws_enactment_status stays anon-readable';
end $$;

-- T6 no read policy for the request roles survives, RLS stays on, the matview stays hidden
do $$
declare
  n int;
  t text;
begin
  select count(*) into n
    from pg_policies
   where schemaname = 'library'
     and tablename in ('articles', 'article_regulations', 'article_amendments')
     and cmd in ('SELECT', 'ALL')
     and roles && array['anon', 'authenticated', 'public']::name[];
  if n <> 0 then
    raise exception 'T6 FAIL: % read policies for anon/authenticated/public remain', n;
  end if;
  foreach t in array array['library.articles', 'library.article_regulations', 'library.article_amendments']
  loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'T6 FAIL: RLS is off on %', t;
    end if;
  end loop;
  if has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
     or has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT') then
    raise exception 'T6 FAIL: an API role can SELECT the article-snippet matview';
  end if;
  raise notice 'T6 PASS: no public read policy left, RLS on for all three, cross_section_search hidden';
end $$;

-- T7 an accidental re-grant still reads ZERO rows (RLS on, no policy) — the second line of defence
grant select on library.articles to anon;
set role anon;
do $$
declare n int;
begin
  select count(*) into n from library.articles;
  if n <> 0 then
    raise exception 'T7 FAIL: a bare re-grant exposed % article rows', n;
  end if;
  raise notice 'T7 PASS: with a stray SELECT grant, RLS still returns 0 article rows to anon';
end $$;
reset role;
revoke select on library.articles from anon;

-- T8 the marker that _verify.sql keys on is present
do $$
begin
  if coalesce(obj_description('library.articles'::regclass, 'pg_class'), '') not ilike '%server-only since 20260929_01%' then
    raise exception 'T8 FAIL: the 20260929_01 marker comment is missing on library.articles';
  end if;
  raise notice 'T8 PASS: marker comment present on library.articles';
end $$;
