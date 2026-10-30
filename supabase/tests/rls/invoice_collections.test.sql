-- invoice_collections.test.sql — proves 20261030_10 (owner handoff
-- 2026-10-30, CODE-F02 / LIVE-F36): public.record_invoice_collection adds one
-- payment under a row lock, refuses a stale form and an overpayment, answers a
-- repeated form once, and only the server can call it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (it must be re-runnable). The _verify block runs before it (must
-- only NOTICE) and after (must pass). From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_invoice_collections_block.sql
--   sed -n '/^-- >>> verify:invoice_collections/,/^-- <<< verify:invoice_collections/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $R/prelude_invoice_payments_live.sql \
--     "$B" \
--     $M/20261030_10_invoice_collections_atomic.sql \
--     $M/20261030_10_invoice_collections_atomic.sql \
--     "$B" \
--     $R/invoice_collections.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261030_10
-- files and the second verify block → "T0 FAIL: record_invoice_collection
-- does not exist".
--
-- Actors: A …a001 (the lawyer the invoices are assigned to), B …a002 (another
-- lawyer). Invoice p1 is the owner's 427ca382 case: 1000 total, 450 paid.
-- Every assertion RAISES on failure.

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.record_invoice_collection(text,uuid,bigint,text,bigint,text)') is null then
    raise exception 'T0 FAIL: record_invoice_collection does not exist (20261030_10 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
insert into auth.users values
  ('00000000-0000-0000-0000-00000000a001'),
  ('00000000-0000-0000-0000-00000000a002');
insert into public.service_requests (id, requester_user_id, title, assigned_to) values
  ('r1', '00000000-0000-0000-0000-00000000a001', 'فاتورة: أ', '00000000-0000-0000-0000-00000000a001'),
  ('r2', '00000000-0000-0000-0000-00000000a001', 'فاتورة: ب', '00000000-0000-0000-0000-00000000a001'),
  ('r3', '00000000-0000-0000-0000-00000000a001', 'فاتورة: ج', '00000000-0000-0000-0000-00000000a001');
insert into public.payments (id, request_id, provider, amount, status, metadata) values
  ('p1', 'r1', 'manual', 1000, 'requires_payment', '{"invoice": true, "client": "أ", "paidAmount": 450}'),
  -- the old page added floats in the browser; a stored total may carry noise
  ('p2', 'r2', 'manual', 1000, 'requires_payment', '{"invoice": true, "paidAmount": 750.0000000004}'),
  ('p3', 'r3', 'manual', 1000, 'requires_payment', '{"invoice": true, "paidAmount": 450}');

-- app_user stands in for authenticated: strip what stubs.sql's default
-- privileges gave it, so the read tests mean something
revoke all on public.invoice_collections from app_user;

-- helper (as postgres): the invoice's paid total and status, and its ledger count
create function pg_temp.state(p text, out paid numeric, out st text, out n int)
language sql as $$
  select (metadata ->> 'paidAmount')::numeric, status,
         (select count(*)::int from public.invoice_collections where payment_id = p)
    from public.payments where id = p
$$;

set role service_role;

-- T1 the owner's first form (opened at 450): 300 → 750 / 250
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 30000, 'cash', 45000, 'formA-0001');
  if r ->> 'code' <> 'ok' or (r ->> 'paid_halalas')::bigint <> 75000 or (r ->> 'remaining_halalas')::bigint <> 25000 then
    raise exception 'T1 FAIL: first form → %', r;
  end if;
  select * into s from pg_temp.state('p1');
  if s.paid <> 750 or s.st <> 'requires_payment' or s.n <> 1 then
    raise exception 'T1 FAIL: after first form paid=% status=% rows=%', s.paid, s.st, s.n;
  end if;
  if not exists (select 1 from public.invoice_collections where idempotency_key = 'formA-0001'
                  and amount = 300 and paid_before = 450 and paid_after = 750 and method = 'cash'
                  and collected_by = '00000000-0000-0000-0000-00000000a001') then
    raise exception 'T1 FAIL: the ledger row does not record 450 → 750';
  end if;
  if (r -> 'payment' -> 'metadata' ->> 'client') <> 'أ' then
    raise exception 'T1 FAIL: other metadata keys were not kept: %', r -> 'payment' -> 'metadata';
  end if;
end $$;

