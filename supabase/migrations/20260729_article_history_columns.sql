-- =============================================================================
-- Article history: somewhere for the recovered superseded text to land
-- =============================================================================
-- Created:  2026-07-29
-- Purpose:  parse-laws.ts now recovers an article's pre-amendment / pre-repeal
--           wording out of its <details> block. library.articles has no column
--           for it, so today the recovered text is parsed and then thrown away.
--
-- WHY THIS IS URGENT (measured on the delivered corpus, 41,462 articles)
--   original_text recovered ............................ 2,817 articles
--   articles with status = 'repealed' .................. 1,862
--   ...whose ENTIRE substance is in original_text ...... 1,613
--   ...with neither text nor original_text ............. 9
--
--   For a repealed article `text` is legitimately empty — the live article no
--   longer exists. Before this parser change the superseded wording was silently
--   concatenated INTO `text`, which is the bug that was fixed. So without a
--   column to receive it, seeding the corrected parser output would render
--   1,613 repealed articles completely blank AND drop them out of the search
--   index entirely. Both are worse than the bug that was fixed.
--
-- WHAT IS *NOT* HERE, DELIBERATELY
--   repealed_by / repealed_date. src/app/laws/data.ts declares them and
--   _article-components.tsx renders them, so a plan called for populating them.
--   Every ARTICLE_START anchor in the corpus was surveyed — 41,845 anchors,
--   1,862 of them repealed — and NO repeal-provenance key exists on any of
--   them. The only candidate, `instrument`, holds the document KIND
--   ("نظام" 337, "قرار" 64, "لائحة" 59 …), not a repealing decree, and the
--   recovered <summary> is the generic "📜 التعديلات والإلغاءات" on all 1,613.
--   Filling those columns would mean inventing a legal citation, which rule ق-2
--   forbids. They stay absent; the UI already guards on their absence.
--
-- SAFETY
--   Three additive nullable columns. The fts column is regenerated because a
--   generated column cannot be altered in place, which also forces dropping and
--   recreating the materialized view that depends on it. Both are rebuilt below
--   with identical definitions apart from the stated changes.
-- =============================================================================

begin;

-- ── 1. The columns ───────────────────────────────────────────────────────────
alter table library.articles
  add column if not exists original_text            text,
  add column if not exists historic_regulation_text text,
  add column if not exists unparsed_details         text;

comment on column library.articles.original_text is
  'Verbatim superseded wording recovered from the source <details> block. For a repealed article this is usually the article''s entire substantive content, because `text` is legitimately empty. NULL means the source carries no prior wording — never synthesised.';

comment on column library.articles.historic_regulation_text is
  'Historic executive-regulation text found inside the article''s <details>. Real content, but not a previous version of the article itself, so it is kept apart from both `text` and `original_text`.';

comment on column library.articles.unparsed_details is
  'QUARANTINE. <details> blocks the extractor could not classify, preserved verbatim so unrecognised content is reviewable instead of dropped (rule ق-3). Deliberately excluded from `fts` below and never returned by any API route — it is unvalidated content of unknown kind.';

-- ── 2. Rebuild fts to index the recovered text ───────────────────────────────
-- A generated column cannot be redefined in place, and library.cross_section_search
-- (a MATERIALIZED view) selects a.fts, so it has to go first and come back after.
--
-- original_text is indexed on purpose: those 1,613 repealed articles have an
-- empty `text`, so leaving it out would make them unsearchable — a regression
-- against today's behaviour, where the same words were indexed (via the wrong
-- column). unparsed_details is NOT indexed: it is unclassified content.
drop materialized view if exists library.cross_section_search;

drop index if exists library.idx_articles_fts;
alter table library.articles drop column if exists fts;

alter table library.articles
  add column fts tsvector generated always as (
    to_tsvector('library.arabic',
      coalesce(title, '')              || ' ' ||
      coalesce(text, '')               || ' ' ||
      coalesce(executive_reg_text, '') || ' ' ||
      coalesce(original_text, '')
    )
  ) stored;

create index if not exists idx_articles_fts
  on library.articles using gin (fts);

-- ── 3. Recreate the cross-section search matview ─────────────────────────────
-- Unchanged except for the article snippet, which now falls back to the
-- recovered text: `left(a.text, 500)` yields an empty snippet for every
-- repealed article.
create materialized view if not exists library.cross_section_search as
select
  'article'::text       as entity_type,
  a.id::text            as entity_id,
  l.title               as parent_title,
  coalesce(a.title, 'مادة ' || a.number) as title,
  left(coalesce(nullif(a.text, ''), a.original_text, ''), 500) as snippet,
  a.fts                 as fts,
  a.created_at          as created_at
from library.articles a
join library.laws l on l.slug = a.law_slug

union all

select
  'principle'::text     as entity_type,
  p.id::text            as entity_id,
  jc.title              as parent_title,
  'مبدأ رقم ' || coalesce(p.principle_number, '') as title,
  left(p.text, 500)     as snippet,
  p.fts                 as fts,
  p.created_at          as created_at
from library.principles p
join library.judicial_collections jc on jc.id = p.collection_id

union all

select
  'decree'::text        as entity_type,
  dc.id::text           as entity_id,
  null                  as parent_title,
  dc.title              as title,
  left(dc.summary, 500) as snippet,
  dc.fts                as fts,
  dc.created_at         as created_at
from library.decrees_circulars dc

union all

select
  'feqh_block'::text    as entity_type,
  fb.id::text           as entity_id,
  bk.title              as parent_title,
  fb.topic              as title,
  left(fb.matn, 500)    as snippet,
  fb.fts                as fts,
  fb.created_at         as created_at
from library.feqh_blocks fb
join library.feqh_sections fs on fs.id = fb.section_id
join library.feqh_chapters fc on fc.id = fs.chapter_id
join library.feqh_books bk   on bk.id = fc.book_id
with no data;  -- populate on first refresh

create unique index if not exists idx_cross_section_search_pk
  on library.cross_section_search (entity_type, entity_id);

create index if not exists idx_cross_section_search_fts
  on library.cross_section_search using gin (fts);

comment on materialized view library.cross_section_search
  is 'Unified search index across articles, principles, decrees, and fiqh blocks. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY library.cross_section_search;';

commit;

-- After applying, the matview holds no rows until:
--   select library.refresh_cross_section_search();
-- (it was created `with no data`, exactly as the original migration did).
