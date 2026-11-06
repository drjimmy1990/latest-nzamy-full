-- S5-B13 fixture for SQL_batch_2026-11-03_owner_free/READ_ONLY_library_preamble_details_summaries.sql.
-- Three laws: a known موجز, one annex summary twice in the same law (counts as one law), and no preamble.
create schema if not exists library;
create table if not exists library.laws (slug text primary key, preamble text);

insert into library.laws (slug, preamble) values
  ('a', '<details open><summary>📝 موجز المستند</summary>x</details>'),
  ('b', '<details><summary>ملحق رقم ١</summary>y</details><details><summary>ملحق رقم ١</summary>z</details>'),
  ('c', null);
