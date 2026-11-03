-- =============================================================================
-- Migration: 20261031_10_library_activity_monitor.sql
-- «نشاط المكتبة» — library activity monitoring with full admin control.
-- Builds on 20261030_80 (owner note ١٣ C07 / C09: the per-user daily quota and
-- the library security lock). Safe to re-run. Service role only: no anon /
-- authenticated grant anywhere.
-- =============================================================================
--
-- WHAT THIS FILE ADDS
--   1. public.library_monitor_settings — ONE row (id = true). Every number the
--      library protection uses, editable from the admin panel:
--        • the four caps that were app constants until now (220 / 400 / 120 /
--          60 — seeded with the same values, so a reader sees no change);
--        • the review rules (each with its own on/off switch and threshold);
--        • what a review flag does (notify only / slow the reader down / lock);
--        • whether admins are notified, and how long activity is kept.
--   2. public.library_user_limits — a per-user daily / hourly override, set by
--      an admin (raise OR lower) or by the "slow down" action, optionally until
--      a date.
--   3. public.library_activity_hourly — per (user, clock hour): library
--      requests, distinct documents opened, searches, library-AI calls.
--      `docs` is counted exactly, inside library_read_quota_hit; the other
--      three come from the app in batches (library_activity_bump) and are
--      approximate (a batch lost in a restart is not re-sent).
--   4. public.library_review_flags — «قيد المراجعة»: one OPEN flag per user,
--      with the rule that raised it and the numbers behind it. Clearing keeps
--      the row.
--   5. library_read_quota_hit — RE-CREATED with the SAME signature and the
--      same result columns. The limits now come from: the user's override →
--      the settings row → the arguments (the app constants, a fallback only).
--      It also counts a newly opened document into library_activity_hourly
--      and notifies the admins when it opens an automatic lock.
--   6. library_activity_bump(jsonb) — the app's batch of counters; evaluates
--      the review rules for each user in the batch.
--   7. library_activity_top(since, limit) — the admin page's top readers.
--   8. library_security_locks.reason gains 'activity_flag' (the "lock" action).
--
-- NOT BUILT (said plainly in the owner note): a "reads documents in catalogue
-- order" rule; guests (no account to count); e-mail alerts (alerts are the
-- in-site notification bell of every admin).
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_security_locks') is null
     or to_regclass('public.library_read_quota_docs') is null
     or to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)') is null then
    raise exception '20261031_10: run 20261030_80_library_read_quota.sql first';
  end if;
end $$;

-- ── 1. library_monitor_settings ──────────────────────────────────────────────
create table if not exists public.library_monitor_settings (
  id                        boolean primary key default true check (id),
  -- the caps (were LIBRARY_READ_QUOTA in src/lib/library/readQuota.ts)
  daily_docs                int not null default 220 check (daily_docs between 1 and 100000),
  member_daily_docs         int not null default 400 check (member_daily_docs between 1 and 100000),
  hourly_docs               int not null default 120 check (hourly_docs between 1 and 100000),
  lock_after_refused        int not null default 60  check (lock_after_refused between 0 and 100000),
  -- review rules
  rule_hour_requests_on     boolean not null default true,
  rule_hour_requests        int not null default 600 check (rule_hour_requests between 10 and 1000000),
  rule_hour_searches_on     boolean not null default true,
  rule_hour_searches        int not null default 200 check (rule_hour_searches between 5 and 1000000),
  rule_week_docs_on         boolean not null default true,
  rule_week_docs            int not null default 600 check (rule_week_docs between 10 and 1000000),
  rule_sustained_on         boolean not null default true,
  rule_sustained_hours      int not null default 6   check (rule_sustained_hours between 2 and 24),
  rule_sustained_min_docs   int not null default 30  check (rule_sustained_min_docs between 1 and 100000),
  rule_night_on             boolean not null default false,
  rule_night_docs           int not null default 60  check (rule_night_docs between 1 and 100000),
  rule_near_cap_on          boolean not null default true,
  rule_near_cap_pct         int not null default 80  check (rule_near_cap_pct between 10 and 100),
  reflag_quiet_hours        int not null default 24  check (reflag_quiet_hours between 0 and 720),
  -- what a flag does
  flag_action               text not null default 'notify' check (flag_action in ('notify', 'slow', 'lock')),
  slow_daily_docs           int not null default 60  check (slow_daily_docs between 1 and 100000),
  slow_hourly_docs          int not null default 20  check (slow_hourly_docs between 1 and 100000),
  slow_hours                int not null default 24  check (slow_hours between 1 and 720),
  -- alerts and history
  notify_admins             boolean not null default true,
  notify_on_auto_lock       boolean not null default true,
  retention_days            int not null default 30  check (retention_days between 7 and 365),
  updated_at                timestamptz not null default now(),
  updated_by                uuid
);

