-- =============================================================================
-- Migration: 20261030_10_invoice_collections_atomic.sql
-- =============================================================================
-- PURPOSE (owner handoff 2026-10-30, CODE-F02 / LIVE-F36 — P0)
--   Recording a collected payment on a lawyer's manual invoice used to be a
--   read in the browser and an overwrite on the server: the page added the
--   new payment to the paid total its form showed when it was opened, sent
--   that cumulative figure, and PATCH /api/v1/lawyer/finance stored it in
--   payments.metadata.paidAmount with no lock and no comparison.
--   The owner's reproduction on invoice 427ca382…: two forms open at
--   450 paid / 550 left. The first saves 300 → 750 / 250. The second saves
--   400 — more than the 250 left — and is accepted: 850 / 150. The first
--   payment is gone.
--
-- WHAT IT CREATES (idempotent — safe to run any number of times)
--   public.invoice_collections — one row per payment collected on an invoice:
--     payment_id, amount, method (cash | bank_transfer), the paid total
--     before and after it, who recorded it, when, and the form's
--     idempotency_key (UNIQUE: one form submission is one payment, however
--     many times the browser retries it).
--   public.record_invoice_collection(p_payment_id text, p_actor uuid,
--       p_amount_halalas bigint, p_method text,
--       p_expected_paid_halalas bigint, p_idempotency_key text) RETURNS jsonb
--     In ONE transaction:
--       1. SELECT … FOR UPDATE on the payments row (a second form waits here
--          until the first has committed, then reads the new total);
--       2. the row must hang off a service_request assigned to p_actor
--          ('forbidden' otherwise; 'not_found' when there is no such row);
--       3. the same idempotency key again → the first answer, nothing added
--          ('ok' + replay); the key on another payment/amount → 'key_reused';
--       4. status must still be requires_payment ('not_collectable');
--       5. the paid total the form saw must still be the paid total
--          ('stale' otherwise — the owner's second form is refused here,
--          whatever its amount);
--       6. the payment may not exceed what is left ('exceeds_remaining');
--       7. insert the collection row, ADD the payment to
--          metadata.paidAmount (riyals, as the page has always read it),
--          stamp paidMethod / paidAt / collected_by, and set status 'paid'
--          when nothing is left.
--     Refusals come back as {"code": …} rather than raised errors, with the
--     current paid_halalas / remaining_halalas so the page can say what is
--     left. Amounts travel in halalas (bigint) — no float ever reaches money.
--
--   Rounding: metadata.paidAmount was built by float addition in the browser
--   until now, so a stored value may carry noise (e.g. 750.0000000004). The
--   snapshot comparison therefore allows less than one halala of difference,
--   and the new total is written rounded to 2 decimals.
--
-- WHO CAN DO WHAT
--   The function: SECURITY DEFINER, search_path ''. EXECUTE for service_role
--   only (revoked from PUBLIC, anon, authenticated). The route checks the
--   session and passes the user id as p_actor; the function re-checks
--   ownership under the lock.
--   invoice_collections: RLS on. SELECT for the lawyer the invoice's request
--   is assigned to; no INSERT / UPDATE / DELETE for anon or authenticated —
--   the only way in is the function.
--
-- WHAT IT DOES NOT DO
--   No backfill. Payments collected before this file ran have no ledger row;
--   the first new row's paid_before shows the total they reached. Nothing in
--   payments is altered or dropped. The admin receipts table
--   (public.receipts, 20260826) is NOT used: it feeds the platform's own
--   revenue screen, and a lawyer's fee from his client is not platform
--   revenue.
--
-- DEPLOY ORDER — BEFORE THE DEPLOY
--   Additive. The old code keeps working while this exists (it never calls
--   the function). The new code calls it; without it PATCH answers 503
--   «تسجيل التحصيل غير متاح مؤقتاً» and writes nothing — it never falls back
--   to the old overwrite.
--
-- ROLLBACK
--   drop function if exists public.record_invoice_collection(text, uuid, bigint, text, bigint, text);
--   drop table if exists public.invoice_collections;
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.payments') is null then
    raise exception '20261030_10: public.payments does not exist — run 20260518_client_workflow_backend_ready first';
  end if;
  if to_regclass('public.service_requests') is null then
    raise exception '20261030_10: public.service_requests does not exist — run 20260518_client_workflow_backend_ready first';
  end if;
end $$;

create table if not exists public.invoice_collections (
  id                  bigserial primary key,
  -- Cascade with the invoice: payments rows themselves cascade from their
  -- service_request, and a ledger row without its invoice has no meaning.
  payment_id          text not null references public.payments(id) on delete cascade,
  amount              numeric(12,2) not null check (amount > 0),
  method              text not null check (method in ('cash', 'bank_transfer')),
  paid_before         numeric(12,2) not null check (paid_before >= 0),
  paid_after          numeric(12,2) not null check (paid_after > 0),
  idempotency_key     text not null check (length(idempotency_key) between 8 and 100),
  collected_by        uuid references auth.users(id) on delete set null,
  collected_at        timestamptz not null default now()
);

