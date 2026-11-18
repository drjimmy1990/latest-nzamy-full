-- =============================================================================
-- Migration: 20261127_10_founder_pay_before_verification.sql
-- =============================================================================
-- PURPOSE (batch l7, decisions 1, 2 and 4 of 18 Nov 2026; launch gap items
-- 13 and 14, pricing gap row 16)
--
--   1. Pay before verification (decision 1). A lawyer whose signup is still
--      PENDING (held for human review included — lawyer_profiles keeps
--      verification_status 'pending' while held) may buy the founder seat.
--        * founder_seats.status gains 'pending_verification': a PAID seat
--          waiting for the licence check. It COUNTS toward capacity and in
--          the public counter, and it never expires: founder_release_expired
--          and founder_release_order only ever free 'reserved' seats.
--        * founder_seats_one_per_user covers it (one reserved, pending or
--          active seat per user and campaign).
--        * founder_reserve_seat (copied from its LATEST definition,
--          20261125_50): a 'pending' lawyer reserves like a verified one; a
--          rejected / suspended / missing lawyer row still answers
--          not_verified. A user holding a pending_verification seat is
--          already_member.
--        * founder_activate (copied from its LATEST definition, 20261124_10):
--          a paid order of a 'pending' lawyer moves its seat to
--          pending_verification and answers 'pending_verification'
--          (metadata.founder = 'pending_verification'). When the admin
--          approves the lawyer the server calls founder_activate again: the
--          seat becomes active (12 months from THAT day), credits, library,
--          badge. A rejected lawyer is refunded by the server (refundCore →
--          founder_revoke, which now also revokes a pending_verification seat).
--   2. Oversell honoured (decision 2). founder_activate NEVER answers 'full'
--      for a paid order: when no seat is free it activates anyway and writes
--      metadata.founder_oversold = true (metadata.founder stays 'activated' /
--      'pending_verification', which the admin retry and grantPurchase read).
--      founder_reserve_seat still answers 'full' BEFORE any payment.
--   3. The counter (decision 2 + 3). New helper founder_seat_counted(user,
--      order): false for a test account (public.test_accounts), a demo
--      account (profiles.is_demo) and a seat whose order was paid in Moyasar
--      TEST mode (payment_orders.live = false). Such seats never count: not
--      in founder_seat_summary, not in the capacity checks of
--      founder_reserve_seat / founder_activate.
--      founder_seat_summary() is re-created (DROP + CREATE: its row gains
--      columns) → capacity, active, reserved, seats_left, sale_paused,
--      on_sale, pending, overflow, test_seats.
--        seats_left = greatest(capacity - active - pending - reserved, 0)
--                     — never negative (the public «اكتملت المقاعد»);
--        overflow   = greatest(active + pending - capacity, 0) — the paid
--                     seats sold past capacity, for the admin only;
--        test_seats = active / pending / live reserved seats NOT counted.
--   4. platform_settings.founder_topup_discount_bps = 1500 (decision 4): the
--      founder top-up discount rate in basis points, read by
--      src/lib/payments/founderDiscount.ts (absent → 1500). Inserted only
--      when missing.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_10_founder_pay_before_verification.sql
--   Expect: NOTICE  20261127_10 verify: OK  and a row with `t`.
--
-- RUN ORDER: AFTER the l7 deploy (the code works before it, degrading
--   honestly: a pending lawyer who clicks «اشترك الآن» is told to verify his
--   licence first, as today; the admin page shows 0 pending / 0 overflow).
--   Run before the deploy and the OLD code meets founder_activate's new
--   answer 'pending_verification', treats it as a failed grant and lets the
--   sweep retry it until the deploy — no money is lost, the payer just waits.
--   Needs 20261101_10, 20261124_10, 20261125_50 and 20261017_44.
--   RE-RUN HAZARD: re-running 20261101_10 / 20261122_10 / 20261124_10 /
--   20261125_50 puts back an older founder_reserve_seat / founder_activate /
--   founder_revoke / founder_seat_summary — re-run this file after them.
--   This file itself is idempotent (safe to run any number of times).
--
-- ROLLBACK (one transaction; only once no seat is 'pending_verification' —
--   refund or activate those first):
--   re-run 20261125_50 section 3b (founder_reserve_seat), 20261124_10
--   section 3 (founder_activate) and 20261101_10 sections 7d + 7g + 7h
--   (founder_revoke; drop function public.founder_seat_summary() first, then
--   its create + grant); then
--   drop function if exists public.founder_seat_counted(uuid, uuid);
--   drop index if exists public.founder_seats_one_per_user;
--   create unique index founder_seats_one_per_user on public.founder_seats
--     (campaign_id, user_id) where status in ('reserved', 'active');
--   alter table public.founder_seats drop constraint founder_seats_status_check;
--   alter table public.founder_seats add constraint founder_seats_status_check
--     check (status in ('reserved', 'active', 'released', 'revoked'));
--   delete from public.platform_settings where key = 'founder_topup_discount_bps';
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.founder_seats') is null
     or to_regprocedure('public.founder_activate(uuid)') is null
     or to_regprocedure('public.founder_revoke(uuid, text)') is null
     or to_regprocedure('public.founder_seat_summary()') is null then
    raise exception '20261127_10: run 20261101_10_founder_membership.sql first';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure), 'library_question') = 0 then
    raise exception '20261127_10: run 20261124_10_founder_hold_15min_and_library_points.sql first (founder_activate without library_question)';
  end if;
  if to_regprocedure('public.is_demo_user(uuid)') is null
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure), 'demo_account') = 0 then
    raise exception '20261127_10: run 20261125_50_demo_accounts.sql first (founder_reserve_seat without the demo check)';
  end if;
  if to_regclass('public.test_accounts') is null then
    raise exception '20261127_10: run 20261017_44_test_accounts_never_listed.sql first (public.test_accounts is missing)';
  end if;
