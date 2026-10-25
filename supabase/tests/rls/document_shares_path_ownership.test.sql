-- document_shares_path_ownership.test.sql — proves 20261026_66 (security
-- review 2026-10-26, the document_shares half of finding 1): a session can no
-- longer create, or re-point, a document_shares row at a file that is not one
-- of its own live documents — the row /api/v1/share/[token]/verify signs with
-- the service role.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). 66 runs
-- TWICE (idempotent). From the repo root:
--   M=supabase/migrations; T=supabase/tests/rls; bash $T/run.sh \
--     $M/20260903_phase2_clients_and_firm_membership.sql \
--     $M/20260904_phase5_deadline_radar.sql \
--     $M/20260905_phase3_consultations_and_contracts.sql \
--     $M/20260910_case_notes.sql \
--     $M/20261017_41_notes_visibility_case_team.sql \
--     $T/prelude_attachments_live.sql \
--     $T/prelude_attachments_stray_insert_policies.sql \
--     $M/20261025_51_soft_delete_case_notes_docs.sql \
--     $M/20261026_65_attachments_path_ownership.sql \
--     $T/prelude_document_shares_live.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $M/20261026_66_document_shares_path_ownership.sql \
--     $T/document_shares_path_ownership.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL; recorded 2026-10-26):
--   NC1 — the chain without the two 20261026_66 lines → "T0 FAIL: the FOR ALL
--         policy document_shares_owner_write is still there".
--   NC2 — NC1 with the T0 block removed → "T1 FAIL: a lawyer created a share
--         of the victim's file" (the hole as it is on production today).
--
-- People:
--   O  a lawyer: vault file 900 (his), a binned file 903, a pre-65 forged row
--      904 (his row, the victim's path), assignee of req-o
--   C  a client, filer of req-o, case document 902 (his)
--   V  the victim: vault file 901
--   A  an admin
-- Every assertion RAISES on failure. Sessions run as role `authenticated`.
\set ON_ERROR_STOP 1
\pset format unaligned
\pset tuples_only on

insert into auth.users (id) values
  ('0a000000-0000-0000-0000-00000000000a'), ('c0000000-0000-0000-0000-00000000000c'),
  ('70000000-0000-0000-0000-00000000007a'), ('ad000000-0000-0000-0000-0000000000ad');
insert into public.profiles (id, user_type, display_name) values
  ('0a000000-0000-0000-0000-00000000000a', 'lawyer',     'O محامٍ'),
  ('c0000000-0000-0000-0000-00000000000c', 'individual', 'C موكل'),
  ('70000000-0000-0000-0000-00000000007a', 'individual', 'V الضحية'),
  ('ad000000-0000-0000-0000-0000000000ad', 'admin',      'A مشرف');
insert into public.service_requests (id, requester_user_id, assigned_to, title) values
  ('req-o', 'c0000000-0000-0000-0000-00000000000c', '0a000000-0000-0000-0000-00000000000a', 'طلب C عند O');
-- Fixtures written as postgres (904 is what a pre-65 forgery left behind).
insert into public.attachments (id, request_id, owner_user_id, file_name, storage_path, deleted_at) values
  (900, null,    '0a000000-0000-0000-0000-00000000000a', 'مذكرتي.pdf', '0a000000-0000-0000-0000-00000000000a/1-own.pdf', null),
  (901, null,    '70000000-0000-0000-0000-00000000007a', 'سري.pdf',    '70000000-0000-0000-0000-00000000007a/1-secret.pdf', null),
  (902, 'req-o', 'c0000000-0000-0000-0000-00000000000c', 'قضيتي.pdf',  'c0000000-0000-0000-0000-00000000000c/2-case.pdf', null),
  (903, null,    '0a000000-0000-0000-0000-00000000000a', 'محذوف.pdf',  '0a000000-0000-0000-0000-00000000000a/3-binned.pdf', now()),
  (904, null,    '0a000000-0000-0000-0000-00000000000a', 'مزوّر.pdf',  '70000000-0000-0000-0000-00000000007a/1-secret.pdf', null);

-- ── T0 the policy set and the trigger ────────────────────────────────────────
do $$
declare n int; first_before text;
begin
  if exists (select 1 from pg_policy where polrelid = 'public.document_shares'::regclass and polname = 'document_shares_owner_write') then
    raise exception 'T0 FAIL: the FOR ALL policy document_shares_owner_write is still there';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.document_shares'::regclass and polcmd = 'a';
  if n <> 1 then raise exception 'T0 FAIL: % INSERT policies on document_shares (the stray one survived?)', n; end if;
  if (select count(*) from pg_policy where polrelid = 'public.document_shares'::regclass
       and polname in ('document_shares_select_own', 'document_shares_admin_all', 'document_shares insert own share of own file',
                       'document_shares owner update', 'document_shares owner delete')) <> 5
     or (select count(*) from pg_policy where polrelid = 'public.document_shares'::regclass) <> 5 then
    raise exception 'T0 FAIL: the policy set is not exactly select_own / admin_all / insert / update / delete';
  end if;
  select tg.tgname into first_before from pg_trigger tg
   where tg.tgrelid = 'public.document_shares'::regclass and not tg.tgisinternal and (tg.tgtype & 2) = 2
   order by tg.tgname limit 1;
  if first_before is distinct from 'trg_00_document_shares_session_guard' then
    raise exception 'T0 FAIL: the session guard is not the first BEFORE trigger (%)', first_before;
  end if;
  raise notice 'T0 PASS: FOR ALL owner_write and the stray INSERT policy are gone; five per-command policies; the guard fires first';
end $$;

set role authenticated;
select set_config('test.uid', '0a000000-0000-0000-0000-00000000000a', false);

-- ── T1 the attack: a share of the victim's file, straight through PostgREST ─
do $$
begin
  begin  -- the bare attack: any path, a hash he chose, no document id
    insert into public.document_shares (owner_id, document_path, token_hash, expires_at)
    values ('0a000000-0000-0000-0000-00000000000a', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
            encode(sha256(convert_to('attacker-token', 'UTF8')), 'hex'), now() + interval '1 day');
    raise exception 'T1 FAIL: a lawyer created a share of the victim''s file';
  exception when insufficient_privilege then null;
  end;
  begin  -- the victim's own id and path
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', '901', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
            encode(sha256(convert_to('t1b', 'UTF8')), 'hex'));
    raise exception 'T1 FAIL: a share of the victim''s document id';
  exception when insufficient_privilege then null;
  end;
  begin  -- his own id, the victim's path
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', '900', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
            encode(sha256(convert_to('t1c', 'UTF8')), 'hex'));
    raise exception 'T1 FAIL: his own document id carried the victim''s path';
  exception when insufficient_privilege then null;
  end;
  begin  -- the share in the victim's name
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('70000000-0000-0000-0000-00000000007a', '901', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
            encode(sha256(convert_to('t1d', 'UTF8')), 'hex'));
    raise exception 'T1 FAIL: a share created in the victim''s name';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T1 PASS: a foreign path, a foreign document, a mismatched path and a foreign owner are all refused (42501)';
