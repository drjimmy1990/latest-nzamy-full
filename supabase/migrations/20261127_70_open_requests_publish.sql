-- =============================================================================
-- Migration: 20261127_70_open_requests_publish.sql
-- =============================================================================
-- PURPOSE (owner ٢٣, 18 Nov 2026 — batch l7, builder l7-misc)
--   «الطلبات المفتوحة للمحامين: استشارة، قضية، صياغة — بعد فرز سريع من الإدارة».
--   Until now nothing reached a lawyer: every client form writes
--   receiver = 'ai_workspace', and marketplace_open_requests (20261124_30)
--   excluded exactly that receiver. Now a request is listed ONLY after a staff
--   member publishes it from the service-orders queue, with one of three types.
--
--   1. public.service_requests gets three columns, written by the server only:
--        marketplace_published_at  timestamptz null — when staff published it
--        marketplace_published_by  uuid null        — who (auth.users, set null)
--        marketplace_category      text null        — consultation | case | drafting
--      CHECKs: the category is one of the three; a published row has one.
--      The receiver is NOT changed: the row stays an ai_workspace order the
--      team still sees, and no RLS policy opens it to lawyers (20261122_30
--      closed the table to everyone but the requester and the assignee).
--
--   2. trg_02_service_requests_marketplace_guard (BEFORE INSERT OR UPDATE): a
--      write by any role other than postgres / service_role / supabase_admin
--      cannot set the three columns — on INSERT they are forced to NULL, on
--      UPDATE the old values are kept. A client can never publish his own
--      request. (Same technique as trg_01 of 20261124_30.)
--
--   3. public.marketplace_open_requests(p_limit, p_offset) is DROPPED and
--      re-created from its LATEST definition (20261124_30) — RETURNS TABLE
--      gains `category`, which CREATE OR REPLACE refuses. Same arguments
--      (integer, integer), so every rpc caller keeps working. Same security:
--      verified lawyers only, SECURITY DEFINER, empty search_path, EXECUTE for
--      authenticated (+ service_role) only. The filter changes:
--        - published (marketplace_published_at is not null)
--        - type filter: marketplace_category in (consultation, case, drafting)
--        - still unassigned and pending / pending_assignment
--        - the requester is not a test account (owner decision 3 / l7):
--          profiles.is_demo = true OR a row in public.test_accounts → never
--          listed to real lawyers.
--        - `receiver <> 'ai_workspace'` is gone: publishing IS the triage.
--          An unpublished row is never listed, whatever its receiver.
--      Ordered by publication time, newest first.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_70_open_requests_publish.sql
--   Expect: NOTICE  20261127_70 verify: OK  and a row with `t`.
--   Idempotent: safe to run twice.
--
-- RUN ORDER: ANY TIME, before or after the deploy of batch/2026-11-19-l7-misc.
--   Before this file, the new admin «نشر في الطلبات المفتوحة» button answers
--   honestly that this file has not run (the column is missing) and the
--   lawyer list keeps the old function. After it with the OLD code, the list
--   shows only published rows — none, until the new code publishes one.
--   Needs 20261124_30 (the function it replaces), 20261125_50 (profiles.is_demo)
--   and 20261017_44 (public.test_accounts) — the file refuses to run without them.
--   RE-RUN HAZARD: re-running 20261124_30 after this file puts the old
--   (unpublished-included, receiver-based) function back — re-run this file
--   after it.
--
-- ROLLBACK
--   drop trigger if exists trg_02_service_requests_marketplace_guard on public.service_requests;
--   drop function if exists public.guard_service_request_marketplace_publish();
--   drop function if exists public.marketplace_open_requests(integer, integer);
--   then re-run supabase/migrations/20261124_30_open_requests_city_summary.sql
--   (it re-creates the old function);
--   alter table public.service_requests drop column if exists marketplace_category,
--                                       drop column if exists marketplace_published_by,
--                                       drop column if exists marketplace_published_at;
--
-- Docker: supabase/tests/rls/open_requests_publish.test.sql
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $pre$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261127_70: public.service_requests is missing';
  end if;
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261127_70: public.lawyer_profiles is missing';
  end if;
  if to_regprocedure('public.marketplace_open_requests(integer, integer)') is null then
    raise exception '20261127_70: run 20261124_30_open_requests_city_summary.sql first';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'public_summary' and not attisdropped) then
    raise exception '20261127_70: run 20261124_30_open_requests_city_summary.sql first (no public_summary)';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.profiles'::regclass and attname = 'is_demo' and not attisdropped) then
    raise exception '20261127_70: run 20261125_50_demo_accounts.sql first (no profiles.is_demo)';
  end if;
  if to_regclass('public.test_accounts') is null then
    raise exception '20261127_70: run 20261017_44_test_accounts_never_listed.sql first (no public.test_accounts)';
  end if;
