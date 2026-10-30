-- =============================================================================
-- Migration: 20261030_20_create_invoice_atomic.sql
-- =============================================================================
-- PURPOSE (owner handoff 2026-10-30, CODE-F22 — and the data half of CODE-F21)
--   Issuing a manual invoice (POST /api/v1/lawyer/finance) was two separate
--   writes from the route: a placeholder service_request, then the payments
--   row. No transaction, no idempotency key. A lost response, a retry or a
--   double click could leave a placeholder with no invoice, or two invoices.
--   The invoice also carried only typed names, with clientType hard-coded to
--   'company' by the page.
--
-- WHAT IT CREATES (idempotent — safe to run any number of times)
--   payments_create_key_key — a partial UNIQUE index on
--     payments ((metadata->>'create_key')) where it is set: one invoice per
--     form, whatever happens to the network.
--   public.create_lawyer_invoice(p_actor uuid, p_idempotency_key text,
--       p_amount_halalas bigint, p_client_name text, p_client_type text,
--       p_lawyer_client_id uuid, p_case_id text, p_request_id text,
--       p_description text, p_fee_type text, p_case_title text) RETURNS jsonb
--     ONE transaction:
--       1. pg_advisory_xact_lock on the key: a second call with the same key
--          waits, then finds the first call's invoice;
--       2. the key already used → the same invoice back ('ok' + replay) when
--          it was this lawyer's and the same amount; otherwise 'key_reused'
--          (no detail — a guessed key reveals nothing);
--       3. ownership BEFORE any insert, one answer 'forbidden' for missing and
--          foreign alike:
--            p_request_id  — the request the invoice hangs on, assigned to
--                            p_actor (CODE-F01, moved here from the route);
--            p_case_id     — a case referenced by the invoice, assigned to
--                            p_actor; its title becomes the case title;
--            p_lawyer_client_id — a CRM card (lawyer_clients) the lawyer owns
--                            (owner_user_id = p_actor). Its name and type are
--                            the invoice's client — the browser's are ignored;
--       4. with no card: a client name and an explicit type
--          ('individual' | 'company') are required — no hidden default;
--       5. the placeholder request (only when p_request_id is not given) and
--          the payments row, together. Either both exist or neither.
--     Answers {"code": …}: ok | invalid | forbidden | key_reused.
--
--   The CRM card and the case are stored in payments.metadata as references
--   (clientId, caseId). The placeholder request does NOT get lawyer_client_id:
--   the client directory counts a card's requests as its cases
--   (src/app/api/v1/lawyer/clients/route.ts), and an invoice is not a case.
--   Firm-shared cards (another member's owner_user_id) are refused — there is
--   no firm-wide finance permission model yet.
--
-- WHO CAN DO WHAT
--   SECURITY DEFINER, search_path ''. EXECUTE for service_role only.
--
-- PREREQUISITES
--   20260518 (payments, service_requests), 20260903_phase2 (lawyer_clients).
--   The UNIQUE index cannot fail on existing data: nothing wrote create_key
--   before this file.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY (with 20261030_10)
--   The new code calls this function to issue every invoice. Without it POST
--   answers 503 «إصدار الفواتير غير متاح مؤقتاً» and writes nothing — it never
--   falls back to the old two-step write. The old code ignores it.
--
-- ROLLBACK
--   drop function if exists public.create_lawyer_invoice(uuid, text, bigint, text, text, uuid, text, text, text, text, text);
--   drop index if exists public.payments_create_key_key;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.payments') is null or to_regclass('public.service_requests') is null then
    raise exception '20261030_20: payments / service_requests missing — run 20260518_client_workflow_backend_ready first';
  end if;
  if to_regclass('public.lawyer_clients') is null then
    raise exception '20261030_20: public.lawyer_clients missing — run 20260903_phase2_clients_and_firm_membership first';
  end if;
end $$;

create unique index if not exists payments_create_key_key
  on public.payments ((metadata ->> 'create_key'))
  where (metadata ->> 'create_key') is not null;

create or replace function public.create_lawyer_invoice(
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
  p_case_title       text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prior        public.payments%rowtype;
  owner_id     uuid;
  card_name    text;
  card_type    text;
  card_owner   uuid;
  case_title   text;
  client_name  text;
  client_type  text;
  amt          numeric(12,2);
  req_id       text;
  meta         jsonb;
  created      public.payments%rowtype;
begin
  if p_actor is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 100
     or p_amount_halalas is null or p_amount_halalas <= 0 or p_amount_halalas > 999999999999
     or (p_fee_type is not null and p_fee_type not in ('full', 'partial'))
     or (p_client_type is not null and p_client_type not in ('individual', 'company'))
     or length(coalesce(p_client_name, '')) > 200
     or length(coalesce(p_description, '')) > 2000
     or length(coalesce(p_case_title, '')) > 300 then
    return jsonb_build_object('code', 'invalid');
  end if;
  amt := round(p_amount_halalas::numeric / 100, 2);

  -- 1. one form at a time per key
  perform pg_advisory_xact_lock(hashtext('create_lawyer_invoice:' || p_idempotency_key));

  -- 2. already issued by this form?
  select p.* into prior from public.payments p
   where (p.metadata ->> 'create_key') = p_idempotency_key;
  if found then
    if (prior.metadata ->> 'issued_by') = p_actor::text and prior.amount = amt then
      return jsonb_build_object('code', 'ok', 'replay', true, 'payment', to_jsonb(prior));
    end if;
    return jsonb_build_object('code', 'key_reused');
  end if;

  -- 3. ownership, before anything is written
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

  if p_lawyer_client_id is not null then
    select lc.name, lc.client_type, lc.owner_user_id into card_name, card_type, card_owner
      from public.lawyer_clients lc where lc.id = p_lawyer_client_id;
    if card_owner is distinct from p_actor then
      return jsonb_build_object('code', 'forbidden');
    end if;
    client_name := card_name;
    client_type := card_type;
  else
    -- 4. typed client: name and an explicit type
    client_name := btrim(coalesce(p_client_name, ''));
    client_type := p_client_type;
    if client_name = '' or client_type is null then
      return jsonb_build_object('code', 'invalid');
    end if;
  end if;

  -- 5. both rows, or neither (one function = one transaction)
  req_id := p_request_id;
  if req_id is null then
    req_id := gen_random_uuid()::text;
    insert into public.service_requests
      (id, requester_user_id, type, title, description, requester, receiver,
       assigned_to, status, payment, source_path, metadata)
    values
      (req_id, p_actor, 'service', 'فاتورة: ' || client_name, coalesce(p_description, ''),
       jsonb_build_object('name', client_name, 'role', 'client', 'tier', 'free'), 'lawyer',
       p_actor, 'completed', jsonb_build_object('amount', amt, 'status', 'not_required'), '',
       jsonb_build_object('invoice', true));
  end if;

  meta := jsonb_build_object(
    'invoice', true,
    'client', client_name,
    'clientType', client_type,
    'description', coalesce(nullif(btrim(coalesce(p_description, '')), ''), 'أتعاب قانونية'),
    'issued_by', p_actor,
    'feeType', coalesce(p_fee_type, 'full'),
    'create_key', p_idempotency_key);
  if p_lawyer_client_id is not null then
    meta := meta || jsonb_build_object('clientId', p_lawyer_client_id);
  end if;
  if p_case_id is not null then
    meta := meta || jsonb_build_object('caseId', p_case_id, 'caseTitle', case_title);
  elsif nullif(btrim(coalesce(p_case_title, '')), '') is not null then
    meta := meta || jsonb_build_object('caseTitle', btrim(p_case_title));
  end if;

  insert into public.payments (id, request_id, provider, amount, currency, status, metadata)
  values (gen_random_uuid()::text, req_id, 'manual', amt, 'SAR', 'requires_payment', meta)
  returning * into created;

  return jsonb_build_object('code', 'ok', 'replay', false, 'payment', to_jsonb(created));
end;
$$;

comment on function public.create_lawyer_invoice(uuid, text, bigint, text, text, uuid, text, text, text, text, text) is
  'Issues one manual lawyer invoice (placeholder request + payments row) in one transaction, once per idempotency key, after ownership of the request / case / CRM card is checked (20261030_20, CODE-F22 / CODE-F21). Service role only.';

revoke all on function public.create_lawyer_invoice(uuid, text, bigint, text, text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_lawyer_invoice(uuid, text, bigint, text, text, uuid, text, text, text, text, text)
  to service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  fn constant text := 'public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)';
  role_name text;
begin
  if to_regprocedure(fn) is null then
    raise exception '20261030_20 verify: % is missing', fn;
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure(fn)
                  and prosecdef and proconfig @> array['search_path=""']) then
    raise exception '20261030_20 verify: % is not SECURITY DEFINER with search_path ''''', fn;
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name)
       and has_function_privilege(role_name, fn, 'EXECUTE') then
      raise exception '20261030_20 verify: % can EXECUTE %', role_name, fn;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '20261030_20 verify: service_role cannot EXECUTE %', fn;
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_create_key_key') then
    raise exception '20261030_20 verify: payments_create_key_key is missing';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
