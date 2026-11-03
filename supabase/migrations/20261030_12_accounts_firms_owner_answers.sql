-- =============================================================================
-- Migration: 20261030_12_accounts_firms_owner_answers.sql
-- Owner answers ٣٠٧–٣١٣ (package 2026-10-30, developer-questions-299-321.csv;
-- option (أ) chosen in each). Ledger:
-- docs/audits/2026-10-30-owner-package-accounts-firms.md.
-- Builds on 20261026_70_account_deletion.sql (D6), which already enforces most
-- of them; this file closes what was still missing on the server.
-- =============================================================================
--
-- WHAT THIS FILE ADDS (idempotent; one transaction; lock_timeout 5s; nothing
-- existing is deleted or rewritten — only a new column is filled)
--
--   ٣٠٨  original_author_id on the four note tables the firm transfer moves
--        (case_notes, dashboard_notes, lawyer_client_notes, consultation_notes).
--        * No foreign key: it outlives the author's purge.
--        * Backfill: the author named by the firm_asset_transfers trail when the
--          note was already moved to a firm owner, else author_user_id. The
--          backfill runs with the tables' own triggers switched off inside this
--          transaction, so no note's «آخر تعديل» (updated_at) moves.
--        * Then NOT NULL, and trg_note_original_author: on INSERT it is the
--          author, whatever the writer sends; on UPDATE it never changes. So a
--          private note moved to the firm owner stays private (it is his now)
--          and still names who wrote it. No route sends the column.
--
--   ٣١٢  A consulting office (Art. 18): when a member is REMOVED, his hearings
--        and appointments (public.hearings, every kind), case stages and court
--        deadlines (deadlines.kind <> 'contract') stay in his name, and he keeps
--        seeing them (the owner arm of can_access_case_row). When his ACCOUNT
--        is deleted they move to the firm owner — where the Art. 18 guard
--        (20261019_21) keeps them read-only for a consultant: viewing and
--        keeping, not representation.
--        * Before this file that held only by accident, and only on the
--          owner's own session (the guard refused the move and
--          transfer_firm_assets swallowed it). A removal written by the service
--          role or an admin moved them to the consultant.
--        * "Consulting office" = the firm owner's lawyer_profiles.practice_kind
--          is 'consultant' — the one signal the platform has (the same one the
--          Art. 18 guard reads). No signup path creates such a firm today; how
--          a consulting office is marked is an open question in the ledger.
--        * How: firm_member_removed_transfer sets the transaction-local
--          setting nzamy.firm_transfer_reason = 'member_removed' around its
--          transfer_firm_assets call; firm_asset_specs' hearings / case_stages
--          / deadlines rows add a condition through
--          public.firm_court_rows_stay_with_member(firm). On the account-
--          deletion path the setting is empty, so everything moves (and the
--          purge's dry-run count still counts these rows).
--
--   ٣٠٧  public.account_deletion_owner_block() — authenticated, acts on
--        auth.uid() only: the kind of entity (firm / business / government /
--        ngo) whose ownership blocks the caller's own deletion, or null. The
--        settings panel explains the refusal before the user types anything.
--        (The refusal itself, the admin freeze and the suspended purge were
--        already enforced by 20261026_70.)
--
--   ٣١٠  payment_orders (the platform's tax invoices):
--        * BEFORE DELETE: a paid or refunded order that is not test mode
--          (live is not false) is never deleted — 42501 TAX_INVOICE_KEPT. The
--          account deletion never deleted one (user_id is ON DELETE SET NULL);
--          this makes "never" hold for every other path too.
--        * BEFORE UPDATE: metadata.buyer_snapshot, once written, is kept as it
--          is by every later write (a refund, a webhook); when it is first
--          written it also takes the buyer's national address
--          (profiles.national_address, 20261017_10) when one was given.
--        No expiry anywhere: nothing purges these rows.
--
--   ٣٠٩ / ٣١١ / ٣١٣ need no schema: already enforced by 20261026_70 (see the
--        ledger). The Docker test re-proves them.
--
-- RE-RUN ORDER: re-running 20261026_70 puts back its own firm_asset_specs and
--   firm_member_removed_transfer (٣١٢ falls back to the accident). Re-run this
--   file after it. _verify.sql (verify:accounts_firms_owner_answers) says so.
--
-- DEPLOY ORDER — EITHER ORDER. The code reads none of the new columns; the
--   settings route treats a missing account_deletion_owner_block as "no block"
--   and the database still refuses the request itself.
--
-- Docker: supabase/tests/rls/accounts_firms_owner_answers.test.sql.
--
-- ROLLBACK (manual; the column is a record — keep it):
--   drop trigger if exists trg_note_original_author on public.case_notes;  (and the other three)
--   drop trigger if exists trg_payment_orders_keep_tax_invoice on public.payment_orders;
--   drop function if exists public.account_deletion_owner_block();
--   then re-run 20261026_70 (its specs and removal trigger).
-- =============================================================================

begin;

set local lock_timeout = '5s';

-- ── 0. Prerequisites ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.account_deletion_requests') is null
     or to_regclass('public.firm_asset_transfers') is null
     or to_regprocedure('public.transfer_firm_assets(uuid, uuid, text, boolean)') is null
     or to_regprocedure('public.account_entity_owner_block(uuid)') is null then
    raise exception '20261030_12: 20261026_70_account_deletion.sql has not run here — run it first';
  end if;
  if to_regclass('public.deadlines') is not null
     and not public.account_column_exists('deadlines', 'kind') then
    raise exception '20261030_12: public.deadlines has no kind column — run 20260904_phase5_deadline_radar.sql / 20261019_21 first';
  end if;
end $$;


-- ── 1. ٣٠٨ original_author_id ────────────────────────────────────────────────
create or replace function public.note_original_author_pin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.original_author_id := new.author_user_id;
  else
    new.original_author_id := coalesce(old.original_author_id, old.author_user_id);
  end if;
  return new;
end;
$$;

comment on function public.note_original_author_pin() is
  '20261030_12 (owner ٣٠٨): a note''s original author is its author at insert and never changes — the firm transfer moves author_user_id to the firm owner, original_author_id keeps who wrote it.';

do $$
declare
  t       text;
  trg     record;
  off     text[];
  tg_name text;
  pending bigint;
begin
  foreach t in array array['case_notes', 'dashboard_notes', 'lawyer_client_notes', 'consultation_notes'] loop
    if to_regclass('public.' || t) is null or not public.account_column_exists(t, 'author_user_id') then
      raise notice '20261030_12: public.% (author_user_id) is not here — skipped', t;
      continue;
    end if;

    execute format('alter table public.%I add column if not exists original_author_id uuid', t);
    execute format($c$comment on column public.%I.original_author_id is %L$c$, t,
      'كاتب الملاحظة الأصلي (قرار المالك ٣٠٨، 20261030_12). يُثبَّت عند الإنشاء ولا يتغير؛ إذا انتقلت الملاحظة لصاحب المكتب بقي هنا اسم من كتبها. بلا مفتاح أجنبي ليبقى بعد حذف حسابه.');

    execute format('select count(*) from public.%I where original_author_id is null', t) into pending;
    if pending > 0 then
      -- The table's own triggers (updated_at, the archive stamp) are switched
      -- off for the backfill only, so filling a new column changes nothing a
      -- user sees. Only the ones enabled now, and the same ones back on.
      off := '{}';
      for trg in
        select tg.tgname from pg_trigger tg
         where tg.tgrelid = to_regclass('public.' || t) and not tg.tgisinternal and tg.tgenabled <> 'D'
      loop
        execute format('alter table public.%I disable trigger %I', t, trg.tgname);
        off := off || trg.tgname::text;
      end loop;

      execute format(
        'update public.%1$I n
            set original_author_id = coalesce(
                  (select ft.from_user_id from public.firm_asset_transfers ft
                    where ft.table_name = %2$L and ft.column_name = ''author_user_id'' and ft.row_id = n.id::text
                    order by ft.id limit 1),
                  n.author_user_id)
          where n.original_author_id is null', t, t);

      foreach tg_name in array off loop
        execute format('alter table public.%I enable trigger %I', t, tg_name);
      end loop;
      raise notice '20261030_12: public.%.original_author_id filled on % row(s)', t, pending;
    end if;

    -- every author column is NOT NULL (case_notes, dashboard_notes,
    -- lawyer_client_notes, consultation_notes), so this one can be too
    if not exists (select 1 from pg_attribute a
                    where a.attrelid = to_regclass('public.' || t) and a.attname = 'author_user_id' and not a.attnotnull) then
      execute format('alter table public.%I alter column original_author_id set not null', t);
    end if;

    execute format('drop trigger if exists trg_note_original_author on public.%I', t);
    execute format('create trigger trg_note_original_author before insert or update on public.%I
                      for each row execute function public.note_original_author_pin()', t);
  end loop;
end $$;


-- ── 2. ٣١٢ a consulting office keeps a removed lawyer's court rows with him ──
create or replace function public.firm_court_rows_stay_with_member(p_firm uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v boolean;
begin
  if coalesce(current_setting('nzamy.firm_transfer_reason', true), '') <> 'member_removed' then
    return false;
  end if;
  if p_firm is null or not public.account_column_exists('lawyer_profiles', 'practice_kind') then
    return false;
  end if;
  execute 'select exists (select 1 from public.firm_profiles fp
                             join public.lawyer_profiles lp on lp.user_id = fp.owner_user_id
                            where fp.id = $1 and lp.practice_kind = ''consultant'')'
    into v using p_firm;
  return coalesce(v, false);
end;
$$;

comment on function public.firm_court_rows_stay_with_member(uuid) is
  '20261030_12 (owner ٣١٢): true while a member is being REMOVED from a consulting office (the firm owner is a legal consultant, Art. 18): his hearings, appointments, case stages and court deadlines stay in his name. Always false on the account-deletion path, where they move to the owner (read-only for him under 20261019_21).';

-- 20261026_70's list, unchanged except the three court tables (marked ٣١٢).
create or replace function public.firm_asset_specs()
returns table (tbl text, pk text, col text, firm_expr text, needs text[], extra text, guarded boolean)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('service_requests', 'id', 'requester_user_id', 't.firm_id', array['service_requests.firm_id'], '', true),
    ('service_requests', 'id', 'assigned_to',       't.firm_id', array['service_requests.firm_id'], '', true),
    -- ٣١٢
    ('case_stages',  'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['case_stages.firm_id', 'case_stages.case_request_id'],
       'and not public.firm_court_rows_stay_with_member(fp.id)', true),
    -- ٣١٢: hearings of every kind (a judicial hearing or an appointment)
    ('hearings',     'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['hearings.firm_id', 'hearings.case_request_id'],
       'and not public.firm_court_rows_stay_with_member(fp.id)', true),
    -- ٣١٢: a contract obligation's date is not a court row — it moves
    ('deadlines',    'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['deadlines.firm_id', 'deadlines.case_request_id'],
       'and (t.kind = ''contract'' or not public.firm_court_rows_stay_with_member(fp.id))', true),
    ('case_graphs',  'case_request_id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['case_graphs.firm_id', 'case_graphs.case_request_id'], '', true),
    ('case_tracking_links', 'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['case_tracking_links.firm_id', 'case_tracking_links.case_request_id'], '', true),
    ('activity_events', 'id', 'owner_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['activity_events.firm_id', 'activity_events.case_request_id'], '', true),
    ('tasks',        'id', 'owner_user_id',    'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['tasks.firm_id', 'tasks.case_request_id'], '', true),
    ('tasks',        'id', 'assignee_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['tasks.firm_id', 'tasks.case_request_id'], '', true),
    ('deadline_rules', 'id', 'owner_user_id', 't.firm_id', array['deadline_rules.firm_id', 'deadline_rules.code'],
       'and not exists (select 1 from public.deadline_rules d2 where d2.owner_user_id = fp.owner_user_id and d2.code = t.code)', false),
    ('lawyer_clients',      'id', 'owner_user_id',  't.firm_id', array['lawyer_clients.firm_id'], '', true),
    ('lawyer_client_notes', 'id', 'author_user_id', 't.firm_id', array['lawyer_client_notes.firm_id'], '', true),
    ('consultations', 'id', 'lawyer_user_id',    'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['consultations.firm_id', 'consultations.request_id'], '', true),
    ('consultations', 'id', 'requester_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['consultations.firm_id', 'consultations.request_id'], '', true),
    ('consultation_notes', 'id', 'author_user_id', '(select c.firm_id from public.consultations c where c.id = t.consultation_id)', array['consultation_notes.consultation_id', 'consultations.firm_id'], '', true),
    ('contracts', 'id', 'owner_user_id',    'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['contracts.firm_id', 'contracts.request_id'], '', true),
    ('contracts', 'id', 'assigned_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['contracts.firm_id', 'contracts.request_id'], '', true),
    ('case_notes', 'id', 'author_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.request_id))', array['case_notes.firm_id', 'case_notes.request_id'], '', true),
    ('attachments', 'id', 'owner_user_id', '(select sr.firm_id from public.service_requests sr where sr.id = t.request_id)', array['attachments.request_id'], '', true),
    ('dashboard_notes', 'id', 'author_user_id', 'coalesce(t.firm_id, (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id))', array['dashboard_notes.firm_id', 'dashboard_notes.case_request_id', 'dashboard_notes.visibility'],
       'and (t.visibility <> ''private'' or (select sr.firm_id from public.service_requests sr where sr.id = t.case_request_id) is not null)', true)
  ) as s(tbl, pk, col, firm_expr, needs, extra, guarded);
$$;

comment on function public.firm_asset_specs() is
  '20261026_70 + 20261030_12 (٣١٢): the firm-asset columns transfer_firm_assets moves to the firm owner (table, pk, user column, firm expression over alias t, required columns, extra condition, counted by the purge guard). A consulting office keeps a removed member''s court rows with him (firm_court_rows_stay_with_member).';

create or replace function public.firm_member_removed_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'removed' and old.status is distinct from 'removed' then
    -- ٣١٢: tells firm_asset_specs this is a removal, not an account deletion
    perform set_config('nzamy.firm_transfer_reason', 'member_removed', true);
    perform public.transfer_firm_assets(new.user_id, new.firm_id, 'member_removed');
    perform set_config('nzamy.firm_transfer_reason', '', true);
  end if;
  return null;
end;
$$;


-- ── 3. ٣٠٧ the caller's own block, for the settings panel ────────────────────
create or replace function public.account_deletion_owner_block()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else public.account_entity_owner_block(auth.uid()) end;
$$;

comment on function public.account_deletion_owner_block() is
  '20261030_12 (owner ٣٠٧): firm / business / government / ngo when the CALLER owns an entity that still has other members (his deletion is refused until ownership is transferred), else null. auth.uid() only.';


-- ── 4. ٣١٠ a tax invoice is never deleted, its buyer never dropped ───────────
create or replace function public.payment_orders_keep_tax_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_addr text;
  v_uid  text;
begin
  if tg_op = 'DELETE' then
    if old.status in ('paid', 'refunded') and old.live is distinct from false then
      raise exception using errcode = '42501',
        message = format('TAX_INVOICE_KEPT: payment order %s (receipt %s) is a tax invoice and is never deleted (owner ٣١٠, 20261030_12)',
                         old.id, coalesce(old.receipt_number, '—'));
    end if;
    return old;
  end if;

  if coalesce(old.metadata, '{}'::jsonb) ? 'buyer_snapshot' then
    -- written once (20261026_70's keep rules); no later write drops or edits it
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
                    || jsonb_build_object('buyer_snapshot', old.metadata->'buyer_snapshot');
  elsif coalesce(new.metadata, '{}'::jsonb) ? 'buyer_snapshot'
        and jsonb_typeof(new.metadata->'buyer_snapshot') = 'object'
        and not (new.metadata->'buyer_snapshot' ? 'national_address')
        and public.account_column_exists('profiles', 'national_address') then
    v_uid := new.metadata->'buyer_snapshot'->>'user_id';
    if v_uid ~ '^[0-9a-fA-F-]{36}$' then
      execute 'select national_address from public.profiles where id = $1::uuid' into v_addr using v_uid;
      if nullif(btrim(coalesce(v_addr, '')), '') is not null then
        new.metadata := jsonb_set(new.metadata, '{buyer_snapshot,national_address}', to_jsonb(btrim(v_addr)));
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.payment_orders_keep_tax_invoice() is
  '20261030_12 (owner ٣١٠): a paid / refunded live payment order (a tax invoice) is never deleted; its buyer_snapshot is never dropped or rewritten, and takes the buyer''s national address when first written. No expiry.';

do $$
begin
  if to_regclass('public.payment_orders') is null
     or not public.account_column_exists('payment_orders', 'live')
     or not public.account_column_exists('payment_orders', 'metadata') then
    raise notice '20261030_12: public.payment_orders (live, metadata) is not here — the invoice guard is skipped';
    return;
  end if;
  drop trigger if exists trg_payment_orders_keep_tax_invoice on public.payment_orders;
  create trigger trg_payment_orders_keep_tax_invoice
    before update or delete on public.payment_orders
    for each row execute function public.payment_orders_keep_tax_invoice();
end $$;


-- ── 5. Privileges ────────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.note_original_author_pin()',
    'public.firm_court_rows_stay_with_member(uuid)',
    'public.firm_asset_specs()',
    'public.firm_member_removed_transfer()',
    'public.account_deletion_owner_block()',
    'public.payment_orders_keep_tax_invoice()'
  ] loop
    execute format('revoke all on function %s from public', f);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f);
    end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.account_deletion_owner_block() to authenticated;
  end if;
end $$;


-- ── 6. Verify — raises, so a half-applied file cannot look applied ──────────
do $$
declare
  t   text;
  n   bigint;
  rec record;
begin
  foreach t in array array['case_notes', 'dashboard_notes', 'lawyer_client_notes', 'consultation_notes'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    if not public.account_column_exists(t, 'original_author_id') then
      raise exception '20261030_12 verify: public.%.original_author_id is missing', t;
    end if;
    execute format('select count(*) from public.%I where original_author_id is null', t) into n;
    if n > 0 then
      raise exception '20261030_12 verify: % row(s) of public.% have no original author', n, t;
    end if;
    if not exists (select 1 from pg_trigger where tgrelid = to_regclass('public.' || t)
                    and tgname = 'trg_note_original_author' and not tgisinternal and tgenabled <> 'D') then
      raise exception '20261030_12 verify: public.% has no original-author trigger', t;
    end if;
    if exists (select 1 from pg_trigger where tgrelid = to_regclass('public.' || t) and not tgisinternal and tgenabled = 'D') then
      raise exception '20261030_12 verify: public.% has a disabled trigger — the backfill did not switch it back on', t;
    end if;
  end loop;

  if not exists (select 1 from public.firm_asset_specs() s
                  where s.tbl = 'hearings' and s.extra like '%firm_court_rows_stay_with_member%') then
    raise exception '20261030_12 verify: firm_asset_specs has no consulting-office rule (٣١٢)';
  end if;
  if (select count(*) from public.firm_asset_specs()) <> 21 then
    raise exception '20261030_12 verify: firm_asset_specs lists % columns, expected 21 (20261026_70''s list)', (select count(*) from public.firm_asset_specs());
  end if;
  if position('nzamy.firm_transfer_reason' in pg_get_functiondef('public.firm_member_removed_transfer()'::regprocedure)) = 0 then
    raise exception '20261030_12 verify: firm_member_removed_transfer does not mark the removal (٣١٢)';
  end if;

  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    if not has_function_privilege('authenticated', 'public.account_deletion_owner_block()', 'EXECUTE') then
      raise exception '20261030_12 verify: authenticated cannot ask its own deletion block';
    end if;
    if has_function_privilege('authenticated', 'public.account_entity_owner_block(uuid)', 'EXECUTE') then
      raise exception '20261030_12 verify: authenticated can ask ANY account''s deletion block';
    end if;
  end if;

  if to_regclass('public.payment_orders') is not null then
    if not exists (select 1 from pg_trigger where tgrelid = 'public.payment_orders'::regclass
                    and tgname = 'trg_payment_orders_keep_tax_invoice' and not tgisinternal and tgenabled <> 'D') then
      raise exception '20261030_12 verify: the tax-invoice guard on payment_orders is missing';
    end if;
    if exists (
         select 1 from pg_constraint con
           join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
          where con.conrelid = 'public.payment_orders'::regclass and con.contype = 'f'
            and a.attname = 'user_id' and con.confdeltype <> 'n') then
      raise exception '20261030_12 verify: payment_orders.user_id is not ON DELETE SET NULL — an account deletion would delete invoices';
    end if;
  end if;

  -- like 20261026_70: the moves pass the path guards only when these run as postgres / supabase_admin
  for rec in
    select p.oid::regprocedure::text as f, pg_get_userbyid(p.proowner) as o, p.prosecdef as d
      from pg_proc p
     where p.oid in ('public.firm_member_removed_transfer()'::regprocedure,
                     'public.firm_court_rows_stay_with_member(uuid)'::regprocedure,
                     'public.payment_orders_keep_tax_invoice()'::regprocedure)
  loop
    if not rec.d or rec.o not in ('postgres', 'supabase_admin') then
      raise exception '20261030_12 verify: % is owned by % (definer: %) — run this file as postgres', rec.f, rec.o, rec.d;
    end if;
  end loop;

  raise notice '20261030_12 verify: OK — notes keep their original author (٣٠٨); a consulting office keeps a removed lawyer''s court rows with him until his account is deleted (٣١٢); the caller can ask his own deletion block (٣٠٧); a tax invoice is never deleted and keeps its buyer (٣١٠)';
end $$;

commit;

notify pgrst, 'reload schema';

-- ── SELECT check (the SQL editor hides NOTICEs; this row is the answer) ──────
-- Expect: notes_without_author = 0, specs_312 = true, owner_block_fn = true,
-- invoice_guard = true, invoice_fk_set_null = true.
select
  (select coalesce(sum(x.n), 0) from (
     select count(*) as n from public.case_notes where original_author_id is null
     union all select count(*) from public.dashboard_notes where original_author_id is null
     union all select count(*) from public.lawyer_client_notes where original_author_id is null
     union all select count(*) from public.consultation_notes where original_author_id is null) x) as notes_without_author,
  exists (select 1 from public.firm_asset_specs() s where s.tbl = 'hearings' and s.extra like '%firm_court_rows_stay_with_member%') as specs_312,
  to_regprocedure('public.account_deletion_owner_block()') is not null as owner_block_fn,
  exists (select 1 from pg_trigger where tgrelid = 'public.payment_orders'::regclass and tgname = 'trg_payment_orders_keep_tax_invoice') as invoice_guard,
  not exists (select 1 from pg_constraint con
                join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any (con.conkey)
               where con.conrelid = 'public.payment_orders'::regclass and con.contype = 'f'
                 and a.attname = 'user_id' and con.confdeltype <> 'n') as invoice_fk_set_null;
