-- =============================================================================
-- Migration: 20261019_21_consultant_court_write_guard.sql
-- =============================================================================
-- PURPOSE (owner answers ١٧٣ / ٢١٩; Art. 18 of نظام المحاماة)
--   A legal consultant («مستشار قانوني», lawyer_profiles.practice_kind =
--   'consultant', 20261019_20) does not plead or manage hearings. The court
--   write routes refuse him (src/lib/auth/assertCourtPractice.ts, Task 2.3),
--   but the routes are not the only door: `authenticated` holds table-level
--   GRANT ALL on public.hearings, public.case_stages and public.deadlines (the
--   self-host restore — schema dump 2026-10-10), and their RLS write policies
--   check ownership only. So a consultant could write all three straight
--   through PostgREST (/rest/v1/...) with his own session token. This file
--   makes the database refuse those rows.
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless lawyer_profiles.practice_kind exists (run
--      20261019_20 first), the three tables carry owner_user_id,
--      deadlines.kind exists, and public.is_admin() exists.
--   2. public.refuse_consultant_court_rows() — SECURITY DEFINER (it reads
--      lawyer_profiles and profiles as its owner, so it needs no grant and no
--      RLS visibility), search_path ''. EXECUTE revoked from PUBLIC, anon,
--      authenticated (a trigger function is not checked for EXECUTE when the
--      trigger fires).
--   3. trg_00_refuse_consultant_court_rows — BEFORE INSERT OR UPDATE FOR EACH
--      ROW on each of the three tables; `trg_00_` sorts it before the
--      *_updated_at triggers, so it fires first.
--   The rule, for each written row:
--     * WHO IS WRITING. Inside a SECURITY DEFINER function current_user is
--       always the owner, so the caller is read from the `role` setting —
--       PostgREST sets it per request (anon / authenticated / service_role) and
--       a definer call does not change it — or, when no SET ROLE is in force,
--       from session_user. postgres, service_role, supabase_admin and
--       supabase_auth_admin pass: the Next routes on the service client, the
--       deadlines cron, the SQL editor, backfills, and GoTrue (it connects as
--       supabase_auth_admin with no SET ROLE; deleting an account cascades
--       through profiles → firm_profiles into these tables). EVERY other role
--       is guarded (fail-closed, as in 20261018_04): authenticated, anon, any
--       other login.
--     * A FOREIGN-KEY CASCADE passes, from any writer — both must hold:
--         - it runs inside a trigger (pg_trigger_depth() > 1): the ON DELETE
--           SET NULL action is a trigger on the deleted row's table, and its
--           UPDATE fires this one a level deeper. A direct UPDATE from a
--           session is depth 1 and is judged like any other write, so a
--           consultant cannot null a colleague's pointers through REST;
--         - it is cascade-shaped: every column whose value changes (OLD vs
--           NEW, updated_at ignored — the *_updated_at triggers fire after
--           this one) is one of the table's ON DELETE SET NULL pointers, and
--           each goes from a value to NULL. An UPDATE that changes nothing is
--           not cascade-shaped. This half covers a write some other trigger
--           might issue (none writes these tables today).
--       Nulling a pointer because its row was deleted is not court activity.
--       The pointers are the trigger's arguments (TG_ARGV), so the verify
--       below and _verify.sql compare the DEPLOYED list with the table's
--       ON DELETE SET NULL foreign keys and raise on any difference (a new
--       SET NULL FK left out would make its cascade fail closed). As on live
--       (20260903_phase1 / 20260904_phase5):
--         hearings     stage_id, firm_id
--         case_stages  firm_id, owner_user_id
--         deadlines    firm_id, stage_id, hearing_id, rule_id
--       (case_request_id, contract_id and the hearings / deadlines
--       owner_user_id are ON DELETE CASCADE: deletes, never guarded.)
--     * deadlines with kind = 'contract' pass — a contract obligation's radar
--       date (src/app/api/v1/lawyer/contracts/_obligations.ts writes them
--       through the session; a consultant manages contracts). On UPDATE the
--       row must be 'contract' before AND after, so no deadline crosses the
--       line either way.
--     * Refused (42501, the CONSULTANT_BLOCKED_MESSAGE of
--       src/lib/auth/practiceKind.ts) when the CALLER (auth.uid()) or the
--       row's owner (NEW.owner_user_id) has practice_kind = 'consultant' —
--       unless the caller is a platform admin (public.is_admin(): the route's
--       isPlatformAdmin, profiles.user_type = 'admin').
--         - the caller: what the route checks. The UPDATE policies admit any
--           active member of the row's firm, so an owner-only rule would let a
--           consultant firm member edit an advocate colleague's hearing.
--         - the owner: the brief's rule. On INSERT the RLS check makes owner =
--           caller; on UPDATE it also refuses an advocate colleague editing a
--           consultant-owned court row.
--       No lawyer_profiles row (a firm account) or any other practice_kind
--       passes.
--   4. Raising verify; then `notify pgrst` after commit.
--
-- WHAT IT DOES NOT DO
--   * DELETE is not guarded: a consultant may still delete his own old court
--     rows (the delete policies are owner-only). The ON DELETE SET NULL
--     updates a delete cascades onto OTHER court rows — a hearing or deadline
--     that pointed at a deleted stage, a deadline that pointed at a deleted
--     hearing, any row of a deleted firm — are cascade-shaped and pass, whoever
--     deletes and whoever owns the nulled row.
--   * hearings are refused whatever their kind (an appointment too), as the
--     hearings route refuses every POST.
--   * A SECURITY DEFINER function called FROM a session keeps the session's
--     `role` setting, so its writes are guarded like the session's own. No
--     function in the repo or the 2026-10-10 dump writes these tables today.
--   * It does not move or delete court rows a consultant already owns.
--
-- DEPLOY ORDER — after 20261019_20 (it refuses to run before). EITHER ORDER
--   for the code: the routes already refuse a consultant first. An advocate's
--   or a firm account's writes to rows it owns pass, contract-obligation
--   deadlines pass for everyone, deletes and their SET NULL cascades pass, and
--   an account deletion (GoTrue, supabase_auth_admin) passes.
--   One route-visible change: an advocate's UPDATE of a CONSULTANT-OWNED court
--   row (a firm colleague's) now fails with 42501 — the route lets the
--   advocate through and the database refuses the row (case-stages PATCH
--   answers 500 with the Art. 18 text; deadlines PATCH maps it through
--   dbErrorResponse).
--
-- BEFORE APPLYING — writers outside this repo
--   Anything that writes these tables with a USER's session (a native app, an
--   n8n workflow using a user JWT) is guarded the same way; one using the
--   service-role key or a postgres connection is not.
--
-- ROLLBACK
--   drop trigger if exists trg_00_refuse_consultant_court_rows on public.hearings;
--   drop trigger if exists trg_00_refuse_consultant_court_rows on public.case_stages;
--   drop trigger if exists trg_00_refuse_consultant_court_rows on public.deadlines;
--   drop function if exists public.refuse_consultant_court_rows();
-- =============================================================================

