-- founder_no_signup_grant.test.sql — proves 20261026_01 (owner answers of
-- 25 Oct, P0: the founder badge, seat and library days are never given on a
-- free signup) and its _verify sections.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261026_01
-- runs TWICE (idempotent). The two _verify blocks are extracted from
-- _verify.sql between their markers. Before 20261026_01 only the 20261021_50
-- block runs (it must pass, telling to run 20261026_01); the 20261026_01
-- block RAISES there by design — negative control (d). Both run after the
-- second 20261026_01 run and must pass. From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; D=$(mktemp -d)
--   sed -n '/^-- >>> verify:founder_campaign/,/^-- <<< verify:founder_campaign/p' $M/_verify.sql > "$D/v50.sql"
--   sed -n '/^-- >>> verify:founder_no_signup_grant/,/^-- <<< verify:founder_no_signup_grant/p' $M/_verify.sql > "$D/v01.sql"
--   bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $T/prelude_founder_no_signup_grant_before.sql \
--     "$D/v50.sql" \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     "$D/v50.sql" "$D/v01.sql" \
--     $T/founder_no_signup_grant.test.sql
-- Why each link: as in founder_campaign.test.sql, plus
--   prelude_founder_no_signup_grant_before.sql  wires handle_new_user, opens
--       the window around today and signs f1 up BEFORE the fix — the
--       positive control (badge + grant) and the "already given" row.
--
-- NEGATIVE CONTROLS (must FAIL)
--   (a) the chain without the two 20261026_01 files (and the second pair of
--       blocks) → "T0 FAIL: trg_lawyer_profiles_founder still exists".
--       With T0 and T1 cut out (sed), T2 fails on f2's badge — the old
--       trigger really is what T2 would catch.
--   (b) 20261021_50 re-run after 20261026_01, then "$D/v50.sql" (passes:
--       the setting description keeps the 20261026_01 marker, the seed is
--       `on conflict do nothing`) and "$D/v01.sql" → v01 raises.
--   (c) after 20261026_01, re-create only the trigger name
--         create trigger trg_lawyer_profiles_founder before insert on
--           public.lawyer_profiles for each row execute function
--           public.lawyer_profile_from_signup();  -- any function will do
--       then "$D/v01.sql" → it raises the same way.
--   (d) the chain up to prelude_founder_no_signup_grant_before.sql, then
--       "$D/v01.sql" → it raises "trg_lawyer_profiles_founder is on
--       lawyer_profiles … run SQL_batch_2026-10-26_owner_answers/01_NOW…":
--       a manual _verify run raises until the file has run (deploy.sh does
--       not run _verify.sql).
--
-- Actors: f1 badge + grant from before the fix (prelude) · f2 advocate and
-- f3 consultant signing up after the fix, inside the window · b1 / b2
-- lawyers from before 20261021_50 (prelude_lawyer_profiles_live).
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP on

-- T0 the trigger and its function are gone; what P3 reuses stays
do $$
declare r text;
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.lawyer_profiles'::regclass
               and tgname = 'trg_lawyer_profiles_founder') then
    raise exception 'T0 FAIL: trg_lawyer_profiles_founder still exists';
  end if;
  if to_regprocedure('public.lawyer_profile_founder_campaign()') is not null then
    raise exception 'T0 FAIL: lawyer_profile_founder_campaign() still exists';
  end if;
  if to_regprocedure('public.founder_campaign_active(timestamptz)') is null then
    raise exception 'T0 FAIL: founder_campaign_active(timestamptz) was dropped (P3 reuses it)';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.lawyer_profiles'::regclass
                   and attname = 'founder_badge' and not attisdropped) then
    raise exception 'T0 FAIL: the founder_badge column was dropped';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if not has_column_privilege(r, 'public.lawyer_profiles', 'founder_badge', 'SELECT') then
      raise exception 'T0 FAIL: % cannot SELECT founder_badge', r;
    end if;
    if has_column_privilege(r, 'public.lawyer_profiles', 'founder_badge', 'INSERT, UPDATE, REFERENCES') then
      raise exception 'T0 FAIL: % can write founder_badge', r;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.lawyer_profiles'::regclass
                   and tgname = 'trg_lawyer_profiles_from_signup' and tgenabled <> 'D') then
    raise exception 'T0 FAIL: 20261019_20''s trg_lawyer_profiles_from_signup is gone or disabled';
  end if;
  if col_description('public.lawyer_profiles'::regclass,
       (select attnum from pg_attribute where attrelid = 'public.lawyer_profiles'::regclass
          and attname = 'founder_badge')) not like '%20261026_01%P3%' then
    raise exception 'T0 FAIL: the founder_badge comment does not carry the 20261026_01 marker and the P3 note';
  end if;
  raise notice 'T0 PASS: trigger and function gone; founder_badge (readable, not writable), founder_campaign_active() and the from_signup trigger kept; comment marked 20261026_01';
end $$;

