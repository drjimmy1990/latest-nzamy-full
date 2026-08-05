-- =============================================================================
-- Legal Library Open/Close Switch
-- =============================================================================
-- Created:  2026-07-29
-- Purpose:  Admin-controlled global gate for the entire legal library
--           (أنظمة ولوائح · أوامر وتعاميم · مبادئ وسوابق · فقه ومراجع).
--
--           status = 'open'   → normal behaviour; the per-tier paywall in
--                               checkLibraryAccess still applies as before.
--           status = 'closed' → every library API route returns 503 and every
--                               library page renders a closure notice. Admins
--                               keep access so they can verify content while
--                               the library is closed to the public.
--
--           This exists so the library can be taken offline in one click,
--           with NO redeploy, during a content rebuild or if bad data ships.
--
-- SAFETY:   Seeds 'open'. Applying this migration MUST be a behavioural no-op.
--           `on conflict do nothing` so re-applying never resets a deliberate
--           closure back to open.
-- =============================================================================

begin;

insert into public.platform_settings (key, value, description) values
  (
    'library_status',
    '{"status": "open", "message": null}'::jsonb,
    'حالة المكتبة القانونية — status: open | closed؛ message: نص اختياري يظهر للزوار عند الإغلاق'
  )
on conflict (key) do nothing;

commit;
