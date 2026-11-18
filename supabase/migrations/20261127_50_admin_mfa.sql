-- =============================================================================
-- Migration: 20261127_50_admin_mfa.sql
-- =============================================================================
-- PURPOSE (batch l7-admin2fa, owner item 18 — admin security)
--   Mandatory two-step sign-in (TOTP, GoTrue MFA) for every admin/staff
--   account. The app gates (src/proxy.ts, requireAdmin/requireStaff,
--   assertRole) enforce it on pages and routes; this file adds the database
--   half, so a stolen password alone cannot use an admin's RLS powers by
--   calling PostgREST directly.
--
--   1. public.is_admin() — re-created from its LATEST definition
--      (20260625_fix_rls_recursion.sql:16-26, the only one) with one added
--      condition: an admin who HAS a verified MFA factor (auth.mfa_factors,
--      status 'verified') counts as admin only when the request's JWT says
--      aal = 'aal2'. An admin with no verified factor is unchanged, so this
--      bites nobody until he enrols (GoTrue's documented RLS pattern). Every
--      policy and SECURITY DEFINER function that asks is_admin() follows.
--   2. public.admin_mfa_backup_codes — the 10 one-time backup codes, stored
--      as SHA-256 hashes only (src/lib/auth/staffBackupCodes.ts). Service
--      role only: RLS on, no policy, nothing granted to anon/authenticated.
--   3. public.admin_mfa_events — the trail: each sign-in session of a staff
--      account (one 'login' row per GoTrue session — the new-login e-mail
--      fires on the insert), codes generated / used / refused, factor reset.
--      Service role only.
--   4. Functions (SECURITY DEFINER, search_path '', service role only):
--        admin_mfa_backup_codes_replace(p_user uuid, p_hashes text[]) → int
--          replaces the whole set (exactly 10 distinct sha-256 hex hashes);
--          refuses (42501) an account whose profiles.user_type is not admin.
--        admin_mfa_backup_code_consume(p_user uuid, p_hash text) → text
--          'ok' (marked used in ONE update … where used_at is null),
--          'invalid' (logged as backup_code_failed), or 'locked' after 5
--          refused codes in 15 minutes.
--        admin_login_seen(p_user, p_session uuid, p_ip, p_device, p_trigger)
--          → boolean: true only the FIRST time a session is recorded.
--
-- HOW TO RUN (BEFORE or AFTER the deploy — the code degrades honestly while
--   it is missing: no backup codes («تعذّر حفظ الرموز»), no new-login e-mail;
--   TOTP itself is GoTrue's and works either way):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_50_admin_mfa.sql
--   Expect: NOTICE  20261127_50 verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20260625_fix_rls_recursion (is_admin) and the GoTrue
--   schema (auth.mfa_factors exists on every GoTrue v2 install). Recommended:
--   before the deploy.
--
-- ROLLBACK:
--   create or replace function public.is_admin() returns boolean
--     language sql security definer set search_path = '' as $f$
--       select exists (select 1 from public.profiles where id = auth.uid() and user_type = 'admin');
--     $f$;
--   drop function if exists public.admin_login_seen(uuid, uuid, text, text, text);
--   drop function if exists public.admin_mfa_backup_code_consume(uuid, text);
--   drop function if exists public.admin_mfa_backup_codes_replace(uuid, text[]);
--   drop table if exists public.admin_mfa_events;
--   drop table if exists public.admin_mfa_backup_codes;
--   and remove the verify:l7_admin2fa section from _verify.sql.
--
-- LOST AUTHENTICATOR AND ALL BACKUP CODES (run by the server operator):
--   delete from auth.mfa_factors where user_id = (select id from auth.users where email = '<admin e-mail>');
--   The account is then "not enrolled": it signs in with the password and,
--   if ADMIN_MFA_ENFORCE=required, is sent to /auth/mfa to enrol again.
-- =============================================================================

begin;

-- ─── 1. is_admin(): aal2 once a verified factor exists ──────────────────────
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and user_type = 'admin'
  )
  and (
    coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = auth.uid() and f.status::text = 'verified'
    )
  );
