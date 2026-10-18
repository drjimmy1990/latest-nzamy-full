-- library_access_grants.test.sql — proves 20261019_10 (owner answers ١٩٩ / ٢٠١–٢٠٣:
-- the library subscription is its own grant, separate from the tiers).
-- Chain (run.sh, postgres:16; stubs.sql — auth.users, auth.uid() via test.uid,
-- the anon / authenticated / service_role / app_user roles — loads first by itself):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20261019_10_library_access_grants.sql $M/20261019_10_library_access_grants.sql \
--     $R/library_access_grants.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261019_10 files →
--   bash $R/run.sh $R/prelude_extensions_schema.sql $R/library_access_grants.test.sql
--   → "T1 FAIL: public.library_access_grants does not exist".
--   prelude_extensions_schema.sql is only a filler (it creates an empty schema):
--   run.sh needs at least one file before the test.
--
-- WHY app_user's DIRECT grants are revoked below: stubs.sql gives app_user
-- `grant all` (and default privileges on every new public table), but on the
-- live database a signed-in PostgREST request holds privileges only through the
-- `authenticated` role. Removing the direct grant makes app_user's privilege set
-- the live one, so the REVOKE half of the migration is what T2 actually tests
-- (with the direct grant, UPDATE / DELETE would touch 0 rows without an error).
--
-- Actors: U 00000000-0000-0000-0000-00000000b001 (two grants),
--         V 00000000-0000-0000-0000-00000000b002 (one grant, given by admin A).
-- Every assertion RAISES on failure.

-- T1 precondition: the table exists (the negative control stops here)
do $$
begin
  if to_regclass('public.library_access_grants') is null then
    raise exception 'T1 FAIL: public.library_access_grants does not exist (20261019_10 not applied)';
  end if;
end $$;

-- ── fixtures as postgres (RLS bypassed on purpose) ─────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000b001'),
  ('00000000-0000-0000-0000-00000000b002');
insert into public.library_access_grants (user_id, plan_ref, source, ends_at, granted_by) values
  ('00000000-0000-0000-0000-00000000b001', 'lib-q1',     'request',     now() + interval '90 days',  null),
  ('00000000-0000-0000-0000-00000000b001', 'lib-invite', 'invite_code', now() + interval '30 days',  null),
  ('00000000-0000-0000-0000-00000000b002', 'lib-annual', 'admin',       now() + interval '365 days', '00000000-0000-0000-0000-00000000a0a0');

revoke all on public.library_access_grants from app_user;

-- T1 a signed-in user reads only their own grants
set role app_user;
do $$
declare
  n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000b001', true);
  select count(*) into n from public.library_access_grants;
  if n <> 2 then
    raise exception 'T1 FAIL: U sees % grant row(s), expected its own 2', n;
  end if;
  if exists (select 1 from public.library_access_grants where user_id <> auth.uid()) then
    raise exception 'T1 FAIL: U sees another user''s grant';
  end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-00000000b002', true);
  select count(*) into n from public.library_access_grants;
  if n <> 1 or (select plan_ref from public.library_access_grants) <> 'lib-annual' then
    raise exception 'T1 FAIL: V sees % grant row(s), expected its own 1 (lib-annual)', n;
  end if;

  perform set_config('test.uid', '', true);
  select count(*) into n from public.library_access_grants;
  if n <> 0 then
    raise exception 'T1 FAIL: a session with no uid sees % grant row(s)', n;
  end if;
  raise notice 'T1 PASS: U reads its 2 grants, V its 1, a session with no uid none';
end $$;
reset role;

