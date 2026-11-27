-- =============================================================================
-- Migration: 20261209_40_l19_account_device_limit.sql
-- Batch l19 (owner ٢٣٣ / LIVE-17, 27 Nov 2026): the device limit covers the
-- WHOLE account — one mobile + one computer — registered silently (no e-mail
-- code), an extra device refused («تواصل مع الإدارة»), the old device never
-- signed out, admins and staff exempt, each firm / company member counted on
-- his own account. Replaces library register item 9 («المكتبة فقط»).
--
-- WHAT THIS FILE ADDS
--   1. library_monitor_settings.account_device_limit_enabled boolean DEFAULT
--      FALSE — the NEW switch («حد الأجهزة للحساب كله»). Ships OFF: nothing is
--      refused anywhere until an admin turns it on. The old library-only
--      columns device_limit_enabled / device_limit are left as they are (no
--      data change); the app stops reading them with this batch.
--   2. user_devices.kind ('mobile' | 'desktop', NULL = not classified yet),
--      stored once when a device registers. Existing rows are classified
--      from the label the old code wrote («جوال…» / «جهاز لوحي…» → mobile,
--      «كمبيوتر…» → desktop); any other label stays NULL and is classified
--      the next time that device is seen. Guarded (kind IS NULL and a known
--      prefix), prints how many rows it changed, a re-run changes none.
--   3. public.account_device_gate(user, hash, label, kind) — the atomic
--      check-and-register, under the SAME per-user advisory lock as
--      library_device_revoke (a reset and a check never race):
--        switch off                       → 'disabled' (nothing read or written)
--        admin (user_type) / platform_staff → 'exempt'  (nothing written)
--        known active verified device     → 'ok'       (whatever its browser says
--                                                       now — the stored class
--                                                       wins; grandfathered rows
--                                                       included)
--        any other device, its class held by another CONFIRMED device
--                                         → 'refused' (nothing written)
--        its class free: a new or revoked device becomes a CANDIDATE
--                                         → 'pending' (allowed)
--        a candidate seen first ≥ 2 minutes ago, class still free
--                                         → 'registered' (silently confirmed)
--      Only confirmed rows (verified_at set) hold a slot. The 2-minute wait
--      keeps a first device from locking itself out when its first parallel
--      requests each mint an id (the browser keeps whichever answer lands
--      last). A row still waiting for an old e-mail code (verified_at NULL)
--      is a candidate like any other. The old library_device_gate /
--      library_device_check stay, unused by the app.
--
-- WHO MAY CALL: SECURITY DEFINER, search_path = '', EXECUTE for service_role
--   only (the app calls it from the server with the user id getUser()
--   verified). No grant to anon / authenticated changes.
--
-- RUN ORDER: BEFORE the deploy (the app fails open while the function is
--   missing: no device check at all). Requires 20261031_10, 20261108_20 and
--   20261127_60 (all on prod). Safe to re-run.
-- O2 OF 20261201_10 («بلا أي bypass») IS REVERSED HERE for the account limit
--   by the newer ٢٣٣ wording: admins and staff are exempt.
-- ROLLBACK:
--   drop function if exists public.account_device_gate(uuid, text, text, text);
--   alter table public.user_devices drop constraint if exists user_devices_kind_check;
--   alter table public.user_devices drop column if exists kind;
--   alter table public.library_monitor_settings drop column if exists account_device_limit_enabled;
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_monitor_settings') is null then
    raise exception '20261209_40: run 20261031_10_library_activity_monitor.sql first';
  end if;
  if to_regclass('public.user_devices') is null then
    raise exception '20261209_40: run 20261108_20_library_device_limit.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.user_devices'::regclass
                    and attname = 'verified_at' and not attisdropped) then
    raise exception '20261209_40: run 20261127_60_community_review_devices_freeze.sql first (user_devices.verified_at)';
  end if;
end $$;

-- ── 1. the new switch ───────────────────────────────────────────────────────
alter table public.library_monitor_settings
  add column if not exists account_device_limit_enabled boolean not null default false;

comment on column public.library_monitor_settings.account_device_limit_enabled is
  'Owner ٢٣٣ (20261209_40): one mobile + one computer per account across the whole platform; an extra device is refused. Ships false. Replaces the library-only device_limit_enabled, which the app no longer reads.';

