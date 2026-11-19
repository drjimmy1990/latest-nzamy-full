-- =============================================================================
-- Migration: 20261129_90_test_infra.sql
-- =============================================================================
-- PURPOSE (owner file 19 §1ج, 19 Nov 2026 — batch l9-testinfra; tests T32–T37)
--   Every test account and everything it produces is traceable and can be
--   wiped as one batch, without ever touching a real user's row.
--   Builds on batch 7 (20261127_80): public.is_test_account(uuid) stays THE
--   predicate (profiles.is_demo, or a row in public.test_accounts that is not
--   staff). Nothing of batch 7 is re-created here.
--
--   1. The batch of an account — public.test_account_batches (history: one
--      CURRENT row per account, until IS NULL). A test account always has
--      one: today's test accounts get 'legacy' (since -infinity); an account
--      that becomes a test account later (a row in test_accounts, or is_demo
--      switched on) gets 'qa-<Riyadh date>'. The admin moves an account to a
--      new batch with public.test_account_set_batch (the old one is closed,
--      so its rows and files stay in the old batch — T37). The user-level
--      record of "is_test" is this table + test_accounts (both service role
--      only); profiles is NOT altered (guests read profiles).
--   2. Row tags — `is_test boolean not null default false` and `test_batch
--      text` on every table of the list in §2 that exists here (account
--      identity, staff, security and audit tables are deliberately NOT in the
--      list: the purge never deletes an account or its security records —
--      see the list). One trigger, trg_test_tag → public.test_tag_row():
--        * INSERT: both values are COMPUTED on the server from the row's
--          owner columns (an account's id) and, failing that, from the parent
--          row it references (a foreign key to another tagged table). What
--          the client sent is overwritten: a real user who posts
--          is_test=true gets false.
--        * UPDATE of either column: the old values are put back. Nobody —
--          the user, the service role — can set or clear a tag.
--      Today's rows of today's test accounts are tagged once (§4).
--   3. public.test_batch_purge(batch, dry_run, actor, ip) — «مسح دفعة
--      الاختبار». Service role only; the admin route adds the staff gate
--      (users.delete) and a FRESH TOTP code.
--        * deletes ONLY rows tagged is_test AND test_batch = batch;
--        * keeps a tagged row that also names a REAL account in one of its
--          owner columns (reported as "kept: linked to a real account");
--        * refuses the whole purge when any row outside the delete set
--          references a row in it through a foreign key (a cascade, a set
--          null or a refusal would touch an untagged row) — the "blockers";
--        * dry-run runs the very same deletes inside a sub-transaction and
--          rolls them back, so its numbers are the purge's numbers (T34);
--        * files: storage objects of the batch's accounts (owner, or the
--          account id as the first / second folder) uploaded while the
--          account was in that batch — returned to the route, which removes
--          them through the Storage API (a SQL delete would leave the bytes);
--        * every call writes one row in public.test_batch_purge_audit —
--          append-only, for everyone (T36): who, when, batch, counts before
--          and after, blockers, files, IP.
--   4. The mail sink — public.test_mail_sink + public.test_mail_sink_check():
--      src/lib/email/sendEmail.ts asks before every send. A mail to a test
--      account, a mail caused by a test account (its id is passed), or a mail
--      to a reserved test domain (.test, .example, .invalid, .localhost,
--      example.com/net/org) is NOT sent: it is stored here (masked address,
--      subject, text) and sendEmail answers 'sunk'. The sink rows are tagged
--      like any other row and are purged with their batch.
--
-- WHO CAN DO WHAT
--   Every new function: SECURITY DEFINER (the append-only trigger: INVOKER),
--   search_path '', EXECUTE for service_role only. The new tables: RLS on,
--   no policy, nothing granted to anon / authenticated.
--   For later migrations: public.test_tag_attach('<table>', array[<owner
--   uuid columns>]) then public.test_tag_refresh() tags a new table.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_90_test_infra.sql
--   Expect: NOTICE  l9_testinfra verify: OK  and a row with `t`.
--   It adds two columns to ~85 tables in ONE transaction (metadata only, no
--   rewrite) and holds their locks until the commit: run it at a quiet time
--   (it takes seconds on this database). As supabase_admin (a superuser) the
--   one-time tagging of §4 runs with triggers off; otherwise it runs with
--   them on and says so in a NOTICE.
--
-- RUN ORDER: any time after 20261127_80 (batch 7, live) — the file refuses
--   to run without it. Before or after the l9 deploy:
--   * code first: sendEmail treats a missing test_mail_sink_check as "no
--     sink" (only the reserved test domains are held back, in code); the
--     admin page «مسح دفعة الاختبار» says the SQL has not run; the analytics
--     exclusion works without the SQL (it reads test_accounts / is_demo);
--   * SQL first: the old code never calls the new functions; the new
--     columns are invisible to it.
--   Idempotent: a re-run re-attaches the triggers, keeps every tag and batch.
--   No platform_settings value is changed.
--
-- ROLLBACK (one transaction; the tags are records — dropping them loses the
--   ability to purge, nothing else):
--   do $$ declare r record; begin
--     for r in select table_name from public.test_tag_tables loop
--       execute format('drop trigger if exists trg_test_tag on public.%I', r.table_name);
--     end loop; end $$;
--   drop trigger if exists trg_test_accounts_batch on public.test_accounts;
--   drop trigger if exists trg_profiles_test_batch on public.profiles;
--   drop function if exists public.test_batch_purge(text, boolean, uuid, text),
--     public.test_batch_purge_files_done(uuid, text, uuid, text, integer, jsonb),
--     public.test_batch_overview(), public.test_mail_sink_check(text, uuid[], text, text, text),
--     public.test_account_set_batch(uuid, text, uuid), public.test_tag_refresh(),
--     public.test_tag_attach(text, text[]), public.test_tag_pred(text, text),
--     public.test_tag_row(), public.test_account_batch_on_flag(),
--     public.test_account_batch_ensure(uuid), public.test_batch_of(uuid);
--   (keep public.test_batch_purge_audit — an audit trail is never dropped
--   lightly; the columns is_test / test_batch can stay, they are inert.)
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regprocedure('public.is_test_account(uuid)') is null then
    raise exception '20261129_90: run 20261127_80_test_account_mode.sql first (public.is_test_account is missing)';
  end if;
  if to_regclass('public.test_accounts') is null then
    raise exception '20261129_90: run 20261017_44_test_accounts_never_listed.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_demo') then
    raise exception '20261129_90: profiles.is_demo is missing (20261125_50)';
  end if;
