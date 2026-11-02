-- =============================================================================
-- Migration: 20261102_11_contract_draft_points_price.sql
-- Wave 1 safety, Task 6 item G (owner package of 1 Nov 2026): the contract
-- drafting card stops saying «مشمول في الباقة».
-- Safe to re-run. UPDATE only: no DROP, no DELETE, no function.
-- =============================================================================
--
-- WHY
--   admin_pricing_catalog's contract-draft row has price_mode 'included' and
--   metadata.includedByPlan 'ai_individual', so /dashboard/client/services
--   shows «مشمول في الباقة». No plan grant includes contract drafting: the
--   founder credits cover legal-drafter, contracts-pro, legal-opinion and
--   wargaming, and the AI plan grants 0 points (owner ٢٩١). The tool
--   /ai/contract-drafter debits CONTRACT_DRAFT_PRICE = 500 points
--   (src/lib/ai/tools.ts). GET /api/client-pricing lets this row WIN over
--   src/constants/clientServiceCatalog.ts (mergeAdminPricingCatalogRows), so
--   the code change alone would not show in production.
--
-- WHAT IT CHANGES (key = service_id, the table's primary key)
--   contract-draft   price_mode 'included' -> 'points' (rendered «بالنقاط»);
--                    metadata.priceNote -> «٥٠٠ نقطة للعقد» (no «أو»: there is
--                    nothing for it to be an alternative to);
--                    metadata.includedByPlan removed. base_price stays 0 (it
--                    is riyals wherever it is read). Every other column and
--                    metadata key is kept. A row already holding the new
--                    values is not touched, so a re-run writes nothing. A
--                    missing row is left missing: the code catalogue then
--                    serves the same values.
--
-- RUN ORDER: AFTER the deploy of the same change, and after 20261102_10.
--   Code before this change has no label for 'points'
--   (formatClientServicePrice indexes a closed map), so running it first
--   would blank the card's price until the deploy lands.
--   Re-running 20261102_10 later puts the note «أو ٥٠٠ نقطة للعقد» back (it
--   does not touch price_mode): run this file again after any such re-run.
--   The same holds for a hand re-run of the 20260518 seed.
--
-- ROLLBACK (by hand, only if the owner reverses it):
--   update public.admin_pricing_catalog set price_mode = 'included',
--     metadata = metadata || '{"priceNote":"أو ٥٠٠ نقطة للعقد","includedByPlan":"ai_individual"}'
--   where service_id = 'contract-draft';
-- =============================================================================

begin;

-- Prerequisite: 20260518_client_workflow_backend_ready.sql (the table).
do $$
begin
  if to_regclass('public.admin_pricing_catalog') is null then
    raise exception '20261102_11: public.admin_pricing_catalog is missing — run 20260518_client_workflow_backend_ready.sql first';
  end if;
end $$;

update public.admin_pricing_catalog
   set price_mode = 'points',
       metadata   = (metadata || jsonb_build_object('priceNote', '٥٠٠ نقطة للعقد')) - 'includedByPlan',
       updated_at = now()
 where service_id = 'contract-draft'
   and (price_mode is distinct from 'points'
        or metadata->>'priceNote' is distinct from '٥٠٠ نقطة للعقد'
        or metadata ? 'includedByPlan');

commit;

-- ── SELECT check (the SQL editor hides NOTICEs — run this and read the row) ──
-- Expected: one row, ok = true. in_table = false means the row does not exist
-- and the code catalogue serves the same values (also ok). ok is never NULL.
select e.service_id,
       c.service_id is not null                            as in_table,
       c.price_mode,
       c.base_price,
       c.metadata->>'priceNote'                            as price_note,
       c.metadata->>'includedByPlan'                       as included_by_plan,
       coalesce(
         c.service_id is null
         or (c.price_mode is not distinct from e.price_mode
             and c.metadata->>'priceNote' is not distinct from e.price_note
             and not coalesce(c.metadata ? 'includedByPlan', false)),
         false)                                            as ok
  from (values ('contract-draft', 'points', '٥٠٠ نقطة للعقد'))
         as e(service_id, price_mode, price_note)
  left join public.admin_pricing_catalog c on c.service_id = e.service_id;
