-- =============================================================================
-- Migration: 20261030_65_library_grant_admin.sql
-- =============================================================================
-- PURPOSE (owner note ١٨ «مشترك المكتبة فقط», 2026-10-28 — criteria C01–C04)
--   A library-only subscription is a row of public.library_access_grants
--   (20261019_10). Note ١٨ found four gaps, and this file closes the database
--   half of each:
--     C01  a new grant EXTENDS the user's access from the end of the latest
--          active grant, but grantLibraryAccess (src/lib/libraryAccessServer.ts)
--          did it as a READ then an INSERT: two grants at the same moment (two
--          orders, an approval and a code) both read the same end and overlap,
--          so the user loses the days of one of them. The read and the insert
--          now run in ONE function under a per-user lock.
--     C02  the admin can grant the library directly, with a MANDATORY reason.
--     C03  the admin can list every grant with its source, plan, who granted
--          it, the order, the window, and whether it was revoked.
--     C04  the admin can revoke a grant, or move its end, with a reason that
--          is kept.
--
-- WHAT IT CHANGES (idempotent — safe to run any number of times)
--   1. public.library_access_grants gains two columns:
--        revoked_at  timestamptz NULL — when an admin revoked the grant
--        revoked_by  uuid        NULL — who (no FK: the grant outlives the
--                                       admin's account, like granted_by)
--      NOTHING TO BACKFILL: plan_ref, source (NOT NULL + CHECK) and granted_by
--      exist since 20261019_10 and order_id since 20261022_10, so every
--      existing row already says where it came from. 'admin' / 'lib-admin'
--      already pass the CHECKs.
--
--   2. public.library_access_grant_admin — the admin's text about a grant,
--      ONE row per grant (grant_id PK → library_access_grants ON DELETE
--      CASCADE): reason, notes, revoke_reason, the window before the first
--      change (original_starts_at / original_ends_at) and the last end change
--      (adjusted_at, adjusted_by, adjust_reason).
--      WHY A SIDE TABLE: a signed-in user holds table-level SELECT on his own
--      library_access_grants rows (20261019_10, the "own library grants"
--      policy). A reason column there would be readable by the grant holder
--      through PostgREST, and a column-level REVOKE cannot override a
--      table-level GRANT. This table is service_role only: RLS on, no policy,
--      nothing for anon / authenticated / PUBLIC.
--
--   3. Three functions, SECURITY DEFINER, search_path = '', EXECUTE for
--      service_role only. All three take the SAME per-user advisory lock
--      ('library_grant:' || user), so a grant, a revoke and an end change of
--      one user run one after the other.
--
--      public.library_grant_access(p_user, p_plan_ref, p_source, p_days,
--                                  p_granted_by, p_order, p_reason, p_notes)
--        RETURNS jsonb {id, starts_at, ends_at}
--        The window starts at the later of now() and the latest ends_at among
--        the user's grants that end after now() (stackedGrantWindow in
--        src/lib/libraryAccess.ts, the same rule) and lasts p_days × 24 hours
--        (the TypeScript DAY_MS). p_days must be an integer from 1 to 3660.
--        source 'admin' needs a non-blank reason. order_id is UNIQUE
--        (20261022_10): a second grant for one order raises 23505, which
--        grantPurchase reads as "already granted" — there is deliberately no
--        exception handler.
--
--      public.library_grant_revoke(p_grant, p_actor, p_reason)
--        RETURNS jsonb {grant_id, user_id, before, after, revoked_at}
--        REVOKE = THIS GRANT ONLY. A running grant ends now (ends_at = now()).
--        A stacked grant that has not started yet is moved wholly into the
--        past (starts_at = now() - 1 ms, ends_at = now()), so not one future
--        second stays live; its original window is kept in
--        library_access_grant_admin. Later grants of the user do NOT move:
--        a revoke can leave a gap, and the next grant then gives access again
--        from its own start (the refund in 20261022_32 behaves the same).
--        Every reader of the table (hasActiveLibraryGrant, the stacking read,
--        the founder trigger, the library AI check) already drops the row,
--        because its window no longer covers now — none of them needs to read
--        revoked_at, so the code may ship before or after this file.
--        Refused: an unknown grant (P0002), a revoked or already ended grant
--        (55000), a blank reason (22023).
--
--      public.library_grant_adjust_end(p_grant, p_actor, p_new_end, p_reason)
--        RETURNS jsonb {grant_id, user_id, before, after}
--        Moves THIS grant's end, either way. The new end must be after both
--        the grant's start and now() (to end it now, revoke it), and the
--        window may not exceed 3660 days. Shortening never moves the user's
--        later grants (a gap may open — the same rule as revoke). Lengthening
--        is refused when it would run into another live grant of the user
--        (55000 library_grant_overlap): the admin then grants new days, which
--        stack after the last one. Refused also: an unknown, revoked or ended
--        grant, an unchanged end, a blank reason.
--
-- WHO CAN DO WHAT
--   Only the server (service role) calls the three functions, after
--   requireStaff("entitlements.grant") in the admin routes. The side table is
--   service_role only. The main table's privileges and its ONE policy are
--   unchanged (_verify.sql's 20261019_10 block still holds).
--
-- PREREQUISITES (the file raises without them)
--   20261019_10 (library_access_grants), 20261022_10 (its order_id column).
--
-- DEPLOY ORDER — BEFORE THE DEPLOY
--   The new code calls library_grant_access for EVERY library grant
--   (purchase, request approval, invite code, colleague invite, admin). If
--   the function is missing it falls back to the old read-then-insert (logged
--   once), so purchases keep working either way; but the admin's direct grant
--   (it stores a reason), revoke, end change and the «اشتراكات المكتبة» page
--   need this file. Run it first, then the deploy.
--
-- ROLLBACK
--   drop function if exists public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text);
--   drop function if exists public.library_grant_revoke(uuid, uuid, text);
--   drop function if exists public.library_grant_adjust_end(uuid, uuid, timestamptz, text);
--   drop table if exists public.library_access_grant_admin;   -- loses the reasons
--   alter table public.library_access_grants drop column if exists revoked_at,
--     drop column if exists revoked_by;
--   (a revoked grant keeps its collapsed window after a rollback: it stays
--   ended, which is what the revoke meant)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261030_65: public.library_access_grants does not exist — run 20261019_10 first';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.library_access_grants'::regclass
                    and attname = 'order_id' and not attisdropped) then
    raise exception '20261030_65: library_access_grants.order_id does not exist — run 20261022_10 first';
  end if;
