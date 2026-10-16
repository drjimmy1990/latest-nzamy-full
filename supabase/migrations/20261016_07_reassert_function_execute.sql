-- =============================================================================
-- Migration: 20261016_07_reassert_function_execute.sql
-- =============================================================================
-- PURPOSE
--   The self-host restore (cutover 2026-09-25) recreated the schema under
--   Supabase's default privileges and replayed only GRANTs, never REVOKEs. The
--   production schema of 2026-10-10 therefore shows `GRANT ALL ON FUNCTION … TO
--   anon, authenticated` on functions whose migrations had taken EXECUTE away:
--
--     claim_service_request(text, uuid, timestamptz)          20260908: service_role only
--     service_request_delivered_at(jsonb)                     20260917: helper, no API role
--     service_request_requester_cancellable(text, text, jsonb) 20260917: helper, no API role
--     enforce_requester_cancel_lock()                         20260917: trigger, no API role
--     edit_service_request_description(text, text)            20260917: not anon
--     request_service_order_revision(text, text)              20260917: not anon
--     cancel_own_service_request(text)                        20260917: not anon
--
--   None of these is an open door today: claim_service_request is SECURITY
--   INVOKER (the caller's row policies still apply), and the three client
--   actions check `requester_user_id = auth.uid()`, which a guest never passes.
--   This file puts the intended posture back so it no longer rests on those
--   inner checks alone. (Tables: see Step 0 of the run order — 20260922_03.)
--
-- WHAT IT DOES (idempotent; a function absent here is skipped with a NOTICE)
--   Re-runs exactly the REVOKEs of 20260908 and 20260917 for those seven
--   signatures, re-grants service_role, and verifies the effective privilege.
--
-- DEPLOY ORDER — INDEPENDENT (no code change; the routes call these through
-- the service role or a signed-in session, as before)
--
-- ROLLBACK — none needed (it only removes privileges the migrations never gave).
-- =============================================================================

begin;

do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('public.claim_service_request(text, uuid, timestamptz)',            'public, anon, authenticated'),
      ('public.service_request_delivered_at(jsonb)',                       'public, anon, authenticated'),
      ('public.service_request_requester_cancellable(text, text, jsonb)',  'public, anon, authenticated'),
      ('public.enforce_requester_cancel_lock()',                           'public, anon, authenticated'),
      ('public.edit_service_request_description(text, text)',              'public, anon'),
      ('public.request_service_order_revision(text, text)',                'public, anon'),
      ('public.cancel_own_service_request(text)',                          'public, anon')
    ) as v(fn, revoke_from)
  loop
    if to_regprocedure(spec.fn) is null then
      raise notice '20261016_07: % does not exist here — skipped', spec.fn;
      continue;
    end if;
    execute format('revoke all on function %s from %s', spec.fn, spec.revoke_from);
    execute format('grant execute on function %s to service_role', spec.fn);
  end loop;
end $$;

-- Verify: the effective privilege, whoever granted it.
do $$
declare
  spec    record;
  r       text;
  missing text := '';
begin
  for spec in
    select * from (values
      ('public.claim_service_request(text, uuid, timestamptz)',            array['anon', 'authenticated']),
      ('public.service_request_delivered_at(jsonb)',                       array['anon', 'authenticated']),
      ('public.service_request_requester_cancellable(text, text, jsonb)',  array['anon', 'authenticated']),
      ('public.enforce_requester_cancel_lock()',                           array['anon', 'authenticated']),
      ('public.edit_service_request_description(text, text)',              array['anon']),
      ('public.request_service_order_revision(text, text)',                array['anon']),
      ('public.cancel_own_service_request(text)',                          array['anon'])
    ) as v(fn, denied)
  loop
    continue when to_regprocedure(spec.fn) is null;
    foreach r in array spec.denied loop
      if has_function_privilege(r, spec.fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, spec.fn);
      end if;
    end loop;
    if not has_function_privilege('service_role', spec.fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', spec.fn);
    end if;
  end loop;
  -- The three client actions must stay callable by a signed-in user.
  if to_regprocedure('public.cancel_own_service_request(text)') is not null
     and not has_function_privilege('authenticated', 'public.cancel_own_service_request(text)', 'EXECUTE') then
    missing := missing || ' authenticated lost EXECUTE on cancel_own_service_request (the client cancel button would fail);';
  end if;
  if missing <> '' then
    raise exception '20261016_07 verify:%', missing;
  end if;
  raise notice '20261016_07 verify: OK — the service-request functions are back to the EXECUTE grants of 20260908 / 20260917';
end $$;

commit;

notify pgrst, 'reload schema';
