-- library_laws_parent_index.test.sql — proves 20261130_20 (library agent's
-- request of 19 Nov §1.8; batch l10-children) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself): the library
-- schema, 20260919 (parent_law_id and its PARTIAL index), the l10_children
-- _verify block BEFORE the file (must answer false, not fail), 20261130_20
-- TWICE (idempotent), the _verify block again, then this file. From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l10_children_block.sql
--   sed -n '/^-- >>> verify:l10_children/,/^-- <<< verify:l10_children/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260919_laws_parent_linkage_columns.sql "$B" \
--     $M/20261130_20_library_laws_parent_index.sql $M/20261130_20_library_laws_parent_index.sql \
--     "$B" $R/library_laws_parent_index.test.sql
--
-- NEGATIVE CONTROLS (must FAIL):
--   - the chain without the two 20261130_20 files → "T1 FAIL: … missing";
--   - 20261130_20 placed BEFORE 20260919 → "20261130_20: library.laws.parent_law_id missing".
--
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- fixture: one parent, three children, a self-pointer, and filler rows so
-- the table is not trivially small
insert into library.laws (slug, title, type, status, issue_date_hijri, instrument_id, parent_law_id)
values ('nzm-qada', 'نظام القضاء', 'نظام', 'active', '1428/09/19', 'LAW-00-0897', null),
       ('reg-qada', 'اللائحة التنفيذية لنظام القضاء', 'لائحة تنفيذية', 'active', '1440/1/2', 'LAW-11-0001', 'LAW-00-0897'),
       ('qrr-qada', 'قرار تنظيمي', 'قرار', 'repealed', '1445/03/01', 'LAW-11-0002', 'LAW-00-0897'),
       ('tmm-qada', 'تعميم', 'تعميم', 'active', null, 'LAW-11-0003', 'LAW-00-0897'),
       ('self-ptr', 'وثيقة تشير إلى نفسها', 'قرار', 'active', null, 'LAW-11-0004', 'LAW-11-0004');
insert into library.laws (slug, title, instrument_id, parent_law_id)
select 'filler-' || g, 'وثيقة ' || g, 'LAW-99-' || g, case when g % 3 = 0 then 'LAW-98-' || (g / 3) end
  from generate_series(1, 3000) g;
analyze library.laws;

-- T1 the index: a plain, valid btree on (parent_law_id), apart from the partial one
do $$
declare ok boolean;
begin
  if to_regclass('library.laws_parent_law_id_lookup_idx') is null then
    raise exception 'T1 FAIL: library.laws_parent_law_id_lookup_idx missing';
  end if;
  select i.indpred is null and i.indisvalid and i.indnatts = 1 into ok
    from pg_catalog.pg_index i where i.indexrelid = 'library.laws_parent_law_id_lookup_idx'::regclass;
  if not ok then raise exception 'T1 FAIL: the new index is partial or invalid'; end if;
  if to_regclass('library.laws_parent_law_id_idx') is null then
    raise exception 'T1 FAIL: the 20260919 partial index was dropped (this file must leave it)';
  end if;
  if (select count(*) from pg_catalog.pg_index i
       join pg_catalog.pg_class c on c.oid = i.indexrelid
      where i.indrelid = 'library.laws'::regclass and c.relname like 'laws_parent_law_id%') <> 2 then
    raise exception 'T1 FAIL: expected exactly the two parent_law_id indexes (a re-run built another?)';
  end if;
  raise notice 'T1 PASS: plain btree laws_parent_law_id_lookup_idx beside the partial 20260919 index';
end $$;

-- T2 the two queries the code sends use it (the law page: =, the catalogue: in)
set enable_seqscan = off;
do $$
declare plan text;
begin
  -- EXPLAIN returns one row per plan line: stop at the line naming the index
  for plan in execute 'explain (costs off) select slug, title, type, status, issue_date_hijri from library.laws where parent_law_id = ''LAW-00-0897''' loop
    exit when strpos(plan, 'laws_parent_law_id_lookup_idx') > 0;
  end loop;
  if strpos(coalesce(plan, ''), 'laws_parent_law_id_lookup_idx') = 0 then
    raise exception 'T2 FAIL: the law page''s = query does not use laws_parent_law_id_lookup_idx';
  end if;
  plan := '';
  for plan in execute 'explain (costs off) select slug, parent_law_id from library.laws where parent_law_id in (''LAW-00-0897'', ''LAW-98-5'', ''LAW-98-7'')' loop
    exit when strpos(plan, 'laws_parent_law_id_lookup_idx') > 0;
  end loop;
  if strpos(coalesce(plan, ''), 'laws_parent_law_id_lookup_idx') = 0 then
    raise exception 'T2 FAIL: the catalogue''s in (…) query does not use laws_parent_law_id_lookup_idx';
  end if;
  raise notice 'T2 PASS: = and in (…) on parent_law_id both use the new index';
end $$;

-- T3 why the file exists: with only the 20260919 PARTIAL index, the same
-- query cannot use an index (the planner cannot prove btrim(x) <> '' from
-- x = '…'). Run inside a rolled-back block.
begin;
drop index library.laws_parent_law_id_lookup_idx;
do $$
declare line text; used boolean := false;
begin
  for line in execute 'explain (costs off) select slug from library.laws where parent_law_id = ''LAW-00-0897''' loop
    if strpos(line, 'laws_parent_law_id_idx') > 0 then used := true; end if;
  end loop;
  if used then
    raise exception 'T3 FAIL: the partial index serves = after all — this migration would be redundant';
  end if;
  raise notice 'T3 PASS: the 20260919 partial index alone does not serve parent_law_id = …';
end $$;
rollback;
reset enable_seqscan;

-- T4 the rows the code reads: three children of نظام القضاء, the self-pointer
-- excluded by the code's own rule (slug <> parent slug)
do $$
declare n int;
begin
  select count(*) into n from library.laws where parent_law_id = 'LAW-00-0897' and slug <> 'nzm-qada';
  if n <> 3 then raise exception 'T4 FAIL: % children of LAW-00-0897 (want 3)', n; end if;
  select count(*) into n from library.laws where parent_law_id = 'LAW-11-0004' and slug <> 'self-ptr';
  if n <> 0 then raise exception 'T4 FAIL: the self-pointer counted as its own child'; end if;
  raise notice 'T4 PASS: 3 children found by parent_law_id; a self-pointer is no child';
end $$;
