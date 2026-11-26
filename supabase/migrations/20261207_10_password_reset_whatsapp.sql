-- =============================================================================
-- Migration: 20261207_10_password_reset_whatsapp.sql   (batch l17, verify id: l17_pwreset)
-- =============================================================================
-- PURPOSE
--   «نسيت كلمة المرور» gains a second way: a six-digit code sent over WhatsApp
--   (the same Zernio template as the sign-up code) to the mobile ALREADY
--   CONFIRMED on the account (profiles.phone with profiles.phone_verified_at
--   set). The person types only the e-mail; the number is never typed and
--   never shown.
--
--   1. public.password_reset_challenges — the reset codes, in their OWN table
--      so a sign-up code (public.phone_otp_challenges, 20261205_10) can never
--      reset a password and a reset code can never confirm a mobile. The app
--      also binds each HMAC to its purpose ("password_reset" vs "phone").
--      Keyed HMAC of the code and of the number only, a short hint, 5
--      attempts, 10-minute expiry, delivery. Server-only: RLS on, no policies,
--      no privilege for anon / authenticated.
--   2. Three SECURITY DEFINER functions, service_role only:
--        pw_reset_target(email) → {ok, user_id, phone} only for an account
--          that may receive a reset code: found by its e-mail (not an SSO
--          row, not deleted), a confirmed mobile, not staff (user_type admin
--          or a platform_staff row), not banned. Otherwise {ok: false}. The
--          app adds the suspension / freeze copies in app_metadata and never
--          tells the caller which case it was;
--        pw_reset_issue(user, target hash, hint, code hash) → the sign-up
--          code's limits, counted on this table: 60 s between two codes, 5 per
--          hour and 10 per 24 h per account, 10 per 24 h to one number; a
--          failed delivery counts for none of these;
--        pw_reset_verify(user, target hash, phone, code hash) → under the
--          account's lock: a hit (open, not a failed delivery, same number,
--          the profile still holds that number AND it is still confirmed)
--          consumes every open reset code of the account; a miss adds an
--          attempt to every open reset code (5 = dead). The password itself
--          is set by the app with the auth admin API after a hit.
--   3. Verify block — RAISES unless all of the above holds.
--
-- HOW TO RUN (on the server, from the project folder):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261207_10_password_reset_whatsapp.sql
--   Expect: NOTICE  l17_pwreset verify: OK …   and a final row with `t`.
--
-- RUN ORDER: after 20261205_10_phone_otp.sql (profiles.phone_verified_at) and
--   20260627 (platform_settings). BEFORE the deploy of batch l17 — until it
--   runs, «start» still gives its uniform answer but no code can be issued,
--   and «verify» answers «الخدمة غير متاحة مؤقتًا» (the choice is hidden
--   anyway while the sign-up WhatsApp switch is off). Then _verify.sql (block
--   l17_pwreset) after the deploy.
-- SAFE TO RE-RUN: yes (if not exists / create or replace).
-- ROLLBACK (turning the sign-up WhatsApp switch off already hides the choice):
--   drop function if exists public.pw_reset_verify(uuid, text, text, text);
--   drop function if exists public.pw_reset_issue(uuid, text, text, text);
--   drop function if exists public.pw_reset_target(text);
--   drop table if exists public.password_reset_challenges;
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null then
    raise exception '20261207_10: public.profiles / auth.users are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_verified_at') then
    raise exception '20261207_10: profiles.phone_verified_at is missing (run 20261205_10_phone_otp.sql first)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    raise exception '20261207_10: auth.users.email is missing';
  end if;
end
$pre$;

-- ── 1. the reset codes (server-only) ────────────────────────────────────────
create table if not exists public.password_reset_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  channel      text not null default 'whatsapp',
  target_hash  text not null,
  target_hint  text,
  code_hash    text not null,
  attempts     integer not null default 0,
  delivery     text not null default 'pending',
  expires_at   timestamptz not null default (now() + interval '10 minutes'),
  consumed_at  timestamptz,
  created_at   timestamptz not null default now(),
  constraint prc_channel check (channel = 'whatsapp'),
  constraint prc_attempts check (attempts between 0 and 5),
  constraint prc_delivery check (delivery in ('pending', 'sent', 'failed')),
  constraint prc_hashes check (code_hash ~ '^[0-9a-f]{64}$' and target_hash ~ '^[0-9a-f]{64}$'),
  constraint prc_hint check (target_hint is null or pg_catalog.length(target_hint) <= 40)
);

