-- =============================================================================
-- Migration: 20261022_10_payments_core.sql
-- =============================================================================
-- PURPOSE (Moyasar payments B1; owner answers ٢٣٥–٢٤٦, rulings 1 and 6 of the
-- B1 plan)
--   The schema that online payment needs: one row per order, the saved card
--   tokens, the webhook events already handled, receipt numbers, the plans
--   sold online, the two tiers the code already knows (shield, enterprise),
--   and the link from a library grant to the order that bought it. Later
--   tasks of the batch write and read these; this file only creates them.
--
-- WHAT IT CREATES OR CHANGES (idempotent — safe to run any number of times)
--   public.payment_orders            one row per checkout. Amounts in halalas;
--     total_halalas = net_halalas + vat_halalas and > 0 (CHECK). user_id is
--     NULLABLE and ON DELETE SET NULL: deleting a GoTrue user must never be
--     blocked, and the order (with its receipt number) stays for the books.
--     Index (user_id, created_at desc); partial index on created_at where
--     status = 'initiated' (the sweep). updated_at trigger.
--   public.payment_methods           saved card tokens (ON DELETE CASCADE).
--   public.payment_webhook_events    Moyasar event ids already handled.
--   public.payment_receipt_seq       + public.next_receipt_number() → text
--     'NZ-<Riyadh year>-<6 digits>'. SECURITY DEFINER, search_path ''.
--   public.subscription_plans.tier and public.subscriptions.tier CHECKs gain
--     'shield' and 'enterprise' (the ServerTier list in
--     src/lib/access-control.ts). The constraints are found through
--     pg_constraint (any CHECK on the tier column alone), dropped and re-added
--     under their usual names — only when one is not already the full list.
--   public.subscription_plans        upserts the 7 plans sold online (ruling
--     1 and 6). On conflict it updates the names and prices only; an existing
--     row keeps its tier, audience, features, limits, sort order and active.
--   public.library_access_grants     source CHECK gains 'purchase' (the
--     constraint keeps its name: 20261021_50 and _verify look it up by name);
--     new nullable column order_id → payment_orders(id) ON DELETE SET NULL,
--     UNIQUE (one grant per order: fulfilment can never grant twice).
--   public.platform_settings         key billing_company seeded with null
--     fields; ON CONFLICT DO NOTHING, so an admin's entry is never reset.
--
-- WHO CAN DO WHAT
--   * Every new table: RLS on; revoke ALL from anon, authenticated, PUBLIC
--     (the self-host restore gives every new public table GRANT ALL to the API
--     roles), then the narrow grants below. service_role gets ALL.
--   * payment_orders: policy "own payment orders" — a signed-in user SELECTs
--     their own rows; column SELECT on every column EXCEPT metadata.
--   * payment_methods: policy "own payment methods" — the same; column SELECT
--     on every column EXCEPT token.
--   * payment_webhook_events: no policy, no grant: service role only.
--   * payment_receipt_seq: no privilege for anon / authenticated / PUBLIC.
--   * next_receipt_number(): EXECUTE for service_role only (revoked from
--     PUBLIC, anon, authenticated).
--   No session writes any of these; only the server (service role) does.
--   A raising verify at the end checks all of the above, the effective column
--   privileges included (a pg_attribute sweep).
--
-- PREREQUISITES (the file raises without them)
--   20260603_phase1_003 (subscription_plans, subscriptions),
--   20260627_platform_settings, 20261019_10_library_access_grants.
--
-- DEPLOY ORDER — EITHER ORDER
--   Nothing reads the new tables yet; the code of the later tasks tolerates
--   their absence (42P01 / 42703) and keeps today's behaviour (no online
--   payment). The CHECK widenings only allow more values.
--
-- ROLLBACK (deletes every order, saved card and handled event)
--   alter table public.library_access_grants drop column if exists order_id;
--   drop table if exists public.payment_webhook_events, public.payment_methods,
--     public.payment_orders;
--   drop function if exists public.next_receipt_number();
--   drop sequence if exists public.payment_receipt_seq;
--   delete from public.platform_settings where key = 'billing_company';
--   (the widened CHECKs and the plan rows can stay: they only allow more)
-- =============================================================================

begin;

do $$
begin
  if to_regclass('public.subscription_plans') is null or to_regclass('public.subscriptions') is null then
    raise exception '20261022_10: public.subscription_plans / public.subscriptions do not exist — run 20260603_phase1_003 first';
  end if;
  if to_regclass('public.platform_settings') is null then
    raise exception '20261022_10: public.platform_settings does not exist — run 20260627_platform_settings.sql first';
  end if;
  if to_regclass('public.library_access_grants') is null then
    raise exception '20261022_10: public.library_access_grants does not exist — run 20261019_10 first';
  end if;