-- T2 a signed-in user cannot give, stretch or remove a grant (42501)
set role app_user;
do $$
declare
  stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000b001', true);
  foreach stmt in array array[
    $q$insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
         values ('00000000-0000-0000-0000-00000000b001', 'lib-annual', 'admin', now() + interval '10 years')$q$,
    $q$update public.library_access_grants set ends_at = now() + interval '10 years'
        where user_id = '00000000-0000-0000-0000-00000000b001'$q$,
    $q$delete from public.library_access_grants where user_id = '00000000-0000-0000-0000-00000000b001'$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T2 FAIL: allowed — %', left(stmt, 90);
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'T2 PASS: INSERT, UPDATE and DELETE of own grants by a session all raise 42501';
end $$;
reset role;

-- T3 a guest (anon) — and PUBLIC — hold no privilege at all
do $$
declare
  r   text;
  p   text;
  col text;
begin
  foreach r in array array['anon', 'public'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(r, 'public.library_access_grants', p) then
        raise exception 'T3 FAIL: % holds % on library_access_grants', r, p;
      end if;
    end loop;
    for col in select attname::text from pg_attribute
                where attrelid = 'public.library_access_grants'::regclass and attnum > 0 and not attisdropped loop
      if has_column_privilege(r, 'public.library_access_grants', col, 'SELECT, INSERT, UPDATE, REFERENCES') then
        raise exception 'T3 FAIL: % holds a column privilege on library_access_grants.%', r, col;
      end if;
    end loop;
  end loop;
end $$;
set role anon;
do $$
begin
  begin
    perform count(*) from public.library_access_grants;
    raise exception 'T3 FAIL: anon read library_access_grants';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
      values ('00000000-0000-0000-0000-00000000b001', 'lib-trial', 'request', now() + interval '1 day');
    raise exception 'T3 FAIL: anon inserted a grant';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: anon and PUBLIC hold no table or column privilege; an anon read and insert raise 42501';
end $$;
reset role;

-- T4 the server (service role) grants; the CHECKs hold the exact lists and the window
set role service_role;
do $$
declare
  ref  text;
  src  text;
  bad  text;
begin
  -- every allowed plan_ref, and every allowed source, is accepted
  foreach ref in array array['lib-q1', 'lib-q2', 'lib-annual', 'lib-invite', 'lib-trial', 'lib-founder', 'lib-admin'] loop
    insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
      values ('00000000-0000-0000-0000-00000000b002', ref, 'admin', now() + interval '1 day');
  end loop;
  foreach src in array array['request', 'invite_code', 'colleague_invite', 'founder_campaign', 'admin'] loop
    insert into public.library_access_grants (user_id, plan_ref, source, ends_at, granted_by)
      values ('00000000-0000-0000-0000-00000000b002', 'lib-admin', src, now() + interval '1 day',
              '00000000-0000-0000-0000-00000000a0a0');
  end loop;
  if (select count(*) from public.library_access_grants where user_id = '00000000-0000-0000-0000-00000000b002') <> 13 then
    raise exception 'T4 FAIL: service_role inserts did not all land (expected 1 + 7 + 5 = 13 rows for V)';
  end if;

  -- what the CHECKs must refuse
  foreach bad in array array[
    $q$insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
         values ('00000000-0000-0000-0000-00000000b002', 'lib-q1', 'admin', now())$q$,
    $q$insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at)
         values ('00000000-0000-0000-0000-00000000b002', 'lib-q1', 'admin', now(), now() - interval '1 day')$q$,
    $q$insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
         values ('00000000-0000-0000-0000-00000000b002', 'pro', 'admin', now() + interval '1 day')$q$,
    $q$insert into public.library_access_grants (user_id, plan_ref, source, ends_at)
         values ('00000000-0000-0000-0000-00000000b002', 'lib-q1', 'payment', now() + interval '1 day')$q$
  ] loop
    begin
      execute bad;
      raise exception 'T4 FAIL: accepted — %', left(bad, 140);
    exception when check_violation then null;
    end;
  end loop;
  raise notice 'T4 PASS: service_role inserts all 7 plan_refs and all 5 sources; ends_at = starts_at, ends_at < starts_at, plan_ref ''pro'' and source ''payment'' raise check_violation';
end $$;
reset role;

-- T5 two runs leave one table, one policy, one index; the user FK cascades
do $$
begin
  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'library_access_grants') <> 1 then
    raise exception 'T5 FAIL: expected exactly one public.library_access_grants';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.library_access_grants'::regclass) then
    raise exception 'T5 FAIL: RLS is off on library_access_grants';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'library_access_grants') <> 1
     or not exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'library_access_grants'
                       and policyname = 'own library grants' and cmd = 'SELECT'
                       and roles = array['authenticated']::name[]) then
    raise exception 'T5 FAIL: expected exactly one policy, "own library grants", FOR SELECT TO authenticated';
  end if;
  if (select count(*) from pg_index i
       where i.indrelid = 'public.library_access_grants'::regclass
         and not i.indisprimary
         and i.indkey::text = (select string_agg(attnum::text, ' ' order by k.ord)
                                 from unnest(array['user_id', 'ends_at']) with ordinality as k(name, ord)
                                 join pg_attribute a on a.attrelid = 'public.library_access_grants'::regclass
                                                    and a.attname = k.name)) <> 1 then
    raise exception 'T5 FAIL: expected exactly one (user_id, ends_at) index';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.library_access_grants'::regclass and contype = 'f'
                    and confrelid = 'auth.users'::regclass and confdeltype = 'c') then
    raise exception 'T5 FAIL: user_id is not a cascading FK to auth.users';
  end if;
  raise notice 'T5 PASS: after two runs — one table (RLS on), one SELECT policy to authenticated, one (user_id, ends_at) index, user_id cascades from auth.users';
end $$;
