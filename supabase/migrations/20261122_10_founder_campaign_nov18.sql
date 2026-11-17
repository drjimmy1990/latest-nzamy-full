-- =============================================================================
-- Migration: 20261122_10_founder_campaign_nov18.sql
-- =============================================================================
-- PURPOSE (owner package 17 Nov 2026, campaign.manifest.v2.json)
--   1. The founder campaign runs ONE MONTH: from 18 Nov 2026 00:00 Riyadh to
--      18 Dec 2026 00:00 Riyadh (exclusive; the last day shown is 17 Dec), or
--      until the 1,096 seats are taken. founder_campaign_active() reads Riyadh
--      days, both included, so starts_on = 2026-11-18 and ends_on = 2026-12-17
--      give exactly that window. capacity is set to 1096; sale_paused and
--      library_days are kept as they are.
--   2. founder_reserve_seat() refuses a lawyer whose practice_kind is not
--      'advocate' with the new answer 'not_advocate' (the checkout turns it
--      into a 403 before any payment). Everything else in the function is
--      unchanged from 20261101_10 (the 2-hour hold stays until the owner
--      decides between 15 minutes and 2 hours).
--
-- HOW TO RUN: together with the deploy (the old code reads the new
--   'not_advocate' answer as a 503):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261122_10_founder_campaign_nov18.sql
--   Expect: NOTICE  20261122_10 verify: OK  and a row with `t`.
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.founder_reserve_seat(uuid, uuid)') is null then
    raise exception '20261122_10: run 20261101_10_founder_membership.sql first';
  end if;
end
$pre$;

-- ── 1. the window: 18 Nov → 17 Dec 2026 (Riyadh days, both included) ────────
update public.platform_settings
   set value = value || '{"starts_on": "2026-11-18", "ends_on": "2026-12-17", "capacity": 1096}'::jsonb
 where key = 'founder_campaign'
   and jsonb_typeof(value) = 'object';

-- ── 2. advocate only ─────────────────────────────────────────────────────────
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
  v_cur    record;   -- the user's reserved or active seat
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

  select s.id, s.status, s.reserved_until, po.status as order_status into v_cur
    from public.founder_seats s
    left join public.payment_orders po on po.id = s.order_id
   where s.campaign_id = c_campaign and s.user_id = p_user and s.status in ('reserved', 'active');

  if v_cur.id is not null and (v_cur.status = 'active' or v_cur.order_status = 'paid') then
    return 'already_member';
  end if;

  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = p_user and lp.verification_status = 'verified') then
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

  -- a live reservation is already counted; anything else needs a free seat
  if not coalesce(v_cur.reserved_until > now(), false) then
    select count(*) into v_taken
      from public.founder_seats s
     where s.campaign_id = c_campaign
       and s.id is distinct from v_cur.id
       and (s.status = 'active' or (s.status = 'reserved' and s.reserved_until > now()));
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
       set status = 'reserved', reserved_until = now() + interval '2 hours'
     where id = v_own.id;
  elsif v_cur.id is not null then
    -- a declined card, a retry: the SAME seat moves to the new order
    update public.founder_seats
       set order_id = p_order, reserved_until = now() + interval '2 hours'
     where id = v_cur.id;
  else
    insert into public.founder_seats (campaign_id, user_id, order_id, status, reserved_until)
    values (c_campaign, p_user, p_order, 'reserved', now() + interval '2 hours');
  end if;

  return 'reserved';
end $$;

comment on function public.founder_reserve_seat(uuid, uuid) is
  'Reserves a founder seat for 2 hours under the seats lock (20261101_10; advocate only since 20261122_10): reserved | already_member | full | closed | paused | not_verified | not_advocate. An unpaid reservation of the same user is moved to the new order (a retry). Service role only.';

revoke all on function public.founder_reserve_seat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.founder_reserve_seat(uuid, uuid) to service_role;

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v jsonb;
begin
  select s.value into v from public.platform_settings s where s.key = 'founder_campaign';
  if v is not null and (v ->> 'starts_on' is distinct from '2026-11-18'
                        or v ->> 'ends_on' is distinct from '2026-12-17'
                        or v ->> 'capacity' is distinct from '1096') then
    raise exception '20261122_10 verify: founder_campaign is %', v;
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure), 'not_advocate') = 0 then
    raise exception '20261122_10 verify: founder_reserve_seat has no advocate check';
  end if;
  if has_function_privilege('anon', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE') then
    raise exception '20261122_10 verify: founder_reserve_seat is callable by anon/authenticated';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'founder_reserve_seat') <> 1 then
    raise exception '20261122_10 verify: more than one founder_reserve_seat';
  end if;
  raise notice '20261122_10 verify: OK';
end
$verify$;

commit;

select '20261122_10 founder campaign 18 Nov - 17 Dec, advocate only' as step,
       coalesce((select value ->> 'starts_on' = '2026-11-18' and value ->> 'ends_on' = '2026-12-17'
                   from public.platform_settings where key = 'founder_campaign'), true) as ok;
