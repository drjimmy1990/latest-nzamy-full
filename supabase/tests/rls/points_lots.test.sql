-- points_lots.test.sql — proves 20261022_20 (Moyasar payments B1, Task 2:
-- points in expiring lots, nearest-expiry debit, existing balances migrated;
-- owner ٢٢٤ / ٢٤٤ / ٢٤٩, ruling 5) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql — auth.users, public.profiles,
-- public.lawyer_profiles without credit_balance, auth.uid() via test.uid, the
-- anon / authenticated / service_role / app_user roles — loads first by
-- itself). The migration runs TWICE, with a debit and an admin edit between
-- the runs. The _verify section is extracted from _verify.sql between its
-- markers and runs before the migration (it must only NOTICE) and after the
-- second run (it must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_points_lots_block.sql
--   sed -n '/^-- >>> verify:points_lots/,/^-- <<< verify:points_lots/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     "$B" \
--     $M/20261022_20_points_lots.sql \
--     $R/prelude_points_lots_between_runs.sql \
--     $M/20261022_20_points_lots.sql \
--     "$B" \
--     $R/points_lots.test.sql
-- Why each link:
--   20260603_phase1_003, 20260627 (runs ONCE: its CREATE TRIGGER is not
--       idempotent), 20261019_10  — what 20261022_10 needs (see
--       payments_core.test.sql).
--   20261022_10           public.payment_orders (points_lots.order_id → it).
--   prelude_points_lots_fixture.sql  lawyer_profiles.credit_balance as on
--       live; lawyer L1 with 250, lawyer L0 with 0.
--   prelude_points_lots_between_runs.sql  asserts the first run (one
--       250-point migrated lot, points_enforcement false), debits 50 from L1,
--       turns points_enforcement on.
--
-- NEGATIVE CONTROL (must FAIL) — the chain without the two 20261022_20 files,
-- the between-runs prelude and the verify block:
--   bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql $R/prelude_points_lots_fixture.sql \
--     $R/points_lots.test.sql
--   → "T0 FAIL: public.points_lots does not exist (20261022_20 not applied)".
--
-- Single session: concurrency cannot be raced here, so T10 proves the lock
-- shape instead (pg_get_functiondef: FOR UPDATE ordered by expires_at,
-- created_at), and T3–T5 prove the behaviour.
--
-- Actors: L1 …e001 (credit_balance 250), L0 …e000 (credit_balance 0),
--         N1 …e002 / N0 …e003 / N2 …e004 (no lawyer profile; credit_transactions
--         latest balance_after 40 / 0 / 25 — see the fixture prelude),
--         U …f001 (two lots, spanning debit), V …f002 (expired lot),
--         W …f003 (revoke, RLS), X …f004 (same-expiry tie-break).
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regclass('public.points_lots') is null then
    raise exception 'T0 FAIL: public.points_lots does not exist (20261022_20 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000f001'),
  ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003'),
  ('00000000-0000-0000-0000-00000000f004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000f001', 'lawyer', 'U'),
  ('00000000-0000-0000-0000-00000000f002', 'individual', 'V'),
  ('00000000-0000-0000-0000-00000000f003', 'individual', 'W'),
  ('00000000-0000-0000-0000-00000000f004', 'individual', 'X');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode) values
  ('00000000-0000-0000-0000-0000000d0f01', '00000000-0000-0000-0000-00000000f001', 'topup', 'topup-250', 'once', 25000, 3750, 28750, 'exclusive'),
  ('00000000-0000-0000-0000-0000000d0f03', '00000000-0000-0000-0000-00000000f003', 'topup', 'topup-100', 'once', 10000, 1500, 11500, 'exclusive');

-- app_user stands in for authenticated: strip what stubs.sql's default
-- privileges gave it, so the write tests mean something
revoke all on public.points_lots, public.points_ledger from app_user;
revoke all on sequence public.points_ledger_id_seq from app_user;

-- T1 existing balances: L1's 250 became one migrated lot (200 left after the
--    between-runs debit), the second run neither added a lot nor restored the
--    points; L0 (0) got none; non-lawyers migrate their latest
--    credit_transactions.balance_after (N1 40, N2 25 by id, N0 0 → none); a
--    lawyer is never migrated twice; the backfill is one-shot (balances made
--    positive between the runs get no lot); credit_balance untouched; the
--    admin's points_enforcement = true survived the re-run
do $$
declare
  lot record;
