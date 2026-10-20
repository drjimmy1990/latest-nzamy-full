-- founder_campaign.test.sql — proves 20261021_50 (owner decision ٢١٨, dates
-- ٢٢٥: every lawyer who signs up between 25 Oct 2026 and 25 Jan 2027, Riyadh
-- dates, gets 3 months of the library and the founder badge).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent), with an admin edit of the setting between the runs.
-- From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $T/prelude_founder_campaign_between_runs.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $T/founder_campaign.test.sql
-- Why each link:
--   prelude_lawyer_profiles_live.sql  the live lawyer_profiles columns (incl.
--       metadata), the 20260922_03 + 20261016_05 column UPDATE list, the live
--       policies, rows b1 (verified + listed) / b2 (pending) / c1 (client).
--   prelude_signup_metadata_live.sql  what the real handle_new_user needs.
--   20260921_04   the latest handle_new_user (lawyer branch:
--       `insert … lawyer_profiles (user_id, is_accepting_clients) … on
--       conflict (user_id) do nothing`); wired to auth.users below as on live.
--   20261016_10   the SELECT column lock (metadata outside the allow-list);
--       20261021_50 refuses to run without it.
--   20260627      public.platform_settings (the key/value table).
--   20261019_10   public.library_access_grants (plan_ref 'lib-founder',
--       source 'founder_campaign').
--   20261019_20   the other BEFORE INSERT trigger on lawyer_profiles
--       (trg_lawyer_profiles_from_signup), so the two are shown to co-operate.
--   prelude_founder_campaign_between_runs.sql  asserts the first run seeded
--       the owner's dates, then plays an admin editing them; T2 checks that
--       the second run kept the edit.
--
-- NEGATIVE CONTROL (must FAIL) — the chain without the two 20261021_50 files
-- and the between-runs prelude:
--   bash $T/run.sh $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql $T/founder_campaign.test.sql
--   → "T0 FAIL: lawyer_profiles.founder_badge does not exist (20261021_50 not applied)".
-- BUILT-IN CONTROL: T10 signs a lawyer up inside the window with the trigger
-- DISABLED and expects no badge and no grant — so T5's result is the
-- trigger's doing, not a default or another trigger.
--
-- "today" is the Riyadh date of the container's clock; the window is set
-- around it (today − 1 … today + 1), so the trigger path runs on the real
-- now(). The calendar boundaries are proved on founder_campaign_active(p_at)
-- directly with fixed instants (T3).
--
-- WHY app_user's DIRECT grants are revoked (T6): stubs.sql gives app_user
-- `grant all` on every public table; on live a signed-in request holds only
-- what `authenticated` holds. After the REVOKE a 42501 is the live column
-- grant answering.
--
-- Actors (all signed up through auth.users → handle_new_user unless noted):
--   f1 null dates · f2 advocate inside the window · f3 consultant inside the
--   window · f4 window in the past · f5 malformed dates · f6 library_days
--   missing · f7 the grant insert fails · f8 trigger disabled (control) ·
--   b1 / b2 lawyers from before the migration (prelude).
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on

-- T0 precondition (the negative control stops here)
do $$
begin
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.lawyer_profiles'::regclass
                    and attname = 'founder_badge' and not attisdropped) then
    raise exception 'T0 FAIL: lawyer_profiles.founder_badge does not exist (20261021_50 not applied)';
  end if;
  raise notice 'T0 PASS: lawyer_profiles.founder_badge exists';
end $$;

-- T1 catalog: column, grants, function, trigger
do $$
declare
  r   text;
  dfl text;
  cfg text[];
