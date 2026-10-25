-- smart_folders_grants.test.sql — proves 20261026_50 (L-A, the owner's «حفظ في
-- مجلداتي» fix of 2026-10-25, reworked) and its _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The _verify
-- block runs before the migration (must only NOTICE) and after the second run
-- (must pass); the migration runs TWICE with the owner's original grants put
-- back between the runs. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_smart_folders_grants_block.sql
--   sed -n '/^-- >>> verify:smart_folders_grants/,/^-- <<< verify:smart_folders_grants/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260626_legal_library_schema.sql \
--     $M/20260701_smart_folder_items_display_cols.sql \
--     $R/prelude_smart_folders_live.sql \
--     "$B" \
--     $M/20261026_50_smart_folders_grants.sql \
--     $R/prelude_smart_folders_between_runs.sql \
--     $M/20261026_50_smart_folders_grants.sql \
--     "$B" \
--     $R/smart_folders_grants.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-26):
--   NC1 — the chain without the two 20261026_50 files → "T1 FAIL: anon holds SELECT on library.smart_folders".
--   NC2 — the owner's original file in place of 20261026_50 (it grants
--     INSERT/UPDATE/DELETE to authenticated) → the second "$B" raises
--     "_verify: authenticated holds INSERT on library.smart_folders …".
-- People: …a1 owns folder …f00a1 (one law), …a2 owns folder …f00a2 (legacy
-- rows that break the new limits).
-- The file runs as the superuser; every role-scoped assertion does `set role`.
\set ON_ERROR_STOP on

