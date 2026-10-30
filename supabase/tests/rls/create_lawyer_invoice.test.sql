-- create_lawyer_invoice.test.sql — proves 20261030_20 (owner handoff
-- 2026-10-30, CODE-F22, CODE-F01, CODE-F21 scoped to finance):
-- public.create_lawyer_invoice issues the placeholder request and the invoice
-- in ONE transaction, once per form key, after checking that the request, the
-- case and the CRM card belong to the caller — and a refusal writes nothing.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). The _verify block runs before it (must
-- only NOTICE) and after (must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_create_lawyer_invoice_block.sql
--   sed -n '/^-- >>> verify:create_lawyer_invoice/,/^-- <<< verify:create_lawyer_invoice/p' $M/_verify.sql | tr -d '\r' > "$B"
--   bash $R/run.sh \
--     $R/prelude_invoice_payments_live.sql \
--     $R/prelude_lawyer_clients_min.sql \
--     "$B" \
--     $M/20261030_20_create_invoice_atomic.sql \
--     $M/20261030_20_create_invoice_atomic.sql \
--     "$B" \
--     $R/create_lawyer_invoice.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261030_20
-- files and the second verify block → "T0 FAIL".
--
-- Actors: A …a001 (the lawyer), B …a002 (another lawyer). Every assertion
-- RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)') is null then
    raise exception 'T0 FAIL: create_lawyer_invoice does not exist (20261030_20 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('r-mine',  '00000000-0000-0000-0000-00000000a001', 'طلب أ',           '00000000-0000-0000-0000-00000000a001'),
  ('r-other', '00000000-0000-0000-0000-00000000a002', 'طلب ب',           '00000000-0000-0000-0000-00000000a002'),
  ('c-mine',  '00000000-0000-0000-0000-00000000a001', 'قضية عمالية — أ', '00000000-0000-0000-0000-00000000a001'),
  ('c-other', '00000000-0000-0000-0000-00000000a002', 'قضية ب',          '00000000-0000-0000-0000-00000000a002');
insert into public.lawyer_clients (id, owner_user_id, client_type, name) values
  ('11111111-0000-4000-8000-00000000c001', '00000000-0000-0000-0000-00000000a001', 'individual', 'محمد الموكّل'),
  ('11111111-0000-4000-8000-00000000c002', '00000000-0000-0000-0000-00000000a002', 'company',    'شركة زميل');

create function pg_temp.counts(out reqs int, out pays int) language sql as $$
  select (select count(*)::int from public.service_requests), (select count(*)::int from public.payments)
$$;

-- one call with defaults for the fields a test does not care about
create function pg_temp.mk(
  actor uuid, k text, halalas bigint,
  cname text default 'عميل نصي', ctype text default 'individual', card uuid default null,
  case_id text default null, req text default null, ctitle text default null)
returns jsonb language sql as $$
  select public.create_lawyer_invoice(actor, k, halalas, cname, ctype, card, case_id, req, 'أتعاب', 'full', ctitle)
$$;

-- T1 a typed client: one placeholder + one invoice, the type as chosen
do $$
declare r jsonb; before record; after record; req jsonb;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0001', 100000, 'عميل نصي', 'individual');
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean then raise exception 'T1 FAIL: %', r; end if;
  select * into after from pg_temp.counts();
  if after.reqs <> before.reqs + 1 or after.pays <> before.pays + 1 then
    raise exception 'T1 FAIL: rows % → %', before, after;
  end if;
  if r -> 'payment' -> 'metadata' ->> 'clientType' <> 'individual'
     or (r -> 'payment' ->> 'amount')::numeric <> 1000
     or r -> 'payment' -> 'metadata' ->> 'create_key' <> 'create-0001'
     or r -> 'payment' -> 'metadata' ->> 'issued_by' <> '00000000-0000-0000-0000-00000000a001'
     or r -> 'payment' ->> 'status' <> 'requires_payment' then
    raise exception 'T1 FAIL: invoice %', r -> 'payment';
  end if;
  select to_jsonb(sr) into req from public.service_requests sr where sr.id = r -> 'payment' ->> 'request_id';
  if req ->> 'assigned_to' <> '00000000-0000-0000-0000-00000000a001' or (req -> 'metadata' ->> 'invoice')::boolean is not true
     or req ->> 'lawyer_client_id' is not null or req ->> 'status' <> 'completed' then
    raise exception 'T1 FAIL: placeholder %', req;
  end if;
end $$;