begin
  select pg_get_expr(d.adbin, d.adrelid) into dfl
    from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
   where d.adrelid = 'public.lawyer_profiles'::regclass and a.attname = 'founder_badge';
  if dfl is distinct from 'false'
     or not (select attnotnull from pg_attribute
              where attrelid = 'public.lawyer_profiles'::regclass and attname = 'founder_badge')
     or (select atttypid from pg_attribute
          where attrelid = 'public.lawyer_profiles'::regclass and attname = 'founder_badge') <> 'boolean'::regtype then
    raise exception 'T1 FAIL: founder_badge is not boolean NOT NULL DEFAULT false (default %)', dfl;
  end if;
  if exists (select 1 from public.lawyer_profiles where founder_badge) then
    raise exception 'T1 FAIL: a lawyer from before the migration carries the badge';
  end if;

  foreach r in array array['anon', 'authenticated'] loop
    if not has_column_privilege(r, 'public.lawyer_profiles', 'founder_badge', 'SELECT') then
      raise exception 'T1 FAIL: % cannot SELECT founder_badge', r;
    end if;
    if has_column_privilege(r, 'public.lawyer_profiles', 'founder_badge', 'INSERT')
       or has_column_privilege(r, 'public.lawyer_profiles', 'founder_badge', 'UPDATE') then
      raise exception 'T1 FAIL: % can write founder_badge', r;
    end if;
    if has_column_privilege(r, 'public.lawyer_profiles', 'metadata', 'SELECT') then
      raise exception 'T1 FAIL: % can SELECT metadata', r;
    end if;
    if has_table_privilege(r, 'public.lawyer_profiles', 'SELECT') then
      raise exception 'T1 FAIL: % holds table-level SELECT on lawyer_profiles', r;
    end if;
  end loop;

  -- founder_campaign_active: definer, search_path '', callable by the API roles
  select proconfig into cfg from pg_proc where oid = 'public.founder_campaign_active(timestamptz)'::regprocedure;
  if not (select prosecdef from pg_proc where oid = 'public.founder_campaign_active(timestamptz)'::regprocedure)
     or cfg is null or not ('search_path=""' = any (cfg))
     or (select provolatile from pg_proc where oid = 'public.founder_campaign_active(timestamptz)'::regprocedure) <> 's'
     or (select prorettype from pg_proc where oid = 'public.founder_campaign_active(timestamptz)'::regprocedure) <> 'boolean'::regtype then
    raise exception 'T1 FAIL: founder_campaign_active is not a STABLE SECURITY DEFINER boolean with search_path '''' (proconfig %)', cfg;
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if not has_function_privilege(r, 'public.founder_campaign_active(timestamptz)', 'EXECUTE') then
      raise exception 'T1 FAIL: % cannot EXECUTE founder_campaign_active', r;
    end if;
  end loop;

  -- the trigger function: definer, search_path '', no API EXECUTE
  select proconfig into cfg from pg_proc where oid = 'public.lawyer_profile_founder_campaign()'::regprocedure;
  if not (select prosecdef from pg_proc where oid = 'public.lawyer_profile_founder_campaign()'::regprocedure)
     or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception 'T1 FAIL: lawyer_profile_founder_campaign is not SECURITY DEFINER with search_path '''' (proconfig %)', cfg;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, 'public.lawyer_profile_founder_campaign()', 'EXECUTE') then
      raise exception 'T1 FAIL: % can EXECUTE lawyer_profile_founder_campaign', r;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.lawyer_profiles'::regclass
                    and t.tgname = 'trg_lawyer_profiles_founder'
                    and not t.tgisinternal and t.tgenabled <> 'D'
                    and (t.tgtype & 7) = 7            -- ROW | BEFORE | INSERT
                    and (t.tgtype & 16) = 0           -- not UPDATE
                    and t.tgfoid = 'public.lawyer_profile_founder_campaign()'::regprocedure) then
    raise exception 'T1 FAIL: trg_lawyer_profiles_founder is missing, disabled, or not BEFORE INSERT FOR EACH ROW only';
  end if;
  raise notice 'T1 PASS: founder_badge boolean NOT NULL DEFAULT false, readable not writable by anon/authenticated, metadata still locked; founder_campaign_active STABLE definer callable by the API roles; trigger BEFORE INSERT, definer, no API EXECUTE';
end $$;

-- T2 the second run kept the admin's edit (the seed is on conflict do nothing)
do $$
declare v jsonb;
begin
  select value into v from public.platform_settings where key = 'founder_campaign';
  if v is distinct from '{"starts_on": "2026-11-01", "ends_on": "2027-02-01", "library_days": 60}'::jsonb then
    raise exception 'T2 FAIL: after the re-run founder_campaign = %, expected the admin''s edit (2026-11-01 → 2027-02-01, 60)', v;
  end if;
  if (select count(*) from public.platform_settings where key = 'founder_campaign') <> 1 then
    raise exception 'T2 FAIL: more than one founder_campaign row';
  end if;
  raise notice 'T2 PASS: a re-run of the migration keeps the admin-edited setting';
end $$;

-- T3 Riyadh calendar boundaries on the owner's dates (UTC+3, inclusive)
update public.platform_settings
   set value = '{"starts_on": "2026-10-25", "ends_on": "2027-01-25", "library_days": 90}'::jsonb
 where key = 'founder_campaign';