end $$;

-- ── 1. revoke tracking on the grant ───────────────────────────────────────────
alter table public.library_access_grants add column if not exists revoked_at timestamptz null;
alter table public.library_access_grants add column if not exists revoked_by uuid null;

-- the admin list filters on "revoked" and on the end
create index if not exists library_access_grants_ends_idx
  on public.library_access_grants (ends_at);

-- ── 2. the admin's text, service role only ───────────────────────────────────
create table if not exists public.library_access_grant_admin (
  grant_id            uuid primary key
                      references public.library_access_grants(id) on delete cascade,
  reason              text null,
  notes               text null,
  revoke_reason       text null,
  original_starts_at  timestamptz null,
  original_ends_at    timestamptz null,
  adjusted_at         timestamptz null,
  adjusted_by         uuid null,
  adjust_reason       text null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint library_access_grant_admin_lengths_check check (
    coalesce(char_length(reason), 0) <= 1000
    and coalesce(char_length(notes), 0) <= 4000
    and coalesce(char_length(revoke_reason), 0) <= 1000
    and coalesce(char_length(adjust_reason), 0) <= 1000)
);

comment on table public.library_access_grant_admin is
  'The admin''s text about a library grant (20261030_65, owner note ١٨): reason, notes, revoke / end-change reasons and the original window. Service role only — the grant holder can read his own library_access_grants row, so this text lives apart.';

