-- P0: subscription tiers are assigned only by trusted backend/admin flows.
-- End users may read their own subscription but cannot mint or upgrade it.

begin;

alter table public.subscriptions enable row level security;

drop policy if exists "users create own subscriptions" on public.subscriptions;
drop policy if exists "users update own subscriptions" on public.subscriptions;

drop policy if exists "users read own subscriptions" on public.subscriptions;
create policy "users read own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid());

comment on table public.subscriptions is
  'Active user/entity subscriptions. Writes are restricted to trusted service-role backend, webhook, and admin flows. Users may read only their own subscription.';

commit;

-- Verification after applying in staging:
-- select polname, polcmd from pg_policy
--  where polrelid = 'public.subscriptions'::regclass order by polname;
-- Expect no authenticated-user INSERT or UPDATE policy.
