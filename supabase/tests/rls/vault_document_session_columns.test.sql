-- vault_document_session_columns.test.sql — proves 20261203_80 (batch l13
-- vault, owner Q167): a session may change only the bin (deleted_at /
-- deleted_by) and the legal hold (legal_hold / hold_reason) of a document row
-- it can update; the file's name, type, size, source and date are fixed. WHO
-- may update a row is unchanged: the owner and the order's two parties still
-- bin, restore and hold as before, and the trusted roles still write anything.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 80 runs TWICE
-- (idempotent), then the verify:l13_vault block of _verify.sql. From the repo
-- root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l13_vault.sql
--   sed -n '/^-- >>> verify:l13_vault/,/^-- <<< verify:l13_vault/p' $M/_verify.sql > "$B"
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
--     $M/20261203_80_vault_document_session_columns.sql \
--     $M/20261203_80_vault_document_session_columns.sql \
--     "$B" \
--     $R/vault_document_session_columns.test.sql
--
-- RECORDED 2026-11-23 (postgres:16-alpine): ALL PASS, twice.
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-11-23):
--   NC1 — the chain without the two 20261203_80 lines and without "$B" →
--         "T0 FAIL: trg_02_attachments_session_columns is missing".
--   NC2 — NC1 with the T0 block removed → "T1 FAIL: the lawyer renamed the
--         client's case document".
--   NC3 — "$B" after `alter table public.attachments disable trigger
--         trg_02_attachments_session_columns` → "_verify: 20261203_80 — the
--         session column guard on attachments is missing or disabled".
--   NC4 — "$B" after `alter function public.guard_attachment_session_columns()
--         security definer` → "… is SECURITY DEFINER; it would let every
--         session through".
--   The branding half of "$B" (20261030_14 + bucket branding-files) is run on
--   the chain of branding_assets.test.sql (storage stubs, 63, 30_14, "$B",
--   branding_assets.test.sql → ALL PASS) and fails, as it must, after each of:
--   a Storage policy naming bucket_id = 'branding-files'; `grant insert on
--   public.branding_assets to authenticated`; the bucket made public.
--
-- NOT IN THIS CHAIN ON PURPOSE: soft_delete_case_records.test.sql T11 ends
-- with a session renaming a vault document AND re-pointing its file — the
-- second half has been refused since 20261026_65, the first since 80; its own
-- chain loads neither, so it is unchanged.
--
-- People:
--   C  a client, filer of req-c (assigned to L)
--   L  a lawyer, assignee of req-c
--   X  a stranger
-- Every assertion RAISES on failure. Sessions run as role `authenticated`.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('c0000000-0000-0000-0000-00000000000c'), ('10000000-0000-0000-0000-00000000001a'),
  ('80000000-0000-0000-0000-00000000008a');
insert into public.profiles (id, user_type, display_name) values
  ('c0000000-0000-0000-0000-00000000000c', 'individual', 'C موكل'),
  ('10000000-0000-0000-0000-00000000001a', 'lawyer',     'L محامٍ'),
  ('80000000-0000-0000-0000-00000000008a', 'individual', 'X غريب');
insert into public.service_requests (id, requester_user_id, assigned_to, title) values
  ('req-c', 'c0000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-00000000001a', 'طلب C');
-- Fixtures written as postgres.
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path, mime_type, size_bytes) values
  (901, null,    'c0000000-0000-0000-0000-00000000000c', 'خزنتي.pdf', 'c0000000-0000-0000-0000-00000000000c/1-mine.pdf', 'application/pdf', 100),
  (902, 'req-c', 'c0000000-0000-0000-0000-00000000000c', 'قضيتي.pdf', 'c0000000-0000-0000-0000-00000000000c/2-case.pdf', 'application/pdf', 200),
  (903, 'req-c', '10000000-0000-0000-0000-00000000001a', 'مذكرة.pdf', '10000000-0000-0000-0000-00000000001a/3-memo.pdf', 'application/pdf', 300);

-- ── T0 the trigger ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.attachments'::regclass
                  and tgname = 'trg_02_attachments_session_columns' and tgenabled <> 'D') then
    raise exception 'T0 FAIL: trg_02_attachments_session_columns is missing';
  end if;
  raise notice 'T0 PASS: the session column guard is on attachments';
end $$;

set role authenticated;

-- ── T1 a party rewrites the other side's document ───────────────────────────
select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
begin
  begin
    update public.attachments set file_name = 'مزوّر.pdf' where id = 902;
    if found then raise exception 'T1 FAIL: the lawyer renamed the client''s case document'; end if;
    raise exception 'T1 FAIL: the update matched no row — the fixture is wrong (the lawyer is a party of req-c)';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set mime_type = 'text/html' where id = 902;
    raise exception 'T1 FAIL: the lawyer changed the type of the client''s case document';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T1 PASS: a party cannot rename or retype the other side''s document (42501)';