-- ── 2. the class of a device ────────────────────────────────────────────────
alter table public.user_devices add column if not exists kind text;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.user_devices'::regclass
                    and conname = 'user_devices_kind_check') then
    alter table public.user_devices
      add constraint user_devices_kind_check check (kind is null or kind in ('mobile', 'desktop'));
  end if;
end $$;

comment on column public.user_devices.kind is
  'Owner ٢٣٣ (20261209_40): mobile or desktop, stored once when the device registers (the slot it takes). NULL = not classified yet; counts toward neither slot.';

-- Existing rows: from the label deviceLabelFromUserAgent() wrote.
do $$
declare
  n int;
begin
  update public.user_devices d
     set kind = case when d.label like 'كمبيوتر%' then 'desktop' else 'mobile' end
   where d.kind is null
     and (d.label like 'جوال%' or d.label like 'جهاز لوحي%' or d.label like 'كمبيوتر%');
  get diagnostics n = row_count;
  raise notice '20261209_40: user_devices.kind set on % existing row(s) from the label (0 on a re-run)', n;
end $$;

-- ── 3. account_device_gate ──────────────────────────────────────────────────
create or replace function public.account_device_gate(
  p_user        uuid,
  p_device_hash text,
  p_label       text,
  p_kind        text)
returns table (
  status      text,
  device_id   uuid,
  device_kind text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_type    text;
  v_label   text;
  v_kind    text;
  v_row     public.user_devices;
  v_found   boolean;
  v_taken   int;
  v_id      uuid;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$'
     or p_kind is null or p_kind not in ('mobile', 'desktop') then
    raise exception 'account_device_gate: invalid arguments' using errcode = '22023';
  end if;
  v_label := pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_label), ''), 'جهاز'), 120);

  select s.account_device_limit_enabled into v_enabled
    from public.library_monitor_settings s where s.id;
  if not coalesce(v_enabled, false) then
    return query select 'disabled'::text, null::uuid, null::text;
    return;
  end if;

  -- Admins and staff are exempt (owner ٢٣٣; the phone_otp_gate rule).
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type = 'admin' then
    return query select 'exempt'::text, null::uuid, null::text;
    return;
  end if;
  if to_regclass('public.platform_staff') is not null then
    if exists (select 1 from public.platform_staff ps where ps.user_id = p_user) then
      return query select 'exempt'::text, null::uuid, null::text;
      return;
    end if;
  end if;

  -- One decision per user at a time — the key library_device_revoke takes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash;
  v_found := found;

  -- 1. A known, active, verified device: ok, whatever its browser says now.
  if v_found and v_row.revoked_at is null and v_row.verified_at is not null then
    if v_row.kind is null or v_row.last_seen < now() - interval '5 minutes' or v_row.label is distinct from v_label then
      update public.user_devices d
         set kind = coalesce(d.kind, p_kind), last_seen = now(), label = v_label
       where d.id = v_row.id;
    end if;
    return query select 'ok'::text, v_row.id, coalesce(v_row.kind, p_kind);
    return;
  end if;

  -- 2. Any other device: refused at once when another CONFIRMED device holds
  --    its class (nothing is written). A row that already carries a class
  --    keeps it.
  v_kind := case when v_found and v_row.kind is not null then v_row.kind else p_kind end;

  select pg_catalog.count(*)::int into v_taken
    from public.user_devices d
   where d.user_id = p_user
     and d.revoked_at is null
     and d.verified_at is not null
     and d.kind = v_kind
     and d.device_hash <> p_device_hash;

  if v_taken >= 1 then
    return query select 'refused'::text, null::uuid, v_kind;
    return;
  end if;

  -- 3. The class is free. A candidate seen first at least 2 minutes ago (or a
  --    row left waiting for an old e-mail code) is confirmed now — silently.
  --    The wait is what keeps a first device from locking itself out: when a
  --    browser's first requests run in parallel, each mints its own id and the
  --    last answer to arrive decides which id the browser keeps; only an id the
  --    browser still sends after the wait takes the slot.
  if v_found and v_row.revoked_at is null and v_row.verified_at is null
     and v_row.first_seen <= now() - interval '2 minutes' then
    update public.user_devices d
       set verified_at = now(), kind = v_kind, label = v_label, last_seen = now(), opened_at = now(),
           code_hash = null, code_expires_at = null, code_attempts = 0
     where d.id = v_row.id;
    return query select 'registered'::text, v_row.id, v_kind;
    return;
  end if;

  -- 4. A recent candidate: allowed while the class is free.
  if v_found and v_row.revoked_at is null and v_row.verified_at is null then
    if v_row.last_seen < now() - interval '5 minutes' or v_row.label is distinct from v_label or v_row.kind is distinct from v_kind then
      update public.user_devices d set last_seen = now(), label = v_label, kind = v_kind where d.id = v_row.id;
    end if;
    return query select 'pending'::text, v_row.id, v_kind;
    return;
  end if;

  -- 5. A new device, or one revoked (an admin reset): a candidate from now.
  insert into public.user_devices as d (user_id, device_hash, label, kind)
  values (p_user, p_device_hash, v_label, v_kind)
  on conflict on constraint user_devices_user_hash_key do update
     set revoked_at = null, revoked_by = null, revoke_reason = null, verified_at = null,
         label = excluded.label, kind = excluded.kind, first_seen = now(), last_seen = now(),
         code_hash = null, code_expires_at = null, code_attempts = 0
  returning d.id into v_id;
  return query select 'pending'::text, v_id, v_kind;
