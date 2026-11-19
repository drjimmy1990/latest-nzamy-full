-- =============================================================================
-- Migration: 20261129_40_library_read_log.sql
-- =============================================================================
-- PURPOSE (owner register 14 items 8 / 9 / 16 / 44 / 48; file 16 §9.1, §9.3,
-- §9.4, §9.10; file 19 «no bypass for test or admin»; batch l9, builder read)
--
--   1. public.full_text_reads — the durable full-text read log (spec 17.19):
--      one row per (user, Riyadh day, document) the FIRST time that day the
--      user opens the document's full text. Written only by
--      library_read_quota_hit (below). Kept at least one year: each call
--      deletes the caller's own rows older than 400 days. Service role only
--      (RLS on, no policy, no session grant); never shown to the client.
--      Read by: the weekly cap (below) and the refund verdict (the «≤ 5 full
--      texts since payment» rule, src/lib/payments/refundEvidence.ts).
--      Backfilled once from library_read_quota_docs (today and yesterday).
--
--   2. Read limits (register 8, spec 17.2) — two new columns on the one row
--      public.library_monitor_settings, edited on «نشاط المكتبة»:
--        daily_full_read_limit  int default 30   the WARNING (no refusal)
--        weekly_full_read_limit int default 150  a block over the last 7
--                                                Riyadh days (today + 6)
--      The daily HARD cap stays daily_docs / member_daily_docs (50 since
--      20261128_30) = the owner's daily_full_read_hard_cap. An added column
--      takes its default; an admin's value is never reset on a re-run.
--
--   3. public.library_read_quota_hit — DROPPED AND RE-CREATED from its LATEST
--      definition (20261103_10_library_auto_lock_hours.sql §2) with the SAME
--      arguments and four MORE output columns (week_used, week_limit,
--      warn_at, week_resets_at), so it cannot be a plain CREATE OR REPLACE.
--      The drop and the create are in one transaction (no moment without it).
--      Changes, nothing else:
--        * admins are NOT exempt any more (file 19, spec 18.4: «بلا أي bypass
--          لـtest والأدمن») — the 'exempt' early return is gone;
--        * an allowed new document is also written to full_text_reads;
--        * a new document past weekly_full_read_limit (counted in
--          full_text_reads over the last 7 Riyadh days) is refused with
--          status 'over_weekly' and the moment the window lets one more in;
--        * a per-user daily cap ABOVE the global one (library_user_limits)
--          lifts the weekly cap to 7 × that daily cap, so an admin's
--          exception is not undone by the weekly rule; a slowed reader keeps
--          the global weekly cap.
--      Statuses: ok | over_daily | over_weekly | over_hourly | locked.
--
--   4. Library devices (register 9, file 16 §9.4, gap #20.3) — the device
--      rule applies to the LIBRARY ONLY. library_device_gate and
--      library_device_code_verify are re-created from their LATEST definition
--      (20261127_60 §C2 / §C4) WITHOUT the «delete from auth.sessions /
--      auth.refresh_tokens» lines: opening the library on a device never
--      signs the account out of the rest of the platform. The third
--      never-verified device is answered 'refused' (the list, owner ٦٣)
--      instead of 'suspend' (the app already read both as the refusal).
--      sessions_ended is always 0. Everything else is unchanged; the switch
--      device_limit_enabled is untouched (it stays as the admin left it).
--
--   5. platform_settings 'library_min_points_to_browse' = {"points": 50}
--      (register 48, spec 16.12) — inserted only when missing. The gate is
--      applied by the app (src/lib/library/pointsGate*.ts); edited and
--      audited through /api/v1/admin/settings.
--
-- WHO CAN DO WHAT: every function SECURITY DEFINER, search_path '', EXECUTE
--   for service_role only. full_text_reads: service role only.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_40_library_read_log.sql
--   Expect: NOTICE  l9_read verify: OK  and a row with `t`.
--
-- RUN ORDER: any time after 20261128_30 (batch 8, live). Before or after the
--   l9 deploy:
--   * Code first: the app reads the new columns and statuses when they are
--     there; until then the reader sees no warning and no weekly cap (the
--     50/day cap still applies), the refund verdict says the read log is not
--     available («تعذّر التحقق», an admin reason is needed), the 50-point gate
--     already works (it reads points_balance and the default 50), and the
--     device gate keeps 20261127_60's behaviour.
--   * SQL first with the old code: the old code ignores the new columns; an
--     'over_weekly' answer is not a status it knows, so it lets that read go
--     on (fails open) — the weekly cap applies once the code is deployed.
--   RE-RUN HAZARD: re-running 20261030_80, 20261031_10 or 20261103_10 brings
--   back the OLD library_read_quota_hit — and those files use CREATE OR
--   REPLACE with the old columns, which FAILS against this one (42P13). Re-run
--   this file after any of them. Re-running 20261127_60 brings back the
--   session-ending device functions: re-run this file after it.
--   This file itself is safe to run any number of times.
--
-- ROLLBACK (in one transaction):
--   1. drop function public.library_read_quota_hit(uuid, text, int, int, int, int);
--      then run §2 of 20261103_10_library_auto_lock_hours.sql (the old
--      function and its comment / grants);
--   2. run §C2 and §C4 of 20261127_60_community_review_devices_freeze.sql;
--   3. alter table public.library_monitor_settings
--        drop column if exists daily_full_read_limit,
--        drop column if exists weekly_full_read_limit;
--   4. delete from public.platform_settings where key = 'library_min_points_to_browse';
--      (the app then uses its default 50; set {"points": 0} to switch the
--      gate off instead)
--   5. drop table if exists public.full_text_reads;  (loses the read log —
--      the refund rule then cannot be verified)
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_monitor_settings') is null
     or to_regclass('public.library_read_quota_docs') is null
     or to_regprocedure('public.library_quota_limits(uuid,int,int,int,int)') is null
     or to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)') is null then
    raise exception '20261129_40: run 20261030_80, 20261031_10 and 20261103_10 first';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.library_monitor_settings'::regclass
                    and attname = 'auto_lock_hours' and not attisdropped) then
    raise exception '20261129_40: run 20261103_10_library_auto_lock_hours.sql first';
  end if;
  if to_regprocedure('public.library_device_gate(uuid,text,text,uuid,boolean)') is null
     or to_regprocedure('public.library_device_code_verify(uuid,text,text,uuid)') is null then
    raise exception '20261129_40: run 20261127_60_community_review_devices_freeze.sql first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261129_40: public.platform_settings is missing';
  end if;
