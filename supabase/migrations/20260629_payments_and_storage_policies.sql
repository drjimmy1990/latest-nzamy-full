-- 20260629_payments_and_storage_policies.sql
--
-- 1) payments.id: set a default (gen_random_uuid) so inserts that omit id no
--    longer hit NOT NULL-with-no-default 500s. The route still supplies an
--    explicit id via crypto.randomUUID(), but the default makes the column
--    robust for any future callers.
-- 2) payments.payer_user_id: add an optional column for future direct use.
--    The current API route stores the payer in `metadata.payer_user_id` for
--    now — this column is added for parity so a later migration can backfill
--    and promote it without a schema change.
-- 3) storage.objects RLS policies for the `documents` bucket. These were
--    commented out in 20260628_documents_upload.sql because the standard
--    migration role may not own storage.objects. They are restated here inside
--    a transaction with `drop policy if exists` guards so the migration is
--    idempotent and safe to re-run.
--
-- IMPORTANT:
--   * Apply via `npx supabase db push`.
--   * Storage policies (`alter table storage.objects ...` and the
--     `create policy ... on storage.objects` statements) may need to be
--     applied via the Supabase Dashboard (Storage -> Policies) if the
--     migration role lacks permissions on storage.objects. If you see
--     ERROR: 42501 (insufficient_privilege) on those statements, comment
--     them out here and apply them manually in the Dashboard.
begin;

-- ─── payments.id default ───────────────────────────────────────────────────
alter table public.payments
  alter column id set default gen_random_uuid();

-- ─── payments.payer_user_id (optional, for future use) ─────────────────────
alter table public.payments
  add column if not exists payer_user_id uuid references auth.users(id) on delete set null;

-- ─── storage.objects RLS for the `documents` bucket ────────────────────────
alter table storage.objects enable row level security;

drop policy if exists "documents select own" on storage.objects;
create policy "documents select own"
  on storage.objects for select
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents insert own" on storage.objects;
create policy "documents insert own"
  on storage.objects for insert
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents update own" on storage.objects;
create policy "documents update own"
  on storage.objects for update
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "documents delete own" on storage.objects;
create policy "documents delete own"
  on storage.objects for delete
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

commit;