-- =============================================================================
-- Migration: 20261019_30_platform_staff_roles.sql
-- =============================================================================
-- PURPOSE (owner answer ٢١٠, option a — an internal role matrix for Nezamy
-- staff with an audit trail)
--   Today every admin (profiles.user_type = 'admin') can do everything in the
--   admin console. This file gives each staff member one of three roles, the
--   database functions that read it, and makes the admin audit log
--   append-only, so a record of what staff did cannot be rewritten afterwards.
--   user_type = 'admin' still means "is staff"; the role says what kind.
--     super_admin  — platform leadership: every action, incl. staff and pricing
--     operations   — day-to-day work (verifications, moderation, support)
--     auditor      — reads only
--   (Which action needs which role is src/lib/auth/staffRoles.ts, Task 3.2;
--   the routes enforce it, Task 3.3.)
--
-- WHAT IT DOES (idempotent — safe to run any number of times; one transaction)
--   1. Refuses to run unless auth.users, public.profiles (user_type),
--      public.admin_audit_events (actor_id) and public.is_admin() exist.
--   2. public.platform_staff (user_id → auth.users ON DELETE CASCADE,
--      staff_role CHECK super_admin / operations / auditor, granted_by,
--      granted_at). RLS on; ONE policy — SELECT TO authenticated USING
--      public.is_admin(): every admin sees the staff list, nobody else sees a
--      row. No write policy: `revoke all` from PUBLIC / anon / authenticated
--      (table and column level), then SELECT back to authenticated only;
--      service_role ALL. Only the server (service role) assigns roles.
--   3. public.staff_role() → text: the caller's (auth.uid()) staff_role, or
--      NULL. public.is_super_admin() → boolean: staff_role() = 'super_admin',
--      never NULL. Both STABLE, SECURITY DEFINER (they read platform_staff past
--      RLS), search_path ''. EXECUTE revoked from PUBLIC and anon (live grants
--      every new function to anon by default), granted to authenticated and
--      service_role.
--   4. Backfill: every current admin gets a super_admin row
--      (`on conflict do nothing`), so no admin loses anything today; the user
--      downgrades staff afterwards. A re-run never re-promotes a downgraded
--      staffer, and gives super_admin to an admin added since without a row.
--   5. public.admin_audit_events:
--      * `actor_email text` (the actor's address at the time — survives the
--        account's deletion, when actor_id goes NULL);
--      * RLS enabled (it already is on live — re-asserted);
--      * writes revoked: `revoke all` from PUBLIC / anon / authenticated
--        (table and column level — live had GRANT ALL from the self-host
--        restore), then SELECT back to anon and authenticated (the live
--        policy "users read own audit events" — TO authenticated, own rows or
--        admin — needs it; the lawyer activity feed reads own rows with the
--        session). service_role ALL. Its id sequence: nothing for the API
--        roles, service_role ALL (every writer in the repo inserts with the
--        service role).
--   6. Append-only, enforced by triggers on public.admin_audit_append_only():
--      * trg_admin_audit_append_only — BEFORE UPDATE OR DELETE FOR EACH ROW;
--      * trg_admin_audit_no_truncate — BEFORE TRUNCATE FOR EACH STATEMENT
--        (a row trigger never sees a TRUNCATE, and service_role holds it);
--      The function is SECURITY INVOKER, so current_user is the writer:
--      PostgREST's SET ROLE (anon / authenticated / service_role) or a login
--      role. It raises 42501 unless
--        (a) current_user is postgres or supabase_admin (SQL editor,
--            maintenance — anyone who can drop the trigger anyway), or
--        (b) it is a FOREIGN-KEY CASCADE: an UPDATE inside a trigger
--            (pg_trigger_depth() > 1 — the ON DELETE SET NULL action of
--            actor_id → profiles) whose ONLY change is actor_id going from a
--            value to NULL. Deleting an account must keep working.
--      Note on (b): Postgres runs a foreign-key action as the OWNER of the
--      referencing table, so on live (owner postgres) the cascade already
--      passes on (a); a probe in the Docker test showed current_user =
--      postgres at depth 2 during GoTrue's delete. (b) keeps account deletion
--      working if the table is ever owned by another role; the test proves it
--      with the table re-owned. A direct `set actor_id = null` (depth 1) is
--      refused like any other update.
--   7. Raising verify; then `notify pgrst` after commit.
--
-- WHAT IT DOES NOT DO
--   * It does not gate any route — Task 3.3 does (requireStaff reads
--     platform_staff with the service client; an admin with no row reads as
--     auditor, and before this file runs, 42P01 keeps today's rule).
--   * staff_role() does not check profiles.user_type: a staff row left behind
--     after an admin is demoted still reads as its role. requireStaff calls
--     requireAdmin first, so no route trusts it alone; a future policy built on
--     is_super_admin() alone would.
--   * It does not move existing audit rows or fill actor_email for them.
--
-- DEPLOY ORDER — INDEPENDENT of the code. Before the T3.3 deploy every admin
--   keeps today's access (no route reads the table yet); after it, an admin
--   with no row is an auditor, so run this first or with the deploy. The
--   write revokes break nothing in the repo: every audit writer uses the
--   service role (admin/community/moderation/[id], admin/community/reports/[id],
--   admin/verifications/[id], onboarding/account-type), and no one updates or
--   deletes audit rows.
--
-- BEFORE APPLYING — writers outside this repo
--   An n8n workflow or script that writes admin_audit_events with a USER's
--   token now gets "permission denied"; one that UPDATEs or DELETEs audit rows
--   (a retention job) now gets 42501 even with the service-role key. Retention,
--   if ever needed, runs as postgres in the SQL editor.
--
-- ROLLBACK
--   drop trigger if exists trg_admin_audit_append_only on public.admin_audit_events;
--   drop trigger if exists trg_admin_audit_no_truncate on public.admin_audit_events;
--   drop function if exists public.admin_audit_append_only();
--   drop function if exists public.is_super_admin();
--   drop function if exists public.staff_role();
--   drop table if exists public.platform_staff;
--   (The write revokes and actor_email stay: nothing in the repo needs them
--   back.)
-- =============================================================================

begin;

-- ── 1. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('auth.users') is null then
    raise exception '20261019_30: auth.users does not exist';
  end if;
  if to_regclass('public.profiles') is null
     or not exists (select 1 from pg_attribute
                     where attrelid = 'public.profiles'::regclass and attname = 'user_type' and not attisdropped) then
    raise exception '20261019_30: public.profiles.user_type does not exist — the backfill has no admins to read';
  end if;
  if to_regclass('public.admin_audit_events') is null
     or not exists (select 1 from pg_attribute
                     where attrelid = 'public.admin_audit_events'::regclass and attname = 'actor_id' and not attisdropped) then
    raise exception '20261019_30: public.admin_audit_events.actor_id does not exist';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception '20261019_30: public.is_admin() does not exist — the platform_staff policy has nothing to call (run 20261016_09 first)';
  end if;
end $$;

-- ── 2. platform_staff ────────────────────────────────────────────────────────
create table if not exists public.platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  staff_role text not null
             constraint platform_staff_role_check
             check (staff_role in ('super_admin', 'operations', 'auditor')),
  granted_by uuid,
  granted_at timestamptz not null default now()
);

comment on table public.platform_staff is
  'Owner ٢١٠ (20261019_30): the staff role of each Nezamy admin — super_admin / operations / auditor. profiles.user_type = ''admin'' says who is staff; this says which kind. Read by admins (RLS, public.is_admin()); written by the service role only. See src/lib/auth/staffRoles.ts.';

alter table public.platform_staff enable row level security;

drop policy if exists "admins read platform staff" on public.platform_staff;
create policy "admins read platform staff" on public.platform_staff
  for select to authenticated
  using (public.is_admin());

-- table level, then any column-level grant, then the allow-list
revoke all on table public.platform_staff from public, anon, authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute
   where attrelid = 'public.platform_staff'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all (%s) on table public.platform_staff from public, anon, authenticated', cols);
end $$;
grant select on table public.platform_staff to authenticated;
grant all on table public.platform_staff to service_role;

-- ── 3. staff_role() / is_super_admin() ───────────────────────────────────────
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ps.staff_role from public.platform_staff ps where ps.user_id = auth.uid()
$$;

comment on function public.staff_role() is
  'Owner ٢١٠ (20261019_30): the caller''s (auth.uid()) platform_staff.staff_role, or NULL when the caller is not staff. SECURITY DEFINER (reads past RLS); EXECUTE for authenticated and service_role only.';

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.staff_role() = 'super_admin', false)
$$;

