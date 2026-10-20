-- payments_fulfill_once.test.sql — proves 20261022_30 (Moyasar payments B1,
-- Task 5: the claim that turns an order paid exactly once) and its _verify
-- section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql — auth.users, public.profiles,
-- auth.uid() via test.uid, the anon / authenticated / service_role /
-- app_user roles — loads first by itself). The migration runs TWICE, with a
-- stray EXECUTE grant between the runs (the self-host restore's shape) that
-- the second run must take back. The _verify section is extracted from
-- _verify.sql between its markers and runs before the migration (it must only
-- NOTICE) and after the second run (it must pass). From the repo root, in
-- Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_payments_fulfill_once_block.sql
--   sed -n '/^-- >>> verify:payments_fulfill_once/,/^-- <<< verify:payments_fulfill_once/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     "$B" \
--     $M/20261022_30_claim_payment_order.sql \
--     $R/prelude_payments_fulfill_once_between_runs.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     "$B" \
--     $R/payments_fulfill_once.test.sql
-- Why each link:
--   20260603_phase1_003, 20260627 (runs ONCE: its CREATE TRIGGER is not
--       idempotent), 20261019_10  — what 20261022_10 needs (see
--       payments_core.test.sql).
--   20261022_10           public.payment_orders and next_receipt_number().
--   prelude_points_lots_fixture.sql + 20261022_20  the batch's real order
--       (10, 20, 30); 30 itself needs only 10.
--   prelude_payments_fulfill_once_between_runs.sql  asserts the first run,
--       then grants EXECUTE on the claim to anon and authenticated.
--
-- NEGATIVE CONTROL (must FAIL) — the chain without the two 20261022_30 files,
-- the between-runs prelude and the verify block:
--   bash $R/run.sh $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql $R/payments_fulfill_once.test.sql
--   → "T0 FAIL: public.claim_payment_order(uuid, text, boolean) does not exist (20261022_30 not applied)".
--
-- Single session: a race between the callback, the webhook and the sweep
-- cannot be run here. What makes it safe is that the claim is ONE UPDATE whose
-- WHERE re-checks the status: under READ COMMITTED a second UPDATE waiting on
-- the row lock re-evaluates `status in ('created','initiated')` against the
-- committed 'paid' row and matches nothing. T1–T4 prove the WHERE; T8 pins
-- that it is a single statement.
--
-- T9 proves merge_payment_order_metadata keeps the other keys; T10 the
-- partial UNIQUE index subscriptions_order_id_key (one subscription per paid
-- order).
--
-- Actors: U …d001 (orders A initiated, B created, C paid, D failed, E initiated).
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.claim_payment_order(uuid, text, boolean)') is null then
    raise exception 'T0 FAIL: public.claim_payment_order(uuid, text, boolean) does not exist (20261022_30 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values ('00000000-0000-0000-0000-00000000d001');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000d001', 'lawyer', 'U');
insert into public.payment_orders
  (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status,
   moyasar_payment_id, receipt_number, paid_at, live)
values
  ('00000000-0000-0000-0000-0000000a0001', '00000000-0000-0000-0000-00000000d001', 'plan', 'lawyer-pro', 'monthly',
   39900, 5985, 45885, 'exclusive', 'initiated', null, null, null, null),
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-00000000d001', 'topup', 'topup-100', 'once',
   10000, 1500, 11500, 'exclusive', 'created', null, null, null, null),
  ('00000000-0000-0000-0000-0000000a0003', '00000000-0000-0000-0000-00000000d001', 'library', 'lib-q1', 'once',
   150000, 22500, 172500, 'exclusive', 'paid', 'pay_C', 'NZ-2026-424242', '2026-10-01 10:00:00+00', false),
  ('00000000-0000-0000-0000-0000000a0004', '00000000-0000-0000-0000-00000000d001', 'topup', 'topup-250', 'once',
   25000, 3750, 28750, 'exclusive', 'failed', 'pay_D', null, null, false),
  ('00000000-0000-0000-0000-0000000a0005', '00000000-0000-0000-0000-00000000d001', 'topup', 'topup-500', 'once',
   50000, 7500, 57500, 'exclusive', 'initiated', null, null, null, null);

-- app_user stands in for authenticated: strip what stubs.sql's default
-- privileges gave it directly, so the EXECUTE test means something
revoke all on public.payment_orders from app_user;

-- T1 the first claim of an initiated order returns exactly one row: paid,
--    stamped with the payment, the mode, paid_at and a fresh receipt number
set role service_role;
do $$
declare
  n   int;
  row public.payment_orders;
