-- Owner item 65 remainder — the case file could not save a note: no table,
-- no route. This is the table + RLS; the routes are
-- src/app/api/v1/cases/[id]/notes/route.ts and .../notes/[noteId]/route.ts.
--
-- Template: public.lawyer_client_notes
-- (20260903_phase2_clients_and_firm_membership.sql:204-219, RLS :374-401) —
-- identical shape, anchored to `service_requests` instead of `lawyer_clients`.
--
-- `request_id` is TEXT because `service_requests.id` is TEXT
-- (20260518_client_workflow_backend_ready.sql) — and because the case file's
-- own URL id IS that same `service_requests.id`. Both
-- src/app/dashboard/lawyer/cases/[id]/page.tsx and
-- src/app/dashboard/firm/cases/[id]/page.tsx read `useParams().id` and pass
-- it straight through as `caseId` to hearings/tasks/case_stages/deadlines —
-- see the comment on src/app/api/v1/lawyer/case-stages/[caseId]/route.ts:
-- "caseId in the path is `case_request_id` (service_requests.id, text) — the
-- same anchor hearings/tasks/activity_events/case_graphs already use". This
-- table joins that same family.
--
-- Repeats handle_updated_at() and can_access_case_row() (idempotent,
-- identical bodies to 20260903_phase1/phase2) so this file applies on its
-- own — the same convention 20260905_phase3 already follows.

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.can_access_case_row(p_owner uuid, p_firm uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (p_owner is not null and p_owner = auth.uid())
    or (
      p_firm is not null
      and exists (
        select 1 from public.firm_members fm
        where fm.firm_id = p_firm
          and fm.user_id = auth.uid()
          and fm.status  = 'active'
      )
    );
$$;


-- ═════════════════════════════════════════════════════════════════════════════
-- public.case_notes — ملاحظات على ملف القضية
-- ═════════════════════════════════════════════════════════════════════════════
-- `private` = the author alone. `firm` = the author's active colleagues too
-- (through `can_access_case_row`, exactly like `lawyer_client_notes`). The
-- note's `firm_id` is set by the API (never trusted from the client) from
-- `firm_members`, and — unlike the template, which had no independent case
-- anchor to check against — is pinned to the CASE's own firm
-- (`service_requests.firm_id`) whenever the case has one: the API requires an
-- ACTIVE `firm_members` row for that specific firm, so a lawyer active in two
-- firms cannot have a firm-A case's note attributed to firm B by an unordered
-- membership pick. Only a firm-less (solo) case falls back to the caller's
-- own first active membership.
create table if not exists public.case_notes (
  id              uuid primary key default gen_random_uuid(),
  request_id      text not null references public.service_requests(id) on delete cascade,
  author_user_id  uuid not null references auth.users(id) on delete cascade,
  firm_id         uuid references public.firm_profiles(id) on delete set null,
  body            text not null check (length(btrim(body)) > 0 and length(body) <= 8000),
  visibility      text not null default 'private'
                    check (visibility in ('private', 'firm')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.case_notes is 'ملاحظات المحامي على ملف قضية — private: للكاتب فقط. firm: تُقرأ من زملائه النشطين بالمكتب.';

create index if not exists idx_case_notes_request on public.case_notes (request_id);
create index if not exists idx_case_notes_author  on public.case_notes (author_user_id);

drop trigger if exists trg_case_notes_updated_at on public.case_notes;
create trigger trg_case_notes_updated_at before update on public.case_notes
  for each row execute function public.handle_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.case_notes enable row level security;

drop policy if exists "case notes readable by author or firm" on public.case_notes;
create policy "case notes readable by author or firm" on public.case_notes
  for select using (
    author_user_id = auth.uid()
    or (visibility = 'firm' and public.can_access_case_row(author_user_id, firm_id))
    or public.is_admin()
  );

-- Insert requires the author to be able to read the case (service_requests
-- row) it is filed against: a participant (requester/assignee — the same two
-- columns `service_requests`' own base policy tests) or, since
-- 20260903_phase2, an active member of the firm that owns it. Mirrors the
-- shape of "client notes insertable by author" exactly, substituting
-- `service_requests` for `lawyer_clients`.
drop policy if exists "case notes insertable by author" on public.case_notes;
create policy "case notes insertable by author" on public.case_notes
  for insert with check (
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
  );

drop policy if exists "case notes updatable by author" on public.case_notes;
create policy "case notes updatable by author" on public.case_notes
  for update using (author_user_id = auth.uid()) with check (author_user_id = auth.uid());

drop policy if exists "case notes deletable by author" on public.case_notes;
create policy "case notes deletable by author" on public.case_notes
  for delete using (author_user_id = auth.uid());
