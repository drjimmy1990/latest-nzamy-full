-- invoice_links.test.sql — proves 20261124_40 (owner package 13-Nov, N01-9 /
-- N01-10): an office invoice is ONE payments row with no placeholder
-- «فاتورة: …» case; it carries owner_user_id / lawyer_client_id / firm_id /
-- contract_id; its owner (and only its owner) reads it and collects on it; a
-- foreign contract is refused; the v1 function still works.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). The _verify block runs before it (must
-- only NOTICE) and after (must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l3_contracts.sql
--   sed -n '/^-- >>> verify:l3_contracts/,/^-- <<< verify:l3_contracts/p' $M/_verify.sql | tr -d '\r' > "$B"
--   bash $R/run.sh \
--     $R/prelude_invoice_payments_live.sql \
--     $R/prelude_lawyer_clients_min.sql \
--     $R/prelude_contracts_min.sql \
--     $M/20261030_10_invoice_collections_atomic.sql \
--     $M/20261030_20_create_invoice_atomic.sql \
--     "$B" \
--     $M/20261124_40_invoice_links.sql \
--     $M/20261124_40_invoice_links.sql \
--     "$B" \
--     $R/invoice_links.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261124_40
-- files and the second verify block → "T0 FAIL".
--
-- Actors: A …a001 (lawyer, active member of firm F), B …a002 (another lawyer).

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.create_lawyer_invoice_v2(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)') is null then
    raise exception 'T0 FAIL: create_lawyer_invoice_v2 does not exist (20261124_40 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-00000000a001', 'lawyer'),
  ('00000000-0000-0000-0000-00000000a002', 'lawyer');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('22222222-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'مكتب أ');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('22222222-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000a001', 'managing_partner', 'active');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('c-mine',  '00000000-0000-0000-0000-00000000a001', 'قضية أ', '00000000-0000-0000-0000-00000000a001'),
  ('c-other', '00000000-0000-0000-0000-00000000a002', 'قضية ب', '00000000-0000-0000-0000-00000000a002');
insert into public.lawyer_clients (id, owner_user_id, client_type, name) values
  ('11111111-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'company',    'شركة الموكّل'),
  ('11111111-0000-4000-8000-00000000c003', '00000000-0000-0000-0000-00000000a001', 'individual', 'موكّل آخر'),
  ('11111111-0000-4000-8000-00000000c002', '00000000-0000-0000-0000-00000000a002', 'individual', 'موكّل زميل');
insert into public.contracts (id, owner_user_id, lawyer_client_id, title) values
  ('k-mine',  '00000000-0000-0000-0000-00000000a001', '11111111-0000-4000-8000-00000000c001', 'عقد أتعاب أ'),
  ('k-other', '00000000-0000-0000-0000-00000000a002', '11111111-0000-4000-8000-00000000c002', 'عقد ب');

create function pg_temp.counts(out reqs int, out pays int) language sql as $$
  select (select count(*)::int from public.service_requests), (select count(*)::int from public.payments)
$$;

create function pg_temp.mk2(
  actor uuid, k text, halalas bigint,
  cname text default 'عميل نصي', ctype text default 'individual', card uuid default null,
  case_id text default null, req text default null, ctitle text default null, contract text default null)
returns jsonb language sql as $$
  select public.create_lawyer_invoice_v2(actor, k, halalas, cname, ctype, card, case_id, req, 'أتعاب', 'full', ctitle, contract)
$$;

-- T1 a typed client, no case: ONE row, no placeholder; owner + firm stamped
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0001', 100000);
  select * into after from pg_temp.counts();
  if r ->> 'code' <> 'ok' then raise exception 'T1 FAIL: %', r; end if;
  if after.reqs <> before.reqs or after.pays <> before.pays + 1 then
    raise exception 'T1 FAIL: rows % → % (a placeholder case was written)', before, after;
  end if;
  if r -> 'payment' ->> 'request_id' is not null
     or r -> 'payment' ->> 'owner_user_id' <> '00000000-0000-0000-0000-00000000a001'
     or r -> 'payment' ->> 'firm_id' <> '22222222-0000-4000-8000-0000000000f1'
     or r -> 'payment' ->> 'lawyer_client_id' is not null
     or r -> 'payment' -> 'metadata' ->> 'client' <> 'عميل نصي' then
    raise exception 'T1 FAIL: invoice %', r -> 'payment';
  end if;
end $$;

-- T2 the same form again → the same invoice, nothing written; another contract → key_reused
do $$
declare r jsonb; before record; after record; first_id text;
begin
  select id into first_id from public.payments where metadata ->> 'create_key' = 'links-0001';
  select * into before from pg_temp.counts();
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0001', 100000);
  select * into after from pg_temp.counts();
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean is not true or r -> 'payment' ->> 'id' <> first_id then
    raise exception 'T2 FAIL: %', r;
  end if;
  if after <> before then raise exception 'T2 FAIL: rows % → %', before, after; end if;
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0001', 100000, contract => 'k-mine');
  if r ->> 'code' <> 'key_reused' then raise exception 'T2 FAIL: other contract → %', r; end if;
end $$;

-- T3 from a contract: its client card becomes the invoice's client; contract + card stamped
do $$
declare r jsonb;
begin
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0002', 250000, cname => null, ctype => null, contract => 'k-mine');
  if r ->> 'code' <> 'ok' then raise exception 'T3 FAIL: %', r; end if;
  if r -> 'payment' ->> 'contract_id' <> 'k-mine'
     or r -> 'payment' ->> 'lawyer_client_id' <> '11111111-0000-4000-8000-00000000c001'
     or r -> 'payment' -> 'metadata' ->> 'client' <> 'شركة الموكّل'
     or r -> 'payment' -> 'metadata' ->> 'clientType' <> 'company'
     or r -> 'payment' -> 'metadata' ->> 'contractTitle' <> 'عقد أتعاب أ'
     or r -> 'payment' ->> 'request_id' is not null then
    raise exception 'T3 FAIL: %', r -> 'payment';
  end if;
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0003', 1000, card => '11111111-0000-4000-8000-00000000c001',
                   case_id => 'c-mine', contract => 'k-mine');
  if r ->> 'code' <> 'ok' or r -> 'payment' -> 'metadata' ->> 'caseId' <> 'c-mine' or r -> 'payment' ->> 'request_id' is not null then
    raise exception 'T3 FAIL: card + case → %', r;
  end if;
end $$;

-- T4 refusals write nothing: a foreign / missing contract (forbidden), a card
--    that is not the contract's (invalid), a foreign card, a foreign case
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0004', 1000, contract => 'k-other');
  if r <> '{"code": "forbidden"}'::jsonb then raise exception 'T4 FAIL: foreign contract → %', r; end if;
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0005', 1000, contract => 'k-missing');
  if r <> '{"code": "forbidden"}'::jsonb then raise exception 'T4 FAIL: missing contract → %', r; end if;
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0006', 1000, card => '11111111-0000-4000-8000-00000000c003', contract => 'k-mine');
  if r ->> 'code' <> 'invalid' then raise exception 'T4 FAIL: other card on the contract → %', r; end if;
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0007', 1000, card => '11111111-0000-4000-8000-00000000c002');
  if r ->> 'code' <> 'forbidden' then raise exception 'T4 FAIL: foreign card → %', r; end if;
  r := pg_temp.mk2('00000000-0000-0000-0000-00000000a001', 'links-0008', 1000, case_id => 'c-other');
  if r ->> 'code' <> 'forbidden' then raise exception 'T4 FAIL: foreign case → %', r; end if;
  select * into after from pg_temp.counts();
  if after <> before then raise exception 'T4 FAIL: rows % → %', before, after; end if;
end $$;

-- T5 v1 still works for the code deployed before this batch (placeholder + row)
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := public.create_lawyer_invoice('00000000-0000-0000-0000-00000000a001', 'links-v1-01', 5000,
         'عميل قديم', 'individual', null, null, null, 'أتعاب', 'full', null);
  select * into after from pg_temp.counts();
  if r ->> 'code' <> 'ok' or after.reqs <> before.reqs + 1 or after.pays <> before.pays + 1 then
    raise exception 'T5 FAIL: v1 % rows % → %', r, before, after;
  end if;
end $$;

-- T6 collecting on an invoice with no request: the owner can, another lawyer cannot
do $$
declare r jsonb; pid text;
begin
  select id into pid from public.payments where metadata ->> 'create_key' = 'links-0001';
  r := public.record_invoice_collection(pid, '00000000-0000-0000-0000-00000000a002', 1000, 'cash', 0, 'coll-b-0001');
  if r <> '{"code": "forbidden"}'::jsonb then raise exception 'T6 FAIL: other lawyer → %', r; end if;
  r := public.record_invoice_collection(pid, '00000000-0000-0000-0000-00000000a001', 40000, 'cash', 0, 'coll-a-0001');
  if r ->> 'code' <> 'ok' or (r ->> 'paid_halalas')::bigint <> 40000 or (r ->> 'remaining_halalas')::bigint <> 60000 then
    raise exception 'T6 FAIL: owner → %', r;
  end if;
  select id into pid from public.payments where metadata ->> 'create_key' = 'links-v1-01';
  r := public.record_invoice_collection(pid, '00000000-0000-0000-0000-00000000a002', 100, 'cash', 0, 'coll-b-0002');
  if r <> '{"code": "forbidden"}'::jsonb then raise exception 'T6 FAIL: v1 invoice, other lawyer → %', r; end if;
end $$;

-- T7 only the server issues; signed-in reads: A sees his request-less invoices
--    and their ledger, B sees none
revoke all on public.invoice_collections from app_user;
grant select on public.invoice_collections to app_user;
do $$
begin
  if has_function_privilege('authenticated', 'public.create_lawyer_invoice_v2(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_lawyer_invoice_v2(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'T7 FAIL: anon/authenticated can EXECUTE create_lawyer_invoice_v2';
  end if;
end $$;

set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a001', false);
do $$
declare n int; c int;
begin
  select count(*) into n from public.payments where request_id is null;
  if n <> 3 then raise exception 'T7 FAIL: A reads % request-less invoices, expected 3', n; end if;
  select count(*) into c from public.invoice_collections;
  if c <> 1 then raise exception 'T7 FAIL: A reads % ledger rows, expected 1', c; end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a002', false);
do $$
declare n int; c int;
begin
  select count(*) into n from public.payments;
  if n <> 0 then raise exception 'T7 FAIL: B reads % of the other lawyer''s invoices', n; end if;
  select count(*) into c from public.invoice_collections;
  if c <> 0 then raise exception 'T7 FAIL: B reads % of the other lawyer''s ledger rows', c; end if;
end $$;
reset role;
select set_config('test.uid', '', false);

select 'invoice_links: ALL PASS' as result;
