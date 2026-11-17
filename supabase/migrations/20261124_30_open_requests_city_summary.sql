-- =============================================================================
-- Migration: 20261124_30_open_requests_city_summary.sql
-- =============================================================================
-- PURPOSE (owner decisions ١٠ + ١٩, 17 Nov 2026)
--   A verified lawyer browsing open requests sees the case type, the city and
--   ONE summary line — never the client's name, never the client's own text.
--
--   1. service_requests gets two columns:
--        city            text null — a slug from src/constants/saudiCities.ts
--                        (riyadh, jeddah, … other). CHECK: ^[a-z_]{2,40}$, so
--                        no free text, digit, e-mail or URL can ever sit there.
--        public_summary  text null — one line (≤ 120 characters) written by
--                        the SERVER only (service role), from the client's
--                        description after names, numbers, mobiles, e-mails
--                        and URLs are removed. CHECK: no digit of any script
--                        (0-9, ٠-٩, ۰-۹, ０-９), no '@', no 'http:'/'https:'/
--                        'www.', no line break — the same post-check the code
--                        runs (src/lib/services/requestPublicSummary.ts), held
--                        by the database too.
--      Real columns, not metadata: metadata is built from the request body and
--      belongs to the requester; the summary must be server-written only, and
--      the browse function selects a column, not a jsonb path.
--
--   2. trg_01_service_requests_public_summary_guard (BEFORE INSERT OR UPDATE):
--      a write by any role other than postgres / service_role / supabase_admin
--      cannot set public_summary — on INSERT it is forced to NULL, on UPDATE
--      it keeps the old value. (The session guard trg_00 of 20261018_04
--      already refuses a session UPDATE of any column but status; the INSERT
--      side was open: a requester posting to PostgREST directly could have
--      written his own «summary».) The city stays client-written: it is the
--      client's own pick, and the CHECK above keeps it a slug.
--
--   3. public.marketplace_open_requests(p_limit, p_offset) is DROPPED and
--      re-created (its RETURNS TABLE changes, which CREATE OR REPLACE refuses):
--        id, type, receiver, city, public_summary, status, created_at
--      `title` is NO LONGER returned: it is the client's free-typed subject and
--      may carry a name or a mobile (decision ١٠). The arguments are the same
--      (integer, integer), so an rpc caller keeps working. Same filter and
--      same security as 20261122_30: verified lawyers only, SECURITY DEFINER,
--      empty search_path, EXECUTE for authenticated (+ service_role) only.
--
-- HOW TO RUN — BEFORE the code deploy (the new request form sends `city`; the
--   old code never sends either column, so running it first is safe):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261124_30_open_requests_city_summary.sql
--   Expect: NOTICE  20261124_30 verify: OK  and a row with `t`.
--   Idempotent: safe to run twice.
--
-- RUN ORDER
--   After 20261122_30 (the function it replaces) and 20261018_04 (the session
--   guard it sits next to). Before the deploy of branch
--   batch/2026-11-17-l3-requests.
--
-- OLD ROWS
--   Rows created before this file have city = NULL and public_summary = NULL;
--   the lawyer list shows the case type only for them. An optional one-off
--   deterministic backfill is in the l3-requests report (not run here).
--
-- ROLLBACK
--   drop trigger if exists trg_01_service_requests_public_summary_guard on public.service_requests;
--   drop function if exists public.guard_service_request_public_summary();
--   drop function if exists public.marketplace_open_requests(integer, integer);
--   then re-run supabase/migrations/20261122_30_service_requests_open_view.sql
--   (it uses CREATE OR REPLACE, so the drop above is required first);
--   alter table public.service_requests drop column if exists public_summary,
--                                       drop column if exists city;
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. preconditions
do $pre$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261124_30: public.service_requests is missing';
  end if;
  if to_regclass('public.lawyer_profiles') is null then
    raise exception '20261124_30: public.lawyer_profiles is missing';
  end if;
  if to_regprocedure('public.marketplace_open_requests(integer, integer)') is null then
    raise exception '20261124_30: run 20261122_30_service_requests_open_view.sql first';
  end if;
end
$pre$;

-- 1. the two columns + their checks
alter table public.service_requests add column if not exists city text;
alter table public.service_requests add column if not exists public_summary text;

comment on column public.service_requests.city is
  '20261124_30 (owner ١٩): city slug from src/constants/saudiCities.ts, picked by the client. Shown to verified lawyers by marketplace_open_requests.';
