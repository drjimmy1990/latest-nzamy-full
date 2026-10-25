-- =============================================================================
-- Migration: 20261025_31_dashboard_notes.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P4 item N3.4.
-- Owner intent: package 2026-10-22 §٤٧ part ٣ («حائط الملاحظات اللاصقة»:
-- خمسة ألوان باستيل — أصفر كهرماني، زمردي، أزرق سماوي، وردي، بنفسجي —
-- تثبيت في الأعلى، ربط بملف قضية، مشاركة مع فريق المكتب) and §٤٧ part ٢
-- (quick add item «ملاحظة لاصقة»).
-- =============================================================================
--
-- WHAT CHANGES
--   1. Two case-worker helpers, used here and by 20261025_32 (tracking links)
--      and 20261025_33 (legal ledger):
--        public.case_worker_ok(p_request text, p_user uuid)
--          THE definition of "works on this case". On a FIRM case
--          (service_requests.firm_id set) only an ACTIVE member of that firm,
--          or its owner, counts — never assigned_to or requester_user_id on
--          their own: assigned_to is free text on insert (plan item N16), and
--          requester_user_id is the CLIENT on a client-filed case (owner
--          decision ١٥). On a firm-less case: the assignee, or the requester
--          when that account is a lawyer or firm account (a lawyer files his
--          own cases with requester_user_id = himself; a client is not one).
--          EXECUTE for service_role only — a session must not probe other
--          people's access; 20261025_32's public read calls it as its owner.
--        public.is_case_worker(p_request text) — the same rule for auth.uid().
--        public.case_row_scope_ok(p_request text, p_firm uuid) — a row filed
--          against a case carries that case's own firm (or none on a solo
--          case) and its writer works on the case. 20261025_32/_33 pin their
--          INSERT/UPDATE WITH CHECK on it.
--
--   2. public.dashboard_notes — a lawyer's sticky notes on his dashboard.
--        author_user_id  the writer (set from the session, never moved: no
--                        UPDATE privilege on the column)
--        body            1..2000 characters
--        color           amber | emerald | sky | rose | violet
--        pinned          shown first
--        case_request_id optional text FK to service_requests(id), ON DELETE
--                        SET NULL (the note outlives a deleted case)
--        visibility      private | firm | case_team — the case_notes
--                        vocabulary of owner decision ١٦٩
--        firm_id         the firm a firm / case_team note is shared with
--
--   3. RLS, mirroring case_notes (20261017_41), TO authenticated:
--        SELECT  author · firm (an active member of the note's firm) ·
--                case_team (public.is_case_team_member(case_request_id))
--        INSERT  author = auth.uid(); a linked case must be one the author
--                works on (is_case_worker); a private note carries no firm;
--                public.case_note_scope_ok(case_request_id, visibility,
--                firm_id) — a firm note carries the case's firm (or, with no
--                case, a firm the author is active in), a case_team note
--                needs a firm case and carries its firm.
--        UPDATE  author, WITH CHECK the same rule as INSERT on the NEW row —
--                relinking a note to someone else's case, or re-scoping it to
--                another firm, is refused exactly like inserting one.
--        DELETE  author (a sticky note is personal scratch, not a memo —
--                directive 5 protects memos, documents and cases).
--
--   4. Privileges (plan rule N20): anon none; authenticated SELECT, DELETE,
--      INSERT and UPDATE on the writable columns only (author_user_id and the
--      timestamps cannot be updated); service_role all.
--
-- NOT CHANGED: case_notes, can_access_case_row(), case_note_scope_ok(),
-- is_case_team_member() (all 20261017_41).
--
-- IDEMPOTENT: create … if not exists / create or replace / drop policy if
-- exists; revoke/grant repeatable. Run twice in Docker by
-- supabase/tests/rls/dashboard_notes.test.sql.
--
-- ROLLBACK (manual): drop table public.dashboard_notes; drop function
-- public.case_row_scope_ok(text, uuid), public.is_case_worker(text),
-- public.case_worker_ok(text, uuid) — only after 20261025_32/_33 are rolled
-- back, their policies call them.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'service_requests' and column_name = 'firm_id') then
    raise exception '20261025_31: service_requests.firm_id is missing — apply 20260903_phase2 first';
  end if;
  if to_regprocedure('public.can_access_case_row(uuid,uuid)') is null then
    raise exception '20261025_31: public.can_access_case_row(uuid, uuid) is missing — apply 20260903_phase1_case_tables.sql first';
  end if;
  if to_regprocedure('public.case_note_scope_ok(text,text,uuid)') is null
     or to_regprocedure('public.is_case_team_member(text)') is null then
    raise exception '20261025_31: case_note_scope_ok / is_case_team_member are missing — apply 20261017_41_notes_visibility_case_team.sql first';
  end if;
