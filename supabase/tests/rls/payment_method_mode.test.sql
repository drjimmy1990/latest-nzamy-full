-- CHAIN (from repository root, Git Bash):
-- bash supabase/tests/rls/run.sh \
--   supabase/migrations/20260603_phase1_003_subscriptions_billing.sql \
--   supabase/migrations/20260627_platform_settings.sql \
--   supabase/migrations/20261019_10_library_access_grants.sql \
--   supabase/migrations/20261022_10_payments_core.sql \
--   supabase/migrations/20261022_31_payment_method_mode.sql \
--   supabase/tests/rls/prelude_payment_method_mode.sql \
--   supabase/migrations/20261022_31_payment_method_mode.sql \
--   supabase/tests/rls/payment_method_mode.test.sql
-- NEGATIVE: omit both _31 migrations and the prelude; T0 must raise.
do $$ begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.payment_methods'::regclass and attname = 'live' and not attisdropped) then
    raise exception 'T0 FAIL: payment_methods.live missing';
  end if;
  if has_column_privilege('authenticated','public.payment_methods','token','SELECT')
     or has_column_privilege('authenticated','public.payment_methods','live','SELECT')
     or has_column_privilege('anon','public.payment_methods','id','SELECT') then
    raise exception 'T1 FAIL: hidden card data is readable';
  end if;
  if not has_column_privilege('authenticated','public.payment_methods','last_four','SELECT') then
    raise exception 'T2 FAIL: safe card details not readable';
  end if;
  if (select live from public.payment_methods where token = 'mode-test') is distinct from false then
    raise exception 'T3 FAIL: test mode not recovered';
  end if;
  if (select live from public.payment_methods where token = 'mode-unknown') is not null then
    raise exception 'T4 FAIL: unknown mode guessed';
  end if;
  raise notice 'payment_method_mode: T0-T4 PASS';
end $$;
