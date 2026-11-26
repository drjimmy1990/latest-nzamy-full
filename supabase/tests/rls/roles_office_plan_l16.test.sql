-- roles_office_plan_l16.test.sql — proves 20261206_70 (batch l16 «roles»):
--   س٢١٢  office_features_locked: free lawyer / unpaid firm / its member are
--         locked; a paid lawyer, a founder, a paid firm and its members, a
--         client, a demo account are not;
--         cases & clients: free allowance 0/0 — a self-filed case and a new
--         client card refused, a market claim (client's request) accepted;
--         1 GB: a new object of a locked owner at the cap refused, a paid
--         owner / the service role (no owner) / a client never held;
--   D-53  set_firm_public_reviews admits the managing partner; a firm's hr_manager invites and re-roles members, never touches
--         managing_partner, the owner's row or his own role; a plain member
--         writes nothing.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $M/20260921_03_entity_rls_recursion_fix.sql \
--     $T/prelude_accounts_limits.sql \
--     $M/20261126_50_accounts_limits.sql \
--     $T/prelude_roles_l16.sql \
--     $M/20261017_31_firm_reviews_opt_in.sql \
--     $M/20261206_70_roles_office_plan.sql \
--     $M/20261206_70_roles_office_plan.sql \
--     $T/roles_office_plan_l16.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261206_70
-- lines → T1 «function public.office_features_locked(uuid) does not exist».
--
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

-- ── fixtures (postgres) ──────────────────────────────────────────────────────
-- r1 free lawyer, r2 paid lawyer, r3 founder, r4 demo lawyer,
-- p0 unpaid firm (owner) + r5 its individual member,
-- p9 paid firm (owner) + r6 hr_manager (individual) + r7 lawyer member + r8 to invite,
-- k1 client.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'r1@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000001a2', 'r2@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000001a3', 'r3@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000001a4', 'r4@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000001b0', 'p0@l16.test', '{"user_type": "firm", "firm_name": "مكتب مجاني"}'),
  ('00000000-0000-0000-0000-0000000001b9', 'p9@l16.test', '{"user_type": "firm", "firm_name": "مكتب مشترك"}'),
  ('00000000-0000-0000-0000-0000000001a5', 'r5@l16.test', '{}'),
  ('00000000-0000-0000-0000-0000000001a6', 'r6@l16.test', '{}'),
  ('00000000-0000-0000-0000-0000000001a7', 'r7@l16.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000001a8', 'r8@l16.test', '{}'),
  ('00000000-0000-0000-0000-0000000001c1', 'k1@l16.test', '{}');
update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-0000000001a4';
insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end) values
  ('00000000-0000-0000-0000-0000000001a2', 'lawyer-pro', 'pro', 'active', now() + interval '300 days'),
  ('00000000-0000-0000-0000-0000000001b9', 'firm-basic', 'corp', 'active', now() + interval '300 days'),
  -- a free row and an expired paid row lift nothing
  ('00000000-0000-0000-0000-0000000001a1', 'lawyer-free', 'free', 'active', null),
  ('00000000-0000-0000-0000-0000000001b0', 'firm-basic', 'corp', 'active', now() - interval '1 day');
insert into public.founder_seats (user_id, status, ends_at) values
  ('00000000-0000-0000-0000-0000000001a3', 'active', now() + interval '300 days');
do $$
declare v_p0 uuid; v_p9 uuid;
begin
  select id into v_p0 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000001b0';
  select id into v_p9 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000001b9';
  if v_p0 is null or v_p9 is null then raise exception 'fixtures: the firm signups made no firm row'; end if;
  insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
    (v_p0, '00000000-0000-0000-0000-0000000001a5', 'legal_secretary', 'active', now()),
    (v_p9, '00000000-0000-0000-0000-0000000001a6', 'hr_manager', 'active', now()),
    (v_p9, '00000000-0000-0000-0000-0000000001a7', 'lawyer', 'active', now());
end $$;

