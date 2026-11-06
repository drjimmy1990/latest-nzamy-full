-- library_invitations_close_public_read.test.sql — proves
-- 20261103_15_library_invitations_close_public_read.sql: library invite codes
-- (library.invitations) are no longer readable or writable by anon or
-- authenticated; every policy that admitted them is gone (a hand-made PUBLIC
-- one too); a service_role-only policy is kept; RLS stays on; service_role
-- still reads and updates; a second run changes nothing; a re-issued SELECT
-- grant alone (20260922_01 re-run) still returns no row. Also runs the
-- _verify block verify:library_invitations_closed.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- chain of library_invitation_grant_days.test.sql, the leak prelude (it
-- RAISES unless anon CAN list the codes before the file — the leak), then
-- 20261103_15, the snapshot prelude, 20261103_15 again. From the repo root,
-- in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   V=$D/verify_library_invitations_closed.sql
--   sed -n '/^-- >>> verify:library_invitations_closed/,/^-- <<< verify:library_invitations_closed/p' $M/_verify.sql > "$V"
--   LIB="$M/20260626_legal_library_schema.sql $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql \
--     $M/20260729_library_status.sql $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql $M/20260911_library_laws_enactment_gazette_schema.sql \
--     $M/20260919_laws_parent_linkage_columns.sql $M/20260922_01_library_grants.sql \
--     $M/20260922_04_library_view_security_invoker.sql $M/20260925_04_law_facet_counts.sql \
--     $M/20260929_01_library_text_server_only.sql $M/20261004_01_library_column_lock.sql \
--     $M/20261103_11_library_invitation_grant_days.sql"
--   bash $R/run.sh $LIB $R/prelude_library_invitations_leak.sql \
--     $M/20261103_15_library_invitations_close_public_read.sql $R/prelude_library_invitations_snapshot.sql \
--     $M/20261103_15_library_invitations_close_public_read.sql "$V" $R/library_invitations_close_public_read.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL):
--   1. without 20261103_15 the test stops at T1 (anon lists the codes):
--      bash $R/run.sh $LIB $R/prelude_library_invitations_leak.sql $R/library_invitations_close_public_read.test.sql
--   2. without 20261103_15 the _verify block RAISES «… admits anon / authenticated … Run 20261103_15 … (any time)»:
--      bash $R/run.sh $LIB $R/prelude_library_invitations_leak.sql "$V"
--   3. 20260922_01 re-run after 20261103_15 (the grant comes back, no policy):
--      the _verify block RAISES «anon holds SELECT … no row is readable yet …»:
--      bash $R/run.sh $LIB $M/20261103_15_library_invitations_close_public_read.sql $M/20260922_01_library_grants.sql "$V"
--
-- Every assertion RAISES on failure.

-- T1 anon: no read, no write (42501 — no privilege — or, at most, 0 rows)
set role anon;
do $$
declare n int;
begin
  begin
    select count(*) into n from library.invitations;
    if n > 0 then
      raise exception 'T1 FAIL: anon still lists % invite codes', n;
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into library.invitations (code, max_uses) values ('ANON0001', 1000);
    raise exception 'T1b FAIL: anon created an invite code';
  exception when insufficient_privilege then null;
  end;
  begin
    update library.invitations set max_uses = 1000 where code = 'LEAK0001';
    if found then raise exception 'T1c FAIL: anon changed an invite code'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T2 authenticated: the same
set role authenticated;
do $$
declare n int;
begin
  begin
    select count(*) into n from library.invitations;
    if n > 0 then
      raise exception 'T2 FAIL: authenticated still lists % invite codes', n;
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    select count(*) into n from library.invitations where code = 'LEAK0001';
    if n > 0 then
      raise exception 'T2a FAIL: authenticated can look a code up by value';
    end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into library.invitations (code, max_uses) values ('AUTH0001', 1000);
    raise exception 'T2b FAIL: authenticated created an invite code';
  exception when insufficient_privilege then null;
  end;
  begin
    update library.invitations set current_uses = 0 where code = 'LEAK0002';
    if found then raise exception 'T2c FAIL: authenticated reset a code''s uses'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from library.invitations where code = 'LEAK0003';
    if found then raise exception 'T2d FAIL: authenticated deleted a code'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- T3 service_role (the admin and redeem routes): still reads and updates