-- T2 the owner's second form (still showing 450) saves 400 → refused as stale;
--    before the fix this was accepted and gave 850 / 150
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 40000, 'cash', 45000, 'formB-0001');
  if r ->> 'code' <> 'stale' or (r ->> 'paid_halalas')::bigint <> 75000 or (r ->> 'remaining_halalas')::bigint <> 25000 then
    raise exception 'T2 FAIL: stale second form → %', r;
  end if;
  select * into s from pg_temp.state('p1');
  if s.paid <> 750 or s.n <> 1 then
    raise exception 'T2 FAIL: a refused form changed the invoice: paid=% rows=%', s.paid, s.n;
  end if;
end $$;

-- T3 the same stale form with an amount that WOULD fit (200 ≤ 250) is still
--    refused — the snapshot check, not only the balance check
do $$
declare r jsonb;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 20000, 'cash', 45000, 'formB-0002');
  if r ->> 'code' <> 'stale' then
    raise exception 'T3 FAIL: stale form under the remainder → %', r;
  end if;
end $$;

-- T4 a fresh form (showing 750) asks for 300 with 250 left → exceeds_remaining
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 30000, 'bank_transfer', 75000, 'formC-0001');
  if r ->> 'code' <> 'exceeds_remaining' or (r ->> 'remaining_halalas')::bigint <> 25000 then
    raise exception 'T4 FAIL: overpayment → %', r;
  end if;
  select * into s from pg_temp.state('p1');
  if s.paid <> 750 or s.n <> 1 then
    raise exception 'T4 FAIL: a refused overpayment changed the invoice: paid=% rows=%', s.paid, s.n;
  end if;
end $$;

-- T5 the first form submitted again (retry / double click) → its first answer,
--    nothing added
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 30000, 'cash', 45000, 'formA-0001');
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean is not true then
    raise exception 'T5 FAIL: replay → %', r;
  end if;
  select * into s from pg_temp.state('p1');
  if s.paid <> 750 or s.n <> 1 then
    raise exception 'T5 FAIL: a replay added money: paid=% rows=%', s.paid, s.n;
  end if;
end $$;

-- T6 the same key with another amount, or on another invoice → key_reused
do $$
declare r jsonb;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 10000, 'cash', 75000, 'formA-0001');
  if r ->> 'code' <> 'key_reused' then raise exception 'T6 FAIL: other amount → %', r; end if;
  r := public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 30000, 'cash', 45000, 'formA-0001');
  if r ->> 'code' <> 'key_reused' then raise exception 'T6 FAIL: other invoice → %', r; end if;
end $$;

-- T7 another lawyer → forbidden, nothing written; an unknown invoice → not_found
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a002', 100, 'cash', 75000, 'formX-0001');
  if r ->> 'code' <> 'forbidden' or r ? 'paid_halalas' then
    raise exception 'T7 FAIL: foreign lawyer → % (must not reveal the amounts)', r;
  end if;
  select * into s from pg_temp.state('p1');
  if s.paid <> 750 or s.n <> 1 then raise exception 'T7 FAIL: foreign call changed the invoice'; end if;
  r := public.record_invoice_collection('nope', '00000000-0000-0000-0000-00000000a001', 100, 'cash', 0, 'formY-0001');
  if r ->> 'code' <> 'not_found' then raise exception 'T7 FAIL: unknown invoice → %', r; end if;
end $$;

-- T8 the remaining 250 → paid in full; then the invoice is closed to new
--    payments, while the settling form's replay still answers ok
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 25000, 'bank_transfer', 75000, 'formD-0001');
  if r ->> 'code' <> 'ok' or (r ->> 'remaining_halalas')::bigint <> 0 then raise exception 'T8 FAIL: settle → %', r; end if;
  select * into s from pg_temp.state('p1');
  if s.paid <> 1000 or s.st <> 'paid' or s.n <> 2 then
    raise exception 'T8 FAIL: after settling paid=% status=% rows=%', s.paid, s.st, s.n;
  end if;
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 100, 'cash', 100000, 'formE-0001');
  if r ->> 'code' <> 'not_collectable' then raise exception 'T8 FAIL: paid invoice took more → %', r; end if;
  r := public.record_invoice_collection('p1', '00000000-0000-0000-0000-00000000a001', 25000, 'bank_transfer', 75000, 'formD-0001');
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean is not true then raise exception 'T8 FAIL: settle replay → %', r; end if;
end $$;

