-- l11_firm_statements_party_ids.test.sql — proves 20261201_40 (batch l11):
--   A. O23: the firm owner and an ACTIVE managing_partner / finance_manager read
--      every fee statement stamped with their firm; nobody else gains anything
--      (a partner, a plain lawyer for colleagues' rows, a suspended finance
--      manager, another firm's finance manager, a guest); a payments row that
--      is not a statement stays hidden.
--   B. N01-5: contract_party_national_ids / contract_party_id_access_log are
--      service-role only (sessions cannot read or write), the log is
--      append-only, the CHECKs refuse a plain number, and the ID row goes with
--      its contract.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261201_40
-- runs TWICE (it must be re-runnable); the _verify block runs after it. From
-- the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l11_firm.sql
--   sed -n '/^-- >>> verify:l11_firm/,/^-- <<< verify:l11_firm/p' $M/_verify.sql | tr -d '\r' > "$B"
--   bash $R/run.sh \
--     $R/prelude_invoice_payments_live.sql \
--     $R/prelude_lawyer_clients_min.sql \
--     $R/prelude_contracts_min.sql \
--     $M/20261030_10_invoice_collections_atomic.sql \
--     $M/20261030_20_create_invoice_atomic.sql \
--     $M/20261124_40_invoice_links.sql \
--     $M/20261201_40_firm_statements_party_ids.sql \
--     $M/20261201_40_firm_statements_party_ids.sql \
--     "$B" \
--     $R/l11_firm_statements_party_ids.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261201_40
-- files and the verify block → "T0 FAIL".
--
-- Actors (firm F unless said otherwise):
--   O …f001 firm owner            MP …f002 managing_partner   FM …f003 finance_manager
--   L …f004 lawyer (issuer)       P  …f005 partner            S  …f006 suspended finance_manager
--   X …f007 finance_manager of firm G                          Y  …f008 lawyer of firm G

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.firm_fee_statement_reader(uuid)') is null
     or to_regclass('public.contract_party_national_ids') is null then
    raise exception 'T0 FAIL: 20261201_40 not applied';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000f001'), ('00000000-0000-0000-0000-00000000f002'),
  ('00000000-0000-0000-0000-00000000f003'), ('00000000-0000-0000-0000-00000000f004'),
  ('00000000-0000-0000-0000-00000000f005'), ('00000000-0000-0000-0000-00000000f006'),
  ('00000000-0000-0000-0000-00000000f007'), ('00000000-0000-0000-0000-00000000f008');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-00000000f001', 'firm'),   ('00000000-0000-0000-0000-00000000f002', 'lawyer'),
  ('00000000-0000-0000-0000-00000000f003', 'lawyer'), ('00000000-0000-0000-0000-00000000f004', 'lawyer'),
  ('00000000-0000-0000-0000-00000000f005', 'lawyer'), ('00000000-0000-0000-0000-00000000f006', 'lawyer'),
  ('00000000-0000-0000-0000-00000000f007', 'firm'),   ('00000000-0000-0000-0000-00000000f008', 'lawyer');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000f001', 'مكتب و'),
  ('33333333-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-00000000f007', 'مكتب ز');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000f002', 'managing_partner', 'active'),
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000f003', 'finance_manager',  'active'),
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000f004', 'lawyer',           'active'),
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000f005', 'partner',          'active'),
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000f006', 'finance_manager',  'suspended'),
  ('33333333-0000-4000-8000-0000000000f2', '00000000-0000-0000-0000-00000000f008', 'lawyer',           'active');

insert into public.payments (id, request_id, provider, amount, status, metadata, owner_user_id, firm_id) values
  ('st-f-l',  null, 'manual', 1150, 'requires_payment', '{"invoice": true, "client": "عميل ١"}',
     '00000000-0000-0000-0000-00000000f004', '33333333-0000-4000-8000-0000000000f1'),
  ('st-f-mp', null, 'manual', 500,  'paid',             '{"invoice": true, "client": "عميل ٢"}',
     '00000000-0000-0000-0000-00000000f002', '33333333-0000-4000-8000-0000000000f1'),
  ('nonst-f', null, 'stub',   99,   'paid',             '{}',
     '00000000-0000-0000-0000-00000000f004', '33333333-0000-4000-8000-0000000000f1'),
  ('st-g-y',  null, 'manual', 700,  'requires_payment', '{"invoice": true, "client": "عميل ٣"}',
     '00000000-0000-0000-0000-00000000f008', '33333333-0000-4000-8000-0000000000f2');

insert into public.contracts (id, owner_user_id, title) values
  ('k-l', '00000000-0000-0000-0000-00000000f004', 'عقد توريد');

create function pg_temp.seen_as(uid text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('test.uid', uid, false);
  execute 'set role authenticated';
  select coalesce(string_agg(id, ',' order by id), '') into v from public.payments;
  execute 'reset role';
  perform set_config('test.uid', '', false);
  return v;
end $$;

-- T1 the owner reads both statements of his firm, not the non-statement, not firm G
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f001');
begin
  if v <> 'st-f-l,st-f-mp' then raise exception 'T1 FAIL: owner sees [%]', v; end if;
end $$;

-- T2 the managing partner: both statements of F
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f002');
begin
  if v <> 'st-f-l,st-f-mp' then raise exception 'T2 FAIL: managing partner sees [%]', v; end if;
end $$;

-- T3 the finance manager: both statements of F
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f003');
begin
  if v <> 'st-f-l,st-f-mp' then raise exception 'T3 FAIL: finance manager sees [%]', v; end if;
end $$;

-- T4 the issuing lawyer: his own rows only (the older owner policy), not his colleague's
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f004');
begin
  if v <> 'nonst-f,st-f-l' then raise exception 'T4 FAIL: lawyer sees [%]', v; end if;
end $$;

-- T5 a partner gains nothing
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f005');
begin
  if v <> '' then raise exception 'T5 FAIL: partner sees [%]', v; end if;
end $$;

-- T6 a suspended finance manager gains nothing
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f006');
begin
  if v <> '' then raise exception 'T6 FAIL: suspended finance manager sees [%]', v; end if;
end $$;

-- T7 another firm's owner reads his firm's statement only
do $$
declare v text := pg_temp.seen_as('00000000-0000-0000-0000-00000000f007');
begin
  if v <> 'st-g-y' then raise exception 'T7 FAIL: firm G owner sees [%]', v; end if;
end $$;

-- T8 a guest reads nothing and cannot run the helper
do $$
declare v text; denied boolean := false;
begin
  execute 'set role anon';
  select coalesce(string_agg(id, ','), '') into v from public.payments;
  begin
    perform public.firm_fee_statement_reader('33333333-0000-4000-8000-0000000000f1');
  exception when insufficient_privilege then denied := true;
  end;
  execute 'reset role';
  if v <> '' then raise exception 'T8 FAIL: anon sees [%]', v; end if;
  if not denied then raise exception 'T8 FAIL: anon ran firm_fee_statement_reader'; end if;
end $$;

-- T9 sessions can neither read nor write the national-ID tables
do $$
declare n int := 0;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000f004', false);
  execute 'set role authenticated';
  begin
    perform 1 from public.contract_party_national_ids;
  exception when insufficient_privilege then n := n + 1;
  end;
  begin
    insert into public.contract_party_national_ids (contract_id, author_user_id, id_hash)
    values ('k-l', '00000000-0000-0000-0000-00000000f004', repeat('a', 64));
  exception when insufficient_privilege then n := n + 1;
  end;
  begin
    perform 1 from public.contract_party_id_access_log;
  exception when insufficient_privilege then n := n + 1;
  end;
  begin
    insert into public.contract_party_id_access_log (contract_id, actor_user_id, action)
    values ('k-l', '00000000-0000-0000-0000-00000000f004', 'read');
  exception when insufficient_privilege then n := n + 1;
  end;
  execute 'reset role';
  perform set_config('test.uid', '', false);
  if n <> 4 then raise exception 'T9 FAIL: % of 4 session accesses were refused', n; end if;
  execute 'set role anon';
  begin
    perform 1 from public.contract_party_national_ids;
    execute 'reset role';
    raise exception 'T9 FAIL: anon read contract_party_national_ids';
  exception when insufficient_privilege then execute 'reset role';
  end;
end $$;

-- T10 service_role writes + reads; the CHECKs refuse a plain number; the log is append-only
do $$
declare refused int := 0; c int;
begin
  execute 'set role service_role';
  insert into public.contract_party_national_ids (contract_id, author_user_id, id_hash, ciphertext)
  values ('k-l', '00000000-0000-0000-0000-00000000f004', repeat('b', 64), 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBA==:Q0RFRg==');
  insert into public.contract_party_id_access_log (contract_id, actor_user_id, action, outcome)
  values ('k-l', '00000000-0000-0000-0000-00000000f004', 'set', 'ok'),
         ('k-l', '00000000-0000-0000-0000-00000000f004', 'read', 'ok');
  begin
    update public.contract_party_national_ids set id_hash = '1234567890' where contract_id = 'k-l';
  exception when check_violation then refused := refused + 1;
  end;
  begin
    update public.contract_party_national_ids set ciphertext = '1234567890' where contract_id = 'k-l';
  exception when check_violation then refused := refused + 1;
  end;
  begin
    update public.contract_party_id_access_log set outcome = 'refused';
  exception when insufficient_privilege then refused := refused + 1;
  end;
  begin
    delete from public.contract_party_id_access_log;
  exception when insufficient_privilege then refused := refused + 1;
  end;
  select count(*) into c from public.contract_party_id_access_log where contract_id = 'k-l';
  execute 'reset role';
  if refused <> 4 then raise exception 'T10 FAIL: % of 4 bad writes were refused', refused; end if;
  if c <> 2 then raise exception 'T10 FAIL: service_role reads % log rows, expected 2', c; end if;
end $$;

-- T11 the ID row goes with its contract; the log stays
do $$
declare ids int; logs int;
begin
  delete from public.contracts where id = 'k-l';
  select count(*) into ids from public.contract_party_national_ids where contract_id = 'k-l';
  select count(*) into logs from public.contract_party_id_access_log where contract_id = 'k-l';
  if ids <> 0 then raise exception 'T11 FAIL: the national-ID row outlived its contract'; end if;
  if logs <> 2 then raise exception 'T11 FAIL: the access log lost rows (%)', logs; end if;
end $$;

select 'l11_firm_statements_party_ids: ALL PASS (T0–T11)' as result;
