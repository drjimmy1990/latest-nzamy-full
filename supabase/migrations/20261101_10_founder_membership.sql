-- =============================================================================
-- Migration: 20261101_10_founder_membership.sql
-- «عضوية المحامي المؤسس» — the paid lawyer founder membership (P3, Task 1):
-- seats, credits and activation in SQL.
-- Plan: docs/plans/2026-11-01-founder-membership-p3-plan.md (Task 1).
-- Safe to re-run. Every function is service role only.
-- =============================================================================
--
-- WHAT IT SELLS
--   One membership, plan `lawyer-founder-2026`, campaign `founder-2026`:
--   1,096 seats, 2,996 SAR before VAT, paid once. Window 2026-11-01 →
--   2027-01-25 (Riyadh days, both included) or until the seats run out.
--   A seat goes ONLY to a verified licence with a paid order and a seat
--   allocated under one lock. It lasts 12 months from activation and brings
--   6 «أعمال صياغة» (drafting_work), 1 «مخرَج مستقل» (independent_output), a
--   365-day lib-founder library grant and the founder badge.
--
-- WHAT THIS FILE ADDS (idempotent; one transaction)
--   1. payment_orders.kind CHECK also allows 'membership' (dropped and re-added
--      only when 'membership' is missing, so a re-run takes no table lock).
--   2. platform_settings['founder_campaign'] gains capacity (1096) and
--      sale_paused (false); starts_on moves from the 20261021_50 seed
--      2026-10-25 to 2026-11-01. The defaults go on the LEFT of `||`, so an
--      admin's later edit of capacity / sale_paused survives a re-run, and
--      starts_on is touched only while it still holds the seed. The other keys
--      (ends_on, library_days) are kept. A missing row is left missing (the
--      campaign then reads as closed).
--      Ruling R1: every reader goes through founder_campaign_limits(), which
--      reads a missing or malformed capacity as 1096 and sale_paused as false.
--   3. public.founder_seats — one row per seat. status reserved → active →
--      revoked, or reserved → released. A partial UNIQUE index allows ONE
--      reserved-or-active seat per (campaign, user); order_id is UNIQUE.
--      A signed-in user reads his own rows (RLS); `note` is therefore visible
--      to him — never write private admin text there.
--   4. public.membership_credits — the seat's two credit rows (6 and 1),
--      unique (seat_id, kind), remaining between 0 and total. Owner reads own.
--   5. public.membership_credit_uses — one row per AI run that spent a credit
--      (run_id UNIQUE → ai_runs). Server only (RLS on, no policy). §8
--      (ai_start_run_with_credit / ai_fail_run) writes it.
--   6. Functions (SECURITY DEFINER, search_path public, pg_temp, EXECUTE for
--      service_role only). Every one that changes a seat first takes
--        pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'))
--      so a count and the insert that depends on it never interleave with
--      another buyer's (two sessions racing for the last seat: the second
--      waits, then counts the first one's seat and gets 'full').
--
--      founder_reserve_seat(p_user, p_order) → reserved | already_member |
--        full | closed | paused | not_verified. p_order must be a membership
--        order of p_user (else 22023). In this order:
--          * an ACTIVE seat → already_member;
--          * a reserved seat whose order is already PAID → already_member
--            (DELIBERATE, beyond the brief's "only active": the payment is
--            captured and activation is pending — moving that seat would
--            detach the paid order and let the buyer pay twice);
--          * licence not verified → not_verified;
--          * founder_campaign_active() false → closed; sale_paused → paused;
--          * a reserved seat whose order is NOT paid (a declined card, a
--            retry) is MOVED to p_order and its reserved_until refreshed —
--            the same seat, never a second one, never already_member. If that
--            reservation already expired it is moved only when a seat is free;
--          * if p_order already sits on a seat released earlier, that row is
--            brought back (order_id is UNIQUE) and the other reservation, if
--            any, is released;
--          * otherwise a new seat when active + live reserved < capacity
--            (else full), reserved_until = now() + 2 hours.
--
--      founder_activate(p_order) → activated | already | not_paid |
--        not_verified | full. Does NOT check the campaign window: a payment
--        started inside it and captured after it still activates.
--          * not a membership order → 22023; status <> 'paid' → not_paid;
--          * the order's seat is already active or revoked → already;
--          * the user holds an active seat from ANOTHER order (he paid twice)
--            → already, and metadata.founder = 'already_member' (a refund
--            case for the admin);
--          * licence not verified → not_verified, metadata.founder =
--            'not_verified'; the seat is left as it is, so the admin can
--            activate again after verifying;
--          * the seat: the order's own seat (even an expired or released
--            one), else the user's other reservation (adopted), else a new
--            one. A live reservation is already counted; anything else needs
--            a free seat → else full, metadata.founder = 'seat_unavailable',
--            the order stays paid, nothing granted;
--          * success: seat active, activated_at now(), ends_at now() +
--            12 months; credits drafting_work 6 and independent_output 1 with
--            the same ends_at; library_grant_access(user, 'lib-founder',
--            'purchase', 365, null, p_order, 'founder membership', null)
--            (stacks after any running grant, 20261030_65); founder_badge =
--            true; metadata.founder = 'activated' (so an order that was once
--            seat_unavailable / not_verified leaves the refund list).
--
--      founder_revoke(p_order, p_reason) → revoked | none. Blank reason →
--        22023. The order's reserved or active seat → revoked; its credits →
--        remaining 0; the order's library grant is revoked through
--        library_grant_revoke (20261030_65), which sets revoked_at, keeps the
--        reason in library_access_grant_admin.revoke_reason AND closes the
--        window — the readers check the window, not revoked_at. A grant
--        already revoked or ended is left alone. The badge is cleared unless
--        the user holds another active seat. No such seat → none.
--
--      founder_release_expired() → int: releases reserved seats past
--        reserved_until whose order is not paid (the payments sweep).
--      founder_release_order(p_order) → boolean: releases the order's
--        reserved seat at once (Moyasar said failed / voided / cancelled);
--        never one whose order is paid.
--      founder_seat_summary() → capacity, active, reserved (live only),
--        seats_left, sale_paused, on_sale (window open, not paused, a seat
--        left).
--      founder_campaign_limits() → capacity, sale_paused with the R1
--        defaults (internal helper).
--   7. §8 (Task 2) — the credits pay for AI runs:
--      ai_start_run_with_credit(<ai_start_run's 14 parameters>, p_credit_kind)
--        → run_id, created, status, charged, charged_points, credit_used.
--        Spends one credit (row locked FOR UPDATE) and starts the run at
--        price 0 in one transaction. P0001 credit_not_eligible | no_credit.
--        points_enforcement off → a free run, nothing consumed.
--      ai_fail_run(uuid, text, text) RE-CREATED with the identical signature
--        and body of 20261027_10 plus one block: a failed run that spent a
--        credit gets it back exactly once (membership_credit_uses.restored_at).
--
-- 20261027_10 COUPLING — re-running 20261027_10 AFTER this file silently puts
--   back the ai_fail_run WITHOUT the credit restore. Re-run this file after
--   it (its verify checks the restore is there).
--
-- 20261026_02 COUPLING
--   20261026_02 clears every founder_badge whose user holds no PAID order with
--   item_id ilike '%founder%'. The plan id lawyer-founder-2026 matches, so a
--   re-run of 20261026_02 keeps a paid founder's badge. Do not sell this
--   membership under an item_id without "founder".
--
-- PREREQUISITES (the file raises without them)
--   20261021_50 (founder_badge, founder_campaign_active), 20261022_10
--   (payment_orders), 20261022_30 (merge_payment_order_metadata), 20261027_10
--   (ai_runs), 20261030_65 (library_grant_access / library_grant_revoke).
--
-- DEPLOY ORDER — BEFORE THE DEPLOY of the founder checkout. Nothing calls
--   these functions until that code ships, so the file may run any time
--   before it. NOTE: deploy.sh does not run _verify.sql.
--
-- ROLLBACK (only before any seat is sold) — IN THIS ORDER: ai_fail_run reads
--   membership_credit_uses, so dropping that table first would make every AI
--   failure raise 42P01 and stop every points refund.
--   1. re-run 20261027_10_ai_runs.sql (puts back the ai_fail_run without the
--      credit restore; it does not touch ai_runs data);
--   2. drop function if exists public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text);
--   3. then:
--   drop function if exists public.founder_reserve_seat(uuid, uuid);
--   drop function if exists public.founder_activate(uuid);
--   drop function if exists public.founder_revoke(uuid, text);
--   drop function if exists public.founder_release_expired();
--   drop function if exists public.founder_release_order(uuid);
--   drop function if exists public.founder_seat_summary();
--   drop function if exists public.founder_campaign_limits();
--   drop table if exists public.membership_credit_uses, public.membership_credits, public.founder_seats;
--   (the kind CHECK and the setting keys may stay; they are harmless)
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
declare
  fn text;
