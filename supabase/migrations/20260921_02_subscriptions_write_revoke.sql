-- =============================================================================
-- Migration: 20260921_02_subscriptions_write_revoke.sql
-- =============================================================================
-- PURPOSE
--   A signed-in user could POST a `subscriptions` row and PATCH their own row
--   to `tier = 'max'`. `20260906_fix_subscriptions_rls_security.sql` drops the
--   two write policies and is correct, but (a) it was never deployed
--   (evidence/uat-20260915/subscription-rls.json → "persistedTier":"max"), and
--   (b) it issues no REVOKE, so the table-level GRANT INSERT/UPDATE/DELETE to
--   `authenticated` survives and any future stray policy re-opens the hole.
--
--   This file idempotently repeats 20260906 and adds the missing grant layer,
--   for `public.subscriptions` and for the `public.credit_transactions` ledger,
--   which carries the same self-mint primitive
--   (20260603_phase1_003_subscriptions_billing.sql:208, "users create own
--   credit transactions").
--
-- CLOSES (UAT ids)
--   UAT-SUB-001
--
-- PREREQUISITES
--   * public.subscriptions        — 20260603_phase1_003_subscriptions_billing.sql:29
--   * public.credit_transactions  — 20260603_phase1_003_subscriptions_billing.sql (credits ledger)
--   * roles `anon` / `authenticated` — always present on a Supabase project.
--   Safe to apply whether or not 20260906_fix_subscriptions_rls_security.sql
--   already landed; every statement here is idempotent.
--
-- WHAT IT REPLACES / REMOVES
--   * "users create own subscriptions"       20260603_phase1_003_subscriptions_billing.sql:189-191  (dropped)
--   * "users update own subscriptions"       20260603_phase1_003_subscriptions_billing.sql:193-196  (dropped)
--   * "users create own credit transactions" 20260603_phase1_003_subscriptions_billing.sql:208-210  (dropped)
--   * "users read own subscriptions"         20260603_phase1_003_subscriptions_billing.sql:185-187
--        dropped and re-created with the identical expression, exactly as
--        20260906_fix_subscriptions_rls_security.sql does.
--   * "users read own credit transactions"   left untouched (read-own is correct).
--
-- WRITE-PATH AUDIT BEFORE SHIPPING THE REVOKE
--   `grep -rn 'from("subscriptions")' src/` → 19 hits, of which 7 are writes;
--   `grep -rn 'credit_transactions' src/`   → 2 writes. EVERY write uses the
--   service-role client, so no user-scoped route loses anything:
--     subscriptions
--       src/app/api/v1/admin/subscriptions/route.ts:266     .update()  adminClient  = createServiceClient()  (:191)
--       src/app/api/v1/admin/subscriptions/route.ts:282     .insert()  adminClient  = createServiceClient()  (:191)
--       src/app/api/v1/admin/subscriptions/[id]/route.ts:145 .update() adminClient  = createServiceClient()  (:70)
--       src/app/api/v1/admin/subscriptions/[id]/route.ts:247 .update() adminClient  = createServiceClient()  (:227)
--       src/app/api/v1/admin/users/[id]/route.ts:213        .update()  adminClient  = createServiceClient()  (:174)
--       src/lib/entitlements.ts:107                         .update()  admin        = createServiceClient()  (:55)
--       src/lib/entitlements.ts:117                         .insert()  admin        = createServiceClient()  (:55)
--     credit_transactions
--       src/lib/entitlements.ts:180                         .insert()  admin        = createServiceClient()  (:55)
--       src/app/api/v1/admin/credits/route.ts:108           .insert()  adminClient  = createServiceClient()  (:76)
--   All remaining hits are SELECTs (src/app/api/v1/profile/route.ts:255,
--   src/app/api/v1/dashboard/summary/route.ts:112, src/lib/access-control.ts:96
--   and :298, and the admin read dashboards), which the surviving read-own
--   policies still serve.
--
-- ROLLBACK
--   `grant insert, update, delete on public.subscriptions to authenticated;`
--   (and the same for credit_transactions) — which re-opens UAT-SUB-001 unless
--   the policies stay dropped.
-- =============================================================================

begin;

alter table public.subscriptions        enable row level security;
alter table public.credit_transactions  enable row level security;

-- ── 1. Policy layer — idempotent repeat of 20260906_fix_subscriptions_rls_security
drop policy if exists "users create own subscriptions" on public.subscriptions;
drop policy if exists "users update own subscriptions" on public.subscriptions;

drop policy if exists "users read own subscriptions" on public.subscriptions;
create policy "users read own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid());

drop policy if exists "users create own credit transactions" on public.credit_transactions;

-- ── 2. Grant layer — what 20260906 left open ────────────────────────────────
revoke insert, update, delete on public.subscriptions       from authenticated, anon;
revoke insert, update, delete on public.credit_transactions from authenticated, anon;

comment on table public.subscriptions is
  'Active user/entity subscriptions. Writes are restricted to trusted service-role backend, webhook, and admin flows: no INSERT/UPDATE policy and no DML grant for authenticated/anon. Users may read only their own subscription.';

comment on table public.credit_transactions is
  'Credit ledger. Append-only from trusted service-role flows (src/lib/entitlements.ts, /api/v1/admin/credits); users may read only their own rows.';

-- ── 3. Read-only verification — raises, so the transaction rolls back ───────
do $$
declare
  n_write_policies int;
  n_grants         int;
  n_read_policy    int;
begin
  select count(*) into n_write_policies
    from pg_policy
   where polrelid = 'public.subscriptions'::regclass
     and polcmd in ('a', 'w');            -- 'a' = INSERT, 'w' = UPDATE
  if n_write_policies <> 0 then
    raise exception '20260921_02 verify: % INSERT/UPDATE policy still on public.subscriptions', n_write_policies;
  end if;

  select count(*) into n_read_policy
    from pg_policy
   where polrelid = 'public.subscriptions'::regclass
     and polname  = 'users read own subscriptions'
     and polcmd   = 'r';
  if n_read_policy <> 1 then
    raise exception '20260921_02 verify: the read-own SELECT policy on public.subscriptions is missing';
  end if;

  select count(*) into n_write_policies
    from pg_policy
   where polrelid = 'public.credit_transactions'::regclass
     and polcmd in ('a', 'w');
  if n_write_policies <> 0 then
    raise exception '20260921_02 verify: % INSERT/UPDATE policy still on public.credit_transactions', n_write_policies;
  end if;

  select count(*) into n_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name   in ('subscriptions', 'credit_transactions')
     and grantee      in ('authenticated', 'anon')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if n_grants <> 0 then
    raise exception '20260921_02 verify: % write grant(s) for authenticated/anon survive on subscriptions/credit_transactions', n_grants;
  end if;

  raise notice '20260921_02 verify: OK — no write policy and no write grant for authenticated/anon';
end $$;

commit;

-- Read-only re-check after applying in staging:
--   select polname, polcmd from pg_policy
--    where polrelid in ('public.subscriptions'::regclass,
--                       'public.credit_transactions'::regclass) order by 1;
--   select table_name, grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('subscriptions','credit_transactions')
--      and grantee in ('authenticated','anon') order by 1, 2, 3;
