-- founder_membership.test.sql — proves 20261101_10 (lawyer founder membership,
-- P3 Task 1): seats, credits and activation in SQL.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The founder
-- chain of founder_badges_unpaid_removed.test.sql up to 20261026_01 (the
-- signup trigger is GONE, so inserting a lawyer gives no badge and no grant),
-- then the payments chain of payments_fulfill_once.test.sql, ai_runs and the
-- library grant functions, then the migration TWICE with an admin edit and
-- stray grants between the runs. From the repo root, in Git Bash:
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
--     $T/prelude_founder_membership_between_runs.sql \
--     $M/20261101_10_founder_membership.sql \
--     $T/founder_membership.test.sql
-- Why each link:
--   prelude_lawyer_profiles_live … 20261021_50  what 20261021_50 needs
--       (see founder_campaign.test.sql): lawyer_profiles with the column lock,
--       platform_settings, library_access_grants, founder_campaign_active()
--       and lawyer_profiles.founder_badge.
--   20261026_01   drops the signup trigger (live since 26 Oct). Without it
--       every lawyer inserted below would get a badge and a 90-day
--       lib-founder grant, and T6's badge / 365-day asserts would prove
--       nothing.
--   20260603_phase1_003, 20261022_10  payment_orders (and what it needs);
--       prelude_points_lots_fixture + 20261022_20 the batch's real order;
--       20261022_30 merge_payment_order_metadata().
--   20261027_10   ai_runs (membership_credit_uses.run_id) and ai_fail_run.
--   20261030_65   library_grant_access / library_grant_revoke.
--   prelude_founder_membership_between_runs.sql  asserts the first run,
--       edits the setting as an admin would, adds stray grants.
--
-- ONE-RUN chain (must pass too): the same chain with 20261101_10 once and no
-- between-runs prelude; T1 then checks the merged defaults instead of the
-- admin's edit, and T18 checks the first run's own revokes.
--
-- NEGATIVE CONTROL / RED (must FAIL) — the chain without the two 20261101_10
-- files and the between-runs prelude:
--   → "T0 FAIL: public.founder_reserve_seat(uuid, uuid) does not exist (20261101_10 not applied)".
--
-- Every DO block is one transaction, so now() is one instant inside it: the
-- functions and the assertions of a block see the same clock. T17 races two
-- real sessions through dblink (contrib, shipped in postgres:16-alpine).
--
-- Actors (lawyers unless noted; orders are kind 'membership', item
-- 'lawyer-founder-2026', status 'initiated' until a test marks them paid):
--   L1 …fd01 retry, activate, revoke · L2 …fd02 release_order · L3 …fd03
--   full, then paid-but-reserved · L4 …fd04 expired + free seat · L5 …fd05
--   expired + seats full · L6 …fd06 licence suspended before activation ·
--   L7 …fd07 order on a released seat, release_expired · U1 …fd09 pending
--   licence · R1 / R2 …fd0a / …fd0b the race.
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.founder_reserve_seat(uuid, uuid)') is null then
    raise exception 'T0 FAIL: public.founder_reserve_seat(uuid, uuid) does not exist (20261101_10 not applied)';
  end if;
end $$;

