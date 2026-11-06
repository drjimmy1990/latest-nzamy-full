-- =============================================================================
-- Migration: 20261103_10_library_auto_lock_hours.sql
-- «نشاط المكتبة» — an automatic library lock ends by itself (owner q362).
-- Owner-free wave, S1 Task 14. Builds on 20261031_10. Safe to re-run. Service
-- role only: no anon / authenticated grant anywhere.
-- =============================================================================
--
-- WHY
--   Both automatic lock inserts left locked_until NULL, which means "until an
--   admin lifts it":
--     • library_read_quota_hit   — reason 'quota_breach' (20261031_10 §8);
--     • library_monitor_evaluate — reason 'activity_flag' (20261031_10 §9).
--   The owner (q362): an automatic lock ends after 24 hours. Expiry itself
--   already works — library_read_quota_hit closes a lock whose locked_until
--   has passed (lift_note 'expired') — so only the end time was missing.
--
-- WHAT THIS FILE DOES
--   1. public.library_monitor_settings.auto_lock_hours int not null default 24,
--      check 0..720 (library_monitor_settings_auto_lock_hours_check, dropped
--      and re-added so a re-run works). 0 = until an admin lifts it (today's
--      behaviour). Edited from the admin page «نشاط المكتبة» → «الحدود».
--   2. library_read_quota_hit — RE-CREATED with the SAME signature and the
--      same result columns (copied from 20261031_10 §8, the latest file that
--      defines it). The 'quota_breach' lock gets locked_until = now() +
--      auto_lock_hours (no settings row: 24 h).
--   3. library_monitor_evaluate — RE-CREATED with the SAME signature (copied
--      from 20261031_10 §9). The 'activity_flag' lock gets the same end.
--   4. library_security_lock_create — RE-CREATED with the SAME signature
--      (uuid, uuid, text, timestamptz default null) and return type (copied
--      from 20261030_80 §4, the only file that defines it). Before this file
--      it returned ANY open lock as it was. With automatic locks now ending
--      after 24 h, a staff lock placed on an already auto-locked reader would
--      silently have become that 24-hour lock (the admin's note and end
--      discarded). Now an open AUTOMATIC lock (quota_breach / activity_flag)
--      is CONVERTED into the admin's lock: reason 'admin', the admin's note,
--      locked_by and locked_until (null = until lifted). The SEC reference,
--      locked_at and details are kept; details records converted_from,
--      converted_at and converted_locked_until. An open ADMIN lock is still
--      returned as it is (unchanged behaviour).
--   Existing admin locks are not touched: their end is what the admin chose.
--   No trigger. No new function, so no overload (PGRST203).
--
-- NOT DONE HERE (a production data choice — S1_RUN_NOTES.md has the optional
--   statement): automatic locks that are ALREADY open keep locked_until NULL.
--
-- RUN ORDER — BEFORE the deploy. The code already deployed keeps working: it
--   selects named columns (never this one) and calls the two functions with
--   their unchanged arguments. The new code survives the other order too: the
--   settings route retries without auto_lock_hours on 42703.
--
-- ROLLBACK — run 20261031_10 §8 and §9 and 20261030_80 §4 again (the three
--   functions, verbatim), then
--   `alter table public.library_monitor_settings drop column auto_lock_hours;`
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_monitor_settings') is null
     or to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)') is null
     or to_regprocedure('public.library_monitor_evaluate(uuid)') is null
     or to_regprocedure('public.library_security_lock_create(uuid,uuid,text,timestamptz)') is null then
    raise exception '20261103_10: run 20261031_10_library_activity_monitor.sql first';
  end if;
end $$;

-- ── 1. the setting ───────────────────────────────────────────────────────────
alter table public.library_monitor_settings add column if not exists auto_lock_hours int not null default 24;
alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_auto_lock_hours_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_auto_lock_hours_check
  check (auto_lock_hours between 0 and 720);
