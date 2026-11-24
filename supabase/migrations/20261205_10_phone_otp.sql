-- =============================================================================
-- Migration: 20261205_10_phone_otp.sql   (batch l15, verify id: l15_phone_otp)
-- =============================================================================
-- PURPOSE (user decisions 2026-11-24; owner decision ٢٧ changed by the user:
-- the e-mail code → a WhatsApp code for every sign-up)
--
--   New accounts confirm their MOBILE with a six-digit code sent over WhatsApp
--   (Zernio, the approved AUTHENTICATION template) instead of the e-mail
--   confirmation. Only accounts created at or after the moment the admin turns
--   the switch on are held; older accounts, staff and test accounts are not.
--
--   1. public.profiles.phone_verified_at timestamptz — when the mobile in
--      profiles.phone was confirmed. Server-write-only: no API role holds an
--      UPDATE privilege on it (20261016_02 grants columns one by one and this
--      one is not among them), and trg_phone_verified_guard refuses a session
--      that sets it anyway. Any change of profiles.phone clears it.
--   2. public.phone_otp_challenges — the codes: a keyed HMAC of the code and of
--      the number only (never the code, never the number), a short hint for
--      the screen, attempts (5), 10-minute expiry, delivery. Server-only: RLS
--      on, no policies, no privilege for anon / authenticated.
--   3. Three SECURITY DEFINER functions, service_role only:
--        phone_otp_issue(user, target hash, hint, code hash) → under the
--          account's and the number's advisory locks: 60 s between two codes, 5 per hour and 10 per 24 h
--          per account, 10 per 24 h to one number across ALL accounts. A code
--          whose delivery failed counts for none of these (a provider outage
--          must not use up a person's tries; the route's per-process limits
--          bound the retries);
--        phone_otp_verify(user, target hash, phone, code hash) → under the
--          same lock: a hit (not a failed delivery, open, same number) consumes every open code
--          of the account and stamps profiles.phone_verified_at — only while
--          profiles.phone is still the number the code went to; a miss adds an
--          attempt to every open code (5 = dead);
--        phone_otp_gate(user) → {gated, reason}: is this account held until
--          its mobile is confirmed? The switch (platform_settings
--          signup_phone_otp), the account's creation time against enabled_at,
--          staff, test accounts, and phone_verified_at.
--   4. platform_settings 'signup_phone_otp' = {"enabled": false,
--      "enabled_at": null} (added once, never overwritten). A BEFORE trigger
--      stamps enabled_at = now() the FIRST time the switch is stored on and
--      keeps that moment on every later write — whoever writes the row (the
--      admin route posts {"enabled": bool} only). To move the cutoff on
--      purpose: delete the row, then turn the switch on again.
--   5. Verify block — RAISES unless all of the above holds.
--
-- ORDER: after 20261016_02 (profiles column grants), 20260627 (platform_settings)
--        and 20261127_80 (test_accounts / is_demo). BEFORE the deploy of batch
--        l15: the new routes answer «الخدمة غير متاحة مؤقتاً» until it runs, and
--        the proxy holds nobody while the setting is missing or off.
--        Then: deploy → the env variables → the admin's test send → the switch
--        on → GoTrue ENABLE_EMAIL_AUTOCONFIRM=true last.
-- SAFE TO RE-RUN: yes (if not exists / create or replace / on conflict do nothing).
-- ROLLBACK (turning the switch off in the admin settings is enough to stop it):
--   drop function if exists public.phone_otp_gate(uuid);
--   drop function if exists public.phone_otp_verify(uuid, text, text, text);
--   drop function if exists public.phone_otp_issue(uuid, text, text, text);
--   drop table if exists public.phone_otp_challenges;
--   drop trigger if exists trg_phone_verified_guard on public.profiles;
--   drop function if exists public.phone_verified_guard();
--   drop trigger if exists trg_signup_phone_otp_setting on public.platform_settings;
--   drop function if exists public.signup_phone_otp_setting_stamp();
--   delete from public.platform_settings where key = 'signup_phone_otp';
--   alter table public.profiles drop column if exists phone_verified_at;
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── 0. preconditions ────────────────────────────────────────────────────────
do $pre$
begin
  if to_regclass('public.profiles') is null or to_regclass('auth.users') is null then
    raise exception '20261205_10: public.profiles / auth.users are missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone') then
    raise exception '20261205_10: profiles.phone is missing (run 20260827_signup_contact_fields.sql first)';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'auth' and table_name = 'users' and column_name = 'created_at') then
    raise exception '20261205_10: auth.users.created_at is missing';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261205_10: public.platform_settings is missing (run 20260627_platform_settings.sql first)';
  end if;
  if to_regclass('public.test_accounts') is null then
    raise exception '20261205_10: public.test_accounts is missing (run 20261017_44_test_accounts_never_listed.sql first)';
  end if;
