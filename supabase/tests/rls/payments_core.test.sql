-- payments_core.test.sql — proves 20261022_10 (Moyasar payments B1: orders,
-- saved cards, webhook events, receipt numbers, the sold plans, the tier and
-- library-grant CHECKs, billing_company).
--
-- CHAIN (run.sh, postgres:16; stubs.sql — auth.users, public.profiles,
-- public.service_requests, auth.uid() via test.uid, the anon / authenticated /
-- service_role / app_user roles — loads first by itself). The migration runs
-- TWICE, with an admin edit and one receipt number taken between the runs.
-- From the repo root:
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_payments_core_between_runs.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/payments_core.test.sql
-- Why each link:
--   20260603_phase1_003  subscription_plans + subscriptions with the old tier
--       CHECKs (free/ai/pro/corp/max) and the seeded lawyer-pro row (pro,
--       lawyer, 249 / 2,390) — the row the upsert must re-price and keep.
--   20260627             public.platform_settings (runs ONCE: its CREATE
--       TRIGGER is not idempotent).
--   20261019_10          public.library_access_grants (source CHECK without
--       'purchase', no order_id).
--   prelude_payments_core_between_runs.sql  asserts the first run, fills
--       billing_company, moves firm-basic's sort_order, takes receipt 000001.
--
-- NEGATIVE CONTROL (must FAIL) — the chain without the two 20261022_10 files
-- and the between-runs prelude:
--   bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql \
--     $R/payments_core.test.sql
--   → "T0 FAIL: public.payment_orders does not exist (20261022_10 not applied)".
--
-- WHY app_user's DIRECT grants are revoked below: stubs.sql gives app_user
-- `grant all` (and default privileges on every new public table and
-- sequence), but on the live database a signed-in PostgREST request holds
-- privileges only through the `authenticated` role. After the REVOKE, a 42501
-- is the migration's column allow-list answering.
--
-- Actors: U 00000000-0000-0000-0000-00000000c001 (one order, one card),
--         V 00000000-0000-0000-0000-00000000c002 (one order, one card).
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regclass('public.payment_orders') is null then
    raise exception 'T0 FAIL: public.payment_orders does not exist (20261022_10 not applied)';
  end if;
end $$;

-- ── fixtures as postgres (RLS bypassed on purpose) ─────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000c002');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000c001', 'lawyer', 'U'),
  ('00000000-0000-0000-0000-00000000c002', 'individual', 'V');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, metadata) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', 39900, 5985, 45885, 'exclusive', '{"secret": "u"}'),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-00000000c002', 'plan', 'ind-ai', 'monthly', 3391, 509, 3900, 'inclusive', '{"secret": "v"}');
insert into public.payment_methods (user_id, token, brand, last_four, exp_month, exp_year) values
  ('00000000-0000-0000-0000-00000000c001', 'token_u_secret', 'visa', '1111', '12', '2030'),
  ('00000000-0000-0000-0000-00000000c002', 'token_v_secret', 'mada', '2222', '01', '2031');

revoke all on public.payment_orders, public.payment_methods, public.payment_webhook_events from app_user;
revoke all on sequence public.payment_receipt_seq from app_user;

-- T1 an order whose total is not net + vat (or is 0, or negative) is refused
set role service_role;
do $$
declare
  bad text;
begin
  foreach bad in array array[
    $q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
         values ('00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', 39900, 5985, 45884, 'exclusive')$q$,
    $q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
         values ('00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', 0, 0, 0, 'exclusive')$q$,
    $q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
         values ('00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', -100, 200, 100, 'exclusive')$q$,
    $q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status)
         values ('00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', 100, 15, 115, 'exclusive', 'settled')$q$,
    $q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, refunded_halalas)
         values ('00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', 100, 15, 115, 'exclusive', 116)$q$
  ] loop
    begin
      execute bad;
      raise exception 'T1 FAIL: accepted — %', right(bad, 110);
    exception when check_violation then null;
    end;
  end loop;
  insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
    values ('00000000-0000-0000-0000-00000000c001', 'library', 'lib-q1', 'once', 150000, 22500, 172500, 'exclusive');
  raise notice 'T1 PASS: total <> net + vat, total 0, negative net, unknown status and refund > total raise check_violation; a consistent order inserts';
