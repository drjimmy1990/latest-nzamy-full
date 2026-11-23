-- founder_l13.test.sql — proves 20261203_20 (batch l13, builder «founder»):
--   A. a founder seat held and not paid is FREE at exactly 15 minutes, at read
--      time, with no sweep: a hold 15 minutes + 1 second old is not counted by
--      founder_seat_summary and its seat is re-reserved by another lawyer while
--      every other seat is taken; a hold whose reserved_until is exactly now()
--      is free too; the sweep is NOT run before those checks.
--   B. owner Q144 (أ): a founder's monthly invites — 3 a Riyadh month, a code
--      gives a NEW verified advocate a 30-day lib-trial grant + 50 gift points
--      (library_agent) expiring with it; every refusal answer; settings
--      defaults; server-only table and functions.
--
-- CHAIN (run.sh, postgres:16) — the chain of founder_l7.test.sql, then the
-- points wallet files, then 20261203_20 TWICE (idempotent) and its _verify
-- block. From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l13_founder.sql
--   sed -n '/^-- >>> verify:l13_founder/,/^-- <<< verify:l13_founder/p' $M/_verify.sql > "$B"
--   bash $T/run.sh \
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
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261127_40_points_wallets.sql \
--     $T/prelude_founder_l13.sql \
--     $M/20261203_20_founder_invites.sql \
--     $M/20261203_20_founder_invites.sql \
--     "$B" \
--     $T/founder_l13.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL):
--   1. the same chain without the two 20261203_20 files and the verify block
--      → "T0 FAIL: 20261203_20 is not applied";
--   2. the full chain with a copy of 20261127_10 whose live-hold test is
--      loosened to the sweep's lag (`reserved_until > now()` →
--      `reserved_until > now() - interval '10 minutes'`) in place of the real
--      one → the 20261203_20 verify block raises «does not free a hold at
--      exactly reserved_until» (and, past it, T1 FAIL).
\set ON_ERROR_STOP on

-- T0 applied, server only
do $$
begin
  if to_regprocedure('public.founder_invite_create(uuid)') is null
     or to_regprocedure('public.founder_invite_redeem(uuid, text)') is null
     or to_regclass('public.founder_invites') is null then
    raise exception 'T0 FAIL: 20261203_20 is not applied';
  end if;
  if has_function_privilege('authenticated', 'public.founder_invite_create(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_invite_redeem(uuid, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.founder_invite_settings()', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.founder_invite_redeem(uuid, text)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.founder_invites', 'SELECT')
     or has_table_privilege('anon', 'public.founder_invites', 'SELECT') then
    raise exception 'T0 FAIL: privileges';
  end if;
  if (select count(*) from pg_catalog.pg_proc where proname in ('founder_invite_create', 'founder_invite_redeem')) <> 2 then
    raise exception 'T0 FAIL: an extra overload';
  end if;
  raise notice 'T0 PASS: applied once each, service role only, table closed to sessions';
end $$;

-- ── Setup: capacity 2, the window around now; four verified advocates ───────
update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'sale_paused', false, 'capacity', 2)
 where key = 'founder_campaign';

insert into auth.users (id)
select ('00000000-0000-0000-0000-00000000a00' || i)::uuid from generate_series(1, 4) i;
insert into public.profiles (id, user_type, display_name)
select ('00000000-0000-0000-0000-00000000a00' || i)::uuid, 'lawyer', 'محامٍ ' || i from generate_series(1, 4) i;
insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
select ('00000000-0000-0000-0000-00000000a00' || i)::uuid, 'verified', 'advocate' from generate_series(1, 4) i;
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status)
select ('00000000-0000-0000-0000-00000000b00' || i)::uuid, ('00000000-0000-0000-0000-00000000a00' || i)::uuid,
       'membership', 'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated'
  from generate_series(1, 4) i;