comment on column public.library_monitor_settings.auto_lock_hours is
  'Hours an AUTOMATIC library lock (quota_breach, activity_flag) lasts; 0 = until an admin lifts it. Default 24 (owner q362, 20261103_10). Admin locks are not affected.';

-- ── 2. library_read_quota_hit, re-created (same signature, same columns) ────
-- Copied verbatim from 20261031_10 §8; the only change is v_auto_hours and
-- the lock's locked_until.
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

  select l.day_limit, l.hour_limit, l.lock_after, l.user_type
    into v_limit, v_hlimit, v_lockn, v_type
    from public.library_quota_limits(p_user, p_daily_docs, p_member_daily_docs, p_hourly_docs, p_lock_after_refused) l;

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

  select count(*) filter (where d.allowed),
         count(*) filter (where d.allowed and d.first_at > now() - interval '1 hour'),
         count(*) filter (where not d.allowed),
         min(d.first_at) filter (where d.allowed and d.first_at > now() - interval '1 hour')
    into v_used, v_hour, v_refused, v_oldest
    from public.library_read_quota_docs d
   where d.user_id = p_user and d.day = v_day;

  -- State only (the library status route, the search lock check).
  if p_doc_key is null then
    return query select 'ok'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_resets;
    return;
  end if;

  -- A document already counted today is free to re-open, window after window.
  if exists (select 1 from public.library_read_quota_docs d
              where d.user_id = p_user and d.day = v_day and d.doc_key = p_doc_key and d.allowed) then
    return query select 'ok'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_resets;
    return;
  end if;

  if v_used >= v_limit or v_hour >= v_hlimit then
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

      return query select 'locked'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, v_lock.reference, v_lock.locked_until, null::timestamptz;
      return;
    end if;

    if v_used >= v_limit then
      return query select 'over_daily'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz, v_resets;
    else
      return query select 'over_hourly'::text, v_used, v_limit, v_hour, v_hlimit, v_refused, null::text, null::timestamptz,
        least(coalesce(v_oldest, now()) + interval '1 hour', v_resets);
    end if;
    return;
  end if;

  insert into public.library_read_quota_docs (user_id, day, doc_key, allowed)
    values (p_user, v_day, p_doc_key, true)
    on conflict (user_id, day, doc_key) do update set allowed = true, first_at = now();

  insert into public.library_activity_hourly as a (user_id, hour, docs)
    values (p_user, date_trunc('hour', now()), 1)
    on conflict (user_id, hour) do update set docs = a.docs + 1;

  return query select 'ok'::text, v_used + 1, v_limit, v_hour + 1, v_hlimit, v_refused, null::text, null::timestamptz, v_resets;
end;
$$;

comment on function public.library_read_quota_hit(uuid, text, int, int, int, int) is
  'Counts one distinct library document per user per Riyadh day and answers exempt / ok / over_daily / over_hourly / locked. Limits: the user''s override → library_monitor_settings → the arguments (20261031_10). Counts new documents into library_activity_hourly; notifies admins on an automatic lock, which ends after library_monitor_settings.auto_lock_hours (0 = until an admin lifts it; 20261103_10). Service role only.';

revoke all on function public.library_read_quota_hit(uuid, text, int, int, int, int) from public, anon, authenticated;
grant execute on function public.library_read_quota_hit(uuid, text, int, int, int, int) to service_role;

