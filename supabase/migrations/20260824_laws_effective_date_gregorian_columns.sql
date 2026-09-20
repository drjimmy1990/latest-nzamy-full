-- ============================================================================
-- ك-12 (2026-08-24): complete the effective-date column set on library.laws
-- ============================================================================
-- Created by: Claude (Fable 5 plan/review, Sonnet 5 execution), council-free —
--   this is a mechanical schema completion, not a design decision.
-- Found by: ك-04 investigation (effective-date drift report) + verify-contract,
--   confirmed by direct production-DB column probes 2026-08-24.
--
-- WHY: schema_manifest.json (rule ق-15, lines 522-544) has documented a
-- 5-field contract for effective-date tracking since before this table was
-- built: publication_date_hijri, publication_date_gregorian,
-- effective_date_hijri, effective_date_gregorian, effective_date_note. But
-- the base schema (20260626_legal_library_schema.sql:83-84) only ever
-- created TWO of the five — the hijri columns. The other three were never
-- added by any migration (confirmed: grepped every file in this directory,
-- zero hits). The parser/seeder side of ك-12 wires only the two existing
-- columns for now; this migration exists so the full contract can be wired
-- once applied, without a second round-trip through this same gap.
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds `publication_date_gregorian date` — the Gregorian side of the
--      publication date, needed to do plain calendar arithmetic (no Hijri
--      conversion library exists in this codebase — see ك-04's own doc
--      comment for why that matters).
--   2. Adds `effective_date_gregorian date` — ditto, the computed/declared
--      effective date.
--   3. Adds `effective_date_note text` — free-text basis of the computation
--      (article + duration + anchor + counting method), per the manifest's
--      own note: "عند التباس العدّ أو دقة تحويل الهجري → يُقيَّد للتحقق."
--
-- ⚠️ NOT APPLIED YET — written and reviewed, awaiting the judge's decision
-- point for schema-affecting changes (same "المسار الثالث" gate as the
-- FTS-number-search migration and the number_text migration). Idempotent
-- (`if not exists`) — safe to run more than once.
--
-- SAFETY: purely additive (new nullable columns on an existing table), no
-- data migration, no backfill, no index changes, no RLS changes (existing
-- "Allow public read on library.laws" policy already covers all columns).
-- ============================================================================

alter table library.laws
  add column if not exists publication_date_gregorian date,
  add column if not exists effective_date_gregorian   date,
  add column if not exists effective_date_note         text;

comment on column library.laws.publication_date_gregorian is
  'Gregorian publication date, computed/verified from publication_date_hijri. Null when the source does not state it (rule ق-2 — never guessed).';
comment on column library.laws.effective_date_gregorian is
  'Gregorian effective (commencement) date. Computed only when the text explicitly states a duration from a known anchor (rule ق-15) — never a default/assumed delay.';
comment on column library.laws.effective_date_note is
  'Free-text basis of the effective_date computation: the article, the stated duration, the anchor date, and the counting method. Null when effective_date_hijri/gregorian are both null.';