end
$pre$;

-- ── 1. the batch of an account ───────────────────────────────────────────────
create table if not exists public.test_account_batches (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  test_batch text not null check (test_batch ~ '^[a-z0-9][a-z0-9-]{2,63}$'),
  since      timestamptz not null default now(),
  until      timestamptz,
  set_by     uuid,
  constraint test_account_batches_interval check (until is null or until >= since)
);
create unique index if not exists test_account_batches_one_current
  on public.test_account_batches (user_id) where until is null;
create index if not exists test_account_batches_batch on public.test_account_batches (test_batch);
alter table public.test_account_batches enable row level security;

comment on table public.test_account_batches is
  'l9 testinfra (20261129_90, owner file 19 §1ج): the test batch of a test account over time — one current row (until is null). Service role only.';

-- the batch a NEW row of this account is tagged with; null = not a test account
create or replace function public.test_batch_of(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if p_user is null or not public.is_test_account(p_user) then
    return null;
  end if;
  return coalesce((select b.test_batch from public.test_account_batches b
                    where b.user_id = p_user and b.until is null),
                  'qa-unassigned');
end
$fn$;

comment on function public.test_batch_of(uuid) is
  'l9 testinfra (20261129_90): the current test batch of a test account (is_test_account), qa-unassigned when it has none yet; null for any other account. Service role only.';

create or replace function public.test_account_batch_ensure(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_user is null or not public.is_test_account(p_user) then
    return;
  end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return;
  end if;
  insert into public.test_account_batches (user_id, test_batch, since)
  values (p_user, 'qa-' || pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD'), pg_catalog.now())
  on conflict (user_id) where until is null do nothing;
end
$fn$;

create or replace function public.test_account_batch_on_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_table_name = 'profiles' then
    if new.is_demo is true then
      perform public.test_account_batch_ensure(new.id);
    end if;
  else
    perform public.test_account_batch_ensure(new.user_id);
  end if;
  return null;
end
$fn$;

drop trigger if exists trg_test_accounts_batch on public.test_accounts;
create trigger trg_test_accounts_batch
  after insert on public.test_accounts
  for each row execute function public.test_account_batch_on_flag();

drop trigger if exists trg_profiles_test_batch on public.profiles;
create trigger trg_profiles_test_batch
  after update of is_demo on public.profiles
  for each row execute function public.test_account_batch_on_flag();

-- today's test accounts → 'legacy' (their whole past)
insert into public.test_account_batches (user_id, test_batch, since)
select x.id, 'legacy', '-infinity'::timestamptz
  from (select p.id from public.profiles p where p.is_demo
        union
        select t.user_id from public.test_accounts t) x
 where public.is_test_account(x.id)
   and exists (select 1 from auth.users u where u.id = x.id)
   and not exists (select 1 from public.test_account_batches b where b.user_id = x.id)
on conflict do nothing;

create or replace function public.test_account_set_batch(p_user uuid, p_batch text, p_by uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cur text;
begin
  if p_batch is null or p_batch !~ '^[a-z0-9][a-z0-9-]{2,63}$' then
    raise exception 'test_batch:invalid' using errcode = '22023';
  end if;
  if p_user is null or not public.is_test_account(p_user) then
    raise exception 'test_batch:not_test_account' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('test_batch_user:' || p_user::text));
  select b.test_batch into v_cur from public.test_account_batches b where b.user_id = p_user and b.until is null;
  if v_cur = p_batch then
    return 'unchanged';
  end if;
  update public.test_account_batches set until = pg_catalog.now()
   where user_id = p_user and until is null;
  insert into public.test_account_batches (user_id, test_batch, since, set_by)
  values (p_user, p_batch, pg_catalog.now(), p_by);
  return 'set';
end
$fn$;

comment on function public.test_account_set_batch(uuid, text, uuid) is
  'l9 testinfra (20261129_90): moves a TEST account to a new batch (closes the current one). Refuses any other account (test_batch:not_test_account) and a malformed id (test_batch:invalid). Service role only.';

-- ── 2. row tags ──────────────────────────────────────────────────────────────
create table if not exists public.test_tag_tables (
  table_name    text primary key,
  owner_columns text[] not null default '{}',
  parent_refs   text[] not null default '{}',
  updated_at    timestamptz not null default now()
);
alter table public.test_tag_tables enable row level security;

comment on table public.test_tag_tables is
  'l9 testinfra (20261129_90): the tables whose rows carry is_test / test_batch, their owner columns and the parent references they inherit a tag from. Read by test_tag_row (via its trigger arguments) and test_batch_purge. Service role only.';

create or replace function public.test_tag_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_new   jsonb;
  v_spec  text;
  v_uid   uuid;
  v_batch text;
  v_col   text;
  v_ptab  text;
  v_pcol  text;
  v_t     boolean;
  v_b     text;
  i       int;
begin
  if tg_op = 'UPDATE' then
    -- a tag can be neither set nor cleared, by anybody
    new.is_test := old.is_test;
    new.test_batch := old.test_batch;
    return new;
  end if;

  -- INSERT: computed here, whatever the client sent
  new.is_test := false;
  new.test_batch := null;
  v_new := pg_catalog.to_jsonb(new);

  for i in 0 .. tg_nargs - 1 loop
    v_spec := tg_argv[i];
    continue when pg_catalog.left(v_spec, 1) = '@';
    v_uid := nullif(v_new ->> v_spec, '')::uuid;
    continue when v_uid is null;
    v_batch := public.test_batch_of(v_uid);
    if v_batch is not null then
      new.is_test := true;
      new.test_batch := v_batch;
      return new;
    end if;
  end loop;

  -- no owner is a test account: inherit from a tagged parent row ('@col=table.pcol')
  for i in 0 .. tg_nargs - 1 loop
    v_spec := tg_argv[i];
    continue when pg_catalog.left(v_spec, 1) <> '@';
    v_col  := pg_catalog.split_part(pg_catalog.substr(v_spec, 2), '=', 1);
    v_ptab := pg_catalog.split_part(pg_catalog.split_part(v_spec, '=', 2), '.', 1);
    v_pcol := pg_catalog.split_part(pg_catalog.split_part(v_spec, '=', 2), '.', 2);
    continue when v_new ->> v_col is null;
    begin
      execute pg_catalog.format('select p.is_test, p.test_batch from public.%I p where p.%I = ($1).%I limit 1',
                                v_ptab, v_pcol, v_col)
        into v_t, v_b using new;
    exception when others then
      raise warning 'test_tag_row: parent lookup %.% failed (%) — row left untagged', v_ptab, v_pcol, sqlerrm;
      v_t := false;
    end;
    if v_t is true then
      new.is_test := true;
      new.test_batch := v_b;
      return new;
    end if;
  end loop;

  return new;
end
$fn$;

comment on function public.test_tag_row() is
  'l9 testinfra (20261129_90): trg_test_tag. INSERT: is_test / test_batch computed from the owner columns (test_batch_of) or a tagged parent row (''@col=table.pcol'' arguments); the client''s values are ignored. UPDATE: the tag is put back — immutable for everybody.';

create or replace function public.test_tag_attach(p_table text, p_cols text[])
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_rel  regclass := to_regclass('public.' || pg_catalog.quote_ident(p_table));
  v_cols text[];
begin
  if v_rel is null or (select c.relkind from pg_catalog.pg_class c where c.oid = v_rel) not in ('r', 'p') then
    raise notice '20261129_90: public.% does not exist here — not tagged', p_table;
    return false;
  end if;
  select coalesce(pg_catalog.array_agg(u.c order by u.ord), '{}') into v_cols
    from pg_catalog.unnest(coalesce(p_cols, '{}'::text[])) with ordinality as u(c, ord)
   where exists (select 1 from information_schema.columns ic
                  where ic.table_schema = 'public' and ic.table_name = p_table
                    and ic.column_name = u.c and ic.data_type = 'uuid');
  execute pg_catalog.format('alter table public.%I add column if not exists is_test boolean not null default false', p_table);
  execute pg_catalog.format('alter table public.%I add column if not exists test_batch text', p_table);
  execute pg_catalog.format('create index if not exists %I on public.%I (test_batch) where is_test',
                            pg_catalog.left(p_table, 48) || '_test_tag_idx', p_table);
  insert into public.test_tag_tables (table_name, owner_columns)
  values (p_table, v_cols)
  on conflict (table_name) do update set owner_columns = excluded.owner_columns, updated_at = pg_catalog.now();
  return true;
end
$fn$;

-- (re)builds the parent references and the trigger of every listed table
create or replace function public.test_tag_refresh()
returns int
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  r      record;
  v_refs text[];
  v_args text;
  v_n    int := 0;
begin
  for r in select t.table_name, t.owner_columns from public.test_tag_tables t order by t.table_name loop
    if to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) is null then
      continue;
    end if;
    select coalesce(pg_catalog.array_agg(distinct pg_catalog.format('@%s=%s.%s', a.attname, pc.relname, pa.attname)), '{}')
      into v_refs
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class pc on pc.oid = con.confrelid
      join pg_catalog.pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
      join public.test_tag_tables reg on reg.table_name = pc.relname
      join pg_catalog.pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
      join pg_catalog.pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = con.confkey[1]
     where con.contype = 'f'
       and con.conrelid = ('public.' || pg_catalog.quote_ident(r.table_name))::regclass
       and pg_catalog.array_length(con.conkey, 1) = 1
       and exists (select 1 from information_schema.columns ic
                    where ic.table_schema = 'public' and ic.table_name = pc.relname and ic.column_name = 'is_test');
    update public.test_tag_tables set parent_refs = v_refs, updated_at = pg_catalog.now()
     where table_name = r.table_name;

    execute pg_catalog.format('drop trigger if exists trg_test_tag on public.%I', r.table_name);
    select pg_catalog.string_agg(pg_catalog.quote_literal(x), ', ') into v_args
      from pg_catalog.unnest(r.owner_columns || v_refs) x;
    if v_args is null then
      raise notice '20261129_90: public.% has no owner column and no tagged parent — no trigger', r.table_name;
      continue;
    end if;
    execute pg_catalog.format(
      'create trigger trg_test_tag before insert or update of is_test, test_batch on public.%I '
      'for each row execute function public.test_tag_row(%s)', r.table_name, v_args);
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$fn$;

-- ── the list (owner columns = the PARTIES of a row; staff columns such as
--    reviewed_by / decided_by / voided_by are left out on purpose) ───────────
-- NOT listed, by design (the purge never deletes an account, its access or a
-- security / legal record): profiles and every *_profiles, *_members,
-- business_delegations, user_settings, user_devices, verified_phones,
-- lawyer_signup_verifications, lawyer_licence_images, lawyer_otp_challenges,
-- test_accounts, test_account_batches, platform_staff, admin_mfa_*,
-- admin_audit_events, terms_acceptances, account_deletion_requests,
-- account_suspension_freezes, firm_asset_transfers, founder_seats,
-- membership_credits, founder_badge_removals (founder seats: «تحرير المقاعد
-- التجريبية»), every library_* table (grants, overrides, read quota, locks,
-- monitor: purging them would reset the read caps — file 19: no bypass;
-- library_access_grants IS listed: a grant bought by a test account is an
-- output of its test payment),
-- coupons, offers, broadcasts, articles, platform_settings, feature_flags.
do $list$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select * from (values
      ('activity_events',          array['owner_user_id', 'actor_user_id']),
      ('ai_free_question_claims',  array['user_id']),
      ('ai_free_question_uses',    array['user_id']),
      ('ai_review_requests',       array['user_id']),
      ('ai_runs',                  array['user_id']),
      ('attachments',              array['owner_user_id']),
      ('branding_assets',          array['owner_user_id', 'lawyer_user_id', 'created_by']),
      ('branding_vaults',          array['lawyer_user_id']),
      ('canvas_boards',            array['owner_user_id']),
      ('case_collaborators',       array['user_id']),
      ('case_disbursements',       array['created_by', 'client_user_id']),
      ('case_graphs',              array['owner_user_id']),
      ('case_notes',               array['author_user_id']),
      ('case_record_history',      array['record_owner', 'actor_user_id']),
      ('case_share_tokens',        array['created_by']),
      ('case_stages',              array['owner_user_id']),
      ('case_team_members',        array['user_id']),
      ('case_tracking_links',      array['owner_user_id']),
      ('cases',                    array['client_user_id', 'assigned_user_id']),
      ('chat_messages',            array['sender_id']),
      ('chat_participants',        array['user_id']),
      ('chat_rooms',               array['created_by']),
      ('client_trust_ledger',      array['created_by']),
      ('community_answers',        array['author_id']),
      ('community_posts',          array['author_id']),
      ('community_reports',        array['reporter_user_id']),
      ('community_saves',          array['user_id']),
      ('community_votes',          array['user_id']),
      ('consultation_notes',       array['author_user_id']),
      ('consultations',            array['requester_user_id', 'lawyer_user_id']),
      ('contract_obligations',     array[]::text[]),
      ('contract_parties',         array[]::text[]),
      ('contract_payments',        array[]::text[]),
      ('contract_versions',        array['uploaded_by']),
      ('contracts',                array['client_user_id', 'assigned_user_id']),
      ('coupon_reservations',      array['user_id']),
      ('coupon_usage',             array['user_id']),
      ('court_cost_notices',       array['created_by']),
      ('credit_transactions',      array['user_id']),
      ('dashboard_notes',          array['author_user_id']),
      ('deadline_rules',           array['owner_user_id']),
      ('deadlines',                array['owner_user_id']),
      ('document_shares',          array['owner_id']),
      ('documents',                array['user_id', 'owner_id', 'owner_user_id', 'uploaded_by']),
      ('email_reminder_log',       array['recipient_user_id']),
      ('entitlement_requests',     array['user_id']),
      ('escrow_transactions',      array['buyer_id', 'seller_id']),
      ('feature_requests',         array['user_id']),
      ('group_invitations',        array['inviter_id']),
      ('group_members',            array['user_id']),
      ('groups',                   array['owner_id']),
      ('hearings',                 array['owner_user_id']),
      ('invitations',              array['inviter_id', 'accepted_by']),
      ('invoice_collections',      array['collected_by']),
      ('law_article_notes',        array['user_id']),
      ('law_draft_carts',          array['user_id']),
      ('lawyer_client_notes',      array['author_user_id']),
      ('lawyer_clients',           array['owner_user_id', 'client_user_id']),
      ('lawyer_expenses',          array['created_by']),
      ('lawyer_services',          array['lawyer_user_id']),
      ('legal_ledger_entries',     array['created_by']),
      ('library_issue_reports',    array['user_id']),
      ('library_access_grants',    array['user_id']),
      ('marketplace_listings',     array['owner_id']),
      ('marketplace_offers',       array['offeror_id']),
      ('marketplace_workspaces',   array['buyer_id', 'seller_id']),
      ('membership_credit_uses',   array[]::text[]),
      ('messages',                 array['sender_user_id', 'receiver_user_id']),
      ('notification_outbox',      array['recipient_user_id']),
      ('notifications',            array['user_id']),
      ('offer_dismissals',         array['user_id']),
      ('offer_events',             array['user_id']),
      ('payment_credit_notes',     array['user_id']),
      ('payment_methods',          array['user_id']),
      ('payment_orders',           array['user_id']),
      ('payments',                 array[]::text[]),
      ('points_ledger',            array['user_id']),
      ('points_lot_expiry_notices', array['user_id']),
      ('points_lots',              array['user_id']),
      ('progress_events',          array['user_id']),
      ('promo_links',              array['owner_user_id']),
      ('receipts',                 array[]::text[]),
      ('referrals',                array['referrer_id', 'referee_id']),
      ('request_events',           array['actor_user_id']),
      ('research_sessions',        array['user_id']),
      ('research_items',           array[]::text[]),
      ('reviews',                  array['reviewer_id', 'reviewee_id']),
      ('secondment_contracts',     array['lawyer_id']),
      ('secondment_time_entries',  array[]::text[]),
      ('service_requests',         array['requester_user_id', 'assigned_to']),
      ('subscriptions',            array['user_id']),
      ('support_tickets',          array['user_id']),
      ('tasks',                    array['owner_user_id', 'assignee_user_id']),
      ('task_steps',               array[]::text[]),
      ('team_invitations',         array['inviter_id']),
      ('time_entries',             array['created_by']),
      ('wallet_transactions',      array['user_id']),
      ('work_sessions',            array['user_id'])
    ) v(t, cols)
  loop
    if public.test_tag_attach(r.t, r.cols) then
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice '20261129_90: % table(s) carry is_test / test_batch', v_n;
end
$list$;

-- ── 3. the mail sink (a tagged table like the others) ────────────────────────
create table if not exists public.test_mail_sink (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  to_masked     text not null,
  to_user_id    uuid,
  actor_user_id uuid,
  reason        text not null check (reason in ('test_recipient', 'test_account', 'reserved_domain')),
  subject       text not null,
  body_text     text,
  tag           text
);
alter table public.test_mail_sink enable row level security;
do $att$ begin perform public.test_tag_attach('test_mail_sink', array['to_user_id', 'actor_user_id']); end $att$;

comment on table public.test_mail_sink is
  'l9 testinfra (20261129_90): e-mail that sendEmail did NOT send because it went to a test account, was caused by one, or went to a reserved test domain. Masked address, subject, text. Tagged and purged with its batch. Service role only.';

-- ── 4. the triggers + one-time tagging of today's rows ───────────────────────
do $tag$
declare
  r       record;
  v_where text;
  v_set   text;
  v_n     bigint;
  v_total bigint := 0;
  v_pass  int;
  v_ref   text;
  v_col   text;
  v_ptab  text;
  v_pcol  text;
  v_replica boolean := false;
  v_rc    bigint;
begin
  -- no trigger while tagging (the UPDATE arm would put the old value back)
  for r in select t.table_name from public.test_tag_tables t loop
    if to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) is not null then
      execute pg_catalog.format('drop trigger if exists trg_test_tag on public.%I', r.table_name);
    end if;
  end loop;
  -- parent references first (the tagging below follows them)
  perform public.test_tag_refresh();
  for r in select t.table_name from public.test_tag_tables t loop
    if to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) is not null then
      execute pg_catalog.format('drop trigger if exists trg_test_tag on public.%I', r.table_name);
    end if;
  end loop;

  begin
    perform pg_catalog.set_config('session_replication_role', 'replica', true);
    v_replica := true;
  exception when others then
    raise notice '20261129_90: not a superuser — the one-time tagging runs with the tables'' triggers ON';
  end;

  create temp table _l9_test_ids on commit drop as
    select x.id as user_id, public.test_batch_of(x.id) as batch
      from (select p.id from public.profiles p where p.is_demo
            union
            select t.user_id from public.test_accounts t) x
     where public.is_test_account(x.id);

  for r in select t.table_name, t.owner_columns from public.test_tag_tables t
            where pg_catalog.cardinality(t.owner_columns) > 0 loop
    continue when to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) is null;
    select pg_catalog.string_agg(pg_catalog.format('x.%I in (select user_id from _l9_test_ids)', c), ' or '),
           'coalesce(' || pg_catalog.string_agg(pg_catalog.format('(select batch from _l9_test_ids where user_id = x.%I)', c), ', ') || ')'
      into v_where, v_set
      from pg_catalog.unnest(r.owner_columns) c;
    execute pg_catalog.format('update public.%I x set is_test = true, test_batch = %s where not x.is_test and (%s)',
                              r.table_name, v_set, v_where);
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
  end loop;

  -- children of tagged rows (a few passes for chains)
  for v_pass in 1 .. 4 loop
    v_n := 0;
    for r in select t.table_name, t.parent_refs from public.test_tag_tables t
              where pg_catalog.cardinality(t.parent_refs) > 0 loop
      continue when to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) is null;
      foreach v_ref in array r.parent_refs loop
        v_col  := pg_catalog.split_part(pg_catalog.substr(v_ref, 2), '=', 1);
        v_ptab := pg_catalog.split_part(pg_catalog.split_part(v_ref, '=', 2), '.', 1);
        v_pcol := pg_catalog.split_part(pg_catalog.split_part(v_ref, '=', 2), '.', 2);
        execute pg_catalog.format(
          'update public.%I c set is_test = true, test_batch = p.test_batch from public.%I p '
          'where p.%I = c.%I and p.is_test and not c.is_test', r.table_name, v_ptab, v_pcol, v_col);
        get diagnostics v_rc = row_count;
        v_n := v_n + v_rc;
      end loop;
    end loop;
    v_total := v_total + v_n;
    exit when v_n = 0;
  end loop;

  if v_replica then
    perform pg_catalog.set_config('session_replication_role', 'origin', true);
  end if;

  raise notice '20261129_90: % existing row(s) of today''s test accounts tagged (batch legacy)', v_total;
