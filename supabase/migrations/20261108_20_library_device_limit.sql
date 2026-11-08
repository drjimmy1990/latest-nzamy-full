-- =============================================================================
-- Migration: 20261108_20_library_device_limit.sql
-- Owner answer ٤٢٧ (his 11-03 package, «المكتبة القانونية والأجهزة»):
--   «الجهاز الثالث (في كمبيوتر + جوال): يُرفض الجهاز الثالث الجديد فوراً
--    ويُقفل، ويُطلب من المستخدم تسجيل الخروج من أحد أجهزته المصرحة.»
--
-- WHAT THIS FILE ADDS
--   1. library_monitor_settings (20261031_10, the admin-edited row of the
--      library caps) gains two columns:
--        device_limit_enabled boolean DEFAULT FALSE — ships OFF; an admin turns
--                                    it on from «الأمان والحماية ← أجهزة المكتبة»
--                                    after testing;
--        device_limit         int     DEFAULT 2     — computer + phone.
--   2. public.user_devices — one row per (user, device). The device is a random
--      id in an httpOnly cookie (src/lib/library/deviceLimit.ts); only its
--      SHA-256 is stored here. label (from the user-agent), first_seen,
--      last_seen, revoked_at (+ by whom and why). A revoked row is kept and
--      comes back to life when that device registers again.
--   3. library_device_check(user, hash, label) — the atomic check-and-register,
--      under a per-user advisory lock (two new devices at the same moment
--      cannot both take the last slot):
--        setting off            → 'disabled'   (nothing is written)
--        admin (staff) account  → 'exempt'     (nothing is written)
--        known active device    → 'ok'         (last_seen refreshed ≤ every 5 min)
--        new device, room left  → 'registered' (inserted, or a revoked row revived)
--        new device, no room    → 'refused'    + the active devices (id, label,
--                                                first_seen, last_seen)
--   4. library_device_revoke(user, device_id, device_hash, reason, actor) —
--      revoke one device (by id or by hash) or, with both null, every active
--      device of the user (the admin's «إعادة تعيين الأجهزة»). Returns how many.
--
-- WHO MAY CALL WHAT
--   Both functions: SECURITY DEFINER, search_path = '', EXECUTE for
--   service_role only (the app calls them from the server with the user id it
--   verified through getUser()). user_devices: a signed-in user may SELECT his
--   own rows (RLS), and only the columns without the hash; no direct write for
--   anon / authenticated.
--
-- RUN ORDER: any time — before or after the deploy. The app fails OPEN while
--   this file is missing (no device check at all), and even after it runs the
--   check stays off until an admin enables it.
-- Requires: 20261031_10 (library_monitor_settings).
-- ROLLBACK:
--   drop function if exists public.library_device_check(uuid, text, text);
--   drop function if exists public.library_device_revoke(uuid, uuid, text, text, uuid);
--   drop table if exists public.user_devices;
--   alter table public.library_monitor_settings
--     drop column if exists device_limit_enabled, drop column if exists device_limit;
-- Safe to re-run.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. precondition ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_monitor_settings') is null then
    raise exception '20261108_20: run 20261031_10_library_activity_monitor.sql first';
  end if;
end $$;

-- ── 1. the two settings ─────────────────────────────────────────────────────
alter table public.library_monitor_settings
  add column if not exists device_limit_enabled boolean not null default false,
  add column if not exists device_limit int not null default 2;

alter table public.library_monitor_settings
  drop constraint if exists library_monitor_settings_device_limit_check;
alter table public.library_monitor_settings
  add constraint library_monitor_settings_device_limit_check check (device_limit between 1 and 10);

comment on column public.library_monitor_settings.device_limit_enabled is
  'Owner ٤٢٧: refuse a new device beyond device_limit on the subscriber library text. Ships false (20261108_20).';
comment on column public.library_monitor_settings.device_limit is
  'Owner ٤٢٧: authorised devices per account (computer + phone = 2). 20261108_20.';

-- ── 2. user_devices ─────────────────────────────────────────────────────────
create table if not exists public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  device_hash   text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  label         text not null default '' check (length(label) <= 120),
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text check (revoke_reason is null or revoke_reason in ('self', 'other_device', 'sign_out', 'admin_reset')),
  constraint user_devices_user_hash_key unique (user_id, device_hash)
);

create index if not exists user_devices_active
  on public.user_devices (user_id) where revoked_at is null;

comment on table public.user_devices is
  'Owner ٤٢٧: the devices an account opened the subscriber library on (20261108_20). device_hash = sha-256 of the httpOnly device cookie. Written only by library_device_check / library_device_revoke.';

alter table public.user_devices enable row level security;
revoke all on public.user_devices from public, anon, authenticated;
-- The owner reads his own rows, never the hash.
grant select (id, user_id, label, first_seen, last_seen, revoked_at) on public.user_devices to authenticated;
grant all on public.user_devices to service_role;

drop policy if exists "user_devices: owner reads own" on public.user_devices;
create policy "user_devices: owner reads own" on public.user_devices
  for select to authenticated using (user_id = (select auth.uid()));

