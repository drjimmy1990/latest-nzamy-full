-- ============================================================================
-- ك-08 (2026-08-24): widen library.articles.number_text past its 50-char cap
-- ============================================================================
-- Created by: Claude (Fable 5 plan/review, Sonnet 5 execution), council-free —
--   mechanical schema widening, not a design decision.
-- Found by: ب-12 (06_أعطال_حية_مؤكدة_2026-08-05.md) — direct corpus measurement,
--   2026-08-05. Re-confirmed 2026-08-24 against the current parsed corpus.
--
-- WHY: `number_text` is what a lawyer actually reads (route.ts falls back to
-- it before the bare article number) — not a key, not indexed, no reason to
-- cap it. The base schema (20260626_legal_library_schema.sql:139) created it
-- as varchar(50). seed-library.ts:403 truncates to match:
--   number_text: (art.number_text || "").substring(0, 50)
-- Real corpus measurement (ب-12, re-verified 2026-08-24 against
-- library-toolkit/output/laws.json): 252 article titles across 57 files
-- exceed 50 chars and get cut mid-word (e.g. "…والسلائف ال" instead of
-- "…والسلائف الكيميائية والنباتات المحظورة"). 8 of those collapse into an
-- identical displayed title as a sibling article once truncated — two
-- different articles become uncitable as distinct entries.
--
-- WHY THE OTHER THREE substring(0,50) SITES ب-12 FLAGGED FOR REVIEW ARE
-- **NOT** INCLUDED HERE (measured 2026-08-24, not assumed):
--   • seed-library.ts (laws.type)              — real max length 17 chars, 0 at cap. Safe.
--   • seed-library.ts (article_amendments.type) — always the literal fallback
--     "تعديل" (5 chars); the parser's amendment objects never actually carry
--     a `.type` field (confirmed: real shape is {date, decree, summary,
--     original_text}), so nothing ever reaches the cap. Separate finding,
--     NOT a truncation bug — logged, not fixed here (out of ك-08's scope).
--   • seed-library.ts (article_regulations.reg_num) — real max length 20
--     chars, 0 at cap. Safe.
--
-- ⚠️ NOT APPLIED YET — written and reviewed, awaiting the judge's decision
-- point for schema-affecting changes (same "المسار الثالث" gate as the
-- FTS-number-search and laws-effective-date-gregorian migrations).
--
-- ⚠️ SEQUENCING — read before touching seed-library.ts:403 again:
-- `number_text` is an EXISTING production column (not a new one), currently
-- varchar(50) and currently enforced by Postgres (an insert/update longer
-- than 50 chars errors, it does not silently truncate). The seeder's
-- `.substring(0, 50)` call is NOT removed by this migration and must stay in
-- place until this ALTER has actually run in production — removing the
-- truncation first would make the next production seed attempt fail outright
-- on any of the 252 long titles. Once this migration is confirmed applied,
-- remove the `.substring(0, 50)` at seed-library.ts:403 in the same sitting.
--
-- SAFETY: widening a varchar(n) to text is safe on Postgres — no table
-- rewrite, no data loss, purely relaxes the constraint. Idempotent in effect
-- (re-running an already-text column is a no-op type change).
-- ============================================================================

alter table library.articles
  alter column number_text type text;

comment on column library.articles.number_text is
  'The article''s written-out ordinal/title as it appears in the source (e.g. "الرابعة والأربعون" or an annex title). Not a key, not indexed — widened from varchar(50) 2026-08-24 (ب-12) after real corpus measurement found 252 titles truncated mid-word, 8 of them colliding with a sibling article''s displayed title.';
