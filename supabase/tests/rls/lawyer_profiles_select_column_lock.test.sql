-- lawyer_profiles_select_column_lock.test.sql — proves 20261016_10 (plan item
-- N2) on the live shape (prelude_lawyer_profiles_live.sql). The migration runs
-- TWICE (idempotent). Run from the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $T/lawyer_profiles_select_column_lock.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-16):
--   NC1 — without the migration (live today):
--     bash $T/run.sh $T/prelude_lawyer_profiles_live.sql $T/lawyer_profiles_select_column_lock.test.sql
--     → "T1 FAIL: anon holds table-level SELECT on lawyer_profiles".
--   NC2 — a policy on another table that reads a LOCKED column:
--     bash $T/run.sh $T/prelude_lawyer_profiles_live.sql $T/prelude_lawyer_profiles_stray.sql \
--       $M/20261016_10_lawyer_profiles_select_column_lock.sql $T/lawyer_profiles_select_column_lock.test.sql
--     → the migration's verify raises "policies read a locked lawyer_profiles
--       column … stray_licence_gate on lawyer_services (lawyer_profiles.license_number)".
-- The file runs as the superuser; every role-scoped assertion does `set local role`.
\set ON_ERROR_STOP on

-- T1: the grants — public columns only, the UPDATE list intact.
do $$
declare
  r   text;
  col text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if has_table_privilege(r, 'public.lawyer_profiles', 'SELECT') then
      raise exception 'T1 FAIL: % holds table-level SELECT on lawyer_profiles', r;
    end if;
    foreach col in array array['license_number', 'hourly_rate', 'credit_balance', 'credit_package',
                               'credit_expiry', 'free_briefs_remaining', 'metadata', 'bar_association',
                               'office_address', 'bar_membership_number', 'license_expiry',
                               'license_issued_on', 'show_hourly_rate', 'show_contact', 'city'] loop
      if has_column_privilege(r, 'public.lawyer_profiles', col, 'SELECT') then
        raise exception 'T1 FAIL: % can read lawyer_profiles.%', r, col;
      end if;
    end loop;
  end loop;
  foreach col in array array['bio_ar', 'hourly_rate', 'license_number', 'slug', 'display_mode',
                             'show_hourly_rate', 'marketplace_visible', 'office_address'] loop
    if not has_column_privilege('authenticated', 'public.lawyer_profiles', col, 'UPDATE') then
      raise exception 'T1 FAIL: authenticated lost UPDATE on lawyer_profiles.% (the SELECT revoke took the column grants with it)', col;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.lawyer_profiles', 'verification_status', 'UPDATE')
     or has_column_privilege('authenticated', 'public.lawyer_profiles', 'credit_balance', 'UPDATE') then
    raise exception 'T1 FAIL: a lawyer can self-verify or self-credit again';
  end if;
  raise notice 'T1 PASS: anon/authenticated read public columns only; the 20260922_03 + 20261016_05 UPDATE list is intact';
end $$;

-- T2: a guest — the public profile reads, the private columns refuse, the
-- service list and the reviews gate still work.
do $$
declare
  n   int;
  rec record;
begin
  perform set_config('test.uid', '', true);
  execute 'set local role anon';

  -- the public projection (what lawyers/[id] shows to everyone)
  select count(*) into n from (
    select user_id, slug, specialties, years_experience, bio_ar, bio_en, headline_ar, education,
           courts, languages, verification_status, marketplace_visible, is_accepting_clients
      from public.lawyer_profiles) s;
  if n <> 1 then raise exception 'T2 FAIL: a guest reads % public lawyer rows, expected 1 (verified + listed)', n; end if;

  -- reviews GET / community gate shape
  select user_id into rec from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000b1'
     and verification_status = 'verified' and marketplace_visible = true;
  if rec is null then raise exception 'T2 FAIL: the listed-lawyer gate query returned nothing'; end if;

  begin
    perform license_number from public.lawyer_profiles;
    raise exception 'T2 FAIL: a guest read license_number';
  exception when insufficient_privilege then null;
  end;
  begin
    perform hourly_rate from public.lawyer_profiles;
    raise exception 'T2 FAIL: a guest read hourly_rate (Q168)';
  exception when insufficient_privilege then null;
  end;
  begin
    perform credit_balance from public.lawyer_profiles;
    raise exception 'T2 FAIL: a guest read credit_balance';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.lawyer_profiles;
    raise exception 'T2 FAIL: a guest ran select * on lawyer_profiles';
  exception when insufficient_privilege then null;
  end;

  -- "lawyer services public read" reads lawyer_profiles inline
  begin
    select count(*) into n from public.lawyer_services;
  exception when insufficient_privilege then
    raise exception 'T2 FAIL: a guest read of lawyer_services fails (%)', sqlerrm;
  end;
  if n <> 1 then raise exception 'T2 FAIL: a guest reads % lawyer services, expected 1 (the listed lawyer''s)', n; end if;

  reset role;
  raise notice 'T2 PASS: a guest reads the public profile columns and the listed lawyer''s services; licence, rate, credit and select * are refused (42501)';
