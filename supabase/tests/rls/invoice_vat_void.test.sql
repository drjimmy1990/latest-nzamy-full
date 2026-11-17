-- invoice_vat_void.test.sql — proves 20261126_30 (owner TODO 17-Nov N01-11 /
-- N01-14, owner decision Q484): VAT 15% only when the issuer has a VAT number
-- (firm → firm settings; lawyer → his vault), 0% otherwise, a malformed number
-- refuses the invoice; half-up rounding in halalas; amount = subtotal + VAT;
-- void only an unpaid office invoice of its owner, keeping the row; a void
-- invoice can never collect; sessions can neither write the VAT number nor
-- execute the functions.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 20261126_30
-- runs TWICE (it must be re-runnable). The _verify block runs after it. From
-- the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l6_invoice.sql
--   sed -n '/^-- >>> verify:l6_invoice/,/^-- <<< verify:l6_invoice/p' $M/_verify.sql | tr -d '\r' > "$B"
--   bash $R/run.sh \
--     $R/prelude_invoice_payments_live.sql \
--     $R/prelude_lawyer_clients_min.sql \
--     $R/prelude_contracts_min.sql \
--     $R/prelude_storage_objects_stub.sql $R/prelude_storage_buckets_stub.sql \
--     $M/20261026_63_branding_vault.sql \
--     $M/20261030_10_invoice_collections_atomic.sql \
--     $M/20261030_20_create_invoice_atomic.sql \
--     $M/20261124_40_invoice_links.sql \
--     $M/20261126_30_invoice_vat_void.sql \
--     $M/20261126_30_invoice_vat_void.sql \
--     "$B" \
--     $R/invoice_vat_void.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261126_30
-- files and the verify block → "T0 FAIL".
--
-- Actors: A …b001 (solo lawyer), B …b002 (lawyer, member of firm F),
--         C …b003 (another solo lawyer), D …b004 (solo lawyer, bad VAT number).

-- T0 precondition (the negative control stops here)
do $$
begin
  if to_regprocedure('public.create_lawyer_invoice_v3(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)') is null
     or to_regprocedure('public.void_lawyer_invoice(text,uuid,text)') is null then
    raise exception 'T0 FAIL: create_lawyer_invoice_v3 / void_lawyer_invoice do not exist (20261126_30 not applied)';
  end if;
end $$;

-- ── fixtures as postgres ────────────────────────────────────────────────────
-- prod's firm_profiles carries metadata (entity settings); the stub does not.
alter table public.firm_profiles add column if not exists metadata jsonb not null default '{}'::jsonb;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000b001'),
  ('00000000-0000-0000-0000-00000000b002'),
  ('00000000-0000-0000-0000-00000000b003'),
  ('00000000-0000-0000-0000-00000000b004');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000b001', 'lawyer', 'المحامي أ'),
  ('00000000-0000-0000-0000-00000000b002', 'lawyer', 'المحامي ب'),
  ('00000000-0000-0000-0000-00000000b003', 'lawyer', 'المحامي ج'),
  ('00000000-0000-0000-0000-00000000b004', 'lawyer', 'المحامي د');
insert into public.firm_profiles (id, owner_user_id, name_ar, metadata) values
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000b002', 'مكتب ب للمحاماة',
   '{"settings": {"vatNumber": "٣١٠١٢٣٤٥٦٧٨٩٠٠٣"}}');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('33333333-0000-4000-8000-0000000000f1', '00000000-0000-0000-0000-00000000b002', 'managing_partner', 'active');
-- A has a vault with a VAT number; C has a vault without one; D has no vault.
insert into public.branding_vaults (lawyer_user_id, display_name_ar, vat_number) values
  ('00000000-0000-0000-0000-00000000b001', 'مكتب المحامي أ', '300000000000003'),
  ('00000000-0000-0000-0000-00000000b003', '', null);

-- T1 the vault CHECK: a malformed number, or a number on a firm vault, is refused
do $$
begin
  begin
    insert into public.branding_vaults (lawyer_user_id, vat_number)
      values ('00000000-0000-0000-0000-00000000b004', '12345');
    raise exception 'T1 FAIL: a malformed VAT number was stored';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_vaults (firm_id, vat_number)
      values ('33333333-0000-4000-8000-0000000000f1', '300000000000003');
    raise exception 'T1 FAIL: a firm vault took a VAT number (two sources)';
  exception when check_violation then null;
  end;
