-- accounts_limits_l6.test.sql — proves 20261126_50 (batch l6-accounts):
--   R9  practice_kind_confirmed_at (signup stamp, backfill, explicit claim),
--       firm_profiles.firm_kind (signup metadata, session lock, ٣١٢ arm);
--   S9  a free solo lawyer: 5 active cases, 10 non-archived clients, with the
--       paid-plan / founder / firm-member / demo exemptions;
--   seat cap: firm members invited+active+suspended ≤ greatest(plan, max_seats),
--       invitation links refused when full, the last pending link not
--       double-counted.
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
--     $T/prelude_accounts_limits.sql \
--     $M/20261126_50_accounts_limits.sql \
--     $M/20261126_50_accounts_limits.sql \
--     $T/accounts_limits_l6.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261126_50
-- lines → T1 «column practice_kind_confirmed_at does not exist».
--
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1

-- ── fixtures (postgres) ──────────────────────────────────────────────────────
-- f1 free lawyer, f2 consultant (register form), f3 Google user, f4 paid,
-- f5 founder, f6 firm member, f7 demo, a0 consulting-office owner,
-- a9 law-firm owner, m1..m6 lawyers to invite, c1 client (prelude).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000f1', 'f1@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000f2', 'f2@l6.test', '{"user_type": "lawyer", "practice_kind": "consultant"}'),
  ('00000000-0000-0000-0000-0000000000f3', 'f3@l6.test', '{"full_name": "Google User"}'),
  ('00000000-0000-0000-0000-0000000000f4', 'f4@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000f5', 'f5@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000f6', 'f6@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000f7', 'f7@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000a0', 'a0@l6.test', '{"user_type": "firm", "firm_name": "مكتب استشارات", "firm_kind": "consulting_office"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'a9@l6.test', '{"user_type": "firm", "firm_name": "مكتب محاماة"}'),
  ('00000000-0000-0000-0000-0000000000d1', 'm1@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'm2@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'm3@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000d4', 'm4@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000d5', 'm5@l6.test', '{"user_type": "lawyer"}'),
  ('00000000-0000-0000-0000-0000000000d6', 'm6@l6.test', '{"user_type": "lawyer"}');
update public.profiles set email = u.email from auth.users u where u.id = profiles.id and profiles.email is null;
update public.profiles set is_demo = true where id = '00000000-0000-0000-0000-0000000000f7';
insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end) values
  ('00000000-0000-0000-0000-0000000000f4', 'lawyer-pro', 'pro', 'active', now() + interval '300 days'),
  -- a free-tier row and an expired paid row do not lift the cap
  ('00000000-0000-0000-0000-0000000000f1', 'lawyer-free', 'free', 'active', null),
  ('00000000-0000-0000-0000-0000000000f1', 'lawyer-pro', 'pro', 'active', now() - interval '1 day');
insert into public.founder_seats (user_id, status, ends_at) values
  ('00000000-0000-0000-0000-0000000000f5', 'active', now() + interval '300 days');

create or replace function pg_temp.add_cases(p_user uuid, p_prefix text, p_n int) returns void language plpgsql as $$
begin
  for i in 1..p_n loop
    insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver)
    values (p_prefix || i, p_user, p_user, 'قضية ' || i, 'assigned', 'lawyer');
  end loop;
end $$;
create or replace function pg_temp.add_clients(p_user uuid, p_n int) returns void language plpgsql as $$
begin
  for i in 1..p_n loop
    insert into public.lawyer_clients (owner_user_id, name) values (p_user, 'موكل ' || i);
  end loop;
end $$;
grant execute on function pg_temp.add_cases(uuid, text, int) to authenticated;
grant execute on function pg_temp.add_clients(uuid, int) to authenticated;

-- ── T1 R9: the signup stamp, the backfill, the claim ────────────────────────
do $$
declare
  v_f1 timestamptz; v_f2 timestamptz; v_kind text;
