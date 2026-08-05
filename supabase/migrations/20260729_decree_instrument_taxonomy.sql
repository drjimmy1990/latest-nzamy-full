-- =============================================================================
-- Decree / Circular instrument taxonomy
-- =============================================================================
-- Created:  2026-07-29
-- Purpose:  Widen library.decrees_circulars.type from three values to the real
--           Saudi instrument types present in the corpus, and record the
--           verbatim Arabic instrument name alongside it.
--
-- WHY
--   The column allowed only ('royal','cabinet','circular'). Measured over the
--   2,080-document corpus, 707 of 2,077 typed documents (34%) were stored under
--   a wrong or under-specified instrument:
--     • أمر سامي (Supreme Order, 105) stored as `royal` — a distinct instrument
--       from a Royal Decree.
--     • أمر ملكي (Royal Order, 26) conflated with مرسوم ملكي (Royal Decree, 286).
--     • قرار وزاري (Ministerial Decision, 15) parsed "ministerial", which the
--       CHECK could not store, so the seeder clamped it to `circular`.
--     • ~190 rulebooks (قواعد/مبادئ/لائحة/معايير/دليل/سياسة) hit the parser's
--       catch-all and were asserted to be Cabinet Decisions.
--
-- SAFETY
--   The three legacy values are RETAINED in the CHECK, so this migration cannot
--   fail on the ~2,078 existing rows and requires no backfill. Existing rows keep
--   their current (coarse) type until the next reseed writes the precise one.
--   Applying this migration alone is a behavioural no-op.
-- =============================================================================

begin;

-- ── 1. Verbatim instrument name ──────────────────────────────────────────────
-- The Arabic string exactly as the source wrote it. The `type` column is a
-- normalised machine value; this is what a citation should display.
alter table library.decrees_circulars
  add column if not exists instrument_ar varchar(120);

comment on column library.decrees_circulars.instrument_ar is
  'Verbatim Arabic instrument name from the source frontmatter (e.g. "أمر سامي"). Never normalised — `type` is the normalised form.';

-- ── 2. Widen the type CHECK ──────────────────────────────────────────────────
alter table library.decrees_circulars
  drop constraint if exists decrees_circulars_type_check;

alter table library.decrees_circulars
  add constraint decrees_circulars_type_check check (type in (
    -- Legacy values. Kept so existing rows remain valid and this migration is a
    -- no-op on current data; removed in a later migration once a reseed has
    -- replaced them with the precise types below.
    'royal', 'cabinet', 'circular',

    -- Royal-family instruments (legally distinct from one another)
    'royal_decree',              -- مرسوم ملكي
    'royal_order',               -- أمر ملكي
    'supreme_order',             -- أمر سامي
    'supreme_directive',         -- توجيه سامي
    'decree',                    -- مرسوم (unqualified)

    -- Decisions, by issuing authority
    'cabinet_decision',          -- قرار مجلس الوزراء
    'ministerial_decision',      -- قرار وزاري
    'economic_council_decision', -- قرار المجلس الاقتصادي الأعلى
    'administrative_decision',   -- قرار إداري
    'decision',                  -- قرار — issuer not stated in the source

    -- Regulatory instruments (largely SAMA/agency rulebooks)
    'rules',                     -- قواعد
    'principles',                -- مبادئ
    'regulation',                -- لائحة
    'standards',                 -- معايير
    'guide',                     -- دليل / دليل إرشادي
    'policy',                    -- سياسة
    'instructions',              -- تعليمات
    'organization',              -- تنظيم
    'interpretation',            -- تفسير
    'law',                       -- نظام

    -- Explicit "the source does not say". Better than asserting a plausible
    -- instrument, which is what the removed catch-all did for 207 documents.
    'unknown'
  ));

create index if not exists idx_decrees_type on library.decrees_circulars (type);

commit;
