-- library_search_principles_page.test.sql — proves 20261017_20 (fix plan N18).
-- Chain (run.sh, postgres:16) — the principles lock chain, then 20261017_20 TWICE
-- (idempotent). Run from the repo root:
--   M=supabase/migrations; bash supabase/tests/rls/run.sh $M/20260626_legal_library_schema.sql \
--     $M/20260627_platform_settings.sql $M/20260722_laws_add_gregorian_guid.sql $M/20260729_library_status.sql \
--     $M/20260730_article_regulations.sql $M/20260821_judicial_principles_missing_columns.sql \
--     $M/20260824_laws_effective_date_gregorian_columns.sql \
--     $M/20260911_library_laws_enactment_gazette_schema.sql $M/20260919_laws_parent_linkage_columns.sql \
--     $M/20260922_01_library_grants.sql $M/20260922_04_library_view_security_invoker.sql \
--     $M/20260925_04_law_facet_counts.sql $M/20260929_01_library_text_server_only.sql \
--     $M/20261004_01_library_column_lock.sql $M/20261016_01_library_principles_text_lock.sql \
--     $M/20261017_20_library_search_principles_page.sql $M/20261017_20_library_search_principles_page.sql \
--     supabase/tests/rls/library_search_principles_page.test.sql
--
-- NEGATIVE CONTROLS (each must FAIL):
--   (a) the same chain without the two 20261017_20 files → T1 fails (no function);
--   (b) the chain plus supabase/tests/rls/prelude_search_principles_page_stray_grant.sql
--       after 20261017_20 (re-grants EXECUTE to anon, as a schema restore would)
--       → T2 fails.
--
-- THE TIME LIMIT (T6) — what Docker can and cannot prove
--   A function's `set statement_timeout` does NOT bound the statement that
--   calls it: Postgres arms the timer when the statement starts. Measured here
--   (postgres:16-alpine, 2026-10-17) on a 1s-limited function sleeping 2.5s:
--     select f(2.5)                                    → returns after 2,503 ms
--     begin; select set_config('statement_timeout', '1s', true);
--            select f(2.5)                             → 57014 after ~1,000 ms
--   The second form is what PostgREST v12+ does for a function whose proconfig
--   carries statement_timeout (db-hoisted-tx-settings). T6 re-proves both, and
--   T5 asserts the 4s value sits in the function's proconfig for PostgREST to
--   hoist. Whether the live PostgREST hoists is a precondition the user checks
--   (docs/plans/2026-10-17-p2-run-order.md).
--
-- The file runs as the superuser; every role-scoped assertion does `set role` first.
-- Every assertion RAISES on failure (the harness fails closed on ERROR).

insert into library.judicial_collections (id, title, court, track, source_id)
  values ('coll-a', 'مبادئ المحكمة العليا', 'المحكمة العليا', 'general', 'src-1'),
         ('coll-b', 'أحكام الاستئناف', 'محكمة الاستئناف', 'commercial', 'src-2');
insert into library.principles (id, collection_id, principle_number, issuing_body, session_date,
                                decision_number, text, ruling, year_hijri, order_index)
  values ('coll-a__p-1', 'coll-a', '1', 'المحكمة العليا', '1440/01/01', '11', 'العقد شريعة المتعاقدين', 'منطوق', 1440, 1),
         ('coll-a__p-2', 'coll-a', '2', 'المحكمة العليا', '1441/01/01', '12', 'لا يجوز فسخ العقد بإرادة منفردة', null, 1441, 2),
         ('coll-a__p-3', 'coll-a', '3', 'المحكمة العليا', '1441/02/01', '13', 'الشفعة حق للشريك', null, 1441, 3),
         ('coll-b__p-1', 'coll-b', '1', 'محكمة الاستئناف', '1442/01/01', '21', 'يبطل العقد إذا خالف النظام', null, 1442, 1),
         ('coll-b__p-2', 'coll-b', '2', 'محكمة الاستئناف', '1442/03/01', '22', 'التعويض عن الضرر', 'العقد', 1442, 2);

-- T1 the function exists with the agreed signature and returns {rows, count}
set role service_role;
do $$
declare
  res jsonb;
  ids text;
begin
  res := library.search_principles_page('''العقد''', 0, 50);
  if jsonb_typeof(res -> 'rows') <> 'array' or jsonb_typeof(res -> 'count') <> 'number' then
    raise exception 'T1 FAIL: unexpected shape %', res;
  end if;
  select string_agg(r ->> 'id', ',' order by ord) into ids
    from jsonb_array_elements(res -> 'rows') with ordinality as t(r, ord);
  -- «العقد» is in coll-a p-1/p-2 and coll-b p-1 text, and coll-b p-2 ruling (fts covers ruling); id order.
  if ids is distinct from 'coll-a__p-1,coll-a__p-2,coll-b__p-1,coll-b__p-2' or (res ->> 'count')::int <> 4 then
    raise exception 'T1 FAIL: ids=% count=%', ids, res ->> 'count';
  end if;
  -- the route maps these keys unchanged (route.ts runPrecedents)
  if not ((res -> 'rows' -> 0) ?& array['id', 'principle_number', 'issuing_body', 'text', 'session_date',
                                         'decision_number', 'year_hijri', 'judicial_collections'])
     or not ((res -> 'rows' -> 0 -> 'judicial_collections') ?& array['id', 'title', 'court', 'track', 'source_id'])
     or (res -> 'rows' -> 0 ->> 'text') <> 'العقد شريعة المتعاقدين'
     or (res -> 'rows' -> 0 -> 'judicial_collections' ->> 'court') <> 'المحكمة العليا' then
    raise exception 'T1 FAIL: row shape %', res -> 'rows' -> 0;
  end if;
  raise notice 'T1 PASS: rows in id order, nested collection, full text for the server, count %', res ->> 'count';
