-- =============================================================================
-- Migration: 20261103_20_contract_review_business_row.sql
-- Owner-free wave, S6-T1 (owner package of 1 Nov 2026 §6.2.1d, q327): a
-- specialist lawyer's contract review is «من ٦٠٠» for individuals and «من ٨٠٠»
-- for business. 20261102_10 set the individuals' 600; this file gives the
-- business 800 a row of its own.
-- Safe to re-run. One INSERT … ON CONFLICT DO NOTHING: no UPDATE, DELETE,
-- DROP, function or policy.
-- =============================================================================
--
-- WHY A NEW ID, NOT A PRIMARY-KEY CHANGE
--   admin_pricing_catalog has carried an `audience` column since 20260518, but
--   service_id is the PRIMARY KEY, so one service holds one row. Moving the
--   key to (service_id, audience) would break the 20260518 seed on any hand
--   re-run (it upserts `on conflict (service_id)`) and every reader that keys
--   by service_id. Instead the business price lives in its own row:
--     service_id 'contract-review-business', audience 'corporate' (the value
--     profiles.user_type and subscription_plans.audience use for companies;
--     there is no 'business' user type), metadata.variantOf 'contract-review'.
--   The code never shows this row as a card. resolveClientService
--   (src/lib/pricing/clientPricingAudience.ts) lends its price to the base
--   'contract-review' item when the viewer's audience is 'corporate'.
--
-- RLS: unchanged. The 20260518 public policy serves enabled 'individual' rows
--   only, so anon cannot read this row; the server reads it with the service
--   role.
--
-- ADMIN EDITS: ON CONFLICT DO NOTHING. A re-run never overwrites a price, note
--   or flag an admin changed (the 20260518 seed, by contrast, upserts every
--   column; it has no row with this id, so re-running it leaves this row as is).
--
-- RUN ORDER: any time; recommended right AFTER the deploy.
--   Old code reads audience=eq.individual only and never sees the row. New
--   code before this file serves the code-catalogue variant at the same 800.
--   Nothing charges contract review online: the request is an estimate, and
--   the team issues the receipt by hand (dashboard/admin/service-orders).
--
-- ROLLBACK (by hand):
--   delete from public.admin_pricing_catalog where service_id = 'contract-review-business';
-- =============================================================================

begin;

-- Prerequisite: 20260518_client_workflow_backend_ready.sql (the table).
do $$
begin
  if to_regclass('public.admin_pricing_catalog') is null then
    raise exception '20261103_20: public.admin_pricing_catalog is missing — run 20260518_client_workflow_backend_ready.sql first';
  end if;
end $$;

insert into public.admin_pricing_catalog
  (service_id, audience, category_id, label_ar, base_price, price_mode, receiver_type, beta_visibility, requires_payment, enabled, metadata)
values
  ('contract-review-business', 'corporate', 'contracts', 'مراجعة من محام متخصص', 800, 'starting_from', 'lawyer', 'public', true, true,
    '{"route":"/dashboard/client/requests/new?type=contract-review","icon":"MagnifyingGlass","requestType":"service","priceNote":"سعر الأعمال؛ يُؤكَّد بعد الاطلاع على العقد","humanService":true,"variantOf":"contract-review","addedBy":"20261103_20"}'::jsonb)
on conflict (service_id) do nothing;

commit;

-- ── SELECT check (the SQL editor hides NOTICEs — run this and read the row) ──
-- Expected: one row, ok = true. ok is never NULL. Any positive base_price is
-- ok (an admin may edit it); a row with another audience or no variantOf is
-- ok = false — delete it and run this file again.
select e.service_id,
       c.service_id is not null                            as in_table,
       c.audience,
       c.base_price,
       c.metadata->>'variantOf'                            as variant_of,
       coalesce(
         c.service_id is not null
         and c.audience = 'corporate'
         and c.metadata->>'variantOf' = 'contract-review'
         and c.base_price > 0,
         false)                                            as ok
  from (values ('contract-review-business')) as e(service_id)
  left join public.admin_pricing_catalog c on c.service_id = e.service_id;