begin
  select practice_kind_confirmed_at into v_f1 from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f1';
  select practice_kind_confirmed_at, practice_kind into v_f2, v_kind from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f2';
  if v_f1 is null or v_f2 is null or v_kind <> 'consultant' then
    raise exception 'T1 FAIL: a register-form lawyer / consultant is not stamped (f1 %, f2 % %)', v_f1, v_f2, v_kind;
  end if;
  if (select count(*) from public.lawyer_profiles
       where practice_kind_confirmed_at is null
         and user_id in ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e3')) <> 2 then
    raise exception 'T1 FAIL: the backfill stamped a Google-only or claimed lawyer';
  end if;
  if exists (select 1 from public.lawyer_profiles
              where practice_kind_confirmed_at is null
                and user_id in ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2')) then
    raise exception 'T1 FAIL: the backfill left an e-mail / identity-less lawyer unstamped';
  end if;
  -- the Google user: individual at signup, then the claim (service role) writes the row with the answer
  if (select user_type from public.profiles where id = '00000000-0000-0000-0000-0000000000f3') <> 'individual' then
    raise exception 'T1 FAIL: a Google signup is not individual';
  end if;
  update public.profiles set user_type = 'lawyer' where id = '00000000-0000-0000-0000-0000000000f3';
  insert into public.lawyer_profiles (user_id, practice_kind, practice_kind_confirmed_at)
  values ('00000000-0000-0000-0000-0000000000f3', 'consultant', now());
  if not exists (select 1 from public.lawyer_profiles where user_id = '00000000-0000-0000-0000-0000000000f3'
                    and practice_kind = 'consultant' and practice_kind_confirmed_at is not null) then
    raise exception 'T1 FAIL: the explicit claim answer did not stand';
  end if;
  raise notice 'T1 PASS: register-form lawyers stamped; Google/claimed legacy rows left to ask; the claim answer stands';
end $$;

-- ── T2 R9: firm_kind from the signup, the session lock, ٣١٢ ─────────────────
do $$
declare v_a0 uuid; v_a9 uuid;
begin
  select id into v_a0 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000000a0';
  select id into v_a9 from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000000a9';
  if v_a0 is null or v_a9 is null then raise exception 'T2 FAIL: the firm signups made no firm row'; end if;
  if (select firm_kind from public.firm_profiles where id = v_a0) <> 'consulting_office'
     or (select firm_kind from public.firm_profiles where id = v_a9) <> 'law_firm' then
    raise exception 'T2 FAIL: firm_kind not taken from the signup metadata';
  end if;
  perform set_config('nzamy.firm_transfer_reason', 'member_removed', true);
  if not public.firm_court_rows_stay_with_member(v_a0) or public.firm_court_rows_stay_with_member(v_a9) then
    raise exception 'T2 FAIL: ٣١٢ does not read firm_kind';
  end if;
  perform set_config('nzamy.firm_transfer_reason', '', true);
  if public.firm_court_rows_stay_with_member(v_a0) then
    raise exception 'T2 FAIL: ٣١٢ fired outside a member removal';
  end if;
  raise notice 'T2 PASS: firm_kind from the signup; ٣١٢ treats a consulting office as one';
end $$;

-- a permissive owner-update policy, so the lock (not RLS) is what is tested
create policy "t2 owner updates firm" on public.firm_profiles for update
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a9', false);
do $$
begin
  begin
    update public.firm_profiles set firm_kind = 'consulting_office' where owner_user_id = auth.uid();
    raise exception 'T3 FAIL: the owner changed his firm_kind';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.firm_profiles set max_seats = 50 where owner_user_id = auth.uid();
    raise exception 'T3 FAIL: the owner raised his own max_seats';
  exception when insufficient_privilege then null;
  end;
  update public.firm_profiles set name_en = 'Office' where owner_user_id = auth.uid();
  raise notice 'T3 PASS: a session never changes firm_kind or max_seats (other columns unaffected)';
end $$;

-- ── T4 S9: a free solo lawyer — 5 active cases ──────────────────────────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000f1', false);
do $$
begin
  perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f1', 'f1-c', 5);
  begin
    perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f1', 'f1-x', 1);
    raise exception 'T4 FAIL: a 6th active case was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  -- not counted: a completed case, an AI-workspace row, a hearing flag row
  insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver) values
    ('f1-done', auth.uid(), auth.uid(), 'منتهية', 'completed', 'lawyer');
  insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver, metadata) values
    ('f1-h', auth.uid(), auth.uid(), 'جلسة', 'assigned', 'lawyer', '{"hearing": "true"}');
  -- an ordinary edit of a counted case is never refused
  update public.service_requests set status = 'in_review' where id = 'f1-c1';
  -- reopening the completed case is
  begin
    update public.service_requests set status = 'assigned' where id = 'f1-done';
    raise exception 'T4 FAIL: reopening a 6th case was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  -- closing one frees a slot
  update public.service_requests set status = 'cancelled' where id = 'f1-c2';
  perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f1', 'f1-y', 1);
  raise notice 'T4 PASS: 5 active cases, the 6th / a reopen refused, edits and closed rows free';
end $$;