end $$;

-- ── 1. payment_orders ────────────────────────────────────────────────────────
create table if not exists public.payment_orders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid null references auth.users(id) on delete set null,
  merchant           text not null default 'platform'
                     constraint payment_orders_merchant_check check (merchant in ('platform','office')),
  kind               text not null
                     constraint payment_orders_kind_check check (kind in ('plan','library','topup','service')),
  item_id            text not null,
  billing            text not null
                     constraint payment_orders_billing_check check (billing in ('monthly','yearly','once')),
  net_halalas        int  not null constraint payment_orders_net_check check (net_halalas >= 0),
  vat_halalas        int  not null constraint payment_orders_vat_check check (vat_halalas >= 0),
  total_halalas      int  not null,
  vat_mode           text not null
                     constraint payment_orders_vat_mode_check check (vat_mode in ('exclusive','inclusive')),
  currency           text not null default 'SAR',
  status             text not null default 'created'
                     constraint payment_orders_status_check
                     check (status in ('created','initiated','paid','failed','refunded','voided','cancelled')),
  moyasar_intent_id  text,
  moyasar_payment_id text constraint payment_orders_moyasar_payment_id_key unique,
  live               boolean,
  source             text not null default 'checkout'
                     constraint payment_orders_source_check check (source in ('checkout','renewal','payment_link','admin')),
  receipt_number     text constraint payment_orders_receipt_number_key unique,
  paid_at            timestamptz,
  fulfilled_at       timestamptz,
  refunded_at        timestamptz,
  refunded_halalas   int  not null default 0,
  failure_message    text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint payment_orders_total_check check (total_halalas = net_halalas + vat_halalas and total_halalas > 0),
  constraint payment_orders_refunded_check check (refunded_halalas between 0 and total_halalas)
);

create index if not exists payment_orders_user_created_idx
  on public.payment_orders (user_id, created_at desc);
create index if not exists payment_orders_initiated_idx
  on public.payment_orders (created_at) where status = 'initiated';

drop trigger if exists set_updated_at_payment_orders on public.payment_orders;
create trigger set_updated_at_payment_orders
  before update on public.payment_orders
  for each row execute function public.handle_updated_at();

comment on table public.payment_orders is
  'Moyasar payment orders (20261022_10, B1). A user reads own rows except metadata; only the server writes. user_id is SET NULL when the account is deleted.';

alter table public.payment_orders enable row level security;
drop policy if exists "own payment orders" on public.payment_orders;
create policy "own payment orders" on public.payment_orders
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.payment_orders from anon, authenticated, public;
grant select (id, user_id, merchant, kind, item_id, billing, net_halalas, vat_halalas,
              total_halalas, vat_mode, currency, status, moyasar_intent_id, moyasar_payment_id,
              live, source, receipt_number, paid_at, fulfilled_at, refunded_at,
              refunded_halalas, failure_message, created_at, updated_at)
  on public.payment_orders to authenticated;
grant all on public.payment_orders to service_role;

-- ── 2. payment_methods (saved card tokens) ───────────────────────────────────
create table if not exists public.payment_methods (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  merchant   text not null default 'platform'
             constraint payment_methods_merchant_check check (merchant in ('platform','office')),
  token      text not null constraint payment_methods_token_key unique,
  brand      text,
  last_four  text,
  exp_month  text,
  exp_year   text,
  status     text not null default 'active'
             constraint payment_methods_status_check check (status in ('active','inactive','deleted')),
  created_at timestamptz not null default now()
);

create index if not exists payment_methods_user_idx on public.payment_methods (user_id);

comment on table public.payment_methods is
  'Saved Moyasar card tokens (20261022_10, B1). A user reads own rows except token; only the server writes.';

alter table public.payment_methods enable row level security;
drop policy if exists "own payment methods" on public.payment_methods;
create policy "own payment methods" on public.payment_methods
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.payment_methods from anon, authenticated, public;
grant select (id, user_id, merchant, brand, last_four, exp_month, exp_year, status, created_at)
  on public.payment_methods to authenticated;
grant all on public.payment_methods to service_role;

-- ── 3. payment_webhook_events (service role only) ────────────────────────────
create table if not exists public.payment_webhook_events (
  event_id    text primary key,
  merchant    text,
  type        text,
  payment_id  text,
  live        boolean,
  received_at timestamptz not null default now(),
  outcome     text
);

comment on table public.payment_webhook_events is
  'Moyasar webhook events already handled (20261022_10, B1). Service role only.';

