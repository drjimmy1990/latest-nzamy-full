-- =============================================================================
-- Migration: 20261126_30_invoice_vat_void.sql
-- =============================================================================
-- PURPOSE (owner TODO 17-Nov, N01-11 / N01-14; owner decision Q484 is final:
-- VAT 15% only when the issuer has a VAT number, else 0% «غير خاضع»)
--
--   1. The issuer's VAT number — ONE source per issuer scope:
--        firm   (the invoice carries payments.firm_id, i.e. the issuer is an
--               active member of a firm) → firm_profiles.metadata.settings.vatNumber,
--               the field firms already fill in Settings (ENTITY_SETTINGS_FIELDS.firm);
--        lawyer (no firm) → NEW column branding_vaults.vat_number on his own
--               letterhead vault. Sessions hold NO grant on it: the server writes
--               it with the service role after reading the caller's own vault
--               through RLS (the 20261103_69 pattern). A CHECK allows it on a
--               lawyer's vault only, so a firm never has two sources.
--      public.invoice_issuer_vat(p_actor) answers {scope, firm_id, name,
--      state: registered | not_registered | invalid, vat_number}. A value is
--      normalised (Arabic-Indic digits → ASCII, spaces and dashes dropped) and
--      must be 15 digits starting and ending with 3. A stored value that is
--      not is 'invalid' — the invoice is REFUSED rather than issued at 0%.
--   2. public.create_lawyer_invoice_v3 — v2 of 20261124_40 copied verbatim
--      (same 12 arguments, same checks, same advisory-lock key space) plus:
--        p_amount_halalas is the fee BEFORE VAT (the subtotal);
--        vat = 15% of it, rounded half-up to the halala, only when the issuer
--              is 'registered'; 0 when 'not_registered'; 'vat_number_invalid'
--              (nothing written) when 'invalid';
--        payments.amount = subtotal + vat (what the client owes: collections,
--              remainders and revenue keep reading `amount` as the total);
--        metadata.vat = {rate_bp, subtotal_halalas, vat_halalas, total_halalas,
--              vat_number, scope, issuer_name} — a SNAPSHOT: a later change of
--              the VAT number never changes an issued invoice. Invoices issued
--              before this file carry no metadata.vat and the screens print no
--              VAT line for them (no tax-status claim nobody made).
--      v2 is LEFT IN PLACE (the code deployed before this batch calls it).
--   3. Void (N01-14): payments.status gains 'void'; new columns voided_at,
--      voided_by, void_reason (a CHECK: void ⇔ all three set, reason 3–500
--      characters). public.void_lawyer_invoice(p_payment_id, p_actor, p_reason)
--      locks the row, checks ownership exactly as record_invoice_collection
--      does, and voids ONLY an office invoice (metadata.invoice, provider
--      manual) that is still requires_payment with nothing collected (no
--      paidAmount and no invoice_collections row). The row is kept. A replay
--      with the same reason by the same person answers ok; another reason
--      answers 'already_void'. record_invoice_collection already refuses any
--      status but requires_payment, so a void invoice can never collect.
--      Every revenue / outstanding read filters statuses (finance GET,
--      office-graph, monthRevenue, admin revenue), so 'void' drops out of
--      every total by itself.
--
-- WHO CAN DO WHAT
--   All three functions: SECURITY DEFINER, search_path '', EXECUTE for
--   service_role only. Sessions gain nothing new (no grant on vat_number, the
--   void columns are written only by void_lawyer_invoice).
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261126_30_invoice_vat_void.sql
--   Expect: NOTICE  20261126_30 verify: OK  and a row with `t`. Idempotent.
--
-- RUN ORDER — BEFORE THE DEPLOY
--   The new code calls create_lawyer_invoice_v3 / void_lawyer_invoice /
--   invoice_issuer_vat (missing → POST answers 503 and writes nothing) and
--   reads the void columns. The old code keeps working after this file (v2
--   untouched; it never writes or reads the new columns).
--   Prerequisites: 20261030_10, 20261030_20, 20261124_40 (payments links + v2),
--   20261026_63 (branding_vaults).
--
-- ROLLBACK (only while no row has status 'void' and no row carries metadata.vat
-- that the old screens would misread — the old screens show `amount`, which is
-- already the VAT-inclusive total, so they stay correct):
--   drop function if exists public.void_lawyer_invoice(text, uuid, text);
--   drop function if exists public.create_lawyer_invoice_v3(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text);
--   drop function if exists public.invoice_issuer_vat(uuid);
--   drop function if exists public.normalize_vat_number(text);
--   alter table public.payments drop constraint if exists payments_void_fields_check;
--   alter table public.payments drop constraint if exists payments_status_check;
--   alter table public.payments add constraint payments_status_check
--     check (status in ('not_required', 'requires_payment', 'paid', 'failed', 'refunded'));
--   alter table public.payments drop column if exists void_reason, drop column if exists voided_by,
--     drop column if exists voided_at;
--   alter table public.branding_vaults drop constraint if exists branding_vaults_vat_number_check;
--   alter table public.branding_vaults drop column if exists vat_number;
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.payments') is null or to_regclass('public.invoice_collections') is null then
    raise exception '20261126_30: payments / invoice_collections missing — run 20261030_10_invoice_collections_atomic first';
  end if;
  if to_regprocedure('public.create_lawyer_invoice_v2(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)') is null
     or not exists (select 1 from information_schema.columns
                     where table_schema = 'public' and table_name = 'payments' and column_name = 'owner_user_id') then
    raise exception '20261126_30: run 20261124_40_invoice_links first';
  end if;
  if to_regclass('public.branding_vaults') is null then
    raise exception '20261126_30: public.branding_vaults missing — run 20261026_63_branding_vault first';
  end if;
  if to_regclass('public.firm_profiles') is null or to_regclass('public.firm_members') is null then
    raise exception '20261126_30: firm_profiles / firm_members missing — run 20260903_phase2 first';
  end if;