-- ── 3. library_monitor_evaluate, re-created (same signature) ────────────────
-- Copied verbatim from 20261031_10 §9; the only change is the activity_flag
-- lock's locked_until.
create or replace function public.library_monitor_evaluate(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s          public.library_monitor_settings;
  v_type     text;
  v_hour     timestamptz := date_trunc('hour', now());
  v_day      date := (now() at time zone 'Asia/Riyadh')::date;
  v_req      int;
  v_srch     int;
  v_week     int;
  v_busy     int;
  v_night    int;
  v_today    int;
  v_limit    int;
  v_rules    text[] := '{}';
  v_flag     public.library_review_flags;
  v_action   text;
  v_details  jsonb;
  v_rule_ar  text;
begin
  select * into s from public.library_monitor_settings ms where ms.id;
  if not found then
    return null;
  end if;

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  if v_type = 'admin' then
    return null;
  end if;

  if exists (select 1 from public.library_review_flags f where f.user_id = p_user and f.cleared_at is null) then
    return null;
  end if;
  if s.reflag_quiet_hours > 0 and exists (
       select 1 from public.library_review_flags f
        where f.user_id = p_user and f.cleared_at > now() - make_interval(hours => s.reflag_quiet_hours)) then
    return null;
  end if;

  select coalesce(sum(a.requests) filter (where a.hour = v_hour), 0),
         coalesce(sum(a.searches) filter (where a.hour = v_hour), 0),
         coalesce(sum(a.docs) filter (where a.hour > now() - interval '7 days'), 0),
         count(*) filter (where a.hour > now() - interval '24 hours' and a.docs >= s.rule_sustained_min_docs),
         coalesce(sum(a.docs) filter (where a.hour > now() - interval '24 hours'
                                       and extract(hour from a.hour at time zone 'Asia/Riyadh') < 5), 0)
    into v_req, v_srch, v_week, v_busy, v_night
    from public.library_activity_hourly a
   where a.user_id = p_user and a.hour > now() - interval '7 days';

  select count(*) into v_today from public.library_read_quota_docs d
   where d.user_id = p_user and d.day = v_day and d.allowed;
  select l.day_limit into v_limit
    from public.library_quota_limits(p_user, s.daily_docs, s.member_daily_docs, s.hourly_docs, s.lock_after_refused) l;

  if s.rule_hour_requests_on and v_req >= s.rule_hour_requests then v_rules := v_rules || 'hour_requests'::text; end if;
  if s.rule_hour_searches_on and v_srch >= s.rule_hour_searches then v_rules := v_rules || 'hour_searches'::text; end if;
  if s.rule_week_docs_on and v_week >= s.rule_week_docs then v_rules := v_rules || 'week_docs'::text; end if;
  if s.rule_sustained_on and v_busy >= s.rule_sustained_hours then v_rules := v_rules || 'sustained'::text; end if;
  if s.rule_night_on and v_night >= s.rule_night_docs then v_rules := v_rules || 'night'::text; end if;
  if s.rule_near_cap_on and coalesce(v_limit, 0) > 0
     and v_today * 100 >= v_limit * s.rule_near_cap_pct then v_rules := v_rules || 'near_cap'::text; end if;

  if cardinality(v_rules) = 0 then
    return null;
  end if;

  v_details := jsonb_build_object(
    'hour_requests', v_req, 'hour_searches', v_srch, 'week_docs', v_week,
    'busy_hours_24h', v_busy, 'night_docs_24h', v_night,
    'docs_today', v_today, 'day_limit', v_limit,
    'thresholds', jsonb_build_object(
      'hour_requests', s.rule_hour_requests, 'hour_searches', s.rule_hour_searches,
      'week_docs', s.rule_week_docs, 'sustained_hours', s.rule_sustained_hours,
      'sustained_min_docs', s.rule_sustained_min_docs, 'night_docs', s.rule_night_docs,
      'near_cap_pct', s.rule_near_cap_pct));

  insert into public.library_review_flags (user_id, rule, rules, details, action_taken)
    values (p_user, v_rules[1], v_rules, v_details, s.flag_action)
    on conflict (user_id) where cleared_at is null do nothing
    returning * into v_flag;
  if v_flag.id is null then
    return null;
  end if;

  v_action := s.flag_action;
  if v_action = 'slow' then
    -- An admin's own override is never replaced by the automatic one.
    insert into public.library_user_limits as ul (user_id, daily_docs, hourly_docs, until, source, note)
      values (p_user, s.slow_daily_docs, s.slow_hourly_docs, now() + make_interval(hours => s.slow_hours),
              'auto_slow', 'إبطاء تلقائي — ' || v_flag.reference)
      on conflict (user_id) do update
        set daily_docs = excluded.daily_docs, hourly_docs = excluded.hourly_docs, until = excluded.until,
            source = 'auto_slow', note = excluded.note, set_by = null, set_at = now()
        where ul.source = 'auto_slow' or (ul.until is not null and ul.until <= now());
  elsif v_action = 'lock' then
    insert into public.library_security_locks (user_id, reason, details, locked_until)
      values (p_user, 'activity_flag', jsonb_build_object('flag_reference', v_flag.reference, 'rules', v_rules) || v_details,
              case when s.auto_lock_hours > 0 then now() + make_interval(hours => s.auto_lock_hours) end)
      on conflict (user_id) where lifted_at is null do nothing;
  end if;

  if s.notify_admins then
    v_rule_ar := case v_rules[1]
      when 'hour_requests' then format('%s طلباً (فتح وثائق وبحث ومساعد) في ساعة واحدة', v_req)
      when 'hour_searches' then format('%s بحثاً في ساعة واحدة', v_srch)
      when 'week_docs'     then format('%s وثيقة خلال ٧ أيام', v_week)
      when 'sustained'     then format('%s ساعة نشطة خلال ٢٤ ساعة بوتيرة %s وثيقة أو أكثر في الساعة', v_busy, s.rule_sustained_min_docs)
      when 'night'         then format('%s وثيقة بين منتصف الليل والخامسة فجراً', v_night)
      when 'near_cap'      then format('%s وثيقة اليوم من حد %s', v_today, v_limit)
    end;
    perform public.library_monitor_notify_admins(
      'حساب قيد المراجعة — نشاط غير معتاد في المكتبة',
      format('%s. المرجع %s. %s', v_rule_ar, v_flag.reference,
             case v_action when 'slow' then 'أُبطئت قراءته تلقائياً.'
                           when 'lock' then 'أُوقفت قراءته للمكتبة تلقائياً.'
                           else 'القراءة مستمرة حتى تقرر.' end),
      '/dashboard/admin/security?tab=library_activity');
  end if;

  return v_flag.reference;
end;
$$;

revoke all on function public.library_monitor_evaluate(uuid) from public, anon, authenticated;
grant execute on function public.library_monitor_evaluate(uuid) to service_role;

-- ── 3b. library_security_lock_create, re-created (same signature, same return) ─
-- Copied from 20261030_80 §4. The only change: an open AUTOMATIC lock is
-- converted into the admin's lock (see "WHAT THIS FILE DOES" 4).
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
    -- 20261103_10: an open AUTOMATIC lock now ends by itself, so the staff
    -- decision replaces it (same row, same SEC reference) instead of being lost.
    if v_lock.reason <> 'admin' then
      update public.library_security_locks l
         set reason       = 'admin',
             note         = btrim(p_note),
             locked_by    = p_admin,
             locked_until = p_until,
             details      = coalesce(l.details, '{}'::jsonb) || jsonb_build_object(
                              'converted_from', l.reason,
                              'converted_at', now(),
                              'converted_locked_until', l.locked_until)
       where l.id = v_lock.id
       returning * into v_lock;
    end if;
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
  'An admin locks a user out of the library (owner note ١٣ C09, 20261030_80): never an admin; an open admin lock is returned as it is; an open AUTOMATIC lock is converted into this admin lock, keeping its reference (20261103_10). Service role only.';

revoke all on function public.library_security_lock_create(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.library_security_lock_create(uuid, uuid, text, timestamptz) to service_role;

-- ── 4. verify (raises on a failure) ─────────────────────────────────────────
do $$
declare fn text;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'library_monitor_settings'
                    and column_name = 'auto_lock_hours' and is_nullable = 'NO' and column_default = '24') then
    raise exception '20261103_10 verify: library_monitor_settings.auto_lock_hours is missing or not "not null default 24"';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.library_monitor_settings'::regclass
                    and conname = 'library_monitor_settings_auto_lock_hours_check') then
    raise exception '20261103_10 verify: the auto_lock_hours check is missing';
  end if;
  foreach fn in array array['public.library_read_quota_hit(uuid,text,int,int,int,int)',
                            'public.library_monitor_evaluate(uuid)'] loop
    if to_regprocedure(fn) is null then
      raise exception '20261103_10 verify: % is missing', fn;
    end if;
    if position('auto_lock_hours' in pg_get_functiondef(to_regprocedure(fn))) = 0 then
      raise exception '20261103_10 verify: % does not read auto_lock_hours', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '20261103_10 verify: a session role can EXECUTE %', fn;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(fn) and p.prosecdef
                   and p.proconfig @> array['search_path=""']) then
      raise exception '20261103_10 verify: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('library_read_quota_hit', 'library_monitor_evaluate')) <> 2 then
    raise exception '20261103_10 verify: library_read_quota_hit / library_monitor_evaluate must have exactly one overload each';
  end if;
  -- library_security_lock_create: one overload, the same identity arguments, the converting body
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'library_security_lock_create') <> 1
     or pg_get_function_identity_arguments('public.library_security_lock_create(uuid,uuid,text,timestamptz)'::regprocedure)
        <> 'p_user uuid, p_admin uuid, p_note text, p_until timestamp with time zone'
     or position('converted_from' in pg_get_functiondef('public.library_security_lock_create(uuid,uuid,text,timestamptz)'::regprocedure)) = 0 then
    raise exception '20261103_10 verify: library_security_lock_create is not the single converting version';
  end if;
  if has_function_privilege('anon', 'public.library_security_lock_create(uuid,uuid,text,timestamptz)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.library_security_lock_create(uuid,uuid,text,timestamptz)', 'EXECUTE') then
    raise exception '20261103_10 verify: a session role can EXECUTE library_security_lock_create';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- ── SELECT check (the editor shows this; ok must read true) ─────────────────