alter table public.payment_webhook_events enable row level security;
revoke all on public.payment_webhook_events from anon, authenticated, public;
grant all on public.payment_webhook_events to service_role;

-- ── 4. receipt numbers ───────────────────────────────────────────────────────
create sequence if not exists public.payment_receipt_seq;
revoke all on sequence public.payment_receipt_seq from anon, authenticated, public;

create or replace function public.next_receipt_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'NZ-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY')
         || '-' || lpad(nextval('public.payment_receipt_seq')::text, 6, '0');
$$;

comment on function public.next_receipt_number() is
  'Next payment receipt number, NZ-<Riyadh year>-<6 digits> (20261022_10, B1). Service role only.';

revoke all on function public.next_receipt_number() from public, anon, authenticated;
grant execute on function public.next_receipt_number() to service_role;

-- ── 5. tier CHECKs gain shield and enterprise ────────────────────────────────
do $$
declare
  t        text;
  cname    text;
  att      int2;
  defs     text[];
  v        text;
  complete boolean;
  tiers    constant text[] := array['free','shield','ai','pro','max','corp','enterprise'];
begin
  foreach t in array array['subscription_plans', 'subscriptions'] loop
    cname := t || '_tier_check';
    select attnum into att from pg_attribute
     where attrelid = ('public.' || t)::regclass and attname = 'tier' and not attisdropped;

    -- already the full list under the usual name, and the only CHECK on tier?
    select array_agg(conname || '=' || pg_get_constraintdef(oid)) into defs
      from pg_constraint
     where conrelid = ('public.' || t)::regclass and contype = 'c' and conkey = array[att];
    complete := coalesce(array_length(defs, 1), 0) = 1 and defs[1] like cname || '=%';
    if complete then
      foreach v in array tiers loop
        if position(quote_literal(v) in defs[1]) = 0 then
          complete := false;
        end if;
      end loop;
    end if;

    if not complete then
      for cname in select conname from pg_constraint
                    where conrelid = ('public.' || t)::regclass and contype = 'c' and conkey = array[att] loop
        execute format('alter table public.%I drop constraint %I', t, cname);
      end loop;
      execute format(
        'alter table public.%I add constraint %I check (tier in (''free'',''shield'',''ai'',''pro'',''max'',''corp'',''enterprise''))',
        t, t || '_tier_check');
    end if;
  end loop;
end $$;

-- ── 6. the plans sold online (ruling 1 and 6) ────────────────────────────────
-- name_ar is the catalog's labelAr (src/lib/payments/catalog.ts, Task 3); prices are SAR as
-- in the B1 plan's PAYABLE_ITEMS. An existing row keeps its tier and audience.
-- The WHERE makes a re-run a true no-op (no updated_at bump).
insert into public.subscription_plans (id, tier, audience, name_ar, name_en, price_monthly, price_yearly) values
  ('ind-ai',                 'ai',         'individual', 'الباقة الذكية',                     'Smart AI Self-Service',   39,    390),
  ('ind-preventive',         'pro',        'individual', 'الباقة الوقائية',                   'Preventive Legal Shield', 149,   1490),
  ('ind-litigation',         'max',        'individual', 'التأمين القانوني',                  'Legal Insurance',         399,   3990),
  ('lawyer-pro',             'pro',        'lawyer',     'المحامي المحترف',                   'Professional Lawyer',     399,   3990),
  ('consultant-independent', 'pro',        'provider',   'المستشار القانوني المستقل',         'Independent Legal Consultant',  399,   3990),
  ('firm-basic',             'corp',       'firm',       'مكتب المحاماة',                     'Law Office',              990,   9900),
  ('firm-enterprise',        'enterprise', 'firm',       'شركة المحاماة',                     'Law Firm',                1490,  14900)
on conflict (id) do update set
  name_ar       = excluded.name_ar,
  name_en       = excluded.name_en,
  price_monthly = excluded.price_monthly,
  price_yearly  = excluded.price_yearly
where (subscription_plans.name_ar, subscription_plans.name_en,
       subscription_plans.price_monthly, subscription_plans.price_yearly)
      is distinct from
      (excluded.name_ar, excluded.name_en, excluded.price_monthly, excluded.price_yearly);

-- ── 7. library grants bought by an order ─────────────────────────────────────
do $$
declare
  def text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.library_access_grants'::regclass and conname = 'library_access_grants_source_check';
  if def is null or position('''purchase''' in def) = 0 then
    alter table public.library_access_grants drop constraint if exists library_access_grants_source_check;
    alter table public.library_access_grants add constraint library_access_grants_source_check
      check (source in ('request','invite_code','colleague_invite','founder_campaign','admin','purchase'));
  end if;