end $$;

-- ── 1. full_text_reads ───────────────────────────────────────────────────────
create table if not exists public.full_text_reads (
  user_id   uuid not null references auth.users(id) on delete cascade,
  day       date not null,
  doc_key   text not null constraint full_text_reads_doc_key_check check (length(doc_key) between 1 and 300),
  opened_at timestamptz not null default now(),
  constraint full_text_reads_pkey primary key (user_id, day, doc_key)
);

create index if not exists full_text_reads_user_opened
  on public.full_text_reads (user_id, opened_at);

comment on table public.full_text_reads is
  'The durable full-text read log (owner register 14 items 8 / 44, spec 17.19; 20261129_40): one row per user, Riyadh day and document, the first full-text open that day. Written only by library_read_quota_hit; read by the weekly cap and the refund verdict (≤ 5 full texts since payment). Kept ≥ 1 year (rows older than 400 days are removed per user). Service role only; never shown to the client.';

alter table public.full_text_reads enable row level security;
revoke all on public.full_text_reads from public, anon, authenticated;
grant all on public.full_text_reads to service_role;

-- One-time continuity: today's and yesterday's allowed documents.
insert into public.full_text_reads (user_id, day, doc_key, opened_at)
select d.user_id, d.day, d.doc_key, d.first_at
  from public.library_read_quota_docs d
 where d.allowed
   and exists (select 1 from auth.users u where u.id = d.user_id)
on conflict (user_id, day, doc_key) do nothing;

-- ── 2. the two read-limit settings ───────────────────────────────────────────
alter table public.library_monitor_settings add column if not exists daily_full_read_limit int not null default 30;
alter table public.library_monitor_settings add column if not exists weekly_full_read_limit int not null default 150;
alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_daily_full_read_limit_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_daily_full_read_limit_check
  check (daily_full_read_limit between 1 and 100000);
alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_weekly_full_read_limit_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_weekly_full_read_limit_check
  check (weekly_full_read_limit between 1 and 1000000);
comment on column public.library_monitor_settings.daily_full_read_limit is
  'Owner register 14 item 8 (20261129_40): the daily full-text opens at which the reader is WARNED (30). No refusal; the hard cap is daily_docs / member_daily_docs (daily_full_read_hard_cap, 50).';
comment on column public.library_monitor_settings.weekly_full_read_limit is
  'Owner register 14 item 8 (20261129_40): full-text opens refused past this count over the last 7 Riyadh days, today included (150). Counted in full_text_reads.';

-- ── 3. library_read_quota_hit, re-created (same arguments, 4 more columns) ──
drop function if exists public.library_read_quota_hit(uuid, text, int, int, int, int);

create function public.library_read_quota_hit(
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
  resets_at      timestamptz,
  week_used      int,
  week_limit     int,
  warn_at        int,
  week_resets_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_day      date := (now() at time zone 'Asia/Riyadh')::date;
  v_resets   timestamptz := ((now() at time zone 'Asia/Riyadh')::date + 1)::timestamp at time zone 'Asia/Riyadh';
  v_type     text;
  v_member   boolean;
  v_limit    int;
  v_hlimit   int;
  v_lockn    int;
  v_used     int;
  v_hour     int;
  v_refused  int;
  v_oldest   timestamptz;
  v_lock     public.library_security_locks;
  v_notify   boolean;
  v_auto_hours int;
  v_base     int;
  v_warn     int;
  v_wlimit   int;
  v_week     int;
  v_wresets  timestamptz;
  v_k        int;
  v_n        int;
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

  select l.day_limit, l.hour_limit, l.lock_after, l.user_type, l.is_member
    into v_limit, v_hlimit, v_lockn, v_type, v_member
    from public.library_quota_limits(p_user, p_daily_docs, p_member_daily_docs, p_hourly_docs, p_lock_after_refused) l;

  -- 20261129_40: no exemption — an admin (and a test account) is counted,
  -- capped and logged like everyone else (file 19, spec 18.4).

  -- The warning and the weekly cap (20261129_40). A per-user daily cap above
  -- the global one lifts the weekly cap to 7 × it.
  select ms.daily_full_read_limit, ms.weekly_full_read_limit,
         case when coalesce(v_member, false) then ms.member_daily_docs else ms.daily_docs end
    into v_warn, v_wlimit, v_base
    from public.library_monitor_settings ms where ms.id;
  v_warn   := coalesce(v_warn, 30);
  v_wlimit := coalesce(v_wlimit, 150);
  v_base   := coalesce(v_base, case when coalesce(v_member, false) then p_member_daily_docs else p_daily_docs end);
  if v_limit > v_base then
    v_wlimit := greatest(v_wlimit, v_limit * 7);
  end if;

  -- A lock whose time ran out closes itself (lifted_by stays null).
  update public.library_security_locks l
     set lifted_at = now(), lift_note = coalesce(l.lift_note, 'expired')
   where l.user_id = p_user and l.lifted_at is null
     and l.locked_until is not null and l.locked_until <= now();

  select * into v_lock from public.library_security_locks l
   where l.user_id = p_user and l.lifted_at is null;
  if found then
    return query select 'locked'::text, 0, 0, 0, 0, 0, v_lock.reference, v_lock.locked_until, null::timestamptz,
      0, v_wlimit, v_warn, null::timestamptz;
    return;
  end if;

  -- Housekeeping: this user's rows from before yesterday (primary-key prefix),
  -- and read-log rows past the one-year keep (400 days).
  delete from public.library_read_quota_docs d where d.user_id = p_user and d.day < v_day - 1;
  delete from public.full_text_reads r where r.user_id = p_user and r.day < v_day - 400;

  select count(*) filter (where d.allowed),
         count(*) filter (where d.allowed and d.first_at > now() - interval '1 hour'),
         count(*) filter (where not d.allowed),
         min(d.first_at) filter (where d.allowed and d.first_at > now() - interval '1 hour')
    into v_used, v_hour, v_refused, v_oldest
    from public.library_read_quota_docs d
   where d.user_id = p_user and d.day = v_day;

  select count(*)::int into v_week from public.full_text_reads r
   where r.user_id = p_user and r.day between v_day - 6 and v_day;

  -- When the 7-day window lets one more document in, if it is full now: the
  -- first Riyadh midnight at which the days still inside hold fewer than the cap.
  if v_week >= v_wlimit then
    v_k := 1;
    loop
      select count(*)::int into v_n from public.full_text_reads r
       where r.user_id = p_user and r.day between v_day - 6 + v_k and v_day;
      exit when v_n < v_wlimit or v_k >= 7;
      v_k := v_k + 1;
    end loop;
    v_wresets := ((v_day + v_k)::timestamp) at time zone 'Asia/Riyadh';
  end if;

  -- State only (the library status route, the search lock check).
  if p_doc_key is null then
    return query select 'ok'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_resets,
      v_week, v_wlimit, v_warn, v_wresets;
    return;
  end if;

  -- A document already counted today is free to re-open, window after window.
  if exists (select 1 from public.library_read_quota_docs d
              where d.user_id = p_user and d.day = v_day and d.doc_key = p_doc_key and d.allowed) then
    return query select 'ok'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_resets,
      v_week, v_wlimit, v_warn, v_wresets;
    return;
  end if;

  if v_used >= v_limit or v_hour >= v_hlimit or v_week >= v_wlimit then
    insert into public.library_read_quota_docs (user_id, day, doc_key, allowed)
      values (p_user, v_day, p_doc_key, false)
      on conflict (user_id, day, doc_key) do nothing;
    select count(*) into v_refused from public.library_read_quota_docs d
     where d.user_id = p_user and d.day = v_day and not d.allowed;

    if v_lockn > 0 and v_refused >= v_lockn then
      select coalesce((select ms.auto_lock_hours from public.library_monitor_settings ms where ms.id), 24) into v_auto_hours;
      insert into public.library_security_locks (user_id, reason, details, locked_until)
        values (p_user, 'quota_breach', jsonb_build_object(
          'day', v_day, 'allowed_docs', v_used, 'day_limit', v_limit,
          'hour_docs', v_hour, 'hour_limit', v_hlimit,
          'week_docs', v_week, 'week_limit', v_wlimit,
          'refused_docs', v_refused, 'lock_after_refused', v_lockn),
          case when v_auto_hours > 0 then now() + make_interval(hours => v_auto_hours) end)
        returning * into v_lock;

      select ms.notify_on_auto_lock into v_notify from public.library_monitor_settings ms where ms.id;
      if coalesce(v_notify, true) then
        perform public.library_monitor_notify_admins(
          'أُوقفت قراءة المكتبة لحساب تلقائياً',
          format('حاول الحساب فتح %s وثيقة بعد بلوغ حده اليومي (%s). المرجع %s. راجع «الأمان والحماية» ← «قفل المكتبة».',
                 v_refused, v_limit, v_lock.reference),
          '/dashboard/admin/security?tab=library_locks');
      end if;

      return query select 'locked'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, v_lock.reference, v_lock.locked_until, null::timestamptz,
        v_week, v_wlimit, v_warn, null::timestamptz;
      return;
    end if;

    if v_used >= v_limit then
      return query select 'over_daily'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_resets,
        v_week, v_wlimit, v_warn, v_wresets;
    elsif v_week >= v_wlimit then
      return query select 'over_weekly'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_wresets,
        v_week, v_wlimit, v_warn, v_wresets;
    else
      return query select 'over_hourly'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz,
        least(coalesce(v_oldest, now()) + interval '1 hour', v_resets),
        v_week, v_wlimit, v_warn, v_wresets;
    end if;
    return;
  end if;

  insert into public.library_read_quota_docs (user_id, day, doc_key, allowed)
    values (p_user, v_day, p_doc_key, true)
    on conflict (user_id, day, doc_key) do update set allowed = true, first_at = now();

  insert into public.full_text_reads (user_id, day, doc_key, opened_at)
    values (p_user, v_day, p_doc_key, now())
    on conflict (user_id, day, doc_key) do nothing;

  insert into public.library_activity_hourly as a (user_id, hour, docs)
    values (p_user, date_trunc('hour', now()), 1)
    on conflict (user_id, hour) do update set docs = a.docs + 1;

  return query select 'ok'::text, v_used + 1, v_limit, v_hour + 1, v_hlimit, v_refused, null::text, null::timestamptz, v_resets,
    v_week + 1, v_wlimit, v_warn, null::timestamptz;
end;
$$;

comment on function public.library_read_quota_hit(uuid, text, int, int, int, int) is
  'Owner note ١٣ C07 / C09 + register 14 item 8 (20261030_80 → 20261031_10 → 20261103_10 → 20261129_40): counts one full-text document per user per Riyadh day (re-opening is free), writes full_text_reads, refuses past the daily hard cap (over_daily), the 7-day cap (over_weekly) or the hourly cap (over_hourly), opens a library lock after lock_after_refused refused documents (auto_lock_hours long). warn_at = the daily warning (daily_full_read_limit). p_doc_key null = state only. No admin exemption. Service role only.';

revoke all on function public.library_read_quota_hit(uuid, text, int, int, int, int) from public, anon, authenticated;
grant execute on function public.library_read_quota_hit(uuid, text, int, int, int, int) to service_role;

-- ── 4a. library_device_gate — library only, never ends a platform session ──
create or replace function public.library_device_gate(
  p_user          uuid,
  p_device_hash   text,
  p_label         text,
  p_session       uuid,
  p_code_required boolean)
returns table (
  status         text,
  device_limit   int,
  device_id      uuid,
  devices        jsonb,
  sessions_ended int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_enabled  boolean;
  v_limit    int;
  v_type     text;
  v_label    text;
  v_row      public.user_devices;
  v_verified int;
  v_id       uuid;
  v_list     jsonb;
  v_found    boolean;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_gate: invalid arguments' using errcode = '22023';
  end if;
  v_label := left(coalesce(nullif(btrim(p_label), ''), 'جهاز'), 120);

  select s.device_limit_enabled, s.device_limit into v_enabled, v_limit
    from public.library_monitor_settings s where s.id;
  v_limit := coalesce(v_limit, 2);
  if not coalesce(v_enabled, false) then
    return query select 'disabled'::text, v_limit, null::uuid, '[]'::jsonb, 0;
    return;
  end if;

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type = 'admin' then
    return query select 'exempt'::text, v_limit, null::uuid, '[]'::jsonb, 0;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash;
  v_found := found;  -- the next SELECT INTO resets FOUND

  select pg_catalog.count(*)::int into v_verified from public.user_devices d
   where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null;

  v_list := coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'label', d.label,
                                                           'first_seen', d.first_seen, 'last_seen', d.last_seen)
                                        order by d.last_seen desc)
                        from public.user_devices d
                       where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null), '[]'::jsonb);

  -- 1. A verified, active device. A new session is only recorded (20261129_40:
  --    the rule is the library's; no other session of the account is ended).
  if v_found and v_row.revoked_at is null and v_row.verified_at is not null then
    if p_session is not null and v_row.session_id is distinct from p_session then
      update public.user_devices d
         set session_id = p_session, opened_at = now(), last_seen = now(), label = v_label
       where d.id = v_row.id;
    elsif v_row.last_seen < now() - interval '5 minutes' or v_row.label is distinct from v_label then
      update public.user_devices d set last_seen = now(), label = v_label where d.id = v_row.id;
    end if;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb, 0;
    return;
  end if;

  -- 2. A known device (verified once) that signed out: back in if there is room.
  if v_found and v_row.verified_at is not null then
    if v_verified >= v_limit then
      return query select 'refused'::text, v_limit, null::uuid, v_list, 0;
      return;
    end if;
    update public.user_devices d
       set revoked_at = null, revoked_by = null, revoke_reason = null, label = v_label,
           last_seen = now(), opened_at = now(), session_id = p_session
     where d.id = v_row.id;
    return query select 'ok'::text, v_limit, v_row.id, '[]'::jsonb, 0;
    return;
  end if;

  -- 3. A device never verified while the verified devices fill the limit: the
  --    third device is refused with the list (owner ٦٣ — never a suspension).
  if v_verified >= v_limit then
    return query select 'refused'::text, v_limit, null::uuid, v_list, 0;
    return;
  end if;

  -- 4. Room left, and the server cannot send the code: registered at once.
  if not coalesce(p_code_required, true) then
    insert into public.user_devices as d (user_id, device_hash, label, verified_at, opened_at, session_id)
    values (p_user, p_device_hash, v_label, now(), now(), p_session)
    on conflict on constraint user_devices_user_hash_key do update
       set revoked_at = null, revoked_by = null, revoke_reason = null, label = excluded.label,
           first_seen = now(), last_seen = now(), verified_at = now(), opened_at = now(),
           session_id = excluded.session_id, code_hash = null, code_expires_at = null, code_attempts = 0
    returning d.id into v_id;
    return query select 'registered'::text, v_limit, v_id, '[]'::jsonb, 0;
    return;
  end if;

  -- 5. Room left: a pending row waits for the e-mail code.
  insert into public.user_devices as d (user_id, device_hash, label)
  values (p_user, p_device_hash, v_label)
  on conflict on constraint user_devices_user_hash_key do update
     set revoked_at = null, revoked_by = null, revoke_reason = null,
         label = excluded.label, last_seen = now()
  returning d.id into v_id;
  return query select 'needs_code'::text, v_limit, v_id, '[]'::jsonb, 0;
end;
$$;

comment on function public.library_device_gate(uuid, text, text, uuid, boolean) is
  'Owner ٤٠ / ٦٣ + register 14 item 9 (20261127_60 → 20261129_40): the library device gate — disabled / exempt / ok / needs_code / registered / refused. The rule is the LIBRARY''s only: it never ends a platform session (sessions_ended is always 0). The third device is refused with the list, never suspended. Service role only.';

revoke all on function public.library_device_gate(uuid, text, text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.library_device_gate(uuid, text, text, uuid, boolean) to service_role;

-- ── 4b. library_device_code_verify — same, without ending sessions ──────────
create or replace function public.library_device_code_verify(p_user uuid, p_device_hash text, p_code_hash text, p_session uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row      public.user_devices;
  v_limit    int;
  v_verified int;
begin
  if p_user is null or p_device_hash is null or p_device_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash is null or p_code_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'library_device_code_verify: invalid arguments' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('library_device:' || p_user::text, 0));

  select d.* into v_row from public.user_devices d
   where d.user_id = p_user and d.device_hash = p_device_hash
   for update;
  if not found or v_row.revoked_at is not null or v_row.verified_at is not null then
    return jsonb_build_object('state', 'not_pending');
  end if;
  if v_row.code_hash is null then
    return jsonb_build_object('state', 'no_code');
  end if;
  if v_row.code_attempts >= 5 then
    return jsonb_build_object('state', 'too_many');
  end if;
  if v_row.code_expires_at is null or v_row.code_expires_at < now() then
    return jsonb_build_object('state', 'expired');
  end if;
  if v_row.code_hash <> p_code_hash then
    update public.user_devices d set code_attempts = d.code_attempts + 1 where d.id = v_row.id;
    return jsonb_build_object('state', case when v_row.code_attempts + 1 >= 5 then 'too_many' else 'wrong' end,
                              'attempts_left', greatest(0, 5 - (v_row.code_attempts + 1)));
  end if;

  -- The right code. Room is checked again: another device may have been
  -- verified meanwhile.
  select coalesce(s.device_limit, 2) into v_limit from public.library_monitor_settings s where s.id;
  v_limit := coalesce(v_limit, 2);
  select pg_catalog.count(*)::int into v_verified from public.user_devices d
   where d.user_id = p_user and d.revoked_at is null and d.verified_at is not null;
  if v_verified >= v_limit then
    return jsonb_build_object('state', 'full');
  end if;

  update public.user_devices d
     set verified_at = now(), opened_at = now(), last_seen = now(), session_id = p_session,
         code_hash = null, code_expires_at = null, code_attempts = 0
   where d.id = v_row.id;
  return jsonb_build_object('state', 'verified', 'device_id', v_row.id, 'sessions_ended', 0);
end;
$$;

comment on function public.library_device_code_verify(uuid, text, text, uuid) is
  'Owner ٤٠ (20261127_60 → 20261129_40): checks the e-mail code of a pending library device (5 attempts); on success verifies and opens it. Never ends a platform session (register 14 item 9: library only). Service role only.';

revoke all on function public.library_device_code_verify(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.library_device_code_verify(uuid, text, text, uuid) to service_role;

-- ── 5. the 50-point library gate setting ─────────────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_min_points_to_browse', '{"points": 50}'::jsonb,
   'Owner register 14 item 48 (20261129_40): a library subscriber (paid library plan or founder) opens full text only while the points balance (founder library credits included) is at least this. 0 = gate off. Trials, invitations, admin grants and Pro-tier plans are not gated (default until the owner answers).')
on conflict (key) do nothing;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  fn  text;
  def text;
begin
  if to_regclass('public.full_text_reads') is null
     or not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.full_text_reads')), false) then
    raise exception 'l9_read verify: full_text_reads is missing or has RLS off';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_table_privilege('authenticated', 'public.full_text_reads', 'SELECT')
          or has_table_privilege('anon', 'public.full_text_reads', 'SELECT')
          or has_table_privilege('authenticated', 'public.full_text_reads', 'INSERT')) then
    raise exception 'l9_read verify: a session role can reach full_text_reads';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.library_monitor_settings'::regclass
                  and attname = 'daily_full_read_limit' and not attisdropped)
     or not exists (select 1 from pg_catalog.pg_attribute where attrelid = 'public.library_monitor_settings'::regclass
                     and attname = 'weekly_full_read_limit' and not attisdropped) then
    raise exception 'l9_read verify: the read-limit columns are missing';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'library_read_quota_hit') <> 1 then
    raise exception 'l9_read verify: library_read_quota_hit must have exactly one overload';
  end if;
  foreach fn in array array['public.library_read_quota_hit(uuid,text,int,int,int,int)',
                            'public.library_device_gate(uuid,text,text,uuid,boolean)',
                            'public.library_device_code_verify(uuid,text,text,uuid)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l9_read verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')) then
      raise exception 'l9_read verify: a session role can EXECUTE %', fn;
    end if;
  end loop;
  def := pg_catalog.pg_get_functiondef('public.library_read_quota_hit(uuid,text,int,int,int,int)'::regprocedure);
  if pg_catalog.strpos(def, 'full_text_reads') = 0 or pg_catalog.strpos(def, 'over_weekly') = 0
     or pg_catalog.strpos(def, 'auto_lock_hours') = 0 or pg_catalog.strpos(def, '''exempt''') > 0 then
    raise exception 'l9_read verify: library_read_quota_hit is not the 20261129_40 version (an older file re-run after it?)';
  end if;
  foreach fn in array array['public.library_device_gate(uuid,text,text,uuid,boolean)',
                            'public.library_device_code_verify(uuid,text,text,uuid)'] loop
    if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure(fn)), 'auth.sessions') > 0 then
      raise exception 'l9_read verify: % still ends platform sessions (20261127_60 re-run after this file?)', fn;
    end if;
  end loop;
  if not exists (select 1 from public.platform_settings where key = 'library_min_points_to_browse') then
    raise exception 'l9_read verify: the library_min_points_to_browse setting is missing';
  end if;
  raise notice 'l9_read verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261129_40 library read log (full_text_reads + 30/50/150 + no admin exemption; library-only devices; 50-point setting)' as step,
       (to_regclass('public.full_text_reads') is not null
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.library_read_quota_hit(uuid,text,int,int,int,int)'::regprocedure), 'over_weekly') > 0
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.library_device_gate(uuid,text,text,uuid,boolean)'::regprocedure), 'auth.sessions') = 0
        and exists (select 1 from public.platform_settings where key = 'library_min_points_to_browse')) as ok;
