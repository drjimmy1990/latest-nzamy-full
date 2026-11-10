-- prelude_library_article_id_cleanup_fixture.sql — a library just reloaded with
-- the 2026-11-10 id rule, with two old status-suffixed rows left behind.
-- Chain and command: library_article_id_cleanup.test.sql.
-- Timestamps are explicit (the update trigger does not fire on insert): the
-- load is 2026-11-12 09:00 UTC, the previous load 2026-11-08.

insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000aa');

insert into library.laws (slug, title, type, section_code, updated_at)
  values ('idlaw', 'نظام اختباري', 'نظام', '00', '2026-11-12 09:00+00'),
         ('idlaw2', 'نظام اختباري ٢', 'نظام', '00', '2026-11-12 09:01+00');

-- Written by this load (new ids)
insert into library.articles (id, law_slug, number, text, status, updated_at) values
  ('idlaw__art-1',        'idlaw',  '1',  'نص ١',  'active',   '2026-11-12 09:10+00'),
  ('idlaw__art-2',        'idlaw',  '2',  'نص ٢',  'amended',  '2026-11-12 09:10+00'),
  ('idlaw__art-3',        'idlaw',  '3',  'نص ٣',  'repealed', '2026-11-12 09:10+00'),
  -- two articles sharing number 10: both written by this load, both stay
  ('idlaw__art-10',       'idlaw',  '10', 'نص ١٠', 'active',   '2026-11-12 09:10+00'),
  ('idlaw__art-10-added', 'idlaw',  '10', 'نص ١٠ مضافة', 'added', '2026-11-12 09:11+00'),
  ('idlaw2__art-2',       'idlaw2', '2',  'نص',    'active',   '2026-11-12 09:12+00'),
  -- articles without a number (stored as '0', id by position)
  ('idlaw__art-i0',       'idlaw',  '0',  'بلا رقم ١', 'repealed', '2026-11-12 09:13+00'),
  ('idlaw__art-i1',       'idlaw',  '0',  'بلا رقم ٢', 'active',   '2026-11-12 09:13+00');

-- Left behind by the old id rule (previous load)
insert into library.articles (id, law_slug, number, text, status, created_at, updated_at) values
  ('idlaw__art-2-amended',  'idlaw', '2', 'نص ٢ قديم', 'amended',  '2026-11-08 20:00+00', '2026-11-08 20:00+00'),
  ('idlaw__art-3-repealed', 'idlaw', '3', 'نص ٣ قديم', 'repealed', '2026-11-08 20:00+00', '2026-11-08 20:00+00'),
  ('idlaw__art-i0-repealed', 'idlaw', '0', 'بلا رقم قديم', 'repealed', '2026-11-08 20:00+00', '2026-11-08 20:00+00');

insert into library.article_amendments (article_id, date, source, type, summary, full_text) values
  ('idlaw__art-2-amended', '1440/01/01', 'م/1', 'تعديل', 'قديم', 'القديم'),
  ('idlaw__art-2',         '1440/01/01', 'م/1', 'تعديل', 'جديد', 'الجديد');

insert into library.smart_folders (id, user_id, name)
  values ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000aa', 'مجلدي');
insert into library.smart_folder_items (folder_id, entity_type, entity_id) values
  ('00000000-0000-4000-8000-0000000000e1', 'article', 'idlaw__art-2-amended'),
  ('00000000-0000-4000-8000-0000000000e1', 'article', 'idlaw__art-10-added');
insert into library.issue_reports (user_id, entity_type, entity_id, report_type)
  values ('00000000-0000-4000-8000-0000000000aa', 'article', 'idlaw__art-3-repealed', 'typo');
