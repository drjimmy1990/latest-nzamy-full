-- restricted_cases_l4.test.sql — proves 20261125_40 (batch l4-lawyer):
--   N01-19 restricted firm cases, F7 firm invitation link + leaving the firm.
--
--   M=supabase/migrations; R=supabase/tests/rls; bash $R/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261018_04_service_requests_session_write_guard.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $M/20261125_40_restricted_cases.sql \
--     $R/restricted_cases_l4.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261125_40
-- lines → T1 «column is_restricted does not exist».
--
-- People (firm F, owner O):
--   L  lawyer, active, lead + filer of case-r (the restricted case) and case-u
--   T  legal secretary, active, on case-r's team
--   M  lawyer, active, plain member (NOT on case-r's team)
--   P  lawyer, active managing_partner (not the owner)
--   N  lawyer with no firm, invited by link (e-mail new@l4.test)
--   Z  lawyer with no firm, e-mail other@l4.test
-- Every assertion RAISES on failure. Runs as role `authenticated`.
\set ON_ERROR_STOP 1

insert into auth.users values
  ('00000000-0000-0000-0000-0000000000a0'),
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a4'),
  ('00000000-0000-0000-0000-0000000000a5'),
  ('00000000-0000-0000-0000-0000000000a6'),
  ('00000000-0000-0000-0000-0000000000a7');
insert into public.profiles (id, user_type, display_name, email) values
  ('00000000-0000-0000-0000-0000000000a0', 'firm',       'O', 'o@l4.test'),
  ('00000000-0000-0000-0000-0000000000a1', 'lawyer',     'L', 'l@l4.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'individual', 'T', 't@l4.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'lawyer',     'M', 'm@l4.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'lawyer',     'P', 'p@l4.test'),
  ('00000000-0000-0000-0000-0000000000a5', 'lawyer',     'N', 'New@L4.test'),
  ('00000000-0000-0000-0000-0000000000a6', 'lawyer',     'Z', 'other@l4.test'),
  ('00000000-0000-0000-0000-0000000000a7', 'individual', 'K', 'k@l4.test');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a0', 'مكتب الاختبار');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', 'legal_secretary',  'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3', 'lawyer',           'active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a4', 'managing_partner', 'active', now());
insert into public.service_requests (id, requester_user_id, assigned_to, title, firm_id) values
  ('case-r', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'قضية مقيدة', 'ffffffff-0000-0000-0000-0000000000f1'),
  ('case-u', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'قضية عادية', 'ffffffff-0000-0000-0000-0000000000f1');
insert into public.case_team_members (request_id, user_id, firm_id, added_by) values
  ('case-r', '00000000-0000-0000-0000-0000000000a2', 'ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1');
insert into public.hearings (owner_user_id, firm_id, case_request_id, title, hearing_date)
select '00000000-0000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000f1', c, 'جلسة ' || c, current_date + 3
  from unnest(array['case-r', 'case-u']) c;
insert into public.case_notes (request_id, author_user_id, firm_id, body, visibility) values
  ('case-r', '00000000-0000-0000-0000-0000000000a1', 'ffffffff-0000-0000-0000-0000000000f1', 'ملاحظة للمكتب', 'firm');

create or replace function pg_temp.seen(p_case text) returns int language sql as $$
  select (select count(*) from public.service_requests where id = p_case)::int * 100
       + (select count(*) from public.hearings where case_request_id = p_case)::int * 10
       + (select count(*) from public.case_notes where request_id = p_case)::int;
$$;
grant execute on function pg_temp.seen(text) to authenticated;

set role authenticated;

-- ── T1 before any restriction every active member sees the case ─────────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
begin
  if pg_temp.seen('case-r') <> 111 then
    raise exception 'T1 FAIL: M should see case-r, its hearing and its firm note before the restriction (got %)', pg_temp.seen('case-r');
  end if;
  if (select is_restricted from public.service_requests where id = 'case-r') then
    raise exception 'T1 FAIL: a case starts restricted';
  end if;
  raise notice 'T1 PASS: an unrestricted firm case is readable by every active member';
end $$;

-- ── T2 a plain member cannot restrict; a direct UPDATE is refused too ───────
do $$
begin
  begin
    perform public.set_case_restricted('case-r', true);
    raise exception 'T2 FAIL: a plain member restricted a case';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: a plain member cannot restrict a case (42501)';
end $$;

select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  begin
    update public.service_requests set is_restricted = true where id = 'case-r';
    raise exception 'T3 FAIL: the lead flipped is_restricted with a plain UPDATE (the session guard should refuse it)';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: a raw UPDATE of is_restricted is refused by the session write guard (42501)';
end $$;

-- ── T4 the lead restricts through the RPC ───────────────────────────────────
do $$
begin
  if public.set_case_restricted('case-r', true) is not true then
    raise exception 'T4 FAIL: set_case_restricted did not return true';
  end if;
  if pg_temp.seen('case-r') <> 111 then
    raise exception 'T4 FAIL: the lead lost his own restricted case (got %)', pg_temp.seen('case-r');
  end if;
  raise notice 'T4 PASS: the lead restricts the case and still reads it';
end $$;

-- ── T5 the plain member loses the case, its hearing and its firm note ───────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
declare n int;
begin
  if pg_temp.seen('case-r') <> 0 then
    raise exception 'T5 FAIL: a plain firm member still reads the restricted case (got %)', pg_temp.seen('case-r');
  end if;
  if pg_temp.seen('case-u') <> 110 then
    raise exception 'T5 FAIL: the unrestricted case-u disappeared for M (got %)', pg_temp.seen('case-u');
  end if;
  begin
    insert into public.hearings (owner_user_id, firm_id, case_request_id, title, hearing_date)
    values ('00000000-0000-0000-0000-0000000000a3', 'ffffffff-0000-0000-0000-0000000000f1', 'case-r', 'دسّ', current_date + 5);
    raise exception 'T5 FAIL: M filed a hearing under the restricted case';
  exception when insufficient_privilege then null;
  end;
  update public.hearings set title = 'x' where case_request_id = 'case-r';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T5 FAIL: M updated % hearing(s) of the restricted case', n; end if;
  if public.case_visible('case-r') then raise exception 'T5 FAIL: case_visible says yes to M'; end if;
  raise notice 'T5 PASS: a plain firm member cannot read or write the restricted case, its hearing or its note';
end $$;

-- ── T6 the case team member, the managing partner and the owner still see it ─
do $$
declare who text; uid text;
begin
  foreach uid in array array['00000000-0000-0000-0000-0000000000a2',
                             '00000000-0000-0000-0000-0000000000a4',
                             '00000000-0000-0000-0000-0000000000a0'] loop
    perform set_config('test.uid', uid, false);
    if pg_temp.seen('case-r') <> 111 then
      raise exception 'T6 FAIL: % should read case-r, its hearing and note (got %)', uid, pg_temp.seen('case-r');
    end if;
  end loop;
  raise notice 'T6 PASS: case-team member, managing partner and firm owner read the restricted case';
end $$;

-- ── T7 a team member who stops being active loses it ────────────────────────
reset role;
update public.firm_members set status = 'suspended'
 where user_id = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', false);
do $$
begin
  if pg_temp.seen('case-r') <> 0 then
    raise exception 'T7 FAIL: a suspended team member still reads the restricted case (got %)', pg_temp.seen('case-r');
  end if;
  raise notice 'T7 PASS: a suspended team member loses the restricted case';
end $$;
reset role;
update public.firm_members set status = 'active'
 where user_id = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;

-- ── T8 no session sees nothing restricted ───────────────────────────────────
select set_config('test.uid', '', false);
do $$
begin
  if public.case_visible('case-r') then raise exception 'T8 FAIL: case_visible is true with no session'; end if;
  if not public.case_visible('case-u') then raise exception 'T8 FAIL: an unrestricted case reads as hidden'; end if;
  raise notice 'T8 PASS: with no session a restricted case is hidden, an open one is not';
end $$;

-- ── T9 the managing partner lifts the restriction ───────────────────────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a4', false);
select public.set_case_restricted('case-r', false);
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
begin
  if pg_temp.seen('case-r') <> 111 then
    raise exception 'T9 FAIL: M does not see case-r again after the lift (got %)', pg_temp.seen('case-r');
  end if;
  raise notice 'T9 PASS: the managing partner lifts the restriction; the whole firm reads the case again';
end $$;

-- ── T10 a firm-less case cannot be restricted ──────────────────────────────
reset role;
insert into public.service_requests (id, requester_user_id, assigned_to, title)
values ('case-solo', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'قضية فردية');
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  begin
    perform public.set_case_restricted('case-solo', true);
    raise exception 'T10 FAIL: a solo case was restricted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'T10 PASS: only a firm case can be restricted (22023)';
end $$;

-- ═════════════════════════════ F7 invitations ════════════════════════════════
-- ── T11 a plain member cannot invite; nobody can write the table directly ────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
begin
  begin
    perform public.create_firm_team_invitation('ffffffff-0000-0000-0000-0000000000f1', 'x@l4.test', 'lawyer');
    raise exception 'T11 FAIL: a plain member created an invitation';
  exception when insufficient_privilege then null;
  end;
  begin
    -- the forged invitation of the old policy: inviter_id = me, any firm
    insert into public.team_invitations (entity_id, entity_type, inviter_id, invitee_email, role)
    values ('ffffffff-0000-0000-0000-0000000000f1', 'firm', '00000000-0000-0000-0000-0000000000a3', 'm@l4.test', 'managing_partner');
    raise exception 'T11 FAIL: a member wrote team_invitations directly';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T11 PASS: a plain member can neither invite nor forge a team_invitations row (42501)';
end $$;

-- ── T12 the owner invites by e-mail ─────────────────────────────────────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a0', false);
do $$
declare r record; n int;
begin
  select * into r from public.create_firm_team_invitation('ffffffff-0000-0000-0000-0000000000f1', ' new@l4.TEST ', 'senior_lawyer');
  if r.token is null or length(r.token) < 40 then raise exception 'T12 FAIL: no usable token'; end if;
  perform set_config('test.tok', r.token, false);
  -- a second invitation to the same address cancels the first
  select * into r from public.create_firm_team_invitation('ffffffff-0000-0000-0000-0000000000f1', 'new@l4.test', 'lawyer');
  select count(*) into n from public.team_invitations where invitee_email = 'new@l4.test' and status = 'pending';
  if n <> 1 then raise exception 'T12 FAIL: % pending invitations for one address', n; end if;
  perform set_config('test.tok_old', current_setting('test.tok'), false);
  perform set_config('test.tok', r.token, false);
  begin
    perform public.create_firm_team_invitation('ffffffff-0000-0000-0000-0000000000f1', 'not-an-email', 'lawyer');
    raise exception 'T12 FAIL: a malformed address was accepted';
  exception when invalid_parameter_value then null;
  end;
  raise notice 'T12 PASS: the owner invites by e-mail; one live invitation per address';
end $$;

-- ── T13 the wrong account cannot redeem; a cancelled token is dead ──────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a6', false);
do $$
begin
  begin
    perform public.redeem_firm_team_invitation(current_setting('test.tok'));
    raise exception 'T13 FAIL: another account redeemed the invitation';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T13 PASS: an account with another e-mail cannot redeem the link (42501)';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a5', false);
