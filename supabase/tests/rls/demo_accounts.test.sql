-- demo_accounts.test.sql — proves 20261125_50 (owner S3 / R11): a demo account
-- (profiles.is_demo) writes only into its own sandbox, never pays, never holds
-- a founder seat, is capped (5 cases / 5 consultations / 10 clients), is never
-- marketplace-visible, and cannot clear its own flag. The guards are TRIGGERS:
-- every refusal below is also proved as service_role (BYPASSRLS) — RLS is not
-- what holds them.
--
-- CHAIN (run.sh, postgres:16) — the chain of founder_l2_2026_11_17.test.sql
-- without its test, then the guarded tables, then 20261125_50 TWICE
-- (idempotent). From the repo root, in Git Bash:
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
--     $T/prelude_demo_accounts_tables.sql \
--     $M/20261125_50_demo_accounts.sql \
--     $M/20261125_50_demo_accounts.sql \
--     $T/demo_accounts.test.sql
--
-- NEGATIVE CONTROL / RED (must FAIL) — the same chain without the two
-- 20261125_50 files → "T0 FAIL: profiles.is_demo is missing".
\set ON_ERROR_STOP on

-- expect(sql, token): the statement must raise exactly `token`
create function pg_temp.expect(p_sql text, p_token text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlerrm = p_token then
      return;
    end if;
    raise exception '% FAIL: expected %, got % (%)', p_label, p_token, sqlerrm, sqlstate;
  end;
  raise exception '% FAIL: expected %, the statement succeeded', p_label, p_token;
end $$;

-- T0 the migration is applied
do $$
declare d text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_demo') then
    raise exception 'T0 FAIL: profiles.is_demo is missing';
  end if;
  d := pg_catalog.pg_get_functiondef('public.founder_reserve_seat(uuid, uuid)'::regprocedure);
  if pg_catalog.strpos(d, 'demo_account') = 0 or pg_catalog.strpos(d, '15 minutes') = 0
     or pg_catalog.strpos(d, 'not_advocate') = 0 then
    raise exception 'T0 FAIL: founder_reserve_seat lost the demo check / hold / advocate rule';
  end if;
  if (select count(*) from pg_catalog.pg_trigger where tgname = 'trg_demo_guard' and not tgisinternal) <> 12 then
    raise exception 'T0 FAIL: % trg_demo_guard triggers, expected 12 (a second run duplicated or skipped one)',
      (select count(*) from pg_catalog.pg_trigger where tgname = 'trg_demo_guard' and not tgisinternal);
  end if;
  if has_function_privilege('authenticated', 'public.is_demo_user(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.founder_reserve_seat(uuid, uuid)', 'EXECUTE') then
    raise exception 'T0 FAIL: privileges';
  end if;
  raise notice 'T0 PASS: is_demo, 12 guard triggers (once), reserve keeps 15 min + advocate rule, service role only';
end $$;

-- ── actors: D1 demo lawyer (advocate), D2 demo client, R1 real lawyer,
--    R2 real client, R3 real lawyer flagged later ────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000d0001'), ('00000000-0000-0000-0000-0000000d0002'),
  ('00000000-0000-0000-0000-0000000d0003'), ('00000000-0000-0000-0000-0000000d0004'),
  ('00000000-0000-0000-0000-0000000d0005');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000d0001', 'lawyer', 'محامٍ تجريبي'),
  ('00000000-0000-0000-0000-0000000d0002', 'client', 'عميل تجريبي'),
  ('00000000-0000-0000-0000-0000000d0003', 'lawyer', 'محامٍ'),
  ('00000000-0000-0000-0000-0000000d0004', 'client', 'عميل'),
  ('00000000-0000-0000-0000-0000000d0005', 'lawyer', 'محامٍ ثانٍ');
insert into public.lawyer_profiles (user_id, verification_status, practice_kind, marketplace_visible) values
  ('00000000-0000-0000-0000-0000000d0001', 'verified', 'advocate', true),
  ('00000000-0000-0000-0000-0000000d0003', 'verified', 'advocate', true),
  ('00000000-0000-0000-0000-0000000d0005', 'verified', 'advocate', true);
-- D1's membership order exists BEFORE the flag, so founder_reserve_seat itself is tested
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status)
values
  ('00000000-0000-0000-0000-0000000d2001', '00000000-0000-0000-0000-0000000d0001', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated'),
  ('00000000-0000-0000-0000-0000000d2003', '00000000-0000-0000-0000-0000000d0003', 'membership',
   'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'initiated');
update public.platform_settings
   set value = value || jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'sale_paused', false)
 where key = 'founder_campaign';
-- the live "users update own profile" policy, so a session UPDATE reaches the row
create policy "test: users update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- T1 the service role flags; the account itself can neither set nor clear the flag
set role service_role;
update public.profiles set is_demo = true
 where id in ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002');
reset role;
do $$
begin
  if (select count(*) from public.profiles where is_demo) <> 2 then
    raise exception 'T1 FAIL: the service role could not flag the two demo accounts';
  end if;
  if (select marketplace_visible from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000d0001') then
    raise exception 'T1 FAIL: flagging D1 did not un-list it';
  end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000d0001', false);
set role authenticated;
select pg_temp.expect($q$update public.profiles set is_demo = false where id = '00000000-0000-0000-0000-0000000d0001'$q$,
                      'demo_account:flag_locked', 'T1 (demo clears own flag)');
update public.profiles set display_name = 'اسم جديد' where id = '00000000-0000-0000-0000-0000000d0001';
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-0000000d0004', false);
set role authenticated;
select pg_temp.expect($q$update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-0000000d0004'$q$,
                      'demo_account:flag_locked', 'T1 (real sets own flag)');
reset role;
do $$
begin
  if (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000d0001') <> 'اسم جديد' then
    raise exception 'T1 FAIL: the guard blocked an ordinary profile edit';
  end if;
  if (select is_demo from public.profiles where id = '00000000-0000-0000-0000-0000000d0001') is not true then
    raise exception 'T1 FAIL: D1 is no longer demo';
  end if;
  raise notice 'T1 PASS: service role flags (and un-lists); a session can neither clear nor set is_demo; other edits pass';
end $$;

-- T2 shared / public tables: refused for a demo owner, even as service_role
insert into public.community_posts (id, author_id, title)
  values ('00000000-0000-0000-0000-0000000d3001', '00000000-0000-0000-0000-0000000d0003', 'سؤال حقيقي');
insert into public.marketplace_listings (id, owner_id)
  values ('00000000-0000-0000-0000-0000000d3002', '00000000-0000-0000-0000-0000000d0003');
set role service_role;
select pg_temp.expect($q$insert into public.community_posts (author_id, title) values ('00000000-0000-0000-0000-0000000d0002', 'x')$q$,
                      'demo_account:readonly', 'T2 community_posts');
select pg_temp.expect($q$insert into public.community_answers (post_id, author_id) values ('00000000-0000-0000-0000-0000000d3001', '00000000-0000-0000-0000-0000000d0001')$q$,
                      'demo_account:readonly', 'T2 community_answers');
select pg_temp.expect($q$insert into public.community_votes (user_id, target_id) values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d3001')$q$,
                      'demo_account:readonly', 'T2 community_votes');
select pg_temp.expect($q$insert into public.community_reports (target_id, reporter_user_id) values ('00000000-0000-0000-0000-0000000d3001', '00000000-0000-0000-0000-0000000d0002')$q$,
                      'demo_account:readonly', 'T2 community_reports');
select pg_temp.expect($q$insert into public.reviews (reviewer_id, reviewee_id, rating) values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d0003', 5)$q$,
                      'demo_account:readonly', 'T2 reviews');
select pg_temp.expect($q$insert into public.library_issue_reports (user_id) values ('00000000-0000-0000-0000-0000000d0001')$q$,
                      'demo_account:readonly', 'T2 library_issue_reports');
select pg_temp.expect($q$insert into public.marketplace_listings (owner_id) values ('00000000-0000-0000-0000-0000000d0001')$q$,
                      'demo_account:readonly', 'T2 marketplace_listings');
select pg_temp.expect($q$insert into public.marketplace_offers (listing_id, offeror_id) values ('00000000-0000-0000-0000-0000000d3002', '00000000-0000-0000-0000-0000000d0001')$q$,
                      'demo_account:readonly', 'T2 marketplace_offers');
-- a real account is untouched
insert into public.community_answers (post_id, author_id) values ('00000000-0000-0000-0000-0000000d3001', '00000000-0000-0000-0000-0000000d0004');
insert into public.reviews (reviewer_id, reviewee_id, rating) values ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000d0003', 5);
reset role;
do $$
begin
  raise notice 'T2 PASS: 8 shared tables refuse a demo owner as service_role; a real account writes them';
end $$;

-- T3 money: no order, no seat, not counted
set role service_role;
select pg_temp.expect($q$insert into public.payment_orders (user_id, kind, item_id, billing, net_halalas, vat_halalas, total_halalas, vat_mode, status)
                         values ('00000000-0000-0000-0000-0000000d0001', 'membership', 'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'created')$q$,
                      'demo_account:no_payment', 'T3 payment_orders');
reset role;
do $$
declare
  r text;
  v_before int;
begin
  select count(*) into v_before from public.founder_seats where status in ('reserved', 'active');
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d2001');
  if r is distinct from 'demo_account' then
    raise exception 'T3 FAIL: a demo reserve returned %', r;
  end if;
  if exists (select 1 from public.founder_seats where user_id = '00000000-0000-0000-0000-0000000d0001') then
    raise exception 'T3 FAIL: a seat row exists for the demo account';
  end if;
  if (select count(*) from public.founder_seats where status in ('reserved', 'active')) <> v_before then
    raise exception 'T3 FAIL: the seat count moved';
  end if;
  r := public.founder_reserve_seat('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000d2003');
  if r is distinct from 'reserved' then
    raise exception 'T3 FAIL: a real advocate reserve returned %', r;
  end if;
  raise notice 'T3 PASS: demo order refused (no_payment); founder_reserve_seat → demo_account, no seat, count unchanged; a real advocate reserves';
end $$;

-- T4 sandbox rows: no link to a real account; no marketplace request
set role service_role;
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status)
                         values ('d-sr-1', '00000000-0000-0000-0000-0000000d0002', 'x', '00000000-0000-0000-0000-0000000d0003', 'assigned')$q$,
                      'demo_account:sandbox', 'T4 demo request assigned to a real lawyer');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('d-sr-2', '00000000-0000-0000-0000-0000000d0002', 'x', null, 'pending_assignment', 'lawyer')$q$,
                      'demo_account:readonly', 'T4 demo request into the marketplace');
-- a real client's open request: a demo lawyer may not claim it
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('r-sr-1', '00000000-0000-0000-0000-0000000d0004', 'x', null, 'pending_assignment', 'lawyer');
select pg_temp.expect($q$update public.service_requests set assigned_to = '00000000-0000-0000-0000-0000000d0001', status = 'assigned' where id = 'r-sr-1'$q$,
                      'demo_account:sandbox', 'T4 demo lawyer claims a real request');
-- consultations need a request row: rows of nobody (no demo side, no cap)
insert into public.service_requests (id, requester_user_id, title, status)
  select 'c-sr-' || g, null, 'x', 'assigned' from generate_series(1, 8) g;
select pg_temp.expect($q$insert into public.consultations (id, request_id, requester_user_id, lawyer_user_id)
                         values ('d-c-x', 'c-sr-8', '00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d0003')$q$,
                      'demo_account:sandbox', 'T4 demo client books a real lawyer');
select pg_temp.expect($q$insert into public.lawyer_clients (owner_user_id, client_user_id)
                         values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0004')$q$,
                      'demo_account:sandbox', 'T4 demo lawyer files a real client');
select pg_temp.expect($q$insert into public.lawyer_clients (owner_user_id, client_user_id)
                         values ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000d0002')$q$,
                      'demo_account:sandbox', 'T4 real lawyer files a demo client');
reset role;
do $$
begin
  if (select assigned_to from public.service_requests where id = 'r-sr-1') is not null then
    raise exception 'T4 FAIL: the real request was claimed';
  end if;
  raise notice 'T4 PASS: no demo↔real link on requests / consultations / clients (both directions); no demo marketplace request or claim';
end $$;

-- T5 R11 caps (as service_role): 5 cases, 5 consultations, 10 clients
set role service_role;
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  select 'd1-case-' || g, '00000000-0000-0000-0000-0000000d0001', 'قضية', '00000000-0000-0000-0000-0000000d0001', 'assigned', 'lawyer'
    from generate_series(1, 5) g;
-- an AI workspace run is not a case and is not capped
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('d1-ai-1', '00000000-0000-0000-0000-0000000d0001', 'تشغيل', '00000000-0000-0000-0000-0000000d0001', 'assigned', 'ai_workspace');
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('d1-case-6', '00000000-0000-0000-0000-0000000d0001', 'قضية', '00000000-0000-0000-0000-0000000d0001', 'assigned', 'lawyer')$q$,
                      'demo_account:limit:cases', 'T5 sixth case');