insert into public.library_monitor_settings (id) values (true) on conflict (id) do nothing;

comment on table public.library_monitor_settings is
  'One row: every number of the library protection (caps, review rules, flag action, alerts, retention), edited from the admin page «نشاط المكتبة» (20261031_10). Service role only.';

alter table public.library_monitor_settings enable row level security;
revoke all on public.library_monitor_settings from public, anon, authenticated;
grant all on public.library_monitor_settings to service_role;

-- ── 2. library_user_limits ───────────────────────────────────────────────────
create table if not exists public.library_user_limits (
  user_id      uuid primary key,
  daily_docs   int check (daily_docs is null or daily_docs between 1 and 100000),
  hourly_docs  int check (hourly_docs is null or hourly_docs between 1 and 100000),
  until        timestamptz,          -- null: until removed
  source       text not null check (source in ('admin', 'auto_slow')),
  note         text check (note is null or length(note) <= 1000),
  set_by       uuid,                 -- null: the system (auto_slow)
  set_at       timestamptz not null default now(),
  constraint library_user_limits_something check (daily_docs is not null or hourly_docs is not null)
);

comment on table public.library_user_limits is
  'Per-user library caps that win over library_monitor_settings: an admin''s (raise or lower) or the automatic slow-down of a review flag (20261031_10). Service role only.';

alter table public.library_user_limits enable row level security;
revoke all on public.library_user_limits from public, anon, authenticated;
grant all on public.library_user_limits to service_role;

-- ── 3. library_activity_hourly ───────────────────────────────────────────────
create table if not exists public.library_activity_hourly (
  user_id   uuid not null,
  hour      timestamptz not null,    -- date_trunc('hour', …); Riyadh is UTC+3, so the same clock hours
  requests  int not null default 0 check (requests >= 0),
  docs      int not null default 0 check (docs >= 0),
  searches  int not null default 0 check (searches >= 0),
  ai_calls  int not null default 0 check (ai_calls >= 0),
  primary key (user_id, hour)
);

create index if not exists library_activity_hourly_hour on public.library_activity_hourly (hour);

comment on table public.library_activity_hourly is
  'Library activity per user per clock hour (20261031_10): docs exact (library_read_quota_hit), requests / searches / ai_calls approximate (app batches, library_activity_bump). Kept retention_days. Service role only.';

alter table public.library_activity_hourly enable row level security;
revoke all on public.library_activity_hourly from public, anon, authenticated;
grant all on public.library_activity_hourly to service_role;

