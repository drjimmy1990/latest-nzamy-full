-- l18_pay_free_activation.test.sql — proves 20261208_30 (batch l18-pay, owner
-- ق٢٦-١١ settling س٢٢٤) and 20261208_31 (billing_company identity):
--   a discount code that covers the whole price opens a 0 SAR redemption once
--   per user under a row lock, never for a partial discount, a top-up kind or
--   another audience; the library pass of a redemption is granted exactly once
--   with its points; both functions are server-only; billing_company gets the
--   three official values and its vat_number is never touched.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The two new
-- migrations run TWICE (idempotent); the _verify block runs before them (its
-- checks print f, never raise) and after. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l18_pay.sql
--   sed -n '/^-- >>> verify:l18_pay/,/^-- <<< verify:l18_pay/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261127_40_points_wallets.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261126_60_pay_prorata_coupon_lock.sql \
--     $M/20261206_30_pay_coupon_redemptions.sql \
--     $R/prelude_l18_billing_vat.sql \
--     "$B" \
--     $M/20261208_30_l18_pay_free_activation.sql $M/20261208_31_l18_billing_company_identity.sql \
--     $M/20261208_30_l18_pay_free_activation.sql $M/20261208_31_l18_billing_company_identity.sql \
--     "$B" \
--     $R/l18_pay_free_activation.test.sql
--
-- NEGATIVE CONTROL: the chain without the 20261208_30 files → "T0 FAIL".
-- Every assertion RAISES on failure.

-- fixture: the cap ceiling of 20261204_60 (up to 100 %), which this chain does not load
alter table public.coupons drop constraint if exists coupons_max_discount_pct_check;
alter table public.coupons add constraint coupons_max_discount_pct_check check (max_discount_pct > 0 and max_discount_pct <= 100);

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000018a1'), ('00000000-0000-0000-0000-0000000018a2'),
  ('00000000-0000-0000-0000-0000000018a3'), ('00000000-0000-0000-0000-0000000018a4');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000018a1', 'individual', 'a1'), ('00000000-0000-0000-0000-0000000018a2', 'lawyer', 'a2'),
  ('00000000-0000-0000-0000-0000000018a3', 'individual', 'a3'), ('00000000-0000-0000-0000-0000000018a4', 'lawyer', 'a4');

insert into public.coupons (code, discount_type, discount_value, min_order_amount, eligible_user_types,
                            max_uses, used_count, valid_from, valid_until, active, max_discount_pct, excluded_kinds, metadata) values
  ('FULL100', 'percentage', 100, 0, '{}', 2, 0, now() - interval '1 day', now() + interval '30 days', true, 100, '{topup,service}', '{}'),
  ('OFF5000', 'fixed', 5000, 0, '{}', 5, 0, now() - interval '1 day', now() + interval '30 days', true, 100, '{topup,service}', '{}'),
  ('CAP25', 'fixed', 5000, 0, '{}', 5, 0, now() - interval '1 day', now() + interval '30 days', true, 25, '{topup}', '{}'),
  ('HALF', 'percentage', 50, 0, '{}', 5, 0, now() - interval '1 day', now() + interval '30 days', true, 50, '{topup,service}', '{}'),
  ('LAWYERS', 'percentage', 100, 0, '{lawyer}', 5, 0, now() - interval '1 day', now() + interval '30 days', true, 100, '{topup,service}', '{}'),
  ('NOLIB', 'percentage', 100, 0, '{}', 5, 0, now() - interval '1 day', now() + interval '30 days', true, 100, '{topup,service,library}', '{}'),
  ('PTSX', 'points_grant', 0, 0, '{}', 5, 0, now() - interval '1 day', now() + interval '30 days', true, 25, '{topup}', '{}');

create or replace function pg_temp.cid(code text) returns uuid language sql as $$ select id from public.coupons c where c.code = cid.code $$;

-- T0 the objects exist (negative control stops here)
do $$
begin
  if to_regprocedure('public.coupon_redeem_full_open(uuid, uuid, text, text, text, integer, timestamptz)') is null
     or to_regprocedure('public.coupon_redeem_grant_library(uuid, text, integer, integer, timestamptz)') is null then
    raise exception 'T0 FAIL: 20261208_30 not applied';
  end if;
  raise notice 'T0 PASS: coupon_redeem_full_open / coupon_redeem_grant_library exist';
end $$;

