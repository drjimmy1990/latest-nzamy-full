-- library_fts_tashkeel_fold.test.sql — proves 20261103_14 (S1-T13, BUG-LIB-03:
-- tashkeel folded in the fts of articles, principles and fiqh blocks) and its
-- _verify block (preflight R14: NOTICE while not applied, pass once applied).
-- Chain (run.sh, postgres:16) — the library chain of
-- library_search_scoped_page.test.sql (with 20261025_41), 20261017_21 (the
-- statistics targets _14 must keep), the _verify block (must only NOTICE),
-- the fixtures + privilege snapshot, 20261103_14 TWICE (idempotent), the
-- _verify block again (must pass), then this file. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_library_fts_tashkeel_fold.sql
--   sed -n '/^-- >>> verify:library_fts_tashkeel_fold/,/^-- <<< verify:library_fts_tashkeel_fold/p' $M/_verify.sql > "$B"
--   CHAIN="$M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260729_article_history_columns.sql $M/20260729_feqh_locator_labels.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261016_01_library_principles_text_lock.sql \
--     $M/20261018_02_library_feqh_decree_text_lock.sql $M/20261025_41_library_search_scoped_page.sql \
--     $M/20261017_21_library_fts_statistics.sql"
--   bash $R/run.sh $CHAIN "$B" $R/library_fts_tashkeel_fold.before.sql \
--     $M/20261103_14_library_fts_tashkeel_fold.sql $M/20261103_14_library_fts_tashkeel_fold.sql "$B" \
--     $R/library_fts_tashkeel_fold.test.sql
-- NEGATIVE CONTROLS
--   1. Without _14: bash $R/run.sh $CHAIN "$B" $R/library_fts_tashkeel_fold.before.sql $R/library_fts_tashkeel_fold.test.sql
--      → T0 passes (the dual-form query works on the unfolded index), T1 RAISES
--      (a voweled text is not found by the stripped word).
--   2. _14 without its service_role grant line (sed '/^grant execute on function library.fold_tashkeel/d')
--      → T5 RAISES with SQLSTATE 42501 (the loader could not write).
--   3. _14 without its `alter materialized view … owner to` block
--      → T7 RAISES (the recreated matview belongs to whoever ran the file, so
--      the SECURITY DEFINER library.refresh_cross_section_search() could not refresh it).
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

-- T0 — before or after _14: the tsquery the app sends for «القَرَار»
-- (pinned in src/utils/normalizeArabic.test.ts) finds the principle stored
-- without tashkeel, through the scoped-search function as well.
do $$
declare
  q constant text := $q$('القَرَار' | 'القرار' | 'والقرار' | 'بالقرار' | 'للقرار' | 'ألقرار' | 'إلقرار' | 'آلقرار')$q$;
  n int;
  res jsonb;
begin
  select count(*) into n from library.principles
   where id = 'tf-col__p2' and fts @@ pg_catalog.to_tsquery('simple', q);
  if n <> 1 then raise exception 'T0: the dual-form query missed the unvoweled principle'; end if;
  res := library.search_scoped_page('collection', array['tf-col'], q, 0, 10);
  if not exists (select 1 from jsonb_array_elements(res->'rows') r where r->>'id' = 'tf-col__p2') then
    raise exception 'T0: search_scoped_page with the dual-form query missed tf-col__p2: %', res;
  end if;
  raise notice 'T0 ok — the as-typed + stripped query works on the index as it stands';
end $$;

-- T1 — the voweled principle (inserted BEFORE _14) is found by the stripped word.
do $$
begin
  if not exists (select 1 from library.principles
                  where id = 'tf-col__p1' and fts @@ pg_catalog.to_tsquery('library.arabic', '''القرار''')) then
    raise exception 'T1: «القَرَارُ نافذ» is not found by ''القرار'' — fts keeps tashkeel (20261103_14 not applied)';
  end if;
  raise notice 'T1 ok — existing voweled principle folded';
end $$;

