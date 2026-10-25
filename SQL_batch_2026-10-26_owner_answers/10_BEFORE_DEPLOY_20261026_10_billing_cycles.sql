-- =============================================================================
-- Migration: 20261026_10_billing_cycles.sql
-- =============================================================================
-- PURPOSE (owner answers of 25 Oct 2026, phase P1 — pricing foundation)
--   The owner's pricing document (§2 rule 1) sells lawyers, firms, companies,
--   establishments, NGOs and providers QUARTERLY (3 months), HALF-YEARLY
--   (6 months) or YEARLY; individuals also monthly. The code knows the two new
--   cycles since P1 (src/lib/pricing/priceBook.ts: Billing = monthly |
--   quarterly | semiannual | yearly | once; planPeriodEnd = 1 / 3 / 6 / 12
--   calendar months). The database still refuses them in two places:
--     * payment_orders.billing  — payment_orders_billing_check
--       (20261022_10:98-99: monthly / yearly / once). A quarterly checkout
--       would fail at the order insert;
--     * subscriptions.billing_cycle — its inline check
--       (20260603_phase1_003:37: monthly / yearly / custom).
--       grant_plan_subscription (20261025_10) writes billing_cycle = p_billing,
--       so without this a quarterly order would be PAID and never FULFILLED.
--   And subscription_plans prices only monthly / yearly, while admin MRR
--   (stats / ERP / corporates, src/lib/payments/planRowPrice.ts) reads the
--   price of the subscription's own cycle.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. lock_timeout 5s (ALTER TABLE … ADD CONSTRAINT takes an ACCESS
--      EXCLUSIVE lock for a moment). On "canceling statement due to lock
--      timeout" nothing changed — run it again a moment later.
--   2. Refuses to run unless payment_orders (20261022_10), subscriptions and
--      subscription_plans (20260603_phase1_003) exist, and stops — naming the
--      values — if any existing row holds a billing value outside the widened
--      lists (nothing is rewritten, no row is touched).
--   3. payment_orders: every CHECK constraint on the billing column alone is
--      replaced by ONE payment_orders_billing_check
--        billing in ('monthly','quarterly','semiannual','yearly','once').
--   4. subscriptions: every CHECK on billing_cycle alone is replaced by ONE
--      subscriptions_billing_cycle_check
--        billing_cycle in ('monthly','quarterly','semiannual','yearly','custom')
--      ('custom' stays: admin grants write it, src/lib/entitlements.ts).
--   5. subscription_plans gains price_quarterly and price_semiannual,
--      numeric(12,2) NULL (null = the plan is not sold in that cycle), each
--      with a CHECK (>= 0). No price is written: no plan has a quarterly or
--      half-yearly price yet (P2 / P5 / P6 add them with their own SQL).
--   6. Both checks and both columns carry a comment with the literal
--      "20261026_10" — the marker _verify.sql reads.
--   7. Raising verify — it also PROBES the real behaviour: one quarterly and
--      one semiannual row of payment_orders and of subscriptions, each inside
--      a subtransaction that is always rolled back (nothing is kept), so a
--      CHECK over several columns that still refuses the new cycles is caught
--      too — then `notify pgrst` after commit.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY OF THIS BATCH (file 10_BEFORE_DEPLOY_…).
--   The P1 code works before AND after it: no item of the price book has a
--   quarterly or half-yearly price yet, so no order or subscription can name
--   a cycle the old checks refuse, and the admin plan reads embed
--   `subscription_plans ( * )`, which works with or without the new columns.
--   NOTHING GATES THE DEPLOY: deploy.sh does not run _verify.sql (removed in
--   6223b221). Its section verify:billing_cycles is a MANUAL check: it only
--   NOTICEs while this file has not run, and RAISES when it ran only partly
--   or a check was narrowed again. So P2 (the first quarterly or half-yearly
--   price) must refuse those cycles IN CODE until a runtime probe shows the
--   database accepts them (docs/plans/2026-10-26-P1-price-book-design.md §6,
--   "P2 requirement"); making the _verify NOTICE a raise would stop nothing.
--
-- RE-RUN HAZARD
--   20261022_10 and 20260603_phase1_003 create their tables with
--   `if not exists`, so re-running them does not narrow the checks again. A
--   schema restore that brings back the old narrow checks is repaired by
--   re-running this file (proved in Docker:
--   supabase/tests/rls/billing_cycles.test.sql, second run).
--
-- ROLLBACK (only while no order or subscription uses quarterly / semiannual:
-- the narrow checks below would refuse those rows and the ALTER would fail)
--   alter table public.payment_orders drop constraint payment_orders_billing_check,
--     add constraint payment_orders_billing_check check (billing in ('monthly','yearly','once'));
--   alter table public.subscriptions drop constraint subscriptions_billing_cycle_check,
--     add constraint subscriptions_billing_cycle_check check (billing_cycle in ('monthly','yearly','custom'));
--   alter table public.subscription_plans drop column price_quarterly, drop column price_semiannual;
--   and remove the verify:billing_cycles section from _verify.sql.
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 1. Prerequisites, and no row outside the new lists ─────────────────────
do $$
declare
  bad text;
