-- =============================================================================
-- Migration: 20261108_30_firm_member_points_usage.sql
-- Owner answer ٤٤٤ (2026-11-08), part 2: a per-member points-consumption
-- counter on the firm finance page (/dashboard/firm/finance), visible to the
-- firm owner / managing partner only.
--
-- WHY A FUNCTION
--   points_ledger RLS admits only the caller's own rows ("own points ledger",
--   20261022_20), so the firm owner cannot read a member's debits. Summing the
--   ledger in the app through the service client would hit PostgREST's
--   db-max-rows silently (a truncated SUM is a wrong number shown as a right
--   one — the trap firm/members/workload/route.ts documents). This function
--   aggregates in SQL and returns ONLY totals: no tool, no ref, no run, no
--   e-mail — never the content of another member's work.
--
-- WHO MAY CALL IT
--   SECURITY DEFINER, but the check is inside: auth.uid() must be the firm's
--   owner (firm_profiles.owner_user_id) or an ACTIVE managing_partner member
--   of that firm. Anyone else → 42501. The app calls it with the SESSION
--   client (auth.uid() is null under the service role, and the check would
--   then have to trust a parameter).
--
-- WHAT "CONSUMED" MEANS (rulings recorded in docs/plans/2026-11-08-snippets/B2-report.md)
--   * Source: points_ledger, net = −sum(delta) over reason 'usage' (debits,
--     negative) and 'usage_refund' (AI refunds, positive). expiry,
--     refund_revoke, admin_adjustment and credit are NOT consumption.
--   * Members: firm_members.status = 'active' only. A removed / suspended /
--     invited member is not listed; their history stays in their own ledger.
--   * Window: only ledger rows since the member joined this firm
--     (coalesce(accepted_at, created_at)). Points are a per-user wallet; what
--     a lawyer spent before joining is not the firm's business.
--   * Month: the Riyadh calendar month (same day convention as ai_start_run).
--     A refund counts in the month it was written.
--
-- RUN ORDER: any time — before or after the deploy. Purely additive (one new
--   function). The new route answers { available: false } until it exists.
-- Requires: 20260616 (firm_members), 20261022_20 (points_ledger),
--   20261027_10 (the usage_refund reason; without it there are simply no
--   refund rows).
-- ROLLBACK: drop function if exists public.firm_member_points_usage(uuid);
-- Safe to re-run.
-- =============================================================================

begin;

create or replace function public.firm_member_points_usage(p_firm uuid)
returns table (
  user_id      uuid,
  display_name text,
  role         text,
  is_owner     boolean,
  joined_at    timestamptz,
  points_month bigint,
  points_total bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_month timestamptz := (date_trunc('month', now() at time zone 'Asia/Riyadh')) at time zone 'Asia/Riyadh';
begin
  if v_uid is null or p_firm is null then
    raise exception 'firm_member_points_usage: sign in' using errcode = '42501';
  end if;

  select fp.owner_user_id into v_owner from public.firm_profiles fp where fp.id = p_firm;
  if v_owner is null then
    raise exception 'firm_member_points_usage: not the firm owner or managing partner' using errcode = '42501';
  end if;

  if v_owner <> v_uid and not exists (
    select 1 from public.firm_members m
     where m.firm_id = p_firm and m.user_id = v_uid
       and m.status = 'active' and m.role = 'managing_partner') then
    raise exception 'firm_member_points_usage: not the firm owner or managing partner' using errcode = '42501';
  end if;

  return query
    select m.user_id,
           nullif(btrim(p.display_name), ''),
           m.role,
           m.user_id = v_owner,
           coalesce(m.accepted_at, m.created_at),
           coalesce(sum(-l.delta) filter (where l.created_at >= v_month), 0)::bigint,
           coalesce(sum(-l.delta), 0)::bigint
      from public.firm_members m
      left join public.profiles p on p.id = m.user_id
      left join public.points_ledger l
             on l.user_id = m.user_id
            and l.reason in ('usage', 'usage_refund')
            and l.created_at >= coalesce(m.accepted_at, m.created_at)
     where m.firm_id = p_firm
       and m.status = 'active'
     group by m.user_id, p.display_name, m.role, m.accepted_at, m.created_at
     order by (m.user_id = v_owner) desc, coalesce(m.accepted_at, m.created_at), m.user_id;
end;
$$;

comment on function public.firm_member_points_usage(uuid) is
  'Owner ٤٤٤: per active member of a firm, points consumed (ledger usage net of usage_refund, since the member joined) this Riyadh month and in total. Caller must be the firm owner or an active managing_partner (42501 otherwise). Totals only (20261108_30).';

revoke all on function public.firm_member_points_usage(uuid) from public, anon;
grant execute on function public.firm_member_points_usage(uuid) to authenticated, service_role;

-- ── verify ───────────────────────────────────────────────────────────────────
do $$
declare fn constant text := 'public.firm_member_points_usage(uuid)';
begin
  if to_regprocedure(fn) is null then
    raise exception '20261108_30 verify: % is missing', fn;
  end if;
  if has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception '20261108_30 verify: anon can EXECUTE %', fn;
  end if;
  if not has_function_privilege('authenticated', fn, 'EXECUTE') then
    raise exception '20261108_30 verify: authenticated cannot EXECUTE % — the finance card can never load', fn;
  end if;
  if not exists (select 1 from pg_proc where oid = to_regprocedure(fn) and prosecdef
                   and proconfig @> array['search_path=""']) then
    raise exception '20261108_30 verify: % must be SECURITY DEFINER with search_path = ''''', fn;
  end if;
  raise notice '20261108_30 verify: OK — firm_member_points_usage(uuid) definer, authenticated only';
end $$;

commit;
notify pgrst, 'reload schema';
