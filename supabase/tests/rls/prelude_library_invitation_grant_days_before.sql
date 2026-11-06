-- prelude_library_invitation_grant_days_before.sql — for
-- library_invitation_grant_days.test.sql: snapshots the privileges and the
-- policies of library.invitations BEFORE 20261103_11, so the test proves the
-- migration changes neither (no grant change, no RLS change on an existing
-- table). Also inserts a code made before the column exists.
create table public._inv_before as
select (select c.relacl::text from pg_class c where c.oid = 'library.invitations'::regclass)   as relacl,
       (select c.relrowsecurity from pg_class c where c.oid = 'library.invitations'::regclass) as rls,
       (select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, ','), ';' order by p.policyname)
          from pg_policies p where p.schemaname = 'library' and p.tablename = 'invitations')  as policies;
insert into library.invitations (code, max_uses) values ('BEFORE11', 3);
