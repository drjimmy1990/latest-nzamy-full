-- =============================================================================
-- Migration: 20261129_50_library_public_rulings_two.sql
-- =============================================================================
-- PURPOSE (owner register 14 item 13 + file 16 §9.5, 19 Nov 2026; batch l9-reader)
--
--   «يرى الزائر النص الكامل لحكمين لكل مجموعة (إعداد، حد أقصى 3)، والباقي مقفول
--   حتى الاشتراك مع بطاقة اشتراك … (يلغي «مقتطف 180 حرفاً» و«3 أو 5»)».
--
--   platform_settings 'public_full_rulings_per_collection' becomes {"full":2}:
--   a non-subscriber reads the first 2 items of every judicial collection in
--   full; every other item is its title and a subscribe card, cut on the
--   server (no text in the response). The excerpt key is gone.
--
--   THIS FILE OVERWRITES THE STORED VALUE with an explicit UPDATE: the row was
--   inserted by 20261128_30 as {"full":0,"excerpt_chars":180}, and an insert
--   never overwrites a value (an admin's or the old default). Any value other
--   than {"full":2} — including one an admin set since — is replaced. After
--   this, the admin page (/dashboard/admin/settings, «حماية المكتبة العامة»)
--   edits it again, 0 to 3, audited by PATCH /api/v1/admin/settings.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_50_library_public_rulings_two.sql
--   Expect: NOTICE  l9_reader verify: OK  and a row with `t`.
--
-- RUN ORDER: any time after 20261128_30 (batch 8, live). Best BEFORE the l9
--   deploy:
--   * SQL first, old code: the old code reads {"full":2} as 2 full rulings
--     (its excerpt falls back to its 180-character default) — already the
--     owner's number.
--   * Code first, old row: the new code reads {"full":0,"excerpt_chars":180}
--     as 0 full items and no excerpt — every item locked to its title for a
--     guest until this runs (honest: nothing is shown that should not be).
--   Idempotent: safe to run any number of times.
--
-- ROLLBACK (back to batch 8's value):
--   update public.platform_settings
--      set value = '{"full":0,"excerpt_chars":180}'::jsonb, updated_at = now()
--    where key = 'public_full_rulings_per_collection';
--   (the l9 code then shows a guest no ruling text at all; the l8 code its excerpt)
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261129_50: public.platform_settings is missing';
  end if;
end $$;

-- ── 1. the setting (insert when missing, then the explicit UPDATE) ───────────
insert into public.platform_settings (key, value, description) values
  ('public_full_rulings_per_collection',
   '{"full":2}'::jsonb,
   'الأحكام الكاملة المجانية لكل مجموعة لغير المشترك: 2 (حد أقصى 3)، والباقي عناوين وبطاقة اشتراك بلا مقتطف (20261129_50)')
on conflict (key) do nothing;

update public.platform_settings
   set value       = '{"full":2}'::jsonb,
       description = 'الأحكام الكاملة المجانية لكل مجموعة لغير المشترك: 2 (حد أقصى 3)، والباقي عناوين وبطاقة اشتراك بلا مقتطف (20261129_50)',
       updated_at  = now()
 where key = 'public_full_rulings_per_collection'
   and value is distinct from '{"full":2}'::jsonb;

-- ── 2. verify ────────────────────────────────────────────────────────────────
do $verify$
begin
  if not exists (select 1 from public.platform_settings
                  where key = 'public_full_rulings_per_collection'
                    and value = '{"full":2}'::jsonb) then
    raise exception 'l9_reader verify: public_full_rulings_per_collection is not {"full":2}';
  end if;
  raise notice 'l9_reader verify: OK';
end
$verify$;

commit;

select '20261129_50 public rulings: 2 full per collection, no excerpt' as step,
       exists (select 1 from public.platform_settings
                where key = 'public_full_rulings_per_collection'
                  and value = '{"full":2}'::jsonb) as ok;
