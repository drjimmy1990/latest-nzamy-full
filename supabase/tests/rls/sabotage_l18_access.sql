-- NEGATIVE CONTROL for l18_access.test.sql (never a migration): closes the
-- consultant again on an unsaved switch, so the test must FAIL at A2.
update public.platform_settings
   set value = value || '{"consultant": false}'::jsonb
 where key = 'library_access_by_account_type';
