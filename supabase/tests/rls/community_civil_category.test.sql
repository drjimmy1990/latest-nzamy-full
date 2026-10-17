-- community_civil_category.test.sql — proves 20261018_03 (owner answer ١٩٠).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_community_live_schema.sql $R/prelude_community_other_rows.sql \
--     $M/20261018_03_community_civil_category.sql $M/20261018_03_community_civil_category.sql \
--     $R/community_civil_category.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261018_03 files → T1 fails
-- (the CHECK rejects civil).
-- Every assertion RAISES on failure.

-- T1 a question can be stored under civil; the old values still pass
do $$
declare
  author uuid := (select id from public.profiles limit 1);
begin
  begin
    insert into public.community_posts (author_id, title, body, category)
      values (author, 'سؤال مدني', 'نص السؤال', 'civil');
  exception when check_violation then
    raise exception 'T1 FAIL: the CHECK rejects civil';
  end;
  insert into public.community_posts (author_id, title, body, category)
    values (author, 'سؤال عمالي', 'نص', 'labor'), (author, 'أخرى', 'نص', 'other');
  begin
    insert into public.community_posts (author_id, title, body, category)
      values (author, 'تصنيف غير معروف', 'نص', 'astrology');
    raise exception 'T1 FAIL: an unknown category was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T1 PASS: civil, labor and other accepted; an unknown category rejected';
end $$;

-- T2 the questions stored as other before the migration moved to civil
do $$
begin
  if (select count(*) from public.community_posts where title like 'سابق%' and category = 'civil') <> 2
     or exists (select 1 from public.community_posts where title like 'سابق%' and category = 'other') then
    raise exception 'T2 FAIL: the pre-migration other rows did not all move to civil';
  end if;
  if (select count(*) from pg_constraint where conrelid = 'public.community_posts'::regclass and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%category%') <> 1 then
    raise exception 'T2 FAIL: expected exactly one category CHECK after two runs';
  end if;
  raise notice 'T2 PASS: the 2 earlier «مدني» questions are civil; one category CHECK after two runs';
end $$;
