-- prelude_admin_mfa.sql — the GoTrue pieces 20261127_50 reads that stubs.sql
-- lacks: auth.mfa_factors (status as text; GoTrue's is an enum, the
-- migration casts ::text) and auth.jwt() read from a session setting, so a
-- test can be an aal1 or an aal2 session of the same user.
create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  factor_type text not null default 'totp',
  status text not null
);
create or replace function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- A table guarded only by is_admin(), as the admin policies are.
create table if not exists public.admin_only_notes (id int primary key, body text);
alter table public.admin_only_notes enable row level security;
create policy "admins read notes" on public.admin_only_notes for select to authenticated using (public.is_admin());
insert into public.admin_only_notes values (1, 'secret') on conflict do nothing;
grant select on public.admin_only_notes to authenticated;
