-- prelude_contracts_min.sql — the public.contracts columns
-- 20261124_40_invoice_links.sql reads (20260905_phase3 adds them to the
-- 20260518 table that stubs.sql creates). Loads after
-- prelude_lawyer_clients_min.sql.
alter table public.contracts
  add column if not exists owner_user_id    uuid references auth.users(id) on delete set null,
  add column if not exists firm_id          uuid references public.firm_profiles(id) on delete set null,
  add column if not exists lawyer_client_id uuid references public.lawyer_clients(id) on delete set null,
  add column if not exists title            text not null default '';
