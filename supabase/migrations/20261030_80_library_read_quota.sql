-- =============================================================================
-- Migration: 20261030_80_library_read_quota.sql
-- Owner note ١٣ «حصن المكتبة القانونية» (30-Oct handoff), items C07 and C09:
--   C07  a durable per-USER counter of library documents read, independent of
--        the shared IP (an office NAT, a mobile CGNAT) and of process restarts.
--   C09  a library security lock SEPARATE from account deletion / freeze: it
--        blocks library reading only, never deletes or freezes the account.
-- Safe to re-run. Service role only: no anon / authenticated grant anywhere.
-- =============================================================================
--
-- WHAT THIS FILE ADDS
--   1. public.library_security_locks — one row per lock (who, why, until, by
--      whom, lifted when / by whom). At most ONE open lock per user (partial
--      unique index on lifted_at is null). Rows are never deleted: lifting
--      sets lifted_at. user_id has no foreign key on purpose, like
--      account_deletion_requests (20261026_70): the record outlives the account.
--   2. public.library_read_quota_docs — (user, Riyadh day, document key)
--      rows. A document counts ONCE per day however many windows / pages of
--      it the reader fetches (the precedents reader fires 5–24 windows, the
--      book reader one per section). `allowed = false` rows are documents the
--      user tried to open after reaching the cap. Each user's rows older than
--      two days are deleted by the next call for that user (no cron needed).
--   3. public.library_read_quota_hit(user, doc_key, limits…) — ONE transaction
--      under a per-user advisory lock:
--        admin                → 'exempt'
--        open lock            → 'locked'      (expired locks are closed first)
--        doc_key null         → 'ok' + today's counts (lock / state check only)
--        already read today   → 'ok'          (re-reading never counts)
--        over the day / hour  → 'over_daily' / 'over_hourly' (a refused row);
--                               the Nth DISTINCT refused document of the day
--                               (p_lock_after_refused) opens a 'quota_breach'
--                               lock → 'locked'
--        otherwise            → 'ok' and the document is counted
--      The limits are arguments (the app's constants), so changing a number
--      needs no migration. The office / company tier is
--      profiles.user_type in ('firm','corporate') or an active firm_members /
--      business_members row (each table only when it exists).
--   4. public.library_security_lock_create(user, admin, note, until) — an
--      admin's lock; refuses an admin target; returns the open lock if one
--      already exists.
--   5. public.library_security_lock_lift(lock, admin, note, reset_today) —
--      closes the lock and (by default) clears the user's counted documents
--      for today, so the next read does not re-lock him at once.
--
-- The app calls (3) from src/proxy.ts on the heavy library reads only and
-- DEGRADES SAFELY while this file is not applied: a missing function
-- (PGRST202 / 42883) or table answers "no quota, no lock" — the reads keep
-- working exactly as before. So the deploy may go before or after this file.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 1. library_security_locks ────────────────────────────────────────────────
create table if not exists public.library_security_locks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  reference    text not null
               default ('SEC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  reason       text not null check (reason in ('quota_breach', 'admin')),
  details      jsonb not null default '{}'::jsonb,
  note         text check (note is null or length(note) <= 1000),
  locked_at    timestamptz not null default now(),
  locked_until timestamptz,          -- null: until an admin lifts it
  locked_by    uuid,                 -- null: the system (quota breach)
  lifted_at    timestamptz,
  lifted_by    uuid,                 -- null with lifted_at set: expired by time
  lift_note    text check (lift_note is null or length(lift_note) <= 1000),
  constraint library_security_locks_reference_key unique (reference),
  constraint library_security_locks_until_after check (locked_until is null or locked_until > locked_at),
  constraint library_security_locks_lift_after check (lifted_at is null or lifted_at >= locked_at)
);

create unique index if not exists library_security_locks_one_open
  on public.library_security_locks (user_id) where lifted_at is null;
create index if not exists library_security_locks_locked_at
  on public.library_security_locks (locked_at desc);

comment on table public.library_security_locks is
  'Library-only security locks (owner note ١٣ C09, 20261030_80). Blocks library reading; never deletes or freezes the account. One open lock per user; rows are never deleted. Service role only.';

alter table public.library_security_locks enable row level security;
revoke all on public.library_security_locks from public, anon, authenticated;
grant all on public.library_security_locks to service_role;

-- ── 2. library_read_quota_docs ───────────────────────────────────────────────
create table if not exists public.library_read_quota_docs (
  user_id  uuid not null,
  day      date not null,
  doc_key  text not null check (length(doc_key) between 1 and 300),
  allowed  boolean not null,
  first_at timestamptz not null default now(),
  primary key (user_id, day, doc_key)
);

comment on table public.library_read_quota_docs is
  'Distinct library documents a user opened per Riyadh day (owner note ١٣ C07, 20261030_80). allowed = false: tried after the cap. Written only by library_read_quota_hit. Service role only.';

alter table public.library_read_quota_docs enable row level security;
revoke all on public.library_read_quota_docs from public, anon, authenticated;
grant all on public.library_read_quota_docs to service_role;

-- ── 3. library_read_quota_hit ────────────────────────────────────────────────
create or replace function public.library_read_quota_hit(
  p_user                uuid,
  p_doc_key             text,
  p_daily_docs          int,
  p_member_daily_docs   int,
  p_hourly_docs         int,
  p_lock_after_refused  int)
returns table (
  status         text,
  used_today     int,
  day_limit      int,
  used_hour      int,
  hour_limit     int,
  refused_today  int,
  lock_reference text,
  locked_until   timestamptz,
  resets_at      timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day      date := (now() at time zone 'Asia/Riyadh')::date;
  v_resets   timestamptz := ((now() at time zone 'Asia/Riyadh')::date + 1)::timestamp at time zone 'Asia/Riyadh';
  v_type     text;
  v_member   boolean := false;
  v_limit    int;
  v_used     int;
  v_hour     int;
  v_refused  int;
  v_oldest   timestamptz;
  v_lock     public.library_security_locks;
begin
  if p_user is null
     or p_daily_docs is null or p_daily_docs < 1
     or p_member_daily_docs is null or p_member_daily_docs < 1
     or p_hourly_docs is null or p_hourly_docs < 1
     or p_lock_after_refused is null or p_lock_after_refused < 0
     or (p_doc_key is not null and length(p_doc_key) not between 1 and 300) then
    raise exception 'library_read_quota_hit: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('library_read_quota:' || p_user::text, 0));

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type = 'admin' then
    return query select 'exempt'::text, 0, 0, 0, 0, 0, null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- A lock whose time ran out closes itself (lifted_by stays null).
  update public.library_security_locks l
     set lifted_at = now(), lift_note = coalesce(l.lift_note, 'expired')
   where l.user_id = p_user and l.lifted_at is null
     and l.locked_until is not null and l.locked_until <= now();

  select * into v_lock from public.library_security_locks l
   where l.user_id = p_user and l.lifted_at is null;
  if found then
    return query select 'locked'::text, 0, 0, 0, 0, 0, v_lock.reference, v_lock.locked_until, null::timestamptz;
    return;
  end if;

  -- Housekeeping: this user's rows from before yesterday (primary-key prefix).
  delete from public.library_read_quota_docs d where d.user_id = p_user and d.day < v_day - 1;

  -- Office / company tier.
  v_member := coalesce(v_type in ('firm', 'corporate'), false);
  if not v_member and to_regclass('public.firm_members') is not null then
    execute 'select exists (select 1 from public.firm_members m where m.user_id = $1 and m.status = ''active'')'
      into v_member using p_user;
  end if;
  if not v_member and to_regclass('public.business_members') is not null then
    execute 'select exists (select 1 from public.business_members m where m.user_id = $1 and m.status = ''active'')'
      into v_member using p_user;
  end if;
  v_limit := case when v_member then p_member_daily_docs else p_daily_docs end;

  select count(*) filter (where d.allowed),
         count(*) filter (where d.allowed and d.first_at > now() - interval '1 hour'),
         count(*) filter (where not d.allowed),
         min(d.first_at) filter (where d.allowed and d.first_at > now() - interval '1 hour')
    into v_used, v_hour, v_refused, v_oldest
    from public.library_read_quota_docs d
   where d.user_id = p_user and d.day = v_day;

  -- State only (the library status route, the search lock check).
  if p_doc_key is null then
    return query select 'ok'::text, v_used, v_limit, v_hour, p_hourly_docs, v_refused, null::text, null::timestamptz, v_resets;
    return;
  end if;

  -- A document already counted today is free to re-open, window after window.
  if exists (select 1 from public.library_read_quota_docs d
              where d.user_id = p_user and d.day = v_day and d.doc_key = p_doc_key and d.allowed) then
    return query select 'ok'::text, v_used, v_limit, v_hour, p_hourly_docs, v_refused, null::text, null::timestamptz, v_resets;
    return;
  end if;

  if v_used >= v_limit or v_hour >= p_hourly_docs then
    insert into public.library_read_quota_docs (user_id, day, doc_key, allowed)
      values (p_user, v_day, p_doc_key, false)
      on conflict (user_id, day, doc_key) do nothing;
    select count(*) into v_refused from public.library_read_quota_docs d
     where d.user_id = p_user and d.day = v_day and not d.allowed;

    if p_lock_after_refused > 0 and v_refused >= p_lock_after_refused then
      insert into public.library_security_locks (user_id, reason, details)
        values (p_user, 'quota_breach', jsonb_build_object(
          'day', v_day, 'allowed_docs', v_used, 'day_limit', v_limit,
          'hour_docs', v_hour, 'hour_limit', p_hourly_docs,
          'refused_docs', v_refused, 'lock_after_refused', p_lock_after_refused))
        returning * into v_lock;
      return query select 'locked'::text, v_used, v_limit, v_hour, p_hourly_docs, v_refused, v_lock.reference, v_lock.locked_until, null::timestamptz;
      return;
    end if;

    if v_used >= v_limit then
      return query select 'over_daily'::text, v_used, v_limit, v_hour, p_hourly_docs, v_refused, null::text, null::timestamptz, v_resets;
    else
      return query select 'over_hourly'::text, v_used, v_limit, v_hour, p_hourly_docs, v_refused, null::text, null::timestamptz,
        least(coalesce(v_oldest, now()) + interval '1 hour', v_resets);
    end if;
    return;
  end if;

  insert into public.library_read_quota_docs (user_id, day, doc_key, allowed)
    values (p_user, v_day, p_doc_key, true)
    on conflict (user_id, day, doc_key) do update set allowed = true, first_at = now();

  return query select 'ok'::text, v_used + 1, v_limit, v_hour + 1, p_hourly_docs, v_refused, null::text, null::timestamptz, v_resets;
end;
$$;

comment on function public.library_read_quota_hit(uuid, text, int, int, int, int) is
  'Counts one distinct library document per user per Riyadh day and answers exempt / ok / over_daily / over_hourly / locked; the Nth distinct refused document opens a quota_breach lock. doc_key null = state only. One transaction under a per-user advisory lock (20261030_80). Service role only.';

revoke all on function public.library_read_quota_hit(uuid, text, int, int, int, int) from public, anon, authenticated;
grant execute on function public.library_read_quota_hit(uuid, text, int, int, int, int) to service_role;

-- ── 4. library_security_lock_create ──────────────────────────────────────────
create or replace function public.library_security_lock_create(
  p_user  uuid,
  p_admin uuid,
  p_note  text,
  p_until timestamptz default null)
returns setof public.library_security_locks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock public.library_security_locks;
begin
  if p_user is null or p_admin is null or p_note is null or length(btrim(p_note)) = 0 or length(p_note) > 1000
     or (p_until is not null and p_until <= now()) then
    raise exception 'library_security_lock_create: invalid arguments' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles pr where pr.id = p_user and pr.user_type = 'admin') then
    raise exception 'admin_target' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('library_read_quota:' || p_user::text, 0));

  update public.library_security_locks l
     set lifted_at = now(), lift_note = coalesce(l.lift_note, 'expired')
   where l.user_id = p_user and l.lifted_at is null
     and l.locked_until is not null and l.locked_until <= now();

  select * into v_lock from public.library_security_locks l
   where l.user_id = p_user and l.lifted_at is null;
  if found then
    return next v_lock;
    return;
  end if;

  insert into public.library_security_locks (user_id, reason, note, locked_until, locked_by)
    values (p_user, 'admin', btrim(p_note), p_until, p_admin)
    returning * into v_lock;
  return next v_lock;