-- cancelling one does not free a slot (all rows count)
update public.service_requests set status = 'cancelled' where id = 'd1-case-1';
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('d1-case-7', '00000000-0000-0000-0000-0000000d0001', 'قضية', '00000000-0000-0000-0000-0000000d0001', 'assigned', 'lawyer')$q$,
                      'demo_account:limit:cases', 'T5 case after a cancel');
insert into public.consultations (id, request_id, requester_user_id, lawyer_user_id)
  select 'd1-c-' || g, 'c-sr-' || g, case when g % 2 = 0 then '00000000-0000-0000-0000-0000000d0002'::uuid end,
         '00000000-0000-0000-0000-0000000d0001'
    from generate_series(1, 5) g;
select pg_temp.expect($q$insert into public.consultations (id, request_id, requester_user_id, lawyer_user_id)
                         values ('d1-c-6', 'c-sr-6', null, '00000000-0000-0000-0000-0000000d0001')$q$,
                      'demo_account:limit:consultations', 'T5 sixth consultation');
insert into public.lawyer_clients (owner_user_id, client_user_id)
  select '00000000-0000-0000-0000-0000000d0001', null from generate_series(1, 10);
select pg_temp.expect($q$insert into public.lawyer_clients (owner_user_id) values ('00000000-0000-0000-0000-0000000d0001')$q$,
                      'demo_account:limit:clients', 'T5 eleventh client');
