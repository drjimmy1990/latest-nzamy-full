-- founder_l2_2026_11_17.test.sql — proves 20261124_10 (owner decisions of
-- 17 Nov 2026): the founder seat hold is 15 minutes (٣), a failed order's seat
-- is released by founder_release_order, and the founder's 100 library points
-- are a 'library_question' credit (20 × 5 points) that pays for the tool
-- 'library-assistant' ONLY (١٥ / ١٨) — written by founder_activate, given to
-- an already-active seat by the migration's backfill, spent by
-- ai_start_run_with_credit and given back by ai_fail_run.
--
-- CHAIN (run.sh, postgres:16) — the chain of founder_rejoinder_410.test.sql,
-- then 20261122_10, then a prelude that activates one seat with the OLD
-- founder_activate, then 20261124_10 TWICE (idempotent). From the repo root,
-- in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql \
--     $T/prelude_founder_membership_between_runs.sql \
--     $M/20261101_10_founder_membership.sql \
--     $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261122_10_founder_campaign_nov18.sql \
--     $T/prelude_founder_l2_before.sql \
--     $M/20261124_10_founder_hold_15min_and_library_points.sql \
--     $M/20261124_10_founder_hold_15min_and_library_points.sql \
--     $T/founder_l2_2026_11_17.test.sql
--
-- NEGATIVE CONTROL / RED (must FAIL) — the same chain without the two
-- 20261124_10 files → "T0 FAIL: founder_reserve_seat does not hold 15 minutes".
\set ON_ERROR_STOP on

-- T0 the migration is applied: 15 minutes, the advocate rule kept, one overload each
do $$
declare d text := pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure);
begin
  if pg_catalog.strpos(d, '15 minutes') = 0 or pg_catalog.strpos(d, '2 hours') > 0 then
    raise exception 'T0 FAIL: founder_reserve_seat does not hold 15 minutes';
  end if;
  if pg_catalog.strpos(d, 'not_advocate') = 0 then
    raise exception 'T0 FAIL: the advocate rule of 20261122_10 is gone';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('founder_reserve_seat', 'founder_activate', 'ai_start_run_with_credit', 'ai_fail_run')) <> 4 then
    raise exception 'T0 FAIL: a second overload';
  end if;
  if has_function_privilege('authenticated', 'public.founder_activate(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.founder_activate(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)', 'EXECUTE') then
    raise exception 'T0 FAIL: privileges changed';
  end if;
  raise notice 'T0 PASS: hold 15 minutes, advocate rule kept, one overload each, service role only';
end $$;

-- T1 the backfill: the seat activated before the migration has library_question
-- 20 / 20 ending with its other credits; a second run added no second row
do $$
declare
  q record;
  w timestamptz;
begin
  select c.total, c.remaining, c.ends_at into q
    from public.membership_credits c
   where c.user_id = '00000000-0000-0000-0000-0000000b1001' and c.kind = 'library_question';
  select c.ends_at into w
    from public.membership_credits c
   where c.user_id = '00000000-0000-0000-0000-0000000b1001' and c.kind = 'drafting_work';
  if q.total is distinct from 20 or q.remaining is distinct from 20 or q.ends_at is distinct from w then
    raise exception 'T1 FAIL: backfilled row % (drafting_work ends %)', row_to_json(q), w;
  end if;
  if (select count(*) from public.membership_credits
       where user_id = '00000000-0000-0000-0000-0000000b1001') <> 3 then
    raise exception 'T1 FAIL: the seat has % credit rows', (select count(*) from public.membership_credits
                                                             where user_id = '00000000-0000-0000-0000-0000000b1001');
  end if;
  raise notice 'T1 PASS: an already-active seat got library_question 20 / 20 with its credits'' end, once';
end $$;

-- T2 the kind check accepts library_question and still refuses anything else
do $$
begin
  begin
    insert into public.membership_credits (seat_id, user_id, kind, total, remaining, ends_at)
    select c.seat_id, c.user_id, 'free_points', 1, 1, c.ends_at from public.membership_credits c limit 1;
    raise exception 'T2 FAIL: an unknown kind was accepted';
  exception when check_violation then
    null;
  end;
  raise notice 'T2 PASS: membership_credits_kind_check = drafting_work | independent_output | library_question';
end $$;

-- ── Setup: a verified advocate, two membership orders, the window around now ─
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000b1002');
insert into public.profiles (id, user_type, display_name)
  values ('00000000-0000-0000-0000-0000000b1002', 'lawyer', 'مؤسس جديد');