-- ── T1 who is locked ─────────────────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in select * from (values
      ('00000000-0000-0000-0000-0000000001a1'::uuid, true,  'free lawyer'),
      ('00000000-0000-0000-0000-0000000001a2'::uuid, false, 'paid lawyer'),
      ('00000000-0000-0000-0000-0000000001a3'::uuid, false, 'founder'),
      ('00000000-0000-0000-0000-0000000001a4'::uuid, false, 'demo lawyer'),
      ('00000000-0000-0000-0000-0000000001b0'::uuid, true,  'unpaid firm (expired plan)'),
      ('00000000-0000-0000-0000-0000000001a5'::uuid, true,  'member of the unpaid firm'),
      ('00000000-0000-0000-0000-0000000001b9'::uuid, false, 'paid firm'),
      ('00000000-0000-0000-0000-0000000001a6'::uuid, false, 'individual member of the paid firm'),
      ('00000000-0000-0000-0000-0000000001a7'::uuid, false, 'lawyer member of the paid firm'),
      ('00000000-0000-0000-0000-0000000001c1'::uuid, false, 'client'),
      (null::uuid, false, 'nobody')) v(uid, expected, label) loop
    if public.office_features_locked(r.uid) is distinct from r.expected then
      raise exception 'T1 FAIL: office_features_locked(%) is not % (%)', r.uid, r.expected, r.label;
    end if;
    if public.solo_lawyer_is_capped(r.uid) is distinct from r.expected then
      raise exception 'T1 FAIL: solo_lawyer_is_capped(%) is not office_features_locked (%)', r.uid, r.label;
    end if;
  end loop;
  if (select l.cases from public.solo_lawyer_limits() l) <> 0 or (select l.clients from public.solo_lawyer_limits() l) <> 0 then
    raise exception 'T1 FAIL: the free allowance is not 0 / 0';
  end if;
  raise notice 'T1 PASS: free lawyer, unpaid firm and its member locked; paid, founder, paid firm + members, demo, client free';
end $$;

-- ── T2 cases: a self-filed case refused for the free side, a market claim free ─
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a1', false);
do $$
begin
  if not public.my_office_features_locked() then
    raise exception 'T2 FAIL: my_office_features_locked() is false for the free lawyer';
  end if;
  begin
    insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver)
    values ('r1-own', auth.uid(), auth.uid(), 'قضيتي', 'assigned', 'lawyer');
    raise exception 'T2 FAIL: a free lawyer filed a case for himself';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  -- a hearing row (legacy flag) and a draft are not cases
  insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver, metadata)
  values ('r1-h', auth.uid(), auth.uid(), 'جلسة', 'assigned', 'lawyer', '{"hearing": "true"}');
  begin
    insert into public.lawyer_clients (owner_user_id, name) values (auth.uid(), 'موكل');
    raise exception 'T2 FAIL: a free lawyer added a client card';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:clients' then raise; end if;
  end;
  -- an archived card is not counted
  insert into public.lawyer_clients (owner_user_id, name, status) values (auth.uid(), 'قديم', 'archived');
  raise notice 'T2 PASS: the free lawyer files no case and adds no client; hearing / archived rows unaffected';
end $$;

select set_config('test.uid', '00000000-0000-0000-0000-0000000001c1', false);
do $$
begin
  if public.my_office_features_locked() then
    raise exception 'T3 FAIL: a client reads as locked';
  end if;
  insert into public.service_requests (id, requester_user_id, title, status, receiver)
  values ('k1-req', auth.uid(), 'أحتاج محامياً', 'pending_assignment', 'lawyer');
end $$;
reset role;
-- the market claim: the client's request assigned to the free lawyer (service role)
do $$
begin
  update public.service_requests set assigned_to = '00000000-0000-0000-0000-0000000001a1', status = 'assigned' where id = 'k1-req';
  if (select assigned_to from public.service_requests where id = 'k1-req') <> '00000000-0000-0000-0000-0000000001a1' then
    raise exception 'T3 FAIL: the market claim did not land';
  end if;
  -- the service role is held on a self-filed case too
  begin
    insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver)
    values ('r1-svc', '00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001a1', 'قضية', 'assigned', 'lawyer');
    raise exception 'T3 FAIL: a service-role self-filed case of a free lawyer was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  -- moving the claim to «filed by himself» is a new counted case → refused
  begin
    update public.service_requests set requester_user_id = '00000000-0000-0000-0000-0000000001a1' where id = 'k1-req';
    raise exception 'T3 FAIL: re-pointing the requester turned a claim into a case unchecked';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  raise notice 'T3 PASS: a client request claimed by a free lawyer is accepted (market intake is free); self-filed cases refused even to the service role';
