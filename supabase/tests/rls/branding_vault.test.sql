-- branding_vault.test.sql — proves 20261026_63_branding_vault.sql and
-- supabase/storage_policies_branding.sql (D4, owner ٢٥٦: letterhead for the
-- individual lawyer AND the firm).
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 63 and the
-- storage file each run TWICE (re-runnable). From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_storage_objects_stub.sql $T/prelude_storage_buckets_stub.sql \
--     $M/20261026_63_branding_vault.sql $M/20261026_63_branding_vault.sql \
--     supabase/storage_policies_branding.sql supabase/storage_policies_branding.sql \
--     $T/branding_vault.test.sql
--
-- NEGATIVE CONTROLS (must FAIL; recorded 2026-10-26):
--   * can_manage_branding_vault without "m.status = 'active'" →
--     "T2d FAIL: a suspended office admin read the firm vault".
--   * the office_admin role dropped from the role list →
--     "T2b FAIL: the office admin could not update the firm vault (0 rows)".
--   * logo_path added to the session UPDATE grant →
--     "T4a FAIL: a session wrote logo_path".
--   * can_manage_branding_object without the shape check (uuid, 3 segments) →
--     T6e stops with "invalid input syntax for type uuid: "not-a-uuid"" (22P02)
--     instead of answering false.
--
-- People: L lawyer · L2 another lawyer · I an individual (not a lawyer)
--         firm F: O owner, MP managing partner, A office admin, P partner,
--                 X office admin SUSPENDED · firm F2: O2 owner
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000b0'),
  ('00000000-0000-0000-0000-0000000000b1'), ('00000000-0000-0000-0000-0000000000b2'),
  ('00000000-0000-0000-0000-0000000000b3'), ('00000000-0000-0000-0000-0000000000b4'),
  ('00000000-0000-0000-0000-0000000000c0');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000000a2', 'lawyer', 'L2'),
  ('00000000-0000-0000-0000-0000000000a3', 'individual', 'I'),
  ('00000000-0000-0000-0000-0000000000b0', 'firm', 'O'),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer', 'MP'),
  ('00000000-0000-0000-0000-0000000000b2', 'individual', 'A'),
  ('00000000-0000-0000-0000-0000000000b3', 'lawyer', 'P'),
  ('00000000-0000-0000-0000-0000000000b4', 'individual', 'X'),
  ('00000000-0000-0000-0000-0000000000c0', 'firm', 'O2');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b0', 'مكتب ف'),
  ('ffffffff-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000c0', 'مكتب ف٢');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 'managing_partner', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b2', 'office_admin', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b3', 'partner', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b4', 'office_admin', 'suspended');

