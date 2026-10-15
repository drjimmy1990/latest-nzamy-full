-- =============================================================================
-- Migration: 20261016_05_lawyer_show_hourly_rate.sql
-- =============================================================================
-- PURPOSE
--   Owner decision ١٦٨ (answers of 2026-10-06): «يبقى مخفياً اختيارياً أثناء
--   المرحلة التجريبية (إلا إذا أدخله المحامي بنفسه وفعّل خيار إظهاره)» — a
--   switch «إظهار سعر الاستشارة / الساعة في الملف العام», OFF by default.
--   Until now GET /api/v1/lawyers and /api/v1/lawyers/[id] returned
--   lawyer_profiles.hourly_rate for every listed lawyer.
--
-- WHAT IT DOES (idempotent)
--   1. lawyer_profiles.show_hourly_rate boolean NOT NULL DEFAULT false — every
--      existing lawyer starts hidden, as the owner decided.
--   2. authenticated may UPDATE it (column grant, next to the 20260922_03
--      list) — PATCH /api/v1/profile allowlists it for the lawyer's own row;
--      the row policy "lawyers update own profile" is unchanged.
--   3. Verify block — raises unless the column exists with default false and
--      NOT NULL, authenticated can update it, anon cannot.
--
-- CODE THAT GOES WITH IT (same commit)
--   * GET /api/v1/lawyers and /api/v1/lawyers/[id] null hourly_rate unless
--     show_hourly_rate is true (src/lib/lawyers/publicRate.ts); a price sort
--     lists only lawyers who show a rate.
--   * The switch: /dashboard/lawyer/profile/edit and Settings → المهنة. Both
--     show and send it only when GET /api/v1/profile returns the key, so the
--     screens keep saving before this file runs.
--
-- DEPLOY ORDER — THIS MIGRATION FIRST, THEN THE CODE
--   The public lawyer routes of the same commit select show_hourly_rate; on a
--   database without the column they answer «تعذّر تحميل دليل المحامين» (42703)
--   until this file runs.
--
-- NOT AFTER THIS FILE WITHOUT CARE
--   Re-running 20260922_03_lawyer_provider_column_grants.sql revokes UPDATE on
--   lawyer_profiles and re-grants ITS list, which lacks this column: the
--   switch would then answer «تعذّر حفظ» (42501). Re-run this file after it.
--   _verify.sql's 20260922_03 section lists show_hourly_rate as allowed.
--
-- KNOWN, NOT FIXED HERE (plan of 2026-10-16, security)
--   The production policy "public read verified lawyers" (anon + authenticated,
--   every column) still lets a REST client read hourly_rate, license_number
--   and credit_balance of a listed lawyer directly. Closing it needs the
--   lawyer's own-row reads moved to the server first.
--
-- ROLLBACK
--   alter table public.lawyer_profiles drop column if exists show_hourly_rate;
-- =============================================================================

begin;

alter table public.lawyer_profiles
  add column if not exists show_hourly_rate boolean not null default false;

comment on column public.lawyer_profiles.show_hourly_rate is
  'Owner decision 168: the public lawyer APIs return hourly_rate only when this is true. Off by default; the lawyer turns it on in their profile. 20261016_05.';

grant update (show_hourly_rate) on public.lawyer_profiles to authenticated;

do $$
declare
  missing text := '';
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles'
                    and column_name = 'show_hourly_rate'
                    and is_nullable = 'NO' and column_default = 'false') then
    missing := missing || ' lawyer_profiles.show_hourly_rate is missing or not NOT NULL DEFAULT false;';
  end if;
  if not has_column_privilege('authenticated', 'public.lawyer_profiles', 'show_hourly_rate', 'UPDATE') then
    missing := missing || ' authenticated cannot UPDATE show_hourly_rate (the switch would fail);';
  end if;
  if has_column_privilege('anon', 'public.lawyer_profiles', 'show_hourly_rate', 'UPDATE') then
    missing := missing || ' anon can UPDATE show_hourly_rate;';
  end if;
  if missing <> '' then
    raise exception '20261016_05 verify:%', missing;
  end if;
  raise notice '20261016_05 verify: OK — show_hourly_rate (default false) added; the lawyer can switch it, anon cannot';
end $$;

commit;

notify pgrst, 'reload schema';