do $$
declare rec record;
begin
  for rec in
    select v.at, v.expected, public.founder_campaign_active(v.at) as got
      from (values ('2026-10-24 20:59+00'::timestamptz, false),  -- 23:59 Riyadh, 24 Oct
                   ('2026-10-24 21:00+00'::timestamptz, true),   -- 00:00 Riyadh, 25 Oct
                   ('2026-10-24 21:30+00'::timestamptz, true),   -- 00:30 Riyadh, 25 Oct
                   ('2026-12-01 12:00+00'::timestamptz, true),
                   ('2027-01-25 20:59+00'::timestamptz, true),   -- 23:59 Riyadh, 25 Jan
                   ('2027-01-25 21:00+00'::timestamptz, false),  -- 00:00 Riyadh, 26 Jan
                   ('2026-10-20 12:00+00'::timestamptz, false),
                   ('2027-03-01 12:00+00'::timestamptz, false),
                   (null::timestamptz, false)) v(at, expected)
  loop
    if rec.got is distinct from rec.expected then
      raise exception 'T3 FAIL: founder_campaign_active(%) = %, expected %', rec.at, rec.got, rec.expected;
    end if;
  end loop;
  raise notice 'T3 PASS: 2026-10-24 20:59Z (23:59 Riyadh) false, 21:00Z / 21:30Z true; 2027-01-25 20:59Z true, 21:00Z false; NULL false';
end $$;

-- ── fixtures as postgres: wire handle_new_user to auth.users as on live ─────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- T4 dates null → inactive: no grant, no badge
update public.platform_settings
   set value = '{"starts_on": null, "ends_on": null, "library_days": 90}'::jsonb
 where key = 'founder_campaign';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@example.test', '{"user_type":"lawyer","full_name":"محامٍ ١"}'::jsonb);
do $$
declare b boolean;
begin
  if public.founder_campaign_active() then
    raise exception 'T4 FAIL: the campaign reads active with null dates';
  end if;
  update public.platform_settings set value = '{"starts_on": "2026-10-25", "ends_on": null, "library_days": 90}'::jsonb
   where key = 'founder_campaign';
  if public.founder_campaign_active('2026-12-01 12:00+00') then
    raise exception 'T4 FAIL: the campaign reads active with a null ends_on';
  end if;
  update public.platform_settings set value = '{"starts_on": null, "ends_on": "2027-01-25", "library_days": 90}'::jsonb
   where key = 'founder_campaign';
  if public.founder_campaign_active('2026-12-01 12:00+00') then
    raise exception 'T4 FAIL: the campaign reads active with a null starts_on';
  end if;
  select founder_badge into b from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f1';
  if b is null then raise exception 'T4 FAIL: handle_new_user built no lawyer row for f1'; end if;
  if b then raise exception 'T4 FAIL: f1 got the badge with null dates'; end if;
  if exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'T4 FAIL: f1 got a library grant with null dates';
  end if;
  raise notice 'T4 PASS: null dates (either or both) → inactive; a signup gets no grant and no badge';
end $$;

-- T5 dates around the real Riyadh today → a 90-day grant and the badge, for
-- an advocate and for a consultant (both triggers co-operate)
update public.platform_settings
   set value = jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'library_days', 90)
 where key = 'founder_campaign';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f2', 'f2@example.test', '{"user_type":"lawyer","full_name":"محامٍ ٢"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@example.test',
   '{"user_type":"lawyer","full_name":"مستشار ٣","practice_kind":"consultant","license_number":"MOJ-3"}'::jsonb);
do $$
declare
  rec record;
  n   int;
begin
  if not public.founder_campaign_active() then
    raise exception 'T5 FAIL: the campaign reads inactive inside today − 1 … today + 1';
  end if;
  for rec in
    select v.uid, v.kind, lp.founder_badge, lp.practice_kind
      from (values ('00000000-0000-0000-0000-0000000000f2'::uuid, 'advocate'),
                   ('00000000-0000-0000-0000-0000000000f3'::uuid, 'consultant')) v(uid, kind)
      left join public.lawyer_profiles lp on lp.user_id = v.uid
  loop
    if rec.founder_badge is distinct from true or rec.practice_kind is distinct from rec.kind then
      raise exception 'T5 FAIL: % is (badge %, %), expected (true, %)', rec.uid, rec.founder_badge, rec.practice_kind, rec.kind;
    end if;
    select count(*) into n from public.library_access_grants
     where user_id = rec.uid and plan_ref = 'lib-founder' and source = 'founder_campaign'
       and granted_by is null
       and ends_at - starts_at = interval '90 days'
       and starts_at between now() - interval '5 minutes' and now();
    if n <> 1 then
      raise exception 'T5 FAIL: % holds % lib-founder / founder_campaign grant(s) of exactly 90 days starting at signup, expected 1', rec.uid, n;
    end if;
    if (select count(*) from public.library_access_grants where user_id = rec.uid) <> 1 then
      raise exception 'T5 FAIL: % holds more than one library grant', rec.uid;
    end if;
  end loop;
  raise notice 'T5 PASS: inside the window an advocate and a consultant both get the badge and one lib-founder grant of 90 days (consultant stays consultant)';