create unique index if not exists invoice_collections_idempotency_key_key
  on public.invoice_collections (idempotency_key);
create index if not exists invoice_collections_payment_id_idx
  on public.invoice_collections (payment_id, collected_at);

alter table public.invoice_collections enable row level security;

revoke all on public.invoice_collections from public, anon, authenticated;
grant select on public.invoice_collections to authenticated;
grant all on public.invoice_collections to service_role;
revoke all on sequence public.invoice_collections_id_seq from public, anon, authenticated;

drop policy if exists "invoice_collections_select_assigned" on public.invoice_collections;
create policy "invoice_collections_select_assigned" on public.invoice_collections
  for select
  using (
    exists (
      select 1
        from public.payments p
        join public.service_requests sr on sr.id = p.request_id
       where p.id = invoice_collections.payment_id
         and sr.assigned_to = auth.uid()
    )
  );

comment on table public.invoice_collections is
  'One row per payment collected on a lawyer invoice; written only by record_invoice_collection (20261030_10, CODE-F02 / LIVE-F36).';

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

  -- 1. lock the invoice. A concurrent call waits here and then reads the
  --    committed row, so its checks below see the first payment.
  select p.* into pay
    from public.payments p
   where p.id = p_payment_id
     for update;
  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;

  -- 2. ownership: payments has no lawyer column; the request carries it.
  select sr.assigned_to into owner_id
    from public.service_requests sr
   where sr.id = pay.request_id;
  if owner_id is distinct from p_actor then
    return jsonb_build_object('code', 'forbidden');
  end if;

  total := round(pay.amount, 2);
  raw_paid := case when jsonb_typeof(pay.metadata -> 'paidAmount') = 'number'
                   then (pay.metadata ->> 'paidAmount')::numeric else 0 end;
  if pay.status = 'paid' then raw_paid := total; end if;
  paid := round(raw_paid, 2);
  remaining := greatest(total - paid, 0);

  -- 3. the same form submitted again (a retry, a double click that got
  --    through): answer what the first submission did, add nothing.
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

  -- 4. only an open invoice collects.
  if pay.status <> 'requires_payment' then
    return jsonb_build_object('code', 'not_collectable',
      'paid_halalas', (paid * 100)::bigint,
      'remaining_halalas', (remaining * 100)::bigint);
  end if;

  -- 5. the form's snapshot must still be true (under one halala of float
  --    noise left by the old browser-side addition).
  if abs(raw_paid * 100 - p_expected_paid_halalas) >= 1 then
    return jsonb_build_object('code', 'stale',
      'paid_halalas', (paid * 100)::bigint,
      'remaining_halalas', (remaining * 100)::bigint);
  end if;

  -- 6. never more than what is left.
  amt := round(p_amount_halalas::numeric / 100, 2);
  if amt > remaining then
    return jsonb_build_object('code', 'exceeds_remaining',
      'paid_halalas', (paid * 100)::bigint,
      'remaining_halalas', (remaining * 100)::bigint);
  end if;

  -- 7. record and add.
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
  'Records one collected payment on a lawyer invoice under a row lock: owner, open status, form snapshot, remaining balance and idempotency are checked before the amount is ADDED (20261030_10, CODE-F02 / LIVE-F36). Service role only.';

revoke all on function public.record_invoice_collection(text, uuid, bigint, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.record_invoice_collection(text, uuid, bigint, text, bigint, text)
  to service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  fn constant text := 'public.record_invoice_collection(text,uuid,bigint,text,bigint,text)';
  role_name text;
begin
  if to_regprocedure(fn) is null then
    raise exception '20261030_10 verify: % is missing', fn;
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure(fn)
                  and prosecdef and proconfig @> array['search_path=""']) then
    raise exception '20261030_10 verify: % is not SECURITY DEFINER with search_path ''''', fn;
  end if;
  foreach role_name in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      if has_function_privilege(role_name, fn, 'EXECUTE') then
        raise exception '20261030_10 verify: % can EXECUTE %', role_name, fn;
      end if;
      if has_table_privilege(role_name, 'public.invoice_collections', 'INSERT')
         or has_table_privilege(role_name, 'public.invoice_collections', 'UPDATE')
         or has_table_privilege(role_name, 'public.invoice_collections', 'DELETE') then
        raise exception '20261030_10 verify: % can write public.invoice_collections', role_name;
      end if;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '20261030_10 verify: service_role cannot EXECUTE %', fn;
  end if;
  if not exists (select 1 from pg_class where oid = 'public.invoice_collections'::regclass and relrowsecurity) then
    raise exception '20261030_10 verify: RLS is off on public.invoice_collections';
  end if;
end $$;

commit;

notify pgrst, 'reload schema';
