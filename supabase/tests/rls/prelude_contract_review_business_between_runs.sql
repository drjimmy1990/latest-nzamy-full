-- prelude_contract_review_business_between_runs.sql — runs BETWEEN the first
-- and the second 20261103_20 run (contract_review_business_row.test.sql).
-- Asserts the first run wrote the business row at 800, then snapshots every
-- row's xmin and updated_at: the second run must write NOTHING (T3).
do $$
begin
  if (select base_price from public.admin_pricing_catalog where service_id = 'contract-review-business') is distinct from 800::numeric then
    raise exception 'BETWEEN FAIL (a): the first run did not write contract-review-business at 800';
  end if;
  raise notice 'BETWEEN PASS: first run wrote the business row at 800';
end $$;

create table public._crb_snapshot as
  select service_id, xmin::text as row_xmin, updated_at
    from public.admin_pricing_catalog;
