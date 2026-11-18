-- =============================================================================
-- Migration: 20261127_40_points_wallets.sql
-- =============================================================================
-- PURPOSE (owner decisions of 18 Nov 2026; batch l7 decisions 5–9)
--
--   1. Two wallets on the points lots (decision 8; §16.2).
--        points_lots.wallet_scope text NOT NULL DEFAULT 'general'
--        CHECK (wallet_scope in ('general', 'library_agent'))
--      Every existing lot is 'general' (the default). A 'library_agent' lot is
--      spent ONLY by the library assistant. The column is readable by its
--      owner (column SELECT for authenticated, like the other columns), so the
--      billing page can say which lots are for the library assistant.
--      points_lots_source_check gains the source kinds plan / topup / bonus /
--      gift (every older value stays valid: purchase, plan_monthly, grant,
--      admin, migrated, refund_restore). Top-ups keep writing 'purchase'
--      (UNIQUE (order_id, source) is the fulfilment's idempotency, and the
--      receipt reads source 'purchase').
--
--   2. public.debit_points — SAME signature (uuid, int, text, text), re-created
--      from its latest (and only) definition, 20261022_20. The tool's scope is
--      derived from p_tool, which every starter already passes
--      (ai_start_run → debit_points; ai_start_section_edit,
--      ai_start_run_with_credit and ai_start_free_question all go through
--      ai_start_run), so no starter changes signature or body for the scope:
--        p_tool 'library-assistant' → spends library_agent lots, then general;
--        any other tool             → spends general lots only.
--      The spend order inside the spendable lots (decision 8):
--        library_agent before general (library assistant only), then
--        rank 1 plan points (plan, plan_monthly),
--        rank 2 purchased (purchase, topup, migrated, refund_restore),
--        rank 3 bonus / gift / grant (bonus, gift, grant, admin),
--        then nearest expiry, created_at, id.
--      The LOCK statement is unchanged (the scope filter only narrows it): the
--      lots are locked FOR UPDATE ordered by expires_at, created_at, id, as
--      admin_debit_points and adjust_admin_points lock them, so every lock
--      order is a subset of one total order (no deadlock). The priority order
--      is applied only in the spend loop, on rows already locked.
--      admin_debit_points (an admin deduction) is NOT changed: it may take
--      from any wallet, nearest expiry first.
--
--   3. public.credit_wallet_points(p_user, p_points, p_source, p_expires_at,
--      p_order, p_ref, p_scope) → uuid — credit_points with a wallet. A NEW
--      name (credit_points keeps its signature: a defaulted extra argument
--      would be a second overload, PGRST203 on every top-up). Service role.
--      Used by fulfilment for a library plan's points (src/lib/payments/
--      grantPurchase.ts): source 'plan', wallet 'library_agent', expiring
--      with the library grant, keyed on the order.
--
--   4. Expiry (G9, G16):
--      public.points_expire_lots(p_limit int default 500) → jsonb
--        {lots, points}: revoke_lot(id, 'expiry') — the «انتهاء» ledger row —
--        for up to p_limit lots with expires_at <= now() and points_left > 0.
--        Safe to repeat (an emptied lot is never picked again).
--      public.points_lot_expiry_notices — one row per lot warned 7 days before
--        its end (PRIMARY KEY lot_id): the cron inserts first and notifies only
--        when the row is new. Server only.
--      Both are called by POST /api/v1/cron/points-expiry (x-cron-secret).
--
--   5. Free questions ONCE (decision 6, owner ٣٠): replaces the daily free
--      quick question of 20261108_50.
--      public.ai_free_question_uses — one row per free run (PRIMARY KEY
--        run_id → ai_runs ON DELETE CASCADE, user_id). Server only.
--      public.ai_start_free_question — SAME 14-argument signature, re-created
--        from its latest (and only) definition, 20261108_50. Now: tool
--        'library-assistant' only; the allowance is read here from
--        platform_settings.free_questions_by_account_type by
--        profiles.user_type (never from the app); under ai_start_run's own
--        lock it counts the account's free runs that did not fail:
--          a key already used          → ai_start_run's duplicate answer;
--          allowance 0 / type unknown  → P0001 free_question_not_eligible;
--          points_enforcement off, or an exempt caller
--                                      → a normal ai_start_run (nothing is
--                                        charged anyway) and NO use row: the
--                                        allowance is kept for when charging
--                                        starts;
--          allowance used              → P0001 free_question_used;
--          else ai_start_run at price 0 and one use row, one transaction.
--        A failed (refunded) run gives its free question back.
--      public.ai_free_question_status(p_user) → (allowance int, used int) — the
--        same count, for the status route. Service role.
--      verified_phones and ai_free_question_claims (20261108_50) are left as
--      they are (no longer read).
--
--   6. Settings (platform_settings, ON CONFLICT DO NOTHING — an admin's value
--      is never reset; editable at /api/v1/admin/settings, audited there):
--        library_plan_points            {"lib-q1": 50, "lib-q2": 120, "lib-annual": 300}
--        gift_valid_days                90
--        min_topup_by_account_type      {"lawyer": 500, "firm": 500, "corporate": 500,
--                                        "micro": 500, "government": 500, "ngo": 500,
--                                        "provider": 500}   (individual: none)
--        free_questions_by_account_type {"lawyer": 10, "individual": 5}
--
-- WHO CAN DO WHAT
--   credit_wallet_points, points_expire_lots, ai_free_question_status,
--   ai_start_free_question: EXECUTE for service_role only. debit_points keeps
--   its grants (service role only). The two new tables: RLS on, no policy,
--   no grant to anon / authenticated.
--   All functions SECURITY DEFINER with search_path ''.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261127_40_points_wallets.sql
--   Expect: NOTICE  l7_points verify: OK  and a row with `t`.
--
-- RUN ORDER: BEFORE THE DEPLOY. The old code is unaffected by it:
--   debit_points keeps its signature and every old lot is 'general' (spent as
--   before, now plan → purchased → bonus/gift); the old quick-answer page
--   never asks for a free question (nobody has a verified phone), and the new
--   ai_start_free_question refuses quick-answer (22023) if it ever did.
--   The new code before this file runs degrades as follows:
--     * a library order's points: credit_wallet_points is missing → the
--       order stays unfulfilled (the access IS granted) and the payments
--       sweep retries it until this file has run — no points are lost;
--     * free questions: the status reads «not available» and every question
--       is charged as before; the start never runs free without this file;
--     * the cron answers {skipped: "schema_missing"};
--     * min top-up and gift days fall back to the code defaults (500 / 90).
--   RE-RUN HAZARD: re-running 20261022_20 re-creates debit_points without the
--   wallets (library lots would then be spent by every tool) and revokes the
--   wallet_scope column grant; re-running 20261108_50 brings the daily phone
--   question back. Re-run this file after either. This file itself is safe to
--   run any number of times.
--
-- ROLLBACK (in one transaction):
--   1. re-run section 5 («debit_points») of 20261022_20_points_lots.sql and
--      section 3 («ai_start_free_question») of 20261108_50_free_daily_question.sql;
--   2. drop function if exists public.credit_wallet_points(uuid, int, text, timestamptz, uuid, text, text),
--        public.points_expire_lots(int), public.ai_free_question_status(uuid);
--      drop table if exists public.points_lot_expiry_notices, public.ai_free_question_uses;
--   3. update public.points_lots set wallet_scope = 'general';  -- only if
--      library lots must become general points; otherwise leave them
--      alter table public.points_lots drop column if exists wallet_scope;
--      (the source check may keep its extra values: nothing old writes them)
--   4. delete from public.platform_settings where key in ('library_plan_points',
--      'gift_valid_days', 'min_topup_by_account_type', 'free_questions_by_account_type');
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.points_lots') is null or to_regclass('public.points_ledger') is null
     or to_regprocedure('public.debit_points(uuid, int, text, text)') is null
     or to_regprocedure('public.revoke_lot(uuid, text)') is null then
    raise exception '20261127_40: run 20261022_20_points_lots.sql first';
  end if;
  if to_regclass('public.ai_runs') is null
     or to_regprocedure('public.ai_start_run(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb)') is null then
    raise exception '20261127_40: run 20261027_10_ai_runs.sql (and 20261108_41) first';
  end if;
  if to_regclass('public.platform_settings') is null or to_regclass('public.profiles') is null then
    raise exception '20261127_40: public.platform_settings / public.profiles are missing';
  end if;