end
$tag$;

do $ref$ begin perform public.test_tag_refresh(); end $ref$;

-- ── 5. the purge ─────────────────────────────────────────────────────────────
create table if not exists public.test_batch_purge_audit (
  id            bigserial primary key,
  purge_id      uuid not null,
  created_at    timestamptz not null default now(),
  kind          text not null check (kind in ('dry_run', 'purge', 'files')),
  status        text not null,
  test_batch    text not null,
  actor_id      uuid,
  actor_email   text,
  ip            text,
  counts_before jsonb not null default '{}'::jsonb,
  counts_after  jsonb not null default '{}'::jsonb,
  blockers      jsonb not null default '[]'::jsonb,
  files         jsonb not null default '{}'::jsonb,
  error         text
);
create index if not exists test_batch_purge_audit_batch on public.test_batch_purge_audit (test_batch, created_at desc);
alter table public.test_batch_purge_audit enable row level security;

comment on table public.test_batch_purge_audit is
  'l9 testinfra (20261129_90, owner file 19 §1ج.4): one row per «مسح دفعة الاختبار» call (dry-run, purge, files). APPEND-ONLY for everybody (trg_test_batch_purge_audit_append_only). Service role only.';

create or replace function public.test_batch_purge_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $fn$
begin
  raise exception using
    errcode = '42501',
    message = 'سجل مسح دفعات الاختبار للإضافة فقط: لا يُعدَّل فيه سطر ولا يُحذف (test_batch_purge_audit is append-only)';
