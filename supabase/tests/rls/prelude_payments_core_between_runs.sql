-- prelude_payments_core_between_runs.sql — runs between the two applications
-- of 20261022_10 in payments_core.test.sql's chain (as postgres).
--   1. asserts the first run seeded billing_company with its 4 null fields and
--      gave lawyer-pro (seeded at 249 by 20260603_phase1_003) the catalog price;
--   2. plays an admin: fills billing_company, moves firm-basic's sort_order;
--   3. takes receipt number 000001.
-- The test then proves the second run kept all three (T8, T5).
do $$
declare
  v jsonb;
  n text;
begin
  select value into v from public.platform_settings where key = 'billing_company';
  if v is distinct from '{"legal_name_ar": null, "cr_number": null, "vat_number": null, "address_ar": null}'::jsonb then
    raise exception 'PRELUDE FAIL: the first run seeded billing_company as %', coalesce(v::text, 'no row');
  end if;
  if (select (price_monthly, price_yearly, tier, audience)::text from public.subscription_plans where id = 'lawyer-pro')
     is distinct from '(399.00,3990.00,pro,lawyer)' then
    raise exception 'PRELUDE FAIL: lawyer-pro after the first run is %',
      (select (price_monthly, price_yearly, tier, audience)::text from public.subscription_plans where id = 'lawyer-pro');
  end if;

  update public.platform_settings
     set value = '{"legal_name_ar": "شركة نظامي للاختبار", "cr_number": "1010000000", "vat_number": "300000000000003", "address_ar": "الرياض"}'::jsonb
   where key = 'billing_company';
  update public.subscription_plans set sort_order = 42 where id = 'firm-basic';

  n := public.next_receipt_number();
  if n <> 'NZ-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-000001' then
    raise exception 'PRELUDE FAIL: the first receipt number is %', n;
  end if;
  raise notice 'PRELUDE: first run checked; billing_company filled, firm-basic sort_order 42, receipt % taken', n;
end $$;

-- the stamp T8 compares against (updated_at must not move on the second run)
create table public._payments_between_runs as
  select id, updated_at from public.subscription_plans
   where id in ('ind-ai','ind-preventive','ind-litigation','lawyer-pro','consultant-independent','firm-basic','firm-enterprise');

-- the constraint oids T8 compares against: a no-op re-run keeps every one
-- (a drop + re-add would give a new oid and re-validate the whole table)
create table public._payments_constraints_between_runs as
  select conname::text, oid from pg_constraint
   where conname in ('subscription_plans_tier_check', 'subscriptions_tier_check',
                     'library_access_grants_source_check', 'library_access_grants_order_id_fkey',
                     'library_access_grants_order_id_key');
