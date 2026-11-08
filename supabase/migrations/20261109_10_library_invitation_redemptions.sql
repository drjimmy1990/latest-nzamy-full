-- =============================================================================
-- Migration: 20261109_10_library_invitation_redemptions.sql
-- =============================================================================
-- WHY (security review 2026-11-08, SAST-02)
--   A library invitation code (library.invitations) may carry several seats
--   (max_uses up to 1000), and each seat is meant for a different account: a
--   code gives each account ONE grant. Until now nothing recorded which
--   account spent a seat, so that rule was not enforced. This file records it
--   and enforces it in the database.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   1. public.library_invitation_redemptions — one row per (invitation, user),
--      PRIMARY KEY (invitation_id, user_id). Server only: RLS on, no policy,
--      nothing granted to anon / authenticated / PUBLIC. It lives in public,
--      not in schema library, on purpose: library carries default SELECT for
--      anon / authenticated (20260922_01), so a table created there would be
--      readable by guests.
--   2. public.redeem_library_invitation(p_user uuid, p_code text) → jsonb
--      SECURITY DEFINER, search_path = '', EXECUTE for service_role only.
--      ONE transaction: lock the code's row, then
--        unknown code                       → {result:'invalid'}
--        expired                            → {result:'expired'}
--        this account already redeemed it   → {result:'already_redeemed'}
--        no seat left                       → {result:'exhausted'}
--        else: current_uses + 1, the library grant through
--        public.library_grant_access (lib-invite / invite_code, the code's
--        grant_days or 30), the redemption row
--                                           → {result:'ok', days, grant_id,
--                                              starts_at, ends_at}
--      No exception handler: if the grant fails, the seat and the redemption
--      roll back with it (this replaces the route's old refund step).
--
-- BACKFILL — NOT POSSIBLE
--   Redemptions before this file were never recorded, and a library grant
--   does not say which code produced it. So an account that spent a seat
--   before this file (or between this file and the deploy — the old code does
--   not write the table) can still redeem that same code once more.
--
-- PREREQUISITES (the file raises without them)
--   20260626 (library.invitations), 20261030_65 (library_grant_access),
--   20261103_11 (library.invitations.grant_days).
--
-- RUN ORDER — BEFORE THE DEPLOY
--   The old code keeps working with this file applied (it never calls the
--   function). The new code calls the function first; while it is missing
--   (42883 / PGRST202 / 42P01) it falls back to the old flow, so either order
--   works, but only this file + the deploy close the gap.
--
-- ROLLBACK
--   drop function if exists public.redeem_library_invitation(uuid, text);
--   drop table if exists public.library_invitation_redemptions;
--   notify pgrst, 'reload schema';
--   (the new code then falls back to the old flow by itself)
--
-- Docker: supabase/tests/rls/library_invitation_redemptions.test.sql
-- =============================================================================

begin;

-- ── 0. prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('library.invitations') is null then
    raise exception '20261109_10: library.invitations is missing — run 20260626_legal_library_schema.sql first';
  end if;
  if to_regprocedure('public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)') is null then
    raise exception '20261109_10: public.library_grant_access is missing — run 20261030_65_library_grant_admin.sql first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'library.invitations'::regclass and attname = 'grant_days' and not attisdropped) then
    raise exception '20261109_10: library.invitations.grant_days is missing — run 20261103_11_library_invitation_grant_days.sql first';
  end if;
end $$;

-- ── 1. the redemptions table (server only) ───────────────────────────────────
create table if not exists public.library_invitation_redemptions (
  invitation_id uuid not null references library.invitations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  grant_id      uuid null references public.library_access_grants(id) on delete set null,
  redeemed_at   timestamptz not null default now(),
  constraint library_invitation_redemptions_pkey primary key (invitation_id, user_id)
);
create index if not exists library_invitation_redemptions_user_idx
  on public.library_invitation_redemptions (user_id);

comment on table public.library_invitation_redemptions is
  'SAST-02 (20261109_10): which account spent a seat of which library invitation code — one row per (code, account), so a code gives each account one grant. Written only by public.redeem_library_invitation. Server only. Redemptions before 20261109_10 were never recorded.';

alter table public.library_invitation_redemptions enable row level security;
revoke all on public.library_invitation_redemptions from public, anon, authenticated;
grant all on public.library_invitation_redemptions to service_role;

-- ── 2. the one-transaction redeem ────────────────────────────────────────────
create or replace function public.redeem_library_invitation(p_user uuid, p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  inv     record;
  v_days  integer;
  v_grant jsonb;
begin
  if p_user is null or p_code is null
     or pg_catalog.length(pg_catalog.btrim(p_code)) = 0 or pg_catalog.length(p_code) > 64 then
    return pg_catalog.jsonb_build_object('result', 'invalid');
  end if;

  -- one redeem of this code at a time: the seat count and the per-account
  -- check below are read under this row lock
  select i.id, i.max_uses, i.current_uses, i.expires_at, i.grant_days
    into inv
    from library.invitations i
   where i.code = p_code
     for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'invalid');
  end if;
  if inv.expires_at is not null and inv.expires_at < pg_catalog.now() then
    return pg_catalog.jsonb_build_object('result', 'expired');
  end if;
  if exists (select 1 from public.library_invitation_redemptions r
              where r.invitation_id = inv.id and r.user_id = p_user) then
    return pg_catalog.jsonb_build_object('result', 'already_redeemed');
  end if;
  if inv.current_uses >= inv.max_uses then
    return pg_catalog.jsonb_build_object('result', 'exhausted');
  end if;

  v_days := coalesce(inv.grant_days, 30);

  update library.invitations set current_uses = current_uses + 1 where id = inv.id;

  -- raises on failure: the seat and the redemption roll back with it
  v_grant := public.library_grant_access(p_user, 'lib-invite', 'invite_code', v_days, null, null, null, null);

  insert into public.library_invitation_redemptions (invitation_id, user_id, grant_id)
  values (inv.id, p_user, (v_grant ->> 'id')::uuid);

  return pg_catalog.jsonb_build_object(
    'result', 'ok',
    'days', v_days,
    'grant_id', v_grant -> 'id',
    'starts_at', v_grant -> 'starts_at',
    'ends_at', v_grant -> 'ends_at');
end $$;

comment on function public.redeem_library_invitation(uuid, text) is
  'SAST-02 (20261109_10): spends one seat of a library invitation code for one account, in one transaction — row lock, expiry, one redemption per account, seats, the library grant (library_grant_access), the redemption row. Answers {result: ok | invalid | expired | already_redeemed | exhausted}. Service role only.';

revoke all on function public.redeem_library_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.redeem_library_invitation(uuid, text) to service_role;

-- ── 3. verify (raises on a failure) ──────────────────────────────────────────
do $$
declare
  fn  constant text := 'public.redeem_library_invitation(uuid, text)';
  tbl constant text := 'public.library_invitation_redemptions';
  cfg text[];
  r   text;
  fn_owner text;
begin
  select p.proconfig into cfg from pg_proc p where p.oid = to_regprocedure(fn);
  if not (select p.prosecdef from pg_proc p where p.oid = to_regprocedure(fn))
     or cfg is null or not ('search_path=""' = any (cfg)) then
    raise exception '20261109_10 verify: % is not SECURITY DEFINER with search_path = ''''', fn;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception '20261109_10 verify: % can EXECUTE %', r, fn;
    end if;
    if r <> 'public' and (has_table_privilege(r, tbl, 'SELECT, INSERT, UPDATE, DELETE')
                          or has_any_column_privilege(r, tbl, 'SELECT, INSERT, UPDATE')) then
      raise exception '20261109_10 verify: % holds a privilege on %', r, tbl;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '20261109_10 verify: service_role cannot EXECUTE %', fn;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = tbl::regclass) then
    raise exception '20261109_10 verify: RLS is off on %', tbl;
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'library_invitation_redemptions') then
    raise exception '20261109_10 verify: % carries a policy (it must have none)', tbl;
  end if;
  -- the function runs as its owner: that role must reach everything it touches
  -- (on self-hosted Supabase the migration role is not always a superuser)
  select pg_get_userbyid(p.proowner) into fn_owner from pg_proc p where p.oid = to_regprocedure(fn);
  if not has_function_privilege(fn_owner, 'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)', 'EXECUTE') then
    raise exception '20261109_10 verify: %, the owner of redeem_library_invitation, cannot EXECUTE library_grant_access — run this file as the role that ran 20261030_65', fn_owner;
  end if;
  -- one privilege per call: a list passes when ANY of them is held
  if not has_table_privilege(fn_owner, 'library.invitations', 'SELECT')
     or not has_table_privilege(fn_owner, 'library.invitations', 'UPDATE')
     or not has_table_privilege(fn_owner, tbl, 'SELECT')
     or not has_table_privilege(fn_owner, tbl, 'INSERT') then
    raise exception '20261109_10 verify: %, the owner of redeem_library_invitation, cannot read/update library.invitations or write %', fn_owner, tbl;
  end if;
  if not exists (select 1 from pg_roles r where r.rolname = fn_owner and (r.rolsuper or r.rolbypassrls))
     and (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'library.invitations'::regclass) <> fn_owner then
    raise exception '20261109_10 verify: %, the owner of redeem_library_invitation, neither owns library.invitations nor bypasses RLS — its row read would see nothing', fn_owner;
  end if;
  raise notice '20261109_10 verify: OK — one redemption per (code, account); redeem_library_invitation is one transaction, service role only';
end $$;

commit;
notify pgrst, 'reload schema';

-- ── check (the SQL editor shows only this last result) ───────────────────────
select 'redeem_library_invitation exists, service role only' as check,
       to_regprocedure('public.redeem_library_invitation(uuid, text)') is not null
       and not has_function_privilege('anon', 'public.redeem_library_invitation(uuid, text)', 'EXECUTE')
       and not has_function_privilege('authenticated', 'public.redeem_library_invitation(uuid, text)', 'EXECUTE')
       and has_function_privilege('service_role', 'public.redeem_library_invitation(uuid, text)', 'EXECUTE') as ok
union all
select 'library_invitation_redemptions: RLS on, unique (code, account), no session grant',
       (select c.relrowsecurity from pg_class c where c.oid = 'public.library_invitation_redemptions'::regclass)
       and exists (select 1 from pg_constraint where conname = 'library_invitation_redemptions_pkey' and contype = 'p')
       and not has_table_privilege('anon', 'public.library_invitation_redemptions', 'SELECT, INSERT, UPDATE, DELETE')
       and not has_table_privilege('authenticated', 'public.library_invitation_redemptions', 'SELECT, INSERT, UPDATE, DELETE');
