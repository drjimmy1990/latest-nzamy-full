-- =============================================================================
-- Migration: 20261124_10_founder_hold_15min_and_library_points.sql
-- =============================================================================
-- PURPOSE (owner decisions of 17 Nov 2026: §13 item ٣, answers ١٥ and ١٨)
--   1. The founder seat is held 15 MINUTES, not 2 hours (٣). founder_reserve_seat
--      is re-created from 20261122_10 (advocate rule included) with every line
--      unchanged except the three `interval '2 hours'` → `interval '15 minutes'`
--      and its comment. A failed payment now frees the seat at once: the app
--      calls founder_release_order for a failed membership order
--      (src/lib/payments/fulfillCore.ts); that function is not changed here,
--      only its comment (it already releases any unpaid order's reservation).
--   2. The founder's 100 points for the library AI assistant ONLY (٨ / ١٥ / ١٨),
--      as a membership credit: 20 questions × 5 points.
--        - membership_credits_kind_check allows a third kind 'library_question';
--        - founder_activate (re-created from 20261101_10, the only definition)
--          writes a third credit row for the seat: library_question 20 / 20,
--          the same ends_at as the other two;
--        - ai_start_run_with_credit (re-created from 20261107_60, the latest,
--          IDENTICAL signature — NEVER a second overload, PGRST203 breaks every
--          AI run) accepts 'library_question' ONLY for the tool
--          'library-assistant'; every other pairing stays credit_not_eligible.
--          ai_fail_run (unchanged) gives the credit back on a failed run, as
--          for the other kinds;
--        - every seat ALREADY active gets its library_question row (20 / 20,
--          the end of its other credits, else the seat's end) — idempotent:
--          on conflict (seat_id, kind) do nothing.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261124_10_founder_hold_15min_and_library_points.sql
--   Expect: NOTICE  20261124_10 verify: OK  and a row with `t`.
--
-- RUN ORDER: ANY TIME — but BEFORE THE SALE OPENS (18 Nov 2026 00:00 Riyadh),
--   so the first reservations are 15 minutes and the first founders get their
--   library points. Neither side breaks the other:
--     - old code + this file: the old code never asks for 'library_question'
--       and its readers skip a credit kind they do not know
--       (founderMembershipView, founderAdmin); holds become 15 minutes;
--     - new code without this file: holds stay 2 hours; the library assistant
--       asks for 'library_question', the old function answers
--       credit_not_eligible and the app falls back to charging 5 points
--       (src/lib/ai/runCore.ts), so nothing fails — founders just pay points
--       until this file runs.
--   RE-RUN HAZARD: re-running 20261122_10 after this file puts the hold back to
--   2 hours (re-run this file after it). Re-running 20261101_10 or 20261107_60
--   drops the library_question rule of founder_activate / the credit function
--   (re-run this file after them). This file itself is safe to run any number
--   of times.
--
-- ROLLBACK (in one transaction):
--   1. re-run 20261122_10 (the 2-hour founder_reserve_seat) and 20261107_60
--      (ai_start_run_with_credit without library_question);
--   2. re-create founder_activate from 20261101_10 section 7c (two credit rows);
--   3. delete from public.membership_credits where kind = 'library_question';
--      then drop and re-add membership_credits_kind_check with the two kinds
--      ('drafting_work', 'independent_output').
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.founder_reserve_seat(uuid, uuid)') is null
     or to_regprocedure('public.founder_activate(uuid)') is null
     or to_regclass('public.membership_credits') is null then
    raise exception '20261124_10: run 20261101_10_founder_membership.sql first';
  end if;
  if to_regprocedure('public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)') is null then
    raise exception '20261124_10: ai_start_run_with_credit is missing (run 20261101_10 and 20261107_60 first)';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure), 'not_advocate') = 0 then
    raise exception '20261124_10: run 20261122_10_founder_campaign_nov18.sql first (the advocate rule)';
  end if;
end
$pre$;

-- ── 1. the seat hold: 15 minutes (owner ٣) ───────────────────────────────────
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
  'Reserves a founder seat for 15 minutes under the seats lock (20261101_10; advocate only since 20261122_10; 15 minutes since 20261124_10, owner ٣): reserved | already_member | full | closed | paused | not_verified | not_advocate. An unpaid reservation of the same user is moved to the new order (a retry). Service role only.';

revoke all on function public.founder_reserve_seat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.founder_reserve_seat(uuid, uuid) to service_role;

comment on function public.founder_release_order(uuid) is
  'Releases the reserved founder seat of an order at once, never one whose order is paid; true when a seat was released (20261101_10). Called for a voided / cancelled order, the checkout''s own failure paths and, since 20261124_10 (owner ٣), a FAILED payment. Service role only.';

-- ── 2. the library_question credit kind ──────────────────────────────────────
alter table public.membership_credits drop constraint if exists membership_credits_kind_check;
alter table public.membership_credits add constraint membership_credits_kind_check
  check (kind in ('drafting_work', 'independent_output', 'library_question'));

comment on table public.membership_credits is
  'The founder seat''s credits (20261101_10): drafting_work 6, independent_output 1 and (20261124_10, owner ٨ / ١٥ / ١٨) library_question 20 — the 100 founder points for the library AI assistant at 5 points a question — ending with the seat. The owner reads his own rows; only the server writes.';

