-- tracking_links_v2.test.sql — proves 20261026_62 (D2, owner ٢٧٦: lifetimes,
-- pause instead of delete, resume on the same link, the 4-digit unlock).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 62 runs TWICE.
-- From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_case_tables_real.sql $T/prelude_profiles_live_columns.sql \
--     $M/20260903_phase1_case_tables.sql \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $M/20261025_31_dashboard_notes.sql \
--     $M/20261025_32_case_tracking_links.sql \
--     $M/20261026_62_tracking_links_v2.sql \
--     $M/20261026_62_tracking_links_v2.sql \
--     $T/tracking_links_v2.test.sql
-- The v1 test (case_tracking_links.test.sql) also passes with 62 appended
-- twice to its own chain (plus prelude_profiles_live_columns.sql): the
-- replaced snapshot keeps every v1 guarantee.
--
-- NEGATIVE CONTROLS (must FAIL; recorded 2026-10-26):
--   * tracking_link_current_stage without the case_worker_ok filter →
--     "T0f FAIL: the stage link pinned …d099 (expected the appeal stage
--     written by L, not the outsider's position 99)" (T4a guards the same).
--   * case_client_phone_last4 without "not case_worker_ok(requester)" →
--     "T5f FAIL: the solo lawyer's own phone opened his client's link".
--   * case_tracking_unlock checking the lock AFTER the digits →
--     "T5c FAIL: a locked link accepted the right digits".
--   * the snapshot without the state gate → "T2b FAIL: a paused link still
--     shows the case".
--   * tracking_link_resume without the revoked check → "T2e FAIL: a revoked
--     link was resumed".
-- Review fixes (2026-10-26), each recorded failing with the change undone:
--   * the unlock without the 20-wrong pause → "T9b FAIL: 20 wrong tries did
--     not pause the link as locked".
--   * a right answer that keeps wrong_total → "T5a FAIL: success did not
--     reset the counters".
--   * tracking_link_may_resume without the manual-pause clause → "T2a FAIL:
--     an issuer who is not the maker, the pauser or the lead lifted a manual
--     pause (ok)".
--   * no trg_case_stages_end_tracking_links → "T4b FAIL: a newer stage did
--     not pause the stage link at once (the trigger)".
--   * the stage trigger without the old-closing-date branch → "T4e FAIL:
--     clearing a closing date that had already passed revived the stage link".
--   * no trg_case_tracking_links_epoch → "T2b FAIL: the pause did not move
--     the unlock epoch (0)".
--   * no trg_profiles_tracking_phone → "T11c FAIL: the requester's new phone
--     did not move the live links' epoch (or moved a revoked one)".
--
-- People: firm F (owner O)  L lawyer of F, lead of case-f / case-c
--         Y legal secretary of F   A office admin of F (no case role)
--         T trainee of F, lead of case-g   M2 lawyer of firm F2
--         S solo lawyer (case-s, he is also its requester)
--         K the client (account phone "+966 55 123 4567")   G an outsider lawyer
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

-- Test helpers (superuser-made, SECURITY INVOKER: the caller's privileges
-- still apply): the text field of the gate's and the unlock's jsonb answers.
create function public.test_gate(h text) returns text language sql as $$ select public.case_tracking_gate(h) ->> 'state' $$;
create function public.test_unlock(h text, d text) returns text language sql as $$ select public.case_tracking_unlock(h, d) ->> 'result' $$;
create function public.test_epoch(p_link uuid) returns int language sql as $$ select unlock_epoch from public.case_tracking_links where id = p_link $$;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a0'), ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2'), ('00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-0000000000a5'), ('00000000-0000-0000-0000-0000000000b0'),
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000c2'), ('00000000-0000-0000-0000-0000000000c3');
insert into public.profiles (id, user_type, display_name, phone) values
  ('00000000-0000-0000-0000-0000000000a0','firm','O', null),
  ('00000000-0000-0000-0000-0000000000a1','lawyer','L', '+966501110001'),
  ('00000000-0000-0000-0000-0000000000a2','individual','Y', null),
  ('00000000-0000-0000-0000-0000000000a3','individual','A', null),
  ('00000000-0000-0000-0000-0000000000a5','individual','T', null),
  ('00000000-0000-0000-0000-0000000000b0','firm','O2', null),
  ('00000000-0000-0000-0000-0000000000b1','lawyer','M2', null),
  ('00000000-0000-0000-0000-0000000000c1','lawyer','S', '0501112222'),
  ('00000000-0000-0000-0000-0000000000c2','individual','K', '+966 55 123 4567'),
  ('00000000-0000-0000-0000-0000000000c3','lawyer','G', null);
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a0','مكتب ف'),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b0','مكتب ف٢');
insert into public.firm_members (firm_id, user_id, role, status, accepted_at) values
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','lawyer','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a2','legal_secretary','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a3','office_admin','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a5','trainee','active', now()),
  ('ffffffff-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000b1','lawyer','active', now());
insert into public.lawyer_clients (id, owner_user_id, firm_id, name, phone) values
  ('cccccccc-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','شركة الموكل','٠٥٠ ٩٨٧ ٦٥٤٣'),
  ('cccccccc-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','بطاقة رقمها قصير','12');
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id, metadata) values
  ('case-f','00000000-0000-0000-0000-0000000000c2','دعوى مطالبة مالية','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1',
   '{"court":"المحكمة التجارية بالرياض","client_phone":"+966500000000"}'),
  ('case-s','00000000-0000-0000-0000-0000000000c1','قضية منفردة', null, null, '{}'),
  ('case-g','00000000-0000-0000-0000-0000000000c2','قضية يتولاها متدرب','00000000-0000-0000-0000-0000000000a5','ffffffff-0000-0000-0000-0000000000f1', '{}');