begin
  if to_regclass('public.payment_orders') is null then
    raise exception '20261101_10: public.payment_orders does not exist — run 20261022_10 first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261101_10: public.platform_settings does not exist — run 20260627 first';
  end if;
  if to_regclass('public.ai_runs') is null then
    raise exception '20261101_10: public.ai_runs does not exist — run 20261027_10 first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'founder_badge' and not attisdropped) then
    raise exception '20261101_10: lawyer_profiles.founder_badge does not exist — run 20261021_50 first';
  end if;
  foreach fn in array array[
    'public.founder_campaign_active(timestamptz)',
    'public.merge_payment_order_metadata(uuid, jsonb)',
    'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)',
    'public.library_grant_revoke(uuid, uuid, text)'] loop
    if to_regprocedure(fn) is null then
      raise exception '20261101_10: % does not exist — run 20261021_50, 20261022_30 and 20261030_65 first', fn;
    end if;
  end loop;
end $$;

-- ── 1. payment_orders.kind allows 'membership' ───────────────────────────────
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.payment_orders'::regclass and conname = 'payment_orders_kind_check';
  if def is null or position('''membership''' in def) = 0 then
    alter table public.payment_orders drop constraint if exists payment_orders_kind_check;
    alter table public.payment_orders add constraint payment_orders_kind_check
      check (kind in ('plan', 'library', 'topup', 'service', 'membership'));
  end if;
