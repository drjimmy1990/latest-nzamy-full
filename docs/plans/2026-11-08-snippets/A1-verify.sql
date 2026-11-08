-- >>> verify:library_tier_columns_1108
-- 2026-11-08 — 20261108_10_library_decree_tier_columns_lock.sql (owner ٤٢٤ /
-- ٣٨٠ / ٣١٩; AFTER the deploy): a decree's number (ref), date, official link,
-- the raw summaries and fts are server-only; anon / authenticated read the 9
-- catalogue columns only. Read-only, safe to repeat. Keyed on the marker on
-- library.decrees_circulars: before the migration one NOTICE (and ok = false
-- rows in the SELECT, which is the truth before it runs).
-- The SELECT: one row per (role, locked column) — every row must say ok = true.
select '20261108_10 ' || r.role || ' cannot read decrees_circulars.' || c.col as check,
       not has_column_privilege(r.role, 'library.decrees_circulars', c.col, 'SELECT') as ok
  from (values ('anon'), ('authenticated')) as r(role)
 cross join (values ('ref'), ('date'), ('official_url'), ('summary'), ('summary_brief'), ('fts'), ('preamble')) as c(col)
union all
select '20261108_10 ' || r.role || ' holds no table-level SELECT on decrees_circulars',
       not has_table_privilege(r.role, 'library.decrees_circulars', 'SELECT')
  from (values ('anon'), ('authenticated')) as r(role)
union all
select '20261108_10 ' || r.role || ' still reads the catalogue columns (id, title, type, issuer, category, hashtags, created_at, updated_at, instrument_ar)',
       bool_and(has_column_privilege(r.role, 'library.decrees_circulars', c.col, 'SELECT'))
  from (values ('anon'), ('authenticated')) as r(role)
 cross join (values ('id'), ('title'), ('type'), ('issuer'), ('category'), ('hashtags'), ('created_at'), ('updated_at'), ('instrument_ar')) as c(col)
 group by r.role;

do $$
declare
  tbl     constant text := 'library.decrees_circulars';
  allowed constant text[] := array['id', 'title', 'type', 'issuer', 'category', 'hashtags', 'created_at', 'updated_at', 'instrument_ar'];
  r       text;
  col     text;
  missing text := '';
begin
  if coalesce(obj_description(tbl::regclass, 'pg_class'), '') not ilike '%tier columns server-only since 20261108_10%' then
    raise notice '_verify: 20261108_10 is not applied yet — a decree''s number, date, official link, summaries and fts are still anon-readable (apply it AFTER the deploy)';
    return;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, tbl, 'SELECT') then
      missing := missing || format(' %s holds table-level SELECT on %s (20260922_01 / a schema dump re-applied? re-run 20261018_02 and 20261108_10);', r, tbl);
    end if;
    if has_any_column_privilege(r, tbl, 'INSERT') or has_any_column_privilege(r, tbl, 'UPDATE')
       or has_table_privilege(r, tbl, 'DELETE') or has_table_privilege(r, tbl, 'TRUNCATE') then
      missing := missing || format(' %s can write %s;', r, tbl);
    end if;
    foreach col in array allowed loop
      if not has_column_privilege(r, tbl, col, 'SELECT') then
        missing := missing || format(' %s cannot read catalogue column %s.%s (re-run 20261108_10);', r, tbl, col);
      end if;
    end loop;
    for col in
      select att.attname::text from pg_attribute att
       where att.attrelid = tbl::regclass and att.attnum > 0 and not att.attisdropped
    loop
      if not (col = any (allowed)) and has_column_privilege(r, tbl, col, 'SELECT') then
        missing := missing || format(' %s can read locked column %s.%s (20261019_40 re-run? re-run 20261108_10);', r, tbl, col);
      end if;
    end loop;
  end loop;
  if not has_table_privilege('service_role', tbl, 'SELECT') then
    missing := missing || format(' service_role cannot read %s (every decree page would 404);', tbl);
  end if;
  if not exists (select 1 from pg_policies
                  where schemaname || '.' || tablename = tbl
                    and cmd in ('SELECT', 'ALL') and roles && array['anon', 'public']::name[]) then
    missing := missing || format(' no read policy for anon on %s;', tbl);
  end if;
  if missing <> '' then
    raise exception '_verify: the decree tier-column lock (20261108_10) is broken —%', missing;
  end if;
  raise notice '_verify: 20261108_10 OK — decrees_circulars ref / date / official_url / summary / summary_brief / fts / preamble are server-only; 9 catalogue columns stay public';
end $$;
-- <<< verify:library_tier_columns_1108