end
$pre$;

-- ── 1. profiles.phone_verified_at (server-write-only) ───────────────────────
alter table public.profiles add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.phone_verified_at is
  '20261205_10 (batch l15): when the mobile in profiles.phone was confirmed by a WhatsApp code. SERVER-WRITE-ONLY: no API role may UPDATE it; trg_phone_verified_guard refuses a session that tries and clears it whenever profiles.phone changes.';

-- Belt and braces: 20261016_02 re-grants UPDATE column by column, so this
-- column already has none — a later accidental table-level grant still cannot
-- let a session stamp itself.
create or replace function public.phone_verified_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  if new.phone is distinct from old.phone then
    -- A new number is not a confirmed number, whoever changes it.
    new.phone_verified_at := null;
    return new;
  end if;
  if new.phone_verified_at is distinct from old.phone_verified_at
     and new.phone_verified_at is not null
     and current_user in ('anon', 'authenticated') then
    raise exception 'phone_verified_at is set by the server only'
      using errcode = '42501';
  end if;
  return new;
end
$fn$;

comment on function public.phone_verified_guard() is
  '20261205_10: BEFORE UPDATE on profiles — a change of phone clears phone_verified_at; a session (anon / authenticated) cannot set it.';

drop trigger if exists trg_phone_verified_guard on public.profiles;
create trigger trg_phone_verified_guard
  before update on public.profiles
  for each row execute function public.phone_verified_guard();

-- ── 2. the codes (server-only) ──────────────────────────────────────────────
create table if not exists public.phone_otp_challenges (
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
  constraint poc_channel check (channel = 'whatsapp'),
  constraint poc_attempts check (attempts between 0 and 5),
  constraint poc_delivery check (delivery in ('pending', 'sent', 'failed')),
  constraint poc_hashes check (code_hash ~ '^[0-9a-f]{64}$' and target_hash ~ '^[0-9a-f]{64}$'),
  constraint poc_hint check (target_hint is null or pg_catalog.length(target_hint) <= 40)
);

create index if not exists phone_otp_challenges_user_idx on public.phone_otp_challenges (user_id, created_at desc);
create index if not exists phone_otp_challenges_target_idx on public.phone_otp_challenges (target_hash, created_at desc);

comment on table public.phone_otp_challenges is
  '20261205_10 (batch l15): WhatsApp sign-up codes — HMAC of the code and of the number only (never the code or the number), 10-minute expiry, 5 attempts. Server-only: RLS on, no policies, no privilege for anon/authenticated.';

alter table public.phone_otp_challenges enable row level security;
revoke all on public.phone_otp_challenges from public, anon, authenticated;
grant all on public.phone_otp_challenges to service_role;