begin
  if (select count(*) from public.points_lots where source = 'migrated') <> 3 then
    raise exception 'T1 FAIL: expected exactly 3 migrated lots after two runs (L1, N1, N2), got %',
      (select count(*) from public.points_lots where source = 'migrated');
  end if;
  if (select count(*) from public.points_lots where user_id = '00000000-0000-0000-0000-00000000e001') <> 1 then
    raise exception 'T1 FAIL: lawyer L1 was migrated from both credit_balance and credit_transactions';
  end if;
  select * into lot from public.points_lots
   where user_id = '00000000-0000-0000-0000-00000000e001' and source = 'migrated';
  if lot.points_total <> 250 or lot.points_left <> 200 then
    raise exception 'T1 FAIL: L1''s migrated lot is %/% (expected 250 total, 200 left)', lot.points_left, lot.points_total;
  end if;
  if lot.expires_at > now() + interval '12 months'
     or lot.expires_at < now() + interval '12 months' - interval '1 hour' then
    raise exception 'T1 FAIL: L1''s migrated lot expires % (expected about now() + 12 months)', lot.expires_at;
  end if;
  if lot.order_id is not null then
    raise exception 'T1 FAIL: the migrated lot carries an order';
  end if;
  if exists (select 1 from public.points_lots where user_id = '00000000-0000-0000-0000-00000000e000') then
    raise exception 'T1 FAIL: L0 (credit_balance 0 at the first run, 80 before the second) got a lot — the backfill is not one-shot';
  end if;
  if exists (select 1 from public.points_lots where user_id = '00000000-0000-0000-0000-00000000e003') then
    raise exception 'T1 FAIL: N0 (latest balance_after 0 at the first run, 55 before the second) got a lot';
  end if;
  select * into lot from public.points_lots
   where user_id = '00000000-0000-0000-0000-00000000e002' and source = 'migrated';
  if lot.points_total <> 40 or lot.points_left <> 40
     or lot.expires_at > now() + interval '12 months'
     or lot.expires_at < now() + interval '12 months' - interval '1 hour' then
    raise exception 'T1 FAIL: N1''s migrated lot is %/% expiring % (expected 40, about now() + 12 months)',
      lot.points_left, lot.points_total, lot.expires_at;
  end if;
  if (select string_agg(reason || ':' || delta || ':' || ref, ',') from public.points_ledger where lot_id = lot.id)
     is distinct from 'credit:40:migrated:credit_transactions.balance_after' then
    raise exception 'T1 FAIL: N1''s migrated lot has no single credit row from credit_transactions';
  end if;
  if (select points_total from public.points_lots
       where user_id = '00000000-0000-0000-0000-00000000e004' and source = 'migrated') is distinct from 25 then
    raise exception 'T1 FAIL: N2 (two rows at one created_at: 70 then 25 by id) did not get one 25-point lot';
  end if;
  if (select count(*) from public.platform_settings where key = 'points_lots_migrated_at') <> 1 then
    raise exception 'T1 FAIL: expected one points_lots_migrated_at marker';
  end if;
  select * into lot from public.points_lots
   where user_id = '00000000-0000-0000-0000-00000000e001' and source = 'migrated';
  if (select credit_balance from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-00000000e001') <> 250 then
    raise exception 'T1 FAIL: credit_balance was changed';
  end if;
  if (select string_agg(reason || ':' || delta, ',' order by id) from public.points_ledger where lot_id = lot.id)
     is distinct from 'credit:250,usage:-50' then
    raise exception 'T1 FAIL: the migrated lot''s ledger is % (expected credit:250,usage:-50)',
      (select string_agg(reason || ':' || delta, ',' order by id) from public.points_ledger where lot_id = lot.id);
  end if;
  if (select value from public.platform_settings where key = 'points_enforcement') is distinct from 'true'::jsonb then
    raise exception 'T1 FAIL: the second run reset points_enforcement';
  end if;
  raise notice 'T1 PASS: credit_balance 250 → one 250-point migrated lot (not a second from its 999 credit_transactions row) expiring now() + 12 months with its credit row; the re-run added none and kept 200 left; non-lawyers: latest balance_after 40 → one 40 lot, latest 0 → none, a created_at tie goes by id (25); one-shot: L0 credit_balance 80 and N0 balance_after 55 set between the runs → no lot; one marker; credit_balance untouched; points_enforcement kept true';
end $$;

-- T2 credit_points: creates the lot and one credit row; refuses a zero or
--    negative amount, a past or missing expiry, an unknown source or user, an
--    order that is unknown or another user's, and a second lot of the same
--    source for one order (UNIQUE order_id, source)
set role service_role;
do $$
declare
  lot  uuid;
  stmt text;
begin
  lot := public.credit_points('00000000-0000-0000-0000-00000000f003', 70, 'purchase',
                              now() + interval '3 months', '00000000-0000-0000-0000-0000000d0f03', 'order:w');
  if (select source || ':' || points_total || ':' || points_left || ':' || order_id
        from public.points_lots where id = lot)
     is distinct from 'purchase:70:70:00000000-0000-0000-0000-0000000d0f03' then
    raise exception 'T2 FAIL: the credited lot is wrong';
  end if;
  if (select string_agg(reason || ':' || delta || ':' || coalesce(ref, '-') || ':' || coalesce(tool, '-'), ',')
        from public.points_ledger where lot_id = lot) is distinct from 'credit:70:order:w:-' then
    raise exception 'T2 FAIL: the credit ledger row is wrong';
  end if;

  foreach stmt in array array[
    $q$select public.credit_points('00000000-0000-0000-0000-00000000f003', 0, 'purchase', now() + interval '1 month')$q$,
    $q$select public.credit_points('00000000-0000-0000-0000-00000000f003', -5, 'purchase', now() + interval '1 month')$q$,
    $q$select public.credit_points('00000000-0000-0000-0000-00000000f003', 5, 'purchase', now() - interval '1 second')$q$,
    $q$select public.credit_points('00000000-0000-0000-0000-00000000f003', 5, 'purchase', null)$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T2 FAIL: accepted — %', stmt;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.credit_points('00000000-0000-0000-0000-00000000f003', 5, 'gift', now() + interval '1 month');
    raise exception 'T2 FAIL: source gift accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.credit_points('00000000-0000-0000-0000-00000000f003', 5, 'purchase', now() + interval '1 month',
                                 '00000000-0000-0000-0000-0000000d0fff');
    raise exception 'T2 FAIL: an unknown order accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.credit_points('00000000-0000-0000-0000-00000000f003', 5, 'purchase', now() + interval '1 month',
                                 '00000000-0000-0000-0000-0000000d0f01');
    raise exception 'T2 FAIL: another user''s order (U''s) accepted for W';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.credit_points('00000000-0000-0000-0000-00000000f003', 70, 'purchase', now() + interval '3 months',
                                 '00000000-0000-0000-0000-0000000d0f03', 'order:w again');
    raise exception 'T2 FAIL: a second purchase lot for the same order accepted';
  exception when unique_violation then null;
  end;
  begin
    perform public.credit_points('00000000-0000-0000-0000-00000000ffff', 5, 'purchase', now() + interval '1 month');
    raise exception 'T2 FAIL: an unknown user accepted';
  exception when foreign_key_violation then null;
  end;
  if (select count(*) from public.points_lots where user_id = '00000000-0000-0000-0000-00000000f003') <> 1 then
    raise exception 'T2 FAIL: a refused credit left a lot behind';
  end if;
  raise notice 'T2 PASS: credit_points makes the lot + one credit row; 0 / negative points, a past / null expiry, an unknown order and another user''s order raise 22023; a second purchase lot for one order raises 23505; source gift raises 23514; an unknown user raises 23503';