end
$pre$;

-- ── 1. the seat state ────────────────────────────────────────────────────────
alter table public.founder_seats drop constraint if exists founder_seats_status_check;
alter table public.founder_seats add constraint founder_seats_status_check
  check (status in ('reserved', 'pending_verification', 'active', 'released', 'revoked'));

drop index if exists public.founder_seats_one_per_user;
create unique index founder_seats_one_per_user
  on public.founder_seats (campaign_id, user_id) where status in ('reserved', 'pending_verification', 'active');

comment on table public.founder_seats is
  'Lawyer founder membership seats (20261101_10, P3). One reserved, pending_verification (paid, licence not yet verified — 20261127_10, never expires) or active seat per (campaign, user); written only by the founder_* functions (service role). The owner reads his own rows, note included.';

-- ── 2. which seats count ─────────────────────────────────────────────────────
create or replace function public.founder_seat_counted(p_user uuid, p_order uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select not (
        exists (select 1 from public.test_accounts t where t.user_id = p_user)
     or public.is_demo_user(p_user)
     or exists (select 1 from public.payment_orders o where o.id = p_order and o.live = false));
$fn$;

comment on function public.founder_seat_counted(uuid, uuid) is
  'Decisions 2 + 3 (20261127_10): false for a founder seat that must never count in the seats — a test account (test_accounts), a demo account (profiles.is_demo) or an order paid in Moyasar TEST mode (payment_orders.live = false). Service role only.';

-- ── 3. founder_reserve_seat: 20261125_50 + a pending lawyer may reserve ─────
create or replace function public.founder_reserve_seat(p_user uuid, p_order uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_campaign constant text := 'founder-2026';
  v_order  record;
  v_cur    record;   -- the user's reserved, pending_verification or active seat
  v_own    record;   -- the seat that already carries p_order
  v_lim    record;
  v_taken  int;
begin
  if p_user is null or p_order is null then
    raise exception 'founder_reserve_seat: p_user and p_order are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'));

  select o.id, o.user_id, o.kind into v_order from public.payment_orders o where o.id = p_order;
  if v_order.id is null or v_order.user_id is distinct from p_user or v_order.kind <> 'membership' then
    raise exception 'founder_reserve_seat: % is not a membership order of this user', p_order
      using errcode = '22023';
  end if;

  -- 20261125_50 (S3): a demo account never reserves a seat, so it is never
  -- counted in the seats
  if public.is_demo_user(p_user) then
    return 'demo_account';
  end if;

  select s.id, s.status, s.reserved_until, po.status as order_status into v_cur
    from public.founder_seats s
    left join public.payment_orders po on po.id = s.order_id
   where s.campaign_id = c_campaign and s.user_id = p_user
     and s.status in ('reserved', 'pending_verification', 'active');

  -- 20261127_10: a paid seat waiting for the licence check is a membership too
  if v_cur.id is not null
     and (v_cur.status in ('active', 'pending_verification') or v_cur.order_status = 'paid') then
    return 'already_member';
  end if;

  -- 20261127_10 (decision 1): a lawyer whose signup is still pending (held
  -- for review included) may pay; the seat activates when the admin approves
  -- him and is refunded in full when the admin rejects him. A rejected,
  -- suspended or missing lawyer row is still refused.
  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = p_user and lp.verification_status in ('verified', 'pending')) then
    return 'not_verified';
  end if;

  -- 20261122_10 (owner, 17 Nov): the founder plan is for a licensed advocate
  -- only; a consultant (م١٨) is refused before any payment.
  if exists (select 1 from public.lawyer_profiles lp
              where lp.user_id = p_user and lp.practice_kind is distinct from 'advocate') then
    return 'not_advocate';
  end if;

  if not public.founder_campaign_active(now()) then
    return 'closed';
  end if;

  select * into v_lim from public.founder_campaign_limits();
  if v_lim.sale_paused then
    return 'paused';
  end if;

  select s.id, s.status into v_own from public.founder_seats s where s.order_id = p_order;
  if v_own.id is not null and v_own.id is distinct from v_cur.id and v_own.status <> 'released' then
    raise exception 'founder_reserve_seat: order % already holds a % seat', p_order, v_own.status
      using errcode = '22023';
  end if;

  -- a live reservation is already counted; anything else needs a free seat.
  -- 20261127_10: paid seats waiting for verification count; test / demo /
  -- test-mode seats never do (founder_seat_counted).
  if not coalesce(v_cur.reserved_until > now(), false) then
    select count(*) into v_taken
      from public.founder_seats s
     where s.campaign_id = c_campaign
       and s.id is distinct from v_cur.id
       and (s.status in ('active', 'pending_verification')
            or (s.status = 'reserved' and s.reserved_until > now()))
       and public.founder_seat_counted(s.user_id, s.order_id);
    if v_taken >= v_lim.capacity then
      return 'full';
    end if;
  end if;

  if v_own.id is not null and v_own.id is distinct from v_cur.id then
    -- p_order sits on a seat released earlier (order_id is UNIQUE): bring that
    -- row back; the user's other reservation, if any, is released first
    if v_cur.id is not null then
      update public.founder_seats set status = 'released' where id = v_cur.id;
    end if;
    update public.founder_seats
       set status = 'reserved', reserved_until = now() + interval '15 minutes'
     where id = v_own.id;
  elsif v_cur.id is not null then
    -- a declined card, a retry: the SAME seat moves to the new order
    update public.founder_seats
       set order_id = p_order, reserved_until = now() + interval '15 minutes'
     where id = v_cur.id;
  else
    insert into public.founder_seats (campaign_id, user_id, order_id, status, reserved_until)
    values (c_campaign, p_user, p_order, 'reserved', now() + interval '15 minutes');
  end if;

  return 'reserved';
