-- community_votes_saves_best.test.sql — proves 20261125_53 (and that the votes
-- rules of 20261016_06 still hold under it).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql \
--     $M/20261018_03_community_civil_category.sql \
--     $M/20261125_53_community_votes_saves_best.sql $M/20261125_53_community_votes_saves_best.sql \
--     $R/community_votes_saves_best.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261125_53 files → T1 fails
-- (no search_fts column).
-- Actors (prelude): L1, L2 verified lawyers; P pending lawyer; C client.
-- Posts: LP = L1's lawyers-only post (answer LA by L2); PUB = C's public post.
-- Every assertion RAISES on failure.

-- Fixtures (superuser): a searchable public post by C, an answer by L1 on PUB,
-- and a moderated answer on PUB.
insert into public.community_posts (id, author_id, title, body, visibility) values
  ('44444444-aaaa-0000-0000-000000000004', 'c0000000-0000-0000-0000-00000000000c',
   'حَضانة الأطفال بعد الطلاق', 'سؤال عن الحضانة منذ عام ١٤٤٤ — اتصل 0501234567', 'public');
insert into public.community_answers (id, post_id, author_id, body, is_lawyer_verified, status) values
  ('55555555-aaaa-0000-0000-000000000005', '22222222-aaaa-0000-0000-000000000002',
   'a1000000-0000-0000-0000-000000000001', 'جواب على العام', true, 'active'),
  ('66666666-aaaa-0000-0000-000000000006', '22222222-aaaa-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000002', 'جواب محجوب', true, 'moderated');

