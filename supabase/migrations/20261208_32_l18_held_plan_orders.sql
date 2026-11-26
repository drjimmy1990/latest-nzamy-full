-- =============================================================================
-- Migration: 20261208_32_l18_held_plan_orders.sql   (verify id: l18_pay_held)
-- =============================================================================
-- PURPOSE (batch l18 — owner answer ٢٣٩, 27 Nov 2026): a lawyer or a firm may
--   pay for a professional plan before the licence is approved; the plan is
--   NOT activated until the admin approves (fulfilment stamps the paid order
--   with metadata.licence_pending = true and writes no subscription —
--   src/lib/payments/fulfillCore.ts / heldPlanActivation.ts). The buyer must
--   see that state on /dashboard/billing («بانتظار اعتماد التوثيق»), but
--   payment_orders.metadata is not granted to authenticated (20261022_10) —
--   and must stay so (it carries admin and gateway details).
--
--   public.my_licence_held_orders() → (id, item_id, billing, paid_at):
--     the CALLER's own paid plan orders held for the licence; nothing else of
--     the metadata. SECURITY DEFINER, search_path '', STABLE, keyed on
--     auth.uid() (no argument, so no one can ask about another account).
--     EXECUTE for authenticated only (and service_role); never anon.
--
-- PRIVILEGES: authenticated gets EXECUTE on this one function; no table grant
--   changes.
-- PREREQUISITES: 20261022_10 (payment_orders). The file stops with a clear
--   message without it.
-- ORDER: BEFORE the deploy of l18-pay's answers (the billing page calls it;
--   before it runs the page shows no held section — a failed read is ignored).
-- BACKFILL: none.
-- SAFE TO RE-RUN: yes (create or replace).
-- ROLLBACK: drop function if exists public.my_licence_held_orders();
-- =============================================================================

begin;
set local lock_timeout = '5s';

do $pre$
begin
  if to_regclass('public.payment_orders') is null then
    raise exception '20261208_32: public.payment_orders is missing (run 20261022_10_payments_core.sql first)';
  end if;
end
$pre$;

create or replace function public.my_licence_held_orders()
returns table (id uuid, item_id text, billing text, paid_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.item_id, o.billing, o.paid_at
    from public.payment_orders o
   where o.user_id = (select auth.uid())
     and o.status = 'paid'
     and o.kind = 'plan'
     and o.metadata ->> 'licence_pending' = 'true'
   order by o.paid_at desc nulls last
   limit 20
$$;

comment on function public.my_licence_held_orders() is
  '20261208_32 (l18, owner ٢٣٩): the caller''s own paid professional-plan orders held until the licence is approved (metadata.licence_pending) — id, item, billing, paid_at only. Authenticated only.';
revoke all on function public.my_licence_held_orders() from public, anon, authenticated;
grant execute on function public.my_licence_held_orders() to authenticated, service_role;

do $verify$
declare
  fn text := 'public.my_licence_held_orders()';
  missing text := '';
begin
  if to_regprocedure(fn) is null then
    missing := missing || ' my_licence_held_orders() is missing;';
  else
    if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_catalog.pg_proc where oid = to_regprocedure(fn)), false) then
      missing := missing || ' it is not SECURITY DEFINER with search_path = '''';';
    end if;
    if has_function_privilege('anon', fn, 'EXECUTE') then
      missing := missing || ' anon can EXECUTE it;';
    end if;
    if not has_function_privilege('authenticated', fn, 'EXECUTE') then
      missing := missing || ' authenticated cannot EXECUTE it;';
    end if;
    if position('auth.uid()' in pg_get_functiondef(to_regprocedure(fn))) = 0 then
      missing := missing || ' it is not keyed on auth.uid();';
    end if;
  end if;
  if has_column_privilege('authenticated', 'public.payment_orders', 'metadata', 'SELECT') then
    missing := missing || ' authenticated can read payment_orders.metadata;';
  end if;
  if missing <> '' then
    raise exception 'l18_pay_held verify:%', missing;
  end if;
  raise notice 'l18_pay_held verify: OK — my_licence_held_orders() (definer, own rows by auth.uid(), authenticated only); payment_orders.metadata still not readable by a session';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261208_32 l18 held plan orders (the buyer sees «بانتظار اعتماد التوثيق»)' as migration,
       to_regprocedure('public.my_licence_held_orders()') is not null
       and not has_function_privilege('anon', 'public.my_licence_held_orders()', 'EXECUTE') as ok;