end;
$$;

comment on function public.library_security_lock_create(uuid, uuid, text, timestamptz) is
  'An admin locks a user out of the library (owner note ١٣ C09, 20261030_80): never an admin; an existing open lock is returned as it is. Service role only.';

revoke all on function public.library_security_lock_create(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.library_security_lock_create(uuid, uuid, text, timestamptz) to service_role;

-- ── 5. library_security_lock_lift ────────────────────────────────────────────
create or replace function public.library_security_lock_lift(
  p_lock        uuid,
  p_admin       uuid,
  p_note        text,
  p_reset_today boolean default true)
returns setof public.library_security_locks
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lock public.library_security_locks;
begin
  if p_lock is null or p_admin is null or (p_note is not null and length(p_note) > 1000) then
    raise exception 'library_security_lock_lift: invalid arguments' using errcode = '22023';
  end if;

  select * into v_lock from public.library_security_locks l where l.id = p_lock;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('library_read_quota:' || v_lock.user_id::text, 0));

  update public.library_security_locks l
     set lifted_at = now(), lifted_by = p_admin, lift_note = nullif(btrim(coalesce(p_note, '')), '')
   where l.id = p_lock and l.lifted_at is null
   returning * into v_lock;
  if not found then
    -- Already lifted (or expired): return it unchanged.
    select * into v_lock from public.library_security_locks l where l.id = p_lock;
    return next v_lock;
    return;
  end if;

  if coalesce(p_reset_today, true) then
    delete from public.library_read_quota_docs d
     where d.user_id = v_lock.user_id and d.day = (now() at time zone 'Asia/Riyadh')::date;
  end if;
  return next v_lock;
