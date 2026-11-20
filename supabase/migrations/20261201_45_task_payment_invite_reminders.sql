-- =============================================================================
-- Migration: 20261201_45_task_payment_invite_reminders.sql   (verify id: l11_remind)
-- =============================================================================
-- PURPOSE (batch l11-remind — owner TODO N01-15, N01-10, T10-F7, package 19 O24)
--   Three new once-only messages share public.email_reminder_log (20261125_20),
--   the table whose (kind, subject_id, recipient_user_id, due_on) primary key
--   already makes the reminder e-mails idempotent. This file only WIDENS the
--   CHECK on its `kind` column with seven new kinds:
--
--     task_due_1d               e-mail: a task due Riyadh today or tomorrow
--     task_due_1d_app           the in-app notice of the same reminder
--                               (POST /api/v1/cron/task-reminders)
--     contract_pay_due          e-mail: a contract installment due within 3 days
--     contract_pay_due_app      its in-app notice
--     contract_pay_overdue      e-mail: an installment past its due date
--     contract_pay_overdue_app  its in-app notice
--                               (POST /api/v1/cron/contract-payment-reminders)
--     firm_invite               the firm invitation e-mail: at most one a day per
--                               (firm, invited address, inviting manager) —
--                               subject_id is the firm id + a hash of the
--                               address, never the address or the link token
--                               (POST /api/v1/firm/invitations)
--
--   The in-app kinds are their OWN rows (the "_app" suffix), so a failed or
--   not-yet-configured e-mail never uses up the in-app notice, nor the other
--   way round — the rule 20261125_20's header states for library reminders.
--
-- HOW THE CHECK IS REBUILT (other builders may widen it too)
--   The current kind CHECK is found by its definition (contype 'c', mentions
--   `kind`), never by an assumed name. Every quoted literal in it is kept, the
--   seven kinds above are added, and ONE constraint named
--   email_reminder_log_kind_check is written back as `kind IN (…)`. So a kind
--   another migration added before or after this one is never dropped by this
--   file. When every kind above is already allowed, nothing is changed.
--   No column, row, grant or policy changes: the table stays service role only.
--
-- HOW TO RUN (any time — before or after the deploy; safe to re-run):
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261201_45_task_payment_invite_reminders.sql
--   Expect: NOTICE  l11_remind verify: OK  and a row with `t`.
--
-- RUN ORDER: after 20261125_20 (already on production). Independent of the
--   deploy. Before this file runs the new code sends NOTHING for these kinds:
--   the claim insert is refused by the old CHECK (23514), which the code reads
--   as "schema missing" — no in-app task/payment notice, no reminder e-mail,
--   no invitation e-mail (the invitation itself and its copyable link work as
--   today).
--
-- Docker: supabase/tests/rls/l11_remind_reminder_kinds.test.sql (chain in its header).
--
-- ROLLBACK (only when no row of the new kinds exists — the check would fail):
--   begin;
--   delete from public.email_reminder_log where kind in ('task_due_1d','task_due_1d_app',
--     'contract_pay_due','contract_pay_due_app','contract_pay_overdue','contract_pay_overdue_app','firm_invite');
--   alter table public.email_reminder_log drop constraint email_reminder_log_kind_check;
--   alter table public.email_reminder_log add constraint email_reminder_log_kind_check
--     check (kind in ('hearing_1d','poa_30d','poa_7d','library_7d','library_3d'));
--   commit;
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $widen$
declare
  mine  text[] := array['task_due_1d', 'task_due_1d_app',
                        'contract_pay_due', 'contract_pay_due_app',
                        'contract_pay_overdue', 'contract_pay_overdue_app',
                        'firm_invite'];
  kinds text[] := array[]::text[];
  c     record;
  lits  text[];
begin
  if to_regclass('public.email_reminder_log') is null then
    raise exception '20261201_45: public.email_reminder_log is missing — run 20261125_20_email_reminder_log.sql first';
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
    raise notice '20261201_45: every new kind is already allowed — nothing changed';
    return;
  end if;

  select array_agg(distinct k order by k) into kinds from unnest(kinds || mine) as k;

  for c in
    select con.conname
      from pg_catalog.pg_constraint con
     where con.conrelid = 'public.email_reminder_log'::regclass
       and con.contype = 'c'
       and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M'
  loop
    execute format('alter table public.email_reminder_log drop constraint %I', c.conname);
  end loop;

  execute format(
    'alter table public.email_reminder_log add constraint email_reminder_log_kind_check check (kind in (%s))',
    (select string_agg(quote_literal(k), ', ' order by k) from unnest(kinds) as k));
end
$widen$;

comment on table public.email_reminder_log is
  '20261125_20 + 20261201_45: one row per once-only message and recipient — reminder e-mails (hearing_1d, poa_30d/7d, library_7d/3d, task_due_1d, contract_pay_due/overdue), the in-app notices of the task and payment reminders (*_app) and the firm invitation e-mail (firm_invite). The primary key makes the jobs idempotent; a failed row is retried up to 3 attempts. Service role only.';

-- ── verify (raises → the whole file rolls back) ──────────────────────────────
do $verify$
declare
  missing text := '';
  def     text;
  k       text;
  r       text;
  p       text;
begin
  select string_agg(pg_catalog.pg_get_constraintdef(con.oid), ' ') into def
    from pg_catalog.pg_constraint con
   where con.conrelid = 'public.email_reminder_log'::regclass
     and con.contype = 'c'
     and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M';
  if def is null then
    raise exception 'l11_remind verify: email_reminder_log has no kind CHECK';
  end if;
  foreach k in array array['hearing_1d', 'poa_30d', 'poa_7d', 'library_7d', 'library_3d',
                           'task_due_1d', 'task_due_1d_app',
                           'contract_pay_due', 'contract_pay_due_app',
                           'contract_pay_overdue', 'contract_pay_overdue_app',
                           'firm_invite'] loop
    if position(quote_literal(k) in def) = 0 then
      missing := missing || format(' kind %s is not allowed;', k);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'email_reminder_log') then
    missing := missing || ' a policy exists (the table is service role only);';
  end if;
  foreach r in array array['anon', 'authenticated'] loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege(r, 'public.email_reminder_log', p) then
        missing := missing || format(' %s holds %s;', r, p);
      end if;
    end loop;
  end loop;
  if missing <> '' then
    raise exception 'l11_remind verify:%', missing;
  end if;
  raise notice 'l11_remind verify: OK — email_reminder_log accepts task_due_1d(_app), contract_pay_due/overdue(_app), firm_invite';
end
$verify$;

commit;

notify pgrst, 'reload schema';

-- The SQL editor hides NOTICEs — read this row: ok must be t.
select '20261201_45 reminder kinds (tasks due, contract installments, firm invitation e-mail) on email_reminder_log' as migration,
       (select bool_and(position(quote_literal(k) in d.def) > 0)
          from (select string_agg(pg_catalog.pg_get_constraintdef(con.oid), ' ') as def
                  from pg_catalog.pg_constraint con
                 where con.conrelid = 'public.email_reminder_log'::regclass and con.contype = 'c'
                   and pg_catalog.pg_get_constraintdef(con.oid) ~ '\mkind\M') d,
               unnest(array['task_due_1d', 'task_due_1d_app', 'contract_pay_due', 'contract_pay_due_app',
                            'contract_pay_overdue', 'contract_pay_overdue_app', 'firm_invite']) as k)
       and not has_table_privilege('authenticated', 'public.email_reminder_log', 'SELECT')
       as ok;