end $$;

comment on function public.founder_reserve_seat(uuid, uuid) is
  'Reserves a founder seat for 15 minutes under the seats lock (20261101_10; advocate only since 20261122_10; 15 minutes since 20261124_10, owner ٣; demo accounts refused since 20261125_50, S3; a pending lawyer may reserve and test / demo / test-mode seats never count since 20261127_10): reserved | already_member | full | closed | paused | not_verified | not_advocate | demo_account. An unpaid reservation of the same user is moved to the new order (a retry). Service role only.';

-- ── 4. founder_activate: 20261124_10 + pending verification + oversell ──────
create or replace function public.founder_activate(p_order uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_campaign constant text := 'founder-2026';
  v_order    record;
  v_own      record;   -- the seat that carries p_order
  v_cur      record;   -- the user's OTHER reserved, pending_verification or active seat
  v_lim      record;
  v_taken    int;
  v_target   uuid;
  v_ends     timestamptz := now() + interval '12 months';
  v_verified boolean;
  v_oversold boolean := false;
begin
  if p_order is null then
    raise exception 'founder_activate: p_order is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'));

  select o.id, o.user_id, o.kind, o.status into v_order from public.payment_orders o where o.id = p_order;
  if v_order.id is null or v_order.kind <> 'membership' then
    raise exception 'founder_activate: % is not a membership order', p_order using errcode = '22023';
  end if;
  if v_order.status <> 'paid' then
    return 'not_paid';
  end if;

  select s.id, s.status, s.reserved_until into v_own from public.founder_seats s where s.order_id = p_order;
  if v_own.status in ('active', 'revoked') then
    return 'already';
  end if;

  select s.id, s.status, s.reserved_until into v_cur
    from public.founder_seats s
   where s.campaign_id = c_campaign and s.user_id = v_order.user_id
     and s.status in ('reserved', 'pending_verification', 'active') and s.id is distinct from v_own.id;
  if v_cur.status in ('active', 'pending_verification') then
    perform public.merge_payment_order_metadata(p_order, '{"founder": "already_member"}'::jsonb);
    return 'already';
  end if;

  v_verified := exists (select 1 from public.lawyer_profiles lp
                         where lp.user_id = v_order.user_id and lp.verification_status = 'verified');
  -- 20261127_10 (decision 1): only a PENDING lawyer waits; a rejected,
  -- suspended or missing lawyer row is the refund case it always was
  if not v_verified
     and not exists (select 1 from public.lawyer_profiles lp
                      where lp.user_id = v_order.user_id and lp.verification_status = 'pending') then
    perform public.merge_payment_order_metadata(p_order, '{"founder": "not_verified"}'::jsonb);
    return 'not_verified';
  end if;

  -- 20261127_10 (decision 2): a PAID order is never refused for want of a
  -- seat. A seat that is not already counted (the order's own live
  -- reservation or pending seat, or the user's other live reservation that
  -- this call takes over) is taken past capacity when none is free, and the
  -- order is marked founder_oversold for the admin.
  if not (coalesce(v_own.status = 'pending_verification', false)
          or coalesce(v_own.status = 'reserved' and v_own.reserved_until > now(), false)
          or coalesce(v_cur.reserved_until > now(), false)) then
    select * into v_lim from public.founder_campaign_limits();
    select count(*) into v_taken
      from public.founder_seats s
     where s.campaign_id = c_campaign
       and s.id is distinct from v_own.id
       and s.id is distinct from v_cur.id
       and (s.status in ('active', 'pending_verification')
            or (s.status = 'reserved' and s.reserved_until > now()))
       and public.founder_seat_counted(s.user_id, s.order_id);
    v_oversold := v_taken >= v_lim.capacity;
  end if;

  if not v_verified then
    -- paid, licence not checked yet: the seat is held (counted, never
    -- expiring) until the admin approves (→ this function again) or rejects
    -- (→ the full refund, founder_revoke)
    if v_own.id is not null then
      if v_cur.id is not null then
        update public.founder_seats set status = 'released' where id = v_cur.id;
      end if;
      v_target := v_own.id;
      update public.founder_seats
         set status = 'pending_verification', reserved_until = null
       where id = v_target;
    elsif v_cur.id is not null then
      v_target := v_cur.id;
      update public.founder_seats
         set order_id = p_order, status = 'pending_verification', reserved_until = null
       where id = v_target;
    else
      insert into public.founder_seats (campaign_id, user_id, order_id, status)
      values (c_campaign, v_order.user_id, p_order, 'pending_verification')
      returning id into v_target;
    end if;
    perform public.merge_payment_order_metadata(p_order,
      case when v_oversold then '{"founder": "pending_verification", "founder_oversold": true}'::jsonb
           else '{"founder": "pending_verification"}'::jsonb end);
    return 'pending_verification';
  end if;

  if v_own.id is not null then
    if v_cur.id is not null then
      update public.founder_seats set status = 'released' where id = v_cur.id;
    end if;
    v_target := v_own.id;
    update public.founder_seats
       set status = 'active', activated_at = now(), ends_at = v_ends
     where id = v_target;
  elsif v_cur.id is not null then
    v_target := v_cur.id;
    update public.founder_seats
       set order_id = p_order, status = 'active', activated_at = now(), ends_at = v_ends
     where id = v_target;
  else
    insert into public.founder_seats (campaign_id, user_id, order_id, status, activated_at, ends_at)
    values (c_campaign, v_order.user_id, p_order, 'active', now(), v_ends)
    returning id into v_target;
  end if;

  insert into public.membership_credits (seat_id, user_id, kind, total, remaining, ends_at)
  values (v_target, v_order.user_id, 'drafting_work', 6, 6, v_ends),
         (v_target, v_order.user_id, 'independent_output', 1, 1, v_ends),
         -- 20261124_10 (owner ٨ / ١٥ / ١٨): 100 founder points for the library
         -- assistant only = 20 questions at 5 points, ending with the seat
         (v_target, v_order.user_id, 'library_question', 20, 20, v_ends);

  perform public.library_grant_access(v_order.user_id, 'lib-founder', 'purchase', 365, null,
                                      p_order, 'founder membership', null);

  update public.lawyer_profiles set founder_badge = true where user_id = v_order.user_id;

  -- founder_oversold is written only when THIS call took a seat past
  -- capacity; a pending seat activated later keeps the flag it got then
  perform public.merge_payment_order_metadata(p_order,
    case when v_oversold then '{"founder": "activated", "founder_oversold": true}'::jsonb
         else '{"founder": "activated"}'::jsonb end);
  return 'activated';