end $$;

-- ── 2. The setting: capacity, sale_paused, the 1 Nov start ───────────────────
update public.platform_settings
   set value = '{"capacity": 1096, "sale_paused": false}'::jsonb || value
 where key = 'founder_campaign'
   and jsonb_typeof(value) = 'object'
   and not (value ? 'capacity' and value ? 'sale_paused');

update public.platform_settings
   set value = value || '{"starts_on": "2026-11-01"}'::jsonb
 where key = 'founder_campaign'
   and jsonb_typeof(value) = 'object'
   and value ->> 'starts_on' = '2026-10-25';

-- ── 3. founder_seats ─────────────────────────────────────────────────────────
create table if not exists public.founder_seats (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     text not null default 'founder-2026',
  user_id         uuid not null references auth.users(id) on delete cascade,
  order_id        uuid null
                  constraint founder_seats_order_id_key unique
                  references public.payment_orders(id),
  status          text not null default 'reserved'
                  constraint founder_seats_status_check
                  check (status in ('reserved', 'active', 'released', 'revoked')),
  reserved_until  timestamptz,
  activated_at    timestamptz,
  ends_at         timestamptz,
  note            text,
  created_at      timestamptz not null default now()
);

create unique index if not exists founder_seats_one_per_user
  on public.founder_seats (campaign_id, user_id) where status in ('reserved', 'active');
create index if not exists founder_seats_campaign_status_idx
  on public.founder_seats (campaign_id, status);

comment on table public.founder_seats is
  'Lawyer founder membership seats (20261101_10, P3). One reserved-or-active seat per (campaign, user); written only by the founder_* functions (service role). The owner reads his own rows, note included.';