-- ── 3. library_device_check ─────────────────────────────────────────────────
create or replace function public.library_device_check(
  p_user        uuid,
  p_device_hash text,
  p_label       text)
returns table (
  status       text,
  device_limit int,
  device_id    uuid,
  devices      jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit   int;
  v_type    text;
  v_label   text;
  v_row     public.user_devices;
  v_active  int;
  v_id      uuid;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_check: invalid arguments' using errcode = '22023';
  end if;
  v_label := left(coalesce(nullif(btrim(p_label), ''), 'جهاز'), 120);

  select s.device_limit_enabled, s.device_limit
    into v_enabled, v_limit
    from public.library_monitor_settings s
   where s.id;
  v_limit := coalesce(v_limit, 2);
  if not coalesce(v_enabled, false) then
    return query select 'disabled'::text, v_limit, null::uuid, '[]'::jsonb;
    return;
  end if;

  -- Staff (every admin account) is exempt, as in library_read_quota_hit.
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type = 'admin' then
    return query select 'exempt'::text, v_limit, null::uuid, '[]'::jsonb;
    return;
  end if;

  -- One device decision per user at a time: two new devices arriving together
  -- cannot both see a free slot.
  perform pg_advisory_xact_lock(hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row
    from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash;

  if found and v_row.revoked_at is null then
    if v_row.last_seen < now() - interval '5 minutes' or v_row.label is distinct from v_label then
      update public.user_devices d
         set last_seen = now(), label = v_label
       where d.id = v_row.id;
    end if;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb;
    return;
  end if;

  select count(*)::int into v_active
    from public.user_devices d
   where d.user_id = p_user and d.revoked_at is null;

  if v_active < v_limit then
    insert into public.user_devices as d (user_id, device_hash, label)
    values (p_user, p_device_hash, v_label)
    on conflict on constraint user_devices_user_hash_key do update
       set revoked_at = null, revoked_by = null, revoke_reason = null,
           label = excluded.label, first_seen = now(), last_seen = now()
    returning d.id into v_id;
    return query select 'registered'::text, v_limit, v_id, '[]'::jsonb;
    return;
  end if;

  return query
    select 'refused'::text, v_limit, null::uuid,
           coalesce((select jsonb_agg(jsonb_build_object(
                               'id', d.id, 'label', d.label,
                               'first_seen', d.first_seen, 'last_seen', d.last_seen)
                             order by d.last_seen desc)
                       from public.user_devices d
                      where d.user_id = p_user and d.revoked_at is null), '[]'::jsonb);
end;
$$;

comment on function public.library_device_check(uuid, text, text) is
  'Owner ٤٢٧: atomic check-and-register of a library device under a per-user advisory lock; disabled / exempt / ok / registered / refused (20261108_20). Service role only.';

revoke all on function public.library_device_check(uuid, text, text) from public, anon, authenticated;
grant execute on function public.library_device_check(uuid, text, text) to service_role;

-- ── 4. library_device_revoke ────────────────────────────────────────────────
create or replace function public.library_device_revoke(
  p_user        uuid,
  p_device_id   uuid,
  p_device_hash text,
  p_reason      text,
  p_actor       uuid)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if p_user is null
     or p_reason is null or p_reason not in ('self', 'other_device', 'sign_out', 'admin_reset')
     or (p_device_hash is not null and p_device_hash !~ '^[0-9a-f]{64}$')
     or (p_device_id is not null and p_device_hash is not null) then
    raise exception 'library_device_revoke: invalid arguments' using errcode = '22023';
  end if;
  -- Revoking every device is the admin reset only.
  if p_device_id is null and p_device_hash is null and p_reason <> 'admin_reset' then
    raise exception 'library_device_revoke: name a device' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('library_device:' || p_user::text, 0));

  update public.user_devices d
     set revoked_at = now(), revoked_by = p_actor, revoke_reason = p_reason
   where d.user_id = p_user
     and d.revoked_at is null
     and (p_device_id is null or d.id = p_device_id)
     and (p_device_hash is null or d.device_hash = p_device_hash);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.library_device_revoke(uuid, uuid, text, text, uuid) is
  'Owner ٤٢٧: revoke one library device of a user (by id or hash) or, reason admin_reset with both null, all of them (20261108_20). Service role only.';

revoke all on function public.library_device_revoke(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.library_device_revoke(uuid, uuid, text, text, uuid) to service_role;

-- ── 5. self-check ───────────────────────────────────────────────────────────
do $$
declare
  fn text;
begin
  foreach fn in array array['public.library_device_check(uuid,text,text)',
                            'public.library_device_revoke(uuid,uuid,text,text,uuid)'] loop
    if not exists (select 1 from pg_proc p
                    where p.oid = to_regprocedure(fn)
                      and p.prosecdef
                      and p.proconfig @> array['search_path=""']) then
      raise exception '20261108_20 verify: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '20261108_20 verify: anon / authenticated can execute %', fn;
    end if;
  end loop;
end $$;

commit;