-- T2 — tatweel folds too; the article and the fiqh block written before _14
-- are found; the scoped search returns the voweled principle for 'القرار'.
do $$
declare res jsonb;
begin
  if not exists (select 1 from library.principles
                  where id = 'tf-col__p3' and fts @@ pg_catalog.to_tsquery('simple', '''القرار''')) then
    raise exception 'T2: «القـــرار» (tatweel) is not found by ''القرار''';
  end if;
  if not exists (select 1 from library.articles
                  where id = 'tf-law__a1' and fts @@ pg_catalog.to_tsquery('simple', '''القرار'' & ''نافذا'' & ''يعد''')) then
    raise exception 'T2: the voweled article is not found by its stripped words';
  end if;
  if not exists (select 1 from library.feqh_blocks
                  where id = 'tf-book__b1' and fts @@ pg_catalog.to_tsquery('simple', '''القرار'' & ''وينقض''')) then
    raise exception 'T2: the voweled fiqh block is not found by its stripped words';
  end if;
  res := library.search_scoped_page('collection', array['tf-col'], '''القرار''', 0, 10);
  if not exists (select 1 from jsonb_array_elements(res->'rows') r where r->>'id' = 'tf-col__p1') then
    raise exception 'T2: search_scoped_page(''القرار'') missed the voweled principle: %', res;
  end if;
  raise notice 'T2 ok — tatweel, articles, fiqh blocks and the scoped search';
end $$;

-- T3 — anon / authenticated hold no privilege on the principles fts column.
do $$
declare r text; p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_column_privilege(r, 'library.principles', 'fts', p) then
        raise exception 'T3: % holds % on library.principles.fts', r, p;
      end if;
    end loop;
  end loop;
  raise notice 'T3 ok — principles.fts stays server-only';
end $$;

-- T4 — every privilege and statistics target snapshotted before _14 is unchanged.
do $$
declare
  diff text;
begin
  with now_ as (
    select 'column' as kind, t || '.fts' as obj, r as role, p as priv, has_column_privilege(r, t, 'fts', p) as has
      from unnest(array['library.articles', 'library.principles', 'library.feqh_blocks']) as t,
           unnest(array['anon', 'authenticated', 'service_role']) as r,
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) as p
    union all
    select 'table', t, r, p, has_table_privilege(r, t, p)
      from unnest(array['library.articles', 'library.principles', 'library.feqh_blocks', 'library.cross_section_search']) as t,
           unnest(array['anon', 'authenticated', 'service_role']) as r,
           unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as p
    union all
    select 'stattarget', c.relname, '', coalesce(nullif(a.attstattarget, -1), -1)::text, true
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
     where a.attrelid in ('library.articles'::regclass, 'library.principles'::regclass, 'library.feqh_blocks'::regclass)
       and a.attname = 'fts' and not a.attisdropped
  ),
  d as (
    (select * from public.t7_before except select * from now_)
    union all
    (select * from now_ except select * from public.t7_before)
  )
  select string_agg(format('%s %s %s %s=%s', kind, obj, role, priv, has), '; ') into diff from d;
  if diff is not null then raise exception 'T4: privileges or statistics targets changed: %', diff; end if;
  if (select count(*) from public.t7_before where kind = 'stattarget' and priv = '1000') <> 3 then
    raise exception 'T4: the chain did not set statistics target 1000 (20261017_21 missing from the chain?)';
  end if;
  raise notice 'T4 ok — % privileges and 3 statistics targets (1000) unchanged', (select count(*) from public.t7_before where kind <> 'stattarget');
end $$;

