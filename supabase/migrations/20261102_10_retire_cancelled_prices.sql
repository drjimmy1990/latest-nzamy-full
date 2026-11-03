-- =============================================================================
-- Migration: 20261102_10_retire_cancelled_prices.sql
-- Wave 1 safety, Task 5 (owner package of 1 Nov 2026, q327): the two contract
-- rows of admin_pricing_catalog stop advertising prices the owner withdrew.
-- Safe to re-run. UPDATE only: no DROP, no DELETE, no function.
-- =============================================================================
--
-- WHY THE DATABASE TOO
--   GET /api/client-pricing merges admin_pricing_catalog over the code
--   catalogue (src/lib/pricingRepository.ts, mergeAdminPricingCatalogRows):
--   the row's base_price, price_mode and metadata.priceNote / metadata.tag
--   WIN over src/constants/clientServiceCatalog.ts. The 20260518 seed still
--   says «أو ابتداء من 99 ر.س للطلب» + «الأكثر طلبا» for contract drafting and
--   800 + «2x سعر مراجعة المحامي» for a lawyer's contract review, so the
--   constants fixed in the same change would not show in production alone.
--
-- WHAT IT CHANGES (key = service_id, the table's primary key)
--   contract-draft   base_price 99 -> 0; metadata.priceNote -> «أو ٥٠٠ نقطة
--                    للعقد» (what /ai/contract-drafter debits: CONTRACT_DRAFT_PRICE,
--                    owner guide §3.2 / q326); metadata.tag «الأكثر طلبا» removed
--                    (owner Q164: no order data supports it). Nothing ever charged
--                    the 99: the row has requires_payment = false.
--   contract-review  base_price 800 -> 600 (q327: «من ٦٠٠» for individuals);
--                    metadata.priceNote -> «سعر الأفراد؛ يُؤكَّد بعد الاطلاع على
--                    العقد». Only the row with audience = 'individual' — the only
--                    audience the API and the public RLS policy serve. The
--                    business price (800) has no row to live in: service_id is
--                    the primary key, so one service has one audience.
--   Every other column and metadata key is kept. A row already holding the new
--   values is not touched (IS DISTINCT FROM guards), so a re-run writes nothing.
--   A missing row is left missing: the code catalogue then serves the same
--   values.
--   NOTE: 20260518's seed is an INSERT … ON CONFLICT DO UPDATE of every
--   column. Re-running 20260518 by hand after this file puts 99 / 800 back;
--   run this file again after any such re-run.
--
-- RUN ORDER: any time — before or after the deploy of the same change.
--   Nothing that takes money reads this table: checkout prices come from the
--   TS price book (src/lib/payments/catalog.ts), and a service request's
--   price is a non-binding estimate. Before the deploy, the old code shows
--   the new row values (the row wins); after it, code and row agree.
--   Recommended: right after the deploy, so both change together.
--
-- ROLLBACK (by hand, only if the owner reverses q327):
--   update public.admin_pricing_catalog set base_price = 800,
--     metadata = metadata || '{"priceNote":"2x سعر مراجعة المحامي"}'
--   where service_id = 'contract-review';
-- =============================================================================

begin;

-- Prerequisite: 20260518_client_workflow_backend_ready.sql (the table).
do $$
begin
  if to_regclass('public.admin_pricing_catalog') is null then
    raise exception '20261102_10: public.admin_pricing_catalog is missing — run 20260518_client_workflow_backend_ready.sql first';
  end if;
end $$;

update public.admin_pricing_catalog
   set base_price = 0,
       metadata   = (metadata || jsonb_build_object('priceNote', 'أو ٥٠٠ نقطة للعقد')) - 'tag',
       updated_at = now()
 where service_id = 'contract-draft'
   and (base_price is distinct from 0
        or metadata->>'priceNote' is distinct from 'أو ٥٠٠ نقطة للعقد'
        or metadata ? 'tag');

update public.admin_pricing_catalog
   set base_price = 600,
       metadata   = metadata || jsonb_build_object('priceNote', 'سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد'),
       updated_at = now()
 where service_id = 'contract-review'
   and audience = 'individual'
   and (base_price is distinct from 600
        or metadata->>'priceNote' is distinct from 'سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد');

commit;

-- ── SELECT check (the SQL editor hides NOTICEs — run this and read the rows) ──
-- Expected: two rows, ok = true. in_table = false means the row does not exist
-- and the code catalogue serves the same values (also ok). ok is never NULL:
-- every comparison is null-safe (a row with no priceNote reads ok = false).
select e.service_id,
       c.service_id is not null                            as in_table,
       c.audience,
       c.base_price,
       c.metadata->>'priceNote'                            as price_note,
       c.metadata->>'tag'                                  as tag,
       coalesce(
         c.service_id is null
         or (e.service_id = 'contract-review' and c.audience is distinct from 'individual')
         or (c.base_price is not distinct from e.base_price
             and c.metadata->>'priceNote' is not distinct from e.price_note
             and not (e.service_id = 'contract-draft' and coalesce(c.metadata ? 'tag', false))),
         false)                                            as ok
  from (values ('contract-draft',  0::numeric,   'أو ٥٠٠ نقطة للعقد'),
               ('contract-review', 600::numeric, 'سعر الأفراد؛ يُؤكَّد بعد الاطلاع على العقد'))
         as e(service_id, base_price, price_note)
  left join public.admin_pricing_catalog c on c.service_id = e.service_id
 order by e.service_id;
