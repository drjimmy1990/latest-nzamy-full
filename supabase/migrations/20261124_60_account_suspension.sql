-- =============================================================================
-- Migration: 20261124_60_account_suspension.sql
-- =============================================================================
-- PURPOSE (owner package 17 Nov 2026, TODO 3.5 / ticket S7: real suspension)
--   An admin «إيقاف» must take effect at once. The app bans the account in
--   GoTrue (auth.admin.updateUserById ban_duration) and marks app_metadata;
--   GoTrue then refuses new sign-ins and token refreshes. What GoTrue's admin
--   API cannot do is end the sessions that are ALREADY open: its signOut takes
--   the user's own JWT, not a user id. These two functions are the database
--   half, both SECURITY DEFINER and executable by service_role only:
--
--   1. public.admin_revoke_user_sessions(p_user uuid) → integer
--      Deletes the user's auth.sessions (refresh tokens and MFA claims go with
--      them by their ON DELETE CASCADE) and any refresh token left without a
--      session. Returns the number of sessions ended. GoTrue then answers
--      «session_not_found» to every access token of those sessions, so the
--      app's getUser() gates sign the user out on the next request.
--   2. public.admin_suspended_user_ids(p_ids uuid[]) → setof uuid
--      Which of up to 500 ids are banned now (auth.users.banned_until in the
--      future), so the admin user list can show «موقوف» without a GoTrue call
--      per row.
--
--   Nothing else changes. No table, no column, no policy.
--
-- HOW TO RUN (any time; the code works without it: the ban and the app gates
--   still apply, only the open sessions survive until their token expires):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261124_60_account_suspension.sql
--   Expect: NOTICE  20261124_60 verify: OK  and a row with `t`.
--
-- RUN ORDER: before or after the deploy, either way.
--
-- ROLLBACK:
--   drop function if exists public.admin_revoke_user_sessions(uuid);
--   drop function if exists public.admin_suspended_user_ids(uuid[]);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('auth.sessions') is null or to_regclass('auth.refresh_tokens') is null then
    raise exception '20261124_60: auth.sessions / auth.refresh_tokens not found (is this the Supabase database?)';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'auth.users'::regclass and attname = 'banned_until' and not attisdropped) then
    raise exception '20261124_60: auth.users.banned_until not found';
  end if;
end
$pre$;

-- ── 1. end every open session of one user ───────────────────────────────────
create or replace function public.admin_revoke_user_sessions(p_user uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sessions integer;
begin
  if p_user is null then
    raise exception 'admin_revoke_user_sessions: p_user is required' using errcode = '22023';
  end if;

  delete from auth.sessions where user_id = p_user;
  get diagnostics v_sessions = row_count;

  -- Tokens from before sessions existed (session_id null) are not reached by
  -- the cascade. auth.refresh_tokens.user_id is varchar.
  delete from auth.refresh_tokens where user_id = p_user::text;

  return v_sessions;
end $$;

comment on function public.admin_revoke_user_sessions(uuid) is
  'Ends every open session of one user (auth.sessions + refresh tokens) for an admin suspension (20261124_60). Returns the sessions ended. Service role only.';

revoke all on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;

-- ── 2. which of these accounts are banned now ───────────────────────────────
create or replace function public.admin_suspended_user_ids(p_ids uuid[])
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_ids is null or pg_catalog.cardinality(p_ids) = 0 then
    return;
  end if;
  if pg_catalog.cardinality(p_ids) > 500 then
    raise exception 'admin_suspended_user_ids: at most 500 ids' using errcode = '22023';
  end if;
  return query
    select u.id
      from auth.users u
     where u.id = any (p_ids)
       and u.banned_until is not null
       and u.banned_until > pg_catalog.now();
end $$;

comment on function public.admin_suspended_user_ids(uuid[]) is
  'The ids (of at most 500 given) whose auth.users.banned_until is in the future: the admin list''s «موقوف» (20261124_60). Service role only.';

revoke all on function public.admin_suspended_user_ids(uuid[]) from public, anon, authenticated;
grant execute on function public.admin_suspended_user_ids(uuid[]) to service_role;

-- ── 3. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  f text;
begin
  foreach f in array array['public.admin_revoke_user_sessions(uuid)', 'public.admin_suspended_user_ids(uuid[])'] loop
    if to_regprocedure(f) is null then
      raise exception '20261124_60 verify: % is missing', f;
    end if;
    if not (select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)) then
      raise exception '20261124_60 verify: % is not SECURITY DEFINER', f;
    end if;
    if not coalesce((select 'search_path=""' = any (p.proconfig) from pg_catalog.pg_proc p where p.oid = to_regprocedure(f)), false) then
      raise exception '20261124_60 verify: % has no empty search_path', f;
    end if;
    if has_function_privilege('anon', f, 'EXECUTE') or has_function_privilege('authenticated', f, 'EXECUTE') then
      raise exception '20261124_60 verify: % is callable by anon/authenticated', f;
    end if;
    if not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '20261124_60 verify: service_role cannot call %', f;
    end if;
  end loop;
  raise notice '20261124_60 verify: OK';
end
$verify$;

commit;

select '20261124_60 account suspension: revoke sessions + banned list (service role only)' as step,
       to_regprocedure('public.admin_revoke_user_sessions(uuid)') is not null
       and to_regprocedure('public.admin_suspended_user_ids(uuid[])') is not null
       and not has_function_privilege('authenticated', 'public.admin_revoke_user_sessions(uuid)', 'EXECUTE')
       and not has_function_privilege('anon', 'public.admin_revoke_user_sessions(uuid)', 'EXECUTE')
       as ok;