-- T2 the same form again (lost response, retry, double click) → the same invoice
do $$
declare r jsonb; first_id text; before record; after record;
begin
  select id into first_id from public.payments where metadata ->> 'create_key' = 'create-0001';
  select * into before from pg_temp.counts();
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0001', 100000, 'عميل نصي', 'individual');
  select * into after from pg_temp.counts();
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean is not true or r -> 'payment' ->> 'id' <> first_id then
    raise exception 'T2 FAIL: replay → %', r;
  end if;
  if after <> before then raise exception 'T2 FAIL: a replay wrote rows % → %', before, after; end if;
end $$;

-- T3 the key with another amount, or from another lawyer → key_reused, nothing
--    written, and nothing about the first invoice revealed
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0001', 200000);
  if r ->> 'code' <> 'key_reused' then raise exception 'T3 FAIL: other amount → %', r; end if;
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a002', 'create-0001', 100000);
  if r ->> 'code' <> 'key_reused' or r ? 'payment' then raise exception 'T3 FAIL: other lawyer → %', r; end if;
  select * into after from pg_temp.counts();
  if after <> before then raise exception 'T3 FAIL: rows % → %', before, after; end if;
end $$;

-- T4 CODE-F01: someone else's request and a missing one → the same 'forbidden',
--    and not a single row written
do $$
declare a jsonb; b jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  a := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0002', 100000, req => 'r-other');
  b := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0003', 100000, req => 'r-missing');
  select * into after from pg_temp.counts();
  if a <> '{"code": "forbidden"}'::jsonb or b <> a then raise exception 'T4 FAIL: % / %', a, b; end if;
  if after <> before then raise exception 'T4 FAIL: a refused POST wrote rows % → %', before, after; end if;
end $$;

-- T5 another lawyer's CRM card, a missing card, another lawyer's case → forbidden, nothing written
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0004', 100000, card => '11111111-0000-4000-8000-00000000c002');
  if r ->> 'code' <> 'forbidden' then raise exception 'T5 FAIL: foreign card → %', r; end if;
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0005', 100000, card => '11111111-0000-4000-8000-00000000cfff');
  if r ->> 'code' <> 'forbidden' then raise exception 'T5 FAIL: missing card → %', r; end if;
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0006', 100000, case_id => 'c-other');
  if r ->> 'code' <> 'forbidden' then raise exception 'T5 FAIL: foreign case → %', r; end if;
  select * into after from pg_temp.counts();
  if after <> before then raise exception 'T5 FAIL: rows % → %', before, after; end if;
end $$;

-- T6 CODE-F21: the lawyer's own card — its name and type are the invoice's,
--    whatever the browser typed; the case is a reference with its real title;
--    the placeholder is NOT attached to the card (it is not a case)
do $$
declare r jsonb; req jsonb;
begin
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0007', 50000,
                  cname => 'اسم مزوّر', ctype => 'company', card => '11111111-0000-4000-8000-00000000c001',
                  case_id => 'c-mine', ctitle => 'عنوان مزوّر');
  if r ->> 'code' <> 'ok' then raise exception 'T6 FAIL: %', r; end if;
  if r -> 'payment' -> 'metadata' ->> 'client' <> 'محمد الموكّل'
     or r -> 'payment' -> 'metadata' ->> 'clientType' <> 'individual'
     or r -> 'payment' -> 'metadata' ->> 'clientId' <> '11111111-0000-4000-8000-00000000c001'
     or r -> 'payment' -> 'metadata' ->> 'caseId' <> 'c-mine'
     or r -> 'payment' -> 'metadata' ->> 'caseTitle' <> 'قضية عمالية — أ' then
    raise exception 'T6 FAIL: metadata %', r -> 'payment' -> 'metadata';
  end if;
  select to_jsonb(sr) into req from public.service_requests sr where sr.id = r -> 'payment' ->> 'request_id';
  if req ->> 'lawyer_client_id' is not null or req ->> 'id' = 'c-mine' then
    raise exception 'T6 FAIL: placeholder %', req;
  end if;
end $$;

-- T7 the lawyer's own request: no placeholder, the invoice hangs on it
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0008', 30000, req => 'r-mine');
  select * into after from pg_temp.counts();
  if r ->> 'code' <> 'ok' or r -> 'payment' ->> 'request_id' <> 'r-mine' then raise exception 'T7 FAIL: %', r; end if;
  if after.reqs <> before.reqs or after.pays <> before.pays + 1 then raise exception 'T7 FAIL: rows % → %', before, after; end if;
end $$;

