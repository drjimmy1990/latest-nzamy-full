-- =============================================================================
-- Migration: 20261208_20_phone_sign_in_resolver.sql   (batch l18, verify id: l18_phone_login)
-- =============================================================================
-- PURPOSE
--   A Saudi mobile typed on /login or /forgot-password finds its account on
--   the SERVER, by the number confirmed on the account (profiles.phone with
--   profiles.phone_verified_at set). auth.users.phone is never read or
--   written: every account signs up by e-mail, so GoTrue holds no phone for
--   anyone, and the confirmed number lives in profiles only.
--
--   1. public.phone_sign_in_target(e164) → {ok, user_id, email} only when
--      EXACTLY ONE account has that number confirmed, and that account is
--      not deleted, not an SSO row and has an e-mail. Two accounts sharing a
--      confirmed number → {ok: false} (nobody is signed in or sent a code by
--      that number). The sign-in route then runs the normal e-mail +
--      password sign-in for that address — same lockout, security check,
--      suspension, staff two-step and one uniform refusal.
--   2. public.pw_reset_target_by_phone(e164) → the same answer as
--      pw_reset_target(email) (20261207_10) for the account found by (1), and
--      only when pw_reset_target picks that very account. So the WhatsApp
--      reset by number keeps every rule of the reset by e-mail (not staff, not
--      banned, not deleted, not SSO, confirmed mobile, no change of number in
--      the last 7 days) without a second copy of them.
--   3. An index on the confirmed numbers (tiny; the lookup reads it).
--   4. Verify block — RAISES unless all of the above holds.
--   Both functions are SECURITY DEFINER, empty search_path, service_role only.
--
--   Why an exact match is enough: profiles.phone carries the CHECK
--   profiles_phone_e164_saudi_mobile (^\+9665[0-9]{8}$, 20260921_04), added
--   NOT VALID; but NOT VALID skips only rows that existed then — every UPDATE
--   is still checked, and phone_verified_at (20261205_10, later) is only ever
--   set by an UPDATE. A confirmed number is therefore E.164. The lookup also
--   accepts the '9665…' and '05…' spellings, for a database where that CHECK
--   never ran; a number stored twice in different spellings still counts as
--   shared.
--
-- HOW TO RUN (on the server, from the project folder):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261208_20_phone_sign_in_resolver.sql
--   Expect: NOTICE  l18_phone_login verify: OK …   and a final row with `t`.
--
-- RUN ORDER: after 20261205_10_phone_otp.sql (profiles.phone_verified_at) and
--   20261207_10_password_reset_whatsapp.sql (pw_reset_target, batch l17).
--   BEFORE the deploy of batch l18. Until it runs, a mobile typed on /login
--   gets the uniform «بيانات الدخول غير صحيحة» and a mobile on
--   /forgot-password gets the uniform «سيصلك رمز…» with no code sent (both
--   fail closed). Then _verify.sql (block l18_phone_login) after the deploy.
-- DATA: no backfill; no row is written. auth.users is read only.
-- SAFE TO RE-RUN: yes (create or replace / if not exists).
-- ROLLBACK:
--   drop function if exists public.pw_reset_target_by_phone(text);
--   drop function if exists public.phone_sign_in_target(text);
--   drop index if exists public.profiles_confirmed_phone_idx;
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null then
    raise exception '20261208_20: public.profiles / auth.users are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_verified_at') then
    raise exception '20261208_20: profiles.phone_verified_at is missing (run 20261205_10_phone_otp.sql first)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    raise exception '20261208_20: auth.users.email is missing';
  end if;
  if to_regprocedure('public.pw_reset_target(text)') is null then
    raise exception '20261208_20: public.pw_reset_target(text) is missing (run 20261207_10_password_reset_whatsapp.sql first)';
  end if;
end
$pre$;

-- ── 1. the confirmed numbers ────────────────────────────────────────────────
create index if not exists profiles_confirmed_phone_idx
  on public.profiles (phone) where phone_verified_at is not null;

