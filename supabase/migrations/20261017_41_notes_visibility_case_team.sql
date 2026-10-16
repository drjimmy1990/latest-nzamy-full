-- =============================================================================
-- Migration: 20261017_41_notes_visibility_case_team.sql
-- Owner decision ١٦٩ (answers of 2026-10-06, «المفكرة الذكية»):
--   «شخصية افتراضياً مع خيار مشاركة … 🔒 خاصة بي فقط · 👥 فريق القضية (المحامي
--    + المساعدين المرتبطين بالقضية ذاتها) · 🏢 كامل المكتب».
-- Plan: docs/plans/2026-10-16-fix-and-build-plan.md §3 row ١٦٩.
-- =============================================================================
--
-- WHAT CHANGES
--   1. public.case_team_members — who, besides the case's lead, works on ONE
--      firm case. Before this file there was no case-team concept at all: the
--      lawyer case page's «الفريق» tab is the assigned lawyer PLUS THE CLIENT,
--      and `/dashboard/firm/cases/assign` is mock. A team built from task
--      assignees was rejected on purpose: "tasks updatable by owner firm or
--      assignee" (20260903_phase1:413-418) lets any active firm member rewrite
--      `assignee_user_id`, so such a team would be self-joinable.
--
--   2. The case team, defined ONCE (public.case_team_user_ids):
--        * the case's lead          — service_requests.assigned_to
--        * the case's filer         — service_requests.requester_user_id
--        * every case_team_members row of that case
--      and EVERY one of them must be an ACTIVE member of the case's own firm
--      (service_requests.firm_id). That last rule is what keeps the client out
--      (owner decision ١٥): `requester_user_id` is the client on a client-filed
--      case, and `assigned_to` is free text on insert (plan item N16), so a
--      lead arm without the membership test would hand internal notes to
--      whoever those columns name. A case with no firm has no team.
--
--   3. case_notes gets the third scope `case_team`, and its policies are
--      rebuilt `TO authenticated`:
--        SELECT  author · firm (active member of the note's firm) ·
--                case_team (public.is_case_team_member(request_id))
--        INSERT  author + a case the author can read (unchanged) +
--                public.case_note_scope_ok(...)
--        UPDATE  author, WITH CHECK the same scope rule
--        DELETE  author
--      `case_note_scope_ok` moves into RLS what only the API enforced so far:
--      a `firm` note carries the CASE's firm (or, on a firm-less case, a firm
--      the author is active in), a `case_team` note carries the case's firm.
--      A raw PostgREST insert can no longer file a note under someone else's
--      firm. `private` ignores firm_id: the read arm is author-only anyway, and
--      live lawyer_client_notes rows already carry a stamped firm_id.
--
--   4. lawyer_client_notes and consultation_notes: the same scope rule on
--      INSERT/UPDATE (a `firm` client note carries the card's firm; a `firm`
--      consultation note needs a consultation that has a firm and an author
--      active in it), policies rebuilt `TO authenticated`.
--
--   5. BEHAVIOUR CHANGE — the platform-admin read arm (`or public.is_admin()`)
--      is dropped from case_notes and lawyer_client_notes. The owner's wording
--      is «خاصة بي فقط»; with that arm the screens' «لا يراها أحد سواك» and
--      «سرية بالكامل» were untrue. No code path reads these tables as an admin
--      (grep of src/: only the lawyer/firm note routes). consultation_notes
--      never had one.
--
--   6. Privileges (plan rule N20 — a lock revokes the privilege itself):
--      anon loses every privilege on the four tables; authenticated gets
--      SELECT/INSERT/DELETE on case_team_members (no UPDATE — a row is added
--      or removed, never edited); EXECUTE on the six new functions is revoked
--      from PUBLIC/anon and granted to authenticated + service_role only.
--
-- NOT CHANGED: can_access_case_row() (owner decision ٤٣ is a separate file),
-- the firm/business membership tables, the ٤٣ role matrix.
--
-- IDEMPOTENT: create … if not exists / create or replace / drop policy if
-- exists; the visibility CHECK is found by its definition, not by a guessed
-- name. Run twice in Docker by supabase/tests/rls/notes_visibility_case_team.test.sql.
--
-- ROLLBACK (manual): re-create the 20260910 / 20260903_phase2 / 20260905
-- note policies, drop case_team_members and the six functions, and put the
-- two-value visibility CHECK back after moving any case_team note to private.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.case_notes') is null then
    raise exception '20261017_41: public.case_notes is missing — apply 20260910_case_notes.sql first';
  end if;
  if to_regclass('public.lawyer_client_notes') is null or to_regclass('public.lawyer_clients') is null then
    raise exception '20261017_41: lawyer_clients / lawyer_client_notes missing — apply 20260903_phase2_clients_and_firm_membership.sql first';
  end if;
  if to_regclass('public.consultation_notes') is null or to_regclass('public.consultations') is null then
    raise exception '20261017_41: consultations / consultation_notes missing — apply 20260905_phase3_consultations_and_contracts.sql first';
  end if;
  if to_regclass('public.firm_members') is null or to_regclass('public.firm_profiles') is null then
    raise exception '20261017_41: firm_profiles / firm_members missing';
  end if;
  if to_regprocedure('public.can_access_case_row(uuid,uuid)') is null then
    raise exception '20261017_41: public.can_access_case_row(uuid, uuid) is missing — apply 20260903_phase1_case_tables.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id') then
    raise exception '20261017_41: service_requests.firm_id is missing — apply 20260903_phase2 first';
  end if;