comment on function public.is_super_admin() is
  'Owner ٢١٠ (20261019_30): true when the caller''s staff_role() is super_admin; never NULL. EXECUTE for authenticated and service_role only.';

revoke all on function public.staff_role() from public, anon;
revoke all on function public.is_super_admin() from public, anon;
grant execute on function public.staff_role() to authenticated, service_role;
grant execute on function public.is_super_admin() to authenticated, service_role;

-- ── 4. Backfill — every current admin is a super_admin until the user says
--       otherwise; a re-run changes no existing row ───────────────────────────
insert into public.platform_staff (user_id, staff_role)
select p.id, 'super_admin'
  from public.profiles p
 where p.user_type = 'admin'
on conflict (user_id) do nothing;

-- ── 5. admin_audit_events: actor_email, RLS, no API writes ───────────────────
alter table public.admin_audit_events add column if not exists actor_email text;
comment on column public.admin_audit_events.actor_email is
  'Owner ٢١٠ (20261019_30): the actor''s email when the row was written — kept after the account is deleted (actor_id then goes NULL).';

alter table public.admin_audit_events enable row level security;

revoke all on table public.admin_audit_events from public, anon, authenticated;
do $$
declare
  cols text;
  seq  text := pg_catalog.pg_get_serial_sequence('public.admin_audit_events', 'id');
