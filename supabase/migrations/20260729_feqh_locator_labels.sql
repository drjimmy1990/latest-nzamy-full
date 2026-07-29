-- =============================================================================
-- Feqh locator labels + nullable volume/page
-- =============================================================================
-- Created:  2026-07-29
-- Purpose:  Preserve the verbatim page/volume tokens from feqh sources, and stop
--           asserting volume 1 when the source states no volume.
--
-- WHY
--   parse-feqh.ts recognised exactly one page-header shape — a 4-part Shamela
--   header that occurs on 10 lines in 1 book. The dominant shape,
--   `#### الجزء 10 - صفحة 3 - title - author`, occurs on 57,975 lines across 117
--   of 144 books and was not recognised at all. Production therefore:
--     • discarded the real page/volume numbers for almost every book and
--       synthesised a sequential counter in their place, and
--     • hardcoded volume = 1 (there is an explicit TODO in the parser saying so).
--   A citation to "page 5" of a book whose source says الجزء 3 صفحة 47 is wrong.
--
--   The new parser recognises 88,257 locators across all 144 books (production:
--   16,887 across 26). 541 volume tokens and 18 page tokens are NOT plain
--   numbers ("مقدمة", "7-1", "None") — those need to survive verbatim rather
--   than be coerced.
--
-- SAFETY
--   Additive only: two nullable columns, plus relaxing two NOT-NULL-by-default
--   numeric columns to allow NULL. No existing row changes value, and no
--   backfill is required. Applying this alone is a behavioural no-op.
-- =============================================================================

begin;

-- ── Verbatim locator tokens ──────────────────────────────────────────────────
alter table library.feqh_blocks
  add column if not exists page_label   varchar(60),
  add column if not exists volume_label varchar(60);

comment on column library.feqh_blocks.page_label is
  'Verbatim page token from the source (e.g. "3", "None"). page_number holds the numeric form when there is one.';
comment on column library.feqh_blocks.volume_label is
  'Verbatim volume token from the source (e.g. "10", "مقدمة", "7-1"). volume_number holds the numeric form when there is one.';

-- ── Allow "the source does not say" ──────────────────────────────────────────
-- Previously these were written with a fabricated fallback (volume 1, page 0).
-- NULL is the honest representation and is what the seeder now writes.
alter table library.feqh_blocks alter column volume_number drop not null;
alter table library.feqh_blocks alter column page_number   drop not null;

-- order_index carries the book-global reading position that the paywall gates
-- on; an index makes the per-book ordered read cheap.
create index if not exists idx_feqh_blocks_order
  on library.feqh_blocks (section_id, order_index);

commit;