-- the service role is held too, and so is a marketplace claim (assigned_to set later)
reset role;
do $$
begin
  begin
    insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver)
    values ('svc-1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1', 'محولة', 'assigned', 'lawyer');
    raise exception 'T5 FAIL: a service-role insert past the cap was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  insert into public.service_requests (id, requester_user_id, assigned_to, title, status, receiver)
  values ('open-1', '00000000-0000-0000-0000-0000000000c1', null, 'طلب مفتوح', 'pending_assignment', 'lawyer');
  begin
    update public.service_requests set assigned_to = '00000000-0000-0000-0000-0000000000f1', status = 'assigned' where id = 'open-1';
    raise exception 'T5 FAIL: claiming a 6th case was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:cases' then raise; end if;
  end;
  raise notice 'T5 PASS: the cap holds for the service role and for a claim';
end $$;

-- ── T6 exemptions: paid, founder, firm member, demo ─────────────────────────
do $$
declare v_firm uuid;
begin
  select id into v_firm from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000000a9';
  insert into public.firm_members (firm_id, user_id, role, status, accepted_at)
  values (v_firm, '00000000-0000-0000-0000-0000000000f6', 'lawyer', 'active', now());
  perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f4', 'f4-c', 7);
  perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f5', 'f5-c', 7);
  perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f6', 'f6-c', 7);
  perform pg_temp.add_cases('00000000-0000-0000-0000-0000000000f7', 'f7-c', 7);
  if public.solo_lawyer_is_capped('00000000-0000-0000-0000-0000000000f4')
     or public.solo_lawyer_is_capped('00000000-0000-0000-0000-0000000000f5')
     or public.solo_lawyer_is_capped('00000000-0000-0000-0000-0000000000f6')
     or public.solo_lawyer_is_capped('00000000-0000-0000-0000-0000000000f7')
     or not public.solo_lawyer_is_capped('00000000-0000-0000-0000-0000000000f1')
     or public.solo_lawyer_is_capped('00000000-0000-0000-0000-0000000000c1') then
    raise exception 'T6 FAIL: solo_lawyer_is_capped is wrong for an exempt or capped account';
  end if;
  raise notice 'T6 PASS: paid plan, founder seat, firm membership and demo accounts are not capped; free/expired rows do not lift it';
end $$;

-- ── T7 S9: 10 clients, archived ones free ───────────────────────────────────
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000f1', false);
do $$
declare v_id uuid;
begin
  perform pg_temp.add_clients('00000000-0000-0000-0000-0000000000f1', 10);
  begin
    perform pg_temp.add_clients('00000000-0000-0000-0000-0000000000f1', 1);
    raise exception 'T7 FAIL: an 11th client was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:clients' then raise; end if;
  end;
  insert into public.lawyer_clients (owner_user_id, name, status) values (auth.uid(), 'مؤرشف', 'archived') returning id into v_id;
  begin
    update public.lawyer_clients set status = 'active' where id = v_id;
    raise exception 'T7 FAIL: un-archiving an 11th client was accepted';
  exception when raise_exception then
    if sqlerrm <> 'plan_limit:clients' then raise; end if;
  end;
  update public.lawyer_clients set name = 'موكل معدل' where owner_user_id = auth.uid() and status = 'active' and name = 'موكل 1';
  update public.lawyer_clients set status = 'archived' where owner_user_id = auth.uid() and name = 'موكل 2';
  perform pg_temp.add_clients('00000000-0000-0000-0000-0000000000f1', 1);
  raise notice 'T7 PASS: 10 clients, the 11th / an un-archive refused, archiving frees a slot';
end $$;

-- ── T8 the firm seat cap (law firm a9: owner + f6 = 2 seats, cap 5) ─────────
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a9', false);
do $$
declare v_firm uuid; v_used int; v_cap int;
begin
  select id into v_firm from public.firm_profiles where owner_user_id = auth.uid();
  select s.used, s.cap into v_used, v_cap from public.firm_seat_status(v_firm) s;
  if v_used <> 2 or v_cap <> 5 then raise exception 'T8 FAIL: seat status % / % (want 2 / 5)', v_used, v_cap; end if;
  insert into public.firm_members (firm_id, user_id, role, status) values
    (v_firm, '00000000-0000-0000-0000-0000000000d1', 'lawyer', 'invited'),
    (v_firm, '00000000-0000-0000-0000-0000000000d2', 'lawyer', 'invited'),
    (v_firm, '00000000-0000-0000-0000-0000000000d3', 'lawyer', 'invited');
  begin
    insert into public.firm_members (firm_id, user_id, role, status) values (v_firm, '00000000-0000-0000-0000-0000000000d4', 'lawyer', 'invited');
    raise exception 'T8 FAIL: a 6th seat was accepted';
  exception when raise_exception then
    if sqlerrm <> 'firm_seats_full' then raise; end if;
  end;
  -- seat-to-seat moves are free at full: suspend, re-activate
  update public.firm_members set status = 'suspended' where firm_id = v_firm and user_id = '00000000-0000-0000-0000-0000000000f6';
  update public.firm_members set status = 'active' where firm_id = v_firm and user_id = '00000000-0000-0000-0000-0000000000f6';
  -- an invitation link is refused while full
  begin
    perform public.create_firm_team_invitation(v_firm, 'm5@l6.test', 'lawyer');
    raise exception 'T8 FAIL: an invitation link was created into a full firm';
  exception when raise_exception then
    if sqlerrm <> 'firm_seats_full' then raise; end if;
  end;
  -- removing one frees a seat; bringing a removed member back is checked
  update public.firm_members set status = 'removed' where firm_id = v_firm and user_id = '00000000-0000-0000-0000-0000000000d3';
  perform public.create_firm_team_invitation(v_firm, 'm5@l6.test', 'lawyer');
  raise notice 'T8 PASS: 5 seats (owner included), the 6th / a link into a full firm refused, suspend/re-activate free';
