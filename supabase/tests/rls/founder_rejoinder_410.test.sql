-- founder_rejoinder_410.test.sql — proves 20261107_60 (owner ٤١٠): a
-- founder drafting work also pays for the rejoinder (التعقيب), and nothing
-- else about ai_start_run_with_credit changed.
--
-- CHAIN (run.sh, postgres:16) — the chain of founder_credits.test.sql, then
-- 20261107_60 TWICE (idempotent). From the repo root, in Git Bash:
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $T/prelude_lawyer_profiles_live.sql \
--     $T/prelude_signup_metadata_live.sql \
--     $M/20260921_04_profiles_phone_e164_check.sql \
--     $M/20261016_10_lawyer_profiles_select_column_lock.sql \
--     $M/20260627_platform_settings.sql \
--     $M/20261019_10_library_access_grants.sql \
--     $M/20261019_20_lawyer_practice_kind.sql \
--     $M/20261021_50_founder_campaign.sql \
--     $M/20261026_01_founder_no_signup_grant.sql \
--     $M/20260603_phase1_003_subscriptions_billing.sql \
--     $M/20261022_10_payments_core.sql \
--     $T/prelude_points_lots_fixture.sql \
--     $M/20261022_20_points_lots.sql \
--     $M/20261022_30_claim_payment_order.sql \
--     $M/20261027_10_ai_runs.sql \
--     $M/20261030_65_library_grant_admin.sql \
--     $M/20261101_10_founder_membership.sql \
--     $T/prelude_founder_membership_between_runs.sql \
--     $M/20261101_10_founder_membership.sql \
--     $M/20261107_60_founder_rejoinder_410.sql \
--     $M/20261107_60_founder_rejoinder_410.sql \
--     $T/founder_rejoinder_410.test.sql
--
-- NEGATIVE CONTROL / RED (must FAIL) — the same chain without 20261107_60:
--   → "T2 FAIL: a rejoinder did not spend a drafting work: P0001 credit_not_eligible".
\set ON_ERROR_STOP on

-- T1 the contract Task 6 calls: ai_start_run's parameters, same names, types,
-- defaults and order, plus p_credit_kind last; six named result columns; one
-- overload each; service role only; ai_fail_run's signature unchanged
do $$
declare
  a_args text;
  c_args text;
  c_res  text;
  cfg    text[];
  sd     boolean;
  fn     text := 'public.ai_start_run_with_credit(uuid, text, text, text, int, int, text, timestamptz, boolean, jsonb, text[], int, uuid, jsonb, text)';
  r      text;
  p      text;
begin
  select pg_get_function_arguments(p.oid) into a_args from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_start_run';
  select pg_get_function_arguments(p.oid), pg_get_function_result(p.oid), p.proconfig, p.prosecdef
    into c_args, c_res, cfg, sd
    from pg_proc p where p.oid = to_regprocedure(fn);
  if c_args is distinct from a_args || ', p_credit_kind text DEFAULT NULL::text' then
    raise exception 'T1 FAIL: arguments differ from ai_start_run + p_credit_kind: [%] vs [%]', c_args, a_args;
  end if;
  if c_res is distinct from 'TABLE(run_id uuid, created boolean, status text, charged boolean, charged_points integer, credit_used boolean)' then
    raise exception 'T1 FAIL: result is %', c_res;
  end if;
  if not sd or not ('search_path=public, pg_temp' = any (cfg)) then
    raise exception 'T1 FAIL: not SECURITY DEFINER with search_path public, pg_temp (%)', cfg;
  end if;
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if has_function_privilege(r, fn, 'EXECUTE') then
      raise exception 'T1 FAIL: % can EXECUTE ai_start_run_with_credit', r;
    end if;
  end loop;
  if not has_function_privilege('service_role', fn, 'EXECUTE') then
    raise exception 'T1 FAIL: service_role cannot EXECUTE ai_start_run_with_credit';
  end if;
  foreach p in array array['ai_start_run', 'ai_fail_run', 'ai_start_run_with_credit'] loop
    if (select count(*) from pg_proc where proname = p) <> 1 then
      raise exception 'T1 FAIL: % overloads of % (PGRST203)', (select count(*) from pg_proc where proname = p), p;
    end if;
  end loop;
  if to_regprocedure('public.ai_fail_run(uuid, text, text)') is null
     or (select pg_get_function_arguments(oid) || ' → ' || pg_get_function_result(oid)
           from pg_proc where oid = to_regprocedure('public.ai_fail_run(uuid, text, text)'))
        is distinct from 'p_run uuid, p_code text, p_message text DEFAULT NULL::text → boolean' then
    raise exception 'T1 FAIL: ai_fail_run signature changed';
  end if;
  if has_function_privilege('authenticated', 'public.ai_fail_run(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ai_fail_run(uuid, text, text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.ai_fail_run(uuid, text, text)', 'EXECUTE') then
    raise exception 'T1 FAIL: ai_fail_run privileges changed';
  end if;
  raise notice 'T1 PASS: contract = ai_start_run args + p_credit_kind, 6 result columns; one overload each of ai_start_run / ai_fail_run / ai_start_run_with_credit; service role only';
end $$;

-- ── Setup ────────────────────────────────────────────────────────────────────
insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000fc01'), ('00000000-0000-0000-0000-00000000fc02'),
  ('00000000-0000-0000-0000-00000000fc03'), ('00000000-0000-0000-0000-00000000fc04');
