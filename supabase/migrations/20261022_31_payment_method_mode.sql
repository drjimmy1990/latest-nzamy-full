-- Saved card tokens belong to one merchant and one test/live mode.
-- A legacy row with no reliable payment provenance stays NULL; deletion
-- refuses it instead of sending the token to the currently configured key.
begin;

alter table public.payment_methods add column if not exists live boolean;

-- Recover mode only where subscriptions link the card to verified orders
-- and all linked orders agree. No default guesses for existing tokens.
with modes as (
  select s.payment_method_id, bool_and(o.live) as live
    from public.subscriptions s
    join public.payment_orders o on o.id::text = s.metadata ->> 'order_id'
    join public.payment_methods pm on pm.id::text = s.payment_method_id
   where o.live is not null and o.user_id = pm.user_id and o.merchant = pm.merchant
   group by s.payment_method_id
  having bool_and(o.live) = bool_or(o.live)
)
update public.payment_methods pm set live = modes.live
  from modes where pm.id::text = modes.payment_method_id and pm.live is null;

-- This column stays server-only. Effective privileges matter after restore.
revoke all on public.payment_methods from public, anon, authenticated;
grant select (id,user_id,merchant,brand,last_four,exp_month,exp_year,status,created_at)
  on public.payment_methods to authenticated;
grant all on public.payment_methods to service_role;

do $$
declare col text;
begin
  if not exists (select 1 from pg_attribute where attrelid = 'public.payment_methods'::regclass
                  and attname = 'live' and not attisdropped and atttypid = 'boolean'::regtype) then
    raise exception '20261022_31: payment_methods.live missing';
  end if;
  if not has_column_privilege('service_role', 'public.payment_methods', 'live', 'INSERT') then
    raise exception '20261022_31: service_role cannot write mode';
  end if;
  for col in select attname from pg_attribute where attrelid = 'public.payment_methods'::regclass
              and attnum > 0 and not attisdropped loop
    if has_column_privilege('anon', 'public.payment_methods', col, 'SELECT')
       or has_column_privilege('authenticated', 'public.payment_methods', col, 'INSERT')
       or has_column_privilege('authenticated', 'public.payment_methods', col, 'UPDATE')
       or (col not in ('id','user_id','merchant','brand','last_four','exp_month','exp_year','status','created_at')
           and has_column_privilege('authenticated', 'public.payment_methods', col, 'SELECT')) then
      raise exception '20261022_31: unexpected effective privilege on %', col;
    end if;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';