begin
  select string_agg(quote_ident(attname), ', ' order by attnum) into cols
    from pg_attribute
   where attrelid = 'public.admin_audit_events'::regclass and attnum > 0 and not attisdropped;
  execute format('revoke all (%s) on table public.admin_audit_events from public, anon, authenticated', cols);
  if seq is null then
    raise notice '20261019_30: admin_audit_events.id has no owned sequence — nothing to revoke there';
  else
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    execute format('grant all on sequence %s to service_role', seq);
  end if;
end $$;
grant select on table public.admin_audit_events to anon, authenticated;
grant all on table public.admin_audit_events to service_role;

-- ── 6. Append-only ───────────────────────────────────────────────────────────
create or replace function public.admin_audit_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  -- SECURITY INVOKER: current_user is whoever runs the statement (PostgREST's
  -- SET ROLE, a login role, or — for a foreign-key action — the table owner).
  if current_user in ('postgres', 'supabase_admin') then
    if tg_level = 'STATEMENT' then
      return null;
    elsif tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- appending is the point (the triggers do not fire on INSERT; defensive)
  if tg_level = 'ROW' and tg_op = 'INSERT' then
    return new;
  end if;

  -- a foreign-key cascade: inside a trigger (the ON DELETE SET NULL action of
  -- actor_id → profiles), and the only change is actor_id, from a value to NULL
  if tg_level = 'ROW' and tg_op = 'UPDATE' and pg_catalog.pg_trigger_depth() > 1 then
    if old.actor_id is not null and new.actor_id is null
       and (pg_catalog.to_jsonb(new) - 'actor_id') = (pg_catalog.to_jsonb(old) - 'actor_id') then
      return new;
    end if;
  end if;

  raise exception using
    errcode = '42501',
    message = 'سجل تدقيق الإدارة للإضافة فقط: لا يُعدَّل فيه سطر ولا يُحذف (admin_audit_events is append-only)';
end
$fn$;

comment on function public.admin_audit_append_only() is
  'Owner ٢١٠ (20261019_30): admin_audit_events is append-only. SECURITY INVOKER — current_user is the writer — so it must never become DEFINER. UPDATE / DELETE / TRUNCATE raise 42501 unless current_user is postgres or supabase_admin, or the UPDATE is a foreign-key cascade (pg_trigger_depth() > 1 and only actor_id changed, from a value to NULL).';

revoke all on function public.admin_audit_append_only() from public, anon, authenticated;

drop trigger if exists trg_admin_audit_append_only on public.admin_audit_events;
create trigger trg_admin_audit_append_only
  before update or delete on public.admin_audit_events
  for each row execute function public.admin_audit_append_only();

drop trigger if exists trg_admin_audit_no_truncate on public.admin_audit_events;
create trigger trg_admin_audit_no_truncate
  before truncate on public.admin_audit_events
  for each statement execute function public.admin_audit_append_only();

comment on trigger trg_admin_audit_append_only on public.admin_audit_events is
  'APPEND-ONLY since 20261019_30 (owner ٢١٠) — read by _verify.sql.';
comment on trigger trg_admin_audit_no_truncate on public.admin_audit_events is
  'APPEND-ONLY since 20261019_30 (owner ٢١٠) — read by _verify.sql.';

-- ── 7. Verify — raises, so the transaction rolls back ────────────────────────
do $$
declare
  staff   constant text := 'public.platform_staff';
  audit   constant text := 'public.admin_audit_events';
  trg     constant text := 'public.admin_audit_append_only()';
  seq     text := pg_catalog.pg_get_serial_sequence('public.admin_audit_events', 'id');
  tbl     text;
  fn      text;
  r       text;
  p       text;
  col     text;
  cfg     text[];
  unstaffed text;
  missing text := '';
