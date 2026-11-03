-- prelude_retire_cancelled_prices_before.sql — runs BEFORE the first
-- 20261102_10 run in retire_cancelled_prices.test.sql's chain.
--   * proves the gap: the 20260518 seed still advertises 99 + «الأكثر طلبا»
--     for contract drafting and 800 for a contract review;
--   * adds an admin-style metadata key to each row, which the migration must
--     keep (it merges into metadata, it never replaces it).
do $$
begin
  if (select base_price from public.admin_pricing_catalog where service_id = 'contract-draft') <> 99
     or (select metadata->>'tag' from public.admin_pricing_catalog where service_id = 'contract-draft') is distinct from 'الأكثر طلبا'
     or (select base_price from public.admin_pricing_catalog where service_id = 'contract-review') <> 800 then
    raise exception 'BEFORE FAIL: the 20260518 seed is not what this test expects';
  end if;
  raise notice 'BEFORE PASS: seed has contract-draft 99 + tag, contract-review 800';
end $$;

update public.admin_pricing_catalog
   set metadata = metadata || '{"description":"kept by the migration"}'
 where service_id in ('contract-draft', 'contract-review');
