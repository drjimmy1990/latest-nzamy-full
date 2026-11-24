-- l14_pricing.test.sql — proves 20261204_20 (batch l14, builder «pricing»):
--   A. subscription_plans: lawyer-pro is «إدارة المكتب» 399 (listed) / 1,200 /
--      2,190 / 3,990; lawyer-bundle (pro, lawyer) 0 / 2,712 / 5,083 / 9,333.
--   B. finish_payment_refund: a refunded bundle PLAN order closes the library
--      grant it made; a later library grant of another order stays open; a
--      library order still closes its own grant; session roles cannot run it.
--   C. admin_pricing_catalog: #7 / #8 rows changed and stamped; a row an admin
--      had edited before is kept; a stamped row an admin edits afterwards is
--      not touched by a re-run.
--   D. owner ٢٠١: the founder-invite setting, the reader and an invitee's lot
--      are library_agent only.
--
-- CHAIN (run.sh, postgres:16) — founder_l13.test.sql's chain (it builds
-- founder_invites and the points wallets), then 20261026_10 (cycles), the
-- refund functions, the admin_pricing_catalog seed of 20260518 (extracted, as
-- in contract_draft_points_price.test.sql), this file's before-prelude,
-- 20261204_20 TWICE with an admin edit between, and the _verify block. From
-- the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   F=$D/admin_pricing_catalog_20260518.sql; B=$D/verify_l14_pricing.sql
--   sed -n -e '/^create table if not exists public.admin_pricing_catalog/,/^);/p' \
--          -e '/^alter table public.admin_pricing_catalog enable/p' \
--          -e '/^create policy "public read enabled individual pricing"/,/;/p' \
--          -e '/^insert into public.admin_pricing_catalog/,/updated_at = now();/p' \
--          $M/20260518_client_workflow_backend_ready.sql > "$F"
--   sed -n '/^-- >>> verify:l14_pricing/,/^-- <<< verify:l14_pricing/p' $M/_verify.sql > "$B"
--   bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql $T/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql $M/20261027_10_ai_runs.sql $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261122_10_founder_campaign_nov18.sql $M/20261124_10_founder_hold_15min_and_library_points.sql \
--     $M/20261017_44_test_accounts_never_listed.sql $M/20261125_50_demo_accounts.sql \
--     $M/20261127_10_founder_pay_before_verification.sql $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql $M/20261127_40_points_wallets.sql \
--     $T/prelude_founder_l13.sql $M/20261203_20_founder_invites.sql \
--     $M/20261026_10_billing_cycles.sql \
--     $T/prelude_payment_refunds.sql $M/20261022_32_payment_refunds.sql \
--     "$F" \
--     $T/prelude_l14_pricing_before.sql \
--     $M/20261204_20_l14_pricing.sql \
--     $T/prelude_l14_pricing_between_runs.sql \
--     $M/20261204_20_l14_pricing.sql \
--     "$B" \
--     $T/l14_pricing.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261204_20
-- files and the between-prelude → "T0 FAIL: 20261204_20 is not applied".
\set ON_ERROR_STOP on

-- T0 applied
do $$
begin
  if not exists (select 1 from public.subscription_plans where id = 'lawyer-bundle') then
    raise exception 'T0 FAIL: 20261204_20 is not applied';
  end if;
end $$;

