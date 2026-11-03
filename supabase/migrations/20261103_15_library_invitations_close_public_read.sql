-- =============================================================================
-- Migration: 20261103_15_library_invitations_close_public_read.sql
-- Library invite codes (library.invitations) stop being readable with the
-- site's public key. Owner-free wave, S1 (Task 8). The user approved this
-- grant/RLS change on an existing table on 2026-11-03 ("go on the invitations
-- fix").
-- =============================================================================
--
-- WHY — a live leak
--   20260626_legal_library_schema.sql granted SELECT on every library table to
--   anon and authenticated and gave library.invitations the policy «Allow
--   public read on library.invitations» (for select to anon, authenticated
--   using (true)). So anyone holding the public anon key can list every invite
--   code through PostgREST (Accept-Profile: library) and redeem the codes that
--   still have seats. 20260922_01 §3 re-issued the same schema-wide SELECT.
--
-- WHO READS THE TABLE — only the service role (checked on main 1103812d and on
--   the owner-free branch): GET/POST /api/v1/admin/library-invitations and
--   POST /api/v1/library/invitations/redeem, both through createServiceClient()
--   with .schema("library"). No client component and no script reads it with
--   the anon key. (/api/v1/invite/[code] reads public.invitations, another
--   table.) So this file breaks no page.
--
-- WHAT THIS FILE DOES (idempotent; safe to run again; one transaction)
--   1. Every table privilege on library.invitations is revoked from anon,
--      authenticated and PUBLIC: SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--      REFERENCES, TRIGGER (REVOKE ALL), and any column-level grant too.
--   2. The policy «Allow public read on library.invitations» is dropped, and
--      then EVERY other policy on the table whose roles include anon,
--      authenticated or PUBLIC (a policy with no TO clause is PUBLIC). The
--      migrations create no other one; each policy dropped is named in a
--      NOTICE so a policy added by hand on production is visible.
--   3. RLS stays enabled (asserted and re-enabled).
--   4. service_role keeps ALL (it bypasses RLS; the routes read and write as it).
--
-- WHICH HALF LASTS — re-running 20260922_01_library_grants.sql (or 20260626)
--   puts the SELECT grant back (`grant select on all tables in schema library
--   to anon, authenticated`). With no policy that admits anon or
--   authenticated, RLS still returns them no row, so the dropped policy is the
--   part that keeps the codes closed. _verify.sql still RAISES on the grant
--   alone (verify:library_invitations_closed) so it is put right at once.
--
-- RUN ORDER — ANY time, before or after the deploy, independently of every
--   other file: no code depends on it, and no code breaks with it.
--
-- ROLLBACK (re-opens the leak; not recommended):
--   grant select on library.invitations to anon, authenticated;
--   create policy "Allow public read on library.invitations" on library.invitations
--     for select to anon, authenticated using (true);
--
-- Docker: supabase/tests/rls/library_invitations_close_public_read.test.sql.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. precondition ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('library.invitations') is null then
    raise exception '20261103_15: library.invitations is missing — run 20260626_legal_library_schema.sql first';
  end if;
end $$;

-- ── 1. no privilege for anon, authenticated or PUBLIC ───────────────────────
revoke all privileges on library.invitations from public, anon, authenticated;

do $$
declare c record;
begin
  -- column-level grants survive a table-level REVOKE: remove them by name
  for c in
    select a.attname
      from pg_attribute a
     where a.attrelid = 'library.invitations'::regclass and a.attnum > 0 and not a.attisdropped
       and a.attacl is not null
  loop
    execute format('revoke all privileges (%I) on library.invitations from public, anon, authenticated', c.attname);
  end loop;
end $$;

-- ── 2. no policy that admits anon, authenticated or PUBLIC ──────────────────
drop policy if exists "Allow public read on library.invitations" on library.invitations;

do $$
declare p record;
begin
  for p in
    select pol.policyname
      from pg_policies pol
     where pol.schemaname = 'library' and pol.tablename = 'invitations'
       and pol.roles && array['public', 'anon', 'authenticated']::name[]
  loop
    raise notice '20261103_15: dropping the policy % on library.invitations (it admits anon, authenticated or PUBLIC)', quote_ident(p.policyname);
    execute format('drop policy %I on library.invitations', p.policyname);
  end loop;
end $$;

-- ── 3. RLS on; 4. the routes' role keeps everything ─────────────────────────
alter table library.invitations enable row level security;
grant all on library.invitations to service_role;

-- ── 5. verify (raises → the transaction rolls back) ─────────────────────────
do $$
declare r text; p text;
begin
  if not (select c.relrowsecurity from pg_class c where c.oid = 'library.invitations'::regclass) then
    raise exception '20261103_15 verify: RLS is off on library.invitations';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, 'library.invitations', p) then
        raise exception '20261103_15 verify: % still holds % on library.invitations', r, p;
      end if;
    end loop;
    if has_any_column_privilege(r, 'library.invitations', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception '20261103_15 verify: % still holds a column privilege on library.invitations', r;
    end if;
  end loop;
  if exists (select 1 from pg_policies pol
              where pol.schemaname = 'library' and pol.tablename = 'invitations'
                and pol.roles && array['public', 'anon', 'authenticated']::name[]) then
    raise exception '20261103_15 verify: a policy on library.invitations still admits anon, authenticated or PUBLIC';
  end if;
  foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'library.invitations', p) then
      raise exception '20261103_15 verify: service_role lacks % on library.invitations (the invite routes would fail)', p;
    end if;
  end loop;
end $$;

commit;
notify pgrst, 'reload schema';

-- ── SELECT check (the editor shows this; ok must read true) ─────────────────
select
  has_table_privilege('anon', 'library.invitations', 'SELECT')                      as anon_select,
  has_table_privilege('authenticated', 'library.invitations', 'SELECT')             as authenticated_select,
  (select count(*) from pg_policies pol
    where pol.schemaname = 'library' and pol.tablename = 'invitations')             as policies_left,
  (select count(*) from pg_policies pol
    where pol.schemaname = 'library' and pol.tablename = 'invitations'
      and pol.roles && array['public', 'anon', 'authenticated']::name[])            as policies_admitting_session_roles,
  has_table_privilege('service_role', 'library.invitations', 'SELECT')              as service_role_select,
  (not has_table_privilege('anon', 'library.invitations', 'SELECT')
   and not has_table_privilege('authenticated', 'library.invitations', 'SELECT')
   and not has_any_column_privilege('anon', 'library.invitations', 'SELECT')
   and not has_any_column_privilege('authenticated', 'library.invitations', 'SELECT')
   and not exists (select 1 from pg_policies pol
                    where pol.schemaname = 'library' and pol.tablename = 'invitations'
                      and pol.roles && array['public', 'anon', 'authenticated']::name[])
   and (select c.relrowsecurity from pg_class c where c.oid = 'library.invitations'::regclass)
   and has_table_privilege('service_role', 'library.invitations', 'SELECT')
   and has_table_privilege('service_role', 'library.invitations', 'UPDATE'))      as ok;
