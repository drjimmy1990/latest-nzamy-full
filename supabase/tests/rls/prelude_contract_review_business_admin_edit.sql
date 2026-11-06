-- prelude_contract_review_business_admin_edit.sql — runs AFTER the second and
-- BEFORE the third 20261103_20 run (contract_review_business_row.test.sql).
-- Records how many rows the second run rewrote (T3 expects 0: same xmin and
-- updated_at as the snapshot), then plays an admin who edits the business
-- price to 850; the third run must keep it (T4).
create table public._crb_second_run as
  select count(*)::int as changed
    from public.admin_pricing_catalog c
    full join public._crb_snapshot s on s.service_id = c.service_id
   where s.service_id is null or c.service_id is null
      or c.xmin::text is distinct from s.row_xmin
      or c.updated_at is distinct from s.updated_at;

update public.admin_pricing_catalog
   set base_price = 850, updated_at = now()
 where service_id = 'contract-review-business';
