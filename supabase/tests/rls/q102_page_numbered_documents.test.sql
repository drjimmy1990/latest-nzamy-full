-- q102_page_numbered_documents.test.sql — proves the one-time file
-- supabase/one-time/2026-10-17_q102_page_numbered_documents.sql (owner decision ١٠٢).
-- Chain (run.sh, postgres:16): the library schema, the GENERATED fixture (same
-- list as the file), then the one-time file TWICE (the second run must change
-- nothing and still pass). Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260824_articles_number_text_widen.sql \
--     supabase/tests/rls/prelude_q102_fixture.sql \
--     supabase/one-time/2026-10-17_q102_page_numbered_documents.sql \
--     supabase/one-time/2026-10-17_q102_page_numbered_documents.sql \
--     supabase/tests/rls/q102_page_numbered_documents.test.sql
--
-- NEGATIVE CONTROL (must FAIL): add supabase/tests/rls/prelude_q102_drift.sql
-- after the fixture (one more page-numbered «نظام» the list does not name, as a
-- reload would bring) → block 2 raises «the list and the database disagree»
-- and nothing changes.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T1 every listed document now carries the owner's label
do $$
declare
  listed integer;
  labelled integer;
begin
  select count(*) into listed from public.q102_laws_before
   where slug not like 'q102-%' and type in ('نظام', 'لائحة تنفيذية')
     and slug not in (select slug from public.q102_kept);
  select count(*) into labelled from library.laws l join public.q102_laws_before b using (slug)
   where b.slug not like 'q102-%' and b.slug not in (select slug from public.q102_kept)
     and l.type = 'دليل إرشادي / تنظيم إداري';
  if listed = 0 or labelled <> listed then
    raise exception 'T1 FAIL: % listed, % labelled', listed, labelled;
  end if;
  raise notice 'T1 PASS: % page-numbered documents labelled «دليل إرشادي / تنظيم إداري»', labelled;
end $$;

-- T2 the documents the decision does not name keep their type
do $$
declare
  t text;
begin
  select type into t from library.laws where slug = 'q102-mixed';
  if t <> 'نظام' then raise exception 'T2 FAIL: mixed pages/articles law became %', t; end if;
  select type into t from library.laws where slug = 'q102-circular';
  if t <> 'تعميم' then raise exception 'T2 FAIL: page-numbered circular became %', t; end if;
  select type into t from library.laws where slug = 'q102-normal';
  if t <> 'نظام' then raise exception 'T2 FAIL: ordinary law became %', t; end if;
  raise notice 'T2 PASS: mixed, circular and ordinary documents unchanged';
end $$;

-- T3 the page anchors: not one article row changed (ids, numbers, «الصفحة N», text)
do $$
declare
  diff integer;
begin
  select count(*) into diff from (
    (select id, law_slug, number, number_text, text, status from library.articles
     except select * from public.q102_articles_before)
    union all
    (select * from public.q102_articles_before
     except select id, law_slug, number, number_text, text, status from library.articles)
  ) d;
  if diff <> 0 then raise exception 'T3 FAIL: % article rows differ from before', diff; end if;
  raise notice 'T3 PASS: every article (id, number, number_text, text) is exactly as before';
end $$;

-- T4 only `type` moved on library.laws, and only on listed rows
do $$
declare
  diff integer;
begin
  select count(*) into diff
    from library.laws l join public.q102_laws_before b using (slug)
   where l.type <> b.type
     and not (b.slug not like 'q102-%' and b.type in ('نظام', 'لائحة تنفيذية')
              and b.slug not in (select slug from public.q102_kept)
              and l.type = 'دليل إرشادي / تنظيم إداري');
  if diff <> 0 then raise exception 'T4 FAIL: % unlisted laws changed type', diff; end if;
  if (select count(*) from library.laws) <> (select count(*) from public.q102_laws_before) then
    raise exception 'T4 FAIL: the number of laws changed';
  end if;
  raise notice 'T4 PASS: no other law changed (kept documents included: %); no law added or removed',
    (select count(*) from public.q102_kept);
end $$;

select 'q102_page_numbered_documents: ALL PASS' as result;
