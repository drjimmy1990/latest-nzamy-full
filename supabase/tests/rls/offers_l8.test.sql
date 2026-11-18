-- offers_l8.test.sql — proves 20261128_50 (owner item 5, the offers system)
-- and its _verify block.
--
-- CHAIN (run.sh, postgres:16; stubs.sql loads first by itself). The migration
-- runs TWICE (idempotent); the _verify block, extracted from _verify.sql
-- between its markers, runs after the second run and must print t / t.
-- From the repo root, in Git Bash:
--   R=supabase/tests/rls; M=supabase/migrations; B=$(mktemp -d)/verify_l8_offers.sql
--   sed -n '/^-- >>> verify:l8_offers/,/^-- <<< verify:l8_offers/p' $M/_verify.sql > "$B"
--   bash $R/run.sh $M/20261128_50_offers.sql $M/20261128_50_offers.sql "$B" $R/offers_l8.test.sql
--
-- NEGATIVE CONTROL (must FAIL): the chain without the two 20261128_50 files
-- → "T1 FAIL: public.offers is missing".
--
-- Every assertion RAISES on failure.

-- T1 the tables, RLS on, no policy, no session privilege
do $$
declare t text;
begin
  if to_regclass('public.offers') is null then
    raise exception 'T1 FAIL: public.offers is missing';
  end if;
  foreach t in array array['public.offers', 'public.offer_dismissals', 'public.offer_events'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'T1 FAIL: RLS off on %', t;
    end if;
    if exists (select 1 from pg_policy where polrelid = t::regclass) then
      raise exception 'T1 FAIL: % has a policy', t;
    end if;
    if has_table_privilege('authenticated', t, 'SELECT') or has_table_privilege('anon', t, 'SELECT')
       or has_table_privilege('authenticated', t, 'INSERT') or has_table_privilege('authenticated', t, 'UPDATE')
       or has_table_privilege('authenticated', t, 'DELETE') then
      raise exception 'T1 FAIL: a session role holds a privilege on % (stubs grant all by default; the migration must revoke)', t;
    end if;
    if not has_table_privilege('service_role', t, 'SELECT') or not has_table_privilege('service_role', t, 'INSERT') then
      raise exception 'T1 FAIL: service_role cannot read / write %', t;
    end if;
  end loop;
  if has_function_privilege('authenticated', 'public.offer_event_counts()', 'EXECUTE')
     or has_function_privilege('anon', 'public.offer_event_counts()', 'EXECUTE') then
    raise exception 'T1 FAIL: a session may execute offer_event_counts()';
  end if;
  raise notice 'T1 PASS';
end
$$;

-- T2 the founder offer is seeded once (two runs), verified advocate lawyers only, invite code empty
do $$
declare n int;
begin
  select count(*) into n from public.offers where slug = 'founder-2026';
  if n <> 1 then
    raise exception 'T2 FAIL: % founder rows after two runs (want 1)', n;
  end if;
  if not exists (select 1 from public.offers
                  where slug = 'founder-2026' and campaign_id = 'founder-2026' and status = 'active'
                    and audience_account_types = array['lawyer']::text[] and audience_verification = 'verified'
                    and exclude_buyers and plan_ref = 'lawyer-founder-2026' and cta_href = '/founder'
                    and seats_total is null and seats_used = 0 and dismiss_return_minutes = 4320
                    and requires_invite_code is null) then
    raise exception 'T2 FAIL: the founder row is not the owner''s offer';
  end if;
  raise notice 'T2 PASS';
end
$$;

-- T3 the CHECKs refuse what the owner ruled out
do $$
declare
  bad text[] := array[
    -- the founder offer to a consultant
    $q$update public.offers set audience_account_types = array['lawyer','consultant'] where slug = 'founder-2026'$q$,
    -- the founder offer to an unverified lawyer
    $q$update public.offers set audience_verification = 'any' where slug = 'founder-2026'$q$,
    -- seats of its own on the founder offer (they are the campaign's)
    $q$update public.offers set seats_total = 10 where slug = 'founder-2026'$q$,
    -- another host as CTA
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types) values ('x', 'y', '//evil.example', array['individual'])$q$,
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types) values ('x', 'y', 'https://evil.example/', array['individual'])$q$,
    -- a script URL as media
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types, media_url, media_kind) values ('x', 'y', '/pricing', array['individual'], 'javascript:alert(1)', 'image')$q$,
    -- an unknown status / audience / an empty audience
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types, status) values ('x', 'y', '/pricing', array['individual'], 'live')$q$,
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types) values ('x', 'y', '/pricing', array['admin'])$q$,
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types) values ('x', 'y', '/pricing', '{}')$q$,
    -- an end before the start
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types, starts_at, ends_at) values ('x', 'y', '/pricing', array['individual'], now(), now() - interval '1 day')$q$,
    -- a return delay of 0
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types, dismiss_return_minutes) values ('x', 'y', '/pricing', array['individual'], 0)$q$,
    -- a second founder campaign link
    $q$insert into public.offers (title, cta_label, cta_href, audience_account_types, campaign_id) values ('x', 'y', '/pricing', array['individual'], 'other')$q$
  ];
  s text;