-- A. the plans
do $$
begin
  if (select (price_monthly, price_quarterly, price_semiannual, price_yearly, tier, name_ar)
        from public.subscription_plans where id = 'lawyer-pro')
     is distinct from (399::numeric(12,2), 1200::numeric(12,2), 2190::numeric(12,2), 3990::numeric(12,2), 'pro'::text, 'إدارة المكتب'::text) then
    raise exception 'T1 FAIL: lawyer-pro is not «إدارة المكتب» 399 / 1,200 / 2,190 / 3,990';
  end if;
  if (select (price_monthly, price_quarterly, price_semiannual, price_yearly, tier, audience)
        from public.subscription_plans where id = 'lawyer-bundle')
     is distinct from (0::numeric(12,2), 2712::numeric(12,2), 5083::numeric(12,2), 9333::numeric(12,2), 'pro'::text, 'lawyer'::text) then
    raise exception 'T2 FAIL: lawyer-bundle is not 0 / 2,712 / 5,083 / 9,333 (pro, lawyer)';
  end if;
  if (select price_quarterly from public.subscription_plans where id = 'firm-basic') <> 2990
     or (select price_monthly from public.subscription_plans where id = 'ind-ai') <> 29 then
    raise exception 'T3 FAIL: the other plans are not the book''s';
  end if;
  raise notice 'l14_pricing A: T1-T3 PASS';
end $$;

-- B. refunds: the bundle's library grant closes with its plan order
set role authenticated;
do $$ begin
  begin
    perform public.finish_payment_refund('00000000-0000-0000-0000-0000000014c1', 'x', 'refund');
    raise exception 'T4 FAIL: a session ran finish_payment_refund';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status, live, fulfilled_at) values
 ('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-0000000014a1', 'plan', 'lawyer-bundle', 'quarterly', 271200, 40680, 311880, 'exclusive', 'paid', false, now()),
 ('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-0000000014a1', 'library', 'lib-q2', 'once', 379000, 56850, 435850, 'exclusive', 'paid', false, now());
insert into public.subscriptions (user_id, plan_id, tier, billing_cycle, status, current_period_end, metadata) values
 ('00000000-0000-0000-0000-0000000014a1', 'lawyer-bundle', 'pro', 'quarterly', 'active', now() + interval '3 months',
  '{"order_id":"00000000-0000-0000-0000-0000000014c1"}');
insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at, order_id) values
 ('00000000-0000-0000-0000-0000000014a1', 'lib-q1', 'purchase', now() - interval '1 day', now() + interval '89 days', '00000000-0000-0000-0000-0000000014c1'),
 ('00000000-0000-0000-0000-0000000014a1', 'lib-q2', 'purchase', now() + interval '89 days', now() + interval '269 days', '00000000-0000-0000-0000-0000000014c2');
insert into public.points_lots (user_id, source, points_total, points_left, expires_at, order_id, wallet_scope) values
 ('00000000-0000-0000-0000-0000000014a1', 'plan', 50, 50, now() + interval '89 days', '00000000-0000-0000-0000-0000000014c1', 'library_agent');

do $$
declare job jsonb; result jsonb;
begin
  job := public.claim_payment_refund('00000000-0000-0000-0000-0000000014c1', '00000000-0000-0000-0000-00000000f001', 'refund');
  result := public.finish_payment_refund('00000000-0000-0000-0000-0000000014c1', job ->> 'token', 'refund');
  if (select ends_at from public.library_access_grants where order_id = '00000000-0000-0000-0000-0000000014c1') > now() then
    raise exception 'T5 FAIL: the bundle''s library grant outlived its refunded plan order';
  end if;
  if (select status from public.subscriptions where metadata ->> 'order_id' = '00000000-0000-0000-0000-0000000014c1') <> 'cancelled' then
    raise exception 'T6 FAIL: the bundle''s subscription was not cancelled';
  end if;
  if (result ->> 'points_revoked')::int <> 50 then
    raise exception 'T7 FAIL: the bundle''s library-assistant points were not revoked: %', result;
  end if;
  if (select ends_at from public.library_access_grants where order_id = '00000000-0000-0000-0000-0000000014c2') <= now() + interval '200 days' then
    raise exception 'T8 FAIL: another order''s library grant was touched';
  end if;
  job := public.claim_payment_refund('00000000-0000-0000-0000-0000000014c2', '00000000-0000-0000-0000-00000000f001', 'void');
  perform public.finish_payment_refund('00000000-0000-0000-0000-0000000014c2', job ->> 'token', 'void');
  -- that grant started in the future (stacked): closing it leaves a one-second window at its start
  if (select ends_at > starts_at + interval '1 second' from public.library_access_grants where order_id = '00000000-0000-0000-0000-0000000014c2') then
    raise exception 'T9 FAIL: a library order no longer closes its own grant';
  end if;
  raise notice 'l14_pricing B: T4-T9 PASS';
