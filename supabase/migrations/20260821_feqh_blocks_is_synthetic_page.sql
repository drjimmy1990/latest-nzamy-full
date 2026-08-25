-- =============================================================================
-- feqh_blocks.is_synthetic_page (ب-126)
-- =============================================================================
-- Created:  2026-08-21
-- Purpose:  parse-feqh.ts flushPage() previously zeroed the real page identity
--           on every chapter/section heading (not just real page boundaries),
--           synthesising a fabricated sequential page number. Fixed in the
--           parser this session; is_synthetic_page marks the (now rare) blocks
--           where no real page anchor exists so the seeder can flag them
--           honestly instead of presenting a synthesised number as real.
--           NOTE: page_label/volume_label already exist from
--           20260729_feqh_locator_labels.sql — 06 § ب-126 had documented this
--           migration as adding all three columns, which was inaccurate; only
--           is_synthetic_page was actually missing (verified 2026-08-21 by
--           grepping every migration file, not just re-trusting the note).
--
-- SAFETY
--   Additive only: one boolean column, default false, no existing row
--   changes value, no backfill required.
-- =============================================================================

begin;

alter table library.feqh_blocks
  add column if not exists is_synthetic_page boolean not null default false;

comment on column library.feqh_blocks.is_synthetic_page is
  'true when parse-feqh.ts could not find a real page anchor and synthesised a sequential counter instead (ب-126). false/default = page_number came from an actual source page marker.';

commit;