$$;

comment on function public.is_admin() is
  'Bypasses RLS to check if the current user is an admin. Since 20261127_50: an admin with a verified MFA factor counts only on an aal2 session.';

-- ─── 2. Backup codes (hashes only) ──────────────────────────────────────────
create table if not exists public.admin_mfa_backup_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  constraint admin_mfa_backup_codes_user_hash_key unique (user_id, code_hash)
);
create index if not exists admin_mfa_backup_codes_unused_idx
  on public.admin_mfa_backup_codes (user_id) where used_at is null;

alter table public.admin_mfa_backup_codes enable row level security;
revoke all on table public.admin_mfa_backup_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_mfa_backup_codes to service_role;

-- ─── 3. The trail ───────────────────────────────────────────────────────────
create table if not exists public.admin_mfa_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in
               ('login', 'backup_codes_generated', 'backup_code_used', 'backup_code_failed', 'factor_reset')),
  session_id uuid,
  ip         text check (ip is null or length(ip) <= 64),
  device     text check (device is null or length(device) <= 80),
  trigger    text check (trigger is null or trigger in ('login', 'admin_api', 'recovery')),
  created_at timestamptz not null default now()
);
create unique index if not exists admin_mfa_events_login_once
  on public.admin_mfa_events (session_id) where kind = 'login';
create index if not exists admin_mfa_events_user_kind_idx
  on public.admin_mfa_events (user_id, kind, created_at desc);

alter table public.admin_mfa_events enable row level security;
revoke all on table public.admin_mfa_events from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_mfa_events to service_role;

-- ─── 4. Functions ───────────────────────────────────────────────────────────
create or replace function public.admin_mfa_backup_codes_replace(p_user uuid, p_hashes text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if p_user is null or p_hashes is null
     or coalesce(array_length(p_hashes, 1), 0) <> 10
     or (select count(distinct h) from unnest(p_hashes) h where h ~ '^[0-9a-f]{64}$') <> 10 then
    raise exception 'admin_mfa_backup_codes_replace: exactly 10 distinct sha-256 hex hashes are required'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user and user_type = 'admin') then
    raise exception 'admin_mfa_backup_codes_replace: not a staff account' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('admin_mfa_codes:' || p_user::text));
  delete from public.admin_mfa_backup_codes where user_id = p_user;
  insert into public.admin_mfa_backup_codes (user_id, code_hash)
    select p_user, h from unnest(p_hashes) h;
  get diagnostics v_n = row_count;
  insert into public.admin_mfa_events (user_id, kind) values (p_user, 'backup_codes_generated');
  return v_n;
end;
$$;

create or replace function public.admin_mfa_backup_code_consume(p_user uuid, p_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_user is null then
    raise exception 'admin_mfa_backup_code_consume: p_user is required' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext('admin_mfa_codes:' || p_user::text));
  if (select count(*) from public.admin_mfa_events
       where user_id = p_user and kind = 'backup_code_failed'
         and created_at > now() - interval '15 minutes') >= 5 then
    return 'locked';
  end if;
  update public.admin_mfa_backup_codes
     set used_at = now()
   where user_id = p_user
     and code_hash = coalesce(p_hash, '')
     and used_at is null
  returning id into v_id;
  if v_id is null then
    insert into public.admin_mfa_events (user_id, kind, trigger) values (p_user, 'backup_code_failed', 'recovery');
    return 'invalid';
  end if;
  insert into public.admin_mfa_events (user_id, kind, trigger) values (p_user, 'backup_code_used', 'recovery');
  return 'ok';
end;
$$;