end $$;

-- T2 the issuer and its VAT state
do $$
declare r jsonb;
begin
  r := public.invoice_issuer_vat('00000000-0000-0000-0000-00000000b001');
  if r ->> 'scope' <> 'lawyer' or r ->> 'state' <> 'registered' or r ->> 'vat_number' <> '300000000000003'
     or r ->> 'name' <> 'مكتب المحامي أ' then
    raise exception 'T2 FAIL: solo lawyer with a number → %', r;
  end if;
  r := public.invoice_issuer_vat('00000000-0000-0000-0000-00000000b002');
  if r ->> 'scope' <> 'firm' or r ->> 'state' <> 'registered' or r ->> 'vat_number' <> '310123456789003'
     or r ->> 'firm_id' <> '33333333-0000-4000-8000-0000000000f1' or r ->> 'name' <> 'مكتب ب للمحاماة' then
    raise exception 'T2 FAIL: firm member (Arabic digits in settings) → %', r;
  end if;
  r := public.invoice_issuer_vat('00000000-0000-0000-0000-00000000b003');
  if r ->> 'state' <> 'not_registered' or r ->> 'vat_number' is not null or r ->> 'name' <> 'المحامي ج' then
    raise exception 'T2 FAIL: vault without a number → %', r;
  end if;
  r := public.invoice_issuer_vat('00000000-0000-0000-0000-00000000b004');
  if r ->> 'state' <> 'not_registered' then
    raise exception 'T2 FAIL: no vault at all → %', r;
  end if;
end $$;

create function pg_temp.mk3(actor uuid, k text, halalas bigint)
returns jsonb language sql as $$
  select public.create_lawyer_invoice_v3(actor, k, halalas, 'عميل نصي', 'individual', null, null, null,
                                         'أتعاب', 'full', null, null)
$$;

-- T3 VAT 15% with a number: amount = subtotal + VAT; snapshot in metadata.vat
do $$
declare r jsonb; v jsonb;
begin
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b001', 'vat-a-0001', 100000);
  if r ->> 'code' <> 'ok' then raise exception 'T3 FAIL: %', r; end if;
  v := r -> 'payment' -> 'metadata' -> 'vat';
  if (r -> 'payment' ->> 'amount')::numeric <> 1150.00
     or (v ->> 'rate_bp')::int <> 1500 or (v ->> 'subtotal_halalas')::bigint <> 100000
     or (v ->> 'vat_halalas')::bigint <> 15000 or (v ->> 'total_halalas')::bigint <> 115000
     or v ->> 'vat_number' <> '300000000000003' or v ->> 'scope' <> 'lawyer' then
    raise exception 'T3 FAIL: %', r -> 'payment';
  end if;
  -- the firm member: the firm's number, the firm stamped
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b002', 'vat-b-0001', 33333);
  v := r -> 'payment' -> 'metadata' -> 'vat';
  if r ->> 'code' <> 'ok' or r -> 'payment' ->> 'firm_id' <> '33333333-0000-4000-8000-0000000000f1'
     or v ->> 'vat_number' <> '310123456789003' or (v ->> 'vat_halalas')::bigint <> 5000
     or (r -> 'payment' ->> 'amount')::numeric <> 383.33 then
    raise exception 'T3 FAIL: firm member → %', r -> 'payment';
  end if;
end $$;

-- T4 rounding parity with src/lib/finance/invoiceVat.ts (half-up per halala)
do $$
declare r jsonb; c record;
begin
  for c in select * from (values
      (1::bigint, 0::bigint), (3, 0), (4, 1), (10, 2), (33333, 5000), (99999, 15000), (100001, 15000))
      as t(sub, vat)
  loop
    r := pg_temp.mk3('00000000-0000-0000-0000-00000000b001', 'vat-round-' || c.sub, c.sub);
    if r ->> 'code' <> 'ok' or (r -> 'payment' -> 'metadata' -> 'vat' ->> 'vat_halalas')::bigint <> c.vat
       or (r -> 'payment' ->> 'amount')::numeric <> round((c.sub + c.vat)::numeric / 100, 2) then
      raise exception 'T4 FAIL: % halalas → %', c.sub, r;
    end if;
  end loop;
  -- the ceiling: a subtotal whose VAT pushes the total past numeric(12,2) is refused
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b001', 'vat-round-max', 999999999999);
  if r ->> 'code' <> 'invalid' then raise exception 'T4 FAIL: max subtotal + VAT → %', r; end if;
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b003', 'vat-round-max0', 999999999999);
  if r ->> 'code' <> 'ok' or (r -> 'payment' ->> 'amount')::numeric <> 9999999999.99 then
    raise exception 'T4 FAIL: max subtotal at 0%% → %', r;
  end if;