-- T1 search: folded, tashkeel-free, digits folded; RLS still applies (a guest
--    never finds the lawyers-only post)
set role anon;
select set_config('test.uid', '', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_posts
   where search_fts @@ pg_catalog.to_tsquery('simple', public.community_fold('الحضانه') || ':*');
  if n <> 1 then raise exception 'T1 FAIL: «الحضانه» finds % posts (want 1)', n; end if;
  select count(*) into n from public.community_posts
   where search_fts @@ pg_catalog.to_tsquery('simple', public.community_fold('حضانة') || ':*');
  if n <> 1 then raise exception 'T1 FAIL: «حضانة» (title has tashkeel) finds % posts (want 1)', n; end if;
  select count(*) into n from public.community_posts
   where search_fts @@ pg_catalog.to_tsquery('simple', public.community_fold('١٤٤٤') || ':*');
  if n <> 1 then raise exception 'T1 FAIL: «١٤٤٤» finds % posts (want 1)', n; end if;
  select count(*) into n from public.community_posts
   where search_fts @@ pg_catalog.to_tsquery('simple', 'مهني:*');
  if n <> 0 then raise exception 'T1 FAIL: a guest finds the lawyers-only post by search'; end if;
  raise notice 'T1 PASS: folded Arabic search (tashkeel, ة/ه, digits) under RLS';
end $$;
reset role;

-- T2 votes: own row only, readable target only, toggle off, the count follows
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  insert into public.community_votes (user_id, target_type, target_id, value)
  values ('c0000000-0000-0000-0000-00000000000c', 'answer', '55555555-aaaa-0000-0000-000000000005', 1)
  on conflict (user_id, target_type, target_id) do update set value = excluded.value;
  -- the same click twice is one vote (upsert), and down replaces up
  insert into public.community_votes (user_id, target_type, target_id, value)
  values ('c0000000-0000-0000-0000-00000000000c', 'answer', '55555555-aaaa-0000-0000-000000000005', -1)
  on conflict (user_id, target_type, target_id) do update set value = excluded.value;
  select vote_count into n from public.community_answers where id = '55555555-aaaa-0000-0000-000000000005';
  if n <> -1 then raise exception 'T2 FAIL: answer vote_count % (want -1)', n; end if;
  begin
    insert into public.community_votes (user_id, target_type, target_id, value)
    values ('c0000000-0000-0000-0000-00000000000c', 'answer', '33333333-aaaa-0000-0000-000000000003', 1);
    raise exception 'T2 FAIL: a client voted on a lawyers-only answer';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.community_votes (user_id, target_type, target_id, value)
    values ('a2000000-0000-0000-0000-000000000002', 'post', '22222222-aaaa-0000-0000-000000000002', 1);
    raise exception 'T2 FAIL: a vote was written in another user''s name';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', 'a2000000-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_votes;
  if n <> 0 then raise exception 'T2 FAIL: L2 reads % votes of others', n; end if;
  update public.community_votes set value = 1 where user_id = 'c0000000-0000-0000-0000-00000000000c';
  delete from public.community_votes where user_id = 'c0000000-0000-0000-0000-00000000000c';
end $$;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select value into n from public.community_votes where target_id = '55555555-aaaa-0000-0000-000000000005';
  if n is distinct from -1 then raise exception 'T2 FAIL: another user changed or removed C''s vote (%)', n; end if;
  delete from public.community_votes where target_id = '55555555-aaaa-0000-0000-000000000005';
  select vote_count into n from public.community_answers where id = '55555555-aaaa-0000-0000-000000000005';
  if n <> 0 then raise exception 'T2 FAIL: toggle off left vote_count %', n; end if;
  raise notice 'T2 PASS: one own vote per target, upsert, toggle off, recount; nobody else touches it';
end $$;
reset role;

-- T3 saves: guest has nothing; own rows only; readable posts only; no update
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  begin
    perform 1 from public.community_saves;
    raise exception 'T3 FAIL: a guest reads community_saves';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
begin
  insert into public.community_saves (user_id, post_id)
  values ('c0000000-0000-0000-0000-00000000000c', '22222222-aaaa-0000-0000-000000000002');
  begin
    insert into public.community_saves (user_id, post_id)
    values ('c0000000-0000-0000-0000-00000000000c', '11111111-aaaa-0000-0000-000000000001');
    raise exception 'T3 FAIL: a client saved a lawyers-only post';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.community_saves set created_at = now() - interval '1 year';
    raise exception 'T3 FAIL: a save is updatable';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', 'a2000000-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_saves;
  if n <> 0 then raise exception 'T3 FAIL: L2 reads % saves of C', n; end if;
  delete from public.community_saves where user_id = 'c0000000-0000-0000-0000-00000000000c';
  begin
    insert into public.community_saves (user_id, post_id)
    values ('c0000000-0000-0000-0000-00000000000c', '44444444-aaaa-0000-0000-000000000004');
    raise exception 'T3 FAIL: L2 saved a post in C''s name';
  exception when insufficient_privilege then null;
  end;
  -- a verified lawyer may save a lawyers-only post
  insert into public.community_saves (user_id, post_id)
  values ('a2000000-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001');
end $$;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_saves;
  if n <> 1 then raise exception 'T3 FAIL: C sees % saves (want 1 — L2 must not delete it)', n; end if;
  delete from public.community_saves where post_id = '22222222-aaaa-0000-0000-000000000002';
  select count(*) into n from public.community_saves;
  if n <> 0 then raise exception 'T3 FAIL: C could not remove his own save'; end if;
  raise notice 'T3 PASS: saves are own-row, readable-post only, never updated, never a guest''s';
end $$;
reset role;

-- T4 best answer: the question's author only, an active answer of the same post
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  begin
    perform public.community_set_best_answer('22222222-aaaa-0000-0000-000000000002', '55555555-aaaa-0000-0000-000000000005');
    raise exception 'T4 FAIL: a guest can call community_set_best_answer';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('test.uid', 'a1000000-0000-0000-0000-000000000001', false);
do $$
declare r text;
begin
  r := public.community_set_best_answer('22222222-aaaa-0000-0000-000000000002', '55555555-aaaa-0000-0000-000000000005');
  if r <> 'not_author' then raise exception 'T4 FAIL: a non-author got %', r; end if;
end $$;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare r text; a uuid;
begin
  r := public.community_set_best_answer('22222222-aaaa-0000-0000-000000000002', '33333333-aaaa-0000-0000-000000000003');
  if r <> 'bad_answer' then raise exception 'T4 FAIL: another post''s answer got %', r; end if;
  r := public.community_set_best_answer('22222222-aaaa-0000-0000-000000000002', '66666666-aaaa-0000-0000-000000000006');
  if r <> 'bad_answer' then raise exception 'T4 FAIL: a moderated answer got %', r; end if;
  r := public.community_set_best_answer('99999999-aaaa-0000-0000-000000000009', null);
  if r <> 'not_found' then raise exception 'T4 FAIL: a missing post got %', r; end if;
  r := public.community_set_best_answer('22222222-aaaa-0000-0000-000000000002', '55555555-aaaa-0000-0000-000000000005');
  if r <> 'ok' then raise exception 'T4 FAIL: the author got %', r; end if;
  select accepted_answer_id into a from public.community_posts where id = '22222222-aaaa-0000-0000-000000000002';
  if a is distinct from '55555555-aaaa-0000-0000-000000000005' then raise exception 'T4 FAIL: best answer not stored (%)', a; end if;
  begin
    update public.community_posts set accepted_answer_id = '33333333-aaaa-0000-0000-000000000003'
     where id = '22222222-aaaa-0000-0000-000000000002';
    raise exception 'T4 FAIL: the author set accepted_answer_id directly';
  exception when insufficient_privilege then null;
  end;
  r := public.community_set_best_answer('22222222-aaaa-0000-0000-000000000002', null);
  select accepted_answer_id into a from public.community_posts where id = '22222222-aaaa-0000-0000-000000000002';
  if r <> 'ok' or a is not null then raise exception 'T4 FAIL: clearing the best answer (% / %)', r, a; end if;
  raise notice 'T4 PASS: only the author marks/clears an active answer of his own question';
end $$;

-- T5 a user still posts through the column grants, and the new post is searchable
do $$
declare n int;
begin
  insert into public.community_posts (author_id, title, body, category, visibility, tags)
  values ('c0000000-0000-0000-0000-00000000000c', 'إيجار شقة سكنية', 'هل يحق للمؤجِّر', 'civil', 'public', '{}');
  select count(*) into n from public.community_posts
   where search_fts @@ pg_catalog.to_tsquery('simple', public.community_fold('المؤجر') || ':* | ' || public.community_fold('للمؤجر') || ':*');
  if n <> 1 then raise exception 'T5 FAIL: the new post is not searchable (%)', n; end if;
  raise notice 'T5 PASS: posting still works and the fold runs as the writing user';
end $$;
reset role;
