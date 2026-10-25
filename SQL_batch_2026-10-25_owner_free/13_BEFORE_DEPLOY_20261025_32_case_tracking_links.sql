-- =============================================================================
-- Migration: 20261025_32_case_tracking_links.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P4 item N3.6.
-- Owner intent: package 2026-10-22 §٤٥ axis 6 («رابط خارجي مشفر يرسله المحامي
-- للموكل لمتابعة المواعيد والجلسات المعتمدة فقط مع حجب المذكرات الداخلية،
-- ودعوة العميل للتسجيل لحفظ قضيته»).
-- =============================================================================
--
-- WHAT CHANGES
--   1. public.case_tracking_links — one guest link to one case:
--        token_hash      sha256 hex of the link's 32-byte random token. The
--                        plaintext is shown to the lawyer once, at creation,
--                        and never stored (the document_shares pattern,
--                        20260909; src/lib/services/shareSecrets.ts).
--        case_request_id text FK to service_requests(id), ON DELETE CASCADE
--        owner_user_id   the lawyer who made it
--        firm_id         the CASE's firm (NULL on a solo case), pinned by RLS
--        revoked_at      set once; a revoked link never comes back
--        last_viewed_at  written by the public read only
--
--   2. RLS, TO authenticated:
--        SELECT  the link's maker, or anyone who works on the case
--                (is_case_worker, 20261025_31) — colleagues can see and
--                revoke a link a departed member left behind;
--        INSERT  owner_user_id = auth.uid(), case_row_scope_ok(case,
--                firm_id) — the maker works on the case (on a firm case an
--                ACTIVE member of its firm; never the client who filed it, never
--                a free-text assignee), firm_id is the case's own — AND
--                can_issue_tracking_link(case) (see 2b), and the link is born
--                live (revoked_at and last_viewed_at NULL);
--        UPDATE  revoke only: the link's maker, or anyone who may issue a link
--                on the case (2b); column privilege on revoked_at alone, and
--                WITH CHECK revoked_at IS NOT NULL (no un-revoking).
--        No DELETE: a revoked link stays as the record that it existed.
--
--   2b. Who may ISSUE a link (review 2026-10-25). Working on the case is not
--      enough: on a firm case every active member works on it, a finance, HR
--      or office-admin member and a trainee included, and a link hands the
--      case to a guest. public.tracking_link_maker_ok(p_request, p_user)
--      (service role only) is true on a FIRM case for an ACTIVE member of the
--      case's firm who is its lead (assigned_to), its filer
--      (requester_user_id), on its case team (case_team_members), or whose
--      firm role may open the firm's cases — the /dashboard/firm/cases roles
--      of src/constants/entityRouteAccess.ts (trackingWiring.test.ts pins the
--      two lists together) — and for the firm's owner. On a SOLO case it is
--      case_worker_ok. public.can_issue_tracking_link(p_request) is the same
--      rule for auth.uid(), for the policies and the API's early 403.
--
--   3. Column privileges: authenticated SELECTs every column but token_hash;
--      INSERTs id, case_request_id, owner_user_id, firm_id, token_hash;
--      UPDATEs revoked_at. anon nothing.
--
--   4. public.case_tracking_snapshot(p_token_hash text) returns jsonb — THE
--      public read, service_role only (the /track/[token] page calls it). It
--      returns NULL for a malformed, unknown or revoked token, or when the
--      link's maker may no longer issue it (tracking_link_maker_ok: a
--      suspended member's links die with his membership, and a lawyer moved
--      to a role outside the case roles loses his live links). Otherwise exactly:
--        { title, case_number, court, stage, hearings: [{ date, time, court }] }
--          title        service_requests.title
--          case_number  the current stage's court_case_no
--          court        the current stage's court_name, else metadata->>'court'
--          stage        the current stage's degree (first_instance|appeal|…)
--          hearings     up to 20 SCHEDULED JUDICIAL hearings dated today
--                       (Asia/Riyadh) or later: wall-clock date, "HH:MM" time,
--                       court (court_name, else location — the hearings route
--                       stores a judicial hearing's court in `location`).
--      Stages and hearings count only when their owner_user_id works on the
--      case (case_worker_ok): their INSERT policies check owner_user_id alone
--      (20260903_phase1), so anyone could write a row carrying this case id,
--      and the client must never be shown a stranger's text.
--      NEVER returned: hearing titles, notes, minutes, judge names, stage
--      outcomes or notes, documents, parties, phones, ids, fees, metadata.
--      Decisions are omitted: no column in our schema marks a decision as
--      approved for the client.
--      It also stamps last_viewed_at.
--
-- IDEMPOTENT: create … if not exists; create or replace; drop policy if
-- exists; revoke/grant repeatable. Run twice in Docker by
-- supabase/tests/rls/case_tracking_links.test.sql.
--
-- ROLLBACK (manual): drop function public.case_tracking_snapshot(text); drop
-- table public.case_tracking_links; drop function
-- public.can_issue_tracking_link(text), public.tracking_link_maker_ok(text,
-- uuid). Every link stops working at once.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.case_worker_ok(text,uuid)') is null
     or to_regprocedure('public.case_row_scope_ok(text,uuid)') is null
     or to_regprocedure('public.is_case_worker(text)') is null then
    raise exception '20261025_32: the case-worker helpers are missing — apply 20261025_31_dashboard_notes.sql first';
  end if;
  if to_regclass('public.hearings') is null or to_regclass('public.case_stages') is null then
    raise exception '20261025_32: public.hearings / public.case_stages are missing — apply 20260903_phase1_case_tables.sql first';
  end if;
  if to_regclass('public.case_team_members') is null then
    raise exception '20261025_32: public.case_team_members is missing — apply 20261017_41_notes_visibility_case_team.sql first';
  end if;
end $$;


-- ── 0b. Who may issue a link ─────────────────────────────────────────────────
-- The role list is the /dashboard/firm/cases rule of
-- src/constants/entityRouteAccess.ts (FIRM_CASE_VIEW_ROLES); a unit test
-- (src/lib/tracking/trackingWiring.test.ts) fails when the two drift.
create or replace function public.tracking_link_maker_ok(p_request text, p_user uuid)
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
                        where m.firm_id = sr.firm_id
                          and m.user_id = p_user
                          and m.status  = 'active'
                          and (sr.assigned_to = p_user
                               or sr.requester_user_id = p_user
                               or m.role in ('managing_partner', 'partner', 'senior_lawyer', 'lawyer', 'legal_consultant',
                                             'in_house_counsel', 'external_of_counsel', 'legal_secretary', 'compliance_manager')
                               or exists (select 1 from public.case_team_members t
                                           where t.request_id = sr.id and t.user_id = p_user and t.firm_id = sr.firm_id)))
               or exists (select 1 from public.firm_profiles fp
                           where fp.id = sr.firm_id and fp.owner_user_id = p_user)
             else
               public.case_worker_ok(p_request, p_user)
           end
  );
