-- prelude_l18_access.sql — chain step (NOT a migration) for
-- l18_access.test.sql. Runs after 20260627_platform_settings.sql. Seeds the
-- two rows exactly as 20261128_20 and 20261127_40 seeded them (no admin has
-- saved either), so 20261208_40 must change both — once.
insert into public.platform_settings (key, value, description) values
  ('library_access_by_account_type',
   '{"lawyer": true, "consultant": false, "firm": false, "individual": false, "business": false, "provider": false}'::jsonb,
   'seed as 20261128_20'),
  ('free_questions_by_account_type', '{"lawyer": 10, "individual": 5}'::jsonb, 'seed as 20261127_40')
on conflict (key) do nothing;

-- The l18_access block of _verify.sql must print f here (before 20261208_40).
create table if not exists public.l18_access_verify_before (check_name text, ok boolean);
insert into public.l18_access_verify_before
select 'library', coalesce((select ps.updated_by is not null
                                   or ((ps.value -> 'lawyer') = 'true'::jsonb
                                       and (ps.value -> 'consultant') = 'true'::jsonb
                                       and (ps.value -> 'firm') = 'true'::jsonb)
                              from public.platform_settings ps
                             where ps.key = 'library_access_by_account_type'), false)
union all
select 'free_questions', coalesce((select ps.value ? 'firm' from public.platform_settings ps
                                    where ps.key = 'free_questions_by_account_type'), false);