end $$;

-- ── T4 paid lawyer, founder, paid-firm member: cases and clients open ───────
set role authenticated;
do $$
declare
  u uuid;
begin
  foreach u in array array['00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a3', '00000000-0000-0000-0000-0000000001a7']::uuid[] loop
    perform set_config('test.uid', u::text, false);
    if public.my_office_features_locked() then
      raise exception 'T4 FAIL: % reads as locked', u;
    end if;
    insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver)
    values ('paid-' || u::text, u, u, 'قضية', 'assigned', 'lawyer');
    insert into public.lawyer_clients (owner_user_id, name) values (u, 'موكل');
  end loop;
  raise notice 'T4 PASS: a paid lawyer, a founder and a paid firm''s member file cases and add clients';
end $$;
reset role;

-- ── T5 the 1 GB quota ────────────────────────────────────────────────────────
-- r1 (free) and r2 (paid) already store 1 GB each (superuser seed rows, trigger bypassed by owner null → set after)
insert into storage.objects (bucket_id, name, owner, owner_id, metadata) values
  ('documents', 'seed/r1', null, null, '{"size": 1073741824}'),
  ('documents', 'seed/r2', null, null, '{"size": 1073741824}'),
  ('documents', 'seed/k1', null, null, '{"size": 1073741824}');
update storage.objects set owner = '00000000-0000-0000-0000-0000000001a1', owner_id = '00000000-0000-0000-0000-0000000001a1' where name = 'seed/r1';
update storage.objects set owner = '00000000-0000-0000-0000-0000000001a2', owner_id = '00000000-0000-0000-0000-0000000001a2' where name = 'seed/r2';
update storage.objects set owner = '00000000-0000-0000-0000-0000000001c1', owner_id = '00000000-0000-0000-0000-0000000001c1' where name = 'seed/k1';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a1', false);
do $$
declare q record;
begin
  select * into q from public.my_storage_quota();
  if q.used_bytes <> 1073741824 or q.cap_bytes <> 1073741824 or not q.limited then
    raise exception 'T5 FAIL: my_storage_quota() for the free lawyer is % / % / %', q.used_bytes, q.cap_bytes, q.limited;
  end if;
  begin
    insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('documents', 'r1/new.pdf', auth.uid(), auth.uid()::text, '{"size": 10}');
    raise exception 'T5 FAIL: a free lawyer at 1 GB uploaded a new file';
  exception when raise_exception then
    if sqlerrm <> 'storage_quota_full' then raise; end if;
  end;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a2', false);
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('documents', 'r2/new.pdf', '00000000-0000-0000-0000-0000000001a2', '00000000-0000-0000-0000-0000000001a2', '{"size": 10}');
select set_config('test.uid', '00000000-0000-0000-0000-0000000001c1', false);
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('documents', 'k1/new.pdf', '00000000-0000-0000-0000-0000000001c1', '00000000-0000-0000-0000-0000000001c1', '{"size": 10}');
reset role;
-- the service role writes with no owner (licence images): never held
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('lawyer-licences', 'r1/licence.png', null, null, '{"size": 10}');
-- below the cap the free lawyer uploads
delete from storage.objects where name = 'seed/r1';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a1', false);
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values ('documents', 'r1/small.pdf', '00000000-0000-0000-0000-0000000001a1', '00000000-0000-0000-0000-0000000001a1', '{"size": 10}');
reset role;
do $$ begin raise notice 'T5 PASS: at 1 GB a free lawyer''s new file is refused; paid owner, client, service role and a free lawyer under the cap upload'; end $$;

