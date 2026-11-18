-- founder_l7.test.sql — proves 20261127_10 (batch l7, decisions 1, 2, 3, 4):
--   * a PENDING lawyer may reserve and pay; founder_activate parks the seat in
--     pending_verification (counted, never released by the sweep); the admin
--     approval (founder_activate again) activates it; a rejection
--     (founder_revoke) frees it;
--   * a rejected lawyer is still refused before payment;
--   * a paid order is NEVER answered 'full': it is activated past capacity
--     and marked founder_oversold;
--   * founder_seat_summary: test-account / test-mode seats never count,
--     seats_left never negative, overflow for the admin;
--   * the founder_topup_discount_bps setting is there.
--
-- CHAIN (run.sh, postgres:16) — the chain of founder_l2_2026_11_17.test.sql
-- up to 20261124_10, then 20261017_44 (test_accounts), 20261125_50 (demo),
-- then 20261127_10 TWICE (idempotent). From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql \
--     $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261122_10_founder_campaign_nov18.sql \
--     $M/20261124_10_founder_hold_15min_and_library_points.sql \
--     $M/20261017_44_test_accounts_never_listed.sql \
--     $M/20261125_50_demo_accounts.sql \
--     $M/20261127_10_founder_pay_before_verification.sql \
--     $M/20261127_10_founder_pay_before_verification.sql \
--     $T/founder_l7.test.sql
--
-- NEGATIVE CONTROL / RED (must FAIL) — the same chain without the two
-- 20261127_10 files → "T0 FAIL: …".
\set ON_ERROR_STOP on

-- T0 applied, one overload each, service role only
do $$
begin
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure), 'pending_verification') = 0
     or to_regprocedure('public.founder_seat_counted(uuid, uuid)') is null then
    raise exception 'T0 FAIL: 20261127_10 is not applied';
  end if;
  if has_function_privilege('authenticated', 'public.founder_seat_counted(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_seat_summary()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.founder_seat_summary()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.founder_activate(uuid)', 'EXECUTE') then
    raise exception 'T0 FAIL: privileges';
  end if;
  if (select (value)::text from public.platform_settings where key = 'founder_topup_discount_bps') is distinct from '1500' then
    raise exception 'T0 FAIL: founder_topup_discount_bps is not 1500';
  end if;
  raise notice 'T0 PASS: applied, service role only, bps 1500';
end $$;

-- ── Setup: capacity 2, the window around now; lawyers ─────────────────────────
--   c001 pending advocate   c002 rejected advocate   c003 verified advocate
--   c004 verified advocate  c005 verified, test account
update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'sale_paused', false, 'capacity', 2)
 where key = 'founder_campaign';

insert into auth.users (id)
select ('00000000-0000-0000-0000-00000000c00' || i)::uuid from generate_series(1, 5) i;
insert into public.profiles (id, user_type, display_name)
select ('00000000-0000-0000-0000-00000000c00' || i)::uuid, 'lawyer', 'محامٍ ' || i from generate_series(1, 5) i;
insert into public.lawyer_profiles (user_id, verification_status, practice_kind) values
  ('00000000-0000-0000-0000-00000000c001', 'pending',  'advocate'),
  ('00000000-0000-0000-0000-00000000c002', 'rejected', 'advocate'),
  ('00000000-0000-0000-0000-00000000c003', 'verified', 'advocate'),
  ('00000000-0000-0000-0000-00000000c004', 'verified', 'advocate'),
  ('00000000-0000-0000-0000-00000000c005', 'verified', 'advocate');
insert into public.test_accounts (user_id) values ('00000000-0000-0000-0000-00000000c005');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status)
select ('00000000-0000-0000-0000-00000000d00' || i)::uuid, ('00000000-0000-0000-0000-00000000c00' || i)::uuid,
       'membership', 'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated'
  from generate_series(1, 5) i;

-- T1 a rejected lawyer is refused; a pending one reserves
do $$
begin
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000000d002') <> 'not_verified' then
    raise exception 'T1 FAIL: a rejected lawyer was not refused';
  end if;
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000d001') <> 'reserved' then
    raise exception 'T1 FAIL: a pending lawyer could not reserve';
  end if;
  raise notice 'T1 PASS: rejected → not_verified, pending → reserved';
end $$;

