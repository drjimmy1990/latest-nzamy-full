-- =============================================================================
-- Migration: 20261109_13_admin_audit_events_no_guest_grant.sql
-- =============================================================================
-- WHY (security review 2026-11-08, X-3 — hygiene)
--   20261019_30_platform_staff_roles.sql grants SELECT on
--   public.admin_audit_events to anon as well as authenticated. Its only
--   SELECT policy is TO authenticated, so a guest reads 0 rows today, but a
--   guest has no reason to hold any privilege on the audit log: one wrong
--   policy later would expose it.
--
-- WHAT IT DOES (idempotent)
--   Revokes every privilege on public.admin_audit_events from anon (table
--   level and column level). authenticated keeps SELECT (the activity feed,
--   src/app/api/v1/lawyer/activity/route.ts, reads its own rows through RLS
--   with the signed-in client) and service_role keeps ALL (audit writes,
--   src/lib/auth/adminAudit.ts). No code reads the table as a guest.
--   A guest query now gets "permission denied" instead of 0 rows.
--
-- RE-RUN WARNING
--   Re-running 20261019_30 grants the guest SELECT back; run this file after it.
--
-- RUN ORDER — ANY TIME (independent of the deploy). Needs 20261019_30.
--
-- ROLLBACK
--   grant select on public.admin_audit_events to anon;
-- =============================================================================

begin;

do $$
declare
  cols text;
begin
  if to_regclass('public.admin_audit_events') is null then
    raise notice '20261109_13: public.admin_audit_events does not exist here — nothing to do';
    return;
  end if;
  revoke all on table public.admin_audit_events from anon;
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute
   where attrelid = 'public.admin_audit_events'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all (%s) on table public.admin_audit_events from anon', cols);

  if has_table_privilege('anon', 'public.admin_audit_events', 'SELECT')
     or has_any_column_privilege('anon', 'public.admin_audit_events', 'SELECT') then
    raise exception '20261109_13 verify: anon can still read public.admin_audit_events (through PUBLIC?)';
  end if;
  if not has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT') then
    raise exception '20261109_13 verify: authenticated lost SELECT on public.admin_audit_events (the activity feed would read nothing)';
  end if;
  raise notice '20261109_13 verify: OK — anon holds no privilege on admin_audit_events; authenticated keeps SELECT';
end $$;

commit;

-- ── check (the SQL editor shows only this last result) ───────────────────────
select 'anon cannot read admin_audit_events' as check,
       case when to_regclass('public.admin_audit_events') is null then true
            else not (has_table_privilege('anon', 'public.admin_audit_events', 'SELECT')
                      or has_any_column_privilege('anon', 'public.admin_audit_events', 'SELECT')) end as ok
union all
select 'authenticated keeps SELECT on admin_audit_events (activity feed)',
       case when to_regclass('public.admin_audit_events') is null then true
            else has_table_privilege('authenticated', 'public.admin_audit_events', 'SELECT') end;