insert into public.service_requests (id, requester_user_id, title, assigned_to, firm_id, metadata, lawyer_client_id) values
  ('case-c','00000000-0000-0000-0000-0000000000c2','قضية ببطاقة موكل','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','{}','cccccccc-0000-0000-0000-0000000000c1'),
  ('case-q','00000000-0000-0000-0000-0000000000c2','بطاقة رقمها قصير','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1','{}','cccccccc-0000-0000-0000-0000000000c2');

insert into public.case_stages (id, case_request_id, firm_id, owner_user_id, degree, court_name, court_case_no, position) values
  ('00000000-0000-0000-0000-00000000d001','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','first_instance','المحكمة التجارية بالرياض','4412345', 0),
  ('00000000-0000-0000-0000-00000000d002','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','appeal','محكمة الاستئناف بالرياض','4467890', 1);
update public.case_stages set closed_on = (now() at time zone 'Asia/Riyadh')::date - 30 where id = '00000000-0000-0000-0000-00000000d001';

revoke all on public.case_tracking_links from app_user;

-- An outsider plants a stage on case-f through his own session (the insert
-- policy checks owner_user_id only — 20261025_32 T1).
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', false);
insert into public.case_stages (id, case_request_id, firm_id, owner_user_id, degree, court_name, court_case_no, position) values
  ('00000000-0000-0000-0000-00000000d099','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c3','cassation','محكمة مزيفة','000', 99);
reset role;

-- ── T0 creation: lifetime → expiry / stage; born live; columns locked ────────
set role app_user;
do $$
declare r record;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash, lifetime) values
    ('00000000-0000-0000-0000-00000000f0a1','case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('a', 64), '7d'),
    ('00000000-0000-0000-0000-00000000f0b1','case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('b', 64), '30d'),
    ('00000000-0000-0000-0000-00000000f0c1','case-c','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('c', 64), '90d'),
    ('00000000-0000-0000-0000-00000000f0d1','case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('d', 64), 'stage'),
    ('00000000-0000-0000-0000-00000000f0e1','case-q','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('e', 64), '30d');
  -- the v1 insert (no lifetime) still works and gets 30 days
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash) values
    ('00000000-0000-0000-0000-00000000f0f1','case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('f', 64));
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash, lifetime) values
    ('00000000-0000-0000-0000-00000000f051','case-s','00000000-0000-0000-0000-0000000000c1', null, repeat('5', 64), '30d');
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash, lifetime) values
      ('case-s','00000000-0000-0000-0000-0000000000c1', null, repeat('6', 64), 'stage');
    raise exception 'T0a FAIL: a «حتى انتهاء المرحلة» link was made on a case with no stage';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash, lifetime) values
      ('case-s','00000000-0000-0000-0000-0000000000c1', null, repeat('6', 64), 'forever');
    raise exception 'T0b FAIL: an unknown lifetime was stored';
  exception when check_violation then null; end;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash, expires_at) values
      ('case-s','00000000-0000-0000-0000-0000000000c1', null, repeat('6', 64), now() + interval '10 years');
    raise exception 'T0c FAIL: a session chose its own expiry';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash, paused_at, paused_reason) values
      ('case-s','00000000-0000-0000-0000-0000000000c1', null, repeat('6', 64), now(), 'manual');
    raise exception 'T0d FAIL: a session wrote paused_at on insert';
  exception when insufficient_privilege then null; end;
  begin
    perform failed_attempts from public.case_tracking_links;
    raise exception 'T0e FAIL: a session read failed_attempts';
  exception when insufficient_privilege then null; end;
  raise notice 'T0 PASS (part): lifetimes accepted; no stage → refused; unknown lifetime, a chosen expiry, a paused birth refused; attempts unreadable';
end $$;
reset role;

