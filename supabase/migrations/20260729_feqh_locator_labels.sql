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

-- ── book_id: the reader's page query, without a 3-level join ─────────────────
-- api/library/books/[slug] needs "the Nth page of blocks in this BOOK, in
-- reading order". feqh_blocks only reaches a book through
-- section → chapter → book, so the route used to collect every section id and
-- pass them to `section_id=in.(…)`. Books carry hundreds to thousands of
-- sections and each id is a 36-char UUID, so the URL blew past its length limit
-- and PostgREST answered 400 — and because nothing checked the error, the book
-- rendered as EMPTY. Measured on production: 138 of 144 fiqh books were
-- affected; the worst carries 2,069 sections (a ~36 KB URL).
--
-- Filtering through the join instead works and is what the route falls back to,
-- but it has to sort without a usable index: measured 3.2s for a 954-block book,
-- against the 3s statement timeout the anon role runs under. Denormalising
-- book_id turns the whole thing into one indexed scan.
--
-- Nullable, so this migration stays additive; the route only takes the fast path
-- when the column is present and populated, and falls back otherwise.
alter table library.feqh_blocks
  add column if not exists book_id varchar(200);

comment on column library.feqh_blocks.book_id is
  'Denormalised owning book (= feqh_books.id), written by scripts/seed-library.ts. Exists so the reader can page through a book in order_index order with a single indexed scan instead of a section→chapter→book join or a multi-kilobyte section_id IN list.';

create index if not exists idx_feqh_blocks_book_order
  on library.feqh_blocks (book_id, order_index);

commit;
