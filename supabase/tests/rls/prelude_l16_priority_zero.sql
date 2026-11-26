-- prelude_l16_priority_zero.sql — the Nezamy priority window set to 0 (20261206_40), so a
-- test written before it (l12_market.test.sql) sees new client requests listed at once.
update public.platform_settings set value = '0'::jsonb where key = 'nzamy_priority_minutes';