end $$;

-- ── T9 the last pending link redeems (not double-counted); then the cap holds ─
-- read the token as postgres (the invitee only has the link)
reset role;
select set_config('l6.token', (select token from public.team_invitations where invitee_email = 'm5@l6.test' and status = 'pending'), false);
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000d5', false);
do $$
declare v_member uuid;
begin
  v_member := public.redeem_firm_team_invitation(current_setting('l6.token'));
  if v_member is null then raise exception 'T9 FAIL: the redeem returned no member'; end if;
  raise notice 'T9 PASS: the last pending link redeems into the 5th seat';
end $$;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a9', false);
do $$
declare v_firm uuid;
begin
  select id into v_firm from public.firm_profiles where owner_user_id = auth.uid();
  begin
    update public.firm_members set status = 'invited' where firm_id = v_firm and user_id = '00000000-0000-0000-0000-0000000000d3';
    raise exception 'T10 FAIL: a removed member was brought back into a full firm';
  exception when raise_exception then
    if sqlerrm <> 'firm_seats_full' then raise; end if;
  end;
  raise notice 'T10 PASS: re-inviting a removed member into a full firm is refused';
end $$;

-- ── T11 the plan and the override raise the cap; a member cannot read it ─────
reset role;
do $$
declare v_firm uuid;
begin
  select id into v_firm from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000000a9';
  insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end)
  values ('00000000-0000-0000-0000-0000000000a9', 'firm-enterprise', 'enterprise', 'active', now() + interval '300 days');
  if public.firm_seat_cap(v_firm) <> 15 then raise exception 'T11 FAIL: enterprise cap is %', public.firm_seat_cap(v_firm); end if;
  update public.firm_members set status = 'invited' where firm_id = v_firm and user_id = '00000000-0000-0000-0000-0000000000d3';
  delete from public.subscriptions where user_id = '00000000-0000-0000-0000-0000000000a9';
  update public.firm_profiles set max_seats = 7 where id = v_firm;
  if public.firm_seat_cap(v_firm) <> 7 then raise exception 'T11 FAIL: the max_seats override is ignored'; end if;
  insert into public.subscriptions (user_id, plan_id, tier, status, current_period_end)
  values ('00000000-0000-0000-0000-0000000000a9', 'firm-basic', 'corp', 'active', now() + interval '300 days');
  if public.firm_seat_cap(v_firm) <> 7 then raise exception 'T11 FAIL: greatest(plan 5, override 7) is not 7'; end if;
  raise notice 'T11 PASS: enterprise 15, the max_seats override, greatest(plan, override)';
end $$;
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000f6', false);
do $$
declare v_firm uuid;
begin
  select id into v_firm from public.firm_profiles where owner_user_id = '00000000-0000-0000-0000-0000000000a9';
  if v_firm is null then
    select firm_id into v_firm from public.firm_members where user_id = auth.uid();
  end if;
  begin
    perform public.firm_seat_status(v_firm);
    raise exception 'T12 FAIL: a plain member read the seat status';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.firm_seat_cap(v_firm);
    raise exception 'T12 FAIL: a session executed firm_seat_cap';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.solo_lawyer_is_capped(auth.uid());
    raise exception 'T12 FAIL: a session executed solo_lawyer_is_capped';
  exception when insufficient_privilege then null;
  end;
  if has_column_privilege('authenticated', 'public.lawyer_profiles', 'practice_kind_confirmed_at', 'SELECT')
     or has_column_privilege('authenticated', 'public.lawyer_profiles', 'practice_kind_confirmed_at', 'UPDATE') then
    raise exception 'T12 FAIL: a session holds a privilege on practice_kind_confirmed_at';
  end if;
  raise notice 'T12 PASS: helpers are server-only; seat status is for managers; the R9 stamp has no session privilege';
end $$;
reset role;

select 'accounts_limits_l6: ALL PASS' as result;
