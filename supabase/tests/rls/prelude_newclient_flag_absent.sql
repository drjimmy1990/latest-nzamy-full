-- prelude_newclient_flag_absent.sql — part of the chain of
-- newclient_first_order_flag.test.sql (see its header). Runs after the
-- SECOND 20261103_21 run and both _verify blocks: asserts (c) and (d), keeps
-- the evidence for the test file, then deletes NEWCLIENT so the THIRD run
-- proves (e) — no NEWCLIENT row is ok = t and creates nothing.
do $$
declare
  before_nc record;
  now_nc record;
  before_nz record;
  now_nz record;
begin
  select * into before_nc from public._t_nc_unticked;
  select id, xmin::text as x, metadata, updated_at into now_nc from public.coupons where upper(code) = 'NEWCLIENT';
  if now_nc.metadata->'first_paid_order_only' is distinct from 'false'::jsonb then
    raise exception 'T3 FAIL (c): the second run re-stamped the admin''s un-tick (flag now %)', now_nc.metadata->>'first_paid_order_only';
  end if;
  if now_nc.x is distinct from before_nc.x or now_nc.updated_at is distinct from before_nc.updated_at then
    raise exception 'T3 FAIL (c): the second run rewrote NEWCLIENT (xmin % → %)', before_nc.x, now_nc.x;
  end if;
  raise notice 'T3 PASS (c): the admin''s un-tick survives a re-run (same xmin and updated_at)';

  select * into before_nz from public._t_nz50_before;
  select id, xmin::text as x, metadata, updated_at into now_nz from public.coupons where code = 'NZAMY50';
  if before_nz.id is null then
    raise exception 'T4 FAIL (d): the chain seeds no NZAMY50 row — (d) would prove nothing';
  end if;
  if now_nz.x is distinct from before_nz.x or now_nz.metadata is distinct from before_nz.metadata
     or now_nz.updated_at is distinct from before_nz.updated_at then
    raise exception 'T4 FAIL (d): NZAMY50 was touched (xmin % → %, metadata %)', before_nz.x, now_nz.x, now_nz.metadata;
  end if;
  raise notice 'T4 PASS (d): NZAMY50 untouched (same xmin, metadata and updated_at)';
end $$;

delete from public.coupons where upper(code) = 'NEWCLIENT';
