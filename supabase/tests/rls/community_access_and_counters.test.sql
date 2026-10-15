-- community_access_and_counters.test.sql — proves 20261016_06.
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_community_live_schema.sql \
--     $M/20261016_06_community_access_and_counters.sql $M/20261016_06_community_access_and_counters.sql \
--     $R/community_access_and_counters.test.sql
-- Actors: L1, L2 verified lawyers; P pending lawyer; C client; and a guest (anon).
-- Post LP = L1's lawyers-only post (answered by L2); post PUB = C's public post.

-- T1 a guest sees the public post only, and no answer of the lawyers-only post (C1/C2)
set role anon;
select set_config('test.uid', '', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_posts;
  if n <> 1 then raise exception 'T1 FAIL: guest sees % posts (want 1)', n; end if;
  select count(*) into n from public.community_answers;
  if n <> 0 then raise exception 'T1 FAIL: guest reads % answers of a lawyers-only post', n; end if;
  perform public.community_record_view('22222222-aaaa-0000-0000-000000000002');
  perform public.community_record_view('11111111-aaaa-0000-0000-000000000001');
  raise notice 'T1 PASS: a guest reads the public post only, no lawyers-only answer; views recorded only where readable';
end $$;
reset role;

-- T2 a verified lawyer (L2) reads L1's lawyers-only post and its answer (C1); a
--    pending lawyer and a client do not
set role authenticated;
select set_config('test.uid', 'a2000000-0000-0000-0000-000000000002', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_posts where id = '11111111-aaaa-0000-0000-000000000001';
  if n <> 1 then raise exception 'T2 FAIL: a verified lawyer cannot read a lawyers-only post'; end if;
  select count(*) into n from public.community_answers;
  if n <> 1 then raise exception 'T2 FAIL: a verified lawyer reads % answers (want 1)', n; end if;
end $$;
select set_config('test.uid', 'b0000000-0000-0000-0000-00000000000b', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_posts where visibility = 'lawyers_only';
  if n <> 0 then raise exception 'T2 FAIL: a pending lawyer reads lawyers-only posts'; end if;
end $$;
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
declare n int;
begin
  select count(*) into n from public.community_answers;
  if n <> 0 then raise exception 'T2 FAIL: a client reads a lawyers-only answer'; end if;
  raise notice 'T2 PASS: verified lawyers read lawyers-only posts and answers; pending lawyers and clients do not';
end $$;

-- T3 the client cannot answer the unreadable post, cannot fake the lawyer badge,
--    cannot publish lawyers-only, cannot set counters / pin / status (C3/C4/C5)
do $$
declare n int;
begin
  begin
    insert into public.community_answers (post_id, author_id, body)
      values ('11111111-aaaa-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000c', 'دخيل');
    raise exception 'T3 FAIL: answered an unreadable post';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.community_answers (post_id, author_id, body, is_lawyer_verified)
      values ('22222222-aaaa-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'جواب', true);
    raise exception 'T3 FAIL: a client set the verified-lawyer badge';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.community_posts (author_id, title, body, visibility)
      values ('c0000000-0000-0000-0000-00000000000c', 'x', 'y', 'lawyers_only');
    raise exception 'T3 FAIL: a client published into lawyers-only';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.community_posts set vote_count = 999 where id = '22222222-aaaa-0000-0000-000000000002';
    raise exception 'T3 FAIL: an author set vote_count';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.community_posts set is_pinned = true where id = '22222222-aaaa-0000-0000-000000000002';
    raise exception 'T3 FAIL: an author pinned their post';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.community_posts set visibility = 'lawyers_only' where id = '22222222-aaaa-0000-0000-000000000002';
    raise exception 'T3 FAIL: a client moved a post into lawyers-only';
  exception when insufficient_privilege then null;
  end;
  update public.community_posts set body = 'نص معدل' where id = '22222222-aaaa-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the author could not edit their own text'; end if;
  insert into public.community_answers (post_id, author_id, body)
    values ('22222222-aaaa-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000c', 'جواب عادي');
  raise notice 'T3 PASS: no answer to the unreadable, no fake badge, no lawyers-only by a client, no self-set counters/pin; own text edits and answers work';
end $$;

-- T4 votes: on a readable target they count (trigger); on an unreadable one they are refused (C5/C6)
do $$
begin
  insert into public.community_votes (user_id, target_type, target_id, value)
    values ('c0000000-0000-0000-0000-00000000000c', 'post', '22222222-aaaa-0000-0000-000000000002', 1);
  begin
    insert into public.community_votes (user_id, target_type, target_id, value)
      values ('c0000000-0000-0000-0000-00000000000c', 'answer', '33333333-aaaa-0000-0000-000000000003', 1);
    raise exception 'T4 FAIL: voted on an answer the voter cannot read';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', 'a2000000-0000-0000-0000-000000000002', false);
do $$
begin
  insert into public.community_votes (user_id, target_type, target_id, value)
    values ('a2000000-0000-0000-0000-000000000002', 'post', '22222222-aaaa-0000-0000-000000000002', 1);
  update public.community_votes set value = -1
   where user_id = 'a2000000-0000-0000-0000-000000000002' and target_id = '22222222-aaaa-0000-0000-000000000002';
  perform public.community_record_view('22222222-aaaa-0000-0000-000000000002');
end $$;
reset role;

do $$
declare
  p record;
begin
  select vote_count, answer_count, view_count into p
    from public.community_posts where id = '22222222-aaaa-0000-0000-000000000002';
  -- votes: C +1, L2 -1 → 0; answers: C's one active answer → 1; views: guest + L2 → 2
  if p.vote_count <> 0 or p.answer_count <> 1 or p.view_count <> 2 then
    raise exception 'T4 FAIL: public post vote_count=% answer_count=% view_count=% (want 0/1/2)', p.vote_count, p.answer_count, p.view_count;
  end if;
  select view_count into p from public.community_posts where id = '11111111-aaaa-0000-0000-000000000001';
  if p.view_count <> 0 then raise exception 'T4 FAIL: a guest view counted on a lawyers-only post'; end if;
  if (select answer_count from public.community_posts where id = '11111111-aaaa-0000-0000-000000000001') <> 1 then
    raise exception 'T4 FAIL: the one-time recount missed the lawyers-only post';
  end if;
  raise notice 'T4 PASS: votes recounted by trigger (0), answers counted (1), views only where readable (2 / 0); one-time recount applied';
end $$;
