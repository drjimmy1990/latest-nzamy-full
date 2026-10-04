-- storage_policies_documents.sql
--
-- RLS policies for the `documents` storage bucket. Closes UAT-STORAGE-001.
--
-- ⚠️  This file is NOT a tracked migration (it lives outside migrations/) on
--     purpose: `storage.objects` is owned by `supabase_storage_admin`, so
--     `npx supabase db push` and the Dashboard SQL Editor fail with
--     ERROR 42501 (must be owner of table objects) when they try to
--     CREATE POLICY on it. It must be applied by hand, as
--     `supabase_storage_admin` (or through the Dashboard UI), and
--     `supabase/migrations/_verify.sql` raises if it was skipped — so a deploy
--     cannot quietly leave the bucket open.
--
-- WHAT UAT-20260915 FOUND
--     evidence/uat-20260915/document-storage-isolation.json — user B downloaded
--     AND deleted `documents/<A-uid>/…`, both HTTP 200. `20260628_documents_upload.sql:15-17`
--     creates the bucket with `public = false` and leaves its four policies
--     commented out (:28-49); `20260629_payments_and_storage_policies.sql:15-21`
--     records that they were removed. A private bucket with NO policy denies
--     everything, so what is live is a permissive policy created in the
--     Dashboard — most likely an "allow authenticated" rule. Section 1 below
--     prints it; section 2 removes it by name without needing to know the name.
--
-- HOW TO APPLY (pick whichever works on your project):
--
-- Option A — Dashboard UI (most reliable on hosted Supabase):
--   1. Supabase Dashboard → Storage
--   2. Create the bucket `documents` if it doesn't exist (Public = off)
--   3. Open the `documents` bucket → Policies. DELETE every policy that is not
--      one of the four below (section 1's output is the list), then
--      "New policy" → "For full customization" and add the 4 policies below
--      (one per SELECT/INSERT/UPDATE/DELETE) using the `using` / `with check`
--      expressions shown.
--
-- Option B — Dashboard SQL Editor as a superuser / `supabase_storage_admin`:
--   Run this whole file. If you still get 42501, use Option A.
--
-- Policy model: every object is stored under a folder named with the owner's
-- auth uid (e.g. `documents/<uid>/<filename>`) — see
-- src/lib/services/documentService.ts:384,
-- src/app/api/v1/documents/[id]/copy/route.ts:85,
-- src/lib/services/articleNotesService.ts:87,
-- src/lib/services/contractsService.ts:257 — so
-- `auth.uid()::text = (storage.foldername(name))[1]` restricts each user to
-- their own files. Legitimate cross-user reads do not go through these policies
-- at all: they are service-role signed URLs issued after a row-level check
-- (…/service-requests/[id]/deliverable/route.ts:98,
--  …/attachments/[attachmentId]/route.ts:94,
--  …/client/contracts/[id]/versions/[vid]/url/route.ts:60).

-- Enable RLS on storage.objects (idempotent)
alter table storage.objects enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. READ FIRST — what is on storage.objects right now
-- ─────────────────────────────────────────────────────────────────────────────
-- Keep this output with the deploy evidence: it is the only record of what the
-- next section removes.
select pol.polname                                   as policy_name,
       pol.polcmd                                    as cmd,
       pol.polroles::regrole[]                       as roles,
       pg_get_expr(pol.polqual, pol.polrelid)        as using_expr,
       pg_get_expr(pol.polwithcheck, pol.polrelid)   as with_check_expr
  from pg_policy pol
 where pol.polrelid = 'storage.objects'::regclass
 order by pol.polname;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Drop every policy that can match bucket_id = 'documents'
-- ─────────────────────────────────────────────────────────────────────────────
-- The drop list is BUILT, never guessed. A policy is removed when it is not one
-- of the four owner-only policies below AND either
--   (a) its expression mentions `documents` — it targets this bucket, or
--   (b) its expression mentions no bucket at all — it targets every bucket,
--       including this one (that is the shape a Dashboard "allow authenticated"
--       rule has).
-- A policy scoped to some OTHER bucket is left alone: this file must not break
-- avatars, public assets or anything another feature relies on.
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
       and pol.polname not in (
             'documents select own',
             'documents insert own',
             'documents update own',
             'documents delete own'
           )
     order by pol.polname
  loop
    expr := r.q || ' ' || r.w;
    if position('documents' in expr) > 0 or position('bucket_id' in expr) = 0 then
      raise notice 'storage_policies_documents: dropping policy "%" on storage.objects (expression: %)',
        r.polname, nullif(btrim(expr), '');
      execute format('drop policy %I on storage.objects', r.polname);
    else
      raise notice 'storage_policies_documents: keeping policy "%" — scoped to another bucket', r.polname;
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. The four owner-only policies
-- ─────────────────────────────────────────────────────────────────────────────

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Read back — this is the same assertion supabase/migrations/_verify.sql
--    makes on every deploy
-- ─────────────────────────────────────────────────────────────────────────────
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
     and polname in ('documents select own','documents insert own',
                     'documents update own','documents delete own');
  if n_own <> 4 then
    raise exception 'storage_policies_documents: expected the 4 owner-only documents policies, found %', n_own;
  end if;

  select count(*) into n_other
    from pg_policy
   where polrelid = 'storage.objects'::regclass
     and polname not in ('documents select own','documents insert own',
                         'documents update own','documents delete own')
     and (
           position('documents' in (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                                    coalesce(pg_get_expr(polwithcheck, polrelid), ''))) > 0
        or position('bucket_id' in (coalesce(pg_get_expr(polqual, polrelid), '') || ' ' ||
                                    coalesce(pg_get_expr(polwithcheck, polrelid), ''))) = 0
         );
  if n_other <> 0 then
    raise exception 'storage_policies_documents: % other policy on storage.objects can still match bucket documents', n_other;
  end if;

  raise notice 'storage_policies_documents: OK — 4 owner-only policies, nothing else can match bucket documents';
end $$;
