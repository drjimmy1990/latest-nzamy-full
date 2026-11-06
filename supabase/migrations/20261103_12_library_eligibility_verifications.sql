-- =============================================================================
-- Migration: 20261103_12_library_eligibility_verifications.sql
-- A staff-verified library eligibility flag (owner q375).
-- Owner-free wave, S1 Task 18. Safe to re-run. One transaction. A NEW table:
-- no existing table's RLS or grants change.
-- =============================================================================
--
-- WHY
--   The owner (q375): a micro business, an NGO or a service provider may buy
--   the library only when its eligibility is verified — it has a legal
--   department, or it works with a lawyer on the platform. The flag users can
--   set themselves (corporate_profiles.has_legal_dept: authenticated holds
--   UPDATE on it, 20260922_03:326,366) cannot carry that decision. This table
--   can: only staff write it, through the service role (S1 Task 20's admin
--   card), and only the server reads it (S1 Task 19's sale gate).
--
-- WHAT THIS FILE CREATES
--   public.library_eligibility_verifications — one row per verified account:
--     user_id          the account (cascade: a deleted account takes its row)
--     basis            'legal_department' | 'linked_lawyer'
--     linked_lawyer_id the lawyer, required when basis = 'linked_lawyer'
--     evidence_note    what staff checked, 5..1000 characters
--     verified_by / verified_at
--     revoked_at / revoked_by / revoke_note — a revoked row is kept (history)
--   RLS on; every privilege revoked from public, anon and authenticated; all
--   to service_role. There are NO policies, on purpose: RLS with no policy
--   denies every session role, and service_role bypasses RLS. A user cannot
--   read even his own row (the sale gate answers him in its own words).
--
--   ONE CHANGE FROM S1 Task 18's text: linked_lawyer_id is ON DELETE CASCADE,
--   not SET NULL. With SET NULL, deleting the lawyer's auth user would set the
--   column to null on a 'linked_lawyer' row, the check
--   library_eligibility_linked_lawyer would refuse it, and the lawyer's
--   account could not be deleted at all. With CASCADE the verification that
--   rested on that lawyer goes with him — the account is simply "not
--   verified" again (the staff audit log keeps the history).
--
-- RUN ORDER — BEFORE the deploy. No deployed code reads the table. The new
--   code survives the other order too: a missing table means "not verified",
--   which is today's behaviour (S1 Task 19).
--
-- ROLLBACK — `drop table public.library_eligibility_verifications;`
--   (every account is "not verified" again; no other object depends on it).
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. precondition ──────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('auth.users') is null then
    raise exception '20261103_12: auth.users is missing — this is not a Supabase database';
  end if;
end $$;

-- ── 1. the table ─────────────────────────────────────────────────────────────
create table if not exists public.library_eligibility_verifications (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  basis            text not null check (basis in ('legal_department', 'linked_lawyer')),
  linked_lawyer_id uuid references auth.users(id) on delete cascade,
  evidence_note    text not null check (length(btrim(evidence_note)) between 5 and 1000),
  verified_by      uuid not null,
  verified_at      timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid,
  revoke_note      text check (revoke_note is null or length(revoke_note) <= 1000),
  constraint library_eligibility_linked_lawyer check (basis <> 'linked_lawyer' or linked_lawyer_id is not null)
);

create index if not exists library_eligibility_verifications_linked_lawyer
  on public.library_eligibility_verifications (linked_lawyer_id) where linked_lawyer_id is not null;

comment on table public.library_eligibility_verifications is
  'Owner q375 (20261103_12): staff-verified library eligibility of a micro business, NGO or service provider — basis legal_department or linked_lawyer, with the evidence staff checked. Written by staff only (service role), so users cannot set it — unlike corporate_profiles.has_legal_dept, which users can write (20260922_03:326,366). A revoked row is kept. Service role only: RLS on, no policies, no anon/authenticated grant.';

-- ── 2. access: service role only ─────────────────────────────────────────────
alter table public.library_eligibility_verifications enable row level security;
revoke all on public.library_eligibility_verifications from public, anon, authenticated;
grant all on public.library_eligibility_verifications to service_role;

-- ── 3. verify (raises on a failure) ──────────────────────────────────────────
do $$
declare t constant text := 'public.library_eligibility_verifications';
begin
  if to_regclass(t) is null then
    raise exception '20261103_12 verify: % is missing', t;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = to_regclass(t)) then
    raise exception '20261103_12 verify: RLS is off on %', t;
  end if;
  if exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'library_eligibility_verifications') then
    raise exception '20261103_12 verify: % has a policy — it must have none (service role only)', t;
  end if;
  if has_table_privilege('anon', t, 'SELECT') or has_table_privilege('authenticated', t, 'SELECT')
     or has_table_privilege('anon', t, 'INSERT') or has_table_privilege('authenticated', t, 'INSERT')
     or has_table_privilege('authenticated', t, 'UPDATE') or has_table_privilege('authenticated', t, 'DELETE') then
    raise exception '20261103_12 verify: a session role holds a privilege on %', t;
  end if;
  if not (has_table_privilege('service_role', t, 'SELECT') and has_table_privilege('service_role', t, 'INSERT')
          and has_table_privilege('service_role', t, 'UPDATE')) then
    raise exception '20261103_12 verify: service_role cannot read and write %', t;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- ── SELECT check (the editor shows this; ok must read true) ─────────────────
select
  to_regclass('public.library_eligibility_verifications') is not null                                   as table_exists,
  coalesce((select c.relrowsecurity from pg_class c
             where c.oid = to_regclass('public.library_eligibility_verifications')), false)              as rls_on,
  not has_table_privilege('authenticated', 'public.library_eligibility_verifications', 'INSERT')         as users_cannot_write,
  not has_table_privilege('authenticated', 'public.library_eligibility_verifications', 'SELECT')
    and not has_table_privilege('anon', 'public.library_eligibility_verifications', 'SELECT')            as users_cannot_read,
  (select count(*) from public.library_eligibility_verifications where revoked_at is null)              as verified_accounts,
  coalesce((select c.relrowsecurity from pg_class c
             where c.oid = to_regclass('public.library_eligibility_verifications')), false)
    and not has_table_privilege('authenticated', 'public.library_eligibility_verifications', 'INSERT')
    and not has_table_privilege('authenticated', 'public.library_eligibility_verifications', 'SELECT')
    and not has_table_privilege('anon', 'public.library_eligibility_verifications', 'SELECT')           as ok;