end $$;


-- ── 1. case_team_members ─────────────────────────────────────────────────────
create table if not exists public.case_team_members (
  request_id  text not null references public.service_requests(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  firm_id     uuid not null references public.firm_profiles(id) on delete cascade,
  added_by    uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (request_id, user_id)
);

comment on table public.case_team_members is
  'فريق القضية (قرار المالك ١٦٩): أعضاء المكتب المضافون إلى قضية واحدة من قضايا المكتب، فوق المحامي المسؤول ومنشئ القضية. لا يُعدّ أحدٌ في الفريق إلا وهو عضو نشط في مكتب القضية.';

create index if not exists idx_case_team_members_user on public.case_team_members (user_id);
create index if not exists idx_case_team_members_firm on public.case_team_members (firm_id);

alter table public.case_team_members enable row level security;


-- ── 2. Helpers (SECURITY DEFINER — they read firm_members, which no policy
--      may read inline: the 42P17 shape 20260921_03 removed) ─────────────────

-- THE definition of a case team. Returns nothing unless the caller is an
-- active member of the case's firm, so it cannot be used to probe another
-- firm's cases or rosters. `via`: lead | filer | member (first match wins).
create or replace function public.case_team_user_ids(p_request text)
returns table (user_id uuid, via text)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (
    select sr.id, sr.firm_id, sr.assigned_to, sr.requester_user_id
      from public.service_requests sr
     where sr.id = p_request
       and sr.firm_id is not null
       and exists (select 1 from public.firm_members cm
                    where cm.firm_id = sr.firm_id
                      and cm.user_id = auth.uid()
                      and cm.status  = 'active')
  ), arms as (
    select c.firm_id, c.assigned_to as uid, 'lead'::text as via, 1 as rank from c
    union all
    select c.firm_id, c.requester_user_id, 'filer'::text, 2 from c
    union all
    select c.firm_id, t.user_id, 'member'::text, 3
      from c join public.case_team_members t
        on t.request_id = c.id and t.firm_id = c.firm_id
  )
  select distinct on (a.uid) a.uid, a.via
    from arms a
   where a.uid is not null
     and exists (select 1 from public.firm_members am
                  where am.firm_id = a.firm_id
                    and am.user_id = a.uid
                    and am.status  = 'active')
   order by a.uid, a.rank;
$$;

comment on function public.case_team_user_ids(text) is
  'Owner ١٦٩: the case team of one firm case — lead (assigned_to), filer (requester_user_id) and case_team_members rows, each only while an ACTIVE member of the case''s firm (so never the client). Empty unless the caller is an active member of that firm.';

create or replace function public.is_case_team_member(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.case_team_user_ids(p_request) t
                  where t.user_id = auth.uid());
$$;

-- Who may add/remove team members: the case's lead or filer, or the firm
-- owner — each only while an active member of the case's firm.
create or replace function public.can_manage_case_team(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.service_requests sr
     where sr.id = p_request
       and sr.firm_id is not null
       and exists (select 1 from public.firm_members m
                    where m.firm_id = sr.firm_id
                      and m.user_id = auth.uid()
                      and m.status  = 'active')
       and (sr.assigned_to = auth.uid()
            or sr.requester_user_id = auth.uid()
            or exists (select 1 from public.firm_profiles fp
                        where fp.id = sr.firm_id and fp.owner_user_id = auth.uid()))
  );
$$;

-- A new case_team_members row: a manager of the case adds an ACTIVE member of
-- the case's own firm, under that firm.
create or replace function public.case_team_insert_ok(p_request text, p_firm uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_case_team(p_request)
     and exists (select 1 from public.service_requests sr
                  where sr.id = p_request and sr.firm_id = p_firm)
     and exists (select 1 from public.firm_members m
                  where m.firm_id = p_firm and m.user_id = p_user and m.status = 'active');
$$;

-- The scope a case note may carry (INSERT and UPDATE WITH CHECK).
create or replace function public.case_note_scope_ok(p_request text, p_visibility text, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
    when 'private' then true
    when 'firm' then
      p_firm is not null
      and exists (select 1 from public.firm_members m
                   where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active')
      and coalesce((select sr.firm_id from public.service_requests sr where sr.id = p_request), p_firm) = p_firm
    when 'case_team' then
      exists (select 1 from public.service_requests sr
               where sr.id = p_request
                 and sr.firm_id is not null
                 and sr.firm_id = p_firm
                 and exists (select 1 from public.firm_members m
                              where m.firm_id = sr.firm_id and m.user_id = auth.uid() and m.status = 'active'))
    else false
  end;
$$;

-- The scope a client-card note may carry.
create or replace function public.client_note_scope_ok(p_client uuid, p_visibility text, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
    when 'private' then true
    when 'firm' then
      p_firm is not null
      and exists (select 1 from public.firm_members m
                   where m.firm_id = p_firm and m.user_id = auth.uid() and m.status = 'active')
      and coalesce((select c.firm_id from public.lawyer_clients c where c.id = p_client), p_firm) = p_firm
    else false
  end;
$$;

-- The scope a consultation note may carry (the table has no firm_id: a firm
-- note is read through the consultation's own firm).
create or replace function public.consultation_note_scope_ok(p_consultation text, p_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_visibility
    when 'private' then true
    when 'firm' then
      exists (select 1 from public.consultations c
               where c.id = p_consultation
                 and c.firm_id is not null
                 and exists (select 1 from public.firm_members m
                              where m.firm_id = c.firm_id and m.user_id = auth.uid() and m.status = 'active'))
    else false
  end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.case_team_user_ids(text)',
    'public.is_case_team_member(text)',
    'public.can_manage_case_team(text)',
    'public.case_team_insert_ok(text, uuid, uuid)',
    'public.case_note_scope_ok(text, text, uuid)',
    'public.client_note_scope_ok(uuid, text, uuid)',
    'public.consultation_note_scope_ok(text, text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function %s to authenticated', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;


-- ── 3. case_team_members: policies and privileges ───────────────────────────
drop policy if exists "case team readable by firm members" on public.case_team_members;
create policy "case team readable by firm members" on public.case_team_members
  for select to authenticated
  using (public.can_access_case_row(null, firm_id) or public.is_admin());

drop policy if exists "case team addable by case managers" on public.case_team_members;
create policy "case team addable by case managers" on public.case_team_members
  for insert to authenticated
  with check (added_by = auth.uid() and public.case_team_insert_ok(request_id, firm_id, user_id));

drop policy if exists "case team removable by case managers" on public.case_team_members;
create policy "case team removable by case managers" on public.case_team_members
  for delete to authenticated
  using (public.can_manage_case_team(request_id));

revoke all on public.case_team_members from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.case_team_members from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.case_team_members from authenticated;
    grant select, insert, delete on public.case_team_members to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.case_team_members to service_role;
  end if;
end $$;


-- ── 4. case_notes: the third scope ───────────────────────────────────────────
do $$
declare
  con record;
begin
  for con in
    select c.conname
      from pg_constraint c
     where c.conrelid = 'public.case_notes'::regclass
       and c.contype  = 'c'
       and pg_get_constraintdef(c.oid) ilike '%visibility%'
  loop
    execute format('alter table public.case_notes drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.case_notes
  add constraint case_notes_visibility_check
  check (visibility in ('private', 'firm', 'case_team'));

comment on table public.case_notes is
  'ملاحظات المحامي على ملف قضية — private: للكاتب فقط. case_team: لفريق القضية (case_team_user_ids). firm: لأعضاء المكتب النشطين.';

drop policy if exists "case notes readable by author or firm"       on public.case_notes;
drop policy if exists "case notes readable by author, team or firm" on public.case_notes;
create policy "case notes readable by author, team or firm" on public.case_notes
  for select to authenticated
  using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and firm_id is not null and public.can_access_case_row(null, firm_id))
    or (visibility = 'case_team' and public.is_case_team_member(request_id))
  );

drop policy if exists "case notes insertable by author" on public.case_notes;
create policy "case notes insertable by author" on public.case_notes
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.service_requests sr
       where sr.id = case_notes.request_id
         and (
           sr.requester_user_id = auth.uid()
           or sr.assigned_to = auth.uid()
           or (sr.firm_id is not null and public.can_access_case_row(null, sr.firm_id))
         )
    )
    and public.case_note_scope_ok(request_id, visibility, firm_id)
  );

drop policy if exists "case notes updatable by author" on public.case_notes;
create policy "case notes updatable by author" on public.case_notes
  for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid() and public.case_note_scope_ok(request_id, visibility, firm_id));

drop policy if exists "case notes deletable by author" on public.case_notes;
create policy "case notes deletable by author" on public.case_notes
  for delete to authenticated
  using (author_user_id = auth.uid());


-- ── 5. lawyer_client_notes ───────────────────────────────────────────────────
drop policy if exists "client notes readable by author or firm" on public.lawyer_client_notes;
create policy "client notes readable by author or firm" on public.lawyer_client_notes
  for select to authenticated
  using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and firm_id is not null and public.can_access_case_row(null, firm_id))
  );

drop policy if exists "client notes insertable by author" on public.lawyer_client_notes;
create policy "client notes insertable by author" on public.lawyer_client_notes
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (
      select 1 from public.lawyer_clients c
       where c.id = lawyer_client_notes.client_id
         and public.can_access_case_row(c.owner_user_id, c.firm_id)
    )
    and public.client_note_scope_ok(client_id, visibility, firm_id)
  );