end
$pre$;

-- ── 1. the lawyer's VAT number (one source per scope) ───────────────────────
alter table public.branding_vaults add column if not exists vat_number text;

alter table public.branding_vaults drop constraint if exists branding_vaults_vat_number_check;
alter table public.branding_vaults add constraint branding_vaults_vat_number_check
  check (vat_number is null or (vat_number ~ '^3[0-9]{13}3$' and lawyer_user_id is not null));

comment on column public.branding_vaults.vat_number is
  'Q484 / N01-11: the individual lawyer''s VAT registration number (15 digits, 3…3). Firms keep theirs in firm_profiles.metadata.settings.vatNumber. Written by the server only (service role, after an RLS read of the caller''s own vault). 20261126_30.';

-- No session write, whatever the table-level grants say.
revoke insert (vat_number), update (vat_number) on public.branding_vaults from anon, authenticated;

-- Pure: '' / null → null; anything else → digits only (Arabic-Indic and
-- Persian digits to ASCII; spaces and dashes dropped). Shape is NOT checked
-- here — the caller decides what a malformed value means.
create or replace function public.normalize_vat_number(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.translate(coalesce(p_raw, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      '[[:space:]-]', '', 'g'),
    '');
$$;

revoke all on function public.normalize_vat_number(text) from public, anon, authenticated;
grant execute on function public.normalize_vat_number(text) to service_role;

-- Who issues an invoice of p_actor, and does that issuer charge VAT?
create or replace function public.invoice_issuer_vat(p_actor uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_firm uuid;
  v_name text;
  v_raw  text;
  v_num  text;
begin
  if p_actor is null then
    return jsonb_build_object('state', 'not_registered', 'scope', 'lawyer', 'firm_id', null,
                              'name', '', 'vat_number', null);
  end if;

  -- the same firm create_lawyer_invoice_v2/v3 stamps on payments.firm_id
  select fm.firm_id into v_firm
    from public.firm_members fm
   where fm.user_id = p_actor and fm.status = 'active'
   order by fm.created_at
   limit 1;

  if v_firm is not null then
    select f.name_ar, (pg_catalog.to_jsonb(f) -> 'metadata' -> 'settings' ->> 'vatNumber')
      into v_name, v_raw
      from public.firm_profiles f where f.id = v_firm;
  else
    select bv.vat_number, nullif(bv.display_name_ar, '') into v_raw, v_name
      from public.branding_vaults bv where bv.lawyer_user_id = p_actor;
    if v_name is null then
      select pg_catalog.to_jsonb(p) ->> 'display_name' into v_name
        from public.profiles p where p.id = p_actor;
    end if;
  end if;

  v_num := public.normalize_vat_number(v_raw);
  return jsonb_build_object(
    'scope',      case when v_firm is null then 'lawyer' else 'firm' end,
    'firm_id',    v_firm,
    'name',       coalesce(v_name, ''),
    'state',      case when v_num is null then 'not_registered'
                       when v_num ~ '^3[0-9]{13}3$' then 'registered'
                       else 'invalid' end,
    'vat_number', case when v_num ~ '^3[0-9]{13}3$' then v_num else null end);
end;
$$;

comment on function public.invoice_issuer_vat(uuid) is
  'Q484 / N01-11: the issuer of p_actor''s invoices (his active firm, else himself), its name and VAT state: registered (15% VAT) | not_registered (0%, «غير خاضع») | invalid (a stored number of the wrong shape — issuing is refused). 20261126_30. Service role only.';

revoke all on function public.invoice_issuer_vat(uuid) from public, anon, authenticated;
grant execute on function public.invoice_issuer_vat(uuid) to service_role;

-- ── 2. issue an invoice with VAT (v2 + Q484) ────────────────────────────────
create or replace function public.create_lawyer_invoice_v3(
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
  issuer         jsonb;
  vat_rate_bp    int;
  vat_halalas    bigint;
  total_halalas  bigint;
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
  fp := md5(jsonb_build_object(
    'v',        3,
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

  -- 1. one form at a time per key (the same lock name as v1/v2: one key space)
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

  -- 4. Q484: the issuer (his active firm, else himself) and its VAT state.
  --    The firm here is the one invoice_issuer_vat resolved — the same query
  --    v2 ran (first active membership by created_at).
  issuer := public.invoice_issuer_vat(p_actor);
  actor_firm := nullif(issuer ->> 'firm_id', '')::uuid;
  if issuer ->> 'state' = 'invalid' then
    return jsonb_build_object('code', 'vat_number_invalid', 'scope', issuer ->> 'scope');
  end if;
  vat_rate_bp := case when issuer ->> 'state' = 'registered' then 1500 else 0 end;
  -- half-up to the halala, in integers (src/lib/finance/invoiceVat.ts: vatHalalas)
  vat_halalas := (p_amount_halalas * vat_rate_bp + 5000) / 10000;
  total_halalas := p_amount_halalas + vat_halalas;
  if total_halalas > 999999999999 then
    return jsonb_build_object('code', 'invalid');
  end if;
  amt := round(total_halalas::numeric / 100, 2);

  -- 5. ONE row: the invoice. No placeholder request (N01-9).
  meta := jsonb_build_object(
    'invoice', true,
    'client', client_name,
    'clientType', client_type,
    'description', coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'أتعاب قانونية'),
    'issued_by', p_actor,
    'feeType', coalesce(p_fee_type, 'full'),
    'create_key', p_idempotency_key,
    'create_fp', fp,
    'vat', jsonb_build_object(
      'rate_bp',          vat_rate_bp,
      'subtotal_halalas', p_amount_halalas,
      'vat_halalas',      vat_halalas,
      'total_halalas',    total_halalas,
      'vat_number',       issuer -> 'vat_number',
      'scope',            issuer ->> 'scope',
      'issuer_name',      issuer ->> 'name'));
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

comment on function public.create_lawyer_invoice_v3(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text) is
  'Issues one manual lawyer invoice (ONE payments row) once per idempotency key after the ownership checks of v2 (20261124_40); p_amount_halalas is the fee before VAT, amount = fee + 15% VAT (half-up) only when the issuer has a VAT number (Q484), else + 0; metadata.vat snapshots the rate, the three amounts and the VAT number. 20261126_30, N01-11. Service role only.';

revoke all on function public.create_lawyer_invoice_v3(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_lawyer_invoice_v3(uuid, text, bigint, text, text, uuid, text, text, text, text, text, text)
  to service_role;

-- ── 3. void (N01-14) ────────────────────────────────────────────────────────
-- The status CHECK of 20260518 is an inline (auto-named) constraint: find it
-- by its definition (the status IN-list: requires_payment AND not_required AND
-- refunded) rather than assume its name, then add the named one. Every drop
-- is announced.
do $status$
declare
  c record;
begin
  for c in
    select con.conname
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.payments'::regclass
       and con.contype = 'c'
       and pg_catalog.pg_get_constraintdef(con.oid) like '%status%'
       and pg_catalog.pg_get_constraintdef(con.oid) like '%requires_payment%'
       and pg_catalog.pg_get_constraintdef(con.oid) like '%not_required%'
       and pg_catalog.pg_get_constraintdef(con.oid) like '%refunded%'
  loop
    raise notice '20261126_30: dropping payments CHECK % (re-created as payments_status_check with void)', c.conname;
    execute format('alter table public.payments drop constraint %I', c.conname);
  end loop;
end
$status$;

alter table public.payments add constraint payments_status_check
  check (status in ('not_required', 'requires_payment', 'paid', 'failed', 'refunded', 'void'));

alter table public.payments
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid,
  add column if not exists void_reason text;

alter table public.payments drop constraint if exists payments_void_fields_check;
alter table public.payments add constraint payments_void_fields_check
  check (
    (status = 'void'
      and voided_at is not null and voided_by is not null
      and char_length(btrim(coalesce(void_reason, ''))) between 3 and 500)
    or (status <> 'void' and voided_at is null and voided_by is null and void_reason is null));

comment on column public.payments.void_reason is
  'N01-14: why the issuer voided this office invoice (3–500 characters). Set only by public.void_lawyer_invoice, with voided_at / voided_by. 20261126_30.';

create or replace function public.void_lawyer_invoice(
  p_payment_id text,
  p_actor      uuid,
  p_reason     text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  pay      public.payments%rowtype;
  owner_id uuid;
  reason   text := btrim(coalesce(p_reason, ''));
  raw_paid numeric;
  updated  public.payments%rowtype;
begin
  if p_payment_id is null or p_actor is null
     or char_length(reason) not between 3 and 500 then
    return jsonb_build_object('code', 'invalid');
  end if;

  -- 1. lock the invoice (the same lock record_invoice_collection takes)
  select p.* into pay
    from public.payments p
   where p.id = p_payment_id
     for update;
  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;

  -- 2. ownership: exactly record_invoice_collection's rule (20261124_40)
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

  -- 3. only an office invoice — never a client's online payment
  if (pay.metadata ->> 'invoice') is distinct from 'true' or pay.provider <> 'manual' then
    return jsonb_build_object('code', 'not_voidable');
  end if;

  -- 4. a repeat of the same void answers what the first one did
  if pay.status = 'void' then
    if pay.voided_by = p_actor and pay.void_reason = reason then
      return jsonb_build_object('code', 'ok', 'replay', true, 'payment', to_jsonb(pay));
    end if;
    return jsonb_build_object('code', 'already_void');
  end if;

  -- 5. unpaid only: open, no collected amount, no collection row
  if pay.status <> 'requires_payment' then
    return jsonb_build_object('code', 'not_voidable');
  end if;
  raw_paid := case when jsonb_typeof(pay.metadata -> 'paidAmount') = 'number'
                   then (pay.metadata ->> 'paidAmount')::numeric else 0 end;
  if raw_paid > 0
     or exists (select 1 from public.invoice_collections ic where ic.payment_id = pay.id) then
    return jsonb_build_object('code', 'has_collections');
  end if;

  update public.payments p
     set status = 'void',
         voided_at = now(),
         voided_by = p_actor,
         void_reason = reason
   where p.id = pay.id
  returning * into updated;

  return jsonb_build_object('code', 'ok', 'replay', false, 'payment', to_jsonb(updated));
end;
$$;

comment on function public.void_lawyer_invoice(text, uuid, text) is
  'N01-14: voids one UNPAID office invoice (requires_payment, nothing collected) of its owner under a row lock, keeping the row (status void + reason + who/when). Ownership as record_invoice_collection. 20261126_30. Service role only.';

revoke all on function public.void_lawyer_invoice(text, uuid, text) from public, anon, authenticated;
grant execute on function public.void_lawyer_invoice(text, uuid, text) to service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  fns  constant text[] := array[
    'public.create_lawyer_invoice_v3(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)',
    'public.void_lawyer_invoice(text,uuid,text)',
    'public.invoice_issuer_vat(uuid)'];
  f    text;
  role_name text;
  col  text;
begin
  foreach col in array array['voided_at', 'voided_by', 'void_reason'] loop
    if not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'payments' and column_name = col) then
      raise exception '20261126_30 verify: payments.% is missing', col;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'branding_vaults' and column_name = 'vat_number') then
    raise exception '20261126_30 verify: branding_vaults.vat_number is missing';
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name)
       and (has_column_privilege(role_name, 'public.branding_vaults', 'vat_number', 'UPDATE')
            or has_column_privilege(role_name, 'public.branding_vaults', 'vat_number', 'INSERT')) then
      raise exception '20261126_30 verify: % can write branding_vaults.vat_number', role_name;
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_constraint
                  where conrelid = 'public.payments'::regclass and conname = 'payments_status_check'
                    and pg_catalog.pg_get_constraintdef(oid) like '%''void''%')
     or (select count(*) from pg_catalog.pg_constraint
          where conrelid = 'public.payments'::regclass and contype = 'c'
            and pg_catalog.pg_get_constraintdef(oid) like '%requires_payment%'
            and conname <> 'payments_void_fields_check') <> 1 then
    raise exception '20261126_30 verify: payments.status does not carry exactly one CHECK that allows void';
  end if;
  foreach f in array fns loop
    if to_regprocedure(f) is null then
      raise exception '20261126_30 verify: % is missing', f;
    end if;
    if not exists (select 1 from pg_proc where oid = to_regprocedure(f)
                    and prosecdef and proconfig @> array['search_path=""']) then
      raise exception '20261126_30 verify: % is not SECURITY DEFINER with search_path ''''', f;
    end if;
    foreach role_name in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = role_name)
         and has_function_privilege(role_name, f, 'EXECUTE') then
        raise exception '20261126_30 verify: % can EXECUTE %', role_name, f;
      end if;
    end loop;
    if exists (select 1 from pg_roles where rolname = 'service_role')
       and not has_function_privilege('service_role', f, 'EXECUTE') then
      raise exception '20261126_30 verify: service_role cannot EXECUTE %', f;
    end if;
  end loop;
  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure(fns[1])), 'insert into public.service_requests') > 0 then
    raise exception '20261126_30 verify: create_lawyer_invoice_v3 writes a placeholder request';
  end if;
  -- the rounding rule, in the database itself: 1 → 0, 3 → 0, 4 → 1, 10 → 2 (half-up)
  if (1 * 1500 + 5000) / 10000 <> 0 or (3::bigint * 1500 + 5000) / 10000 <> 0
     or (4::bigint * 1500 + 5000) / 10000 <> 1 or (10::bigint * 1500 + 5000) / 10000 <> 2 then
    raise exception '20261126_30 verify: integer half-up rounding is not what invoiceVat.ts expects';
  end if;
  if public.normalize_vat_number(' ٣٠٠ ٠٠٠-٠٠٠٠٠٠٠٠٣ ') <> '300000000000003'
     or public.normalize_vat_number('  ') is not null then
    raise exception '20261126_30 verify: normalize_vat_number is wrong';
  end if;
  raise notice '20261126_30 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261126_30 invoice VAT (Q484) + void (N01-11 / N01-14)' as step,
       to_regprocedure('public.create_lawyer_invoice_v3(uuid,text,bigint,text,text,uuid,text,text,text,text,text,text)') is not null
       and to_regprocedure('public.void_lawyer_invoice(text,uuid,text)') is not null
       and to_regprocedure('public.invoice_issuer_vat(uuid)') is not null
       and exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'payments' and column_name = 'void_reason') as ok;
