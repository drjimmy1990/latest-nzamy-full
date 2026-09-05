-- 20260909_document_shares_hashes.sql
-- Owner item 174 — three plaintext secrets.
--
-- document_shares (20260706_content_and_ops.sql) is the only one of the
-- three that is actually live: POST /api/v1/share/[token]/verify reads it
-- (service-role) and compared the stored `passcode` column in plaintext.
-- Nothing ever inserted a row though — useContractsState.generateShareLink
-- built a Math.random() token + 6-digit code in React state only, so every
-- link it produced 404'd at verify. This migration adds hashed columns; the
-- application code (shareService.ts / the rewritten POST /api/v1/share and
-- verify routes) is what stops writing/reading the plaintext ones.
--
-- `case_share_tokens` and `team_invitations` are NOT touched here — grepping
-- src for both names turns up no writer and no reader anywhere in the
-- application. Hashing a plaintext column nobody ever populates or reads
-- would be theatre, not a fix; that dead schema is recorded in the owner
-- report instead (owner item 174, ownerItemStatus.remainsAr).
--
-- Idempotent: safe to re-run. Existing rows are NOT destroyed or rewritten
-- destructively — the old `token`/`passcode` columns stay, and the backfill
-- below only ever fills the new hash columns, never touches the old ones.

create extension if not exists pgcrypto;

alter table public.document_shares
  add column if not exists token_hash    text,
  add column if not exists passcode_hash text,
  add column if not exists document_path text;

-- New rows never carry a plaintext token from here on (the app writes NULL
-- into `token` going forward) — the NOT NULL from 20260706 has to go for
-- that to be possible. Multiple NULLs are fine under the existing UNIQUE
-- constraint (NULLs are never equal to each other for uniqueness purposes).
alter table public.document_shares
  alter column token drop not null;

-- The lookup index the verify route needs (`where token_hash = ...`) IS this
-- unique index — a second plain index alongside it would be redundant.
create unique index if not exists document_shares_token_hash_key
  on public.document_shares (token_hash);

-- Backfill hashes for whatever plaintext survives on existing rows, so a
-- share link minted before this migration keeps verifying by hash instead of
-- breaking. sha256() is a PostgreSQL core function (bytea in/out, available
-- since PG11) — used instead of pgcrypto's digest() so the backfill does not
-- depend on pgcrypto's functions resolving on whatever search_path this
-- migration runs under (on Supabase pgcrypto commonly lives in the
-- `extensions` schema, not `public`). Application code hashes the same way:
-- sha256Hex() in shareSecrets.ts is createHash('sha256').update(value,'utf8')
-- .digest('hex') — convert_to(value,'UTF8') below feeds sha256() the same
-- UTF-8 bytes.
update public.document_shares
   set token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
 where token is not null
   and token_hash is null;

update public.document_shares
   set passcode_hash = encode(sha256(convert_to(passcode, 'UTF8')), 'hex')
 where passcode is not null
   and passcode_hash is null;

-- RLS is unchanged — document_shares_select_own / document_shares_owner_write
-- / document_shares_admin_all (20260706) already say who may read/write a
-- share row, and the verify path stays service-role (no public select policy
-- is added here, on purpose: passcode verification must not be doable by a
-- plain RLS-scoped read).
