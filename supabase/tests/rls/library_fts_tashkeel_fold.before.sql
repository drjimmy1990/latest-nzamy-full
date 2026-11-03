-- library_fts_tashkeel_fold.before.sql — runs in the chain BEFORE
-- 20261103_14 (see the header of library_fts_tashkeel_fold.test.sql).
--   1. Rows that exist before the rewrite: text with tashkeel and tatweel in
--      each of the three tables, plus a principle written without tashkeel.
--      The test proves _14 folds rows that were already there.
--   2. The privileges the API roles hold on the three fts columns, their
--      tables and the cross-section matview, and each fts column's statistics
--      target, so the test can prove 20261103_14 changed none of them.
-- Test-only: fixture rows and a public scratch table in the throwaway container.
insert into library.laws (slug, title, type, section_code) values ('tf-law', 'نظام المرافعات', 'نظام', '04');
insert into library.articles (id, law_slug, number, text, status, order_index) values
  ('tf-law__a1', 'tf-law', '1', 'يُعَدُّ القَرَارُ نافِذاً من تاريخ تبليغه', 'active', 1);
insert into library.judicial_collections (id, title, court, part) values
  ('tf-col', 'مجموعة المبادئ', 'ديوان المظالم', 1);
insert into library.principles (id, collection_id, principle_number, issuing_body, text, order_index) values
  ('tf-col__p1', 'tf-col', '1', 'المحكمة الإدارية العليا', 'القَرَارُ نافذ', 1),
  ('tf-col__p2', 'tf-col', '2', 'المحكمة الإدارية العليا', 'القرار الإداري المعيب', 2),
  ('tf-col__p3', 'tf-col', '3', 'المحكمة الإدارية العليا', 'القـــرار المطعون فيه', 3);
insert into library.feqh_books (id, title, author) values ('tf-book', 'كتاب', 'مؤلف');
insert into library.feqh_chapters (id, book_id, title, order_index) values
  ('00000000-0000-0000-0000-0000000007c1', 'tf-book', 'باب', 1);
insert into library.feqh_sections (id, chapter_id, title, order_index) values
  ('00000000-0000-0000-0000-0000000007d1', '00000000-0000-0000-0000-0000000007c1', 'فصل', 1);
insert into library.feqh_blocks (id, section_id, book_id, topic, matn, order_index) values
  ('tf-book__b1', '00000000-0000-0000-0000-0000000007d1', 'tf-book', 'القضاء', 'ويُنْقَضُ القَرَارُ إذا خالف النص', 1);

-- The matview gets an owner other than the role running the chain, so T7 can
-- prove 20261103_14 gives the recreated matview its old owner back.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 't7_mv_owner') then
    -- bypassrls: like the real owner (postgres owns the tables), the refresh sees every row.
    create role t7_mv_owner nologin bypassrls;
  end if;
end $$;
grant usage, create on schema library to t7_mv_owner;
-- REFRESH runs the matview's query with its owner's privileges.
grant select on all tables in schema library to t7_mv_owner;
alter materialized view library.cross_section_search owner to t7_mv_owner;

create table if not exists public.t7_before (kind text, obj text, role text, priv text, has boolean);
truncate public.t7_before;

insert into public.t7_before
select 'column', t || '.fts', r, p, has_column_privilege(r, t, 'fts', p)
  from unnest(array['library.articles', 'library.principles', 'library.feqh_blocks']) as t,
       unnest(array['anon', 'authenticated', 'service_role']) as r,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p
union all
select 'table', t, r, p, has_table_privilege(r, t, p)
  from unnest(array['library.articles', 'library.principles', 'library.feqh_blocks', 'library.cross_section_search']) as t,
       unnest(array['anon', 'authenticated', 'service_role']) as r,
       unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p
union all
select 'stattarget', c.relname, '', coalesce(nullif(a.attstattarget, -1), -1)::text, true
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
 where a.attrelid in ('library.articles'::regclass, 'library.principles'::regclass, 'library.feqh_blocks'::regclass)
   and a.attname = 'fts' and not a.attisdropped;

select count(*) > 0 as ok from public.t7_before;
