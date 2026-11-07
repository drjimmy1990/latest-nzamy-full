-- READ-ONLY. Changes nothing. Run any time (before or after the deploy).
--
-- Owner 2026-11-07 (screenshot 2): the library corpus carries its own internal
-- audit notes, e.g. «تصحيح 2026-08-14 (جولة تدقيق منهجي): … راجع سجل المشاكل ف1072.»
-- The reader now hides them (stripAuditNotes in src/lib/library/lawPreambleBlocks.ts,
-- applied by the law API to every amendment summary / full_text). The DB is NOT
-- changed. These two SELECTs show how many rows still carry such a note, so the
-- owner can clean his source files.
--
-- Markers: a dated «تصحيح YYYY-MM-DD», «جولة تدقيق», «تدقيق منهجي»,
-- «سجل المشاكل», «نفس نمط الخلل». (Diacritics are not folded here; the
-- reader's filter folds them, so these counts can be slightly low.)

-- 1) Amendment rows (what «الإصدارات السابقة» shows).
with p as (select '(تصحيح\s*[0-9٠-٩]{4}[-/][0-9٠-٩]{1,2}[-/][0-9٠-٩]{1,2})|(جولة\s+تدقيق)|(تدقيق\s+منهجي)|(سجل\s+المشاكل)|(نفس\s+نمط\s+الخلل)'::text as re)
select count(*) as rows_hit,
       count(*) filter (where aa.summary ~ p.re) as in_summary,
       count(*) filter (where aa.full_text ~ p.re) as in_full_text,
       count(distinct aa.article_id) as articles,
       count(distinct a.law_slug) as laws
from library.article_amendments aa
join library.articles a on a.id = aa.article_id
cross join p
where aa.summary ~ p.re or aa.full_text ~ p.re;

-- 2) The same pattern in article text, superseded wording, historic regulation
--    text and regulation rows (not filtered by the reader — report only).
with p as (select '(تصحيح\s*[0-9٠-٩]{4}[-/][0-9٠-٩]{1,2}[-/][0-9٠-٩]{1,2})|(جولة\s+تدقيق)|(تدقيق\s+منهجي)|(سجل\s+المشاكل)|(نفس\s+نمط\s+الخلل)'::text as re)
select 'library.articles.text' as where_found,
       count(*) as rows_hit, count(distinct a.law_slug) as laws
from library.articles a cross join p where a.text ~ p.re
union all
select 'library.articles.original_text',
       count(*), count(distinct a.law_slug)
from library.articles a cross join p where a.original_text ~ p.re
union all
select 'library.articles.historic_regulation_text',
       count(*), count(distinct a.law_slug)
from library.articles a cross join p where a.historic_regulation_text ~ p.re
union all
select 'library.article_regulations.text',
       count(*), count(distinct r.law_slug)
from library.article_regulations r cross join p where r.text ~ p.re;
