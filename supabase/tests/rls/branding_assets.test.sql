-- branding_assets.test.sql — proves 20261030_10_branding_assets.sql (owner
-- note 09, package 2026-10-30: the office's uploaded stationery in its vault).
--
-- CHAIN (run.sh, postgres:16). 63 and 30_10 each run TWICE (re-runnable).
-- From the repo root:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_storage_objects_stub.sql $T/prelude_storage_buckets_stub.sql \
--     $M/20261026_63_branding_vault.sql $M/20261026_63_branding_vault.sql \
--     $M/20261030_10_branding_assets.sql $M/20261030_10_branding_assets.sql \
--     $T/branding_assets.test.sql
--
-- RECORDED 2026-10-30 (postgres:16-alpine): ALL PASS after two runs of each
-- migration. NEGATIVE CONTROL: with trg_branding_assets_guard dropped, a row of
-- L2's vault pointing at L's folder (u/<L>/asset-letterhead-pdf-….pdf) is
-- accepted — the trigger is what keeps T1a red.
--
-- People: L lawyer · L2 another lawyer · firm F: O owner, MP managing partner,
--         P partner, X office admin SUSPENDED. The server (service role) is
--         played by the superuser that runs this file.
-- Every assertion RAISES on failure.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b0'), ('00000000-0000-0000-0000-0000000000b1'),
  ('00000000-0000-0000-0000-0000000000b3'), ('00000000-0000-0000-0000-0000000000b4');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000000a1', 'lawyer', 'L'),
  ('00000000-0000-0000-0000-0000000000a2', 'lawyer', 'L2'),
  ('00000000-0000-0000-0000-0000000000b0', 'firm', 'O'),
  ('00000000-0000-0000-0000-0000000000b1', 'lawyer', 'MP'),
  ('00000000-0000-0000-0000-0000000000b3', 'lawyer', 'P'),
  ('00000000-0000-0000-0000-0000000000b4', 'individual', 'X');
insert into public.firm_profiles (id, owner_user_id, name_ar) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b0', 'مكتب ف');
insert into public.firm_members (firm_id, user_id, role, status) values
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1', 'managing_partner', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b3', 'partner', 'active'),
  ('ffffffff-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b4', 'office_admin', 'suspended');
insert into public.branding_vaults (id, lawyer_user_id) values
  ('11111111-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1');
insert into public.branding_vaults (id, firm_id) values
  ('11111111-0000-0000-0000-0000000000f1', 'ffffffff-0000-0000-0000-0000000000f1');

-- ── T0 shape ─────────────────────────────────────────────────────────────────
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.branding_assets'::regclass) then
    raise exception 'T0a FAIL: RLS off';
  end if;
  if (select count(*) from pg_policy where polrelid = 'public.branding_assets'::regclass) <> 1 then
    raise exception 'T0b FAIL: expected exactly one policy after two runs';
  end if;
  if (select count(*) from pg_trigger where tgrelid = 'public.branding_assets'::regclass and not tgisinternal) <> 1 then
    raise exception 'T0c FAIL: expected exactly one trigger after two runs';
  end if;
  if not exists (select 1 from storage.buckets where id = 'branding-files' and public = false and file_size_limit = 5242880
                  and allowed_mime_types @> array['application/pdf', 'image/png']) then
    raise exception 'T0d FAIL: the private 5 MB bucket branding-files is missing';
  end if;
  if not exists (select 1 from storage.buckets where id = 'branding' and file_size_limit = 1048576
                  and allowed_mime_types <@ array['image/png', 'image/jpeg', 'image/webp']) then
    raise exception 'T0e FAIL: the logo bucket «branding» was widened (_verify pins it)';
  end if;
  raise notice 'T0 PASS: RLS, 1 policy, 1 trigger, private branding-files bucket; the logo bucket untouched — after two runs';
end $$;

