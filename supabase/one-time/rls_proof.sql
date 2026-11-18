-- ════════════════════════════════════════════════════════════════════════════
-- RLS proof — READ-ONLY, one time (owner message 18 Nov 2026, item 2.6;
-- batch l8, builder l8-libguard).
--
-- What the owner asked: «أثبتوا أن RLS مفعّل على كل الجداول، وأن أي جدول يحوي
-- نصاً كاملاً غير قابل للقراءة بالمفتاح العام». The public (anon) key is in the
-- browser bundle by design; this file proves what it can and cannot read.
--
-- It changes NOTHING: the whole file runs inside a READ ONLY transaction that
-- ends with ROLLBACK. Safe to run any number of times, before or after any
-- deploy.
--
-- HOW TO RUN (output is several result sets — psql prints them all):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/one-time/rls_proof.sql
--
-- WHAT YOU GET
--   1. every table in the API-exposed schemas (public, library, and any other
--      non-system schema anon may use): RLS on/off, forced, number of
--      policies, and whether anon / authenticated can SELECT any column;
--   2. every policy on those tables (command, roles, USING, WITH CHECK);
--   3. the FULL-TEXT columns (law articles, principles and rulings, their
--      paragraphs, fiqh blocks, decree pages and preambles, law preambles)
--      with anon's and authenticated's SELECT privilege on each — every row
--      must say false;
--   4. library functions anon may EXECUTE (a SECURITY DEFINER function anon
--      can call reads past RLS — each must be a catalogue/title helper, never
--      one that returns article text);
--   5. ONE summary row `proof | ok`: t when no full-text column is readable by
--      anon AND no table anon can SELECT has RLS off (other than the ones it
--      names as intentionally public catalogue — see the `rls_off_anon_readable`
--      list in section 1: review each before reporting).
-- ════════════════════════════════════════════════════════════════════════════

begin transaction read only;

-- ── which schemas count as "exposed" ─────────────────────────────────────────
-- (the exposed schemas are the `_exposed_schemas` CTE repeated in each query below:
--  public, library, and every other non-system schema anon has USAGE on)

-- ── 1. every table: RLS and who can read it ─────────────────────────────────
with _exposed_schemas as (
select n.nspname as schema_name
  from pg_catalog.pg_namespace n
 where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'extensions',
                         'realtime', 'graphql', 'graphql_public', 'vault', 'net', 'cron', 'pgsodium',
                         'pgsodium_masks', 'supabase_functions', 'supabase_migrations', '_realtime', '_analytics')
   and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
   and (n.nspname in ('public', 'library') or has_schema_privilege('anon', n.oid, 'USAGE'))
)
select c.relnamespace::regnamespace::text                      as schema,
       c.relname                                                as "table",
       case c.relkind when 'r' then 'table' when 'p' then 'partitioned' when 'v' then 'view' when 'm' then 'matview' end as kind,
       c.relrowsecurity                                         as rls_on,
       c.relforcerowsecurity                                    as rls_forced,
       (select pg_catalog.count(*) from pg_catalog.pg_policy p where p.polrelid = c.oid) as policies,
       has_any_column_privilege('anon', c.oid, 'SELECT')          as anon_select,
       has_any_column_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       case
         when c.relkind in ('r', 'p') and not c.relrowsecurity and has_any_column_privilege('anon', c.oid, 'SELECT')
           then 'RLS OFF + anon can read — review'
         when c.relkind in ('r', 'p') and not c.relrowsecurity then 'RLS off (no anon read)'
         when c.relkind in ('v', 'm') and has_any_column_privilege('anon', c.oid, 'SELECT')
           then 'view anon can read — check security_invoker'
         else 'ok'
       end                                                      as note
  from pg_catalog.pg_class c
 where c.relnamespace::regnamespace::text in (select schema_name from _exposed_schemas)
   and c.relkind in ('r', 'p', 'v', 'm')
 order by 1, 2;