drop policy if exists "client notes updatable by author" on public.lawyer_client_notes;
create policy "client notes updatable by author" on public.lawyer_client_notes
  for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid() and public.client_note_scope_ok(client_id, visibility, firm_id));

drop policy if exists "client notes deletable by author" on public.lawyer_client_notes;
create policy "client notes deletable by author" on public.lawyer_client_notes
  for delete to authenticated
  using (author_user_id = auth.uid());


-- ── 6. consultation_notes ────────────────────────────────────────────────────
drop policy if exists "consultation notes select" on public.consultation_notes;
create policy "consultation notes select" on public.consultation_notes
  for select to authenticated
  using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and exists (
          select 1 from public.consultations c
           where c.id = consultation_id
             and c.firm_id is not null
             and public.can_access_case_row(null, c.firm_id)))
  );

drop policy if exists "consultation notes insert" on public.consultation_notes;
create policy "consultation notes insert" on public.consultation_notes
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and exists (select 1 from public.consultations c
                 where c.id = consultation_id
                   and public.can_access_case_row(c.lawyer_user_id, c.firm_id))
    and public.consultation_note_scope_ok(consultation_id, visibility)
  );

drop policy if exists "consultation notes update" on public.consultation_notes;
create policy "consultation notes update" on public.consultation_notes
  for update to authenticated
  using (author_user_id = auth.uid())
  with check (author_user_id = auth.uid() and public.consultation_note_scope_ok(consultation_id, visibility));

