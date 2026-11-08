-- =============================================================================
-- Migration: 20261108_50_free_daily_question.sql
-- =============================================================================
-- PURPOSE (owner ٤١٢, batch 2026-11-08 B4)
--   «السؤال السريع: 10 نقاط، مع بقاء سؤال يومي مجاني واحد (0 نقطة) لكل حساب
--   فردي موثق برقم جوال.»
--   There is no phone verification (OTP) yet (owner question ٤٤٨ is open), and
--   profiles.phone is typed by the user, so it is never treated as verified.
--   Controller ruling: build the mechanism, inert until verification exists.
--
-- WHAT IT DOES (idempotent — safe to re-run)
--   1. public.verified_phones — one row per account whose mobile was VERIFIED
--      (written only by the future OTP flow, through the service role). The
--      API roles get SELECT of their own row and nothing else: no INSERT /
--      UPDATE / DELETE grant and no write policy (RLS refuses a write even if a
--      self-host restore re-grants ALL). Saudi mobile in E.164 (+9665XXXXXXXX),
--      the shape of profiles.phone (20260921_04). Empty: nobody is verified,
--      so nothing changes on production.
--   2. public.ai_free_question_claims — the day's free question, keyed on the
--      VERIFIED PHONE and the Riyadh calendar day (PRIMARY KEY), so a phone has
--      one free question a day whichever account it is on. Server only (RLS
--      on, no policy, no grant to the API roles).
--   3. public.ai_start_free_question(<ai_start_run's 14 arguments>) — under
--      ai_start_run's own lock ('ai_start_run:<user>:<tool>'):
--        a key already used     → ai_start_run's duplicate answer (no claim);
--        tool not quick-answer  → 22023;
--        not user_type 'individual', or no verified phone
--                               → P0001 free_question_not_eligible;
--        the day's claim on that phone exists and its run did not fail
--                               → P0001 free_question_used;
--        else the claim is inserted (a claim whose run FAILED — refunded — is
--        removed first: a technical failure gives the free question back) and
--        ai_start_run starts the run at price 0, in the same transaction (a
--        refused start — daily limit — leaves no claim).
--      Two accounts on one phone at once: the PRIMARY KEY lets one insert win;
--      the other gets free_question_used (never a silent 10-point charge: the
--      app asks again).
--   ai_start_run, ai_fail_run and every other function are untouched; there is
--   no trigger on ai_runs (a failure in one would roll back every refund).
--
-- DEPLOY ORDER — ANY TIME (before or after the deploy)
--   Old code never calls it. New code without it: the status route answers
--   «not available» (missing table → no offer), and a request that still asks
--   for the free question is refused, uncharged — never started free unlocked.
--
-- ROLLBACK
--   drop function if exists public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb);
--   drop table if exists public.ai_free_question_claims;
--   drop table if exists public.verified_phones;   -- only while it is empty (no OTP yet)
--   notify pgrst, 'reload schema';
-- =============================================================================

begin;

-- ── 1. verified_phones ───────────────────────────────────────────────────────
create table if not exists public.verified_phones (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  phone_e164   text not null constraint verified_phones_e164_check check (phone_e164 ~ '^\+9665[0-9]{8}$'),
  verified_at  timestamptz not null default now(),
  method       text not null default 'otp',
  created_at   timestamptz not null default now()
);
create index if not exists verified_phones_phone_idx on public.verified_phones (phone_e164);

comment on table public.verified_phones is
  'Owner ٤١٢ (20261108_50): an account''s VERIFIED mobile. Written only by the server (the future OTP flow, service role); a user reads his own row. profiles.phone is user-typed and is never treated as verified.';

alter table public.verified_phones enable row level security;
drop policy if exists "own verified phone" on public.verified_phones;
create policy "own verified phone" on public.verified_phones
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.verified_phones from anon, authenticated, public;
grant select on public.verified_phones to authenticated;
grant all on public.verified_phones to service_role;