end $$;

-- T3: the lawyer's own session — the PATCH /api/v1/profile shapes.
do $$
declare
  n   int;
  uid uuid;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  execute 'set local role authenticated';

  -- PATCH: UPDATE … WHERE user_id = me RETURNING user_id (the new code)
  update public.lawyer_profiles
     set bio_ar = 'نبذة', hourly_rate = 650, show_hourly_rate = true, license_number = '1448-LAW-009'
   where user_id = '00000000-0000-0000-0000-0000000000b1'
  returning user_id into uid;
  if uid is null then raise exception 'T3 FAIL: the PATCH-shaped update returned no row'; end if;

  -- settings/preferences mirror: UPDATE … WHERE user_id = me, no RETURNING
  update public.lawyer_profiles set display_mode = 'light' where user_id = '00000000-0000-0000-0000-0000000000b1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the display_mode mirror updated % rows', n; end if;

  -- the OLD PATCH (`.select()` = RETURNING *) is what the code change avoids
  begin
    update public.lawyer_profiles set bio_ar = 'x' where user_id = '00000000-0000-0000-0000-0000000000b1' returning *;
    raise exception 'T3 FAIL: RETURNING * still works — the column lock is not in force';
  exception when insufficient_privilege then null;
  end;
  -- …and so is the old GET (session select("*")): the own row's private
  -- columns come from the server (readOwnLawyerRow, service role) now.
  begin
    perform license_number from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'T3 FAIL: the session read its own license_number — expected the service-role route to be the only way';
  exception when insufficient_privilege then null;
  end;

  -- still no self-verification / self-credit (20260922_03)
  begin
    update public.lawyer_profiles set verification_status = 'verified' where user_id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'T3 FAIL: a lawyer self-verified';
  exception when insufficient_privilege then null;
  end;

  -- community/posts gate: own verification_status
  select count(*) into n from public.lawyer_profiles
   where user_id = '00000000-0000-0000-0000-0000000000b1' and verification_status = 'verified';
  if n <> 1 then raise exception 'T3 FAIL: the lawyer cannot read the own verification_status'; end if;

  -- service_requests_select_policy reads lawyer_profiles inline: a verified
  -- lawyer still sees the open request
  begin
    select count(*) into n from public.service_requests where id = 'sr-open';
  exception when insufficient_privilege then
    raise exception 'T3 FAIL: service_requests read fails for a lawyer (%)', sqlerrm;
  end;
  if n <> 1 then raise exception 'T3 FAIL: the verified lawyer sees % open requests, expected 1', n; end if;
  reset role;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  execute 'set local role authenticated';
  begin
    select count(*) into n from public.service_requests;
  exception when insufficient_privilege then
    raise exception 'T3 FAIL: service_requests read fails for a client (%)', sqlerrm;
  end;
  if n <> 1 then raise exception 'T3 FAIL: the client sees % own requests, expected 1', n; end if;
  reset role;
  raise notice 'T3 PASS: the lawyer saves (RETURNING user_id) and mirrors display_mode; RETURNING * and own private reads are refused; no self-verify; service_requests reads for lawyer and client';
end $$;

-- T4: the service role (every Next route that shows private columns) reads all.
do $$
declare rec record;
begin
  execute 'set local role service_role';
  select license_number, hourly_rate, credit_balance, show_hourly_rate into rec
    from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
  if rec.license_number <> '1448-LAW-009' or rec.hourly_rate <> 650 or rec.credit_balance <> 40 or not rec.show_hourly_rate then
    raise exception 'T4 FAIL: the service role read % — expected the lawyer''s saved row', rec;
  end if;
  reset role;
  raise notice 'T4 PASS: the service role reads every column, including what the lawyer just saved';
end $$;