do $$
begin
  begin
    perform public.redeem_firm_team_invitation(current_setting('test.tok_old'));
    raise exception 'T13b FAIL: the cancelled invitation was redeemed';
  exception when no_data_found then null;
  end;
  raise notice 'T13b PASS: a superseded invitation cannot be redeemed (P0002)';
end $$;

-- ── T14 the invitee redeems → an invited membership, not an active one ──────
select set_config('test.member', public.redeem_firm_team_invitation(current_setting('test.tok'))::text, false);
reset role;
do $$
declare st text; rl text;
begin
  select status, role into st, rl from public.firm_members where id = current_setting('test.member')::uuid;
  if st is distinct from 'invited' or rl is distinct from 'lawyer' then
    raise exception 'T14 FAIL: redeem wrote status=% role=% (want invited/lawyer)', st, rl;
  end if;
  if (select status from public.team_invitations where token = current_setting('test.tok')) <> 'accepted' then
    raise exception 'T14 FAIL: the invitation is not marked accepted';
  end if;
end $$;
set role authenticated;
do $$
begin
  begin
    perform public.redeem_firm_team_invitation(current_setting('test.tok'));
    raise exception 'T14 FAIL: the same link was redeemed twice';
  exception when no_data_found then null;
  end;
  raise notice 'T14 PASS: the invitee redeems once into an invited membership (accept is the existing route)';