begin
  if to_regclass('public.payment_orders') is null then
    raise exception '20261026_10: public.payment_orders does not exist — run 20261022_10_payments_core.sql first';
  end if;
  if to_regclass('public.subscriptions') is null or to_regclass('public.subscription_plans') is null then
    raise exception '20261026_10: public.subscriptions / public.subscription_plans do not exist — run 20260603_phase1_003_subscriptions_billing.sql first';
  end if;

  select string_agg(distinct coalesce(billing, '<null>'), ', ') into bad
    from public.payment_orders
   where billing is null or billing not in ('monthly', 'quarterly', 'semiannual', 'yearly', 'once');
  if bad is not null then
    raise exception '20261026_10: payment_orders holds billing values the new check would refuse: % — nothing changed; look at those rows first', bad;
  end if;

  select string_agg(distinct coalesce(billing_cycle, '<null>'), ', ') into bad
    from public.subscriptions
   where billing_cycle is null or billing_cycle not in ('monthly', 'quarterly', 'semiannual', 'yearly', 'custom');
  if bad is not null then
    raise exception '20261026_10: subscriptions holds billing_cycle values the new check would refuse: % — nothing changed; look at those rows first', bad;
  end if;
end $$;

-- ── 2. One check per column, widened ────────────────────────────────────────
-- Every CHECK whose only column is the billing column is dropped (whatever it
-- is called — a restore may have renamed or doubled it), then the one widened
-- check is added. Skipped when exactly that check is already the only one.
do $$
declare
  spec   record;
  att    smallint;
  cname  text;
  n      int;
  ok     boolean;
begin
  for spec in
    select * from (values
      ('payment_orders', 'billing',       'payment_orders_billing_check',
       array['monthly', 'quarterly', 'semiannual', 'yearly', 'once']),
      ('subscriptions',  'billing_cycle', 'subscriptions_billing_cycle_check',
       array['monthly', 'quarterly', 'semiannual', 'yearly', 'custom'])
    ) as t(tbl, col, con, vals)
  loop
    select attnum into att from pg_attribute
     where attrelid = ('public.' || spec.tbl)::regclass and attname = spec.col and not attisdropped;
    if att is null then
      raise exception '20261026_10: public.%.% does not exist', spec.tbl, spec.col;
    end if;

    select count(*),
           bool_and(conname = spec.con
                    and pg_get_constraintdef(oid) = format('CHECK ((%I = ANY (ARRAY[%s])))', spec.col,
                          (select string_agg(format('%L::text', v), ', ') from unnest(spec.vals) v)))
      into n, ok
      from pg_constraint
     where conrelid = ('public.' || spec.tbl)::regclass and contype = 'c' and conkey = array[att];

    if n = 1 and ok then
      continue;
    end if;

    for cname in select conname from pg_constraint
                  where conrelid = ('public.' || spec.tbl)::regclass and contype = 'c' and conkey = array[att] loop
      execute format('alter table public.%I drop constraint %I', spec.tbl, cname);
    end loop;
    execute format('alter table public.%I add constraint %I check (%I in (%s))',
                   spec.tbl, spec.con, spec.col,
                   (select string_agg(format('%L', v), ', ') from unnest(spec.vals) v));
  end loop;
end $$;

comment on constraint payment_orders_billing_check on public.payment_orders is
  '20261026_10 (pricing doc 25 Oct §2 rule 1): monthly, quarterly (3 months), semiannual (6 months), yearly, or once. Which item is sold in which cycle is src/lib/pricing/priceBook.ts.';
comment on constraint subscriptions_billing_cycle_check on public.subscriptions is
  '20261026_10 (pricing doc 25 Oct §2 rule 1): monthly, quarterly, semiannual, yearly — the period grant_plan_subscription writes from the order — or custom (an admin grant).';

-- ── 3. The two new prices of a plan ─────────────────────────────────────────
alter table public.subscription_plans
  add column if not exists price_quarterly  numeric(12,2) null,
  add column if not exists price_semiannual numeric(12,2) null;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.subscription_plans'::regclass
                    and conname = 'subscription_plans_price_quarterly_check') then
    alter table public.subscription_plans
      add constraint subscription_plans_price_quarterly_check check (price_quarterly is null or price_quarterly >= 0);
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.subscription_plans'::regclass
                    and conname = 'subscription_plans_price_semiannual_check') then
    alter table public.subscription_plans
      add constraint subscription_plans_price_semiannual_check check (price_semiannual is null or price_semiannual >= 0);
  end if;