end $$;

-- ── T2 the owner rewrites his own row's descriptive columns ─────────────────
select set_config('test.uid', 'c0000000-0000-0000-0000-00000000000c', false);
do $$
begin
  begin
    update public.attachments set mime_type = 'image/png' where id = 901;
    raise exception 'T2 FAIL: the owner changed the recorded type of his file';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set size_bytes = 1 where id = 901;
    raise exception 'T2 FAIL: the owner changed the recorded size of his file';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set source = 'generated' where id = 901;
    raise exception 'T2 FAIL: the owner changed the source of his file';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.attachments set created_at = now() - interval '1 year' where id = 901;
    raise exception 'T2 FAIL: the owner back-dated his file';
  exception when insufficient_privilege then null;
  end;
  begin  -- a change hidden next to an allowed one is refused as a whole
    update public.attachments set legal_hold = true, file_name = 'x.pdf' where id = 901;
    raise exception 'T2 FAIL: a rename got through beside a legal hold';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: type, size, source, date and name are fixed for the owner too (42501)';
end $$;

-- ── T3 what the app does still works, for the same people ───────────────────
do $$
declare n int;
begin
  -- the owner bins and restores his vault file (DELETE /api/v1/documents/[id], …/restore)
  update public.attachments set deleted_at = now(), deleted_by = 'c0000000-0000-0000-0000-00000000000c' where id = 901;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the owner could not bin his file (% rows)', n; end if;
  update public.attachments set deleted_at = null, deleted_by = null where id = 901;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the owner could not restore his file (% rows)', n; end if;
  -- the owner puts and lifts a legal hold (PATCH …/hold)
  update public.attachments set legal_hold = true, hold_reason = 'نزاع قائم' where id = 902;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the owner could not hold his case document (% rows)', n; end if;
  update public.attachments set legal_hold = false, hold_reason = null where id = 902;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3 FAIL: the owner could not lift the hold (% rows)', n; end if;
  -- an update that changes nothing is not refused
  update public.attachments set legal_hold = false where id = 902;
  raise notice 'T3 PASS: bin, restore, hold and release still work for the owner';
end $$;

select set_config('test.uid', '10000000-0000-0000-0000-00000000001a', false);
do $$
declare n int;
begin
  -- the order's other party keeps the Phase 6 rule (bin / hold), unchanged here
  update public.attachments set legal_hold = true, hold_reason = 'حفظ' where id = 902;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3b FAIL: the lawyer lost the hold he had on the case document (% rows)', n; end if;
  update public.attachments set legal_hold = false, hold_reason = null where id = 902;
  update public.attachments set deleted_at = now(), deleted_by = '10000000-0000-0000-0000-00000000001a' where id = 903;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T3b FAIL: the lawyer could not bin his own memo (% rows)', n; end if;
  raise notice 'T3b PASS: the other party''s existing rights (hold, bin) are unchanged';
end $$;

-- ── T4 a stranger still reaches nothing ─────────────────────────────────────
select set_config('test.uid', '80000000-0000-0000-0000-00000000008a', false);
do $$
declare n int;
begin
  update public.attachments set legal_hold = true where id in (901, 902, 903);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T4 FAIL: a stranger updated % document row(s)', n; end if;
  raise notice 'T4 PASS: a stranger updates no row (RLS unchanged)';
end $$;

-- ── T5 the trusted roles are not affected ───────────────────────────────────
reset role;
do $$
declare n int;
begin
  update public.attachments set file_name = 'نسخة.pdf', mime_type = 'application/pdf', size_bytes = 201 where id = 902;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T5 FAIL: postgres could not update the row (% rows)', n; end if;
  if (select file_name from public.attachments where id = 902) <> 'نسخة.pdf' then
    raise exception 'T5 FAIL: the trusted update did not land';
  end if;
  raise notice 'T5 PASS: postgres (the order bind, account purge, restore function) still writes any column';
end $$;

-- ── T6 idempotency: exactly one copy of the trigger after two runs ──────────
do $$
begin
  if (select count(*) from pg_trigger where tgrelid = 'public.attachments'::regclass
       and tgname = 'trg_02_attachments_session_columns') <> 1 then
    raise exception 'T6 FAIL: the trigger is not there exactly once';
  end if;
  raise notice 'T6 PASS: one trigger after two runs';
end $$;

select 'vault_document_session_columns: ALL PASS';