-- T1 sessions cannot call the new functions
select set_config('test.uid', '00000000-0000-0000-0000-0000000018a1', false);
set role authenticated;
do $$ begin
  perform public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a1', pg_temp.cid('FULL100'), 'plan', 'ind-ai', 'yearly', 24900, now());
  raise exception 'T1 FAIL: an authenticated session called coupon_redeem_full_open';
exception when insufficient_privilege then raise notice 'T1 PASS (a): authenticated cannot EXECUTE coupon_redeem_full_open'; end $$;
do $$ begin
  perform public.coupon_redeem_grant_library('00000000-0000-0000-0000-000000000000', 'lib-q1', 90, 50, now());
  raise exception 'T1 FAIL: an authenticated session called coupon_redeem_grant_library';
exception when insufficient_privilege then raise notice 'T1 PASS (b): authenticated cannot EXECUTE coupon_redeem_grant_library'; end $$;
reset role;
set role anon;
do $$ begin
  perform public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a1', pg_temp.cid('FULL100'), 'plan', 'ind-ai', 'yearly', 24900, now());
  raise exception 'T1 FAIL: anon called coupon_redeem_full_open';
exception when insufficient_privilege then raise notice 'T1 PASS (c): anon cannot EXECUTE coupon_redeem_full_open'; end $$;
reset role;

-- T2 a 100 % code: opened, the 3 amounts, the receipt, the use counted; resume; already used once granted
do $$
declare r jsonb; red record; t text;
begin
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a1', pg_temp.cid('FULL100'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'opened' or r ->> 'item_id' <> 'ind-ai' or r ->> 'billing' <> 'yearly' then raise exception 'T2 FAIL: answered %', r; end if;
  select * into red from public.coupon_redemptions where id = (r ->> 'id')::uuid;
  if red.list_net_halalas <> 24900 or red.discount_halalas <> 24900 or red.net_halalas <> 0 or red.vat_halalas <> 0 or red.kind <> 'plan' then
    raise exception 'T2 FAIL: the record is not full price → 100 %% → 0: %', row_to_json(red);
  end if;
  if red.receipt_number not like 'NZ-%' then raise exception 'T2 FAIL: no receipt number'; end if;
  if (select used_count from public.coupons where code = 'FULL100') <> 1 then raise exception 'T2 FAIL: used_count did not move'; end if;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a1', pg_temp.cid('FULL100'), 'plan', 'lib-q1', 'once', 199000, now());
  if r ->> 'status' <> 'resume' or (r ->> 'id')::uuid <> red.id or r ->> 'item_id' <> 'ind-ai' then raise exception 'T2 FAIL: a retry → %', r; end if;
  t := public.coupon_redeem_finish(red.id, true, null);
  if t <> 'granted' then raise exception 'T2 FAIL: finish → %', t; end if;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a1', pg_temp.cid('FULL100'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'already_used' then raise exception 'T2 FAIL: a second activation → %', r; end if;
  raise notice 'T2 PASS: a 100 %% code opens a 0 SAR redemption with its receipt, resumes, then is used once';
end $$;

-- T3 a fixed amount ≥ the price (cap 100) → opened; a fixed code clipped by a 25 % cap, a 50 % code → not_full
do $$
declare r jsonb; n int;
begin
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a3', pg_temp.cid('OFF5000'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'opened' then raise exception 'T3 FAIL: 5,000 off 249 → %', r; end if;
  select count(*) into n from public.coupon_redemptions;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a3', pg_temp.cid('CAP25'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'not_full' then raise exception 'T3 FAIL: a 25 %% cap → %', r; end if;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a3', pg_temp.cid('HALF'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'not_full' then raise exception 'T3 FAIL: 50 %% → %', r; end if;
  if (select count(*) from public.coupon_redemptions) <> n then raise exception 'T3 FAIL: a refusal wrote a row'; end if;
  raise notice 'T3 PASS: a fixed amount ≥ the price is free; a clipped or partial code is refused (not_full) and writes nothing';
end $$;

-- T4 audience, excluded kinds, a grant code, the use limit, bad arguments
do $$
declare r jsonb;
begin
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a3', pg_temp.cid('LAWYERS'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'invalid' then raise exception 'T4 FAIL: wrong audience → %', r; end if;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a2', pg_temp.cid('NOLIB'), 'library', 'lib-q1', 'once', 199000, now());
  if r ->> 'status' <> 'not_for_item' then raise exception 'T4 FAIL: an excluded kind → %', r; end if;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a2', pg_temp.cid('PTSX'), 'plan', 'ind-ai', 'yearly', 24900, now());
  if r ->> 'status' <> 'not_discount' then raise exception 'T4 FAIL: a points code → %', r; end if;
  -- FULL100 has max_uses 2 and one use: a4 takes the last, a2 is refused
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a4', pg_temp.cid('FULL100'), 'plan', 'lawyer-pro', 'yearly', 399000, now());
  if r ->> 'status' <> 'opened' then raise exception 'T4 FAIL: the last use → %', r; end if;
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a2', pg_temp.cid('FULL100'), 'plan', 'lawyer-pro', 'yearly', 399000, now());
  if r ->> 'status' <> 'exhausted' then raise exception 'T4 FAIL: over the limit → %', r; end if;
  begin
    perform public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a2', pg_temp.cid('OFF5000'), 'topup', 'topup-500', 'once', 50000, now());
    raise exception 'T4 FAIL: a top-up kind was accepted';
  exception when sqlstate '22023' then null; end;
  raise notice 'T4 PASS: audience, excluded kinds, a grant code, the use limit and a top-up kind are refused';