end
$pre$;

-- 1. the three columns + their checks
alter table public.service_requests add column if not exists marketplace_published_at timestamptz;
alter table public.service_requests add column if not exists marketplace_published_by uuid references auth.users(id) on delete set null;
alter table public.service_requests add column if not exists marketplace_category text;

comment on column public.service_requests.marketplace_published_at is
  '20261127_70 (owner ٢٣): when staff published the request to the lawyers'' open list. Server-written only (trg_02).';
comment on column public.service_requests.marketplace_published_by is
  '20261127_70 (owner ٢٣): the staff member who published it. Server-written only (trg_02).';
comment on column public.service_requests.marketplace_category is
  '20261127_70 (owner ٢٣): the type lawyers see — consultation | case | drafting. Server-written only (trg_02).';

do $chk$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.service_requests'::regclass
                    and conname = 'service_requests_marketplace_category_check') then
    alter table public.service_requests
      add constraint service_requests_marketplace_category_check
      check (marketplace_category is null or marketplace_category in ('consultation', 'case', 'drafting'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.service_requests'::regclass
                    and conname = 'service_requests_marketplace_published_check') then
    alter table public.service_requests
      add constraint service_requests_marketplace_published_check
      check (marketplace_published_at is null or marketplace_category is not null);
  end if;
end
$chk$;

create index if not exists service_requests_marketplace_published_idx
  on public.service_requests (marketplace_published_at desc)
  where marketplace_published_at is not null;

-- 2. only the server publishes
create or replace function public.guard_service_request_marketplace_publish()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.marketplace_published_at := null;
    new.marketplace_published_by := null;
    new.marketplace_category := null;
  else
    new.marketplace_published_at := old.marketplace_published_at;
    new.marketplace_published_by := old.marketplace_published_by;
    new.marketplace_category := old.marketplace_category;
  end if;
  return new;
end $$;

comment on function public.guard_service_request_marketplace_publish() is
  '20261127_70: a session (any role but postgres / service_role / supabase_admin) cannot publish a service request to the open list.';

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

drop trigger if exists trg_02_service_requests_marketplace_guard on public.service_requests;
create trigger trg_02_service_requests_marketplace_guard
  before insert or update on public.service_requests
  for each row execute function public.guard_service_request_marketplace_publish();

-- 3. the browse function: published + typed + not a test account
drop function if exists public.marketplace_open_requests(integer, integer);
create function public.marketplace_open_requests(
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
  select sr.id, sr.type, sr.receiver, sr.city, sr.public_summary, sr.status, sr.created_at, sr.marketplace_category
    from public.service_requests sr
   where exists (
           select 1 from public.lawyer_profiles lp
            where lp.user_id = auth.uid()
              and lp.verification_status = 'verified'
         )
     and sr.marketplace_published_at is not null
     and sr.marketplace_category in ('consultation', 'case', 'drafting')
     and sr.assigned_to is null
     and sr.status in ('pending', 'pending_assignment')
     and not exists (select 1 from public.profiles p
                      where p.id = sr.requester_user_id and p.is_demo)
     and not exists (select 1 from public.test_accounts t
                      where t.user_id = sr.requester_user_id)
   order by sr.marketplace_published_at desc, sr.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.marketplace_open_requests(integer, integer) is
  '20261127_70 (owner ٢٣): requests staff PUBLISHED, typed consultation / case / drafting, never a test account''s — id, type, receiver, city, public_summary, status, created_at, category. Never title, description, requester or metadata. Verified lawyers only.';

revoke all on function public.marketplace_open_requests(integer, integer) from public;
do $gr$
declare r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.marketplace_open_requests(integer, integer) from %I', r);
    end if;
  end loop;
  foreach r in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('grant execute on function public.marketplace_open_requests(integer, integer) to %I', r);
    end if;
  end loop;
end
$gr$;

-- 4. verify (raises → the whole file rolls back)
do $verify$
declare
  missing text := '';
  cols text;
  def text;
begin
  if (select pg_catalog.count(*) from pg_catalog.pg_attribute
       where attrelid = 'public.service_requests'::regclass and not attisdropped
         and attname in ('marketplace_published_at', 'marketplace_published_by', 'marketplace_category')) <> 3 then
    missing := missing || ' a marketplace_* column is missing;';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_constraint
       where conrelid = 'public.service_requests'::regclass
         and conname in ('service_requests_marketplace_category_check', 'service_requests_marketplace_published_check')) <> 2 then
    missing := missing || ' a marketplace check is missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.service_requests'::regclass
                    and tgname = 'trg_02_service_requests_marketplace_guard'
                    and not tgisinternal and tgenabled <> 'D') then
    missing := missing || ' publish guard trigger missing;';
  end if;

  if to_regprocedure('public.marketplace_open_requests(integer, integer)') is null then
    missing := missing || ' marketplace_open_requests missing;';
  else
    select string_agg(a.attname, ',' order by a.attnum) into cols
      from pg_catalog.pg_proc p
      cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
     where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure and a.mode = 't';
    if cols is distinct from 'id,type,receiver,city,public_summary,status,created_at,category' then
      missing := missing || pg_catalog.format(' marketplace_open_requests returns %s;', cols);
    end if;
    def := pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure);
    if pg_catalog.strpos(def, 'marketplace_published_at is not null') = 0
       or pg_catalog.strpos(def, 'is_demo') = 0
       or pg_catalog.strpos(def, 'test_accounts') = 0 then
      missing := missing || ' marketplace_open_requests lost the publish / test-account filter;';
    end if;
    if not (select prosecdef from pg_catalog.pg_proc
             where oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure) then
      missing := missing || ' marketplace_open_requests is not security definer;';
    end if;
    if not exists (select 1 from pg_catalog.pg_proc
                    where oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure
                      and proconfig @> array['search_path=""']) then
      missing := missing || ' marketplace_open_requests has no empty search_path;';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
       and has_function_privilege('anon', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
      missing := missing || ' anon can EXECUTE marketplace_open_requests;';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and not has_function_privilege('authenticated', 'public.marketplace_open_requests(integer, integer)', 'EXECUTE') then
      missing := missing || ' authenticated cannot EXECUTE marketplace_open_requests;';
    end if;
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_proc
       where pronamespace = 'public'::regnamespace and proname = 'marketplace_open_requests') <> 1 then
    missing := missing || ' public.marketplace_open_requests is not exactly one function;';
  end if;

  if missing <> '' then
    raise exception '20261127_70 verify:%', missing;
  end if;
  raise notice '20261127_70 verify: OK';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261127_70 open requests: staff publish (consultation / case / drafting), test accounts never listed' as step,
       exists (select 1 from pg_catalog.pg_trigger
                where tgrelid = 'public.service_requests'::regclass
                  and tgname = 'trg_02_service_requests_marketplace_guard')
       and pg_catalog.pg_get_function_result('public.marketplace_open_requests(integer, integer)'::regprocedure)
           like '%category%'
       and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.marketplace_open_requests(integer, integer)'::regprocedure),
                             'marketplace_published_at is not null') > 0 as ok;