insert into public.lawyer_profiles (user_id, verification_status, practice_kind)
  values ('00000000-0000-0000-0000-0000000b1002', 'verified', 'advocate');
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status)
values
  ('00000000-0000-0000-0000-0000000b2002', '00000000-0000-0000-0000-0000000b1002', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated'),
  ('00000000-0000-0000-0000-0000000b2003', '00000000-0000-0000-0000-0000000b1002', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated');

update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'sale_paused', false)
 where key = 'founder_campaign';

-- T3 a reservation holds 15 minutes
do $$
declare
  r text;
  u timestamptz;
begin
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000b1002', '00000000-0000-0000-0000-0000000b2002');
  if r is distinct from 'reserved' then
    raise exception 'T3 FAIL: reserve returned %', r;
  end if;
  select s.reserved_until into u from public.founder_seats s where s.order_id = '00000000-0000-0000-0000-0000000b2002';
  if u is null or u < now() + interval '14 minutes' or u > now() + interval '16 minutes' then
    raise exception 'T3 FAIL: reserved_until is % (now %)', u, now();
  end if;
  raise notice 'T3 PASS: reserved_until = now() + 15 minutes';
end $$;

-- T4 a FAILED order's seat is released at once by founder_release_order (the
-- app calls it on a failed payment since 20261124_10); a retry reserves again
do $$
declare
  ok boolean;
  r  text;
begin
  update public.payment_orders set status = 'failed' where id = '00000000-0000-0000-0000-0000000b2002';
  ok := public.founder_release_order('00000000-0000-0000-0000-0000000b2002');
  if not ok or (select status from public.founder_seats where order_id = '00000000-0000-0000-0000-0000000b2002') <> 'released' then
    raise exception 'T4 FAIL: the failed order''s seat was not released';
  end if;
  if public.founder_release_order('00000000-0000-0000-0000-0000000b2002') then
    raise exception 'T4 FAIL: a second release answered true';
  end if;
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000b1002', '00000000-0000-0000-0000-0000000b2003');
  if r is distinct from 'reserved' then
    raise exception 'T4 FAIL: the retry returned %', r;
  end if;
  raise notice 'T4 PASS: failed order → seat released once; the retry reserves a seat again';
end $$;

-- T5 activation writes three credit rows with one end: 6, 1 and 20
do $$
declare
  r text;
  n int;
  e int;
begin
  update public.payment_orders set status = 'paid', paid_at = now() where id = '00000000-0000-0000-0000-0000000b2003';
  r := public.founder_activate('00000000-0000-0000-0000-0000000b2003');
  if r is distinct from 'activated' then
    raise exception 'T5 FAIL: founder_activate returned %', r;
  end if;
  select count(*), count(distinct c.ends_at) into n, e
    from public.membership_credits c where c.user_id = '00000000-0000-0000-0000-0000000b1002';
  if n <> 3 or e <> 1 then
    raise exception 'T5 FAIL: % rows with % distinct ends', n, e;
  end if;
  if not exists (select 1 from public.membership_credits c
                  where c.user_id = '00000000-0000-0000-0000-0000000b1002' and c.kind = 'library_question'
                    and c.total = 20 and c.remaining = 20)
     or not exists (select 1 from public.membership_credits c
                     where c.user_id = '00000000-0000-0000-0000-0000000b1002' and c.kind = 'drafting_work'
                       and c.total = 6 and c.remaining = 6)
     or not exists (select 1 from public.membership_credits c
                     where c.user_id = '00000000-0000-0000-0000-0000000b1002' and c.kind = 'independent_output'
                       and c.total = 1 and c.remaining = 1) then
    raise exception 'T5 FAIL: the credit rows are not 6 / 1 / 20';
  end if;
  if (select ends_at from public.membership_credits c
       where c.user_id = '00000000-0000-0000-0000-0000000b1002' and c.kind = 'library_question')
     is distinct from (select ends_at from public.founder_seats where order_id = '00000000-0000-0000-0000-0000000b2003') then
    raise exception 'T5 FAIL: library_question does not end with the seat';
  end if;
  raise notice 'T5 PASS: founder_activate → drafting_work 6, independent_output 1, library_question 20, one end (the seat''s)';
end $$;

-- every call names all 15 arguments, as runCore's admin.rpc(...) does
create function pg_temp.spend(p_user uuid, p_tool text, p_draft text, p_key text, p_kind text)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int, credit_used boolean)
language sql as $$
  select x.run_id, x.created, x.status, x.charged, x.charged_points, x.credit_used
    from public.ai_start_run_with_credit(
           p_user            => p_user,
           p_tool            => p_tool,
           p_variant         => null,
           p_class           => 'fast',
           p_price           => 5,
           p_daily_limit     => 100,
           p_idempotency_key => p_key,
           p_deadline        => now() + interval '2 minutes',
           p_exempt          => false,
           p_input           => case when p_draft is null then jsonb_build_object('message', 'ما حكم المادة؟')
                                     else jsonb_build_object('kind', p_draft) end,
           p_file_ids        => '{}',
           p_pages           => null,
           p_conversation    => null,
           p_source_ids      => null,
           p_credit_kind     => p_kind) x;
$$;
create function pg_temp.err_of(p_user uuid, p_tool text, p_draft text, p_key text, p_kind text)
returns text language plpgsql as $$
begin
  perform 1 from pg_temp.spend(p_user, p_tool, p_draft, p_key, p_kind);
  return 'no error';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.left_of(p_user uuid, p_kind text) returns int language sql as $$
  select c.remaining from public.membership_credits c
   where c.user_id = p_user and c.kind = p_kind order by c.created_at desc limit 1;