-- ── T0 shape ─────────────────────────────────────────────────────────────────
do $$
declare n int;
begin
  select count(*) into n from pg_policy where polrelid = 'public.branding_vaults'::regclass;
  if n <> 3 then raise exception 'T0a FAIL: % policies on branding_vaults after two runs (expected 3)', n; end if;
  select count(*) into n from pg_trigger where tgrelid = 'public.branding_vaults'::regclass and not tgisinternal;
  if n <> 1 then raise exception 'T0b FAIL: % triggers on branding_vaults after two runs', n; end if;
  if not exists (select 1 from storage.buckets where id = 'branding' and public = false and file_size_limit = 1048576
                  and allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']) then
    raise exception 'T0c FAIL: bucket branding is not private / 1 MB / png-jpeg-webp';
  end if;
  if exists (select 1 from storage.buckets where id = 'branding' and 'image/svg+xml' = any(allowed_mime_types)) then
    raise exception 'T0d FAIL: the branding bucket accepts SVG';
  end if;
  select count(*) into n from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'branding %';
  if n <> 4 then raise exception 'T0e FAIL: % branding storage policies after two runs (expected 4)', n; end if;
  raise notice 'T0 PASS: 3 table policies, 1 trigger, private 1 MB png/jpeg/webp bucket, 4 storage policies — after two runs each';
end $$;

-- ── T1 the individual lawyer ─────────────────────────────────────────────────
set role authenticated;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  insert into public.branding_vaults (lawyer_user_id, display_name_ar, phone, accent_color)
    values ('00000000-0000-0000-0000-0000000000a1', 'مكتب المحامي ل', '0501234567', '#0B3D2E');
  select count(*) into n from public.branding_vaults;
  if n <> 1 then raise exception 'T1a FAIL: the lawyer sees % vaults (expected his own)', n; end if;
  update public.branding_vaults set address = 'الرياض' where lawyer_user_id = '00000000-0000-0000-0000-0000000000a1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T1b FAIL: the lawyer could not update his vault'; end if;
  if (select updated_by from public.branding_vaults) is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'T1c FAIL: updated_by was not stamped';
  end if;

  begin
    insert into public.branding_vaults (lawyer_user_id) values ('00000000-0000-0000-0000-0000000000a2');
    raise exception 'T1d FAIL: a lawyer created a vault for another lawyer';
  exception when insufficient_privilege then null;
  end;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a3', true);
  begin
    insert into public.branding_vaults (lawyer_user_id) values ('00000000-0000-0000-0000-0000000000a3');
    raise exception 'T1e FAIL: an individual (not a lawyer) created a lawyer vault';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from public.branding_vaults;
  if n <> 0 then raise exception 'T1f FAIL: an individual reads % vaults', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  select count(*) into n from public.branding_vaults;
  if n <> 0 then raise exception 'T1g FAIL: another lawyer reads % vaults', n; end if;
  update public.branding_vaults set display_name_ar = 'x';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T1h FAIL: another lawyer updated % vaults', n; end if;
  raise notice 'T1 PASS: the lawyer creates, reads and edits his own vault only; no one else reads or writes it; an individual cannot make one';
end $$;
reset role;

-- ── T2 the firm ──────────────────────────────────────────────────────────────
set role authenticated;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b0', true);
  insert into public.branding_vaults (firm_id, display_name_ar, display_name_en)
    values ('ffffffff-0000-0000-0000-0000000000f1', 'مكتب ف للمحاماة', 'F Law Firm');
  select count(*) into n from public.branding_vaults;
  if n <> 1 then raise exception 'T2a FAIL: the firm owner sees % vaults', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b2', true);
  update public.branding_vaults set website = 'https://f-law.sa' where firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2b FAIL: the office admin could not update the firm vault (% rows)', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  update public.branding_vaults set phone = '0112223333' where firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T2c FAIL: the managing partner could not update the firm vault (% rows)', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b4', true);
  select count(*) into n from public.branding_vaults;
  if n <> 0 then raise exception 'T2d FAIL: a suspended office admin read the firm vault'; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b3', true);
  select count(*) into n from public.branding_vaults;
  if n <> 0 then raise exception 'T2e FAIL: a partner (not owner / managing partner / office admin) read the firm vault'; end if;
  update public.branding_vaults set display_name_ar = 'x';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T2f FAIL: a partner updated the firm vault'; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000c0', true);
  select count(*) into n from public.branding_vaults;
  if n <> 0 then raise exception 'T2g FAIL: another firm''s owner read the vault'; end if;
  begin
    insert into public.branding_vaults (firm_id) values ('ffffffff-0000-0000-0000-0000000000f1');
    raise exception 'T2h FAIL: another firm''s owner created a vault for firm F';
  exception when insufficient_privilege or unique_violation then null;
  end;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  select count(*) into n from public.branding_vaults where firm_id is not null;
  if n <> 0 then raise exception 'T2i FAIL: an outside lawyer read the firm vault'; end if;
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b0', true);
  select count(*) into n from public.branding_vaults where lawyer_user_id is not null;
  if n <> 0 then raise exception 'T2j FAIL: the firm owner read a lawyer''s personal vault'; end if;
  raise notice 'T2 PASS: owner / managing partner / office admin manage the firm vault; partner, suspended admin, other firms and outsiders see nothing';
end $$;
reset role;

-- ── T3 guests ────────────────────────────────────────────────────────────────
set role anon;
do $$
begin
  begin
    perform 1 from public.branding_vaults;
    raise exception 'T3a FAIL: a guest can SELECT branding_vaults';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.can_manage_branding_object('u/00000000-0000-0000-0000-0000000000a1/logo-abcdefgh.png');
    raise exception 'T3b FAIL: a guest can EXECUTE can_manage_branding_object';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: guests hold nothing on branding_vaults or its helpers';
end $$;
reset role;

-- ── T4 column privileges: logo_path, owner columns, delete ───────────────────
set role authenticated;
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    update public.branding_vaults set logo_path = 'u/00000000-0000-0000-0000-0000000000a1/logo-abcdefgh.png';
    raise exception 'T4a FAIL: a session wrote logo_path';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.branding_vaults set firm_id = 'ffffffff-0000-0000-0000-0000000000f2';
    raise exception 'T4b FAIL: a session moved a vault to another owner';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.branding_vaults;
    raise exception 'T4c FAIL: a session deleted a vault';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.branding_vaults (lawyer_user_id, logo_path)
      values ('00000000-0000-0000-0000-0000000000a1', 'u/00000000-0000-0000-0000-0000000000a1/logo-abcdefgh.png');
    raise exception 'T4d FAIL: a session inserted logo_path';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 PASS: logo_path, the owner columns and DELETE are out of a session''s reach';
end $$;
reset role;