end
$fn$;

drop trigger if exists trg_test_batch_purge_audit_append_only on public.test_batch_purge_audit;
create trigger trg_test_batch_purge_audit_append_only
  before update or delete on public.test_batch_purge_audit
  for each row execute function public.test_batch_purge_audit_append_only();
drop trigger if exists trg_test_batch_purge_audit_no_truncate on public.test_batch_purge_audit;
create trigger trg_test_batch_purge_audit_no_truncate
  before truncate on public.test_batch_purge_audit
  for each statement execute function public.test_batch_purge_audit_append_only();

-- the delete predicate of one listed table: tagged with $1 and naming no real account
create or replace function public.test_tag_pred(p_table text, p_alias text)
returns text
language sql
stable
security definer
set search_path = ''
as $fn$
  select pg_catalog.format('(%1$s.is_test and %1$s.test_batch = $1 and not (%2$s))',
           pg_catalog.quote_ident(p_alias),
           coalesce((select pg_catalog.string_agg(
                              pg_catalog.format('(%1$s.%2$I is not null and not public.is_test_account(%1$s.%2$I))',
                                                pg_catalog.quote_ident(p_alias), c), ' or ')
                       from public.test_tag_tables r, pg_catalog.unnest(r.owner_columns) c
                      where r.table_name = p_table), 'false'))
