-- =============================================================================
-- library.{laws,decrees_circulars,principles} — needs_human_review visibility
-- =============================================================================
-- Created:  2026-08-22
-- Found by: council review (Codex, 2026-08-22) after the judge asked for a
--           full-library sweep of 00_عقل_القوانين + the central problems log.
--
-- WHY
--   337 source files across the library (319 laws, 15 decrees, 3 precedent
--   principles) carry `needs_human_review: true` (+ a `review_reason` prose
--   field) in their frontmatter — a flag a prior investigative session set
--   whenever it found a real, unresolved content problem it could not safely
--   fix on the spot. Confirmed 2026-08-22 by direct grep across
--   scripts/seed-library.ts, every scripts/parsers/*.ts, every migration, and
--   src/app: NEITHER field has ever been read anywhere in the pipeline. No
--   database column, no seeder logic, no frontend display. A flagged file is
--   seeded and served exactly like a fully-verified one, with zero indication
--   to the reader that anything might be wrong — on a platform whose entire
--   purpose is judicial citation.
--
-- ⚠️ WHAT THIS MIGRATION DOES NOT DO (deliberately, council-reviewed)
--   Some of the 337 flags are real, confirmed content defects (example
--   verified live: a circular amending نظام الزراعة's executive regulation
--   that does not actually contain the amendment text). Some are almost
--   certainly stale — a later session fixed the underlying problem without
--   clearing the flag that reported it. There is currently no reliable way to
--   tell the two apart automatically, and treating a stale flag as if it were
--   live would either (a) mass-exclude ~300+ probably-fine laws from the
--   platform, or (b) paint a false-positive warning badge on them for
--   readers — either failure mode is worse than today's silence.
--
--   So this migration ONLY makes the flag visible in the database. It does
--   NOT exclude flagged records from seeding, and does NOT (yet) surface
--   anything in the frontend. seed-library.ts's companion change prints a
--   mandatory post-seed report (counts + ids + reasons per table) so a human
--   can triage real-vs-stale before either publication decision is made.
--   Treat this column, for now, as an internal audit signal only.
--
-- SAFETY
--   Additive only. Default false — no existing row's *behavior* changes.
--   The CHECK constraint (Codex's suggestion) rejects the one genuinely
--   incoherent state (flagged true with no reason recorded at all), catching
--   a future seeder regression rather than a real file — no live file was
--   found in this shape during verification.
-- =============================================================================

begin;

alter table library.laws
  add column if not exists needs_human_review boolean not null default false,
  add column if not exists review_reason text;

alter table library.decrees_circulars
  add column if not exists needs_human_review boolean not null default false,
  add column if not exists review_reason text;

alter table library.principles
  add column if not exists needs_human_review boolean not null default false,
  add column if not exists review_reason text;

alter table library.laws
  drop constraint if exists laws_review_reason_required_chk,
  add constraint laws_review_reason_required_chk
    check (needs_human_review = false or nullif(btrim(review_reason), '') is not null);

alter table library.decrees_circulars
  drop constraint if exists decrees_circulars_review_reason_required_chk,
  add constraint decrees_circulars_review_reason_required_chk
    check (needs_human_review = false or nullif(btrim(review_reason), '') is not null);

alter table library.principles
  drop constraint if exists principles_review_reason_required_chk,
  add constraint principles_review_reason_required_chk
    check (needs_human_review = false or nullif(btrim(review_reason), '') is not null);

comment on column library.laws.needs_human_review is
  'Internal audit signal only — mirrors the source .md frontmatter flag. Does NOT gate seeding or publication (council decision 2026-08-22: the flag population includes an unknown number of stale entries, and mass-exclusion or a public warning badge before triage would risk removing/mislabeling fine content). Triage via the seeder''s post-seed report, not this column alone.';
comment on column library.decrees_circulars.needs_human_review is
  'See library.laws.needs_human_review — same convention, same caveat.';
comment on column library.principles.needs_human_review is
  'See library.laws.needs_human_review — same convention, same caveat.';

commit;
