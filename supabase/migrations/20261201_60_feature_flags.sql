-- =============================================================================
-- Migration: 20261201_60_feature_flags.sql
-- =============================================================================
-- PURPOSE (batch l11-misc; gap O22 = owner file 15 #53 «أعلام الميزات من الخادم»,
-- and O20 / A21 the «مساعد نظامي» site widget)
--
--   platform_settings 'feature_flags' = {"<flag>": true|false}: the server-side
--   feature switches. The closed list lives in src/lib/featureFlags/featureFlags.ts
--   (today one flag, "site_assistant" — the site help widget, which answers from
--   the platform's own price book / offers / FAQ and needs no outside model, so
--   it ships ON). The admin page /dashboard/admin/features edits it through
--   PATCH /api/v1/admin/settings (staff settings.write, validated, audited); the
--   server reads it with a one-minute cache.
--
--   INSERT ONLY: an admin's later value is never overwritten. No grant, no
--   policy: platform_settings keeps its existing RLS (anyone may SELECT, only
--   admins may write — 20260627 / 20261016_09); the value holds no secret.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261201_60_feature_flags.sql
--   Expect: NOTICE  l11_misc verify: OK  and a row with `t`.
--
-- RUN ORDER: any time, before or after the l11-misc deploy.
--   * Code first, no row: every flag reads as its default (site_assistant ON),
--     and the admin page's first save creates the row — same behaviour.
--   * SQL first, old code: nothing reads the row yet.
--   Idempotent: safe to run any number of times.
--
-- ROLLBACK:
--   delete from public.platform_settings where key = 'feature_flags';
--   (the code then reads every flag as its default)
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261201_60: public.platform_settings is missing';
  end if;
end $$;

-- ── 1. the setting (insert when missing; an existing value is kept) ──────────
insert into public.platform_settings (key, value, description) values
  ('feature_flags',
   '{"site_assistant": true}'::jsonb,
   'مفاتيح الميزات من الخادم: {"site_assistant": true|false} — «مساعد نظامي» في الموقع. تُعدَّل من صفحة مفاتيح الميزات (20261201_60)')
on conflict (key) do nothing;

-- ── 2. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
begin
  select value into v from public.platform_settings where key = 'feature_flags';
  if v is null then
    raise exception 'l11_misc verify: feature_flags row is missing';
  end if;
  if jsonb_typeof(v) <> 'object' then
    raise exception 'l11_misc verify: feature_flags is not an object: %', v;
  end if;
  if v ? 'site_assistant' and jsonb_typeof(v -> 'site_assistant') <> 'boolean' then
    raise exception 'l11_misc verify: feature_flags.site_assistant is not a boolean: %', v;
  end if;
  raise notice 'l11_misc verify: OK';
end
$verify$;

commit;

select '20261201_60 feature flags: platform_settings.feature_flags present (site_assistant)' as migration,
       exists (select 1 from public.platform_settings
                where key = 'feature_flags'
                  and jsonb_typeof(value) = 'object') as ok;
