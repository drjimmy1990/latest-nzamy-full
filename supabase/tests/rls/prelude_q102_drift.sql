-- prelude_q102_drift.sql — negative control for q102_page_numbered_documents.test.sql.
-- Run AFTER prelude_q102_fixture.sql: one more page-numbered «نظام» the list
-- does not name (what a library reload with new slugs would bring). Block 2 of
-- the one-time file must refuse to run.
insert into library.laws (slug, title, type, section_code)
  values ('q102-unlisted-guide', 'دليل غير مدرج في القائمة', 'نظام', '00');
insert into library.articles (id, law_slug, number, number_text, text, status)
  values ('q102-unlisted-guide__art-1', 'q102-unlisted-guide', '1', 'الصفحة 1', 'نص', 'status_undeclared');