$$;

update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- T6 eligibility: library_question pays for library-assistant ONLY; no other
-- kind pays for library-assistant; the earlier pairings are unchanged
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-0000000b1002';
  t text;
begin
  foreach t in array array['legal-drafter', 'quick-answer', 'assistant', 'contracts-pro', 'wargaming'] loop
    if pg_temp.err_of(u, t, case when t = 'legal-drafter' then 'claim' end, 'l2-bad-' || t, 'library_question')
       is distinct from 'P0001 credit_not_eligible' then
      raise exception 'T6 FAIL: library_question on % was not credit_not_eligible', t;
    end if;
  end loop;
  if pg_temp.err_of(u, 'library-assistant', null, 'l2-bad-dw', 'drafting_work') is distinct from 'P0001 credit_not_eligible'
     or pg_temp.err_of(u, 'library-assistant', null, 'l2-bad-io', 'independent_output') is distinct from 'P0001 credit_not_eligible' then
    raise exception 'T6 FAIL: a drafting / output credit paid for library-assistant';
  end if;
  if pg_temp.left_of(u, 'library_question') <> 20 then
    raise exception 'T6 FAIL: a refused call moved the library credit';
  end if;
  -- the rejoinder (20261107_60) still spends a drafting work
  if pg_temp.err_of(u, 'legal-drafter', 'rejoinder', 'l2-rejoinder-1', 'drafting_work') is distinct from 'no error'
     or pg_temp.left_of(u, 'drafting_work') <> 5 then
    raise exception 'T6 FAIL: the rejoinder no longer spends a drafting work';
  end if;
  raise notice 'T6 PASS: library_question ↔ library-assistant only; drafting_work / independent_output refused there; rejoinder kept';
end $$;

-- T7 a library question spends one credit (20 → 19) at price 0, uncharged;
-- the same key again spends nothing; a failed run gives it back
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-0000000b1002';
  x record;
  y record;
begin
  select * into x from pg_temp.spend(u, 'library-assistant', null, 'l2-libq-0001', 'library_question');
  if not x.created or not x.credit_used or x.charged or x.charged_points <> 0 then
    raise exception 'T7 FAIL: spend returned %', row_to_json(x);
  end if;
  if pg_temp.left_of(u, 'library_question') <> 19 then
    raise exception 'T7 FAIL: remaining %', pg_temp.left_of(u, 'library_question');
  end if;
  if exists (select 1 from public.points_ledger where ref = 'ai_run:' || x.run_id::text) then
    raise exception 'T7 FAIL: a points ledger row was written';
  end if;
  select * into y from pg_temp.spend(u, 'library-assistant', null, 'l2-libq-0001', 'library_question');
  if y.created or y.credit_used or y.run_id <> x.run_id or pg_temp.left_of(u, 'library_question') <> 19 then
    raise exception 'T7 FAIL: the replay returned % (remaining %)', row_to_json(y), pg_temp.left_of(u, 'library_question');
  end if;
  if not public.ai_fail_run(x.run_id, 'model_error', 'test') then
    raise exception 'T7 FAIL: ai_fail_run answered false';
  end if;
  if pg_temp.left_of(u, 'library_question') <> 20 then
    raise exception 'T7 FAIL: the failed run did not give the credit back (remaining %)', pg_temp.left_of(u, 'library_question');
  end if;
  raise notice 'T7 PASS: library-assistant → 20 → 19, credit_used, uncharged; replay spends nothing; ai_fail_run → 20';
end $$;

-- T8 none left → no_credit (the app then charges 5 points); a revoked seat spends nothing
do $$
declare
  u constant uuid := '00000000-0000-0000-0000-0000000b1002';
begin
  update public.membership_credits set remaining = 0 where user_id = u and kind = 'library_question';
  if pg_temp.err_of(u, 'library-assistant', null, 'l2-libq-0002', 'library_question') is distinct from 'P0001 no_credit' then
    raise exception 'T8 FAIL: an empty library credit did not raise no_credit';
  end if;
  update public.membership_credits set remaining = 20 where user_id = u and kind = 'library_question';
  if public.founder_revoke('00000000-0000-0000-0000-0000000b2003', 'test') is distinct from 'revoked' then
    raise exception 'T8 FAIL: revoke failed';
  end if;
  if pg_temp.left_of(u, 'library_question') <> 0 then
    raise exception 'T8 FAIL: revoke left % library questions', pg_temp.left_of(u, 'library_question');
  end if;
  if pg_temp.err_of(u, 'library-assistant', null, 'l2-libq-0003', 'library_question') is distinct from 'P0001 no_credit' then
    raise exception 'T8 FAIL: a revoked seat spent a library question';
  end if;
  raise notice 'T8 PASS: 0 left → no_credit; founder_revoke zeroes library_question; a revoked seat spends nothing';
end $$;