begin
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0001', 'pay_A', false);
  if n <> 1 then
    raise exception 'T1 FAIL: the first claim of order A returned % rows (expected 1)', n;
  end if;
  select * into row from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0001';
  if row.status <> 'paid' or row.moyasar_payment_id is distinct from 'pay_A' or row.live is distinct from false
     or row.paid_at is null or row.fulfilled_at is not null then
    raise exception 'T1 FAIL: order A after the claim: status % payment % live % paid_at % fulfilled_at %',
      row.status, row.moyasar_payment_id, row.live, row.paid_at, row.fulfilled_at;
  end if;
  if row.receipt_number is null or row.receipt_number !~ '^NZ-[0-9]{4}-[0-9]{6,}$' then
    raise exception 'T1 FAIL: order A''s receipt number is % (expected NZ-<year>-<6+ digits>)', row.receipt_number;
  end if;
  raise notice 'T1 PASS: the first claim of A returned one row — paid, pay_A, live false, paid_at set, receipt %', row.receipt_number;
end $$;
reset role;

-- T2 the second claim of the same order returns zero rows and changes nothing
--    (another payment id and the other mode included); a refused claim takes
--    no receipt number from the sequence
set role service_role;
do $$
declare
  n      int;
  before public.payment_orders;
  after  public.payment_orders;
begin
  select * into before from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0001';
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0001', 'pay_A', false);
  if n <> 0 then
    raise exception 'T2 FAIL: the second claim of order A returned % rows (expected 0)', n;
  end if;
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0001', 'pay_A_other', true);
  if n <> 0 then
    raise exception 'T2 FAIL: a claim of A with another payment returned % rows (expected 0)', n;
  end if;
  select * into after from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0001';
  if after.receipt_number is distinct from before.receipt_number
     or after.paid_at is distinct from before.paid_at
     or after.moyasar_payment_id is distinct from 'pay_A'
     or after.live is distinct from false
     or after.updated_at is distinct from before.updated_at then
    raise exception 'T2 FAIL: a refused claim re-stamped A: receipt % → %, paid_at % → %, payment %, live %',
      before.receipt_number, after.receipt_number, before.paid_at, after.paid_at, after.moyasar_payment_id, after.live;
  end if;
  raise notice 'T2 PASS: the second claim of A returned zero rows; receipt, paid_at, payment id, live and updated_at unchanged';
end $$;
reset role;

-- the sequence after T2: the next claim must take the very next number
do $$
declare
  last_receipt text;
begin
  select receipt_number into last_receipt from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0001';
  perform set_config('test.last_receipt', last_receipt, false);
end $$;

-- T3 a created order claims too, with the next receipt number (the refused
--    claims of T2 burnt none), live true is kept
set role service_role;
do $$
declare
  n   int;
  a   text := current_setting('test.last_receipt');
  b   text;