$$;

comment on function public.tracking_link_maker_ok(text, uuid) is
  '20261025_32: p_user may issue (and keep alive) a client tracking link on case p_request. Firm case: an ACTIVE member of the case firm who is its lead, its filer, on its case team, or holds a /dashboard/firm/cases role (entityRouteAccess.ts) — or the firm owner. Solo case: case_worker_ok. Service role only.';

create or replace function public.can_issue_tracking_link(p_request text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.tracking_link_maker_ok(p_request, auth.uid());
$$;

comment on function public.can_issue_tracking_link(text) is
  '20261025_32: the caller (auth.uid()) may issue a client tracking link on case p_request — public.tracking_link_maker_ok for the session.';

revoke all on function public.tracking_link_maker_ok(text, uuid) from public;
revoke all on function public.can_issue_tracking_link(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.tracking_link_maker_ok(text, uuid) from anon;
    revoke all on function public.can_issue_tracking_link(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.tracking_link_maker_ok(text, uuid) from authenticated;
    grant execute on function public.can_issue_tracking_link(text) to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.tracking_link_maker_ok(text, uuid) to service_role;
    grant execute on function public.can_issue_tracking_link(text) to service_role;
  end if;
end $$;


-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.case_tracking_links (
  id               uuid primary key default gen_random_uuid(),
  case_request_id  text not null references public.service_requests(id) on delete cascade,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  firm_id          uuid references public.firm_profiles(id) on delete set null,
  token_hash       text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at       timestamptz not null default now(),
  revoked_at       timestamptz,
  last_viewed_at   timestamptz
);

comment on table public.case_tracking_links is
  'روابط متابعة القضية للموكل (N3.6، المالك §٤٥ المحور ٦). يُخزَّن تجزئة الرمز فقط (sha256). القراءة العامة عبر case_tracking_snapshot (service_role) وحدها.';

create unique index if not exists case_tracking_links_token_hash_key on public.case_tracking_links (token_hash);
create index if not exists idx_case_tracking_links_case on public.case_tracking_links (case_request_id, created_at desc);

alter table public.case_tracking_links enable row level security;


-- ── 2. Policies ──────────────────────────────────────────────────────────────
drop policy if exists "tracking links readable by maker or case workers" on public.case_tracking_links;
create policy "tracking links readable by maker or case workers" on public.case_tracking_links
  for select to authenticated
  using (owner_user_id = auth.uid() or public.is_case_worker(case_request_id));

drop policy if exists "tracking links creatable by case workers" on public.case_tracking_links;
create policy "tracking links creatable by case workers" on public.case_tracking_links
  for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and revoked_at is null
    and last_viewed_at is null
    and public.case_row_scope_ok(case_request_id, firm_id)
    and public.can_issue_tracking_link(case_request_id)
  );

drop policy if exists "tracking links revocable by maker or case workers" on public.case_tracking_links;
create policy "tracking links revocable by maker or case workers" on public.case_tracking_links
  for update to authenticated
  using (owner_user_id = auth.uid() or public.can_issue_tracking_link(case_request_id))
  with check (revoked_at is not null);


-- ── 3. Privileges ────────────────────────────────────────────────────────────
revoke all on public.case_tracking_links from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.case_tracking_links from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.case_tracking_links from authenticated;
    grant select (id, case_request_id, owner_user_id, firm_id, created_at, revoked_at, last_viewed_at)
      on public.case_tracking_links to authenticated;
    grant insert (id, case_request_id, owner_user_id, firm_id, token_hash)
      on public.case_tracking_links to authenticated;
    grant update (revoked_at) on public.case_tracking_links to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.case_tracking_links to service_role;
  end if;
end $$;


-- ── 4. The public read ───────────────────────────────────────────────────────
create or replace function public.case_tracking_snapshot(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_link   record;
  v_case   record;
  v_stage  record;
  v_today  date := (now() at time zone 'Asia/Riyadh')::date;
  v_hear   jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select l.id, l.case_request_id, l.owner_user_id
    into v_link
    from public.case_tracking_links l
   where l.token_hash = p_token_hash
     and l.revoked_at is null;
  if not found then
    return null;
  end if;
  if not public.tracking_link_maker_ok(v_link.case_request_id, v_link.owner_user_id) then
    return null;
  end if;

  select sr.id, sr.title, nullif(btrim(sr.metadata ->> 'court'), '') as meta_court
    into v_case
    from public.service_requests sr
   where sr.id = v_link.case_request_id;
  if not found then
    return null;
  end if;

  select s.degree, nullif(btrim(s.court_name), '') as court_name, nullif(btrim(s.court_case_no), '') as court_case_no
    into v_stage
    from public.case_stages s
   where s.case_request_id = v_case.id
     and public.case_worker_ok(v_case.id, s.owner_user_id)
   order by s.position desc, s.opened_on desc nulls last, s.created_at desc
   limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date',  to_char(h.hearing_date, 'YYYY-MM-DD'),
           'time',  to_char(h.hearing_time, 'HH24:MI'),
           'court', coalesce(nullif(btrim(h.court_name), ''), nullif(btrim(h.location), ''))
         ) order by h.hearing_date, h.hearing_time nulls last), '[]'::jsonb)
    into v_hear
    from (
      select hh.hearing_date, hh.hearing_time, hh.court_name, hh.location
        from public.hearings hh
       where hh.case_request_id = v_case.id
         and hh.kind = 'judicial'
         and hh.status = 'scheduled'
         and hh.hearing_date >= v_today
         and public.case_worker_ok(v_case.id, hh.owner_user_id)
       order by hh.hearing_date, hh.hearing_time nulls last
       limit 20
    ) h;

  update public.case_tracking_links set last_viewed_at = now() where id = v_link.id;

  return jsonb_build_object(
    'title',       v_case.title,
    'case_number', v_stage.court_case_no,
    'court',       coalesce(v_stage.court_name, v_case.meta_court),
    'stage',       v_stage.degree,
    'hearings',    v_hear
  );