-- ── 4. membership_credits ────────────────────────────────────────────────────
create table if not exists public.membership_credits (
  id          uuid primary key default gen_random_uuid(),
  seat_id     uuid not null references public.founder_seats(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null
              constraint membership_credits_kind_check
              check (kind in ('drafting_work', 'independent_output')),
  total       int  not null constraint membership_credits_total_check check (total > 0),
  remaining   int  not null,
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint membership_credits_remaining_check check (remaining between 0 and total),
  constraint membership_credits_seat_kind_key unique (seat_id, kind)
);

create index if not exists membership_credits_user_kind_idx
  on public.membership_credits (user_id, kind);

comment on table public.membership_credits is
  'The founder seat''s credits (20261101_10): drafting_work 6, independent_output 1, ending with the seat. The owner reads his own rows; only the server writes.';

-- ── 5. membership_credit_uses ────────────────────────────────────────────────
create table if not exists public.membership_credit_uses (
  id           uuid primary key default gen_random_uuid(),
  credit_id    uuid not null references public.membership_credits(id) on delete cascade,
  run_id       uuid not null
               constraint membership_credit_uses_run_id_key unique
               references public.ai_runs(id) on delete cascade,
  tool         text not null,
  used_at      timestamptz not null default now(),
  restored_at  timestamptz
);

create index if not exists membership_credit_uses_credit_idx
  on public.membership_credit_uses (credit_id);

comment on table public.membership_credit_uses is
  'One row per AI run paid with a membership credit (20261101_10); restored_at is set once when the run fails. Service role only.';

-- ── 6. Privileges and RLS ────────────────────────────────────────────────────
alter table public.founder_seats          enable row level security;
alter table public.membership_credits     enable row level security;
alter table public.membership_credit_uses enable row level security;

revoke all on public.founder_seats, public.membership_credits, public.membership_credit_uses
  from public, anon, authenticated;
grant select on public.founder_seats, public.membership_credits to authenticated;
grant all on public.founder_seats, public.membership_credits, public.membership_credit_uses to service_role;

drop policy if exists "founder seats: owner reads own" on public.founder_seats;
create policy "founder seats: owner reads own" on public.founder_seats
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "membership credits: owner reads own" on public.membership_credits;
create policy "membership credits: owner reads own" on public.membership_credits
  for select to authenticated using (user_id = (select auth.uid()));

-- ── 7. Functions ─────────────────────────────────────────────────────────────

-- 7a. capacity / sale_paused with the R1 defaults
create or replace function public.founder_campaign_limits()
returns table (capacity int, sale_paused boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce((select case when jsonb_typeof(s.value -> 'capacity') in ('number', 'string')
                               and (s.value ->> 'capacity') ~ '^[0-9]{1,9}$'
                          then (s.value ->> 'capacity')::int end
                from public.platform_settings s where s.key = 'founder_campaign'), 1096),
    coalesce((select case when jsonb_typeof(s.value -> 'sale_paused') = 'boolean'
                          then (s.value ->> 'sale_paused')::boolean end
                from public.platform_settings s where s.key = 'founder_campaign'), false);
$$;

comment on function public.founder_campaign_limits() is
  'founder_campaign capacity and sale_paused, reading a missing or malformed value as 1096 / false (20261101_10, ruling R1). Service role only.';

-- 7b. reserve
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
  'Reserves a founder seat for 2 hours under the seats lock (20261101_10): reserved | already_member | full | closed | paused | not_verified. An unpaid reservation of the same user is moved to the new order (a retry). Service role only.';

-- 7c. activate
create or replace function public.founder_activate(p_order uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  c_campaign constant text := 'founder-2026';
  v_order   record;
  v_own     record;   -- the seat that carries p_order
  v_cur     record;   -- the user's OTHER reserved or active seat
  v_lim     record;
  v_taken   int;
  v_target  uuid;
  v_ends    timestamptz := now() + interval '12 months';
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
     and s.status in ('reserved', 'active') and s.id is distinct from v_own.id;
  if v_cur.status = 'active' then
    perform public.merge_payment_order_metadata(p_order, '{"founder": "already_member"}'::jsonb);
    return 'already';
  end if;

  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id = v_order.user_id and lp.verification_status = 'verified') then
    perform public.merge_payment_order_metadata(p_order, '{"founder": "not_verified"}'::jsonb);
    return 'not_verified';
  end if;

  -- a live reservation (the order's own, or the user's other one that this
  -- activation takes over) is already counted; anything else needs a free seat
  if not (coalesce(v_own.status = 'reserved' and v_own.reserved_until > now(), false)
          or coalesce(v_cur.reserved_until > now(), false)) then
    select * into v_lim from public.founder_campaign_limits();
    select count(*) into v_taken
      from public.founder_seats s
     where s.campaign_id = c_campaign
       and s.id is distinct from v_own.id
       and s.id is distinct from v_cur.id
       and (s.status = 'active' or (s.status = 'reserved' and s.reserved_until > now()));
    if v_taken >= v_lim.capacity then
      perform public.merge_payment_order_metadata(p_order, '{"founder": "seat_unavailable"}'::jsonb);
      return 'full';
    end if;
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
         (v_target, v_order.user_id, 'independent_output', 1, 1, v_ends);

  perform public.library_grant_access(v_order.user_id, 'lib-founder', 'purchase', 365, null,
                                      p_order, 'founder membership', null);

  update public.lawyer_profiles set founder_badge = true where user_id = v_order.user_id;

  perform public.merge_payment_order_metadata(p_order, '{"founder": "activated"}'::jsonb);
  return 'activated';
end $$;

comment on function public.founder_activate(uuid) is
  'Activates the founder membership of a PAID membership order under the seats lock (20261101_10): activated | already | not_paid | not_verified | full. Seat active 12 months, credits 6 + 1, lib-founder 365 days, badge. not_verified / full write metadata.founder. Does not check the window. Service role only.';

-- 7d. revoke
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

  select s.id, s.user_id into v_seat
    from public.founder_seats s
   where s.order_id = p_order and s.status in ('reserved', 'active');
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
  'Revokes the founder seat of an order (20261101_10): seat revoked, credits 0, the order''s library grant revoked via library_grant_revoke, badge cleared unless another seat is active. revoked | none. Service role only.';

-- 7e. release the stale reservations (the payments sweep)
create or replace function public.founder_release_expired()
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_n int;
begin
  perform pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'));

  with released as (
    update public.founder_seats s
       set status = 'released'
     where s.status = 'reserved' and s.reserved_until <= now()
       and not exists (select 1 from public.payment_orders po
                        where po.id = s.order_id and po.status = 'paid')
    returning 1)
  select count(*) into v_n from released;
  return v_n;
end $$;

comment on function public.founder_release_expired() is
  'Releases reserved founder seats past reserved_until whose order is not paid; returns how many (20261101_10). Service role only.';

-- 7f. release one order's reservation (Moyasar said failed / voided / cancelled)
create or replace function public.founder_release_order(p_order uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  if p_order is null then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('founder_seats:founder-2026'));

  update public.founder_seats s
     set status = 'released'
   where s.order_id = p_order and s.status = 'reserved'
     and not exists (select 1 from public.payment_orders po
                      where po.id = s.order_id and po.status = 'paid');
  return found;
end $$;

comment on function public.founder_release_order(uuid) is
  'Releases the reserved founder seat of an order at once, never one whose order is paid; true when a seat was released (20261101_10). Service role only.';

-- 7g. the numbers for the card, the banner and the admin
create or replace function public.founder_seat_summary()
returns table (capacity int, active int, reserved int, seats_left int, sale_paused boolean, on_sale boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with l as (select * from public.founder_campaign_limits()),
       c as (select count(*) filter (where s.status = 'active')::int                                 as n_active,
                    count(*) filter (where s.status = 'reserved' and s.reserved_until > now())::int as n_reserved
               from public.founder_seats s
              where s.campaign_id = 'founder-2026')
  select l.capacity,
         c.n_active,
         c.n_reserved,
         greatest(l.capacity - c.n_active - c.n_reserved, 0),
         l.sale_paused,
         public.founder_campaign_active(now()) and not l.sale_paused
           and l.capacity - c.n_active - c.n_reserved > 0
    from l, c;
$$;

comment on function public.founder_seat_summary() is
  'Founder seats: capacity, active, live reserved, seats left, sale_paused, on_sale (window open, not paused, a seat left) (20261101_10). Service role only.';

-- 7h. service role only
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.founder_campaign_limits()',
    'public.founder_reserve_seat(uuid, uuid)',
    'public.founder_activate(uuid)',
    'public.founder_revoke(uuid, text)',
    'public.founder_release_expired()',
    'public.founder_release_order(uuid)',
    'public.founder_seat_summary()'] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ── 8. Founder credits on AI runs (P3 Task 2) ────────────────────────────────
-- A credit pays for an AI run instead of points; a failed run gives it back
-- once. Task 6 calls ai_start_run_with_credit from runCore.ts instead of
-- ai_start_run when the run qualifies — its name, parameters, result columns
-- and error codes are that contract.

-- 8a. spend a credit and start the run at price 0, one transaction.
-- Every ai_start_run parameter (same names, types, defaults, order) plus
-- p_credit_kind LAST. Postgres needs a default on every parameter after the
-- first defaulted one, so p_credit_kind defaults to null — and null (or any
-- unknown kind) is credit_not_eligible.
--   1. eligibility → else P0001 credit_not_eligible:
--        drafting_work       p_tool 'legal-drafter' and p_input->>'kind' in
--                            claim, reply, supplementary, closing, appeal,
--                            cassation, petition ('rejoinder' is NOT — ruling
--                            R3, owner ٣٩٩);
--        independent_output  p_tool in contracts-pro, legal-opinion-consult,
--                            legal-opinion-letter, wargaming.
--   2. points_enforcement off (read as ai_start_run reads it) → an ordinary
--      free run: ai_start_run(p_price 0), credit_used false, nothing consumed.
--   3. lock the user's credit row FOR UPDATE: this kind, remaining > 0,
--      ends_at > now(), its seat ACTIVE (a revoked seat never spends, even a
--      credit that a late ai_fail_run gave back). Nearest end first. A second
--      call of the same user waits here and then re-reads remaining.
--      None → if the run of this idempotency key already exists (a replay
--      after the last credit), ai_start_run returns it, credit_used false;
--      else P0001 no_credit (nothing written).
--   4. ai_start_run(p_price 0, every other argument passed through): its
--      daily limit, duplicate key and deadline rules are unchanged.
--   5. created → one membership_credit_uses row and remaining - 1,
--      credit_used true. A duplicate key (created false) → the existing run,
--      credit_used false, no second decrement.
create or replace function public.ai_start_run_with_credit(
  p_user            uuid,
  p_tool            text,
  p_variant         text,
  p_class           text,
  p_price           int,
  p_daily_limit     int,
  p_idempotency_key text,
  p_deadline        timestamptz,
  p_exempt          boolean default false,
  p_input           jsonb default null,
  p_file_ids        text[] default '{}',
  p_pages           int default null,
  p_conversation    uuid default null,
  p_source_ids      jsonb default null,
  p_credit_kind     text default null)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int, credit_used boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok      boolean;
  v_enforce boolean;
  v_credit  uuid;
  v_run     record;
begin
  v_ok := coalesce(
       (p_credit_kind = 'drafting_work'
        and p_tool = 'legal-drafter'
        and p_input ->> 'kind' in ('claim', 'reply', 'supplementary', 'closing', 'appeal', 'cassation', 'petition'))
    or (p_credit_kind = 'independent_output'
        and p_tool in ('contracts-pro', 'legal-opinion-consult', 'legal-opinion-letter', 'wargaming')),
    false);
  if not v_ok then
    raise exception 'credit_not_eligible' using errcode = 'P0001',
      detail = format('credit kind %s does not pay for tool %s (kind %s)',
                      coalesce(p_credit_kind, '(none)'), coalesce(p_tool, '(none)'),
                      coalesce(p_input ->> 'kind', '(none)'));
  end if;

  select coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false) into v_enforce;

  if v_enforce then
    select c.id into v_credit
      from public.membership_credits c
      join public.founder_seats fs on fs.id = c.seat_id
     where c.user_id = p_user and c.kind = p_credit_kind
       and c.remaining > 0 and c.ends_at > now()
       and fs.status = 'active'
     order by c.ends_at, c.id
     limit 1
       for update of c;

    if v_credit is null
       and not exists (select 1 from public.ai_runs a
                        where a.user_id = p_user and a.idempotency_key = p_idempotency_key) then
      raise exception 'no_credit' using errcode = 'P0001',
        detail = format('no %s credit left', p_credit_kind);
    end if;
  end if;

  select s.run_id, s.created, s.status, s.charged, s.charged_points into v_run
    from public.ai_start_run(
           p_user            => p_user,
           p_tool            => p_tool,
           p_variant         => p_variant,
           p_class           => p_class,
           p_price           => 0,
           p_daily_limit     => p_daily_limit,
           p_idempotency_key => p_idempotency_key,
           p_deadline        => p_deadline,
           p_exempt          => p_exempt,
           p_input           => p_input,
           p_file_ids        => p_file_ids,
           p_pages           => p_pages,
           p_conversation    => p_conversation,
           p_source_ids      => p_source_ids) s;

  if v_credit is not null and v_run.created then
    insert into public.membership_credit_uses (credit_id, run_id, tool)
      values (v_credit, v_run.run_id, p_tool);
    update public.membership_credits c
       set remaining = c.remaining - 1
     where c.id = v_credit;
    return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points, true;
    return;
  end if;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points, false;
end $$;

comment on function public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text) is
  'Starts an AI run paid with a founder credit instead of points (20261101_10, P3 Task 2): ai_start_run''s arguments plus p_credit_kind; the run starts at price 0. P0001 credit_not_eligible (tool / drafter kind not covered by the kind) | P0001 no_credit (none left, expired or seat not active). points_enforcement off → a free run, nothing consumed. A duplicate key → the existing run, credit_used false. Service role only.';

