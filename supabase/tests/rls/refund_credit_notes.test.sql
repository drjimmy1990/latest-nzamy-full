-- refund_credit_notes.test.sql — proves 20261127_30 (batch l7, decision 10: a
-- VAT credit note for every refund / void of a platform payment) and its
-- _verify section.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The
-- migration runs TWICE with stray grants put back between the runs; the
-- _verify section runs before the migration (it must answer false without an
-- error) and after the second run. From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l7_refund_block.sql
--   sed -n '/^-- >>> verify:l7_refund/,/^-- <<< verify:l7_refund/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261022_10_payments_core.sql \
--     $R/prelude_refund_credit_notes_before.sql \
--     "$B" \
--     $M/20261127_30_refund_credit_notes.sql \
--     $R/prelude_refund_credit_notes_between_runs.sql \
--     $M/20261127_30_refund_credit_notes.sql \
--     "$B" \
--     $R/refund_credit_notes.test.sql
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261127_30
-- files and the between-runs prelude → "T0 FAIL: … missing".

do $$ begin
  if to_regclass('public.payment_credit_notes') is null or to_regprocedure('public.issue_payment_credit_note(uuid)') is null then
    raise exception 'T0 FAIL: payment_credit_notes / issue_payment_credit_note missing (20261127_30 not applied)';
  end if;
end $$;

-- T1 the backfill: the refunded and the voided platform orders, nothing else
do $$ declare r record; n int; begin
  select count(*) into n from public.payment_credit_notes;
  if n <> 2 then raise exception 'T1 FAIL: expected 2 backfilled notes, got %', n; end if;
  select * into r from public.payment_credit_notes where order_id = '00000000-0000-0000-0000-00000000fc01';
  if r.method <> 'refund' or r.invoice_number <> 'NZ-2026-000101' or r.total_halalas <> 344540 or r.vat_halalas <> 44940
     or r.net_halalas <> 299600 or r.issued_at <> '2026-11-20 10:00+03'::timestamptz or r.invoice_issued_at <> '2026-11-19 09:00+03'::timestamptz
     or r.live is not true or r.number !~ '^CN-2026-[0-9]{6,}$' then
    raise exception 'T1 FAIL: the refund note is wrong: %', to_jsonb(r);
  end if;
  select * into r from public.payment_credit_notes where order_id = '00000000-0000-0000-0000-00000000fc02';
  if r.method <> 'void' or r.live is not false then raise exception 'T1 FAIL: the void note is wrong: %', to_jsonb(r); end if;
  if (select number from public.payment_credit_notes where order_id = '00000000-0000-0000-0000-00000000fc01')
     >= (select number from public.payment_credit_notes where order_id = '00000000-0000-0000-0000-00000000fc02') then
    raise exception 'T1 FAIL: the backfill is not in refunded_at order';
  end if;
  raise notice 'refund_credit_notes: T0-T1 PASS';
end $$;

-- T2 idempotent: the same order returns the same note (second migration run included)
do $$ declare a jsonb; b jsonb; begin
  a := public.issue_payment_credit_note('00000000-0000-0000-0000-00000000fc01');
  b := public.issue_payment_credit_note('00000000-0000-0000-0000-00000000fc01');
  if a ->> 'number' <> b ->> 'number' or (b ->> 'duplicate')::boolean is not true then raise exception 'T2 FAIL: not idempotent: % / %', a, b; end if;
  if (select count(*) from public.payment_credit_notes) <> 2 then raise exception 'T2 FAIL: a second note was issued'; end if;
  raise notice 'refund_credit_notes: T2 PASS';
end $$;

-- T3 refusals: a paid order, an office order, no receipt number, a partial refund, a missing order
do $$ declare v_id uuid; begin
  foreach v_id in array array['00000000-0000-0000-0000-00000000fc04','00000000-0000-0000-0000-00000000fc03','00000000-0000-0000-0000-00000000fc05','00000000-0000-0000-0000-00000000ffff']::uuid[] loop
    begin
      perform public.issue_payment_credit_note(v_id);
      raise exception 'T3 FAIL: a note was issued for %', v_id;
    exception when invalid_parameter_value then null; end;
  end loop;
  update public.payment_orders set status = 'refunded', refunded_halalas = 1000, refunded_at = now() where id = '00000000-0000-0000-0000-00000000fc04';
  begin
    perform public.issue_payment_credit_note('00000000-0000-0000-0000-00000000fc04');
    raise exception 'T3 FAIL: a partial refund got a note';
  exception when invalid_parameter_value then null; end;
  raise notice 'refund_credit_notes: T3 PASS';
end $$;

-- T4 a new refund after the migration: a new, higher number dated at refunded_at
do $$ declare a jsonb; begin
  update public.payment_orders set refunded_halalas = total_halalas, refunded_at = '2026-11-23 08:00+03' where id = '00000000-0000-0000-0000-00000000fc04';
  a := public.issue_payment_credit_note('00000000-0000-0000-0000-00000000fc04');
  if (a ->> 'duplicate')::boolean or a ->> 'method' <> 'refund' or (a ->> 'issued_at')::timestamptz <> '2026-11-23 08:00+03'::timestamptz
     or a ->> 'number' <= (select number from public.payment_credit_notes where order_id = '00000000-0000-0000-0000-00000000fc02') then
    raise exception 'T4 FAIL: %', a;
  end if;
  raise notice 'refund_credit_notes: T4 PASS';
end $$;

-- T5 RLS: the buyer reads his own notes, another user none, nobody writes or issues
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000c0101', false) is not null as as_buyer;
do $$ begin
  if (select count(*) from public.payment_credit_notes) <> 3 then raise exception 'T5 FAIL: the buyer does not see his 3 notes'; end if;
  begin
    insert into public.payment_credit_notes (number, order_id, invoice_number, invoice_issued_at, item_id, method, net_halalas, vat_halalas, total_halalas, live)
      values ('CN-FAKE', '00000000-0000-0000-0000-00000000fc05', 'x', now(), 'x', 'refund', 1, 0, 1, true);
    raise exception 'T5 FAIL: a session inserted a credit note';
  exception when insufficient_privilege then null; end;
  begin
    perform public.issue_payment_credit_note('00000000-0000-0000-0000-00000000fc05');
    raise exception 'T5 FAIL: a session executed issue_payment_credit_note';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000c0102', false) is not null as as_other;
do $$ begin
  if (select count(*) from public.payment_credit_notes) <> 0 then raise exception 'T5 FAIL: another user sees credit notes'; end if;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    perform 1 from public.payment_credit_notes;
    raise exception 'T6 FAIL: a guest read payment_credit_notes';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin raise notice 'refund_credit_notes: T5-T6 PASS'; end $$;