end $$;

comment on function public.founder_activate(uuid) is
  'Activates the founder membership of a PAID membership order under the seats lock (20261101_10): activated | already | not_paid | not_verified | pending_verification. Never full since 20261127_10 (decision 2): a seat past capacity is still given and metadata.founder_oversold = true. A pending lawyer (20261127_10, decision 1) gets a pending_verification seat (counted, never expiring) until the admin approves him — then this function again activates it. Seat active 12 months, credits drafting_work 6 + independent_output 1 + library_question 20 (20261124_10: 100 points for the library assistant at 5 a question), lib-founder 365 days, badge. not_verified writes metadata.founder. Does not check the window. Service role only.';

-- ── 5. founder_revoke: 20261101_10 + a pending_verification seat ─────────────
create or replace function public.founder_revoke(p_order uuid, p_reason text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_seat   record;
  v_grant  uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if p_order is null or v_reason is null then
    raise exception 'founder_revoke: p_order and a reason are required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'));

  -- 20261127_10: a paid seat waiting for the licence check is revoked too
  -- (the admin rejected the lawyer → the full refund)
  select s.id, s.user_id into v_seat
    from public.founder_seats s
   where s.order_id = p_order and s.status in ('reserved', 'pending_verification', 'active');
  if v_seat.id is null then
    return 'none';
  end if;

  update public.founder_seats set status = 'revoked' where id = v_seat.id;
  update public.membership_credits set remaining = 0 where seat_id = v_seat.id;

  -- library_grant_revoke closes the window (the readers check it, not
  -- revoked_at) and keeps the reason; it refuses a revoked or ended grant
  select g.id into v_grant
    from public.library_access_grants g
   where g.order_id = p_order and g.revoked_at is null and g.ends_at > now();
  if v_grant is not null then
    perform public.library_grant_revoke(v_grant, null, v_reason);
  end if;

  update public.lawyer_profiles lp
     set founder_badge = false
   where lp.user_id = v_seat.user_id and lp.founder_badge
     and not exists (select 1 from public.founder_seats s
                      where s.user_id = v_seat.user_id and s.status = 'active');

  return 'revoked';