-- T8 invalid input → nothing written
do $$
declare r jsonb; before record; after record;
begin
  select * into before from pg_temp.counts();
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0009', 100000, ctype => null);
  if r ->> 'code' <> 'invalid' then raise exception 'T8 FAIL: no type → %', r; end if;
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0010', 100000, cname => '  ');
  if r ->> 'code' <> 'invalid' then raise exception 'T8 FAIL: blank name → %', r; end if;
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0011', 0);
  if r ->> 'code' <> 'invalid' then raise exception 'T8 FAIL: zero → %', r; end if;
  r := pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'short', 100);
  if r ->> 'code' <> 'invalid' then raise exception 'T8 FAIL: short key → %', r; end if;
  select * into after from pg_temp.counts();
  if after <> before then raise exception 'T8 FAIL: rows % → %', before, after; end if;
end $$;

-- T9 both rows or neither: when the invoice insert fails, the placeholder
--    written just before it in the same call is rolled back with it
create function pg_temp.boom() returns trigger language plpgsql as $$
begin
  if new.metadata ->> 'client' = 'BOOM' then raise exception 'forced payments failure'; end if;
  return new;
end $$;
create trigger t_boom before insert on public.payments for each row execute function pg_temp.boom();
do $$
declare before record; after record; failed boolean := false;
begin
  select * into before from pg_temp.counts();
  begin
    perform pg_temp.mk('00000000-0000-0000-0000-00000000a001', 'create-0012', 100000, cname => 'BOOM');
  exception when others then failed := true;
  end;
  select * into after from pg_temp.counts();
  if not failed then raise exception 'T9 FAIL: the forced failure did not happen'; end if;
  if after <> before then raise exception 'T9 FAIL: an orphan placeholder survived % → %', before, after; end if;
end $$;
drop trigger t_boom on public.payments;

-- T10 only the server can call it
do $$
begin
  if has_function_privilege('authenticated', 'public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)', 'EXECUTE') then
    raise exception 'T10 FAIL: anon/authenticated can EXECUTE create_lawyer_invoice';
  end if;
end $$;
set role app_user;
do $$
begin
  perform public.create_lawyer_invoice('00000000-0000-0000-0000-00000000a001', 'direct-0001', 100, 'x', 'individual', null, null, null, null, null, null);
  raise exception 'T10 FAIL: a signed-in session called create_lawyer_invoice';
exception when insufficient_privilege then null;
end $$;
reset role;

-- T11 the race on two real connections: the same form key sent twice at once
--     → exactly one invoice and one placeholder; the second call waits on the
--     key lock and then answers with the first invoice
create extension if not exists dblink;
create table pg_temp.race_before as select * from pg_temp.counts();
begin;
do $$
declare r jsonb;
begin
  r := public.create_lawyer_invoice('00000000-0000-0000-0000-00000000a001', 'race-create-01', 70000, 'عميل السباق', 'company', null, null, null, null, null, null);
  if r ->> 'code' <> 'ok' then raise exception 'T11 FAIL: first call → %', r; end if;
end $$;
select dblink_connect('race', 'dbname=' || current_database() || ' user=postgres');
select dblink_send_query('race',
  $q$select public.create_lawyer_invoice('00000000-0000-0000-0000-00000000a001', 'race-create-01', 70000, 'عميل السباق', 'company', null, null, null, null, null, null)::text$q$);
select pg_sleep(1);
do $$
begin
  if not exists (select 1 from pg_stat_activity
                  where query like '%race-create-01%' and wait_event_type = 'Lock'
                    and pid <> pg_backend_pid()) then
    raise exception 'T11 FAIL: the second call did not wait on the key lock';
  end if;
end $$;
commit;
do $$
declare r text; b record; a record; n int;
begin
  select t.r into r from dblink_get_result('race') as t(r text);
  if r is null or (r::jsonb ->> 'code') <> 'ok' or (r::jsonb ->> 'replay')::boolean is not true then
    raise exception 'T11 FAIL: second call → %', r;
  end if;
  select * into b from pg_temp.race_before;
  select * into a from pg_temp.counts();
  if a.reqs <> b.reqs + 1 or a.pays <> b.pays + 1 then
    raise exception 'T11 FAIL: two calls with one key wrote % → % (expected one invoice, one placeholder)', b, a;
  end if;
  select count(*) into n from public.payments where metadata ->> 'create_key' = 'race-create-01';
  if n <> 1 then raise exception 'T11 FAIL: % invoices for one key', n; end if;
end $$;
select dblink_disconnect('race');

do $$ begin raise notice 'create_lawyer_invoice: all assertions passed (T0–T11)'; end $$;
