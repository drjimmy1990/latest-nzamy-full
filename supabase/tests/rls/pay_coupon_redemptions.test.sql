-- pay_coupon_redemptions.test.sql — proves 20261206_30 (batch l16-pay, owner
-- س٢١٣; gap A-08 / A-59 / E-12): free-plan / points code redemptions with the
-- 3-line free activation (full price → 100 % → net 0), once per user, under a
-- row lock, server-only functions, own-row reads, and its _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE (idempotent); the _verify block runs before it (its
-- checks print f, never raise) and after. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l16_pay.sql
--   sed -n '/^-- >>> verify:l16_pay/,/^-- <<< verify:l16_pay/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261127_40_points_wallets.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     "$B" \
--     $M/20261206_30_pay_coupon_redemptions.sql \
--     $M/20261206_30_pay_coupon_redemptions.sql \
--     "$B" \
--     $R/pay_coupon_redemptions.test.sql
--
-- NEGATIVE CONTROL: the chain without the two 20261206_30 files → "T0 FAIL".
-- Every assertion RAISES on failure.

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000016a1'), ('00000000-0000-0000-0000-0000000016a2'),
  ('00000000-0000-0000-0000-0000000016a3'), ('00000000-0000-0000-0000-0000000016a4');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000016a1', 'lawyer', 'a1'), ('00000000-0000-0000-0000-0000000016a2', 'lawyer', 'a2'),
  ('00000000-0000-0000-0000-0000000016a3', 'individual', 'a3'), ('00000000-0000-0000-0000-0000000016a4', 'lawyer', 'a4');

insert into public.coupons (code, discount_type, discount_value, points_granted, plan_granted, eligible_user_types,
                            max_uses, used_count, valid_from, valid_until, active, metadata) values
  ('PTS500', 'points_grant', 0, 500, null, '{}', 10, 0, now() - interval '1 day', now() + interval '30 days', true, '{"created_by_admin": "t"}'),
  ('PLANPRO', 'plan_upgrade', 0, 0, 'lawyer-pro', '{lawyer}', 1, 0, now() - interval '1 day', now() + interval '30 days', true,
   '{"created_by_admin": "t", "grant_billing": "yearly"}'),
  ('OLDPTS', 'points_grant', 0, 100, null, '{}', 10, 0, now() - interval '30 days', now() - interval '1 day', true, '{"created_by_admin": "t"}'),
  ('OFFPTS', 'points_grant', 0, 100, null, '{}', 10, 0, now() - interval '1 day', now() + interval '30 days', false, '{"created_by_admin": "t"}'),
  ('DISC10', 'percentage', 10, 0, null, '{}', 10, 0, now() - interval '1 day', now() + interval '30 days', true, '{"created_by_admin": "t"}');

create or replace function pg_temp.cid(code text) returns uuid language sql as $$ select id from public.coupons c where c.code = cid.code $$;

-- T0 the objects exist (negative control stops here)
do $$
begin
  if to_regclass('public.coupon_redemptions') is null
     or to_regprocedure('public.coupon_redeem_open(uuid, uuid, integer, timestamptz, timestamptz)') is null
     or to_regprocedure('public.coupon_redeem_finish(uuid, boolean, uuid)') is null then
    raise exception 'T0 FAIL: 20261206_30 not applied';
  end if;
  raise notice 'T0 PASS: coupon_redemptions + coupon_redeem_open / coupon_redeem_finish exist';
end $$;

-- T1 sessions can neither call the functions nor write a redemption; anon reads nothing
set role anon;
do $$ begin
  perform 1 from public.coupon_redemptions;
  raise exception 'T1 FAIL: anon read coupon_redemptions';
exception when insufficient_privilege then raise notice 'T1 PASS (a): anon refused on coupon_redemptions'; end $$;
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-0000000016a1', false);
set role authenticated;
do $$ begin
  perform public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a1', '00000000-0000-0000-0000-000000000000', 1, now() + interval '1 day', now());
  raise exception 'T1 FAIL: an authenticated session called coupon_redeem_open';