end $$;
reset role;

-- T2 the owner reads their own orders, never another user's, never metadata,
--    and cannot write any order
set role app_user;
do $$
declare
  n    int;
  stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  select count(*) into n from (select id, user_id, item_id, total_halalas, status, receipt_number
                                 from public.payment_orders) s;
  if n <> 2 then
    raise exception 'T2 FAIL: U sees % order(s), expected its own 2', n;
  end if;
  if exists (select 1 from public.payment_orders where user_id is distinct from auth.uid()) then
    raise exception 'T2 FAIL: U sees another user''s order';
  end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c002', true);
  select count(*) into n from (select id from public.payment_orders) s;
  if n <> 1 or (select item_id from public.payment_orders) <> 'ind-ai' then
    raise exception 'T2 FAIL: V sees % order(s), expected its own 1 (ind-ai)', n;
  end if;

  begin
    perform metadata from public.payment_orders;
    raise exception 'T2 FAIL: authenticated selected payment_orders.metadata';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.payment_orders;
    raise exception 'T2 FAIL: authenticated ran select * on payment_orders (metadata is in *)';
  exception when insufficient_privilege then null;
  end;

  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  foreach stmt in array array[
    $q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode)
         values ('00000000-0000-0000-0000-00000000c001', 'plan', 'lawyer-pro', 'monthly', 100, 15, 115, 'exclusive')$q$,
    $q$update public.payment_orders set status = 'paid' where id = '00000000-0000-0000-0000-0000000d0001'$q$,
    $q$delete from public.payment_orders where id = '00000000-0000-0000-0000-0000000d0001'$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T2 FAIL: allowed — %', left(stmt, 90);
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'T2 PASS: U reads its 2 orders, V its 1; metadata (and select *) raise 42501; INSERT / UPDATE status = paid / DELETE raise 42501';
end $$;
reset role;

-- T3 saved cards: own rows only, never the token, no session write; webhook
--    events: nothing at all for a session
set role app_user;
do $$
declare
  n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  select count(*) into n from (select id, brand, last_four, exp_month, exp_year, status from public.payment_methods) s;
  if n <> 1 or (select last_four from public.payment_methods) <> '1111' then
    raise exception 'T3 FAIL: U sees % card(s), expected its own 1 (1111)', n;
  end if;
  begin
    perform token from public.payment_methods;
    raise exception 'T3 FAIL: authenticated selected payment_methods.token';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.payment_methods set status = 'deleted' where user_id = auth.uid();
    raise exception 'T3 FAIL: authenticated updated a card';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.payment_webhook_events;
    raise exception 'T3 FAIL: authenticated read payment_webhook_events';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.payment_webhook_events (event_id) values ('evt_forged');
    raise exception 'T3 FAIL: authenticated inserted a webhook event';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: U reads its 1 card without the token (token raises 42501), cannot update a card; webhook events read / insert raise 42501';
end $$;
reset role;

-- T4 a guest (anon) — and PUBLIC — hold nothing on the 3 tables, the sequence
--    or the function
do $$
declare
  r   text;
  tbl text;
  p   text;
  col text;
begin
  foreach r in array array['anon', 'public'] loop
    foreach tbl in array array['payment_orders', 'payment_methods', 'payment_webhook_events'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, 'public.' || tbl, p) then
          raise exception 'T4 FAIL: % holds % on %', r, p, tbl;
        end if;
      end loop;
      for col in select attname::text from pg_attribute
                  where attrelid = ('public.' || tbl)::regclass and attnum > 0 and not attisdropped loop
        if has_column_privilege(r, 'public.' || tbl, col, 'SELECT, INSERT, UPDATE, REFERENCES') then
          raise exception 'T4 FAIL: % holds a column privilege on %.%', r, tbl, col;
        end if;
      end loop;
    end loop;
    if has_sequence_privilege(r, 'public.payment_receipt_seq', 'USAGE, SELECT, UPDATE') then
      raise exception 'T4 FAIL: % holds a privilege on payment_receipt_seq', r;
    end if;
    if has_function_privilege(r, 'public.next_receipt_number()', 'EXECUTE') then
      raise exception 'T4 FAIL: % can EXECUTE next_receipt_number()', r;
    end if;
  end loop;