-- T2 the pending lawyer pays: the seat waits, is counted, survives the sweep
do $$
declare r text; st text; n int;
begin
  update public.payment_orders set status = 'paid', paid_at = now() where id = '00000000-0000-0000-0000-00000000d001';
  r := public.founder_activate('00000000-0000-0000-0000-00000000d001');
  if r <> 'pending_verification' then raise exception 'T2 FAIL: founder_activate answered %', r; end if;
  select status into st from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000d001';
  if st <> 'pending_verification' then raise exception 'T2 FAIL: seat status %', st; end if;
  if (select metadata ->> 'founder' from public.payment_orders where id = '00000000-0000-0000-0000-00000000d001') <> 'pending_verification' then
    raise exception 'T2 FAIL: metadata.founder not pending_verification';
  end if;
  if exists (select 1 from public.membership_credits c join public.founder_seats s on s.id = c.seat_id
              where s.order_id = '00000000-0000-0000-0000-00000000d001') then
    raise exception 'T2 FAIL: credits granted before verification';
  end if;
  -- idempotent while still pending
  if public.founder_activate('00000000-0000-0000-0000-00000000d001') <> 'pending_verification' then
    raise exception 'T2 FAIL: a second call changed the answer';
  end if;
  -- the sweep never frees it, even with an old reserved_until
  update public.founder_seats set reserved_until = now() - interval '1 day'
   where order_id = '00000000-0000-0000-0000-00000000d001';
  perform public.founder_release_expired();
  perform public.founder_release_order('00000000-0000-0000-0000-00000000d001');
  select status into st from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000d001';
  if st <> 'pending_verification' then raise exception 'T2 FAIL: the sweep released it (%)', st; end if;
  select s.pending into n from public.founder_seat_summary() s;
  if n <> 1 then raise exception 'T2 FAIL: summary pending = %', n; end if;
  -- a second order of the same user is already_member
  insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status)
  values ('00000000-0000-0000-0000-00000000d011', '00000000-0000-0000-0000-00000000c001', 'membership',
          'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated');
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000d011') <> 'already_member' then
    raise exception 'T2 FAIL: a pending member could reserve a second seat';
  end if;
  raise notice 'T2 PASS: pending_verification, counted, no credits, idempotent, survives the sweep, already_member';
end $$;

-- T3 a test account's seat never counts
do $$
declare r text; v record;
begin
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000c005', '00000000-0000-0000-0000-00000000d005') <> 'reserved' then
    raise exception 'T3 FAIL: the test account could not reserve';
  end if;
  update public.payment_orders set status = 'paid', paid_at = now(), live = false where id = '00000000-0000-0000-0000-00000000d005';
  r := public.founder_activate('00000000-0000-0000-0000-00000000d005');
  if r <> 'activated' then raise exception 'T3 FAIL: test seat answered %', r; end if;
  select * into v from public.founder_seat_summary();
  if v.active <> 0 or v.pending <> 1 or v.test_seats <> 1 or v.seats_left <> 1 then
    raise exception 'T3 FAIL: summary active % pending % test % left %', v.active, v.pending, v.test_seats, v.seats_left;
  end if;
  raise notice 'T3 PASS: the test seat is out of the counter';
end $$;

-- T4 capacity 2: c003 takes the last seat; c004 paid with no seat → activated, oversold
do $$
declare r text; v record;
begin
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000c003', '00000000-0000-0000-0000-00000000d003') <> 'reserved' then
    raise exception 'T4 FAIL: c003 could not reserve the last seat';
  end if;
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000c004', '00000000-0000-0000-0000-00000000d004') <> 'full' then
    raise exception 'T4 FAIL: reserve did not answer full before payment';
  end if;
  update public.payment_orders set status = 'paid', paid_at = now(), live = true
   where id in ('00000000-0000-0000-0000-00000000d003', '00000000-0000-0000-0000-00000000d004');
  if public.founder_activate('00000000-0000-0000-0000-00000000d003') <> 'activated' then
    raise exception 'T4 FAIL: c003 not activated';
  end if;
  if (select metadata ? 'founder_oversold' from public.payment_orders where id = '00000000-0000-0000-0000-00000000d003') then
    raise exception 'T4 FAIL: a seat within capacity was marked oversold';
  end if;
  r := public.founder_activate('00000000-0000-0000-0000-00000000d004');
  if r <> 'activated' then raise exception 'T4 FAIL: a paid order past capacity answered %', r; end if;
  if (select (metadata ->> 'founder_oversold')::boolean is not true or metadata ->> 'founder' <> 'activated'
        from public.payment_orders where id = '00000000-0000-0000-0000-00000000d004') then
    raise exception 'T4 FAIL: the oversold order is not marked';
  end if;
  select * into v from public.founder_seat_summary();
  if v.active <> 2 or v.pending <> 1 or v.seats_left <> 0 or v.overflow <> 1 or v.on_sale then
    raise exception 'T4 FAIL: summary active % pending % left % overflow % on_sale %', v.active, v.pending, v.seats_left, v.overflow, v.on_sale;
  end if;
  raise notice 'T4 PASS: never full for a paid order; counter 0, overflow 1';