set role service_role;
do $$
declare n int;
begin
  select count(*) into n from library.invitations where code like 'LEAK%';
  if n <> 3 then
    raise exception 'T3 FAIL: service_role reads % of the 3 codes', n;
  end if;
  update library.invitations set max_uses = 9 where code = 'LEAK0001';
  if not found then
    raise exception 'T3b FAIL: service_role could not update a code';
  end if;
  insert into library.invitations (code, max_uses) values ('SRV00001', 1);
  delete from library.invitations where code = 'SRV00001';
end $$;
reset role;
do $$
begin
  if (select max_uses from library.invitations where code = 'LEAK0001') <> 9 then
    raise exception 'T3c FAIL: the service_role update did not land';
  end if;
end $$;

-- T4 the catalog: RLS on; no table or column privilege for anon /
-- authenticated; no policy admits a session role (the 20260626 one and the
-- hand-made PUBLIC one are gone); the service_role-only policy is kept
do $$
declare r text; p text;
begin
  if not (select relrowsecurity from pg_class where oid = 'library.invitations'::regclass) then
    raise exception 'T4a FAIL: RLS is off';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, 'library.invitations', p) then
        raise exception 'T4b FAIL: % holds %', r, p;
      end if;
    end loop;
    if has_any_column_privilege(r, 'library.invitations', 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'T4c FAIL: % holds a column privilege', r;
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname = 'library' and tablename = 'invitations'
               and policyname in ('Allow public read on library.invitations', 'hand added read')) then
    raise exception 'T4d FAIL: an admitting policy survived';
  end if;
  if (select string_agg(policyname, ',') from pg_policies where schemaname = 'library' and tablename = 'invitations')
     is distinct from 'service role only' then
    raise exception 'T4e FAIL: the policies left are %, want only «service role only»',
      (select string_agg(policyname, ',') from pg_policies where schemaname = 'library' and tablename = 'invitations');
  end if;
  foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if not has_table_privilege('service_role', 'library.invitations', p) then
      raise exception 'T4f FAIL: service_role lacks %', p;
    end if;
  end loop;
end $$;

-- T5 the second run changed nothing (snapshot taken after the first run)
do $$
declare s public._inv15_snapshot;
begin
  select * into s from public._inv15_snapshot;
  if (select c.relacl::text from pg_class c where c.oid = 'library.invitations'::regclass) is distinct from s.relacl
     or (select string_agg(a.attname || '=' || coalesce(a.attacl::text, ''), ';' order by a.attnum)
           from pg_attribute a
          where a.attrelid = 'library.invitations'::regclass and a.attnum > 0 and not a.attisdropped) is distinct from s.colacl
     or (select c.relrowsecurity from pg_class c where c.oid = 'library.invitations'::regclass) is distinct from s.rls
     or (select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, ','), ';' order by p.policyname)
           from pg_policies p where p.schemaname = 'library' and p.tablename = 'invitations') is distinct from s.policies then
    raise exception 'T5 FAIL: the second run of 20261103_15 changed the table''s privileges or policies';
  end if;
  if (select count(*) from library.invitations) <> s.code_rows then
    raise exception 'T5b FAIL: a run touched the codes themselves';
  end if;
end $$;

-- T6 the half that lasts: 20260922_01's schema-wide SELECT re-issued → still
-- no row for anon / authenticated (no policy admits them; RLS denies)
grant select on library.invitations to anon, authenticated;
set role anon;
do $$
begin
  if (select count(*) from library.invitations) <> 0 then
    raise exception 'T6 FAIL: with the grant back and no policy, anon still read codes';
  end if;
end $$;
reset role;
set role authenticated;
do $$
begin
  if (select count(*) from library.invitations) <> 0 then
    raise exception 'T6b FAIL: with the grant back and no policy, authenticated still read codes';
  end if;
end $$;
reset role;
revoke select on library.invitations from anon, authenticated;

drop table public._inv15_snapshot;
select 'library_invitations_close_public_read: ALL PASS' as result, true as ok;