-- ── 2. every policy on those tables ──────────────────────────────────────────
with _exposed_schemas as (
select n.nspname as schema_name
  from pg_catalog.pg_namespace n
 where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'extensions',
                         'realtime', 'graphql', 'graphql_public', 'vault', 'net', 'cron', 'pgsodium',
                         'pgsodium_masks', 'supabase_functions', 'supabase_migrations', '_realtime', '_analytics')
   and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
   and (n.nspname in ('public', 'library') or has_schema_privilege('anon', n.oid, 'USAGE'))
)
select p.schemaname as schema, p.tablename as "table", p.policyname as policy,
       p.cmd, p.roles, p.permissive, p.qual as using_expr, p.with_check
  from pg_catalog.pg_policies p
 where p.schemaname in (select schema_name from _exposed_schemas)
 order by 1, 2, 3;

-- ── 3. the full-text columns: anon must hold NO select on any of them ───────
-- (A table that does not exist on this database is listed with exists = false.)
with _full_text_columns as (
select v.schema_name, v.table_name, v.column_name,
       exists (select 1 from information_schema.columns ic
                where ic.table_schema = v.schema_name and ic.table_name = v.table_name
                  and ic.column_name = v.column_name) as col_exists
  from (values
    ('library', 'articles',             'text'),
    ('library', 'articles',             'content'),
    ('library', 'articles',             'body'),
    ('library', 'articles',             'executive_reg_text'),
    ('library', 'article_regulations',  'text'),
    ('library', 'article_amendments',   'text'),
    ('library', 'principles',           'text'),
    ('library', 'principles',           'ruling_basis'),
    ('library', 'principles',           'facts'),
    ('library', 'principles',           'reasons'),
    ('library', 'principles',           'ruling'),
    ('library', 'principle_paragraphs', 'text'),
    ('library', 'feqh_blocks',          'matn'),
    ('library', 'feqh_blocks',          'sharh'),
    ('library', 'feqh_blocks',          'hashiyah'),
    ('library', 'decree_pages',         'content'),
    ('library', 'decrees_circulars',    'preamble'),
    ('library', 'laws',                 'preamble')
  ) as v(schema_name, table_name, column_name)
)
select f.schema_name || '.' || f.table_name as "table", f.column_name as "column", f.col_exists as exists,
       case when f.col_exists then has_column_privilege('anon', f.schema_name || '.' || f.table_name, f.column_name, 'SELECT') end as anon_select,
       case when f.col_exists then has_column_privilege('authenticated', f.schema_name || '.' || f.table_name, f.column_name, 'SELECT') end as authenticated_select,
       (select c.relrowsecurity from pg_catalog.pg_class c
         where c.oid = to_regclass(f.schema_name || '.' || f.table_name)) as rls_on
  from _full_text_columns f
 order by 1, 2;

-- Every column anon CAN read on those full-text tables (expect catalogue
-- columns only: ids, titles, numbers, dates — never a text body).
with _full_text_columns as (
select v.schema_name, v.table_name, v.column_name,
       exists (select 1 from information_schema.columns ic
                where ic.table_schema = v.schema_name and ic.table_name = v.table_name
                  and ic.column_name = v.column_name) as col_exists
  from (values
    ('library', 'articles',             'text'),
    ('library', 'articles',             'content'),
    ('library', 'articles',             'body'),
    ('library', 'articles',             'executive_reg_text'),
    ('library', 'article_regulations',  'text'),
    ('library', 'article_amendments',   'text'),
    ('library', 'principles',           'text'),
    ('library', 'principles',           'ruling_basis'),
    ('library', 'principles',           'facts'),
    ('library', 'principles',           'reasons'),
    ('library', 'principles',           'ruling'),
    ('library', 'principle_paragraphs', 'text'),
    ('library', 'feqh_blocks',          'matn'),
    ('library', 'feqh_blocks',          'sharh'),
    ('library', 'feqh_blocks',          'hashiyah'),
    ('library', 'decree_pages',         'content'),
    ('library', 'decrees_circulars',    'preamble'),
    ('library', 'laws',                 'preamble')
  ) as v(schema_name, table_name, column_name)
)
select c.table_schema || '.' || c.table_name as "table", pg_catalog.string_agg(c.column_name, ', ' order by c.ordinal_position) as anon_readable_columns
  from information_schema.columns c
 where (c.table_schema, c.table_name) in (select distinct schema_name, table_name from _full_text_columns)
   and has_column_privilege('anon', c.table_schema || '.' || c.table_name, c.column_name, 'SELECT')
 group by 1
 order by 1;

