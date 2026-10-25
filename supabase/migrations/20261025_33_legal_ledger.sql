-- =============================================================================
-- Migration: 20261025_33_legal_ledger.sql
-- Plan: docs/plans/2026-10-25-owner-free-phases-plan.md, P4 item N3.7.
-- Owner intent: package 2026-10-22 §٤٥ axis 1 («سجل الصادر والوارد الرقمي
-- والتايم لاين التفاعلي»: الاتجاه صادر/وارد، قنوات التسليم واتساب، بريد
-- إلكتروني، تسليم يدوي، ناجز، بريد مسجل؛ تايم لاين بملف كل قضية مع «إضافة
-- قيد صادر / وارد») and §٤٧ part ٢ (quick add item «قيد صادر أو وارد»).
-- =============================================================================
--
-- WHAT CHANGES
--   1. public.legal_ledger_entries — one document or letter that left the
--      office (out) or reached it (in), on one case:
--        case_request_id  text FK to service_requests(id), ON DELETE CASCADE
--        firm_id          the CASE's firm (NULL on a solo case) — pinned by
--                         RLS, never chosen by the writer
--        created_by       the writer (ON DELETE SET NULL: a firm keeps its
--                         register when a member's account goes)
--        direction        in | out
--        channel          whatsapp | email | hand | najiz | registered_mail
--        title            1..300 characters; notes ≤ 4000
--        occurred_at      when it was sent or received (an instant)
--        archived_at      soft removal — see 4
--
--   2. RLS, TO authenticated, "the same as case rows" (hearings, case_stages):
--        SELECT  the writer, or an active member of the entry's firm
--                (can_access_case_row(created_by, firm_id));
--        INSERT  created_by = auth.uid() and case_row_scope_ok(case_request_id,
--                firm_id) (20261025_31): the writer works on the case — on a
--                firm case an ACTIVE member of its firm, never a free-text
--                assignee or the client — and firm_id is the case's own firm.
--                No row can be planted into another firm's register or case.
--        UPDATE  the writer, WITH CHECK the same scope rule on the NEW row: a
--                writer who has since left the firm cannot keep editing it.
--
--   3. Privileges: anon none. authenticated SELECT; INSERT on the writable
--      columns; UPDATE on direction, channel, title, notes, occurred_at and
--      archived_at ONLY — case_request_id, firm_id and created_by cannot move
--      (the 20261025_30 §5 lesson: a USING-only check on the old row lets a
--      writer move his row anywhere).
--
--   4. NO DELETE for sessions (owner directive 5, «حظر الحذف النهائي»): an
--      entry in the outgoing/incoming register is archived (archived_at) by
--      its writer, and the app hides archived entries by default. The row and
--      its history stay. A real removal is an operator's act (service_role).
--
-- IDEMPOTENT: create … if not exists; drop policy if exists; revoke/grant
-- repeatable. Run twice in Docker by supabase/tests/rls/legal_ledger.test.sql.
--
-- ROLLBACK (manual): drop table public.legal_ledger_entries.
-- =============================================================================

begin;

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.case_row_scope_ok(text,uuid)') is null then
    raise exception '20261025_33: public.case_row_scope_ok(text, uuid) is missing — apply 20261025_31_dashboard_notes.sql first';
  end if;
  if to_regprocedure('public.can_access_case_row(uuid,uuid)') is null then
    raise exception '20261025_33: public.can_access_case_row(uuid, uuid) is missing — apply 20260903_phase1_case_tables.sql first';
  end if;
end $$;


-- ── 1. The table ─────────────────────────────────────────────────────────────
create table if not exists public.legal_ledger_entries (
  id               uuid primary key default gen_random_uuid(),
  case_request_id  text not null references public.service_requests(id) on delete cascade,
  firm_id          uuid references public.firm_profiles(id) on delete set null,
  created_by       uuid references auth.users(id) on delete set null,
  direction        text not null check (direction in ('in', 'out')),
  channel          text not null check (channel in ('whatsapp', 'email', 'hand', 'najiz', 'registered_mail')),
  title            text not null check (length(btrim(title)) > 0 and length(title) <= 300),
  notes            text not null default '' check (length(notes) <= 4000),
  occurred_at      timestamptz not null default now(),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.legal_ledger_entries is
  'سجل الصادر والوارد القانوني (N3.7، المالك §٤٥ المحور ١): مستند أو مراسلة خرجت من المكتب (out) أو وردت إليه (in) على قضية، بقناة التسليم. firm_id هو مكتب القضية. لا حذف من الجلسات — أرشفة فقط (archived_at).';

create index if not exists idx_ledger_case    on public.legal_ledger_entries (case_request_id, occurred_at desc);
create index if not exists idx_ledger_firm    on public.legal_ledger_entries (firm_id, occurred_at desc) where firm_id is not null;
create index if not exists idx_ledger_creator on public.legal_ledger_entries (created_by, occurred_at desc);

drop trigger if exists trg_legal_ledger_entries_updated_at on public.legal_ledger_entries;
create trigger trg_legal_ledger_entries_updated_at before update on public.legal_ledger_entries
  for each row execute function public.handle_updated_at();

alter table public.legal_ledger_entries enable row level security;


-- ── 2. Policies ──────────────────────────────────────────────────────────────
drop policy if exists "ledger readable by writer or firm" on public.legal_ledger_entries;
create policy "ledger readable by writer or firm" on public.legal_ledger_entries
  for select to authenticated
  using (public.can_access_case_row(created_by, firm_id));

drop policy if exists "ledger insertable by case workers" on public.legal_ledger_entries;
create policy "ledger insertable by case workers" on public.legal_ledger_entries
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and archived_at is null
    and public.case_row_scope_ok(case_request_id, firm_id)
  );

drop policy if exists "ledger updatable by writer" on public.legal_ledger_entries;
create policy "ledger updatable by writer" on public.legal_ledger_entries
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid() and public.case_row_scope_ok(case_request_id, firm_id));