alter table public.library_access_grant_admin enable row level security;
revoke all on public.library_access_grant_admin from anon, authenticated, public;
grant all on public.library_access_grant_admin to service_role;

-- ── 3a. grant (C01 + C02) ────────────────────────────────────────────────────
create or replace function public.library_grant_access(
  p_user        uuid,
  p_plan_ref    text,
  p_source      text,
  p_days        integer,
  p_granted_by  uuid,
  p_order       uuid,
  p_reason      text,
  p_notes       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_at     timestamptz := pg_catalog.now();
  latest_end timestamptz;
  start_at   timestamptz;
  end_at     timestamptz;
  new_id     uuid;
  reason_t   text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  notes_t    text := nullif(pg_catalog.btrim(coalesce(p_notes, '')), '');
begin
  if p_user is null or p_plan_ref is null or p_source is null then
    raise exception 'library_grant_invalid_arguments' using errcode = '22023';
  end if;
  if p_days is null or p_days < 1 or p_days > 3660 then
    raise exception 'library_grant_invalid_days' using errcode = '22023';
  end if;
  if p_source = 'admin' and reason_t is null then
    raise exception 'library_grant_reason_required' using errcode = '22023';
  end if;

  -- one grant / revoke / end change per user at a time
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_grant:' || p_user::text, 0));

  -- the read happens AFTER the lock: a grant that waited sees the one before it
  select max(g.ends_at) into latest_end
    from public.library_access_grants g
   where g.user_id = p_user and g.ends_at > now_at and g.revoked_at is null;

  start_at := greatest(now_at, coalesce(latest_end, now_at));
  end_at   := start_at + p_days * interval '24 hours';

  insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at, granted_by, order_id)
  values (p_user, p_plan_ref, p_source, start_at, end_at, p_granted_by, p_order)
  returning id into new_id;

  if reason_t is not null or notes_t is not null then
    insert into public.library_access_grant_admin (grant_id, reason, notes)
    values (new_id, reason_t, notes_t);
  end if;

  return pg_catalog.jsonb_build_object('id', new_id, 'starts_at', start_at, 'ends_at', end_at);
end $$;

comment on function public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text) is
  'Grants the library atomically (20261030_65, owner note ١٨ C01/C02): per-user lock, then the window from the end of the latest active grant, then the insert (+ the reason). order_id UNIQUE raises 23505. Service role only.';

-- ── 3b. revoke (C04) ─────────────────────────────────────────────────────────
create or replace function public.library_grant_revoke(
  p_grant   uuid,
  p_actor   uuid,
  p_reason  text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_at    timestamptz := pg_catalog.now();
  owner_id  uuid;
  g         record;
  new_start timestamptz;
  new_end   timestamptz;
  reason_t  text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if p_grant is null then
    raise exception 'library_grant_invalid_arguments' using errcode = '22023';
  end if;
  if reason_t is null then
    raise exception 'library_grant_reason_required' using errcode = '22023';
  end if;

  select user_id into owner_id from public.library_access_grants where id = p_grant;
  if owner_id is null then
    raise exception 'library_grant_not_found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_grant:' || owner_id::text, 0));

  select id, user_id, starts_at, ends_at, revoked_at into g
    from public.library_access_grants where id = p_grant for update;
  if g.revoked_at is not null then
    raise exception 'library_grant_already_revoked' using errcode = '55000';
  end if;
  if g.ends_at <= now_at then
    raise exception 'library_grant_already_ended' using errcode = '55000';
  end if;

  if g.starts_at > now_at then
    -- a stacked grant that has not started: wholly into the past
    new_start := now_at - interval '1 millisecond';
    new_end   := now_at;
  else
    new_start := g.starts_at;
    new_end   := greatest(now_at, g.starts_at + interval '1 microsecond');
  end if;

  update public.library_access_grants
     set starts_at = new_start, ends_at = new_end, revoked_at = now_at, revoked_by = p_actor
   where id = p_grant;

  insert into public.library_access_grant_admin as a
         (grant_id, revoke_reason, original_starts_at, original_ends_at, updated_at)
  values (p_grant, reason_t, g.starts_at, g.ends_at, now_at)
  on conflict (grant_id) do update
     set revoke_reason      = excluded.revoke_reason,
         original_starts_at = coalesce(a.original_starts_at, excluded.original_starts_at),
         original_ends_at   = coalesce(a.original_ends_at, excluded.original_ends_at),
         updated_at         = excluded.updated_at;

  return pg_catalog.jsonb_build_object(
    'grant_id', p_grant, 'user_id', g.user_id, 'revoked_at', now_at,
    'before', pg_catalog.jsonb_build_object('starts_at', g.starts_at, 'ends_at', g.ends_at),
    'after',  pg_catalog.jsonb_build_object('starts_at', new_start, 'ends_at', new_end));
