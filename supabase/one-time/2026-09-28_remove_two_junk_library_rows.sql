-- ════════════════════════════════════════════════════════════════════════════
-- One-time data fix (NOT a migration) — owner test 2026-09-28, ticket T28-16.
-- Run by the developer in the self-hosted SQL editor. Read the preview first.
--
-- Two rows in library.laws are not laws the reader should see:
--   1. 2024-incometax-decisions-al-hkwmh — «2024-Incometax-Decisions», a
--      409-«article» dump of tax-committee decisions filed as «دليل إرشادي».
--      It is the top hit for «نظام الاثبات» and pollutes every tax search.
--   2. 43-1443-05-26----1443 — «مرسوم-م-43 1443-05-26 نظام الإثبات لعام 1443هـ»,
--      a second copy of نظام الإثبات under a file-name slug; the canonical
--      law is evidence-law-qadha-edition.
-- Both were verified read-only on 2026-09-28 (anon REST, library.laws).
--
-- library.articles / chapters / article_regulations / article_amendments
-- reference laws(slug) ON DELETE CASCADE, so their children go with them.
-- User tables that key on the slug as text have no foreign key, so nothing
-- cascades into them. Only library.smart_folder_items is cleaned here (a saved
-- folder item that would open a missing law). law_draft_carts rows and
-- library_issue_reports rows keep the old slug as history; a missing law there
-- is harmless. The production database started clean on 2026-09-25, so these
-- are expected to be empty anyway.
--
-- The rows come back on a full reseed unless the owner removes the two files
-- from his library package — that is on the owner's list (the corpus is his).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — run alone first; expect exactly 2 law rows.
select slug, title, type, section_code, total_articles
from library.laws
where slug in ('2024-incometax-decisions-al-hkwmh', '43-1443-05-26----1443');

select 'articles' as t, count(*) from library.articles
 where law_slug in ('2024-incometax-decisions-al-hkwmh', '43-1443-05-26----1443')
union all
select 'smart_folder_items', count(*) from library.smart_folder_items
 where entity_type = 'law'
   and entity_id in ('2024-incometax-decisions-al-hkwmh', '43-1443-05-26----1443');

-- 2) DELETE — in one transaction; aborts unless exactly 2 laws are removed.
begin;

delete from library.smart_folder_items
 where entity_type = 'law'
   and entity_id in ('2024-incometax-decisions-al-hkwmh', '43-1443-05-26----1443');

do $$
declare n int;
begin
  delete from library.laws
   where slug in ('2024-incometax-decisions-al-hkwmh', '43-1443-05-26----1443');
  get diagnostics n = row_count;
  if n <> 2 then
    raise exception 'expected to delete 2 laws, deleted % — rolling back', n;
  end if;
end $$;

commit;

-- 3) VERIFY — expect 0 rows.
select slug from library.laws
where slug in ('2024-incometax-decisions-al-hkwmh', '43-1443-05-26----1443');
