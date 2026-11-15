-- prelude_library_left_behind_fixture.sql — a library just reloaded (ten
-- minutes ago) after the owner reorganised a fiqh book and dropped a law
-- chapter. Left behind by the previous load (two days ago): 1 article (its id
-- only lost a status suffix), 1 law chapter, 1 fiqh chapter, 2 fiqh sections,
-- 3 fiqh blocks. Chain and command: library_left_behind_cleanup.test.sql.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000aa');

insert into library.laws (slug, title, type, section_code, updated_at)
  values ('lbl', 'نظام اختباري', 'نظام', '00', now() - interval '10 minutes');

insert into library.chapters (id, law_slug, number, title, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', 'lbl', 1, 'الفصل الأول', now() - interval '9 minutes', now() - interval '9 minutes'),
  ('00000000-0000-4000-8000-0000000000c0', 'lbl', 2, 'الفصل القديم', now() - interval '2 days', now() - interval '2 days');

insert into library.articles (id, law_slug, number, text, status, chapter_id, created_at, updated_at) values
  ('lbl__art-2',         'lbl', '2', 'نص ٢', 'amended', '00000000-0000-4000-8000-0000000000c1', now() - interval '8 minutes', now() - interval '8 minutes'),
  ('lbl__art-2-amended', 'lbl', '2', 'قديم', 'amended', null, now() - interval '2 days', now() - interval '2 days');

insert into library.feqh_books (id, title, updated_at) values ('lbbook', 'كتاب اختباري', now() - interval '7 minutes');
insert into library.feqh_chapters (id, book_id, title, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000d1', 'lbbook', 'باب جديد', now() - interval '7 minutes', now() - interval '7 minutes'),
  ('00000000-0000-4000-8000-0000000000d0', 'lbbook', 'باب قديم', now() - interval '2 days', now() - interval '2 days');
insert into library.feqh_sections (id, chapter_id, title, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000d1', 'فصل جديد', now() - interval '6 minutes', now() - interval '6 minutes'),
  ('00000000-0000-4000-8000-0000000000e0', '00000000-0000-4000-8000-0000000000d0', 'فصل قديم ١', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000d1', 'فصل قديم ٢', now() - interval '2 days', now() - interval '2 days');
insert into library.feqh_blocks (id, section_id, matn, created_at, updated_at) values
  ('blk-new',  '00000000-0000-4000-8000-0000000000e1', 'جديد', now() - interval '5 minutes', now() - interval '5 minutes'),
  ('blk-old1', '00000000-0000-4000-8000-0000000000e0', 'قديم', now() - interval '2 days', now() - interval '2 days'),
  ('blk-old2', '00000000-0000-4000-8000-0000000000e2', 'قديم', now() - interval '2 days', now() - interval '2 days'),
  ('blk-old3', '00000000-0000-4000-8000-0000000000e1', 'قديم', now() - interval '2 days', now() - interval '2 days');

insert into library.smart_folders (id, user_id, name)
  values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000aa', 'مجلدي');
insert into library.smart_folder_items (folder_id, entity_type, entity_id) values
  ('00000000-0000-4000-8000-0000000000f1', 'article', 'lbl__art-2-amended'),
  ('00000000-0000-4000-8000-0000000000f1', 'feqh_block', 'blk-new');
