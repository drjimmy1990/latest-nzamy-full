-- 00-server-info.sql  (READ-ONLY)
-- Facts about the SOURCE project that decide how the self-host restore is assembled.
-- Run:  psql "<url>" -X -q -v ON_ERROR_STOP=1 -f sql/00-server-info.sql -o 00-server-info.txt
\pset format aligned
\pset footer off
-- empty search_path so every printed definition is schema-qualified (auth.users, public.handle_new_user, ...)
set search_path = '';

\qecho == server ==
select version();
select current_user, current_database(), current_setting('server_version') as server_version,
       pg_size_pretty(pg_database_size(current_database())) as database_size;

\qecho
\qecho == extensions (self-host must have the same ones; pgcrypto is the only one our migrations need) ==
select e.extname, e.extversion, n.nspname as schema
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
order by 1;

\qecho
\qecho == schemas: USER schemas go into 10-schema.sql; supabase-managed ones are re-created by the self-host stack ==
select n.nspname,
       case when n.nspname in ('auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net',
                               'pgsodium','pgsodium_masks','vault','supabase_functions','supabase_migrations',
                               'pgbouncer','cron','pgtle','_analytics','_supavisor','repack')
              then 'supabase-managed'
            when n.nspname like 'pg\_%' or n.nspname = 'information_schema' then 'system'
            else 'USER' end as kind,
       pg_get_userbyid(n.nspowner) as owner
from pg_namespace n
order by 2, 1;

\qecho
\qecho == tables per schema (rls_enabled = tables with row level security on) ==
select schemaname, count(*) as tables, count(*) filter (where rowsecurity) as rls_enabled
from pg_tables
where schemaname not like 'pg\_%' and schemaname <> 'information_schema'
group by 1 order by 1;

\qecho
\qecho == owners of objects in USER schemas (restore uses --no-owner; everything becomes the restoring role) ==
select schemaname as schema, tableowner as owner, count(*) as tables
from pg_tables
where schemaname not in ('auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net',
                         'pgsodium','pgsodium_masks','vault','supabase_functions','supabase_migrations',
                         'pgbouncer','cron','pgtle','_analytics','_supavisor','repack')
  and schemaname not like 'pg\_%' and schemaname <> 'information_schema'
group by 1, 2 order by 1, 2;

\qecho
\qecho == roles that receive grants in USER schemas (every one of these must exist on the self-host BEFORE 10-schema.sql) ==
select distinct grantee
from information_schema.role_table_grants
where table_schema not in ('auth','storage','realtime','_realtime','extensions','graphql','graphql_public','net',
                           'pgsodium','pgsodium_masks','vault','supabase_functions','supabase_migrations',
                           'pgbouncer','cron','pgtle','_analytics','_supavisor','repack')
  and table_schema not like 'pg\_%' and table_schema <> 'information_schema'
order by 1;

\qecho
\qecho == roles present here (non-system) ==
select rolname, rolsuper, rolbypassrls, rolcanlogin
from pg_roles where rolname not like 'pg\_%' order by 1;

\qecho
\qecho == triggers on auth.* / storage.* tables (NOT part of 10-schema.sql; re-created from 02-extras.sql) ==
select c.relnamespace::regnamespace::text as schema, c.relname as "table", t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace::regnamespace::text in ('auth','storage')
order by 1, 2, 3;

\qecho
\qecho == policies on storage.objects (NOT part of 10-schema.sql; re-created from 02-extras.sql) ==
select policyname, cmd, roles from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1;

\qecho
select exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') as has_buckets \gset
\qecho == storage buckets ==
\if :has_buckets
select id, public, file_size_limit, allowed_mime_types, created_at from storage.buckets order by 1;
\else
\qecho (no storage.buckets table)
\endif

\qecho
\qecho == realtime publication members ==
select pubname, schemaname, tablename from pg_publication_tables order by 1, 2, 3;

\qecho
\qecho == database webhooks (triggers that call supabase_functions.http_request) ==
select c.relnamespace::regnamespace::text as schema, c.relname as "table", t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and p.proname = 'http_request'
order by 1, 2, 3;

select exists (select 1 from pg_namespace where nspname = 'cron') as has_cron \gset
\qecho
\qecho == pg_cron jobs ==
\if :has_cron
select jobid, jobname, schedule, active, command from cron.job order by 1;
\else
\qecho (pg_cron is not installed here)
\endif

select exists (select 1 from pg_tables where schemaname = 'supabase_migrations' and tablename = 'schema_migrations') as has_hist \gset
\qecho
\qecho == migration history table (what "supabase db push" believes is applied) ==
\if :has_hist
select version, name from supabase_migrations.schema_migrations order by version;
\else
\qecho (no supabase_migrations.schema_migrations table -> "supabase db push" was never used against this project)
\endif

\qecho
select exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'email_confirmed_at') as has_auth_cols \gset
\qecho == auth.users summary (counts only) ==
\if :has_auth_cols
select count(*) as users,
       count(*) filter (where email_confirmed_at is not null) as email_confirmed,
       count(*) filter (where phone_confirmed_at is not null) as phone_confirmed,
       count(*) filter (where deleted_at is not null) as soft_deleted,
       min(created_at) as first_user, max(created_at) as last_user
from auth.users;
\qecho
\qecho == identities per provider ==
select provider, count(*) from auth.identities group by 1 order by 1;
\else
\qecho (auth.users has no email_confirmed_at column here - not a real Supabase auth schema)
\endif