select
  coalesce((select c.column_default = '24' and c.is_nullable = 'NO' from information_schema.columns c
             where c.table_schema = 'public' and c.table_name = 'library_monitor_settings'
               and c.column_name = 'auto_lock_hours'), false)                                    as column_default_24,
  (select string_agg(s.auto_lock_hours::text, ',') from public.library_monitor_settings s)      as auto_lock_hours_now,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_read_quota_hit')                        as quota_fn_overloads,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_monitor_evaluate')                      as evaluate_fn_overloads,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_security_lock_create')                  as lock_create_overloads,
  position('converted_from' in pg_get_functiondef('public.library_security_lock_create(uuid,uuid,text,timestamptz)'::regprocedure)) > 0
                                                                                               as staff_lock_converts_auto,
  coalesce(
    (select c.column_default = '24' and c.is_nullable = 'NO' from information_schema.columns c
      where c.table_schema = 'public' and c.table_name = 'library_monitor_settings'
        and c.column_name = 'auto_lock_hours')
    and (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'library_read_quota_hit')
    and (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'library_monitor_evaluate')
    and position('auto_lock_hours' in pg_get_functiondef('public.library_read_quota_hit(uuid,text,int,int,int,int)'::regprocedure)) > 0
    and position('auto_lock_hours' in pg_get_functiondef('public.library_monitor_evaluate(uuid)'::regprocedure)) > 0
    and (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'library_security_lock_create')
    and position('converted_from' in pg_get_functiondef('public.library_security_lock_create(uuid,uuid,text,timestamptz)'::regprocedure)) > 0,
    false)                                                                                       as ok;