exception when insufficient_privilege then raise notice 'T1 PASS (b): authenticated cannot EXECUTE coupon_redeem_open'; end $$;
do $$ begin
  perform public.coupon_redeem_finish('00000000-0000-0000-0000-000000000000', true, null);
  raise exception 'T1 FAIL: an authenticated session called coupon_redeem_finish';
exception when insufficient_privilege then raise notice 'T1 PASS (c): authenticated cannot EXECUTE coupon_redeem_finish'; end $$;
do $$ begin
  insert into public.coupon_redemptions (coupon_code, kind, points, list_net_halalas, discount_halalas, receipt_number)
  values ('X', 'points', 1, 100, 100, 'NZ-FAKE');
  raise exception 'T1 FAIL: an authenticated session wrote a redemption';
exception when insufficient_privilege then raise notice 'T1 PASS (d): authenticated cannot write coupon_redemptions'; end $$;
reset role;

-- T2 a points code: granted in one go — the gift lot, the 3 amounts, the receipt, the use counted
do $$
declare r jsonb; lot record; red record;
begin
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a1', pg_temp.cid('PTS500'), null, now() + interval '90 days', now());
  if r ->> 'status' <> 'granted' or (r ->> 'points')::int <> 500 then raise exception 'T2 FAIL: answered %', r; end if;
  select * into red from public.coupon_redemptions where id = (r ->> 'id')::uuid;
  if red.status <> 'granted' or red.list_net_halalas <> 50000 or red.discount_halalas <> 50000 or red.net_halalas <> 0 or red.vat_halalas <> 0 then
    raise exception 'T2 FAIL: the record is not full price → 100 %% → 0: %', row_to_json(red);
  end if;
  if red.receipt_number is null or red.receipt_number not like 'NZ-%' then raise exception 'T2 FAIL: no receipt number'; end if;
  select * into lot from public.points_lots where id = red.points_lot_id;
  if lot.id is null or lot.points_total <> 500 or lot.source <> 'gift' or lot.user_id <> '00000000-0000-0000-0000-0000000016a1' then
    raise exception 'T2 FAIL: the gift lot is wrong: %', row_to_json(lot);
  end if;
  if (select used_count from public.coupons where code = 'PTS500') <> 1 then raise exception 'T2 FAIL: used_count did not move'; end if;
  if not exists (select 1 from public.coupon_usage where order_id = 'redemption:' || red.id::text) then raise exception 'T2 FAIL: no coupon_usage row'; end if;

  -- T3 the same user again → already_used, nothing new
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a1', pg_temp.cid('PTS500'), null, now() + interval '90 days', now());
  if r ->> 'status' <> 'already_used' then raise exception 'T3 FAIL: a second redemption answered %', r; end if;
  if (select count(*) from public.points_lots where user_id = '00000000-0000-0000-0000-0000000016a1' and source = 'gift') <> 1 then
    raise exception 'T3 FAIL: a second lot was credited';
  end if;
  raise notice 'T2 PASS: a points code grants its lot once, recorded full price → 100 %% → 0 with a receipt';
  raise notice 'T3 PASS: once per user';
end $$;

-- T4 expired / switched off / a discount code / unknown → refused, nothing written
do $$
declare r jsonb; n int;
begin
  select count(*) into n from public.coupon_redemptions;
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a2', pg_temp.cid('OLDPTS'), null, now() + interval '90 days', now());
  if r ->> 'status' <> 'invalid' then raise exception 'T4 FAIL: expired → %', r; end if;
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a2', pg_temp.cid('OFFPTS'), null, now() + interval '90 days', now());
  if r ->> 'status' <> 'invalid' then raise exception 'T4 FAIL: inactive → %', r; end if;
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a2', pg_temp.cid('DISC10'), null, now() + interval '90 days', now());
  if r ->> 'status' <> 'not_grant' then raise exception 'T4 FAIL: a discount code → %', r; end if;
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a2', '00000000-0000-0000-0000-00000000dead', null, now() + interval '90 days', now());
  if r ->> 'status' <> 'invalid' then raise exception 'T4 FAIL: unknown → %', r; end if;
  if (select count(*) from public.coupon_redemptions) <> n then raise exception 'T4 FAIL: a refusal wrote a row'; end if;
  raise notice 'T4 PASS: expired / inactive / discount / unknown codes are refused and write nothing';