-- ── 3a. issue a code (limits, then insert) ──────────────────────────────────
create or replace function public.phone_otp_issue(
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
    raise exception 'phone_otp_issue: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phone_otp:' || p_user::text, 0));
  -- The per-number cap counts across accounts: the number's own lock makes it
  -- exact under concurrency (always user lock, then number lock — one order).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phone_otp_target:' || p_target_hash, 0));

  -- A code whose delivery failed reached nobody: it counts for no limit.
  select max(created_at) into v_last from public.phone_otp_challenges
   where user_id = p_user and delivery <> 'failed';
  if v_last is not null and v_last > pg_catalog.now() - interval '60 seconds' then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'cooldown',
      'retry_after', greatest(1, pg_catalog.ceil(60 - extract(epoch from pg_catalog.now() - v_last)))::integer);
  end if;

  select count(*)::integer, min(created_at) into v_n, v_old from public.phone_otp_challenges
   where user_id = p_user and delivery <> 'failed' and created_at > pg_catalog.now() - interval '1 hour';
  if v_n >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'user_limit',
      'retry_after', greatest(1, pg_catalog.ceil(3600 - extract(epoch from pg_catalog.now() - v_old)))::integer);
  end if;

  select count(*)::integer, min(created_at) into v_n, v_old from public.phone_otp_challenges
   where user_id = p_user and delivery <> 'failed' and created_at > pg_catalog.now() - interval '24 hours';
  if v_n >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'daily_limit',
      'retry_after', greatest(1, pg_catalog.ceil(86400 - extract(epoch from pg_catalog.now() - v_old)))::integer);
  end if;

  select count(*)::integer into v_n from public.phone_otp_challenges
   where target_hash = p_target_hash and delivery <> 'failed' and created_at > pg_catalog.now() - interval '24 hours';
  if v_n >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'target_limit', 'retry_after', 3600);
  end if;

  insert into public.phone_otp_challenges (user_id, target_hash, target_hint, code_hash)
  values (p_user, p_target_hash, p_target_hint, p_code_hash)
  returning id, expires_at into v_id, v_exp;

  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_exp);
end
$fn$;

comment on function public.phone_otp_issue(uuid, text, text, text) is
  '20261205_10: issue a WhatsApp sign-up code — 60 s cooldown, 5 per hour and 10 per 24 h per account, 10 per 24 h per number across all accounts; failed deliveries count for none. Stores hashes only. service_role only.';

-- ── 3b. verify a code (atomic) ──────────────────────────────────────────────
create or replace function public.phone_otp_verify(
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
  v_rows integer;
begin
  if p_user is null or p_target_hash is null or p_phone is null or p_code_hash is null then
    raise exception 'phone_otp_verify: bad arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('phone_otp:' || p_user::text, 0));

  select c.id into v_hit
    from public.phone_otp_challenges c
   where c.user_id = p_user and c.target_hash = p_target_hash and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5
     and c.code_hash = p_code_hash
   order by c.created_at desc
   limit 1;

  if v_hit is not null then
    -- Only while the profile still holds the number the code went to.
    update public.profiles
       set phone_verified_at = pg_catalog.now()
     where id = p_user and phone = p_phone;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'phone_changed');
    end if;
    update public.phone_otp_challenges
       set consumed_at = pg_catalog.now()
     where user_id = p_user and consumed_at is null;
    return pg_catalog.jsonb_build_object('ok', true);
  end if;

  select count(*)::integer into v_open from public.phone_otp_challenges c
   where c.user_id = p_user and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5;
  if v_open = 0 then
    if exists (select 1 from public.phone_otp_challenges c
                where c.user_id = p_user and c.delivery <> 'failed'
                  and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts >= 5) then
      return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked');
    end if;
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update public.phone_otp_challenges c
     set attempts = c.attempts + 1
   where c.user_id = p_user and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now() and c.attempts < 5;
  select max(c.attempts) into v_max from public.phone_otp_challenges c
   where c.user_id = p_user and c.delivery <> 'failed'
     and c.consumed_at is null and c.expires_at > pg_catalog.now();
  return pg_catalog.jsonb_build_object('ok', false, 'reason', 'wrong', 'attempts_left', greatest(0, 5 - coalesce(v_max, 5)));