end $$;

comment on function public.library_grant_revoke(uuid, uuid, text) is
  'Revokes ONE library grant (20261030_65, owner note ١٨ C04): a running grant ends now, an unstarted one moves wholly into the past; later grants do not move. Reason required. Service role only.';

-- ── 3c. move the end (C04) ───────────────────────────────────────────────────
create or replace function public.library_grant_adjust_end(
  p_grant    uuid,
  p_actor    uuid,
  p_new_end  timestamptz,
  p_reason   text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  now_at    timestamptz := pg_catalog.now();
  owner_id  uuid;
  g         record;
  reason_t  text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
begin
  if p_grant is null or p_new_end is null then
    raise exception 'library_grant_invalid_arguments' using errcode = '22023';
  end if;
  if reason_t is null then
    raise exception 'library_grant_reason_required' using errcode = '22023';
  end if;

  select user_id into owner_id from public.library_access_grants where id = p_grant;
  if owner_id is null then
    raise exception 'library_grant_not_found' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_grant:' || owner_id::text, 0));

  select id, user_id, starts_at, ends_at, revoked_at into g
    from public.library_access_grants where id = p_grant for update;
  if g.revoked_at is not null then
    raise exception 'library_grant_already_revoked' using errcode = '55000';
  end if;
  if g.ends_at <= now_at then
    raise exception 'library_grant_already_ended' using errcode = '55000';
  end if;
  if p_new_end <= now_at or p_new_end <= g.starts_at then
    raise exception 'library_grant_end_too_early' using errcode = '22023';
  end if;
  if p_new_end - g.starts_at > interval '3660 days' then
    raise exception 'library_grant_too_long' using errcode = '22023';
  end if;
  if p_new_end = g.ends_at then
    raise exception 'library_grant_unchanged' using errcode = '22023';
  end if;
  if p_new_end > g.ends_at and exists (
       select 1 from public.library_access_grants o
        where o.user_id = g.user_id and o.id <> g.id and o.revoked_at is null
          and o.starts_at < p_new_end and o.ends_at > g.ends_at) then
    raise exception 'library_grant_overlap' using errcode = '55000';
  end if;

  update public.library_access_grants set ends_at = p_new_end where id = p_grant;

  insert into public.library_access_grant_admin as a
         (grant_id, original_starts_at, original_ends_at, adjusted_at, adjusted_by, adjust_reason, updated_at)
  values (p_grant, g.starts_at, g.ends_at, now_at, p_actor, reason_t, now_at)
  on conflict (grant_id) do update
     set original_starts_at = coalesce(a.original_starts_at, excluded.original_starts_at),
         original_ends_at   = coalesce(a.original_ends_at, excluded.original_ends_at),
         adjusted_at        = excluded.adjusted_at,
         adjusted_by        = excluded.adjusted_by,
         adjust_reason      = excluded.adjust_reason,
         updated_at         = excluded.updated_at;

  return pg_catalog.jsonb_build_object(
    'grant_id', p_grant, 'user_id', g.user_id,
    'before', pg_catalog.jsonb_build_object('starts_at', g.starts_at, 'ends_at', g.ends_at),
    'after',  pg_catalog.jsonb_build_object('starts_at', g.starts_at, 'ends_at', p_new_end));
end $$;

comment on function public.library_grant_adjust_end(uuid, uuid, timestamptz, text) is
  'Moves ONE library grant''s end (20261030_65, owner note ١٨ C04): after now and the start, at most 3660 days, never into another live grant of the user; later grants do not move. Reason required. Service role only.';

revoke all on function public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.library_grant_revoke(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.library_grant_adjust_end(uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text) to service_role;
grant execute on function public.library_grant_revoke(uuid, uuid, text) to service_role;
grant execute on function public.library_grant_adjust_end(uuid, uuid, timestamptz, text) to service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  side    constant text := 'public.library_access_grant_admin';
  fn      text;
  r       text;
  p       text;
  cfg     text[];
  definer boolean;
  src     text;
  missing text := '';
begin
  foreach p in array array['revoked_at', 'revoked_by'] loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.library_access_grants'::regclass
                    and attname = p and not attisdropped) then
      missing := missing || format(' library_access_grants.%s is missing;', p);
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'library_access_grants') <> 1 then
    missing := missing || ' library_access_grants no longer has exactly one policy;';
  end if;

  if to_regclass(side) is null then
    missing := missing || ' library_access_grant_admin is missing;';
  else
    if not (select relrowsecurity from pg_class where oid = side::regclass) then
      missing := missing || ' library_access_grant_admin: RLS is off;';
    end if;
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'library_access_grant_admin') then
      missing := missing || ' library_access_grant_admin has a policy (it must have none);';
    end if;
    foreach r in array array['anon', 'authenticated', 'public'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, side, p) then
          missing := missing || format(' %s holds %s on library_access_grant_admin;', r, p);
        end if;
      end loop;
    end loop;
  end if;

  foreach fn in array array[
    'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)',
    'public.library_grant_revoke(uuid, uuid, text)',
    'public.library_grant_adjust_end(uuid, uuid, timestamptz, text)'] loop
    if to_regprocedure(fn) is null then
      missing := missing || format(' %s is missing;', fn);
      continue;
    end if;
    select proconfig, prosecdef, prosrc into cfg, definer, src from pg_proc where oid = to_regprocedure(fn);
    if not coalesce(definer, false) or cfg is null or not ('search_path=""' = any (cfg)) then
      missing := missing || format(' %s is not SECURITY DEFINER with search_path = '''';', fn);
    end if;
    if src !~* 'pg_advisory_xact_lock' or src !~* '''library_grant:''' then
      missing := missing || format(' %s lost the per-user lock;', fn);
    end if;
    if src ~* 'exception\s+when' then
      missing := missing || format(' %s catches an exception;', fn);
    end if;
    foreach r in array array['anon', 'authenticated', 'public'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261030_65 verify:%', missing;
  end if;
  raise notice '20261030_65 verify: OK — revoked_at/revoked_by, library_access_grant_admin (service role only), library_grant_access / _revoke / _adjust_end (per-user lock, SECURITY DEFINER, service role only)';
end $$;

commit;

notify pgrst, 'reload schema';

-- ── Check (the SQL editor hides NOTICEs — run this and read the row) ─────────
-- Expected: one row, every column true.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'public' and table_name = 'library_access_grants'
             and column_name = 'revoked_at')                                         as revoked_at_column,
  to_regclass('public.library_access_grant_admin') is not null                       as admin_side_table,
  not has_table_privilege('authenticated', 'public.library_access_grant_admin', 'SELECT') as side_table_hidden_from_users,
  to_regprocedure('public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)') is not null as grant_fn,
  to_regprocedure('public.library_grant_revoke(uuid, uuid, text)') is not null       as revoke_fn,
  to_regprocedure('public.library_grant_adjust_end(uuid, uuid, timestamptz, text)') is not null as adjust_fn,
  not has_function_privilege('authenticated', 'public.library_grant_access(uuid, text, text, integer, uuid, uuid, text, text)', 'EXECUTE') as grant_fn_server_only;