$fn$;

create or replace function public.test_batch_actor_email(p_actor uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v text;
begin
  if p_actor is null or not exists (select 1 from information_schema.columns
                                     where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    return null;
  end if;
  execute 'select u.email::text from auth.users u where u.id = $1' into v using p_actor;
  return v;
end
$fn$;

create or replace function public.test_batch_purge(p_batch text, p_dry_run boolean, p_actor uuid, p_ip text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $fn$
declare
  r          record;
  fk         record;
  v_pred     text;
  v_join     text;
  v_child    text;
  v_childrel text;
  v_child_reg boolean;
  v_n        bigint;
  v_tagged   bigint;
  v_tables   jsonb := '{}'::jsonb;
  v_after    jsonb := '{}'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_files    jsonb := '[]'::jsonb;
  v_types    jsonb := '{}'::jsonb;
  v_owner    text;
  v_accounts int;
  v_status   text;
  v_error    text;
  v_remaining bigint;
  v_progress boolean;
  v_pass     int;
  v_purge    uuid := gen_random_uuid();
  v_audit    bigint;
  v_dry      boolean := coalesce(p_dry_run, true);
begin
  if p_batch is null or p_batch !~ '^[a-z0-9][a-z0-9-]{2,63}$' then
    raise exception 'test_batch:invalid' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('test_batch_purge:' || p_batch));

  -- 1. what is tagged, what would go
  for r in select t.table_name from public.test_tag_tables t
            where to_regclass('public.' || pg_catalog.quote_ident(t.table_name)) is not null
            order by t.table_name loop
    v_pred := public.test_tag_pred(r.table_name, 't');
    execute pg_catalog.format(
      'select pg_catalog.count(*), pg_catalog.count(*) filter (where %s) from public.%I t where t.is_test and t.test_batch = $1',
      v_pred, r.table_name) into v_tagged, v_n using p_batch;
    if v_tagged > 0 then
      v_tables := v_tables || jsonb_build_object(r.table_name,
        jsonb_build_object('tagged', v_tagged, 'delete', v_n, 'kept_real_link', v_tagged - v_n));
    end if;
  end loop;

  -- 2. blockers: a row OUTSIDE the delete set that references a row in it
  for fk in
    select con.conname, con.conrelid, con.confrelid, con.conkey, con.confkey, con.confdeltype, pc.relname as parent
      from pg_catalog.pg_constraint con
      join pg_catalog.pg_class pc on pc.oid = con.confrelid
      join pg_catalog.pg_namespace pn on pn.oid = pc.relnamespace and pn.nspname = 'public'
     where con.contype = 'f'
       and v_tables ? pc.relname
       and coalesce((v_tables -> pc.relname ->> 'delete')::bigint, 0) > 0
  loop
    select pg_catalog.format('%I.%I', n.nspname, c.relname), c.relname,
           (n.nspname = 'public' and exists (select 1 from public.test_tag_tables t where t.table_name = c.relname))
      into v_child, v_childrel, v_child_reg
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.oid = fk.conrelid;
    select pg_catalog.string_agg(pg_catalog.format('t.%I = c.%I', pa.attname, ca.attname), ' and ')
      into v_join
      from rows from (pg_catalog.unnest(fk.conkey), pg_catalog.unnest(fk.confkey)) as k(ck, pk)
      join pg_catalog.pg_attribute ca on ca.attrelid = fk.conrelid and ca.attnum = k.ck
      join pg_catalog.pg_attribute pa on pa.attrelid = fk.confrelid and pa.attnum = k.pk;
    execute pg_catalog.format(
      'select pg_catalog.count(*) from %s c where exists (select 1 from public.%I t where %s and %s)%s',
      v_child, fk.parent, public.test_tag_pred(fk.parent, 't'), v_join,
      case when v_child_reg then ' and not ' || public.test_tag_pred(v_childrel, 'c') else '' end)
      into v_n using p_batch;
    if v_n > 0 then
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'table', v_childrel, 'references', fk.parent, 'constraint', fk.conname,
        'on_delete', fk.confdeltype::text, 'rows', v_n));
    end if;
  end loop;

  -- 3. files: objects of the batch's accounts uploaded while in this batch
  if to_regclass('storage.objects') is not null then
    v_owner := 'pg_catalog.split_part(o.name, ''/'', 1) = b.user_id::text or pg_catalog.split_part(o.name, ''/'', 2) = b.user_id::text';
    if exists (select 1 from information_schema.columns
                where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner' and data_type = 'uuid') then
      v_owner := v_owner || ' or o.owner = b.user_id';
    end if;
    if exists (select 1 from information_schema.columns
                where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id') then
      v_owner := v_owner || ' or o.owner_id::text = b.user_id::text';
    end if;
    execute pg_catalog.format(
      'select coalesce(jsonb_agg(jsonb_build_object(''bucket'', o.bucket_id, ''name'', o.name) order by o.bucket_id, o.name), ''[]''::jsonb)
         from storage.objects o
        where exists (select 1 from public.test_account_batches b
                       where b.test_batch = $1 and public.is_test_account(b.user_id)
                         and o.created_at >= b.since and (b.until is null or o.created_at < b.until)
                         and (%s))', v_owner) into v_files using p_batch;
    select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) into v_types
      from (select (f ->> 'bucket') || ' · ' ||
                   coalesce(pg_catalog.lower(pg_catalog.substring(f ->> 'name', '\.([A-Za-z0-9]{1,10})$')), '—') as k,
                   pg_catalog.count(*) as n
              from jsonb_array_elements(v_files) f group by 1) s;
  end if;

  select pg_catalog.count(*) into v_accounts
    from public.test_account_batches b
   where b.test_batch = p_batch and b.until is null and public.is_test_account(b.user_id);

  -- 4. the deletes (rolled back for a dry-run: the same statements, the same numbers)
  if pg_catalog.jsonb_array_length(v_blockers) > 0 then
    v_status := case when v_dry then 'dry_run' else 'blocked' end;
  else
    begin
      v_remaining := 0;
      for v_pass in 1 .. 12 loop
        v_progress := false;
        for r in select e.key as table_name from jsonb_each(v_tables) e
                  where (e.value ->> 'delete')::bigint > 0 order by e.key loop
          begin
            execute pg_catalog.format('delete from public.%I t where %s', r.table_name, public.test_tag_pred(r.table_name, 't'))
              using p_batch;
            get diagnostics v_n = row_count;
            if v_n > 0 then v_progress := true; end if;
          exception when foreign_key_violation then
            null; -- a child of the same batch goes first; next pass
          end;
        end loop;
        v_remaining := 0;
        for r in select e.key as table_name from jsonb_each(v_tables) e
                  where (e.value ->> 'delete')::bigint > 0 loop
          execute pg_catalog.format('select pg_catalog.count(*) from public.%I t where %s',
                                    r.table_name, public.test_tag_pred(r.table_name, 't'))
            into v_n using p_batch;
          v_remaining := v_remaining + v_n;
        end loop;
        exit when v_remaining = 0 or not v_progress;
      end loop;
      if v_remaining > 0 then
        raise exception using errcode = 'P0001', message = 'test_batch:incomplete',
          detail = v_remaining::text || ' row(s) could not be deleted';
      end if;
      for r in select e.key as table_name from jsonb_each(v_tables) e loop
        execute pg_catalog.format('select pg_catalog.count(*) from public.%I t where t.is_test and t.test_batch = $1', r.table_name)
          into v_n using p_batch;
        v_after := v_after || jsonb_build_object(r.table_name, v_n);
      end loop;
      if v_dry then
        raise exception using errcode = 'P0001', message = 'test_batch:dry_run_rollback';
      end if;
      v_status := 'purged';
    exception when others then
      if sqlerrm = 'test_batch:dry_run_rollback' then
        v_status := 'dry_run';
      else
        v_status := case when v_dry then 'dry_run' else 'failed' end;
        v_error := pg_catalog.left(sqlstate || ' ' || sqlerrm, 300);
        v_after := '{}'::jsonb;
      end if;
    end;
  end if;

  insert into public.test_batch_purge_audit
    (purge_id, kind, status, test_batch, actor_id, actor_email, ip,
     counts_before, counts_after, blockers, files, error)
  values
    (v_purge, case when v_dry then 'dry_run' else 'purge' end, v_status, p_batch, p_actor,
     public.test_batch_actor_email(p_actor), pg_catalog.left(p_ip, 64),
     v_tables, v_after, v_blockers,
     jsonb_build_object('count', pg_catalog.jsonb_array_length(v_files), 'by_type', v_types),
     v_error)
  returning id into v_audit;

  return jsonb_build_object(
    'batch', p_batch,
    'dry_run', v_dry,
    'status', v_status,
    'would_purge', v_dry and v_status = 'dry_run' and v_error is null and pg_catalog.jsonb_array_length(v_blockers) = 0,
    'accounts', v_accounts,
    'tables', v_tables,
    'after', v_after,
    'blockers', v_blockers,
    'files', jsonb_build_object('count', pg_catalog.jsonb_array_length(v_files), 'by_type', v_types),
    'file_list', case when not v_dry and v_status = 'purged' then v_files else '[]'::jsonb end,
    'error', v_error,
    'purge_id', v_purge,
    'audit_id', v_audit);
end
$fn$;

comment on function public.test_batch_purge(text, boolean, uuid, text) is
  'l9 testinfra (20261129_90, owner file 19 §1ج.3–4): «مسح دفعة الاختبار». Deletes only rows tagged is_test and test_batch = p_batch that name no real account; refuses when an untagged row references one (blockers); dry-run = the same deletes rolled back. Files are returned for the Storage API. One append-only audit row per call. Service role only (the route adds users.delete + a fresh TOTP).';

create or replace function public.test_batch_purge_files_done(
  p_purge uuid, p_batch text, p_actor uuid, p_ip text, p_removed integer, p_failed jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id bigint;
begin
  if p_batch is null or p_batch !~ '^[a-z0-9][a-z0-9-]{2,63}$' or p_purge is null then
    raise exception 'test_batch:invalid' using errcode = '22023';
  end if;
  insert into public.test_batch_purge_audit
    (purge_id, kind, status, test_batch, actor_id, actor_email, ip, files)
  values
    (p_purge, 'files',
     case when coalesce(pg_catalog.jsonb_array_length(p_failed), 0) = 0 then 'removed' else 'partial' end,
     p_batch, p_actor, public.test_batch_actor_email(p_actor), pg_catalog.left(p_ip, 64),
     jsonb_build_object('removed', greatest(coalesce(p_removed, 0), 0),
                        'failed', coalesce(p_failed, '[]'::jsonb)))
  returning id into v_id;
  return v_id;
end
$fn$;

-- the admin page: batches, their accounts and their tagged rows
create or replace function public.test_batch_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  r       record;
  e       record;
  v_rows  jsonb := '{}'::jsonb;
  v_part  jsonb;
  v_acc   jsonb;
  v_has_email boolean := exists (select 1 from information_schema.columns
                                  where table_schema = 'auth' and table_name = 'users' and column_name = 'email');
begin
  for r in select t.table_name from public.test_tag_tables t
            where to_regclass('public.' || pg_catalog.quote_ident(t.table_name)) is not null loop
    execute pg_catalog.format(
      'select coalesce(jsonb_object_agg(s.b, s.n), ''{}''::jsonb) from (select t.test_batch as b, pg_catalog.count(*) as n
         from public.%I t where t.is_test and t.test_batch is not null group by 1) s', r.table_name) into v_part;
    for e in select x.key, x.value from jsonb_each_text(v_part) x loop
      v_rows := v_rows || jsonb_build_object(e.key, coalesce((v_rows ->> e.key)::bigint, 0) + e.value::bigint);
    end loop;
  end loop;

  if v_has_email then
    execute 'select coalesce(jsonb_agg(jsonb_build_object(
               ''user_id'', b.user_id, ''email'', u.email, ''batch'', b.test_batch, ''since'', b.since)
               order by b.test_batch, u.email), ''[]''::jsonb)
               from public.test_account_batches b join auth.users u on u.id = b.user_id
              where b.until is null and public.is_test_account(b.user_id)' into v_acc;
  else
    select coalesce(jsonb_agg(jsonb_build_object('user_id', b.user_id, 'email', null, 'batch', b.test_batch, 'since', b.since)
                              order by b.test_batch), '[]'::jsonb)
      into v_acc
      from public.test_account_batches b
     where b.until is null and public.is_test_account(b.user_id);
  end if;

  return jsonb_build_object('rows_by_batch', v_rows, 'accounts', v_acc,
    'tables', (select pg_catalog.count(*) from public.test_tag_tables));