begin;

-- ── 1. Prerequisites ─────────────────────────────────────────────────────────
do $$
declare
  tbl text;
begin
  if to_regclass('public.lawyer_profiles') is null
     or not exists (select 1 from pg_attribute
                     where attrelid = 'public.lawyer_profiles'::regclass
                       and attname = 'practice_kind' and not attisdropped) then
    raise exception '20261019_21: lawyer_profiles.practice_kind does not exist — run 20261019_20_lawyer_practice_kind.sql first';
  end if;
  foreach tbl in array array['public.hearings', 'public.case_stages', 'public.deadlines'] loop
    if to_regclass(tbl) is null then
      raise exception '20261019_21: % does not exist — run 20260903_phase1_case_tables.sql and 20260904_phase5_deadline_radar.sql first', tbl;
    end if;
    if not exists (select 1 from pg_attribute
                    where attrelid = to_regclass(tbl) and attname = 'owner_user_id' and not attisdropped) then
      raise exception '20261019_21: %.owner_user_id does not exist', tbl;
    end if;
  end loop;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.deadlines'::regclass and attname = 'kind' and not attisdropped) then
    raise exception '20261019_21: deadlines.kind does not exist — the contract exemption has nothing to read';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '20261019_21: public.is_admin() does not exist — the admin pass has nothing to call';
  end if;
end $$;

-- ── 2. The guard ─────────────────────────────────────────────────────────────
create or replace function public.refuse_consultant_court_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_role     text := pg_catalog.current_setting('role', true);
  v_caller   text;
  v_set_null text[];
  v_old      jsonb;
  v_new      jsonb;
  v_cascade  boolean;
