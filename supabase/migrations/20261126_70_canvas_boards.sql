-- =============================================================================
-- Migration: 20261126_70_canvas_boards.sql
-- =============================================================================
-- PURPOSE (owner package 17 Nov 2026, P1-32 «لوحات متعددة للجراف»)
--   A case's map (خريطة القضية) was ONE board per case: public.case_graphs,
--   primary-keyed on case_request_id. That row stays exactly as it is and is
--   the case's DEFAULT board («اللوحة الرئيسية»). This file adds
--   public.canvas_boards: further NAMED boards of the same case (e.g. «خريطة
--   الأطراف», «تسلسل زمني»), each with its own nodes / edges / viewport.
--
--   Access is the case map's own rule, copied from case_graphs (20260903
--   phase 1) and the two later restrictive layers that apply to it:
--     - read / update: can_access_case_row(owner_user_id, firm_id) (owner or
--       an active member of the row's firm), admins read;
--     - insert: the writer is the owner; delete: the owner only;
--     - restrictive: firm_id must be the writer's firm (can_write_firm_row,
--       20261122_31) and a restricted case is visible to its team only
--       (case_visible, 20261125_40).
--   No function is created or re-created here: the three helpers are used as
--   their latest migrations define them.
--
--   At most 20 named boards per case (a trigger; the API says so first).
--   A name is 1–80 characters and unique within its case.
--
-- HOW TO RUN (before the deploy that ships the boards API; the old code never
--   reads this table, so it is safe any time before):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261126_70_canvas_boards.sql
--   Expect: NOTICE  20261126_70 verify: OK  and a `step | ok` row with `t`.
--
-- RUN ORDER: after 20261122_31 and 20261125_40 (both already on prod);
--   BEFORE the deploy.
--
-- ROLLBACK (drops the named boards; the default boards in case_graphs are
--   untouched):
--   drop table if exists public.canvas_boards cascade;
--   drop function if exists public.canvas_boards_cap();
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.case_graphs') is null or to_regclass('public.service_requests') is null then
    raise exception '20261126_70: run 20260903_phase1_case_tables.sql first';
  end if;
  if to_regprocedure('public.can_access_case_row(uuid, uuid)') is null then
    raise exception '20261126_70: public.can_access_case_row(uuid, uuid) is missing — run the phase 1 / phase 2 migrations first';
  end if;
  if to_regprocedure('public.can_write_firm_row(uuid)') is null then
    raise exception '20261126_70: run 20261122_31_firm_row_write_check.sql first';
  end if;
  if to_regprocedure('public.case_visible(text)') is null then
    raise exception '20261126_70: run 20261125_40_restricted_cases.sql first';
  end if;
end
$pre$;

-- ── 1. the table ─────────────────────────────────────────────────────────────
create table if not exists public.canvas_boards (
  id              uuid primary key default gen_random_uuid(),
  case_request_id text not null references public.service_requests(id) on delete cascade,
  firm_id         uuid references public.firm_profiles(id) on delete set null,
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  nodes           jsonb not null default '[]'::jsonb check (jsonb_typeof(nodes) = 'array'),
  edges           jsonb not null default '[]'::jsonb check (jsonb_typeof(edges) = 'array'),
  viewport        jsonb not null default '{}'::jsonb check (jsonb_typeof(viewport) = 'object'),
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint canvas_boards_case_name_unique unique (case_request_id, name)
);

comment on table public.canvas_boards is
  'P1-32: named extra boards of a case map. The default board stays in case_graphs (one per case).';

create index if not exists idx_canvas_boards_case  on public.canvas_boards (case_request_id, created_at);
create index if not exists idx_canvas_boards_owner on public.canvas_boards (owner_user_id);
create index if not exists idx_canvas_boards_firm  on public.canvas_boards (firm_id);

drop trigger if exists trg_canvas_boards_updated_at on public.canvas_boards;
create trigger trg_canvas_boards_updated_at before update on public.canvas_boards
  for each row execute function public.handle_updated_at();

-- ── 2. at most 20 named boards per case ──────────────────────────────────────
create or replace function public.canvas_boards_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  -- one writer at a time per case, so two inserts cannot both pass the count
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('canvas_boards:' || new.case_request_id));
  if (select pg_catalog.count(*) from public.canvas_boards b where b.case_request_id = new.case_request_id) >= 20 then
    raise exception 'canvas_boards: at most 20 boards per case' using errcode = 'P0001', hint = 'board_limit';
  end if;
  return new;
