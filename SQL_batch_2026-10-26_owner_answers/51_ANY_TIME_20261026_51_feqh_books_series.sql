-- ════════════════════════════════════════════════════════════════════════════
-- 20261026_51_feqh_books_series.sql — a fiqh book's series and volume number
-- (owner answer ٢٦٢ (أ), 2026-10-25)
-- ════════════════════════════════════════════════════════════════════════════
--
-- WHY
--   library.feqh_books holds one row PER VOLUME and has no series column: the
--   catalogue card, the reader's volume switcher and the in-book search
--   across volumes recover the series from the titles (bookVolumes.ts). The
--   owner's library agent tags every volume of a work with one
--   `series_id` / `collection_id` and its volume number (`volume_number` /
--   `current_volume`); in last_owner (2026-10-25) 137 of the fiqh files
--   already carry collection_id and 138 current_volume. The parser reads
--   them (scripts/parsers/parse-feqh.ts, src/lib/library/seriesFields.ts);
--   this file gives them a place:
--
--     series_id      varchar(150)  NULL — the work's label, shared by its
--                                   volumes (same width as
--                                   judicial_collections.series_id).
--     volume_number  int           NULL — this volume's number, 1–9999.
--
--   NULL means "the file does not say": the title rule stays the fallback.
--
-- PRIVILEGES
--   feqh_books keeps its table-level SELECT for anon / authenticated (the
--   catalogue, 20261018_02 left it public), which covers new columns: the
--   series is catalogue metadata, not book text. Nothing is granted or
--   revoked here.
--
-- ORDER
--   ANY TIME. The code reads both columns as optional (before this file the
--   reads fall back to the title rule), and the owner's loader drops the two
--   keys while the columns are missing. After it runs, a library load fills
--   them.
--
-- Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

begin;

alter table library.feqh_books
  add column if not exists series_id varchar(150),
  add column if not exists volume_number int;

alter table library.feqh_books drop constraint if exists feqh_books_volume_number_range;
alter table library.feqh_books
  add constraint feqh_books_volume_number_range
  check (volume_number is null or volume_number between 1 and 9999);

alter table library.feqh_books drop constraint if exists feqh_books_series_id_not_blank;
alter table library.feqh_books
  add constraint feqh_books_series_id_not_blank
  check (series_id is null or btrim(series_id) <> '');

create index if not exists idx_feqh_books_series_id
  on library.feqh_books (series_id)
  where series_id is not null;

comment on column library.feqh_books.series_id is
  'Owner ٢٦٢: the series label every volume of one work shares (source series_id / collection_id). NULL: the file names none; the title rule (bookVolumes.ts) applies.';
comment on column library.feqh_books.volume_number is
  'Owner ٢٦٢: this volume''s number as the source states it (volume_number / current_volume), 1–9999. NULL: not stated. total_volumes is unchanged.';

-- In-migration verify.
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'library' and table_name = 'feqh_books'
         and column_name in ('series_id', 'volume_number')) <> 2 then
    raise exception '20261026_51: feqh_books.series_id / volume_number missing';
  end if;
  if not has_column_privilege('anon', 'library.feqh_books', 'series_id', 'SELECT')
     or not has_column_privilege('anon', 'library.feqh_books', 'volume_number', 'SELECT') then
    raise exception '20261026_51: anon cannot read feqh_books.series_id / volume_number — the catalogue reads them with the request client';
  end if;
  raise notice '20261026_51 OK — feqh_books.series_id and volume_number in place';
end $$;

commit;
