-- RLS acceptance test for 20260922_02_members_accept_own_invitation.sql
-- (review 2026-09-21 item A5 / F03 — consent at entry).
--
-- CHAIN (run.sh / run-local.sh, in this order — the same chain
-- entity_members_no_recursion.test.sql uses, with 20260922_02 appended):
--   supabase/tests/rls/prelude_entity_rls_chain.sql
--   supabase/migrations/20260616_entities_setup_and_rls_fix.sql
--   supabase/migrations/20260617_fix_remaining_rls.sql
--   supabase/migrations/20260903_phase2_clients_and_firm_membership.sql
--   supabase/migrations/20260914_entity_memberships_and_business_requests.sql
--   supabase/migrations/20260921_03_entity_rls_recursion_fix.sql
--   supabase/migrations/20260922_02_members_accept_own_invitation.sql
--   supabase/tests/rls/members_accept_own_invitation.test.sql   <- this file
--
-- WHAT IT PROVES
--   A1  an invited user flips their OWN row to active, and accepted_at is set
--   A2  …and to removed (decline)
--   B   an invitee cannot touch ANOTHER user's invited row          (0 rows)
--   C   an invitee cannot change their own ACTIVE row's status      (0 rows)
--   D   the column guard: accepting while also sending `role` and the entity
--       key leaves both at their old values — RLS filters rows, not columns,
--       and `authenticated` holds the table-level UPDATE grant
--   E   an invitee cannot park their own row at `suspended` or back at
--       `invited` (42501)
--   F   the owner path from 20260921_03 is unchanged: invite, cancel,
--       re-invite, change role, delete
--   G   an invited row still grants NOTHING — the business member's arm of
--       20260914's service_requests policy stays shut until acceptance
--   H   THE OWNER CANNOT ANSWER FOR THE INVITEE — the two-call product path
--       (POST an invitation, then PATCH it to `active`) is refused, and so are
--       its two walk-arounds: forging `accepted_at` in the same statement, and
--       `invited -> suspended -> active`. Without this the rest of the file is
--       theatre: writing `invited` at POST time closes nothing while the owner
--       can flip it themselves, and the flipped row then disappears from
--       `GET /api/v1/me/invitations` so the victim is never even shown it.
--   I   …while the LEGITIMATE owner powers survive: re-activating a member who
--       DID accept and was later suspended, and the POST route's re-invite arm
--       clearing `accepted_at` (after which an answer is required again)
--   BOOT  `ensure_business_owner_membership` (20260914:21-36) still works,
--       including its `on conflict do update`, which fires this BEFORE UPDATE
--       guard
--
-- No `\set ON_ERROR_STOP 0`: every `raise exception` below fails the run.
\pset format unaligned
\pset tuples_only on

-- -- fixtures as postgres (RLS bypassed on purpose) ---------------------------
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000f'),   -- O  owner of all four entities
  ('cccccccc-0000-0000-0000-000000000003'),   -- I  the invitee
  ('bbbbbbbb-0000-0000-0000-000000000002'),   -- J  a second invitee
  ('aaaaaaaa-0000-0000-0000-000000000001');   -- X  an outsider
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-00000000000f','firm','O'),
  ('cccccccc-0000-0000-0000-000000000003','lawyer','I'),
  ('bbbbbbbb-0000-0000-0000-000000000002','lawyer','J'),
  ('aaaaaaaa-0000-0000-0000-000000000001','individual','X');

-- One entity of each kind, all owned by O. firm/business gain an owner
-- membership row by trigger (20260903:266, 20260914:38); government and NGO
-- have no such trigger.
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-00000000000f','مكتب الاختبار');
insert into public.business_profiles (id, owner_user_id, company_name_ar) values
  ('ffffffff-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-00000000000f','شركة الاختبار');
insert into public.government_profiles (id, owner_user_id, entity_name_ar, entity_type) values
  ('ffffffff-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-00000000000f','جهة الاختبار','ministry');