end $$;

comment on function public.founder_revoke(uuid, text) is
  'Revokes the founder seat of an order (20261101_10; a pending_verification seat too since 20261127_10): seat revoked, credits 0, the order''s library grant revoked via library_grant_revoke, badge cleared unless another seat is active. revoked | none. Service role only.';

-- ── 6. founder_seat_summary: counted seats only, pending, overflow ──────────
drop function if exists public.founder_seat_summary();
create function public.founder_seat_summary()
returns table (capacity int, active int, reserved int, seats_left int, sale_paused boolean, on_sale boolean,
               pending int, overflow int, test_seats int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with l as (select * from public.founder_campaign_limits()),
       s as (select s.status,
                    s.status = 'reserved' and s.reserved_until > now() as live_hold,
                    public.founder_seat_counted(s.user_id, s.order_id) as counted
               from public.founder_seats s
              where s.campaign_id = 'founder-2026'
                and s.status in ('reserved', 'pending_verification', 'active')),
       c as (select count(*) filter (where s.counted and s.status = 'active')::int               as n_active,
                    count(*) filter (where s.counted and s.status = 'pending_verification')::int as n_pending,
                    count(*) filter (where s.counted and s.live_hold)::int                       as n_reserved,
                    count(*) filter (where not s.counted
                                       and (s.status <> 'reserved' or s.live_hold))::int         as n_test
               from s)
  select l.capacity,
         c.n_active,
         c.n_reserved,
         greatest(l.capacity - c.n_active - c.n_pending - c.n_reserved, 0),
         l.sale_paused,
         public.founder_campaign_active(now()) and not l.sale_paused
           and l.capacity - c.n_active - c.n_pending - c.n_reserved > 0,
         c.n_pending,
         greatest(c.n_active + c.n_pending - l.capacity, 0),
         c.n_test
    from l, c;
$$;

comment on function public.founder_seat_summary() is
  'Founder seats (20261101_10; 20261127_10): capacity, active, live reserved, seats left (never below 0), sale_paused, on_sale (window open, not paused, a seat left), pending (paid, waiting for the licence check), overflow (paid seats past capacity, admin only), test_seats (test / demo / test-mode seats, never counted). Service role only.';

-- ── 7. the founder top-up discount rate (decision 4) ────────────────────────
insert into public.platform_settings (key, value, description) values
  ('founder_topup_discount_bps', '1500'::jsonb,
   'خصم العضو المؤسس على شحن النقاط بنقاط الأساس (١٥٠٠ = ١٥٪)، مدى الحياة ما لم يُسترد المقعد أو يُلغَ (20261127_10)')
on conflict (key) do nothing;

-- ── 8. privileges: service role only ─────────────────────────────────────────
do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.founder_seat_counted(uuid, uuid)',
    'public.founder_reserve_seat(uuid, uuid)',
    'public.founder_activate(uuid)',
    'public.founder_revoke(uuid, text)',
    'public.founder_seat_summary()'] loop
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', fn);
    end if;
  end loop;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  v_reserve  text := pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure);
  v_activate text := pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure);
  v_revoke   text := pg_catalog.pg_get_functiondef('public.founder_revoke(uuid, text)'::regprocedure);
  fn text;
  role_name text;
