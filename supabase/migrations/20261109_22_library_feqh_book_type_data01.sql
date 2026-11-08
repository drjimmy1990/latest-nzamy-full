-- =============================================================================
-- Migration: 20261109_22_library_feqh_book_type_data01.sql
-- =============================================================================
-- PURPOSE (owner package 2026-11-06, DATA-01)
--   Two fiqh-library books carry the wrong sharia / wadi type, because the
--   parser guessed it instead of reading the owner's own classification:
--     * «الأسس العامة للعقود الإدارية - دراسة مقارنة» (سليمان الطماوي) — a law
--       book, school «قانون مقارن وحديث», stored as sharia → wadi.
--     * «الأموال» (أبو عبيد القاسم بن سلّام) — a classical Islamic public-
--       finance work whose file has no school → sharia.
--   parse-feqh.ts classifyFeqhBookType now reads the owner's statements first
--   (book_kind, type, the «- شرعي» / «- قانوني» folder, the school), so a load
--   made with the new code writes the right type by itself. This file fixes the
--   two rows already in the database, without a reload.
--
-- MATCH — stable keys only, never a broad pattern
--   library.feqh_books.id is the file name (NFC). Rows match by that id, by the
--   package id LAW-99-12161 if a load ever keyed it so, or by exact title plus
--   an author fragment (covers volume rows of the same book). Only a row whose
--   type is still the wrong value is touched, so a re-run changes nothing.
--
-- RUN ORDER
--   Any time; independent of the code deploy. A library load made with code
--   OLDER than this batch writes the old guess again — run this file once more
--   after such a load (with this batch's code deployed it is no longer needed).
--
-- IDEMPOTENT — safe to run any number of times.
--
-- ROLLBACK
--   update library.feqh_books set type = 'sharia'
--    where title like 'الأسس العامة للعقود الإدارية%' and author like '%الطماوي%';
--   update library.feqh_books set type = 'wadi'
--    where title = 'الأموال' and author like '%عبيد%';
-- =============================================================================

begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('library.feqh_books') is null then
    raise exception '20261109_22: library.feqh_books does not exist';
  end if;
end $$;

-- 1. «الأسس العامة للعقود الإدارية» → wadi
update library.feqh_books
   set type = 'wadi'
 where type is distinct from 'wadi'
   and (   id in ('الأسس العامة للعقود الإدارية - دراسة مقارنة', 'LAW-99-12161')
        or (title like 'الأسس العامة للعقود الإدارية%' and author like '%الطماوي%'));

-- 2. «الأموال» لأبي عبيد → sharia
update library.feqh_books
   set type = 'sharia'
 where type is distinct from 'sharia'
   and author like '%عبيد%'
   and (id = 'الأموال' or id like 'الأموال\_%' or title = 'الأموال');

commit;

-- 3. CHECK — the SQL editor shows only this last result. Expect ok = true.
--    ok is false when either book is missing (nothing to fix: say so) or a
--    matching row still carries the wrong type.
with t as (
  select case
           when title like 'الأسس العامة للعقود الإدارية%' and author like '%الطماوي%' then 'wadi'
           when author like '%عبيد%' and (id = 'الأموال' or id like 'الأموال\_%' or title = 'الأموال') then 'sharia'
         end as want,
         type
    from library.feqh_books
   where (title like 'الأسس العامة للعقود الإدارية%' and author like '%الطماوي%')
      or (author like '%عبيد%' and (id = 'الأموال' or id like 'الأموال\_%' or title = 'الأموال'))
)
select 'DATA-01 fiqh book types' as check,
       count(*) filter (where want = 'wadi')   as usus_rows,
       count(*) filter (where want = 'sharia') as amwal_rows,
       count(*) filter (where want = 'wadi') > 0
       and count(*) filter (where want = 'sharia') > 0
       and count(*) filter (where type is distinct from want) = 0 as ok
  from t;