-- T1 the setting value is unchanged (only its description), the campaign is
-- still "active" — so T2 really signs up inside the window
do $$
declare v jsonb; d text;
begin
  select value, description into v, d from public.platform_settings where key = 'founder_campaign';
  if v is distinct from jsonb_build_object(
         'starts_on', to_char((now() at time zone 'Asia/Riyadh')::date - 1, 'YYYY-MM-DD'),
         'ends_on',   to_char((now() at time zone 'Asia/Riyadh')::date + 1, 'YYYY-MM-DD'),
         'library_days', 90) then
    raise exception 'T1 FAIL: 20261026_01 changed the founder_campaign value: %', v;
  end if;
  if d not like '%20261026_01%' or d like '%يحصل على المكتبة%' then
    raise exception 'T1 FAIL: the setting description still promises the signup gift: %', d;
  end if;
  if not public.founder_campaign_active() then
    raise exception 'T1 FAIL: the campaign reads inactive — T2 would prove nothing';
  end if;
  raise notice 'T1 PASS: the founder_campaign value is untouched, its description no longer promises a signup gift, and the campaign still reads active';
end $$;

-- T2 a new advocate and a new consultant signing up DURING the campaign get
-- no badge and no library grant
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f2', 'f2@example.test', '{"user_type":"lawyer","full_name":"محامٍ ٢"}'::jsonb),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@example.test',
   '{"user_type":"lawyer","full_name":"مستشار ٣","practice_kind":"consultant","license_number":"MOJ-3"}'::jsonb);
do $$
declare rec record;
begin
  for rec in
    select v.uid, v.kind, lp.founder_badge, lp.practice_kind
      from (values ('00000000-0000-0000-0000-0000000000f2'::uuid, 'advocate'),
                   ('00000000-0000-0000-0000-0000000000f3'::uuid, 'consultant')) v(uid, kind)
      left join public.lawyer_profiles lp on lp.user_id = v.uid
  loop
    if rec.founder_badge is null then
      raise exception 'T2 FAIL: handle_new_user built no lawyer row for % — the signup broke', rec.uid;
    end if;
    if rec.founder_badge then
      raise exception 'T2 FAIL: % got the founder badge on a free signup after 20261026_01', rec.uid;
    end if;
    if rec.practice_kind is distinct from rec.kind then
      raise exception 'T2 FAIL: % reads practice_kind %, expected % (the from_signup trigger)', rec.uid, rec.practice_kind, rec.kind;
    end if;
    if exists (select 1 from public.library_access_grants where user_id = rec.uid) then
      raise exception 'T2 FAIL: % got a library grant on a free signup after 20261026_01', rec.uid;
    end if;
  end loop;
  raise notice 'T2 PASS: during the campaign a new advocate and a new consultant get no badge and no library grant; the consultant stays consultant';
end $$;

-- T3 a direct insert (not through handle_new_user — c1, a client with no
-- lawyer row yet) gets nothing either
insert into public.lawyer_profiles (user_id, is_accepting_clients)
values ('00000000-0000-0000-0000-0000000000c1', true)
on conflict (user_id) do nothing;
do $$
begin
  if exists (select 1 from public.lawyer_profiles
              where user_id = '00000000-0000-0000-0000-0000000000c1' and founder_badge)
     or exists (select 1 from public.library_access_grants
                 where user_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'T3 FAIL: a direct lawyer_profiles insert got the badge or a grant';
  end if;
  raise notice 'T3 PASS: a direct lawyer_profiles insert gets no badge and no grant';
end $$;

-- T4 what was already given stays (owner question ٢٧٨ decides later)
do $$
begin
  if (select founder_badge from public.lawyer_profiles
       where user_id = '00000000-0000-0000-0000-0000000000f1') is distinct from true then
    raise exception 'T4 FAIL: f1 lost the badge given before 20261026_01 (cleanup waits on ٢٧٨)';
  end if;
  if (select count(*) from public.library_access_grants
       where user_id = '00000000-0000-0000-0000-0000000000f1' and plan_ref = 'lib-founder'
         and source = 'founder_campaign') <> 1 then
    raise exception 'T4 FAIL: f1''s lib-founder grant from before 20261026_01 is gone or doubled';
  end if;
  if (select count(*) from public.lawyer_profiles where founder_badge) <> 1 then
    raise exception 'T4 FAIL: % badge(s), expected only f1''s', (select count(*) from public.lawyer_profiles where founder_badge);
  end if;
  raise notice 'T4 PASS: the badge and the lib-founder grant given before 20261026_01 are kept; nobody else holds a badge';
end $$;

-- T5 the service role can still set the badge (P3's path)
update public.lawyer_profiles set founder_badge = true
 where user_id = '00000000-0000-0000-0000-0000000000f2';
do $$
begin
  if not has_column_privilege('service_role', 'public.lawyer_profiles', 'founder_badge', 'UPDATE') then
    raise exception 'T5 FAIL: service_role cannot UPDATE founder_badge (P3 needs it)';
  end if;
  if (select founder_badge from public.lawyer_profiles
       where user_id = '00000000-0000-0000-0000-0000000000f2') is distinct from true then
    raise exception 'T5 FAIL: the badge update did not stick';
  end if;
  raise notice 'T5 PASS: the badge can still be set by a privileged write (the P3 path)';
end $$;