end;
$$;

comment on function public.account_device_gate(uuid, text, text, text) is
  'Owner ٢٣٣ (20261209_40): one mobile + one computer per account — disabled / exempt (admin, platform_staff) / ok (known confirmed device, grandfathered rows included) / pending (a candidate, its class free) / registered (a candidate confirmed after 2 minutes, silently) / refused (its class held by another confirmed device). Same advisory lock as library_device_revoke. Service role only.';

revoke all on function public.account_device_gate(uuid, text, text, text) from public;
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke all on function public.account_device_gate(uuid, text, text, text) from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke all on function public.account_device_gate(uuid, text, text, text) from authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.account_device_gate(uuid, text, text, text) to service_role;
  end if;
end $$;

-- ── 4. self-check ───────────────────────────────────────────────────────────
do $verify$
declare
  fn  constant text := 'public.account_device_gate(uuid,text,text,text)';
  def text;
  missing text := '';
begin
  if to_regprocedure(fn) is null then
    raise exception '20261209_40 verify: % is missing', fn;
  end if;
  def := pg_catalog.pg_get_functiondef(to_regprocedure(fn));
  if not exists (select 1 from pg_catalog.pg_proc p
                  where p.oid = to_regprocedure(fn) and p.prosecdef and p.proconfig @> array['search_path=""']) then
    missing := missing || ' not SECURITY DEFINER with an empty search_path;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and has_function_privilege('anon', fn, 'EXECUTE') then
    missing := missing || ' anon can execute it;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', fn, 'EXECUTE') then
    missing := missing || ' authenticated can execute it;';
  end if;
  if pg_catalog.strpos(def, 'platform_staff') = 0 or pg_catalog.strpos(def, '''exempt''') = 0 then
    missing := missing || ' the staff exemption is missing;';
  end if;
  if pg_catalog.strpos(def, 'interval ''2 minutes''') = 0 then
    missing := missing || ' the candidate wait is missing;';
  end if;
  if pg_catalog.strpos(def, 'account_device_limit_enabled') = 0 then
    missing := missing || ' it does not read the account switch;';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.library_monitor_settings'::regclass
                    and attname = 'account_device_limit_enabled' and not attisdropped) then
    missing := missing || ' library_monitor_settings.account_device_limit_enabled is missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.user_devices'::regclass and conname = 'user_devices_kind_check') then
    missing := missing || ' user_devices_kind_check is missing;';
  end if;
  if missing <> '' then
    raise exception '20261209_40 verify:%', missing;
  end if;
  raise notice '20261209_40 verify: OK — account_device_gate (1 mobile + 1 desktop, admins/staff exempt, service_role only), the account switch (% now) and user_devices.kind',
    (select case when s.account_device_limit_enabled then 'ON' else 'OFF' end from public.library_monitor_settings s where s.id);
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261209_40 l19 account device limit: 1 mobile + 1 desktop per account, switch OFF until an admin turns it on' as migration,
       to_regprocedure('public.account_device_gate(uuid,text,text,text)') is not null as ok;