drop policy if exists "consultation notes delete" on public.consultation_notes;
create policy "consultation notes delete" on public.consultation_notes
  for delete to authenticated
  using (author_user_id = auth.uid());


-- ── 7. No guest privilege on the note tables ─────────────────────────────────
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    return;
  end if;
  foreach t in array array['case_notes', 'lawyer_client_notes', 'consultation_notes'] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;


-- ── 8. Verify (raises) ───────────────────────────────────────────────────────
do $$
declare
  n    int;
  bad  text;
  f    text;
  t    text;
  priv text;
begin
  if to_regclass('public.case_team_members') is null then
    raise exception '20261017_41 verify: public.case_team_members was not created';
  end if;
  select count(*) into n from pg_class where oid = 'public.case_team_members'::regclass and relrowsecurity;
  if n <> 1 then
    raise exception '20261017_41 verify: RLS is off on public.case_team_members';
  end if;

  select count(*) into n from pg_constraint
   where conrelid = 'public.case_notes'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%case_team%';
  if n <> 1 then
    raise exception '20261017_41 verify: case_notes has no visibility CHECK admitting case_team (found %)', n;
  end if;

  foreach f in array array[
    'public.case_team_user_ids(text)', 'public.is_case_team_member(text)',
    'public.can_manage_case_team(text)', 'public.case_team_insert_ok(text, uuid, uuid)',
    'public.case_note_scope_ok(text, text, uuid)', 'public.client_note_scope_ok(uuid, text, uuid)',
    'public.consultation_note_scope_ok(text, text)'
  ] loop
    if to_regprocedure(f) is null then
      raise exception '20261017_41 verify: % is missing', f;
    end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then
      raise exception '20261017_41 verify: % is not SECURITY DEFINER', f;
    end if;
    if has_function_privilege('public', f, 'EXECUTE')
       or (exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE')) then
      raise exception '20261017_41 verify: % is executable by PUBLIC/anon', f;
    end if;
  end loop;

  -- Every note policy is scoped to authenticated, and none keeps the admin arm.
  select string_agg(format('%s.%s', c.relname, p.polname), ', ') into bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('case_notes', 'lawyer_client_notes', 'consultation_notes', 'case_team_members')
     and (p.polroles = '{0}'::oid[]
          or not ('authenticated'::regrole::oid = any (p.polroles)));
  if bad is not null then
    raise exception '20261017_41 verify: note policies not scoped to authenticated: %', bad;
  end if;
  select string_agg(format('%s.%s', c.relname, p.polname), ', ') into bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('case_notes', 'lawyer_client_notes', 'consultation_notes')
     and coalesce(pg_get_expr(p.polqual, p.polrelid), '') ilike '%is_admin%';
  if bad is not null then
    raise exception '20261017_41 verify: a note SELECT policy still lets the platform admin read private notes: %', bad;
  end if;

  select count(*) into n from pg_policy where polrelid = 'public.case_notes'::regclass;
  if n <> 4 then
    raise exception '20261017_41 verify: case_notes carries % policies, expected 4', n;
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.case_team_members'::regclass;
  if n <> 3 then
    raise exception '20261017_41 verify: case_team_members carries % policies, expected 3', n;
  end if;

  -- The scope rule sits on every write policy of the three note tables.
  select string_agg(format('%s.%s', c.relname, p.polname), ', ') into bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relnamespace = 'public'::regnamespace
     and c.relname in ('case_notes', 'lawyer_client_notes', 'consultation_notes')
     and p.polcmd in ('a', 'w')
     and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ '(case|client|consultation)_note_scope_ok';
  if bad is not null then
    raise exception '20261017_41 verify: write policies without the scope rule: %', bad;
  end if;
  select count(*) into n from pg_policy
   where polrelid = 'public.case_notes'::regclass and polcmd = 'r'
     and pg_get_expr(polqual, polrelid) ilike '%is_case_team_member%';
  if n <> 1 then
    raise exception '20261017_41 verify: the case_notes SELECT policy has no case_team arm';
  end if;

  -- Privileges.
  if exists (select 1 from pg_roles where rolname = 'anon') then
    foreach t in array array['case_notes', 'lawyer_client_notes', 'consultation_notes', 'case_team_members'] loop
      foreach priv in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if has_table_privilege('anon', 'public.' || t, priv) then
          raise exception '20261017_41 verify: anon holds % on public.%', priv, t;
        end if;
      end loop;
    end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_table_privilege('authenticated', 'public.case_team_members', 'UPDATE')
       or has_table_privilege('authenticated', 'public.case_team_members', 'TRUNCATE') then
      raise exception '20261017_41 verify: authenticated can UPDATE/TRUNCATE case_team_members';
    end if;
    if not (has_table_privilege('authenticated', 'public.case_team_members', 'SELECT')
            and has_table_privilege('authenticated', 'public.case_team_members', 'INSERT')
            and has_table_privilege('authenticated', 'public.case_team_members', 'DELETE')) then
      raise exception '20261017_41 verify: authenticated lacks SELECT/INSERT/DELETE on case_team_members';
    end if;
  end if;

  raise notice '20261017_41 verify: OK — case_team scope on case_notes, case_team_members with 3 policies, note scopes pinned in RLS, no admin read of private notes, no guest privilege';
end $$;

commit;
