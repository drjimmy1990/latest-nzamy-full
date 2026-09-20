-- ============================================================================
-- STAGING ONLY — NEVER APPLY TO PRODUCTION.
-- Flips platform_settings.payments_gateway to {"status":"test","provider":"stub"}
-- via ON CONFLICT DO UPDATE, i.e. it would silently turn the live gateway into a
-- stub. Live value verified 2026-09-20: {"status":"disabled","provider":null}.
-- Leading underscore = excluded from `supabase db push`.
-- ============================================================================

-- =============================================================================
-- Enable Test Payment Gateway (Stub Mode)
-- =============================================================================
-- Date:     2026-09-16
-- Purpose:  Switches payments_gateway status from 'disabled' to 'test' with
--           provider 'stub'. This unblocks developer, testing, and UAT flows
--           from receiving 402 payment required errors while running locally
--           or in staging, allowing end-to-end booking of consultations.
-- =============================================================================

begin;

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