-- T1 (A) a hold 15 min + 1 s old is free at read time — no sweep
do $$
declare v record; r text;
begin
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000b001') <> 'reserved' then
    raise exception 'T1 FAIL: a001 could not reserve';
  end if;
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000b002') <> 'reserved' then
    raise exception 'T1 FAIL: a002 could not reserve';
  end if;
  update public.payment_orders set status = 'paid', paid_at = now(), live = true where id = '00000000-0000-0000-0000-00000000b002';
  if public.founder_activate('00000000-0000-0000-0000-00000000b002') <> 'activated' then
    raise exception 'T1 FAIL: a002 not activated';
  end if;
  -- both seats taken: a live hold + an active seat
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003') <> 'full' then
    raise exception 'T1 FAIL: a live 15-minute hold was not counted';
  end if;
  select * into v from public.founder_seat_summary();
  if v.reserved <> 1 or v.seats_left <> 0 or v.on_sale then
    raise exception 'T1 FAIL: summary with a live hold: reserved % left % on_sale %', v.reserved, v.seats_left, v.on_sale;
  end if;
end $$;

-- the hold was made 15 minutes and 1 second ago (it ended 1 second ago)
update public.founder_seats
   set reserved_until = now() - interval '1 second', created_at = now() - interval '15 minutes 1 second'
 where order_id = '00000000-0000-0000-0000-00000000b001';

do $$
declare v record;
begin
  -- the sweep has NOT run: the row is still 'reserved'
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000b001') <> 'reserved' then
    raise exception 'T1 FAIL: the fixture is wrong (the old hold is not reserved)';
  end if;
  select * into v from public.founder_seat_summary();
  if v.reserved <> 0 or v.seats_left <> 1 or not v.on_sale then
    raise exception 'T1 FAIL: a hold 15 min + 1 s old is still counted: reserved % left % on_sale %', v.reserved, v.seats_left, v.on_sale;
  end if;
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000b003') <> 'reserved' then
    raise exception 'T1 FAIL: the seat of a hold 15 min + 1 s old could not be re-reserved';
  end if;
  -- and a003's new hold is counted again
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000b004') <> 'full' then
    raise exception 'T1 FAIL: the re-reserved seat is not counted';
  end if;
  raise notice 'T1 PASS: a hold 15 min + 1 s old is free with no sweep; its seat is re-reserved; the new hold counts';
end $$;

