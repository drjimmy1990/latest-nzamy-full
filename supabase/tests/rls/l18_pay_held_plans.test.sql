-- l18_pay_held_plans.test.sql — proves 20261208_32 (batch l18-pay, owner ٢٣٩):
-- my_licence_held_orders() lists the CALLER's own paid professional-plan
-- orders held for the licence (metadata.licence_pending), nothing of another
-- account and no other metadata; anon cannot call it; payment_orders.metadata
-- stays unreadable by a session.
--
-- CHAIN (run.sh, postgres:16; stubs.sql first by itself). The migration runs
-- TWICE; the _verify block before (prints f) and after. From the repo root:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l18_held.sql
--   sed -n '/^-- >>> verify:l18_pay_held/,/^-- <<< verify:l18_pay_held/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     "$B" $M/20261208_32_l18_held_plan_orders.sql $M/20261208_32_l18_held_plan_orders.sql "$B" \
--     $R/l18_pay_held_plans.test.sql
-- NEGATIVE CONTROL: without the two 20261208_32 files → "T0 FAIL".

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000239a1'), ('00000000-0000-0000-0000-0000000239a2');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000239a1', 'lawyer', 'h1'), ('00000000-0000-0000-0000-0000000239a2', 'lawyer', 'h2');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, receipt_number, paid_at, metadata) values
  ('23900000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000239a1', 'plan', 'lawyer-pro', 'yearly', 399000, 59850, 458850, 'exclusive', 'paid', 'NZ-H-1', now(), '{"licence_pending": true, "secret": "x"}'),
  ('23900000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000239a1', 'plan', 'lawyer-pro', 'yearly', 399000, 59850, 458850, 'exclusive', 'paid', 'NZ-H-2', now(), '{"licence_pending": false}'),
  ('23900000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000239a1', 'library', 'lib-q1', 'once', 199000, 29850, 228850, 'exclusive', 'paid', 'NZ-H-3', now(), '{"licence_pending": true}'),
  ('23900000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000239a2', 'plan', 'lawyer-pro', 'yearly', 399000, 59850, 458850, 'exclusive', 'paid', 'NZ-H-4', now(), '{"licence_pending": true}'),
  ('23900000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-0000000239a1', 'plan', 'lawyer-pro', 'yearly', 399000, 59850, 458850, 'exclusive', 'created', null, null, '{"licence_pending": true}');

do $$ begin
  if to_regprocedure('public.my_licence_held_orders()') is null then raise exception 'T0 FAIL: 20261208_32 not applied'; end if;
  raise notice 'T0 PASS: my_licence_held_orders() exists';
end $$;

select set_config('test.uid', '00000000-0000-0000-0000-0000000239a1', false);
set role authenticated;
do $$
declare n int; ids text;
begin
  select count(*), string_agg(id::text, ',') into n, ids from public.my_licence_held_orders();
  if n <> 1 or ids <> '23900000-0000-0000-0000-000000000001' then raise exception 'T1 FAIL: h1 sees % (%)', n, ids; end if;
  begin
    perform metadata from public.payment_orders;
    raise exception 'T1 FAIL: a session read payment_orders.metadata';
  exception when insufficient_privilege then null; end;
  raise notice 'T1 PASS: only the caller''s own paid, held PLAN order (not a released, unpaid, library or other account''s one); metadata stays unreadable';
end $$;
reset role;
set role anon;
do $$ begin
  perform * from public.my_licence_held_orders();
  raise exception 'T2 FAIL: anon called my_licence_held_orders';
exception when insufficient_privilege then raise notice 'T2 PASS: anon cannot EXECUTE it'; end $$;
reset role;