end $$;
set role anon;
do $$
begin
  begin
    perform count(*) from public.payment_orders;
    raise exception 'T4 FAIL: anon read payment_orders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.payment_methods;
    raise exception 'T4 FAIL: anon read payment_methods';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.next_receipt_number();
    raise exception 'T4 FAIL: anon took a receipt number';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 PASS: anon and PUBLIC hold no table, column, sequence or function privilege; anon reads and next_receipt_number() raise 42501';
end $$;
reset role;

-- T5 next_receipt_number(): denied to a signed-in session; the service role
--    gets NZ-<Riyadh year>-<6 digits>, increasing, and the second run of the
--    migration did not reset the sequence (the prelude took 000001)
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  begin
    perform public.next_receipt_number();
    raise exception 'T5 FAIL: authenticated took a receipt number';
  exception when insufficient_privilege then null;
  end;
  begin
    perform nextval('public.payment_receipt_seq');
    raise exception 'T5 FAIL: authenticated advanced payment_receipt_seq';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role service_role;
do $$
declare
  a text;
  b text;
  y text := to_char(now() at time zone 'Asia/Riyadh', 'YYYY');
begin
  a := public.next_receipt_number();
  b := public.next_receipt_number();
  if a !~ '^NZ-[0-9]{4}-[0-9]{6}$' or b !~ '^NZ-[0-9]{4}-[0-9]{6}$' then
    raise exception 'T5 FAIL: receipt numbers % / % are not NZ-YYYY-NNNNNN', a, b;
  end if;
  if a <> 'NZ-' || y || '-000002' or b <> 'NZ-' || y || '-000003' then
    raise exception 'T5 FAIL: expected NZ-%-000002 then NZ-%-000003 (000001 taken between the runs), got % / %', y, y, a, b;
  end if;
  update public.payment_orders set status = 'paid', paid_at = now(), receipt_number = public.next_receipt_number()
   where id = '00000000-0000-0000-0000-0000000d0001';
  if (select receipt_number from public.payment_orders where id = '00000000-0000-0000-0000-0000000d0001') <> 'NZ-' || y || '-000004' then
    raise exception 'T5 FAIL: the claim update did not stamp NZ-%-000004', y;
  end if;
  begin
    update public.payment_orders set receipt_number = 'NZ-' || y || '-000004'
     where id = '00000000-0000-0000-0000-0000000d0002';
    raise exception 'T5 FAIL: a duplicate receipt number was accepted';
  exception when unique_violation then null;
  end;
  raise notice 'T5 PASS: authenticated is denied the function and the sequence; service_role gets %, % then 000004 inside an UPDATE; a duplicate receipt number raises unique_violation', a, b;
end $$;
reset role;

