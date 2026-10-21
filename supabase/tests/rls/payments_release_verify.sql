-- Final B1 additions: raising verification, read-only, safe to repeat.
do $$ declare fn text; role_name text; col text; privilege_name text; begin
  if to_regclass('public.payment_orders') is null then
    raise notice 'payments B1 not applied yet'; return;
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.payment_methods'::regclass
                  and attname = 'live' and not attisdropped and atttypid = 'boolean'::regtype) then
    raise exception 'B1 verify: apply 20261022_31 before deploying billing';
  end if;
  foreach col in array array['token','live'] loop
    foreach role_name in array array['anon','authenticated'] loop
      foreach privilege_name in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        if has_column_privilege(role_name,'public.payment_methods',col,privilege_name) then
          raise exception 'B1 verify: % can % hidden card column %',role_name,privilege_name,col;
        end if;
      end loop;
    end loop;
  end loop;
  foreach fn in array array['public.claim_payment_refund(uuid,uuid,text)',
    'public.finish_payment_refund(uuid,text,text)','public.release_payment_refund(uuid,text)',
    'public.adjust_admin_points(uuid,int,timestamptz,text)','public.admin_points_balances(uuid[])'] loop
    if to_regprocedure(fn) is null then raise exception 'B1 verify: missing % (apply _32 and _33)',fn; end if;
    foreach role_name in array array['anon','authenticated'] loop
      if has_function_privilege(role_name,fn,'EXECUTE') then raise exception 'B1 verify: session executes %',fn; end if;
    end loop;
    if not has_function_privilege('service_role',fn,'EXECUTE') or not exists
      (select 1 from pg_proc where oid = fn::regprocedure and prosecdef and proconfig @> array['search_path=""']) then
      raise exception 'B1 verify: unsafe definer or missing service privilege on %',fn;
    end if;
  end loop;
  raise notice 'B1 additions OK: hidden card mode; service-only refund and admin points RPCs';
end $$;
