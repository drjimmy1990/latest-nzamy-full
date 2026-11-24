-- prelude_l14_pricing_before.sql — runs right before the FIRST 20261204_20 in
-- l14_pricing.test.sql's chain. It sets the states the file must handle:
--   - founder_invites stored with points_scope 'general' (an admin's old choice);
--   - a redeemed founder invite whose gift lot sits in the general wallet;
--   - admin_pricing_catalog 'appeal' edited by an admin to 2,222 (must be kept);
--   - users for the refund case (a buyer of the bundle) and the founder.
\set ON_ERROR_STOP on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000014a1'),
  ('00000000-0000-0000-0000-0000000014a2')
on conflict do nothing;
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-0000000014a1', 'lawyer'),
  ('00000000-0000-0000-0000-0000000014a2', 'lawyer')
on conflict do nothing;

update public.platform_settings
   set value = value || '{"points_scope": "general"}'::jsonb
 where key = 'founder_invites';

insert into public.points_lots (id, user_id, source, points_total, points_left, expires_at, wallet_scope)
values ('00000000-0000-0000-0000-0000000014b1', '00000000-0000-0000-0000-0000000014a2', 'gift', 50, 50,
        now() + interval '30 days', 'general');
insert into public.founder_invites (code, founder_user_id, month_key, expires_at, redeemed_by, redeemed_at, lot_id)
values ('00000000000014A1', '00000000-0000-0000-0000-0000000014a1', '2026-11', now() + interval '30 days',
        '00000000-0000-0000-0000-0000000014a2', now(), '00000000-0000-0000-0000-0000000014b1');

update public.admin_pricing_catalog set base_price = 2222 where service_id = 'appeal';

do $$
begin
  if (select founder_invite_settings.points_scope from public.founder_invite_settings()) <> 'general' then
    raise exception 'PRELUDE FAIL: 20261203_20 should still answer general here';
  end if;
  if (select base_price from public.admin_pricing_catalog where service_id = 'file-lawsuit') <> 1600
     or (select base_price from public.admin_pricing_catalog where service_id = 'ai-consult') <> 49 then
    raise exception 'PRELUDE FAIL: the 20260518 seed is not the one this file replaces';
  end if;
end $$;
