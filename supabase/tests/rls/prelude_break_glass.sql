-- Chain step (NOT a migration) for restricted_case_break_glass.test.sql.
--   * stubs.sql gives public.admin_audit_events a reduced shape; the live table
--     carries actor_type (20260603_phase1_005_advanced_features.sql:160, NOT
--     NULL default 'user'), which 20261206_12 writes.
--   * public.platform_staff, staff_role() and is_super_admin() copied from
--     20261019_30_platform_staff_roles.sql (section 2–3, same bodies and
--     grants) instead of loading that file, whose verify needs the live audit
--     policies of 20261016_09 and their own preludes.
alter table public.admin_audit_events
  add column if not exists actor_type text not null default 'user';

create table if not exists public.platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  staff_role text not null check (staff_role in ('super_admin', 'operations', 'auditor')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.platform_staff enable row level security;
revoke all on table public.platform_staff from public, anon, authenticated;
grant select on table public.platform_staff to authenticated;
grant all on table public.platform_staff to service_role;

create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ps.staff_role
    from public.platform_staff ps
    join public.profiles p on p.id = ps.user_id
   where ps.user_id = auth.uid()
     and p.user_type = 'admin'
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.staff_role() = 'super_admin', false)
$$;

revoke all on function public.staff_role() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.staff_role() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;