end
$fn$;

revoke all on function public.canvas_boards_cap() from public;
do $g$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.canvas_boards_cap() from %I', r);
    end if;
  end loop;
end
$g$;

drop trigger if exists trg_canvas_boards_cap on public.canvas_boards;
create trigger trg_canvas_boards_cap before insert on public.canvas_boards
  for each row execute function public.canvas_boards_cap();

-- ── 3. grants and RLS ────────────────────────────────────────────────────────
alter table public.canvas_boards enable row level security;

do $g$
declare r text;
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.canvas_boards from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'grant select, insert, update, delete on table public.canvas_boards to authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.canvas_boards to service_role';
  end if;
end
$g$;

drop policy if exists "canvas board readable by owner or firm" on public.canvas_boards;
create policy "canvas board readable by owner or firm" on public.canvas_boards
  for select using (public.can_access_case_row(owner_user_id, firm_id) or public.is_admin());

drop policy if exists "canvas board insertable by owner" on public.canvas_boards;
create policy "canvas board insertable by owner" on public.canvas_boards
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "canvas board updatable by owner or firm" on public.canvas_boards;
create policy "canvas board updatable by owner or firm" on public.canvas_boards
  for update using (public.can_access_case_row(owner_user_id, firm_id))
          with check (public.can_access_case_row(owner_user_id, firm_id));

drop policy if exists "canvas board deletable by owner" on public.canvas_boards;
create policy "canvas board deletable by owner" on public.canvas_boards
  for delete using (owner_user_id = auth.uid());

-- restrictive layers (same as case_graphs)
drop policy if exists "firm_id is the writer's firm (insert)" on public.canvas_boards;
create policy "firm_id is the writer's firm (insert)" on public.canvas_boards
  as restrictive for insert with check (public.can_write_firm_row(firm_id));

drop policy if exists "firm_id is the writer's firm (update)" on public.canvas_boards;
create policy "firm_id is the writer's firm (update)" on public.canvas_boards
  as restrictive for update using (true) with check (public.can_write_firm_row(firm_id));

drop policy if exists "restricted case rows: case team only" on public.canvas_boards;
create policy "restricted case rows: case team only" on public.canvas_boards
  as restrictive for select to authenticated
  using (case_request_id is null or public.case_visible(case_request_id));

-- ── 4. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  pname text;
begin
  if to_regclass('public.canvas_boards') is null then
    raise exception '20261126_70 verify: table missing';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.canvas_boards'::regclass) then
    missing := missing || ' RLS off;';
  end if;
  foreach pname in array array[
    'canvas board readable by owner or firm', 'canvas board insertable by owner',
    'canvas board updatable by owner or firm', 'canvas board deletable by owner',
    'firm_id is the writer''s firm (insert)', 'firm_id is the writer''s firm (update)',
    'restricted case rows: case team only'
  ] loop
    if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.canvas_boards'::regclass and polname = pname) then
      missing := missing || pg_catalog.format(' policy «%s» missing;', pname);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_policy
              where polrelid = 'public.canvas_boards'::regclass and polpermissive = false
                and polname like 'firm_id is the writer%'
                and pg_catalog.pg_get_expr(polwithcheck, polrelid) not ilike '%can_write_firm_row(firm_id)%') then
    missing := missing || ' firm write check wrong;';
  end if;
  if not exists (select 1 from pg_catalog.pg_trigger
                  where tgrelid = 'public.canvas_boards'::regclass and tgname = 'trg_canvas_boards_cap' and not tgisinternal) then
    missing := missing || ' cap trigger missing;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and pg_catalog.has_table_privilege('anon', 'public.canvas_boards', 'select') then
    missing := missing || ' anon can read;';
  end if;
  if missing <> '' then
    raise exception '20261126_70 verify:%', missing;
  end if;
  raise notice '20261126_70 verify: OK';
end
$verify$;

commit;

select '20261126_70 canvas_boards (named case boards, RLS as case_graphs)' as step,
       to_regclass('public.canvas_boards') is not null
       and (select pg_catalog.count(*) from pg_catalog.pg_policy where polrelid = 'public.canvas_boards'::regclass) = 7 as ok;
