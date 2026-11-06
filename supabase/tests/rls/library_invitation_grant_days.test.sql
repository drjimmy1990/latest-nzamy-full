-- library_invitation_grant_days.test.sql — proves 20261103_11 (owner q378,
-- owner-free wave S1 Task 16): library.invitations.grant_days, null or
-- 1..3660, and NOTHING else — the table's privileges and RLS policies are the
-- same before and after the file (the before-prelude snapshots them). Also
-- runs the _verify block verify:library_invitation_grant_days.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain of library_column_lock.test.sql, the before-prelude, then
-- 20261103_11 TWICE. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   V=$D/verify_library_invitation_grant_days.sql
--   sed -n '/^-- >>> verify:library_invitation_grant_days/,/^-- <<< verify:library_invitation_grant_days/p' $M/_verify.sql > "$V"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql \
--     $R/prelude_library_invitation_grant_days_before.sql \
--     $M/20261103_11_library_invitation_grant_days.sql $M/20261103_11_library_invitation_grant_days.sql \
--     "$V" $R/library_invitation_grant_days.test.sql
--
-- NEGATIVE CONTROLS:
--   1. without 20261103_11 the test stops at T0 (the column is missing);
--   2. without 20261103_11 the _verify block RAISES «run 20261103_11 … (BEFORE the deploy)»
--   (the same chain with the two 20261103_11 files left out, with and without "$V").
--
-- NOT ASSERTED, ON PURPOSE: "anon and authenticated have no privilege on
-- grant_days" (S1 Task 16's text). 20260626 grants SELECT on every library
-- table to anon and authenticated and adds the policy «Allow public read on
-- library.invitations» (using true), so both roles can read every column of
-- this table, codes included. Closing that is a grant/RLS change on an
-- existing table — a STOP-POINT for the user (task-8 report). T3 proves this
-- file does not widen it: no column-level grant, the same table ACL, the same
-- policies.
--
-- Every assertion RAISES on failure.

-- T0 precondition (negative control 1 stops here)
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'library' and table_name = 'invitations' and column_name = 'grant_days') then
    raise exception 'T0 FAIL: library.invitations.grant_days does not exist (20261103_11 not applied)';
  end if;
end $$;

-- T1 the bound: 0 and 3661 refused; 1, 90, 3660 and null accepted
do $$
begin
  begin
    insert into library.invitations (code, max_uses, grant_days) values ('ZERO0001', 1, 0);
    raise exception 'T1a FAIL: grant_days 0 accepted';
  exception when sqlstate '23514' then null;
  end;
  begin
    insert into library.invitations (code, max_uses, grant_days) values ('BIG00001', 1, 3661);
    raise exception 'T1b FAIL: grant_days 3661 accepted';
  exception when sqlstate '23514' then null;
  end;
  insert into library.invitations (code, max_uses, grant_days) values ('NINETY01', 5, 90);
  insert into library.invitations (code, max_uses, grant_days) values ('ONEDAY01', 1, 1);
  insert into library.invitations (code, max_uses, grant_days) values ('MAXDAY01', 1, 3660);
  insert into library.invitations (code, max_uses) values ('NULLDAY1', 1);
  if (select grant_days from library.invitations where code = 'NINETY01') is distinct from 90 then
    raise exception 'T1c FAIL: 90 not stored';
  end if;
  if (select grant_days from library.invitations where code = 'NULLDAY1') is not null then
    raise exception 'T1d FAIL: a code without a length is not null';
  end if;
end $$;

-- T2 a code made before the file keeps working and has no own length (= 30 days in the app)
do $$
begin
  if not exists (select 1 from library.invitations where code = 'BEFORE11' and grant_days is null and max_uses = 3) then
    raise exception 'T2 FAIL: the code made before 20261103_11 changed';
  end if;
end $$;

-- T3 no grant and no RLS change: no column-level ACL on grant_days, the same
-- table ACL, RLS state and policies as before the file
do $$
declare b public._inv_before;
begin
  select * into b from public._inv_before;
  if (select a.attacl from pg_attribute a
       where a.attrelid = 'library.invitations'::regclass and a.attname = 'grant_days') is not null then
    raise exception 'T3a FAIL: 20261103_11 added a column-level grant on grant_days';
  end if;
  if (select c.relacl::text from pg_class c where c.oid = 'library.invitations'::regclass) is distinct from b.relacl then
    raise exception 'T3b FAIL: the table ACL changed (before %, after %)', b.relacl,
      (select c.relacl::text from pg_class c where c.oid = 'library.invitations'::regclass);
  end if;
  if (select c.relrowsecurity from pg_class c where c.oid = 'library.invitations'::regclass) is distinct from b.rls then
    raise exception 'T3c FAIL: RLS on library.invitations changed';
  end if;
  if (select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, ','), ';' order by p.policyname)
        from pg_policies p where p.schemaname = 'library' and p.tablename = 'invitations') is distinct from b.policies then
    raise exception 'T3d FAIL: the policies of library.invitations changed';
  end if;
  -- The state this file leaves alone (reported in the SELECT check as codes_readable_by_session_roles):
  raise notice 'T3 note: anon SELECT on library.invitations = %, authenticated = % (unchanged by 20261103_11; STOP-POINT in the task-8 report)',
    has_table_privilege('anon', 'library.invitations', 'SELECT'), has_table_privilege('authenticated', 'library.invitations', 'SELECT');
end $$;

-- T4 the code stays the service role's to write: authenticated cannot write grant_days
set role authenticated;
do $$
begin
  begin
    update library.invitations set grant_days = 3660 where code = 'NULLDAY1';
    if found then
      raise exception 'T4 FAIL: authenticated changed a code''s grant_days';
    end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$
begin
  if (select grant_days from library.invitations where code = 'NULLDAY1') is not null then
    raise exception 'T4b FAIL: grant_days was written by a session role';
  end if;
end $$;

select 'library_invitation_grant_days: ALL PASS' as result, true as ok;