begin
  -- current_user is this function's owner (SECURITY DEFINER); the writer is
  -- the session's SET ROLE (PostgREST: anon / authenticated / service_role),
  -- or its login role when none is set (GoTrue: supabase_auth_admin).
  v_caller := case when v_role is null or v_role in ('', 'none') then session_user::text else v_role end;
  if v_caller in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin') then
    return new;
  end if;

  -- a foreign-key cascade: inside a trigger (the SET NULL action), and
  -- cascade-shaped — every changed column is one of this table's ON DELETE
  -- SET NULL pointers (the trigger's arguments), going from a value to NULL
  -- (a column that changed and is NULL now had a value before)
  if tg_op = 'UPDATE' and pg_catalog.pg_trigger_depth() > 1 then
    v_set_null := tg_argv;
    v_old := pg_catalog.to_jsonb(old) - 'updated_at';
    v_new := pg_catalog.to_jsonb(new) - 'updated_at';
    select pg_catalog.bool_and(e.key = any (v_set_null) and e.value = 'null'::jsonb)
      into v_cascade
      from pg_catalog.jsonb_each(v_new) e
     where e.value is distinct from (v_old -> e.key);
    if coalesce(v_cascade, false) then   -- NULL: nothing changed
      return new;
    end if;
  end if;

  -- a contract obligation's deadline, before and after
  if tg_table_name = 'deadlines' then
    if new.kind = 'contract' and (tg_op = 'INSERT' or old.kind = 'contract') then
      return new;
    end if;
  end if;

  if not exists (select 1 from public.lawyer_profiles lp
                  where lp.user_id in (auth.uid(), new.owner_user_id)
                    and lp.practice_kind = 'consultant') then
    return new;
  end if;
  if public.is_admin() then
    return new;
  end if;

  raise exception using
    errcode = '42501',
    message = 'هذه الأداة للمحامي المرخّص بالترافع؛ المستشار القانوني لا يترافع ولا يدير الجلسات (المادة ١٨ من نظام المحاماة).';
end
$fn$;

comment on function public.refuse_consultant_court_rows() is
  'Art. 18 (20261019_21): BEFORE INSERT OR UPDATE on hearings / case_stages / deadlines — a writer other than postgres / service_role / supabase_admin / supabase_auth_admin gets 42501 when the caller or the row owner is a consultant (lawyer_profiles.practice_kind) and the caller is not an admin; foreign-key cascades (inside a trigger, only the ON DELETE SET NULL pointers named in the trigger arguments changed, each to NULL) and deadlines with kind = contract (before and after) pass.';

revoke all on function public.refuse_consultant_court_rows() from public, anon, authenticated;

-- The arguments are each table's ON DELETE SET NULL pointers (the cascade
-- exemption); the verify checks them against pg_constraint.
drop trigger if exists trg_00_refuse_consultant_court_rows on public.hearings;
create trigger trg_00_refuse_consultant_court_rows
  before insert or update on public.hearings
  for each row execute function public.refuse_consultant_court_rows('stage_id', 'firm_id');

drop trigger if exists trg_00_refuse_consultant_court_rows on public.case_stages;
create trigger trg_00_refuse_consultant_court_rows
  before insert or update on public.case_stages
  for each row execute function public.refuse_consultant_court_rows('firm_id', 'owner_user_id');

drop trigger if exists trg_00_refuse_consultant_court_rows on public.deadlines;
create trigger trg_00_refuse_consultant_court_rows
  before insert or update on public.deadlines
  for each row execute function public.refuse_consultant_court_rows('firm_id', 'stage_id', 'hearing_id', 'rule_id');

comment on trigger trg_00_refuse_consultant_court_rows on public.hearings is
  'ART. 18 GUARD since 20261019_21 — read by _verify.sql.';
comment on trigger trg_00_refuse_consultant_court_rows on public.case_stages is
  'ART. 18 GUARD since 20261019_21 — read by _verify.sql.';
comment on trigger trg_00_refuse_consultant_court_rows on public.deadlines is
  'ART. 18 GUARD since 20261019_21 — read by _verify.sql.';

-- ── 3. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  fn      constant text := 'public.refuse_consultant_court_rows()';
  tbl     text;
  r       text;
  cfg     text[];
  definer boolean;
  owner   text;
  first_before text;
  args    text[];
  fks     text[];
  missing text := '';