end $$;
reset role;

-- T3 two lots, the later-expiring one created FIRST: a 150 debit takes the
--    sooner lot first (100), then 50 from the later; one usage row per lot
set role service_role;
do $$
declare
  late  uuid;
  soon  uuid;
  after int;
begin
  late := public.credit_points('00000000-0000-0000-0000-00000000f001', 100, 'purchase', now() + interval '3 months',
                               '00000000-0000-0000-0000-0000000d0f01');
  soon := public.credit_points('00000000-0000-0000-0000-00000000f001', 100, 'plan_monthly', now() + interval '1 month');
  if public.points_balance('00000000-0000-0000-0000-00000000f001') <> 200 then
    raise exception 'T3 FAIL: U''s balance is not 200 before the debit';
  end if;
  after := public.debit_points('00000000-0000-0000-0000-00000000f001', 150, 'ai_analyze', 'req-1');
  if after <> 50 then
    raise exception 'T3 FAIL: debit_points returned % (expected 50)', after;
  end if;
  if (select points_left from public.points_lots where id = soon) <> 0
     or (select points_left from public.points_lots where id = late) <> 50 then
    raise exception 'T3 FAIL: sooner lot left %, later lot left % (expected 0 and 50)',
      (select points_left from public.points_lots where id = soon), (select points_left from public.points_lots where id = late);
  end if;
  if (select string_agg(case lot_id when soon then 'soon' when late then 'late' end || ':' || delta || ':' || tool || ':' || ref, ',' order by id)
        from public.points_ledger where user_id = '00000000-0000-0000-0000-00000000f001' and reason = 'usage')
     is distinct from 'soon:-100:ai_analyze:req-1,late:-50:ai_analyze:req-1' then
    raise exception 'T3 FAIL: the usage rows are %',
      (select string_agg(lot_id || ':' || delta, ',' order by id) from public.points_ledger
        where user_id = '00000000-0000-0000-0000-00000000f001' and reason = 'usage');
  end if;
  raise notice 'T3 PASS: a 150 debit over lots of 100 (1 month) + 100 (3 months, created first) empties the sooner lot, leaves 50 in the later, writes 2 usage rows (-100, -50) and returns 50';