-- exactly at the end of the hold (reserved_until = now(), same transaction) the seat is free too
do $$
declare v record;
begin
  update public.founder_seats set reserved_until = now() where order_id = '00000000-0000-0000-0000-00000000b003';
  select * into v from public.founder_seat_summary();
  if v.reserved <> 0 or v.seats_left <> 1 then
    raise exception 'T1b FAIL: a hold at exactly its end is counted: reserved % left %', v.reserved, v.seats_left;
  end if;
  if public.founder_reserve_seat('00000000-0000-0000-0000-00000000a004', '00000000-0000-0000-0000-00000000b004') <> 'reserved' then
    raise exception 'T1b FAIL: a hold at exactly its end blocked a new reservation';
  end if;
  -- the sweep still tidies the two dead holds and never the live one
  if public.founder_release_expired() <> 2 then
    raise exception 'T1b FAIL: the sweep did not release exactly the two ended holds';
  end if;
  if (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-00000000b004') <> 'reserved' then
    raise exception 'T1b FAIL: the sweep released a live hold';
  end if;
  raise notice 'T1b PASS: free at exactly reserved_until; the sweep is only a tidy-up';
end $$;

-- T2 (B) creating invites: founders only, 3 a month
do $$
declare r jsonb; i int;
begin
  r := public.founder_invite_create('00000000-0000-0000-0000-00000000a004');  -- a live hold, not a member
  if r ->> 'result' <> 'not_founder' then raise exception 'T2 FAIL: a held seat created an invite (%)', r; end if;
  r := public.founder_invite_create('00000000-0000-0000-0000-00000000a003');  -- no seat at all
  if r ->> 'result' <> 'not_founder' then raise exception 'T2 FAIL: a non-member created an invite (%)', r; end if;
  for i in 1 .. 3 loop
    r := public.founder_invite_create('00000000-0000-0000-0000-00000000a002');
    if r ->> 'result' <> 'ok' or (r ->> 'code') !~ '^[0-9A-F]{16}$' or (r ->> 'used')::int <> i or (r ->> 'monthly')::int <> 3 then
      raise exception 'T2 FAIL: invite % answered %', i, r;
    end if;
  end loop;
  r := public.founder_invite_create('00000000-0000-0000-0000-00000000a002');
  if r ->> 'result' <> 'limit' or (r ->> 'used')::int <> 3 then raise exception 'T2 FAIL: a 4th invite this month (%)', r; end if;
  if (select count(distinct code) from public.founder_invites) <> 3
     or exists (select 1 from public.founder_invites
                 where expires_at <> created_at + interval '30 days'
                    or month_key <> to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM')) then
    raise exception 'T2 FAIL: codes / validity / month key';
  end if;
  raise notice 'T2 PASS: not_founder ×2, 3 invites, the 4th refused (limit), 30-day codes, Riyadh month';
end $$;

-- the invitees sign up AFTER the invites (profiles.created_at defaults to now())
--   e001 verified advocate   e002 pending advocate   e003 verified consultant
--   e004 individual          e005 verified advocate  e006 verified advocate with a library grant
insert into auth.users (id)
select ('00000000-0000-0000-0000-00000000e10' || i)::uuid from generate_series(1, 6) i;
insert into public.profiles (id, user_type, display_name, created_at)
select ('00000000-0000-0000-0000-00000000e10' || i)::uuid, case when i = 4 then 'individual' else 'lawyer' end,
       'مدعو ' || i, clock_timestamp()
  from generate_series(1, 6) i;
insert into public.lawyer_profiles (user_id, verification_status, practice_kind) values
  ('00000000-0000-0000-0000-00000000e101', 'verified', 'advocate'),
  ('00000000-0000-0000-0000-00000000e102', 'pending',  'advocate'),
  ('00000000-0000-0000-0000-00000000e103', 'verified', 'consultant'),
  ('00000000-0000-0000-0000-00000000e105', 'verified', 'advocate'),
  ('00000000-0000-0000-0000-00000000e106', 'verified', 'advocate');
select public.library_grant_access('00000000-0000-0000-0000-00000000e106', 'lib-q1', 'purchase', 90, null, null, null, null);

-- T3 a new verified advocate redeems: lib-trial 30 days + 50 gift points (library_agent) ending with it
do $$
declare
  c1 text; r jsonb; g record; l record;
begin
  select code into c1 from public.founder_invites order by created_at, code limit 1;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e101', lower(substr(c1, 1, 4)) || '-' || substr(c1, 5));
  if r ->> 'result' <> 'ok' or (r ->> 'points')::int <> 50 or (r ->> 'trial_days')::int <> 30
     or r ->> 'points_scope' <> 'library_agent' then
    raise exception 'T3 FAIL: redeem answered %', r;
  end if;
  select * into g from public.library_access_grants where user_id = '00000000-0000-0000-0000-00000000e101';
  if g.plan_ref <> 'lib-trial' or g.source <> 'founder_campaign' or g.ends_at - g.starts_at <> interval '30 days' then
    raise exception 'T3 FAIL: grant % % %', g.plan_ref, g.source, g.ends_at - g.starts_at;
  end if;
  select * into l from public.points_lots where user_id = '00000000-0000-0000-0000-00000000e101';
  if l.source <> 'gift' or l.wallet_scope <> 'library_agent' or l.points_total <> 50 or l.points_left <> 50
     or l.expires_at <> g.ends_at then
    raise exception 'T3 FAIL: lot % % % %', l.source, l.wallet_scope, l.points_total, l.expires_at;
  end if;
  if not exists (select 1 from public.founder_invites
                  where code = c1 and redeemed_by = '00000000-0000-0000-0000-00000000e101'
                    and grant_id = g.id and lot_id = l.id and redeemed_at is not null) then
    raise exception 'T3 FAIL: the invite row is not marked';
  end if;
  -- again: nothing given twice
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e101', c1);
  if r ->> 'result' <> 'already_redeemed' then raise exception 'T3 FAIL: second redeem answered %', r; end if;
  if (select count(*) from public.points_lots where user_id = '00000000-0000-0000-0000-00000000e101') <> 1 then
    raise exception 'T3 FAIL: a second lot';
  end if;
  raise notice 'T3 PASS: lib-trial 30 days + 50 library_agent gift points ending with it; code case / dash tolerant; never twice';
end $$;

-- T4 every refusal
do $$
declare
  c1 text; c2 text; c3 text; r jsonb;
begin
  select code into c1 from public.founder_invites order by created_at, code limit 1;
  select code into c2 from public.founder_invites where redeemed_by is null order by created_at, code limit 1;
  select code into c3 from public.founder_invites where redeemed_by is null order by created_at, code offset 1 limit 1;

  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e101', c2);
  if r ->> 'result' <> 'not_new' then raise exception 'T4 FAIL: a second founder invite for one account (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e105', c1);
  if r ->> 'result' <> 'used' then raise exception 'T4 FAIL: a used code (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000a002', c2);
  if r ->> 'result' <> 'self' then raise exception 'T4 FAIL: the founder''s own code (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e102', c2);
  if r ->> 'result' <> 'pending_verification' then raise exception 'T4 FAIL: a pending advocate (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e103', c2);
  if r ->> 'result' <> 'not_lawyer' then raise exception 'T4 FAIL: a consultant (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e104', c2);
  if r ->> 'result' <> 'not_lawyer' then raise exception 'T4 FAIL: an individual (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000a001', c2);
  if r ->> 'result' <> 'not_new' then raise exception 'T4 FAIL: an account older than the invite (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e106', c2);
  if r ->> 'result' <> 'not_new' then raise exception 'T4 FAIL: an account with a library grant (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e105', 'nope');
  if r ->> 'result' <> 'invalid' then raise exception 'T4 FAIL: a malformed code (%)', r; end if;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e105', 'FFFFFFFFFFFFFFFF');
  if r ->> 'result' <> 'invalid' then raise exception 'T4 FAIL: an unknown code (%)', r; end if;
  update public.founder_invites set expires_at = now() - interval '1 second', created_at = now() - interval '31 days' where code = c3;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e105', c3);
  if r ->> 'result' <> 'expired' then raise exception 'T4 FAIL: an expired code (%)', r; end if;
  if exists (select 1 from public.founder_invites where code in (c2, c3) and redeemed_by is not null)
     or exists (select 1 from public.library_access_grants
                 where user_id in ('00000000-0000-0000-0000-00000000e102', '00000000-0000-0000-0000-00000000e103',
                                   '00000000-0000-0000-0000-00000000e104', '00000000-0000-0000-0000-00000000e105')) then
    raise exception 'T4 FAIL: a refusal gave something';
  end if;
  raise notice 'T4 PASS: not_new (second invite / older account / library grant), used, self, pending_verification, not_lawyer ×2, invalid ×2, expired; nothing given';