-- T6 tiers: a subscription with tier enterprise (and shield) inserts; an
--    unknown tier is still refused; the sold plans carry the ruling's tiers
do $$
begin
  insert into public.subscriptions (user_id, plan_id, tier) values
    ('00000000-0000-0000-0000-00000000c001', 'firm-enterprise', 'enterprise'),
    ('00000000-0000-0000-0000-00000000c002', 'ind-ai', 'shield');
  begin
    insert into public.subscriptions (user_id, plan_id, tier)
      values ('00000000-0000-0000-0000-00000000c001', 'firm-basic', 'gold');
    raise exception 'T6 FAIL: tier gold accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.subscription_plans (id, tier, audience, name_ar) values ('x-gold', 'gold', 'firm', 'x');
    raise exception 'T6 FAIL: plan tier gold accepted';
  exception when check_violation then null;
  end;
  if (select string_agg(id || ':' || tier || ':' || audience || ':' || price_monthly || ':' || price_yearly || ':' || name_ar, ' | ' order by id)
        from public.subscription_plans
       where id in ('ind-ai','ind-preventive','ind-litigation','lawyer-pro','consultant-independent','firm-basic','firm-enterprise'))
     is distinct from
     'consultant-independent:pro:provider:399.00:3990.00:المستشار القانوني المستقل'
     || ' | firm-basic:corp:firm:990.00:9900.00:مكتب المحاماة'
     || ' | firm-enterprise:enterprise:firm:1490.00:14900.00:شركة المحاماة'
     || ' | ind-ai:ai:individual:39.00:390.00:الباقة الذكية'
     || ' | ind-litigation:max:individual:399.00:3990.00:التأمين القانوني'
     || ' | ind-preventive:pro:individual:149.00:1490.00:الباقة الوقائية'
     || ' | lawyer-pro:pro:lawyer:399.00:3990.00:المحامي المحترف' then
    raise exception 'T6 FAIL: the sold plans are %',
      (select string_agg(id || ':' || tier || ':' || audience || ':' || price_monthly || ':' || price_yearly || ':' || name_ar, ' | ' order by id)
         from public.subscription_plans
        where id in ('ind-ai','ind-preventive','ind-litigation','lawyer-pro','consultant-independent','firm-basic','firm-enterprise'));
  end if;
  raise notice 'T6 PASS: subscriptions take tier enterprise and shield, refuse gold (plans too); the 7 sold plans carry ruling 1 tiers, audiences, names and catalog prices (lawyer-pro re-priced from 249)';
end $$;

-- T7 a library grant bought by an order: source purchase + order_id inserts;
--    an unknown order, and a second grant for the same order, are refused
set role service_role;
do $$
begin
  insert into public.library_access_grants (user_id, plan_ref, source, ends_at, order_id)
    values ('00000000-0000-0000-0000-00000000c002', 'lib-q1', 'purchase', now() + interval '90 days',
            '00000000-0000-0000-0000-0000000d0002');
  begin
    insert into public.library_access_grants (user_id, plan_ref, source, ends_at, order_id)
      values ('00000000-0000-0000-0000-00000000c002', 'lib-q1', 'purchase', now() + interval '90 days',
              '00000000-0000-0000-0000-0000000d0fff');
    raise exception 'T7 FAIL: a grant for an unknown order was accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.library_access_grants (user_id, plan_ref, source, ends_at, order_id)
      values ('00000000-0000-0000-0000-00000000c002', 'lib-q2', 'purchase', now() + interval '180 days',
              '00000000-0000-0000-0000-0000000d0002');
    raise exception 'T7 FAIL: a second grant for the same order was accepted';
  exception when unique_violation then null;
  end;
  insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
    values ('00000000-0000-0000-0000-00000000c002', 'lib-admin', 'founder_campaign', now() + interval '1 day');
  raise notice 'T7 PASS: source purchase with an order_id inserts; an unknown order raises 23503; a second grant for one order raises 23505; the old sources still insert';
end $$;
reset role;

-- T8 the second run changed nothing: one CHECK per widened column, one FK and
--    one UNIQUE on order_id, the policies and indexes once, billing_company and
--    firm-basic's sort_order as the admin left them, no plan row touched
do $$
declare
  t   text;
  att int2;