-- 8b. ai_fail_run: re-created with the IDENTICAL signature, defaults, result,
-- search_path ('' — kept on purpose: the body names every object with its
-- schema) and body of 20261027_10, plus ONE block right after the status
-- update — before the "not charged → return" exit, because a credit run is
-- never charged. The block gives a credit back once: the use row's
-- restored_at is set only while null, and the status update above it only
-- matches a running / review run, so a second fail (n8n error, then the
-- sweep, then a late callback) returns false before reaching it. least()
-- keeps the CHECK (remaining <= total) from ever raising inside a fail —
-- that would strand the run in 'running' and stop its points refund.
-- NEVER add a second overload (PGRST203 breaks every AI run).
create or replace function public.ai_fail_run(p_run uuid, p_code text, p_message text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_run  public.ai_runs;
  r      record;
  v_lot  uuid;
begin
  if p_run is null or p_code is null then
    raise exception 'ai_fail_run: p_run and p_code are required' using errcode = '22023';
  end if;

  update public.ai_runs a
     set status = 'failed', error_code = left(p_code, 60), error_message = left(p_message, 500),
         finished_at = now()
   where a.id = p_run and a.status in ('running','review')
   returning * into v_run;
  if not found then
    return false;
  end if;

  -- 20261101_10: a run paid with a founder credit gets the credit back, once
  with restored as (
    update public.membership_credit_uses u
       set restored_at = now()
     where u.run_id = p_run and u.restored_at is null
    returning u.credit_id)
  update public.membership_credits c
     set remaining = least(c.total, c.remaining + 1)
    from restored
   where c.id = restored.credit_id;

  if not v_run.charged or v_run.refunded_at is not null then
    return true;
  end if;

  update public.ai_runs a set refunded_at = now() where a.id = p_run and a.refunded_at is null;
  if not found then
    return true;
  end if;

  for r in
    select g.lot_id, g.pts, pl.expires_at
      from (select l.lot_id, sum(-l.delta)::int as pts
              from public.points_ledger l
             where l.user_id = v_run.user_id and l.reason = 'usage'
               and l.ref = 'ai_run:' || p_run::text
             group by l.lot_id) g
      join public.points_lots pl on pl.id = g.lot_id
     order by pl.expires_at, pl.created_at, pl.id
       for update of pl
  loop
    if r.pts <= 0 then
      continue;
    end if;
    if r.expires_at > now() then
      update public.points_lots set points_left = least(points_total, points_left + r.pts) where id = r.lot_id;
      insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
        values (v_run.user_id, r.lot_id, r.pts, 'usage_refund', v_run.tool, 'ai_run:' || p_run::text);
    else
      insert into public.points_lots (user_id, source, points_total, points_left, expires_at)
        values (v_run.user_id, 'refund_restore', r.pts, r.pts, now() + interval '30 days')
        returning id into v_lot;
      insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
        values (v_run.user_id, v_lot, r.pts, 'usage_refund', v_run.tool, 'ai_run:' || p_run::text);
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.ai_fail_run(uuid, text, text) is
  'Fails a running / review AI run once and refunds its debit to the original lots (expired → new 30-day refund_restore lot), ledger reason usage_refund (20261027_10); a run paid with a founder credit gets the credit back once (20261101_10). Service role only.';

-- 8c. service role only
revoke all on function public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text) to service_role;
revoke all on function public.ai_fail_run(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_fail_run(uuid, text, text) to service_role;

-- ── 9. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  fn      text;
  t       text;
  r       text;
  p       text;
  cfg     text[];
  definer boolean;
  src     text;
  def     text;
  v       jsonb;
  missing text := '';
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.payment_orders'::regclass and conname = 'payment_orders_kind_check';
  foreach p in array array['plan', 'library', 'topup', 'service', 'membership'] loop
    if position(quote_literal(p) in coalesce(def, '')) = 0 then
      missing := missing || format(' payment_orders_kind_check does not allow %s;', p);
    end if;
  end loop;

  select value into v from public.platform_settings where key = 'founder_campaign';
  if v is not null and jsonb_typeof(v) = 'object' and not (v ? 'capacity' and v ? 'sale_paused') then
    missing := missing || ' founder_campaign lacks capacity / sale_paused;';
  end if;

  if to_regclass('public.founder_seats_one_per_user') is null then
    missing := missing || ' founder_seats_one_per_user (one reserved-or-active seat per user) is missing;';
  end if;

  foreach t in array array['public.founder_seats', 'public.membership_credits', 'public.membership_credit_uses'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      missing := missing || format(' RLS is off on %s;', t);
    end if;
    foreach r in array array['public', 'anon', 'authenticated'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, t, p) then
          missing := missing || format(' %s holds %s on %s;', r, p, t);
        end if;
      end loop;
    end loop;
    if has_table_privilege('anon', t, 'SELECT') or has_table_privilege('public', t, 'SELECT') then
      missing := missing || format(' anon / PUBLIC can SELECT %s;', t);
    end if;
    if not has_table_privilege('service_role', t, 'SELECT, INSERT, UPDATE, DELETE') then
      missing := missing || format(' service_role cannot read and write %s;', t);
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.membership_credit_uses', 'SELECT') then
    missing := missing || ' authenticated can SELECT membership_credit_uses;';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'membership_credit_uses') then
    missing := missing || ' membership_credit_uses has a policy (it must have none);';
  end if;
  foreach t in array array['founder_seats', 'membership_credits'] loop
    if (select count(*) from pg_policies
         where schemaname = 'public' and tablename = t and cmd = 'SELECT') <> 1
       or exists (select 1 from pg_policies
                   where schemaname = 'public' and tablename = t and cmd <> 'SELECT') then
      missing := missing || format(' %s must have exactly one (SELECT, own rows) policy;', t);
    end if;
  end loop;

  foreach fn in array array[
    'public.founder_campaign_limits()',
    'public.founder_reserve_seat(uuid, uuid)',
    'public.founder_activate(uuid)',
    'public.founder_revoke(uuid, text)',
    'public.founder_release_expired()',
    'public.founder_release_order(uuid)',
    'public.founder_seat_summary()'] loop
    if to_regprocedure(fn) is null then
      missing := missing || format(' %s is missing;', fn);
      continue;
    end if;
    select proconfig, prosecdef, prosrc into cfg, definer, src from pg_proc where oid = to_regprocedure(fn);
    if not coalesce(definer, false) or cfg is null or not ('search_path=public, pg_temp' = any (cfg)) then
      missing := missing || format(' %s is not SECURITY DEFINER with search_path public, pg_temp;', fn);
    end if;
    if fn not in ('public.founder_campaign_limits()', 'public.founder_seat_summary()')
       and position('pg_advisory_xact_lock(hashtext(''founder_seats:founder-2026''))' in src) = 0 then
      missing := missing || format(' %s lost the seats lock;', fn);
    end if;
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    end if;
  end loop;

  foreach p in array array['ai_start_run', 'ai_fail_run', 'ai_start_run_with_credit'] loop
    if (select count(*) from pg_proc pp join pg_namespace n on n.oid = pp.pronamespace
         where n.nspname = 'public' and pp.proname = p) <> 1 then
      missing := missing || format(' public.%s must have exactly one overload (PGRST203);', p);
    end if;
  end loop;

  -- §8: the credit RPC (Task 6's contract) and the restoring ai_fail_run
  fn := 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)';
  if to_regprocedure(fn) is null then
    missing := missing || format(' %s is missing;', fn);
  else
    select proconfig, prosecdef, pg_get_userbyid(proowner) into cfg, definer, t
      from pg_proc where oid = to_regprocedure(fn);
    if not coalesce(definer, false) or cfg is null or not ('search_path=public, pg_temp' = any (cfg)) then
      missing := missing || format(' %s is not SECURITY DEFINER with search_path public, pg_temp;', fn);
    end if;
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    end if;
    -- it runs as its owner, who must be able to run ai_start_run (service
    -- role only), or every credit run fails 42501
    if to_regprocedure('public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb)') is null
       or not has_function_privilege(t, 'public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb)', 'EXECUTE') then
      missing := missing || format(' %s, the owner of ai_start_run_with_credit, cannot EXECUTE ai_start_run;', t);
    end if;
  end if;

  fn := 'public.ai_fail_run(uuid, text, text)';
  if to_regprocedure(fn) is null then
    missing := missing || format(' %s is missing;', fn);
  else
    select prosrc into src from pg_proc where oid = to_regprocedure(fn);
    if position('public.membership_credit_uses' in src) = 0 or position('restored_at is null' in src) = 0 then
      missing := missing || ' ai_fail_run lost the founder credit restore (re-run after 20261027_10?);';
    end if;
    if position('refund_restore' in src) = 0 or position('usage_refund' in src) = 0 then
      missing := missing || ' ai_fail_run lost its points refund;';
    end if;
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    end if;
  end if;

  if missing <> '' then
    raise exception '20261101_10 verify:%', missing;
  end if;
  raise notice '20261101_10 OK — kind membership; founder_campaign = %; founder_seats / membership_credits (owner reads own) / membership_credit_uses (server only); 7 founder functions definer, service role only, seat lock held; ai_start_run_with_credit service role only; ai_fail_run restores a credit once; one overload each of ai_start_run / ai_fail_run / ai_start_run_with_credit',
    v;
end $$;

commit;

notify pgrst, 'reload schema';

-- ── SELECT check (the SQL editor hides NOTICEs — run this and read the row) ──
-- Expected: seats = 0 on the first run; capacity = 1096 (or the admin's value).
select (select count(*) from public.founder_seats) as seats,
       (select value->>'capacity' from public.platform_settings where key='founder_campaign') as capacity;