end $$;

-- C. the catalogue rows
do $$
begin
  if (select (base_price, price_mode, metadata ->> 'priceNote', metadata ->> 'owner_l14')
        from public.admin_pricing_catalog where service_id = 'case-study')
     is distinct from (1500::numeric(12,2), 'starting_from'::text, 'يُؤكَّد السعر بعد الاطلاع على الملف'::text, '20261204_20'::text) then
    raise exception 'T10 FAIL: case-study is not 1,500 with the plain note, stamped';
  end if;
  if (select base_price from public.admin_pricing_catalog where service_id = 'cassation') <> 2500
     or (select base_price from public.admin_pricing_catalog where service_id = 'enforce-judgment') <> 950
     or (select metadata ->> 'priceNote' from public.admin_pricing_catalog where service_id = 'enforce-judgment') like '2x%' then
    raise exception 'T11 FAIL: cassation / enforce-judgment';
  end if;
  if (select base_price from public.admin_pricing_catalog where service_id = 'appeal') <> 2222
     or (select metadata ? 'owner_l14' from public.admin_pricing_catalog where service_id = 'appeal') then
    raise exception 'T12 FAIL: an admin''s own appeal price was overwritten';
  end if;
  if (select base_price from public.admin_pricing_catalog where service_id = 'file-lawsuit') <> 650 then
    raise exception 'T13 FAIL: the re-run touched a stamped row an admin edited';
  end if;
  if exists (select 1 from public.admin_pricing_catalog
              where service_id in ('ai-consult', 'contract-analyze', 'ai-case-eval')
                and (price_mode <> 'points' or base_price <> 0 or metadata ? 'includedByPlan'
                     or coalesce(metadata ->> 'priceNote', '') ~ 'ر\.س')) then
    raise exception 'T14 FAIL: an individual AI card still has a riyal price or a plan inclusion';
  end if;
  if (select metadata ->> 'route' from public.admin_pricing_catalog where service_id = 'ai-consult') <> '/ai/consult' then
    raise exception 'T15 FAIL: the other metadata keys were not kept';
  end if;
  raise notice 'l14_pricing C: T10-T15 PASS';
end $$;

-- D. owner ٢٠١
do $$
begin
  if (select value ->> 'points_scope' from public.platform_settings where key = 'founder_invites') <> 'library_agent'
     or (select (value ->> 'monthly')::int from public.platform_settings where key = 'founder_invites') <> 3 then
    raise exception 'T16 FAIL: the stored setting is not library_agent (or lost its other keys)';
  end if;
  update public.platform_settings set value = value || '{"points_scope": "general"}'::jsonb where key = 'founder_invites';
  if (select s.points_scope from public.founder_invite_settings() s) <> 'library_agent' then
    raise exception 'T17 FAIL: founder_invite_settings() still answers a stored general';
  end if;
  update public.platform_settings set value = value || '{"points_scope": "library_agent"}'::jsonb where key = 'founder_invites';
  if (select wallet_scope from public.points_lots where id = '00000000-0000-0000-0000-0000000014b1') <> 'library_agent' then
    raise exception 'T18 FAIL: the invitee''s lot is still in the general wallet';
  end if;
  if has_function_privilege('authenticated', 'public.founder_invite_settings()', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_invite_settings()', 'EXECUTE') then
    raise exception 'T19 FAIL: a session may read the founder invite settings';
  end if;
  raise notice 'l14_pricing D: T16-T19 PASS';
end $$;

-- E. the _verify block's four checks all answer ok (it ran just before this file)
do $$ begin raise notice 'l14_pricing: ALL PASS'; end $$;