end $$;

-- ── T15 the inviter must still manage the firm; expired links die ───────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a4', false);
do $$
declare r record;
begin
  select * into r from public.create_firm_team_invitation('ffffffff-0000-0000-0000-0000000000f1', 'other@l4.test', 'trainee');
  perform set_config('test.tok_p', r.token, false);
end $$;
reset role;
update public.firm_members set role = 'lawyer' where user_id = '00000000-0000-0000-0000-0000000000a4';
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a6', false);
do $$
begin
  begin
    perform public.redeem_firm_team_invitation(current_setting('test.tok_p'));
    raise exception 'T15 FAIL: an invitation from a demoted partner was redeemed';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T15 PASS: a link from someone who no longer manages the firm is refused (42501)';
end $$;
reset role;
update public.firm_members set role = 'managing_partner' where user_id = '00000000-0000-0000-0000-0000000000a4';
update public.team_invitations set expires_at = now() - interval '1 minute' where token = current_setting('test.tok_p');
set role authenticated;
do $$
begin
  begin
    perform public.redeem_firm_team_invitation(current_setting('test.tok_p'));
    raise exception 'T15b FAIL: an expired invitation was redeemed';
  exception when sqlstate 'P0003' then null;
  end;
  raise notice 'T15b PASS: an expired link is refused (P0003)';