-- ── T5 CHECKs (as the server would write) ────────────────────────────────────
do $$
begin
  update public.branding_vaults set logo_path = 'u/00000000-0000-0000-0000-0000000000a1/logo-abcdefgh12.png'
   where lawyer_user_id = '00000000-0000-0000-0000-0000000000a1';
  begin
    update public.branding_vaults set logo_path = 'u/00000000-0000-0000-0000-0000000000a2/logo-abcdefgh12.png'
     where lawyer_user_id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'T5a FAIL: a vault pointed at another owner''s folder';
  exception when check_violation then null;
  end;
  begin
    update public.branding_vaults set logo_path = 'f/ffffffff-0000-0000-0000-0000000000f1/logo-abcdefgh12.svg'
     where firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
    raise exception 'T5b FAIL: an .svg logo path was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.branding_vaults set accent_color = 'red' where firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
    raise exception 'T5c FAIL: a non-hex accent colour was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.branding_vaults set website = 'javascript:alert(1)' where firm_id = 'ffffffff-0000-0000-0000-0000000000f1';
    raise exception 'T5d FAIL: a javascript: website was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_vaults (lawyer_user_id, firm_id)
      values ('00000000-0000-0000-0000-0000000000a2', 'ffffffff-0000-0000-0000-0000000000f2');
    raise exception 'T5e FAIL: a vault with two owners was accepted';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_vaults (display_name_ar) values ('بلا مالك');
    raise exception 'T5f FAIL: a vault with no owner was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T5 PASS: logo_path stays in the vault''s own folder (png/jpg/webp), accent is #RRGGBB, website http(s), exactly one owner';
end $$;

-- ── T6 Storage objects ───────────────────────────────────────────────────────
insert into storage.objects (bucket_id, name) values
  ('branding', 'u/00000000-0000-0000-0000-0000000000a2/logo-l2l2l2l2.png'),
  ('branding', 'f/ffffffff-0000-0000-0000-0000000000f2/logo-f2f2f2f2.png'),
  ('documents', '00000000-0000-0000-0000-0000000000a1/own.pdf');
set role authenticated;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  insert into storage.objects (bucket_id, name) values ('branding', 'u/00000000-0000-0000-0000-0000000000a1/logo-aaaaaaaa.png');
  begin
    insert into storage.objects (bucket_id, name) values ('branding', 'u/00000000-0000-0000-0000-0000000000a2/logo-bbbbbbbb.png');
    raise exception 'T6a FAIL: a lawyer uploaded into another lawyer''s folder';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from storage.objects where bucket_id = 'branding';
  if n <> 1 then raise exception 'T6b FAIL: the lawyer sees % branding objects (expected his own 1)', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b2', true);
  insert into storage.objects (bucket_id, name) values ('branding', 'f/ffffffff-0000-0000-0000-0000000000f1/logo-cccccccc.png');
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b3', true);
  begin
    insert into storage.objects (bucket_id, name) values ('branding', 'f/ffffffff-0000-0000-0000-0000000000f1/logo-dddddddd.png');
    raise exception 'T6c FAIL: a partner uploaded the firm logo';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from storage.objects where bucket_id = 'branding';
  if n <> 0 then raise exception 'T6d FAIL: a partner sees % branding objects', n; end if;

  if public.can_manage_branding_object('f/not-a-uuid/logo.png')
     or public.can_manage_branding_object('u/00000000-0000-0000-0000-0000000000b3')
     or public.can_manage_branding_object('u/00000000-0000-0000-0000-0000000000b3/a/b.png')
     or public.can_manage_branding_object('x/00000000-0000-0000-0000-0000000000b3/logo.png')
     or public.can_manage_branding_object(null) then
    raise exception 'T6e FAIL: a malformed name was allowed';
  end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b0', true);
  delete from storage.objects where bucket_id = 'branding' and name like 'f/ffffffff-0000-0000-0000-0000000000f1/%';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T6f FAIL: the firm owner could not delete the firm logo (% rows)', n; end if;
  delete from storage.objects where bucket_id = 'branding';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T6g FAIL: the firm owner deleted % objects of other vaults', n; end if;
  raise notice 'T6 PASS: each manager reaches only his vault''s folder in bucket branding; malformed names answer false';
end $$;
reset role;

do $$
begin
  if not exists (select 1 from storage.objects where name = 'u/00000000-0000-0000-0000-0000000000a2/logo-l2l2l2l2.png')
     or not exists (select 1 from storage.objects where name = 'f/ffffffff-0000-0000-0000-0000000000f2/logo-f2f2f2f2.png') then
    raise exception 'T6h FAIL: another vault''s object went missing';
  end if;
  raise notice 'T6h PASS: other vaults'' objects untouched';
end $$;

select 'branding_vault.test.sql: ALL PASS';