-- ── 4. library_review_flags ──────────────────────────────────────────────────
create table if not exists public.library_review_flags (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  reference    text not null
               default ('REV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  rule         text not null check (rule in ('hour_requests', 'hour_searches', 'week_docs', 'sustained', 'night', 'near_cap')),
  rules        text[] not null default '{}',
  details      jsonb not null default '{}'::jsonb,
  action_taken text not null default 'notify' check (action_taken in ('notify', 'slow', 'lock')),
  created_at   timestamptz not null default now(),
  cleared_at   timestamptz,
  cleared_by   uuid,
  clear_note   text check (clear_note is null or length(clear_note) <= 1000),
  constraint library_review_flags_reference_key unique (reference)
);

create unique index if not exists library_review_flags_one_open
  on public.library_review_flags (user_id) where cleared_at is null;
create index if not exists library_review_flags_created_at
  on public.library_review_flags (created_at desc);

comment on table public.library_review_flags is
  'Accounts «قيد المراجعة» for unusual library activity (20261031_10). One open flag per user; clearing keeps the row. Service role only.';

alter table public.library_review_flags enable row level security;
revoke all on public.library_review_flags from public, anon, authenticated;
grant all on public.library_review_flags to service_role;

-- ── 5. the lock gains the 'activity_flag' reason ────────────────────────────
alter table public.library_security_locks drop constraint if exists library_security_locks_reason_check;
alter table public.library_security_locks add constraint library_security_locks_reason_check
  check (reason in ('quota_breach', 'admin', 'activity_flag'));

-- ── 6. helper: notify every admin (in-site bell) ────────────────────────────
-- Never raises: a missing table or a failed insert must not break a read.
create or replace function public.library_monitor_notify_admins(p_title text, p_body text, p_href text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;
  begin
    if exists (select 1 from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = 'notifications' and c.column_name = 'href') then
      execute 'insert into public.notifications (user_id, title, body, href)
               select p.id, $1, $2, $3 from public.profiles p where p.user_type = ''admin'''
        using p_title, p_body, p_href;
    else
      execute 'insert into public.notifications (user_id, title, body)
               select p.id, $1, $2 from public.profiles p where p.user_type = ''admin'''
        using p_title, p_body;
    end if;
  exception when others then
    raise warning 'library_monitor_notify_admins: % %', sqlstate, sqlerrm;
  end;
end;
$$;

revoke all on function public.library_monitor_notify_admins(text, text, text) from public, anon, authenticated;
grant execute on function public.library_monitor_notify_admins(text, text, text) to service_role;

-- ── 7. helper: the limits that apply to a user now ──────────────────────────
-- Precedence: the user's active override → the settings row → the arguments.
create or replace function public.library_quota_limits(
  p_user               uuid,
  p_daily_docs         int,
  p_member_daily_docs  int,
  p_hourly_docs        int,
  p_lock_after_refused int)
returns table (day_limit int, hour_limit int, lock_after int, is_member boolean, user_type text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type   text;
  v_member boolean := false;
  v_daily  int := p_daily_docs;
  v_mdaily int := p_member_daily_docs;
  v_hourly int := p_hourly_docs;
  v_lock   int := p_lock_after_refused;
  v_odaily int;
  v_ohour  int;
  s        public.library_monitor_settings;
begin
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;

  select * into s from public.library_monitor_settings ms where ms.id;
  if found then
    v_daily := s.daily_docs; v_mdaily := s.member_daily_docs;
    v_hourly := s.hourly_docs; v_lock := s.lock_after_refused;
  end if;

  v_member := coalesce(v_type in ('firm', 'corporate'), false);
  if not v_member and to_regclass('public.firm_members') is not null then
    execute 'select exists (select 1 from public.firm_members m where m.user_id = $1 and m.status = ''active'')'
      into v_member using p_user;
  end if;
  if not v_member and to_regclass('public.business_members') is not null then
    execute 'select exists (select 1 from public.business_members m where m.user_id = $1 and m.status = ''active'')'
      into v_member using p_user;
  end if;

  select ul.daily_docs, ul.hourly_docs into v_odaily, v_ohour
    from public.library_user_limits ul
   where ul.user_id = p_user and (ul.until is null or ul.until > now());

  return query select
    coalesce(v_odaily, case when v_member then v_mdaily else v_daily end),
    coalesce(v_ohour, v_hourly),
    v_lock,
    v_member,
    v_type;
end;
$$;

revoke all on function public.library_quota_limits(uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.library_quota_limits(uuid, int, int, int, int) to service_role;

-- ── 8. library_read_quota_hit, re-created (same signature, same columns) ────
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
      insert into public.library_security_locks (user_id, reason, details)
        values (p_user, 'quota_breach', jsonb_build_object(
          'day', v_day, 'allowed_docs', v_used, 'day_limit', v_limit,
          'hour_docs', v_hour, 'hour_limit', v_hlimit,
          'refused_docs', v_refused, 'lock_after_refused', v_lockn))
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
  'Counts one distinct library document per user per Riyadh day and answers exempt / ok / over_daily / over_hourly / locked. Limits: the user''s override → library_monitor_settings → the arguments (20261031_10). Counts new documents into library_activity_hourly; notifies admins on an automatic lock. Service role only.';

revoke all on function public.library_read_quota_hit(uuid, text, int, int, int, int) from public, anon, authenticated;
grant execute on function public.library_read_quota_hit(uuid, text, int, int, int, int) to service_role;

-- ── 9. library_monitor_evaluate: the review rules for one user ──────────────
-- Returns the new flag's reference, or null. Called by library_activity_bump.
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
    insert into public.library_security_locks (user_id, reason, details)
      values (p_user, 'activity_flag', jsonb_build_object('flag_reference', v_flag.reference, 'rules', v_rules) || v_details)
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

-- ── 10. library_activity_bump: the app's batch of counters ──────────────────
-- p_rows: [{ "u": uuid, "h": iso hour, "r": requests, "s": searches, "a": ai_calls }, …]
-- An hour outside [now - 3 h, now + 1 h] is taken as the current hour. Users
-- are handled in id order (stable advisory-lock order across batches).
create or replace function public.library_activity_bump(p_rows jsonb)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r        record;
  v_n      int := 0;
  v_keep   int;
  v_user   uuid;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'library_activity_bump: invalid arguments' using errcode = '22023';
  end if;

  -- Every user's lock FIRST, in id order, before any write: a reader's
  -- library_read_quota_hit (same lock, then its own hourly row) can then
  -- never wait on this batch while this batch waits on it.
  for v_user in
    select distinct (e->>'u')::uuid from jsonb_array_elements(p_rows) e where e ? 'u' order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended('library_read_quota:' || v_user::text, 0));
  end loop;

  for r in
    select (e->>'u')::uuid as u,
           case when (e->>'h')::timestamptz between now() - interval '3 hours' and now() + interval '1 hour'
                then date_trunc('hour', (e->>'h')::timestamptz)
                else date_trunc('hour', now()) end as h,
           least(greatest(coalesce((e->>'r')::int, 0), 0), 1000000) as req,
           least(greatest(coalesce((e->>'s')::int, 0), 0), 1000000) as srch,
           least(greatest(coalesce((e->>'a')::int, 0), 0), 1000000) as ai
      from jsonb_array_elements(p_rows) e
     where e ? 'u'
     order by 1, 2
  loop
    if r.req + r.srch + r.ai = 0 then
      continue;
    end if;
    insert into public.library_activity_hourly as a (user_id, hour, requests, searches, ai_calls)
      values (r.u, r.h, r.req, r.srch, r.ai)
      on conflict (user_id, hour) do update
        set requests = a.requests + excluded.requests,
            searches = a.searches + excluded.searches,
            ai_calls = a.ai_calls + excluded.ai_calls;
    v_n := v_n + 1;
  end loop;

  -- Retention: old rows nobody else is touching (never waits on a lock).
  select ms.retention_days into v_keep from public.library_monitor_settings ms where ms.id;
  delete from public.library_activity_hourly a
   using (select o.user_id, o.hour from public.library_activity_hourly o
           where o.hour < now() - make_interval(days => coalesce(v_keep, 30))
           limit 5000 for update skip locked) old
   where a.user_id = old.user_id and a.hour = old.hour;

  for v_user in
    select distinct (e->>'u')::uuid from jsonb_array_elements(p_rows) e where e ? 'u' order by 1
  loop
    perform public.library_monitor_evaluate(v_user);
  end loop;

  return v_n;
end;
$$;

comment on function public.library_activity_bump(jsonb) is
  'Adds the app''s batched library counters (requests / searches / ai_calls per user per hour) and evaluates the review rules for each user in the batch (20261031_10). Service role only.';

revoke all on function public.library_activity_bump(jsonb) from public, anon, authenticated;
grant execute on function public.library_activity_bump(jsonb) to service_role;

-- ── 11. library_activity_top: the admin page's top readers ──────────────────
create or replace function public.library_activity_top(p_since timestamptz, p_limit int default 50)
returns table (
  user_id      uuid,
  requests     bigint,
  docs         bigint,
  searches     bigint,
  ai_calls     bigint,
  active_hours bigint,
  last_hour    timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id,
         sum(a.requests)::bigint, sum(a.docs)::bigint, sum(a.searches)::bigint, sum(a.ai_calls)::bigint,
         count(*)::bigint, max(a.hour)
    from public.library_activity_hourly a
   where a.hour >= date_trunc('hour', p_since)
   group by a.user_id
   order by sum(a.docs) desc, sum(a.requests) desc
   limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke all on function public.library_activity_top(timestamptz, int) from public, anon, authenticated;
grant execute on function public.library_activity_top(timestamptz, int) to service_role;

-- ── 12. verify (raises on a failure) ────────────────────────────────────────
do $$
declare fn text; tbl text;
begin
  foreach fn in array array[
    'public.library_read_quota_hit(uuid,text,int,int,int,int)',
    'public.library_quota_limits(uuid,int,int,int,int)',
    'public.library_monitor_notify_admins(text,text,text)',
    'public.library_monitor_evaluate(uuid)',
    'public.library_activity_bump(jsonb)',
    'public.library_activity_top(timestamptz,int)'] loop
    if to_regprocedure(fn) is null then
      raise exception '20261031_10 verify: % is missing', fn;
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE') then
      raise exception '20261031_10 verify: a session role can EXECUTE %', fn;
    end if;
    if not exists (select 1 from pg_proc p where p.oid = to_regprocedure(fn) and p.prosecdef
                   and p.proconfig @> array['search_path=""']) then
      raise exception '20261031_10 verify: % is not SECURITY DEFINER with search_path ''''', fn;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'library_read_quota_hit') <> 1 then
    raise exception '20261031_10 verify: library_read_quota_hit must have exactly one overload';
  end if;
  foreach tbl in array array['public.library_monitor_settings', 'public.library_user_limits',
                             'public.library_activity_hourly', 'public.library_review_flags'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = to_regclass(tbl)) then
      raise exception '20261031_10 verify: RLS is off on %', tbl;
    end if;
    if has_table_privilege('anon', tbl, 'SELECT') or has_table_privilege('authenticated', tbl, 'SELECT')
       or has_table_privilege('anon', tbl, 'INSERT') or has_table_privilege('authenticated', tbl, 'INSERT')
       or has_table_privilege('authenticated', tbl, 'UPDATE') or has_table_privilege('authenticated', tbl, 'DELETE') then
      raise exception '20261031_10 verify: a session role holds a privilege on %', tbl;
    end if;
  end loop;
  if (select count(*) from public.library_monitor_settings) <> 1 then
    raise exception '20261031_10 verify: library_monitor_settings must hold exactly one row';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- ── SELECT check (the editor shows this; every column must read true) ───────
select
  to_regclass('public.library_monitor_settings') is not null                         as settings_table,
  (select count(*) = 1 from public.library_monitor_settings)                         as settings_row,
  to_regclass('public.library_user_limits') is not null                              as user_limits_table,
  to_regclass('public.library_activity_hourly') is not null                          as activity_table,
  to_regclass('public.library_review_flags') is not null                             as flags_table,
  to_regprocedure('public.library_activity_bump(jsonb)') is not null                 as bump_fn,
  (select count(*) = 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'library_read_quota_hit')              as quota_fn_one_overload,
  not has_function_privilege('authenticated', 'public.library_activity_bump(jsonb)', 'EXECUTE') as bump_service_only;