-- ── T1 the server writes valid rows; the folder is the vault owner's ────────
do $$
begin
  insert into public.branding_assets (vault_id, kind, path, original_name, mime, size_bytes) values
    ('11111111-0000-0000-0000-0000000000a1', 'letterhead_docx',
     'u/00000000-0000-0000-0000-0000000000a1/asset-letterhead-docx-abcdef12.docx', 'ورق.docx',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 20000),
    ('11111111-0000-0000-0000-0000000000f1', 'stamp',
     'f/ffffffff-0000-0000-0000-0000000000f1/asset-stamp-abcdef12.png', 'ختم.png', 'image/png', 9000);

  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'letterhead_pdf',
       'u/00000000-0000-0000-0000-0000000000a2/asset-letterhead-pdf-abcdef12.pdf', 'application/pdf', 100);
    raise exception 'T1a FAIL: a row pointed at ANOTHER lawyer''s folder';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'letterhead_pdf',
       'f/00000000-0000-0000-0000-0000000000a1/asset-letterhead-pdf-abcdef12.pdf', 'application/pdf', 100);
    raise exception 'T1b FAIL: a lawyer vault row used the firm prefix';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'letterhead_pdf',
       'u/00000000-0000-0000-0000-0000000000a1/logo-abcdef12.png', 'application/pdf', 100);
    raise exception 'T1c FAIL: a logo path was accepted as an asset';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'letterhead_pdf',
       'u/00000000-0000-0000-0000-0000000000a1/asset-letterhead-pdf-abcdef12.pdf', 'image/png', 100);
    raise exception 'T1d FAIL: a PDF row carried an image mime';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'signature',
       'u/00000000-0000-0000-0000-0000000000a1/asset-signature-abcdef12.png', 'image/png', 2000000);
    raise exception 'T1e FAIL: a 2 MB signature passed the 1 MB cap';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'stamp',
       'u/00000000-0000-0000-0000-0000000000a1/asset-signature-abcdef12.png', 'image/png', 100);
    raise exception 'T1f FAIL: a stamp row used a signature path';
  exception when check_violation then null;
  end;
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'letterhead_docx',
       'u/00000000-0000-0000-0000-0000000000a1/asset-letterhead-docx-zzzzzzzz.docx',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100);
    raise exception 'T1g FAIL: two Word templates in one vault';
  exception when unique_violation then null;
  end;
  raise notice 'T1 PASS: valid rows land; another owner''s folder, a wrong prefix, a logo name, a wrong mime, an oversized image, a mismatched kind and a second file of a kind are refused';
end $$;

-- ── T2 sessions read their own vault's files only ───────────────────────────
set role authenticated;
do $$
declare n int;
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  select count(*) into n from public.branding_assets;
  if n <> 1 then raise exception 'T2a FAIL: the lawyer sees % rows (expected his own 1)', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a2', true);
  select count(*) into n from public.branding_assets;
  if n <> 0 then raise exception 'T2b FAIL: another lawyer sees % rows', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b0', true);
  select count(*) into n from public.branding_assets;
  if n <> 1 then raise exception 'T2c FAIL: the firm owner sees % rows (expected the firm''s 1)', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b1', true);
  select count(*) into n from public.branding_assets;
  if n <> 1 then raise exception 'T2d FAIL: the managing partner sees % rows', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b3', true);
  select count(*) into n from public.branding_assets;
  if n <> 0 then raise exception 'T2e FAIL: a partner sees % firm stationery rows', n; end if;

  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000b4', true);
  select count(*) into n from public.branding_assets;
  if n <> 0 then raise exception 'T2f FAIL: a suspended office admin sees % rows', n; end if;
  raise notice 'T2 PASS: the lawyer, the firm owner and the managing partner read their own vault''s files; another lawyer, a partner and a suspended admin read none';
end $$;

-- ── T3 sessions never write ──────────────────────────────────────────────────
do $$
begin
  perform set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', true);
  begin
    insert into public.branding_assets (vault_id, kind, path, mime, size_bytes) values
      ('11111111-0000-0000-0000-0000000000a1', 'letterhead_pdf',
       'u/00000000-0000-0000-0000-0000000000a1/asset-letterhead-pdf-abcdef12.pdf', 'application/pdf', 100);
    raise exception 'T3a FAIL: a session inserted an asset row';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.branding_assets set path = 'u/00000000-0000-0000-0000-0000000000a2/asset-letterhead-docx-abcdef12.docx';
    raise exception 'T3b FAIL: a session updated an asset row';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.branding_assets;
    raise exception 'T3c FAIL: a session deleted asset rows';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T3 PASS: sessions cannot insert, update or delete — the server writes';
end $$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.branding_assets;
    raise exception 'T4 FAIL: a guest read branding_assets';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T4 PASS: guests hold nothing';
end $$;
reset role;

-- ── T5 the vault's rows go with the vault ────────────────────────────────────
do $$
declare n int;
begin
  delete from public.branding_vaults where id = '11111111-0000-0000-0000-0000000000a1';
  select count(*) into n from public.branding_assets where vault_id = '11111111-0000-0000-0000-0000000000a1';
  if n <> 0 then raise exception 'T5 FAIL: % asset rows outlived their vault', n; end if;
  raise notice 'T5 PASS: deleting a vault deletes its asset rows (the purge clears the objects)';
end $$;

select 'branding_assets.test.sql: ALL PASS';