-- T5 — the loader can still write: as service_role, one row each with tashkeel.
do $$
begin
  set local role service_role;
  insert into library.articles (id, law_slug, number, text, status, order_index)
    values ('tf-law__a2', 'tf-law', '2', 'لا يُنْفَذُ القَرَارُ قبل نشره', 'active', 2);
  insert into library.principles (id, collection_id, principle_number, issuing_body, text, order_index)
    values ('tf-col__p9', 'tf-col', '9', 'المحكمة الإدارية العليا', 'يُلْغَى القَرَارُ المعيب', 9);
  insert into library.feqh_blocks (id, section_id, book_id, topic, matn, order_index)
    values ('tf-book__b2', '00000000-0000-0000-0000-0000000007d1', 'tf-book', 'القضاء', 'فَإِنْ رُدَّ القَرَارُ', 2);
  update library.principles set text = 'يُلْغَى القَرَارُ المعيب بِحُكْمٍ' where id = 'tf-col__p9';
  reset role;
  if (select count(*) from library.articles where id = 'tf-law__a2' and fts @@ pg_catalog.to_tsquery('simple', '''القرار''')) <> 1
     or (select count(*) from library.principles where id = 'tf-col__p9' and fts @@ pg_catalog.to_tsquery('simple', '''القرار'' & ''بحكم''')) <> 1
     or (select count(*) from library.feqh_blocks where id = 'tf-book__b2' and fts @@ pg_catalog.to_tsquery('simple', '''القرار''')) <> 1 then
    raise exception 'T5: a row written by service_role after _14 is not folded';
  end if;
  raise notice 'T5 ok — service_role inserts and updates; the new rows are folded';
exception
  when insufficient_privilege then
    raise exception 'T5: service_role cannot write the library tables (SQLSTATE 42501 — %): the loader would fail', sqlerrm;
end $$;

-- T6 — EXECUTE on the fold function: service_role only.
do $$
begin
  if not has_function_privilege('service_role', 'library.fold_tashkeel(text)', 'EXECUTE') then
    raise exception 'T6: service_role cannot EXECUTE library.fold_tashkeel(text)';
  end if;
  if has_function_privilege('anon', 'library.fold_tashkeel(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'library.fold_tashkeel(text)', 'EXECUTE') then
    raise exception 'T6: anon or authenticated can EXECUTE library.fold_tashkeel(text)';
  end if;
  if library.fold_tashkeel('الرَّحْمٰنُ ـ') <> 'الرحمن ' then
    raise exception 'T6: fold_tashkeel(«الرَّحْمٰنُ ـ») = %', library.fold_tashkeel('الرَّحْمٰنُ ـ');
  end if;
  raise notice 'T6 ok — fold_tashkeel is service_role only and folds harakat, dagger alef and tatweel';
end $$;

-- T7 — the matview is back, empty (WITH NO DATA), off the API, and refreshable.
do $$
begin
  if to_regclass('library.cross_section_search') is null then raise exception 'T7: cross_section_search is missing'; end if;
  if has_table_privilege('anon', 'library.cross_section_search', 'SELECT')
     or has_table_privilege('authenticated', 'library.cross_section_search', 'SELECT') then
    raise exception 'T7: cross_section_search is readable by anon or authenticated';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'library' and tablename = 'cross_section_search') <> 2 then
    raise exception 'T7: cross_section_search lost an index';
  end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid = 'library.cross_section_search'::regclass) <> 't7_mv_owner' then
    raise exception 'T7: the recreated matview lost its owner (refresh_cross_section_search would fail)';
  end if;
  refresh materialized view library.cross_section_search;
  if not exists (select 1 from library.cross_section_search
                  where entity_id = 'tf-col__p1' and fts @@ pg_catalog.to_tsquery('simple', '''القرار''')) then
    raise exception 'T7: after a refresh the matview does not carry the folded fts';
  end if;
  raise notice 'T7 ok — matview recreated with its old owner, off the API, refresh carries the folded fts';
end $$;

-- T8 — two runs leave one fold_tashkeel function and one gin index per table.
do $$
begin
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'library' and p.proname = 'fold_tashkeel') <> 1 then
    raise exception 'T8: more than one library.fold_tashkeel';
  end if;
  if (select count(*) from pg_indexes where schemaname = 'library'
       and indexname in ('idx_articles_fts', 'idx_principles_fts', 'idx_feqh_blocks_fts')) <> 3 then
    raise exception 'T8: a gin fts index is missing';
  end if;
  raise notice 'T8 ok — idempotent';
end $$;

select true as ok;