end $$;

-- T3 filters, the window and a page past the end
do $$
declare
  res jsonb;
begin
  res := library.search_principles_page('''العقد''', 0, 50, p_track => 'commercial');
  if (res ->> 'count')::int <> 2 or (res -> 'rows' -> 0 ->> 'id') <> 'coll-b__p-1' then
    raise exception 'T3 FAIL track: %', res;
  end if;
  res := library.search_principles_page('''العقد''', 0, 50, p_court => 'المحكمة العليا');
  if (res ->> 'count')::int <> 2 then raise exception 'T3 FAIL court: %', res; end if;
  res := library.search_principles_page('''العقد''', 0, 50, p_source => 'src-2', p_year => 1442);
  if (res ->> 'count')::int <> 2 then raise exception 'T3 FAIL source+year: %', res; end if;
  res := library.search_principles_page('''العقد''', 0, 50, p_year => 1440);
  if (res ->> 'count')::int <> 1 then raise exception 'T3 FAIL year: %', res; end if;
  -- window: offset 1, fetch 1 → the second match only; count stays the total
  res := library.search_principles_page('''العقد''', 1, 1);
  if jsonb_array_length(res -> 'rows') <> 1 or (res -> 'rows' -> 0 ->> 'id') <> 'coll-a__p-2'
     or (res ->> 'count')::int <> 4 then
    raise exception 'T3 FAIL window: %', res;
  end if;
  -- past the end: an empty page that still carries the total (no PGRST103)
  res := library.search_principles_page('''العقد''', 50, 50);
  if jsonb_array_length(res -> 'rows') <> 0 or (res ->> 'count')::int <> 4 then
    raise exception 'T3 FAIL past end: %', res;
  end if;
  -- no match: [] and 0
  res := library.search_principles_page('''كوفيد''', 0, 50);
  if res <> '{"rows": [], "count": 0}'::jsonb then raise exception 'T3 FAIL no match: %', res; end if;
  -- an OR query from parseSearchQuery's shape
  res := library.search_principles_page('''الشفعة'' | ''التعويض''', 0, 50);
  if (res ->> 'count')::int <> 2 then raise exception 'T3 FAIL or-query: %', res; end if;
  raise notice 'T3 PASS: track/court/source/year filters, offset window, past-end page, no-match, OR query';
end $$;
reset role;

-- T2 the API roles cannot call it (it returns server-only text)
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'app_user'] loop
    if has_function_privilege(r, 'library.search_principles_page(text, integer, integer, text, text, integer, text)', 'EXECUTE') then
      raise exception 'T2 FAIL: % can EXECUTE library.search_principles_page', r;
    end if;
  end loop;
end $$;
set role anon;
do $$
begin
  perform library.search_principles_page('''العقد''', 0, 50);
  raise exception 'T2 FAIL: anon called library.search_principles_page';
exception when insufficient_privilege then
  raise notice 'T2 PASS: anon gets 42501';
end $$;
reset role;
set role authenticated;
do $$
begin
  perform library.search_principles_page('''العقد''', 0, 50);
  raise exception 'T2 FAIL: authenticated called library.search_principles_page';
exception when insufficient_privilege then
  raise notice 'T2 PASS: authenticated gets 42501';
end $$;
reset role;

-- T4 the principles lock of 20261016_01 is untouched
do $$
begin
  if has_column_privilege('anon', 'library.principles', 'text', 'SELECT')
     or has_column_privilege('anon', 'library.principles', 'fts', 'SELECT')
     or not has_column_privilege('anon', 'library.principles', 'principle_number', 'SELECT') then
    raise exception 'T4 FAIL: the principles column lock changed';
  end if;
  raise notice 'T4 PASS: anon still reads the catalogue columns only';
end $$;

-- T5 INVOKER, search_path '', statement_timeout 4s in proconfig (what PostgREST hoists)
do $$
declare
  cfg text[];
  definer boolean;
begin
  select proconfig, prosecdef into cfg, definer from pg_proc
   where oid = 'library.search_principles_page(text, integer, integer, text, text, integer, text)'::regprocedure;
  if definer or not ('statement_timeout=4s' = any (cfg)) or not ('search_path=""' = any (cfg)) then
    raise exception 'T5 FAIL: prosecdef=% proconfig=%', definer, cfg;
  end if;
  raise notice 'T5 PASS: proconfig %', cfg;
end $$;

-- T6 the hoisting mechanism: a function's own SET does not bound its caller;
-- the same value applied first with set_config(..., true) does.
create function pg_temp.t6_slow(s float8) returns int language sql set statement_timeout = '1s'
  as $$ select 1 from pg_sleep(s) $$;
do $$
declare
  t0 timestamptz := clock_timestamp();
begin
  perform pg_temp.t6_slow(1.5);
  raise notice 'T6 PASS (direct call is NOT bounded by the function SET): returned after % ms',
    round(extract(epoch from clock_timestamp() - t0) * 1000);
end $$;
begin;
select set_config('statement_timeout', '1s', true);
do $$
begin
  perform pg_temp.t6_slow(3);
  raise exception 'T6 FAIL: the hoisted statement_timeout did not cancel the call';
exception when query_canceled then
  raise notice 'T6 PASS (hoisted set_config cancels the call): 57014 %', sqlerrm;
end $$;
commit;

select 'library_search_principles_page: ALL PASS' as result;
