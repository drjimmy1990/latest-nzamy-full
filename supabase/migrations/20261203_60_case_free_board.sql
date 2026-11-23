-- =============================================================================
-- Migration: 20261203_60_case_free_board.sql
-- =============================================================================
-- PURPOSE (owner answer ١٨٩ (ب), 22 Nov 2026 — batch l13-canvas)
--   «اللوحة الحرة تُضاف تبويبًا بجانب الخريطة (الخريطة تبقى)»: a new tab «لوحة»
--   beside the case map on the lawyer and firm case files — one free board per
--   case: cards (title, text, colour, position) and the lines that connect
--   them. The case map (case_graphs / canvas_boards) is not touched.
--
--   public.case_free_boards: one row per case, primary-keyed on the case id,
--   deleted with the case (ON DELETE CASCADE).
--
-- WHO SEES / EDITS A BOARD — the case's own rule:
--   public.case_board_open(case_id) is true when BOTH hold:
--     1. the caller can read the case row itself. The function is SECURITY
--        INVOKER, so this read goes through every policy on service_requests
--        as they stand — the requester / assignee / firm / company arms and
--        the restrictive layers (restricted case → its team only; firm
--        trainee / secretary → assigned cases only; finance manager → no case
--        files). Whatever later narrows who opens a case narrows the board too.
--     2. the caller works on the case: public.is_case_worker(case_id)
--        (20261025_31) — an active member or the owner of the case's firm, or
--        on a solo case its assignee or a lawyer / firm-account filer. This is
--        what keeps the board a working board of the lawyers: the client who
--        filed the request can read the request, but not this board.
--   Read, create and edit all use that one rule. There is no DELETE privilege:
--   a board is emptied by editing it, and goes away with its case.
--   created_by / updated_by are the session user (WITH CHECK); case_request_id
--   and created_by cannot be updated (column privileges).
--
-- LIMITS: at most 300 cards and 600 lines, 1 MB for both together (the API
--   checks the shape first and refuses earlier, with a clear message).
--
-- HOW TO RUN (BEFORE the deploy that ships the «لوحة» tab — the old code never
--   reads this table, so any time before is safe):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261203_60_case_free_board.sql
--   Expect: NOTICE  20261203_60 verify: OK  and a `migration | bool` row with `t`.
--   Idempotent: safe to run twice.
--
-- PREREQUISITES (all already on prod): 20260903_phase1 (service_requests),
--   20261025_31 (is_case_worker), 20261125_40 (case_visible).
--
-- ROLLBACK (drops every free board; the case map is untouched):
--   drop table if exists public.case_free_boards cascade;
--   drop function if exists public.case_board_open(text);
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.service_requests') is null then
    raise exception '20261203_60: public.service_requests is missing';
  end if;
  if to_regprocedure('public.is_case_worker(text)') is null then
    raise exception '20261203_60: public.is_case_worker(text) is missing — run 20261025_31_dashboard_notes.sql first';
  end if;
  if to_regprocedure('public.case_visible(text)') is null then
    raise exception '20261203_60: public.case_visible(text) is missing — run 20261125_40_restricted_cases.sql first';
  end if;
  if to_regprocedure('public.handle_updated_at()') is null then
    raise exception '20261203_60: public.handle_updated_at() is missing';
  end if;
end
$pre$;

-- ── 1. the access rule ───────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose (see the header): the service_requests read is
-- the caller's own, under that table's policies.
create or replace function public.case_board_open(p_request text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $fn$
  select p_request is not null
     and exists (select 1 from public.service_requests sr where sr.id = p_request)
     and coalesce(public.is_case_worker(p_request), false);
$fn$;

comment on function public.case_board_open(text) is
  '20261203_60 (owner ١٨٩): the caller may open case p_request''s free board — he can read the case row under its own policies (invoker) AND works on the case (is_case_worker). Never the client side.';

revoke all on function public.case_board_open(text) from public;
do $g$
declare r text;
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on function public.case_board_open(text) from anon';
  end if;
  foreach r in array array['authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('grant execute on function public.case_board_open(text) to %I', r);
    end if;
  end loop;
end
$g$;

-- ── 2. the table ─────────────────────────────────────────────────────────────
create table if not exists public.case_free_boards (
  case_request_id text primary key references public.service_requests(id) on delete cascade,
  cards           jsonb not null default '[]'::jsonb,
  links           jsonb not null default '[]'::jsonb,
  created_by      uuid references auth.users(id) on delete set null,
  updated_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint case_free_boards_cards_array check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) <= 300),
  constraint case_free_boards_links_array check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 600),
  constraint case_free_boards_size check (pg_column_size(cards) + pg_column_size(links) <= 1048576)
);

