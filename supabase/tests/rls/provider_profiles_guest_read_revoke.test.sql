-- provider_profiles_guest_read_revoke.test.sql — proves 20261016_11 (N2
-- follow-up) on the live shape (prelude_provider_profiles_live.sql). The
-- migration runs TWICE (idempotent). Run from the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $T/prelude_provider_profiles_live.sql \
--     $M/20261016_11_provider_profiles_guest_read_revoke.sql \
--     $M/20261016_11_provider_profiles_guest_read_revoke.sql \
--     $T/provider_profiles_guest_read_revoke.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-16):
--   NC1 — without the migration (live today):
--     bash $T/run.sh $T/prelude_provider_profiles_live.sql $T/provider_profiles_guest_read_revoke.test.sql
--     → "T1 FAIL: a guest read user_id, verification_status of 1 provider row(s)".
--   NC2 — the half fix: anon revoked, "public read verified providers" kept:
--     bash $T/run.sh $T/prelude_provider_profiles_live.sql $T/prelude_provider_profiles_anon_only.sql \
--       $T/provider_profiles_guest_read_revoke.test.sql
--     → T1 passes, then "T2 FAIL: a signed-in client read licence NOT-1448-001 and metadata … of a
--       listed provider" — the policy has no TO clause, so dropping it is what closes the leak.
--   NC3 — a policy on another table, and a view, that read provider_profiles:
--     bash $T/run.sh $T/prelude_provider_profiles_live.sql $T/prelude_provider_profiles_stray.sql \
--       $M/20261016_11_provider_profiles_guest_read_revoke.sql $T/provider_profiles_guest_read_revoke.test.sql
--     → the migration's guard raises "… read public.provider_profiles inline … policy
--       stray_provider_gate on service_requests" and changes nothing.
-- The file runs as the superuser; every role-scoped assertion does `set local role`
-- (never app_user: stubs.sql's default privileges give it its own GRANT ALL).
\set ON_ERROR_STOP on

-- T1: a guest — the live probe of 2026-10-16 and every column refuse (42501).
do $$
declare n int;
begin
  perform set_config('test.uid', '', true);
  execute 'set local role anon';
  begin
    select count(*) into n from (select user_id, verification_status from public.provider_profiles) s;
    raise exception 'T1 FAIL: a guest read user_id, verification_status of % provider row(s)', n;
  exception when insufficient_privilege then null;
  end;
  begin
    perform license_number, hourly_rate, metadata from public.provider_profiles;
    raise exception 'T1 FAIL: a guest read license_number / hourly_rate / metadata';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.provider_profiles;
    raise exception 'T1 FAIL: a guest ran select * on provider_profiles';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'T1 PASS: a guest reads nothing from provider_profiles (42501), including the user_id/verification_status probe';
end $$;

-- T2: a signed-in client who is not a provider — sees no provider row.
do $$
declare
  n   int;
  rec record;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  execute 'set local role authenticated';
  select license_number, metadata into rec from public.provider_profiles
   where user_id = '00000000-0000-0000-0000-0000000000d1';
  if found then
    raise exception 'T2 FAIL: a signed-in client read licence % and metadata % of a listed provider', rec.license_number, rec.metadata;
  end if;
  select count(*) into n from public.provider_profiles;
  if n <> 0 then raise exception 'T2 FAIL: a signed-in client sees % provider row(s), expected 0', n; end if;
  reset role;
  raise notice 'T2 PASS: a signed-in client sees no provider row';
end $$;

-- T3: the provider's own session — the GET and PATCH /api/v1/profile shapes.
do $$
declare
  n   int;
  rec record;
  m   jsonb;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000d1', true);
  execute 'set local role authenticated';

  -- GET: select("*") where user_id = me
  select * into rec from public.provider_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
  if not found or rec.license_number <> 'NOT-1448-001' or rec.metadata #>> '{settings,office_hours}' <> '٨–٤' then
    raise exception 'T3 FAIL: the provider''s own select * returned % — expected the own row with licence and settings', rec;
  end if;
  select count(*) into n from public.provider_profiles;
  if n <> 1 then raise exception 'T3 FAIL: the provider sees % provider rows, expected 1 (the own)', n; end if;

  -- PATCH entitySettings: select("metadata"), then update({ metadata }).select("metadata")
  select metadata into m from public.provider_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
  update public.provider_profiles
     set metadata = jsonb_set(m, '{settings,bio}', '"نبذة الموثّق"')
   where user_id = '00000000-0000-0000-0000-0000000000d1'
  returning metadata into m;
  if m #>> '{settings,bio}' is distinct from 'نبذة الموثّق' or m #>> '{settings,office_hours}' is distinct from '٨–٤' then
    raise exception 'T3 FAIL: the settings save returned % — expected the merged bag', m;
  end if;

  -- not another provider's row
  update public.provider_profiles set metadata = '{}'::jsonb where user_id = '00000000-0000-0000-0000-0000000000d2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T3 FAIL: the provider wrote another provider''s metadata (% rows)', n; end if;

  -- still no self-verification, no sub_role change, no licence edit (20260922_03)
  begin
    update public.provider_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T3 FAIL: a provider self-verified';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.provider_profiles set sub_role = 'arbitrator' where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T3 FAIL: a provider changed the own sub_role';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.provider_profiles set license_number = 'X' where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T3 FAIL: a provider edited the own licence number';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.provider_profiles (user_id, sub_role) values ('00000000-0000-0000-0000-0000000000c1', 'notary');
    raise exception 'T3 FAIL: a signed-in user inserted a provider row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.provider_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
    raise exception 'T3 FAIL: authenticated still holds DELETE on provider_profiles';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'T3 PASS: the provider reads the own row (select *), saves settings (RETURNING metadata), cannot touch another row; self-verify, sub_role, licence, INSERT and DELETE refused';
end $$;

-- T4: an admin's session (the admin policy) reads every provider.
do $$
declare
  n   int;
  lic text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  execute 'set local role authenticated';
  select count(*) into n from public.provider_profiles;
  if n <> 2 then raise exception 'T4 FAIL: the admin sees % provider rows, expected 2', n; end if;
  select license_number into lic from public.provider_profiles where user_id = '00000000-0000-0000-0000-0000000000d2';
  if lic is distinct from 'ARB-1448-002' then raise exception 'T4 FAIL: the admin read licence % for the pending provider', lic; end if;
  reset role;
  raise notice 'T4 PASS: the admin reads both providers, pending included';
end $$;

-- T5: the service role (admin verification queue, onboarding) reads everything.
do $$
declare rec record;
begin
  execute 'set local role service_role';
  select license_number, hourly_rate, metadata into rec
    from public.provider_profiles where user_id = '00000000-0000-0000-0000-0000000000d1';
  if rec.license_number <> 'NOT-1448-001' or rec.hourly_rate <> 400 or rec.metadata #>> '{settings,bio}' is distinct from 'نبذة الموثّق' then
    raise exception 'T5 FAIL: the service role read % — expected the provider''s saved row', rec;
  end if;
  reset role;
  raise notice 'T5 PASS: the service role reads every column, including what the provider just saved';
end $$;

-- T6: the catalog — policy gone, anon holds nothing, the UPDATE list intact.
do $$
declare
  priv text;
  col  text;
begin
  if exists (select 1 from pg_policy where polrelid = 'public.provider_profiles'::regclass
                                       and polname = 'public read verified providers') then
    raise exception 'T6 FAIL: "public read verified providers" still exists';
  end if;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
    if has_table_privilege('anon', 'public.provider_profiles', priv) then
      raise exception 'T6 FAIL: anon holds table-level % on provider_profiles', priv;
    end if;
  end loop;
  foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
    if has_any_column_privilege('anon', 'public.provider_profiles', priv) then
      raise exception 'T6 FAIL: anon holds column-level % on provider_profiles', priv;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.provider_profiles', 'SELECT') then
    raise exception 'T6 FAIL: authenticated lost SELECT (the own-row reads of /api/v1/profile)';
  end if;
  foreach priv in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
    if has_table_privilege('authenticated', 'public.provider_profiles', priv) then
      raise exception 'T6 FAIL: authenticated holds table-level % on provider_profiles', priv;
    end if;
  end loop;
  for col in
    select att.attname::text from pg_attribute att
     where att.attrelid = 'public.provider_profiles'::regclass and att.attnum > 0 and not att.attisdropped
  loop
    if (col in ('metadata', 'updated_at')) <> has_column_privilege('authenticated', 'public.provider_profiles', col, 'UPDATE') then
      raise exception 'T6 FAIL: authenticated UPDATE on provider_profiles.% is wrong (the 20260922_03 list is metadata, updated_at)', col;
    end if;
  end loop;
  raise notice 'T6 PASS: the guest-read policy is gone; anon holds nothing; authenticated keeps SELECT and UPDATE (metadata, updated_at) only';
end $$;
