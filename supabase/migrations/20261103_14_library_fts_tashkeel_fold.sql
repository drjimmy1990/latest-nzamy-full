-- =============================================================================
-- Migration: 20261103_14_library_fts_tashkeel_fold.sql   — AFTER the deploy
--            ⚠ STOP-POINT: the user runs it at a quiet hour (see the run notes)
-- =============================================================================
-- PURPOSE (BUG-LIB-03, owner-free wave S1 Task 13)
--   A text stored with tashkeel («القَرَارُ») was invisible to a search typed
--   without it («القرار»): the `simple` parser behind `library.arabic` keeps
--   harakat inside the lexeme, so the index held 'القَرَارُ' and nothing else.
--   This file folds tashkeel out of the three server-only `fts` columns:
--
--     library.articles.fts      (table server-only since 20260929_01)
--     library.principles.fts    (text lock 20261016_01)
--     library.feqh_blocks.fts   (text lock 20261018_02)
--
--   Each becomes to_tsvector('library.arabic', library.fold_tashkeel(<the same
--   concatenation as today>)). library.fold_tashkeel(text) removes U+064B–U+065F,
--   U+0670 (dagger alef) and U+0640 (tatweel).
--
--   NOT touched: library.laws.fts and library.decrees_circulars.fts. They hold
--   anon column grants and index titles. No grant on any table changes.
--
-- THE QUERY SIDE (already deployed, S1 Task 9)
--   parseSearchQuery sends every word twice: as typed and without tashkeel. So
--   search works against either index state — before this file a voweled query
--   finds voweled text, after it the stripped form finds every text.
--
-- WHAT IT DOES (idempotent; a second run rewrites nothing)
--   1. create or replace library.fold_tashkeel(text) — SQL, IMMUTABLE,
--      PARALLEL SAFE; EXECUTE revoked from PUBLIC / anon / authenticated and
--      GRANTED TO service_role. Postgres checks EXECUTE on a function in a
--      generated-column expression at INSERT/UPDATE time: the owner's loader
--      writes these tables as service_role, and without the grant his next load
--      fails with 42501.
--   2. Only for the tables whose fts does not already call fold_tashkeel:
--      a. precondition — nothing but library.cross_section_search may depend
--         on those fts columns (pg_depend); anything else RAISES;
--      b. drop library.cross_section_search (it selects the three fts columns);
--      c. per table: drop the gin index, drop fts, add the folded fts, recreate
--         the index, restore the column's statistics target (20261017_21);
--      d. recreate cross_section_search exactly as 20260729_article_history_columns
--         did (WITH NO DATA), its two indexes and comment; revoke it from anon,
--         authenticated and PUBLIC (20260922_04 / 20260929_01), give it its old
--         owner back and every other grant it had (its ACL, e.g. service_role's
--         ALL from 20260626) — whoever runs the file, so default privileges of
--         the running role never decide them.
--   3. After COMMIT: ANALYZE each rewritten fts column (fresh word statistics
--      for the planner; SHARE UPDATE EXCLUSIVE — reads and writes continue).
--   4. A final SELECT whose `ok` is true only when all of it is in place.
--
-- LOCKS AND DURATION
--   Step 2 rewrites each rewritten table under an ACCESS EXCLUSIVE lock, held
--   until COMMIT: reads and writes of articles, principles and fiqh blocks wait.
--   `lock_timeout = 5s` — if a long query holds a table, the file stops with
--   «canceling statement due to lock timeout» and changes nothing; run again.
--   Measured duration and the before/after counts: SQL_batch_2026-11-03_owner_free/S1_RUN_NOTES.md.
--
-- ROLLBACK (only if needed): re-run the fts blocks of
--   20260729_article_history_columns.sql (articles + matview),
--   20260823_fts_number_search.sql (principles) and the feqh_blocks fts of
--   20260626_legal_library_schema.sql, then 20261017_21, then
--   `drop function library.fold_tashkeel(text);`. The query side needs no change.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 1. The fold function ─────────────────────────────────────────────────────
create or replace function library.fold_tashkeel(text)
returns text
language sql
immutable
parallel safe
as $fn$
  select pg_catalog.translate($1, E'ًٌٍَُِّْٰٕٖٜٟٓٔٗ٘ٙٚٛٝٞـ', '')
$fn$;

comment on function library.fold_tashkeel(text) is
  'Removes tashkeel (U+064B–U+065F, U+0670) and tatweel (U+0640) before the library fts columns are built (20261103_14). EXECUTE: service_role only — the loader writes the three tables as service_role.';

revoke execute on function library.fold_tashkeel(text) from public, anon, authenticated;
grant execute on function library.fold_tashkeel(text) to service_role;

-- The function belongs to the owner of the library tables, whoever runs this
-- file (psql as supabase_admin, or the SQL editor as postgres). EXECUTE is
-- revoked from PUBLIC, so a function owned by another role would make every
-- write the tables' owner makes (the SQL editor, the owner's fix SQL) fail with
-- 42501 on the generated column; the owner always holds EXECUTE.
do $own$
declare
  tables_owner name;
