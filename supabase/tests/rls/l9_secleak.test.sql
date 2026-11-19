-- l9_secleak.test.sql — proves 20261129_20 (batch l9-secleak):
--   C  owner file 15 #4: the client reads no contract table directly; he
--      reads his NON-DRAFT contracts through client_contracts_list /
--      client_contract_detail / client_contract_versions, never a note or the
--      metadata; the lawyer and his firm colleague still read everything.
--   S  owner file 15 #48: the 20th wrong passcode revokes a share for good
--      (attempts during a lock are not counted, a right passcode does not reset
--      the total), view_count, the counters guard, the grants.
--   L  file 19 §1ب.2: rows already verified with a 1448-LAW- licence are
--      un-verified; nobody can verify one again; real licences still verify.
-- The migration runs TWICE (re-runnable) and the l9_secleak block of
-- _verify.sql runs after it.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l9_secleak.sql
--   sed -n '/^-- >>> verify:l9_secleak/,/^-- <<< verify:l9_secleak/p' $M/_verify.sql > "$B"
--   bash $R/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $R/prelude_attachments_live.sql \
--     $R/prelude_attachments_stray_insert_policies.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $R/prelude_document_shares_live.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $M/20261026_72_file_folder_owner.sql \
--     $M/20261109_11_share_passcode_lockout.sql \
--     $R/prelude_l9_secleak.sql \
--     $M/20261129_20_secleak_contracts_shares_licences.sql \
--     $M/20261129_20_secleak_contracts_shares_licences.sql \
--     "$B" \
--     $R/l9_secleak.test.sql
--
-- The 20261109_11 test still passes after this file: the same chain with
-- $R/share_passcode_lockout.test.sql as the last argument (in place of the
-- verify block and this test).
--
-- NEGATIVE CONTROL (must FAIL): the same chain without the two 20261129_20
-- files and the verify block → "T0 FAIL: client_contract_detail does not
-- exist". More negative controls (each must FAIL where named):
--   * 20260905_phase3 re-run after 20261129_20 → C1 (the client reads the notes);
--   * 20261109_11 re-run after it → S1 (no cumulative counter);
--   * the two licence triggers dropped after it → L2;
--   * $R/prelude_l9_secleak_foreign_contracts_policy.sql right before the
--     FIRST 20261129_20 → the migration itself stops («"contracts select" was
--     changed since 20260905_phase3 … merge … by hand»), nothing replaced.
--
-- Every assertion RAISES.

do $$
begin
  if to_regprocedure('public.client_contract_detail(text)') is null then
    raise exception 'T0 FAIL: client_contract_detail does not exist (20261129_20 not applied)';
  end if;
end $$;

-- ── fixtures (as postgres) ───────────────────────────────────────────────────
insert into auth.users (id) values
  ('a1000000-0000-0000-0000-0000000000a1'),   -- L  the lawyer, owner of the contracts
  ('a2000000-0000-0000-0000-0000000000a2'),   -- F  his firm colleague
  ('a3000000-0000-0000-0000-0000000000a3'),   -- C  the client
  ('a4000000-0000-0000-0000-0000000000a4');   -- X  another client
insert into public.profiles (id, user_type, display_name) values
  ('a1000000-0000-0000-0000-0000000000a1', 'lawyer', 'L'),
  ('a2000000-0000-0000-0000-0000000000a2', 'lawyer', 'F'),
  ('a3000000-0000-0000-0000-0000000000a3', 'individual', 'C'),
  ('a4000000-0000-0000-0000-0000000000a4', 'individual', 'X');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('af000000-0000-0000-0000-0000000000af', 'a1000000-0000-0000-0000-0000000000a1', 'مكتب');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('af000000-0000-0000-0000-0000000000af', 'a2000000-0000-0000-0000-0000000000a2', 'lawyer', 'active');

insert into public.contracts (id, owner_user_id, firm_id, client_user_id, title, status, notes, metadata) values
  ('K-ACTIVE', 'a1000000-0000-0000-0000-0000000000a1', 'af000000-0000-0000-0000-0000000000af',
   'a3000000-0000-0000-0000-0000000000a3', 'عقد توريد', 'active', 'SECRET-CONTRACT-NOTE',
   '{"counterparty": {"phone": "0555000111", "idNo": "1099999999"}}'),
  ('K-DRAFT', 'a1000000-0000-0000-0000-0000000000a1', 'af000000-0000-0000-0000-0000000000af',
   'a3000000-0000-0000-0000-0000000000a3', 'مسودة عقد', 'draft', 'SECRET-DRAFT-NOTE', '{}'),
  ('K-OTHER', 'a1000000-0000-0000-0000-0000000000a1', null,
   'a4000000-0000-0000-0000-0000000000a4', 'عقد آخر', 'pending_signature', '', '{}');