-- a real lawyer has no cap
insert into public.lawyer_clients (owner_user_id)
  select '00000000-0000-0000-0000-0000000d0003' from generate_series(1, 12);
reset role;
do $$
begin
  if (select count(*) from public.service_requests where requester_user_id = '00000000-0000-0000-0000-0000000d0001' and receiver <> 'ai_workspace') <> 5
     or (select count(*) from public.consultations where lawyer_user_id = '00000000-0000-0000-0000-0000000d0001') <> 5
     or (select count(*) from public.lawyer_clients where owner_user_id = '00000000-0000-0000-0000-0000000d0001') <> 10
     or (select count(*) from public.lawyer_clients where owner_user_id = '00000000-0000-0000-0000-0000000d0003') <> 12 then
    raise exception 'T5 FAIL: counts after the caps are wrong';
  end if;
  if (select l.cases from public.demo_account_limits() l) <> 5 then
    raise exception 'T5 FAIL: demo_account_limits()';
  end if;
  raise notice 'T5 PASS: caps 5 / 5 / 10 hold for a demo account (cancel does not reset; AI runs not counted); a real lawyer is uncapped';
end $$;

-- T6 never listed: a demo lawyer cannot list itself; flagging later un-lists
update public.lawyer_profiles set marketplace_visible = true where user_id = '00000000-0000-0000-0000-0000000d0001';
set role service_role;
update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-0000000d0005';
reset role;
do $$
begin
  if (select marketplace_visible from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000d0001') then
    raise exception 'T6 FAIL: a demo lawyer was listed';
  end if;
  if (select marketplace_visible from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000d0005') then
    raise exception 'T6 FAIL: flagging a listed lawyer did not un-list it';
  end if;
  if not (select marketplace_visible from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000d0003') then
    raise exception 'T6 FAIL: a real lawyer was un-listed';
  end if;
  raise notice 'T6 PASS: a demo lawyer is never listed; flagging un-lists at once; a real lawyer stays listed';
end $$;

-- T7 the same rules hold for a SIGNED-IN session (role authenticated, RLS on):
-- real users' ordinary writes still pass the new triggers; a demo client's
-- marketplace request is refused
select set_config('test.uid', '00000000-0000-0000-0000-0000000d0004', false);
set role authenticated;
insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
  values ('r-sr-session', '00000000-0000-0000-0000-0000000d0004', 'طلب عميل', null, 'pending_assignment', 'lawyer');
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-0000000d0003', false);
set role authenticated;
insert into public.lawyer_clients (owner_user_id, client_user_id)
  values ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000d0004');
insert into public.community_posts (author_id, title) values ('00000000-0000-0000-0000-0000000d0003', 'منشور');
reset role;
select set_config('test.uid', '00000000-0000-0000-0000-0000000d0002', false);
set role authenticated;
select pg_temp.expect($q$insert into public.service_requests (id, requester_user_id, title, assigned_to, status, receiver)
                         values ('d-sr-session', '00000000-0000-0000-0000-0000000d0002', 'x', null, 'pending_assignment', 'lawyer')$q$,
                      'demo_account:readonly', 'T7 demo client session request into the marketplace');
select pg_temp.expect($q$insert into public.community_posts (author_id, title) values ('00000000-0000-0000-0000-0000000d0002', 'x')$q$,
                      'demo_account:readonly', 'T7 demo client session community post');
reset role;
do $$
begin
  if not exists (select 1 from public.service_requests where id = 'r-sr-session')
     or not exists (select 1 from public.lawyer_clients
                     where owner_user_id = '00000000-0000-0000-0000-0000000d0003'
                       and client_user_id = '00000000-0000-0000-0000-0000000d0004')
     or exists (select 1 from public.service_requests where id = 'd-sr-session') then
    raise exception 'T7 FAIL: session writes';
  end if;
  raise notice 'T7 PASS: as authenticated — real intake request, real lawyer client + post go through; demo marketplace request + post refused';
end $$;