end
$fn$;

-- ── 6. the mail sink check ───────────────────────────────────────────────────
create or replace function public.test_mail_sink_check(
  p_to text, p_user_ids uuid[], p_subject text, p_text text, p_tag text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_to       text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_to, '')));
  v_reserved boolean;
  v_to_user  uuid;
  v_actor    uuid;
  v_reason   text;
  v_id       bigint;
  v_batch    text;
  v_local    text;
  v_domain   text;
  v_masked   text;
begin
  v_reserved := v_to ~ '@([a-z0-9-]+\.)*(test|example|invalid|localhost)$'
             or v_to ~ '@example\.(com|net|org)$';
  if v_to <> '' and exists (select 1 from information_schema.columns
                             where table_schema = 'auth' and table_name = 'users' and column_name = 'email') then
    execute 'select u.id from auth.users u where pg_catalog.lower(u.email) = $1 limit 1' into v_to_user using v_to;
  end if;
  if v_to_user is not null and not public.is_test_account(v_to_user) then
    v_to_user := null;
  end if;
  select u into v_actor
    from pg_catalog.unnest(coalesce(p_user_ids, '{}'::uuid[])) u
   where public.is_test_account(u)
   limit 1;

  if v_to_user is null and v_actor is null and not v_reserved then
    return jsonb_build_object('sink', false);
  end if;
  v_reason := case when v_to_user is not null then 'test_recipient'
                   when v_actor is not null then 'test_account'
                   else 'reserved_domain' end;

  v_local  := pg_catalog.split_part(v_to, '@', 1);
  v_domain := pg_catalog.split_part(v_to, '@', 2);
  v_masked := coalesce(nullif(pg_catalog.left(v_local, 1), ''), '?') || '***@'
              || coalesce(nullif(pg_catalog.left(v_domain, 1), ''), '?') || '***'
              || coalesce(pg_catalog.substring(v_domain, '(\.[a-z0-9-]+)$'), '');

  insert into public.test_mail_sink (to_masked, to_user_id, actor_user_id, reason, subject, body_text, tag)
  values (v_masked, v_to_user, coalesce(v_actor, v_to_user), v_reason,
          pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_subject), ''), '(بلا عنوان)'), 300),
          pg_catalog.left(p_text, 8000), pg_catalog.left(p_tag, 64))
  returning id, test_batch into v_id, v_batch;

  return jsonb_build_object('sink', true, 'reason', v_reason, 'id', v_id, 'test_batch', v_batch);
