-- =============================================================================
-- Migration: 20261209_60_l19_office_plan_level.sql   (batch l19 «office»)
-- =============================================================================
-- PURPOSE
--
--   Owner ق٢٦-٥ (package 2026-11-26): a law firm's tools come in two steps —
--   «مكتب محاماة» (firm-basic, 9,900): team, cases, finance, tasks …; «شركة
--   محاماة» (firm-enterprise, 14,900): departments, branches, chinese walls,
--   governance, HR, client portal, health check, secondment. The sidebar and
--   the page guard must tell the two apart for EVERY member of a firm, and a
--   member's own subscriptions say nothing about his firm's plan (RLS keeps
--   the owner's rows away from him). So the database answers:
--
--     public.office_plan_level(p_user) → text
--       null          not a professional account (client, company, staff,
--                     admin, a demo account, nobody) — nothing is locked
--       'none'        office_features_locked(p_user) is true (the free side)
--       'office'      «إدارة المكتب»: lawyer-pro / lawyer-bundle, a founder
--                     seat, firm-basic and the older firm rows, or an active
--                     membership of a firm that holds one of them
--       'enterprise'  firm-enterprise of his own, or an active membership of
--                     a firm whose owner (or firm entity) holds it
--     public.my_office_plan_level() → the same for auth.uid() (the one a
--       session may call).
--
--   ONE source of truth: 'none' is exactly office_features_locked() (20261206_70
--   — the function the API gate, the storage quota and the case/client caps
--   read). This file creates no new rule for "has an office plan"; it only
--   adds the enterprise step on top. Nothing existing is re-created.
--
-- DATA: none changed (functions only).
-- ORDER vs deploy: any. The app reads my_office_plan_level() and, while it is
--   missing (42883 / PGRST202), falls back to my_office_features_locked() —
--   then the firm's enterprise rows open for every paid firm, as before.
--
-- RUN (self-hosted, as supabase_admin):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/migrations/20261209_60_l19_office_plan_level.sql
--   Expect: NOTICE  l19_office verify: OK …  and a row with `t`.
--   Then the `-- >>> verify:l19_office` block of supabase/migrations/_verify.sql.
--
-- ROLLBACK:
--   drop function if exists public.my_office_plan_level(), public.office_plan_level(uuid),
--     public.office_enterprise_plan_ids();
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.office_features_locked(uuid)') is null
     or to_regprocedure('public.office_plan_entitled(uuid)') is null then
    raise exception '20261209_60: run 20261206_70_roles_office_plan.sql first (office_features_locked)';
  end if;
end
$pre$;

create or replace function public.office_enterprise_plan_ids()
returns text[]
language sql
immutable
set search_path = ''
as $fn$
  select array['firm-enterprise']::text[];
$fn$;

comment on function public.office_enterprise_plan_ids() is
  'ق٢٦-٥ (20261209_60): the plan ids that are the firm''s top step «شركة المحاماة» (firm-enterprise). An admin «enterprise» grant to a firm resolves to this row. A subset of office_plan_ids().';

create or replace function public.office_plan_level(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_profile jsonb;
  v_type    text;
  v_hit     boolean := false;
  v_ent     text[] := public.office_enterprise_plan_ids();
begin
  if p_user is null then
    return null;
  end if;
  -- the free side: THE rule of 20261206_70, nothing re-decided here
  if public.office_features_locked(p_user) then
    return 'none';
  end if;
  -- not locked: a non-professional / admin / demo account (null), or entitled
  select pg_catalog.to_jsonb(p) into v_profile from public.profiles p where p.id = p_user;
  if v_profile is null or coalesce((v_profile ->> 'is_demo')::boolean, false) then
    return null;
  end if;
  v_type := v_profile ->> 'user_type';
  if v_type = 'admin' then
    return null;
  end if;
  if not public.office_plan_entitled(p_user) then
    return null;   -- a client, a company, staff … (office_features_locked said false)
  end if;
  if to_regclass('public.subscriptions') is not null then
    -- his own enterprise plan
    execute 'select exists (select 1 from public.subscriptions s
                             where s.user_id = $1 and s.status = ''active''
                               and s.plan_id = any ($2)
                               and (s.current_period_end is null or s.current_period_end > pg_catalog.now()))'
      into v_hit using p_user, v_ent;
    if v_hit then
      return 'enterprise';
    end if;
    -- the enterprise plan of a firm he is an active member of (owner or entity)
    execute 'select exists (
               select 1
                 from public.firm_members m
                 join public.firm_profiles fp on fp.id = m.firm_id
                where m.user_id = $1 and m.status = ''active''
                  and exists (select 1 from public.subscriptions s
                               where (s.user_id = fp.owner_user_id
                                      or (s.entity_type = ''firm'' and s.entity_id = fp.id))
                                 and s.status = ''active''
                                 and s.plan_id = any ($2)
                                 and (s.current_period_end is null or s.current_period_end > pg_catalog.now())))'
      into v_hit using p_user, v_ent;
    if v_hit then
      return 'enterprise';
    end if;
    -- a firm OWNER whose firm entity holds the enterprise plan
    execute 'select exists (
               select 1
                 from public.firm_profiles fp
                 join public.subscriptions s on s.entity_type = ''firm'' and s.entity_id = fp.id
                where fp.owner_user_id = $1
                  and s.status = ''active''
                  and s.plan_id = any ($2)
                  and (s.current_period_end is null or s.current_period_end > pg_catalog.now()))'
      into v_hit using p_user, v_ent;
    if v_hit then
      return 'enterprise';
    end if;
  end if;
  return 'office';