end $$;
-- ═════════════════════════════ F7 leaving ════════════════════════════════════
-- ── T16 the owner cannot leave; a member leaves and loses the firm's cases ──
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a0', false);
do $$
begin
  begin
    perform public.leave_firm('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'T16 FAIL: the owner left his own firm';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T16 PASS: the firm owner cannot leave (42501)';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', false);
do $$
begin
  if pg_temp.seen('case-u') = 0 then raise exception 'T17 setup: M should read case-u before leaving'; end if;
  perform public.leave_firm('ffffffff-0000-0000-0000-0000000000f1');
  if pg_temp.seen('case-u') <> 0 then
    raise exception 'T17 FAIL: after leaving M still reads the firm case (got %)', pg_temp.seen('case-u');
  end if;
  if (select status from public.firm_members where user_id = auth.uid()) <> 'removed' then
    raise exception 'T17 FAIL: the membership is not removed';
  end if;
  begin
    perform public.leave_firm('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'T17 FAIL: left twice';
  exception when no_data_found then null;
  end;
  raise notice 'T17 PASS: a member leaves (status removed) and loses the firm''s cases';
end $$;

-- ── T18 grants ──────────────────────────────────────────────────────────────
reset role;
do $$
begin
  if has_function_privilege('anon', 'public.set_case_restricted(text, boolean)', 'EXECUTE')
     or has_function_privilege('anon', 'public.redeem_firm_team_invitation(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.leave_firm(uuid)', 'EXECUTE') then
    raise exception 'T18 FAIL: anon can execute a 20261125_40 function';
  end if;
  if has_table_privilege('authenticated', 'public.team_invitations', 'INSERT') then
    raise exception 'T18 FAIL: authenticated can INSERT team_invitations';
  end if;
  raise notice 'T18 PASS: no anon EXECUTE; team_invitations is written only by the functions';
end $$;

select 'restricted_cases_l4: ALL PASS' as result;
