-- 20260629_payments_and_storage_policies.sql
--
-- Payments schema hardening (runs cleanly via `npx supabase db push` OR the
-- Dashboard SQL Editor — public.payments is owned by the standard role).
--
--   1) payments.id: set a default (gen_random_uuid) so inserts that omit id no
--      longer hit NOT NULL-with-no-default 500s. The route still supplies an
--      explicit id via crypto.randomUUID(); the default makes the column robust
--      for any future callers.
--   2) payments.payer_user_id: optional column for future direct use. The
--      current API route stores the payer in `metadata.payer_user_id` for now;
--      this column is added for parity so a later migration can backfill +
--      promote it without a schema change.
--
-- NOTE: the storage.objects RLS policies for the `documents` bucket used to live
--   here but were REMOVED because `storage.objects` is owned by
--   `supabase_storage_admin` and the migration role is not its owner — running
--   them here fails with ERROR 42501 (must be owner of table objects) and, in a
--   single transaction, rolls back the payments changes too.
--   Apply the storage policies separately via:
--     `supabase/storage_policies_documents.sql`  (Dashboard → Storage → Policies)
begin;

-- ─── payments.id default ───────────────────────────────────────────────────
alter table public.payments
  alter column id set default gen_random_uuid();

-- ─── payments.payer_user_id (optional, for future use) ─────────────────────
alter table public.payments
  add column if not exists payer_user_id uuid references auth.users(id) on delete set null;

commit;