end $$;

alter table public.library_access_grants add column if not exists order_id uuid null;

do $$
declare
  att int2;
begin
  select attnum into att from pg_attribute
   where attrelid = 'public.library_access_grants'::regclass and attname = 'order_id' and not attisdropped;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.library_access_grants'::regclass and contype = 'f'
                    and conkey = array[att] and confrelid = 'public.payment_orders'::regclass) then
    alter table public.library_access_grants
      add constraint library_access_grants_order_id_fkey
      foreign key (order_id) references public.payment_orders(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.library_access_grants'::regclass and contype = 'u'
                    and conkey = array[att]) then
    alter table public.library_access_grants
      add constraint library_access_grants_order_id_key unique (order_id);
  end if;
end $$;

-- ── 8. billing_company (the receipt's issuer; an admin fills it) ─────────────
insert into public.platform_settings (key, value, description) values
  ('billing_company',
   '{"legal_name_ar": null, "cr_number": null, "vat_number": null, "address_ar": null}'::jsonb,
   'بيانات المنشأة التي تظهر في إيصال الدفع: الاسم النظامي ورقم السجل التجاري والرقم الضريبي والعنوان (20261022_10)')
on conflict (key) do nothing;

-- ── Verify ───────────────────────────────────────────────────────────────────
do $$
declare
  r        text;
  p        text;
  col      text;
  v        text;
  def      text;
  tbl      text;
  att      int2;
  cfg      text[];
  definer  boolean;
  missing  text := '';
  orders_cols  constant text[] := array['id','user_id','merchant','kind','item_id','billing','net_halalas',
    'vat_halalas','total_halalas','vat_mode','currency','status','moyasar_intent_id','moyasar_payment_id',
    'live','source','receipt_number','paid_at','fulfilled_at','refunded_at','refunded_halalas',
    'failure_message','metadata','created_at','updated_at'];
  methods_cols constant text[] := array['id','user_id','merchant','token','brand','last_four','exp_month',
    'exp_year','status','created_at'];
  events_cols  constant text[] := array['event_id','merchant','type','payment_id','live','received_at','outcome'];
  plans_bad    text;
begin
  -- columns
  foreach col in array orders_cols loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.payment_orders'::regclass
                    and attname = col and not attisdropped) then
      missing := missing || format(' payment_orders.%s is missing (an older table of the same name?);', col);
    end if;
  end loop;
  foreach col in array methods_cols loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.payment_methods'::regclass
                    and attname = col and not attisdropped) then
      missing := missing || format(' payment_methods.%s is missing;', col);
    end if;
  end loop;
  foreach col in array events_cols loop
    if not exists (select 1 from pg_attribute where attrelid = 'public.payment_webhook_events'::regclass
                    and attname = col and not attisdropped) then
      missing := missing || format(' payment_webhook_events.%s is missing;', col);
    end if;
  end loop;
  if exists (select 1 from pg_attribute where attrelid = 'public.payment_orders'::regclass
              and attname = 'user_id' and attnotnull) then
    missing := missing || ' payment_orders.user_id is NOT NULL (account deletion would be blocked);';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.payment_orders'::regclass
                  and conname = 'payment_orders_total_check') then
    missing := missing || ' payment_orders_total_check is missing;';
  end if;

  -- RLS and policies
  foreach tbl in array array['payment_orders', 'payment_methods', 'payment_webhook_events'] loop
    if not (select relrowsecurity from pg_class where oid = ('public.' || tbl)::regclass) then
      missing := missing || format(' RLS is off on %s;', tbl);
    end if;
  end loop;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'payment_orders') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_orders'
                     and policyname = 'own payment orders' and cmd = 'SELECT') then
    missing := missing || ' payment_orders: expected exactly one policy, "own payment orders" FOR SELECT;';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'payment_methods') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_methods'
                     and policyname = 'own payment methods' and cmd = 'SELECT') then
    missing := missing || ' payment_methods: expected exactly one policy, "own payment methods" FOR SELECT;';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_webhook_events') then
    missing := missing || ' payment_webhook_events has a policy (service role only);';
  end if;

  -- effective privileges: no table-level privilege for the API roles; column
  -- SELECT for authenticated on exactly the allow-list; no column write
  foreach tbl in array array['payment_orders', 'payment_methods', 'payment_webhook_events'] loop
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
               and ((tbl = 'payment_orders' and col <> 'metadata')
                    or (tbl = 'payment_methods' and col <> 'token'))) then
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

  -- the sequence and the function
  foreach r in array array['anon', 'authenticated', 'public'] loop
    if has_sequence_privilege(r, 'public.payment_receipt_seq', 'USAGE, SELECT, UPDATE') then
      missing := missing || format(' %s holds a privilege on payment_receipt_seq;', r);
    end if;
    if has_function_privilege(r, 'public.next_receipt_number()', 'EXECUTE') then
      missing := missing || format(' %s can EXECUTE next_receipt_number();', r);
    end if;
  end loop;
  if not has_function_privilege('service_role', 'public.next_receipt_number()', 'EXECUTE') then
    missing := missing || ' service_role cannot EXECUTE next_receipt_number();';
  end if;
  select proconfig, prosecdef into cfg, definer from pg_proc
   where oid = 'public.next_receipt_number()'::regprocedure;
  if not coalesce(definer, false) or cfg is null or not ('search_path=""' = any (cfg)) then
    missing := missing || ' next_receipt_number() is not SECURITY DEFINER with search_path '''';';
  end if;

  -- the tier CHECKs
  foreach tbl in array array['subscription_plans', 'subscriptions'] loop
    select attnum into att from pg_attribute
     where attrelid = ('public.' || tbl)::regclass and attname = 'tier' and not attisdropped;
    if (select count(*) from pg_constraint where conrelid = ('public.' || tbl)::regclass
         and contype = 'c' and conkey = array[att]) <> 1 then
      missing := missing || format(' %s: expected exactly one CHECK on tier;', tbl);
    end if;
    select pg_get_constraintdef(oid) into def from pg_constraint
     where conrelid = ('public.' || tbl)::regclass and conname = tbl || '_tier_check';
    foreach v in array array['free','shield','ai','pro','max','corp','enterprise'] loop
      if def is null or position(quote_literal(v) in def) = 0 then
        missing := missing || format(' %s.tier CHECK does not allow %s;', tbl, v);
      end if;
    end loop;
  end loop;

  -- the plans sold online, at the catalog's prices
  select string_agg(x.id, ', ') into plans_bad
    from (values ('ind-ai', 39, 390), ('ind-preventive', 149, 1490), ('ind-litigation', 399, 3990),
                 ('lawyer-pro', 399, 3990), ('consultant-independent', 399, 3990),
                 ('firm-basic', 990, 9900), ('firm-enterprise', 1490, 14900)) as x(id, pm, py)
    left join public.subscription_plans sp on sp.id = x.id
   where sp.id is null or sp.price_monthly <> x.pm or sp.price_yearly <> x.py;
  if plans_bad is not null then
    missing := missing || format(' plans missing or at another price: %s;', plans_bad);
  end if;

  -- library grants
  select pg_get_constraintdef(oid) into def from pg_constraint
   where conrelid = 'public.library_access_grants'::regclass and conname = 'library_access_grants_source_check';
  foreach v in array array['request','invite_code','colleague_invite','founder_campaign','admin','purchase'] loop
    if def is null or position(quote_literal(v) in def) = 0 then
      missing := missing || format(' library_access_grants source CHECK does not allow %s;', v);
    end if;
  end loop;
  select attnum into att from pg_attribute
   where attrelid = 'public.library_access_grants'::regclass and attname = 'order_id' and not attisdropped;
  if att is null then
    missing := missing || ' library_access_grants.order_id is missing;';
  else
    if (select count(*) from pg_constraint where conrelid = 'public.library_access_grants'::regclass
         and contype = 'f' and conkey = array[att] and confrelid = 'public.payment_orders'::regclass) <> 1 then
      missing := missing || ' library_access_grants.order_id: expected exactly one FK to payment_orders;';
    end if;
    if (select count(*) from pg_constraint where conrelid = 'public.library_access_grants'::regclass
         and contype = 'u' and conkey = array[att]) <> 1 then
      missing := missing || ' library_access_grants.order_id: expected exactly one UNIQUE;';
    end if;
  end if;

  -- billing_company
  if not exists (select 1 from public.platform_settings where key = 'billing_company'
                  and jsonb_typeof(value) = 'object'
                  and value ?& array['legal_name_ar','cr_number','vat_number','address_ar']) then
    missing := missing || ' platform_settings billing_company is missing or lacks its 4 keys;';
  end if;

  if missing <> '' then
    raise exception '20261022_10 verify:%', missing;
  end if;
  raise notice '20261022_10 verify: OK — payment_orders / payment_methods / payment_webhook_events locked (own-row SELECT without metadata / token; webhook events service role only); next_receipt_number() service role only; tiers allow shield + enterprise; 7 plans at catalog prices; library grants take source purchase + order_id; billing_company seeded';
end $$;

commit;

notify pgrst, 'reload schema';
