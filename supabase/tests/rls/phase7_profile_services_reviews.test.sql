-- RLS acceptance tests for 20260907_phase7_profile_services_reviews.sql
-- Users: A (verified, listed lawyer), B (another lawyer, NOT listed), K (client
-- with a completed request assigned to A), M (client with an open request to A).
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('dddddddd-0000-0000-0000-000000000004'),
  ('eeeeeeee-0000-0000-0000-000000000005');
insert into public.profiles (id, user_type, display_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','lawyer','A'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','B'),
  ('dddddddd-0000-0000-0000-000000000004','individual','K'),
  ('eeeeeeee-0000-0000-0000-000000000005','individual','M');
insert into public.lawyer_profiles (user_id, verification_status, marketplace_visible) values
  ('aaaaaaaa-0000-0000-0000-000000000001','verified', true),
  ('bbbbbbbb-0000-0000-0000-000000000002','verified', false);
insert into public.service_requests (id, requester_user_id, title, assigned_to, status) values
  ('req-k-done', 'dddddddd-0000-0000-0000-000000000004', 'استشارة مكتملة', 'aaaaaaaa-0000-0000-0000-000000000001', 'completed'),
  ('req-m-open', 'eeeeeeee-0000-0000-0000-000000000005', 'طلب جارٍ',       'aaaaaaaa-0000-0000-0000-000000000001', 'assigned');

select 'T0 new columns exist (expect 5): ' || count(*) from information_schema.columns
 where table_name = 'lawyer_profiles' and column_name in ('slug','education','courts','languages','headline_ar');

set role app_user;

-- T1 slug: own, unique, format-checked, reserved words refused
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
with u as (update public.lawyer_profiles set slug = 'ahmad-alghamdi', courts = '{"المحكمة التجارية"}', languages = '{"ar","en"}' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select 'T1 A sets own slug (expect 1): ' || count(*) from u;
do $$ begin
  update public.lawyer_profiles set slug = 'Bad Slug!' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise notice 'T1 FAIL: malformed slug accepted';
exception when check_violation then
  raise notice 'T1 PASS: slug format is checked (23514)';
end $$;
do $$ begin
  update public.lawyer_profiles set slug = 'browse' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  raise notice 'T1 FAIL: reserved slug accepted';
exception when check_violation then
  raise notice 'T1 PASS: reserved slugs are refused (23514)';
end $$;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  update public.lawyer_profiles set slug = 'ahmad-alghamdi' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise notice 'T1 FAIL: duplicate slug accepted';
exception when unique_violation then
  raise notice 'T1 PASS: a slug is unique (23505)';
end $$;
with u as (update public.lawyer_profiles set slug = 'someone-else' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1)
select 'T1 B cannot touch A''s profile (expect 0 rows): ' || count(*) from u;
do $$ begin
  update public.lawyer_profiles set education = '{"degree":"x"}'::jsonb where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise notice 'T1 FAIL: education accepted a non-array';
exception when check_violation then
  raise notice 'T1 PASS: education must be a JSON array (23514)';
end $$;

-- T2 services: owner writes; the public sees only active services of listed lawyers
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.lawyer_services (lawyer_user_id, title_ar, pricing_kind, price_sar, category)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'استشارة قانونية ٣٠ دقيقة', 'fixed', 300, 'consultation');
insert into public.lawyer_services (lawyer_user_id, title_ar, pricing_kind, category, active)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'صياغة عقد', 'quote', 'drafting', false);
do $$ begin
  insert into public.lawyer_services (lawyer_user_id, title_ar, pricing_kind, category)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'بلا سعر', 'fixed', 'other');
  raise notice 'T2 FAIL: a fixed-price service without a price was accepted';
exception when check_violation then
  raise notice 'T2 PASS: fixed/from/hourly need a price (23514)';
end $$;
select 'T2 A reads own services incl. inactive (expect 2): ' || count(*) from public.lawyer_services;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
insert into public.lawyer_services (lawyer_user_id, title_ar, pricing_kind, price_sar) values ('bbbbbbbb-0000-0000-0000-000000000002', 'خدمة B', 'hourly', 500);
do $$ begin
  insert into public.lawyer_services (lawyer_user_id, title_ar, pricing_kind) values ('aaaaaaaa-0000-0000-0000-000000000001', 'مزوّرة', 'quote');
  raise notice 'T2 FAIL: B inserted a service for A';
exception when insufficient_privilege then
  raise notice 'T2 PASS: cannot write another lawyer''s services (42501)';
end $$;
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
select 'T2 client sees only A''s ACTIVE service, none of B (unlisted) (expect 1): ' || count(*) from public.lawyer_services;

-- T3 reviews: only the requester of a COMPLETED request assigned to the reviewee, once
select set_config('test.uid', 'dddddddd-0000-0000-0000-000000000004', false);
insert into public.reviews (reviewer_id, reviewee_id, request_id, rating, title, body)
values ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'req-k-done', 5, 'ممتاز', 'خدمة سريعة');
select 'T3 K reviews the completed request (expect 1): ' || count(*) from public.reviews;
do $$ begin
  insert into public.reviews (reviewer_id, reviewee_id, request_id, rating)
  values ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'req-k-done', 4);
  raise notice 'T3 FAIL: second review on the same request accepted';
exception when unique_violation then
  raise notice 'T3 PASS: one review per request (23505)';
end $$;
do $$ begin
  insert into public.reviews (reviewer_id, reviewee_id, rating) values ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 3);
  raise notice 'T3 FAIL: a free-floating review (no request) accepted';
exception when insufficient_privilege then
  raise notice 'T3 PASS: a review needs a request (42501)';
end $$;
select set_config('test.uid', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$ begin
  insert into public.reviews (reviewer_id, reviewee_id, request_id, rating) values ('eeeeeeee-0000-0000-0000-000000000005', 'aaaaaaaa-0000-0000-0000-000000000001', 'req-m-open', 5);
  raise notice 'T3 FAIL: review on an unfinished request accepted';
exception when insufficient_privilege then
  raise notice 'T3 PASS: only a COMPLETED request can be reviewed (42501)';
end $$;
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$ begin
  insert into public.reviews (reviewer_id, reviewee_id, request_id, rating) values ('bbbbbbbb-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'req-k-done', 1);
  raise notice 'T3 FAIL: a stranger reviewed someone else''s request';
exception when insufficient_privilege then
  raise notice 'T3 PASS: only the requester reviews (42501)';
end $$;
select 'T3 anyone reads the active review and the stats (expect 1|5.00): '
       || (select count(*) from public.reviews)
       || '|' || (select avg_rating from public.lawyer_review_stats where lawyer_user_id = 'aaaaaaaa-0000-0000-0000-000000000001');

reset role;
select 'policies lawyer_services=' || (select count(*) from pg_policies where tablename = 'lawyer_services')
    || ' reviews=' || (select count(*) from pg_policies where tablename = 'reviews')
    || ' (expect 3 4)';
