-- library_public_rulings_l9.setup.sql — a step of the library_public_rulings_l9
-- chain (not a migration): an admin has since set another value. The next run
-- of 20261129_50 must replace it (its header says so).
update public.platform_settings
   set value = '{"full":3}'::jsonb, updated_at = '2000-01-01'
 where key = 'public_full_rulings_per_collection';