begin
  if pg_catalog.pg_get_constraintdef((select c.oid from pg_catalog.pg_constraint c
                                       where c.conrelid = 'public.founder_seats'::regclass
                                         and c.conname = 'founder_seats_status_check')) not like '%pending_verification%' then
    raise exception '20261127_10 verify: founder_seats_status_check does not allow pending_verification';
  end if;
  if pg_catalog.pg_get_indexdef(to_regclass('public.founder_seats_one_per_user')) not like '%pending_verification%' then
    raise exception '20261127_10 verify: founder_seats_one_per_user does not cover pending_verification';
  end if;
  if pg_catalog.strpos(v_reserve, 'demo_account') = 0 or pg_catalog.strpos(v_reserve, '15 minutes') = 0
     or pg_catalog.strpos(v_reserve, 'not_advocate') = 0 or pg_catalog.strpos(v_reserve, '2 hours') > 0
     or pg_catalog.strpos(v_reserve, '''verified'', ''pending''') = 0
     or pg_catalog.strpos(v_reserve, 'founder_seat_counted') = 0 then
    raise exception '20261127_10 verify: founder_reserve_seat lost an earlier rule or misses the pending lawyer / counted seats';
  end if;
  if pg_catalog.strpos(v_activate, '''library_question'', 20, 20') = 0
     or pg_catalog.strpos(v_activate, 'pending_verification') = 0
     or pg_catalog.strpos(v_activate, 'founder_oversold') = 0
     or pg_catalog.strpos(v_activate, 'return ''full''') > 0 then
    raise exception '20261127_10 verify: founder_activate still answers full, or lost library_question / pending_verification';
  end if;
  if pg_catalog.strpos(v_revoke, 'pending_verification') = 0 then
    raise exception '20261127_10 verify: founder_revoke does not revoke a pending_verification seat';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('founder_reserve_seat', 'founder_activate', 'founder_revoke', 'founder_seat_summary',
                           'founder_seat_counted')) <> 5 then
    raise exception '20261127_10 verify: a second overload of a founder function';
  end if;
  foreach fn in array array['public.founder_seat_counted(uuid, uuid)', 'public.founder_reserve_seat(uuid, uuid)',
                            'public.founder_activate(uuid)', 'public.founder_revoke(uuid, text)',
                            'public.founder_seat_summary()'] loop
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = role_name)
         and has_function_privilege(role_name, fn, 'EXECUTE') then
        raise exception '20261127_10 verify: % can EXECUTE %', role_name, fn;
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', fn, 'EXECUTE') then
      raise exception '20261127_10 verify: service_role cannot EXECUTE %', fn;
    end if;
  end loop;
  if (select s.seats_left from public.founder_seat_summary() s) < 0
     or (select s.overflow from public.founder_seat_summary() s) < 0 then
    raise exception '20261127_10 verify: founder_seat_summary gave a negative count';
  end if;
  if not exists (select 1 from public.platform_settings where key = 'founder_topup_discount_bps') then
    raise exception '20261127_10 verify: platform_settings has no founder_topup_discount_bps';
  end if;
  raise notice '20261127_10 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261127_10 founder: pay before verification, oversell honoured, counted seats only, lifetime top-up discount rate' as step,
       (pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure) like '%pending_verification%'
        and pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure) not like '%return ''full''%'
        and pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure) like '%founder_seat_counted%'
        and pg_catalog.pg_get_functiondef('public.founder_revoke(uuid, text)'::regprocedure) like '%pending_verification%'
        and exists (select 1 from information_schema.routines r
                     where r.specific_schema = 'public' and r.routine_name = 'founder_seat_summary')
        and (select s.seats_left >= 0 and s.overflow >= 0 from public.founder_seat_summary() s)
        and exists (select 1 from public.platform_settings where key = 'founder_topup_discount_bps')) as ok;