insert into public.profiles (id, user_type, display_name)
  select id, 'lawyer', 'مؤسس ' || right(id::text, 2) from auth.users
   where id::text like '00000000-0000-0000-0000-00000000fc%';
insert into public.lawyer_profiles (user_id, verification_status)
  select id, 'verified' from auth.users where id::text like '00000000-0000-0000-0000-00000000fc%';

-- orders …fb<lawyer>1, paid; F1, F2, F4 activated (F3 holds no seat)
insert into public.payment_orders (id, user_id, kind, item_id, billing, net_halalas, vat_halalas,
                                   total_halalas, vat_mode, status, paid_at)
  select ('00000000-0000-0000-0000-00000000fb' || right(u.id::text, 1) || '1')::uuid, u.id, 'membership',
         'lawyer-founder-2026', 'once', 299600, 44940, 344540, 'exclusive', 'paid', now()
    from auth.users u
   where u.id in ('00000000-0000-0000-0000-00000000fc01', '00000000-0000-0000-0000-00000000fc02',
                  '00000000-0000-0000-0000-00000000fc04');
do $$
declare
  o uuid;
  r text;
begin
  foreach o in array array['00000000-0000-0000-0000-00000000fb11'::uuid,
                           '00000000-0000-0000-0000-00000000fb21'::uuid,
                           '00000000-0000-0000-0000-00000000fb41'::uuid] loop
    r := public.founder_activate(o);
    if r is distinct from 'activated' then
      raise exception 'SETUP FAIL: founder_activate(%) returned %', o, r;
    end if;
  end loop;
end $$;

-- every call names all 15 arguments, as Task 6's admin.rpc(...) will
create function pg_temp.spend(p_user uuid, p_tool text, p_draft text, p_key text, p_kind text)
returns table (run_id uuid, created boolean, status text, charged boolean, charged_points int, credit_used boolean)
language sql as $$
  select x.run_id, x.created, x.status, x.charged, x.charged_points, x.credit_used
    from public.ai_start_run_with_credit(
           p_user            => p_user,
           p_tool            => p_tool,
           p_variant         => null,
           p_class           => 'job',
           p_price           => 40,
           p_daily_limit     => 100,
           p_idempotency_key => p_key,
           p_deadline        => now() + interval '10 minutes',
           p_exempt          => false,
           p_input           => case when p_draft is null then null else jsonb_build_object('kind', p_draft) end,
           p_file_ids        => '{}',
           p_pages           => null,
           p_conversation    => null,
           p_source_ids      => null,
           p_credit_kind     => p_kind) x;
$$;
create function pg_temp.err_of(p_user uuid, p_tool text, p_draft text, p_key text, p_kind text)
returns text language plpgsql as $$
begin
  perform 1 from pg_temp.spend(p_user, p_tool, p_draft, p_key, p_kind);
  return 'no error';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
create function pg_temp.left_of(p_user uuid, p_kind text) returns int language sql as $$
  select c.remaining from public.membership_credits c
   where c.user_id = p_user and c.kind = p_kind order by c.created_at desc limit 1;
$$;

update public.platform_settings set value = 'true'::jsonb where key = 'points_enforcement';

-- T2 enforcement on: a rejoinder spends one drafting work like a claim
do $$
declare
  x record;
  e text;
begin
  e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'rejoinder', 'rej-key-0001', 'drafting_work');
  if e is distinct from 'no error' then
    raise exception 'T2 FAIL: a rejoinder did not spend a drafting work: %', e;
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 5 then
    raise exception 'T2 FAIL: after a rejoinder F1 has % works, not 5', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  if (select count(*) from public.membership_credit_uses) <> 1 then
    raise exception 'T2 FAIL: % credit uses after one rejoinder', (select count(*) from public.membership_credit_uses);
  end if;
  select * into x from pg_temp.spend('00000000-0000-0000-0000-00000000fc01', 'legal-drafter', 'claim', 'rej-key-0002', 'drafting_work');
  if not x.created or not x.credit_used or x.charged then
    raise exception 'T2 FAIL: a claim after the rejoinder returned %', row_to_json(x);
  end if;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 4 then
    raise exception 'T2 FAIL: after a claim F1 has % works, not 4', pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work');
  end if;
  raise notice 'T2 PASS: a rejoinder spends one drafting work, a claim after it another';
end $$;

-- T3 still not eligible: an unknown kind, no kind, the wrong tool for the kind
do $$
declare
  c record;
  e text;
begin
  for c in select * from (values
      ('legal-drafter', 'memo', 'drafting_work'),
      ('legal-drafter', null, 'drafting_work'),
      ('wargaming', 'rejoinder', 'drafting_work'),
      ('legal-drafter', 'rejoinder', 'independent_output')) v(tool, draft, kind) loop
    e := pg_temp.err_of('00000000-0000-0000-0000-00000000fc01', c.tool, c.draft, 'rej-bad-' || coalesce(c.draft, 'none') || c.kind, c.kind);
    if e is distinct from 'P0001 credit_not_eligible' then
      raise exception 'T3 FAIL: % / % / % → %', c.tool, c.draft, c.kind, e;
    end if;
  end loop;
  if pg_temp.left_of('00000000-0000-0000-0000-00000000fc01', 'drafting_work') <> 4 then
    raise exception 'T3 FAIL: a refused call spent a work';
  end if;
  raise notice 'T3 PASS: unknown kind / no kind / wrong tool / wrong credit kind → P0001 credit_not_eligible, nothing spent';
end $$;
