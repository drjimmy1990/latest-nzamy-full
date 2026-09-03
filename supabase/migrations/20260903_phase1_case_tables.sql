-- =============================================================================
-- Migration: 20260903_phase1_case_tables.sql
-- Phase:     1 — الجداول الأساسية  (خطة_البناء_الكاملة_٢٠٢٦-٠٩-٠٢.md §5)
-- Purpose:   Give hearings, tasks, litigation stages, activity and the case
--            graph tables of their own, instead of jsonb flags on one row.
--
-- Opens (matrix rows): 2 · 7 · 8 · 9 · 65 · 66 · 67 · 68 · 70 · 71 · 72 · 73
--                      · 74 · 82 · 181
--
-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT THIS REPLACES
-- ─────────────────────────────────────────────────────────────────────────────
-- Today every hearing, task and client is a row in `public.service_requests`
-- with a flag in `metadata`: {hearing:true} / {task:true} / {client:true}. The
-- cases screen then identifies a case BY EXCLUSION — anything without a known
-- flag — so any new kind of row appears in the lawyer's case list by accident.
--
-- Consequences visible in the owner's screenshots:
--   • the case graph does not survive a reload (nowhere to store it)
--   • «مُسندة إلى محامٍ» cannot name the lawyer (no join to a profile)
--   • a task's subtasks live in jsonb, so progress cannot be computed in SQL
--   • the activity log is a static array
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 1 — WHAT A CASE *IS*, AND WHY IT IS NOT `public.cases`
-- ─────────────────────────────────────────────────────────────────────────────
-- There are two candidate case tables in this database, and the screens do not
-- agree about which one they read:
--
--   public.cases           read by /api/v1/cases → casesService.getCases()
--   public.service_requests read by /api/v1/service-requests → the lawyer's
--                           case file, the client's «قضاياي», and all 11
--                           intake paths
--
-- `public.cases` was checked across the whole repository: THREE SELECTs
-- (api/v1/cases/route.ts:29, api/v1/cases/[id]/route.ts:24,
-- api/v1/admin/erp/route.ts:22) and **ZERO INSERTs or UPDATEs**. Nothing has
-- ever written a row to it, so anything reading it gets an empty list forever
-- — not because the platform has no cases, but because no code path fills the
-- table it reads. (Reported to the owner separately; it is a finding, not
-- something this migration silently repairs.)
--
-- Therefore the anchor here is `service_requests(id)` — a TEXT primary key with
-- no default, minted by `createWorkflowId()` at each of the 11 intake paths.
-- Every new table below references it as `case_request_id text`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 2 — WHO OWNS A ROW (RLS), FROM DAY ONE
-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2's acceptance test is «a lawyer from another firm does NOT see it», so
-- the firm scope is built in now rather than retrofitted. But six of the live
-- lawyer accounts are SOLO — they have no `firm_members` row at all — and a
-- firm-only policy would lock every one of them out of their own work.
--
-- So a row is reachable when EITHER holds:
--   • owner_user_id = auth.uid()                    ← the solo lawyer
--   • firm_id is one of the caller's ACTIVE firms   ← the firm colleague
--
-- `public.can_access_case_row()` is SECURITY DEFINER for the same reason
-- `is_group_member_or_owner` is (migration 20260625): reading `firm_members`
-- from inside a policy on a table that `firm_members` policies can reach is how
-- infinite recursion starts.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DECISION 3 — NO DATA MIGRATION
-- ─────────────────────────────────────────────────────────────────────────────
-- Per the plan §17 step 3: no copy, no import. The existing metadata-flagged
-- rows stay exactly where they are and keep working until the screens are
-- rewired table by table. These tables start empty. That is only safe because
-- the owner has confirmed there are no real customers and the transactional
-- rows are disposable — it is NOT a pattern to repeat later.
--
-- ⚠️ NOTHING IS DROPPED BY THIS FILE. No `drop table`, no `truncate`, no
--    `delete`. The legal library (386 laws · 13,436 articles), the 18 auth
--    accounts and the blog content are untouched.
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- 0. Shared helpers
-- ═════════════════════════════════════════════════════════════════════════════

-- Already defined by 20260603_phase1_001_profiles.sql; repeated idempotently so
-- this file can be read and applied on its own.
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