begin
  select pg_get_userbyid(c.relowner) into tables_owner
    from pg_class c where c.oid = to_regclass('library.articles');
  if tables_owner is not null and tables_owner <> (
       select pg_get_userbyid(p.proowner) from pg_proc p
        where p.oid = 'library.fold_tashkeel(text)'::regprocedure) then
    execute format('alter function library.fold_tashkeel(text) owner to %I', tables_owner);
  end if;
end $own$;

-- ── 2. Fold the three fts columns (only those not folded yet) ────────────────
do $mig$
declare
  tables constant text[] := array['library.articles', 'library.principles', 'library.feqh_blocks'];
  exprs  constant text[] := array[
    -- library.articles — 20260729_article_history_columns.sql §2
    $e$coalesce(title, '') || ' ' || coalesce(text, '') || ' ' || coalesce(executive_reg_text, '') || ' ' || coalesce(original_text, '')$e$,
    -- library.principles — 20260823_fts_number_search.sql
    $e$coalesce(text, '') || ' ' || coalesce(ruling_basis, '') || ' ' || coalesce(facts, '') || ' ' || coalesce(reasons, '') || ' ' || coalesce(ruling, '') || ' ' || coalesce(principle_number, '') || ' ' || coalesce(decision_number, '') || ' ' || coalesce(reference, '')$e$,
    -- library.feqh_blocks — 20260626_legal_library_schema.sql
    $e$coalesce(topic, '') || ' ' || coalesce(matn, '') || ' ' || coalesce(sharh, '')$e$
  ];
  indexes constant text[] := array['idx_articles_fts', 'idx_principles_fts', 'idx_feqh_blocks_fts'];
  todo       int[] := '{}';
  i          int;
  t          text;
  def        text;
  target     int;
  bad        text;
  svc_select boolean;
  mv_acl     aclitem[];
  g          record;
  mv_owner   name;