end $$;

-- T5 the library pass of a redemption: granted once with its points; a retry is "done"
do $$
declare r jsonb; g jsonb; g2 jsonb; rid uuid; n_grants int; n_lots int;
begin
  r := public.coupon_redeem_full_open('00000000-0000-0000-0000-0000000018a2', pg_temp.cid('OFF5000'), 'library', 'lib-q1', 'once', 199000, now());
  if r ->> 'status' <> 'opened' then raise exception 'T5 FAIL: open → %', r; end if;
  rid := (r ->> 'id')::uuid;
  g := public.coupon_redeem_grant_library(rid, 'lib-q1', 90, 50, now());
  if g ->> 'status' <> 'granted' then raise exception 'T5 FAIL: grant → %', g; end if;
  g2 := public.coupon_redeem_grant_library(rid, 'lib-q1', 90, 50, now());
  if g2 ->> 'status' <> 'done' or g2 ->> 'grant_id' <> g ->> 'grant_id' then raise exception 'T5 FAIL: a retry → %', g2; end if;
  select count(*) into n_grants from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000018a2';
  if n_grants <> 1 then raise exception 'T5 FAIL: % library grants (expected 1)', n_grants; end if;
  if (select order_id from public.library_access_grants where id = (g ->> 'grant_id')::uuid) is not null then raise exception 'T5 FAIL: the pass names an order'; end if;
  if (select ends_at - starts_at from public.library_access_grants where id = (g ->> 'grant_id')::uuid) <> interval '90 days' then raise exception 'T5 FAIL: not 90 days'; end if;
  select count(*) into n_lots from public.points_lots where user_id = '00000000-0000-0000-0000-0000000018a2' and wallet_scope = 'library_agent' and points_total = 50;
  if n_lots <> 1 then raise exception 'T5 FAIL: % library-assistant lots (expected 1)', n_lots; end if;
  if (select library_grant_id from public.coupon_redemptions where id = rid)::text <> g ->> 'grant_id' then raise exception 'T5 FAIL: library_grant_id not stamped'; end if;
  perform public.coupon_redeem_finish(rid, true, null);
  -- a closed redemption with no pass cannot grant one
  begin
    perform public.coupon_redeem_grant_library((select id from public.coupon_redemptions where coupon_code = 'FULL100' and user_id = '00000000-0000-0000-0000-0000000018a1'), 'lib-q1', 90, 0, now());
    raise exception 'T5 FAIL: a closed redemption granted a pass';
  exception when sqlstate '22023' then null; end;
  raise notice 'T5 PASS: a redemption''s library pass and its points are granted exactly once, with no order';
end $$;

-- T6 billing_company: the three values set, vat_number untouched, idempotent
do $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = 'billing_company';
  if v ->> 'cr_number' <> '7049168854'
     or v ->> 'legal_name_ar' <> 'شركة نيزامي للمحاماة والاستشارات القانونية'
     or v ->> 'address_ar' <> 'مكة المكرمة، مكة المكرمة، شارع 85 العكيشية الشمالية، 24352' then
    raise exception 'T6 FAIL: billing_company = %', v;
  end if;
  if v ->> 'vat_number' is distinct from '300000000000003' then raise exception 'T6 FAIL: vat_number changed: %', v -> 'vat_number'; end if;
  if (select count(*) from jsonb_object_keys(v)) <> 4 then raise exception 'T6 FAIL: the object has % keys', (select count(*) from jsonb_object_keys(v)); end if;
  raise notice 'T6 PASS: billing_company holds the official name, address and CR; vat_number untouched; still 4 keys';
end $$;