-- ── T6 D-53: the paid firm's hr_manager manages the team, within limits ─────
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a6', false);
do $$
declare v_p9 uuid;
begin
  select firm_id into v_p9 from public.firm_members where user_id = auth.uid() and status = 'active';
  if v_p9 is null then raise exception 'T6 FAIL: the hr_manager cannot read his own membership'; end if;
  -- invite a lawyer (allowed)
  insert into public.firm_members (firm_id, user_id, role, status) values (v_p9, '00000000-0000-0000-0000-0000000001a8', 'trainee', 'invited');
  -- re-role the lawyer member (allowed)
  update public.firm_members set role = 'senior_lawyer' where firm_id = v_p9 and user_id = '00000000-0000-0000-0000-0000000001a7';
  if (select role from public.firm_members where firm_id = v_p9 and user_id = '00000000-0000-0000-0000-0000000001a7') <> 'senior_lawyer' then
    raise exception 'T6 FAIL: the hr_manager''s re-role did not land';
  end if;
  begin
    update public.firm_members set role = 'managing_partner' where firm_id = v_p9 and user_id = '00000000-0000-0000-0000-0000000001a7';
    raise exception 'T6 FAIL: the hr_manager granted managing_partner';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.firm_members set status = 'suspended' where firm_id = v_p9 and user_id = '00000000-0000-0000-0000-0000000001b9';
    raise exception 'T6 FAIL: the hr_manager suspended the owner';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.firm_members set role = 'partner' where firm_id = v_p9 and user_id = auth.uid();
    raise exception 'T6 FAIL: the hr_manager changed his own role';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6 PASS: the hr_manager invites and re-roles members; never managing_partner, never the owner, never himself';
end $$;
-- a plain member writes nothing (RLS)
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a7', false);
do $$
declare v_p9 uuid; n int;
begin
  select firm_id into v_p9 from public.firm_members where user_id = auth.uid() and status = 'active';
  begin
    insert into public.firm_members (firm_id, user_id, role, status) values (v_p9, '00000000-0000-0000-0000-0000000001c1', 'trainee', 'invited');
    raise exception 'T7 FAIL: a plain member invited someone';
  exception when insufficient_privilege then null;
  end;
  update public.firm_members set status = 'suspended' where firm_id = v_p9 and user_id = '00000000-0000-0000-0000-0000000001a8';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T7 FAIL: a plain member changed another membership'; end if;
  raise notice 'T7 PASS: a plain member (role lawyer) neither invites nor changes a membership';
end $$;
reset role;

-- ── T8 grants ────────────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('authenticated', 'public.office_features_locked(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.office_plan_entitled(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.storage_used_bytes(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_office_features_locked()', 'EXECUTE')
     or has_function_privilege('anon', 'public.my_storage_quota()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_office_features_locked()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.my_storage_quota()', 'EXECUTE') then
    raise exception 'T8 FAIL: function privileges are wrong';
  end if;
  raise notice 'T8 PASS: the rule is server-only; a session learns only its own answer';
end $$;

-- ── T9 the review switch: the owner and the managing partner, nobody else ───
do $$
declare v_p9 uuid;
begin
  select id into v_p9 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000001b9';
  insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
  values (v_p9, '00000000-0000-0000-0000-0000000001c1', 'managing_partner', 'active', now());
end $$;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001c1', false);
do $$
begin
  if public.set_firm_public_reviews(true) is not true then
    raise exception 'T9 FAIL: the managing partner could not switch the reviews on';
  end if;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001a6', false);
do $$
begin
  begin
    perform public.set_firm_public_reviews(false);
    raise exception 'T9 FAIL: the hr_manager switched the reviews';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000001b9', false);
do $$
begin
  if public.set_firm_public_reviews(false) is not false then
    raise exception 'T9 FAIL: the firm account could not switch the reviews off';
  end if;
  raise notice 'T9 PASS: the firm account and its managing partner switch the public reviews; the hr_manager does not';
end $$;
reset role;

select 'roles_office_plan_l16: ALL PASS' as result;