-- T9 float noise from the old page (750.0000000004) does not lock the invoice;
--    the new total is written to the halala
do $$
declare r jsonb; s record;
begin
  r := public.record_invoice_collection('p2', '00000000-0000-0000-0000-00000000a001', 25000, 'cash', 75000, 'noise-0001');
  if r ->> 'code' <> 'ok' then raise exception 'T9 FAIL: noisy total → %', r; end if;
  select * into s from pg_temp.state('p2');
  if s.paid <> 1000 or s.st <> 'paid' then raise exception 'T9 FAIL: paid=% status=%', s.paid, s.st; end if;
end $$;

-- T10 bad input → invalid, nothing written
do $$
declare r jsonb;
begin
  r := public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 0, 'cash', 45000, 'bad-00001');
  if r ->> 'code' <> 'invalid' then raise exception 'T10 FAIL: zero → %', r; end if;
  r := public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 100, 'card', 45000, 'bad-00002');
  if r ->> 'code' <> 'invalid' then raise exception 'T10 FAIL: card → %', r; end if;
  r := public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 100, 'cash', null, 'bad-00003');
  if r ->> 'code' <> 'invalid' then raise exception 'T10 FAIL: no snapshot → %', r; end if;
  r := public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 100, 'cash', 45000, 'short');
  if r ->> 'code' <> 'invalid' then raise exception 'T10 FAIL: short key → %', r; end if;
end $$;

reset role;

-- T11 only the server: a signed-in session cannot call the function or write
--     the ledger, and reads only its own invoices' rows
do $$
begin
  if has_function_privilege('authenticated', 'public.record_invoice_collection(text,uuid,bigint,text,bigint,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_invoice_collection(text,uuid,bigint,text,bigint,text)', 'EXECUTE') then
    raise exception 'T11 FAIL: anon/authenticated can EXECUTE record_invoice_collection';
  end if;
end $$;

set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a001', false);
do $$
declare n int;
begin
  begin
    perform public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 100, 'cash', 45000, 'direct-0001');
    raise exception 'T11 FAIL: a signed-in session called record_invoice_collection';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.invoice_collections;
  if n <> 3 then raise exception 'T11 FAIL: lawyer A reads % ledger rows, expected 3', n; end if;
  begin
    insert into public.invoice_collections (payment_id, amount, method, paid_before, paid_after, idempotency_key)
    values ('p3', 1, 'cash', 450, 451, 'forged-0001');
    raise exception 'T11 FAIL: a signed-in session wrote the ledger';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-00000000a002', false);
do $$
declare n int;
begin
  select count(*) into n from public.invoice_collections;
  if n <> 0 then raise exception 'T11 FAIL: lawyer B reads % of lawyer A''s ledger rows', n; end if;
end $$;
reset role;
select set_config('test.uid', '', false);

-- T12 the race itself, on two real connections: form A holds the invoice
--     locked in an open transaction; form B (same 450 snapshot) is sent on a
--     second connection and must WAIT, then be refused as stale once A commits
create extension if not exists dblink;
begin;
-- (as postgres on both connections: the lock is the same for any caller)
do $$
declare r jsonb;
begin
  r := public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 30000, 'cash', 45000, 'raceA-0001');
  if r ->> 'code' <> 'ok' then raise exception 'T12 FAIL: form A → %', r; end if;
end $$;
select dblink_connect('race', 'dbname=' || current_database() || ' user=postgres');
select dblink_send_query('race',
  $q$select public.record_invoice_collection('p3', '00000000-0000-0000-0000-00000000a001', 40000, 'cash', 45000, 'raceB-0001')::text$q$);
select pg_sleep(1);
do $$
begin
  if not exists (select 1 from pg_stat_activity
                  where query like '%raceB-0001%' and wait_event_type = 'Lock'
                    and pid <> pg_backend_pid()) then
    raise exception 'T12 FAIL: form B did not wait on the invoice lock';
  end if;
end $$;
commit;
do $$
declare r text; s record;
begin
  select t.r into r from dblink_get_result('race') as t(r text);
  if r is null or (r::jsonb ->> 'code') <> 'stale' then
    raise exception 'T12 FAIL: form B after the race → %', r;
  end if;
  select * into s from pg_temp.state('p3');
  if s.paid <> 750 or s.n <> 1 then
    raise exception 'T12 FAIL: after the race paid=% rows=% (expected 750 / 1 — the first payment kept)', s.paid, s.n;
  end if;
end $$;
select dblink_disconnect('race');

do $$ begin raise notice 'invoice_collections: all assertions passed (T0–T12)'; end $$;
