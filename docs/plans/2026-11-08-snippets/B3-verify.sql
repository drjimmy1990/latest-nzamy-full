-- >>> verify:drafter_section_edits_1108
-- 2026-11-08 — 20261108_40_drafter_section_edits.sql (owner ٤١٠ «عدّل هذا
-- القسم»: 5 free section edits per memo, 2 per section, then 10 points; 30 per
-- memo). Any time — before or after the deploy (the app refuses section edits,
-- uncharged, until it exists). Read-only, safe to repeat. Every row must say ok = true.
select 'ai_start_section_edit exists (one overload)' as check_name,
       to_regprocedure('public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)') is not null
       and (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'ai_start_section_edit') = 1 as ok;

select 'ai_start_section_edit is SECURITY DEFINER with search_path = ''''' as check_name,
       coalesce((select p.prosecdef and p.proconfig @> array['search_path=""']
                   from pg_proc p
                  where p.oid = to_regprocedure('public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)')), false) as ok;

select 'anon / authenticated cannot EXECUTE ai_start_section_edit; service_role can' as check_name,
       case when to_regprocedure('public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)') is null then false
            else not has_function_privilege('anon', 'public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)', 'EXECUTE')
             and not has_function_privilege('authenticated', 'public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)', 'EXECUTE')
             and has_function_privilege('service_role', 'public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)', 'EXECUTE') end as ok;

-- it calls ai_start_run as its owner: the owner must be able to, or every section edit fails 42501
select 'the owner of ai_start_section_edit can EXECUTE ai_start_run' as check_name,
       coalesce((select has_function_privilege(p.proowner,
                   'public.ai_start_run(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb)', 'EXECUTE')
                   from pg_proc p
                  where p.oid = to_regprocedure('public.ai_start_section_edit(uuid,text,text,text,int,int,text,timestamptz,boolean,jsonb,text[],int,uuid,jsonb,int,int,int,int,int)')), false) as ok;
-- <<< verify:drafter_section_edits_1108
