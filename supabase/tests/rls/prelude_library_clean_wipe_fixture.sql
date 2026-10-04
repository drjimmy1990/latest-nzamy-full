-- prelude_library_clean_wipe_fixture.sql — rows in all 14 library content tables
-- plus one row in each of the 4 user tables the wipe must keep. Listed BEFORE
-- supabase/one-time/2026-10-04_library_clean_wipe.sql in the chain of
-- library_clean_wipe.test.sql (which documents the full command).

-- Stands in for the team removing the dashes before `set local nzamy.confirm_wipe`
-- in block 2: every later connection (each file of the chain) starts confirmed.
-- T6 of the test resets it and proves the file as written wipes nothing.
alter database postgres set nzamy.confirm_wipe = 'auth.nezamy.sa';

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000aa');

insert into library.laws (slug, title, type, section_code)
  values ('wipe-law', 'نظام اختباري', 'نظام', '00');
insert into library.chapters (law_slug, number, title, order_index)
  values ('wipe-law', 1, 'الباب الأول', 1);
insert into library.articles (id, law_slug, number, text, status)
  values ('wipe-law__art-1', 'wipe-law', '1', 'نص المادة', 'active');
insert into library.article_amendments (article_id, date, source, type, summary, full_text)
  values ('wipe-law__art-1', '1442/01/01', 'مرسوم ملكي', 'تعديل', 'ملخص', 'النص');
insert into library.article_regulations (id, article_id, law_slug, ref, reg_num, text)
  values (gen_random_uuid(), 'wipe-law__art-1', 'wipe-law', 'اللائحة', '1', 'نص اللائحة');

insert into library.decrees_circulars (id, title, type)
  values ('00000000-0000-4000-8000-0000000000d1', 'مرسوم اختباري', 'royal');
insert into library.decree_pages (decree_id, page_number)
  values ('00000000-0000-4000-8000-0000000000d1', 1);

insert into library.judicial_collections (id, title) values ('wipe-col', 'مجموعة اختبارية');
insert into library.principles (id, collection_id, text, order_index)
  values ('wipe-col__p1', 'wipe-col', 'نص المبدأ', 1);
insert into library.principle_paragraphs (principle_id, order_index)
  values ('wipe-col__p1', 1);

insert into library.feqh_books (id, title) values ('wipe-book', 'كتاب اختباري');
insert into library.feqh_chapters (id, book_id, title, order_index)
  values ('00000000-0000-4000-8000-0000000000f1', 'wipe-book', 'كتاب الطهارة', 1);
insert into library.feqh_sections (id, chapter_id, title, order_index)
  values ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f1', 'باب المياه', 1);
insert into library.feqh_blocks (id, section_id, order_index)
  values ('wipe-book__b1', '00000000-0000-4000-8000-0000000000f2', 1);

-- The 4 user tables the wipe keeps. A folder item points at the article by id
-- (plain text, no foreign key) — it must survive the wipe untouched.
insert into library.smart_folders (id, user_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000aa', 'مجلدي');
insert into library.smart_folder_items (folder_id, entity_type, entity_id)
  values ('00000000-0000-4000-8000-0000000000e1', 'article', 'wipe-law__art-1');
insert into library.issue_reports (user_id, entity_type, entity_id, report_type)
  values ('00000000-0000-4000-8000-0000000000aa', 'article', 'wipe-law__art-1', 'typo');
insert into library.invitations (code) values ('WIPE-TEST');

-- Sanity: every content table really has a row before the wipe runs.
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array[
    'laws', 'chapters', 'articles', 'article_amendments', 'article_regulations',
    'decrees_circulars', 'decree_pages', 'judicial_collections', 'principles',
    'principle_paragraphs', 'feqh_books', 'feqh_chapters', 'feqh_sections', 'feqh_blocks']
  loop
    execute format('select count(*) from library.%I', t) into n;
    if n = 0 then raise exception 'fixture: library.% has no row', t; end if;
  end loop;
end $$;