/**
 * True when the caller may read/write a row owned by `p_owner` and scoped to
 * firm `p_firm`.
 *
 * Solo lawyers pass on the first arm (they own the row and have no firm).
 * Firm colleagues pass on the second — but only while their membership is
 * `active`, so a removed or suspended member loses access without any row
 * being rewritten.
 *
 * SECURITY DEFINER: reads `firm_members`, which has policies of its own. A
 * plain subquery inside a policy would recurse (see 20260625).
 */
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

comment on function public.can_access_case_row(uuid, uuid) is
  'Row reachable by its owner (solo lawyer) or by an ACTIVE member of its firm. SECURITY DEFINER to avoid RLS recursion through firm_members.';


-- ═════════════════════════════════════════════════════════════════════════════
-- 1. case_stages — درجات التقاضي (matrix row 7)
-- ═════════════════════════════════════════════════════════════════════════════
-- A case moves ابتدائي → استئناف → نقض → تنفيذ, and each degree has its own
-- court, its own case number and its own outcome. Today there is one status
-- field for all of it, which is why the case file cannot say which degree the
-- lawyer is arguing.
create table if not exists public.case_stages (
  id               uuid primary key default gen_random_uuid(),
  case_request_id  text not null references public.service_requests(id) on delete cascade,
  firm_id          uuid references public.firm_profiles(id) on delete set null,
  owner_user_id    uuid references auth.users(id) on delete set null,
  degree           text not null default 'first_instance'
                     check (degree in ('first_instance', 'appeal', 'cassation', 'execution')),
  court_name       text not null default '',
  court_case_no    text,
  circuit          text,
  judge_name       text,
  opened_on        date,
  closed_on        date,
  outcome          text check (outcome in ('pending', 'won', 'lost', 'partial', 'settled', 'withdrawn')),
  position         int  not null default 0,
  notes            text not null default '',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.case_stages is 'درجات التقاضي — one row per court degree of a case.';

create index if not exists idx_case_stages_case  on public.case_stages (case_request_id);
create index if not exists idx_case_stages_firm  on public.case_stages (firm_id);
create index if not exists idx_case_stages_owner on public.case_stages (owner_user_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 2. hearings — الجلسات والمواعيد (matrix rows 8, 66, 70)
-- ═════════════════════════════════════════════════════════════════════════════
-- `kind` is the split the owner asked for in row 70: a JUDICIAL hearing before
-- a court is not the same object as a professional appointment, even though
-- both sit on the same diary. They differ in what they require (a court, a
-- circuit, a case) and in what they produce (a محضر).
--
-- `hearing_date`/`hearing_time` are a WALL-CLOCK date and time, not an instant.
-- A hearing at 09:00 in Riyadh is 09:00 in Riyadh whatever the server's zone,
-- and storing it as timestamptz is how the diary drifts by a day.
create table if not exists public.hearings (
  id               uuid primary key default gen_random_uuid(),
  case_request_id  text references public.service_requests(id) on delete cascade,
  stage_id         uuid references public.case_stages(id) on delete set null,
  firm_id          uuid references public.firm_profiles(id) on delete set null,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  kind             text not null default 'appointment'
                     check (kind in ('judicial', 'appointment', 'deadline', 'gov_review', 'client_meet', 'internal')),
  title            text not null,
  hearing_date     date not null,
  hearing_time     time,
  duration_minutes int,
  location         text not null default '',
  court_name       text not null default '',
  urgency          text not null default 'normal'
                     check (urgency in ('low', 'normal', 'high', 'urgent')),
  status           text not null default 'scheduled'
                     check (status in ('scheduled', 'held', 'adjourned', 'cancelled')),
  -- محضر الجلسة (row 8): written after the hearing, empty before it.
  minutes          text not null default '',
  minutes_at       timestamptz,
  notes            text not null default '',
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.hearings is 'الجلسات والمواعيد. kind=judicial is a court hearing; the rest are professional diary entries (row 70).';
comment on column public.hearings.hearing_date is 'Wall-clock date, NOT an instant. A Riyadh hearing is a Riyadh date.';
comment on column public.hearings.case_request_id is 'Nullable: an appointment can exist before it belongs to a case (row 71 converts one into a case).';

create index if not exists idx_hearings_case     on public.hearings (case_request_id);
create index if not exists idx_hearings_owner    on public.hearings (owner_user_id);
create index if not exists idx_hearings_firm     on public.hearings (firm_id);
create index if not exists idx_hearings_date     on public.hearings (hearing_date);
-- The diary's hot query: "my next hearings, soonest first".
create index if not exists idx_hearings_owner_date on public.hearings (owner_user_id, hearing_date)
  where status = 'scheduled';


-- ═════════════════════════════════════════════════════════════════════════════
-- 3. tasks + task_steps — المهام والمهام الفرعية (matrix rows 3, 72)
-- ═════════════════════════════════════════════════════════════════════════════
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  case_request_id  text references public.service_requests(id) on delete cascade,
  firm_id          uuid references public.firm_profiles(id) on delete set null,
  owner_user_id    uuid not null references auth.users(id) on delete cascade,
  assignee_user_id uuid references auth.users(id) on delete set null,
  title            text not null,
  description      text not null default '',
  status           text not null default 'todo'
                     check (status in ('todo', 'in_progress', 'done', 'archived')),
  priority         text not null default 'normal'
                     check (priority in ('low', 'normal', 'high', 'urgent')),
  category         text,
  due_date         date,
  completed_at     timestamptz,
  -- Kanban ordering. Without it a drag is remembered only until the next read.
  position         int not null default 0,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.tasks is 'مهام المحامي. status is the UI vocabulary (todo/in_progress/done/archived) — no mapping through the service_requests enum any more.';
comment on column public.tasks.case_request_id is 'Nullable: a task need not belong to a case.';

create index if not exists idx_tasks_case     on public.tasks (case_request_id);
create index if not exists idx_tasks_owner    on public.tasks (owner_user_id);
create index if not exists idx_tasks_assignee on public.tasks (assignee_user_id);
create index if not exists idx_tasks_firm     on public.tasks (firm_id);
create index if not exists idx_tasks_due      on public.tasks (due_date) where status <> 'done';
create index if not exists idx_tasks_board    on public.tasks (owner_user_id, status, position);

-- Subtasks. They were a jsonb array, so «٣ من ٥» had to be counted in the
-- browser and could not be filtered, sorted or aggregated in SQL.
create table if not exists public.task_steps (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  title       text not null,
  done        boolean not null default false,
  done_at     timestamptz,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.task_steps is 'المهام الفرعية — one row per subtask, so progress is a SQL count.';

create index if not exists idx_task_steps_task on public.task_steps (task_id, position);


-- ═════════════════════════════════════════════════════════════════════════════
-- 4. activity_events — سجل النشاط (matrix row 73)
-- ═════════════════════════════════════════════════════════════════════════════
-- `public.request_events` already records events against a service request.
-- This table is deliberately NOT that: request_events is the intake/order
-- audit trail with a fixed `event` vocabulary, and it cannot record work that
-- has no request — a hearing minute, a task moved on the board, a document
-- deleted. Both stay.
create table if not exists public.activity_events (
  id              bigserial primary key,
  case_request_id text references public.service_requests(id) on delete cascade,
  firm_id         uuid references public.firm_profiles(id) on delete set null,
  owner_user_id   uuid references auth.users(id) on delete set null,
  actor_user_id   uuid references auth.users(id) on delete set null,
  actor_name      text not null default '',
  kind            text not null,
  summary         text not null default '',
  subject_table   text,
  subject_id      text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.activity_events is 'سجل النشاط الحقيقي. Distinct from request_events, which is the intake audit trail and cannot record work that has no request.';

create index if not exists idx_activity_case    on public.activity_events (case_request_id, created_at desc);
create index if not exists idx_activity_owner   on public.activity_events (owner_user_id, created_at desc);
create index if not exists idx_activity_firm    on public.activity_events (firm_id, created_at desc);


-- ═════════════════════════════════════════════════════════════════════════════
-- 5. case_graphs — خريطة القضية (matrix row 2)
-- ═════════════════════════════════════════════════════════════════════════════
-- There is no table for this at all today, which is the whole of row 2: the
-- lawyer arranges the map and it is gone on the next load. One row per case —
-- the map IS the case's map, not a document you can have several of.
create table if not exists public.case_graphs (
  case_request_id text primary key references public.service_requests(id) on delete cascade,
  firm_id         uuid references public.firm_profiles(id) on delete set null,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  nodes           jsonb not null default '[]'::jsonb,
  edges           jsonb not null default '[]'::jsonb,
  viewport        jsonb not null default '{}'::jsonb,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.case_graphs is 'خريطة القضية — one row per case. Nodes/edges are the saved layout; without this table the map is lost on reload (row 2).';

create index if not exists idx_case_graphs_owner on public.case_graphs (owner_user_id);
create index if not exists idx_case_graphs_firm  on public.case_graphs (firm_id);


-- ═════════════════════════════════════════════════════════════════════════════
-- 6. updated_at triggers
-- ═════════════════════════════════════════════════════════════════════════════
drop trigger if exists trg_case_stages_updated_at on public.case_stages;
create trigger trg_case_stages_updated_at before update on public.case_stages
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_hearings_updated_at on public.hearings;
create trigger trg_hearings_updated_at before update on public.hearings
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at before update on public.tasks
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_task_steps_updated_at on public.task_steps;
create trigger trg_task_steps_updated_at before update on public.task_steps
  for each row execute function public.handle_updated_at();

drop trigger if exists trg_case_graphs_updated_at on public.case_graphs;
create trigger trg_case_graphs_updated_at before update on public.case_graphs
  for each row execute function public.handle_updated_at();


-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Row Level Security
-- ═════════════════════════════════════════════════════════════════════════════
alter table public.case_stages     enable row level security;
alter table public.hearings        enable row level security;
alter table public.tasks           enable row level security;
alter table public.task_steps      enable row level security;
alter table public.activity_events enable row level security;
alter table public.case_graphs     enable row level security;

-- ── case_stages ──────────────────────────────────────────────────────────────
drop policy if exists "case stages readable by owner or firm"  on public.case_stages;
create policy "case stages readable by owner or firm" on public.case_stages
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());

drop policy if exists "case stages insertable by owner"        on public.case_stages;
create policy "case stages insertable by owner" on public.case_stages
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "case stages updatable by owner or firm" on public.case_stages;
create policy "case stages updatable by owner or firm" on public.case_stages
  for update using (public.can_access_case_row(owner_user_id, firm_id))
          with check (public.can_access_case_row(owner_user_id, firm_id));

drop policy if exists "case stages deletable by owner"         on public.case_stages;
create policy "case stages deletable by owner" on public.case_stages
  for delete using (owner_user_id = auth.uid());

-- ── hearings ─────────────────────────────────────────────────────────────────
drop policy if exists "hearings readable by owner or firm"  on public.hearings;
create policy "hearings readable by owner or firm" on public.hearings
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());

drop policy if exists "hearings insertable by owner"        on public.hearings;
create policy "hearings insertable by owner" on public.hearings
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "hearings updatable by owner or firm" on public.hearings;
create policy "hearings updatable by owner or firm" on public.hearings
  for update using (public.can_access_case_row(owner_user_id, firm_id))
          with check (public.can_access_case_row(owner_user_id, firm_id));

drop policy if exists "hearings deletable by owner"         on public.hearings;
create policy "hearings deletable by owner" on public.hearings
  for delete using (owner_user_id = auth.uid());

-- ── tasks ────────────────────────────────────────────────────────────────────
-- The assignee is added to the read/update arms: a task handed to a colleague
-- that the colleague cannot open is not an assignment.
drop policy if exists "tasks readable by owner firm or assignee"  on public.tasks;
create policy "tasks readable by owner firm or assignee" on public.tasks
  for select using (
    public.can_access_case_row(owner_user_id, firm_id)
    or assignee_user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "tasks insertable by owner"                 on public.tasks;
create policy "tasks insertable by owner" on public.tasks
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "tasks updatable by owner firm or assignee" on public.tasks;
create policy "tasks updatable by owner firm or assignee" on public.tasks
  for update using (
    public.can_access_case_row(owner_user_id, firm_id) or assignee_user_id = auth.uid()
  ) with check (
    public.can_access_case_row(owner_user_id, firm_id) or assignee_user_id = auth.uid()
  );

drop policy if exists "tasks deletable by owner"                  on public.tasks;
create policy "tasks deletable by owner" on public.tasks
  for delete using (owner_user_id = auth.uid());

-- ── task_steps ───────────────────────────────────────────────────────────────
-- A step is reachable exactly when its task is. Expressed as an EXISTS on
-- tasks so the rule lives in one place: change the task policy and the steps
-- follow, instead of two rules drifting apart.
drop policy if exists "task steps follow their task" on public.task_steps;
create policy "task steps follow their task" on public.task_steps
  for select using (
    exists (select 1 from public.tasks t where t.id = task_steps.task_id)
  );

drop policy if exists "task steps writable with their task" on public.task_steps;
create policy "task steps writable with their task" on public.task_steps
  for all using (
    exists (select 1 from public.tasks t where t.id = task_steps.task_id)
  ) with check (
    exists (select 1 from public.tasks t where t.id = task_steps.task_id)
  );

-- ── activity_events ──────────────────────────────────────────────────────────
-- Read by owner/firm; INSERT only. There is deliberately no UPDATE and no
-- DELETE policy: an activity log that can be rewritten is not a log.
drop policy if exists "activity readable by owner or firm" on public.activity_events;
create policy "activity readable by owner or firm" on public.activity_events
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());

drop policy if exists "activity insertable by actor" on public.activity_events;
create policy "activity insertable by actor" on public.activity_events
  for insert with check (actor_user_id = auth.uid() or owner_user_id = auth.uid());

-- ── case_graphs ──────────────────────────────────────────────────────────────
drop policy if exists "case graph readable by owner or firm"  on public.case_graphs;
create policy "case graph readable by owner or firm" on public.case_graphs
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());

drop policy if exists "case graph insertable by owner"        on public.case_graphs;
create policy "case graph insertable by owner" on public.case_graphs
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "case graph updatable by owner or firm" on public.case_graphs;
create policy "case graph updatable by owner or firm" on public.case_graphs
  for update using (public.can_access_case_row(owner_user_id, firm_id))
          with check (public.can_access_case_row(owner_user_id, firm_id));

drop policy if exists "case graph deletable by owner"         on public.case_graphs;
create policy "case graph deletable by owner" on public.case_graphs
  for delete using (owner_user_id = auth.uid());


COMMIT;

-- =============================================================================
-- AFTER RUNNING THIS — what is true, and what is NOT yet
-- =============================================================================
--
-- ✅ The six tables exist, are empty, and are protected by RLS.
-- ✅ Nothing was dropped, deleted or moved. The old metadata-flagged rows are
--    exactly as they were and every screen keeps working unchanged.
--
-- ⛔ NOTHING CHANGES ON SCREEN YET. The screens still read `service_requests`.
--    Wiring them is the next commit, one surface at a time, per plan §17.
--
-- ⚠️ The plan's acceptance test — «a lawyer adds 60 tasks and sees 60» — will
--    still show 50 after this migration, and NOT because the tables are wrong.
--    `/api/v1/lawyer/tasks` has a hard `.limit(50)` with no total in the body
--    (documented at that route, lines 50-62). Lifting it changes the response
--    shape and must land together with its three call sites:
--      src/app/dashboard/lawyer/tasks/page.tsx:91
--      src/lib/services/lawyerTasksService.ts:96
--      src/app/dashboard/lawyer/cases/[id]/page.tsx:367
--    That is its own commit. Do not read «50» as a failed migration.
--
-- ── Verify it applied (safe, read-only) ──────────────────────────────────────
--
--   select table_name from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('hearings','tasks','task_steps',
--                         'case_stages','activity_events','case_graphs')
--    order by table_name;
--   -- expect exactly 6 rows
--
--   select tablename, count(*) as policies from pg_policies
--    where schemaname = 'public'
--      and tablename in ('hearings','tasks','task_steps',
--                        'case_stages','activity_events','case_graphs')
--    group by tablename order by tablename;
--   -- expect: activity_events 2 · case_graphs 4 · case_stages 4
--   --         hearings 4 · task_steps 2 · tasks 4
-- =============================================================================
