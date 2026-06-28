-- =============================================================================
-- Payments Gateway Status Setting
-- =============================================================================
-- Created:  2026-06-28
-- Purpose:  Admin-controlled gate for all payment flows until a real payment
--           gateway (Moyasar / Tap / HyperPay) is decided and integrated.
--           When status = 'disabled', payment call-sites must block submit and
--           show "الدفع غير متاح حالياً". When 'test', the stub adapter runs.
-- =============================================================================

begin;

insert into public.platform_settings (key, value, description) values
  (
    'payments_gateway',
    '{"status": "disabled", "provider": null}'::jsonb,
    'حالة بوابة الدفع — status: disabled | test | live; provider: اسم المزود عند التفعيل'
  )
on conflict (key) do nothing;

commit;