insert into public.contract_versions (contract_id, version_no, label, file_name, storage_path, uploaded_by, notes) values
  ('K-ACTIVE', 1, 'final', 'a.pdf', 'a1000000-0000-0000-0000-0000000000a1/a.pdf', 'a1000000-0000-0000-0000-0000000000a1', 'SECRET-VERSION-NOTE'),
  ('K-DRAFT',  1, 'draft', 'd.pdf', 'a1000000-0000-0000-0000-0000000000a1/d.pdf', 'a1000000-0000-0000-0000-0000000000a1', '');
insert into public.contract_parties (contract_id, name) values ('K-ACTIVE', 'شركة الطرف الثاني');
insert into public.contract_obligations (contract_id, title, due_on, notes) values
  ('K-ACTIVE', 'تسليم', current_date + 10, 'SECRET-OBLIGATION-NOTE');
insert into public.contract_payments (contract_id, label, amount_sar, notes) values
  ('K-ACTIVE', 'دفعة مقدمة', 1000, 'SECRET-PAYMENT-NOTE');

-- ═════════════════════════════════════════════════════════════════════════════
-- C — contracts (#4)
-- ═════════════════════════════════════════════════════════════════════════════
set role authenticated;
select set_config('test.uid', 'a3000000-0000-0000-0000-0000000000a3', false);

-- C1 the client reads no contract table directly (the PostgREST path)
do $$
begin
  if (select count(*) from public.contracts) <> 0 then
    raise exception 'C1 FAIL: the client reads public.contracts directly (notes and metadata included)';
  end if;
  if (select count(*) from public.contract_versions) + (select count(*) from public.contract_obligations)
     + (select count(*) from public.contract_payments) + (select count(*) from public.contract_parties) <> 0 then
    raise exception 'C1 FAIL: the client reads a contract child table directly';
  end if;
  raise notice 'C1 PASS: no direct read of the contract tables by the client';
end $$;

-- C2 the list: his non-draft contract only, with the counts, no notes column
do $$
declare
  n int;
  r record;
begin
  select count(*) into n from public.client_contracts_list();
  if n <> 1 then raise exception 'C2 FAIL: the client list has % rows (expected 1: no draft, no other client''s)', n; end if;
  select * into r from public.client_contracts_list();
  if r.id <> 'K-ACTIVE' or r.versions_count <> 1 or r.pending_obligations <> 1 or r.next_due_on <> current_date + 10 then
    raise exception 'C2 FAIL: unexpected row %', row_to_json(r);
  end if;
  if row_to_json(r)::text ~ '(notes|metadata|SECRET|0555000111)' then
    raise exception 'C2 FAIL: the list row carries notes or metadata: %', row_to_json(r);
  end if;
  raise notice 'C2 PASS: the list is the client''s non-draft contract, without notes or metadata';
end $$;

-- C3 the detail: whitelisted, no note anywhere
do $$
declare
  d jsonb := public.client_contract_detail('K-ACTIVE');
begin
  if d is null then raise exception 'C3 FAIL: the client cannot open his own active contract'; end if;
  if d::text ~ '("notes"|"metadata"|SECRET|0555000111|1099999999)' then
    raise exception 'C3 FAIL: the detail carries a note or the metadata: %', d;
  end if;
  if jsonb_array_length(d -> 'versions') <> 1 or jsonb_array_length(d -> 'parties') <> 1
     or jsonb_array_length(d -> 'obligations') <> 1 or jsonb_array_length(d -> 'payments') <> 1 then
    raise exception 'C3 FAIL: a list is missing from the detail: %', d;
  end if;
  if d #>> '{contract,title}' <> 'عقد توريد' or d #>> '{versions,0,storage_path}' is null then
    raise exception 'C3 FAIL: the detail lost its data: %', d;
  end if;
  raise notice 'C3 PASS: the detail has the four lists and no note or metadata';
end $$;

-- C4 a draft or another client's contract: nothing
do $$
begin
  if public.client_contract_detail('K-DRAFT') is not null then
    raise exception 'C4 FAIL: the client opened a DRAFT contract';
  end if;
  if (select count(*) from public.client_contract_versions('K-DRAFT')) <> 0 then
    raise exception 'C4 FAIL: the client lists the files of a DRAFT contract';
  end if;
  if public.client_contract_detail('K-OTHER') is not null
     or (select count(*) from public.client_contract_versions('K-OTHER')) <> 0 then
    raise exception 'C4 FAIL: the client opened another client''s contract';
  end if;
  if (select count(*) from public.client_contract_versions('K-ACTIVE')) <> 1 then
    raise exception 'C4 FAIL: the client cannot list his own contract''s files';
  end if;
  raise notice 'C4 PASS: no draft, no other client''s contract';
end $$;

-- C5 the other client sees his own only
select set_config('test.uid', 'a4000000-0000-0000-0000-0000000000a4', false);
do $$
begin
  if (select string_agg(id, ',') from public.client_contracts_list()) is distinct from 'K-OTHER' then
    raise exception 'C5 FAIL: client X list is %', (select string_agg(id, ',') from public.client_contracts_list());
  end if;
  raise notice 'C5 PASS: each client lists his own';
end $$;

-- C6 POSITIVE CONTROL: the lawyer and his firm colleague still read every note
select set_config('test.uid', 'a1000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  if (select notes from public.contracts where id = 'K-ACTIVE') is distinct from 'SECRET-CONTRACT-NOTE'
     or (select count(*) from public.contracts) <> 3
     or (select notes from public.contract_versions where contract_id = 'K-ACTIVE') is distinct from 'SECRET-VERSION-NOTE'
     or (select notes from public.contract_payments where contract_id = 'K-ACTIVE') is distinct from 'SECRET-PAYMENT-NOTE' then
    raise exception 'C6 FAIL: the owning lawyer lost a read';
  end if;
  if (select count(*) from public.client_contracts_list()) <> 0 then
    raise exception 'C6 FAIL: the lawyer appears as a client of his own contracts';
  end if;
end $$;
select set_config('test.uid', 'a2000000-0000-0000-0000-0000000000a2', false);
do $$
begin
  if (select notes from public.contracts where id = 'K-ACTIVE') is distinct from 'SECRET-CONTRACT-NOTE'
     or (select notes from public.contract_obligations where contract_id = 'K-ACTIVE') is distinct from 'SECRET-OBLIGATION-NOTE' then
    raise exception 'C6 FAIL: the firm colleague lost a read';
  end if;
  raise notice 'C6 PASS: the lawyer and the firm colleague still read the notes';
end $$;
reset role;

-- C7 anon cannot call the client functions; a session without a uid gets nothing
do $$
begin
  set local role anon;
  begin
    perform public.client_contracts_list();
    raise exception 'C7 FAIL: anon could EXECUTE client_contracts_list';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role authenticated;
  perform set_config('test.uid', '', true);
  if (select count(*) from public.client_contracts_list()) <> 0 then
    raise exception 'C7 FAIL: a session without a uid listed contracts';
  end if;
  reset role;
  raise notice 'C7 PASS: anon refused, no uid → nothing';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- S — share links (#48)
-- ═════════════════════════════════════════════════════════════════════════════
create function pg_temp.h(t text) returns text language sql immutable as
  $$ select encode(sha256(convert_to(t, 'UTF8')), 'hex') $$;

insert into public.document_shares (owner_id, document_id, document_path, token_hash, passcode_hash, expires_at) values
  ('a1000000-0000-0000-0000-0000000000a1', '1', 'x/a.pdf', pg_temp.h('tok-20'),   pg_temp.h('123456'), now() + interval '1 day'),
  ('a1000000-0000-0000-0000-0000000000a1', '2', 'x/b.pdf', pg_temp.h('tok-view'), null,                now() + interval '1 day');

-- S1 19 wrong (locks lifted by hand in between) + the right one: still alive,
-- the total is NOT reset by the right passcode; attempts during a lock are not counted
do $$
declare
  t text := pg_temp.h('tok-20');
  i int;
  r text;
begin
  for i in 1..19 loop
    r := public.share_passcode_check(t, pg_temp.h('000000')) ->> 'result';
    if r = 'revoked' then raise exception 'S1 FAIL: revoked at wrong passcode % (expected the 20th)', i; end if;
    if r = 'locked' then
      -- during the lock nothing is counted
      if public.share_passcode_check(t, pg_temp.h('000000')) ->> 'result' <> 'locked' then
        raise exception 'S1 FAIL: a wrong passcode during the lock was not answered locked';
      end if;
      update public.document_shares set locked_until = now() - interval '1 second' where token_hash = t;
    end if;
  end loop;
  if (select wrong_total from public.document_shares where token_hash = t) <> 19 then
    raise exception 'S1 FAIL: wrong_total is % after 19 counted wrong passcodes', (select wrong_total from public.document_shares where token_hash = t);
  end if;
  if public.share_passcode_check(t, pg_temp.h('123456')) ->> 'result' <> 'ok' then
    raise exception 'S1 FAIL: the right passcode did not open after 19 wrong';
  end if;
  if (select wrong_total from public.document_shares where token_hash = t) <> 19 then
    raise exception 'S1 FAIL: the right passcode reset the cumulative total';
  end if;
  raise notice 'S1 PASS: 19 wrong + the right one: open, total kept at 19';
end $$;

-- S2 the 20th wrong revokes for good: even the right passcode is refused after it
do $$
declare
  t text := pg_temp.h('tok-20');
begin
  if public.share_passcode_check(t, pg_temp.h('999999')) ->> 'result' <> 'revoked' then
    raise exception 'S2 FAIL: the 20th wrong passcode did not revoke the share';
  end if;
  if (select revoked_at from public.document_shares where token_hash = t) is null
     or (select wrong_total from public.document_shares where token_hash = t) <> 20 then
    raise exception 'S2 FAIL: revoked_at / wrong_total not written';
  end if;
  if public.share_passcode_check(t, pg_temp.h('123456')) ->> 'result' <> 'revoked' then
    raise exception 'S2 FAIL: the right passcode opened a revoked share';
  end if;
  if (select wrong_total from public.document_shares where token_hash = t) <> 20 then
    raise exception 'S2 FAIL: an attempt on a revoked share was counted';
  end if;
  raise notice 'S2 PASS: the 20th wrong passcode revokes for good';
end $$;

-- S3 view_count: one per call, none on a revoked or unknown share
do $$
begin
  if public.share_count_view(pg_temp.h('tok-view')) <> 1 or public.share_count_view(pg_temp.h('tok-view')) <> 2 then
    raise exception 'S3 FAIL: view_count did not count';
  end if;
  if (select last_viewed_at from public.document_shares where token_hash = pg_temp.h('tok-view')) is null then
    raise exception 'S3 FAIL: last_viewed_at not written';
  end if;
  if public.share_count_view(pg_temp.h('tok-20')) is not null
     or (select view_count from public.document_shares where token_hash = pg_temp.h('tok-20')) <> 0 then
    raise exception 'S3 FAIL: a revoked share counted a view';
  end if;
  if public.share_count_view(pg_temp.h('nope')) is not null or public.share_count_view('bad') is not null then
    raise exception 'S3 FAIL: an unknown token answered a count';
  end if;
  raise notice 'S3 PASS: view_count';
end $$;

-- S4 the owner may update his row but cannot un-revoke it or lower the counters;
-- nobody (postgres included) clears revoked_at
set role authenticated;
select set_config('test.uid', 'a1000000-0000-0000-0000-0000000000a1', false);
update public.document_shares
   set revoked_at = null, wrong_total = 0, view_count = 0, last_viewed_at = null, title = 'renamed'
 where token_hash in (pg_temp.h('tok-20'), pg_temp.h('tok-view'));
reset role;
do $$
begin
  if (select count(*) from public.document_shares where title = 'renamed') <> 2 then
    raise exception 'S4 FAIL: the owner''s own update did not apply (the guard is too strict)';
  end if;
  if (select revoked_at from public.document_shares where token_hash = pg_temp.h('tok-20')) is null
     or (select wrong_total from public.document_shares where token_hash = pg_temp.h('tok-20')) <> 20
     or (select view_count from public.document_shares where token_hash = pg_temp.h('tok-view')) <> 2
     or (select last_viewed_at from public.document_shares where token_hash = pg_temp.h('tok-view')) is null then
    raise exception 'S4 FAIL: the owner un-revoked the share or lowered a counter';
  end if;
  update public.document_shares set revoked_at = null where token_hash = pg_temp.h('tok-20');
  if (select revoked_at from public.document_shares where token_hash = pg_temp.h('tok-20')) is null then
    raise exception 'S4 FAIL: postgres cleared revoked_at';
  end if;
  raise notice 'S4 PASS: revoked stays revoked; a session never lowers the counters';
end $$;

-- S5 grants: share_count_view and share_passcode_check are service role only
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    execute format('set local role %I', r);
    begin
      perform public.share_count_view(repeat('a', 64));
      raise exception 'S5 FAIL: % could EXECUTE share_count_view', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  set local role service_role;
  perform public.share_count_view(repeat('a', 64));
  if public.share_passcode_check(repeat('a', 64), repeat('b', 64)) ->> 'result' <> 'none' then
    raise exception 'S5 FAIL: service_role call answered wrongly';
  end if;
  reset role;
  raise notice 'S5 PASS: service role only';
end $$;

-- ═════════════════════════════════════════════════════════════════════════════
-- L — fake licences (file 19 §1ب.2)
-- ═════════════════════════════════════════════════════════════════════════════
-- L1 the rows verified before the migration (prelude_l9_secleak.sql)
do $$
begin
  if (select verification_status from public.lawyer_profiles where user_id = 'f1000000-0000-0000-0000-0000000000f1') <> 'rejected'
     or (select verification_status from public.lawyer_profiles where user_id = 'f2000000-0000-0000-0000-0000000000f2') <> 'rejected'
     or (select verification_status from public.provider_profiles where user_id = 'f4000000-0000-0000-0000-0000000000f4') <> 'rejected' then
    raise exception 'L1 FAIL: a 1448-LAW- row is still verified';
  end if;
  if (select verification_status from public.lawyer_profiles where user_id = 'f3000000-0000-0000-0000-0000000000f3') <> 'verified' then
    raise exception 'L1 FAIL: the real licence lost its verification';
  end if;
  if (select count(*) from public.profiles where id in ('f1000000-0000-0000-0000-0000000000f1', 'f2000000-0000-0000-0000-0000000000f2')) <> 2 then
    raise exception 'L1 FAIL: an account was deleted';
  end if;
  raise notice 'L1 PASS: existing fake-licence rows un-verified, accounts kept, real licence untouched';
end $$;

-- L2 nobody verifies a fake licence again — any spelling, any writer, insert or update
do $$
declare
  lic text;
begin
  begin
    update public.lawyer_profiles set verification_status = 'verified' where user_id = 'f1000000-0000-0000-0000-0000000000f1';
    raise exception 'L2 FAIL: re-verifying 1448-LAW-001 was accepted';
  exception when check_violation then
    if sqlerrm !~ '^fake_test_licence' then raise; end if;
  end;
  begin
    update public.lawyer_profiles set license_number = '1448/law/010' where user_id = 'f3000000-0000-0000-0000-0000000000f3';
    raise exception 'L2 FAIL: a verified lawyer switched to a fake licence';
  exception when check_violation then null;
  end;
  foreach lic in array array['1448 LAW 010', '1448_law-011', '١٤٤٨LAW٠١٢', ' 1448–LAW–013 '] loop
    begin
      insert into auth.users (id) values (gen_random_uuid());
      insert into public.profiles (id, user_type) select id, 'lawyer' from auth.users u
        where not exists (select 1 from public.profiles p where p.id = u.id);
      insert into public.lawyer_profiles (user_id, license_number, verification_status)
        select p.id, lic, 'verified' from public.profiles p
         where not exists (select 1 from public.lawyer_profiles l where l.user_id = p.id) and p.user_type = 'lawyer'
         limit 1;
      raise exception 'L2 FAIL: a new lawyer verified with %', lic;
    exception when check_violation then null;
    end;
  end loop;
  begin
    update public.provider_profiles set verification_status = 'verified' where user_id = 'f4000000-0000-0000-0000-0000000000f4';
    raise exception 'L2 FAIL: a provider re-verified with a fake licence';
  exception when check_violation then null;
  end;
  -- as the service role (the admin approval's client)
  set local role service_role;
  begin
    update public.lawyer_profiles set verification_status = 'verified' where user_id = 'f2000000-0000-0000-0000-0000000000f2';
    raise exception 'L2 FAIL: the service role verified ١٤٤٨-law-٠٠٢';
  exception when check_violation then null;
  end;
  reset role;
  raise notice 'L2 PASS: no spelling of 1448-LAW- is verified, by any writer';
end $$;

-- L3 POSITIVE CONTROL: a pending fake row may exist (no deletion forced), a real licence verifies
do $$
begin
  update public.lawyer_profiles set verification_status = 'pending' where user_id = 'f1000000-0000-0000-0000-0000000000f1';
  update public.lawyer_profiles set verification_status = 'rejected', license_number = '45/12345' where user_id = 'f3000000-0000-0000-0000-0000000000f3';
  update public.lawyer_profiles set verification_status = 'verified' where user_id = 'f3000000-0000-0000-0000-0000000000f3';
  if not public.is_fake_test_licence('1448-LAW-001') or public.is_fake_test_licence('1448') or public.is_fake_test_licence('LAW-1448')
     or public.is_fake_test_licence('1449-LAW-001') or public.is_fake_test_licence('') then
    raise exception 'L3 FAIL: is_fake_test_licence answers wrongly';
  end if;
  raise notice 'L3 PASS: pending fake rows allowed, a real licence verifies';
end $$;

do $$ begin raise notice 'l9_secleak: ALL PASS (C1–C7, S1–S5, L1–L3)'; end $$;
