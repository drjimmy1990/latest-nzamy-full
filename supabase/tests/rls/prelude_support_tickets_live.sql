-- prelude_support_tickets_live.sql — public.support_tickets as live has it:
-- the table and policies of 20260706_content_and_ops.sql (lines 70-91), with
-- tickets_admin_all as re-created by 20261016_09 (is_admin()). Only for the
-- support_ticket_replies_guard test; stubs.sql provides auth.uid(),
-- profiles, is_admin() and the session roles.
create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete set null,
  subject     text not null,
  body        text,
  category    text,
  priority    text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status      text not null default 'open' check (status in ('open','pending','resolved','closed')),
  assignee_id uuid references auth.users(id) on delete set null,
  metadata    jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
create policy "tickets_insert_own" on public.support_tickets
  for insert with check (user_id = auth.uid());
create policy "tickets_select_own" on public.support_tickets
  for select using (user_id = auth.uid());
create policy tickets_admin_all on public.support_tickets
  for all using (public.is_admin()) with check (public.is_admin());
grant all on public.support_tickets to app_user, anon, authenticated, service_role;