comment on column public.service_requests.public_summary is
  '20261124_30 (owner ١٠/١٩): one scrubbed summary line, server-written only (trg_01 guard). Shown to verified lawyers instead of the client''s text.';

do $chk$
begin
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.service_requests'::regclass
                    and conname = 'service_requests_city_slug_check') then
    alter table public.service_requests
      add constraint service_requests_city_slug_check
      check (city is null or city ~ '^[a-z_]{2,40}$');
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.service_requests'::regclass
                    and conname = 'service_requests_public_summary_check') then
    alter table public.service_requests
      add constraint service_requests_public_summary_check
      check (
        public_summary is null
        or (    pg_catalog.char_length(public_summary) between 1 and 120
            and public_summary !~ '[0-9٠-٩۰-۹０-９@]'
            and public_summary !~* '(https?:|www\.)'
            and public_summary !~ '[\r\n]')
      );
  end if;
end
$chk$;

-- 2. only the server writes the summary
create or replace function public.guard_service_request_public_summary()
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
    new.public_summary := null;
  else
    new.public_summary := old.public_summary;
  end if;
  return new;
end $$;

comment on function public.guard_service_request_public_summary() is
  '20261124_30: a session (any role but postgres / service_role / supabase_admin) cannot write service_requests.public_summary.';

revoke all on function public.guard_service_request_public_summary() from public;
do $rv$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.guard_service_request_public_summary() from %I', r);
    end if;
  end loop;
end
$rv$;

drop trigger if exists trg_01_service_requests_public_summary_guard on public.service_requests;
create trigger trg_01_service_requests_public_summary_guard
  before insert or update on public.service_requests
  for each row execute function public.guard_service_request_public_summary();

-- 3. the browse function: type, city, summary — no title, no client text
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
  created_at     timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select sr.id, sr.type, sr.receiver, sr.city, sr.public_summary, sr.status, sr.created_at
    from public.service_requests sr
   where exists (
           select 1 from public.lawyer_profiles lp
            where lp.user_id = auth.uid()
              and lp.verification_status = 'verified'
         )
     and sr.assigned_to is null
     and sr.status in ('pending', 'pending_assignment')
     and sr.receiver <> 'ai_workspace'
   order by sr.created_at desc, sr.id
   limit least(greatest(coalesce(p_limit, 50), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$fn$;

comment on function public.marketplace_open_requests(integer, integer) is
  '20261124_30 (owner ١٠): open requests for verified lawyers — id, type, receiver, city, public_summary, status, created_at. Never title, description, requester or metadata.';

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
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'city' and not attisdropped) then
    missing := missing || ' column city missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.service_requests'::regclass and attname = 'public_summary' and not attisdropped) then
    missing := missing || ' column public_summary missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.service_requests'::regclass and conname = 'service_requests_city_slug_check') then
    missing := missing || ' city check missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.service_requests'::regclass and conname = 'service_requests_public_summary_check') then
    missing := missing || ' public_summary check missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.service_requests'::regclass
                    and tgname = 'trg_01_service_requests_public_summary_guard'
                    and not tgisinternal and tgenabled <> 'D') then
    missing := missing || ' summary guard trigger missing;';
  end if;

  if to_regprocedure('public.marketplace_open_requests(integer, integer)') is null then
    missing := missing || ' marketplace_open_requests missing;';
  else
    select string_agg(a.attname, ',' order by a.attnum) into cols
      from pg_catalog.pg_proc p
      cross join lateral unnest(p.proargnames, p.proargmodes) with ordinality as a(attname, mode, attnum)
     where p.oid = 'public.marketplace_open_requests(integer, integer)'::regprocedure and a.mode = 't';
    if cols is distinct from 'id,type,receiver,city,public_summary,status,created_at' then
      missing := missing || pg_catalog.format(' marketplace_open_requests returns %s;', cols);
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
    raise exception '20261124_30 verify:%', missing;
  end if;
  raise notice '20261124_30 verify: OK';
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261124_30 open requests: city + public_summary (server-only), no title in marketplace_open_requests' as step,
       exists (select 1 from pg_catalog.pg_trigger
                where tgrelid = 'public.service_requests'::regclass
                  and tgname = 'trg_01_service_requests_public_summary_guard')
       and pg_catalog.pg_get_function_result('public.marketplace_open_requests(integer, integer)'::regprocedure)
           like '%public_summary%'
       and pg_catalog.pg_get_function_result('public.marketplace_open_requests(integer, integer)'::regprocedure)
           not like '%title%' as ok;
