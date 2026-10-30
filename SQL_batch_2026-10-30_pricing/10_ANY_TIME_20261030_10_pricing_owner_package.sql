-- =============================================================================
-- Migration: 20261030_10_pricing_owner_package.sql
-- =============================================================================
-- PURPOSE (owner package of 30 Oct 2026, answers ٢٩٩–٣٠٦)
--   The price book (src/lib/pricing/priceBook.ts) now holds the revised final
--   pricing doc: the smart individual plan at 29 / 79 / 149 / 249 SAR (٣٠١),
--   the two firm plans also quarterly and half-yearly (doc §6أ). Checkout
--   charges from the book, never from this table; subscription_plans is what
--   the admin MRR figures and the admin user page read
--   (src/lib/payments/planRowPrice.ts). This file puts the same listed prices
--   there, and stamps NEWCLIENT with its first-paid-order rule (٣٠٥).
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless subscription_plans has price_quarterly /
--      price_semiannual (20261026_10) and the seven plan rows exist
--      (20261022_10 §6). Nothing changes when it refuses.
--   2. subscription_plans: price_monthly / price_quarterly / price_semiannual /
--      price_yearly of the seven plans = the book's LISTED prices (null = not
--      sold in that cycle). The professionals' monthly price stays listed: it
--      is retired, not deleted (old orders, receipts, admin). A row that
--      already holds these prices is not touched (no updated_at bump).
--      Launch prices (٣٠٣) are NOT written here: they are dated, and the
--      server decides them per request.
--   3. coupons: NEWCLIENT gets metadata.first_paid_order_only = true. The code
--      applies the rule to NEWCLIENT by its code anyway
--      (couponRules.isFirstOrderCoupon); the stamp makes the rule visible on
--      the row. Nothing else of the coupon changes (value, minimum, cap,
--      active stay as the admin left them). Skipped when there is no
--      NEWCLIENT row.
--   4. Raising verify, then the SELECT at the very end shows the result (the
--      SQL editor hides NOTICEs).
--
-- DEPLOY ORDER — ANY TIME, before or after the deploy of this batch. Checkout
--   does not read these columns; before this file runs the admin MRR shows
--   the old ind-ai price (39 / 390), nothing else.
--
-- ROLLBACK (the prices before this file)
--   update public.subscription_plans set price_monthly = 39, price_quarterly = null,
--     price_semiannual = null, price_yearly = 390 where id = 'ind-ai';
--   update public.subscription_plans set price_quarterly = null, price_semiannual = null
--     where id in ('firm-basic', 'firm-enterprise');
--   update public.coupons set metadata = metadata - 'first_paid_order_only' where upper(code) = 'NEWCLIENT';
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites ──────────────────────────────────────────────────────────
do $$
declare
  missing text;
begin
  if to_regclass('public.subscription_plans') is null then
    raise exception '20261030_10: public.subscription_plans does not exist — run 20260603_phase1_003_subscriptions_billing.sql first';
  end if;
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'subscription_plans'
         and column_name in ('price_quarterly', 'price_semiannual')) <> 2 then
    raise exception '20261030_10: subscription_plans has no price_quarterly / price_semiannual — run 20261026_10_billing_cycles.sql first';
  end if;
  select string_agg(v.id, ', ') into missing
    from (values ('ind-ai'), ('ind-preventive'), ('ind-litigation'), ('lawyer-pro'),
                 ('consultant-independent'), ('firm-basic'), ('firm-enterprise')) as v(id)
   where not exists (select 1 from public.subscription_plans p where p.id = v.id);
  if missing is not null then
    raise exception '20261030_10: subscription_plans has no row for % — run 20261022_10_payments_core.sql first; nothing changed', missing;
  end if;
end $$;

-- ── 2. The listed prices of the price book (SAR; null = not sold in that cycle) ──
-- One row per plan: (id, monthly, quarterly, semiannual, yearly).
update public.subscription_plans p
   set price_monthly    = v.m,
       price_quarterly  = v.q,
       price_semiannual = v.h,
       price_yearly     = v.y
  from (values
    ('ind-ai',                 29::numeric,  79::numeric,  149::numeric,  249::numeric),
    ('ind-preventive',         149,          null,         null,          1490),
    ('ind-litigation',         399,          null,         null,          3990),
    ('lawyer-pro',             399,          null,         null,          3990),
    ('consultant-independent', 399,          null,         null,          3990),
    ('firm-basic',             990,          2990,         5490,          9900),
    ('firm-enterprise',        1490,         4490,         8190,          14900)
  ) as v(id, m, q, h, y)
 where p.id = v.id
   and (p.price_monthly, p.price_quarterly, p.price_semiannual, p.price_yearly)
       is distinct from (v.m, v.q, v.h, v.y);

-- ── 3. NEWCLIENT: the buyer's first paid order on the platform (٣٠٥) ─────────
update public.coupons
   set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('first_paid_order_only', true)
 where upper(code) = 'NEWCLIENT'
   and coalesce(metadata->>'first_paid_order_only', '') <> 'true';

-- ── 4. Verify ─────────────────────────────────────────────────────────────────
do $$
declare
  bad text;
begin
  select string_agg(p.id, ', ') into bad
    from public.subscription_plans p
    join (values
      ('ind-ai',                 29::numeric,  79::numeric,  149::numeric,  249::numeric),
      ('ind-preventive',         149,          null,         null,          1490),
      ('ind-litigation',         399,          null,         null,          3990),
      ('lawyer-pro',             399,          null,         null,          3990),
      ('consultant-independent', 399,          null,         null,          3990),
      ('firm-basic',             990,          2990,         5490,          9900),
      ('firm-enterprise',        1490,         4490,         8190,          14900)
    ) as v(id, m, q, h, y) on v.id = p.id
   where (p.price_monthly, p.price_quarterly, p.price_semiannual, p.price_yearly)
         is distinct from (v.m, v.q, v.h, v.y);
  if bad is not null then
    raise exception '20261030_10 verify: the prices of % are not the book''s', bad;
  end if;
  if exists (select 1 from public.coupons
              where upper(code) = 'NEWCLIENT'
                and coalesce(metadata->>'first_paid_order_only', '') <> 'true') then
    raise exception '20261030_10 verify: NEWCLIENT is not stamped first_paid_order_only';
  end if;
  raise notice '20261030_10 verify: OK — subscription_plans holds the book''s prices (ind-ai 29/79/149/249; firms quarterly and half-yearly); NEWCLIENT stamped first_paid_order_only';
end $$;

commit;

-- ── The check you can see in the SQL editor ───────────────────────────────────
-- Expect 7 plan rows with these prices, then one NEWCLIENT row with
-- first_paid_order_only = true (no NEWCLIENT row is fine: nothing to stamp).
select id, price_monthly, price_quarterly, price_semiannual, price_yearly
  from public.subscription_plans
 where id in ('ind-ai', 'ind-preventive', 'ind-litigation', 'lawyer-pro',
              'consultant-independent', 'firm-basic', 'firm-enterprise')
 order by id;
select code, active, metadata->>'first_paid_order_only' as first_paid_order_only
  from public.coupons
 where upper(code) = 'NEWCLIENT';
