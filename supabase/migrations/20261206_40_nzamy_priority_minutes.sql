-- =============================================================================
-- Migration: 20261206_40_nzamy_priority_minutes.sql   (verify id: l16_priority)
-- =============================================================================
-- PURPOSE (batch l16, owner س٢٣ — decided 25 Nov 2026; gap rows C55 / A-33)
--
--   «نافذة أولوية نظامي»: a client's new free request first goes to the Nezamy
--   team for N minutes counted in WORKING hours (default 30), and only then is
--   it listed to every verified lawyer in the market — automatically, with no
--   job: the lawyers' list simply starts showing it. The client may choose
--   «افتحه للجميع فوراً» (on the order form, or later on his order page).
--
--   1. platform_settings rows (inserted only when missing — an admin's later
--      choice is never overwritten by a re-run):
--        nzamy_priority_minutes  30            one of 0 / 15 / 30 / 60 (0 = no hold)
--        nzamy_working_hours     {"tz": "Asia/Riyadh", "days": [0,1,2,3,4],
--                                 "start": "09:00", "end": "17:00"}
--          days are Postgres day-of-week numbers (0 = Sunday … 6 = Saturday).
--          A bad value falls back to these defaults, field by field.
--
--   2. service_requests.marketplace_release_at (timestamptz null): the moment
--      the request joins the lawyers' market. STAMPED once, when the row is
--      created (trg_02, below) — an admin who later changes N never re-hides a
--      request lawyers have already seen. NULL = released (every row created
--      before this file, and every row that is not receiver 'ai_workspace').
--
--   3. Functions (search_path ''):
--        nzamy_add_working_minutes(timestamptz, int, jsonb)  pure: the time N
--             working minutes after a moment (bounded loop, 31 days).
--        nzamy_market_release_at(timestamptz, boolean)        definer: reads the
--             two settings; `true` (the client's «افتحه للجميع فوراً») → the
--             moment itself. EXECUTE to authenticated: trg_02 runs as the
--             session and calls it (it only reads the two public settings).
--        guard_service_request_marketplace_publish()          RE-CREATED from
--             20261202_70 (invoker): a session cannot set or change
--             marketplace_release_at; on a session INSERT of an 'ai_workspace'
--             row it stamps it from metadata.marketOpenNow and the settings; a
--             server INSERT that leaves it null is stamped the same way from
--             created_at.
--        marketplace_request_in_market(text, boolean)          NEW core predicate
--             (service_role): 20261202_70's listable rule; with `false` a
--             market-open row still in its priority window is NOT in the market
--             (staff-published rows are never held — publishing is itself the
--             broadcast); with `true` it is (the admin's view).
--        marketplace_request_listable(text)                    RE-CREATED: the core
--             with false. marketplace_request_accept (unchanged) calls it, so a
--             lawyer cannot take a held request ('not_open').
--        marketplace_open_requests(int, int)                   RE-CREATED from
--             20261202_70, same arguments and columns: the market branch also
--             needs the release moment to have passed.
--        marketplace_open_requests_admin(int, int)             DROP + CREATE: the
--             held rows too, plus a release_at column (the team assigns during
--             the window with marketplace_assign_lawyer, which never read the
--             listable rule and is not touched).
--        service_request_market_open_now(text)                 the requester's
--             «افتحه للجميع فوراً» on his own pending, unassigned 'ai_workspace'
--             request that the market's own rule takes (authenticated):
--             opened | already_open | not_open | not_found.
--        service_request_market_hold(text)                     the requester's read
--             (authenticated): {held, release_at} — held only when the market's
--             own rule takes the request and the window has not passed.
--
--   NOT BUILT (said in the batch report): public holidays; the owner's «أو عدم
--   بدء التنفيذ» (re-broadcast a request the team took but did not start);
--   notifying lawyers (nothing notifies them of a new market request today —
--   «broadcast» is the request appearing in their list).
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_40_nzamy_priority_minutes.sql
--   Expect: NOTICE  l16_priority verify: OK …   and a final row with `t`.
--   Idempotent: safe to run twice.
--
-- RUN ORDER: AFTER the l16 deploy (recommended; either order is safe).
--   * SQL first, old code: new client requests are held 30 working minutes
--     from the lawyers, but the old admin page lists them under «الطلبات
--     المعروضة على المحامين الآن» without the time, and the client has no
--     «افتحه للجميع فوراً» yet — hence after the deploy.
--   * Code first, no SQL: the admin's priority fields say this file has not
--     run, the client's choice is stored in metadata and ignored, the open-now
--     button answers that it is not available yet; nothing is held.
--   Needs 20261202_70 (market open) and 20261127_70.
--   RE-RUN HAZARD: re-running 20261202_70 (or 20261127_70) after this file
--   puts back the guard / listable / open-list functions WITHOUT the hold and
--   drops the admin view's release_at column — re-run this file after them.
--
-- ROLLBACK (one transaction):
--   drop function if exists public.service_request_market_hold(text);
--   drop function if exists public.service_request_market_open_now(text);
--   re-run 20261202_70 sections 2, 4a, 4b, 4h and 4i (guard, listable, open list,
--     admin view — drop function public.marketplace_open_requests_admin(integer, integer) first);
--   drop function if exists public.marketplace_request_in_market(text, boolean);
--   drop function if exists public.nzamy_market_release_at(timestamptz, boolean);
--   drop function if exists public.nzamy_add_working_minutes(timestamptz, integer, jsonb);
--   alter table public.service_requests drop column if exists marketplace_release_at;
--   delete from public.platform_settings where key in ('nzamy_priority_minutes', 'nzamy_working_hours');
--
-- Docker: supabase/tests/rls/l16_priority.test.sql
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $pre$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261206_40: public.service_requests is missing';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261206_40: run 20260627_platform_settings.sql first';
  end if;
  if to_regclass('public.marketplace_acceptances') is null
     or to_regprocedure('public.marketplace_request_listable(text)') is null
     or not exists (select 1 from pg_catalog.pg_attribute
                     where attrelid = 'public.service_requests'::regclass and attname = 'marketplace_hidden_at' and not attisdropped) then
    raise exception '20261206_40: run 20261202_70_market_open.sql first';
  end if;
end
$pre$;

-- 1. settings (only when missing)
insert into public.platform_settings (key, value)
values ('nzamy_priority_minutes', '30'::jsonb)
on conflict (key) do nothing;
insert into public.platform_settings (key, value)
values ('nzamy_working_hours', '{"tz": "Asia/Riyadh", "days": [0, 1, 2, 3, 4], "start": "09:00", "end": "17:00"}'::jsonb)
on conflict (key) do nothing;

do $desc$
begin
  if exists (select 1 from pg_catalog.pg_attribute
              where attrelid = 'public.platform_settings'::regclass and attname = 'description' and not attisdropped) then
    update public.platform_settings set description = case key
      when 'nzamy_priority_minutes' then 'l16 س٢٣: نافذة أولوية نظامي بالدقائق من ساعات العمل (0 / 15 / 30 / 60) قبل عرض طلب العميل على كل المحامين الموثّقين'
      when 'nzamy_working_hours' then 'l16 س٢٣: ساعات العمل التي تُحسب فيها نافذة الأولوية (المنطقة الزمنية، الأيام 0=الأحد، البداية والنهاية)'
      else description end
     where key in ('nzamy_priority_minutes', 'nzamy_working_hours')
       and description is null;
  end if;
end
$desc$;

-- 2. the column
alter table public.service_requests add column if not exists marketplace_release_at timestamptz;
comment on column public.service_requests.marketplace_release_at is
  '20261206_40 (l16 س٢٣): when a client''s market request joins the lawyers'' market (after the Nezamy priority window in working hours, or at once by the client''s choice). Stamped once at creation; server-written only (trg_02). NULL = released.';

-- 3a. N working minutes after a moment
create or replace function public.nzamy_add_working_minutes(p_from timestamptz, p_minutes integer, p_hours jsonb)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  v_tz     text := 'Asia/Riyadh';
  v_days   integer[];
  v_start  time := '09:00';
  v_end    time := '17:00';
  v_cursor timestamp;
  v_left   interval;
  v_day    date;
  v_open   timestamp;
  v_close  timestamp;
  i        integer;
begin
  if p_from is null then
    return null;
  end if;
  if coalesce(p_minutes, 0) <= 0 then
    return p_from;
  end if;

  if p_hours is not null and pg_catalog.jsonb_typeof(p_hours) = 'object' then
    if coalesce(p_hours ->> 'tz', '') <> '' then
      begin
        perform p_from at time zone (p_hours ->> 'tz');
        v_tz := p_hours ->> 'tz';
      exception when others then
        v_tz := 'Asia/Riyadh';
      end;
    end if;
    if pg_catalog.jsonb_typeof(p_hours -> 'days') = 'array' then
      select pg_catalog.array_agg(distinct e::integer) into v_days
        from pg_catalog.jsonb_array_elements_text(p_hours -> 'days') e
       where e ~ '^[0-6]$';
    end if;
    if coalesce(p_hours ->> 'start', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       and coalesce(p_hours ->> 'end', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       and (p_hours ->> 'start')::time < (p_hours ->> 'end')::time then
      v_start := (p_hours ->> 'start')::time;
      v_end := (p_hours ->> 'end')::time;
    end if;
  end if;
  if v_days is null or pg_catalog.cardinality(v_days) = 0 then
    v_days := array[0, 1, 2, 3, 4];
  end if;

  v_cursor := p_from at time zone v_tz;
  v_left := pg_catalog.make_interval(mins => p_minutes);
  for i in 1..31 loop
    v_day := v_cursor::date;
    if extract(dow from v_day)::integer = any (v_days) then
      v_open := v_day + v_start;
      v_close := v_day + v_end;
      if v_cursor < v_open then
        v_cursor := v_open;
      end if;
      if v_cursor < v_close then
        if v_cursor + v_left <= v_close then
          return (v_cursor + v_left) at time zone v_tz;
        end if;
        v_left := v_left - (v_close - v_cursor);
      end if;
    end if;
    v_cursor := (v_day + 1)::timestamp;
  end loop;
  -- unreachable with the settings' 60-minute ceiling; never holds forever
  return p_from + pg_catalog.make_interval(mins => p_minutes);
end
$fn$;

comment on function public.nzamy_add_working_minutes(timestamptz, integer, jsonb) is
  '20261206_40 (l16 س٢٣): the moment N minutes of working time after p_from (working hours: {tz, days 0=Sunday, start, end}; bad fields fall back to Asia/Riyadh, Sun–Thu, 09:00–17:00). 0 → p_from.';

-- 3b. the release moment of a new market request
create or replace function public.nzamy_market_release_at(p_from timestamptz, p_open_now boolean)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_raw     jsonb;
  v_minutes integer := 30;
  v_hours   jsonb;
begin
  if p_from is null or coalesce(p_open_now, false) then
    return p_from;
  end if;
  select ps.value into v_raw from public.platform_settings ps where ps.key = 'nzamy_priority_minutes';
  if v_raw is not null and pg_catalog.jsonb_typeof(v_raw) in ('number', 'string')
     and (v_raw #>> '{}') in ('0', '15', '30', '60') then
    v_minutes := (v_raw #>> '{}')::integer;
  end if;
  if v_minutes = 0 then
    return p_from;
  end if;
  select ps.value into v_hours from public.platform_settings ps where ps.key = 'nzamy_working_hours';
  return public.nzamy_add_working_minutes(p_from, v_minutes, v_hours);
end
$fn$;

comment on function public.nzamy_market_release_at(timestamptz, boolean) is
  '20261206_40 (l16 س٢٣): when a market request created at p_from joins the lawyers'' market — nzamy_priority_minutes (0/15/30/60, else 30) of nzamy_working_hours later; p_open_now (the client''s «افتحه للجميع فوراً») → p_from.';

-- 3c. the guard (re-created from 20261202_70; + marketplace_release_at)
create or replace function public.guard_service_request_marketplace_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    -- a server insert that leaves the release moment unset is stamped like a session's
    if tg_op = 'INSERT' and new.marketplace_release_at is null and new.receiver = 'ai_workspace' then
      new.marketplace_release_at := public.nzamy_market_release_at(
        coalesce(new.created_at, pg_catalog.now()),
        coalesce(new.metadata ->> 'marketOpenNow', '') = 'true');
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.marketplace_published_at := null;
    new.marketplace_published_by := null;
    new.marketplace_category := null;
    new.marketplace_hidden_at := null;
    new.marketplace_release_at := case
      when new.receiver = 'ai_workspace'
        then public.nzamy_market_release_at(pg_catalog.now(), coalesce(new.metadata ->> 'marketOpenNow', '') = 'true')
      else null end;
  else
    new.marketplace_published_at := old.marketplace_published_at;
    new.marketplace_published_by := old.marketplace_published_by;
    new.marketplace_category := old.marketplace_category;
    new.marketplace_hidden_at := old.marketplace_hidden_at;
    new.marketplace_release_at := old.marketplace_release_at;
  end if;
  return new;
end $$;

comment on function public.guard_service_request_marketplace_publish() is
  '20261127_70 + 20261202_70 + 20261206_40: a session (any role but postgres / service_role / supabase_admin) cannot publish, re-type, hide or release a service request in the market; a new ai_workspace request is stamped with its release moment (nzamy_market_release_at).';

revoke all on function public.guard_service_request_marketplace_publish() from public;
do $rv$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.guard_service_request_marketplace_publish() from %I', r);
    end if;
  end loop;
end
$rv$;

-- the trigger itself is 20261127_70's (trg_02, BEFORE INSERT OR UPDATE); re-assert it
drop trigger if exists trg_02_service_requests_marketplace_guard on public.service_requests;
create trigger trg_02_service_requests_marketplace_guard
  before insert or update on public.service_requests
  for each row execute function public.guard_service_request_marketplace_publish();

-- 3d. the core predicate (20261202_70's listable rule + the priority window)
create or replace function public.marketplace_request_in_market(p_id text, p_include_held boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select exists (
    select 1
      from public.service_requests sr
     where sr.id = p_id
       and sr.assigned_to is null
       and sr.status in ('pending', 'pending_assignment')
       and sr.marketplace_hidden_at is null
       and not exists (select 1 from public.profiles p
                        where p.id = sr.requester_user_id and p.is_demo)
       and not exists (select 1 from public.test_accounts t
                        where t.user_id = sr.requester_user_id)
       and (
             (sr.marketplace_published_at is not null
              and sr.marketplace_category in ('consultation', 'case', 'drafting'))
          or exists (
               select 1 from public.platform_settings ps
                where ps.key = 'marketplace_market'
                  and ps.value ->> 'open' = 'true'
                  and sr.receiver = 'ai_workspace'
                  and coalesce(sr.payment ->> 'status', 'not_required') = 'not_required'
                  and sr.created_at >= coalesce(nullif(ps.value ->> 'opened_at', '')::timestamptz, 'infinity'::timestamptz)
                  and (coalesce(p_include_held, false)
                       or coalesce(sr.marketplace_release_at, '-infinity'::timestamptz) <= pg_catalog.now())
                  and exists (select 1 from public.profiles cp
                               where cp.id = sr.requester_user_id
                                 and cp.user_type in ('individual', 'corporate', 'micro', 'ngo', 'government'))
             )
           )
  );
$fn$;

comment on function public.marketplace_request_in_market(text, boolean) is
  '20261206_40 (l16 س٢٣): 20261202_70''s market rule. p_include_held = false: a market-open request still in the Nezamy priority window (marketplace_release_at in the future) is not in the market (the lawyers'' rule); true: it is (the admin''s view). Staff-published rows are never held. service_role only.';

-- 3e. listable = the lawyers' rule (marketplace_request_accept reads it, unchanged)
create or replace function public.marketplace_request_listable(p_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.marketplace_request_in_market(p_id, false);
$fn$;

comment on function public.marketplace_request_listable(text) is
  '20261202_70 + 20261206_40 (l12 Q130a, l16 س٢٣): true while the request is in the lawyers'' market — staff-published, or (market open) a client''s free request created since opened_at whose priority window has passed; never assigned, hidden, paid, demo or test. service_role and the marketplace_* functions only.';

-- 3f. the lawyers' list: same arguments and columns as 20261202_70, + the release moment
create or replace function public.marketplace_open_requests(
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id             text,
  type           text,
  receiver       text,
  city           text,
  public_summary text,
  status         text,
  created_at     timestamptz,
  category       text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.receiver, sr.city, sr.public_summary, sr.status, sr.created_at,
         coalesce(sr.marketplace_category,
                  case
                    when sr.type = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' in ('contracts', 'legal-filing') then 'drafting'
                    when sr.metadata ->> 'categoryId' in ('case-study', 'arbitration') then 'case'
                    else null
                  end) as category
    from public.service_requests sr
   where exists (
           select 1 from public.lawyer_profiles lp
            where lp.user_id = auth.uid()
              and lp.verification_status = 'verified'
         )
     and sr.assigned_to is null
     and sr.status in ('pending', 'pending_assignment')
     and sr.marketplace_hidden_at is null
     and not exists (select 1 from public.profiles p
                      where p.id = sr.requester_user_id and p.is_demo)
     and not exists (select 1 from public.test_accounts t
                      where t.user_id = sr.requester_user_id)
     and (
           (sr.marketplace_published_at is not null
            and sr.marketplace_category in ('consultation', 'case', 'drafting'))
        or exists (
             select 1 from public.platform_settings ps
              where ps.key = 'marketplace_market'
                and ps.value ->> 'open' = 'true'
                and sr.receiver = 'ai_workspace'
                and coalesce(sr.payment ->> 'status', 'not_required') = 'not_required'
                and sr.created_at >= coalesce(nullif(ps.value ->> 'opened_at', '')::timestamptz, 'infinity'::timestamptz)
                and coalesce(sr.marketplace_release_at, '-infinity'::timestamptz) <= pg_catalog.now()
                and exists (select 1 from public.profiles cp
                             where cp.id = sr.requester_user_id
                               and cp.user_type in ('individual', 'corporate', 'micro', 'ngo', 'government'))
           )
         )
   order by coalesce(sr.marketplace_published_at, sr.marketplace_release_at, sr.created_at) desc, sr.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.marketplace_open_requests(integer, integer) is
  '20261127_70 + 20261202_70 + 20261206_40 (owner ٢٣, l12 Q130a, l16 س٢٣): staff-published requests, and while the market is open every client''s free request since opened_at once its Nezamy priority window has passed — id, type, receiver, city, public_summary, status, created_at, category. Never title, description, requester or metadata; never test_accounts / is_demo rows. Verified lawyers only.';

-- 3g. the admin's view: held rows too, with their release moment
drop function if exists public.marketplace_open_requests_admin(integer, integer);
create function public.marketplace_open_requests_admin(p_limit integer default 100, p_offset integer default 0)
returns table (
  id                 text,
  type               text,
  title              text,
  city               text,
  public_summary     text,
  category           text,
  created_at         timestamptz,
  published          boolean,
  pending_asks       integer,
  release_at         timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.title, sr.city, sr.public_summary,
         coalesce(sr.marketplace_category,
                  case
                    when sr.type = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' = 'consultation' then 'consultation'
                    when sr.metadata ->> 'categoryId' in ('contracts', 'legal-filing') then 'drafting'
                    when sr.metadata ->> 'categoryId' in ('case-study', 'arbitration') then 'case'
                    else null
                  end),
         sr.created_at,
         sr.marketplace_published_at is not null,
         (select count(*)::integer from public.marketplace_acceptances a
           where a.request_id = sr.id and a.status = 'pending'),
         case when sr.marketplace_published_at is null then sr.marketplace_release_at else null end
    from public.service_requests sr
   where sr.status in ('pending', 'pending_assignment')
     and sr.assigned_to is null
     and public.marketplace_request_in_market(sr.id, true)
   order by coalesce(sr.marketplace_published_at, sr.created_at) desc, sr.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.marketplace_open_requests_admin(integer, integer) is
  '20261202_70 + 20261206_40: the admin''s view of the market — what lawyers see plus the requests still in the Nezamy priority window (release_at in the future). service_role only.';

-- 3h. the client's «افتحه للجميع فوراً»
create or replace function public.service_request_market_open_now(p_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  v_uid uuid := auth.uid();
  v_row public.service_requests;
  v_id  text;
begin
  if v_uid is null then
    return pg_catalog.jsonb_build_object('result', 'not_found');
  end if;
  select * into v_row from public.service_requests sr
   where sr.id = p_id and sr.requester_user_id = v_uid
   for update;
  if not found then
    return pg_catalog.jsonb_build_object('result', 'not_found');
  end if;
  -- the market's own rule (switch, paid, hidden, demo / test, client type …), held rows included
  if v_row.receiver <> 'ai_workspace' or v_row.assigned_to is not null
     or v_row.status not in ('pending', 'pending_assignment')
     or not public.marketplace_request_in_market(p_id, true) then
    return pg_catalog.jsonb_build_object('result', 'not_open');
  end if;
  if v_row.marketplace_release_at is null or v_row.marketplace_release_at <= pg_catalog.now() then
    return pg_catalog.jsonb_build_object('result', 'already_open', 'release_at', v_row.marketplace_release_at);
  end if;
  update public.service_requests sr
     set marketplace_release_at = pg_catalog.now(), updated_at = pg_catalog.now()
   where sr.id = p_id
  returning sr.id into v_id;
  return pg_catalog.jsonb_build_object('result', 'opened', 'release_at', pg_catalog.now());
end
$fn$;

comment on function public.service_request_market_open_now(text) is
  '20261206_40 (l16 س٢٣): the requester opens his own pending, unassigned ai_workspace request to every verified lawyer now (ends the Nezamy priority window). not_open unless the market''s own rule (marketplace_request_in_market) takes the request. opened | already_open | not_open | not_found.';

-- 3h'. the requester's read: is my request held, until when?
create or replace function public.service_request_market_hold(p_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.jsonb_build_object(
           'held', coalesce(sr.marketplace_release_at > pg_catalog.now(), false)
                   and public.marketplace_request_in_market(sr.id, true),
           'release_at', sr.marketplace_release_at)
    from public.service_requests sr
   where sr.id = p_id
     and sr.requester_user_id = auth.uid();
$fn$;

comment on function public.service_request_market_hold(text) is
  '20261206_40 (l16 س٢٣): for the requester only — {held, release_at}: held when the request is in the market by its own rule (marketplace_request_in_market) and its priority window has not passed. NULL for anyone else.';

-- 3i. privileges
do $gr$
declare
  r text;
  f text;
begin
  foreach f in array array[
    'public.nzamy_add_working_minutes(timestamptz, integer, jsonb)',
    'public.nzamy_market_release_at(timestamptz, boolean)',
    'public.marketplace_request_in_market(text, boolean)',
    'public.marketplace_request_listable(text)',
    'public.marketplace_open_requests(integer, integer)',
    'public.marketplace_open_requests_admin(integer, integer)',
    'public.service_request_market_open_now(text)',
    'public.service_request_market_hold(text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', f);
    foreach r in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
        execute pg_catalog.format('revoke all on function %s from %I', f, r);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', f);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    -- the lawyers' list (as 20261202_70), the client's open-now, and the stamp trg_02 calls as the session
    execute 'grant execute on function public.marketplace_open_requests(integer, integer) to authenticated';
    execute 'grant execute on function public.service_request_market_open_now(text) to authenticated';
    execute 'grant execute on function public.service_request_market_hold(text) to authenticated';
    execute 'grant execute on function public.nzamy_market_release_at(timestamptz, boolean) to authenticated';
  end if;
end
$gr$;

-- 4. verify (raises → the whole file rolls back)
do $verify$
declare
  missing text := '';
  t timestamptz;
  h jsonb := '{"tz": "Asia/Riyadh", "days": [0, 1, 2, 3, 4], "start": "09:00", "end": "17:00"}'::jsonb;
begin
  if (select pg_catalog.count(*) from public.platform_settings
       where key in ('nzamy_priority_minutes', 'nzamy_working_hours')) <> 2 then
    missing := missing || ' a setting row is missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'marketplace_release_at' and not attisdropped) then
    missing := missing || ' marketplace_release_at missing;';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.guard_service_request_marketplace_publish()'::regprocedure),
                       'new.marketplace_release_at := old.marketplace_release_at') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.guard_service_request_marketplace_publish()'::regprocedure),
                          'marketplace_hidden_at') = 0 then
    missing := missing || ' guard does not keep marketplace_release_at;';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure),
                       'marketplace_release_at') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure),
                          'marketplace_hidden_at is null') = 0 then
    missing := missing || ' open list without the window;';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.marketplace_request_listable(text)'::regprocedure),
                       'marketplace_request_in_market(p_id, false)') = 0 then
    missing := missing || ' listable not on the core predicate;';
  end if;
  if coalesce(pg_catalog.pg_get_function_result('public.marketplace_open_requests_admin(integer, integer)'::regprocedure), '')
       not like '%release_at%' then
    missing := missing || ' admin view without release_at;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') and (
       has_function_privilege('anon', 'public.service_request_market_open_now(text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.service_request_market_hold(text)', 'EXECUTE')
       or has_function_privilege('anon', 'public.nzamy_market_release_at(timestamptz, boolean)', 'EXECUTE')
       or has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE')) then
    missing := missing || ' anon can execute a market function;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') and (
       not has_function_privilege('authenticated', 'public.service_request_market_open_now(text)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.nzamy_market_release_at(timestamptz, boolean)', 'EXECUTE')
       or not has_function_privilege('authenticated', 'public.service_request_market_hold(text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_request_in_market(text, boolean)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_request_listable(text)', 'EXECUTE')
       or has_function_privilege('authenticated', 'public.marketplace_open_requests_admin(integer, integer)', 'EXECUTE')) then
    missing := missing || ' authenticated grants wrong;';
  end if;
  -- the working-hours arithmetic (Riyadh is UTC+3, no daylight saving): Thursday 16:50 + 30 → Sunday 09:20
  t := public.nzamy_add_working_minutes('2026-11-26 16:50:00+03', 30, h);
  if t is distinct from '2026-11-29 09:20:00+03'::timestamptz then
    missing := missing || ' Thu 16:50 + 30 = ' || coalesce(t::text, 'null') || ';';
  end if;
  t := public.nzamy_add_working_minutes('2026-11-24 08:00:00+03', 30, h);
  if t is distinct from '2026-11-24 09:30:00+03'::timestamptz then
    missing := missing || ' Tue 08:00 + 30 = ' || coalesce(t::text, 'null') || ';';
  end if;
  if missing <> '' then
    raise exception 'l16_priority verify FAILED:%', missing;
  end if;
  raise notice 'l16_priority verify: OK — priority window (minutes + working hours) stamped on new client requests, lawyers'' list and accept hold it, admin view shows it, client open-now';
end
$verify$;

commit;

select '20261206_40 l16 nzamy_priority_minutes (Nezamy priority window in working hours)' as migration, true;
