-- RLS acceptance test for 20261017_31_firm_reviews_opt_in.sql (owner decision
-- ٢٠: a firm's reviews are public only when its manager opts in; lawyer
-- reviews unchanged).
--
-- CHAIN (docker postgres:16-alpine) — the chain of
-- business_delegations.test.sql, which explains every link, with 20261017_31
-- in place of 20261017_30:
--
--   supabase/tests/rls/run.sh \
--     supabase/tests/rls/prelude_profiles_rls_chain.sql \
--     supabase/tests/rls/prelude_entity_rls_chain.sql \
--     supabase/migrations/20260603_phase1_001_profiles.sql \
--     supabase/migrations/20260614_auto_create_role_profiles.sql \
--     supabase/migrations/20260616_production_readiness_fixes.sql \
--     supabase/migrations/20260616_entities_setup_and_rls_fix.sql \
--     supabase/migrations/20260617_fix_remaining_rls.sql \
--     supabase/migrations/20260625_fix_rls_recursion.sql \
--     supabase/migrations/20260821_fix_provider_signup_sub_role.sql \
--     supabase/migrations/20260826_corporate_identity_persisted.sql \
--     supabase/migrations/20260903_phase2_clients_and_firm_membership.sql \
--     supabase/migrations/20260906_court_costs_and_firm_profile_fields.sql \
--     supabase/migrations/20260906_phase6_settings_out_of_browser.sql \
--     supabase/migrations/20260907_phase7_profile_services_reviews.sql \
--     supabase/migrations/20260914_entity_memberships_and_business_requests.sql \
--     supabase/migrations/20260921_03_entity_rls_recursion_fix.sql \
--     supabase/migrations/20260922_03_lawyer_provider_column_grants.sql \
--     supabase/migrations/20261016_02_profiles_members_write_lock.sql \
--     supabase/migrations/20261017_31_firm_reviews_opt_in.sql \
--     supabase/tests/rls/firm_reviews_opt_in.test.sql
--
-- WHAT IT PROVES
--   G1  NEGATIVE CONTROL — a guest reads a firm's active review only after the
--       firm opts in; before it, 0 rows (on a database without 20261017_31 the
--       guest reads 1 — the leak this file closes — and G1 fails).
--   G2  lawyer reviews are unchanged: guest and stranger read them, and the
--       lawyer's rating figures (lawyer_review_stats) too
--   P1  the reviewer and the reviewee (the firm) still read the firm review
--   S1  a guest cannot execute set_firm_public_reviews; a stranger and a lawyer
--       get 42501 from it; the firm account switches it and is recorded as
--       public_reviews_changed_by
--   S2  the firm cannot write public_reviews through REST (no column grant)
--   S3  switching off hides the reviews and the figures again
--   F1  firm_reviews_published answers for guests and is false for a lawyer
\pset format unaligned
\pset tuples_only on

create table if not exists public.user_settings (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── fixtures as postgres ────────────────────────────────────────────────────
--   F  dddddddd-…004  firm account (handle_new_user builds firm_profiles)
--   L  aaaaaaaa-…001  lawyer
--   C  cccccccc-…003  individual client, the reviewer
--   X  eeeeeeee-…005  individual, a stranger
insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000004', 'f@example.com', '{"user_type":"firm","company_name":"مكتب المحاماة"}'::jsonb),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'l@example.com', '{"user_type":"lawyer","display_name":"محامٍ"}'::jsonb),
  ('cccccccc-0000-0000-0000-000000000003', 'c@example.com', '{"user_type":"individual","display_name":"عميل"}'::jsonb),
  ('eeeeeeee-0000-0000-0000-000000000005', 'x@example.com', '{"user_type":"individual","display_name":"غريب"}'::jsonb);

do $$
begin
  if not exists (select 1 from public.firm_profiles where owner_user_id = 'dddddddd-0000-0000-0000-000000000004') then
    raise exception 'FIXTURE FAIL: handle_new_user built no firm_profiles row for F';
  end if;
  -- Guarded so the negative control (this chain WITHOUT 20261017_31) reaches
  -- G1 and fails on the leak itself, not here on a missing column.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'firm_profiles' and column_name = 'public_reviews')
     and (select (to_jsonb(f) ->> 'public_reviews')::boolean from public.firm_profiles f
           where f.owner_user_id = 'dddddddd-0000-0000-0000-000000000004') then
    raise exception 'FIXTURE FAIL: a new firm starts opted in';
  end if;
end $$;

insert into public.reviews (reviewer_id, reviewee_id, rating, title, body, status) values
  ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 2, 'تأخير', 'تقييم المكتب', 'active'),
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 5, 'ممتاز', 'تقييم المحامي', 'active');

revoke all on public.firm_profiles from app_user;

