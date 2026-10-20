-- prelude_platform_settings_min.sql — the two columns of public.platform_settings
-- that _verify.sql's payments_gateway block reads (live table:
-- 20260627_platform_settings.sql). Used by verify_payments_gateway.test.sql.
create table if not exists public.platform_settings (
  key   text  primary key,
  value jsonb not null default '{}'::jsonb
);
