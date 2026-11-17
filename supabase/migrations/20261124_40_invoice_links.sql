-- =============================================================================
-- Migration: 20261124_40_invoice_links.sql
-- =============================================================================
-- PURPOSE (owner package 13-Nov, file 01 «الترابط المنطقي», N01-9 / N01-10)
--   An office invoice (POST /api/v1/lawyer/finance) used to be written as TWO
--   rows: a placeholder service_requests row titled «فاتورة: <client>» and the
--   payments row hanging on it (payments.request_id is NOT NULL, and the
--   lawyer owned the invoice only through that request's assigned_to). The
--   placeholder showed up as a fake case. This file lets an invoice stand on
--   its own:
--
--   1. payments.request_id becomes NULLABLE (the FK and its cascade stay).
--   2. New nullable columns on payments:
--        owner_user_id    uuid → auth.users        (the issuing lawyer; on delete set null)
--        lawyer_client_id uuid → lawyer_clients    (the client card; on delete set null)
--        firm_id          uuid → firm_profiles     (the issuer's active firm; on delete set null)
--        contract_id      text → contracts         (the contract billed; on delete set null)
--      + partial indexes. Backfill: existing office invoices get owner_user_id
--      (= the placeholder request's assigned_to, only when metadata.issued_by
--      says the same person) and lawyer_client_id (= metadata.clientId when
--      that card still exists). No row is deleted, no amount is touched.
--   3. RLS (additive, permissive): "invoice owner reads own invoices" on
--      payments (owner_user_id = auth.uid()) and the same branch on
--      invoice_collections. The existing participants policy is unchanged.
--   4. public.create_lawyer_invoice_v2(… 11 args of v1 …, p_contract_id text):
--      same checks as create_lawyer_invoice (20261030_20) + the contract must
--      be the caller's own (owner_user_id = p_actor) and, when a card is also
--      named, the contract's card must be that card. NO placeholder request:
--      request_id is p_request_id or NULL. firm_id = the caller's active
--      firm_members row. The v1 function is LEFT IN PLACE (the code deployed
--      before this batch still calls it).
--   5. public.record_invoice_collection (same signature, create or replace):
--      an invoice with no request is owned by payments.owner_user_id; one with
--      a request is still owned by that request's assigned_to (unchanged).
--
-- WHO CAN DO WHAT
--   Both functions: SECURITY DEFINER, search_path '', EXECUTE for service_role
--   only. Sessions only gain SELECT on their OWN invoices.
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261124_40_invoice_links.sql
--   Expect: NOTICE  20261124_40 verify: OK  and a row with `t`. Idempotent.
--
-- RUN ORDER — BEFORE THE DEPLOY
--   The new code calls create_lawyer_invoice_v2 (missing → POST answers 503
--   and writes nothing) and reads payments.owner_user_id. The old code keeps
--   working after this file (v1 untouched, the new columns are ignored).
--   Prerequisites: 20260518 (payments), 20260903_phase2 (lawyer_clients,
--   firm_members), 20260905_phase3 (contracts), 20261030_10, 20261030_20.
--
-- ROLLBACK (only while no invoice without a request exists)
--   drop function if exists public.create_lawyer_invoice_v2(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text);
--   re-run 20261030_10_invoice_collections_atomic.sql (old record_invoice_collection + policy);
--   drop policy if exists "invoice owner reads own invoices" on public.payments;
--   drop policy if exists "invoice_collections_select_owner" on public.invoice_collections;
--   alter table public.payments drop column if exists contract_id, drop column if exists firm_id,
--     drop column if exists lawyer_client_id, drop column if exists owner_user_id;
--   alter table public.payments alter column request_id set not null;
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.payments') is null or to_regclass('public.service_requests') is null then
    raise exception '20261124_40: payments / service_requests missing — run 20260518_client_workflow_backend_ready first';
  end if;
  if to_regclass('public.lawyer_clients') is null or to_regclass('public.firm_members') is null
     or to_regclass('public.firm_profiles') is null then
    raise exception '20261124_40: lawyer_clients / firm_members / firm_profiles missing — run 20260903_phase2_clients_and_firm_membership first';
  end if;
  if to_regclass('public.contracts') is null then
    raise exception '20261124_40: public.contracts missing — run 20260905_phase3_consultations_and_contracts first';
  end if;
  if to_regclass('public.invoice_collections') is null
     or to_regprocedure('public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)') is null then
    raise exception '20261124_40: run 20261030_10_invoice_collections_atomic and 20261030_20_create_invoice_atomic first';
  end if;
end
$pre$;

-- ── 1–2. columns ─────────────────────────────────────────────────────────────
alter table public.payments alter column request_id drop not null;

alter table public.payments
  add column if not exists owner_user_id    uuid references auth.users(id) on delete set null,
  add column if not exists lawyer_client_id uuid references public.lawyer_clients(id) on delete set null,
  add column if not exists firm_id          uuid references public.firm_profiles(id) on delete set null,
  add column if not exists contract_id      text references public.contracts(id) on delete set null;

create index if not exists idx_payments_owner_user_id    on public.payments (owner_user_id, created_at desc) where owner_user_id is not null;
create index if not exists idx_payments_lawyer_client_id on public.payments (lawyer_client_id) where lawyer_client_id is not null;
create index if not exists idx_payments_firm_id          on public.payments (firm_id) where firm_id is not null;
create index if not exists idx_payments_contract_id      on public.payments (contract_id) where contract_id is not null;

-- backfill: office invoices issued before this file (all hang on a placeholder
-- or a real request of the issuer). Only stamps what is already true.
update public.payments p
   set owner_user_id = sr.assigned_to
  from public.service_requests sr
 where sr.id = p.request_id
   and p.owner_user_id is null
   and (p.metadata ->> 'invoice') = 'true'
   and sr.assigned_to is not null
   and (p.metadata ->> 'issued_by') = sr.assigned_to::text;

update public.payments p
   set lawyer_client_id = lc.id
  from public.lawyer_clients lc
 where p.lawyer_client_id is null
   and (p.metadata ->> 'invoice') = 'true'
   and (p.metadata ->> 'clientId') ~ '^[0-9a-fA-F-]{36}$'
   and lc.id = (p.metadata ->> 'clientId')::uuid;

-- ── 3. RLS — the issuer reads his own invoices (additive) ───────────────────
drop policy if exists "invoice owner reads own invoices" on public.payments;
create policy "invoice owner reads own invoices" on public.payments
  for select
  using (owner_user_id is not null and owner_user_id = auth.uid());

drop policy if exists "invoice_collections_select_owner" on public.invoice_collections;
create policy "invoice_collections_select_owner" on public.invoice_collections
  for select
  using (
    exists (
      select 1 from public.payments p
       where p.id = invoice_collections.payment_id
         and p.owner_user_id is not null
         and p.owner_user_id = auth.uid()
    )
  );

-- ── 4. issue an invoice with no placeholder request ─────────────────────────
create or replace function public.create_lawyer_invoice_v2(
  p_actor            uuid,
  p_idempotency_key  text,
  p_amount_halalas   bigint,
  p_client_name      text,
  p_client_type      text,
  p_lawyer_client_id uuid,
  p_case_id          text,
  p_request_id       text,
  p_description      text,
  p_fee_type         text,
  p_case_title       text,
  p_contract_id      text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prior          public.payments%rowtype;
  owner_id       uuid;
  card_id        uuid;
  card_name      text;
  card_type      text;
  card_owner     uuid;
  case_title     text;
  client_name    text;
  client_type    text;
  contract_owner uuid;
  contract_card  uuid;
  contract_title text;
  actor_firm     uuid;
  amt            numeric(12,2);
  meta           jsonb;
  fp             text;
  created        public.payments%rowtype;
begin
  if p_actor is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100
     or p_amount_halalas is null or p_amount_halalas <= 0 or p_amount_halalas > 999999999999
     or (p_fee_type is not null and p_fee_type not in ('full', 'partial'))
     or (p_client_type is not null and p_client_type not in ('individual', 'company'))
     or length(coalesce(p_client_name, '')) > 200
     or length(coalesce(p_description, '')) > 2000
     or length(coalesce(p_case_title, '')) > 300
     or length(coalesce(p_contract_id, '')) > 100 then
    return jsonb_build_object('code', 'invalid');
  end if;
  amt := round(p_amount_halalas::numeric / 100, 2);
  fp := md5(jsonb_build_object(
    'v',        2,
    'amount',   p_amount_halalas,
    'client',   nullif(btrim(coalesce(p_client_name, '')), ''),
    'type',     p_client_type,
    'card',     p_lawyer_client_id,
    'case',     p_case_id,
    'caseTitle', nullif(btrim(coalesce(p_case_title, '')), ''),
    'request',  p_request_id,
    'desc',     nullif(btrim(coalesce(p_description, '')), ''),
    'feeType',  coalesce(p_fee_type, 'full'),
    'contract', p_contract_id)::text);

  -- 1. one form at a time per key (the same lock name as v1: one key space)
  perform pg_advisory_xact_lock(hashtext('create_lawyer_invoice:' || p_idempotency_key));

  -- 2. already issued by this form?
  select p.* into prior from public.payments p
   where (p.metadata ->> 'create_key') = p_idempotency_key;
  if found then
    if (prior.metadata ->> 'issued_by') = p_actor::text and (prior.metadata ->> 'create_fp') = fp then
      return jsonb_build_object('code', 'ok', 'replay', true, 'payment', to_jsonb(prior));
    end if;
    return jsonb_build_object('code', 'key_reused');
  end if;

  -- 3. ownership, before anything is written ('forbidden' for missing and foreign alike)
  if p_request_id is not null then
    select sr.assigned_to into owner_id from public.service_requests sr where sr.id = p_request_id;
    if owner_id is distinct from p_actor then
      return jsonb_build_object('code', 'forbidden');
    end if;
  end if;

  if p_case_id is not null then
    owner_id := null;
    select sr.assigned_to, sr.title into owner_id, case_title
      from public.service_requests sr where sr.id = p_case_id;
    if owner_id is distinct from p_actor then
      return jsonb_build_object('code', 'forbidden');
    end if;
  end if;

  card_id := p_lawyer_client_id;
  if p_contract_id is not null then
    select c.owner_user_id, c.lawyer_client_id, c.title into contract_owner, contract_card, contract_title
      from public.contracts c where c.id = p_contract_id;
    if contract_owner is distinct from p_actor then
      return jsonb_build_object('code', 'forbidden');
    end if;
    -- the invoice of a contract is the contract client's invoice
    if card_id is not null and contract_card is not null and card_id <> contract_card then
      return jsonb_build_object('code', 'invalid');
    end if;
    if card_id is null and contract_card is not null
       and nullif(btrim(coalesce(p_client_name, '')), '') is null then
      card_id := contract_card;
    end if;
  end if;

  if card_id is not null then
    select lc.name, lc.client_type, lc.owner_user_id into card_name, card_type, card_owner
      from public.lawyer_clients lc where lc.id = card_id;
    if card_owner is distinct from p_actor then
      return jsonb_build_object('code', 'forbidden');
    end if;
    client_name := card_name;
    client_type := card_type;
  else
    client_name := btrim(coalesce(p_client_name, ''));
    client_type := p_client_type;
    if client_name = '' or client_type is null then
      return jsonb_build_object('code', 'invalid');
    end if;
  end if;

  select fm.firm_id into actor_firm
    from public.firm_members fm
   where fm.user_id = p_actor and fm.status = 'active'
   order by fm.created_at
   limit 1;

  -- 5. ONE row: the invoice. No placeholder request (N01-9).
  meta := jsonb_build_object(
    'invoice', true,
    'client', client_name,
    'clientType', client_type,
    'description', coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'أتعاب قانونية'),
    'issued_by', p_actor,
    'feeType', coalesce(p_fee_type, 'full'),
    'create_key', p_idempotency_key,
    'create_fp', fp);
  if card_id is not null then
    meta := meta || jsonb_build_object('clientId', card_id);
  end if;
  if p_contract_id is not null then
    meta := meta || jsonb_build_object('contractId', p_contract_id, 'contractTitle', contract_title);
  end if;
  if p_case_id is not null then
    meta := meta || jsonb_build_object('caseId', p_case_id, 'caseTitle', case_title);
  elsif nullif(btrim(coalesce(p_case_title, '')), '') is not null then
    meta := meta || jsonb_build_object('caseTitle', btrim(p_case_title));
  end if;

  insert into public.payments
    (id, request_id, provider, amount, currency, status, metadata,
     owner_user_id, lawyer_client_id, firm_id, contract_id)
  values
    (gen_random_uuid()::text, p_request_id, 'manual', amt, 'SAR', 'requires_payment', meta,
     p_actor, card_id, actor_firm, p_contract_id)
  returning * into created;

  return jsonb_build_object('code', 'ok', 'replay', false, 'payment', to_jsonb(created));
end;
$$;

comment on function public.create_lawyer_invoice_v2(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text) is
  'Issues one manual lawyer invoice (ONE payments row, no placeholder request) once per idempotency key, after ownership of the request / case / CRM card / contract is checked; stamps owner_user_id, lawyer_client_id, firm_id, contract_id (20261124_40, N01-9). Service role only.';

revoke all on function public.create_lawyer_invoice_v2(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_lawyer_invoice_v2(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text)
  to service_role;

-- ── 5. collect on an invoice that has no request ────────────────────────────
-- Identical to 20261030_10 except step 2 (ownership).
create or replace function public.record_invoice_collection(
  p_payment_id            text,
  p_actor                 uuid,
  p_amount_halalas        bigint,
  p_method                text,
  p_expected_paid_halalas bigint,
  p_idempotency_key       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pay         public.payments%rowtype;
  owner_id    uuid;
  prior       public.invoice_collections%rowtype;
  raw_paid    numeric;
  paid        numeric(12,2);
  total       numeric(12,2);
  remaining   numeric(12,2);
  amt         numeric(12,2);
  new_paid    numeric(12,2);
  updated     public.payments%rowtype;
begin
  if p_payment_id is null or p_actor is null
     or p_amount_halalas is null or p_amount_halalas <= 0 or p_amount_halalas > 999999999999
     or p_expected_paid_halalas is null or p_expected_paid_halalas < 0
     or p_method is null or p_method not in ('cash', 'bank_transfer')
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100 then
    return jsonb_build_object('code', 'invalid');
  end if;

  -- 1. lock the invoice
  select p.* into pay
    from public.payments p
   where p.id = p_payment_id
     for update;
  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;

  -- 2. ownership: the request's assignee when the invoice hangs on a request;
  --    otherwise the invoice's own owner_user_id (20261124_40, N01-9).
  if pay.request_id is not null then
    select sr.assigned_to into owner_id
      from public.service_requests sr
     where sr.id = pay.request_id;
  else
    owner_id := pay.owner_user_id;
  end if;
  if owner_id is distinct from p_actor then
    return jsonb_build_object('code', 'forbidden');
  end if;

  total := round(pay.amount, 2);
  raw_paid := case when jsonb_typeof(pay.metadata -> 'paidAmount') = 'number'
                   then (pay.metadata ->> 'paidAmount')::numeric else 0 end;
  if pay.status = 'paid' then raw_paid := total; end if;
  paid := round(raw_paid, 2);
  remaining := greatest(total - paid, 0);

  -- 3. the same form again: answer what the first submission did
  select ic.* into prior
    from public.invoice_collections ic
   where ic.idempotency_key = p_idempotency_key;
  if found then
    if prior.payment_id = p_payment_id
       and prior.amount = round(p_amount_halalas::numeric / 100, 2)
       and prior.method = p_method then
      return jsonb_build_object(
        'code', 'ok', 'replay', true,
        'paid_halalas', (paid * 100)::bigint,
        'remaining_halalas', (remaining * 100)::bigint,
        'payment', to_jsonb(pay));
    end if;
    return jsonb_build_object('code', 'key_reused');
  end if;

  -- 4. only an open invoice collects
  if pay.status <> 'requires_payment' then
    return jsonb_build_object('code', 'not_collectable',
      'paid_halalas', (paid * 100)::bigint,
      'remaining_halalas', (remaining * 100)::bigint);
  end if;

  -- 5. the form's snapshot must still be true
  if abs(raw_paid * 100 - p_expected_paid_halalas) >= 1 then
    return jsonb_build_object('code', 'stale',
      'paid_halalas', (paid * 100)::bigint,
      'remaining_halalas', (remaining * 100)::bigint);
  end if;

  -- 6. never more than what is left
  amt := round(p_amount_halalas::numeric / 100, 2);
  if amt > remaining then
    return jsonb_build_object('code', 'exceeds_remaining',
      'paid_halalas', (paid * 100)::bigint,
      'remaining_halalas', (remaining * 100)::bigint);
  end if;

  -- 7. record and add
  new_paid := paid + amt;

  insert into public.invoice_collections
    (payment_id, amount, method, paid_before, paid_after, idempotency_key, collected_by)
  values
    (p_payment_id, amt, p_method, paid, new_paid, p_idempotency_key, p_actor);

  update public.payments
     set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
           'paidAmount', new_paid,
           'paidMethod', p_method,
           'paidAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'collected_by', p_actor),
         status = case when new_paid >= total then 'paid' else 'requires_payment' end
   where id = p_payment_id
  returning * into updated;

  return jsonb_build_object(
    'code', 'ok', 'replay', false,
    'paid_halalas', (new_paid * 100)::bigint,
    'remaining_halalas', (greatest(total - new_paid, 0) * 100)::bigint,
    'payment', to_jsonb(updated));
end;
$$;

comment on function public.record_invoice_collection(text, uuid, bigint, text, bigint, text) is
  'Records one collected payment on a lawyer invoice under a row lock: owner (request assignee, or payments.owner_user_id for an invoice with no request — 20261124_40), open status, form snapshot, remaining balance and idempotency are checked before the amount is ADDED (20261030_10). Service role only.';

revoke all on function public.record_invoice_collection(text, uuid, bigint, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.record_invoice_collection(text, uuid, bigint, text, bigint, text)
  to service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  fn2  constant text := 'public.create_lawyer_invoice_v2(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)';
  fnc  constant text := 'public.record_invoice_collection(text,uuid,bigint,text,bigint,text)';
  f    text;
  role_name text;
  col  text;
begin
  foreach col in array array['owner_user_id', 'lawyer_client_id', 'firm_id', 'contract_id'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'payments' and column_name = col) then
      raise exception '20261124_40 verify: payments.% is missing', col;
    end if;
  end loop;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'payments' and column_name = 'request_id'
                and is_nullable = 'NO') then
    raise exception '20261124_40 verify: payments.request_id is still NOT NULL';
  end if;
  foreach f in array array[fn2, fnc] loop
    if to_regprocedure(f) is null then
      raise exception '20261124_40 verify: % is missing', f;
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(f)
                    and prosecdef and proconfig @> array['search_path=""']) then
      raise exception '20261124_40 verify: % is not SECURITY DEFINER with search_path ''''', f;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name)
         and has_function_privilege(role_name, f, 'EXECUTE') then
        raise exception '20261124_40 verify: % can EXECUTE %', role_name, f;
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '20261124_40 verify: service_role cannot EXECUTE %', f;
    end if;
  end loop;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure(fnc)), 'pay.owner_user_id') = 0 then
    raise exception '20261124_40 verify: record_invoice_collection has no owner_user_id branch';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure(fn2)), 'insert into public.service_requests') > 0 then
    raise exception '20261124_40 verify: create_lawyer_invoice_v2 still writes a placeholder request';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payments'
                  and policyname = 'invoice owner reads own invoices')
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'invoice_collections'
                  and policyname = 'invoice_collections_select_owner') then
    raise exception '20261124_40 verify: an owner read policy is missing';
  end if;
  raise notice '20261124_40 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261124_40 invoices without a placeholder case (owner_user_id / lawyer_client_id / firm_id / contract_id)' as step,
       to_regprocedure('public.create_lawyer_invoice_v2(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)') is not null
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'payments' and column_name = 'request_id'
                      and is_nullable = 'YES') as ok;
