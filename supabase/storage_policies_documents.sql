-- storage_policies_documents.sql
--
-- RLS policies for the `documents` storage bucket. Closes UAT-STORAGE-001.
--
-- ⚠️  This file is NOT a tracked migration (it lives outside migrations/) on
--     purpose: `storage.objects` is owned by `supabase_storage_admin`, so
--     `npx supabase db push` and the Dashboard SQL Editor fail with
--     ERROR 42501 (must be owner of table objects) when they try to
--     CREATE POLICY on it. It must be applied by hand, as
--     `supabase_storage_admin` / `supabase_admin` (or through the Dashboard
--     UI). `supabase/migrations/_verify.sql`, run by hand after a deploy
--     (deploy.sh does NOT run it), raises if it was skipped.
--
-- ⚠️  WHICH COPY TO RUN — this file is the canonical one. Its batch copies:
--       SQL_batch_2026-10-25_owner_free/17_AFTER_16_storage_policies_documents.sql
--         — the version BEFORE the D6 SELECT guard. Superseded: do not re-run
--           it after 71 (it would put back a SELECT policy without the guard;
--           _verify.sql then raises).
--       SQL_batch_2026-10-26_owner_answers/71_AFTER_70_storage_policies_documents_select.sql
--         — byte-identical (`cmp`) to this file. Run it after 20261026_70.
--     Order on a database that has run neither: 16 (20261025_51) → 17 → 70
--     (20261026_70) → 71. Running only 71 at the end gives the same result:
--     every policy is dropped and re-created by this file.
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

-- INSERT — owners can upload into their own folder
drop policy if exists "documents insert own" on storage.objects;
create policy "documents insert own"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

-- SELECT — owners can read their own documents, EXCEPT an object whose row
-- now belongs to someone else (D6, owner ٢٩٨, 20261026_70): a firm document a
-- removed member uploaded stays in his folder while its attachments row moved
-- to the firm owner. public.storage_object_held_by_other (SECURITY DEFINER —
-- an inline subquery here would run under the member's own RLS, see nothing,
-- and let the bytes through) refuses it, and a contract version / document of
-- a contract he can no longer manage. Before 20261026_70 the policy is created
-- WITHOUT that guard and a NOTICE says so — re-apply this file after it
-- (_verify.sql raises while 20261026_70 is there and the guard is not).
--
-- UPDATE / DELETE — owners can overwrite, move or delete their own documents,
-- EXCEPT the file of a CASE document (owner directive ٥, N3.9): those bytes
-- stay, like the attachments row that points at them. The guard calls
-- public.storage_object_is_case_document (20261025_51). On a database where
-- that file has not run yet the two policies are created WITHOUT the guard and
-- a NOTICE says so — re-apply this file after 20261025_51 (_verify.sql warns
-- until then). The service role (cron purge of personal vault documents,
-- DELETE ?permanent=1) bypasses RLS and is unaffected.
do $$
declare
  own        text := 'bucket_id = ''documents'' and auth.uid()::text = (storage.foldername(name))[1]';
  guard      text := '';
  read_guard text := '';
begin
  if to_regprocedure('public.storage_object_held_by_other(text)') is not null then
    read_guard := ' and not public.storage_object_held_by_other(name)';
  else
    raise notice 'storage_policies_documents: 20261026_70 has not run — "documents select own" is created WITHOUT the held-by-other guard (a removed firm member can still read the firm files he uploaded); re-apply this file after it';
  end if;

  -- SELECT — owners can read their own documents (not one whose row is someone else's)
  execute 'drop policy if exists "documents select own" on storage.objects';
  execute format('create policy "documents select own" on storage.objects for select to authenticated '
                 'using (%s%s)', own, read_guard);

  if to_regprocedure('public.storage_object_is_case_document(text)') is not null then
    guard := ' and not public.storage_object_is_case_document(name)';
  else
    raise notice 'storage_policies_documents: 20261025_51 has not run — "documents update own" / "documents delete own" are created WITHOUT the case-document guard; re-apply this file after it';
  end if;

  -- UPDATE — owners can update their own documents (not a case document's file)
  execute 'drop policy if exists "documents update own" on storage.objects';
  execute format('create policy "documents update own" on storage.objects for update to authenticated '
                 'using (%s%s) with check (%s)', own, guard, own);

  -- DELETE — owners can delete their own documents (not a case document's file)
  execute 'drop policy if exists "documents delete own" on storage.objects';
  execute format('create policy "documents delete own" on storage.objects for delete to authenticated '
                 'using (%s%s)', own, guard);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Read back — the same assertion supabase/migrations/_verify.sql makes when
--    it is run (by hand; deploy.sh does not run it)
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

  if to_regprocedure('public.storage_object_held_by_other(text)') is not null and not exists (
       select 1 from pg_policy
        where polrelid = 'storage.objects'::regclass and polname = 'documents select own'
          and coalesce(pg_get_expr(polqual, polrelid), '') like '%storage_object_held_by_other%') then
    raise exception 'storage_policies_documents: "documents select own" lacks the 20261026_70 held-by-other guard';
  end if;

  raise notice 'storage_policies_documents: OK — 4 owner-only policies, nothing else can match bucket documents';
end $$;
