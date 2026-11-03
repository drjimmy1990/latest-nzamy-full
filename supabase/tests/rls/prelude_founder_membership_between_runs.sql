-- prelude_founder_membership_between_runs.sql — runs BETWEEN the two
-- 20261101_10 runs of founder_membership.test.sql's chain.
--   1. Asserts the first run: the setting gained capacity 1096 and
--      sale_paused false, starts_on moved from the 20261021_50 seed
--      2026-10-25 to 2026-11-01, ends_on and library_days were kept; the kind
--      CHECK allows 'membership'.
--   2. Plays an admin editing the setting (capacity 50, sale paused, a later
--      start). The second run must keep all three (T1).
--   3. Plays the self-host restore's default privileges: stray EXECUTE and
--      write grants to the API roles, which the second run must take back
--      (T18).
\set ON_ERROR_STOP on

do $$
declare
  v   jsonb;
  def text;
begin
  select value into v from public.platform_settings where key = 'founder_campaign';
  if v -> 'capacity' is distinct from '1096'::jsonb
     or v -> 'sale_paused' is distinct from 'false'::jsonb
     or v ->> 'starts_on' is distinct from '2026-11-01'
     or v ->> 'ends_on' is distinct from '2027-01-25'
     or v -> 'library_days' is distinct from '90'::jsonb then
    raise exception 'BETWEEN FAIL: the first run left founder_campaign = %', v;
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.payment_orders'::regclass and conname = 'payment_orders_kind_check';
  if position('''membership''' in coalesce(def, '')) = 0 then
    raise exception 'BETWEEN FAIL: payment_orders_kind_check does not allow membership: %', def;
  end if;
  raise notice 'BETWEEN PASS: first run merged capacity 1096 / sale_paused false, moved starts_on to 2026-11-01, kept ends_on / library_days; kind CHECK allows membership';
end $$;

update public.platform_settings
   set value = value || '{"capacity": 50, "sale_paused": true, "starts_on": "2026-11-03"}'::jsonb
 where key = 'founder_campaign';

grant execute on function public.founder_reserve_seat(uuid, uuid) to anon, authenticated;
grant execute on function public.founder_activate(uuid) to public;
grant insert, update, delete on public.founder_seats to authenticated;
grant insert, update on public.membership_credits to authenticated;
grant select, insert on public.membership_credit_uses to authenticated;