end $$;

comment on column public.subscription_plans.price_quarterly is
  '20261026_10: SAR before VAT for 3 months; null = not sold quarterly. Mirrors src/lib/pricing/priceBook.ts (catalog.test.ts holds the seed to it).';
comment on column public.subscription_plans.price_semiannual is
  '20261026_10: SAR before VAT for 6 months; null = not sold half-yearly. Mirrors src/lib/pricing/priceBook.ts (catalog.test.ts holds the seed to it).';

-- ── 4. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  missing text := '';
  spec    record;
  att     smallint;
  defs    text;
  n       int;
  v       text;
begin
  for spec in
    select * from (values
      ('payment_orders', 'billing',       'payment_orders_billing_check',
       array['monthly', 'quarterly', 'semiannual', 'yearly', 'once'],   array['weekly', 'custom']),
      ('subscriptions',  'billing_cycle', 'subscriptions_billing_cycle_check',
       array['monthly', 'quarterly', 'semiannual', 'yearly', 'custom'], array['weekly', 'once'])
    ) as t(tbl, col, con, yes, no)
  loop
    select attnum into att from pg_attribute
     where attrelid = ('public.' || spec.tbl)::regclass and attname = spec.col and not attisdropped;
    select count(*), string_agg(pg_get_constraintdef(oid), ' | ') into n, defs
      from pg_constraint
     where conrelid = ('public.' || spec.tbl)::regclass and contype = 'c' and conkey = array[att];
    if n <> 1 then
      missing := missing || format(' %s.%s has %s CHECK constraints (expected exactly %s);', spec.tbl, spec.col, n, spec.con);
      continue;
    end if;
    foreach v in array spec.yes loop
      if position(quote_literal(v) in defs) = 0 then
        missing := missing || format(' %s does not accept %s;', spec.con, v);
      end if;
    end loop;
    foreach v in array spec.no loop
      if position(quote_literal(v) in defs) > 0 then
        missing := missing || format(' %s accepts %s;', spec.con, v);
      end if;
    end loop;
    if coalesce(obj_description((select oid from pg_constraint
                                   where conrelid = ('public.' || spec.tbl)::regclass and conname = spec.con), 'pg_constraint'), '')
       not like '%20261026_10%' then
      missing := missing || format(' %s lacks the 20261026_10 comment;', spec.con);
    end if;
  end loop;

  foreach v in array array['price_quarterly', 'price_semiannual'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'subscription_plans'
                      and column_name = v and data_type = 'numeric' and is_nullable = 'YES') then
      missing := missing || format(' subscription_plans.%s is missing or not a nullable numeric;', v);
    elsif coalesce(col_description('public.subscription_plans'::regclass,
                     (select attnum from pg_attribute where attrelid = 'public.subscription_plans'::regclass and attname = v)), '')
          not like '%20261026_10%' then
      missing := missing || format(' subscription_plans.%s lacks the 20261026_10 comment;', v);
    end if;
  end loop;

  -- A CHECK over several columns that includes the billing column is not
  -- replaced above. Probe the real behaviour instead of reading definitions:
  -- one quarterly and one semiannual row of each table, inside a
  -- subtransaction that is always rolled back (nothing is kept).
  foreach v in array array['quarterly', 'semiannual'] loop
    begin
      insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status)
      values (null, 'plan', '20261026_10-probe', v, 100, 15, 115, 'exclusive', 'cancelled');
      raise exception using errcode = 'P0001', message = '20261026_10-probe-ok';
    exception
      when check_violation then
        missing := missing || format(' a %s order is still refused by a CHECK (%s);', v, sqlerrm);
      when raise_exception then
        if sqlerrm <> '20261026_10-probe-ok' then raise; end if;
    end;
    if exists (select 1 from public.profiles) and exists (select 1 from public.subscription_plans where id = 'lawyer-pro') then
      begin
        insert into public.subscriptions (user_id, plan_id, tier, billing_cycle, status)
        values ((select id from public.profiles limit 1), 'lawyer-pro', 'pro', v, 'cancelled');
        raise exception using errcode = 'P0001', message = '20261026_10-probe-ok';
      exception
        when check_violation then
          missing := missing || format(' a %s subscription is still refused by a CHECK (%s);', v, sqlerrm);
        when raise_exception then
          if sqlerrm <> '20261026_10-probe-ok' then raise; end if;
      end;
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261026_10 verify:%', missing;
  end if;
  raise notice '20261026_10 verify: OK — payment_orders and subscriptions accept quarterly and semiannual (probed with rolled-back rows); subscription_plans has price_quarterly / price_semiannual (null for every plan until a later phase prices them)';
end $$;

commit;

notify pgrst, 'reload schema';
