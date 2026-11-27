-- prelude_l18_access_admin_saved.sql — chain step (NOT a migration) for
-- l18_access_admin_saved.test.sql. An admin already SAVED the library switch
-- (updated_by set, consultant + firm closed, individual opened) and named the
-- firm in the free questions (0). 20261208_40 must change neither row.
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000018a1') on conflict do nothing;
insert into public.platform_settings (key, value, description, updated_by) values
  ('library_access_by_account_type',
   '{"lawyer": true, "consultant": false, "firm": false, "individual": true, "business": false, "provider": false}'::jsonb,
   'saved by an admin', '00000000-0000-4000-8000-0000000018a1'),
  ('free_questions_by_account_type', '{"lawyer": 10, "individual": 5, "firm": 0}'::jsonb, 'saved by an admin', null)
on conflict (key) do nothing;