end $$;
reset role;

-- T3b same expiry: the earlier-created lot goes first
do $$
declare
  e timestamptz := now() + interval '2 months';
begin
  insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at, created_at) values
    ('00000000-0000-0000-0000-0000000a0c02', '00000000-0000-0000-0000-00000000f004', 'grant', 10, 10, e, now()),
    ('00000000-0000-0000-0000-0000000a0c01', '00000000-0000-0000-0000-00000000f004', 'grant', 10, 10, e, now() - interval '1 day');
  perform public.debit_points('00000000-0000-0000-0000-00000000f004', 5, 't', 'r');
  if (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000a0c01') <> 5
     or (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000a0c02') <> 10 then
    raise exception 'T3b FAIL: with one expiry, the debit did not take the earlier-created lot';
  end if;
  raise notice 'T3b PASS: two lots with the same expiry — the earlier-created one is debited first';
end $$;

-- T4 an expired lot is neither counted nor debited; a debit larger than the
--    balance raises P0001 insufficient_points and changes nothing; a debit of
--    exactly the balance leaves 0
do $$
begin
  insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at, created_at) values
    ('00000000-0000-0000-0000-0000000a0e01', '00000000-0000-0000-0000-00000000f002', 'purchase', 500, 500,
     now() - interval '1 day', now() - interval '4 months');
end $$;
set role service_role;
do $$
declare
  fresh  uuid;
  n_led  int;
  after  int;
  state  text;
  msg    text;
begin
  fresh := public.credit_points('00000000-0000-0000-0000-00000000f002', 30, 'grant', now() + interval '1 month');
  if public.points_balance('00000000-0000-0000-0000-00000000f002') <> 30 then
    raise exception 'T4 FAIL: V''s balance counts the expired lot (got %)', public.points_balance('00000000-0000-0000-0000-00000000f002');
  end if;
  select count(*) into n_led from public.points_ledger;
  begin
    perform public.debit_points('00000000-0000-0000-0000-00000000f002', 40, 'ai_draft', 'req-2');
    raise exception 'T4 FAIL: a 40 debit on a balance of 30 (plus 500 expired) succeeded';
  exception when others then
    get stacked diagnostics state = returned_sqlstate, msg = message_text;
    if state <> 'P0001' or msg <> 'insufficient_points' then
      raise exception 'T4 FAIL: expected P0001 insufficient_points, got % %', state, msg;
    end if;
  end;
  if (select points_left from public.points_lots where id = fresh) <> 30
     or (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000a0e01') <> 500
     or (select count(*) from public.points_ledger) <> n_led then
    raise exception 'T4 FAIL: the refused debit changed a lot or wrote a ledger row';
  end if;

  after := public.debit_points('00000000-0000-0000-0000-00000000f002', 30, 'ai_draft', 'req-3');
  if after <> 0 or (select points_left from public.points_lots where id = fresh) <> 0 then
    raise exception 'T4 FAIL: debiting exactly the balance returned % / left %', after,
      (select points_left from public.points_lots where id = fresh);
  end if;
  if (select points_left from public.points_lots where id = '00000000-0000-0000-0000-0000000a0e01') <> 500
     or exists (select 1 from public.points_ledger where lot_id = '00000000-0000-0000-0000-0000000a0e01') then
    raise exception 'T4 FAIL: the expired lot was debited';
  end if;
  begin
    perform public.debit_points('00000000-0000-0000-0000-00000000f002', 1, 'ai_draft', 'req-4');
    raise exception 'T4 FAIL: a debit on an empty balance succeeded';
  exception when raise_exception then
    get stacked diagnostics msg = message_text;
    if msg <> 'insufficient_points' then raise; end if;
  end;
  foreach msg in array array['0', '-10'] loop
    begin
      perform public.debit_points('00000000-0000-0000-0000-00000000f002', msg::int, 'x', 'y');
      raise exception 'T4 FAIL: a debit of % succeeded', msg;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  raise notice 'T4 PASS: a 500-point expired lot is not counted (balance 30) and never debited; a 40 debit raises P0001 insufficient_points and changes no lot or ledger row; a 30 debit returns 0; then 1 raises; 0 / -10 raise 22023';
end $$;
reset role;

-- T5 a debit larger than the balance on two live lots changes nothing; then
--    exactly the balance (50, in U's later lot) leaves 0
set role service_role;
do $$
declare
  before text;
  n_led  int;
begin
  select string_agg(id || ':' || points_left, ',' order by id) into before
    from public.points_lots where user_id = '00000000-0000-0000-0000-00000000f001';
  select count(*) into n_led from public.points_ledger;
  begin
    perform public.debit_points('00000000-0000-0000-0000-00000000f001', 51, 'ai_analyze', 'req-5');
    raise exception 'T5 FAIL: a 51 debit on a balance of 50 succeeded';
  exception when raise_exception then
    if sqlerrm <> 'insufficient_points' then raise; end if;
  end;
  if (select string_agg(id || ':' || points_left, ',' order by id) from public.points_lots
       where user_id = '00000000-0000-0000-0000-00000000f001') is distinct from before
     or (select count(*) from public.points_ledger) <> n_led then
    raise exception 'T5 FAIL: the refused debit changed something';
  end if;
  -- two statements: points_balance is STABLE, so in one expression with the
  -- debit it would read the snapshot from before the debit
  if public.debit_points('00000000-0000-0000-0000-00000000f001', 50, 'ai_analyze', 'req-6') <> 0 then
    raise exception 'T5 FAIL: debiting exactly the balance did not return 0';
  end if;
  if public.points_balance('00000000-0000-0000-0000-00000000f001') <> 0 then
    raise exception 'T5 FAIL: the balance after debiting all of it is not 0';
  end if;
  raise notice 'T5 PASS: a 51 debit on 50 raises and changes nothing; a 50 debit leaves 0';
end $$;
reset role;

-- T6 revoke_lot zeroes a lot and writes one row; an empty lot returns 0 with
--    no row; a bad reason and an unknown lot raise
set role service_role;
do $$
declare
  lot uuid := (select id from public.points_lots where user_id = '00000000-0000-0000-0000-00000000f003');
  n   int;
begin
  perform public.debit_points('00000000-0000-0000-0000-00000000f003', 20, 'ai_analyze', 'req-7');
  n := public.revoke_lot(lot, 'refund_revoke');
  if n <> 50 or (select points_left from public.points_lots where id = lot) <> 0 then
    raise exception 'T6 FAIL: revoke_lot returned % and left %', n, (select points_left from public.points_lots where id = lot);
  end if;
  if (select string_agg(reason || ':' || delta, ',' order by id) from public.points_ledger where lot_id = lot)
     is distinct from 'credit:70,usage:-20,refund_revoke:-50' then
    raise exception 'T6 FAIL: the lot''s ledger is %', (select string_agg(reason || ':' || delta, ',' order by id) from public.points_ledger where lot_id = lot);
  end if;
  if public.revoke_lot(lot, 'admin_adjustment') <> 0
     or (select count(*) from public.points_ledger where lot_id = lot) <> 3 then
    raise exception 'T6 FAIL: revoking an empty lot did not return 0 without a row';
  end if;
  begin
    perform public.revoke_lot(lot, 'usage');
    raise exception 'T6 FAIL: reason usage accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.revoke_lot('00000000-0000-0000-0000-0000000a0fff', 'expiry');
    raise exception 'T6 FAIL: an unknown lot accepted';
  exception when no_data_found then null;
  end;
  if public.revoke_lot('00000000-0000-0000-0000-0000000a0e01', 'expiry') <> 500 then
    raise exception 'T6 FAIL: revoking V''s expired lot did not remove its 500';
  end if;
  raise notice 'T6 PASS: revoke_lot removes 50 (row refund_revoke:-50), returns 0 with no row on an empty lot, refuses reason usage (22023) and an unknown lot (P0002), and clears an expired lot (expiry:-500)';
end $$;
reset role;

-- T7 a signed-in session cannot credit, debit or revoke; it reads its own
--    balance only; anon cannot call points_balance; the service role reads
--    anyone's
set role app_user;
do $$
declare
  stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000f003', true);
  foreach stmt in array array[
    $q$select public.credit_points('00000000-0000-0000-0000-00000000f003', 1000, 'grant', now() + interval '1 year')$q$,
    $q$select public.debit_points('00000000-0000-0000-0000-00000000f001', 1, 'x', 'y')$q$,
    $q$select public.revoke_lot('00000000-0000-0000-0000-0000000a0c01', 'expiry')$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T7 FAIL: authenticated ran — %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  if public.points_balance('00000000-0000-0000-0000-00000000f003') <> 0 then
    raise exception 'T7 FAIL: W''s own balance is not 0';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000f004', true);
  if public.points_balance('00000000-0000-0000-0000-00000000f004') <> 15 then
    raise exception 'T7 FAIL: X''s own balance is not 15';
  end if;
  begin
    perform public.points_balance('00000000-0000-0000-0000-00000000e001');
    raise exception 'T7 FAIL: X read L1''s balance';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '', true);
  begin
    perform public.points_balance('00000000-0000-0000-0000-00000000e001');
    raise exception 'T7 FAIL: a session without a user read L1''s balance';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T7 PASS: authenticated cannot EXECUTE credit_points / debit_points / revoke_lot (42501); reads its own balance (W 0, X 15); another user''s balance raises 42501, with or without a uid';
end $$;
reset role;
set role anon;
do $$
begin
  begin
    perform public.points_balance('00000000-0000-0000-0000-00000000e001');
    raise exception 'T7 FAIL: anon read a balance';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role service_role;
do $$
begin
  if public.points_balance('00000000-0000-0000-0000-00000000e001') <> 200 then
    raise exception 'T7 FAIL: the service role did not read L1''s 200';
  end if;
  raise notice 'T7 PASS: anon cannot EXECUTE points_balance; the service role reads L1''s 200';
end $$;
reset role;

-- T7b role setting none is trusted only for the database owner: a login
--     role that inherits authenticated, connected directly (no SET ROLE, so
--     the role setting is none), cannot read another user's balance; postgres
--     can. (psql \c over the container's local socket, trust auth.)
\c - app_user
do $$
begin
  if current_setting('role') <> 'none' or session_user <> 'app_user' then
    raise exception 'T7b FAIL: setup — role setting %, session user %', current_setting('role'), session_user;
  end if;
  begin
    perform public.points_balance('00000000-0000-0000-0000-00000000e001');
    raise exception 'T7b FAIL: app_user (role none, inherits authenticated) read L1''s balance';
  exception when insufficient_privilege then null;
  end;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000e001', true);
  if public.points_balance('00000000-0000-0000-0000-00000000e001') <> 200 then
    raise exception 'T7b FAIL: app_user signed in as L1 did not read its own 200';
  end if;
end $$;
\c - postgres
do $$
begin
  if current_setting('role') <> 'none' or session_user <> 'postgres' then
    raise exception 'T7b FAIL: setup — role setting %, session user %', current_setting('role'), session_user;
  end if;
  if public.points_balance('00000000-0000-0000-0000-00000000e001') <> 200 then
    raise exception 'T7b FAIL: postgres (the owner, role none) did not read L1''s 200';
  end if;
  raise notice 'T7b PASS: with role setting none, app_user (a login inheriting authenticated) is refused another user''s balance (42501) and reads its own; postgres reads anyone''s';
end $$;

-- T8 the owner reads their own lots and ledger only, every column; no write
set role app_user;
do $$
declare
  stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000f001', true);
  if (select count(*) from (select id, user_id, source, points_total, points_left, expires_at, order_id, created_at
                              from public.points_lots) s) <> 2
     or exists (select 1 from public.points_lots where user_id <> auth.uid()) then
    raise exception 'T8 FAIL: U does not see exactly its 2 lots';
  end if;
  if (select count(*) from (select id, user_id, lot_id, delta, reason, tool, ref, created_at
                              from public.points_ledger) s) <> 5
     or exists (select 1 from public.points_ledger where user_id <> auth.uid()) then
    raise exception 'T8 FAIL: U does not see exactly its 5 ledger rows (2 credits, 3 usages)';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000e001', true);
  if (select count(*) from public.points_lots) <> 1 or (select count(*) from public.points_ledger) <> 2 then
    raise exception 'T8 FAIL: L1 does not see exactly its 1 lot and 2 ledger rows';
  end if;
  foreach stmt in array array[
    $q$insert into public.points_lots (user_id, source, points_total, points_left, expires_at)
         values ('00000000-0000-0000-0000-00000000e001', 'grant', 9999, 9999, now() + interval '1 year')$q$,
    $q$update public.points_lots set points_left = points_total where user_id = auth.uid()$q$,
    $q$delete from public.points_lots where user_id = auth.uid()$q$,
    $q$insert into public.points_ledger (user_id, lot_id, delta, reason)
         select user_id, id, 1, 'credit' from public.points_lots where user_id = auth.uid()$q$,
    $q$update public.points_ledger set delta = 1 where user_id = auth.uid()$q$,
    $q$delete from public.points_ledger where user_id = auth.uid()$q$,
    $q$select nextval('public.points_ledger_id_seq')$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T8 FAIL: allowed — %', left(stmt, 90);
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'T8 PASS: U reads its 2 lots / 5 ledger rows, L1 its 1 / 2, every column; INSERT / UPDATE / DELETE on both tables and nextval on the ledger sequence raise 42501';
end $$;
reset role;

-- T9 effective privileges: anon and PUBLIC hold nothing; authenticated only
--    column SELECT; EXECUTE matrix
do $$
declare
  r   text;
  tbl text;
  p   text;
  col text;
  fn  text;
begin
  foreach tbl in array array['points_lots', 'points_ledger'] loop
    foreach r in array array['anon', 'authenticated', 'public'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, 'public.' || tbl, p) then
          raise exception 'T9 FAIL: % holds table % on %', r, p, tbl;
        end if;
      end loop;
      for col in select attname::text from pg_attribute
                  where attrelid = ('public.' || tbl)::regclass and attnum > 0 and not attisdropped loop
        if has_column_privilege(r, 'public.' || tbl, col, 'INSERT, UPDATE, REFERENCES') then
          raise exception 'T9 FAIL: % can write %.%', r, tbl, col;
        end if;
        if has_column_privilege(r, 'public.' || tbl, col, 'SELECT') <> (r = 'authenticated') then
          raise exception 'T9 FAIL: % SELECT on %.% is %', r, tbl, col, has_column_privilege(r, 'public.' || tbl, col, 'SELECT');
        end if;
      end loop;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_sequence_privilege(r, 'public.points_ledger_id_seq', 'USAGE, SELECT, UPDATE') then
      raise exception 'T9 FAIL: % holds a privilege on points_ledger_id_seq', r;
    end if;
  end loop;
  foreach fn in array array['public.points_balance(uuid)',
                            'public.credit_points(uuid,integer,text,timestamp with time zone,uuid,text)',
                            'public.debit_points(uuid,integer,text,text)',
                            'public.revoke_lot(uuid,text)'] loop
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('public', fn, 'EXECUTE') then
      raise exception 'T9 FAIL: anon or PUBLIC can EXECUTE %', fn;
    end if;
    if has_function_privilege('authenticated', fn, 'EXECUTE') <> (fn = 'public.points_balance(uuid)') then
      raise exception 'T9 FAIL: authenticated EXECUTE on % is wrong', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception 'T9 FAIL: service_role cannot EXECUTE %', fn;
    end if;
  end loop;
  raise notice 'T9 PASS: anon / PUBLIC hold no table, column, sequence or function privilege; authenticated holds column SELECT only and EXECUTE on points_balance only; service_role EXECUTEs all four';
end $$;

-- T10 shape after two runs: SECURITY DEFINER + search_path '' on all four;
--     debit_points locks FOR UPDATE ordered by expires_at, created_at; one
--     policy per table; the (user_id, expires_at) index; one setting row
do $$
declare
  fn  text;
  def text := pg_get_functiondef('public.debit_points(uuid,integer,text,text)'::regprocedure);
begin
  foreach fn in array array['public.points_balance(uuid)',
                            'public.credit_points(uuid,integer,text,timestamp with time zone,uuid,text)',
                            'public.debit_points(uuid,integer,text,text)',
                            'public.revoke_lot(uuid,text)'] loop
    if not (select prosecdef and proconfig is not null and 'search_path=""' = any (proconfig)
              from pg_proc where oid = fn::regprocedure) then
      raise exception 'T10 FAIL: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
  end loop;
  if def !~* 'where\s+pl\.user_id\s*=\s*p_user\s+and\s+pl\.expires_at\s*>\s*now\(\)\s+and\s+pl\.points_left\s*>\s*0\s+order\s+by\s+pl\.expires_at\s*,\s*pl\.created_at\s*,\s*pl\.id\s+for\s+update' then
    raise exception 'T10 FAIL: debit_points does not lock unexpired lots FOR UPDATE ordered by expires_at, created_at';
  end if;
  if position('insufficient_points' in def) = 0 then
    raise exception 'T10 FAIL: debit_points does not raise insufficient_points';
  end if;
  if def !~* 'if\s+v_need\s*>\s*0\s+then\s+raise\s+exception\s+''debit_points_invariant''' then
    raise exception 'T10 FAIL: debit_points does not raise debit_points_invariant when points remain after the loop';
  end if;
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.points_lots'::regclass and conname = 'points_lots_order_source_key')
     is distinct from 'UNIQUE (order_id, source)' then
    raise exception 'T10 FAIL: points_lots_order_source_key is not UNIQUE (order_id, source)';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename in ('points_lots', 'points_ledger')) <> 2 then
    raise exception 'T10 FAIL: expected exactly 2 policies on the points tables';
  end if;
  if (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'points_lots_user_expires_idx')
     !~ '\(user_id, expires_at\)' then
    raise exception 'T10 FAIL: the (user_id, expires_at) index is missing';
  end if;
  if (select count(*) from public.platform_settings where key = 'points_enforcement') <> 1 then
    raise exception 'T10 FAIL: expected one points_enforcement row';
  end if;
  raise notice 'T10 PASS: all four functions SECURITY DEFINER with search_path ''''; debit_points locks unexpired lots FOR UPDATE ordered by expires_at, created_at, id and raises insufficient_points; debit_points_invariant guard; UNIQUE (order_id, source); 2 policies, the (user_id, expires_at) index, one setting row';
end $$;

-- T11 deleting an order keeps its lot (order_id SET NULL); deleting a GoTrue
--     user is never blocked and takes their lots and ledger rows along
do $$
begin
  delete from public.payment_orders where id = '00000000-0000-0000-0000-0000000d0f03';
  if not exists (select 1 from public.points_lots
                  where user_id = '00000000-0000-0000-0000-00000000f003' and order_id is null) then
    raise exception 'T11 FAIL: deleting the order removed the lot or kept its order_id';
  end if;
  delete from auth.users where id = '00000000-0000-0000-0000-00000000f001';
  if exists (select 1 from public.points_lots where user_id = '00000000-0000-0000-0000-00000000f001')
     or exists (select 1 from public.points_ledger where user_id = '00000000-0000-0000-0000-00000000f001') then
    raise exception 'T11 FAIL: U''s lots or ledger rows survived the user';
  end if;
  if (select user_id from public.payment_orders where id = '00000000-0000-0000-0000-0000000d0f01') is not null then
    raise exception 'T11 FAIL: U''s order still carries a user_id';
  end if;
  raise notice 'T11 PASS: deleting an order sets its lot''s order_id null; deleting U succeeds and removes its lots and ledger rows; its order stays with user_id null';
end $$;
