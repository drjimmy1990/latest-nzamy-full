-- =============================================================================
-- PROPOSAL ONLY — Enable Test Payment Gateway (Stub Mode)
-- =============================================================================
-- Date:     2026-09-16
-- Purpose:  Explicit local/staging-only operator action. This file is kept
--           outside supabase/migrations so it is never applied by normal
--           migration deployment. The database must also expose the custom
--           setting app.environment = local|staging or this proposal aborts.
--           Switches payments_gateway status from 'disabled' to 'test' with
--           provider 'stub'. This unblocks developer, testing, and UAT flows
--           from receiving 402 payment required errors while running locally
--           or in staging, allowing end-to-end booking of consultations.
-- =============================================================================

begin;

do $$
declare
  deployment_environment text := lower(coalesce(current_setting('app.environment', true), ''));
begin
  if deployment_environment not in ('local', 'staging') then
    raise exception 'Refusing to enable stub payments outside an explicitly marked local/staging database';
  end if;
end
$$;

insert into public.platform_settings (key, value, description) values
  (
    'payments_gateway',
    '{"status": "test", "provider": "stub"}'::jsonb,
    'حالة بوابة الدفع — status: test (وضع الاختبار والمحاكاة); provider: stub'
  )
on conflict (key) do update set
  value = '{"status": "test", "provider": "stub"}'::jsonb,
  updated_at = now();

commit;
