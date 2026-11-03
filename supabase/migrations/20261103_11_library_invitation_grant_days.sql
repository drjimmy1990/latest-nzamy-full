-- =============================================================================
-- Migration: 20261103_11_library_invitation_grant_days.sql
-- Library invite codes with their own number of days (owner q378).
-- Owner-free wave, S1 Task 16. Safe to re-run. One transaction.
-- =============================================================================
--
-- WHY
--   Every library invite code gave the library for 30 days (owner answers
--   ٢٠١–٢٠٣; the constant was in the redeem route). The owner (q378): a code
--   may carry its own length and its own number of seats. Seats already
--   exist (library.invitations.max_uses); the length did not.
--
-- WHAT THIS FILE DOES
--   1. library.invitations.grant_days int, nullable:
--        null     = the default 30 days (owner ٢٠١–٢٠٣) — every code made
--                   before this file, and any code made without a length;
--        a number = this code's own length, 1..3660 days (the bound of
--                   grantLibraryAccess, src/lib/libraryAccessServer.ts, and of
--                   library_grant_access).
--      The check library_invitations_grant_days_check is dropped and re-added,
--      so a re-run works.
--   2. Nothing else. No grant and no policy changes: the privileges and the
--      RLS policies of library.invitations stay exactly as they are (the
--      Docker test compares them before and after).
--
-- RUN ORDER — BEFORE the deploy. The code already deployed never names the
--   column, so nothing it does changes. The new code survives the other
--   order too: redeem and the admin list re-read without grant_days on 42703
--   (a code then gives 30 days), and the admin create sends grant_days only
--   when the admin typed a length (answering 503 with this file's name if the
--   column is missing).
--
-- ROLLBACK — `alter table library.invitations drop column grant_days;`
--   (codes made with their own length then give 30 days again).
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. precondition ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('library.invitations') is null then
    raise exception '20261103_11: library.invitations is missing — run 20260626_legal_library_schema.sql first';
  end if;
end $$;

-- ── 1. the column and its bound ──────────────────────────────────────────────
alter table library.invitations add column if not exists grant_days int;
alter table library.invitations drop constraint if exists library_invitations_grant_days_check;
alter table library.invitations add constraint library_invitations_grant_days_check
  check (grant_days is null or grant_days between 1 and 3660);
comment on column library.invitations.grant_days is
  'Days of library access this code grants. null = the default 30 days (owner ٢٠١–٢٠٣); a number = this code''s own length, 1..3660 (owner q378, 20261103_11).';

-- ── 2. verify (raises on a failure) ──────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'library' and table_name = 'invitations'
                    and column_name = 'grant_days' and data_type = 'integer' and is_nullable = 'YES') then
    raise exception '20261103_11 verify: library.invitations.grant_days is missing or not a nullable integer';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'library.invitations'::regclass
                    and conname = 'library_invitations_grant_days_check') then
    raise exception '20261103_11 verify: the grant_days check is missing';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- ── SELECT check (the editor shows this; ok must read true) ─────────────────
-- codes_readable_by_session_roles is NOT part of ok: it reports a state this
-- file does not change (20260626 gives anon / authenticated SELECT and a
-- public read policy on library.invitations). See the run notes.
select
  exists (select 1 from information_schema.columns
           where table_schema = 'library' and table_name = 'invitations' and column_name = 'grant_days')  as grant_days_column,
  exists (select 1 from pg_constraint
           where conrelid = 'library.invitations'::regclass
             and conname = 'library_invitations_grant_days_check')                                         as grant_days_check,
  (select count(*) from library.invitations where grant_days is not null)                                  as codes_with_own_days,
  (has_table_privilege('anon', 'library.invitations', 'SELECT')
     or has_table_privilege('authenticated', 'library.invitations', 'SELECT'))                             as codes_readable_by_session_roles,
  (exists (select 1 from information_schema.columns
            where table_schema = 'library' and table_name = 'invitations' and column_name = 'grant_days')
   and exists (select 1 from pg_constraint
                where conrelid = 'library.invitations'::regclass
                  and conname = 'library_invitations_grant_days_check'))                                   as ok;
