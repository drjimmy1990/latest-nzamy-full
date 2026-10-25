-- Chain step (NOT a migration): a reduced storage.buckets, the columns
-- 20261026_63_branding_vault.sql and storage_policies_branding.sql upsert.
-- Load after prelude_storage_objects_stub.sql. On a real project the table is
-- owned by supabase_storage_admin and no migration in this repo creates it.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