end
$fn$;

comment on function public.test_mail_sink_check(text, uuid[], text, text, text) is
  'l9 testinfra (20261129_90): asked by sendEmail before every send. {sink:false} → send. {sink:true} → the mail went to a test account, was caused by one (p_user_ids), or went to a reserved test domain: it is stored in test_mail_sink (masked address) and NOT sent. Service role only.';

-- ── privileges ───────────────────────────────────────────────────────────────
do $gr$
declare
  fn text;
  tb text;
begin
  foreach fn in array array[
    'public.test_batch_of(uuid)',
    'public.test_account_batch_ensure(uuid)',
    'public.test_account_batch_on_flag()',
    'public.test_account_set_batch(uuid, text, uuid)',
    'public.test_tag_row()',
    'public.test_tag_attach(text, text[])',
    'public.test_tag_refresh()',
    'public.test_tag_pred(text, text)',
    'public.test_batch_actor_email(uuid)',
    'public.test_batch_purge(text, boolean, uuid, text)',
    'public.test_batch_purge_files_done(uuid, text, uuid, text, integer, jsonb)',
    'public.test_batch_overview()',
    'public.test_mail_sink_check(text, uuid[], text, text, text)',
    'public.test_batch_purge_audit_append_only()'] loop
    execute pg_catalog.format('revoke all on function %s from public', fn);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on function %s from anon', fn);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on function %s from authenticated', fn);
    end if;
  end loop;
  foreach tb in array array['public.test_account_batches', 'public.test_tag_tables',
                            'public.test_mail_sink', 'public.test_batch_purge_audit'] loop
    execute pg_catalog.format('revoke all on table %s from public', tb);
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
      execute pg_catalog.format('revoke all on table %s from anon', tb);
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
      execute pg_catalog.format('revoke all on table %s from authenticated', tb);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.test_account_set_batch(uuid, text, uuid) to service_role;
    grant execute on function public.test_batch_purge(text, boolean, uuid, text) to service_role;
    grant execute on function public.test_batch_purge_files_done(uuid, text, uuid, text, integer, jsonb) to service_role;
    grant execute on function public.test_batch_overview() to service_role;
    grant execute on function public.test_mail_sink_check(text, uuid[], text, text, text) to service_role;
    grant select on public.test_account_batches, public.test_tag_tables, public.test_mail_sink to service_role;
    grant select, insert on public.test_batch_purge_audit to service_role;
  end if;