-- T1 the setting: after ONE run the merged defaults; after the two-run chain
-- (capacity 50 = the between-runs prelude's edit) the admin's edit, kept by
-- the second run. The CHECK keeps the old kinds.
do $$
declare
  v   jsonb;
  def text;
  k   text;
begin
  select value into v from public.platform_settings where key = 'founder_campaign';
  if v -> 'capacity' = '50'::jsonb then
    if v -> 'sale_paused' is distinct from 'true'::jsonb
       or v ->> 'starts_on' is distinct from '2026-11-03'
       or v ->> 'ends_on' is distinct from '2027-01-25'
       or v -> 'library_days' is distinct from '90'::jsonb then
      raise exception 'T1 FAIL: the second run did not keep the admin''s edit: %', v;
    end if;
    raise notice 'T1 (two runs): the re-run kept the admin''s capacity 50 / sale_paused / starts_on 2026-11-03';
  elsif v -> 'capacity' is distinct from '1096'::jsonb
     or v -> 'sale_paused' is distinct from 'false'::jsonb
     or v ->> 'starts_on' is distinct from '2026-11-01'
     or v ->> 'ends_on' is distinct from '2027-01-25'
     or v -> 'library_days' is distinct from '90'::jsonb then
    raise exception 'T1 FAIL: one run left founder_campaign = %', v;
  else
    raise notice 'T1 (one run): capacity 1096, sale_paused false, starts_on 2026-11-01, ends_on / library_days kept';
  end if;
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.payment_orders'::regclass and conname = 'payment_orders_kind_check';
  foreach k in array array['plan', 'library', 'topup', 'service', 'membership'] loop
    if position(quote_literal(k) in coalesce(def, '')) = 0 then
      raise exception 'T1 FAIL: payment_orders_kind_check does not allow %: %', k, def;
    end if;
  end loop;
  if (select count(*) from pg_constraint
       where conrelid = 'public.payment_orders'::regclass and contype = 'c'
         and pg_get_constraintdef(oid) ilike '%kind%') <> 1 then
    raise exception 'T1 FAIL: expected exactly one CHECK on payment_orders.kind';
  end if;
  raise notice 'T1 PASS: setting as expected; kind CHECK = plan, library, topup, service, membership';
end $$;

-- ── Setup ────────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fd01'), ('00000000-0000-0000-0000-00000000fd02'),
  ('00000000-0000-0000-0000-00000000fd03'), ('00000000-0000-0000-0000-00000000fd04'),
  ('00000000-0000-0000-0000-00000000fd05'), ('00000000-0000-0000-0000-00000000fd06'),
  ('00000000-0000-0000-0000-00000000fd07'), ('00000000-0000-0000-0000-00000000fd09'),
  ('00000000-0000-0000-0000-00000000fd0a'), ('00000000-0000-0000-0000-00000000fd0b');
insert into public.profiles (id, user_type, display_name)
  select id, 'lawyer', 'محامٍ ' || right(id::text, 2) from auth.users
   where id::text like '00000000-0000-0000-0000-00000000fd%';
insert into public.lawyer_profiles (user_id, verification_status)
  select id, case when id = '00000000-0000-0000-0000-00000000fd09' then 'pending' else 'verified' end
    from auth.users where id::text like '00000000-0000-0000-0000-00000000fd%';

create function pg_temp.mk_order(p_id uuid, p_user uuid) returns void language sql as $$
  insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                     total_halalas, vat_mode, status)
  values (p_id, p_user, 'membership', 'lawyer-founder-2026', 'once', 299600, 44940, 344540,
          'exclusive', 'initiated');
$$;
create function pg_temp.pay(p_id uuid) returns void language sql as $$
  update public.payment_orders set status = 'paid', paid_at = now() where id = p_id;
$$;
create function pg_temp.cap(p_capacity int) returns void language sql as $$
  update public.platform_settings
     set value = value || jsonb_build_object('capacity', p_capacity)
   where key = 'founder_campaign';
$$;

-- orders: …fe<lawyer><n>
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe11', '00000000-0000-0000-0000-00000000fd01');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe12', '00000000-0000-0000-0000-00000000fd01');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe13', '00000000-0000-0000-0000-00000000fd01');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe21', '00000000-0000-0000-0000-00000000fd02');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe22', '00000000-0000-0000-0000-00000000fd02');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe31', '00000000-0000-0000-0000-00000000fd03');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe32', '00000000-0000-0000-0000-00000000fd03');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe41', '00000000-0000-0000-0000-00000000fd04');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe51', '00000000-0000-0000-0000-00000000fd05');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe61', '00000000-0000-0000-0000-00000000fd06');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe71', '00000000-0000-0000-0000-00000000fd07');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fe91', '00000000-0000-0000-0000-00000000fd09');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000fea1', '00000000-0000-0000-0000-00000000fd0a');
select pg_temp.mk_order('00000000-0000-0000-0000-00000000feb1', '00000000-0000-0000-0000-00000000fd0b');