end $$;

-- T6 the session: a guest and a signed-in user read founder_badge, never
-- metadata, and nobody's session writes the badge
revoke all on public.lawyer_profiles from app_user;
do $$
declare
  b boolean;
  n int;
begin
  perform set_config('test.uid', '', true);
  execute 'set local role anon';
  select founder_badge into b from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b1';
  if b is distinct from false then raise exception 'T6 FAIL: a guest reads the listed lawyer''s badge as %', b; end if;
  begin
    perform metadata from public.lawyer_profiles;
    raise exception 'T6 FAIL: a guest read metadata';
  exception when insufficient_privilege then null;
  end;
  reset role;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000f2', true);
  execute 'set local role app_user';
  select founder_badge into b from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
  if b is distinct from true then raise exception 'T6 FAIL: f2 reads own badge as %', b; end if;
  begin
    perform metadata from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
    raise exception 'T6 FAIL: a signed-in user read metadata';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.lawyer_profiles set founder_badge = true where user_id = '00000000-0000-0000-0000-0000000000f2';
    raise exception 'T6 FAIL: a lawyer updated his own founder_badge';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.library_access_grants;  -- own rows only (RLS)
  if n <> 1 then raise exception 'T6 FAIL: f2 sees % library grant row(s), expected its own 1', n; end if;
  reset role;
  raise notice 'T6 PASS: anon and a signed-in user read founder_badge, get 42501 on metadata and on writing the badge; f2 reads its own grant';
end $$;

-- T7 one grant per user, and only for a NEW lawyer row
do $$
declare
  n int;
  b boolean;