end
$gr$;

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  v_missing text := '';
  fn text;
  r record;
begin
  foreach fn in array array[
    'public.test_batch_of(uuid)', 'public.test_account_set_batch(uuid, text, uuid)', 'public.test_tag_row()',
    'public.test_batch_purge(text, boolean, uuid, text)', 'public.test_batch_overview()',
    'public.test_batch_purge_files_done(uuid, text, uuid, text, integer, jsonb)',
    'public.test_mail_sink_check(text, uuid[], text, text, text)'] loop
    if to_regprocedure(fn) is null then
      v_missing := v_missing || ' missing ' || fn || ';';
    elsif not (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)) then
      v_missing := v_missing || ' ' || fn || ' is not definer with search_path '''';';
    elsif (exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
           and has_function_privilege('authenticated', fn, 'EXECUTE'))
       or (exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
           and has_function_privilege('anon', fn, 'EXECUTE')) then
      v_missing := v_missing || ' a session may execute ' || fn || ';';
    end if;
  end loop;
  if coalesce((select p.prosecdef from pg_catalog.pg_proc p
                where p.oid = to_regprocedure('public.test_batch_purge_audit_append_only()')), true) then
    v_missing := v_missing || ' the append-only trigger function must be INVOKER;';
  end if;
  if (select pg_catalog.count(*) from pg_catalog.pg_trigger t
       where t.tgrelid = 'public.test_batch_purge_audit'::regclass and not t.tgisinternal
         and t.tgname in ('trg_test_batch_purge_audit_append_only', 'trg_test_batch_purge_audit_no_truncate')) <> 2 then
    v_missing := v_missing || ' test_batch_purge_audit is not append-only;';
  end if;
  for r in select t.table_name from public.test_tag_tables t
            where to_regclass('public.' || pg_catalog.quote_ident(t.table_name)) is not null
              and (pg_catalog.cardinality(t.owner_columns) > 0 or pg_catalog.cardinality(t.parent_refs) > 0) loop
    if not exists (select 1 from pg_catalog.pg_trigger g
                    where g.tgrelid = ('public.' || pg_catalog.quote_ident(r.table_name))::regclass
                      and g.tgname = 'trg_test_tag' and not g.tgisinternal
                      and g.tgfoid = 'public.test_tag_row()'::regprocedure) then
      v_missing := v_missing || ' public.' || r.table_name || ' has no trg_test_tag;';
    end if;
  end loop;
  if not exists (select 1 from public.test_tag_tables where table_name = 'test_mail_sink') then
    v_missing := v_missing || ' test_mail_sink is not tagged;';
  end if;
  foreach fn in array array['public.test_account_batches', 'public.test_tag_tables',
                            'public.test_mail_sink', 'public.test_batch_purge_audit'] loop
    if not coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = to_regclass(fn)), false) then
      v_missing := v_missing || ' RLS is off on ' || fn || ';';
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and has_table_privilege('authenticated', fn, 'SELECT') then
      v_missing := v_missing || ' a session may read ' || fn || ';';
    end if;
  end loop;
  if v_missing <> '' then
    raise exception 'l9_testinfra verify:%', v_missing;
  end if;
  raise notice 'l9_testinfra verify: OK';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261129_90 test infra (is_test + test_batch tags, «مسح دفعة الاختبار» with dry-run + append-only audit, mail sink)' as step,
       (to_regprocedure('public.test_batch_purge(text, boolean, uuid, text)') is not null
        and to_regprocedure('public.test_mail_sink_check(text, uuid[], text, text, text)') is not null
        and exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = 'public.test_batch_purge_audit'::regclass
                       and tgname = 'trg_test_batch_purge_audit_append_only')
        and exists (select 1 from public.test_tag_tables where table_name = 'test_mail_sink')) as ok;
