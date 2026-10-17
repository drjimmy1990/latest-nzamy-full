-- service_requests_session_write_guard.test.sql — proves 20261018_04 (fix plan N16).
-- Chain (run.sh, postgres:16):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_service_requests_live.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql $M/20261018_04_service_requests_session_write_guard.sql \
--     $R/service_requests_session_write_guard.test.sql
-- NEGATIVE CONTROL: the chain without the two 20261018_04 files → T2 fails
-- (the client re-assigns R1 to X).
-- Session assertions run as app_user (a member of authenticated), so the
-- guard is tested fail-closed: it trusts only postgres / service_role /
-- supabase_admin. Every assertion RAISES on failure.

-- T1 what the code does today still works through a session
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  update public.service_requests set status = 'in_review', updated_at = now() where id = 'R2';
  if (select status from public.service_requests where id = 'R2') <> 'in_review' then
    raise exception 'T1 FAIL: the requester could not change the status';
  end if;
  perform public.cancel_own_service_request('R3');           -- INVOKER: status + updated_at
  perform public.edit_service_request_description('R1', 'وصف جديد');   -- DEFINER: description
  perform public.request_service_order_revision('R2', 'تعديل');        -- DEFINER: metadata + status
  insert into public.service_requests (id, requester_user_id, type, title, receiver, assigned_to, status)
    values ('N1', auth.uid(), 'service', 'جديد', 'ai_workspace', null, 'pending'),
           ('N2', auth.uid(), 'service', 'مُسنَد لنفسه', 'lawyer', auth.uid(), 'assigned');
  if (select status from public.service_requests where id = 'R3') <> 'cancelled'
     or (select description from public.service_requests where id = 'R1') <> 'وصف جديد'
     or (select metadata->>'revision_note' from public.service_requests where id = 'R2') is distinct from 'تعديل' then
    raise exception 'T1 FAIL: a client action did not land';
  end if;
  raise notice 'T1 PASS: requester status change, cancel (INVOKER), edit and revision (DEFINER), unassigned and self-assigned inserts all work';
end $$;
reset role;

-- T2 the requester cannot assign a lawyer or rewrite the row
set role app_user;
do $$
declare
  stmt text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000c001', true);
  foreach stmt in array array[
    $q$update public.service_requests set assigned_to = '00000000-0000-0000-0000-00000000a002' where id = 'R1'$q$,
    $q$update public.service_requests set metadata = '{"deliverable":"another-tenant/file.pdf"}' where id = 'R2'$q$,
    $q$update public.service_requests set description = 'تزوير' where id = 'R2'$q$,
    $q$update public.service_requests set payment = '{"amount":0,"status":"paid"}' where id = 'R2'$q$,
    $q$update public.service_requests set receiver = 'lawyer' where id = 'R2'$q$,
    $q$update public.service_requests set lawyer_client_id = gen_random_uuid() where id = 'R2'$q$,
    $q$insert into public.service_requests (id, requester_user_id, type, title, receiver, assigned_to, status)
         values ('N3', '00000000-0000-0000-0000-00000000c001', 'service', 'إسناد مُختار', 'lawyer', '00000000-0000-0000-0000-00000000a002', 'pending')$q$
  ] loop
    begin
      execute stmt;
      raise exception 'T2 FAIL: allowed — %', left(stmt, 90);
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'T2 PASS: assigned_to, metadata, description, payment, receiver, lawyer_client_id and a foreign-assigned insert all raise 42501';
end $$;
reset role;

-- T3 the assigned lawyer links a client card but cannot hand the request on
set role app_user;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-00000000a001', true);
  update public.service_requests set lawyer_client_id = '00000000-0000-0000-0000-0000000000cc' where id = 'R2';
  if (select lawyer_client_id from public.service_requests where id = 'R2') is distinct from '00000000-0000-0000-0000-0000000000cc' then
    raise exception 'T3 FAIL: the assignee could not link the client card';
  end if;
  begin
    update public.service_requests set assigned_to = '00000000-0000-0000-0000-00000000a002' where id = 'R2';
    raise exception 'T3 FAIL: the assignee handed the request to another lawyer';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: the assignee links a client card; re-assigning raises 42501';
end $$;
reset role;

-- T4 the server (service role) claims and re-assigns
set role service_role;
do $$
begin
  perform public.claim_service_request('R1', '00000000-0000-0000-0000-00000000a001', now());
  if (select assigned_to from public.service_requests where id = 'R1') is distinct from '00000000-0000-0000-0000-00000000a001' then
    raise exception 'T4 FAIL: the service-role claim did not assign R1';
  end if;
  update public.service_requests set assigned_to = '00000000-0000-0000-0000-00000000a002' where id = 'R1';
  if (select assigned_to from public.service_requests where id = 'R1') is distinct from '00000000-0000-0000-0000-00000000a002' then
    raise exception 'T4 FAIL: the admin re-assignment did not land';
  end if;
  raise notice 'T4 PASS: the service role claims and re-assigns';
end $$;
reset role;

-- T5 one guard trigger after two runs, first among the BEFORE triggers
do $$
begin
  if (select count(*) from pg_trigger where tgrelid = 'public.service_requests'::regclass
        and tgname = 'trg_00_service_requests_session_guard') <> 1 then
    raise exception 'T5 FAIL: expected exactly one guard trigger';
  end if;
  raise notice 'T5 PASS: one guard trigger after two runs';
end $$;
