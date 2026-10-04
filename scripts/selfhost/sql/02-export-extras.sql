-- 02-export-extras.sql  (READ-ONLY; prints SQL)
-- Everything the app needs that lives OUTSIDE the user schemas and is therefore missing from 10-schema.sql:
--   [A] triggers on auth.* / storage.* (e.g. on_auth_user_created -> public.handle_new_user)
--   [B] storage buckets
--   [C] RLS policies on storage.objects
--   [D] realtime publication members
--   [E] pg_cron jobs (listed as comments — recreate by hand if used)
--   [F] database webhooks (already inside 10-schema.sql because the trigger sits on a user table — listed for awareness)
--   [G] migration history rows (carried by 20-data.sql — listed for awareness)
--   [H] non-default roles (must be created on the self-host BEFORE 10-schema.sql)
-- Every emitted statement is idempotent so the file can be re-run.
-- Run:  psql "<url>" -X -q -A -t -v ON_ERROR_STOP=1 -f sql/02-export-extras.sql -o 02-extras.sql
-- empty search_path so every printed definition is schema-qualified (auth.users, public.handle_new_user, ...)
set search_path = '';
select '-- 02-extras.sql — generated ' || now()::text || ' from ' || current_database() || ' (' || current_setting('server_version') || ')';
select '-- Objects outside the user schemas. Run AFTER 10-schema.sql on the self-host.';
select '';

select '-- [A] triggers on auth.* / storage.* tables';
select format('drop trigger if exists %I on %s.%s;', t.tgname, quote_ident(c.relnamespace::regnamespace::text), quote_ident(c.relname))
       || E'\n' || pg_get_triggerdef(t.oid) || ';'
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and c.relnamespace::regnamespace::text in ('auth', 'storage')
order by c.relname, t.tgname;
select '';

select exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') as has_buckets \gset
select '-- [B] storage buckets (objects/files are copied separately by copy-storage.mjs)';
\if :has_buckets
select format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %s) '
              || 'on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;',
              id, name, public,
              coalesce(file_size_limit::text, 'null'),
              case when allowed_mime_types is null then 'null' else quote_literal(allowed_mime_types::text) || '::text[]' end)
from storage.buckets order by id;
\else
select '-- (no storage.buckets table on the source)';
\endif
select '';

select '-- [C] RLS policies on storage.objects';
select format('drop policy if exists %I on storage.objects;', policyname) || E'\n'
       || format('create policy %I on storage.objects as %s for %s to %s%s%s;',
                 policyname, lower(permissive), cmd, array_to_string(roles, ', '),
                 case when qual is not null then format(' using (%s)', qual) else '' end,
                 case when with_check is not null then format(' with check (%s)', with_check) else '' end)
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
select '';

select '-- [D] realtime publication members';
select format('do $rt$ begin alter publication supabase_realtime add table %I.%I; exception when duplicate_object then null; end $rt$;',
              schemaname, tablename)
from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
select '';

select exists (select 1 from pg_namespace where nspname = 'cron') as has_cron \gset
select '-- [E] pg_cron jobs (recreate with cron.schedule(...) on the self-host if you rely on them)';
\if :has_cron
select format('-- cron job %s "%s": schedule=%L active=%s command=%L', jobid, jobname, schedule, active, command)
from cron.job order by jobid;
\else
select '-- (pg_cron not installed on the source)';
\endif
select '';

select '-- [F] database webhooks — triggers calling supabase_functions.http_request (already in 10-schema.sql; the target URLs are embedded in the trigger args)';
select format('-- %s.%s: %s', c.relnamespace::regnamespace::text, c.relname, pg_get_triggerdef(t.oid))
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal and p.proname = 'http_request'
order by 1;
select '';

select exists (select 1 from pg_tables where schemaname = 'supabase_migrations' and tablename = 'schema_migrations') as has_hist \gset
select '-- [G] migration history (supabase_migrations.schema_migrations) — rows travel inside 20-data.sql';
\if :has_hist
select format('-- applied: %s %s', version, coalesce(name, '')) from supabase_migrations.schema_migrations order by version;
\else
select '-- (no history table: "supabase db push" was never used against this project)';
\endif
select '';

select '-- [H] non-default roles present on the source (create them on the self-host BEFORE 10-schema.sql if any are listed)';
select format('-- role: %s (login=%s)', rolname, rolcanlogin)
from pg_roles
where rolname not like 'pg\_%'
  and rolname not in ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin',
                      'supabase_storage_admin','supabase_functions_admin','supabase_replication_admin','supabase_read_only_user',
                      'supabase_realtime_admin','supabase_etl_admin','dashboard_user','pgbouncer','pgsodium_keyholder',
                      'pgsodium_keyiduser','pgsodium_keymaker','pgtle_admin')
order by 1;
select '-- end of 02-extras.sql';
