-- contracts_request_id_not_unique.test.sql — proves 20261123_40 (owner N01-6).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself and creates
-- public.contracts exactly as 20260518 did: `request_id text unique`). The
-- migration runs TWICE (idempotent). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20261123_40_contracts_request_id_not_unique.sql \
--     $M/20261123_40_contracts_request_id_not_unique.sql \
--     $T/contracts_request_id_not_unique.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261123_40
-- lines → the second contract on SR-1 raises 23505 ("T1 FAIL").
--
-- Every assertion RAISES on failure (the harness fails closed on ERROR).
\set ON_ERROR_STOP 1

insert into auth.users values
  ('11111111-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-00000000000b');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('SR-1', '11111111-0000-0000-0000-00000000000a', 'قضية', '22222222-0000-0000-0000-00000000000b');

-- T1 a case carries two contracts
do $$
begin
  insert into public.contracts (id, request_id, assigned_user_id) values
    ('K-1', 'SR-1', '22222222-0000-0000-0000-00000000000b');
  begin
    insert into public.contracts (id, request_id, assigned_user_id) values
      ('K-2', 'SR-1', '22222222-0000-0000-0000-00000000000b');
  exception when unique_violation then
    raise exception 'T1 FAIL: a second contract on the same case is refused (23505)';
  end;
  if (select count(*) from public.contracts where request_id = 'SR-1') <> 2 then
    raise exception 'T1 FAIL: expected 2 contracts on SR-1';
  end if;
  raise notice 'T1 PASS: two contracts on one case';
end $$;

-- T2 the foreign key still holds: an unknown case id is refused
do $$
begin
  begin
    insert into public.contracts (id, request_id) values ('K-3', 'SR-NOPE');
    raise exception 'T2 FAIL: a contract linked to a missing case was accepted';
  exception when foreign_key_violation then
    raise notice 'T2 PASS: the request_id foreign key still holds';
  end;
end $$;

-- T3 deleting the case unlinks (on delete set null), never deletes the contracts
do $$
begin
  delete from public.service_requests where id = 'SR-1';
  if (select count(*) from public.contracts where id in ('K-1', 'K-2') and request_id is null) <> 2 then
    raise exception 'T3 FAIL: deleting the case did not leave both contracts unlinked';
  end if;
  raise notice 'T3 PASS: on delete set null kept';
end $$;

-- T4 the plain index exists and no unique index on request_id remains
do $$
begin
  if to_regclass('public.idx_contracts_request_id') is null then
    raise exception 'T4 FAIL: idx_contracts_request_id missing';
  end if;
  if exists (select 1 from pg_catalog.pg_index i
               join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
              where i.indrelid = 'public.contracts'::regclass
                and i.indisunique and i.indnatts = 1 and a.attname = 'request_id') then
    raise exception 'T4 FAIL: a unique index on contracts.request_id remains';
  end if;
  -- the primary key is untouched
  begin
    insert into public.contracts (id) values ('K-1');
    raise exception 'T4 FAIL: the primary key was dropped';
  exception when unique_violation then
    raise notice 'T4 PASS: plain index present, primary key intact';
  end;
end $$;