create index if not exists password_reset_challenges_user_idx on public.password_reset_challenges (user_id, created_at desc);
create index if not exists password_reset_challenges_target_idx on public.password_reset_challenges (target_hash, created_at desc);

comment on table public.password_reset_challenges is
  '20261207_10 (batch l17): WhatsApp password-reset codes — HMAC of the code and of the number only, 10-minute expiry, 5 attempts. Separate from phone_otp_challenges (sign-up) so the two kinds can never stand in for each other. Server-only: RLS on, no policies, no privilege for anon/authenticated.';

alter table public.password_reset_challenges enable row level security;
revoke all on public.password_reset_challenges from public, anon, authenticated;
grant all on public.password_reset_challenges to service_role;

-- ── 2a. who may receive a reset code ────────────────────────────────────────
create or replace function public.pw_reset_target(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_email   text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_email, '')));
  v_user    jsonb;
  v_id      uuid;
  v_profile jsonb;
begin
  if v_email = '' or pg_catalog.strpos(v_email, '@') = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;

  -- to_jsonb keeps this readable whichever optional GoTrue columns exist.
  select pg_catalog.to_jsonb(u.*) into v_user
    from auth.users u
   where pg_catalog.lower(u.email) = v_email
     and coalesce((pg_catalog.to_jsonb(u.*) ->> 'is_sso_user')::boolean, false) = false
   limit 1;
  if v_user is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  v_id := (v_user ->> 'id')::uuid;
  if v_user ->> 'deleted_at' is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'deleted');
  end if;
  if (v_user ->> 'banned_until') is not null and (v_user ->> 'banned_until')::timestamptz > pg_catalog.now() then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'banned');
  end if;

  select pg_catalog.to_jsonb(p.*) into v_profile from public.profiles p where p.id = v_id;
  if v_profile is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;
  if v_profile ->> 'user_type' = 'admin' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'staff');
  end if;
  if to_regclass('public.platform_staff') is not null then
    if exists (select 1 from public.platform_staff ps where ps.user_id = v_id) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'staff');
    end if;
  end if;
  if coalesce(v_profile ->> 'phone', '') = '' or v_profile ->> 'phone_verified_at' is null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'no_confirmed_phone');
  end if;

  return pg_catalog.jsonb_build_object('ok', true, 'user_id', v_id, 'phone', v_profile ->> 'phone');
end
$fn$;

comment on function public.pw_reset_target(text) is
  '20261207_10: {ok, user_id, phone} for an account that may receive a WhatsApp password-reset code (found by e-mail, not SSO, not deleted, not banned, not staff, confirmed mobile); otherwise {ok: false}. The reason is for tests only — the app never returns it. service_role only.';

-- ── 2b. issue a reset code (limits, then insert) ────────────────────────────
create or replace function public.pw_reset_issue(
  p_user uuid, p_target_hash text, p_target_hint text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_last  timestamptz;
  v_n     integer;
  v_old   timestamptz;
  v_id    uuid;
  v_exp   timestamptz;
begin
  if p_user is null or p_target_hash is null or p_code_hash is null then
    raise exception 'pw_reset_issue: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pw_reset:' || p_user::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pw_reset_target:' || p_target_hash, 0));

  select max(created_at) into v_last from public.password_reset_challenges
   where user_id = p_user and delivery <> 'failed';
  if v_last is not null and v_last > pg_catalog.now() - interval '60 seconds' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'cooldown');
  end if;

  select count(*)::integer, min(created_at) into v_n, v_old from public.password_reset_challenges
   where user_id = p_user and delivery <> 'failed' and created_at > pg_catalog.now() - interval '1 hour';
  if v_n >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_limit');
  end if;

  select count(*)::integer into v_n from public.password_reset_challenges
   where user_id = p_user and delivery <> 'failed' and created_at > pg_catalog.now() - interval '24 hours';
  if v_n >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'daily_limit');
  end if;

  select count(*)::integer into v_n from public.password_reset_challenges
   where target_hash = p_target_hash and delivery <> 'failed' and created_at > pg_catalog.now() - interval '24 hours';
  if v_n >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'target_limit');
  end if;

  insert into public.password_reset_challenges (user_id, target_hash, target_hint, code_hash)
  values (p_user, p_target_hash, p_target_hint, p_code_hash)
  returning id, expires_at into v_id, v_exp;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_exp);
