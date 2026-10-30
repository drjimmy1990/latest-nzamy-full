-- prelude_lawyer_clients_min.sql — the parts of 20260903_phase2 that
-- create_lawyer_invoice.test.sql reads: public.lawyer_clients (the columns
-- the function reads, with prod's CHECK on client_type) and
-- service_requests.lawyer_client_id (to prove the placeholder never gets one).
create table if not exists public.lawyer_clients (
  id            uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  client_type   text not null default 'individual' check (client_type in ('individual', 'company')),
  name          text not null check (length(btrim(name)) > 0)
);
alter table public.lawyer_clients enable row level security;
alter table public.service_requests
  add column if not exists lawyer_client_id uuid references public.lawyer_clients(id) on delete set null;
