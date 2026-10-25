-- 11_AFTER_10_verify_hearing_reminders.sql — the hearing-reminders section of
-- supabase/migrations/_verify.sql, on its own. Read-only, safe to repeat.

-- >>> verify:hearing_reminders
-- 2026-10-25 — 20261025_30_hearing_reminders.sql (P4 N3.2). Read-only, safe to
-- repeat. Before _30 runs it only reports; after, it raises when the hearing
-- once-only key, the one-source CHECK, the cascade or the service-only
-- recipient function is missing or open to sessions.
do $$
declare r text; fn regprocedure;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'notification_outbox' and column_name = 'hearing_id') then
    raise notice '_verify: 20261025_30 is not applied yet — no hearing reminders are queued; run 10_BEFORE_DEPLOY_20261025_30_hearing_reminders.sql';
    return;
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'u'
                    and conname = 'uq_notification_outbox_hearing_once'
                    and pg_get_constraintdef(oid) = 'UNIQUE (hearing_id, recipient_user_id, channel, kind)') then
    raise exception '_verify: uq_notification_outbox_hearing_once is missing or not (hearing_id, recipient_user_id, channel, kind) — the scheduler''s upsert fails (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'u'
                    and conname = 'uq_notification_outbox_once'
                    and pg_get_constraintdef(oid) = 'UNIQUE (deadline_id, recipient_user_id, channel, kind)') then
    raise exception '_verify: the deadline once-only key uq_notification_outbox_once changed — deadline reminders would double';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'c'
                    and conname = 'notification_outbox_one_source') then
    raise exception '_verify: notification_outbox_one_source CHECK is missing (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.notification_outbox'::regclass and contype = 'f'
                    and confrelid = 'public.hearings'::regclass and confdeltype = 'c') then
    raise exception '_verify: notification_outbox.hearing_id does not cascade from public.hearings (re-run 20261025_30)';
  end if;
  fn := to_regprocedure('public.hearing_reminder_targets(date,date)');
  if fn is null then
    raise exception '_verify: public.hearing_reminder_targets(date, date) is missing (re-run 20261025_30)';
  end if;
  foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception '_verify: % can EXECUTE hearing_reminder_targets — sessions could list other lawyers'' hearings (re-run 20261025_30)', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception '_verify: service_role cannot EXECUTE hearing_reminder_targets — no hearing reminder is queued (re-run 20261025_30)';
  end if;
  if not exists (select 1 from pg_proc where oid = fn and not prosecdef and proconfig @> array['search_path=""']) then
    raise exception '_verify: hearing_reminder_targets is not SECURITY INVOKER with search_path '''' (re-run 20261025_30)';
  end if;
  raise notice '_verify: 20261025_30 OK — hearing reminders keyed once per (hearing, recipient, channel, kind), one source per row, cascade from hearings, recipients listed by the service role only';
end $$;
-- <<< verify:hearing_reminders
