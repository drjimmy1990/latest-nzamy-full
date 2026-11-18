-- prelude_payref_l8_between_runs.sql — runs between the two runs of
-- 20261128_10 (payref_settings_l8.test.sql). First it proves what the first
-- run seeded on the l7 state; then an admin edits the three settings, and the
-- second run must keep his values.
do $$ declare v jsonb; begin
  select value into v from public.platform_settings where key = 'founder_topup_discount_expires';
  if v is distinct from '{"months_after_activation": 12}'::jsonb then
    raise exception 'B1 FAIL: the discount length seed is not the membership year: %', v;
  end if;
  select value into v from public.platform_settings where key = 'firm_extra_seat_price_sar';
  if v is distinct from '{"sar": null}'::jsonb then raise exception 'B1 FAIL: the extra-seat price seed: %', v; end if;
  select value into v from public.platform_settings where key = 'min_topup_by_account_type';
  if v ->> 'individual' is distinct from '100' or v ->> 'lawyer' is distinct from '500' then
    raise exception 'B1 FAIL: the individual minimum was not merged into the l7 map: %', v;
  end if;
  raise notice 'payref_settings_l8: B1 (first run on the l7 state) PASS';
end $$;

update public.platform_settings set value = jsonb_set(value, '{individual}', '150'::jsonb) where key = 'min_topup_by_account_type';
update public.platform_settings set value = '{"until": "2027-12-31"}'::jsonb where key = 'founder_topup_discount_expires';
update public.platform_settings set value = '{"sar": 450}'::jsonb where key = 'firm_extra_seat_price_sar';