end $$;

-- T5 no number → 0% «غير خاضع»: amount = subtotal, rate 0, vat_number null
do $$
declare r jsonb; v jsonb;
begin
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b003', 'vat-c-0001', 100000);
  v := r -> 'payment' -> 'metadata' -> 'vat';
  if r ->> 'code' <> 'ok' or (r -> 'payment' ->> 'amount')::numeric <> 1000.00
     or (v ->> 'rate_bp')::int <> 0 or (v ->> 'vat_halalas')::bigint <> 0
     or jsonb_typeof(v -> 'vat_number') <> 'null' then
    raise exception 'T5 FAIL: %', r -> 'payment';
  end if;
end $$;

-- T6 a malformed number in the firm's settings refuses the invoice, writes nothing
do $$
declare r jsonb; n int; n2 int;
begin
  update public.firm_profiles set metadata = '{"settings": {"vatNumber": "12345"}}'
   where id = '33333333-0000-4000-8000-0000000000f1';
  select count(*) into n from public.payments;
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b002', 'vat-b-0002', 1000);
  select count(*) into n2 from public.payments;
  if r ->> 'code' <> 'vat_number_invalid' or n2 <> n then
    raise exception 'T6 FAIL: % (rows % → %)', r, n, n2;
  end if;
  update public.firm_profiles set metadata = '{"settings": {"vatNumber": "310123456789003"}}'
   where id = '33333333-0000-4000-8000-0000000000f1';
end $$;

-- T7 the same form again → the same invoice; v2 still issues (old code)
do $$
declare r jsonb; first_id text;
begin
  select id into first_id from public.payments where metadata ->> 'create_key' = 'vat-a-0001';
  r := pg_temp.mk3('00000000-0000-0000-0000-00000000b001', 'vat-a-0001', 100000);
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean is not true or r -> 'payment' ->> 'id' <> first_id then
    raise exception 'T7 FAIL: replay → %', r;
  end if;
  r := public.create_lawyer_invoice_v2('00000000-0000-0000-0000-00000000b001', 'vat-v2-0001', 5000,
         'عميل', 'individual', null, null, null, 'أتعاب', 'full', null, null);
  if r ->> 'code' <> 'ok' or (r -> 'payment' ->> 'amount')::numeric <> 50.00 then
    raise exception 'T7 FAIL: v2 → %', r;
  end if;
end $$;