begin
  -- the function
  select p.proconfig, p.prosecdef, pg_get_userbyid(p.proowner)
    into cfg, definer, owner
    from pg_proc p where p.oid = to_regprocedure(fn);
  if not coalesce(definer, false) then
    missing := missing || ' refuse_consultant_court_rows is missing or not SECURITY DEFINER;';
  end if;
  if cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || format(' refuse_consultant_court_rows proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE refuse_consultant_court_rows;', r);
    end if;
  end loop;
  -- the definer must read practice_kind past RLS, or a consultant reads as
  -- "no row" and passes
  if owner is not null then
    if not has_column_privilege(owner, 'public.lawyer_profiles', 'practice_kind', 'SELECT')
       or not has_column_privilege(owner, 'public.lawyer_profiles', 'user_id', 'SELECT') then
      missing := missing || format(' the function owner %s cannot read lawyer_profiles.practice_kind;', owner);
    end if;
    if not exists (select 1 from pg_roles where rolname = owner and (rolsuper or rolbypassrls))
       and (owner <> (select pg_get_userbyid(relowner) from pg_class where oid = 'public.lawyer_profiles'::regclass)
            or (select relforcerowsecurity from pg_class where oid = 'public.lawyer_profiles'::regclass)) then
      missing := missing || format(' the function owner %s reads lawyer_profiles under RLS (not superuser / bypassrls / table owner) — consultants would pass;', owner);
    end if;
  end if;

  -- the triggers
  foreach tbl in array array['public.hearings', 'public.case_stages', 'public.deadlines'] loop
    if (select count(*) from pg_trigger t
         where t.tgrelid = tbl::regclass
           and t.tgname = 'trg_00_refuse_consultant_court_rows'
           and not t.tgisinternal
           and t.tgenabled in ('O', 'A')             -- fires in normal sessions (not D, not replica-only R)
           and (t.tgtype & 23) = 23                  -- ROW | BEFORE | INSERT | UPDATE
           and (t.tgtype & (8 | 32 | 64)) = 0        -- no DELETE / TRUNCATE / INSTEAD
           and t.tgqual is null                      -- no WHEN
           and t.tgattr = ''::int2vector             -- not UPDATE OF <columns>
           and t.tgfoid = to_regprocedure(fn)) <> 1 then
      missing := missing || format(' %s lacks an enabled trg_00_refuse_consultant_court_rows BEFORE INSERT OR UPDATE FOR EACH ROW;', tbl);
    end if;
    select t.tgname into first_before
      from pg_trigger t
     where t.tgrelid = tbl::regclass and not t.tgisinternal and (t.tgtype & 2) = 2
     order by t.tgname
     limit 1;
    if first_before is distinct from 'trg_00_refuse_consultant_court_rows' then
      missing := missing || format(' %s fires before the guard on %s;', coalesce(first_before, 'nothing'), tbl);
    end if;
    -- the cascade exemption's pointer list (the trigger arguments) = the
    -- table's ON DELETE SET NULL foreign-key columns
    select coalesce(array_agg(x order by x), '{}')
      into args
      from pg_trigger t,
           unnest(array_remove(string_to_array(encode(t.tgargs, 'escape'), '\000'), '')) x
     where t.tgrelid = tbl::regclass and t.tgname = 'trg_00_refuse_consultant_court_rows';
    select coalesce(array_agg(a.attname::text order by a.attname), '{}')
      into fks
      from pg_constraint c
      cross join lateral unnest(case when coalesce(cardinality(c.confdelsetcols), 0) = 0
                                     then c.conkey else c.confdelsetcols end) k(attnum)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.conrelid = tbl::regclass and c.contype = 'f' and c.confdeltype = 'n';
    if args is distinct from fks then
      missing := missing || format(' %s: the guard''s SET NULL pointers %s differ from the table''s ON DELETE SET NULL foreign keys %s;', tbl, args, fks);
    end if;
  end loop;

  if missing <> '' then
    raise exception '20261019_21 verify:%', missing;
  end if;
  raise notice '20261019_21 verify: OK — hearings / case_stages / deadlines refuse a consultant''s session writes (contract deadlines, foreign-key cascade nulls and admins pass; pointer lists match the SET NULL foreign keys; postgres / service_role / supabase_admin / supabase_auth_admin trusted); definer %', owner;
end $$;

commit;

notify pgrst, 'reload schema';