end
$fn$;

comment on function public.pw_reset_issue(uuid, text, text, text) is
  '20261207_10: issue a WhatsApp password-reset code — 60 s cooldown, 5 per hour and 10 per 24 h per account, 10 per 24 h per number; failed deliveries count for none. Hashes only. service_role only.';

-- ── 2c. verify a reset code (atomic, single use) ────────────────────────────
create or replace function public.pw_reset_verify(
  p_user uuid, p_target_hash text, p_phone text, p_code_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_hit  uuid;
  v_open integer;
  v_max  integer;
begin
  if p_user is null or p_target_hash is null or p_phone is null or p_code_hash is null then
    raise exception 'pw_reset_verify: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pw_reset:' || p_user::text, 0));

  select c.id into v_hit
    from public.password_reset_challenges c
   where c.user_id = p_user and c.target_hash = p_target_hash and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5
     and c.code_hash = p_code_hash
   order by c.created_at desc
   limit 1;

  if v_hit is not null then
    -- Every open reset code of the account is spent by this answer, hit or not.
    update public.password_reset_challenges
       set consumed_at = pg_catalog.now()
     where user_id = p_user and consumed_at is null;
    -- Only while the profile still holds that number, still confirmed.
    if not exists (select 1 from public.profiles p
                    where p.id = p_user and p.phone = p_phone and p.phone_verified_at is not null) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'phone_changed');
    end if;
    return pg_catalog.jsonb_build_object('ok', true);
  end if;

  select count(*)::integer into v_open from public.password_reset_challenges c
   where c.user_id = p_user and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5;
  if v_open = 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update public.password_reset_challenges c
     set attempts = c.attempts + 1
   where c.user_id = p_user and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5;
  select max(c.attempts) into v_max from public.password_reset_challenges c
   where c.user_id = p_user and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now();
  return pg_catalog.jsonb_build_object('ok', false, 'reason', 'wrong', 'attempts_left', greatest(0, 5 - coalesce(v_max, 5)));
end
$fn$;

comment on function public.pw_reset_verify(uuid, text, text, text) is
  '20261207_10: verify a WhatsApp password-reset code under the account''s lock — a hit (open, not a failed delivery, same number, the profile still holds it confirmed) consumes every open reset code; a miss adds one attempt to every open reset code (5 = dead). Never touches phone_otp_challenges. service_role only.';

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.pw_reset_target(text)',
    'public.pw_reset_issue(uuid, text, text, text)',
    'public.pw_reset_verify(uuid, text, text, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- ── 3. verify — raises, so a half-applied file cannot look successful ───────
do $verify$
declare
  missing text := '';
  r text;
  c text;
  f text;
begin
  if to_regclass('public.password_reset_challenges') is null then
    raise exception 'l17_pwreset verify FAILED: password_reset_challenges is missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.password_reset_challenges'::regclass) then
    missing := missing || ' RLS is off on password_reset_challenges;';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.password_reset_challenges'::regclass) then
    missing := missing || ' password_reset_challenges has a policy;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.password_reset_challenges', c)
         or (c <> 'DELETE' and has_any_column_privilege(r, 'public.password_reset_challenges', c)) then
        missing := missing || format(' %s holds %s on password_reset_challenges;', r, c);
      end if;
    end loop;
  end loop;

  foreach f in array array[
    'public.pw_reset_target(text)',
    'public.pw_reset_issue(uuid, text, text, text)',
    'public.pw_reset_verify(uuid, text, text, text)'] loop
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

  -- The reset verifier must never read or write the sign-up codes.
  if position('phone_otp_challenges' in pg_catalog.pg_get_functiondef('public.pw_reset_verify(uuid, text, text, text)'::regprocedure)) > 0 then
    missing := missing || ' pw_reset_verify reads the sign-up codes;';
  end if;

  if missing <> '' then
    raise exception 'l17_pwreset verify FAILED:%', missing;
  end if;
  raise notice 'l17_pwreset verify: OK — password_reset_challenges is server-only, pw_reset_target / pw_reset_issue / pw_reset_verify are service_role only, the reset codes are kept apart from the sign-up codes';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261207_10 password_reset_whatsapp' as migration, true as ok;