begin
  for i in 1 .. array_length(tables, 1) loop
    t := tables[i];
    if to_regclass(t) is null then
      raise exception '20261103_14: % does not exist — apply the library chain first', t;
    end if;
    select pg_get_expr(d.adbin, d.adrelid) into def
      from pg_attribute a
      join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where a.attrelid = to_regclass(t) and a.attname = 'fts' and not a.attisdropped;
    if def is null then
      raise exception '20261103_14: %.fts is missing or not a generated column — apply the library chain first', t;
    end if;
    if position('fold_tashkeel' in def) > 0 then
      raise notice '20261103_14: %.fts already folds tashkeel — skipped', t;
    else
      todo := todo || i;
    end if;
  end loop;

  if cardinality(todo) = 0 then
    raise notice '20261103_14: all three fts columns already fold tashkeel — nothing rewritten';
    return;
  end if;

  -- 2a. Nothing but the cross-section matview (and each column's own index)
  --     may depend on an fts column that is about to be dropped.
  select string_agg(distinct pg_describe_object(dep.classid, dep.objid, dep.objsubid), '; ')
    into bad
    from pg_depend dep
    join pg_attribute a on a.attrelid = dep.refobjid and a.attnum = dep.refobjsubid
   where dep.refclassid = 'pg_class'::regclass
     and dep.refobjid = any (array(select to_regclass(tables[k]) from unnest(todo) as k))
     and a.attname = 'fts'
     and dep.deptype = 'n'
     and not (dep.classid = 'pg_rewrite'::regclass
              and exists (select 1 from pg_rewrite r
                           where r.oid = dep.objid
                             and r.ev_class = to_regclass('library.cross_section_search')));
  if bad is not null then
    raise exception '20261103_14: unexpected dependents on the fts columns: % — nothing changed', bad;
  end if;

  -- 2b. The matview selects all three fts columns.
  svc_select := to_regclass('library.cross_section_search') is not null
    and has_table_privilege('service_role', 'library.cross_section_search', 'SELECT');
  -- Its owner too: library.refresh_cross_section_search() is SECURITY DEFINER
  -- and REFRESH needs the owner, so the recreated matview keeps the old one
  -- whoever runs this file (SQL editor as postgres, or psql as supabase_admin).
  select pg_get_userbyid(c.relowner), c.relacl into mv_owner, mv_acl
    from pg_class c where c.oid = to_regclass('library.cross_section_search');
  drop materialized view if exists library.cross_section_search;

  -- 2c. Rebuild each column that is not folded yet.
  foreach i in array todo loop
    t := tables[i];
    select nullif(a.attstattarget, -1) into target
      from pg_attribute a
     where a.attrelid = to_regclass(t) and a.attname = 'fts' and not a.attisdropped;
    execute format('drop index if exists library.%I', indexes[i]);
    execute format('alter table %s drop column fts', t);
    execute format(
      $f$alter table %s add column fts tsvector generated always as (to_tsvector('library.arabic', library.fold_tashkeel(%s))) stored$f$,
      t, exprs[i]);
    execute format('create index if not exists %I on %s using gin (fts)', indexes[i], t);
    if target is not null and target >= 0 then
      execute format('alter table %s alter column fts set statistics %s', t, target);
    end if;
    raise notice '20261103_14: %.fts rebuilt with fold_tashkeel (statistics target %)', t, coalesce(target::text, 'default');
  end loop;

  comment on column library.principles.fts is
    'Full-text search vector — text + ruling_basis + facts + reasons + ruling + principle_number + decision_number + reference, tashkeel folded (library.fold_tashkeel, 20261103_14). Server-only (20261016_01).';

  -- 2d. The matview, as 20260729_article_history_columns.sql §3 created it.
  execute $mv$
create materialized view if not exists library.cross_section_search as
select
  'article'::text       as entity_type,
  a.id::text            as entity_id,
  l.title               as parent_title,
  coalesce(a.title, 'مادة ' || a.number) as title,
  left(coalesce(nullif(a.text, ''), a.original_text, ''), 500) as snippet,
  a.fts                 as fts,
  a.created_at          as created_at
from library.articles a
join library.laws l on l.slug = a.law_slug

union all

select
  'principle'::text     as entity_type,
  p.id::text            as entity_id,
  jc.title              as parent_title,
  'مبدأ رقم ' || coalesce(p.principle_number, '') as title,
  left(p.text, 500)     as snippet,
  p.fts                 as fts,
  p.created_at          as created_at
from library.principles p
join library.judicial_collections jc on jc.id = p.collection_id

union all

select
  'decree'::text        as entity_type,
  dc.id::text           as entity_id,
  null                  as parent_title,
  dc.title              as title,
  left(dc.summary, 500) as snippet,
  dc.fts                as fts,
  dc.created_at         as created_at
from library.decrees_circulars dc

union all

select
  'feqh_block'::text    as entity_type,
  fb.id::text           as entity_id,
  bk.title              as parent_title,
  fb.topic              as title,
  left(fb.matn, 500)    as snippet,
  fb.fts                as fts,
  fb.created_at         as created_at
from library.feqh_blocks fb
join library.feqh_sections fs on fs.id = fb.section_id
join library.feqh_chapters fc on fc.id = fs.chapter_id
join library.feqh_books bk   on bk.id = fc.book_id
with no data
$mv$;

  create unique index if not exists idx_cross_section_search_pk
    on library.cross_section_search (entity_type, entity_id);
  create index if not exists idx_cross_section_search_fts
    on library.cross_section_search using gin (fts);
  comment on materialized view library.cross_section_search
    is 'Unified search index across articles, principles, decrees, and fiqh blocks. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY library.cross_section_search;';

  if mv_owner is not null and mv_owner <> current_user then
    execute format('alter materialized view library.cross_section_search owner to %I', mv_owner);
  end if;
  revoke all on library.cross_section_search from anon, authenticated, public;
  -- The old grants, except the owner's own and anything for anon,
  -- authenticated or PUBLIC (the matview stays off the API).
  for g in
    select distinct pg_get_userbyid(a.grantee) as grantee, a.privilege_type
      from aclexplode(coalesce(mv_acl, '{}'::aclitem[])) a
     where a.grantee <> 0
       and a.grantee <> (select c.relowner from pg_class c where c.oid = 'library.cross_section_search'::regclass)
       and pg_get_userbyid(a.grantee) not in ('anon', 'authenticated')
  loop
    execute format('grant %s on library.cross_section_search to %I', g.privilege_type, g.grantee);
  end loop;
  if svc_select and not has_table_privilege('service_role', 'library.cross_section_search', 'SELECT') then
    grant select on library.cross_section_search to service_role;
  end if;
end $mig$;

commit;

-- ── 3. Fresh word statistics for the rewritten columns ───────────────────────
-- Outside the rewrite transaction: ANALYZE takes SHARE UPDATE EXCLUSIVE only.
analyze library.articles (fts);
analyze library.principles (fts);
analyze library.feqh_blocks (fts);

notify pgrst, 'reload schema';

-- ── 4. Result ────────────────────────────────────────────────────────────────
select
  (select count(*) = 3
     from pg_attribute a
     join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid in (to_regclass('library.articles'), to_regclass('library.principles'), to_regclass('library.feqh_blocks'))
      and a.attname = 'fts' and not a.attisdropped
      and position('fold_tashkeel' in pg_get_expr(d.adbin, d.adrelid)) > 0)
  and to_regclass('library.cross_section_search') is not null
  and not has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
  and not has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT')
  and has_function_privilege('service_role', 'library.fold_tashkeel(text)', 'EXECUTE')
  and has_function_privilege((select pg_get_userbyid(relowner) from pg_class where oid = 'library.articles'::regclass),
                             'library.fold_tashkeel(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'library.fold_tashkeel(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'library.fold_tashkeel(text)', 'EXECUTE')
  as ok;
