-- =============================================================================
-- Migration: 20261107_60_founder_rejoinder_410.sql
-- =============================================================================
-- PURPOSE (owner ٤١٠, 2026-11-07)
--   «التعقيب، المذكرة الإلحاقية، والمذكرة الختامية: 500 نقطة لكل منها (وتُدرج
--   ضمن الأعمال المؤهلة لحصة المحامي المؤسس)». The founder lawyer's drafting
--   works (20261101_10) covered every drafter kind except the rejoinder
--   (التعقيب — ruling R3 while ٣٩٩ was open). This adds it.
--
-- WHAT IT DOES (idempotent — safe to run any number of times)
--   Re-creates public.ai_start_run_with_credit with the IDENTICAL signature,
--   defaults, result, security definer and search_path of 20261101_10; the
--   only change in the body is 'rejoinder' in the drafter kinds a
--   drafting_work credit pays for. CREATE OR REPLACE keeps the owner and the
--   grants (service role only). NEVER add a second overload (PGRST203 breaks
--   every AI run).
--
-- DEPLOY ORDER — BEFORE THE DEPLOY. The new code offers a founder work for a
--   rejoinder; without this file the database refuses it (credit_not_eligible)
--   and the run fails. The old code never asks for a credit on a rejoinder,
--   so running this first changes nothing for it.
-- =============================================================================

begin;

create or replace function public.ai_start_run_with_credit(
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
  p_source_ids      jsonb default null,
  p_credit_kind     text default null)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int, credit_used boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_ok      boolean;
  v_enforce boolean;
  v_credit  uuid;
  v_run     record;
begin
  v_ok := coalesce(
       (p_credit_kind = 'drafting_work'
        and p_tool = 'legal-drafter'
        and p_input ->> 'kind' in ('claim', 'reply', 'rejoinder', 'supplementary', 'closing', 'appeal', 'cassation', 'petition'))
    or (p_credit_kind = 'independent_output'
        and p_tool in ('contracts-pro', 'legal-opinion-consult', 'legal-opinion-letter', 'wargaming')),
    false);
  if not v_ok then
    raise exception 'credit_not_eligible' using errcode = 'P0001',
      detail = format('credit kind %s does not pay for tool %s (kind %s)',
                      coalesce(p_credit_kind, '(none)'), coalesce(p_tool, '(none)'),
                      coalesce(p_input ->> 'kind', '(none)'));
  end if;

  select coalesce((select ps.value = 'true'::jsonb from public.platform_settings ps
                    where ps.key = 'points_enforcement'), false) into v_enforce;

  if v_enforce then
    select c.id into v_credit
      from public.membership_credits c
      join public.founder_seats fs on fs.id = c.seat_id
     where c.user_id = p_user and c.kind = p_credit_kind
       and c.remaining > 0 and c.ends_at > now()
       and fs.status = 'active'
     order by c.ends_at, c.id
     limit 1
       for update of c;

    if v_credit is null
       and not exists (select 1 from public.ai_runs a
                        where a.user_id = p_user and a.idempotency_key = p_idempotency_key) then
      raise exception 'no_credit' using errcode = 'P0001',
        detail = format('no %s credit left', p_credit_kind);
    end if;
  end if;

  select s.run_id, s.created, s.status, s.charged, s.charged_points into v_run
    from public.ai_start_run(
           p_user            => p_user,
           p_tool            => p_tool,
           p_variant         => p_variant,
           p_class           => p_class,
           p_price           => 0,
           p_daily_limit     => p_daily_limit,
           p_idempotency_key => p_idempotency_key,
           p_deadline        => p_deadline,
           p_exempt          => p_exempt,
           p_input           => p_input,
           p_file_ids        => p_file_ids,
           p_pages           => p_pages,
           p_conversation    => p_conversation,
           p_source_ids      => p_source_ids) s;

  if v_credit is not null and v_run.created then
    insert into public.membership_credit_uses (credit_id, run_id, tool)
      values (v_credit, v_run.run_id, p_tool);
    update public.membership_credits c
       set remaining = c.remaining - 1
     where c.id = v_credit;
    return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points, true;
    return;
  end if;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points, false;
end $$;

comment on function public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text) is
  'Starts an AI run paid with a founder credit instead of points (20261101_10, P3 Task 2; rejoinder added by 20261107_60, owner ٤١٠): ai_start_run''s arguments plus p_credit_kind; the run starts at price 0. P0001 credit_not_eligible (tool / drafter kind not covered by the kind) | P0001 no_credit (none left, expired or seat not active). points_enforcement off → a free run, nothing consumed. A duplicate key → the existing run, credit_used false. Service role only.';

commit;

-- The check (the SQL editor shows only the last result): ok = t.
select (pg_get_functiondef(p.oid) like '%''rejoinder''%') as rejoinder_covered,
       (select count(*) from pg_proc q join pg_namespace m on m.oid = q.pronamespace
         where m.nspname = 'public' and q.proname = 'ai_start_run_with_credit') as overloads,
       (pg_get_functiondef(p.oid) like '%''rejoinder''%'
        and (select count(*) from pg_proc q join pg_namespace m on m.oid = q.pronamespace
              where m.nspname = 'public' and q.proname = 'ai_start_run_with_credit') = 1) as ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'ai_start_run_with_credit';
