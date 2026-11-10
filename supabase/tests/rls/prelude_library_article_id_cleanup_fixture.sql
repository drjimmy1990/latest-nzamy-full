-- prelude_library_article_id_cleanup_fixture.sql — a library just reloaded with
-- the 2026-11-10 id rule. Left behind by the previous load: three
-- status-suffixed articles (their new ids were written), one article the owner
-- removed (no new id), one chapter the owner restructured away, and stale
-- amendment / regulation rows — some under old articles, one under an article
-- that survives.
-- Chain and command: library_article_id_cleanup.test.sql.
-- Timestamps are explicit (the update trigger does not fire on insert): the
-- load is 2026-11-12 09:00 UTC, the previous load 2026-11-08.
-- Old rows: articles 4, amendments 3, regulations 2, chapters 1.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000aa');

insert into library.laws (slug, title, type, section_code, updated_at)
  values ('idlaw', 'نظام اختباري', 'نظام', '00', '2026-11-12 09:00+00'),
         ('idlaw2', 'نظام اختباري ٢', 'نظام', '00', '2026-11-12 09:01+00');

-- Chapters: c1 written by this load, c0 left behind (with the removed article in it)
insert into library.chapters (id, law_slug, number, title, created_at, updated_at) values
  ('00000000-0000-4000-8000-0000000000c1', 'idlaw', 1, 'الفصل الأول', '2026-11-12 09:05+00', '2026-11-12 09:05+00'),
  ('00000000-0000-4000-8000-0000000000c0', 'idlaw', 0, 'SUBPART L', '2026-11-08 20:00+00', '2026-11-08 20:00+00');

-- Written by this load (new ids)
insert into library.articles (id, law_slug, number, text, status, chapter_id, updated_at) values
  ('idlaw__art-1',        'idlaw',  '1',  'نص ١',  'active',   '00000000-0000-4000-8000-0000000000c1', '2026-11-12 09:10+00'),
  ('idlaw__art-2',        'idlaw',  '2',  'نص ٢',  'amended',  '00000000-0000-4000-8000-0000000000c1', '2026-11-12 09:10+00'),
  ('idlaw__art-3',        'idlaw',  '3',  'نص ٣',  'repealed', '00000000-0000-4000-8000-0000000000c1', '2026-11-12 09:10+00'),
  -- two articles sharing number 10: both written by this load, both stay
  ('idlaw__art-10',       'idlaw',  '10', 'نص ١٠', 'active',   null, '2026-11-12 09:10+00'),
  ('idlaw__art-10-added', 'idlaw',  '10', 'نص ١٠ مضافة', 'added', null, '2026-11-12 09:11+00'),
  ('idlaw2__art-2',       'idlaw2', '2',  'نص',    'active',   null, '2026-11-12 09:12+00'),
  -- articles without a number (stored as '0', id by position)
  ('idlaw__art-i0',       'idlaw',  '0',  'بلا رقم ١', 'repealed', null, '2026-11-12 09:13+00'),
  ('idlaw__art-i1',       'idlaw',  '0',  'بلا رقم ٢', 'active',   null, '2026-11-12 09:13+00');

-- Left behind by the previous load
insert into library.articles (id, law_slug, number, text, status, chapter_id, created_at, updated_at) values
  ('idlaw__art-2-amended',  'idlaw', '2', 'نص ٢ قديم', 'amended',  null, '2026-11-08 20:00+00', '2026-11-08 20:00+00'),
  ('idlaw__art-3-repealed', 'idlaw', '3', 'نص ٣ قديم', 'repealed', null, '2026-11-08 20:00+00', '2026-11-08 20:00+00'),
  ('idlaw__art-i0-repealed', 'idlaw', '0', 'بلا رقم قديم', 'repealed', null, '2026-11-08 20:00+00', '2026-11-08 20:00+00'),
  -- removed from the owner's files (no new id), in the old chapter
  ('idlaw__art-49',         'idlaw', '49', 'نص ٤٩ محذوفة', 'active', '00000000-0000-4000-8000-0000000000c0', '2026-11-08 20:00+00', '2026-11-08 20:00+00');

insert into library.article_amendments (article_id, date, source, type, summary, full_text, updated_at) values
  ('idlaw__art-2-amended', '1440/01/01', 'م/1', 'تعديل', 'قديم', 'القديم', '2026-11-08 20:00+00'),
  ('idlaw__art-49',        '1440/01/01', 'م/1', 'تعديل', 'قديم', 'القديم', '2026-11-08 20:00+00'),
  -- stale amendment under an article that survives
  ('idlaw__art-1',         '1439/01/01', 'م/9', 'تعديل', 'قديم', 'القديم', '2026-11-08 20:00+00'),
  ('idlaw__art-2',         '1440/01/01', 'م/1', 'تعديل', 'جديد', 'الجديد', '2026-11-12 09:20+00'),
  ('idlaw__art-1',         '1441/01/01', 'م/2', 'تعديل', 'جديد', 'الجديد', '2026-11-12 09:20+00');

insert into library.article_regulations (id, article_id, law_slug, ref, reg_num, text, updated_at) values
  ('00000000-0000-4000-8000-0000000000f0', 'idlaw__art-2-amended', 'idlaw', 'اللائحة', '1', 'قديم', '2026-11-08 20:00+00'),
  ('00000000-0000-4000-8000-0000000000f1', 'idlaw__art-1',         'idlaw', 'اللائحة', '9', 'قديم', '2026-11-08 20:00+00'),
  ('00000000-0000-4000-8000-0000000000f2', 'idlaw__art-2',         'idlaw', 'اللائحة', '1', 'جديد', '2026-11-12 09:30+00');

insert into library.smart_folders (id, user_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000aa', 'مجلدي');
insert into library.smart_folder_items (folder_id, entity_type, entity_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'article', 'idlaw__art-2-amended'),
  ('00000000-0000-4000-8000-0000000000e1', 'article', 'idlaw__art-10-added');
insert into library.issue_reports (user_id, entity_type, entity_id, report_type)
  values ('00000000-0000-4000-8000-0000000000aa', 'article', 'idlaw__art-3-repealed', 'typo');