end $$;

-- T5 a plan code: audience, opened → finish granted; the use limit holds; void gives the use back
do $$
declare r jsonb; id1 uuid; t text;
begin
  -- an individual is outside eligible_user_types
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a3', pg_temp.cid('PLANPRO'), 399000, null, now());
  if r ->> 'status' <> 'invalid' then raise exception 'T5 FAIL: wrong audience → %', r; end if;
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a2', pg_temp.cid('PLANPRO'), 399000, null, now());
  if r ->> 'status' <> 'opened' or r ->> 'item_id' <> 'lawyer-pro' or r ->> 'billing' <> 'yearly' then raise exception 'T5 FAIL: open → %', r; end if;
  id1 := (r ->> 'id')::uuid;
  -- a retry before the grant finished resumes the same row
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a2', pg_temp.cid('PLANPRO'), 399000, null, now());
  if r ->> 'status' <> 'resume' or (r ->> 'id')::uuid <> id1 then raise exception 'T5 FAIL: retry → %', r; end if;
  -- max_uses = 1: another lawyer is refused while it is held
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a4', pg_temp.cid('PLANPRO'), 399000, null, now());
  if r ->> 'status' <> 'exhausted' then raise exception 'T5 FAIL: over the limit → %', r; end if;
  -- the grant failed → void: the use comes back
  t := public.coupon_redeem_finish(id1, false, null);
  if t <> 'void' or (select used_count from public.coupons where code = 'PLANPRO') <> 0 then raise exception 'T5 FAIL: void → % / used %', t, (select used_count from public.coupons where code = 'PLANPRO'); end if;
  r := public.coupon_redeem_open('00000000-0000-0000-0000-0000000016a4', pg_temp.cid('PLANPRO'), 399000, null, now());
  if r ->> 'status' <> 'opened' then raise exception 'T5 FAIL: after the void the other lawyer got %', r; end if;
  t := public.coupon_redeem_finish((r ->> 'id')::uuid, true, '00000000-0000-0000-0000-00000000aaaa');
  if t <> 'granted' then raise exception 'T5 FAIL: finish → %', t; end if;
  t := public.coupon_redeem_finish((r ->> 'id')::uuid, false, null);
  if t <> 'granted' then raise exception 'T5 FAIL: a late void changed a granted row (%)', t; end if;
  if (select list_net_halalas from public.coupon_redemptions where id = (r ->> 'id')::uuid) <> 399000 then raise exception 'T5 FAIL: the full price'; end if;
  raise notice 'T5 PASS: plan code — audience, open / resume / finish, the use limit, void gives the use back';
end $$;

-- T6 the CHECK refuses anything but full price → 100 % → 0
do $$ begin
  insert into public.coupon_redemptions (coupon_code, kind, points, list_net_halalas, discount_halalas, net_halalas, receipt_number)
  values ('X', 'points', 1, 100, 50, 50, 'NZ-T6');
  raise exception 'T6 FAIL: a partial discount was stored';
exception when check_violation then raise notice 'T6 PASS: coupon_redemptions stores only a full discount (net 0, VAT 0)'; end $$;

-- T7 a signed-in user reads his own redemptions only, never user_id
select set_config('test.uid', '00000000-0000-0000-0000-0000000016a1', false);
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.coupon_redemptions;
  if n <> 1 then raise exception 'T7 FAIL: a1 sees % redemptions (expected his 1)', n; end if;
  begin
    perform user_id from public.coupon_redemptions;
    raise exception 'T7 FAIL: user_id is readable';
  exception when insufficient_privilege then null; end;
  raise notice 'T7 PASS: own rows only, user_id not readable';
end $$;
reset role;
