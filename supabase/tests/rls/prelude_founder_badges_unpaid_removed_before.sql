-- Runs AFTER prelude_founder_no_signup_grant_before.sql (f1 signed up during
-- the campaign, badge + lib-founder grant) and BEFORE 20261026_01 in
-- founder_badges_unpaid_removed.test.sql. NOT a migration; it never ships.
--   1. a second lawyer (…f4) signs up before the fix — badge + grant too;
--   2. b1 (a lawyer from before 20261021_50) holds an unrelated admin library
--      grant, so "grants untouched" covers more than lib-founder rows;
--   3. every library_access_grants row is copied to _t_grants_before: the
--      final test compares the table row for row (each chain file is its own
--      psql session, so a temp table would not survive).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f4', 'f4@example.test', '{"user_type":"lawyer","full_name":"محامٍ ٤"}'::jsonb);

insert into public.library_access_grants (user_id, plan_ref, source, starts_at, ends_at)
values ('00000000-0000-0000-0000-0000000000b1', 'lib-admin', 'admin', now() - interval '1 day', now() + interval '30 days');

do $$
begin
  if (select count(*) from public.lawyer_profiles where founder_badge) <> 2
     or (select count(*) from public.library_access_grants
          where plan_ref = 'lib-founder' and source = 'founder_campaign'
            and user_id in ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000f4')
            and ends_at > now()) <> 2 then
    raise exception 'BEFORE-02 FAIL: expected f1 and f4 to hold the badge and one running lib-founder grant each';
  end if;
  raise notice 'BEFORE-02: f1 and f4 signed up during the campaign before the fix — 2 unpaid badges, 2 running lib-founder grants (positive control)';
end $$;

create table public._t_grants_before as select * from public.library_access_grants;
