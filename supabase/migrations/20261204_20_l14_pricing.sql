-- =============================================================================
-- Migration: 20261204_20_l14_pricing.sql
-- Batch l14, builder «pricing» (owner package of 23 Nov 2026: 01 §عاشرًا and
-- §حادي عشر, ٢٠١, ٢٠٦).
-- Safe to re-run (idempotent) and order-tolerant among the l14 files. No DROP,
-- no DELETE, no new grant to anon / authenticated.
-- =============================================================================
--
-- WHAT IT CHANGES
--   1. subscription_plans — «إدارة المكتب» and the combined bundle (01 §عاشرًا,
--      §حادي عشر #1 / #2). Checkout charges the TS price book
--      (src/lib/pricing/priceBook.ts); these rows are what subscriptions.plan_id
--      points at (FK) and what the admin screens read.
--        lawyer-pro     name «إدارة المكتب» / "Office Management"; quarterly
--                       1,200 and half-yearly 2,190 next to the yearly 3,990
--                       (the doc's erp-q1 / erp-q2 / erp-annual). The monthly
--                       399 stays listed (retired in the book: orders made
--                       before keep resolving).
--        lawyer-bundle  NEW row (tier pro, audience lawyer): «إدارة المكتب +
--                       المكتبة القانونية», quarterly 2,712 (2,711.5 rounded
--                       up: the book holds whole riyals), half-yearly 5,083,
--                       yearly 9,333 — 15 % off the sum of the two. Monthly
--                       is not sold: price_monthly 0 (the column is NOT NULL).
--      Every plan's four prices are then set to the book's (one row per plan
--      in the book; catalog.test.ts holds this list to it).
--
--   2. public.finish_payment_refund(uuid, text, text) — SAME signature, from
--      its only definition (20261022_32), one change: the library grant an
--      order made is closed for a PLAN order too (the bundle's library pass
--      is keyed on the plan order, library_access_grants.order_id), not for a
--      library order only. A plan order without a library grant matches no
--      row. Grants are re-asserted (service role only).
--
--   3. admin_pricing_catalog — the row WINS over
--      src/constants/clientServiceCatalog.ts on /api/client-pricing, so the
--      code change alone would not show. Each row is changed only while it
--      still holds the value this file replaces (an admin's own edit is
--      kept), and is stamped metadata.owner_l14 = '20261204_20'; a stamped row
--      is never touched again. A missing row is left missing (the code
--      catalogue serves the same values).
--        §حادي عشر #7 (معالجة مقترحة — the approved doc of 25 Oct, §7ب):
--          case-study 1,600 → 1,500, file-lawsuit 1,600 → 600,
--          appeal 2,000 → 1,800, cassation 3,000 → 2,500,
--          enforce-judgment 1,200 → 950; the «2x …» note → «يُؤكَّد السعر بعد
--          الاطلاع على الملف» (enforce-judgment keeps its own note).
--        §حادي عشر #8 (معالجة مقترحة — «بالنقاط»): ai-consult (49),
--          contract-analyze (79), ai-case-eval (79) → price_mode 'points',
--          base_price 0, the points note, metadata.includedByPlan removed.
--
--   4. Owner ٢٠١ (23 Nov): the founder-invite trial's points are the library
--      assistant's ONLY.
--        - platform_settings.founder_invites: a stored points_scope 'general'
--          becomes 'library_agent' (every other key kept);
--        - public.founder_invite_settings() — SAME signature, from 20261203_20,
--          one change: points_scope is always 'library_agent';
--        - points_lots of redeemed founder invites (founder_invites.lot_id)
--          still in the general wallet move to the library_agent wallet.
--      The other half of ٢٠١ — the trial is outside the 50-point library gate
--      for its days — is code only (src/lib/library/pointsGate.ts).
--
-- RUN ORDER: BEFORE the deploy of the same change.
--   The new code sells lawyer-bundle and lawyer-pro quarterly / half-yearly;
--   a paid bundle order writes subscriptions.plan_id = 'lawyer-bundle' (FK),
--   so the row must exist first. Old code ignores the new row and prices.
--   Parts 3 and 4 are safe in either order (old code shows the new card
--   prices — a points row renders «بالنقاط» since 20261102_11).
--
-- PREREQUISITES (all live since batch 13): 20261026_10 (price_quarterly),
--   20261022_32 (finish_payment_refund), 20260518 (admin_pricing_catalog),
--   20261203_20 (founder_invites), 20261127_40 (points_lots.wallet_scope).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261204_20_l14_pricing.sql
--   Expect: NOTICE  l14_pricing verify: OK …  and the summary row.
--
-- ROLLBACK (by hand, only if the owner reverses it):
--   update public.subscription_plans set name_ar = 'المحامي المحترف', name_en = 'Professional Lawyer',
--     price_quarterly = null, price_semiannual = null where id = 'lawyer-pro';
--   update public.subscription_plans set active = false where id = 'lawyer-bundle';
--   (rows of admin_pricing_catalog: restore 20260518's values and drop metadata.owner_l14;
--    finish_payment_refund / founder_invite_settings: re-run 20261022_32 / 20261203_20's bodies)
-- =============================================================================

set lock_timeout = '5s';

begin;

-- ── 0. prerequisites ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.subscription_plans') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'subscription_plans'
                       and column_name = 'price_semiannual') then
    raise exception '20261204_20: subscription_plans.price_semiannual is missing — run 20261026_10_billing_cycles.sql first';
  end if;
  if not exists (select 1 from public.subscription_plans where id = 'lawyer-pro') then
    raise exception '20261204_20: subscription_plans has no lawyer-pro row — run 20261022_10_payments_core.sql first';
  end if;
  if to_regprocedure('public.finish_payment_refund(uuid,text,text)') is null then
    raise exception '20261204_20: finish_payment_refund is missing — run 20261022_32_payment_refunds.sql first';
  end if;
  if to_regclass('public.admin_pricing_catalog') is null then
    raise exception '20261204_20: admin_pricing_catalog is missing — run 20260518_client_workflow_backend_ready.sql first';
  end if;
  if to_regclass('public.founder_invites') is null
     or to_regprocedure('public.founder_invite_settings()') is null then
    raise exception '20261204_20: founder_invites is missing — run 20261203_20_founder_invites.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'points_lots' and column_name = 'wallet_scope') then
    raise exception '20261204_20: points_lots.wallet_scope is missing — run 20261127_40_points_wallets.sql first';
  end if;
end $$;

-- ── 1. subscription_plans: «إدارة المكتب» and the bundle ─────────────────────
insert into public.subscription_plans (id, tier, audience, name_ar, name_en, price_monthly, price_yearly)
values ('lawyer-bundle', 'pro', 'lawyer', 'إدارة المكتب + المكتبة القانونية', 'Office Management + Legal Library', 0, 9333)
on conflict (id) do nothing;

update public.subscription_plans p
   set name_ar = v.name_ar, name_en = v.name_en, updated_at = now()
  from (values
    ('lawyer-pro',    'إدارة المكتب',                     'Office Management'),
    ('lawyer-bundle', 'إدارة المكتب + المكتبة القانونية', 'Office Management + Legal Library')
  ) as v(id, name_ar, name_en)
 where p.id = v.id
   and (p.name_ar, p.name_en) is distinct from (v.name_ar, v.name_en);

-- The listed prices of the price book (SAR; null = not sold in that cycle;
-- lawyer-bundle's monthly 0 = not sold, the column being NOT NULL). One row
-- per plan of the book (catalog.test.ts).
update public.subscription_plans p
   set price_monthly    = v.m,
       price_quarterly  = v.q,
       price_semiannual = v.h,
       price_yearly     = v.y,
       updated_at       = now()
  from (values
    ('lawyer-pro',             399::numeric, 1200::numeric, 2190::numeric, 3990::numeric),
    ('lawyer-bundle',          0,            2712,          5083,          9333),
    ('consultant-independent', 399,          null,          null,          3990),
    ('firm-basic',             990,          2990,          5490,          9900),
    ('firm-enterprise',        1490,         4490,          8190,          14900),
    ('ind-ai',                 29,           79,            149,           249),
    ('ind-preventive',         149,          null,          null,          1490),
    ('ind-litigation',         399,          null,          null,          3990)
  ) as v(id, m, q, h, y)
 where p.id = v.id
   and (p.price_monthly, p.price_quarterly, p.price_semiannual, p.price_yearly)
       is distinct from (v.m, v.q, v.h, v.y);

-- ── 2. finish_payment_refund: a plan order's library grant closes too ───────
create or replace function public.finish_payment_refund(p_order uuid, p_token text, p_method text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders%rowtype; lot record; purchased record; removed integer := 0; tier_now text := 'free'; now_at timestamptz := now(); job jsonb;
begin
  select * into o from public.payment_orders where id = p_order for update;
  if not found then raise exception 'refund_order_missing' using errcode = '22023'; end if;
  job := o.metadata -> 'refund_job';
  if p_token is null or p_method is null or p_method not in ('void','refund')
     or job ->> 'token' is distinct from p_token or job ->> 'method' is distinct from p_method then
    raise exception 'refund_claim_mismatch' using errcode = '22023';
  end if;
  if job ->> 'state' = 'done' then return jsonb_build_object('done',true,'duplicate',true,'tier',job ->> 'tier'); end if;
  if job ->> 'state' is distinct from 'processing' then raise exception 'refund_claim_not_processing' using errcode = '22023'; end if;
  if o.status <> 'paid' then raise exception 'refund_order_closed' using errcode = '22023'; end if;

  -- Touch only grants made for this order; never cancel a later purchase.
  if o.kind = 'plan' then
    select id,started_at,metadata into purchased from public.subscriptions
      where metadata ->> 'order_id' = o.id::text and user_id = o.user_id limit 1;
    update public.subscriptions set status = 'cancelled', cancelled_at = now_at, auto_renew = false, updated_at = now_at
     where metadata ->> 'order_id' = o.id::text and user_id = o.user_id;
    -- Restore a latest renewal's still-valid predecessors only when no newer
    -- plan runs. An admin cancellation or refunded prior period stays closed.
    if purchased.id is not null and not exists (select 1 from public.subscriptions s
       where s.user_id = o.user_id and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now_at)) then
      update public.subscriptions s set status = 'active',cancelled_at = null,updated_at = now_at
       where s.user_id = o.user_id and s.id::text in
         (select jsonb_array_elements_text(coalesce(purchased.metadata -> 'replaced_ids','[]'::jsonb)))
         and s.status = 'cancelled' and s.cancelled_at = purchased.started_at
         and (s.current_period_end is null or s.current_period_end > now_at)
         and not exists (select 1 from public.payment_orders previous
                         where previous.id::text = s.metadata ->> 'order_id' and previous.status in ('refunded','voided'));
    end if;
  end if;
  -- 20261204_20 (batch l14): a library order's grant, and the library pass a
  -- bundle PLAN order brought (keyed on the same order), close with it.
  if o.kind in ('plan', 'library') then
    update public.library_access_grants
       set ends_at = greatest(starts_at + interval '1 second', now_at)
     where order_id = o.id and ends_at > now_at;
  end if;
  for lot in select id from public.points_lots where order_id = o.id order by id for update loop
    removed := removed + public.revoke_lot(lot.id,'refund_revoke');
  end loop;
  select s.tier into tier_now from public.subscriptions s
   where s.user_id = o.user_id and s.status = 'active' and (s.current_period_end is null or s.current_period_end > now_at)
   order by case s.tier when 'enterprise' then 6 when 'corp' then 5 when 'max' then 4 when 'pro' then 3 when 'ai' then 2 when 'shield' then 1 else 0 end desc limit 1;
  tier_now := coalesce(tier_now,'free');
  job := job || jsonb_build_object('state','done','finished_at',now_at,'tier',tier_now,'points_revoked',removed);
  update public.payment_orders
     set status = case p_method when 'void' then 'voided' else 'refunded' end,
         refunded_halalas = total_halalas, refunded_at = now_at,
         metadata = metadata || jsonb_build_object('refund_job',job)
   where id = o.id;
  -- An audit failure rolls back reversal and stamp together; retry finishes
  -- from the gateway's already-refunded state without charging/refunding again.
  insert into public.admin_audit_events (actor_id,actor_type,action,target_type,target_id,before_state,after_state,metadata)
  values ((select id from public.profiles where id = (job ->> 'actor_id')::uuid),'admin','payment_refunded','payment_order',o.id::text,
          jsonb_build_object('status',o.status),jsonb_build_object('status',case p_method when 'void' then 'voided' else 'refunded' end,'refunded_halalas',o.total_halalas),
          jsonb_build_object('method',p_method,'points_revoked',removed,'payment_id',o.moyasar_payment_id,'refund_actor_id',job ->> 'actor_id'));
  return jsonb_build_object('done',true,'duplicate',false,'tier',tier_now,'points_revoked',removed);
end $$;
revoke all on function public.finish_payment_refund(uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_payment_refund(uuid,text,text) to service_role;

-- ── 3. admin_pricing_catalog: §حادي عشر #7 and #8 ────────────────────────────
-- #7: the lawyer services of the approved doc (only a row still at its old price)
update public.admin_pricing_catalog c
   set base_price = v.new_price,
       metadata   = c.metadata
                    || case when v.note is null then '{}'::jsonb else jsonb_build_object('priceNote', v.note) end
                    || jsonb_build_object('owner_l14', '20261204_20'),
       updated_at = now()
  from (values
    ('case-study',       1600::numeric, 1500::numeric, 'يُؤكَّد السعر بعد الاطلاع على الملف'),
    ('file-lawsuit',     1600,          600,           'يُؤكَّد السعر بعد الاطلاع على الملف'),
    ('appeal',           2000,          1800,          'يُؤكَّد السعر بعد الاطلاع على الملف'),
    ('cassation',        3000,          2500,          'يُؤكَّد السعر بعد الاطلاع على الملف'),
    ('enforce-judgment', 1200,          950,           null)
  ) as v(service_id, old_price, new_price, note)
 where c.service_id = v.service_id
   and c.base_price = v.old_price
   and coalesce(c.metadata ->> 'owner_l14', '') = '';

-- #8: the individuals' AI cards in points (only a row still at its riyal price)
update public.admin_pricing_catalog c
   set base_price = 0,
       price_mode = 'points',
       metadata   = (c.metadata || jsonb_build_object('priceNote', v.note, 'owner_l14', '20261204_20')) - 'includedByPlan',
       updated_at = now()
  from (values
    ('ai-consult',       49::numeric, 'لك ٥ أسئلة مجانية في «مساعد نظامي»، وبعدها بالنقاط ويظهر سعر السؤال قبل إرساله'),
    ('contract-analyze', 79,          'التحليل المفصّل ٢٥٠ نقطة (قيد التفعيل)'),
    ('ai-case-eval',     79,          'التقييم المفصّل ٧٥ نقطة (قيد التفعيل)')
  ) as v(service_id, old_price, note)
 where c.service_id = v.service_id
   and c.base_price = v.old_price
   and c.price_mode is distinct from 'points'
   and coalesce(c.metadata ->> 'owner_l14', '') = '';

-- ── 4. owner ٢٠١: the founder-invite trial's points are the library assistant's only ──
update public.platform_settings
   set value = value || '{"points_scope": "library_agent"}'::jsonb
 where key = 'founder_invites'
   and jsonb_typeof(value) = 'object'
   and value ->> 'points_scope' is distinct from 'library_agent';

create or replace function public.founder_invite_settings()
returns table (monthly int, trial_days int, points int, points_scope text, valid_days int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with s as (select coalesce((select value from public.platform_settings where key = 'founder_invites'), '{}'::jsonb) as v),
       n as (select case when jsonb_typeof(s.v -> 'monthly')    = 'number' then (s.v ->> 'monthly')::numeric    end as monthly,
                    case when jsonb_typeof(s.v -> 'trial_days') = 'number' then (s.v ->> 'trial_days')::numeric end as trial_days,
                    case when jsonb_typeof(s.v -> 'points')     = 'number' then (s.v ->> 'points')::numeric     end as points,
                    case when jsonb_typeof(s.v -> 'valid_days') = 'number' then (s.v ->> 'valid_days')::numeric end as valid_days
               from s)
  -- owner ٢٠١ (20261204_20): the trial's points are the library assistant's only
  select case when n.monthly    between 1 and 20    and n.monthly    = trunc(n.monthly)    then n.monthly::int    else 3  end,
         case when n.trial_days between 1 and 365   and n.trial_days = trunc(n.trial_days) then n.trial_days::int else 30 end,
         case when n.points     between 0 and 10000 and n.points     = trunc(n.points)     then n.points::int     else 50 end,
         'library_agent'::text,
         case when n.valid_days between 1 and 365   and n.valid_days = trunc(n.valid_days) then n.valid_days::int else 30 end
    from n;
$$;

comment on function public.founder_invite_settings() is
  'platform_settings.founder_invites read with defaults (20261203_20, owner Q144 أ; 20261204_20, owner ٢٠١): monthly 3 (1..20), trial_days 30 (1..365), points 50 (0..10000), points_scope always library_agent (the library assistant only), valid_days 30 (1..365). Service role only.';

revoke all on function public.founder_invite_settings() from public, anon, authenticated;
grant execute on function public.founder_invite_settings() to service_role;

update public.points_lots l
   set wallet_scope = 'library_agent'
 where l.id in (select i.lot_id from public.founder_invites i where i.lot_id is not null)
   and l.wallet_scope is distinct from 'library_agent';

-- ── 5. verify ─────────────────────────────────────────────────────────────────
do $$
declare
  bad text;
  def text;
begin
  select string_agg(p.id, ', ') into bad
    from public.subscription_plans p
    join (values
      ('lawyer-pro',    399::numeric, 1200::numeric, 2190::numeric, 3990::numeric, 'pro', 'إدارة المكتب'),
      ('lawyer-bundle', 0,            2712,          5083,          9333,          'pro', 'إدارة المكتب + المكتبة القانونية')
    ) as v(id, m, q, h, y, tier, name_ar) on v.id = p.id
   where (p.price_monthly, p.price_quarterly, p.price_semiannual, p.price_yearly, p.tier, p.name_ar)
         is distinct from (v.m, v.q, v.h, v.y, v.tier, v.name_ar);
  if bad is not null or (select count(*) from public.subscription_plans where id in ('lawyer-pro', 'lawyer-bundle')) <> 2 then
    raise exception '20261204_20 verify: the «إدارة المكتب» / bundle rows are not the book''s (%)', coalesce(bad, 'a row is missing');
  end if;

  select pg_get_functiondef('public.finish_payment_refund(uuid,text,text)'::regprocedure) into def;
  if position('o.kind in (''plan'', ''library'')' in def) = 0
     or has_function_privilege('anon', 'public.finish_payment_refund(uuid,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.finish_payment_refund(uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.finish_payment_refund(uuid,text,text)', 'EXECUTE') then
    raise exception '20261204_20 verify: finish_payment_refund does not close a plan order''s library grant, or a session may run it';
  end if;

  if exists (select 1 from public.founder_invite_settings() s where s.points_scope is distinct from 'library_agent')
     or has_function_privilege('authenticated', 'public.founder_invite_settings()', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_invite_settings()', 'EXECUTE')
     or exists (select 1 from public.platform_settings
                 where key = 'founder_invites' and jsonb_typeof(value) = 'object'
                   and value ->> 'points_scope' is distinct from 'library_agent')
     or exists (select 1 from public.points_lots l join public.founder_invites i on i.lot_id = l.id
                 where l.wallet_scope is distinct from 'library_agent') then
    raise exception '20261204_20 verify: a founder-invite trial''s points are not the library assistant''s only';
  end if;

  raise notice '20261204_20 l14_pricing verify: OK — lawyer-pro is «إدارة المكتب» 1,200 / 2,190 / 3,990; lawyer-bundle 2,712 / 5,083 / 9,333; a refunded plan order closes its library grant; founder-invite points library-assistant only';
end $$;

commit;

-- ── The check you can see in the SQL editor (it hides NOTICEs) ────────────────
-- Expect 2 plan rows, then the 8 catalogue rows: ok = t on each. ok = f means
-- the row holds an admin's own value — stamped = f: set before this file, so
-- it was kept; stamped = t: edited after this file ran. Read it and decide by
-- hand. in_table = false: no row, the code catalogue serves the same value.
select id, name_ar, price_quarterly, price_semiannual, price_yearly
  from public.subscription_plans
 where id in ('lawyer-pro', 'lawyer-bundle')
 order by id;
select e.service_id,
       c.service_id is not null                          as in_table,
       c.base_price,
       c.price_mode,
       c.metadata ->> 'owner_l14' is not null            as stamped,
       coalesce(c.service_id is null
                or (c.base_price = e.price and c.price_mode = e.mode), false) as ok
  from (values ('case-study', 1500::numeric, 'starting_from'), ('file-lawsuit', 600, 'starting_from'),
               ('appeal', 1800, 'starting_from'), ('cassation', 2500, 'starting_from'),
               ('enforce-judgment', 950, 'starting_from'), ('ai-consult', 0, 'points'),
               ('contract-analyze', 0, 'points'), ('ai-case-eval', 0, 'points'))
         as e(service_id, price, mode)
  left join public.admin_pricing_catalog c on c.service_id = e.service_id
 order by e.service_id;
select '20261204_20 l14 pricing: «إدارة المكتب» + bundle plans, plan-order library grant closes on refund, lawyer-service and AI-card prices, founder-invite points library-only' as migration, true;
