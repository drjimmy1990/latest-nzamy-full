-- =============================================================================
-- Migration: 20261123_40_contracts_request_id_not_unique.sql
-- =============================================================================
-- PURPOSE (owner package 13-Nov, N01-6 «ربط بقضية قائمة»)
--   contracts.request_id was born `text unique` in 20260518 (one contract per
--   request, from the old client-workflow model). The contracts manager now
--   links a contract to an EXISTING case through that column, and a case can
--   carry more than one contract (a fee agreement, a power of attorney, a
--   settlement). With the UNIQUE in place the second link fails with 23505.
--
--   1. Drop every UNIQUE constraint whose ONLY column is contracts.request_id
--      (found in pg_constraint, not by a guessed name), and any unique index
--      on that column alone.
--   2. Add a plain index for «عقود هذه القضية» (GET /api/v1/lawyer/contracts
--      ?requestId=…).
--
-- EFFECT
--   No policy, grant or row changes. The foreign key to service_requests
--   (on delete set null) stays. Nothing in the code relies on the uniqueness
--   (no `on conflict (request_id)` / upsert on contracts).
--
-- RUN ORDER
--   Any time, before or after the code deploy (the API answers a 23505 on a
--   second link with a clear message until this runs).
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261123_40_contracts_request_id_not_unique.sql
--   Idempotent: safe to run twice.
--
-- ROLLBACK (fails if a case already carries two contracts — by design)
--   alter table public.contracts add constraint contracts_request_id_key unique (request_id);
--   drop index if exists public.idx_contracts_request_id;
-- =============================================================================

begin;

set local lock_timeout = '10s';

-- 0. precondition
do $$
begin
  if to_regclass('public.contracts') is null then
    raise exception '20261123_40: public.contracts is missing';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'contracts' and column_name = 'request_id') then
    raise exception '20261123_40: public.contracts.request_id is missing';
  end if;
end $$;

-- 1. drop the single-column UNIQUE on request_id, whatever it is called
do $$
declare
  r record;
  att smallint;
begin
  select a.attnum into att
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.contracts'::regclass and a.attname = 'request_id' and not a.attisdropped;

  for r in
    select c.conname
      from pg_catalog.pg_constraint c
     where c.conrelid = 'public.contracts'::regclass
       and c.contype = 'u'
       and c.conkey = array[att]
  loop
    execute pg_catalog.format('alter table public.contracts drop constraint %I', r.conname);
  end loop;

  -- a stand-alone unique index (not backing a constraint) on request_id alone
  for r in
    select ic.relname
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ic on ic.oid = i.indexrelid
     where i.indrelid = 'public.contracts'::regclass
       and i.indisunique
       and not i.indisprimary
       and i.indnatts = 1
       and i.indkey[0] = att
       and not exists (select 1 from pg_catalog.pg_constraint c where c.conindid = i.indexrelid)
  loop
    execute pg_catalog.format('drop index public.%I', r.relname);
  end loop;
end $$;

-- 2. the plain index
create index if not exists idx_contracts_request_id on public.contracts (request_id);

-- 3. verify (raises → the whole file rolls back)
do $verify$
declare
  att smallint;
  missing text := '';
begin
  select a.attnum into att
    from pg_catalog.pg_attribute a
   where a.attrelid = 'public.contracts'::regclass and a.attname = 'request_id' and not a.attisdropped;

  if exists (select 1 from pg_catalog.pg_index i
              where i.indrelid = 'public.contracts'::regclass
                and i.indisunique and i.indnatts = 1 and i.indkey[0] = att) then
    missing := missing || ' a unique index on contracts.request_id remains;';
  end if;
  if to_regclass('public.idx_contracts_request_id') is null then
    missing := missing || ' idx_contracts_request_id missing;';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conrelid = 'public.contracts'::regclass and c.contype = 'f' and c.conkey = array[att]) then
    missing := missing || ' the request_id foreign key is gone;';
  end if;

  if missing <> '' then
    raise exception '20261123_40 verify:%', missing;
  end if;
  raise notice '20261123_40 verify: OK';
end $verify$;

commit;

select '20261123_40 contracts.request_id is not unique (several contracts per case)' as step,
       not exists (select 1 from pg_catalog.pg_index i
                    join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
                   where i.indrelid = 'public.contracts'::regclass
                     and i.indisunique and i.indnatts = 1 and a.attname = 'request_id')
       and to_regclass('public.idx_contracts_request_id') is not null as ok;
