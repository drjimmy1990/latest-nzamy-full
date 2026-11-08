-- >>> verify:free_daily_question_1108
-- 2026-11-08 — 20261108_50_free_daily_question.sql (owner ٤١٢: one free quick
-- question a day per verified phone of an individual account; inert until
-- phone OTP exists). Any time — before or after the deploy. Read-only, safe to
-- repeat. Every row must say ok = true.
select 'verified_phones and ai_free_question_claims exist with RLS on' as check_name,
       coalesce((select bool_and(c.relrowsecurity) and count(*) = 2 from pg_class c
                  where c.oid in (to_regclass('public.verified_phones'), to_regclass('public.ai_free_question_claims'))), false) as ok;

select 'no session role can INSERT / UPDATE / DELETE verified_phones or the claims' as check_name,
       case when to_regclass('public.verified_phones') is null or to_regclass('public.ai_free_question_claims') is null then false
            else not exists (
              select 1 from (values ('anon'), ('authenticated')) r(role),
                            (values ('public.verified_phones'), ('public.ai_free_question_claims')) t(tbl),
                            (values ('INSERT'), ('UPDATE'), ('DELETE')) p(priv)
               where has_table_privilege(r.role, t.tbl, p.priv)) end as ok;

select 'verified_phones has no write policy; claims are not readable by a session' as check_name,
       case when to_regclass('public.ai_free_question_claims') is null then false
            else not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'verified_phones' and cmd <> 'SELECT')
             and not has_table_privilege('authenticated', 'public.ai_free_question_claims', 'SELECT')
             and not has_table_privilege('anon', 'public.ai_free_question_claims', 'SELECT') end as ok;

select 'the claim key is (phone, Riyadh day)' as check_name,
       coalesce((select pg_get_constraintdef(oid) = 'PRIMARY KEY (phone_e164, riyadh_day)'
                   from pg_constraint where conname = 'ai_free_question_claims_pkey'), false) as ok;

select 'ai_start_free_question: one overload, SECURITY DEFINER, search_path = '''', service role only' as check_name,
       coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                        and not has_function_privilege('anon', p.oid, 'EXECUTE')
                        and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        and has_function_privilege('service_role', p.oid, 'EXECUTE')
                        and has_function_privilege(p.proowner,
                              'public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE')
                   from pg_proc p
                  where p.oid = to_regprocedure('public.ai_start_free_question(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)')), false)
       and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'ai_start_free_question') = 1 as ok;

-- informational: nobody is verified until phone OTP exists, so nobody gets a free question
select 'verified phones (info — 0 until OTP exists)' as check_name,
       true as ok,
       case when to_regclass('public.verified_phones') is null then null
            else (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.verified_phones', false, true, '')))[1]::text end as verified_phones;
-- <<< verify:free_daily_question_1108
