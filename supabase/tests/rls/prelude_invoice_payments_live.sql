-- prelude_invoice_payments_live.sql — public.payments as prod has it, for
-- invoice_collections.test.sql (stubs.sql has no payments table).
-- 20260518_client_workflow_backend_ready.sql:30-39 (table) and :181-189
-- (its one policy, SELECT for the requester or the assigned lawyer), plus
-- 20260629_payments_and_storage_policies.sql (id default, payer_user_id).
create table if not exists public.payments (
  id text primary key default gen_random_uuid(),
  request_id text not null references public.service_requests(id) on delete cascade,
  provider text not null default 'stub',
  amount numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  status text not null check (status in ('not_required', 'requires_payment', 'paid', 'failed', 'refunded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  payer_user_id uuid references auth.users(id) on delete set null
);
alter table public.payments enable row level security;
drop policy if exists "participants read payments" on public.payments;
create policy "participants read payments"
  on public.payments for select
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = payments.request_id
      and (sr.requester_user_id = auth.uid() or sr.assigned_to = auth.uid())
    )
  );
grant all on public.payments to app_user, anon, authenticated, service_role;
