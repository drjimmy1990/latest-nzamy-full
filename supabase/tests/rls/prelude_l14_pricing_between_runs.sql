-- prelude_l14_pricing_between_runs.sql — between the two 20261204_20 runs of
-- l14_pricing.test.sql: an admin edits a row the first run stamped. The second
-- run must leave it as the admin set it (a stamped row is never touched again).
\set ON_ERROR_STOP on
update public.admin_pricing_catalog set base_price = 650 where service_id = 'file-lawsuit';
do $$
begin
  if coalesce((select metadata ->> 'owner_l14' from public.admin_pricing_catalog where service_id = 'file-lawsuit'), '') = '' then
    raise exception 'BETWEEN FAIL: the first 20261204_20 run did not stamp file-lawsuit';
  end if;
end $$;