end $$;

-- T5 the pending advocate is verified later and the code still works; a new month gives 3 again
do $$
declare c2 text; r jsonb;
begin
  select code into c2 from public.founder_invites where redeemed_by is null and expires_at > now() order by created_at, code limit 1;
  update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-00000000e102';
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e102', c2);
  if r ->> 'result' <> 'ok' then raise exception 'T5 FAIL: verified later answered %', r; end if;
  update public.founder_invites set month_key = '2000-01';
  r := public.founder_invite_create('00000000-0000-0000-0000-00000000a002');
  if r ->> 'result' <> 'ok' or (r ->> 'used')::int <> 1 then raise exception 'T5 FAIL: a new month answered %', r; end if;
  raise notice 'T5 PASS: the code waits for the licence check; a new month = a fresh allowance (unused ones do not carry over)';
end $$;

-- T6 the setting: points 0 → no lot, general scope, malformed → defaults; a revoked founder's code stops
do $$
declare s record; r jsonb; c text;
begin
  update public.platform_settings set value = '{"monthly": "x", "trial_days": 0, "points": -1, "points_scope": "all", "valid_days": 9999}'::jsonb
   where key = 'founder_invites';
  select * into s from public.founder_invite_settings();
  if s.monthly <> 3 or s.trial_days <> 30 or s.points <> 50 or s.points_scope <> 'library_agent' or s.valid_days <> 30 then
    raise exception 'T6 FAIL: malformed setting read as % % % % %', s.monthly, s.trial_days, s.points, s.points_scope, s.valid_days;
  end if;
  delete from public.platform_settings where key = 'founder_invites';
  select * into s from public.founder_invite_settings();
  if s.monthly <> 3 or s.points <> 50 then raise exception 'T6 FAIL: a missing setting is not the default'; end if;
  insert into public.platform_settings (key, value) values
    ('founder_invites', '{"monthly": 5, "trial_days": 7, "points": 0, "points_scope": "general", "valid_days": 10}'::jsonb);

  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e107');
  insert into public.profiles (id, user_type, display_name, created_at)
  values ('00000000-0000-0000-0000-00000000e107', 'lawyer', 'مدعو 7', clock_timestamp() + interval '1 second');
  insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
  values ('00000000-0000-0000-0000-00000000e107', 'verified', 'advocate');
  select code into c from public.founder_invites where month_key <> '2000-01';
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e107', c);
  if r ->> 'result' <> 'ok' or (r ->> 'points')::int <> 0 or r ->> 'lot_id' is not null then
    raise exception 'T6 FAIL: points 0 answered %', r;
  end if;
  if exists (select 1 from public.points_lots where user_id = '00000000-0000-0000-0000-00000000e107')
     or (select ends_at - starts_at from public.library_access_grants where user_id = '00000000-0000-0000-0000-00000000e107') <> interval '7 days' then
    raise exception 'T6 FAIL: the setting was not followed';
  end if;

  -- a revoked founder: create refused, an open code refused
  r := public.founder_invite_create('00000000-0000-0000-0000-00000000a002');
  if r ->> 'result' <> 'ok' then raise exception 'T6 FAIL: monthly 5 answered %', r; end if;
  perform public.founder_revoke('00000000-0000-0000-0000-00000000b002', 'test');
  r := public.founder_invite_create('00000000-0000-0000-0000-00000000a002');
  if r ->> 'result' <> 'not_founder' then raise exception 'T6 FAIL: a revoked founder created (%)', r; end if;
  insert into auth.users (id) values ('00000000-0000-0000-0000-00000000e108');
  insert into public.profiles (id, user_type, display_name, created_at)
  values ('00000000-0000-0000-0000-00000000e108', 'lawyer', 'مدعو 8', clock_timestamp() + interval '1 second');
  insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
  values ('00000000-0000-0000-0000-00000000e108', 'verified', 'advocate');
  select code into c from public.founder_invites where redeemed_by is null and expires_at > now() order by created_at desc limit 1;
  r := public.founder_invite_redeem('00000000-0000-0000-0000-00000000e108', c);
  if r ->> 'result' <> 'founder_inactive' then raise exception 'T6 FAIL: a revoked founder''s code answered %', r; end if;
  raise notice 'T6 PASS: malformed / missing setting → defaults; points 0 → no lot; trial days followed; revoked founder → not_founder / founder_inactive';
end $$;

-- T7 a session cannot read the table or call the functions
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-00000000e101', false);
do $$
begin
  begin
    perform 1 from public.founder_invites limit 1;
    raise exception 'T7 FAIL: authenticated read founder_invites';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.founder_invite_redeem('00000000-0000-0000-0000-00000000e101', 'AAAAAAAAAAAAAAAA');
    raise exception 'T7 FAIL: authenticated called founder_invite_redeem';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T7 PASS: closed to sessions';
end $$;
reset role;
