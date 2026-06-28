-- storage_policies_documents.sql
--
-- RLS policies for the `documents` storage bucket.
--
-- ⚠️  This file is NOT a tracked migration (it lives outside migrations/) on
--     purpose: `storage.objects` is owned by `supabase_storage_admin`, so
--     `npx supabase db push` and the Dashboard SQL Editor fail with
--     ERROR 42501 (must be owner of table objects) when they try to
--     CREATE POLICY on it.
--
-- HOW TO APPLY (pick whichever works on your project):
--
-- Option A — Dashboard UI (most reliable on hosted Supabase):
--   1. Supabase Dashboard → Storage
--   2. Create the bucket `documents` if it doesn't exist (Public = off)
--   3. Open the `documents` bucket → Policies → "New policy" → "For full customization"
--   4. Add the 4 policies below (one per SELECT/INSERT/UPDATE/DELETE) using the
--      `using` / `with check` expressions shown.
--
-- Option B — Dashboard SQL Editor as a superuser / `supabase_storage_admin`:
--   Run the SQL block below. If you still get 42501, use Option A.
--
-- Policy model: every object is stored under a folder named with the owner's
-- auth uid (e.g. `documents/<uid>/<filename>`), so `auth.uid()::text =
-- (storage.foldername(name))[1]` restricts each user to their own files.

-- Enable RLS on storage.objects (idempotent)
alter table storage.objects enable row level security;

-- SELECT — owners can read their own documents
drop policy if exists "documents select own" on storage.objects;
create policy "documents select own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- INSERT — owners can upload into their own folder
drop policy if exists "documents insert own" on storage.objects;
create policy "documents insert own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- UPDATE — owners can update their own documents
drop policy if exists "documents update own" on storage.objects;
create policy "documents update own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- DELETE — owners can delete their own documents
drop policy if exists "documents delete own" on storage.objects;
create policy "documents delete own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);