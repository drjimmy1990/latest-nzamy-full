-- =============================================================================
-- Migration: 20261209_10_l19_licence_expiry_alerts.sql   (verify id: l19_corr)
-- =============================================================================
-- PURPOSE (batch l19, owner ٢٤١ — 27 Nov 2026)
--   The owner reversed l18's «جدّد رخصتك أولاً» purchase refusal: a VERIFIED
--   licensed account whose licence date has passed pays and subscribes
--   normally (that part is app code: src/lib/payments/licenceGate.ts), and is
--   told instead, in the app and on its dashboard:
--     «تنبيه: رخصتك المهنية تنتهي خلال X يومًا / انتهت — يرجى رفع تجديد الرخصة
--      حتى تستطيع الاستمرار في استخدام المنصة»
--   This file adds the two database pieces those alerts need:
--
--   A. public.licence_expiry_alerts(p_user_ids uuid[], p_horizon_days integer)
--      SECURITY DEFINER, service role only. One row per licence of a VERIFIED
--      account whose expiry date is on or before today (Riyadh) + horizon —
--      already past included:
--        user_id     who is told
--        holder      'lawyer' (lawyers and legal consultants: lawyer_profiles),
--                    'firm' (the OWNER of the firm: firm_profiles),
--                    'provider' (provider_profiles)
--        subject_id  the licence's row: the user id (lawyer / provider), the
--                    firm id (firm)
--        expiry      the date used:
--                    lawyer   — the lawyers' registry expiry when the
--                               licence number is found there (not archived),
--                               else lawyer_profiles.license_expiry (the rule
--                               of 20261127_60's «مكتب موثّق»); without the
--                               registry table, the column only;
--                    firm     — firm_profiles.license_expiry;
--                    provider — provider_profiles.license_expiry, else the
--                               date the provider typed in Settings
--                               (metadata.settings.licenseExpiry, used only
--                               when it is an exact, real YYYY-MM-DD date).
--      p_user_ids NULL = every such account (the daily cron); else only those
--      ids (at most 200; the dashboard banner asks for the caller's own id).
--      p_horizon_days 0..366.
--   B. Three new kinds on public.email_reminder_log (20261125_20), the once-only
--      marker of the in-app notices (src/lib/email/reminderDelivery.ts,
--      notifyReminderOnce): licence_expiry_30d_app, licence_expiry_7d_app,
--      licence_expiry_0d_app — keyed (kind, subject_id, recipient, due_on =
--      the expiry date), so each stage is sent ONCE per licence date and a
--      renewed date starts again. The CHECK is rebuilt exactly as 20261201_45
--      does (every kind already allowed is kept, whoever added it).
--
--   No table, row, column, policy or grant to anon / authenticated changes.
--
-- HOW TO RUN (any time — before or after the deploy; safe to re-run):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261209_10_l19_licence_expiry_alerts.sql
--   Expect: NOTICE  l19_corr verify: OK …  and a row with ok = t.
--
-- RUN ORDER: after 20261125_20 and 20261201_45 (both on production). Before
--   this file runs, POST /api/v1/cron/licence-expiry answers 200 {skipped:
--   "schema_missing"} and sends nothing, and the dashboard banner shows
--   nothing. Rows changed: none.
--
-- Docker: supabase/tests/rls/l19_licence_expiry.test.sql (chain in its header).
--
-- ROLLBACK:
--   begin;
--   drop function if exists public.licence_expiry_alerts(uuid[], integer);
--   delete from public.email_reminder_log where kind in ('licence_expiry_30d_app','licence_expiry_7d_app','licence_expiry_0d_app');
--   -- then rebuild the kind CHECK without the three kinds (see 20261201_45's ROLLBACK)
--   commit;
-- =============================================================================

begin;
set local lock_timeout = '10s';

-- ── B. the three once-only kinds ─────────────────────────────────────────────
do $widen$
declare
  mine  text[] := array['licence_expiry_30d_app', 'licence_expiry_7d_app', 'licence_expiry_0d_app'];
  kinds text[] := array[]::text[];
  c     record;
  lits  text[];
begin
  if to_regclass('public.email_reminder_log') is null then
    raise exception '20261209_10: public.email_reminder_log is missing — run 20261125_20_email_reminder_log.sql first';
  end if;

  for c in
    select con.conname, pg_catalog.pg_get_constraintdef(con.oid) as def
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.email_reminder_log'::regclass
       and con.contype = 'c'
       and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M'
  loop
    select coalesce(array_agg(m[1]), array[]::text[]) into lits
      from pg_catalog.regexp_matches(c.def, '''([^'']+)''', 'g') as m;
    kinds := kinds || lits;
  end loop;

  if kinds @> mine then
    raise notice '20261209_10: the licence expiry kinds are already allowed — the kind CHECK is unchanged';
  else
    select array_agg(distinct k order by k) into kinds from unnest(kinds || mine) as k;
    for c in
      select con.conname
        from pg_catalog.pg_constraint con
       where con.conrelid = 'public.email_reminder_log'::regclass
         and con.contype = 'c'
         and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M'
    loop
      execute pg_catalog.format('alter table public.email_reminder_log drop constraint %I', c.conname);
    end loop;
    execute pg_catalog.format(
      'alter table public.email_reminder_log add constraint email_reminder_log_kind_check check (kind in (%s))',
      (select string_agg(quote_literal(k), ', ' order by k) from unnest(kinds) as k));
  end if;
end
$widen$;

-- ── A. who is told ───────────────────────────────────────────────────────────
create or replace function public.licence_expiry_alerts(p_user_ids uuid[], p_horizon_days integer)
returns table (user_id uuid, holder text, subject_id text, expiry date)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today    date := (pg_catalog.now() at time zone 'Asia/Riyadh')::date;
  v_until    date;
  v_registry boolean := to_regclass('public.lawyer_registry') is not null
                        and to_regprocedure('public.lawyer_registry_norm_licence(text)') is not null;
begin
  if p_horizon_days is null or p_horizon_days < 0 or p_horizon_days > 366 then
    raise exception 'licence_expiry_alerts: p_horizon_days must be between 0 and 366' using errcode = '22023';
  end if;
  if p_user_ids is not null and pg_catalog.cardinality(p_user_ids) > 200 then
    raise exception 'licence_expiry_alerts: at most 200 ids' using errcode = '22023';
  end if;
  if p_user_ids is not null and pg_catalog.cardinality(p_user_ids) = 0 then
    return;
  end if;
  v_until := v_today + p_horizon_days;

  -- lawyers and legal consultants: the registry decides when it knows the
  -- licence, else the expiry on the lawyer's own file. Two statements, so a
  -- database without the registry never plans a query that names it.
  if v_registry then
    return query
      select lp.user_id, 'lawyer'::text, lp.user_id::text, e.d
        from public.lawyer_profiles lp
        left join public.lawyer_registry r
          on lp.license_number is not null
         and r.licence_no = public.lawyer_registry_norm_licence(lp.license_number)
         and not r.archived
        cross join lateral (select coalesce(r.expiry_date, lp.license_expiry) as d) e
       where lp.verification_status = 'verified'
         and (p_user_ids is null or lp.user_id = any (p_user_ids))
         and e.d is not null
         and e.d <= v_until;
  else
    return query
      select lp.user_id, 'lawyer'::text, lp.user_id::text, lp.license_expiry
        from public.lawyer_profiles lp
       where lp.verification_status = 'verified'
         and (p_user_ids is null or lp.user_id = any (p_user_ids))
         and lp.license_expiry is not null
         and lp.license_expiry <= v_until;
  end if;

  -- firms: told to the owner
  return query
    select f.owner_user_id, 'firm'::text, f.id::text, f.license_expiry
      from public.firm_profiles f
     where f.verification_status = 'verified'
       and (p_user_ids is null or f.owner_user_id = any (p_user_ids))
       and f.license_expiry is not null
       and f.license_expiry <= v_until;

  -- providers: the column, else the date typed in Settings — only an exact,
  -- real YYYY-MM-DD (nested CASEs: each test runs only after the one before)
  if to_regclass('public.provider_profiles') is not null then
    return query
      select pp.user_id, 'provider'::text, pp.user_id::text, e.d
        from public.provider_profiles pp
        cross join lateral (select pp.metadata #>> '{settings,licenseExpiry}' as s) raw
        cross join lateral (
          select coalesce(
                   pp.license_expiry,
                   case when raw.s ~ '^\d{4}-\d{2}-\d{2}$' then
                     case when substr(raw.s, 1, 4)::int between 1900 and 2200
                           and substr(raw.s, 6, 2)::int between 1 and 12
                           and substr(raw.s, 9, 2)::int between 1 and 31 then
                       case when pg_catalog.to_char(
                                   pg_catalog.make_date(substr(raw.s, 1, 4)::int, substr(raw.s, 6, 2)::int, 1)
                                     + (substr(raw.s, 9, 2)::int - 1),
                                   'YYYY-MM-DD') = raw.s
                            then raw.s::date end
                     end
                   end) as d) e
       where pp.verification_status = 'verified'
         and (p_user_ids is null or pp.user_id = any (p_user_ids))
         and e.d is not null
         and e.d <= v_until;
  end if;
end;
$$;

comment on function public.licence_expiry_alerts(uuid[], integer) is
  'Owner ٢٤١ (20261209_10, batch l19): the licences of VERIFIED accounts whose expiry date is on or before today (Riyadh) + p_horizon_days (0..366), past ones included — user_id, holder (lawyer | firm = its owner | provider), subject_id (user id, or the firm id), expiry (lawyer: the registry expiry when the licence is found there, else lawyer_profiles.license_expiry; firm: firm_profiles.license_expiry; provider: provider_profiles.license_expiry, else a real YYYY-MM-DD in metadata.settings.licenseExpiry). p_user_ids NULL = all (the cron), else at most 200 ids (the banner). Read only. Service role only.';

do $gr$
declare r text;
begin
  revoke all on function public.licence_expiry_alerts(uuid[], integer) from public;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) then
      execute pg_catalog.format('revoke all on function public.licence_expiry_alerts(uuid[], integer) from %I', r);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    grant execute on function public.licence_expiry_alerts(uuid[], integer) to service_role;
  end if;
end
$gr$;

comment on table public.email_reminder_log is
  '20261125_20 + 20261201_45 + 20261209_10: one row per once-only message and recipient — reminder e-mails (hearing_1d, poa_30d/7d, library_7d/3d, task_due_1d, contract_pay_due/overdue), the in-app notices of the task, payment and licence-expiry reminders (*_app; licence_expiry_30d/7d/0d_app keyed on the licence expiry date) and the firm invitation e-mail (firm_invite). The primary key makes the jobs idempotent; a failed row is retried up to 3 attempts. Service role only.';

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  def     text;
  k       text;
  r       text;
  fn      oid := to_regprocedure('public.licence_expiry_alerts(uuid[], integer)');
begin
  select string_agg(pg_catalog.pg_get_constraintdef(con.oid), ' ') into def
    from pg_catalog.pg_constraint con
   where con.conrelid = 'public.email_reminder_log'::regclass
     and con.contype = 'c'
     and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M';
  if def is null then
    missing := missing || ' email_reminder_log has no kind CHECK;';
  else
    foreach k in array array['hearing_1d', 'task_due_1d_app', 'contract_pay_due_app', 'firm_invite',
                             'licence_expiry_30d_app', 'licence_expiry_7d_app', 'licence_expiry_0d_app'] loop
      if position(quote_literal(k) in def) = 0 then
        missing := missing || pg_catalog.format(' kind %s is not allowed;', k);
      end if;
    end loop;
  end if;
  if fn is null then
    missing := missing || ' licence_expiry_alerts(uuid[], integer) is missing;';
  else
    if not coalesce((select p.prosecdef and p.proconfig @> array['search_path=""'] and p.provolatile = 's'
                       from pg_catalog.pg_proc p where p.oid = fn), false) then
      missing := missing || ' licence_expiry_alerts is not a stable SECURITY DEFINER with an empty search_path;';
    end if;
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_function_privilege(r, fn, 'EXECUTE') then
        missing := missing || pg_catalog.format(' %s can execute licence_expiry_alerts;', r);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') and not has_function_privilege('service_role', fn, 'EXECUTE') then
      missing := missing || ' service_role cannot execute licence_expiry_alerts;';
    end if;
    if position('verification_status = ''verified''' in pg_catalog.pg_get_functiondef(fn)) = 0 then
      missing := missing || ' licence_expiry_alerts does not keep to verified accounts;';
    end if;
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = r) and has_table_privilege(r, 'public.email_reminder_log', 'SELECT') then
      missing := missing || pg_catalog.format(' %s reads email_reminder_log;', r);
    end if;
  end loop;
  if missing <> '' then
    raise exception 'l19_corr verify:%', missing;
  end if;
  raise notice 'l19_corr verify: OK — email_reminder_log accepts licence_expiry_30d/7d/0d_app (older kinds kept); licence_expiry_alerts is service role only and reads verified accounts only';
end
$verify$;

commit;

notify pgrst, 'reload schema';

-- The SQL editor hides NOTICEs — read this row: ok must be t.
select '20261209_10 l19 licence expiry alerts: licence_expiry_alerts() + the three once-only kinds' as migration,
       coalesce((select bool_and(position(quote_literal(k) in d.def) > 0)
                   from (select string_agg(pg_catalog.pg_get_constraintdef(con.oid), ' ') as def
                           from pg_catalog.pg_constraint con
                          where con.conrelid = 'public.email_reminder_log'::regclass and con.contype = 'c'
                            and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M') d,
                        unnest(array['licence_expiry_30d_app', 'licence_expiry_7d_app', 'licence_expiry_0d_app']) as k), false)
       and coalesce((select p.prosecdef and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                       from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.licence_expiry_alerts(uuid[], integer)')), false)
       as ok;
