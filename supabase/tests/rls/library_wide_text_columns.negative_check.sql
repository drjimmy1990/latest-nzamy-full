
-- (end of 20261130_10 inlined above; it must have failed and rolled back)
\set ON_ERROR_STOP on
rollback;
do $$
declare t1 text; t2 text;
begin
  select format_type(a.atttypid, a.atttypmod) into t1
    from pg_attribute a where a.attrelid = 'library.articles'::regclass and a.attname = 'number_text';
  select format_type(a.atttypid, a.atttypmod) into t2
    from pg_attribute a where a.attrelid = 'library.laws'::regclass and a.attname = 'issuing_instrument';
  if t1 is distinct from 'character varying(50)' or t2 is distinct from 'character varying(200)' then
    raise exception 'NEG FAIL: a column changed (number_text %, issuing_instrument %)', t1, t2;
  end if;
  if to_regprocedure('library.library_column_widths()') is not null then
    raise exception 'NEG FAIL: library_column_widths() was created';
  end if;
  if to_regclass('library.mv_l10_ctrl') is null or to_regclass('library.v_laws_enactment_status') is null then
    raise exception 'NEG FAIL: a view was dropped';
  end if;
  raise notice 'NEG PASS: the matview stopped 20261130_10 — both columns still varchar, no function, views intact';
end $$;
