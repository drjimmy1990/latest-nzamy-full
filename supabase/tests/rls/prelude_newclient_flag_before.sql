-- prelude_newclient_flag_before.sql — part of the chain of
-- newclient_first_order_flag.test.sql (see its header). Runs after
-- 20261030_16 and BEFORE the first 20261103_21 run: asserts the prod-like
-- starting state (NEWCLIENT stamped by 20261030_16, no marker yet) and
-- snapshots NZAMY50 so the test can prove 20261103_21 never touched it.
do $$
begin
  if not exists (select 1 from public.coupons where upper(code) = 'NEWCLIENT') then
    raise exception 'PRELUDE FAIL: the chain seeds no NEWCLIENT row — the stamp would not be exercised';
  end if;
  if exists (select 1 from public.coupons where upper(code) = 'NEWCLIENT' and metadata ? 'first_order_rule') then
    raise exception 'PRELUDE FAIL: NEWCLIENT already carries first_order_rule before 20261103_21';
  end if;
  if not exists (select 1 from public.coupons where upper(code) = 'NEWCLIENT'
                    and metadata ? 'owner_rules' and metadata ? 'rules') then
    raise exception 'PRELUDE FAIL: NEWCLIENT has no owner_rules / rules from 20261026_20 — (b) would prove nothing';
  end if;
  raise notice 'PRELUDE: NEWCLIENT stamped by 20261030_16 (no marker yet), owner_rules and rules present';
end $$;

-- an extra key an admin page would have written (metadata.status), kept by (b)
update public.coupons set metadata = metadata || '{"status":"active"}'::jsonb where upper(code) = 'NEWCLIENT';

drop table if exists public._t_nz50_before;
create table public._t_nz50_before as
  select id, xmin::text as x, metadata, updated_at from public.coupons where code = 'NZAMY50';