begin
  -- (a) handle_new_user's own `on conflict do nothing` shape, on a user who
  -- already holds the founder grant: the BEFORE INSERT trigger fires, no
  -- second grant
  insert into public.lawyer_profiles (user_id, is_accepting_clients)
  values ('00000000-0000-0000-0000-0000000000f2', true)
  on conflict (user_id) do nothing;
  select count(*) into n from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f2';
  if n <> 1 then raise exception 'T7 FAIL (a): f2 holds % grants after an on-conflict re-insert, expected 1', n; end if;

  -- (b) the same shape on a lawyer from before the campaign (no grant): no
  -- row is inserted, so no grant and no badge
  insert into public.lawyer_profiles (user_id, is_accepting_clients)
  values ('00000000-0000-0000-0000-0000000000b2', true)
  on conflict (user_id) do nothing;
  if exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'T7 FAIL (b): an existing lawyer got a founder grant through an on-conflict insert';
  end if;
  if (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'T7 FAIL (b): an existing lawyer got the badge';
  end if;

  -- (c) the row is deleted and inserted again: a new row (badge true), but
  -- still one grant
  delete from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
  insert into public.lawyer_profiles (user_id, is_accepting_clients)
  values ('00000000-0000-0000-0000-0000000000f2', true);
  select founder_badge into b from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
  select count(*) into n from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f2';
  if b is distinct from true or n <> 1 then
    raise exception 'T7 FAIL (c): after delete + re-insert f2 is (badge %, % grants), expected (true, 1)', b, n;
  end if;
  raise notice 'T7 PASS: an on-conflict re-insert and a delete + re-insert leave one grant; an existing lawyer gets nothing';
end $$;

-- T8 dates in the past → no grant, no badge
update public.platform_settings
   set value = '{"starts_on": "2025-01-01", "ends_on": "2025-03-31", "library_days": 90}'::jsonb
 where key = 'founder_campaign';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f4', 'f4@example.test', '{"user_type":"lawyer"}'::jsonb);
do $$
begin
  if (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f4') is distinct from false then
    raise exception 'T8 FAIL: f4 is not a badge-less lawyer after a past window';
  end if;
  if exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f4') then
    raise exception 'T8 FAIL: f4 got a grant from a past window';
  end if;
  raise notice 'T8 PASS: a window in the past grants nothing';
end $$;

-- T9 never blocks a signup, never raises
--   (a) malformed dates → inactive, the signup goes through
update public.platform_settings
   set value = '{"starts_on": "25/10/2026", "ends_on": "2027-02-30", "library_days": 90}'::jsonb
 where key = 'founder_campaign';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f5', 'f5@example.test', '{"user_type":"lawyer"}'::jsonb);
do $$
declare v jsonb;
begin
  if public.founder_campaign_active('2026-12-01 12:00+00') then
    raise exception 'T9 FAIL (a): malformed dates read active';
  end if;
  if (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f5') is distinct from false
     or exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f5') then
    raise exception 'T9 FAIL (a): f5 got something from malformed dates';
  end if;
  foreach v in array array['{"starts_on": 20261025, "ends_on": "2027-01-25"}'::jsonb, '"2026-10-25"'::jsonb, '[]'::jsonb,
                           '{"starts_on": "2026-10-25 ", "ends_on": "2027-01-25"}'::jsonb] loop
    update public.platform_settings set value = v where key = 'founder_campaign';
    if public.founder_campaign_active('2026-12-01 12:00+00') then
      raise exception 'T9 FAIL (a): % reads active', v;
    end if;
  end loop;
  delete from public.platform_settings where key = 'founder_campaign';
  if public.founder_campaign_active('2026-12-01 12:00+00') then
    raise exception 'T9 FAIL (a): no setting row reads active';
  end if;
  raise notice 'T9a PASS: malformed dates, a non-object value and a missing row read inactive; the signup goes through';
end $$;

--   (b) library_days missing / not a positive whole number → 90
insert into public.platform_settings (key, value) values
  ('founder_campaign', jsonb_build_object(
     'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
     'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD')));
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f6', 'f6@example.test', '{"user_type":"lawyer"}'::jsonb);
update public.platform_settings set value = value || '{"library_days": 0}'::jsonb where key = 'founder_campaign';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f9', 'f9@example.test', '{"user_type":"lawyer"}'::jsonb);
update public.platform_settings set value = value || '{"library_days": 30}'::jsonb where key = 'founder_campaign';
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000fa', 'fa@example.test', '{"user_type":"lawyer"}'::jsonb);
do $$
declare rec record;
begin
  for rec in
    select v.uid, v.days, (select ends_at - starts_at from public.library_access_grants g where g.user_id = v.uid) as got
      from (values ('00000000-0000-0000-0000-0000000000f6'::uuid, interval '90 days'),
                   ('00000000-0000-0000-0000-0000000000f9'::uuid, interval '90 days'),
                   ('00000000-0000-0000-0000-0000000000fa'::uuid, interval '30 days')) v(uid, days)
  loop
    if rec.got is distinct from rec.days then
      raise exception 'T9 FAIL (b): % got a grant of %, expected %', rec.uid, rec.got, rec.days;
    end if;
  end loop;
  raise notice 'T9b PASS: library_days missing or 0 → 90 days; a valid library_days (30) is honoured';
end $$;

--   (c) the grant insert fails → WARNING, the signup goes through, no badge
alter table public.library_access_grants
  add constraint t9_refuse_all check (false) not valid;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f7', 'f7@example.test', '{"user_type":"lawyer"}'::jsonb);
alter table public.library_access_grants drop constraint t9_refuse_all;
do $$
declare b boolean;
begin
  select founder_badge into b from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f7';
  if b is null then raise exception 'T9 FAIL (c): the signup lost its lawyer row'; end if;
  if b then raise exception 'T9 FAIL (c): f7 got the badge without the grant'; end if;
  if exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f7') then
    raise exception 'T9 FAIL (c): f7 holds a grant';
  end if;
  raise notice 'T9c PASS: a failing grant insert logs a WARNING; the signup goes through with no badge and no grant';
end $$;

-- T10 built-in control: inside the window with the trigger DISABLED → nothing
alter table public.lawyer_profiles disable trigger trg_lawyer_profiles_founder;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f8', 'f8@example.test', '{"user_type":"lawyer"}'::jsonb);
alter table public.lawyer_profiles enable trigger trg_lawyer_profiles_founder;
do $$
begin
  if not public.founder_campaign_active() then
    raise exception 'T10 SETUP: the window is not active — the control proves nothing';
  end if;
  if (select founder_badge from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f8') is distinct from false
     or exists (select 1 from public.library_access_grants where user_id = '00000000-0000-0000-0000-0000000000f8') then
    raise exception 'T10 FAIL: without the trigger f8 still got the badge or a grant — something else writes them';
  end if;
  raise notice 'T10 PASS: control — without the trigger a signup inside the window gets neither';
end $$;