-- the window around the container's Riyadh date; capacity 2; on sale
update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'capacity', 2, 'sale_paused', false)
 where key = 'founder_campaign';

-- T2 an unverified licence gets not_verified and no seat
do $$
declare r text;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd09', '00000000-0000-0000-0000-00000000fe91');
  if r is distinct from 'not_verified' then
    raise exception 'T2 FAIL: unverified reserve returned %', r;
  end if;
  if exists (select 1 from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd09') then
    raise exception 'T2 FAIL: an unverified lawyer holds a seat';
  end if;
  raise notice 'T2 PASS: pending licence → not_verified, no seat';
end $$;

-- T3 reserved, the retry MOVES the same seat, reserved, full
do $$
declare
  r       text;
  seat1   uuid;
  s       record;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fe11');
  if r is distinct from 'reserved' then raise exception 'T3 FAIL: L1 first reserve returned %', r; end if;
  select id into seat1 from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe11';
  if seat1 is null then raise exception 'T3 FAIL: no seat row for the first order'; end if;
  -- an older reservation, so the refresh is visible
  update public.founder_seats set reserved_until = now() + interval '5 minutes' where id = seat1;

  -- the card was declined; the buyer retries with a new order
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fe12');
  if r is distinct from 'reserved' then raise exception 'T3 FAIL: the retry returned % (must be reserved, never already_member)', r; end if;
  if (select count(*) from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd01') <> 1 then
    raise exception 'T3 FAIL: the retry took a second seat';
  end if;
  select * into s from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd01';
  if s.id <> seat1 or s.order_id <> '00000000-0000-0000-0000-00000000fe12' or s.status <> 'reserved'
     or s.reserved_until <> now() + interval '2 hours' or s.campaign_id <> 'founder-2026' then
    raise exception 'T3 FAIL: the retry did not move the same seat to the new order: %', row_to_json(s);
  end if;

  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fe21');
  if r is distinct from 'reserved' then raise exception 'T3 FAIL: L2 reserve returned %', r; end if;
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd03', '00000000-0000-0000-0000-00000000fe31');
  if r is distinct from 'full' then raise exception 'T3 FAIL: L3 reserve with 2/2 taken returned %', r; end if;
  if exists (select 1 from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd03') then
    raise exception 'T3 FAIL: full still wrote a seat';
  end if;
  raise notice 'T3 PASS: reserved; retry moved the same seat to the new order (2h refreshed); reserved; full';
end $$;

-- T4 release_order frees the seat at once; a third lawyer then gets it
do $$
declare r text; b boolean;
begin
  b := public.founder_release_order('00000000-0000-0000-0000-00000000fe21');
  if b is distinct from true then raise exception 'T4 FAIL: release_order returned %', b; end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe21') <> 'released' then
    raise exception 'T4 FAIL: the seat is not released';
  end if;
  b := public.founder_release_order('00000000-0000-0000-0000-00000000fe21');
  if b is distinct from false then raise exception 'T4 FAIL: a second release_order returned %', b; end if;
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd03', '00000000-0000-0000-0000-00000000fe31');
  if r is distinct from 'reserved' then raise exception 'T4 FAIL: L3 reserve after the release returned %', r; end if;
  raise notice 'T4 PASS: release_order → true (then false); L3 reserved the freed seat';
end $$;

-- T5 activate an unpaid order → not_paid, nothing changes
do $$
declare r text;
begin
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe12');
  if r is distinct from 'not_paid' then raise exception 'T5 FAIL: activate unpaid returned %', r; end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe12') <> 'reserved'
     or exists (select 1 from public.membership_credits where user_id = '00000000-0000-0000-0000-00000000fd01') then
    raise exception 'T5 FAIL: an unpaid activate changed the seat or wrote credits';
  end if;
  raise notice 'T5 PASS: unpaid → not_paid';
end $$;

-- T6 paid → activated: seat, two credits, library grant, badge
select pg_temp.pay('00000000-0000-0000-0000-00000000fe12');
do $$
declare
  r text;
  s record;
  g record;
begin
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe12');
  if r is distinct from 'activated' then raise exception 'T6 FAIL: activate returned %', r; end if;
  select * into s from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe12';
  if s.status <> 'active' or s.activated_at <> now() or s.ends_at <> now() + interval '12 months' then
    raise exception 'T6 FAIL: seat %', row_to_json(s);
  end if;
  if (select count(*) from public.membership_credits where seat_id = s.id) <> 2
     or not exists (select 1 from public.membership_credits where seat_id = s.id and kind = 'drafting_work'
                     and total = 6 and remaining = 6 and ends_at = s.ends_at
                     and user_id = '00000000-0000-0000-0000-00000000fd01')
     or not exists (select 1 from public.membership_credits where seat_id = s.id and kind = 'independent_output'
                     and total = 1 and remaining = 1 and ends_at = s.ends_at
                     and user_id = '00000000-0000-0000-0000-00000000fd01') then
    raise exception 'T6 FAIL: credits %', (select json_agg(c) from public.membership_credits c where seat_id = s.id);
  end if;
  select * into g from public.library_access_grants where order_id = '00000000-0000-0000-0000-00000000fe12';
  if g.id is null or g.plan_ref <> 'lib-founder' or g.source <> 'purchase'
     or g.user_id <> '00000000-0000-0000-0000-00000000fd01'
     or g.ends_at <> now() + interval '365 days' or g.revoked_at is not null then
    raise exception 'T6 FAIL: library grant %', row_to_json(g);
  end if;
  if (select reason from public.library_access_grant_admin where grant_id = g.id) is distinct from 'founder membership' then
    raise exception 'T6 FAIL: the grant reason is not ''founder membership''';
  end if;
  if (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000fd01') is distinct from true then
    raise exception 'T6 FAIL: badge not set';
  end if;
  raise notice 'T6 PASS: activated — seat active for 12 months, credits 6 + 1, lib-founder grant 365 days, badge true';
end $$;

-- T7 a second activate → already, row counts unchanged
do $$
declare
  r text;
  before_n bigint;
begin
  before_n := (select count(*) from public.founder_seats) * 1000000
            + (select count(*) from public.membership_credits) * 1000
            + (select count(*) from public.library_access_grants);
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe12');
  if r is distinct from 'already' then raise exception 'T7 FAIL: second activate returned %', r; end if;
  if before_n <> (select count(*) from public.founder_seats) * 1000000
               + (select count(*) from public.membership_credits) * 1000
               + (select count(*) from public.library_access_grants) then
    raise exception 'T7 FAIL: the second activate wrote rows';
  end if;
  raise notice 'T7 PASS: second activate → already, nothing written';
end $$;

-- T8 an active member reserving again → already_member
do $$
declare r text;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd01', '00000000-0000-0000-0000-00000000fe13');
  if r is distinct from 'already_member' then raise exception 'T8 FAIL: member reserve returned %', r; end if;
  if exists (select 1 from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe13') then
    raise exception 'T8 FAIL: a seat was written for the member''s new order';
  end if;
  raise notice 'T8 PASS: active member → already_member';
end $$;

-- T9 a reservation whose order is already PAID is not moved (no double
-- charge): already_member; then it activates
select pg_temp.pay('00000000-0000-0000-0000-00000000fe31');
do $$
declare r text;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd03', '00000000-0000-0000-0000-00000000fe32');
  if r is distinct from 'already_member' then raise exception 'T9 FAIL: reserve over a paid reservation returned %', r; end if;
  if (select order_id from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd03')
       is distinct from '00000000-0000-0000-0000-00000000fe31' then
    raise exception 'T9 FAIL: the paid reservation was moved off its order';
  end if;
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe31');
  if r is distinct from 'activated' then raise exception 'T9 FAIL: activate of the paid reservation returned %', r; end if;
  raise notice 'T9 PASS: paid reservation → already_member, never moved; then activated';
end $$;

-- T10 an EXPIRED reservation with a free seat still activates
select pg_temp.cap(3);
do $$
declare r text;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd04', '00000000-0000-0000-0000-00000000fe41');
  if r is distinct from 'reserved' then raise exception 'T10 FAIL: L4 reserve returned %', r; end if;
  update public.founder_seats set reserved_until = now() - interval '1 minute'
   where order_id = '00000000-0000-0000-0000-00000000fe41';
  perform pg_temp.pay('00000000-0000-0000-0000-00000000fe41');
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe41');
  if r is distinct from 'activated' then raise exception 'T10 FAIL: expired + free seat returned %', r; end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe41') <> 'active' then
    raise exception 'T10 FAIL: the order''s own seat was not reused';
  end if;
  raise notice 'T10 PASS: expired reservation, seat free → activated on its own seat';
end $$;

-- T11 an order on a RELEASED seat reuses that row; expired + full → full,
-- metadata founder = seat_unavailable, nothing granted
select pg_temp.cap(5);
do $$
declare
  r     text;
  b     boolean;
  seat7 uuid;
  m     jsonb;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd07', '00000000-0000-0000-0000-00000000fe71');
  if r is distinct from 'reserved' then raise exception 'T11 FAIL: L7 reserve returned %', r; end if;
  select id into seat7 from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe71';
  b := public.founder_release_order('00000000-0000-0000-0000-00000000fe71');
  if b is distinct from true then raise exception 'T11 FAIL: release_order(L7) returned %', b; end if;
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd07', '00000000-0000-0000-0000-00000000fe71');
  if r is distinct from 'reserved' then raise exception 'T11 FAIL: reserve with the released seat''s order returned %', r; end if;
  if (select count(*) from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd07') <> 1
     or (select status from public.founder_seats where id = seat7) <> 'reserved' then
    raise exception 'T11 FAIL: the released seat''s row was not reused';
  end if;

  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd05', '00000000-0000-0000-0000-00000000fe51');
  if r is distinct from 'reserved' then raise exception 'T11 FAIL: L5 reserve returned %', r; end if;
  -- L5's reservation expires; L6 takes the last seat (L1, L3, L4 active + L7 + L6 = 5)
  update public.founder_seats set reserved_until = now() - interval '1 minute'
   where order_id = '00000000-0000-0000-0000-00000000fe51';
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd06', '00000000-0000-0000-0000-00000000fe61');
  if r is distinct from 'reserved' then raise exception 'T11 FAIL: L6 reserve returned %', r; end if;

  -- L5's payment is captured late
  perform pg_temp.pay('00000000-0000-0000-0000-00000000fe51');
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe51');
  if r is distinct from 'full' then raise exception 'T11 FAIL: expired + full returned %', r; end if;
  select metadata into m from public.payment_orders where id = '00000000-0000-0000-0000-00000000fe51';
  if m ->> 'founder' is distinct from 'seat_unavailable' then
    raise exception 'T11 FAIL: metadata %', m;
  end if;
  if (select status from public.payment_orders where id = '00000000-0000-0000-0000-00000000fe51') <> 'paid'
     or exists (select 1 from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd05' and status = 'active')
     or exists (select 1 from public.membership_credits where user_id = '00000000-0000-0000-0000-00000000fd05')
     or exists (select 1 from public.library_access_grants where order_id = '00000000-0000-0000-0000-00000000fe51')
     or (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000fd05') then
    raise exception 'T11 FAIL: a full activation granted something or changed the order';
  end if;
  raise notice 'T11 PASS: released seat''s order reuses its row; expired + full → full, seat_unavailable, order stays paid, nothing granted';
end $$;

-- T12 the licence is suspended between checkout and payment → not_verified
update public.lawyer_profiles set verification_status = 'suspended'
 where user_id = '00000000-0000-0000-0000-00000000fd06';
select pg_temp.pay('00000000-0000-0000-0000-00000000fe61');
do $$
declare r text;
begin
  r := public.founder_activate('00000000-0000-0000-0000-00000000fe61');
  if r is distinct from 'not_verified' then raise exception 'T12 FAIL: activate returned %', r; end if;
  if (select metadata ->> 'founder' from public.payment_orders where id = '00000000-0000-0000-0000-00000000fe61')
       is distinct from 'not_verified' then
    raise exception 'T12 FAIL: metadata founder is not not_verified';
  end if;
  if exists (select 1 from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd06' and status = 'active')
     or exists (select 1 from public.membership_credits where user_id = '00000000-0000-0000-0000-00000000fd06')
     or (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000fd06') then
    raise exception 'T12 FAIL: an unverified activation granted something';
  end if;
  raise notice 'T12 PASS: suspended licence → not_verified, metadata founder = not_verified, nothing granted';
end $$;

-- T13 summary, then release_expired: 1 stale unpaid; the paid expired one stays
do $$
declare
  s record;
  n int;
begin
  select * into s from public.founder_seat_summary();
  -- active L1, L3, L4; live reserved L6, L7 (L5 expired)
  if s.capacity <> 5 or s.active <> 3 or s.reserved <> 2 or s.seats_left <> 0
     or s.sale_paused or s.on_sale then
    raise exception 'T13 FAIL: summary %', row_to_json(s);
  end if;
  update public.founder_seats set reserved_until = now() - interval '1 minute'
   where order_id = '00000000-0000-0000-0000-00000000fe71';
  n := public.founder_release_expired();
  if n is distinct from 1 then raise exception 'T13 FAIL: release_expired returned %', n; end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe71') <> 'released' then
    raise exception 'T13 FAIL: L7''s stale reservation was not released';
  end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe51') <> 'reserved' then
    raise exception 'T13 FAIL: L5''s expired but PAID reservation was released';
  end if;
  select * into s from public.founder_seat_summary();
  if s.reserved <> 1 or s.seats_left <> 1 or not s.on_sale then
    raise exception 'T13 FAIL: summary after the release %', row_to_json(s);
  end if;
  raise notice 'T13 PASS: summary 5 / 3 active / 2 reserved / 0 left; release_expired → 1, the paid one kept; then 1 left, on sale';
end $$;

-- T14 revoke: credits zero, grant revoked (window closed), badge cleared
do $$
declare
  r text;
  g record;
begin
  begin
    perform public.founder_revoke('00000000-0000-0000-0000-00000000fe41', '  ');
    raise exception 'T14 FAIL: a blank reason was accepted';
  exception when sqlstate '22023' then null;
  end;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe41') <> 'active' then
    raise exception 'T14 FAIL: a refused revoke changed the seat';
  end if;

  r := public.founder_revoke('00000000-0000-0000-0000-00000000fe12', 'refund');
  if r is distinct from 'revoked' then raise exception 'T14 FAIL: revoke returned %', r; end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe12') <> 'revoked' then
    raise exception 'T14 FAIL: seat not revoked';
  end if;
  if exists (select 1 from public.membership_credits where user_id = '00000000-0000-0000-0000-00000000fd01' and remaining <> 0) then
    raise exception 'T14 FAIL: credits not zeroed';
  end if;
  select * into g from public.library_access_grants where order_id = '00000000-0000-0000-0000-00000000fe12';
  if g.revoked_at is distinct from now() or g.ends_at > now() then
    raise exception 'T14 FAIL: grant not revoked: %', row_to_json(g);
  end if;
  if (select revoke_reason from public.library_access_grant_admin where grant_id = g.id) is distinct from 'refund' then
    raise exception 'T14 FAIL: the revoke reason was not kept';
  end if;
  if (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000fd01') then
    raise exception 'T14 FAIL: badge not cleared';
  end if;
  if not (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000fd03') then
    raise exception 'T14 FAIL: another member''s badge was cleared';
  end if;
  r := public.founder_revoke('00000000-0000-0000-0000-00000000fe12', 'refund');
  if r is distinct from 'none' then raise exception 'T14 FAIL: second revoke returned %', r; end if;
  raise notice 'T14 PASS: blank reason refused; revoke → seat revoked, credits 0, grant revoked + ended, badge cleared; again → none';
end $$;

-- T15 paused, closed
do $$
declare r text; s record;
begin
  update public.platform_settings set value = value || '{"sale_paused": true}'::jsonb where key = 'founder_campaign';
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fe22');
  if r is distinct from 'paused' then raise exception 'T15 FAIL: paused sale returned %', r; end if;
  select * into s from public.founder_seat_summary();
  if not s.sale_paused or s.on_sale then raise exception 'T15 FAIL: summary while paused %', row_to_json(s); end if;

  update public.platform_settings
     set value = value || jsonb_build_object('sale_paused', false,
                   'starts_on', '2020-01-01', 'ends_on', '2020-01-02')
   where key = 'founder_campaign';
  r := public.founder_reserve_seat('00000000-0000-0000-0000-00000000fd02', '00000000-0000-0000-0000-00000000fe22');
  if r is distinct from 'closed' then raise exception 'T15 FAIL: closed window returned %', r; end if;
  select * into s from public.founder_seat_summary();
  if s.on_sale then raise exception 'T15 FAIL: on_sale outside the window'; end if;
  if exists (select 1 from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000fe22') then
    raise exception 'T15 FAIL: paused / closed wrote a seat';
  end if;
  raise notice 'T15 PASS: sale_paused → paused, window over → closed, no seat';
end $$;

-- T16 missing keys read as the defaults (ruling R1)
do $$
declare s record;
begin
  update public.platform_settings set value = value - 'capacity' - 'sale_paused' where key = 'founder_campaign';
  select * into s from public.founder_seat_summary();
  if s.capacity <> 1096 or s.sale_paused then raise exception 'T16 FAIL: defaults %', row_to_json(s); end if;
  update public.platform_settings set value = value || '{"capacity": "lots", "sale_paused": "yes"}'::jsonb where key = 'founder_campaign';
  select * into s from public.founder_seat_summary();
  if s.capacity <> 1096 or s.sale_paused then raise exception 'T16 FAIL: malformed values %', row_to_json(s); end if;
  raise notice 'T16 PASS: missing or malformed capacity / sale_paused read as 1096 / false';
end $$;

-- T17 two sessions race for the last seat: the second waits on the lock and
-- then sees the first one's seat
create extension if not exists dblink;
update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'sale_paused', false)
 where key = 'founder_campaign';
do $$
declare taken int;
begin
  -- active L3, L4; live reserved L6 → 3 taken; capacity 4 leaves ONE seat
  select active + reserved into taken from public.founder_seat_summary();
  if taken <> 3 then raise exception 'T17 FAIL: setup expected 3 taken, got %', taken; end if;
  perform pg_temp.cap(4);
end $$;
do $$
declare
  ra text;
  rb text;
begin
  perform dblink_connect('race_a', 'dbname=postgres user=postgres');
  perform dblink_connect('race_b', 'dbname=postgres user=postgres');
  perform dblink_exec('race_a', 'begin');
  select x into ra from dblink('race_a',
    'select public.founder_reserve_seat(''00000000-0000-0000-0000-00000000fd0a'', ''00000000-0000-0000-0000-00000000fea1'')') as t(x text);
  if ra is distinct from 'reserved' then raise exception 'T17 FAIL: session A returned %', ra; end if;
  perform dblink_send_query('race_b',
    'select public.founder_reserve_seat(''00000000-0000-0000-0000-00000000fd0b'', ''00000000-0000-0000-0000-00000000feb1'')');
  perform pg_sleep(0.5);
  if dblink_is_busy('race_b') <> 1 then
    raise exception 'T17 FAIL: session B did not wait for session A''s lock';
  end if;
  perform dblink_exec('race_a', 'commit');
  select x into rb from dblink_get_result('race_b') as t(x text);
  perform x from dblink_get_result('race_b') as t(x text);   -- drain
  perform dblink_disconnect('race_a');
  perform dblink_disconnect('race_b');
  if rb is distinct from 'full' then raise exception 'T17 FAIL: session B returned % (overbooked)', rb; end if;
  if exists (select 1 from public.founder_seats where user_id = '00000000-0000-0000-0000-00000000fd0b') then
    raise exception 'T17 FAIL: session B holds a seat';
  end if;
  raise notice 'T17 PASS: two sessions, one seat — A reserved, B waited on the lock and got full';
end $$;

-- T18 privileges: functions are service-role only; the API roles cannot write
-- the tables; a signed-in lawyer reads only his own seat and credits
do $$
declare
  fn  text;
  r   text;
  p   text;
  cfg text[];
  sd  boolean;
  t   text;
begin
  foreach fn in array array[
    'public.founder_reserve_seat(uuid, uuid)', 'public.founder_activate(uuid)',
    'public.founder_revoke(uuid, text)', 'public.founder_release_expired()',
    'public.founder_release_order(uuid)', 'public.founder_seat_summary()',
    'public.founder_campaign_limits()'] loop
    if to_regprocedure(fn) is null then raise exception 'T18 FAIL: % missing', fn; end if;
    select proconfig, prosecdef into cfg, sd from pg_proc where oid = to_regprocedure(fn);
    if not sd or not ('search_path=public, pg_temp' = any (cfg)) then
      raise exception 'T18 FAIL: % is not SECURITY DEFINER with search_path public, pg_temp (%)', fn, cfg;
    end if;
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        raise exception 'T18 FAIL: % can EXECUTE %', r, fn;
      end if;
    end loop;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'T18 FAIL: service_role cannot EXECUTE %', fn;
    end if;
  end loop;
  foreach t in array array['public.founder_seats', 'public.membership_credits', 'public.membership_credit_uses'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'T18 FAIL: RLS off on %', t;
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, t, p) then
          raise exception 'T18 FAIL: % holds % on %', r, p, t;
        end if;
      end loop;
    end loop;
    if has_table_privilege('anon', t, 'SELECT') then
      raise exception 'T18 FAIL: anon can SELECT %', t;
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.membership_credit_uses', 'SELECT') then
    raise exception 'T18 FAIL: authenticated can SELECT membership_credit_uses';
  end if;
  raise notice 'T18 PASS: 7 functions definer + service role only; 3 tables RLS on, no write for anon / authenticated, credit uses server-only';
end $$;

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000fd03', false);
do $$
declare n int;
begin
  select count(*) into n from public.founder_seats;
  if n <> 1 or exists (select 1 from public.founder_seats where user_id <> auth.uid()) then
    raise exception 'T18 FAIL: L3 sees % seats', n;
  end if;
  select count(*) into n from public.membership_credits;
  if n <> 2 or exists (select 1 from public.membership_credits where user_id <> auth.uid()) then
    raise exception 'T18 FAIL: L3 sees % credit rows', n;
  end if;
  begin
    insert into public.founder_seats (user_id, campaign_id, status) values (auth.uid(), 'founder-2026', 'active');
    raise exception 'T18 FAIL: authenticated inserted a seat';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.membership_credits set remaining = total;
    raise exception 'T18 FAIL: authenticated updated credits';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.founder_reserve_seat(auth.uid(), '00000000-0000-0000-0000-00000000fe32');
    raise exception 'T18 FAIL: authenticated executed founder_reserve_seat';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.founder_activate('00000000-0000-0000-0000-00000000fe32');
    raise exception 'T18 FAIL: authenticated executed founder_activate';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.membership_credit_uses;
    raise exception 'T18 FAIL: authenticated read membership_credit_uses';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T18 PASS: as authenticated — own seat (1) and credits (2) only; insert / update / execute / credit uses → 42501';
end $$;
reset role;
select set_config('test.uid', '', false);

-- T19 no second ai_fail_run overload (PGRST203)
do $$
begin
  if (select count(*) from pg_proc where proname = 'ai_fail_run') <> 1 then
    raise exception 'T19 FAIL: % ai_fail_run overloads', (select count(*) from pg_proc where proname = 'ai_fail_run');
  end if;
  raise notice 'T19 PASS: exactly one ai_fail_run';
end $$;

-- the file's final SELECT check
select (select count(*) from public.founder_seats) as seats,
       (select value->>'capacity' from public.platform_settings where key = 'founder_campaign') as capacity;
