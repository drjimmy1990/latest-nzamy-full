-- reassert_function_execute.test.sql — proves 20261016_07.
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_reassert_function_execute.sql \
--     $M/20261016_07_reassert_function_execute.sql $M/20261016_07_reassert_function_execute.sql \
--     $R/reassert_function_execute.test.sql
do $$
begin
  if has_function_privilege('authenticated', 'public.claim_service_request(text, uuid, timestamptz)', 'EXECUTE')
     or has_function_privilege('anon', 'public.claim_service_request(text, uuid, timestamptz)', 'EXECUTE') then
    raise exception 'T1 FAIL: an API role can still claim requests';
  end if;
  if has_function_privilege('anon', 'public.cancel_own_service_request(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.edit_service_request_description(text, text)', 'EXECUTE') then
    raise exception 'T1 FAIL: a guest can call a client action';
  end if;
  if not has_function_privilege('authenticated', 'public.cancel_own_service_request(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.request_service_order_revision(text, text)', 'EXECUTE') then
    raise exception 'T1 FAIL: a signed-in client lost a client action';
  end if;
  if not has_function_privilege('service_role', 'public.claim_service_request(text, uuid, timestamptz)', 'EXECUTE') then
    raise exception 'T1 FAIL: the service role lost the claim RPC';
  end if;
  raise notice 'T1 PASS: claim RPC service-only; client actions signed-in only; helpers closed; service_role keeps all';
end $$;
set role anon;
do $$
begin
  begin
    perform public.claim_service_request('r', gen_random_uuid(), now());
    raise exception 'T2 FAIL: anon called the claim RPC';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: an actual anon call raises insufficient_privilege';
end $$;
reset role;