end
$fn$;

comment on function public.office_plan_level(uuid) is
  'ق٢٦-٥ (20261209_60): null for a non-professional / admin / demo account; ''none'' exactly when office_features_locked(p_user) (the free side, 20261206_70); ''enterprise'' for firm-enterprise of his own or of a firm he is an active member / the owner of; else ''office''. Service role only.';

create or replace function public.my_office_plan_level()
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select public.office_plan_level(auth.uid());
$fn$;

comment on function public.my_office_plan_level() is
  'ق٢٦-٥ (20261209_60): office_plan_level(auth.uid()) — the sidebar and the page guard of the office tools. The caller learns only his own answer.';

do $gr$
declare
  fn text;
begin
  foreach fn in array array[
    'public.office_enterprise_plan_ids()',
    'public.office_plan_level(uuid)',
    'public.my_office_plan_level()'] loop
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.office_enterprise_plan_ids() to service_role;
    grant execute on function public.office_plan_level(uuid) to service_role;
    grant execute on function public.my_office_plan_level() to service_role;
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    grant execute on function public.my_office_plan_level() to authenticated;
  end if;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  p record;
begin
  for p in select x.sig from (values ('public.office_plan_level(uuid)'), ('public.my_office_plan_level()')) x(sig) loop
    if not coalesce((select pr.prosecdef and pr.proconfig @> array['search_path=""']
                       from pg_catalog.pg_proc pr where pr.oid = to_regprocedure(p.sig)), false) then
      missing := missing || ' ' || p.sig || ' is not SECURITY DEFINER with an empty search_path;';
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and (has_function_privilege('anon', 'public.my_office_plan_level()', 'EXECUTE')
          or has_function_privilege('anon', 'public.office_plan_level(uuid)', 'EXECUTE')) then
    missing := missing || ' anon may run the office level functions;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (has_function_privilege('authenticated', 'public.office_plan_level(uuid)', 'EXECUTE')
          or not has_function_privilege('authenticated', 'public.my_office_plan_level()', 'EXECUTE')) then
    missing := missing || ' authenticated grants are wrong (only my_office_plan_level());';
  end if;
  if not (public.office_enterprise_plan_ids() <@ public.office_plan_ids()) then
    missing := missing || ' an enterprise plan id is not an office plan id;';
  end if;
  if public.office_plan_level(null) is not null then
    missing := missing || ' office_plan_level(null) is not null;';
  end if;
  if missing <> '' then
    raise exception 'l19_office verify FAILED:%', missing;
  end if;
  raise notice 'l19_office verify: OK — office_plan_level / my_office_plan_level (none = office_features_locked, office, enterprise = %)',
    public.office_enterprise_plan_ids();
end
$verify$;

notify pgrst, 'reload schema';

commit;

select '20261209_60 l19 office: office_plan_level (none / office / enterprise) over office_features_locked (ق٢٦-٥)' as migration, true as ok;
