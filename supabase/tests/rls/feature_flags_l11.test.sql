-- feature_flags_l11.test.sql — proves 20261201_60 (batch l11-misc, O22: the
-- server-side feature flags row) and its _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The _verify
-- block runs BEFORE the migration (it must answer false, not fail), the
-- migration runs TWICE with an admin's edit between the runs, and the block
-- runs again after. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l11_misc_block.sql
--   sed -n '/^-- >>> verify:l11_misc/,/^-- <<< verify:l11_misc/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260627_platform_settings.sql \
--     "$B" \
--     $M/20261201_60_feature_flags.sql \
--     $R/prelude_feature_flags_l11_between_runs.sql \
--     $M/20261201_60_feature_flags.sql \
--     "$B" \
--     $R/feature_flags_l11.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261201_60
-- files and the between-runs prelude → "T0 FAIL".
--
-- (20261016_09 does not load alone on the stubs (it needs provider_profiles),
-- so the chain uses the 20260627 policies: the same read-anyone / admin-write shape.)

-- T0 the row exists
do $$ begin
  if not exists (select 1 from public.platform_settings where key = 'feature_flags') then
    raise exception 'T0 FAIL: feature_flags missing (20261201_60 not applied)';
  end if;
end $$;

-- T1 the admin's value survives the re-run (insert only)
do $$ begin
  if (select value from public.platform_settings where key = 'feature_flags') is distinct from '{"site_assistant": false}'::jsonb then
    raise exception 'T1 FAIL: the re-run overwrote the admin''s switch: %',
      (select value from public.platform_settings where key = 'feature_flags');
  end if;
  if (select description from public.platform_settings where key = 'feature_flags') not like '%20261201_60%' then
    raise exception 'T1 FAIL: the description does not name the migration';
  end if;
  raise notice 'feature_flags_l11: T0-T1 PASS';
end $$;

-- T2 no access change: a signed-in non-admin reads the row but cannot change it
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000f1') on conflict do nothing;
insert into public.profiles (id, user_type) values ('00000000-0000-0000-0000-0000000000f1', 'lawyer') on conflict do nothing;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000f1', false);
set role authenticated;
do $$ declare n int; begin
  if not exists (select 1 from public.platform_settings where key = 'feature_flags') then
    raise exception 'T2 FAIL: a signed-in user can no longer read the flags row';
  end if;
  update public.platform_settings set value = '{"site_assistant": true}'::jsonb where key = 'feature_flags';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T2 FAIL: a non-admin changed feature_flags'; end if;
end $$;
reset role;
select set_config('test.uid', '', false);
do $$ begin
  if (select value from public.platform_settings where key = 'feature_flags') is distinct from '{"site_assistant": false}'::jsonb then
    raise exception 'T2 FAIL: the value changed under a non-admin';
  end if;
  raise notice 'feature_flags_l11: T2 PASS';
end $$;

-- T3 the _verify check answers true on a good row and false on a bad one
do $$ declare ok boolean; begin
  select coalesce((select jsonb_typeof(value) = 'object'
                          and (not (value ? 'site_assistant') or jsonb_typeof(value -> 'site_assistant') = 'boolean')
                     from public.platform_settings where key = 'feature_flags'), false) into ok;
  if not ok then raise exception 'T3 FAIL: the verify check answers false on a good row'; end if;
  update public.platform_settings set value = '{"site_assistant": "yes"}'::jsonb where key = 'feature_flags';
  select coalesce((select jsonb_typeof(value) = 'object'
                          and (not (value ? 'site_assistant') or jsonb_typeof(value -> 'site_assistant') = 'boolean')
                     from public.platform_settings where key = 'feature_flags'), false) into ok;
  if ok then raise exception 'T3 FAIL: the verify check accepts a non-boolean switch'; end if;
  raise notice 'feature_flags_l11: T3 PASS';
end $$;

select 'feature_flags_l11: ALL PASS' as result;