do $$
declare r record;
begin
  for r in select id, lifetime, expires_at, stage_id, paused_at, paused_by, failed_attempts, wrong_total, unlock_epoch from public.case_tracking_links loop
    if r.lifetime = 'stage' then
      if r.expires_at is not null or r.stage_id is distinct from '00000000-0000-0000-0000-00000000d002'::uuid then
        raise exception 'T0f FAIL: the stage link pinned % (expected the appeal stage written by L, not the outsider''s position 99)', r.stage_id;
      end if;
    else
      if r.stage_id is not null or abs(extract(epoch from (r.expires_at - (now() + public.tracking_lifetime_interval(r.lifetime))))) > 60 then
        raise exception 'T0f FAIL: link % (%) expires at %', r.id, r.lifetime, r.expires_at;
      end if;
    end if;
    if r.paused_at is not null or r.paused_by is not null or r.failed_attempts <> 0 or r.wrong_total <> 0 or r.unlock_epoch <> 0 then
      raise exception 'T0f FAIL: link % was born paused or with attempts', r.id;
    end if;
  end loop;
  if (select lifetime from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0f1') <> '30d' then
    raise exception 'T0f FAIL: the v1 insert did not default to 30 days';
  end if;
  raise notice 'T0 PASS: 7/30/90 days expire on time, «stage» pins the case worker''s current stage (not a planted one) with no date, every link is born live and unlocked, v1 inserts get 30 days';
end $$;

-- ── T1 the effective state: the same vectors as trackingLinkState.test.ts ───
do $$
declare n timestamptz := '2026-10-26T12:00:00Z'; got text; v record;
begin
  for v in select * from (values
      (null::timestamptz, null::timestamptz, null::text, null::timestamptz, false, 'active'),
      (null, null, null, '2026-10-27T00:00:00Z', false, 'active'),
      (null, null, null, '2026-10-26T12:00:00Z', false, 'expired'),
      (null, null, null, '2026-10-01T00:00:00Z', false, 'expired'),
      (null, null, null, null, true, 'expired'),
      (null, '2026-10-20T00:00:00Z', 'manual', null, false, 'paused'),
      (null, '2026-10-20T00:00:00Z', 'expired', null, false, 'expired'),
      (null, '2026-10-20T00:00:00Z', 'locked', null, false, 'paused'),
      (null, '2026-10-20T00:00:00Z', 'manual', '2026-10-01T00:00:00Z', false, 'paused'),
      ('2026-10-21T00:00:00Z', '2026-10-20T00:00:00Z', 'manual', null, false, 'revoked'),
      ('2026-10-21T00:00:00Z', null, null, '2026-10-01T00:00:00Z', false, 'revoked')
    ) t(rv, pa, pr, ex, se, want)
  loop
    got := public.tracking_link_effective_state(v.rv, v.pa, v.pr, v.ex, v.se, n);
    if got is distinct from v.want then
      raise exception 'T1 FAIL: (%, %, %, %, %) → % — expected %', v.rv, v.pa, v.pr, v.ex, v.se, got, v.want;
    end if;
  end loop;
  raise notice 'T1 PASS: revoked > paused > expired > active, the same table as the TS mirror';
end $$;

-- ── T2 pause / resume / revoke: who, and what never changes ──────────────────
set role app_user;
do $$
declare who text; uid uuid; res text;
begin
  for who, uid in select * from (values
      ('K client',       '00000000-0000-0000-0000-0000000000c2'::uuid),
      ('G outsider',     '00000000-0000-0000-0000-0000000000c3'::uuid),
      ('M2 other firm',  '00000000-0000-0000-0000-0000000000b1'::uuid),
      ('T trainee off',  '00000000-0000-0000-0000-0000000000a5'::uuid),
      ('A office admin', '00000000-0000-0000-0000-0000000000a3'::uuid)) v(who, uid)
  loop
    perform set_config('test.uid', uid::text, true);
    res := public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1');
    if res <> 'not_found' then raise exception 'T2a FAIL: % paused L''s link (%)', who, res; end if;
    res := public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '90d');
    if res <> 'not_found' then raise exception 'T2a FAIL: % resumed L''s link (%)', who, res; end if;
  end loop;
  perform set_config('test.uid', '', true);
  if public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1') <> 'not_found' then
    raise exception 'T2a FAIL: no session paused a link';
  end if;
  -- Y (a firm-cases role) pauses L's link
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  if public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1') <> 'ok' then
    raise exception 'T2a FAIL: an issuer could not pause a colleague''s link';
  end if;
  -- O (the firm owner: may issue, but neither maker, pauser nor lead) cannot
  -- lift Y's MANUAL pause
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a0', true);
  res := public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '30d');
  if res <> 'not_allowed' then
    raise exception 'T2a FAIL: an issuer who is not the maker, the pauser or the lead lifted a manual pause (%)', res;
  end if;
  if (select may_resume from public.case_tracking_link_states('case-f') where link_id = '00000000-0000-0000-0000-00000000f0a1') then
    raise exception 'T2a FAIL: the states list offers O the resume of a colleague''s manual pause';
  end if;
  raise notice 'T2a PASS: the client, an outsider, another firm, a trainee off the case, an office admin with no case role and no session cannot pause or resume; an issuer can pause; another issuer cannot lift that manual pause';
end $$;
reset role;

