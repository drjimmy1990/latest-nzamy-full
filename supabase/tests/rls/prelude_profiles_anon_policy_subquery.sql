-- Prelude for profiles_anon_policy_subquery.test.sql: the live shape of
-- 2026-10-10 on top of stubs.sql's public.profiles — readable by anon at the
-- table level (the self-host restore's GRANT ALL), policies `to authenticated`,
-- and a guest-readable table whose admin policy reads public.profiles inline
-- with no TO clause (applies to PUBLIC, so also to anon). Same shape as
-- "admins read all lawyer profiles", articles_admin_read_all,
-- "Admins can modify platform settings" and a dozen more on live.
drop policy if exists "own profile" on public.profiles;
create policy "users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
grant all on public.profiles to anon, authenticated, service_role;

create table public.guest_readable (id int primary key, body text);
alter table public.guest_readable enable row level security;
create policy "anyone reads published" on public.guest_readable for select using (body is not null);
create policy "admins read all" on public.guest_readable for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
grant select on public.guest_readable to anon, authenticated;

insert into public.guest_readable values (1, 'public row');
