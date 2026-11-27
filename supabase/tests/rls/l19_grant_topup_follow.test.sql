-- l19_grant_topup_follow.test.sql — proves 20261209_90 (l19 review, access S4):
-- revoking or moving the end of an admin library grant moves its top-up lot
-- (20261209_50) with it — a revoke never later than the new end, an
-- adjustment to the new end — and nothing else: a grant with no top-up and a
-- purchased lot are untouched. 20261209_90 runs TWICE (re-runnable) and the
-- l19_grant_topup_follow block of _verify.sql after it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l19_follow.sql
--   sed -n '/^-- >>> verify:l19_grant_topup_follow/,/^-- <<< verify:l19_grant_topup_follow/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql $M/20261022_10_payments_core.sql \
--     $R/prelude_points_lots_fixture.sql $M/20261022_20_points_lots.sql \
--     $M/20261027_10_ai_runs.sql $M/20261108_41_drafter_daily_limit_excludes_sections.sql \
--     $M/20261108_50_free_daily_question.sql $M/20261127_40_points_wallets.sql \
--     $M/20261203_10_points_soonest_first.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261209_50_l19_library_grant_points_topup.sql \
--     $M/20261209_90_l19_grant_topup_lot_follows.sql $M/20261209_90_l19_grant_topup_lot_follows.sql \
--     "$B" $R/l19_grant_topup_follow.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261209_90
-- files and the verify block → "F1 FAIL: an extension did not move the lot".
--
-- Every assertion RAISES.

\set ON_ERROR_STOP on

insert into auth.users select ('00000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 4) n;
insert into public.profiles (id, user_type, display_name)
  select ('00000000-0000-0000-0000-0000000e00' || lpad(n::text, 2, '0'))::uuid, 'lawyer', 'F' || n from generate_series(1, 4) n;

insert into public.library_access_grants (id, user_id, plan_ref, source, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000e0001', 'lib-admin', 'admin', now(), now() + interval '90 days'),
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000e0002', 'lib-admin', 'admin', now(), now() + interval '3660 days'),
  ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000e0003', 'lib-admin', 'admin', now(), now() + interval '30 days');
-- F4: a purchased lot and a grant with no top-up row
insert into public.points_lots (user_id, source, points_total, points_left, expires_at, wallet_scope) values
  ('00000000-0000-0000-0000-0000000e0003', 'purchase', 20, 20, now() + interval '90 days', 'general');

create or replace function pg_temp.lot_end(p_grant uuid) returns timestamptz language sql as $$
  select pl.expires_at from public.points_lots pl
    join public.library_grant_points_topups t on t.lot_id = pl.id where t.grant_id = p_grant $$;
create or replace function pg_temp.grant_end(p_grant uuid) returns timestamptz language sql as $$
  select ends_at from public.library_access_grants where id = p_grant $$;

do $$
declare r jsonb;
begin
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000f0001');
  if r->>'status' <> 'credited' then raise exception 'F0 FAIL: top-up 1: %', r; end if;
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000f0002');
  if r->>'status' <> 'credited' then raise exception 'F0 FAIL: top-up 2: %', r; end if;
  -- F3's grant: its balance (20) is below 50 → +30
  r := public.library_grant_points_topup('00000000-0000-0000-0000-0000000f0003');
  if r->>'status' <> 'credited' or (r->>'points')::int <> 30 then raise exception 'F0 FAIL: top-up 3: %', r; end if;
end $$;

-- F1 an extension moves the lot to the new end; F2 a shortening too
do $$
begin
  perform public.library_grant_adjust_end('00000000-0000-0000-0000-0000000f0001', null, now() + interval '120 days', 'تمديد اختبار');
  if pg_temp.lot_end('00000000-0000-0000-0000-0000000f0001') is distinct from pg_temp.grant_end('00000000-0000-0000-0000-0000000f0001') then
    raise exception 'F1 FAIL: an extension did not move the lot (lot %, grant %)',
      pg_temp.lot_end('00000000-0000-0000-0000-0000000f0001'), pg_temp.grant_end('00000000-0000-0000-0000-0000000f0001');
  end if;
  raise notice 'F1 PASS: an extension moves the lot';
  perform public.library_grant_adjust_end('00000000-0000-0000-0000-0000000f0001', null, now() + interval '10 days', 'تقصير اختبار');
  if pg_temp.lot_end('00000000-0000-0000-0000-0000000f0001') is distinct from now() + interval '10 days' then
    raise exception 'F2 FAIL: a shortening did not move the lot';
  end if;
  raise notice 'F2 PASS: a shortening moves the lot';
end $$;

-- F3 revoking the mistaken 3660-day grant: its 50 points stop being spendable
do $$
declare bal int;
begin
  perform public.library_grant_revoke('00000000-0000-0000-0000-0000000f0002', null, 'منح بالخطأ (اختبار)');
  if pg_temp.lot_end('00000000-0000-0000-0000-0000000f0002') > now() then
    raise exception 'F3 FAIL: the revoked grant''s lot still ends at %', pg_temp.lot_end('00000000-0000-0000-0000-0000000f0002');
  end if;
  select coalesce(sum(points_left), 0) into bal from public.points_lots
   where user_id = '00000000-0000-0000-0000-0000000e0002' and expires_at > now();
  if bal <> 0 then raise exception 'F3 FAIL: % points still spendable', bal; end if;
  raise notice 'F3 PASS: a revoke ends the lot now';
end $$;

-- F4 only the grant's own top-up lot moves: the purchased lot of the same user stays
do $$
begin
  perform public.library_grant_revoke('00000000-0000-0000-0000-0000000f0003', null, 'اختبار');
  if (select expires_at from public.points_lots where user_id = '00000000-0000-0000-0000-0000000e0003' and source = 'purchase')
     <= now() + interval '89 days' then
    raise exception 'F4 FAIL: a purchased lot moved';
  end if;
  if pg_temp.lot_end('00000000-0000-0000-0000-0000000f0003') > now() then
    raise exception 'F4 FAIL: the top-up lot did not move';
  end if;
  raise notice 'F4 PASS: only the top-up lot moves';
end $$;

-- F5 a session cannot call the trigger function
do $$
begin
  if has_function_privilege('authenticated', 'public.library_grant_topup_lot_follow()', 'EXECUTE') then
    raise exception 'F5 FAIL: authenticated may execute the trigger function';
  end if;
  raise notice 'F5 PASS: no session grant';
end $$;

select 'l19_grant_topup_follow: ALL PASS' as result;
