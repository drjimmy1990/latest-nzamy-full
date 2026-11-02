-- prelude_contract_draft_points_between_runs.sql — runs BETWEEN the two
-- 20261102_11 runs in contract_draft_points_price.test.sql's chain. Asserts
-- the first run wrote the row, then snapshots every row's xmin and
-- updated_at: the second run must write NOTHING (T3).
do $$
begin
  if (select price_mode from public.admin_pricing_catalog where service_id = 'contract-draft') is distinct from 'points' then
    raise exception 'BETWEEN FAIL: the first run did not write price_mode points';
  end if;
  raise notice 'BETWEEN PASS: first run wrote price_mode points';
end $$;

create table public._draft_points_snapshot as
  select service_id, xmin::text as row_xmin, updated_at
    from public.admin_pricing_catalog;