end
$fn$;

comment on function public.phone_otp_verify(uuid, text, text, text) is
  '20261205_10: verify a WhatsApp sign-up code under an advisory lock — a hit (not a failed delivery, open, same number, profiles.phone unchanged) consumes every open code and stamps profiles.phone_verified_at; a miss adds one attempt to every open code (5 = dead). service_role only.';

-- ── 3c. is this account held until its mobile is confirmed? ─────────────────
create or replace function public.phone_otp_gate(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_value    jsonb;
  v_enabled  boolean := false;
  v_since    timestamptz;
  v_created  timestamptz;
  v_profile  jsonb;
begin
  if p_user is null then
    return pg_catalog.jsonb_build_object('gated', false, 'reason', 'no_user');
  end if;
  select s.value into v_value from public.platform_settings s where s.key = 'signup_phone_otp';
  if pg_catalog.jsonb_typeof(v_value) = 'object' and pg_catalog.jsonb_typeof(v_value -> 'enabled') = 'boolean' then
    v_enabled := (v_value ->> 'enabled')::boolean;
  end if;
  begin
    v_since := (v_value ->> 'enabled_at')::timestamptz;
  exception when others then
    v_since := null;
  end;
  if not v_enabled or v_since is null then
    return pg_catalog.jsonb_build_object('gated', false, 'reason', 'off');
  end if;

  select u.created_at into v_created from auth.users u where u.id = p_user;
  if v_created is null or v_created < v_since then
    return pg_catalog.jsonb_build_object('gated', false, 'reason', 'before_switch', 'enabled_at', v_since);
  end if;

  select pg_catalog.to_jsonb(p.*) into v_profile from public.profiles p where p.id = p_user;
  if v_profile ->> 'user_type' = 'admin' then
    return pg_catalog.jsonb_build_object('gated', false, 'reason', 'staff');
  end if;
  if to_regclass('public.platform_staff') is not null then
    if exists (select 1 from public.platform_staff ps where ps.user_id = p_user) then
      return pg_catalog.jsonb_build_object('gated', false, 'reason', 'staff');
    end if;
  end if;
  if v_profile ->> 'is_demo' = 'true'
     or exists (select 1 from public.test_accounts t where t.user_id = p_user) then
    return pg_catalog.jsonb_build_object('gated', false, 'reason', 'test_account');
  end if;
  if v_profile ->> 'phone_verified_at' is not null then
    return pg_catalog.jsonb_build_object('gated', false, 'reason', 'verified');
  end if;
  return pg_catalog.jsonb_build_object('gated', true, 'reason', 'unverified', 'enabled_at', v_since);
end
$fn$;

comment on function public.phone_otp_gate(uuid) is
  '20261205_10: {gated, reason} — held until the mobile is confirmed only when signup_phone_otp is on, the account was created at/after enabled_at, it is not staff (user_type admin / platform_staff) nor a test account (test_accounts / is_demo), and phone_verified_at is null. service_role only.';

do $grants$
declare
  f text;
begin
  foreach f in array array[
    'public.phone_otp_issue(uuid, text, text, text)',
    'public.phone_otp_verify(uuid, text, text, text)',
    'public.phone_otp_gate(uuid)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$grants$;

-- ── 4. the switch: off by default; enabled_at stamped once, by the database ─
create or replace function public.signup_phone_otp_setting_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
declare
  v_enabled boolean := false;
  v_prev    timestamptz;
begin
  if new.key is distinct from 'signup_phone_otp' then
    return new;
  end if;
  if pg_catalog.jsonb_typeof(new.value) is distinct from 'object' then
    new.value := '{}'::jsonb;
  end if;
  if pg_catalog.jsonb_typeof(new.value -> 'enabled') = 'boolean' then
    v_enabled := (new.value ->> 'enabled')::boolean;
  end if;
  if tg_op = 'UPDATE' and pg_catalog.jsonb_typeof(old.value) = 'object' then
    begin
      v_prev := (old.value ->> 'enabled_at')::timestamptz;
    exception when others then
      v_prev := null;
    end;
  end if;
  new.value := new.value
    || pg_catalog.jsonb_build_object('enabled', v_enabled)
    || pg_catalog.jsonb_build_object('enabled_at',
         case when v_prev is not null then pg_catalog.to_jsonb(v_prev)
              when v_enabled then pg_catalog.to_jsonb(pg_catalog.now())
              else 'null'::jsonb end);
  return new;
end
$fn$;

comment on function public.signup_phone_otp_setting_stamp() is
  '20261205_10: BEFORE INSERT/UPDATE on platform_settings for key signup_phone_otp — enabled_at is the moment the switch was FIRST stored on and is never overwritten; a posted enabled_at is ignored.';

drop trigger if exists trg_signup_phone_otp_setting on public.platform_settings;
create trigger trg_signup_phone_otp_setting
  before insert or update on public.platform_settings
  for each row execute function public.signup_phone_otp_setting_stamp();

insert into public.platform_settings (key, value, description)
values ('signup_phone_otp', '{"enabled": false, "enabled_at": null}'::jsonb,
        'l15 (20261205_10): رمز التحقق عبر واتساب عند التسجيل — {"enabled": bool, "enabled_at": أول لحظة تشغيل}. الحسابات المنشأة بعد enabled_at تؤكّد جوالها قبل استعمال المنصة.')
on conflict (key) do nothing;

-- ── 5. verify — raises, so a half-applied file cannot look successful ───────
do $verify$
declare
  missing text := '';
  r text;
  c text;
  f text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'phone_verified_at') then
    missing := missing || ' profiles.phone_verified_at is missing;';
  else
    foreach r in array array['anon', 'authenticated'] loop
      if has_column_privilege(r, 'public.profiles', 'phone_verified_at', 'UPDATE')
         or has_column_privilege(r, 'public.profiles', 'phone_verified_at', 'INSERT') then
        missing := missing || format(' %s may write profiles.phone_verified_at;', r);
      end if;
    end loop;
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.profiles'::regclass and tgname = 'trg_phone_verified_guard' and not tgisinternal) then
    missing := missing || ' trg_phone_verified_guard is missing;';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.phone_otp_challenges'::regclass) then
    missing := missing || ' RLS is off on phone_otp_challenges;';
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.phone_otp_challenges'::regclass) then
    missing := missing || ' phone_otp_challenges has a policy;';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach c in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.phone_otp_challenges', c)
         or (c <> 'DELETE' and has_any_column_privilege(r, 'public.phone_otp_challenges', c)) then
        missing := missing || format(' %s holds %s on phone_otp_challenges;', r, c);
      end if;
    end loop;
  end loop;

  foreach f in array array[
    'public.phone_otp_issue(uuid, text, text, text)',
    'public.phone_otp_verify(uuid, text, text, text)',
    'public.phone_otp_gate(uuid)'] loop
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

  if not exists (select 1 from public.platform_settings where key = 'signup_phone_otp') then
    missing := missing || ' the signup_phone_otp setting row is missing;';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgrelid = 'public.platform_settings'::regclass and tgname = 'trg_signup_phone_otp_setting' and not tgisinternal) then
    missing := missing || ' trg_signup_phone_otp_setting is missing;';
  end if;

  if missing <> '' then
    raise exception '20261205_10 phone_otp verify FAILED:%', missing;
  end if;
  raise notice '20261205_10 phone_otp verify: OK — profiles.phone_verified_at is server-only, the codes are server-only, the three functions are service_role only, the switch row exists (enabled: %)',
    coalesce((select value ->> 'enabled' from public.platform_settings where key = 'signup_phone_otp'), '?');
end
$verify$;

-- PostgREST: see the new column, table and functions now.
notify pgrst, 'reload schema';

commit;

select '20261205_10 phone_otp' as migration, true as ok;
