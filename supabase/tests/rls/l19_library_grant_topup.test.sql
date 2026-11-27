-- l19_library_grant_topup.test.sql — proves 20261209_50 (batch l19, LIVE-10):
-- an admin / request library grant tops the grantee up to
-- library_min_points_to_browse (50 by default) with ONE library_agent 'grant'
-- lot expiring with the grant and ONE ledger row, once per grant; the
-- balance read is the gate's own (every unexpired lot + founder library
-- credits × 5); a paid pass, an ended grant, an admin grantee and a gate set
-- to 0 get nothing; anon / authenticated cannot call it. The migration runs
-- TWICE (re-runnable) and the l19_grant_topup block of _verify.sql after it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l19_grant_topup.sql
--   sed -n '/^-- >>> verify:l19_grant_topup/,/^-- <<< verify:l19_grant_topup/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql \
--     $M/20261127_40_points_wallets.sql \
--     $M/20261209_50_l19_library_grant_points_topup.sql \
--     $M/20261209_50_l19_library_grant_points_topup.sql \
--     "$B" \
--     $R/l19_library_grant_topup.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261209_50
-- files and the verify block → "T0 FAIL: library_grant_points_topup does not exist".
--
-- Actors (…c0NN): A1 lawyer 0 points; A2 lawyer 30 points (+ an expired 500);
-- A3 lawyer 60 points; A4 lawyer paid pass; A5 lawyer ended grant; A6
-- platform admin; A7 lawyer, request grant; A8 founder with library credits;
-- A9 / A10 for the minimum setting. Every assertion RAISES.

do $$
begin
  if to_regprocedure('public.library_grant_points_topup(uuid)') is null then
    raise exception 'T0 FAIL: library_grant_points_topup does not exist (20261209_50 not applied)';
  end if;
end $$;

insert into auth.users
  select ('00000000-0000-0000-0000-0000000c00' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 10) n;
insert into public.profiles (id, user_type, display_name)
  select ('00000000-0000-0000-0000-0000000c00' || lpad(n::text, 2, '0'))::uuid,
         case when n = 6 then 'admin' else 'lawyer' end, 'A' || n
    from generate_series(1, 10) n;

