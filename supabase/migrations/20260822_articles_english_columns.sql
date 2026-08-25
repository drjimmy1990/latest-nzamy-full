-- =============================================================================
-- library.articles — English text columns the seeder already writes
-- =============================================================================
-- Created:  2026-08-22
-- Found by: scripts/verify-seeder-contract.mjs (first run of the quadrilateral
--           contract test — DB ↔ seeder ↔ parsers ↔ manifest)
--
-- WHY
--   scripts/seed-library.ts:401-403 writes three fields to library.articles:
--       title_en:            art.title_en || null
--       text_en:             art.text_en  || null
--       english_text_status: art.text_en ? "unverified" : null
--   and parse-laws.ts genuinely extracts them (ParsedArticle carries title_en /
--   text_en / english_text_status — the hidden-English-text work under ب-114).
--
--   But NO migration ever declared these columns on library.articles.
--   `title_en` exists only on library.laws (20260626_legal_library_schema.sql:75)
--   and on unrelated tables (smart_folder_items, content/ops) — never on articles.
--
--   PostgREST rejects an upsert payload containing an unknown column (PGRST204).
--   batchUpsert() logs the error into `errors[]` and CONTINUES, so this fails
--   silently — exactly the failure mode that hid the library.judicial_collections
--   `series_id` gap until it was found by accident.
--
-- ⚠️ TWO POSSIBILITIES, BOTH REQUIRING THIS MIGRATION
--   (a) The live database does NOT have these columns → every articles upsert has
--       been failing; applying this migration fixes it.
--   (b) The live database DOES have them (added manually outside the migration
--       history) → then the migration history is drifted and any rebuild from
--       migrations produces a broken schema. `if not exists` makes applying this
--       a no-op in that case, and re-aligns the recorded history either way.
--   Verify which case you are in before seeding:
--       select column_name from information_schema.columns
--        where table_schema='library' and table_name='articles'
--          and column_name in ('title_en','text_en','english_text_status');
--
-- SAFETY
--   Additive only, all nullable, no backfill, no existing row changes value.
--   Deliberately NOT added to the `fts` tsvector: that column is Arabic-only
--   (to_tsvector('library.arabic', …)) and mixing English text into it would
--   change existing Arabic search ranking. English search is a separate decision.
-- =============================================================================

begin;

alter table library.articles
  add column if not exists title_en            text,
  add column if not exists text_en             text,
  add column if not exists english_text_status varchar(30);

comment on column library.articles.title_en is
  'English article title when the source document carries one (parse-laws.ts). NULL = the source has no English title — never machine-translated.';
comment on column library.articles.text_en is
  'English article body when the source document carries one. NULL = none in source. Not machine-translated, and not indexed in the Arabic fts column.';
comment on column library.articles.english_text_status is
  'Provenance flag for text_en. Currently only "unverified" (set by the seeder whenever text_en is present) or NULL. English text has NOT been verified against the official source to the same standard as the Arabic text — do not present it as authoritative for citation.';

commit;
