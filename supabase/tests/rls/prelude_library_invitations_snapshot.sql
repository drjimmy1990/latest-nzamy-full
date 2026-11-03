-- prelude_library_invitations_snapshot.sql — runs BETWEEN the two 20261103_15
-- runs in library_invitations_close_public_read.test.sql's chain: it records
-- the table ACL, column ACLs, RLS flag and policies after the FIRST run, so the
-- test (T5) can prove the second run changed nothing.
drop table if exists public._inv15_snapshot;
create table public._inv15_snapshot as
select
  (select c.relacl::text from pg_class c where c.oid = 'library.invitations'::regclass) as relacl,
  (select string_agg(a.attname || '=' || coalesce(a.attacl::text, ''), ';' order by a.attnum)
     from pg_attribute a
    where a.attrelid = 'library.invitations'::regclass and a.attnum > 0 and not a.attisdropped) as colacl,
  (select c.relrowsecurity from pg_class c where c.oid = 'library.invitations'::regclass) as rls,
  (select string_agg(p.policyname || ':' || p.cmd || ':' || array_to_string(p.roles, ','), ';' order by p.policyname)
     from pg_policies p where p.schemaname = 'library' and p.tablename = 'invitations') as policies,
  (select count(*) from library.invitations) as code_rows;
revoke all on public._inv15_snapshot from anon, authenticated, app_user;