-- the grants (ids …d0NN for user …c0NN)
insert into public.library_access_grants (id, user_id, plan_ref, source, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000c0001', 'lib-admin',  'admin',   now(), now() + interval '90 days'),
  ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000c0002', 'lib-admin',  'admin',   now(), now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000d0003', '00000000-0000-0000-0000-0000000c0003', 'lib-admin',  'admin',   now(), now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000d0005', '00000000-0000-0000-0000-0000000c0005', 'lib-admin',  'admin',   now() - interval '40 days', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000d0006', '00000000-0000-0000-0000-0000000c0006', 'lib-admin',  'admin',   now(), now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000d0007', '00000000-0000-0000-0000-0000000c0007', 'lib-q2',     'request', now(), now() + interval '180 days'),
  ('00000000-0000-0000-0000-0000000d0008', '00000000-0000-0000-0000-0000000c0008', 'lib-admin',  'admin',   now(), now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000d0009', '00000000-0000-0000-0000-0000000c0009', 'lib-admin',  'admin',   now(), now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000d0010', '00000000-0000-0000-0000-0000000c0010', 'lib-admin',  'admin',   now(), now() + interval '30 days');
insert into public.library_access_grants (id, user_id, plan_ref, source, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000c0004', 'lib-q1', 'purchase', now(), now() + interval '90 days');

insert into public.points_lots (user_id, source, points_total, points_left, expires_at, wallet_scope) values
  ('00000000-0000-0000-0000-0000000c0002', 'purchase', 30, 30, now() + interval '90 days', 'general'),
  ('00000000-0000-0000-0000-0000000c0002', 'purchase', 500, 500, now() - interval '1 day', 'general'),
  ('00000000-0000-0000-0000-0000000c0003', 'admin', 60, 60, now() + interval '90 days', 'general');

create or replace function pg_temp.lots_of(p uuid) returns int language sql as $$
  select count(*)::int from public.points_lots where user_id = p $$;
create or replace function pg_temp.ledger_of(p uuid) returns int language sql as $$
  select count(*)::int from public.points_ledger where user_id = p $$;
create or replace function pg_temp.balance_of(p uuid) returns int language sql as $$
  select coalesce(sum(points_left), 0)::int from public.points_lots where user_id = p and expires_at > now() $$;

-- T1 0 points, admin grant → +50: one library_agent 'grant' lot that ends with
--    the grant, one credit ledger row with the grant's ref, one marker row
do $$
declare r jsonb; l record;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0001');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 50 or (r->>'balance_before')::int <> 0 or (r->>'min_points')::int <> 50 then
    raise exception 'T1 FAIL: %', r;
  end if;
  select * into l from public.points_lots where user_id = '00000000-0000-0000-0000-0000000c0001';
  if pg_temp.lots_of('00000000-0000-0000-0000-0000000c0001') <> 1 or l.source <> 'grant' or l.wallet_scope <> 'library_agent'
     or l.points_left <> 50 or l.order_id is not null
     or l.expires_at <> (select ends_at from public.library_access_grants where id = '00000000-0000-0000-0000-0000000d0001') then
    raise exception 'T1 FAIL: wrong lot %', row_to_json(l);
  end if;
  if (select count(*) from public.points_ledger where user_id = '00000000-0000-0000-0000-0000000c0001'
        and reason = 'credit' and delta = 50 and ref = 'library_grant:00000000-0000-0000-0000-0000000d0001') <> 1
     or pg_temp.ledger_of('00000000-0000-0000-0000-0000000c0001') <> 1 then
    raise exception 'T1 FAIL: expected exactly one credit ledger row';
  end if;
  if (select points from public.library_grant_points_topups where grant_id = '00000000-0000-0000-0000-0000000d0001') <> 50 then
    raise exception 'T1 FAIL: marker row missing';
  end if;
  raise notice 'T1 PASS: 0 → 50, one library_agent grant lot, one ledger row, one marker';
end $$;

-- T2 the same grant again (a double click, a retry): nothing new
do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0001');
  if r->>'status' <> 'already' or (r->>'points')::int <> 50 then raise exception 'T2 FAIL: %', r; end if;
  if pg_temp.lots_of('00000000-0000-0000-0000-0000000c0001') <> 1 or pg_temp.ledger_of('00000000-0000-0000-0000-0000000c0001') <> 1 then
    raise exception 'T2 FAIL: a second lot or ledger row was written';
  end if;
  raise notice 'T2 PASS: once per grant';
end $$;

-- T3 30 points (and an EXPIRED 500 that must not count) → +20, balance 50
do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0002');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 20 or (r->>'balance_before')::int <> 30 then raise exception 'T3 FAIL: %', r; end if;
  if pg_temp.balance_of('00000000-0000-0000-0000-0000000c0002') <> 50 then raise exception 'T3 FAIL: balance not 50'; end if;
  raise notice 'T3 PASS: 30 → 50 (expired lots ignored)';
end $$;

-- T4 60 points → nothing credited, the decision kept (points 0)
do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0003');
  if r->>'status' <> 'not_needed' or (r->>'points')::int <> 0 then raise exception 'T4 FAIL: %', r; end if;
  if pg_temp.lots_of('00000000-0000-0000-0000-0000000c0003') <> 1
     or (select points from public.library_grant_points_topups where grant_id = '00000000-0000-0000-0000-0000000d0003') <> 0 then
    raise exception 'T4 FAIL: a lot was written or no marker kept';
  end if;
  raise notice 'T4 PASS: at the minimum already — nothing credited';
end $$;

-- T5 a paid pass (source purchase) — its points come with the order, never here
-- T6 an ended grant — T7 a platform admin grantee
do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0004');
  if r->>'status' <> 'not_admin_grant' or pg_temp.lots_of('00000000-0000-0000-0000-0000000c0004') <> 0 then raise exception 'T5 FAIL: %', r; end if;
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0005');
  if r->>'status' <> 'ended' or pg_temp.lots_of('00000000-0000-0000-0000-0000000c0005') <> 0 then raise exception 'T6 FAIL: %', r; end if;
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0006');
  if r->>'status' <> 'not_gated' or pg_temp.lots_of('00000000-0000-0000-0000-0000000c0006') <> 0 then raise exception 'T7 FAIL: %', r; end if;
  if exists (select 1 from public.library_grant_points_topups where grant_id in
       ('00000000-0000-0000-0000-0000000d0004', '00000000-0000-0000-0000-0000000d0005', '00000000-0000-0000-0000-0000000d0006')) then
    raise exception 'T5-7 FAIL: a marker was written for a grant that got nothing';
  end if;
  raise notice 'T5 PASS: paid pass untouched; T6 PASS: ended grant untouched; T7 PASS: admin untouched';
end $$;

-- T8 an approved REQUEST grant tops up the same way
do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0007');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 50 then raise exception 'T8 FAIL: %', r; end if;
  raise notice 'T8 PASS: request grant → 50';
end $$;

-- T9 founder library credits count at 5 points each (6 × 5 = 30 → +20)
create table if not exists public.membership_credits (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, kind text not null,
  remaining int not null, ends_at timestamptz not null);
insert into public.membership_credits (user_id, kind, remaining, ends_at) values
  ('00000000-0000-0000-0000-0000000c0008', 'library_question', 6, now() + interval '30 days'),
  ('00000000-0000-0000-0000-0000000c0008', 'library_question', 9, now() - interval '1 day'),
  ('00000000-0000-0000-0000-0000000c0008', 'drafting_work', 9, now() + interval '30 days');
do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0008');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 20 or (r->>'balance_before')::int <> 30 then raise exception 'T9 FAIL: %', r; end if;
  raise notice 'T9 PASS: founder library credits count (×5), ended / other kinds do not';
end $$;

-- T10 the minimum follows the admin setting: 0 = gate off (nothing, no
--     marker), 70 → +70, a malformed value → the default 50
do $$
declare r jsonb;
begin
  insert into public.platform_settings (key, value) values ('library_min_points_to_browse', '{"points": 0}'::jsonb)
    on conflict (key) do update set value = excluded.value;
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0009');
  if r->>'status' <> 'gate_off' or exists (select 1 from public.library_grant_points_topups where grant_id = '00000000-0000-0000-0000-0000000d0009') then
    raise exception 'T10a FAIL: %', r;
  end if;
  update public.platform_settings set value = '{"points": 70}'::jsonb where key = 'library_min_points_to_browse';
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0009');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 70 then raise exception 'T10b FAIL: %', r; end if;
  update public.platform_settings set value = '{"points": 12.5}'::jsonb where key = 'library_min_points_to_browse';
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0010');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 50 then raise exception 'T10c FAIL: %', r; end if;
  raise notice 'T10 PASS: 0 = off, 70 → 70, malformed → 50';
end $$;

-- T11 an unknown grant and a null id are refused
do $$
begin
  begin
    perform public.library_grant_points_topup('00000000-0000-0000-0000-0000000dffff');
    raise exception 'T11 FAIL: an unknown grant was accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.library_grant_points_topup(null);
    raise exception 'T11 FAIL: a null grant was accepted';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'T11 PASS: unknown / null grant refused';
end $$;

-- T12 anon / authenticated may not call it nor read the marker
do $$
begin
  if has_function_privilege('anon', 'public.library_grant_points_topup(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.library_grant_points_topup(uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.library_grant_points_topup(uuid)', 'EXECUTE') then
    raise exception 'T12 FAIL: wrong EXECUTE grants';
  end if;
  if has_table_privilege('authenticated', 'public.library_grant_points_topups', 'SELECT')
     or has_table_privilege('anon', 'public.library_grant_points_topups', 'SELECT') then
    raise exception 'T12 FAIL: the marker table is readable by a session';
  end if;
  raise notice 'T12 PASS: service role only';
end $$;

set role authenticated;
do $$
begin
  begin
    perform public.library_grant_points_topup('00000000-0000-0000-0000-0000000d0010');
    raise exception 'T13 FAIL: authenticated called the top-up';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T13 PASS: authenticated refused (42501)';
end $$;
reset role;

select 'l19_library_grant_topup: ALL PASS' as result;