-- ── 2a. a confirmed mobile → its one account ────────────────────────────────
create or replace function public.phone_sign_in_target(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_phone text := pg_catalog.btrim(coalesce(p_phone, ''));
  v_ids   uuid[];
  v_user  jsonb;
begin
  if v_phone !~ '^\+9665[0-9]{8}$' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'bad_number');
  end if;

  -- At most two rows are read: one is an answer, two is "shared".
  select pg_catalog.array_agg(m.id) into v_ids
    from (select p.id
            from public.profiles p
           where p.phone_verified_at is not null
             and p.phone in (v_phone,
                             pg_catalog.substr(v_phone, 2),
                             '0' || pg_catalog.substr(v_phone, 5))
           limit 2) m;
  if coalesce(pg_catalog.array_length(v_ids, 1), 0) = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  if pg_catalog.array_length(v_ids, 1) > 1 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'shared');
  end if;

  -- to_jsonb keeps this readable whichever optional GoTrue columns exist.
  select pg_catalog.to_jsonb(u.*) into v_user from auth.users u where u.id = v_ids[1];
  if v_user is null or (v_user ->> 'deleted_at') is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  -- An SSO row cannot sign in with a password, and its address may also
  -- belong to a separate non-SSO row: never hand it out.
  if coalesce((v_user ->> 'is_sso_user')::boolean, false) then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'sso');
  end if;
  if coalesce(v_user ->> 'email', '') = '' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_email');
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'user_id', v_ids[1], 'email', v_user ->> 'email');
end
$fn$;

comment on function public.phone_sign_in_target(text) is
  '20261208_20 (batch l18): {ok, user_id, email} when exactly one account has this Saudi mobile (E.164) confirmed (profiles.phone + phone_verified_at) and is not deleted / SSO; otherwise {ok: false}. The reason is for tests only — the app never returns it. service_role only.';

-- ── 2b. the WhatsApp reset, found by the number ─────────────────────────────
create or replace function public.pw_reset_target_by_phone(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_found jsonb;
  v_reset jsonb;
begin
  v_found := public.phone_sign_in_target(p_phone);
  if coalesce((v_found ->> 'ok')::boolean, false) is not true then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', coalesce(v_found ->> 'reason', 'no_account'));
  end if;
  -- Every rule of the reset by e-mail, and the same account it picks.
  v_reset := public.pw_reset_target(v_found ->> 'email');
  if coalesce((v_reset ->> 'ok')::boolean, false) is not true then
    return v_reset;
  end if;
  if (v_reset ->> 'user_id') is distinct from (v_found ->> 'user_id') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'other_account');
  end if;
  return v_reset;
end
$fn$;

comment on function public.pw_reset_target_by_phone(text) is
  '20261208_20 (batch l18): pw_reset_target(email) for the one account that has this mobile confirmed (phone_sign_in_target), and only when pw_reset_target picks that same account; otherwise {ok: false}. service_role only.';

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.phone_sign_in_target(text)',
    'public.pw_reset_target_by_phone(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- ── 3. verify — raises, so a half-applied file cannot look successful ───────
do $verify$
declare
  missing text := '';
  f text;
begin
  foreach f in array array[
    'public.phone_sign_in_target(text)',
    'public.pw_reset_target_by_phone(text)'] loop
    if to_regprocedure(f) is null then
      raise exception 'l18_phone_login verify FAILED: % is missing', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      missing := missing || format(' a session may execute %s;', f);
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      missing := missing || format(' service_role cannot execute %s;', f);
    end if;
    if not exists (select 1 from pg_proc where oid = f::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      missing := missing || format(' %s is not SECURITY DEFINER with an empty search_path;', f);
    end if;
  end loop;

  -- One number, one account: the "shared" refusal must be in the resolver,
  -- and the reset by number must go through the reset-by-e-mail rules.
  if position('''shared''' in pg_catalog.pg_get_functiondef('public.phone_sign_in_target(text)'::regprocedure)) = 0
     or position('phone_verified_at is not null' in pg_catalog.pg_get_functiondef('public.phone_sign_in_target(text)'::regprocedure)) = 0 then
    missing := missing || ' phone_sign_in_target lost the exactly-one rule;';
  end if;
  if position('public.pw_reset_target(' in pg_catalog.pg_get_functiondef('public.pw_reset_target_by_phone(text)'::regprocedure)) = 0 then
    missing := missing || ' pw_reset_target_by_phone does not apply pw_reset_target;';
  end if;
  if to_regclass('public.profiles_confirmed_phone_idx') is null then
    missing := missing || ' profiles_confirmed_phone_idx is missing;';
  end if;

  if missing <> '' then
    raise exception 'l18_phone_login verify FAILED:%', missing;
  end if;
  raise notice 'l18_phone_login verify: OK — phone_sign_in_target / pw_reset_target_by_phone are service_role only; a mobile finds an account only when exactly one account has it confirmed';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261208_20 phone_sign_in_resolver' as migration, true as ok;
