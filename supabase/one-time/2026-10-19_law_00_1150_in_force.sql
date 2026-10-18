-- ════════════════════════════════════════════════════════════════════════════
-- One-time data fix (NOT a migration) — owner answer ٢١٢ (answers of 2026-10-18).
-- Our question: «لائحة التفتيش القضائي ١٤٣٠هـ (جوابكم ١٧٠): النسخة الباقية هي
-- المعتمدة في سجلّكم (LAW-00-1150)، لكن سجلّكم ما زال يعلّم صفة سريانها
-- «تحتاج مراجعة». هل هي سارية؟» — his answer: «سارية».
-- Run by the user in the self-hosted SQL Editor (auth.nezamy.sa, as postgres).
-- Run block 1 alone first and read it; then block 2; then block 3.
--
-- WHAT: library.laws row `regulation-364-5-30-1430-11-02` (his LAW-00-1150,
--   «لائحة التفتيش القضائي» of 1430هـ, the one copy kept by his answer ١٧٠)
--   gets status 'active'. Nothing else: no other column, no other law, no
--   article, no user table.
-- SAFE TO RUN TWICE: the update skips a row that is already 'active', and the
--   check after it only asks that the row exists and is 'active'.
-- IT CHANGES NOTHING until you remove the two dashes before the `set local`
--   line in block 2. Without it, block 2 raises «NOT confirmed».
-- A RELOAD UNDOES IT: the owner's next library upload writes the status from
--   his file again. The owner report asks his library agent to write
--   `status: active` in that file's frontmatter, so the two agree.
-- ROLLBACK: block 4 (put back the status block 1 showed).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) PREVIEW — read-only. Expect one row (status not yet 'active' before the
--    first run; 'active' after it).
select slug, title, type, status, updated_at
  from library.laws
 where slug = 'regulation-364-5-30-1430-11-02';

-- 2) UPDATE — one transaction. Remove the two dashes before `set local`, then
--    run block 2 alone. It aborts, changing nothing, if the law is missing.
begin;

-- set local nzamy.confirm_law_1150 = 'LAW-00-1150';

do $$
declare
  changed integer;
  active  integer;
begin
  if coalesce(current_setting('nzamy.confirm_law_1150', true), '') <> 'LAW-00-1150' then
    raise exception 'LAW-00-1150 (owner ٢١٢): NOT confirmed — nothing changed. Remove the two dashes before "set local nzamy.confirm_law_1150" in block 2, then run block 2 alone.';
  end if;
  if not exists (select 1 from library.laws where slug = 'regulation-364-5-30-1430-11-02') then
    raise exception 'LAW-00-1150 (owner ٢١٢): regulation-364-5-30-1430-11-02 is not in library.laws — nothing changed. Check the slug against block 1, and the last library load.';
  end if;

  update library.laws
     set status = 'active'
   where slug = 'regulation-364-5-30-1430-11-02'
     and status <> 'active';
  get diagnostics changed = row_count;

  -- The result, not the row count: a second run changes 0 rows and passes.
  select count(*) into active
    from library.laws
   where slug = 'regulation-364-5-30-1430-11-02'
     and status = 'active';
  if active <> 1 then
    raise exception 'LAW-00-1150 (owner ٢١٢): expected 1 row in force, found % — rolling back', active;
  end if;
  raise notice 'LAW-00-1150 (owner ٢١٢): % row(s) set to active now; the law is in force', changed;
end $$;

commit;

-- 3) VERIFY — read-only. Expect one row: regulation-364-5-30-1430-11-02 | active
select slug, status
  from library.laws
 where slug = 'regulation-364-5-30-1430-11-02';

-- 4) ROLLBACK — only if asked. Put back the status block 1 showed
--    (e.g. 'status_undeclared'), then run it alone.
-- update library.laws set status = '<status from block 1>'
--  where slug = 'regulation-364-5-30-1430-11-02';