end $$;


-- ── 1. Case-worker helpers ───────────────────────────────────────────────────
create or replace function public.case_worker_ok(p_request text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_request is not null and p_user is not null and exists (
    select 1
      from public.service_requests sr
     where sr.id = p_request
       and case
             when sr.firm_id is not null then
               exists (select 1 from public.firm_members m
                        where m.firm_id = sr.firm_id and m.user_id = p_user and m.status = 'active')
               or exists (select 1 from public.firm_profiles fp
                           where fp.id = sr.firm_id and fp.owner_user_id = p_user)
             else
               sr.assigned_to = p_user
               or (sr.requester_user_id = p_user
                   and exists (select 1 from public.profiles p
                                where p.id = p_user and p.user_type in ('lawyer', 'firm')))
           end
  );
$$;

comment on function public.case_worker_ok(text, uuid) is
  '20261025_31: p_user works on case p_request. Firm case: an ACTIVE member of the case firm, or its owner (never assigned_to/requester alone — free text / the client). Solo case: the assignee, or a lawyer/firm-account requester. Service role only.';

create or replace function public.is_case_worker(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.case_worker_ok(p_request, auth.uid());
$$;

comment on function public.is_case_worker(text) is
  '20261025_31: the caller (auth.uid()) works on case p_request — public.case_worker_ok for the session.';

create or replace function public.case_row_scope_ok(p_request text, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.case_worker_ok(p_request, auth.uid())
     and exists (select 1 from public.service_requests sr
                  where sr.id = p_request
                    and sr.firm_id is not distinct from p_firm);
$$;

comment on function public.case_row_scope_ok(text, uuid) is
  '20261025_31: a row filed against case p_request by the caller carries the case''s own firm (NULL on a solo case) and the caller works on the case. Used by the WITH CHECK of case_tracking_links (_32) and legal_ledger_entries (_33).';

revoke all on function public.case_worker_ok(text, uuid) from public;
revoke all on function public.is_case_worker(text) from public;
revoke all on function public.case_row_scope_ok(text, uuid) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.case_worker_ok(text, uuid) from anon;
    revoke all on function public.is_case_worker(text) from anon;
    revoke all on function public.case_row_scope_ok(text, uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.case_worker_ok(text, uuid) from authenticated;
    grant execute on function public.is_case_worker(text) to authenticated;
    grant execute on function public.case_row_scope_ok(text, uuid) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.case_worker_ok(text, uuid) to service_role;
    grant execute on function public.is_case_worker(text) to service_role;
    grant execute on function public.case_row_scope_ok(text, uuid) to service_role;
  end if;
end $$;


-- ── 2. dashboard_notes ───────────────────────────────────────────────────────
create table if not exists public.dashboard_notes (
  id               uuid primary key default gen_random_uuid(),
  author_user_id   uuid not null references auth.users(id) on delete cascade,
  firm_id          uuid references public.firm_profiles(id) on delete set null,
  case_request_id  text references public.service_requests(id) on delete set null,
  body             text not null check (length(btrim(body)) > 0 and length(body) <= 2000),
  color            text not null default 'amber'
                     check (color in ('amber', 'emerald', 'sky', 'rose', 'violet')),
  pinned           boolean not null default false,
  visibility       text not null default 'private'
                     check (visibility in ('private', 'firm', 'case_team')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.dashboard_notes is
  'حائط الملاحظات اللاصقة (N3.4، المالك §٤٧ ج٣) — private: للكاتب فقط. case_team: لفريق القضية المرتبطة. firm: لأعضاء المكتب النشطين.';

create index if not exists idx_dashboard_notes_author on public.dashboard_notes (author_user_id, pinned desc, updated_at desc);
create index if not exists idx_dashboard_notes_firm   on public.dashboard_notes (firm_id) where firm_id is not null;
create index if not exists idx_dashboard_notes_case   on public.dashboard_notes (case_request_id) where case_request_id is not null;

drop trigger if exists trg_dashboard_notes_updated_at on public.dashboard_notes;
create trigger trg_dashboard_notes_updated_at before update on public.dashboard_notes
  for each row execute function public.handle_updated_at();

alter table public.dashboard_notes enable row level security;


-- ── 3. Policies ──────────────────────────────────────────────────────────────
drop policy if exists "dashboard notes readable by author, team or firm" on public.dashboard_notes;
create policy "dashboard notes readable by author, team or firm" on public.dashboard_notes
  for select to authenticated
  using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and firm_id is not null and public.can_access_case_row(null, firm_id))
    or (visibility = 'case_team' and case_request_id is not null and public.is_case_team_member(case_request_id))
  );

drop policy if exists "dashboard notes insertable by author" on public.dashboard_notes;
create policy "dashboard notes insertable by author" on public.dashboard_notes
  for insert to authenticated
  with check (
    author_user_id = auth.uid()
    and (case_request_id is null or public.is_case_worker(case_request_id))
    and (visibility <> 'private' or firm_id is null)
    and public.case_note_scope_ok(case_request_id, visibility, firm_id)
  );

drop policy if exists "dashboard notes updatable by author" on public.dashboard_notes;
create policy "dashboard notes updatable by author" on public.dashboard_notes
  for update to authenticated
  using (author_user_id = auth.uid())
  with check (
    author_user_id = auth.uid()
    and (case_request_id is null or public.is_case_worker(case_request_id))
    and (visibility <> 'private' or firm_id is null)
    and public.case_note_scope_ok(case_request_id, visibility, firm_id)
  );

drop policy if exists "dashboard notes deletable by author" on public.dashboard_notes;
create policy "dashboard notes deletable by author" on public.dashboard_notes
  for delete to authenticated
  using (author_user_id = auth.uid());


-- ── 4. Privileges ────────────────────────────────────────────────────────────
revoke all on public.dashboard_notes from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.dashboard_notes from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.dashboard_notes from authenticated;
    grant select, delete on public.dashboard_notes to authenticated;
    grant insert (id, author_user_id, firm_id, case_request_id, body, color, pinned, visibility)
      on public.dashboard_notes to authenticated;
    grant update (firm_id, case_request_id, body, color, pinned, visibility)
      on public.dashboard_notes to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.dashboard_notes to service_role;
  end if;
end $$;


-- ── 5. Verify (raises) ───────────────────────────────────────────────────────
do $$
declare
  n   int;
  f   text;
  bad text;
begin
  if to_regclass('public.dashboard_notes') is null then
    raise exception '20261025_31 verify: public.dashboard_notes was not created';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.dashboard_notes'::regclass) then
    raise exception '20261025_31 verify: RLS is off on public.dashboard_notes';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.dashboard_notes'::regclass;
  if n <> 4 then
    raise exception '20261025_31 verify: dashboard_notes carries % policies, expected 4', n;
  end if;
  select string_agg(p.polname, ', ') into bad
    from pg_policy p
   where p.polrelid = 'public.dashboard_notes'::regclass
     and (p.polroles = '{0}'::oid[] or not ('authenticated'::regrole::oid = any (p.polroles)));
  if bad is not null then
    raise exception '20261025_31 verify: dashboard_notes policies not scoped to authenticated: %', bad;
  end if;
  select string_agg(p.polname, ', ') into bad
    from pg_policy p
   where p.polrelid = 'public.dashboard_notes'::regclass
     and p.polcmd in ('a', 'w')
     and (coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'case_note_scope_ok'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'is_case_worker');
  if bad is not null then
    raise exception '20261025_31 verify: write policies without the case and scope rule: %', bad;
  end if;

  foreach f in array array['public.case_worker_ok(text, uuid)', 'public.is_case_worker(text)', 'public.case_row_scope_ok(text, uuid)'] loop
    if to_regprocedure(f) is null then
      raise exception '20261025_31 verify: % is missing', f;
    end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(f)) then
      raise exception '20261025_31 verify: % is not SECURITY DEFINER', f;
    end if;
    if has_function_privilege('public', f, 'EXECUTE')
       or (exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', f, 'EXECUTE')) then
      raise exception '20261025_31 verify: % is executable by PUBLIC/anon', f;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', 'public.case_worker_ok(text, uuid)', 'EXECUTE') then
    raise exception '20261025_31 verify: a session can EXECUTE case_worker_ok — it could probe other accounts'' access to a case';
  end if;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    if has_table_privilege('anon', 'public.dashboard_notes', 'SELECT')
       or has_table_privilege('anon', 'public.dashboard_notes', 'INSERT')
       or has_table_privilege('anon', 'public.dashboard_notes', 'UPDATE')
       or has_table_privilege('anon', 'public.dashboard_notes', 'DELETE') then
      raise exception '20261025_31 verify: anon holds a privilege on public.dashboard_notes';
    end if;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_column_privilege('authenticated', 'public.dashboard_notes', 'author_user_id', 'UPDATE') then
      raise exception '20261025_31 verify: authenticated can UPDATE dashboard_notes.author_user_id';
    end if;
    if not has_column_privilege('authenticated', 'public.dashboard_notes', 'pinned', 'UPDATE') then
      raise exception '20261025_31 verify: authenticated cannot UPDATE dashboard_notes.pinned';
    end if;
  end if;

  raise notice '20261025_31 verify: OK — dashboard_notes with 4 authenticated policies (case-worker link + case_note_scope_ok on every write), author pinned, no guest privilege; case-worker helpers definer, case_worker_ok service-only';
end $$;

commit;
notify pgrst, 'reload schema';