end;
$$;

comment on function public.case_tracking_snapshot(text) is
  '20261025_32: the client tracking page''s ONE read. Live link + maker still allowed to issue it (tracking_link_maker_ok) → {title, case_number, court, stage, hearings[{date,time,court}]} from rows written by case workers only; else NULL. Stamps last_viewed_at. Service role only.';

revoke all on function public.case_tracking_snapshot(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function public.case_tracking_snapshot(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on function public.case_tracking_snapshot(text) from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.case_tracking_snapshot(text) to service_role;
  end if;
end $$;


-- ── 5. Verify (raises) ───────────────────────────────────────────────────────
do $$
declare n int; bad text; r text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.case_tracking_links'::regclass) then
    raise exception '20261025_32 verify: RLS is off on public.case_tracking_links';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.case_tracking_links'::regclass;
  if n <> 3 then
    raise exception '20261025_32 verify: case_tracking_links carries % policies, expected 3', n;
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.case_tracking_links'::regclass and polcmd in ('d', '*')) then
    raise exception '20261025_32 verify: a DELETE (or ALL) policy exists on case_tracking_links';
  end if;
  select string_agg(p.polname, ', ') into bad
    from pg_policy p
   where p.polrelid = 'public.case_tracking_links'::regclass and p.polcmd = 'a'
     and (coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'case_row_scope_ok'
          or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'can_issue_tracking_link');
  if bad is not null then
    raise exception '20261025_32 verify: the insert policy lacks case_row_scope_ok / can_issue_tracking_link: %', bad;
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.case_tracking_links'::regclass and polcmd = 'w'
               and coalesce(pg_get_expr(polqual, polrelid), '') !~ 'can_issue_tracking_link') then
    raise exception '20261025_32 verify: the revoke policy is not limited to the maker or those who may issue a link';
  end if;
  foreach r in array array['public.tracking_link_maker_ok(text, uuid)', 'public.can_issue_tracking_link(text)'] loop
    if to_regprocedure(r) is null then
      raise exception '20261025_32 verify: % is missing', r;
    end if;
    if not (select prosecdef from pg_proc where oid = to_regprocedure(r)) then
      raise exception '20261025_32 verify: % is not SECURITY DEFINER', r;
    end if;
    if has_function_privilege('public', r, 'EXECUTE')
       or (exists (select 1 from pg_roles where rolname = 'anon') and has_function_privilege('anon', r, 'EXECUTE')) then
      raise exception '20261025_32 verify: % is executable by PUBLIC/anon', r;
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated')
     and has_function_privilege('authenticated', 'public.tracking_link_maker_ok(text, uuid)', 'EXECUTE') then
    raise exception '20261025_32 verify: a session can EXECUTE tracking_link_maker_ok — it could probe other accounts'' authority on a case';
  end if;
  if not exists (select 1 from pg_policy where polrelid = 'public.case_tracking_links'::regclass and polcmd = 'w'
                   and pg_get_expr(polwithcheck, polrelid) ilike '%revoked_at IS NOT NULL%') then
    raise exception '20261025_32 verify: the update policy does not refuse un-revoking';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_column_privilege('authenticated', 'public.case_tracking_links', 'token_hash', 'SELECT') then
      raise exception '20261025_32 verify: sessions can read token_hash';
    end if;
    if has_column_privilege('authenticated', 'public.case_tracking_links', 'last_viewed_at', 'UPDATE')
       or has_column_privilege('authenticated', 'public.case_tracking_links', 'case_request_id', 'UPDATE')
       or has_column_privilege('authenticated', 'public.case_tracking_links', 'token_hash', 'UPDATE')
       or has_table_privilege('authenticated', 'public.case_tracking_links', 'DELETE') then
      raise exception '20261025_32 verify: sessions can rewrite or delete a tracking link (only revoked_at is theirs)';
    end if;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r)
       and has_function_privilege(r, 'public.case_tracking_snapshot(text)', 'EXECUTE') then
      raise exception '20261025_32 verify: % can EXECUTE case_tracking_snapshot', r;
    end if;
  end loop;
  if has_function_privilege('public', 'public.case_tracking_snapshot(text)', 'EXECUTE') then
    raise exception '20261025_32 verify: PUBLIC can EXECUTE case_tracking_snapshot';
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.case_tracking_links', 'SELECT') then
    raise exception '20261025_32 verify: anon can read case_tracking_links';
  end if;
  raise notice '20261025_32 verify: OK — case_tracking_links: hashed tokens hidden from sessions, case_row_scope_ok + can_issue_tracking_link on insert, revoke-only update by maker or issuer, no delete; case_tracking_snapshot and tracking_link_maker_ok service-only';
end $$;

commit;
notify pgrst, 'reload schema';