-- ── 2. ai_free_question_claims ───────────────────────────────────────────────
create table if not exists public.ai_free_question_claims (
  phone_e164  text not null,
  riyadh_day  date not null,
  user_id     uuid references auth.users(id) on delete set null,
  run_id      uuid references public.ai_runs(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint ai_free_question_claims_pkey primary key (phone_e164, riyadh_day)
);
create index if not exists ai_free_question_claims_run_idx on public.ai_free_question_claims (run_id);

comment on table public.ai_free_question_claims is
  'Owner ٤١٢ (20261108_50): the free quick question of one verified phone on one Riyadh day. Written only by ai_start_free_question; a claim whose run failed is free again. Server only.';

alter table public.ai_free_question_claims enable row level security;
revoke all on public.ai_free_question_claims from anon, authenticated, public;
grant all on public.ai_free_question_claims to service_role;

-- ── 3. ai_start_free_question ────────────────────────────────────────────────
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
  v_type  text;
  v_phone text;
  v_day   date := (now() at time zone 'Asia/Riyadh')::date;
  v_run   record;
begin
  if p_user is null or p_tool is distinct from 'quick-answer' or p_idempotency_key is null then
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

  select pr.user_type into v_type from public.profiles pr where pr.id = p_user;
  select vp.phone_e164 into v_phone from public.verified_phones vp where vp.user_id = p_user;
  if v_type is distinct from 'individual' or v_phone is null then
    raise exception 'free_question_not_eligible' using errcode = 'P0001';
  end if;

  -- A claim whose run failed (and was refunded) gives the free question back.
  delete from public.ai_free_question_claims c
   where c.phone_e164 = v_phone and c.riyadh_day = v_day
     and c.run_id is not null
     and exists (select 1 from public.ai_runs r where r.id = c.run_id and r.status = 'failed');

  insert into public.ai_free_question_claims (phone_e164, riyadh_day, user_id)
    values (v_phone, v_day, p_user)
    on conflict on constraint ai_free_question_claims_pkey do nothing;
  if not found then
    raise exception 'free_question_used' using errcode = 'P0001';
  end if;

  select * into v_run from public.ai_start_run(
    p_user, p_tool, p_variant, p_class, 0, p_daily_limit, p_idempotency_key, p_deadline,
    p_exempt, p_input, p_file_ids, p_pages, p_conversation, p_source_ids);

  update public.ai_free_question_claims c set run_id = v_run.run_id
   where c.phone_e164 = v_phone and c.riyadh_day = v_day;

  return query select v_run.run_id, v_run.created, v_run.status, v_run.charged, v_run.charged_points;
end;
$$;

comment on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) is
  'Owner ٤١٢ (20261108_50): the free daily quick question. Under ai_start_run''s lock: duplicate key → ai_start_run''s duplicate; not individual or no verified phone → P0001 free_question_not_eligible; the phone''s claim for today (Asia/Riyadh) taken by a run that did not fail → P0001 free_question_used; else claims it and starts the run at price 0 (ai_start_run), one transaction. Service role only.';

revoke all on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.ai_start_free_question(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb) to service_role;

-- ── verify ──────────────────────────────────────────────────────────────────
do $$
declare
  fn       text := 'public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)';
  fn_owner text;
  t        text;
  p        text;
begin
  if to_regprocedure(fn) is null then
    raise exception '20261108_50 verify: % is missing', fn;
  end if;
  if (select count(*) from pg_proc q join pg_namespace n on n.oid = q.pronamespace
       where n.nspname = 'public' and q.proname = 'ai_start_free_question') <> 1 then
    raise exception '20261108_50 verify: more than one ai_start_free_question overload (PGRST203)';
  end if;
  if has_function_privilege('authenticated', fn, 'EXECUTE') or has_function_privilege('anon', fn, 'EXECUTE') then
    raise exception '20261108_50 verify: a session role can EXECUTE %', fn;
  end if;
  select pg_get_userbyid(proowner) into fn_owner from pg_proc where oid = to_regprocedure(fn);
  if not has_function_privilege(fn_owner,
       'public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE') then
    raise exception '20261108_50 verify: %, the owner of ai_start_free_question, cannot EXECUTE ai_start_run', fn_owner;
  end if;
  foreach t in array array['verified_phones', 'ai_free_question_claims'] loop
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception '20261108_50 verify: RLS is off on public.%', t;
    end if;
    foreach p in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', 'public.' || t, p) or has_table_privilege('anon', 'public.' || t, p) then
        raise exception '20261108_50 verify: a session role can % public.%', p, t;
      end if;
    end loop;
  end loop;
  if has_table_privilege('authenticated', 'public.ai_free_question_claims', 'SELECT')
     or has_table_privilege('anon', 'public.verified_phones', 'SELECT') then
    raise exception '20261108_50 verify: claims readable by a session, or verified phones by a guest';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'verified_phones' and cmd <> 'SELECT') then
    raise exception '20261108_50 verify: a write policy exists on verified_phones';
  end if;
  raise notice '20261108_50 verify: OK — verified_phones (% rows, server-write only), ai_free_question_claims server only, ai_start_free_question service role only',
    (select count(*) from public.verified_phones);
end $$;

commit;
notify pgrst, 'reload schema';
