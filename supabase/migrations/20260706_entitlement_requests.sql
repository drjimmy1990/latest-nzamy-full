-- 20260706_entitlement_requests.sql
-- User-initiated entitlement requests (plan / credits / wallet / library / media)
-- with an admin approve/reject queue. The GRANT itself is applied by
-- src/lib/entitlements.ts (grantEntitlement) which writes to subscriptions /
-- credit_transactions / wallet_transactions via the service-role client.
-- This table only records the *ask* and the admin decision.

create table if not exists public.entitlement_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('plan','credits','wallet','library','media')),
  requested_ref text,                 -- plan name / "library" / "media" / free label
  amount        numeric,              -- for credits / wallet asks
  note          text,                 -- user's message
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by    uuid references auth.users(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists entitlement_requests_status_created_idx
  on public.entitlement_requests (status, created_at desc);
create index if not exists entitlement_requests_user_idx
  on public.entitlement_requests (user_id);

alter table public.entitlement_requests enable row level security;

-- Users create + read only their own requests. They cannot set status/decided_*
-- (no update policy for users) — only the admin PATCH (service-role) decides.
create policy "entitlement_requests_insert_own" on public.entitlement_requests
  for insert with check (user_id = auth.uid());
create policy "entitlement_requests_select_own" on public.entitlement_requests
  for select using (user_id = auth.uid());

-- Admins read + update every request.
create policy "entitlement_requests_admin_select" on public.entitlement_requests
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
  );
create policy "entitlement_requests_admin_update" on public.entitlement_requests
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
  );
