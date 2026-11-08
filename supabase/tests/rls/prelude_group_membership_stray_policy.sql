-- NEGATIVE CONTROL 3 for group_membership_self_check.test.sql (NOT part of
-- the passing chain): a hand-made policy elsewhere that also calls the
-- two-argument function. 20261109_12 must REFUSE to run (step 0), because its
-- revoke would break this policy.
create table if not exists public.group_notes_stray (id uuid primary key, group_id uuid);
alter table public.group_notes_stray enable row level security;
drop policy if exists "stray reads via the two-argument check" on public.group_notes_stray;
create policy "stray reads via the two-argument check" on public.group_notes_stray
  for select using (public.is_group_member_or_owner(group_id, auth.uid()));
