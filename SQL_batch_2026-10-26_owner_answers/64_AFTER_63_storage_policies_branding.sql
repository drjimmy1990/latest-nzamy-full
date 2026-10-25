-- storage_policies_branding.sql
--
-- Owner-only RLS policies for the private `branding` Storage bucket (D4,
-- owner decision ٢٥٦). Run AFTER supabase/migrations/20261026_63_branding_vault.sql.
--
-- ⚠️  NOT a tracked migration, for the reason supabase/storage_policies_documents.sql
--     gives: `storage.objects` is owned by `supabase_storage_admin`, so the SQL
--     editor's postgres role fails with 42501 (must be owner of table objects).
--     Run it as `supabase_admin` on the server:
--       docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < 64_AFTER_63_storage_policies_branding.sql
--     `_verify.sql` WARNS while these four policies are missing.
--
-- WHAT THE APP NEEDS FROM IT
--   Nothing, strictly: the upload / signed-URL routes (src/app/api/v1/branding/…)
--   authorize the caller through branding_vaults RLS first and then use the
--   service role, which bypasses these policies. They are defence in depth: a
--   session talking to the Storage API directly reaches ONLY its own vault's
--   folder — u/<own uid>/… for a lawyer, f/<firm id>/… for the firm's owner,
--   managing partner or office admin (public.can_manage_branding_object, 63).
--
-- Policy model, mirroring storage_policies_documents.sql:
--   1. print what is on storage.objects now (keep it with the deploy evidence);
--   2. drop any other policy that can match bucket `branding` — one whose
--      expression names `branding`, or names no bucket at all (an "allow
--      authenticated" rule); a policy scoped to another bucket is kept;
--   3. the bucket itself (private, 1 MB, png/jpeg/webp), upserted, in case the
--      editor's role could not write storage.buckets when 63 ran;
--   4. the four owner-only policies;
--   5. read back and assert.

alter table storage.objects enable row level security;

-- 1. READ FIRST
select pol.polname                                   as policy_name,
       pol.polcmd                                    as cmd,
       pol.polroles::regrole[]                       as roles,
       pg_get_expr(pol.polqual, pol.polrelid)        as using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid)   as with_check_expr
  from pg_policy pol
 where pol.polrelid = 'storage.objects'::regclass
 order by pol.polname;

do $$
begin
  if to_regprocedure('public.can_manage_branding_object(text)') is null then
    raise exception 'storage_policies_branding: public.can_manage_branding_object(text) is missing — run 20261026_63_branding_vault.sql first';
  end if;
end $$;

-- 2. Drop every other policy that can match bucket_id = 'branding'
do $$
declare
  r    record;
  expr text;
begin
  for r in
    select pol.polname,
           coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')      as q,
           coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') as w
      from pg_policy pol
     where pol.polrelid = 'storage.objects'::regclass
       and pol.polname not in ('branding select own', 'branding insert own',
                               'branding update own', 'branding delete own')
     order by pol.polname
  loop
    expr := r.q || ' ' || r.w;
    if position('branding' in expr) > 0 or position('bucket_id' in expr) = 0 then
      raise notice 'storage_policies_branding: dropping policy "%" on storage.objects (expression: %)',
        r.polname, nullif(btrim(expr), '');
      execute format('drop policy %I on storage.objects', r.polname);
    else
      raise notice 'storage_policies_branding: keeping policy "%" — scoped to another bucket', r.polname;
    end if;
  end loop;
end $$;

-- 3. The bucket
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage_policies_branding: storage.buckets not found — bucket not created here';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('branding', 'branding', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
end $$;

-- 4. The four owner-only policies
drop policy if exists "branding select own" on storage.objects;
create policy "branding select own"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'branding' and public.can_manage_branding_object(name));

drop policy if exists "branding insert own" on storage.objects;
create policy "branding insert own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding' and public.can_manage_branding_object(name));

drop policy if exists "branding update own" on storage.objects;
create policy "branding update own"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'branding' and public.can_manage_branding_object(name))
  with check (bucket_id = 'branding' and public.can_manage_branding_object(name));

drop policy if exists "branding delete own" on storage.objects;
create policy "branding delete own"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'branding' and public.can_manage_branding_object(name));

-- 5. Read back — the same assertion supabase/migrations/_verify.sql makes
select pol.polname                                 as policy_name,
       pol.polcmd                                  as cmd,
       pol.polroles::regrole[]                     as roles,
       pg_get_expr(pol.polqual, pol.polrelid)      as using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expr
  from pg_policy pol
 where pol.polrelid = 'storage.objects'::regclass
 order by pol.polname;

do $$
declare
  n_own   int;
  n_other int;
begin
  select count(*) into n_own
    from pg_policy
   where polrelid = 'storage.objects'::regclass
     and polname in ('branding select own', 'branding insert own', 'branding update own', 'branding delete own')
     and position('can_manage_branding_object' in (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                                                   coalesce(pg_get_expr(polwithcheck, polrelid), ''))) > 0;
  if n_own <> 4 then
    raise exception 'storage_policies_branding: expected the 4 owner-only branding policies, found %', n_own;
  end if;

  select count(*) into n_other
    from pg_policy
   where polrelid = 'storage.objects'::regclass
     and polname not in ('branding select own', 'branding insert own', 'branding update own', 'branding delete own')
     and (
           position('branding' in (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                                   coalesce(pg_get_expr(polwithcheck, polrelid), ''))) > 0
        or position('bucket_id' in (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                                    coalesce(pg_get_expr(polwithcheck, polrelid), ''))) = 0
         );
  if n_other <> 0 then
    raise exception 'storage_policies_branding: % other policy on storage.objects can still match bucket branding', n_other;
  end if;

  if to_regclass('storage.buckets') is not null
     and not exists (select 1 from storage.buckets
                      where id = 'branding' and public = false and file_size_limit = 1048576
                        and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
                        and cardinality(allowed_mime_types) = 3) then
    raise exception 'storage_policies_branding: bucket branding is not private / 1 MB / png-jpeg-webp';
  end if;

  raise notice 'storage_policies_branding: OK — 4 owner-only policies, nothing else can match bucket branding, bucket private 1 MB png/jpeg/webp';
end $$;