-- ── 3 + 4. Privileges (no DELETE for sessions) ──────────────────────────────
revoke all on public.legal_ledger_entries from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on public.legal_ledger_entries from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.legal_ledger_entries from authenticated;
    grant select on public.legal_ledger_entries to authenticated;
    grant insert (id, case_request_id, firm_id, created_by, direction, channel, title, notes, occurred_at)
      on public.legal_ledger_entries to authenticated;
    grant update (direction, channel, title, notes, occurred_at, archived_at)
      on public.legal_ledger_entries to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all on public.legal_ledger_entries to service_role;
  end if;
end $$;


-- ── 5. Verify (raises) ───────────────────────────────────────────────────────
do $$
declare n int; bad text; col text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.legal_ledger_entries'::regclass) then
    raise exception '20261025_33 verify: RLS is off on public.legal_ledger_entries';
  end if;
  select count(*) into n from pg_policy where polrelid = 'public.legal_ledger_entries'::regclass;
  if n <> 3 then
    raise exception '20261025_33 verify: legal_ledger_entries carries % policies, expected 3 (select, insert, update)', n;
  end if;
  if exists (select 1 from pg_policy where polrelid = 'public.legal_ledger_entries'::regclass and polcmd in ('d', '*')) then
    raise exception '20261025_33 verify: a DELETE (or ALL) policy exists on legal_ledger_entries';
  end if;
  select string_agg(p.polname, ', ') into bad
    from pg_policy p
   where p.polrelid = 'public.legal_ledger_entries'::regclass
     and p.polcmd in ('a', 'w')
     and coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') !~ 'case_row_scope_ok';
  if bad is not null then
    raise exception '20261025_33 verify: write policies without case_row_scope_ok: %', bad;
  end if;
  select string_agg(p.polname, ', ') into bad
    from pg_policy p
   where p.polrelid = 'public.legal_ledger_entries'::regclass
     and (p.polroles = '{0}'::oid[] or not ('authenticated'::regrole::oid = any (p.polroles)));
  if bad is not null then
    raise exception '20261025_33 verify: ledger policies not scoped to authenticated: %', bad;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if has_table_privilege('authenticated', 'public.legal_ledger_entries', 'DELETE')
       or has_table_privilege('authenticated', 'public.legal_ledger_entries', 'TRUNCATE') then
      raise exception '20261025_33 verify: authenticated can DELETE/TRUNCATE ledger entries';
    end if;
    foreach col in array array['case_request_id', 'firm_id', 'created_by'] loop
      if has_column_privilege('authenticated', 'public.legal_ledger_entries', col, 'UPDATE') then
        raise exception '20261025_33 verify: authenticated can UPDATE legal_ledger_entries.%', col;
      end if;
    end loop;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon')
     and has_table_privilege('anon', 'public.legal_ledger_entries', 'SELECT') then
    raise exception '20261025_33 verify: anon can read the ledger';
  end if;
  raise notice '20261025_33 verify: OK — legal_ledger_entries: 3 authenticated policies, case_row_scope_ok on every write, case/firm/writer immovable, no session DELETE, no guest privilege';
end $$;

commit;
notify pgrst, 'reload schema';
