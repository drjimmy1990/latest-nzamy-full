-- =============================================================================
-- 2026-11-20_l9_library_entitlement_check.sql — READ-ONLY (batch l9-reader)
-- -----------------------------------------------------------------------------
-- PURPOSE  Owner file 16 §2 (19 Nov): «القيود وبطاقة "اشترك" تظهر حتى للمالك
--          وهو يدخل كمشترك عادي». The sidebar card is fixed in code (it now
--          keys on the server's answer, not the account type). This SELECT
--          shows, for ONE account, every input of the server's answer
--          (src/lib/access-control.ts hasFullLibraryAccess): admin type, an
--          active Pro+ subscription, an active library grant
--          (starts_at <= now() < ends_at), and the founder seat — so a data
--          cause (a founder still pending, a grant outside its window, an
--          expired subscription) can be told apart from a code one.
--          It changes nothing: SELECTs only.
--
-- HOW TO RUN (the e-mail is passed on the command line, never stored here):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres \
--     -v email='the-account@example.com' < supabase/one-time/2026-11-20_l9_library_entitlement_check.sql
-- =============================================================================

\echo '── 1. the account and its type (admin = full library) ──'
select u.id as user_id, p.user_type, (p.user_type = 'admin') as is_admin
  from auth.users u
  left join public.profiles p on p.id = u.id
 where lower(u.email) = lower(:'email');

\echo '── 2. subscriptions (status active and period not ended; Pro+ tiers open the library) ──'
select s.tier, s.status, s.current_period_end,
       (s.status = 'active' and (s.current_period_end is null or s.current_period_end > now())) as running_now
  from public.subscriptions s
  join auth.users u on u.id = s.user_id
 where lower(u.email) = lower(:'email')
 order by s.current_period_end desc nulls first;

\echo '── 3. library grants (one row with active_now = t opens the library) ──'
select g.plan_ref, g.source, g.starts_at, g.ends_at,
       (g.starts_at <= now() and now() < g.ends_at) as active_now
  from public.library_access_grants g
  join auth.users u on u.id = g.user_id
 where lower(u.email) = lower(:'email')
 order by g.ends_at desc;

\echo '── 4. founder seat (an active seat should come with an active lib-founder grant above) ──'
select f.campaign_id, f.status, f.activated_at, f.ends_at
  from public.founder_seats f
  join auth.users u on u.id = f.user_id
 where lower(u.email) = lower(:'email')
 order by f.created_at desc;