-- ── G1 / G2 as a guest, before any opt-in ───────────────────────────────────
set role anon;
select set_config('test.uid', '', false);
do $$
declare f int; l int; s int;
begin
  select count(*) into f from public.reviews where reviewee_id = 'dddddddd-0000-0000-0000-000000000004';
  select count(*) into l from public.reviews where reviewee_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into s from public.lawyer_review_stats where lawyer_user_id = 'dddddddd-0000-0000-0000-000000000004';
  if f <> 0 then raise exception 'G1 FAIL: a guest reads % review(s) of a firm that never opted in', f; end if;
  if s <> 0 then raise exception 'G1 FAIL: a guest reads the rating figures of a firm that never opted in'; end if;
  if l <> 1 then raise exception 'G2 FAIL: a guest reads % lawyer reviews (expected 1 — lawyer reviews must be unchanged)', l; end if;
  if (select review_count from public.lawyer_review_stats where lawyer_user_id = 'aaaaaaaa-0000-0000-0000-000000000001') <> 1 then
    raise exception 'G2 FAIL: the lawyer''s rating figures are not readable by a guest';
  end if;
  if public.firm_reviews_published('dddddddd-0000-0000-0000-000000000004') then
    raise exception 'F1 FAIL: firm_reviews_published is true before the opt-in';
  end if;
  if public.firm_reviews_published('aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'F1 FAIL: firm_reviews_published is true for a lawyer';
  end if;
  raise notice 'G1 PASS: a guest reads 0 reviews and no figures of a firm that has not opted in';
  raise notice 'G2 PASS: a guest still reads the lawyer''s review and figures';
  raise notice 'F1 PASS: firm_reviews_published answers a guest (false before the opt-in, false for a lawyer)';
end $$;
do $$
begin
  perform public.set_firm_public_reviews(true);
  raise exception 'S1 FAIL: a guest executed set_firm_public_reviews';
exception when insufficient_privilege then
  raise notice 'S1 PASS: a guest cannot execute set_firm_public_reviews (42501)';
end $$;
reset role;

set role app_user;

-- G2 — a signed-in stranger: lawyer review yes, firm review no
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare f int; l int;
begin
  select count(*) into f from public.reviews where reviewee_id = 'dddddddd-0000-0000-0000-000000000004';
  select count(*) into l from public.reviews where reviewee_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if f <> 0 or l <> 1 then raise exception 'G2 FAIL: a stranger reads firm=% lawyer=% (expected 0/1)', f, l; end if;
  raise notice 'G2 PASS: a signed-in stranger reads the lawyer review, not the firm review';
end $$;
do $$
begin
  perform public.set_firm_public_reviews(true);
  raise exception 'S1 FAIL: a stranger switched a firm''s reviews public';
exception when insufficient_privilege then
  raise notice 'S1 PASS: a stranger gets 42501 from set_firm_public_reviews';
end $$;

-- P1 — the two parties still read it
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.reviews where reviewee_id = 'dddddddd-0000-0000-0000-000000000004';
  if n <> 1 then raise exception 'P1 FAIL: the reviewer reads % of their own firm review', n; end if;
  raise notice 'P1 PASS: the reviewer reads their own review of the firm';
end $$;
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
do $$
declare n int;
begin
  select count(*) into n from public.reviews where reviewee_id = 'dddddddd-0000-0000-0000-000000000004';
  if n <> 1 then raise exception 'P1 FAIL: the firm reads % of its own reviews before opting in', n; end if;
  raise notice 'P1 PASS: the firm reads its own reviews before opting in';
end $$;

-- S2 — no REST write path to the flag
do $$
begin
  update public.firm_profiles set public_reviews = true
   where owner_user_id = 'dddddddd-0000-0000-0000-000000000004';
  raise exception 'S2 FAIL: the firm wrote public_reviews through REST';
exception when insufficient_privilege then
  raise notice 'S2 PASS: public_reviews has no column grant (42501) — the RPC is the only writer';
end $$;

-- S1 — the firm opts in
do $$
declare v boolean;
begin
  v := public.set_firm_public_reviews(true);
  if v is not true then raise exception 'S1 FAIL: set_firm_public_reviews(true) returned %', v; end if;
  raise notice 'S1 PASS: the firm account opted in';
end $$;
reset role;
do $$
begin
  if (select public_reviews_changed_by from public.firm_profiles where owner_user_id = 'dddddddd-0000-0000-0000-000000000004')
       is distinct from 'dddddddd-0000-0000-0000-000000000004'::uuid then
    raise exception 'S1 FAIL: public_reviews_changed_by does not name the firm account';
  end if;
  raise notice 'S1 PASS: public_reviews_changed_by records the firm account';
end $$;

-- G1 — after the opt-in the guest reads it
set role anon;
select set_config('test.uid', '', false);
do $$
declare f int;
begin
  select count(*) into f from public.reviews where reviewee_id = 'dddddddd-0000-0000-0000-000000000004';
  if f <> 1 then raise exception 'G1 FAIL: a guest reads % review(s) after the firm opted in (expected 1)', f; end if;
  if not public.firm_reviews_published('dddddddd-0000-0000-0000-000000000004') then
    raise exception 'F1 FAIL: firm_reviews_published is false after the opt-in';
  end if;
  raise notice 'G1 PASS: after the opt-in a guest reads the firm review';
end $$;
reset role;

-- S3 — switching off hides it again
set role app_user;
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select public.set_firm_public_reviews(false);
reset role;
set role anon;
select set_config('test.uid', '', false);
do $$
declare f int;
begin
  select count(*) into f from public.reviews where reviewee_id = 'dddddddd-0000-0000-0000-000000000004';
  if f <> 0 then raise exception 'S3 FAIL: a guest reads % firm review(s) after the firm opted out', f; end if;
  raise notice 'S3 PASS: opting out hides the firm''s reviews from guests again';
end $$;
reset role;

-- A lawyer cannot flip a firm's switch (they own no firm row)
set role app_user;
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
begin
  perform public.set_firm_public_reviews(true);
  raise exception 'S1 FAIL: a lawyer with no firm row changed a firm''s visibility';
exception when insufficient_privilege then
  raise notice 'S1 PASS: a lawyer gets 42501 from set_firm_public_reviews';
end $$;
reset role;

select 'firm_reviews_opt_in: all checks passed';