-- T1: guests hold nothing, on either table, at table or column level.
do $$
declare t text; p text;
begin
  foreach t in array array['library.smart_folders', 'library.smart_folder_items'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', t, p) then raise exception 'T1 FAIL: anon holds % on %', p, t; end if;
    end loop;
    if has_any_column_privilege('anon', t, 'SELECT, INSERT, UPDATE, REFERENCES') then
      raise exception 'T1 FAIL: anon holds a column privilege on %', t;
    end if;
  end loop;
  raise notice 'T1 PASS: anon holds no privilege on either folder table';
end $$;

set role anon;
do $$
begin
  begin
    perform 1 from library.smart_folders limit 1;
    raise exception 'T1b FAIL: anon read library.smart_folders';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from library.smart_folder_items limit 1;
    raise exception 'T1b FAIL: anon read library.smart_folder_items';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T1b PASS: a guest read is refused with 42501';
end $$;
reset role;

-- T2: a signed-in user reads only his own rows and cannot write either table
-- (the owner's grants put back between the runs are gone).
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
set role authenticated;
do $$
declare n int;
begin
  select count(*) into n from library.smart_folders;
  if n <> 1 then raise exception 'T2 FAIL: …a1 sees % folders, not his 1', n; end if;
  select count(*) into n from library.smart_folder_items;
  if n <> 1 then raise exception 'T2 FAIL: …a1 sees % items, not his 1', n; end if;

  begin
    insert into library.smart_folders (user_id, name) values ('00000000-0000-0000-0000-0000000000a1', 'x');
    raise exception 'T2 FAIL: authenticated inserted a folder directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update library.smart_folders set name = repeat('x', 5000) where id = '00000000-0000-0000-0000-0000000f00a1';
    raise exception 'T2 FAIL: authenticated updated a folder directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from library.smart_folders where id = '00000000-0000-0000-0000-0000000f00a1';
    raise exception 'T2 FAIL: authenticated deleted a folder directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into library.smart_folder_items (folder_id, entity_type, entity_id)
    values ('00000000-0000-0000-0000-0000000f00a1', 'law', 'y');
    raise exception 'T2 FAIL: authenticated inserted an item directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update library.smart_folder_items set title = 'z' where id = '00000000-0000-0000-0000-00000001e0a1';
    raise exception 'T2 FAIL: authenticated updated an item directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from library.smart_folder_items where id = '00000000-0000-0000-0000-00000001e0a1';
    raise exception 'T2 FAIL: authenticated deleted an item directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: a signed-in user reads his own folder and item only; every direct write is refused with 42501';
end $$;
reset role;

-- T3: the routes' writer (service_role) creates, renames, pins, upserts and deletes.
set role service_role;
do $$
declare fid uuid; iid uuid;
begin
  insert into library.smart_folders (user_id, name, color, icon)
  values ('00000000-0000-0000-0000-0000000000a1', 'جديد', '#C8A762', '📁') returning id into fid;
  update library.smart_folders set name = 'جديد ٢', is_pinned = true where id = fid;
  insert into library.smart_folder_items (folder_id, entity_type, entity_id, title)
  values (fid, 'book', 'الروض المربع', 'الروض المربع') returning id into iid;
  insert into library.smart_folder_items (folder_id, entity_type, entity_id, title)
  values (fid, 'book', 'الروض المربع', 'الروض المربع - ط٢')
  on conflict (folder_id, entity_type, entity_id) do update set title = excluded.title;
  if (select title from library.smart_folder_items where id = iid) <> 'الروض المربع - ط٢' then
    raise exception 'T3 FAIL: the upsert did not update the saved item';
  end if;
  delete from library.smart_folder_items where id = iid;
  delete from library.smart_folders where id = fid;
  raise notice 'T3 PASS: service_role creates, renames, pins, upserts and deletes';
end $$;
reset role;

-- T4: the limits fire on new rows (as service_role, i.e. even past the route).
set role service_role;
do $$
declare
  bad text;
  stmts text[] := array[
    $q$insert into library.smart_folders (user_id, name) values ('00000000-0000-0000-0000-0000000000a1', '')$q$,
    $q$insert into library.smart_folders (user_id, name) values ('00000000-0000-0000-0000-0000000000a1', repeat('ن', 81))$q$,
    $q$insert into library.smart_folders (user_id, name, color) values ('00000000-0000-0000-0000-0000000000a1', 'x', 'red')$q$,
    $q$insert into library.smart_folders (user_id, name, color) values ('00000000-0000-0000-0000-0000000000a1', 'x', '#fff')$q$,
    $q$insert into library.smart_folders (user_id, name, icon) values ('00000000-0000-0000-0000-0000000000a1', 'x', repeat('x', 9))$q$,
    $q$insert into library.smart_folder_items (folder_id, entity_type, entity_id) values ('00000000-0000-0000-0000-0000000f00a1', 'article', 'x')$q$,
    $q$insert into library.smart_folder_items (folder_id, entity_type, entity_id) values ('00000000-0000-0000-0000-0000000f00a1', 'law', '')$q$,
    $q$insert into library.smart_folder_items (folder_id, entity_type, entity_id) values ('00000000-0000-0000-0000-0000000f00a1', 'law', repeat('x', 201))$q$,
    $q$insert into library.smart_folder_items (folder_id, entity_type, entity_id, title) values ('00000000-0000-0000-0000-0000000f00a1', 'law', 'x', repeat('ن', 301))$q$,
    $q$insert into library.smart_folder_items (folder_id, entity_type, entity_id, title_en) values ('00000000-0000-0000-0000-0000000f00a1', 'law', 'x', repeat('n', 301))$q$
  ];
begin
  foreach bad in array stmts loop
    begin
      execute bad;
      raise exception 'T4 FAIL: accepted: %', bad;
    exception when check_violation then null;
    end;
  end loop;
  -- The limits' edges are allowed.
  insert into library.smart_folders (id, user_id, name, color, icon)
  values ('00000000-0000-0000-0000-0000000f00e1', '00000000-0000-0000-0000-0000000000a1', repeat('ن', 80), '#AbCdEf', '📁📁📁📁📁📁📁📁');
  insert into library.smart_folder_items (folder_id, entity_type, entity_id, title, title_en)
  values ('00000000-0000-0000-0000-0000000f00e1', 'precedent', repeat('x', 200), repeat('ن', 300), repeat('n', 300));
  delete from library.smart_folders where id = '00000000-0000-0000-0000-0000000f00e1';
  raise notice 'T4 PASS: empty / 81-char names, non-hex colours, 9-char icons, unknown entity types and over-long ids and titles are refused; the edges pass';
end $$;
reset role;

-- T5: NOT VALID keeps the legacy rows, and still guards their updates.
do $$
declare n int;
begin
  select count(*) into n from library.smart_folders where char_length(name) = 90 and color = 'red';
  if n <> 1 then raise exception 'T5 FAIL: the legacy folder is gone (% rows)', n; end if;
  select count(*) into n from library.smart_folder_items where entity_type = 'article';
  if n <> 1 then raise exception 'T5 FAIL: the legacy item is gone (% rows)', n; end if;
  select count(*) into n from pg_constraint
   where conrelid in ('library.smart_folders'::regclass, 'library.smart_folder_items'::regclass)
     and contype = 'c' and conname like 'smart\_folder%' and not convalidated;
  if n <> 7 then raise exception 'T5 FAIL: % of 7 limits are NOT VALID', n; end if;
  begin
    update library.smart_folders set is_pinned = true where id = '00000000-0000-0000-0000-0000000f00a2';
    raise exception 'T5 FAIL: a legacy row that breaks a limit was updated';
  exception when check_violation then null;
  end;
  raise notice 'T5 PASS: legacy rows stay (7 limits NOT VALID); updating one that breaks a limit is refused until it is fixed';
end $$;

-- T6: the UPDATE policy is owner-only and there is exactly one of it.
do $$
declare n int;
begin
  select count(*) into n from pg_policy
   where polrelid = 'library.smart_folder_items'::regclass and polname = 'Users can update own folder items'
     and polcmd = 'w' and pg_get_expr(polqual, polrelid) ~ 'auth\.uid\(\)'
     and pg_get_expr(polwithcheck, polrelid) ~ 'auth\.uid\(\)';
  if n <> 1 then raise exception 'T6 FAIL: % owner-only UPDATE policies on smart_folder_items', n; end if;
  if not (select relrowsecurity from pg_class where oid = 'library.smart_folders'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'library.smart_folder_items'::regclass) then
    raise exception 'T6 FAIL: RLS is off';
  end if;
  raise notice 'T6 PASS: RLS on both tables; one owner-only UPDATE policy on items';
end $$;
