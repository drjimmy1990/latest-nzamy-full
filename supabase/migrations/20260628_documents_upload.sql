-- Allow standalone documents (not tied to a specific request) so the client
-- "مستنداتي" page can accept general uploads. Previously request_id was NOT NULL
-- with a service_requests FK, which blocked the generic upload UI.
--
-- All statements run inside a single transaction so the migration is atomic and
-- safe to re-run (every create is preceded by a `drop policy if exists`, and the
-- bucket insert uses `on conflict do nothing`).
begin;

alter table public.attachments
  alter column request_id drop not null;

-- Storage bucket for user-uploaded documents. 100 MB per-object limit, private
-- (signed URLs used for download/preview so RLS controls access).
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 104857600)
on conflict (id) do nothing;

-- Enable RLS on storage.objects. This is idempotent (a no-op if already enabled)
-- and safe for other buckets: RLS only takes effect when policies exist, and every
-- policy below is scoped to `bucket_id = 'documents'`, so objects in any other
-- bucket remain unaffected (no policy = no access, the existing default).
alter table storage.objects enable row level security;

-- RLS on storage.objects: a user can CRUD only objects under their own folder
-- (documents/<user_id>/...). Server-side service client bypasses RLS for admin.
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
