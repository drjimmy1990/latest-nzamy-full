-- Negative control NC2 for 20261016_09 (see admin_policies_is_admin.test.sql):
-- a guest-readable table whose admin policy reads public.profiles inline with no
-- TO clause — the shape of the sixteen, but NOT on the migration's list (as if
-- created after the 2026-10-10 dump). The migration's guard must refuse to
-- revoke anon's SELECT and roll back, naming this policy.
create table public.guest_notes (id int primary key, body text);
alter table public.guest_notes enable row level security;
create policy "anyone reads notes" on public.guest_notes for select using (true);
create policy stray_admin_read on public.guest_notes for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'));
insert into public.guest_notes values (1, 'ملاحظة عامة');
