-- ════════════════════════════════════════════════════════════════════════════
-- One-time data fix — 2026-10-04 — remove internal editorial/review notes from
-- the public `metadata` jsonb of library.judicial_collections and
-- library.principles.
--
-- Why: the seeders copied the source front matter into `metadata`, so the
-- library team's internal notes were readable by any visitor through the
-- public REST key. Measured on 2026-10-04 (read-only):
--   judicial_collections (209 rows): editorial_notes 60, review_reason 85,
--     needs_human_review 86, review_reason_source 35, review_cleared_on 33,
--     review_cleared_reason 33, review_note 4
--   principles (18,983 rows): editorial_notes 655, review_reason 580,
--     needs_human_review 607, review_reason_source 154, review_cleared_on 415,
--     review_cleared_reason 415, review_note 31
-- No nested occurrences were found, so only top-level keys are removed.
-- The library contract (1.6) makes this family internal: never shown, never
-- served. The pages never displayed them; the REST key did.
--
-- What it removes (the same rule as src/lib/library/internalContentFields.ts):
--   needs_human_review, type_review_reason, review_*, editorial_notes*
-- Nothing else in `metadata` changes. No rows are deleted.
--
-- The seeders now strip the same keys (seed-library.ts,
-- seed-library-from-owner.mjs), so a reseed does not bring them back.
-- Migration 20261004_01 (column lock) later removes anon access to
-- `metadata` altogether.
--
-- Run it in the Supabase SQL Editor, block by block.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — run alone first. Expect about 86 and 1,000 rows (see counts above).
select 'judicial_collections' as t, count(*) as rows_with_internal_keys
from library.judicial_collections c
where jsonb_typeof(c.metadata) = 'object'
  and exists (
    select 1 from jsonb_object_keys(c.metadata) as k
    where k = 'needs_human_review' or k = 'type_review_reason'
       or k like 'review\_%' or k like 'editorial\_notes%')
union all
select 'principles', count(*)
from library.principles p
where jsonb_typeof(p.metadata) = 'object'
  and exists (
    select 1 from jsonb_object_keys(p.metadata) as k
    where k = 'needs_human_review' or k = 'type_review_reason'
       or k like 'review\_%' or k like 'editorial\_notes%');

-- 2) STRIP — one transaction; rolls back unless no internal key is left.
begin;

update library.judicial_collections c
set metadata = (
  select coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
  from jsonb_each(c.metadata) as e(k, v)
  where not (e.k = 'needs_human_review' or e.k = 'type_review_reason'
             or e.k like 'review\_%' or e.k like 'editorial\_notes%'))
where jsonb_typeof(c.metadata) = 'object'
  and exists (
    select 1 from jsonb_object_keys(c.metadata) as k
    where k = 'needs_human_review' or k = 'type_review_reason'
       or k like 'review\_%' or k like 'editorial\_notes%');

update library.principles p
set metadata = (
  select coalesce(jsonb_object_agg(e.k, e.v), '{}'::jsonb)
  from jsonb_each(p.metadata) as e(k, v)
  where not (e.k = 'needs_human_review' or e.k = 'type_review_reason'
             or e.k like 'review\_%' or e.k like 'editorial\_notes%'))
where jsonb_typeof(p.metadata) = 'object'
  and exists (
    select 1 from jsonb_object_keys(p.metadata) as k
    where k = 'needs_human_review' or k = 'type_review_reason'
       or k like 'review\_%' or k like 'editorial\_notes%');

do $$
declare left_c int; left_p int;
begin
  select count(*) into left_c from library.judicial_collections c
   where jsonb_typeof(c.metadata) = 'object'
     and exists (select 1 from jsonb_object_keys(c.metadata) as k
                 where k = 'needs_human_review' or k = 'type_review_reason'
                    or k like 'review\_%' or k like 'editorial\_notes%');
  select count(*) into left_p from library.principles p
   where jsonb_typeof(p.metadata) = 'object'
     and exists (select 1 from jsonb_object_keys(p.metadata) as k
                 where k = 'needs_human_review' or k = 'type_review_reason'
                    or k like 'review\_%' or k like 'editorial\_notes%');
  if left_c > 0 or left_p > 0 then
    raise exception 'internal keys still present (collections %, principles %) — rolling back', left_c, left_p;
  end if;
  raise notice '2026-10-04 strip: OK — no internal keys left in library metadata';
end $$;

commit;

-- 3) VERIFY — expect two rows with 0.
select 'judicial_collections' as t, count(*) from library.judicial_collections c
where jsonb_typeof(c.metadata) = 'object'
  and exists (select 1 from jsonb_object_keys(c.metadata) as k
              where k = 'needs_human_review' or k like 'review\_%' or k like 'editorial\_notes%')
union all
select 'principles', count(*) from library.principles p
where jsonb_typeof(p.metadata) = 'object'
  and exists (select 1 from jsonb_object_keys(p.metadata) as k
              where k = 'needs_human_review' or k like 'review\_%' or k like 'editorial\_notes%');