end;
$$;

comment on function public.library_security_lock_lift(uuid, uuid, text, boolean) is
  'An admin lifts a library lock (owner note ١٣ C09, 20261030_80) and, by default, clears the user''s counted documents for today so the next read does not re-lock him. The row is kept. Service role only.';

revoke all on function public.library_security_lock_lift(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.library_security_lock_lift(uuid, uuid, text, boolean) to service_role;

-- ── 6. verify (raises on a failure) ──────────────────────────────────────────
do $$
declare fn text; tbl text;
begin
  foreach fn in array array[
    'public.library_read_quota_hit(uuid,text,int,int,int,int)',
    'public.library_security_lock_create(uuid,uuid,text,timestamptz)',
    'public.library_security_lock_lift(uuid,uuid,text,boolean)'] loop
    if to_regprocedure(fn) is null then
      raise exception '20261030_80 verify: % is missing', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '20261030_80 verify: a session role can EXECUTE %', fn;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(fn) and p.prosecdef
                   and p.proconfig @> array['search_path=""']) then
      raise exception '20261030_80 verify: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
  end loop;
  foreach tbl in array array['public.library_security_locks', 'public.library_read_quota_docs'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = to_regclass(tbl)) then
      raise exception '20261030_80 verify: RLS is off on %', tbl;
    end if;
    if has_table_privilege('anon', tbl, 'SELECT') or has_table_privilege('authenticated', tbl, 'SELECT')
       or has_table_privilege('anon', tbl, 'INSERT') or has_table_privilege('authenticated', tbl, 'INSERT')
       or has_table_privilege('authenticated', tbl, 'UPDATE') or has_table_privilege('authenticated', tbl, 'DELETE') then
      raise exception '20261030_80 verify: a session role holds a privilege on %', tbl;
    end if;
  end loop;
end $$;

commit;
notify pgrst, 'reload schema';

-- ── SELECT check (run on its own; every column must read true) ───────────────
select
  to_regclass('public.library_security_locks') is not null                         as locks_table,
  to_regclass('public.library_read_quota_docs') is not null                        as quota_table,
  to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)') is not null as quota_fn,
  to_regprocedure('public.library_security_lock_create(uuid,uuid,text,timestamptz)') is not null as lock_create_fn,
  to_regprocedure('public.library_security_lock_lift(uuid,uuid,text,boolean)') is not null as lock_lift_fn,
  not has_table_privilege('authenticated', 'public.library_security_locks', 'SELECT') as locks_hidden_from_users,
  not has_function_privilege('authenticated', 'public.library_read_quota_hit(uuid,text,int,int,int,int)', 'EXECUTE') as quota_fn_service_only;
