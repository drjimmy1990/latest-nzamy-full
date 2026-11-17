-- =============================================================================
-- Migration: 20261122_20_terms_acceptances.sql
-- =============================================================================
-- PURPOSE
--   Owner package 2026-11-17 (R7): every signup ticks a consent box (terms +
--   «حماية المنصة ومحتواها»), and a change of the terms asks every account
--   again on its next visit. Nothing recorded either until now.
--
--   public.terms_acceptances (new): one row per account per terms version.
--     terms_version       the version accepted (CURRENT_TERMS_VERSION in
--                         src/lib/legal/termsVersion.ts, e.g. '2026-11-18')
--     accepted_at         server time of the record (timestamptz)
--     accepted_at_riyadh  the same moment as Riyadh wall-clock time, written
--                         by a trigger (the owner asked for Riyadh time
--                         explicitly; a client cannot set it)
--     ip_hash             HMAC-SHA256 of the client address with a server
--                         salt — NEVER the address itself
--     user_agent          cut to 256 characters
--     context             'signup' | 'relogin'
--   unique (user_id, terms_version): a second acceptance of the same version
--   is a no-op (the route writes with ON CONFLICT DO NOTHING).
--
-- PRIVILEGES
--   RLS on. A signed-in user may SELECT his own rows only. anon has nothing;
--   authenticated has SELECT only — no INSERT/UPDATE/DELETE. Rows are written
--   only by the service role, from POST /api/v1/legal/terms-acceptance.
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261122_20_terms_acceptances.sql
--   Idempotent (safe to run twice).
--
-- RUN ORDER
--   Independent of every other migration (needs only auth.users). Safe before
--   or after the code deploy: until it runs, the route's GET answers "nothing
--   to ask" (missing table → the re-ask modal stays closed) and a signup's
--   record attempt fails quietly; the signup's choice survives in
--   user_metadata.terms_version and is recorded on the first signed-in visit
--   after this file runs. From then on, every existing account without a row
--   is asked once.
--
-- ROLLBACK
--   drop table if exists public.terms_acceptances;
--   drop function if exists public.terms_acceptances_set_riyadh();
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 1. The table
create table if not exists public.terms_acceptances (
  id                 uuid        primary key default gen_random_uuid(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  terms_version      text        not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  accepted_at        timestamptz not null default now(),
  accepted_at_riyadh timestamp   not null default (now() at time zone 'Asia/Riyadh'),
  ip_hash            text        check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent         text        check (user_agent is null or char_length(user_agent) <= 256),
  context            text        not null check (context in ('signup', 'relogin')),
  constraint terms_acceptances_user_version_key unique (user_id, terms_version)
);

comment on table public.terms_acceptances is
  'One row per account per accepted terms version (R7). Written only by the service role. ip_hash is a salted hash, never the address.';

-- 2. Riyadh wall-clock time, always derived from accepted_at (a generated
--    column cannot use AT TIME ZONE: it is not immutable).
create or replace function public.terms_acceptances_set_riyadh()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.accepted_at_riyadh := new.accepted_at at time zone 'Asia/Riyadh';
  return new;
end;
$$;

revoke all on function public.terms_acceptances_set_riyadh() from public;

drop trigger if exists trg_terms_acceptances_riyadh on public.terms_acceptances;
create trigger trg_terms_acceptances_riyadh
  before insert or update of accepted_at on public.terms_acceptances
  for each row execute function public.terms_acceptances_set_riyadh();

-- 3. RLS: own rows readable, nothing writable from a session
alter table public.terms_acceptances enable row level security;

drop policy if exists "terms_acceptances: own rows readable" on public.terms_acceptances;
create policy "terms_acceptances: own rows readable" on public.terms_acceptances
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.terms_acceptances from public;
do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    revoke all on public.terms_acceptances from anon;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    revoke all on public.terms_acceptances from authenticated;
    grant select on public.terms_acceptances to authenticated;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant all on public.terms_acceptances to service_role;
  end if;
end $$;

-- 4. verify
do $$
declare
  missing text := '';
  p text;
begin
  if to_regclass('public.terms_acceptances') is null then
    raise exception '20261122_20 verify: public.terms_acceptances missing';
  end if;
  if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.terms_acceptances'::regclass) then
    missing := missing || ' RLS off;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('anon', 'public.terms_acceptances', p) then
        missing := missing || pg_catalog.format(' anon has %s;', p);
      end if;
    end loop;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    foreach p in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', 'public.terms_acceptances', p) then
        missing := missing || pg_catalog.format(' authenticated has %s;', p);
      end if;
    end loop;
    if not has_table_privilege('authenticated', 'public.terms_acceptances', 'SELECT') then
      missing := missing || ' authenticated cannot SELECT;';
    end if;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     and not has_table_privilege('service_role', 'public.terms_acceptances', 'INSERT') then
    missing := missing || ' service_role cannot INSERT;';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_policy
       where polrelid = 'public.terms_acceptances'::regclass) <> 1 then
    missing := missing || ' expected exactly one policy;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.terms_acceptances'::regclass
                    and tgname = 'trg_terms_acceptances_riyadh') then
    missing := missing || ' Riyadh trigger missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.terms_acceptances'::regclass
                    and conname = 'terms_acceptances_user_version_key') then
    missing := missing || ' unique (user_id, terms_version) missing;';
  end if;

  if missing <> '' then
    raise exception '20261122_20 verify:%', missing;
  end if;
  raise notice '20261122_20 verify: OK';
end $$;

-- 5. PostgREST: see the new table now
notify pgrst, 'reload schema';

commit;

select '20261122_20 terms acceptances' as step,
       to_regclass('public.terms_acceptances') is not null
       and (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.terms_acceptances'::regclass)
       as ok;