end $$;

-- ── T2 the narrow rule ───────────────────────────────────────────────────────
do $$
begin
  begin  -- a binned document
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', '903', '0a000000-0000-0000-0000-00000000000a/3-binned.pdf',
            encode(sha256(convert_to('t2a', 'UTF8')), 'hex'));
    raise exception 'T2 FAIL: a document in the bin was shared';
  exception when insufficient_privilege then null;
  end;
  begin  -- his own pre-65 row pointing at the victim's file
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', '904', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
            encode(sha256(convert_to('t2b', 'UTF8')), 'hex'));
    raise exception 'T2 FAIL: a forged attachments row (path outside its owner''s folder) was shared';
  exception when insufficient_privilege then null;
  end;
  begin  -- the assigned lawyer, the client's case document (readable, not his)
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', '902', 'c0000000-0000-0000-0000-00000000000c/2-case.pdf',
            encode(sha256(convert_to('t2c', 'UTF8')), 'hex'));
    raise exception 'T2 FAIL: a case participant shared a document somebody else uploaded';
  exception when insufficient_privilege then null;
  end;
  begin  -- a junk id: refused cleanly, no cast error
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', 'abc; drop', '0a000000-0000-0000-0000-00000000000a/1-own.pdf',
            encode(sha256(convert_to('t2d', 'UTF8')), 'hex'));
    raise exception 'T2 FAIL: a junk document id got through';
  exception when insufficient_privilege then null;
  end;
  begin  -- a plaintext token
    insert into public.document_shares (owner_id, document_id, document_path, token, token_hash)
    values ('0a000000-0000-0000-0000-00000000000a', '900', '0a000000-0000-0000-0000-00000000000a/1-own.pdf',
            'plain', encode(sha256(convert_to('plain', 'UTF8')), 'hex'));
    raise exception 'T2 FAIL: a plaintext token was stored';
  exception when insufficient_privilege then null;
  end;
  begin  -- no token hash
    insert into public.document_shares (owner_id, document_id, document_path)
    values ('0a000000-0000-0000-0000-00000000000a', '900', '0a000000-0000-0000-0000-00000000000a/1-own.pdf');
    raise exception 'T2 FAIL: a share without a token hash';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T2 PASS: binned, forged-row, someone else''s case document, junk id, plaintext token and hashless shares are refused';
end $$;

-- ── T3 the app's own insert (POST /api/v1/share's exact payload) ────────────
do $$
declare n int;
begin
  insert into public.document_shares (owner_id, document_id, document_path, title, token_hash, passcode_hash, expires_at)
  values ('0a000000-0000-0000-0000-00000000000a', '900', '0a000000-0000-0000-0000-00000000000a/1-own.pdf', 'مذكرتي.pdf',
          encode(sha256(convert_to('good-token', 'UTF8')), 'hex'),
          encode(sha256(convert_to('123456', 'UTF8')), 'hex'), now() + interval '72 hours');
  select count(*) into n from public.document_shares where document_id = '900';
  if n <> 1 then raise exception 'T3 FAIL: the owner reads back % rows of his share, expected 1', n; end if;
  raise notice 'T3 PASS: the route''s payload for the owner''s own live document goes through and reads back';
