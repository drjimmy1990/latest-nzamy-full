-- =============================================================================
-- library.{decrees_circulars,principles} — include reference/decision numbers
-- in full-text search
-- =============================================================================
-- Created:  2026-08-23
-- Found by: council review (Antigravity, 2026-08-23 unified remaining-work
--           plan, item ك-02) — a judge searching by the exact circular or
--           decision number printed on the document they are trying to cite
--           gets zero results unless that number also happens to appear
--           inside the title/summary text, which is not guaranteed.
--
-- WHY
--   library.decrees_circulars.fts and library.principles.fts are GENERATED
--   ALWAYS columns (see 20260626_legal_library_schema.sql:215-221 and
--   :306-314). Neither formula includes the columns that actually hold the
--   citable number:
--     decrees_circulars.ref              e.g. "قرار مجلس الوزراء رقم 135"
--     principles.decision_number / .principle_number / .reference
--   src/app/api/library/search/route.ts's only filter is
--   `.textSearch('fts', ftsQuery, { type: 'plain' })` — there is no
--   `.ilike`/`.eq('ref', …)` fallback anywhere in that route, so a bare
--   number token can only match when it is *also* present in the indexed
--   title/summary/text. Confirmed structurally 2026-08-23 (not reproduced
--   against a live DB — this migration is written, not applied, per this
--   plan item's explicit scope; see NOT APPLIED below).
--
--   library.laws / library.articles are deliberately left untouched: the
--   plan item's own wording ("رقم تعميم/قرار", circular/decision number)
--   targets decrees_circulars and principles specifically. articles.number
--   is the in-law article number, not an external citable reference, and
--   already has its own lookup path (article number within a law page).
--
-- WHAT THIS MIGRATION DOES
--   Postgres cannot ALTER a GENERATED ALWAYS AS expression in place — the
--   column must be dropped and re-added. This drops each fts column (which
--   also drops its dependent GIN index, per Postgres's automatic behavior
--   for a column being dropped) and re-creates both with the extended
--   formula, using the *exact* pre-existing index names
--   (idx_decrees_circulars_fts, idx_principles_fts) so no other code or
--   migration that references them needs to change.
--
-- ⚠️ NOT APPLIED YET (council decision, ك-02 scope)
--   This file is written and reviewed but deliberately NOT run against any
--   environment as part of this session's work. Application is a separate,
--   explicit decision (the unified plan's "المسار الثالث" — dedicated
--   migration-application pass), so a person consciously chooses when a
--   schema-affecting change reaches a live database, rather than it landing
--   as a side effect of a content-fix session. Recreating a GENERATED column
--   also forces Postgres to recompute the tsvector for every existing row
--   the moment this runs — cheap at current row counts, but still a real
--   write to every row, worth doing deliberately.
--
-- SAFETY
--   Additive in effect (widens what already matches; nothing that matched
--   before stops matching, since only OR'd-in text is appended). No column
--   removed except the two fts columns themselves, each immediately
--   re-added under the same name and type. No data migration needed beyond
--   the automatic recompute a STORED generated column performs on rewrite.
-- =============================================================================

begin;

-- ── library.decrees_circulars.fts — add `ref` ───────────────────────────────
drop index if exists library.idx_decrees_circulars_fts;

alter table library.decrees_circulars
  drop column if exists fts;

alter table library.decrees_circulars
  add column fts tsvector generated always as (
    to_tsvector('library.arabic',
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(summary_brief, '') || ' ' ||
      coalesce(ref, '')
    )
  ) stored;

create index if not exists idx_decrees_circulars_fts
  on library.decrees_circulars using gin (fts);

-- ── library.principles.fts — add `principle_number`, `decision_number`,
--    `reference` ───────────────────────────────────────────────────────────
drop index if exists library.idx_principles_fts;

alter table library.principles
  drop column if exists fts;

alter table library.principles
  add column fts tsvector generated always as (
    to_tsvector('library.arabic',
      coalesce(text, '')             || ' ' ||
      coalesce(ruling_basis, '')     || ' ' ||
      coalesce(facts, '')            || ' ' ||
      coalesce(reasons, '')          || ' ' ||
      coalesce(ruling, '')           || ' ' ||
      coalesce(principle_number, '') || ' ' ||
      coalesce(decision_number, '')  || ' ' ||
      coalesce(reference, '')
    )
  ) stored;

create index if not exists idx_principles_fts
  on library.principles using gin (fts);

comment on column library.decrees_circulars.fts is
  'Full-text search vector — title + summary + summary_brief + ref (ب-149/ك-02, 2026-08-23: ref added so searching by the printed circular/decision number returns the document even when that number is not repeated inside the title).';
comment on column library.principles.fts is
  'Full-text search vector — text + ruling_basis + facts + reasons + ruling + principle_number + decision_number + reference (ك-02, 2026-08-23: the three number/reference fields added so searching by a judicial principle''s printed decision number works).';

commit;
