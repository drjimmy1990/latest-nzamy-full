-- =============================================================================
-- Migration: 20261206_13_activity_events_firm_insert.sql   (verify id: l16_d54)
-- =============================================================================
-- PURPOSE (batch l16, builder «secdb», gap D-54 — owner package 25 Nov §٧.٣)
--
--   The INSERT policy "activity insertable by actor" on public.activity_events
--   (20260903_phase1_case_tables.sql:449-451, never redefined) checked only
--   actor_user_id = auth.uid() or owner_user_id = auth.uid() — not firm_id,
--   while GET /api/v1/firm/activity reads a firm's feed by firm_id. A row a
--   session writes may now carry a firm_id only when the caller owns that firm
--   or is one of its ACTIVE members.
--
--   The policy is re-created under the SAME NAME (one INSERT policy, as
--   before; the SELECT policy and every other policy are untouched). Every
--   writer in src/ (recordActivity callers: lawyer hearings / tasks / deadlines /
--   ledger / case-stages, service-requests) passes the caller's own firm
--   membership (or none), so no legitimate write changes.
--
-- HOW TO RUN (any time, before or after the deploy):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261206_13_activity_events_firm_insert.sql
--   Expect: NOTICE  l16_d54 verify: OK …  and a row with `t`.
--
-- RE-RUN HAZARD: re-running 20260903_phase1_case_tables.sql restores the old
--   check — re-run this file after it (_verify.sql verify:l16_d54 fails until then).
--
-- Docker: supabase/tests/rls/activity_events_firm_insert.test.sql
--
-- ROLLBACK:
--   drop policy if exists "activity insertable by actor" on public.activity_events;
--   create policy "activity insertable by actor" on public.activity_events
--     for insert with check (actor_user_id = auth.uid() or owner_user_id = auth.uid());
-- =============================================================================

set lock_timeout = '10s';

begin;

do $pre$
begin
  if to_regclass('public.activity_events') is null then
    raise exception '20261206_13: public.activity_events is missing — run 20260903_phase1_case_tables.sql first';
  end if;
  if to_regprocedure('public.can_access_case_row(uuid, uuid)') is null then
    raise exception '20261206_13: public.can_access_case_row(uuid, uuid) is missing';
  end if;
end
$pre$;

drop policy if exists "activity insertable by actor" on public.activity_events;
create policy "activity insertable by actor" on public.activity_events
  for insert
  with check (
    (actor_user_id = auth.uid() or owner_user_id = auth.uid())
    and (
      firm_id is null
      -- an active member of that firm (SECURITY DEFINER helper, 20260910)
      or public.can_access_case_row(null, firm_id)
      -- or its owner (who may have no firm_members row)
      or exists (select 1 from public.firm_profiles fp
                  where fp.id = activity_events.firm_id and fp.owner_user_id = auth.uid())
    )
  );

-- ── Verify ───────────────────────────────────────────────────────────────────
do $verify$
declare
  q text;
begin
  select pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) into q
    from pg_catalog.pg_policy p
   where p.polrelid = 'public.activity_events'::regclass
     and p.polname = 'activity insertable by actor' and p.polcmd = 'a';
  if q is null or pg_catalog.strpos(q, 'firm_id') = 0 or pg_catalog.strpos(q, 'can_access_case_row') = 0 then
    raise exception 'l16_d54 verify: the activity_events INSERT policy has no firm check';
  end if;
  if (select count(*) from pg_catalog.pg_policy p
       where p.polrelid = 'public.activity_events'::regclass and p.polcmd in ('a', '*')) <> 1 then
    raise exception 'l16_d54 verify: activity_events must carry exactly one INSERT-capable policy';
  end if;
  raise notice 'l16_d54 verify: OK — an activity row names a firm only when the writer owns it or is its active member';
end
$verify$;

commit;

select '20261206_13 l16 D-54: activity_events INSERT checks the firm' as migration,
       exists (select 1 from pg_catalog.pg_policy p
                where p.polrelid = 'public.activity_events'::regclass
                  and p.polname = 'activity insertable by actor'
                  and pg_catalog.strpos(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), 'firm_id') > 0) as ok;