end
$pre$;

-- ── 1. wallets and source kinds on points_lots ───────────────────────────────
alter table public.points_lots
  add column if not exists wallet_scope text not null default 'general';

alter table public.points_lots drop constraint if exists points_lots_wallet_scope_check;
alter table public.points_lots add constraint points_lots_wallet_scope_check
  check (wallet_scope in ('general', 'library_agent'));

alter table public.points_lots drop constraint if exists points_lots_source_check;
alter table public.points_lots add constraint points_lots_source_check
  check (source in ('purchase', 'plan_monthly', 'grant', 'admin', 'migrated', 'refund_restore',
                    'plan', 'topup', 'bonus', 'gift'));

grant select (wallet_scope) on public.points_lots to authenticated;

comment on column public.points_lots.wallet_scope is
  'general: any AI tool spends it; library_agent: only the library assistant (20261127_40, owner 18 Nov §16.2). Written only by the server.';

-- ── 2. debit_points: the wallet and the spend order ──────────────────────────
create or replace function public.debit_points(p_user uuid, p_points int, p_tool text, p_ref text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_avail bigint;
  v_need  int;
  v_take  int;
  v_lot   record;
  -- 20261127_40: the tool's wallet. Only the library assistant may spend
  -- library_agent lots; every other tool spends general lots only.
  v_lib   boolean := coalesce(p_tool = 'library-assistant', false);
begin
  if p_user is null or p_points is null or p_points <= 0 then
    raise exception 'debit_points: p_user and a positive p_points are required' using errcode = '22023';
  end if;

  -- Lock the user's spendable unexpired lots, nearest expiry first. Every debit
  -- locks in this one order, so two concurrent debits queue instead of
  -- deadlocking, and the second one sees what the first left (READ COMMITTED
  -- re-checks a row it waited for, points_left > 0 included).
  select coalesce(sum(l.points_left), 0) into v_avail
    from (select pl.points_left
            from public.points_lots pl
           where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
             and (pl.wallet_scope = 'general' or (v_lib and pl.wallet_scope = 'library_agent'))
           order by pl.expires_at, pl.created_at, pl.id
             for update) l;

  if v_avail < p_points then
    raise exception 'insufficient_points' using errcode = 'P0001',
      detail = format('available %s, requested %s', v_avail, p_points);
  end if;

  -- 20261127_40 (decision 8): spend the library assistant's own wallet first,
  -- then plan points, then purchased points, then bonus / gifts / grants —
  -- each by nearest expiry. The rows are already locked above.
  v_need := p_points;
  for v_lot in
    select pl.id, pl.points_left
      from public.points_lots pl
     where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
       and (pl.wallet_scope = 'general' or (v_lib and pl.wallet_scope = 'library_agent'))
     order by case when pl.wallet_scope = 'library_agent' then 0 else 1 end,
              case when pl.source in ('plan', 'plan_monthly') then 1
                   when pl.source in ('purchase', 'topup', 'migrated', 'refund_restore') then 2
                   else 3 end,
              pl.expires_at, pl.created_at, pl.id
       for update
  loop
    exit when v_need = 0;
    v_take := least(v_lot.points_left, v_need);
    update public.points_lots set points_left = points_left - v_take where id = v_lot.id;
    insert into public.points_ledger (user_id, lot_id, delta, reason, tool, ref)
      values (p_user, v_lot.id, -v_take, 'usage', p_tool, p_ref);
    v_need := v_need - v_take;
  end loop;

  -- cannot happen while the lots stay locked; if it ever does, roll back
  -- rather than return a debit that was only partly taken
  if v_need > 0 then
    raise exception 'debit_points_invariant' using errcode = 'P0001',
      detail = format('%s of %s points not found after the lock', v_need, p_points);
  end if;

  return coalesce((select sum(l.points_left) from public.points_lots l
                    where l.user_id = p_user and l.expires_at > now()), 0)::int;
end;
$$;

comment on function public.debit_points(uuid, int, text, text) is
  'Debits points across lots, one usage ledger row per lot; returns the balance after; raises P0001 insufficient_points and changes nothing when short (20261022_20, B1). 20261127_40: only p_tool library-assistant may spend library_agent lots (first); then plan → purchased → bonus/gift/grant, each nearest expiry first. Service role only.';

revoke all on function public.debit_points(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.debit_points(uuid, int, text, text) to service_role;

-- ── 3. credit_wallet_points ──────────────────────────────────────────────────
create or replace function public.credit_wallet_points(
  p_user       uuid,
  p_points     int,
  p_source     text,
  p_expires_at timestamptz,
  p_order      uuid default null,
  p_ref        text default null,
  p_scope      text default 'general')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lot uuid;
begin
  if p_user is null or p_points is null or p_points <= 0 then
    raise exception 'credit_wallet_points: p_user and a positive p_points are required' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'credit_wallet_points: p_expires_at must be in the future' using errcode = '22023';
  end if;
  if p_scope is null or p_scope not in ('general', 'library_agent') then
    raise exception 'credit_wallet_points: p_scope must be general or library_agent' using errcode = '22023';
  end if;
  if p_order is not null
     and not exists (select 1 from public.payment_orders o where o.id = p_order and o.user_id = p_user) then
    raise exception 'credit_wallet_points: p_order is not an order of p_user' using errcode = '22023';
  end if;
  insert into public.points_lots (user_id, source, points_total, points_left, expires_at, order_id, wallet_scope)
    values (p_user, p_source, p_points, p_points, p_expires_at, p_order, p_scope)
    returning id into v_lot;
  insert into public.points_ledger (user_id, lot_id, delta, reason, ref)
    values (p_user, v_lot, p_points, 'credit', p_ref);
  return v_lot;
end;
$$;

comment on function public.credit_wallet_points(uuid, int, text, timestamptz, uuid, text, text) is
  'credit_points with a wallet (20261127_40): one lot of p_scope general | library_agent and its credit ledger row; returns the lot id. UNIQUE (order_id, source) keeps an order to one lot per source (23505). Service role only.';

revoke all on function public.credit_wallet_points(uuid, int, text, timestamptz, uuid, text, text) from public, anon, authenticated;
grant execute on function public.credit_wallet_points(uuid, int, text, timestamptz, uuid, text, text) to service_role;

-- ── 4. expiry: the «انتهاء» rows and the 7-day warning markers ───────────────
create or replace function public.points_expire_lots(p_limit int default 500)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_lot    record;
  v_lots   int := 0;
  v_points bigint := 0;
  v_gone   int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'points_expire_lots: p_limit must be 1..5000' using errcode = '22023';
  end if;
  for v_lot in
    select pl.id
      from public.points_lots pl
     where pl.expires_at <= now() and pl.points_left > 0
     order by pl.expires_at, pl.id
     limit p_limit
  loop
    -- revoke_lot locks the lot and writes the 'expiry' ledger row; an emptied
    -- lot answers 0 and writes nothing (a concurrent run, a re-run)
    v_gone := public.revoke_lot(v_lot.id, 'expiry');
    if v_gone > 0 then
      v_lots := v_lots + 1;
      v_points := v_points + v_gone;
    end if;
  end loop;
  return jsonb_build_object('lots', v_lots, 'points', v_points);
end;
$$;

comment on function public.points_expire_lots(int) is
  'Empties up to p_limit expired lots that still hold points through revoke_lot(id, ''expiry'') — one «انتهاء» ledger row each; returns {lots, points} (20261127_40, G9). Safe to repeat. Service role only (POST /api/v1/cron/points-expiry).';

revoke all on function public.points_expire_lots(int) from public, anon, authenticated;
grant execute on function public.points_expire_lots(int) to service_role;

create table if not exists public.points_lot_expiry_notices (
  lot_id     uuid primary key references public.points_lots(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

comment on table public.points_lot_expiry_notices is
  'One row per points lot warned 7 days before its end (20261127_40, G16). The cron inserts first and notifies only for a new row. Server only.';

alter table public.points_lot_expiry_notices enable row level security;
revoke all on public.points_lot_expiry_notices from anon, authenticated, public;
grant all on public.points_lot_expiry_notices to service_role;

-- ── 5. free questions once (decision 6) ──────────────────────────────────────
create table if not exists public.ai_free_question_uses (
  run_id     uuid primary key references public.ai_runs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  tool       text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_free_question_uses_user_idx on public.ai_free_question_uses (user_id);

comment on table public.ai_free_question_uses is
  'Owner ٣٠ (20261127_40): one row per free library-assistant question. The allowance (platform_settings.free_questions_by_account_type) is for the account''s lifetime; a run that failed does not count. Written only by ai_start_free_question. Server only.';

alter table public.ai_free_question_uses enable row level security;
revoke all on public.ai_free_question_uses from anon, authenticated, public;
grant all on public.ai_free_question_uses to service_role;

create or replace function public.ai_free_question_status(p_user uuid)
returns table (allowance int, used int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type  text;
  v_set   jsonb;
  v_allow int;
begin
  if p_user is null then
    raise exception 'ai_free_question_status: p_user is required' using errcode = '22023';
  end if;
  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  select ps.value into v_set from public.platform_settings ps where ps.key = 'free_questions_by_account_type';
  v_allow := case
    when v_type is null then 0
    when v_set is null then case v_type when 'lawyer' then 10 when 'individual' then 5 else 0 end
    when jsonb_typeof(v_set -> v_type) = 'number' then greatest(0, floor((v_set ->> v_type)::numeric))::int
    else 0 end;
  return query
    select v_allow,
           (select count(*)::int from public.ai_free_question_uses u
              join public.ai_runs r on r.id = u.run_id
             where u.user_id = p_user and r.status <> 'failed');
end;
$$;

comment on function public.ai_free_question_status(uuid) is
  'Owner ٣٠ (20261127_40): the account''s lifetime free library-assistant questions — allowance from platform_settings.free_questions_by_account_type by profiles.user_type (no row: lawyer 10, individual 5), used = its free runs that did not fail. Service role only.';

revoke all on function public.ai_free_question_status(uuid) from public, anon, authenticated;
grant execute on function public.ai_free_question_status(uuid) to service_role;

create or replace function public.ai_start_free_question(
  p_user            uuid,
  p_tool            text,
  p_variant         text,
  p_class           text,
  p_price           int,
  p_daily_limit     int,
  p_idempotency_key text,
  p_deadline        timestamptz,
  p_exempt          boolean default false,
  p_input           jsonb default null,
  p_file_ids        text[] default '{}',
  p_pages           int default null,
  p_conversation    uuid default null,
  p_source_ids      jsonb default null)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_allow int;
  v_used  int;
  v_run   record;
begin
  -- 20261127_40 (owner ٣٠): the library assistant only (was quick-answer).
  if p_user is null or p_tool is distinct from 'library-assistant' or p_idempotency_key is null then
    raise exception 'ai_start_free_question: invalid arguments' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai_start_run:' || p_user::text || ':' || p_tool, 0));

  -- A retried request: ai_start_run answers it as the duplicate it is.
  if exists (select 1 from public.ai_runs r where r.user_id = p_user and r.idempotency_key = p_idempotency_key) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- Nothing is charged while points_enforcement is off (ai_start_run reads it
  -- the same way), nor for an exempt caller: the question is free anyway, so
  -- it starts as a normal run and uses up NONE of the account's allowance.
  if not coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false)
     or coalesce(p_exempt, false) then
    return query select * from public.ai_start_run(
      p_user, p_tool, p_variant, p_class, p_price, p_daily_limit, p_idempotency_key, p_deadline,
      p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);
    return;
  end if;

  -- The allowance and the count, under the start lock: two questions at once
  -- cannot both take the last free one. A failed run does not count.
  select s.allowance, s.used into v_allow, v_used from public.ai_free_question_status(p_user) s;
  if coalesce(v_allow, 0) <= 0 then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;
  if v_used >= v_allow then
    raise exception 'free_question_used' using errcode = 'P0001',
      detail = format('used %s of %s', v_used, v_allow);
  end if;

  select * into v_run from public.ai_start_run(
    p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
    p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);

  if v_run.created then
    insert into public.ai_free_question_uses (run_id, user_id, tool)
      values (v_run.run_id, p_user, p_tool)
      on conflict on constraint ai_free_question_uses_pkey do nothing;
  end if;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'Owner ٣٠ (20261127_40; was owner ٤١٢''s daily quick question, 20261108_50): a free library-assistant question from the account''s lifetime allowance (platform_settings.free_questions_by_account_type by user_type). Under ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; allowance 0 → P0001 free_question_not_eligible; allowance used (failed runs not counted) → P0001 free_question_used; else ai_start_run at price 0 and one ai_free_question_uses row, one transaction. Service role only.';

revoke all on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── 6. settings (never reset an admin's value) ───────────────────────────────
insert into public.platform_settings (key, value, description) values
  ('library_plan_points', '{"lib-q1": 50, "lib-q2": 120, "lib-annual": 300}'::jsonb,
   'نقاط مساعد المكتبة مع كل باقة مكتبة (محفظة مساعد المكتبة فقط، تنتهي بانتهاء الباقة) (20261127_40)'),
  ('gift_valid_days', '90'::jsonb,
   'مدة صلاحية النقاط المهداة أو الممنوحة من الإدارة بالأيام (20261127_40)'),
  ('min_topup_by_account_type',
   '{"lawyer": 500, "firm": 500, "corporate": 500, "micro": 500, "government": 500, "ngo": 500, "provider": 500}'::jsonb,
   'الحد الأدنى للشحن بالريال قبل الخصم والضريبة لكل نوع حساب؛ النوع غير المذكور بلا حد أدنى (20261127_40)'),
  ('free_questions_by_account_type', '{"lawyer": 10, "individual": 5}'::jsonb,
   'عدد الأسئلة المجانية لمساعد المكتبة مرة واحدة لكل حساب حسب نوعه (20261127_40)')
on conflict (key) do nothing;

-- ── 7. verify ────────────────────────────────────────────────────────────────
do $verify$
declare
  v_debit text := pg_catalog.pg_get_functiondef('public.debit_points(uuid, int, text, text)'::regprocedure);
  v_free  text := pg_catalog.pg_get_functiondef(
    'public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb)'::regprocedure);
  v_owner text;
  fn      text;
  t       text;
begin
  if not exists (select 1 from pg_catalog.pg_attribute
                  where attrelid = 'public.points_lots'::regclass and attname = 'wallet_scope' and not attisdropped) then
    raise exception 'l7_points verify: points_lots.wallet_scope is missing';
  end if;
  if pg_catalog.strpos(pg_catalog.pg_get_constraintdef((select c.oid from pg_catalog.pg_constraint c
       where c.conrelid = 'public.points_lots'::regclass and c.conname = 'points_lots_source_check')), 'gift') = 0
     or pg_catalog.strpos(pg_catalog.pg_get_constraintdef((select c.oid from pg_catalog.pg_constraint c
       where c.conrelid = 'public.points_lots'::regclass and c.conname = 'points_lots_source_check')), 'refund_restore') = 0 then
    raise exception 'l7_points verify: points_lots_source_check lacks the new or the old source kinds';
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint c
                  where c.conrelid = 'public.points_lots'::regclass and c.conname = 'points_lots_wallet_scope_check') then
    raise exception 'l7_points verify: points_lots_wallet_scope_check is missing';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     and not has_column_privilege('authenticated', 'public.points_lots', 'wallet_scope', 'SELECT') then
    raise exception 'l7_points verify: authenticated cannot read points_lots.wallet_scope (the billing page labels the wallets)';
  end if;
  if v_debit !~* 'order\s+by\s+pl\.expires_at\s*,\s*pl\.created_at\s*,\s*pl\.id\s+for\s+update'
     or pg_catalog.strpos(v_debit, 'library_agent') = 0
     or pg_catalog.strpos(v_debit, '''library-assistant''') = 0 then
    raise exception 'l7_points verify: debit_points lost the canonical lock order or the wallet rule';
  end if;
  if pg_catalog.strpos(v_free, '''library-assistant''') = 0 or pg_catalog.strpos(v_free, 'ai_free_question_uses') = 0 then
    raise exception 'l7_points verify: ai_start_free_question is not the once-only library question';
  end if;
  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('debit_points', 'credit_points', 'ai_start_free_question', 'credit_wallet_points')) <> 4 then
    raise exception 'l7_points verify: a second overload of debit_points / credit_points / ai_start_free_question / credit_wallet_points (PGRST203)';
  end if;
  foreach fn in array array[
    'public.debit_points(uuid,integer,text,text)',
    'public.credit_wallet_points(uuid,integer,text,timestamp with time zone,uuid,text,text)',
    'public.points_expire_lots(integer)',
    'public.ai_free_question_status(uuid)',
    'public.ai_start_free_question(uuid,text,text,text,integer,integer,text,timestamp with time zone,boolean,jsonb,text[],integer,uuid,jsonb)'] loop
    if not exists (select 1 from pg_catalog.pg_proc p where p.oid = to_regprocedure(fn)
                    and p.prosecdef and p.proconfig @> array['search_path=""']) then
      raise exception 'l7_points verify: % is missing or not SECURITY DEFINER with search_path ''''', fn;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_function_privilege('anon', fn, 'EXECUTE') or has_function_privilege('authenticated', fn, 'EXECUTE')) then
      raise exception 'l7_points verify: a session role can EXECUTE %', fn;
    end if;
  end loop;
  -- the definers run each other: same owner
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.ai_start_free_question(uuid,text,text,text,integer,integer,text,timestamp with time zone,boolean,jsonb,text[],integer,uuid,jsonb)');
  if not has_function_privilege(v_owner,
       'public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE')
     or not has_function_privilege(v_owner, 'public.ai_free_question_status(uuid)', 'EXECUTE') then
    raise exception 'l7_points verify: %, the owner of ai_start_free_question, cannot run ai_start_run / ai_free_question_status', v_owner;
  end if;
  select pg_catalog.pg_get_userbyid(p.proowner) into v_owner from pg_catalog.pg_proc p
   where p.oid = to_regprocedure('public.points_expire_lots(integer)');
  if not has_function_privilege(v_owner, 'public.revoke_lot(uuid,text)', 'EXECUTE') then
    raise exception 'l7_points verify: %, the owner of points_expire_lots, cannot run revoke_lot', v_owner;
  end if;
  foreach t in array array['points_lot_expiry_notices', 'ai_free_question_uses'] loop
    if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'l7_points verify: RLS is off on public.%', t;
    end if;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
       and (has_table_privilege('authenticated', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE')
            or has_table_privilege('anon', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE')) then
      raise exception 'l7_points verify: a session role holds a privilege on public.%', t;
    end if;
  end loop;
  if (select count(*) from public.platform_settings
       where key in ('library_plan_points', 'gift_valid_days', 'min_topup_by_account_type', 'free_questions_by_account_type')) <> 4 then
    raise exception 'l7_points verify: a setting row is missing';
  end if;
  raise notice 'l7_points verify: OK — wallets on points_lots, debit_points by wallet → plan → purchased → bonus/gift, credit_wallet_points, points_expire_lots + expiry notices, free library questions once, 4 settings';
end
$verify$;

commit;

notify pgrst, 'reload schema';

select '20261127_40 points wallets, spend order, expiry, free questions once' as step,
       (exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'points_lots' and column_name = 'wallet_scope')
        and to_regprocedure('public.credit_wallet_points(uuid,int,text,timestamptz,uuid,text,text)') is not null
        and to_regprocedure('public.points_expire_lots(int)') is not null
        and to_regclass('public.ai_free_question_uses') is not null
        and pg_catalog.strpos(pg_catalog.pg_get_functiondef('public.debit_points(uuid, int, text, text)'::regprocedure), 'library_agent') > 0
        and (select count(*) from public.platform_settings
              where key in ('library_plan_points', 'gift_valid_days', 'min_topup_by_account_type', 'free_questions_by_account_type')) = 4) as ok;
