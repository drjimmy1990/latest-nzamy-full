-- 01-row-counts.sql  (READ-ONLY)
-- Exact row count of every table in every schema, one CSV row per table.
-- Tables the connecting role cannot read get a NULL count and the error in the note column (that is fine — we only
-- need the USER schemas + auth + storage to be readable).
-- Run:  psql "<url>" -X -q -v ON_ERROR_STOP=1 --csv -f sql/01-row-counts.sql -o 01-row-counts.csv
create temp table _counts (schema_name text, table_name text, row_count bigint, note text);

do $$
declare
  r record;
  n bigint;
begin
  for r in
    select n.nspname, c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p')
      and n.nspname not like 'pg\_%' and n.nspname <> 'information_schema'
    order by 1, 2
  loop
    begin
      execute format('select count(*) from %I.%I', r.nspname, r.relname) into n;
      insert into _counts values (r.nspname, r.relname, n, null);
    exception when others then
      insert into _counts values (r.nspname, r.relname, null, sqlstate || ' ' || sqlerrm);
    end;
  end loop;
end $$;

select schema_name, table_name, row_count, note from _counts order by 1, 2;