insert into public.ngo_profiles (id, owner_user_id, org_name_ar, org_type) values
  ('ffffffff-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-00000000000f','جمعية الاختبار','charity');

-- A SECOND company, owned by nobody I or J knows: the row the column guard
-- must stop an invitee from moving their own membership onto.
insert into public.business_profiles (id, owner_user_id, company_name_ar) values
  ('ffffffff-0000-0000-0000-0000000000b2','aaaaaaaa-0000-0000-0000-000000000001','شركة الضحية');

-- A private request of the victim company, to prove an `invited` row grants
-- nothing (20260914's «business members read business service requests»).
insert into public.service_requests (id, requester_user_id, title, business_id)
  values ('req-biz-2','aaaaaaaa-0000-0000-0000-000000000001','طلب الشركة الثانية','ffffffff-0000-0000-0000-0000000000b2');

select 'policies per membership table after 20260922_02 (expect 5 each): '
       || string_agg(c.relname || '=' || (select count(*) from pg_policy p where p.polrelid = c.oid),
                     ' · ' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('firm_members','business_members','government_members','ngo_members');

do $$
declare n int;
begin
  select count(*) into n
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in ('firm_members','business_members','government_members','ngo_members')
     and pol.polname = c.relname || ': invitee can answer own invitation';
  if n <> 4 then
    raise exception 'T0 FAIL: % of 4 invitee UPDATE policies installed', n;
  end if;
  select count(*) into n
    from pg_trigger
   where tgname like 'trg%_members_invitation_answer' and not tgisinternal;
  if n <> 4 then
    raise exception 'T0 FAIL: % of 4 invitation-answer column guards attached', n;
  end if;
  raise notice 'T0 PASS: 4 invitee UPDATE policies + 4 column guards';
end $$;

-- -- the invitations the owner hands out ---------------------------------------
-- Written as postgres so the owner path is not what is under test here (it is
-- tested on its own in F below).
insert into public.firm_members (firm_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-000000000003','lawyer','invited');
insert into public.business_members (business_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-000000000003','employee','invited');
insert into public.business_members (business_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000b1','bbbbbbbb-0000-0000-0000-000000000002','employee','invited');
insert into public.government_members (gov_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000c1','cccccccc-0000-0000-0000-000000000003','officer','invited');
insert into public.ngo_members (ngo_id, user_id, role, status)
  values ('ffffffff-0000-0000-0000-0000000000d1','cccccccc-0000-0000-0000-000000000003','volunteer','invited');

-- -- from here on: app_user (a member of `authenticated`), impersonating ------
set role app_user;

-- -- G. an invited row grants nothing ------------------------------------------
-- Before anything is accepted: I is `invited` on the first company and has no
-- row at all on the victim company, and can read neither company's requests.
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'req-biz-2';
  if n <> 0 then
    raise exception 'G FAIL: an invited (not accepted) member reads another company''s request';
  end if;
  raise notice 'G PASS: an `invited` row grants no access to company requests';
end $$;

-- -- B. an invitee cannot touch another user's invited row ---------------------
do $$
declare n int;
begin
  update public.business_members set status = 'active'
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'B FAIL: I updated % row(s) of J''s invitation', n;
  end if;
  raise notice 'B PASS: an invitee updated 0 rows of another user''s invitation';
end $$;

-- -- E. only `active` or `removed` is an answer --------------------------------
do $$
begin
  update public.business_members set status = 'suspended'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  raise exception 'E FAIL: an invitee parked their own row at `suspended`';
exception when insufficient_privilege then
  raise notice 'E PASS: `suspended` from an invitee refused (42501)';
end $$;

do $$
begin
  update public.business_members set status = 'invited', role = 'legal_manager'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  raise exception 'E FAIL: an invitee re-wrote their own invitation in place';
exception when insufficient_privilege then
  raise notice 'E PASS: status `invited` from an invitee refused (42501)';
end $$;

-- -- D. the column guard -------------------------------------------------------
-- The accept an attacker would actually send through PostgREST: the status the
-- policy allows, plus a role they were never offered and another company's id.
do $$
declare
  r record;
  n int;
begin
  update public.business_members
     set status      = 'active',
         role        = 'legal_manager',
         business_id = 'ffffffff-0000-0000-0000-0000000000b2',
         permissions = array['everything'],
         department  = 'مسروق'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'D FAIL: the invitee''s own accept touched % row(s), expected 1', n;
  end if;

  select business_id, role, status, accepted_at, permissions, department
    into r
    from public.business_members
   where user_id = 'cccccccc-0000-0000-0000-000000000003';

  -- A1: the accept itself worked, and accepted_at was stamped by the guard.
  if r.status <> 'active' then
    raise exception 'A1 FAIL: status is %, expected active', r.status;
  end if;
  if r.accepted_at is null then
    raise exception 'A1 FAIL: accepted_at was not stamped on accept';
  end if;

  -- D: and nothing else moved.
  if r.role <> 'employee' then
    raise exception 'D FAIL: the invitee accepted as role % — they were offered employee', r.role;
  end if;
  if r.business_id::text <> 'ffffffff-0000-0000-0000-0000000000b1' then
    raise exception 'D FAIL: the invitee moved their membership onto company %', r.business_id;
  end if;
  if r.permissions <> array[]::text[] then
    raise exception 'D FAIL: the invitee granted themselves permissions %', r.permissions;
  end if;
  if r.department is not null then
    raise exception 'D FAIL: the invitee wrote department %', r.department;
  end if;
  raise notice 'A1 PASS: the invitee accepted their own invitation (active + accepted_at)';
  raise notice 'D PASS: role, entity key, permissions and department all pinned to their invited values';
end $$;

-- …and accepting really did open the first company's door, not the second's.
do $$
declare n int;
begin
  select count(*) into n from public.service_requests where id = 'req-biz-2';
  if n <> 0 then
    raise exception 'D FAIL: after accepting company 1, the invitee reads company 2''s request';
  end if;
  raise notice 'D PASS: acceptance did not reach the company that never invited them';
end $$;

-- -- C. an ACTIVE row's status is still not self-writable ----------------------
-- The USING arm is `status = 'invited'`, so the row no longer qualifies: a
-- member still cannot resign, suspend themselves, or re-open their invitation.
do $$
declare n int;
begin
  update public.business_members set status = 'removed'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'C FAIL: an active member changed their own status (% row(s))', n;
  end if;
  update public.business_members set role = 'legal_manager'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'C FAIL: an active member changed their own role (% row(s))', n;
  end if;
  raise notice 'C PASS: an active member''s own row is read-only to them (self-departure stays owner-only)';
end $$;

-- -- A2. decline -----------------------------------------------------------------
-- J answers the same invitation the other way.
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare
  r record;
  n int;
begin
  update public.business_members set status = 'removed'
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'A2 FAIL: decline touched % row(s), expected 1', n;
  end if;
  select status, accepted_at into r
    from public.business_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if r.status <> 'removed' then
    raise exception 'A2 FAIL: status is % after decline', r.status;
  end if;
  if r.accepted_at is not null then
    raise exception 'A2 FAIL: a declined invitation carries accepted_at %', r.accepted_at;
  end if;
  raise notice 'A2 PASS: decline sets removed and leaves accepted_at null';
end $$;

-- -- A1 for the other three tables ---------------------------------------------
-- government_members / ngo_members have no accepted_at column at all
-- (20260616:183-196, :234-250); the guard must cope with that.
select set_config('test.uid', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare
  e record;
  n int;
  s text;
begin
  for e in
    select * from (values
      ('firm_members',       'firm_id',     'ffffffff-0000-0000-0000-0000000000f1', 'lawyer'),
      ('government_members', 'gov_id',      'ffffffff-0000-0000-0000-0000000000c1', 'officer'),
      ('ngo_members',        'ngo_id',      'ffffffff-0000-0000-0000-0000000000d1', 'volunteer')
    ) as v(mtbl, fk, entity_id, invited_role)
  loop
    execute format(
      'update public.%I set status = %L, role = %L where user_id = %L',
      e.mtbl, 'active', 'admin', 'cccccccc-0000-0000-0000-000000000003');
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'A1 FAIL [%]: accept touched % row(s), expected 1', e.mtbl, n;
    end if;
    execute format('select status || ''/'' || role from public.%I where user_id = %L',
                   e.mtbl, 'cccccccc-0000-0000-0000-000000000003') into s;
    if s <> 'active/' || e.invited_role then
      raise exception 'A1/D FAIL [%]: row is %, expected active/%', e.mtbl, s, e.invited_role;
    end if;
    raise notice 'A1+D PASS [%]: accepted as the offered role, not the one sent', e.mtbl;
  end loop;
end $$;

-- -- F. the owner path from 20260921_03 is untouched ---------------------------
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare
  n int;
  s text;
begin
  -- invite a third party
  insert into public.business_members (business_id, user_id, role, status)
    values ('ffffffff-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-000000000001','employee','invited');

  -- cancel the invitation (invited -> removed), the «إلغاء الدعوة» control
  update public.business_members set status = 'removed'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'F FAIL: the owner cancelled % invitation(s), expected 1', n;
  end if;

  -- re-invite the removed member (removed -> invited) — the POST route's
  -- re-invite arm, which used to be an unrecoverable 23505.
  update public.business_members set status = 'invited', role = 'legal_staff'
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'F FAIL: the owner re-invited % row(s), expected 1', n;
  end if;
  select status || '/' || role into s from public.business_members
   where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  if s <> 'invited/legal_staff' then
    raise exception 'F FAIL: after re-invite the row is %, expected invited/legal_staff', s;
  end if;

  -- the owner may still change a member's role outright…
  update public.business_members set role = 'legal_manager'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'F FAIL: the owner changed % role(s), expected 1', n;
  end if;

  -- …and delete a row (20260921_03's DELETE arm)
  delete from public.business_members where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'F FAIL: the owner deleted % row(s), expected 1', n;
  end if;

  raise notice 'F PASS: owner invite / cancel / re-invite / role change / delete all unchanged';
end $$;

-- -- H. the owner cannot answer the invitation FOR the invitee -----------------
-- The product path review A5 is actually about, in two owner-only calls:
--   POST  /api/v1/business/members {email, role}         -> row at `invited`
--   PATCH /api/v1/business/members/{id} {"status":"active"}
-- J is still `invited` here — B proved the other invitee could not touch it.
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
begin
  update public.business_members set status = 'active'
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise exception 'H FAIL: the owner flipped an invitation to active - A5 is NOT closed';
exception when insufficient_privilege then
  raise notice 'H PASS: the owner cannot accept an invitation on the invitee''s behalf (42501)';
end $$;

-- The same PATCH with the evidence of consent forged in the same statement,
-- which is what a raw PostgREST call would send once the plain one fails.
do $$
begin
  update public.business_members set status = 'active', accepted_at = now()
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise exception 'H FAIL: the owner forged accepted_at and activated the invitation';
exception when insufficient_privilege then
  raise notice 'H PASS: a third party cannot write accepted_at to buy itself the invariant';
end $$;

-- …and the walk-around the invariant is phrased to stop: it is stated on the
-- RESULTING ROW, not on one transition.
do $$
declare s text;
begin
  update public.business_members set status = 'suspended'
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  begin
    update public.business_members set status = 'active'
     where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
    raise exception 'H FAIL: invited -> suspended -> active walked around the invariant';
  exception when insufficient_privilege then
    null;
  end;
  update public.business_members set status = 'invited'
   where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  select status || '/' || coalesce(accepted_at::text, '<null>') into s
    from public.business_members where user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if s <> 'invited/<null>' then
    raise exception 'H FAIL: after the owner''s attempts J''s row is %, expected invited/<null>', s;
  end if;
  raise notice 'H PASS: invited -> suspended -> active refused; the invitation is untouched';
end $$;

-- The end-to-end statement: the victim is still not a member of anything.
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
begin
  if public.is_active_business_member('ffffffff-0000-0000-0000-0000000000b1') then
    raise exception 'H FAIL: the invitee is an ACTIVE member after the owner''s attempts';
  end if;
  raise notice 'H PASS: after every attempt the invitee is still not a member';
end $$;

-- -- I. the legitimate owner powers are NOT collateral damage -------------------
-- I accepted in A1, so `accepted_at` is stamped: suspending and re-activating
-- that membership must keep working, or the fix has broken the roster.
select set_config('test.uid', '00000000-0000-0000-0000-00000000000f', false);
do $$
declare n int; s text;
begin
  update public.business_members set status = 'suspended'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  update public.business_members set status = 'active'
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'I FAIL: re-activating a member who DID accept touched % row(s)', n;
  end if;

  -- The POST route's re-invite arm: {role, status:'invited', accepted_at:null}.
  -- Clearing the evidence is allowed — it REDUCES what the row grants…
  update public.business_members set role = 'employee', status = 'invited', accepted_at = null
   where user_id = 'cccccccc-0000-0000-0000-000000000003';
  select status || '/' || coalesce(accepted_at::text, '<null>') into s
    from public.business_members where user_id = 'cccccccc-0000-0000-0000-000000000003';
  if s <> 'invited/<null>' then
    raise exception 'I FAIL: the re-invite left the row at %, expected invited/<null>', s;
  end if;

  -- …and from there a fresh answer is required, exactly like a first invitation.
  begin
    update public.business_members set status = 'active'
     where user_id = 'cccccccc-0000-0000-0000-000000000003';
    raise exception 'I FAIL: a re-invited member was activated without answering again';
  exception when insufficient_privilege then
    null;
  end;
  raise notice 'I PASS: suspend/re-activate kept, re-invite clears consent and requires a new answer';
end $$;

-- -- BOOT. the owner bootstrap trigger is unaffected ----------------------------
-- `ensure_business_owner_membership` (20260914:21-36) inserts the owner's own
-- membership as `active` and, ON CONFLICT, UPDATEs it — which fires this
-- BEFORE UPDATE guard. Keying the invariant on OLD.accepted_at would break it.
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
do $$
declare s text;
begin
  insert into public.business_profiles (id, owner_user_id, company_name_ar)
    values ('ffffffff-0000-0000-0000-0000000000b3','bbbbbbbb-0000-0000-0000-000000000002','شركة المدعوّ');
  select status || '/' || case when accepted_at is null then '<null>' else 'stamped' end into s
    from public.business_members
   where business_id = 'ffffffff-0000-0000-0000-0000000000b3'
     and user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  if s is distinct from 'active/stamped' then
    raise exception 'BOOT FAIL: the owner''s own membership row is %, expected active/stamped', s;
  end if;

  -- the `do update` half, verbatim, under an authenticated session
  update public.business_members
     set status = 'active', accepted_at = coalesce(accepted_at, now())
   where business_id = 'ffffffff-0000-0000-0000-0000000000b3'
     and user_id = 'bbbbbbbb-0000-0000-0000-000000000002';
  raise notice 'BOOT PASS: the owner bootstrap row is created and re-asserted with the guard in place';
end $$;

-- -- footer ---------------------------------------------------------------------
reset role;
select 'policies on the 8 entity tables that read an entity table inline (expect 0): ' || count(*)
  from pg_policy pol join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('firm_profiles','firm_members','business_profiles','business_members',
                     'government_profiles','government_members','ngo_profiles','ngo_members')
   and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
        coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
       ~* '(from|join)[[:space:]]+(public\.)?(firm|business|government|ngo)_(members|profiles)';
select 'ALL PASS — A5/F03 consent-at-entry: an invitation can be answered, and only answered.';
