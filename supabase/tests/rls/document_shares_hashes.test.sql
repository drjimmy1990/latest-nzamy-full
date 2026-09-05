-- RLS acceptance tests for 20260909_document_shares_hashes.sql (owner item 174)
-- Users: A (lawyer, owns an attachment + a pre-migration document_shares
-- row), B (another lawyer, no relation to either). Non-superuser throughout.
--
-- Fixture data (auth.users/profiles/service_requests/attachments + the
-- pre-migration plaintext document_shares row) is seeded by a fixture file
-- applied as an earlier "migration" argument to run.sh, AFTER
-- 20260706_content_and_ops.sql (creates document_shares) and BEFORE this
-- migration — see run.sh invocation. That is what lets T1 below assert the
-- backfill actually ran on a real row, not just that the columns exist.
\set ON_ERROR_STOP 0
\pset format unaligned
\pset tuples_only on

-- T0 — schema shape
select 'T0 hash/path columns exist (expect 3): ' || count(*) from information_schema.columns
 where table_name = 'document_shares' and column_name in ('token_hash','passcode_hash','document_path');
select 'T0 token is now nullable (expect YES): ' || is_nullable from information_schema.columns
 where table_name = 'document_shares' and column_name = 'token';
select 'T0 unique index on token_hash (expect 1): ' || count(*) from pg_indexes
 where tablename = 'document_shares' and indexdef ilike '%unique%' and indexdef ilike '%token_hash%';

-- T1 — backfill: the pre-migration row's hash columns were filled from
-- whatever plaintext survived on it, using the SAME algorithm shareSecrets.ts
-- uses (sha256, hex) — computed independently here, not just eyeballed.
select 'T1 token_hash backfilled correctly (expect 1): ' || count(*) from public.document_shares
 where token = 'OLDTOKEN1234567890ABCD'
   and token_hash = encode(sha256(convert_to('OLDTOKEN1234567890ABCD', 'UTF8')), 'hex');
select 'T1 passcode_hash backfilled correctly (expect 1): ' || count(*) from public.document_shares
 where token = 'OLDTOKEN1234567890ABCD'
   and passcode_hash = encode(sha256(convert_to('123456', 'UTF8')), 'hex');
-- The old plaintext columns are untouched (no data destruction).
select 'T1 old plaintext columns untouched (expect 1): ' || count(*) from public.document_shares
 where token = 'OLDTOKEN1234567890ABCD' and passcode = '123456';

set role app_user;

-- T2 — document_shares stays owner-only to read (RLS unchanged by this migration)
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
select 'T2 A reads own pre-migration share (expect 1): ' || count(*) from public.document_shares where token = 'OLDTOKEN1234567890ABCD';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T2 B cannot read A''s share (expect 0): ' || count(*) from public.document_shares where token = 'OLDTOKEN1234567890ABCD';

-- T3 — a real POST /api/v1/share insert (as the rewritten route does it:
-- token_hash/passcode_hash only, token/passcode omitted) goes through under
-- document_shares_owner_write and never writes a plaintext token/passcode.
select set_config('test.uid', 'aaaaaaaa-0000-0000-0000-000000000001', false);
insert into public.document_shares (owner_id, document_id, document_path, title, token_hash, passcode_hash, expires_at)
values (
  'aaaaaaaa-0000-0000-0000-000000000001', '1', 'aaaaaaaa-0000-0000-0000-000000000001/x.pdf', 'مذكرة جديدة',
  encode(sha256(convert_to('newtoken-abc', 'UTF8')), 'hex'),
  encode(sha256(convert_to('654321', 'UTF8')), 'hex'),
  now() + interval '72 hours'
);
select 'T3 new row has no plaintext token/passcode (expect t|t): ' ||
  (token is null)::text || '|' || (passcode is null)::text
  from public.document_shares where document_id = '1' and owner_id = 'aaaaaaaa-0000-0000-0000-000000000001';
do $$ begin
  insert into public.document_shares (owner_id, document_id, document_path, token_hash, expires_at)
  values ('bbbbbbbb-0000-0000-0000-000000000002', '3', 'x/y.pdf', encode(sha256(convert_to('someone-elses', 'UTF8')), 'hex'), now() + interval '1 hour');
  raise notice 'T3 FAIL: A created a share row owned by B';
exception when insufficient_privilege then
  raise notice 'T3 PASS: a share row can only be created as yourself (42501)';
end $$;

-- T4 — token_hash stays unique (the lookup index verify/route.ts relies on)
do $$ begin
  insert into public.document_shares (owner_id, document_id, document_path, token_hash, expires_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001', '2', 'x/y.pdf', encode(sha256(convert_to('newtoken-abc', 'UTF8')), 'hex'), now() + interval '1 hour');
  raise notice 'T4 FAIL: a duplicate token_hash was accepted';
exception when unique_violation then
  raise notice 'T4 PASS: token_hash is unique (23505)';
end $$;

-- T5 — the attachments read POST /api/v1/share depends on: the owner branch
-- 20260616_production_readiness_fixes.sql added to attachments_select_policy.
select 'T5 A reads own attachment (expect 1): ' || count(*) from public.attachments
 where owner_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
select set_config('test.uid', 'bbbbbbbb-0000-0000-0000-000000000002', false);
select 'T5 B (non-owner, non-participant) cannot read A''s attachment (expect 0): ' || count(*) from public.attachments
 where owner_user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