-- ── 3. founder_activate: the third credit row ────────────────────────────────
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
         (v_target, v_order.user_id, 'independent_output', 1, 1, v_ends),
         -- 20261124_10 (owner ٨ / ١٥ / ١٨): 100 founder points for the library
         -- assistant only = 20 questions at 5 points, ending with the seat
         (v_target, v_order.user_id, 'library_question', 20, 20, v_ends);

  perform public.library_grant_access(v_order.user_id, 'lib-founder', 'purchase', 365, null,
                                      p_order, 'founder membership', null);

  update public.lawyer_profiles set founder_badge = true where user_id = v_order.user_id;

  perform public.merge_payment_order_metadata(p_order, '{"founder": "activated"}'::jsonb);
  return 'activated';
end $$;


comment on function public.founder_activate(uuid) is
  'Activates the founder membership of a PAID membership order under the seats lock (20261101_10): activated | already | not_paid | not_verified | full. Seat active 12 months, credits drafting_work 6 + independent_output 1 + library_question 20 (20261124_10: 100 points for the library assistant at 5 a question), lib-founder 365 days, badge. not_verified / full write metadata.founder. Does not check the window. Service role only.';

revoke all on function public.founder_activate(uuid) from public, anon, authenticated;
grant execute on function public.founder_activate(uuid) to service_role;

-- ── 4. ai_start_run_with_credit: library_question for library-assistant only ─
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
        and p_input ->> 'kind' in ('claim', 'reply', 'rejoinder', 'supplementary', 'closing', 'appeal', 'cassation', 'petition'))
    or (p_credit_kind = 'independent_output'
        and p_tool in ('contracts-pro', 'legal-opinion-consult', 'legal-opinion-letter', 'wargaming'))
    -- 20261124_10: the founder's library points pay for the library assistant only
    or (p_credit_kind = 'library_question'
        and p_tool = 'library-assistant'),
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
  'Starts an AI run paid with a founder credit instead of points (20261101_10, P3 Task 2; rejoinder added by 20261107_60, owner ٤١٠; library_question for library-assistant only added by 20261124_10, owner ١٥ / ١٨): ai_start_run''s arguments plus p_credit_kind; the run starts at price 0. P0001 credit_not_eligible (tool / drafter kind not covered by the kind) | P0001 no_credit (none left, expired or seat not active). points_enforcement off → a free run, nothing consumed. A duplicate key → the existing run, credit_used false. Service role only.';

revoke all on function public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text) to service_role;

-- ── 5. seats already active get their library points ─────────────────────────
insert into public.membership_credits (seat_id, user_id, kind, total, remaining, ends_at)
select s.id, s.user_id, 'library_question', 20, 20,
       coalesce((select max(c.ends_at) from public.membership_credits c where c.seat_id = s.id), s.ends_at)
  from public.founder_seats s
 where s.status = 'active'
   and coalesce((select max(c.ends_at) from public.membership_credits c where c.seat_id = s.id), s.ends_at) is not null
on conflict on constraint membership_credits_seat_kind_key do nothing;

-- ── 6. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v_reserve text := pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure);
  v_credit  text := pg_catalog.pg_get_functiondef(
    'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)'::regprocedure);
  v_missing int;
begin
  if pg_catalog.strpos(v_reserve, '15 minutes') = 0 or pg_catalog.strpos(v_reserve, '2 hours') > 0 then
    raise exception '20261124_10 verify: founder_reserve_seat does not hold 15 minutes';
  end if;
  if pg_catalog.strpos(v_reserve, 'not_advocate') = 0 then
    raise exception '20261124_10 verify: founder_reserve_seat lost the advocate rule';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_constraintdef(
       (select c.oid from pg_catalog.pg_constraint c
         where c.conrelid = 'public.membership_credits'::regclass and c.conname = 'membership_credits_kind_check')),
       'library_question') = 0 then
    raise exception '20261124_10 verify: membership_credits_kind_check does not allow library_question';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure), '''library_question'', 20, 20') = 0 then
    raise exception '20261124_10 verify: founder_activate writes no library_question row';
  end if;
  if pg_catalog.strpos(v_credit, '''library_question''') = 0 or pg_catalog.strpos(v_credit, '''rejoinder''') = 0 then
    raise exception '20261124_10 verify: ai_start_run_with_credit lacks library_question or rejoinder';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('founder_reserve_seat', 'founder_activate', 'ai_start_run_with_credit')) <> 3 then
    raise exception '20261124_10 verify: a second overload of founder_reserve_seat / founder_activate / ai_start_run_with_credit';
  end if;
  if has_function_privilege('anon', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_activate(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.founder_activate(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)', 'EXECUTE') then
    raise exception '20261124_10 verify: a founder function is callable by anon/authenticated';
  end if;
  select count(*) into v_missing
    from public.founder_seats s
   where s.status = 'active'
     and not exists (select 1 from public.membership_credits c where c.seat_id = s.id and c.kind = 'library_question');
  if v_missing > 0 then
    raise exception '20261124_10 verify: % active seat(s) without a library_question row', v_missing;
  end if;
  raise notice '20261124_10 verify: OK';
end
$verify$;

commit;

select '20261124_10 founder hold 15 minutes + library points (library_question 20)' as step,
       (pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure) like '%15 minutes%'
        and pg_catalog.pg_get_functiondef('public.founder_activate(uuid)'::regprocedure) like '%library_question%'
        and not exists (select 1 from public.founder_seats s
                         where s.status = 'active'
                           and not exists (select 1 from public.membership_credits c
                                            where c.seat_id = s.id and c.kind = 'library_question'))) as ok;