begin
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0002', 'pay_B', true);
  if n <> 1 then
    raise exception 'T3 FAIL: the claim of created order B returned % rows (expected 1)', n;
  end if;
  select receipt_number into b from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0002';
  if substring(b from '[0-9]+$')::bigint <> substring(a from '[0-9]+$')::bigint + 1 then
    raise exception 'T3 FAIL: B''s receipt % does not follow A''s % — a refused claim burnt a number', b, a;
  end if;
  if (select live from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0002') is distinct from true then
    raise exception 'T3 FAIL: B''s live flag was not stamped true';
  end if;
  raise notice 'T3 PASS: created order B claimed once, receipt % follows %, live true', b, a;
end $$;
reset role;

-- T4 a paid order is never re-stamped; a failed order never turns paid
set role service_role;
do $$
declare
  n int;
  c public.payment_orders;
  d public.payment_orders;
begin
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0003', 'pay_C2', true);
  if n <> 0 then
    raise exception 'T4 FAIL: the claim of paid order C returned % rows', n;
  end if;
  select * into c from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0003';
  if c.receipt_number <> 'NZ-2026-424242' or c.moyasar_payment_id <> 'pay_C' or c.live
     or c.paid_at <> '2026-10-01 10:00:00+00'::timestamptz or c.status <> 'paid' then
    raise exception 'T4 FAIL: paid order C was re-stamped: receipt %, payment %, live %, paid_at %',
      c.receipt_number, c.moyasar_payment_id, c.live, c.paid_at;
  end if;
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0004', 'pay_D', false);
  if n <> 0 then
    raise exception 'T4 FAIL: the claim of failed order D returned % rows', n;
  end if;
  select * into d from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0004';
  if d.status <> 'failed' or d.receipt_number is not null or d.paid_at is not null then
    raise exception 'T4 FAIL: failed order D changed: status %, receipt %, paid_at %', d.status, d.receipt_number, d.paid_at;
  end if;
  select count(*) into n
    from public.claim_payment_order('00000000-0000-0000-0000-0000000a0999', 'pay_X', false);
  if n <> 0 then
    raise exception 'T4 FAIL: the claim of an order that does not exist returned % rows', n;
  end if;
  raise notice 'T4 PASS: paid order C keeps receipt NZ-2026-424242 / pay_C / paid_at; failed order D stays failed; an unknown order returns zero rows';
end $$;
reset role;

-- T5 one payment settles one order: claiming order E with A's payment id
--    raises 23505 (payment_orders_moyasar_payment_id_key) and leaves E open
--    (fulfillOrder reads that 23505 as order_mismatch)
set role service_role;
do $$
declare
  e public.payment_orders;
begin
  begin
    perform public.claim_payment_order('00000000-0000-0000-0000-0000000a0005', 'pay_A', false);
    raise exception 'T5 FAIL: order E was claimed with payment pay_A, which already settled order A';
  exception when unique_violation then
    null;
  end;
  select * into e from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0005';
  if e.status <> 'initiated' or e.moyasar_payment_id is not null or e.receipt_number is not null then
    raise exception 'T5 FAIL: order E changed after the refused claim: status %, payment %, receipt %',
      e.status, e.moyasar_payment_id, e.receipt_number;
  end if;
  raise notice 'T5 PASS: a payment already on order A cannot settle order E (23505); E stays initiated';
end $$;
reset role;

-- T6 a signed-in user (app_user, a login inheriting authenticated) and anon
--    cannot EXECUTE the claim: 42501, and order E stays open
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000d001', false);
do $$
begin
  begin
    perform public.claim_payment_order('00000000-0000-0000-0000-0000000a0005', 'pay_E', false);
    raise exception 'T6 FAIL: authenticated (app_user) executed claim_payment_order on its own order';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'T6 PASS (authenticated): EXECUTE on claim_payment_order raises 42501, even on the user''s own order';
end $$;
reset role;
set role anon;
do $$
begin
  begin
    perform public.claim_payment_order('00000000-0000-0000-0000-0000000a0005', 'pay_E', false);
    raise exception 'T6 FAIL: anon executed claim_payment_order';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'T6 PASS (anon): EXECUTE on claim_payment_order raises 42501';
end $$;
reset role;
select set_config('test.uid', '', false);
do $$
begin
  if (select status from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0005') <> 'initiated' then
    raise exception 'T6 FAIL: order E is no longer initiated after the refused session calls';
  end if;
end $$;

-- T7 the privileges and the function's shape, after the between-runs prelude
--    granted EXECUTE to anon and authenticated: the second run took it back
do $$
declare
  cfg     text[];
  definer boolean;
  ret     text;
  fn      constant text := 'public.claim_payment_order(uuid, text, boolean)';
begin
  if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
     or has_function_privilege('public', fn, 'EXECUTE') or has_function_privilege('app_user', fn, 'EXECUTE') then
    raise exception 'T7 FAIL: anon / authenticated / PUBLIC / app_user can still EXECUTE the claim after the re-run';
  end if;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'T7 FAIL: service_role cannot EXECUTE the claim';
  end if;
  select proconfig, prosecdef, pg_get_function_result(oid) into cfg, definer, ret
    from pg_proc where oid = to_regprocedure(fn);
  if not coalesce(definer, false) or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception 'T7 FAIL: the claim is not SECURITY DEFINER with search_path ''''';
  end if;
  if ret <> 'SETOF payment_orders' then
    raise exception 'T7 FAIL: the claim returns % (expected SETOF payment_orders)', ret;
  end if;
  raise notice 'T7 PASS: EXECUTE for service_role only (the stray grant was revoked by the re-run); SECURITY DEFINER, search_path '''', returns SETOF payment_orders';
end $$;

-- T8 the claim is one conditional UPDATE that re-checks the open statuses and
--    takes the receipt number inside it
do $$
declare
  def text := pg_get_functiondef(to_regprocedure('public.claim_payment_order(uuid, text, boolean)'));
begin
  if def !~* 'update\s+public\.payment_orders' or def !~* 'status\s+in\s*\(\s*''created''\s*,\s*''initiated''\s*\)'
     or def !~* 'receipt_number\s*=\s*public\.next_receipt_number\(\)' or def !~* 'returning\s+\*' then
    raise exception 'T8 FAIL: the claim is no longer one UPDATE … WHERE status in (''created'',''initiated'') … RETURNING * with next_receipt_number(): %', def;
  end if;
  if (length(def) - length(replace(lower(def), 'update ', ''))) / length('update ') <> 1 then
    raise exception 'T8 FAIL: the claim runs more than one UPDATE';
  end if;
  raise notice 'T8 PASS: one UPDATE … WHERE id = p_order AND status IN (created, initiated) … RETURNING *, receipt from next_receipt_number()';
end $$;

-- T9 merge_payment_order_metadata merges, never overwrites: a trace lands
--    next to the keys already there; a later patch replaces only its own key;
--    an unknown order answers false; sessions get 42501
update public.payment_orders set metadata = '{"user_email": "u@example.test", "already_entitled": true}'::jsonb
 where id = '00000000-0000-0000-0000-0000000a0003';
set role service_role;
do $$
declare
  md jsonb;
begin
  if not public.merge_payment_order_metadata('00000000-0000-0000-0000-0000000a0003',
           '{"paid_unmatched": {"payment_id": "pay_X", "reason": "amount_mismatch", "at": "2026-10-22T08:00:00Z"}}') then
    raise exception 'T9 FAIL: the merge did not find order C';
  end if;
  if not public.merge_payment_order_metadata('00000000-0000-0000-0000-0000000a0003', '{"sweep_attempts": 3}') then
    raise exception 'T9 FAIL: the second merge did not find order C';
  end if;
  perform public.merge_payment_order_metadata('00000000-0000-0000-0000-0000000a0003', '{"sweep_attempts": 4}');
  select metadata into md from public.payment_orders where id = '00000000-0000-0000-0000-0000000a0003';
  if md ->> 'user_email' is distinct from 'u@example.test' or (md ->> 'already_entitled')::boolean is distinct from true
     or md -> 'paid_unmatched' ->> 'reason' is distinct from 'amount_mismatch'
     or (md ->> 'sweep_attempts')::int is distinct from 4 then
    raise exception 'T9 FAIL: the merge lost or mangled a key: %', md;
  end if;
  if public.merge_payment_order_metadata('00000000-0000-0000-0000-0000000a0999', '{"x": 1}') then
    raise exception 'T9 FAIL: the merge answered true for an order that does not exist';
  end if;
  raise notice 'T9 PASS: the merge keeps user_email / already_entitled, adds paid_unmatched, replaces only sweep_attempts (3 → 4); unknown order → false';
end $$;
reset role;
set role app_user;
do $$
begin
  begin
    perform public.merge_payment_order_metadata('00000000-0000-0000-0000-0000000a0005', '{"x": 1}');
    raise exception 'T9 FAIL: authenticated (app_user) executed merge_payment_order_metadata';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'T9 PASS (authenticated): EXECUTE on merge_payment_order_metadata raises 42501';
end $$;
reset role;
do $$
declare
  mfn constant text := 'public.merge_payment_order_metadata(uuid, jsonb)';
  cfg     text[];
  definer boolean;
begin
  if has_function_privilege('anon', mfn, 'EXECUTE') or has_function_privilege('authenticated', mfn, 'EXECUTE')
     or has_function_privilege('public', mfn, 'EXECUTE') or not has_function_privilege('service_role', mfn, 'EXECUTE') then
    raise exception 'T9 FAIL: the merge is not service-role-only after the re-run (the stray grant survived?)';
  end if;
  select proconfig, prosecdef into cfg, definer from pg_proc where oid = to_regprocedure(mfn);
  if not coalesce(definer, false) or not ('search_path=""' = any (cfg)) then
    raise exception 'T9 FAIL: the merge is not SECURITY DEFINER with search_path ''''';
  end if;
  raise notice 'T9 PASS: the merge is service role only (the between-runs grant was revoked), SECURITY DEFINER, search_path ''''';
end $$;

-- T10 one subscription per paid order: a second row with the same
--    metadata.order_id raises 23505; rows without an order are unconstrained
insert into public.subscription_plans (id, tier, audience, name_ar)
  values ('t10-plan', 'pro', 'lawyer', 'خطة اختبار') on conflict (id) do nothing;
do $$
begin
  insert into public.subscriptions (user_id, plan_id, tier, status, metadata) values
    ('00000000-0000-0000-0000-00000000d001', 't10-plan', 'pro', 'cancelled', '{"order_id": "00000000-0000-0000-0000-0000000a0001", "method": "moyasar"}');
  begin
    insert into public.subscriptions (user_id, plan_id, tier, status, metadata) values
      ('00000000-0000-0000-0000-00000000d001', 't10-plan', 'pro', 'active', '{"order_id": "00000000-0000-0000-0000-0000000a0001"}');
    raise exception 'T10 FAIL: a second subscription for order A was accepted';
  exception when unique_violation then
    null;
  end;
  insert into public.subscriptions (user_id, plan_id, tier, status, metadata) values
    ('00000000-0000-0000-0000-00000000d001', 't10-plan', 'pro', 'active', '{"method": "admin_grant"}'),
    ('00000000-0000-0000-0000-00000000d001', 't10-plan', 'pro', 'cancelled', '{}');
  if (select count(*) from public.subscriptions where user_id = '00000000-0000-0000-0000-00000000d001') <> 3 then
    raise exception 'T10 FAIL: expected 3 subscriptions (one per order + two without an order)';
  end if;
  raise notice 'T10 PASS: subscriptions_order_id_key refuses a second row for one order (23505); rows without metadata.order_id are unconstrained';
end $$;
