-- prelude_l18_billing_vat.sql — a test-fixture VAT number (the l16 fixture value) in billing_company before
-- 20261208_31 runs, so l18_pay_free_activation.test.sql proves the file never touches it.
update public.platform_settings
   set value = jsonb_set(value, '{vat_number}', '"300000000000003"'::jsonb)
 where key = 'billing_company';
