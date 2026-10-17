-- =============================================================================
-- Migration: 20261018_03_community_civil_category.sql
-- =============================================================================
-- PURPOSE
--   Owner answer ١٩٠ (approved answers of 2026-10-16): «يُضاف [تصنيف «مدني»]
--   فوراً كقيمة تصنيفية رئيسية في قاعدة البيانات وواجهات المجتمع القانوني» —
--   civil cases are a pillar of Saudi practice and must not be folded into
--   «أخرى».
--
--   community_posts.category's CHECK list (20260603_phase1_004) has no civil
--   value, so the API stored a question asked under «مدني» as 'other' and read
--   'other' back as «مدني» (src/app/api/v1/community/posts/_feed.ts). Nothing
--   else writes 'other' (the ask page offers labor, commercial, civil,
--   criminal, family, real-estate).
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. Replaces the category CHECK (found by catalogue lookup, whatever its
--      name) with the same list plus 'civil'. 'other' stays allowed.
--   2. Moves every 'other' row to 'civil' — they were all asked under «مدني».
--   3. Verify block — RAISES unless 'civil' is accepted and no 'other' row is
--      left.
--
-- DEPLOY ORDER — THIS MIGRATION FIRST, THEN THE CODE
--   The new code writes 'civil'; before this file the CHECK rejects it and a
--   question asked under «مدني» fails. This file is safe with the old code:
--   the old code still writes 'other' (allowed) and shows a 'civil' row as
--   «مدني»; only its «مدني» filter misses the moved rows until the deploy.
--
-- ROLLBACK
--   begin;
--     update public.community_posts set category = 'other' where category = 'civil';
--     alter table public.community_posts drop constraint if exists community_posts_category_check;
--     alter table public.community_posts add constraint community_posts_category_check check (category in (
--       'general', 'labor', 'commercial', 'criminal', 'family', 'real_estate',
--       'administrative', 'intellectual_property', 'international', 'other'));
--   commit;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.community_posts') is null then
    raise exception '20261018_03: public.community_posts does not exist — apply 20260603_phase1_004_community_features.sql first';
  end if;
end $$;

-- ── 1. The category CHECK, with 'civil' ──────────────────────────────────────
do $$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.community_posts'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%category%'
  loop
    execute format('alter table public.community_posts drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.community_posts add constraint community_posts_category_check
  check (category in (
    'general', 'labor', 'commercial', 'civil', 'criminal', 'family', 'real_estate',
    'administrative', 'intellectual_property', 'international', 'other'
  ));

-- ── 2. Questions asked under «مدني» before this file ─────────────────────────
update public.community_posts set category = 'civil' where category = 'other';

-- ── 3. Verify ────────────────────────────────────────────────────────────────
do $$
declare
  n int;
begin
  if not exists (select 1 from pg_constraint con
                  where con.conrelid = 'public.community_posts'::regclass
                    and con.conname = 'community_posts_category_check'
                    and pg_get_constraintdef(con.oid) like '%''civil''%') then
    raise exception '20261018_03 verify: the category CHECK does not accept civil';
  end if;
  select count(*) into n from public.community_posts where category = 'other';
  if n <> 0 then
    raise exception '20261018_03 verify: % row(s) still in other', n;
  end if;
  select count(*) into n from public.community_posts where category = 'civil';
  raise notice '20261018_03 verify: OK — «مدني» is stored as civil (% question(s))', n;
end $$;

commit;
