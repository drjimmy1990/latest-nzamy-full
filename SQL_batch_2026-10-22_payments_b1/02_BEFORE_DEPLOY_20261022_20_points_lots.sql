-- =============================================================================
-- Migration: 20261022_20_points_lots.sql
-- =============================================================================
-- PURPOSE (Moyasar payments B1, Task 2 — the W8 points ledger redesigned for
-- owner answers ٢٢٤ / ٢٤٤ / ٢٤٩ and ruling 5 of the B1 plan)
--   Points live in expiring batches ("lots"). Each top-up pack, each plan
--   month and each grant is one lot with its own expiry; a debit consumes the
--   lot nearest to expiry first and may span several lots; an expired lot no
--   longer counts. Every change to a lot writes one ledger row per lot touched.
--   The points balances people already hold are kept (٢٢٤): each non-zero
--   lawyer_profiles.credit_balance, and each non-zero latest
--   credit_transactions.balance_after of a user without a lawyer profile,
--   becomes one 'migrated' lot.
--
-- WHAT IT CREATES OR CHANGES (idempotent — safe to run any number of times)
--   public.points_lots     one row per batch of points: source (purchase,
--     plan_monthly, grant, admin, migrated, refund_restore), points_total > 0,
--     points_left between 0 and points_total, expires_at NOT NULL, order_id →
--     payment_orders ON DELETE SET NULL, user_id → auth.users ON DELETE
--     CASCADE. UNIQUE (order_id, source): one lot per order and source, so
--     fulfilment is idempotent per order (NULL order_id is unconstrained).
--     Index (user_id, expires_at).
--   public.points_ledger   one row per lot touched: delta <> 0 (credit +,
--     usage / expiry / refund_revoke −; admin_adjustment either), reason, tool,
--     ref. user_id and lot_id cascade (deleting a GoTrue user is never
--     blocked). Index (user_id, created_at desc) and (lot_id).
--   public.points_balance(p_user uuid) → int   the sum of points_left over the
--     user's lots with expires_at > now().
--   public.credit_points(p_user, p_points, p_source, p_expires_at, p_order,
--     p_ref) → uuid   creates one lot (expiry must be in the future; a given
--     p_order must belong to p_user) and its 'credit' ledger row; returns the
--     lot id.
--   public.debit_points(p_user, p_points, p_tool, p_ref) → int   locks the
--     user's unexpired lots FOR UPDATE ordered by expires_at, created_at, id
--     (every debit locks in the same order: two debits never deadlock and never
--     both spend the same points), consumes nearest-expiry first across lots,
--     writes one 'usage' row per lot touched, returns the balance after. When
--     the unexpired balance is too small it raises P0001 'insufficient_points'
--     before touching anything.
--   public.revoke_lot(p_lot uuid, p_reason text) → int   sets points_left = 0
--     and writes one ledger row (reason expiry / refund_revoke /
--     admin_adjustment); returns the points removed (0, and no row, when the
--     lot was already empty).
--   public.platform_settings  key points_enforcement seeded false (a JSON
--     boolean — the admin settings validator requires one); ON CONFLICT DO
--     NOTHING, so an admin's value is never reset.
--   Existing balances (ruling 5; controller ruling of fix round 1): one
--     'migrated' lot, expiring now() + 12 months, plus its 'credit' ledger row,
--     per user with
--       (a) lawyer_profiles.credit_balance > 0, or
--       (b) NO lawyer_profiles row and a latest credit_transactions
--           .balance_after (by created_at, id) > 0 — the balance
--           checkCreditBalance (src/lib/access-control.ts) reads for them.
--     A lawyer's balance is credit_balance alone (as checkCreditBalance reads
--     it), so a lawyer is never migrated from both sources. ONE-SHOT: the first
--     apply records platform_settings key points_lots_migrated_at, and every
--     later run skips both backfills (a balance that turns positive after the
--     migration never mints a fresh 12-month lot); a user who already has a
--     migrated lot is skipped as well. credit_balance and credit_transactions
--     are left untouched.
--
-- WHO CAN DO WHAT
--   * points_lots / points_ledger: RLS on; revoke ALL from anon,
--     authenticated, PUBLIC (the self-host restore gives every new public table
--     GRANT ALL to the API roles); a signed-in user SELECTs their own rows
--     (policies "own points lots" / "own points ledger", column SELECT on every
--     column); no session writes. service_role gets ALL. The ledger's id
--     sequence: service_role only.
--   * credit_points, debit_points, revoke_lot: EXECUTE for service_role only.
--   * points_balance: EXECUTE for authenticated and service_role. A signed-in
--     caller may ask only for auth.uid() (another user raises 42501); the
--     service role (role setting service_role) and the database owner in the
--     SQL Editor (role setting none AND a session user that is postgres, a
--     member of it, or a superuser) may ask for anyone.
--   All four are SECURITY DEFINER with search_path ''.
--   A raising verify at the end checks all of the above, the effective column
--   privileges included (a pg_attribute sweep).
--
-- PREREQUISITES (the file raises without them)
--   20261022_10 (payment_orders), 20260627_platform_settings,
--   20260603_phase1_001 (lawyer_profiles.credit_balance),
--   20260603_phase1_003 (credit_transactions).
--
-- DEPLOY ORDER — BEFORE THE DEPLOY (the batch ships it as
-- 02_BEFORE_DEPLOY_20261022_20_points_lots.sql, after 20261022_10)
--   The B1 code tolerates the absence of these objects (42P01 / 42883) and
--   keeps today's behaviour, so running it late breaks nothing — but a paid
--   top-up cannot be credited as a lot until this file has run.
--   points_enforcement is seeded false: no tool starts refusing for lack of
--   points until an admin turns it on.
--
-- ROLLBACK (deletes every lot and ledger row; credit_balance was never touched)
--   drop function if exists public.points_balance(uuid),
--     public.credit_points(uuid, int, text, timestamptz, uuid, text),
--     public.debit_points(uuid, int, text, text), public.revoke_lot(uuid, text);
--   drop table if exists public.points_ledger, public.points_lots;
--   delete from public.platform_settings
--    where key in ('points_enforcement', 'points_lots_migrated_at');
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.payment_orders') is null then
    raise exception '20261022_20: public.payment_orders does not exist — run 20261022_10 first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261022_20: public.platform_settings does not exist — run 20260627_platform_settings.sql first';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'lawyer_profiles'
                    and column_name = 'credit_balance') then
    raise exception '20261022_20: public.lawyer_profiles.credit_balance does not exist — run 20260603_phase1_001 first';
  end if;
  if to_regclass('public.credit_transactions') is null then
    raise exception '20261022_20: public.credit_transactions does not exist — run 20260603_phase1_003 first';
  end if;
