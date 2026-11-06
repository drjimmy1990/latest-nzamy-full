-- prelude_newclient_flag_untick.sql — part of the chain of
-- newclient_first_order_flag.test.sql (see its header). Runs after the FIRST
-- 20261103_21 run: asserts (a) and (b), then plays an admin who un-ticks
-- «للطلب المدفوع الأول فقط» on the coupons page (S6-T12: metadata keeps every
-- key, the flag becomes false), and snapshots NEWCLIENT for (c).
do $$
declare m jsonb;
begin
  select metadata into m from public.coupons where upper(code) = 'NEWCLIENT';
  if m->'first_paid_order_only' is distinct from 'true'::jsonb or m->>'first_order_rule' is distinct from '20261103_21' then
    raise exception 'T1 FAIL (a): after 20261103_21 NEWCLIENT has first_paid_order_only % and first_order_rule %, expected true / 20261103_21',
      coalesce(m->>'first_paid_order_only', 'absent'), coalesce(m->>'first_order_rule', 'absent');
  end if;
  if not (m ? 'owner_rules' and m ? 'rules') or m->>'status' is distinct from 'active' then
    raise exception 'T2 FAIL (b): NEWCLIENT lost a metadata key: %', m;
  end if;
  raise notice 'T1 PASS (a): NEWCLIENT first_paid_order_only = true, first_order_rule = 20261103_21';
  raise notice 'T2 PASS (b): owner_rules, rules and status kept';
end $$;

update public.coupons
   set metadata = metadata || '{"first_paid_order_only": false}'::jsonb, updated_at = now()
 where upper(code) = 'NEWCLIENT';

drop table if exists public._t_nc_unticked;
create table public._t_nc_unticked as
  select id, xmin::text as x, metadata, updated_at from public.coupons where upper(code) = 'NEWCLIENT';