-- T8 void: refused for another lawyer, a short reason, a part-paid invoice;
--    done for the owner; the row stays; replay ok; another reason → already_void;
--    a void invoice cannot collect
do $$
declare r jsonb; pid text; pid_paid text; n int; n2 int;
begin
  select id into pid from public.payments where metadata ->> 'create_key' = 'vat-a-0001';
  r := public.void_lawyer_invoice(pid, '00000000-0000-0000-0000-00000000b003', 'خطأ في المبلغ');
  if r <> '{"code": "forbidden"}'::jsonb then raise exception 'T8 FAIL: other lawyer → %', r; end if;
  r := public.void_lawyer_invoice(pid, '00000000-0000-0000-0000-00000000b001', '  x ');
  if r <> '{"code": "invalid"}'::jsonb then raise exception 'T8 FAIL: short reason → %', r; end if;
  r := public.void_lawyer_invoice('no-such-invoice', '00000000-0000-0000-0000-00000000b001', 'خطأ في المبلغ');
  if r <> '{"code": "not_found"}'::jsonb then raise exception 'T8 FAIL: missing → %', r; end if;

  -- part-paid: not voidable
  select id into pid_paid from public.payments where metadata ->> 'create_key' = 'vat-c-0001';
  r := public.record_invoice_collection(pid_paid, '00000000-0000-0000-0000-00000000b003', 100, 'cash', 0, 'vat-coll-0001');
  if r ->> 'code' <> 'ok' then raise exception 'T8 FAIL: setup collection → %', r; end if;
  r := public.void_lawyer_invoice(pid_paid, '00000000-0000-0000-0000-00000000b003', 'لم يعد مطلوباً');
  if r <> '{"code": "has_collections"}'::jsonb then raise exception 'T8 FAIL: part-paid → %', r; end if;

  select count(*) into n from public.payments;
  r := public.void_lawyer_invoice(pid, '00000000-0000-0000-0000-00000000b001', '  خطأ في المبلغ  ');
  select count(*) into n2 from public.payments;
  if r ->> 'code' <> 'ok' or r -> 'payment' ->> 'status' <> 'void'
     or r -> 'payment' ->> 'void_reason' <> 'خطأ في المبلغ'
     or r -> 'payment' ->> 'voided_by' <> '00000000-0000-0000-0000-00000000b001'
     or r -> 'payment' ->> 'voided_at' is null or n2 <> n then
    raise exception 'T8 FAIL: void → % (rows % → %)', r, n, n2;
  end if;
  r := public.void_lawyer_invoice(pid, '00000000-0000-0000-0000-00000000b001', 'خطأ في المبلغ');
  if r ->> 'code' <> 'ok' or (r ->> 'replay')::boolean is not true then raise exception 'T8 FAIL: replay → %', r; end if;
  r := public.void_lawyer_invoice(pid, '00000000-0000-0000-0000-00000000b001', 'سبب آخر مختلف');
  if r <> '{"code": "already_void"}'::jsonb then raise exception 'T8 FAIL: other reason → %', r; end if;
  r := public.record_invoice_collection(pid, '00000000-0000-0000-0000-00000000b001', 100, 'cash', 0, 'vat-coll-0002');
  if r ->> 'code' <> 'not_collectable' then raise exception 'T8 FAIL: collect on void → %', r; end if;
end $$;

-- T9 the CHECKs: void needs its three fields; a non-void row may not carry them;
--    a client's online payment (not an office invoice) is not voidable
do $$
declare r jsonb; pid text;
begin
  select id into pid from public.payments where metadata ->> 'create_key' = 'vat-c-0001';
  begin
    update public.payments set status = 'void' where id = pid;
    raise exception 'T9 FAIL: void without reason/who/when was stored';
  exception when check_violation then null;
  end;
  begin
    update public.payments set void_reason = 'سبب' where id = pid;
    raise exception 'T9 FAIL: an open invoice carried a void reason';
  exception when check_violation then null;
  end;
  insert into public.service_requests (id, requester_user_id, title, assigned_to) values
    ('sr-online', '00000000-0000-0000-0000-00000000b003', 'طلب', '00000000-0000-0000-0000-00000000b001');
  insert into public.payments (id, request_id, provider, amount, status, metadata)
    values ('pay-online', 'sr-online', 'moyasar', 100, 'requires_payment', '{}');
  r := public.void_lawyer_invoice('pay-online', '00000000-0000-0000-0000-00000000b001', 'لا أريده');
  if r <> '{"code": "not_voidable"}'::jsonb then raise exception 'T9 FAIL: online payment → %', r; end if;
end $$;

-- T10 sessions: no EXECUTE on the three functions, no write on vat_number
do $$
declare f text;
begin
  foreach f in array array[
    'public.create_lawyer_invoice_v3(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)',
    'public.void_lawyer_invoice(text,uuid,text)',
    'public.invoice_issuer_vat(uuid)'] loop
    if has_function_privilege('authenticated', f, 'EXECUTE') or has_function_privilege('anon', f, 'EXECUTE')
       or has_function_privilege('app_user', f, 'EXECUTE') then
      raise exception 'T10 FAIL: a session can EXECUTE %', f;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.branding_vaults', 'vat_number', 'UPDATE')
     or has_column_privilege('authenticated', 'public.branding_vaults', 'vat_number', 'INSERT') then
    raise exception 'T10 FAIL: sessions can write branding_vaults.vat_number';
  end if;
end $$;

select 'invoice_vat_void: all assertions passed' as result;
