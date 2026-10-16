-- Prelude for reassert_profiles_subscriptions_revokes.test.sql: the live shape
-- of 2026-10-10 after 20261016_02 — the self-host restore's GRANT ALL on
-- subscriptions and credit_transactions, anon still holding SELECT on
-- profiles, the three `to authenticated` profiles policies of 20260921_01, and
-- a guest-readable table whose admin policy reads public.profiles inline (the
-- shape of "admins read all lawyer profiles" on live).
drop policy if exists "own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "admins read all profiles" on public.profiles
  for select to authenticated using (public.is_admin());
create policy "users update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant all on public.profiles to anon, authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on public.profiles from anon;  -- 20261016_02

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  tier text not null default 'free',
  status text not null default 'active'
);
alter table public.subscriptions enable row level security;
create policy "users read own subscriptions" on public.subscriptions
  for select using (user_id = auth.uid());

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  amount int not null
);
alter table public.credit_transactions enable row level security;
create policy "users read own credit transactions" on public.credit_transactions
  for select using (user_id = auth.uid());

grant all on public.subscriptions, public.credit_transactions to anon, authenticated, service_role;

create table public.guest_readable (id int primary key, verified boolean not null);
alter table public.guest_readable enable row level security;
create policy "verified rows are public" on public.guest_readable for select using (verified);
create policy "admins read all" on public.guest_readable for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
grant select on public.guest_readable to anon, authenticated;

insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a1');
insert into public.profiles (id, user_type, display_name) values ('00000000-0000-0000-0000-0000000000a1', 'client', 'u1');
insert into public.subscriptions (user_id, tier) values ('00000000-0000-0000-0000-0000000000a1', 'pro');
insert into public.guest_readable values (1, true), (2, false);
