-- library_regulation_ref.test.sql — proves 20261130_30 (owner file 19 Nov
-- §1.9, batch l10-relations) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain up to the server-only article tables (20260929_01) and the column lock
-- (20261004_01), the l10_regref _verify block BEFORE the file (must answer
-- false, not fail), 20261130_30 TWICE (idempotent), 20260929_01 AGAIN (the
-- re-run of the lock must keep the new column server-only), the _verify block
-- again, then this file. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l10_regref_block.sql
--   sed -n '/^-- >>> verify:l10_regref/,/^-- <<< verify:l10_regref/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql "$B" \
--     $M/20261130_30_library_regulation_ref.sql $M/20261130_30_library_regulation_ref.sql \
--     $M/20260929_01_library_text_server_only.sql "$B" \
--     $R/library_regulation_ref.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without 20260929_01 (both
-- places) → "20261130_30: anon / authenticated can read library.articles".
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 the columns: nullable text on both tables
do $$
declare t text; typ text; nn boolean;
begin
  foreach t in array array['library.articles', 'library.chapters'] loop
    select format_type(a.atttypid, a.atttypmod), a.attnotnull into typ, nn
      from pg_attribute a where a.attrelid = t::regclass and a.attname = 'regulation_ref' and not a.attisdropped;
    if typ is distinct from 'text' or nn then raise exception 'T1 FAIL: %.regulation_ref is % not-null=%', t, typ, nn; end if;
  end loop;
  raise notice 'T1 PASS: articles.regulation_ref and chapters.regulation_ref are nullable text';
end $$;

-- fixture: one law, its own article 1 and a merged regulation's article 1
insert into library.laws (slug, title, type, description, status) values ('reg-ref-law', 'نظام اختبار', 'نظام', 'وصف', 'active');
insert into library.chapters (id, law_slug, number, title, order_index, regulation_ref) values
  ('00000000-0000-5000-8000-000000000001', 'reg-ref-law', 1, 'الباب الأول', 1, null),
  ('00000000-0000-5000-8000-000000000002', 'reg-ref-law', 1, 'الفصل الأول', 2, 'لائحة التفتيش');
insert into library.articles (id, law_slug, chapter_id, number, text, regulation_ref) values
  ('reg-ref-law__art-1', 'reg-ref-law', '00000000-0000-5000-8000-000000000001', '1', 'نص المادة الأولى من النظام', null),
  ('reg-ref-law__art-1__ch1_i0', 'reg-ref-law', '00000000-0000-5000-8000-000000000002', '1', 'نص المادة الأولى من اللائحة', 'لائحة التفتيش');

-- T2 (law, regulation_ref, number) names exactly one article each
do $$
begin
  if (select count(*) from library.articles where law_slug = 'reg-ref-law' and number = '1') <> 2 then
    raise exception 'T2 FAIL: fixture';
  end if;
  if (select id from library.articles where law_slug = 'reg-ref-law' and number = '1' and regulation_ref is null) <> 'reg-ref-law__art-1'
     or (select id from library.articles where law_slug = 'reg-ref-law' and number = '1' and regulation_ref = 'لائحة التفتيش') <> 'reg-ref-law__art-1__ch1_i0' then
    raise exception 'T2 FAIL: (law, regulation_ref, number) does not name one article';
  end if;
  raise notice 'T2 PASS: the law''s own article 1 and the regulation''s article 1 are told apart by regulation_ref';
end $$;

-- T3 anon / authenticated cannot read articles.regulation_ref (server-only like the table)
do $$
declare r text; ok boolean;
begin
  foreach r in array array['anon', 'authenticated'] loop
    ok := false;
    begin
      execute format('set local role %I', r);
      perform regulation_ref from library.articles limit 1;
    exception when insufficient_privilege then ok := true;
    end;
    reset role;
    if not ok then raise exception 'T3 FAIL: % read library.articles.regulation_ref', r; end if;
    if has_column_privilege(r, 'library.articles', 'regulation_ref', 'SELECT') then
      raise exception 'T3 FAIL: % holds SELECT on articles.regulation_ref', r;
    end if;
  end loop;
  raise notice 'T3 PASS: articles.regulation_ref denied to anon and authenticated';
end $$;

-- T4 service_role reads and writes both columns
do $$
begin
  set local role service_role;
  update library.articles set regulation_ref = 'لائحة التفتيش' where id = 'reg-ref-law__art-1__ch1_i0';
  update library.chapters set regulation_ref = 'لائحة التفتيش' where id = '00000000-0000-5000-8000-000000000002';
  if (select regulation_ref from library.articles where id = 'reg-ref-law__art-1__ch1_i0') <> 'لائحة التفتيش' then
    raise exception 'T4 FAIL: service_role read-back';
  end if;
  reset role;
  raise notice 'T4 PASS: service_role reads and writes regulation_ref';
end $$;

-- T5 chapters keep their posture: regulation_ref is exactly as readable as the chapter title
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_column_privilege(r, 'library.chapters', 'regulation_ref', 'SELECT')
       is distinct from has_column_privilege(r, 'library.chapters', 'title', 'SELECT') then
      raise exception 'T5 FAIL: % chapters.regulation_ref posture differs from chapters.title', r;
    end if;
  end loop;
  raise notice 'T5 PASS: chapters.regulation_ref follows the public chapters table (title readable = %)',
    has_column_privilege('anon', 'library.chapters', 'title', 'SELECT');
end $$;

-- T6 the _verify section answers true now
do $$
begin
  if not (
    (select pg_catalog.count(*) from pg_catalog.pg_attribute
      where attrelid in ('library.articles'::regclass, 'library.chapters'::regclass)
        and attname = 'regulation_ref' and not attisdropped) = 2
    and not has_column_privilege('anon', 'library.articles', 'regulation_ref', 'SELECT')) then
    raise exception 'T6 FAIL';
  end if;
  raise notice 'T6 PASS: verify:l10_regref conditions hold';
end $$;
