-- Chain step (NOT a migration) for group_membership_self_check.test.sql.
--
-- public.groups / public.group_members with the columns the policies and the
-- two membership functions read (20260603_phase1_004_community_features.sql
-- :132-171 — that migration needs tables the harness does not stub), BEFORE
-- 20260625_fix_rls_recursion.sql creates the two-argument function and the two
-- SELECT policies on them. stubs.sql's default privileges give anon and
-- authenticated ALL on both tables — the shape of a Supabase public schema.
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  status      text not null default 'active',
  created_at  timestamptz not null default now()
);
alter table public.groups enable row level security;

create table if not exists public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null default 'member',
  status     text not null default 'active' check (status in ('invited', 'active', 'removed')),
  joined_at  timestamptz not null default now(),
  unique (group_id, user_id)
);
alter table public.group_members enable row level security;

-- 20260603_phase1_004:513-516, verbatim — T7 proves an owner's UPDATE (which
-- needs the row to be visible through the SELECT policy) still works.
drop policy if exists "owners update their groups" on public.groups;
create policy "owners update their groups"
  on public.groups for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