comment on table public.case_free_boards is
  '20261203_60 (owner ١٨٩): the free board («لوحة») of a case, beside the case map. Access: case_board_open(case_request_id).';

drop trigger if exists trg_case_free_boards_updated_at on public.case_free_boards;
create trigger trg_case_free_boards_updated_at before update on public.case_free_boards
  for each row execute function public.handle_updated_at();

-- ── 3. privileges: read; insert and update the board's own columns only ──────
alter table public.case_free_boards enable row level security;

do $g$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    execute 'revoke all on table public.case_free_boards from anon';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    execute 'revoke all on table public.case_free_boards from authenticated';
    execute 'grant select on table public.case_free_boards to authenticated';
    execute 'grant insert (case_request_id, cards, links, created_by, updated_by) on table public.case_free_boards to authenticated';
    execute 'grant update (cards, links, updated_by) on table public.case_free_boards to authenticated';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute 'grant all on table public.case_free_boards to service_role';
  end if;
end
$g$;

-- ── 4. policies ──────────────────────────────────────────────────────────────
drop policy if exists "free board: case workers read" on public.case_free_boards;
create policy "free board: case workers read" on public.case_free_boards
  for select to authenticated
  using (public.case_board_open(case_request_id));

drop policy if exists "free board: case workers create" on public.case_free_boards;
create policy "free board: case workers create" on public.case_free_boards
  for insert to authenticated
  with check (public.case_board_open(case_request_id)
              and created_by = auth.uid()
              and updated_by = auth.uid());

drop policy if exists "free board: case workers edit" on public.case_free_boards;
create policy "free board: case workers edit" on public.case_free_boards
  for update to authenticated
  using (public.case_board_open(case_request_id))
  with check (public.case_board_open(case_request_id) and updated_by = auth.uid());

-- the same restrictive layer every case child table carries (20261125_40)
drop policy if exists "restricted case rows: case team only" on public.case_free_boards;
create policy "restricted case rows: case team only" on public.case_free_boards
  as restrictive for select to authenticated
  using (public.case_visible(case_request_id));

-- ── 5. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  missing text := '';
  pname text;
begin
  if to_regclass('public.case_free_boards') is null then
    raise exception '20261203_60 verify: table missing';
  end if;
  if not coalesce((select relrowsecurity from pg_catalog.pg_class where oid = 'public.case_free_boards'::regclass), false) then
    missing := missing || ' RLS off;';
  end if;
  foreach pname in array array[
    'free board: case workers read', 'free board: case workers create',
    'free board: case workers edit', 'restricted case rows: case team only'
  ] loop
    if not exists (select 1 from pg_catalog.pg_policy where polrelid = 'public.case_free_boards'::regclass and polname = pname) then
      missing := missing || pg_catalog.format(' policy «%s» missing;', pname);
    end if;
  end loop;
  if (select pg_catalog.count(*) from pg_catalog.pg_policy where polrelid = 'public.case_free_boards'::regclass) <> 4 then
    missing := missing || ' unexpected policy count;';
  end if;
  if coalesce(pg_catalog.strpos(pg_catalog.pg_get_functiondef(to_regprocedure('public.case_board_open(text)')), 'is_case_worker') > 0, false) is not true
     or coalesce((select p.prosecdef from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.case_board_open(text)')), true) then
    missing := missing || ' case_board_open wrong (must be invoker and call is_case_worker);';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     and (pg_catalog.has_table_privilege('anon', 'public.case_free_boards', 'select')
          or pg_catalog.has_table_privilege('anon', 'public.case_free_boards', 'insert')) then
    missing := missing || ' anon has a grant;';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and (pg_catalog.has_table_privilege('authenticated', 'public.case_free_boards', 'delete')
          or pg_catalog.has_column_privilege('authenticated', 'public.case_free_boards', 'case_request_id', 'update')
          or pg_catalog.has_column_privilege('authenticated', 'public.case_free_boards', 'created_by', 'update')) then
    missing := missing || ' authenticated can delete or move a board;';
  end if;
  if missing <> '' then
    raise exception '20261203_60 verify:%', missing;
  end if;
  raise notice '20261203_60 verify: OK';
end
$verify$;

commit;

select '20261203_60 case_free_boards: the «لوحة» tab beside the case map, case workers who can open the case only' as migration, true;
