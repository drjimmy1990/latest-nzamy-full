-- l16_review_platform_settings.test.sql — proves 20261206_95 (l16 review item 1):
-- platform_settings is read-only for every session; an admin session reads it
-- but cannot insert, update or delete; the service role (the admin routes) writes.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 95 runs TWICE.
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260627_platform_settings.sql \
--     $R/prelude_platform_settings_admin_all.sql \
--     $M/20261206_95_l16_review_fixes.sql \
--     $M/20261206_95_l16_review_fixes.sql \
--     $R/l16_review_platform_settings.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261206_95 lines →
--   "T1 FAIL: a policy on platform_settings still admits a write"; with T1
--   removed → "T2 FAIL: an admin session updated platform_settings (1 rows)".
-- Every assertion RAISES on failure. Sessions run as app_user (∈ authenticated).
\set ON_ERROR_STOP 1

-- stubs.sql hands app_user every table directly; on the live database a
-- session holds only what `authenticated` holds. Take the direct grant away.
revoke all on public.platform_settings from app_user;

insert into auth.users (id) values
  ('ad000000-0000-0000-0000-0000000000ad'), ('c0000000-0000-0000-0000-00000000000c');
insert into public.profiles (id, user_type) values
  ('ad000000-0000-0000-0000-0000000000ad', 'admin'),
  ('c0000000-0000-0000-0000-00000000000c', 'individual');

-- ── T1 the catalogue ────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_policy where polrelid = 'public.platform_settings'::regclass and polcmd <> 'r') then
    raise exception 'T1 FAIL: a policy on platform_settings still admits a write';
  end if;
  if has_table_privilege('authenticated', 'public.platform_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.platform_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.platform_settings', 'DELETE')
     or has_table_privilege('anon', 'public.platform_settings', 'UPDATE') then
    raise exception 'T1 FAIL: a session role still holds a write privilege on platform_settings';
  end if;
  if not has_table_privilege('authenticated', 'public.platform_settings', 'SELECT') then
    raise exception 'T1 FAIL: authenticated lost SELECT';
  end if;
  raise notice 'T1 PASS: no write policy, no write privilege for anon / authenticated';
end $$;

set role app_user;

-- ── T2 an admin session reads, but writes nothing ───────────────────────────
select set_config('test.uid', 'ad000000-0000-0000-0000-0000000000ad', false);
do $$
declare n int;
begin
  select count(*) into n from public.platform_settings;
  if n < 1 then raise exception 'T2 FAIL: the admin session reads no setting'; end if;
  begin
    update public.platform_settings set value = '{"status":"live"}' where key = 'tier_limits';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'T2 FAIL: an admin session updated platform_settings (% rows)', n; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.platform_settings (key, value) values ('payments_gateway', '{"status":"live"}');
    raise exception 'T2 FAIL: an admin session inserted a setting';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.platform_settings where key = 'tier_limits';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'T2 FAIL: an admin session deleted a setting'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: an admin session reads every setting and inserts / updates / deletes none';
end $$;

-- ── T3 a client session reads (public read policy), writes nothing ──────────
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.platform_settings;
  if n < 1 then raise exception 'T3 FAIL: the public read policy is gone'; end if;
  begin
    update public.platform_settings set value = '{}' where key = 'tier_limits';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'T3 FAIL: a client updated platform_settings'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a client reads, writes nothing';
end $$;
reset role;

-- ── T4 the service role (the admin routes) writes ───────────────────────────
set role service_role;
do $$
declare n int;
begin
  insert into public.platform_settings (key, value) values ('l16_review_probe', '{"x":1}');
  update public.platform_settings set value = '{"x":2}' where key = 'l16_review_probe';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T4 FAIL: the service role could not update (% rows)', n; end if;
  delete from public.platform_settings where key = 'l16_review_probe';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T4 FAIL: the service role could not delete'; end if;
  raise notice 'T4 PASS: the service role inserts, updates and deletes';
end $$;
reset role;

select 'l16_review_platform_settings: ALL PASS';