begin
  foreach s in array bad loop
    begin
      execute s;
      raise exception 'T3 FAIL: accepted: %', s;
    exception when check_violation then
      null;
    end;
  end loop;
  raise notice 'T3 PASS';
end
$$;

-- T4 a good second offer, events and the stats
insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');

do $$
declare
  v uuid;
  r record;
begin
  insert into public.offers (title, body, cta_label, cta_href, audience_account_types, seats_total, status,
                             media_url, media_kind, starts_at, ends_at)
  values ('عرض الأفراد', 'نص', 'اطلب', '/pricing?audience=individuals', array['individual'], 1, 'active',
          'https://cdn.example.com/a.png', 'image', now(), now() + interval '7 days')
  returning id into v;
  insert into public.offer_events (offer_id, user_id, kind) values
    (v, '00000000-0000-0000-0000-0000000000a1', 'impression'),
    (v, '00000000-0000-0000-0000-0000000000a1', 'impression'),
    (v, '00000000-0000-0000-0000-0000000000a2', 'impression'),
    (v, '00000000-0000-0000-0000-0000000000a1', 'dismiss'),
    (v, '00000000-0000-0000-0000-0000000000a2', 'click');
  insert into public.offer_dismissals (offer_id, user_id) values (v, '00000000-0000-0000-0000-0000000000a1');
  -- a second dismissal is an upsert (the server's path)
  insert into public.offer_dismissals (offer_id, user_id) values (v, '00000000-0000-0000-0000-0000000000a1')
  on conflict (offer_id, user_id) do update
     set dismissed_at = now(), dismiss_count = public.offer_dismissals.dismiss_count + 1;
  if (select dismiss_count from public.offer_dismissals where offer_id = v) <> 2 then
    raise exception 'T4 FAIL: the dismissal upsert did not count';
  end if;
  select * into r from public.offer_event_counts() c where c.offer_id = v;
  if r.impressions <> 3 or r.dismissals <> 1 or r.clicks <> 1 or r.reached_users <> 2 then
    raise exception 'T4 FAIL: stats % / % / % / %', r.impressions, r.dismissals, r.clicks, r.reached_users;
  end if;
  begin
    insert into public.offer_events (offer_id, kind) values (v, 'purchase');
    raise exception 'T4 FAIL: an unknown event kind was accepted';
  exception when check_violation then null;
  end;
  raise notice 'T4 PASS';
end
$$;

-- T5 a signed-in session reads nothing and writes nothing (RLS + no grant)
set role authenticated;
select set_config('test.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$
begin
  begin
    perform 1 from public.offers limit 1;
    raise exception 'T5 FAIL: authenticated read public.offers';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.offer_dismissals (offer_id, user_id)
      select id, '00000000-0000-0000-0000-0000000000a1' from public.offers limit 1;
    raise exception 'T5 FAIL: authenticated wrote a dismissal';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.offer_event_counts();
    raise exception 'T5 FAIL: authenticated ran offer_event_counts()';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T5 PASS';
end
$$;
reset role;

set role anon;
do $$
begin
  begin
    perform 1 from public.offers limit 1;
    raise exception 'T6 FAIL: anon read public.offers';
  exception when insufficient_privilege then null;
  end;
  raise notice 'T6 PASS';
end
$$;
reset role;

-- T7 the founder row's admin edits survive (the seed is "only when missing"):
-- edit it, re-run the seed statement exactly as the migration has it.
update public.offers set title = 'عنوان عدّله المشرف', status = 'paused' where slug = 'founder-2026';
insert into public.offers (
  slug, title, body, cta_label, cta_href,
  audience_account_types, audience_verification, exclude_buyers,
  plan_ref, campaign_id, priority, status, dismiss_return_minutes
) values (
  'founder-2026', 'باقة المحامي المؤسس', 'x', 'اعرف التفاصيل', '/founder',
  array['lawyer']::text[], 'verified', true, 'lawyer-founder-2026', 'founder-2026', 100, 'active', 4320
)
on conflict (slug) do nothing;
do $$
begin
  if not exists (select 1 from public.offers where slug = 'founder-2026' and title = 'عنوان عدّله المشرف' and status = 'paused') then
    raise exception 'T7 FAIL: the seed overwrote the admin''s edit';
  end if;
  raise notice 'T7 PASS';
end
$$;
