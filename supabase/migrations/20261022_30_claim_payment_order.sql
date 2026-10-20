-- =============================================================================
-- Migration: 20261022_30_claim_payment_order.sql
-- =============================================================================
-- PURPOSE (Moyasar payments B1, Task 5 — fulfilment grants exactly once)
--   The one step that turns an order paid. The callback page, the webhook and
--   the sweep may all see the same paid payment at once; only the first of
--   them may claim the order. The claim is ONE conditional UPDATE that also
--   takes the receipt number, which PostgREST's update builder cannot express
--   (next_receipt_number() is a function call in the SET list), hence an RPC.
--
-- WHAT IT CREATES (idempotent — create or replace; safe to run any number of
-- times)
--   public.claim_payment_order(p_order uuid, p_payment_id text, p_live boolean)
--     RETURNS SETOF public.payment_orders
--     update public.payment_orders
--        set status = 'paid', moyasar_payment_id = p_payment_id, live = p_live,
--            paid_at = now(), receipt_number = public.next_receipt_number(),
--            updated_at = now()
--      where id = p_order and status in ('created', 'initiated')
--     returning *
--   One row: this call claimed the order and must grant. Zero rows: the order
--   was already claimed (or is closed, or does not exist) — grant nothing.
--   Under READ COMMITTED a second UPDATE that waited on the row lock re-checks
--   the WHERE against the committed 'paid' row and matches nothing, so two
--   concurrent claims never both return the row. A refused claim takes no
--   receipt number (the SET list is evaluated only for a matching row).
--   A payment id already on another order raises 23505
--   (payment_orders_moyasar_payment_id_key): one payment settles one order.
--
-- WHO CAN DO WHAT
--   SECURITY DEFINER, search_path ''. EXECUTE for service_role only (revoked
--   from PUBLIC, anon, authenticated): only the server claims an order.
--   A raising verify at the end checks the function, its shape and the
--   effective EXECUTE privileges.
--
-- PREREQUISITES (the file raises without them)
--   20261022_10 (public.payment_orders, public.next_receipt_number()).
--
-- DEPLOY ORDER — BEFORE THE DEPLOY (after 20261022_10 and 20261022_20)
--   The B1 code calls this function to claim a paid order. Without it the
--   claim answers 42883 / PGRST202 and fulfilment returns 'pending' (logged
--   once): nothing is granted and nothing breaks, but no payment completes
--   until this file has run.
--
-- ROLLBACK
--   drop function if exists public.claim_payment_order(uuid, text, boolean);
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.payment_orders') is null then
    raise exception '20261022_30: public.payment_orders does not exist — run 20261022_10 first';
  end if;
  if to_regprocedure('public.next_receipt_number()') is null then
    raise exception '20261022_30: public.next_receipt_number() does not exist — run 20261022_10 first';
  end if;
end $$;

create or replace function public.claim_payment_order(p_order uuid, p_payment_id text, p_live boolean)
returns setof public.payment_orders
language sql
volatile
security definer
set search_path = ''
as $$
  update public.payment_orders
     set status = 'paid',
         moyasar_payment_id = p_payment_id,
         live = p_live,
         paid_at = now(),
         receipt_number = public.next_receipt_number(),
         updated_at = now()
   where id = p_order
     and status in ('created', 'initiated')
  returning *;
$$;

comment on function public.claim_payment_order(uuid, text, boolean) is
  'Claims an open payment order as paid, with its receipt number, in one conditional UPDATE; one row = this call must grant, zero rows = already claimed (20261022_30, B1 Task 5). Service role only.';

revoke all on function public.claim_payment_order(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_payment_order(uuid, text, boolean) to service_role;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  fn      constant text := 'public.claim_payment_order(uuid, text, boolean)';
  r       text;
  cfg     text[];
  definer boolean;
  ret     text;
  def     text;
  missing text := '';
begin
  if to_regprocedure(fn) is null then
    raise exception '20261022_30 verify: % is missing', fn;
  end if;
  select proconfig, prosecdef, pg_get_function_result(oid) into cfg, definer, ret
    from pg_proc where oid = to_regprocedure(fn);
  if not coalesce(definer, false) or cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || ' the claim is not SECURITY DEFINER with search_path '''';';
  end if;
  if ret is distinct from 'SETOF payment_orders' then
    missing := missing || format(' the claim returns %s (expected SETOF payment_orders);', ret);
  end if;
  def := pg_get_functiondef(to_regprocedure(fn));
  if def !~* 'status\s+in\s*\(\s*''created''\s*,\s*''initiated''\s*\)'
     or def !~* 'receipt_number\s*=\s*public\.next_receipt_number\(\)' then
    missing := missing || ' the claim no longer re-checks the open statuses or takes the receipt number in the UPDATE;';
  end if;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE the claim;', r);
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    missing := missing || ' service_role cannot EXECUTE the claim;';
  end if;

  if missing <> '' then
    raise exception '20261022_30 verify:%', missing;
  end if;
  raise notice '20261022_30 verify: OK — claim_payment_order(uuid, text, boolean): one conditional UPDATE (created / initiated → paid, receipt number inside), SECURITY DEFINER, search_path '''', service role only';
end $$;

commit;

notify pgrst, 'reload schema';
