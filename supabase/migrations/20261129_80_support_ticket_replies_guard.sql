-- =============================================================================
-- Migration: 20261129_80_support_ticket_replies_guard.sql
-- =============================================================================
-- PURPOSE (owner file 15 row 53, A1 «الرد على تذاكر الدعم»; batch l9, builder dash)
--
--   The support team's replies to a ticket live in
--   public.support_tickets.metadata.replies (jsonb array of { body, at }),
--   written ONLY by POST /api/v1/admin/tickets/[id]/reply (service role,
--   requireStaff("tickets.manage"), audited). The ticket's owner reads them
--   in the settings Help tab, labelled «ردّ فريق الدعم».
--
--   The table's own policies (20260706) let a signed-in user INSERT his own
--   row (tickets_insert_own) — metadata included — so without this file he
--   could plant a «ردّ فريق الدعم» nobody wrote (e.g. "refund approved"). An
--   admin session (tickets_admin_all) could likewise write replies outside
--   the audited route.
--
--   public.support_tickets_guard_replies() — BEFORE INSERT OR UPDATE trigger,
--   SECURITY INVOKER (it must see the caller's role): when the statement runs
--   as a session role (current_user 'authenticated' or 'anon', i.e. any
--   PostgREST call with a user's JWT) it
--     * on INSERT drops metadata.replies;
--     * on UPDATE puts back exactly the replies the row had (or none).
--   The service role (the app's server routes), postgres and supabase_admin
--   are untouched. Nothing else in metadata, and no other column, changes.
--
-- HOW TO RUN:
--   docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/20261129_80_support_ticket_replies_guard.sql
--   Expect: NOTICE  l9_dash verify: OK  and a row with `t`.
--
-- RUN ORDER: any time — before or after the l9 deploy. The code needs nothing
--   from this file: replies are sent, stored and shown without it. Until it
--   runs, a signed-in user can still insert a ticket that carries a forged
--   reply (the hole above), so run it with the deploy. Needs only
--   public.support_tickets (20260706). Idempotent (create or replace + drop
--   trigger if exists); safe to run any number of times. No setting changes.
--
-- ROLLBACK (one transaction):
--   drop trigger if exists support_tickets_guard_replies on public.support_tickets;
--   drop function if exists public.support_tickets_guard_replies();
-- =============================================================================

begin;
set local lock_timeout = '10s';

do $pre$
begin
  if to_regclass('public.support_tickets') is null then
    raise exception '20261129_80: public.support_tickets is missing (20260706_content_and_ops)';
  end if;
end
$pre$;

create or replace function public.support_tickets_guard_replies()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $fn$
begin
  -- Only a session (a user's JWT through PostgREST) is limited; the service
  -- role, postgres and supabase_admin write replies as they need.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.metadata is not null and pg_catalog.jsonb_typeof(new.metadata) = 'object' then
      new.metadata := new.metadata - 'replies';
    end if;
    return new;
  end if;

  -- UPDATE: the row keeps exactly the replies it had.
  if old.metadata is not null and pg_catalog.jsonb_typeof(old.metadata) = 'object' and old.metadata ? 'replies' then
    if new.metadata is null or pg_catalog.jsonb_typeof(new.metadata) <> 'object' then
      new.metadata := pg_catalog.jsonb_build_object('replies', old.metadata -> 'replies');
    else
      new.metadata := new.metadata || pg_catalog.jsonb_build_object('replies', old.metadata -> 'replies');
    end if;
  elsif new.metadata is not null and pg_catalog.jsonb_typeof(new.metadata) = 'object' then
    new.metadata := new.metadata - 'replies';
  end if;
  return new;
end
$fn$;

comment on function public.support_tickets_guard_replies() is
  'l9 row 53: metadata.replies (the support team''s replies) is written by the service role only; a session insert drops it and a session update keeps the stored replies.';

revoke all on function public.support_tickets_guard_replies() from public;

drop trigger if exists support_tickets_guard_replies on public.support_tickets;
create trigger support_tickets_guard_replies
  before insert or update on public.support_tickets
  for each row execute function public.support_tickets_guard_replies();

-- ── verify ──────────────────────────────────────────────────────────────────
do $verify$
begin
  if to_regprocedure('public.support_tickets_guard_replies()') is null then
    raise exception 'l9_dash verify: support_tickets_guard_replies() is missing';
  end if;
  if exists (select 1 from pg_catalog.pg_proc where oid = to_regprocedure('public.support_tickets_guard_replies()') and prosecdef) then
    raise exception 'l9_dash verify: support_tickets_guard_replies() must be SECURITY INVOKER (it reads current_user)';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_trigger
     where tgrelid = 'public.support_tickets'::regclass
       and tgname = 'support_tickets_guard_replies'
       and not tgisinternal
       and tgenabled <> 'D'
  ) then
    raise exception 'l9_dash verify: the trigger support_tickets_guard_replies is missing or disabled';
  end if;
  raise notice 'l9_dash verify: OK';
end
$verify$;

commit;

select '20261129_80 support ticket replies: service role only (session insert / update cannot plant or change a reply)' as step,
       (to_regprocedure('public.support_tickets_guard_replies()') is not null
        and exists (select 1 from pg_catalog.pg_trigger
                     where tgrelid = 'public.support_tickets'::regclass
                       and tgname = 'support_tickets_guard_replies' and not tgisinternal and tgenabled <> 'D')) as ok;