begin
  foreach t in array array['subscription_plans', 'subscriptions'] loop
    select attnum into att from pg_attribute where attrelid = ('public.' || t)::regclass and attname = 'tier';
    if (select count(*) from pg_constraint where conrelid = ('public.' || t)::regclass
         and contype = 'c' and conkey = array[att]) <> 1 then
      raise exception 'T8 FAIL: % has more or less than one CHECK on tier', t;
    end if;
  end loop;
  if (select count(*) from pg_constraint where conrelid = 'public.library_access_grants'::regclass
       and conname = 'library_access_grants_source_check') <> 1 then
    raise exception 'T8 FAIL: library_access_grants_source_check is missing or renamed';
  end if;
  select attnum into att from pg_attribute where attrelid = 'public.library_access_grants'::regclass and attname = 'order_id';
  if (select count(*) from pg_constraint where conrelid = 'public.library_access_grants'::regclass
       and contype = 'f' and conkey = array[att]) <> 1
     or (select count(*) from pg_constraint where conrelid = 'public.library_access_grants'::regclass
          and contype = 'u' and conkey = array[att]) <> 1 then
    raise exception 'T8 FAIL: expected exactly one FK and one UNIQUE on library_access_grants.order_id';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.library_access_grants'::regclass
       and contype = 'f' and conkey = array[att] and confrelid = 'public.payment_orders'::regclass
       and confdeltype = 'n') <> 1 then
    raise exception 'T8 FAIL: library_access_grants.order_id is not ON DELETE SET NULL to payment_orders';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public'
       and tablename in ('payment_orders', 'payment_methods', 'payment_webhook_events')) <> 2 then
    raise exception 'T8 FAIL: expected exactly 2 policies on the payment tables';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'public' and tablename = 'payment_orders'
       and indexname in ('payment_orders_user_created_idx', 'payment_orders_initiated_idx')) <> 2
     or (select indexdef from pg_indexes where indexname = 'payment_orders_initiated_idx') !~ 'WHERE \(status = ''initiated''::text\)' then
    raise exception 'T8 FAIL: the (user_id, created_at desc) and the partial initiated indexes are not both there';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.payment_orders'::regclass and not tgisinternal) <> 1 then
    raise exception 'T8 FAIL: expected exactly one trigger (updated_at) on payment_orders';
  end if;
  if (select count(*) from public._payments_constraints_between_runs) <> 5 then
    raise exception 'T8 FAIL: the prelude recorded % of the 5 constraint oids', (select count(*) from public._payments_constraints_between_runs);
  end if;
  if exists (select 1 from public._payments_constraints_between_runs b
              where not exists (select 1 from pg_constraint c where c.oid = b.oid and c.conname = b.conname)) then
    raise exception 'T8 FAIL: the second run dropped and re-added %',
      (select string_agg(b.conname, ', ') from public._payments_constraints_between_runs b
        where not exists (select 1 from pg_constraint c where c.oid = b.oid and c.conname = b.conname));
  end if;
  if (select value ->> 'legal_name_ar' from public.platform_settings where key = 'billing_company') is distinct from 'شركة نظامي للاختبار' then
    raise exception 'T8 FAIL: the second run reset billing_company';
  end if;
  if (select sort_order from public.subscription_plans where id = 'firm-basic') <> 42 then
    raise exception 'T8 FAIL: the second run reset firm-basic''s sort_order';
  end if;
  if exists (select 1 from public._payments_between_runs b join public.subscription_plans p using (id)
              where p.updated_at is distinct from b.updated_at) then
    raise exception 'T8 FAIL: the second run touched a plan row (updated_at moved)';
  end if;
  if (select count(*) from public.subscription_plans) <> 24 then
    raise exception 'T8 FAIL: expected 24 plan rows (18 seeded + 6 new; lawyer-pro was already there), got %',
      (select count(*) from public.subscription_plans);
  end if;
  raise notice 'T8 PASS: after two runs — one CHECK per tier column, one named source CHECK, one FK (SET NULL) + one UNIQUE on order_id, 2 policies, 2 indexes, 1 trigger; the 5 constraints kept their oids (not dropped + re-added); billing_company, sort_order and every plan row as left between the runs';
end $$;

-- T9 deleting a GoTrue user is never blocked: the order stays with a null
--    user_id (and its receipt number); the cards and grants go with the user
do $$
begin
  delete from auth.users where id = '00000000-0000-0000-0000-00000000c002';
  if (select user_id from public.payment_orders where id = '00000000-0000-0000-0000-0000000d0002') is not null then
    raise exception 'T9 FAIL: the deleted user''s order still carries a user_id';
  end if;
  if exists (select 1 from public.payment_methods where user_id = '00000000-0000-0000-0000-00000000c002')
     or exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-00000000c002') then
    raise exception 'T9 FAIL: the deleted user''s cards or grants survived';
  end if;
  delete from auth.users where id = '00000000-0000-0000-0000-00000000c001';
  if (select count(*) from public.payment_orders where user_id is null) <> 3 then
    raise exception 'T9 FAIL: expected all 3 orders kept with a null user_id';
  end if;
  raise notice 'T9 PASS: deleting both users succeeds; their 3 orders stay with user_id null; cards and library grants are removed';
end $$;
