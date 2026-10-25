-- Chain step (NOT a migration): a reduced storage.objects + storage.foldername,
-- the shape supabase/storage_policies_documents.sql and _verify.sql operate on.
-- Copied from the fixture of rehearse-staging-order.sh (minus its permissive
-- policy). storage.objects is owned by supabase_storage_admin on a real project
-- and no migration in this repo creates it.
create schema if not exists storage;

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text,
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);

-- Mirrors Supabase's storage.foldername/1: 'a/b/c.pdf' → {a,b}.
create or replace function storage.foldername(name text)
returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