begin
  -- platform_staff: shape
  if (select count(*) from pg_attribute a
       where a.attrelid = staff::regclass and a.attnum > 0 and not a.attisdropped
         and (a.attname, a.atttypid, a.attnotnull) in (('user_id', 'uuid'::regtype, true),
                                                      ('staff_role', 'text'::regtype, true),
                                                      ('granted_by', 'uuid'::regtype, false),
                                                      ('granted_at', 'timestamptz'::regtype, true))) <> 4 then
    missing := missing || ' platform_staff lacks user_id uuid / staff_role text / granted_by uuid / granted_at timestamptz (an older table with another shape? drop it and re-run);';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = staff::regclass and c.contype = 'p'
                    and c.conkey = array[(select attnum from pg_attribute where attrelid = staff::regclass and attname = 'user_id')]) then
    missing := missing || ' platform_staff.user_id is not the primary key;';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = staff::regclass and c.contype = 'f'
                    and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c') then
    missing := missing || ' platform_staff.user_id does not reference auth.users ON DELETE CASCADE;';
  end if;
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = staff::regclass and c.contype = 'c' and c.conname = 'platform_staff_role_check') then
    missing := missing || ' platform_staff_role_check is missing;';
  end if;

  -- platform_staff: RLS + the one policy
  if not (select relrowsecurity from pg_class where oid = staff::regclass) then
    missing := missing || ' RLS is off on platform_staff;';
  end if;
  if (select count(*) from pg_policy where polrelid = staff::regclass) <> 1
     or not exists (select 1 from pg_policy pol
                     where pol.polrelid = staff::regclass and pol.polname = 'admins read platform staff'
                       and pol.polcmd = 'r' and pol.polroles = array['authenticated'::regrole::oid]
                       and position('is_admin()' in pg_get_expr(pol.polqual, pol.polrelid)) > 0) then
    missing := missing || ' platform_staff must carry exactly one policy, "admins read platform staff" FOR SELECT TO authenticated USING is_admin();';
  end if;

  -- effective privileges on both tables (table and column level)
  foreach tbl in array array[staff, audit] loop
    foreach r in array array['public', 'anon', 'authenticated'] loop
      foreach p in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, tbl, p) then
          missing := missing || format(' %s holds %s on %s;', r, p, tbl);
        end if;
      end loop;
      continue when has_table_privilege(r, tbl, 'INSERT, UPDATE, REFERENCES');   -- reported above
      for col in select a.attname::text from pg_attribute a
                  where a.attrelid = tbl::regclass and a.attnum > 0 and not a.attisdropped loop
        if has_column_privilege(r, tbl, col, 'INSERT, UPDATE, REFERENCES') then
          missing := missing || format(' %s holds a column write privilege on %s.%s;', r, tbl, col);
        end if;
      end loop;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', tbl, p) then
        missing := missing || format(' service_role lacks %s on %s;', p, tbl);
      end if;
    end loop;
  end loop;
  foreach r in array array['public', 'anon'] loop
    if has_table_privilege(r, staff, 'SELECT') or has_any_column_privilege(r, staff, 'SELECT') then
      missing := missing || format(' %s can read platform_staff;', r);
    end if;
  end loop;
  if not has_table_privilege('authenticated', staff, 'SELECT') then
    missing := missing || ' authenticated cannot SELECT platform_staff (the admins-read policy would never apply);';
  end if;
  if not has_table_privilege('authenticated', audit, 'SELECT') then
    missing := missing || ' authenticated cannot SELECT admin_audit_events (the own-rows policy would never apply);';
  end if;
  if seq is not null then
    foreach r in array array['public', 'anon', 'authenticated'] loop
      if has_sequence_privilege(r, seq, 'USAGE, SELECT, UPDATE') then
        missing := missing || format(' %s holds a privilege on %s;', r, seq);
      end if;
    end loop;
    if not has_sequence_privilege('service_role', seq, 'USAGE') then
      missing := missing || format(' service_role lacks USAGE on %s (every audit insert would fail);', seq);
    end if;
  end if;

  -- the role functions
  foreach fn in array array['public.staff_role()', 'public.is_super_admin()'] loop
    if to_regprocedure(fn) is null then
      missing := missing || format(' %s is missing;', fn);
      continue;
    end if;
    select p2.proconfig into cfg from pg_proc p2 where p2.oid = to_regprocedure(fn);
    if not (select prosecdef from pg_proc where oid = to_regprocedure(fn)) then
      missing := missing || format(' %s is not SECURITY DEFINER;', fn);
    end if;
    if cfg is null or not ('search_path=""' = any (cfg)) then
      missing := missing || format(' %s proconfig %s lacks search_path='''';', fn, coalesce(cfg::text, 'NULL'));
    end if;
    if (select provolatile from pg_proc where oid = to_regprocedure(fn)) <> 's' then
      missing := missing || format(' %s is not STABLE;', fn);
    end if;
    foreach r in array array['public', 'anon'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    foreach r in array array['authenticated', 'service_role'] loop
      if not has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s cannot EXECUTE %s;', r, fn);
      end if;
    end loop;
  end loop;

  -- admin_audit_events: the column, RLS, the read policy
  if not exists (select 1 from pg_attribute where attrelid = audit::regclass
                  and attname = 'actor_email' and atttypid = 'text'::regtype and not attisdropped) then
    missing := missing || ' admin_audit_events.actor_email text is missing;';
  end if;
  if not (select relrowsecurity from pg_class where oid = audit::regclass) then
    missing := missing || ' RLS is off on admin_audit_events;';
  end if;
  if not exists (select 1 from pg_policy where polrelid = audit::regclass
                  and polname = 'users read own audit events' and polcmd = 'r') then
    missing := missing || ' the "users read own audit events" SELECT policy is missing (run 20261016_09);';
  end if;

  -- append-only: an INVOKER function on one row trigger and one TRUNCATE trigger
  if (select prosecdef from pg_proc where oid = to_regprocedure(trg)) then
    missing := missing || ' admin_audit_append_only is SECURITY DEFINER — current_user would be its owner for every writer and nothing would be refused;';
  end if;
  select p2.proconfig into cfg from pg_proc p2 where p2.oid = to_regprocedure(trg);
  if cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || format(' admin_audit_append_only proconfig %s lacks search_path='''';', coalesce(cfg::text, 'NULL'));
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, trg, 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE admin_audit_append_only;', r);
    end if;
  end loop;
  if (select count(*) from pg_trigger t
       where t.tgrelid = audit::regclass and t.tgname = 'trg_admin_audit_append_only'
         and not t.tgisinternal
         and t.tgenabled in ('O', 'A')            -- fires in normal sessions (not D, not replica-only R)
         and (t.tgtype & 27) = 27                 -- ROW | BEFORE | DELETE | UPDATE
         and (t.tgtype & (4 | 32 | 64)) = 0       -- no INSERT / TRUNCATE / INSTEAD
         and t.tgqual is null                     -- no WHEN
         and t.tgattr = ''::int2vector            -- not UPDATE OF <columns>
         and t.tgfoid = to_regprocedure(trg)) <> 1 then
    missing := missing || ' admin_audit_events lacks one enabled trg_admin_audit_append_only BEFORE UPDATE OR DELETE FOR EACH ROW;';
  end if;
  if (select count(*) from pg_trigger t
       where t.tgrelid = audit::regclass and t.tgname = 'trg_admin_audit_no_truncate'
         and not t.tgisinternal and t.tgenabled in ('O', 'A')
         and t.tgtype = (2 | 32)                  -- STATEMENT | BEFORE | TRUNCATE, nothing else
         and t.tgfoid = to_regprocedure(trg)) <> 1 then
    missing := missing || ' admin_audit_events lacks one enabled trg_admin_audit_no_truncate BEFORE TRUNCATE FOR EACH STATEMENT;';
  end if;

  -- every current admin is staff
  select string_agg(p3.id::text, ', ') into unstaffed
    from public.profiles p3
   where p3.user_type = 'admin'
     and not exists (select 1 from public.platform_staff s where s.user_id = p3.id);
  if unstaffed is not null then
    missing := missing || format(' admins without a platform_staff row: %s;', unstaffed);
  end if;

  if missing <> '' then
    raise exception '20261019_30 verify:%', missing;
  end if;
  raise notice '20261019_30 verify: OK — platform_staff (% rows; RLS, admins read, service role writes); staff_role() / is_super_admin() definer, no guest EXECUTE; admin_audit_events append-only (invoker triggers on UPDATE / DELETE / TRUNCATE), no API writes, SELECT kept, actor_email added',
    (select count(*) from public.platform_staff);
end $$;

commit;

notify pgrst, 'reload schema';
