-- prelude_payref_l8_before.sql — the batch l7 state 20261128_10 meets on
-- production: founder_topup_discount_bps with its «lifetime» description
-- (20261127_10) and min_topup_by_account_type without an individual key
-- (20261127_40). Used by payref_settings_l8.test.sql.
insert into public.platform_settings (key, value, description) values
  ('founder_topup_discount_bps', '1500'::jsonb,
   'خصم العضو المؤسس على شحن النقاط بنقاط الأساس (١٥٠٠ = ١٥٪)، مدى الحياة ما لم يُسترد المقعد أو يُلغَ (20261127_10)'),
  ('min_topup_by_account_type',
   '{"lawyer": 500, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500}'::jsonb,
   'الحد الأدنى للشحن (20261127_40)')
on conflict (key) do nothing;
