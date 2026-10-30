-- pricing_owner_package.test.sql — proves 20261030_10 (owner package of 30 Oct
-- 2026, answers ٢٩٩–٣٠٦) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (the second run must be a no-op); the _verify section runs
-- before it (it must only NOTICE "not applied yet") and after (it must pass).
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_pricing_block.sql
--   sed -n '/^-- >>> verify:pricing_owner_package/,/^-- <<< verify:pricing_owner_package/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $M/20261026_10_billing_cycles.sql \
--     $M/20261026_20_coupons_server_only.sql \
--     "$B" \
--     $M/20261030_10_pricing_owner_package.sql \
--     $M/20261030_10_pricing_owner_package.sql \
--     "$B" \
--     $R/pricing_owner_package.test.sql
-- Why each link: 20260603_phase1_003 creates subscription_plans and coupons
-- and seeds NEWCLIENT; 20260627 + 20261019_10 + 20261022_10 (the
-- payments_core chain) seed the seven plans sold online at 39 / 390 for
-- ind-ai; 20261026_10 adds price_quarterly / price_semiannual; 20261026_20
-- gives coupons its server-only shape.
--
-- NEGATIVE CONTROL (must FAIL): the chain without 20261026_10 → the migration
-- raises "20261030_10: subscription_plans has no price_quarterly /
-- price_semiannual — run 20261026_10_billing_cycles.sql first".
--
-- Every assertion RAISES on failure.

-- T1 the seven plans hold the price book's listed prices (priceBook.ts)
do $$
declare bad text;
begin
  select string_agg(v.id, ', ') into bad
    from (values
      ('ind-ai',                 29::numeric,  79::numeric,  149::numeric,  249::numeric),
      ('ind-preventive',         149,          null,         null,          1490),
      ('ind-litigation',         399,          null,         null,          3990),
      ('lawyer-pro',             399,          null,         null,          3990),
      ('consultant-independent', 399,          null,         null,          3990),
      ('firm-basic',             990,          2990,         5490,          9900),
      ('firm-enterprise',        1490,         4490,         8190,          14900)
    ) as v(id, m, q, h, y)
    left join public.subscription_plans p on p.id = v.id
   where p.id is null
      or (p.price_monthly, p.price_quarterly, p.price_semiannual, p.price_yearly)
         is distinct from (v.m, v.q, v.h, v.y);
  if bad is not null then
    raise exception 'T1 FAIL: prices of % are not the book''s', bad;
  end if;
  raise notice 'T1 PASS: subscription_plans — ind-ai 29/79/149/249, firms quarterly and half-yearly, the rest unchanged';
end $$;

-- T2 NEWCLIENT is stamped and nothing else of it moved; no other coupon is touched
do $$
declare n int;
begin
  if not exists (select 1 from public.coupons where upper(code) = 'NEWCLIENT') then
    raise exception 'T2 FAIL: the chain seeds no NEWCLIENT row — the stamp was not exercised';
  end if;
  if exists (select 1 from public.coupons where upper(code) = 'NEWCLIENT'
                and coalesce(metadata->>'first_paid_order_only', '') <> 'true') then
    raise exception 'T2 FAIL: NEWCLIENT is not stamped first_paid_order_only';
  end if;
  select count(*) into n from public.coupons
   where upper(code) <> 'NEWCLIENT' and metadata ? 'first_paid_order_only';
  if n > 0 then
    raise exception 'T2 FAIL: % other coupon(s) were stamped', n;
  end if;
  raise notice 'T2 PASS: NEWCLIENT stamped first_paid_order_only; no other coupon touched';
end $$;

-- T3 a third run changes no row (the WHERE makes a re-run a true no-op)
do $$
declare before_plans text; before_coupons text; after_plans text; after_coupons text;
begin
  select string_agg(format('%s:%s', id, xmin), ',' order by id) into before_plans from public.subscription_plans;
  select string_agg(format('%s:%s', id, xmin), ',' order by id) into before_coupons from public.coupons;
  update public.subscription_plans p
     set price_monthly = v.m, price_quarterly = v.q, price_semiannual = v.h, price_yearly = v.y
    from (values ('ind-ai', 29::numeric, 79::numeric, 149::numeric, 249::numeric)) as v(id, m, q, h, y)
   where p.id = v.id
     and (p.price_monthly, p.price_quarterly, p.price_semiannual, p.price_yearly) is distinct from (v.m, v.q, v.h, v.y);
  update public.coupons
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('first_paid_order_only', true)
   where upper(code) = 'NEWCLIENT' and coalesce(metadata->>'first_paid_order_only', '') <> 'true';
  select string_agg(format('%s:%s', id, xmin), ',' order by id) into after_plans from public.subscription_plans;
  select string_agg(format('%s:%s', id, xmin), ',' order by id) into after_coupons from public.coupons;
  if before_plans is distinct from after_plans or before_coupons is distinct from after_coupons then
    raise exception 'T3 FAIL: the migration''s statements rewrote rows on a re-run';
  end if;
  raise notice 'T3 PASS: re-running the statements touches no row';
end $$;
