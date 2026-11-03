-- prelude_retire_cancelled_prices_between_runs.sql — runs BETWEEN the two
-- 20261102_10 runs. Asserts the first run wrote both rows, then snapshots
-- every row's xmin and updated_at: the second run must write NOTHING
-- (retire_cancelled_prices.test.sql, T3).
do $$
begin
  if (select base_price from public.admin_pricing_catalog where service_id = 'contract-draft') <> 0
     or (select base_price from public.admin_pricing_catalog where service_id = 'contract-review') <> 600 then
    raise exception 'BETWEEN FAIL: the first run did not write the new prices';
  end if;
  raise notice 'BETWEEN PASS: first run wrote 0 / 600';
end $$;

create table public._retire_prices_snapshot as
  select service_id, xmin::text as row_xmin, updated_at
    from public.admin_pricing_catalog;