end $$;

-- ── T4 updates: the binding is frozen, the rest stays editable ───────────────
do $$
declare n int;
begin
  begin
    update public.document_shares set document_path = '70000000-0000-0000-0000-00000000007a/1-secret.pdf' where document_id = '900';
    raise exception 'T4 FAIL: document_path was re-pointed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.document_shares set document_id = '901' where document_id = '900';
    raise exception 'T4 FAIL: document_id changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.document_shares set token_hash = encode(sha256(convert_to('other', 'UTF8')), 'hex') where document_id = '900';
    raise exception 'T4 FAIL: token_hash changed';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.document_shares set token = 'plain' where document_id = '900';
    raise exception 'T4 FAIL: a plaintext token was set';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.document_shares set owner_id = '70000000-0000-0000-0000-00000000007a' where document_id = '900';
    raise exception 'T4 FAIL: owner_id changed';
  exception when insufficient_privilege then null;
  end;
  update public.document_shares set expires_at = now() + interval '1 hour', title = 'جديد' where document_id = '900';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T4 FAIL: the owner could not change expiry / title (% rows)', n; end if;
  raise notice 'T4 PASS: owner / document / path / token frozen; expiry and title still editable';
end $$;

-- ── T5 another user: sees, edits and deletes nothing of O's ─────────────────
select set_config('test.uid', '70000000-0000-0000-0000-00000000007a', false);
do $$
declare n int;
begin
  select count(*) into n from public.document_shares;
  if n <> 0 then raise exception 'T5 FAIL: V reads % of O''s shares', n; end if;
  update public.document_shares set title = 'x' where document_id = '900';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T5 FAIL: V updated O''s share'; end if;
  delete from public.document_shares where document_id = '900';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T5 FAIL: V deleted O''s share'; end if;
  raise notice 'T5 PASS: another user reads, updates and deletes none of O''s shares';
end $$;

-- ── T6 an admin is held to the same rule ─────────────────────────────────────
select set_config('test.uid', 'ad000000-0000-0000-0000-0000000000ad', false);
do $$
begin
  begin
    insert into public.document_shares (owner_id, document_id, document_path, token_hash)
    values ('ad000000-0000-0000-0000-0000000000ad', '901', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
            encode(sha256(convert_to('t6', 'UTF8')), 'hex'));
    raise exception 'T6 FAIL: an admin session minted a share of a user''s file';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6 PASS: document_shares_admin_all does not let an admin session mint a share of somebody''s file';
end $$;

-- ── T7 a guest ───────────────────────────────────────────────────────────────
reset role;
set role anon;
select set_config('test.uid', '', false);
do $$
begin
  begin
    insert into public.document_shares (owner_id, document_path, token_hash)
    values (null, '70000000-0000-0000-0000-00000000007a/1-secret.pdf', encode(sha256(convert_to('t7', 'UTF8')), 'hex'));
    raise exception 'T7 FAIL: a guest created a share';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T7 PASS: a guest creates no share';
end $$;

-- ── T8 the service role is not guarded ───────────────────────────────────────
reset role;
set role service_role;
do $$
declare n int;
begin
  insert into public.document_shares (owner_id, document_id, document_path, token_hash)
  values ('70000000-0000-0000-0000-00000000007a', '901', '70000000-0000-0000-0000-00000000007a/1-secret.pdf',
          encode(sha256(convert_to('svc', 'UTF8')), 'hex'));
  update public.document_shares set document_path = '70000000-0000-0000-0000-00000000007a/1-secret.pdf'
   where token_hash = encode(sha256(convert_to('svc', 'UTF8')), 'hex');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T8 FAIL: the service role update touched % rows', n; end if;
  delete from public.document_shares where token_hash = encode(sha256(convert_to('svc', 'UTF8')), 'hex');
  raise notice 'T8 PASS: the service role inserts / updates freely (server code is trusted)';
end $$;
reset role;

-- ── T9 the owner deletes his own share; the helper on its own ───────────────
set role authenticated;
select set_config('test.uid', '0a000000-0000-0000-0000-00000000000a', false);
do $$
declare n int;
begin
  if public.can_share_attachment(null, '0a000000-0000-0000-0000-00000000000a/1-own.pdf')
     or public.can_share_attachment('900', null)
     or public.can_share_attachment('901', '70000000-0000-0000-0000-00000000007a/1-secret.pdf')
     or public.can_share_attachment('903', '0a000000-0000-0000-0000-00000000000a/3-binned.pdf')
     or not public.can_share_attachment('900', '0a000000-0000-0000-0000-00000000000a/1-own.pdf') then
    raise exception 'T9 FAIL: can_share_attachment answers wrong';
  end if;
  delete from public.document_shares where document_id = '900';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T9 FAIL: the owner could not delete his own share (% rows)', n; end if;
  raise notice 'T9 PASS: the helper answers right; the owner deletes his own share';
end $$;
reset role;

select 'document_shares_path_ownership: ALL PASS';