set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0a1') <> 'paused'
     or (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> 'manual' then
    raise exception 'T2b FAIL: the link is not paused (manual)';
  end if;
  if (select paused_by from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1')
       is distinct from '00000000-0000-0000-0000-0000000000a2'::uuid then
    raise exception 'T2b FAIL: paused_by is not Y';
  end if;
  if public.test_epoch('00000000-0000-0000-0000-00000000f0a1') <> 1 then
    raise exception 'T2b FAIL: the pause did not move the unlock epoch (%)', public.test_epoch('00000000-0000-0000-0000-00000000f0a1');
  end if;
  if public.case_tracking_snapshot(repeat('a', 64)) is not null then
    raise exception 'T2b FAIL: a paused link still shows the case';
  end if;
  if public.test_gate(repeat('a', 64)) <> 'paused' then
    raise exception 'T2b FAIL: the gate does not say paused';
  end if;
  if public.test_unlock(repeat('a', 64), '4567') <> 'denied' then
    raise exception 'T2b FAIL: a paused link accepted the digits';
  end if;
  raise notice 'T2b PASS: a paused link: gate «paused», no snapshot, digits refused';
end $$;
reset role;

set role app_user;
do $$
declare n int; v_exp timestamptz;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', 'forever') <> 'bad_lifetime'
     or public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', null) <> 'bad_lifetime' then
    raise exception 'T2c FAIL: a resume without a valid lifetime was accepted';
  end if;
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '30d') <> 'ok' then
    raise exception 'T2c FAIL: the maker could not resume his link';
  end if;
  select expires_at into v_exp from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1';
  if abs(extract(epoch from (v_exp - (now() + interval '30 days')))) > 60 then
    raise exception 'T2c FAIL: the resumed link expires at % (expected now + 30 days)', v_exp;
  end if;
  begin update public.case_tracking_links set unlock_epoch = 0 where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session wrote the unlock epoch'; exception when insufficient_privilege then null; end;
  begin update public.case_tracking_links set wrong_total = 0, paused_by = null where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session cleared the wrong count'; exception when insufficient_privilege then null; end;
  begin perform wrong_total from public.case_tracking_links;
    raise exception 'T2d FAIL: a session read wrong_total'; exception when insufficient_privilege then null; end;
  begin perform unlock_epoch from public.case_tracking_links;
    raise exception 'T2d FAIL: a session read unlock_epoch'; exception when insufficient_privilege then null; end;
  -- direct writes of the state columns, the token, the case: refused
  begin update public.case_tracking_links set paused_at = null, paused_reason = null where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session wrote paused_at directly'; exception when insufficient_privilege then null; end;
  begin update public.case_tracking_links set expires_at = now() + interval '9 years' where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session stretched an expiry'; exception when insufficient_privilege then null; end;
  begin update public.case_tracking_links set lifetime = '90d' where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session rewrote a lifetime'; exception when insufficient_privilege then null; end;
  begin update public.case_tracking_links set token_hash = repeat('9', 64) where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session rewrote a token hash'; exception when insufficient_privilege then null; end;
  begin update public.case_tracking_links set case_request_id = 'case-g' where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session moved a link to another case'; exception when insufficient_privilege then null; end;
  begin update public.case_tracking_links set failed_attempts = 0, locked_until = null where id = '00000000-0000-0000-0000-00000000f0b1';
    raise exception 'T2d FAIL: a session cleared the digits lock'; exception when insufficient_privilege then null; end;
  -- revoke (v1 path) is one-way, and the RPCs respect it
  update public.case_tracking_links set revoked_at = now() where id = '00000000-0000-0000-0000-00000000f0f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2e FAIL: the maker could not revoke'; end if;
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0f1', '30d') <> 'revoked'
     or public.tracking_link_pause('00000000-0000-0000-0000-00000000f0f1') <> 'revoked' then
    raise exception 'T2e FAIL: a revoked link was resumed (or paused)';
  end if;
  begin update public.case_tracking_links set revoked_at = null where id = '00000000-0000-0000-0000-00000000f0f1';
    raise exception 'T2e FAIL: a revoked link was brought back'; exception when insufficient_privilege then null; end;
  raise notice 'T2 PASS: resume needs a valid lifetime and sets a new expiry; no session writes a state column, token or case directly; revoke stays one-way, never resumed';
end $$;
reset role;
do $$ begin
  if (select revoked_at from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0f1') is null
     or (select token_hash from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> repeat('a', 64)
     or (select case_request_id from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> 'case-f' then
    raise exception 'T2f FAIL: a revoke was undone or a token / case moved';
  end if;
  raise notice 'T2f PASS: token, case and revocation unchanged';
end $$;

-- ── T3 expiry → paused (expired) → resume on the same link ──────────────────
update public.case_tracking_links set expires_at = now() - interval '1 second' where id = '00000000-0000-0000-0000-00000000f0b1';
set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0b1') <> 'expired' then
    raise exception 'T3 FAIL: a past expiry is not «expired»';
  end if;
  if public.case_tracking_snapshot(repeat('b', 64)) is not null then
    raise exception 'T3 FAIL: an expired link still shows the case';
  end if;
  if public.test_gate(repeat('b', 64)) <> 'expired' then
    raise exception 'T3 FAIL: the gate does not say expired';
  end if;
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0b1') is distinct from 'expired' then
    raise exception 'T3 FAIL: the gate did not write the expiry down as paused (expired)';
  end if;
  if public.test_unlock(repeat('b', 64), '4567') <> 'denied' then
    raise exception 'T3 FAIL: an expired link accepted the digits';
  end if;
end $$;
reset role;
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0b1', '7d') <> 'ok' then
    raise exception 'T3 FAIL: an issuer could not re-activate an expired link';
  end if;
end $$;
reset role;
set role service_role;
do $$ begin
  if public.test_gate(repeat('b', 64)) <> 'active' or public.case_tracking_snapshot(repeat('b', 64)) is null then
    raise exception 'T3 FAIL: the re-activated link does not open';
  end if;
  raise notice 'T3 PASS: past its end a link is «expired», written down as paused (expired), shows nothing; one resume re-opens the SAME token';
end $$;
reset role;

-- ── T4 «حتى انتهاء المرحلة» ──────────────────────────────────────────────────
-- a. a stranger's newer stage does not end it
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000c3', false);
insert into public.case_stages (case_request_id, firm_id, owner_user_id, degree, court_name, position) values
  ('case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000c3','execution','محكمة مزيفة', 100);
reset role;
set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'active' then
    raise exception 'T4a FAIL: a stranger''s stage row paused the client''s link';
  end if;
  raise notice 'T4a PASS: stages written by non-workers never end a stage link';
end $$;
reset role;
-- b. L opens the next stage → the link has outlived its stage
insert into public.case_stages (id, case_request_id, firm_id, owner_user_id, degree, court_name, court_case_no, position) values
  ('00000000-0000-0000-0000-00000000d003','case-f','ffffffff-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1','cassation','المحكمة العليا','5500', 2);
-- the stage trigger wrote it down at once (read the row, not the state: the
-- gate's own lazy write must not hide a missing trigger)
do $$ begin
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') is distinct from 'expired' then
    raise exception 'T4b FAIL: a newer stage did not pause the stage link at once (the trigger)';
  end if;
end $$;
set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'expired' then
    raise exception 'T4b FAIL: a newer stage by a case worker did not end the stage link';
  end if;
  if public.case_tracking_snapshot(repeat('d', 64)) is not null then
    raise exception 'T4b FAIL: the stage link still shows the case';
  end if;
  raise notice 'T4b PASS: a newer stage by the case''s lawyer ends a stage link';
end $$;
reset role;
-- c. resume «stage» pins the new stage; closing it ends the link; no open stage → no_stage
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0d1', 'stage') <> 'ok' then
    raise exception 'T4c FAIL: could not resume until the (new) stage ends';
  end if;
end $$;
reset role;
do $$ begin
  if (select stage_id from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') <> '00000000-0000-0000-0000-00000000d003' then
    raise exception 'T4c FAIL: the resumed stage link did not pin the new current stage';
  end if;
end $$;
set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'active' then
    raise exception 'T4c FAIL: the resumed stage link is not active';
  end if;
end $$;
reset role;
update public.case_stages set closed_on = (now() at time zone 'Asia/Riyadh')::date where id = '00000000-0000-0000-0000-00000000d003';
do $$ begin
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') is distinct from 'expired' then
    raise exception 'T4c FAIL: closing the stage did not pause the stage link at once (the trigger)';
  end if;
end $$;
set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'expired' then
    raise exception 'T4c FAIL: closing the stage did not end the link';
  end if;
end $$;
reset role;
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0d1', 'stage') <> 'no_stage' then
    raise exception 'T4c FAIL: resumed «until the stage ends» on a case whose current stage is closed';
  end if;
  begin
    insert into public.case_tracking_links (case_request_id, owner_user_id, firm_id, token_hash, lifetime) values
      ('case-f','00000000-0000-0000-0000-0000000000a1','ffffffff-0000-0000-0000-0000000000f1', repeat('7', 64), 'stage');
    raise exception 'T4c FAIL: a stage link was made while the current stage is closed';
  exception when invalid_parameter_value then null; end;
  raise notice 'T4c PASS: resume «stage» pins the new current stage; closing it ends the link; no open stage → refused';
end $$;
reset role;
-- d. re-opening the stage does NOT revive the link; the lawyer resumes it
update public.case_stages set closed_on = null where id = '00000000-0000-0000-0000-00000000d003';
set role service_role;
do $$ begin
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') is distinct from 'expired'
     or public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'expired'
     or public.test_gate(repeat('d', 64)) <> 'expired' or public.case_tracking_snapshot(repeat('d', 64)) is not null then
    raise exception 'T4d FAIL: re-opening the stage revived the stage link';
  end if;
  raise notice 'T4d PASS (part): a closed-then-reopened stage leaves its link paused until the lawyer resumes it';
end $$;
reset role;
-- deleting the pinned stage ends the link too (FK set null)
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  perform public.tracking_link_resume('00000000-0000-0000-0000-00000000f0d1', 'stage');
end $$;
reset role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'active' then
    raise exception 'T4d FAIL: the lawyer could not resume the stage link on the re-opened stage';
  end if;
end $$;
delete from public.case_stages where id = '00000000-0000-0000-0000-00000000d003';
do $$ begin
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') is distinct from 'expired' then
    raise exception 'T4d FAIL: deleting the stage did not pause the stage link at once (the trigger)';
  end if;
end $$;
set role service_role;
do $$ begin
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0d1') <> 'expired' then
    raise exception 'T4d FAIL: a deleted stage did not end its link';
  end if;
  raise notice 'T4d PASS: a deleted stage ends its link';
end $$;
reset role;
-- e. a closing date that passed with nobody looking (set ahead, then matured),
--    then cleared: the link still counts as having outlived its stage
set role app_user;
do $$ begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0d1', 'stage') <> 'ok' then
    raise exception 'T4e FAIL: could not resume on the appeal stage';
  end if;
end $$;
reset role;
alter table public.case_stages disable trigger trg_case_stages_end_tracking_links;
update public.case_stages set closed_on = (now() at time zone 'Asia/Riyadh')::date - 1 where id = '00000000-0000-0000-0000-00000000d002';
alter table public.case_stages enable trigger trg_case_stages_end_tracking_links;
update public.case_stages set closed_on = null where id = '00000000-0000-0000-0000-00000000d002';
do $$ begin
  if (select stage_id from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') <> '00000000-0000-0000-0000-00000000d002'
     or (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0d1') is distinct from 'expired' then
    raise exception 'T4e FAIL: clearing a closing date that had already passed revived the stage link';
  end if;
  raise notice 'T4e PASS: a stage whose closing date had passed, then cleared, leaves its link paused';
end $$;

-- ── T5 the 4-digit unlock ────────────────────────────────────────────────────
set role service_role;
do $$
declare i int; res text;
begin
  -- a. wrong ×4, then right → ok, counter reset
  for i in 1..4 loop
    if public.test_unlock(repeat('a', 64), '0000') <> 'denied' then raise exception 'T5a FAIL: wrong digits not denied'; end if;
  end loop;
  if (select failed_attempts from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> 4
     or (select wrong_total from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> 4 then
    raise exception 'T5a FAIL: wrong tries were not counted';
  end if;
  if public.test_unlock(repeat('a', 64), '4567') <> 'ok' then raise exception 'T5a FAIL: the right digits were refused'; end if;
  if (select failed_attempts from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> 0
     or (select wrong_total from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') <> 0 then
    raise exception 'T5a FAIL: success did not reset the counters';
  end if;
  if (public.case_tracking_unlock(repeat('a', 64), '4567') ->> 'epoch')::int is distinct from public.test_epoch('00000000-0000-0000-0000-00000000f0a1') then
    raise exception 'T5a FAIL: a right answer does not carry the link''s unlock epoch';
  end if;
  -- b. Arabic-Indic / Persian / spaced input
  if public.test_unlock(repeat('a', 64), '٤٥٦٧') <> 'ok' or public.test_unlock(repeat('a', 64), '۴۵ ۶۷') <> 'ok' then
    raise exception 'T5b FAIL: Arabic-Indic or Persian digits were refused';
  end if;
  if public.test_unlock(repeat('a', 64), '14567') <> 'denied' or public.test_unlock(repeat('a', 64), '456') <> 'denied'
     or public.test_unlock(repeat('a', 64), null) <> 'denied' then
    raise exception 'T5b FAIL: not-four-digits input was accepted';
  end if;
  -- c. five wrong → locked 15 min; locked refuses the right digits
  update public.case_tracking_links set failed_attempts = 0 where id = '00000000-0000-0000-0000-00000000f0a1';
  for i in 1..4 loop perform public.test_unlock(repeat('a', 64), '1111'); end loop;
  res := public.test_unlock(repeat('a', 64), '1111');
  if res <> 'locked' then raise exception 'T5c FAIL: the fifth wrong try answered % (expected locked)', res; end if;
  if (select locked_until from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0a1') not between now() + interval '14 minutes' and now() + interval '16 minutes' then
    raise exception 'T5c FAIL: the lock is not 15 minutes';
  end if;
  if public.test_unlock(repeat('a', 64), '4567') <> 'locked' then
    raise exception 'T5c FAIL: a locked link accepted the right digits';
  end if;
  update public.case_tracking_links set locked_until = now() - interval '1 second' where id = '00000000-0000-0000-0000-00000000f0a1';
  if public.test_unlock(repeat('a', 64), '4567') <> 'ok' then
    raise exception 'T5c FAIL: the right digits failed after the lock ran out';
  end if;
  -- d. unknown / malformed tokens: the same «denied»
  if public.test_unlock(repeat('8', 64), '4567') <> 'denied' or public.test_unlock('nope', '4567') <> 'denied'
     or public.test_unlock(null, '4567') <> 'denied' then
    raise exception 'T5d FAIL: an unknown or malformed token answered other than denied';
  end if;
  -- e. the attached client card wins over the requester's account
  if public.test_unlock(repeat('c', 64), '6543') <> 'ok' then raise exception 'T5e FAIL: the card''s (Arabic-digit) phone was refused'; end if;
  if public.test_unlock(repeat('c', 64), '4567') <> 'denied' then raise exception 'T5e FAIL: the requester''s phone opened a case with a client card'; end if;
  -- a card whose number is too short falls back to the requester's phone
  if public.test_unlock(repeat('e', 64), '4567') <> 'ok' then raise exception 'T5e FAIL: a short card number did not fall back to the account phone'; end if;
  -- f. on S's solo case S is the requester: his own phone never opens it
  if public.test_unlock(repeat('5', 64), '2222') <> 'denied' then
    raise exception 'T5f FAIL: the solo lawyer''s own phone opened his client''s link';
  end if;
  -- g. the right digits do not open a revoked link
  if public.test_unlock(repeat('f', 64), '4567') <> 'denied' then raise exception 'T5g FAIL: a revoked link accepted the digits'; end if;
  if public.test_gate(repeat('f', 64)) <> 'unavailable' or public.test_gate(repeat('8', 64)) <> 'none'
     or public.test_gate('x') <> 'none' then
    raise exception 'T5g FAIL: the gate mislabels a revoked or unknown token';
  end if;
  raise notice 'T5 PASS: right digits open and reset the counter (ASCII, Arabic-Indic, Persian, spaced); 5 wrong lock 15 min and the lock refuses even the right digits; unknown/malformed/revoked are «denied»; the case card''s number comes first, a short one falls back, a lawyer-requester''s own number never counts';
end $$;
reset role;

-- ── T6 the lawyer side: has_phone and the states list ───────────────────────
set role app_user;
do $$
declare got text;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if not public.case_tracking_has_phone('case-f') or not public.case_tracking_has_phone('case-c') then
    raise exception 'T6a FAIL: has_phone says no for cases with a client phone';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c1', true);
  if public.case_tracking_has_phone('case-s') then raise exception 'T6a FAIL: has_phone counts the lawyer-requester''s own phone'; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c2', true);
  if public.case_tracking_has_phone('case-f') then raise exception 'T6a FAIL: the client may probe has_phone'; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  select string_agg(substr(link_id::text, 33) || '=' || state, ' ' order by link_id) into got from public.case_tracking_link_states('case-f');
  if got is distinct from 'f0a1=active f0b1=active f0d1=expired f0f1=revoked' then
    raise exception 'T6b FAIL: L sees states [%]', got;
  end if;
  foreach got in array array['00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1'] loop
    perform set_config('test.uid', got, true);
    if exists (select 1 from public.case_tracking_link_states('case-f')) then
      raise exception 'T6b FAIL: % sees case-f''s link states', got;
    end if;
  end loop;
  raise notice 'T6 PASS: has_phone answers issuers only and ignores a lawyer-requester''s phone; the states list follows the SELECT rule';
end $$;
reset role;

-- ── T7 privileges ────────────────────────────────────────────────────────────
set role app_user;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin perform public.case_tracking_unlock(repeat('a', 64), '4567'); raise exception 'T7 FAIL: a session called case_tracking_unlock';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.case_tracking_gate(repeat('a', 64)); raise exception 'T7 FAIL: a session called case_tracking_gate';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.case_client_phone_last4('case-f'); raise exception 'T7 FAIL: a session read the phone digits';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.tracking_link_state('00000000-0000-0000-0000-00000000f0a1'); raise exception 'T7 FAIL: a session called tracking_link_state';
exception when insufficient_privilege then null; end $$;
do $$ begin perform stage_id from public.case_tracking_links; raise exception 'T7 FAIL: a session read stage_id';
exception when insufficient_privilege then null; end $$;
reset role;
set role service_role;
do $$ begin perform public.case_client_phone_last4('case-f'); raise exception 'T7 FAIL: the service role read the phone digits';
exception when insufficient_privilege then null; end $$;
reset role;
set role anon;
do $$ begin perform public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1'); raise exception 'T7 FAIL: anon called tracking_link_pause';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.case_tracking_has_phone('case-f'); raise exception 'T7 FAIL: anon called case_tracking_has_phone';
exception when insufficient_privilege then
  raise notice 'T7 PASS: unlock, gate, state and the phone are not callable by sessions; the phone not even by the service role; anon has no pause / has_phone';
end $$;
reset role;

-- ── T8 the snapshot keeps its v1 shape for an active link ───────────────────
set role service_role;
do $$
declare snap jsonb;
begin
  snap := public.case_tracking_snapshot(repeat('a', 64));
  if snap is null then raise exception 'T8 FAIL: an active link returned nothing'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(snap) key) is distinct from array['case_number','court','hearings','stage','title'] then
    raise exception 'T8 FAIL: the snapshot keys changed: %', snap;
  end if;
  if snap::text like '%4567%' or snap::text like '%966%' or snap::text like '%محكمة مزيفة%' then
    raise exception 'T8 FAIL: the snapshot leaks a phone or a stranger''s row: %', snap;
  end if;
  raise notice 'T8 PASS: an active link''s snapshot has the v1 keys only, no phone, no stranger''s stage';
end $$;
reset role;

-- ── T9 20 wrong since the last right answer → the link pauses (locked) ──────
-- (review 2026-10-26: the 15-minute lock alone allowed ~480 guesses a day.)
update public.case_tracking_links set failed_attempts = 0, wrong_total = 0, locked_until = null
 where id = '00000000-0000-0000-0000-00000000f0c1';
set role service_role;
do $$
declare i int; res text; e0 int;
begin
  e0 := public.test_epoch('00000000-0000-0000-0000-00000000f0c1');
  for i in 1..19 loop
    res := public.test_unlock(repeat('c', 64), '0000');
    if res = 'locked' then
      if i % 5 <> 0 then raise exception 'T9a FAIL: try % locked (expected every 5th)', i; end if;
      if (select wrong_total from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0c1') <> i then
        raise exception 'T9a FAIL: the 15-minute lock reset the wrong count (after % tries)', i;
      end if;
      -- the 15 minutes pass
      update public.case_tracking_links set locked_until = now() - interval '1 second' where id = '00000000-0000-0000-0000-00000000f0c1';
    elsif res <> 'denied' or i % 5 = 0 then
      raise exception 'T9a FAIL: try % answered %', i, res;
    end if;
  end loop;
  if public.tracking_link_state('00000000-0000-0000-0000-00000000f0c1') <> 'active'
     or (select wrong_total from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0c1') <> 19 then
    raise exception 'T9a FAIL: after 19 wrong the link is not active with 19 counted';
  end if;
  res := public.test_unlock(repeat('c', 64), '0000');
  if res <> 'locked' then raise exception 'T9b FAIL: the 20th wrong try answered %', res; end if;
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0c1') is distinct from 'locked'
     or (select paused_by from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0c1') is not null then
    raise exception 'T9b FAIL: 20 wrong tries did not pause the link as locked';
  end if;
  if public.test_epoch('00000000-0000-0000-0000-00000000f0c1') <= e0 then
    raise exception 'T9b FAIL: the locked pause did not move the unlock epoch';
  end if;
  -- the client sees the same neutral page as a manual pause (no oracle)
  if public.test_gate(repeat('c', 64)) <> 'paused' or public.case_tracking_snapshot(repeat('c', 64)) is not null then
    raise exception 'T9b FAIL: a locked link is not shown as an ordinary pause';
  end if;
  if public.test_unlock(repeat('c', 64), '6543') <> 'denied' then
    raise exception 'T9b FAIL: the right digits opened a link paused for wrong tries';
  end if;
  raise notice 'T9 PASS (part): the 15-minute lock keeps the wrong count; the 20th wrong try pauses the link (locked), moves the epoch, the client sees a plain pause and even the right digits are refused';
end $$;
reset role;
set role app_user;
do $$ begin
  -- Y (an issuer, not the maker, not the lead) may lift a 'locked' pause
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  if (select paused_reason from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0c1') is distinct from 'locked' then
    raise exception 'T9c FAIL: the lawyer cannot read why the link is paused';
  end if;
  if (select state || '/' || may_resume from public.case_tracking_link_states('case-c')
       where link_id = '00000000-0000-0000-0000-00000000f0c1') is distinct from 'paused/true' then
    raise exception 'T9c FAIL: the lawyer list does not show a resumable pause';
  end if;
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0c1', '30d') <> 'ok' then
    raise exception 'T9c FAIL: an issuer could not lift a locked pause';
  end if;
end $$;
reset role;
set role service_role;
do $$ begin
  if (select wrong_total from public.case_tracking_links where id = '00000000-0000-0000-0000-00000000f0c1') <> 0
     or public.test_unlock(repeat('c', 64), '6543') <> 'ok' then
    raise exception 'T9c FAIL: the resumed link did not clear the wrong count or does not open';
  end if;
  raise notice 'T9 PASS: 20 wrong since the last right answer pause the link (locked); any issuer resumes it, which clears the count';
end $$;
reset role;

-- ── T10 a MANUAL pause: maker, pauser or lead only ──────────────────────────
set role app_user;
do $$
declare res text;
begin
  -- a. the pauser lifts her own pause
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  if public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1') <> 'ok'
     or public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '30d') <> 'ok' then
    raise exception 'T10a FAIL: the pauser could not lift her own pause';
  end if;
  -- b. O pauses; Y (issuer, neither maker, pauser nor lead) cannot lift it; L (maker, lead) can
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a0', true);
  if public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1') <> 'ok' then
    raise exception 'T10b FAIL: the firm owner could not pause';
  end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  res := public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '30d');
  if res <> 'not_allowed' then raise exception 'T10b FAIL: Y lifted O''s manual pause (%)', res; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '30d') <> 'ok' then
    raise exception 'T10b FAIL: the maker could not lift a colleague''s manual pause';
  end if;
  -- c. the lead (not maker, not pauser) lifts a manual pause on Y's link
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  insert into public.case_tracking_links (id, case_request_id, owner_user_id, firm_id, token_hash, lifetime) values
    ('00000000-0000-0000-0000-00000000f0a2','case-f','00000000-0000-0000-0000-0000000000a2','ffffffff-0000-0000-0000-0000000000f1', repeat('2', 64), '30d');
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a0', true);
  if public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a2') <> 'ok' then raise exception 'T10c FAIL: O could not pause Y''s link'; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  if public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a2', '30d') <> 'ok' then
    raise exception 'T10c FAIL: the case''s lead could not lift a manual pause';
  end if;
  raise notice 'T10 PASS: a manual pause is lifted by its maker, its pauser or the case''s lead — not by another issuer; expired (T3) and locked (T9) pauses by any issuer';
end $$;
reset role;

-- ── T11 the unlock epoch: pause, resume, phone changes ──────────────────────
do $$
declare e int; e2 int;
begin
  -- a. pause and resume each move it; the gate carries it while active only
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  e := public.test_epoch('00000000-0000-0000-0000-00000000f0a1');
  perform public.tracking_link_pause('00000000-0000-0000-0000-00000000f0a1');
  if public.test_epoch('00000000-0000-0000-0000-00000000f0a1') <> e + 1 or public.case_tracking_gate(repeat('a', 64)) ? 'epoch' then
    raise exception 'T11a FAIL: a pause did not move the epoch, or a paused gate carries one';
  end if;
  perform public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '30d');
  if public.test_epoch('00000000-0000-0000-0000-00000000f0a1') <> e + 2
     or (public.case_tracking_gate(repeat('a', 64)) ->> 'epoch')::int is distinct from e + 2 then
    raise exception 'T11a FAIL: a resume did not move the epoch, or the gate does not carry it';
  end if;
  -- an active link resumed with a new lifetime moves it too
  perform public.tracking_link_resume('00000000-0000-0000-0000-00000000f0a1', '90d');
  if public.test_epoch('00000000-0000-0000-0000-00000000f0a1') <> e + 3 then
    raise exception 'T11a FAIL: re-activating an active link did not move the epoch';
  end if;
  -- b. the client card's phone (and only its phone)
  e := public.test_epoch('00000000-0000-0000-0000-00000000f0c1');
  update public.lawyer_clients set name = 'شركة الموكل ٢' where id = 'cccccccc-0000-0000-0000-0000000000c1';
  if public.test_epoch('00000000-0000-0000-0000-00000000f0c1') <> e then
    raise exception 'T11b FAIL: renaming the client card moved the epoch';
  end if;
  update public.lawyer_clients set phone = '0509876543' where id = 'cccccccc-0000-0000-0000-0000000000c1';
  if public.test_epoch('00000000-0000-0000-0000-00000000f0c1') <> e + 1 then
    raise exception 'T11b FAIL: a new card phone did not move the epoch';
  end if;
  -- c. the requester's account phone: case-f's live links move, the revoked one does not
  e := public.test_epoch('00000000-0000-0000-0000-00000000f0a1');
  e2 := public.test_epoch('00000000-0000-0000-0000-00000000f0f1');
  update public.profiles set display_name = 'K2' where id = '00000000-0000-0000-0000-0000000000c2';
  if public.test_epoch('00000000-0000-0000-0000-00000000f0a1') <> e then
    raise exception 'T11c FAIL: a profile change other than the phone moved the epoch';
  end if;
  update public.profiles set phone = '+966 55 123 9999' where id = '00000000-0000-0000-0000-0000000000c2';
  if public.test_epoch('00000000-0000-0000-0000-00000000f0a1') <> e + 1 or public.test_epoch('00000000-0000-0000-0000-00000000f0f1') <> e2 then
    raise exception 'T11c FAIL: the requester''s new phone did not move the live links'' epoch (or moved a revoked one)';
  end if;
  -- d. another card attached to the case
  e := public.test_epoch('00000000-0000-0000-0000-00000000f0c1');
  update public.service_requests set title = 'قضية ببطاقة موكل ٢' where id = 'case-c';
  if public.test_epoch('00000000-0000-0000-0000-00000000f0c1') <> e then
    raise exception 'T11d FAIL: a title change moved the epoch';
  end if;
  update public.service_requests set lawyer_client_id = 'cccccccc-0000-0000-0000-0000000000c2' where id = 'case-c';
  if public.test_epoch('00000000-0000-0000-0000-00000000f0c1') <> e + 1 then
    raise exception 'T11d FAIL: attaching another client card did not move the epoch';
  end if;
  raise notice 'T11 PASS: the unlock epoch moves on pause, resume and every change of the phone behind a link (card phone, account phone, attached card) — and not on other edits';
end $$;

\echo 'tracking_links_v2: ALL PASS'
