-- =============================================================================
-- Migration: 20261203_90_market_instant_accept.sql   (verify id: l13_market_instant)
-- =============================================================================
-- PURPOSE (batch l13 — the owner's replies of 22 Nov 2026)
--
--   Q151 (ب): a verified lawyer's acceptance of a client request from the
--   market is INSTANT — no 30-minute admin approval window. 20261202_70 seeded
--   platform_settings.marketplace_market.accept_mode = 'admin_approval' (the
--   default while Q151 was open); this file flips it to 'instant'. The admin
--   can switch it back from the market settings page at any time.
--
--   Only accept_mode changes; open / opened_at / approval_minutes are kept.
--   Lawyer verification itself is unchanged: only verified lawyers see the
--   market at all.
--
-- ORDER: any time after 20261202_70 (stops with a clear message before it).
-- SAFE TO RE-RUN: yes (sets the same value again).
-- ROLLBACK:
--   update public.platform_settings
--      set value = jsonb_set(value, '{accept_mode}', '"admin_approval"')
--    where key = 'marketplace_market';
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.platform_settings') is null then
    raise exception '20261203_90: run 20261202_70_market_open.sql first (no platform_settings table)';
  end if;
  perform 1 from public.platform_settings where key = 'marketplace_market';
  if not found then
    raise exception '20261203_90: run 20261202_70_market_open.sql first (no marketplace_market setting)';
  end if;
end
$pre$;

update public.platform_settings
   set value = pg_catalog.jsonb_set(value, '{accept_mode}', '"instant"'::jsonb, true)
 where key = 'marketplace_market'
   and pg_catalog.jsonb_typeof(value) = 'object';

do $v$
begin
  if coalesce((select value ->> 'accept_mode' from public.platform_settings where key = 'marketplace_market'), '') <> 'instant' then
    raise exception '20261203_90 verify: marketplace_market.accept_mode is not instant';
  end if;
  raise notice 'l13_market_instant verify: OK — market acceptance is instant (Q151)';
end
$v$;

commit;

select '20261203_90 market acceptance instant (Q151)' as migration, true as ok;
