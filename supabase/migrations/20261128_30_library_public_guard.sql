-- =============================================================================
-- Migration: 20261128_30_library_public_guard.sql
-- =============================================================================
-- PURPOSE (owner message 18 Nov 2026, items 2 and 3.2; batch l8 decisions,
-- «Library»; builder l8-libguard). Data only: no table, column, function,
-- policy or grant changes.
--
--   1. platform_settings, three admin settings (ON CONFLICT DO NOTHING — an
--      admin's value is never overwritten; the code reads the same numbers as
--      defaults when a row is missing, src/lib/library/publicGuard.ts):
--        library_public_protection
--          {"session_challenge_after":120, "ip_challenge_after":400,
--           "pages_challenge_after":15, "session_hard_per_10min":600,
--           "max_public_offset":250, "pass_minutes":30}
--          per-session / per-address budgets on /api/library/* and search
--          (src/proxy.ts applyLibraryPublicGuard), the Turnstile challenge
--          past them, the consecutive-pages budget, the browsing-depth cap for
--          a non-subscriber, and how long a solved challenge lasts.
--        public_full_rulings_per_collection  {"full":0, "excerpt_chars":180}
--          owner: one paragraph (~1.5 lines) instead of 3 full rulings — no
--          ruling in full for a non-subscriber, each shows a 180-character
--          excerpt cut at a word.
--        library_feqh_free_pages  {"pages":0}
--          owner: fiqh text is for subscribers only (was the first 2 pages).
--
--   2. daily_full_read_limit = 50 (owner item 3.2) — the library's admin-edited
--      caps row, public.library_monitor_settings (20261031_10; page «نشاط
--      المكتبة»): daily_docs 220 → 50 and member_daily_docs 400 → 50, the
--      column defaults with them. slow_daily_docs (the «إبطاء» cap for an
--      account under review) was 60 — looser than the new normal cap — so it
--      becomes 25 when it is not already below 50. Counted only on a
--      full-text open (owner ٤٤٧, unchanged). THIS OVERWRITES THOSE NUMBERS
--      if an admin had changed them; the SELECT at the end shows the result.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261128_30_library_public_guard.sql
--   Expect: NOTICE  20261128_30 verify: OK  and a row with `t`.
--
-- RUN ORDER: EITHER ORDER relative to the l8 deploy. The new code reads the
--   three settings with the owner's numbers as defaults, and its quota
--   fallbacks are already 50; the deployed (old) code ignores the new keys and
--   simply reads 50 from the caps row.
--
-- ROLLBACK:
--   delete from public.platform_settings
--    where key in ('library_public_protection', 'public_full_rulings_per_collection', 'library_feqh_free_pages');
--   update public.library_monitor_settings
--      set daily_docs = 220, member_daily_docs = 400, slow_daily_docs = 60, updated_at = now()
--    where id;
--   alter table public.library_monitor_settings
--     alter column daily_docs set default 220,
--     alter column member_daily_docs set default 400,
--     alter column slow_daily_docs set default 60;
--
-- Safe to re-run.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261128_30: public.platform_settings is missing';
  end if;
  if to_regclass('public.library_monitor_settings') is null then
    raise exception '20261128_30: public.library_monitor_settings is missing — run 20261031_10_library_activity_monitor.sql first';
  end if;
end $$;

-- ── 1. the three settings ────────────────────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_public_protection',
   '{"session_challenge_after":120,"ip_challenge_after":400,"pages_challenge_after":15,"session_hard_per_10min":600,"max_public_offset":250,"pass_minutes":30}'::jsonb,
   'حماية المكتبة العامة: حدود الجلسة والعنوان، والتحقق البشري، والصفحات المتتابعة، وعمق التصفح لغير المشترك (20261128_30)'),
  ('public_full_rulings_per_collection',
   '{"full":0,"excerpt_chars":180}'::jsonb,
   'الأحكام الكاملة المجانية لكل مجموعة: 0 كاملة، ومقتطف فقرة واحدة نحو سطر ونصف (20261128_30)'),
  ('library_feqh_free_pages',
   '{"pages":0}'::jsonb,
   'صفحات الفقه المجانية لغير المشترك: الفقه للمشتركين فقط (20261128_30)')
on conflict (key) do nothing;

-- ── 2. daily_full_read_limit = 50 ────────────────────────────────────────────
insert into public.library_monitor_settings (id) values (true) on conflict (id) do nothing;

update public.library_monitor_settings
   set daily_docs        = 50,
       member_daily_docs = 50,
       slow_daily_docs   = case when slow_daily_docs >= 50 then 25 else slow_daily_docs end,
       updated_at        = now()
 where id
   and (daily_docs <> 50 or member_daily_docs <> 50 or slow_daily_docs >= 50);

alter table public.library_monitor_settings
  alter column daily_docs        set default 50,
  alter column member_daily_docs set default 50,
  alter column slow_daily_docs   set default 25;

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
begin
  if (select pg_catalog.count(*) from public.platform_settings
       where key in ('library_public_protection', 'public_full_rulings_per_collection', 'library_feqh_free_pages')) <> 3 then
    raise exception '20261128_30 verify: a library guard setting is missing from platform_settings';
  end if;
  if not exists (select 1 from public.library_monitor_settings s
                  where s.id and s.daily_docs = 50 and s.member_daily_docs = 50 and s.slow_daily_docs < 50) then
    raise exception '20261128_30 verify: library_monitor_settings is not at daily 50 / member 50 / slow < 50';
  end if;
  raise notice '20261128_30 verify: OK';
end
$verify$;

commit;

select '20261128_30 library public guard (3 settings + daily_full_read_limit 50)' as step,
       ((select pg_catalog.count(*) from public.platform_settings
          where key in ('library_public_protection', 'public_full_rulings_per_collection', 'library_feqh_free_pages')) = 3
        and exists (select 1 from public.library_monitor_settings s
                     where s.id and s.daily_docs = 50 and s.member_daily_docs = 50)) as ok;

-- What the admin page now reads (expect 50 · 50 · 25 or lower · 50):
select daily_docs, member_daily_docs, slow_daily_docs, hourly_docs from public.library_monitor_settings;
