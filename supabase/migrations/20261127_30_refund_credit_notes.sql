-- =============================================================================
-- Migration: 20261127_30_refund_credit_notes.sql
-- =============================================================================
-- PURPOSE (batch l7, decision 10; owner 18 Nov 2026: «يُردّ المبلغ كاملاً
-- شاملاً الضريبة إلى وسيلة الدفع نفسها بلا خصم أي رسوم، ويصدر إشعار دائن»)
--
--   A VAT credit note for every reversal of a platform payment — a refund or
--   a void. The simplified tax invoice of a paid order is shown from the
--   moment it is paid (its number is the order's receipt_number), so a void
--   inside the 90-minute window reverses an invoice that was already issued
--   and gets a credit note too.
--
--   public.payment_credit_note_seq + public.payment_credit_notes
--     number            'CN-<Riyadh year of issue>-<at least 6 digits>' (one
--                       sequence for all years; never truncated)
--     order_id          UNIQUE → payment_orders(id): one credit note per order
--     invoice_number    the original invoice (= payment_orders.receipt_number)
--     invoice_issued_at the original invoice's time (= paid_at)
--     method            'refund' | 'void' (from the order's final status)
--     net / vat / total the full amounts of the order (a refund is always the
--                       whole total incl. VAT, no fee); total = net + vat
--     issued_at         the order's refunded_at (when the money went back)
--
--   public.issue_payment_credit_note(p_order uuid) → jsonb (the row)
--     SECURITY DEFINER, search_path ''. Idempotent: locks the order, returns
--     the existing note when there is one, else issues it. Refuses (22023)
--     an order that is not refunded/voided, not merchant 'platform', has no
--     receipt_number, or was not refunded in full. Called by the refund code
--     right after finish_payment_refund (src/lib/payments/refundCore.ts) and
--     by the admin «إصدار الإشعار الدائن» action for any gap.
--
--   BACKFILL: every refunded / voided platform order with a receipt number
--   and no note gets one now, in refunded_at order (issued_at = refunded_at).
--   Test-mode orders (live false) included: their note carries live false and
--   shows «تجريبي».
--
-- WHO CAN DO WHAT
--   * payment_credit_notes: RLS on; a signed-in user SELECTs his own rows
--     (policy "own credit notes"); no session writes; service_role ALL.
--   * issue_payment_credit_note + the sequence: service_role only.
--
-- HOW TO RUN
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_30_refund_credit_notes.sql
--
-- RUN ORDER — BEFORE OR AFTER THE DEPLOY (either works)
--   The code works without it: a refund still completes and logs
--   «credit note not issued»; the user's payments page shows no credit-note
--   link and the credit-note page says it is not issued yet; the admin orders
--   page offers «إصدار الإشعار الدائن», which works once this file has run.
--   Running it AFTER the deploy backfills every refund made in between.
--
-- ROLLBACK (deletes every issued credit note — they are tax documents; do
-- this only before any was handed to a customer)
--   drop function if exists public.issue_payment_credit_note(uuid);
--   drop table if exists public.payment_credit_notes;
--   drop sequence if exists public.payment_credit_note_seq;
-- =============================================================================

begin;

create sequence if not exists public.payment_credit_note_seq;

create table if not exists public.payment_credit_notes (
  id                 uuid primary key default gen_random_uuid(),
  number             text not null constraint payment_credit_notes_number_key unique,
  order_id           uuid not null constraint payment_credit_notes_order_id_key unique
                     references public.payment_orders(id),
  user_id            uuid null references auth.users(id) on delete set null,
  invoice_number     text not null,
  invoice_issued_at  timestamptz not null,
  item_id            text not null,
  billing            text,
  method             text not null constraint payment_credit_notes_method_check check (method in ('refund', 'void')),
  net_halalas        int  not null constraint payment_credit_notes_net_check check (net_halalas >= 0),
  vat_halalas        int  not null constraint payment_credit_notes_vat_check check (vat_halalas >= 0),
  total_halalas      int  not null,
  currency           text not null default 'SAR',
  live               boolean not null,
  issued_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint payment_credit_notes_total_check check (total_halalas > 0 and total_halalas = net_halalas + vat_halalas)
);

create index if not exists payment_credit_notes_user_idx on public.payment_credit_notes (user_id, issued_at desc);

comment on table public.payment_credit_notes is
  'VAT credit note for each refunded / voided platform order (20261127_30, batch l7). One per order; written only by issue_payment_credit_note (service role); a user reads his own.';

alter table public.payment_credit_notes enable row level security;
drop policy if exists "own credit notes" on public.payment_credit_notes;
create policy "own credit notes" on public.payment_credit_notes
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.payment_credit_notes from public, anon, authenticated;
grant select (id, number, order_id, user_id, invoice_number, invoice_issued_at, item_id, billing, method,
              net_halalas, vat_halalas, total_halalas, currency, live, issued_at, created_at)
  on public.payment_credit_notes to authenticated;
grant all on public.payment_credit_notes to service_role;

revoke all on sequence public.payment_credit_note_seq from public, anon, authenticated;
grant usage, select on sequence public.payment_credit_note_seq to service_role;

create or replace function public.issue_payment_credit_note(p_order uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  o     public.payment_orders%rowtype;
  n     public.payment_credit_notes%rowtype;
  v_at  timestamptz;
begin
  if p_order is null then
    raise exception 'issue_payment_credit_note: p_order is required' using errcode = '22023';
  end if;
  -- the order lock first: two callers serialise here, the second finds the note
  select * into o from public.payment_orders where id = p_order for update;
  if not found then
    raise exception 'credit_note_order_missing' using errcode = '22023';
  end if;
  select * into n from public.payment_credit_notes where order_id = p_order;
  if found then
    return to_jsonb(n) || jsonb_build_object('duplicate', true);
  end if;
  if o.status not in ('refunded', 'voided') or o.merchant <> 'platform' or o.receipt_number is null
     or o.paid_at is null or o.live is null then
    raise exception 'credit_note_not_applicable' using errcode = '22023';
  end if;
  if o.refunded_halalas is distinct from o.total_halalas or o.total_halalas <> o.net_halalas + o.vat_halalas then
    raise exception 'credit_note_not_full_refund' using errcode = '22023';
  end if;
  v_at := coalesce(o.refunded_at, now());
  insert into public.payment_credit_notes
    (number, order_id, user_id, invoice_number, invoice_issued_at, item_id, billing, method,
     net_halalas, vat_halalas, total_halalas, currency, live, issued_at)
  values
    ('CN-' || to_char(v_at at time zone 'Asia/Riyadh', 'YYYY') || '-'
       || lpad(nextval('public.payment_credit_note_seq')::text, 6, '0'),
     o.id, o.user_id, o.receipt_number, o.paid_at, o.item_id, o.billing,
     case o.status when 'voided' then 'void' else 'refund' end,
     o.net_halalas, o.vat_halalas, o.total_halalas, o.currency, o.live, v_at)
  returning * into n;
  return to_jsonb(n) || jsonb_build_object('duplicate', false);
end;
$$;

comment on function public.issue_payment_credit_note(uuid) is
  'Issues (once) the VAT credit note of a refunded / voided platform order and returns it; idempotent (20261127_30). Service role only.';

revoke all on function public.issue_payment_credit_note(uuid) from public, anon, authenticated;
grant execute on function public.issue_payment_credit_note(uuid) to service_role;

-- ── Backfill: reversals made before this file ran ───────────────────────────
do $backfill$
declare r record;
begin
  for r in
    select o.id from public.payment_orders o
     where o.status in ('refunded', 'voided') and o.merchant = 'platform'
       and o.receipt_number is not null and o.paid_at is not null and o.live is not null
       and o.refunded_halalas = o.total_halalas
       and not exists (select 1 from public.payment_credit_notes c where c.order_id = o.id)
     order by o.refunded_at nulls last, o.created_at, o.id
  loop
    perform public.issue_payment_credit_note(r.id);
  end loop;
end
$backfill$;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
declare fn regprocedure := to_regprocedure('public.issue_payment_credit_note(uuid)');
begin
  if to_regclass('public.payment_credit_notes') is null or fn is null then
    raise exception '20261127_30 verify: payment_credit_notes or issue_payment_credit_note is missing';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.payment_credit_notes'::regclass) then
    raise exception '20261127_30 verify: RLS is off on payment_credit_notes';
  end if;
  if (select count(*) from pg_catalog.pg_policy where polrelid = 'public.payment_credit_notes'::regclass) <> 1
     or not exists (select 1 from pg_catalog.pg_policy
                     where polrelid = 'public.payment_credit_notes'::regclass and polname = 'own credit notes' and polcmd = 'r') then
    raise exception '20261127_30 verify: payment_credit_notes must have exactly the own-rows SELECT policy';
  end if;
  if not exists (select 1 from pg_catalog.pg_proc where oid = fn and prosecdef and proconfig @> array['search_path=""']) then
    raise exception '20261127_30 verify: issue_payment_credit_note is not SECURITY DEFINER with search_path ''''';
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')
     or not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '20261127_30 verify: issue_payment_credit_note must be service role only';
  end if;
  if has_table_privilege('anon', 'public.payment_credit_notes', 'SELECT')
     or has_table_privilege('authenticated', 'public.payment_credit_notes', 'INSERT')
     or has_table_privilege('authenticated', 'public.payment_credit_notes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.payment_credit_notes', 'DELETE') then
    raise exception '20261127_30 verify: a session may write payment_credit_notes, or a guest may read it';
  end if;
  if exists (select 1 from public.payment_orders o
              where o.status in ('refunded', 'voided') and o.merchant = 'platform'
                and o.receipt_number is not null and o.paid_at is not null and o.live is not null
                and o.refunded_halalas = o.total_halalas
                and not exists (select 1 from public.payment_credit_notes c where c.order_id = o.id)) then
    raise exception '20261127_30 verify: a refunded platform order has no credit note after the backfill';
  end if;
  raise notice '20261127_30 verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261127_30 refund credit notes (payment_credit_notes + issue_payment_credit_note, backfilled)' as step,
       (to_regclass('public.payment_credit_notes') is not null
        and to_regprocedure('public.issue_payment_credit_note(uuid)') is not null
        and not has_function_privilege('authenticated', 'public.issue_payment_credit_note(uuid)', 'EXECUTE')
        and not exists (select 1 from public.payment_orders o
                         where o.status in ('refunded', 'voided') and o.merchant = 'platform'
                           and o.receipt_number is not null and o.paid_at is not null and o.live is not null
                           and o.refunded_halalas = o.total_halalas
                           and not exists (select 1 from public.payment_credit_notes c where c.order_id = o.id))) as ok;
