-- ════════════════════════════════════════════════════════════════════════════
-- READ-ONLY inventory — who changes with batch l12-access (owner ٨٩ / ٩٣).
-- Changes nothing (one read-only transaction). Run before AND after the
-- l12 deploy and keep the output as the evidence the owner asked for
-- (file 05 #4 / #5). Addresses are printed masked.
--
--   docker exec -i supabase-db psql -U supabase_admin -d postgres < scripts/sql/2026-11-21_library_access_inventory.sql
--
-- 1. Accounts on a Pro-or-higher plan with NO library grant — they read the
--    full library today through their plan and lose it with l12 (owner ٨٩).
-- 2. Active trial / invitation / admin library grants — they open the library
--    today without points and are under the 50-point gate with l12 (owner ٩٣).
-- 3. Library invitation codes still usable, and pending colleague invitations
--    — both answer «أُوقفت» with l12.
-- ════════════════════════════════════════════════════════════════════════════

begin transaction read only;

-- 1
select '1. Pro+ plan, no library grant (loses the library with l12)' as section,
       m.email, p.user_type, s.tier, s.current_period_end
  from public.subscriptions s
  join (select u.id, coalesce(left(split_part(u.email, '@', 1), 1) || '***@' || split_part(u.email, '@', 2), '—') as email from auth.users u) m on m.id = s.user_id
  left join public.profiles p on p.id = s.user_id
 where s.status = 'active'
   and s.tier in ('pro', 'max', 'corp', 'enterprise')
   and (s.current_period_end is null or s.current_period_end > now())
   and not exists (select 1 from public.library_access_grants g
                    where g.user_id = s.user_id and g.starts_at <= now() and g.ends_at > now())
 order by s.tier, m.email;

-- 2
select '2. trial / invite / admin grants (now under the 50-point gate)' as section,
       m.email, p.user_type, g.plan_ref, g.source, g.starts_at, g.ends_at
  from public.library_access_grants g
  join (select u.id, coalesce(left(split_part(u.email, '@', 1), 1) || '***@' || split_part(u.email, '@', 2), '—') as email from auth.users u) m on m.id = g.user_id
  left join public.profiles p on p.id = g.user_id
 where g.plan_ref in ('lib-trial', 'lib-invite', 'lib-admin')
   and g.starts_at <= now() and g.ends_at > now()
 order by g.plan_ref, m.email;

-- 3a
select '3a. library invitation codes still usable (redeem answers 410 with l12)' as section,
       i.code, i.max_uses, i.current_uses, i.expires_at
  from library.invitations i
 where i.current_uses < i.max_uses
   and (i.expires_at is null or i.expires_at > now())
 order by i.created_at;

-- 3b
select '3b. pending colleague invitations (accept answers 410 with l12)' as section,
       count(*) as pending
  from public.invitations
 where status = 'pending' and (expires_at is null or expires_at > now());

rollback;