create or replace function public.admin_login_seen(
  p_user uuid, p_session uuid, p_ip text, p_device text, p_trigger text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_user is null or p_session is null then
    return false;
  end if;
  insert into public.admin_mfa_events (user_id, kind, session_id, ip, device, trigger)
  values (p_user, 'login', p_session, left(p_ip, 64), left(p_device, 80),
          case when p_trigger in ('login', 'admin_api') then p_trigger else null end)
  on conflict (session_id) where kind = 'login' do nothing
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.admin_mfa_backup_codes_replace(uuid, text[]) from public, anon, authenticated;
revoke all on function public.admin_mfa_backup_code_consume(uuid, text) from public, anon, authenticated;
revoke all on function public.admin_login_seen(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_mfa_backup_codes_replace(uuid, text[]) to service_role;
grant execute on function public.admin_mfa_backup_code_consume(uuid, text) to service_role;
grant execute on function public.admin_login_seen(uuid, uuid, text, text, text) to service_role;

-- ─── verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  t text;
  r text;
  p text;
  f text;
begin
  if position('mfa_factors' in pg_get_functiondef('public.is_admin()'::regprocedure)) = 0
     or position('aal2' in pg_get_functiondef('public.is_admin()'::regprocedure)) = 0 then
    missing := missing || ' is_admin() does not ask for aal2;';
  end if;
  if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                    where oid = 'public.is_admin()'::regprocedure), false) then
    missing := missing || ' is_admin() is not SECURITY DEFINER with search_path = '''';';
  end if;
  -- is_admin() runs as its owner: if that role could not read auth.mfa_factors,
  -- every admin policy would raise 42501. Refuse here (the whole file rolls back).
  if not has_table_privilege(
       (select proowner::regrole::text from pg_proc where oid = 'public.is_admin()'::regprocedure),
       'auth.mfa_factors', 'SELECT') then
    missing := missing || ' the owner of is_admin() cannot read auth.mfa_factors;';
  end if;
  foreach t in array array['public.admin_mfa_backup_codes', 'public.admin_mfa_events'] loop
    if to_regclass(t) is null then
      missing := missing || format(' %s is missing;', t);
      continue;
    end if;
    if not (select relrowsecurity from pg_class where oid = to_regclass(t)) then
      missing := missing || format(' %s has RLS off;', t);
    end if;
    if exists (select 1 from pg_policy where polrelid = to_regclass(t)) then
      missing := missing || format(' %s has a policy;', t);
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
        if has_table_privilege(r, t, p) then
          missing := missing || format(' %s holds %s on %s;', r, p, t);
        end if;
      end loop;
    end loop;
  end loop;
  foreach f in array array[
    'public.admin_mfa_backup_codes_replace(uuid, text[])',
    'public.admin_mfa_backup_code_consume(uuid, text)',
    'public.admin_login_seen(uuid, uuid, text, text, text)'] loop
    if to_regprocedure(f) is null then
      missing := missing || format(' %s is missing;', f);
      continue;
    end if;
    if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                      where oid = to_regprocedure(f)), false) then
      missing := missing || format(' %s is not SECURITY DEFINER with search_path = '''';', f);
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      missing := missing || format(' %s is callable by anon / authenticated;', f);
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      missing := missing || format(' %s is not callable by service_role;', f);
    end if;
  end loop;
  if to_regclass('public.admin_mfa_events_login_once') is null then
    missing := missing || ' admin_mfa_events_login_once is missing;';
  end if;

  if missing <> '' then
    raise exception '20261127_50 verify:%', missing;
  end if;
  raise notice '20261127_50 verify: OK — is_admin() needs aal2 once a factor is verified; backup codes + events, service role only';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261127_50 admin MFA: is_admin() aal2 rule, backup codes, login events (service role only)' as step,
       position('aal2' in pg_get_functiondef('public.is_admin()'::regprocedure)) > 0
       and to_regclass('public.admin_mfa_backup_codes') is not null
       and to_regclass('public.admin_mfa_events') is not null
       and to_regprocedure('public.admin_mfa_backup_code_consume(uuid, text)') is not null
       and not has_function_privilege('authenticated', 'public.admin_mfa_backup_code_consume(uuid, text)', 'EXECUTE')
       and not has_table_privilege('authenticated', 'public.admin_mfa_backup_codes', 'SELECT')
       as ok;