end $$;

-- T5 the admin approves c001 → activated with credits; nothing else changes
do $$
declare r text; v record;
begin
  update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-00000000c001';
  r := public.founder_activate('00000000-0000-0000-0000-00000000d001');
  if r <> 'activated' then raise exception 'T5 FAIL: approval answered %', r; end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000d001') <> 'active'
     or (select count(*) from public.membership_credits c join public.founder_seats s on s.id = c.seat_id
          where s.order_id = '00000000-0000-0000-0000-00000000d001') <> 3
     or not (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000c001') then
    raise exception 'T5 FAIL: the approved seat is not fully active';
  end if;
  if public.founder_activate('00000000-0000-0000-0000-00000000d001') <> 'already' then
    raise exception 'T5 FAIL: a second activation was not already';
  end if;
  select * into v from public.founder_seat_summary();
  if v.active <> 3 or v.pending <> 0 or v.overflow <> 1 or v.seats_left <> 0 then
    raise exception 'T5 FAIL: summary active % pending % overflow %', v.active, v.pending, v.overflow;
  end if;
  raise notice 'T5 PASS: approval activates the pending seat (credits, badge), counter unchanged';
end $$;

-- T6 a rejected pending lawyer: founder_revoke frees the seat; activate then refuses
do $$
declare r text;
begin
  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000c006');
  insert into public.profiles (id, user_type, display_name) values ('00000000-0000-0000-0000-00000000c006', 'lawyer', 'محامٍ ٦');
  insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
    values ('00000000-0000-0000-0000-00000000c006', 'pending', 'advocate');
  insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, paid_at, live)
  values ('00000000-0000-0000-0000-00000000d006', '00000000-0000-0000-0000-00000000c006', 'membership',
          'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'paid', now(), true);
  -- paid with no reservation at all (the sweep freed it) and over capacity
  r := public.founder_activate('00000000-0000-0000-0000-00000000d006');
  if r <> 'pending_verification' then raise exception 'T6 FAIL: answered %', r; end if;
  if (select (metadata ->> 'founder_oversold')::boolean from public.payment_orders where id = '00000000-0000-0000-0000-00000000d006') is not true then
    raise exception 'T6 FAIL: a pending seat past capacity is not marked oversold';
  end if;
  update public.lawyer_profiles set verification_status = 'rejected' where user_id = '00000000-0000-0000-0000-00000000c006';
  if public.founder_revoke('00000000-0000-0000-0000-00000000d006', 'verification_rejected') <> 'revoked' then
    raise exception 'T6 FAIL: founder_revoke did not revoke the pending seat';
  end if;
  if (select s.pending from public.founder_seat_summary() s) <> 0 then
    raise exception 'T6 FAIL: the revoked seat still counts';
  end if;
  if public.founder_activate('00000000-0000-0000-0000-00000000d006') <> 'already' then
    raise exception 'T6 FAIL: a revoked seat was re-activated';
  end if;
  raise notice 'T6 PASS: rejection revokes the pending seat; it never comes back';
end $$;

-- T7 a paid order of a rejected lawyer is still the refund case (not_verified)
do $$
begin
  update public.payment_orders set status = 'paid', paid_at = now(), live = true where id = '00000000-0000-0000-0000-00000000d002';
  if public.founder_activate('00000000-0000-0000-0000-00000000d002') <> 'not_verified' then
    raise exception 'T7 FAIL: a rejected lawyer''s paid order was not not_verified';
  end if;
  raise notice 'T7 PASS: rejected → not_verified (refund path)';
end $$;

select 'founder_l7: all tests passed' as result;
