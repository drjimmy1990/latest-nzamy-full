-- requester_cancel_lock_definer.test.sql — proves 20261206_10 (l16 D-01).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $M/20260917_service_request_client_actions_rpc.sql \
--     $M/20261016_07_reassert_function_execute.sql \
--     $M/20261206_10_requester_cancel_lock_definer.sql $M/20261206_10_requester_cancel_lock_definer.sql \
--     $R/requester_cancel_lock_definer.test.sql
-- NEGATIVE CONTROL (the "before" proof): the same chain WITHOUT the two
-- 20261206_10 files → T1 fails with 42501 «permission denied for function
-- service_request_requester_cancellable» — the PATCH 500 of production.
-- Session assertions run as app_user (a member of authenticated, which is
-- what 20261016_07 revoked the helpers from). Every assertion RAISES on failure.
-- Actors: C client (requester), L lawyer (assignee).

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000c001'),
  ('00000000-0000-0000-0000-00000000a001');
insert into public.profiles (id, user_type) values
  ('00000000-0000-0000-0000-00000000c001', 'individual'),
  ('00000000-0000-0000-0000-00000000a001', 'lawyer');
insert into public.service_requests (id, requester_user_id, title, receiver, assigned_to, status, metadata) values
  ('R1', '00000000-0000-0000-0000-00000000c001', 'self-tracked', 'lawyer', '00000000-0000-0000-0000-00000000a001', 'assigned', '{}'),
  ('R2', '00000000-0000-0000-0000-00000000c001', 'lawyer moves', 'lawyer', '00000000-0000-0000-0000-00000000a001', 'assigned', '{}'),
  ('R3', '00000000-0000-0000-0000-00000000c001', 'ai delivered', 'ai_workspace', null, 'in_review',
         '{"deliverable":{"deliveredAt":"2026-11-01T10:00:00Z"}}'),
  ('R4', '00000000-0000-0000-0000-00000000c001', 'ai open', 'ai_workspace', null, 'pending_assignment', '{}'),
  ('R5', '00000000-0000-0000-0000-00000000c001', 'lawyer cancels', 'ai_workspace', '00000000-0000-0000-0000-00000000a001', 'in_review',
         '{"deliverable":{"deliveredAt":"2026-11-01T10:00:00Z"}}');

-- T0 the posture of 20261016_07 holds: no API role may call the helpers.
do $$
begin
  if has_function_privilege('authenticated', 'public.service_request_requester_cancellable(text, text, jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.service_request_delivered_at(jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.enforce_requester_cancel_lock()', 'EXECUTE')
     or has_function_privilege('app_user', 'public.service_request_requester_cancellable(text, text, jsonb)', 'EXECUTE') then
    raise exception 'T0 FAIL: a session role can EXECUTE a helper 20261016_07 closed';
  end if;
  raise notice 'T0 PASS: the helpers and the trigger function are closed to sessions';
end $$;

-- T1 the client cancels his own self-tracked order by a direct session UPDATE
-- (what PATCH /api/v1/service-requests/[id] does)
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  begin
    update public.service_requests set status = 'cancelled', updated_at = now() where id = 'R1';
  exception when others then
    raise exception 'T1 FAIL (%): the client cancel errored: %', sqlstate, sqlerrm;
  end;
  if (select status from public.service_requests where id = 'R1') <> 'cancelled' then
    raise exception 'T1 FAIL: the client cancel did not land';
  end if;
  raise notice 'T1 PASS: the client cancels through his session (no 42501)';
end $$;
reset role;

-- T2 the assigned lawyer changes the status (kanban drag), twice
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  begin
    update public.service_requests set status = 'in_review', updated_at = now() where id = 'R2';
    update public.service_requests set status = 'completed', updated_at = now() where id = 'R2';
  exception when others then
    raise exception 'T2 FAIL (%): the lawyer status change errored: %', sqlstate, sqlerrm;
  end;
  if (select status from public.service_requests where id = 'R2') <> 'completed' then
    raise exception 'T2 FAIL: the lawyer status change did not land';
  end if;
  raise notice 'T2 PASS: the assignee changes status through his session (no 42501)';
end $$;
reset role;

-- T3 the lock still works: a delivered AI order cannot be cancelled by its
-- requester alone; an open one can.
set role app_user;
do $$
declare
  refused boolean := false;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  begin
    update public.service_requests set status = 'cancelled' where id = 'R3';
  exception when others then
    if sqlerrm = 'conflict' then refused := true; else raise; end if;
  end;
  if not refused or (select status from public.service_requests where id = 'R3') = 'cancelled' then
    raise exception 'T3 FAIL: a delivered AI order was cancelled by its requester';
  end if;
  update public.service_requests set status = 'cancelled' where id = 'R4';
  if (select status from public.service_requests where id = 'R4') <> 'cancelled' then
    raise exception 'T3 FAIL: an open AI order could not be cancelled';
  end if;
  raise notice 'T3 PASS: the cancel lock still refuses a delivered AI order (conflict) and allows an open one';
end $$;
reset role;

-- T4 the assignee (not requester-only) may cancel the delivered order
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  update public.service_requests set status = 'cancelled' where id = 'R5';
  if (select status from public.service_requests where id = 'R5') <> 'cancelled' then
    raise exception 'T4 FAIL: the assignee cancel did not land';
  end if;
  raise notice 'T4 PASS: the assignee cancel is not caught by the requester-only lock';
end $$;
reset role;

-- T5 the shape: SECURITY DEFINER with an empty search_path
do $$
begin
  if not coalesce((select prosecdef and proconfig @> array['search_path=""'] from pg_proc
                    where oid = 'public.enforce_requester_cancel_lock()'::regprocedure), false) then
    raise exception 'T5 FAIL: enforce_requester_cancel_lock is not SECURITY DEFINER with an empty search_path';
  end if;
  raise notice 'T5 PASS: the trigger function is SECURITY DEFINER, search_path ''''';
end $$;