end $$;

-- ── 1. points_lots ───────────────────────────────────────────────────────────
create table if not exists public.points_lots (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  source       text not null
               constraint points_lots_source_check
               check (source in ('purchase','plan_monthly','grant','admin','migrated','refund_restore')),
  points_total int  not null constraint points_lots_points_total_check check (points_total > 0),
  points_left  int  not null,
  expires_at   timestamptz not null,
  order_id     uuid null references public.payment_orders(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint points_lots_points_left_check check (points_left between 0 and points_total),
  -- one lot per order and source: fulfilment can never credit an order twice
  -- (NULL order_id — migrated, grants, admin — stays unconstrained)
  constraint points_lots_order_source_key unique (order_id, source)
);

create index if not exists points_lots_user_expires_idx
  on public.points_lots (user_id, expires_at);

comment on table public.points_lots is
  'Points in expiring lots (20261022_20, B1; owner ٢٢٤/٢٤٤/٢٤٩). A user reads own rows; only the server writes, through credit_points / debit_points / revoke_lot.';

alter table public.points_lots enable row level security;
drop policy if exists "own points lots" on public.points_lots;
create policy "own points lots" on public.points_lots
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.points_lots from anon, authenticated, public;
grant select (id, user_id, source, points_total, points_left, expires_at, order_id, created_at)
  on public.points_lots to authenticated;
grant all on public.points_lots to service_role;

-- ── 2. points_ledger ─────────────────────────────────────────────────────────
create table if not exists public.points_ledger (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  lot_id     uuid not null references public.points_lots(id) on delete cascade,
  delta      int  not null constraint points_ledger_delta_check check (delta <> 0),
  reason     text not null
             constraint points_ledger_reason_check
             check (reason in ('credit','usage','expiry','refund_revoke','admin_adjustment')),
  tool       text,
  ref        text,
  created_at timestamptz not null default now()
);

create index if not exists points_ledger_user_created_idx
  on public.points_ledger (user_id, created_at desc);
create index if not exists points_ledger_lot_idx
  on public.points_ledger (lot_id);

comment on table public.points_ledger is
  'One row per points lot touched (20261022_20, B1). A user reads own rows; only the server writes, through the points functions.';

alter table public.points_ledger enable row level security;
drop policy if exists "own points ledger" on public.points_ledger;
create policy "own points ledger" on public.points_ledger
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.points_ledger from anon, authenticated, public;
grant select (id, user_id, lot_id, delta, reason, tool, ref, created_at)
  on public.points_ledger to authenticated;
grant all on public.points_ledger to service_role;

revoke all on sequence public.points_ledger_id_seq from anon, authenticated, public;
grant usage, select on sequence public.points_ledger_id_seq to service_role;

-- ── 3. points_balance ────────────────────────────────────────────────────────
create or replace function public.points_balance(p_user uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  -- the outer SET ROLE survives SECURITY DEFINER (current_user does not):
  -- service_role for the server, none for a session that never SET ROLE
  v_role text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  if p_user is null then
    raise exception 'points_balance: p_user is required' using errcode = '22023';
  end if;
  -- role none is trusted only for the database owner (the SQL Editor): the
  -- session user must be postgres, a member of it, or a superuser — never a
  -- login role that merely inherits authenticated
  if not ((v_uid is not null and v_uid = p_user)
          or v_role = 'service_role'
          or (v_role = 'none'
              and (pg_has_role(session_user, 'postgres', 'MEMBER')
                   or coalesce((select r.rolsuper from pg_catalog.pg_roles r where r.rolname = session_user), false)))) then
    raise exception 'points_balance: a user may read only their own balance' using errcode = '42501';
  end if;
  return coalesce((select sum(l.points_left) from public.points_lots l
                    where l.user_id = p_user and l.expires_at > now()), 0)::int;
end;
$$;

comment on function public.points_balance(uuid) is
  'Unexpired points of a user (20261022_20, B1). authenticated: own balance only (another user raises 42501); service_role: anyone.';

revoke all on function public.points_balance(uuid) from public, anon, authenticated;
grant execute on function public.points_balance(uuid) to authenticated, service_role;

-- ── 4. credit_points ─────────────────────────────────────────────────────────
create or replace function public.credit_points(
  p_user       uuid,
  p_points     int,
  p_source     text,
  p_expires_at timestamptz,
  p_order      uuid default null,
  p_ref        text default null)
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
    raise exception 'credit_points: p_user and a positive p_points are required' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'credit_points: p_expires_at must be in the future' using errcode = '22023';
  end if;
  if p_order is not null
     and not exists (select 1 from public.payment_orders o where o.id = p_order and o.user_id = p_user) then
    raise exception 'credit_points: p_order is not an order of p_user' using errcode = '22023';
  end if;
  insert into public.points_lots (user_id, source, points_total, points_left, expires_at, order_id)
    values (p_user, p_source, p_points, p_points, p_expires_at, p_order)
    returning id into v_lot;
  insert into public.points_ledger (user_id, lot_id, delta, reason, ref)
    values (p_user, v_lot, p_points, 'credit', p_ref);
  return v_lot;
end;
$$;

comment on function public.credit_points(uuid, int, text, timestamptz, uuid, text) is
  'Creates one points lot and its credit ledger row; returns the lot id (20261022_20, B1). Service role only.';

revoke all on function public.credit_points(uuid, int, text, timestamptz, uuid, text) from public, anon, authenticated;
grant execute on function public.credit_points(uuid, int, text, timestamptz, uuid, text) to service_role;

-- ── 5. debit_points ──────────────────────────────────────────────────────────
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
begin
  if p_user is null or p_points is null or p_points <= 0 then
    raise exception 'debit_points: p_user and a positive p_points are required' using errcode = '22023';
  end if;

  -- Lock the user's unexpired lots, nearest expiry first. Every debit locks in
  -- this one order, so two concurrent debits queue instead of deadlocking, and
  -- the second one sees what the first left (READ COMMITTED re-checks a row it
  -- waited for, points_left > 0 included).
  select coalesce(sum(l.points_left), 0) into v_avail
    from (select pl.points_left
            from public.points_lots pl
           where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
           order by pl.expires_at, pl.created_at, pl.id
             for update) l;

  if v_avail < p_points then
    raise exception 'insufficient_points' using errcode = 'P0001',
      detail = format('available %s, requested %s', v_avail, p_points);
  end if;

  v_need := p_points;
  for v_lot in
    select pl.id, pl.points_left
      from public.points_lots pl
     where pl.user_id = p_user and pl.expires_at > now() and pl.points_left > 0
     order by pl.expires_at, pl.created_at, pl.id
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
  'Debits points nearest-expiry first across lots, one usage ledger row per lot; returns the balance after; raises P0001 insufficient_points and changes nothing when short (20261022_20, B1). Service role only.';

revoke all on function public.debit_points(uuid, int, text, text) from public, anon, authenticated;
grant execute on function public.debit_points(uuid, int, text, text) to service_role;

-- ── 6. revoke_lot ────────────────────────────────────────────────────────────
create or replace function public.revoke_lot(p_lot uuid, p_reason text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_left int;
begin
  if p_reason is null or p_reason not in ('expiry', 'refund_revoke', 'admin_adjustment') then
    raise exception 'revoke_lot: p_reason must be expiry, refund_revoke or admin_adjustment' using errcode = '22023';
  end if;
  select pl.user_id, pl.points_left into v_user, v_left
    from public.points_lots pl
   where pl.id = p_lot
     for update;
  if not found then
    raise exception 'lot_not_found' using errcode = 'P0002';
  end if;
  if v_left = 0 then
    return 0;
  end if;
  update public.points_lots set points_left = 0 where id = p_lot;
  insert into public.points_ledger (user_id, lot_id, delta, reason)
    values (v_user, p_lot, -v_left, p_reason);
  return v_left;
end;
$$;

comment on function public.revoke_lot(uuid, text) is
  'Empties one points lot and writes its ledger row; returns the points removed (20261022_20, B1). Service role only.';

revoke all on function public.revoke_lot(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_lot(uuid, text) to service_role;

-- ── 7. points_enforcement (off until an admin turns it on) ───────────────────
insert into public.platform_settings (key, value, description) values
  ('points_enforcement', 'false'::jsonb,
   'خصم النقاط عند استخدام أدوات الذكاء الاصطناعي: true يفعّل الخصم ورفض الطلب عند نفاد الرصيد، وfalse يوقفه (20261022_20)')
on conflict (key) do nothing;

-- ── 8. existing balances become migrated lots (ruling 5; owner ٢٢٤) ──────────
-- ONE-SHOT: both backfills run only while platform_settings has no
-- points_lots_migrated_at row; the row is written right after them, in this
-- same transaction. A user who already has a migrated lot is skipped too.
-- credit_balance and credit_transactions are not changed.

-- 8a. lawyers: lawyer_profiles.credit_balance > 0
with src as (
  select lp.user_id, lp.credit_balance
    from public.lawyer_profiles lp
   where lp.credit_balance > 0
     and not exists (select 1 from public.platform_settings ps where ps.key = 'points_lots_migrated_at')
     and not exists (select 1 from public.points_lots pl
                      where pl.user_id = lp.user_id and pl.source = 'migrated')
), lots as (
  insert into public.points_lots (user_id, source, points_total, points_left, expires_at)
  select s.user_id, 'migrated', s.credit_balance, s.credit_balance, now() + interval '12 months'
    from src s
  returning id, user_id, points_total
)
insert into public.points_ledger (user_id, lot_id, delta, reason, ref)
select l.user_id, l.id, l.points_total, 'credit', 'migrated:lawyer_profiles.credit_balance'
  from lots l;

-- 8b. everyone else (no lawyer_profiles row at all): the latest
--     credit_transactions.balance_after, by created_at then id — what
--     checkCreditBalance reads for them. A lawyer's balance is credit_balance
--     alone, so a lawyer is never migrated from this source.
with latest as (
  select distinct on (ct.user_id) ct.user_id, ct.balance_after
    from public.credit_transactions ct
   where not exists (select 1 from public.lawyer_profiles lp where lp.user_id = ct.user_id)
   order by ct.user_id, ct.created_at desc, ct.id desc
), src as (
  select l.user_id, l.balance_after
    from latest l
   where l.balance_after > 0
     and not exists (select 1 from public.platform_settings ps where ps.key = 'points_lots_migrated_at')
     and not exists (select 1 from public.points_lots pl
                      where pl.user_id = l.user_id and pl.source = 'migrated')
), lots as (
  insert into public.points_lots (user_id, source, points_total, points_left, expires_at)
  select s.user_id, 'migrated', s.balance_after, s.balance_after, now() + interval '12 months'
    from src s
  returning id, user_id, points_total
)
insert into public.points_ledger (user_id, lot_id, delta, reason, ref)
select l.user_id, l.id, l.points_total, 'credit', 'migrated:credit_transactions.balance_after'
  from lots l;

-- 8c. the one-shot marker (never overwritten)
insert into public.platform_settings (key, value, description) values
  ('points_lots_migrated_at', to_jsonb(now()),
   'تاريخ تحويل أرصدة النقاط القائمة إلى دفعات صالحة ١٢ شهرًا (مرة واحدة؛ لا يُعاد التحويل ما دام هذا المفتاح موجودًا) (20261022_20)')
on conflict (key) do nothing;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  r        text;
  p        text;
  col      text;
  tbl      text;
  fn       text;
  cfg      text[];
  definer  boolean;
  v        jsonb;
  n        int;
  missing  text := '';
  lots_cols   constant text[] := array['id','user_id','source','points_total','points_left','expires_at','order_id','created_at'];
  ledger_cols constant text[] := array['id','user_id','lot_id','delta','reason','tool','ref','created_at'];
  fns         constant text[] := array['public.points_balance(uuid)',
                                       'public.credit_points(uuid,integer,text,timestamp with time zone,uuid,text)',
                                       'public.debit_points(uuid,integer,text,text)',
                                       'public.revoke_lot(uuid,text)'];
begin
  -- columns
  foreach col in array lots_cols loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.points_lots'::regclass
                    and attname = col and not attisdropped) then
      missing := missing || format(' points_lots.%s is missing (an older table of the same name?);', col);
    end if;
  end loop;
  foreach col in array ledger_cols loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.points_ledger'::regclass
                    and attname = col and not attisdropped) then
      missing := missing || format(' points_ledger.%s is missing (an older table of the same name?);', col);
    end if;
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.points_lots'::regclass
                  and conname = 'points_lots_points_left_check') then
    missing := missing || ' points_lots_points_left_check is missing;';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.points_lots'::regclass
                  and conname = 'points_lots_order_source_key' and contype = 'u') then
    missing := missing || ' points_lots_order_source_key (UNIQUE order_id, source) is missing (an older points_lots? fulfilment could credit an order twice);';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'points_lots'
                  and indexname = 'points_lots_user_expires_idx') then
    missing := missing || ' points_lots_user_expires_idx is missing;';
  end if;

  -- RLS and policies
  foreach tbl in array array['points_lots', 'points_ledger'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || tbl)::regclass) then
      missing := missing || format(' RLS is off on %s;', tbl);
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'points_lots') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'points_lots'
                     and policyname = 'own points lots' and cmd = 'SELECT') then
    missing := missing || ' points_lots: expected exactly one policy, "own points lots" FOR SELECT;';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'points_ledger') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'points_ledger'
                     and policyname = 'own points ledger' and cmd = 'SELECT') then
    missing := missing || ' points_ledger: expected exactly one policy, "own points ledger" FOR SELECT;';
  end if;

  -- effective privileges: no table-level privilege for the API roles; column
  -- SELECT for authenticated on exactly the allow-list; no column write
  foreach tbl in array array['points_lots', 'points_ledger'] loop
    foreach r in array array['anon', 'authenticated', 'public'] loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
        if has_table_privilege(r, 'public.' || tbl, p) then
          missing := missing || format(' %s holds table %s on %s;', r, p, tbl);
        end if;
      end loop;
      for col in select attname::text from pg_attribute
                  where attrelid = ('public.' || tbl)::regclass and attnum > 0 and not attisdropped loop
        if has_column_privilege(r, 'public.' || tbl, col, 'INSERT, UPDATE, REFERENCES') then
          missing := missing || format(' %s can write %s.%s;', r, tbl, col);
        end if;
        if has_column_privilege(r, 'public.' || tbl, col, 'SELECT')
           <> (r = 'authenticated'
               and ((tbl = 'points_lots' and col = any (lots_cols))
                    or (tbl = 'points_ledger' and col = any (ledger_cols)))) then
          missing := missing || format(' %s %s SELECT on %s.%s;', r,
                       case when has_column_privilege(r, 'public.' || tbl, col, 'SELECT') then 'holds' else 'lacks' end,
                       tbl, col);
        end if;
      end loop;
    end loop;
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if not has_table_privilege('service_role', 'public.' || tbl, p) then
        missing := missing || format(' service_role lacks %s on %s;', p, tbl);
      end if;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_sequence_privilege(r, 'public.points_ledger_id_seq', 'USAGE, SELECT, UPDATE') then
      missing := missing || format(' %s holds a privilege on points_ledger_id_seq;', r);
    end if;
  end loop;

  -- the functions: SECURITY DEFINER, search_path '', EXECUTE matrix
  foreach fn in array fns loop
    select proconfig, prosecdef into cfg, definer from pg_proc where oid = to_regprocedure(fn);
    if not coalesce(definer, false) or cfg is null or not ('search_path=""' = any (cfg)) then
      missing := missing || format(' %s is missing or not SECURITY DEFINER with search_path '''';', fn);
      continue;
    end if;
    foreach r in array array['anon', 'public'] loop
      if has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || format(' %s can EXECUTE %s;', r, fn);
      end if;
    end loop;
    if has_function_privilege('authenticated', fn, 'EXECUTE') <> (fn = 'public.points_balance(uuid)') then
      missing := missing || format(' authenticated %s EXECUTE %s;', case when has_function_privilege('authenticated', fn, 'EXECUTE') then 'can' else 'cannot' end, fn);
    end if;
    if not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || format(' service_role cannot EXECUTE %s;', fn);
    end if;
  end loop;
  if to_regprocedure('public.debit_points(uuid,integer,text,text)') is not null
     and pg_get_functiondef('public.debit_points(uuid,integer,text,text)'::regprocedure)
         !~* 'order\s+by\s+pl\.expires_at\s*,\s*pl\.created_at\s*,\s*pl\.id\s+for\s+update' then
    missing := missing || ' debit_points does not lock the lots FOR UPDATE ordered by expires_at, created_at;';
  end if;

  -- points_enforcement
  select value into v from public.platform_settings where key = 'points_enforcement';
  if v is null or jsonb_typeof(v) <> 'boolean' then
    missing := missing || format(' platform_settings points_enforcement is missing or not a JSON boolean: %s;', coalesce(v::text, 'no row'));
  end if;

  -- the one-shot backfill marker
  if not exists (select 1 from public.platform_settings where key = 'points_lots_migrated_at') then
    missing := missing || ' platform_settings points_lots_migrated_at is missing (the balance backfill did not record itself);';
  end if;

  if missing <> '' then
    raise exception '20261022_20 verify:%', missing;
  end if;

  -- a positive balance without a migrated lot is legitimate after the
  -- one-shot backfill (it turned positive later): NOTICE only
  select count(*) into n from public.lawyer_profiles lp
   where lp.credit_balance > 0
     and not exists (select 1 from public.points_lots pl where pl.user_id = lp.user_id and pl.source = 'migrated');
  if n > 0 then
    raise notice '20261022_20: % lawyer(s) hold a positive credit_balance without a migrated lot (positive after the one-shot backfill of %)',
      n, (select value from public.platform_settings where key = 'points_lots_migrated_at');
  end if;
  raise notice '20261022_20 verify: OK — points_lots / points_ledger own-row SELECT, no session writes; points_balance own-or-service, credit_points / debit_points / revoke_lot service role only; debit locks nearest-expiry first; points_enforcement = %; % migrated lot(s)',
    v, (select count(*) from public.points_lots where source = 'migrated');
end $$;

commit;

notify pgrst, 'reload schema';