-- ── 4. library functions anon may execute ────────────────────────────────────
select p.pronamespace::regnamespace::text as schema, p.proname as function,
       pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer
  from pg_catalog.pg_proc p
 where p.pronamespace::regnamespace::text in ('library', 'public')
   and p.prokind = 'f'
   and has_function_privilege('anon', p.oid, 'EXECUTE')
   and (p.pronamespace::regnamespace::text = 'library' or p.proname like 'library%' or p.proname like 'search%')
 order by 1, 2;

-- ── 5. the proof ─────────────────────────────────────────────────────────────
with _exposed_schemas as (
select n.nspname as schema_name
  from pg_catalog.pg_namespace n
 where n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', 'auth', 'storage', 'extensions',
                         'realtime', 'graphql', 'graphql_public', 'vault', 'net', 'cron', 'pgsodium',
                         'pgsodium_masks', 'supabase_functions', 'supabase_migrations', '_realtime', '_analytics')
   and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
   and (n.nspname in ('public', 'library') or has_schema_privilege('anon', n.oid, 'USAGE'))
),
_full_text_columns as (
select v.schema_name, v.table_name, v.column_name,
       exists (select 1 from information_schema.columns ic
                where ic.table_schema = v.schema_name and ic.table_name = v.table_name
                  and ic.column_name = v.column_name) as col_exists
  from (values
    ('library', 'articles',             'text'),
    ('library', 'articles',             'content'),
    ('library', 'articles',             'body'),
    ('library', 'articles',             'executive_reg_text'),
    ('library', 'article_regulations',  'text'),
    ('library', 'article_amendments',   'text'),
    ('library', 'principles',           'text'),
    ('library', 'principles',           'ruling_basis'),
    ('library', 'principles',           'facts'),
    ('library', 'principles',           'reasons'),
    ('library', 'principles',           'ruling'),
    ('library', 'principle_paragraphs', 'text'),
    ('library', 'feqh_blocks',          'matn'),
    ('library', 'feqh_blocks',          'sharh'),
    ('library', 'feqh_blocks',          'hashiyah'),
    ('library', 'decree_pages',         'content'),
    ('library', 'decrees_circulars',    'preamble'),
    ('library', 'laws',                 'preamble')
  ) as v(schema_name, table_name, column_name)
)
select 'proof: no full-text column readable by anon' as step,
       not exists (select 1 from _full_text_columns f
                    where case when f.col_exists
                               then has_column_privilege('anon', f.schema_name || '.' || f.table_name, f.column_name, 'SELECT')
                               else false end) as ok
union all
select 'proof: every full-text table has RLS on' as step,
       not exists (select 1 from (select distinct schema_name, table_name from _full_text_columns) t
                    join pg_catalog.pg_class c on c.oid = to_regclass(t.schema_name || '.' || t.table_name)
                   where not c.relrowsecurity) as ok
union all
select 'proof: no table with RLS off is readable by anon (public + library)' as step,
       not exists (select 1 from pg_catalog.pg_class c
                    where c.relnamespace::regnamespace::text in (select schema_name from _exposed_schemas)
                      and c.relkind in ('r', 'p')
                      and not c.relrowsecurity
                      and has_any_column_privilege('anon', c.oid, 'SELECT')) as ok
union all
select 'count: tables with RLS off (any reader) — listed in section 1' as step,
       (select pg_catalog.count(*) from pg_catalog.pg_class c
         where c.relnamespace::regnamespace::text in (select schema_name from _exposed_schemas)
           and c.relkind in ('r', 'p') and not c.relrowsecurity) = 0 as ok;

rollback;
