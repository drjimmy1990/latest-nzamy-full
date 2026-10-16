-- prelude_reassert_function_execute.sql — stand-ins with the exact signatures
-- 20261016_07 re-locks, granted the way the self-host restore left them on
-- production (GRANT ALL to anon, authenticated, service_role).
create function public.claim_service_request(text, uuid, timestamptz) returns int language sql as $$ select 1 $$;
create function public.service_request_delivered_at(jsonb) returns timestamptz language sql as $$ select now() $$;
create function public.service_request_requester_cancellable(text, text, jsonb) returns boolean language sql as $$ select true $$;
create function public.enforce_requester_cancel_lock() returns trigger language plpgsql as $$ begin return new; end $$;
create function public.edit_service_request_description(text, text) returns int language sql as $$ select 1 $$;
create function public.request_service_order_revision(text, text) returns int language sql as $$ select 1 $$;
create function public.cancel_own_service_request(text) returns int language sql as $$ select 1 $$;
grant all on function public.claim_service_request(text, uuid, timestamptz), public.service_request_delivered_at(jsonb),
  public.service_request_requester_cancellable(text, text, jsonb), public.enforce_requester_cancel_lock(),
  public.edit_service_request_description(text, text), public.request_service_order_revision(text, text),
  public.cancel_own_service_request(text) to anon, authenticated, service_role;
