-- =============================================================================
-- Report: 20261208_51_duplicate_phones_report.sql   (batch l18-answers, owner ٢٣٥)
-- =============================================================================
-- READ ONLY. A single SELECT: nothing is written, locked or deleted, and it
-- is NOT a migration (no DDL, no verify block). Run it before cleaning up the
-- accounts that share one mobile number, so that 20261208_50 can create its
-- unique index on confirmed numbers.
--
-- One row per ACCOUNT whose number (folded to +9665XXXXXXXX: «+9665…»,
-- «9665…» and «05…» count as the same number) is held by more than one
-- account, confirmed or not. Columns:
--   number_last3   the number masked to its last 3 digits (the full number is
--                  never printed)
--   group_no       accounts with the same number share a group_no
--   accounts_in_group / confirmed_in_group
--   user_id, user_type, created_at, last_sign_in_at
--   confirmed      profiles.phone_verified_at is set (the WhatsApp code)
--   is_staff_or_admin  user_type = 'admin' or a platform_staff row
--                  (super_admin / operations / auditor) — owner red line:
--                  NEVER delete or change these accounts
--   is_test_account    test_accounts row or profiles.is_demo
--
-- The owner's rule (answer ٢٣٥ §3): test / duplicate accounts may be removed
-- BY HAND after review; admin / super_admin / staff accounts never. The
-- operator keeps the list of what was removed for the owner.
--
-- RUN: docker exec -i supabase-db psql -U supabase_admin -d postgres \
--        < supabase/migrations/20261208_51_duplicate_phones_report.sql
-- Needs 20261205_10 (phone_verified_at), 20261019_30 (platform_staff),
-- 20261017_44 (test_accounts).
-- =============================================================================

with folded as (
  select p.id,
         p.user_type,
         p.phone_verified_at,
         case
           when pg_catalog.btrim(p.phone) ~ '^\+9665[0-9]{8}$' then pg_catalog.btrim(p.phone)
           when pg_catalog.btrim(p.phone) ~ '^9665[0-9]{8}$'   then '+' || pg_catalog.btrim(p.phone)
           when pg_catalog.btrim(p.phone) ~ '^05[0-9]{8}$'     then '+966' || pg_catalog.substr(pg_catalog.btrim(p.phone), 2)
           else pg_catalog.btrim(p.phone)
         end as number,
         (pg_catalog.to_jsonb(p.*) ->> 'is_demo') = 'true' as is_demo
    from public.profiles p
   where coalesce(pg_catalog.btrim(p.phone), '') <> ''
),
shared as (
  select f.number,
         pg_catalog.count(*) as accounts_in_group,
         pg_catalog.count(*) filter (where f.phone_verified_at is not null) as confirmed_in_group
    from folded f
   group by f.number
  having pg_catalog.count(*) > 1
)
select '…' || pg_catalog.right(f.number, 3)                         as number_last3,
       pg_catalog.dense_rank() over (order by s.number)             as group_no,
       s.accounts_in_group,
       s.confirmed_in_group,
       f.id                                                         as user_id,
       f.user_type,
       u.created_at,
       u.last_sign_in_at,
       f.phone_verified_at is not null                              as confirmed,
       (f.user_type = 'admin'
        or exists (select 1 from public.platform_staff ps where ps.user_id = f.id)) as is_staff_or_admin,
       (f.is_demo
        or exists (select 1 from public.test_accounts t where t.user_id = f.id))    as is_test_account
  from folded f
  join shared s on s.number = f.number
  left join auth.users u on u.id = f.id
 order by group_no, confirmed desc, u.created_at;
