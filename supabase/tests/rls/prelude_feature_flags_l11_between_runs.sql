-- prelude_feature_flags_l11_between_runs.sql — runs between the two runs of
-- 20261201_60 (feature_flags_l11.test.sql). It proves what the first run
-- seeded, then an admin switches the assistant off; the second run must keep
-- his value.
do $$ declare v jsonb; begin
  select value into v from public.platform_settings where key = 'feature_flags';
  if v is distinct from '{"site_assistant": true}'::jsonb then
    raise exception 'B1 FAIL: the first run did not seed {"site_assistant": true}: %', v;
  end if;
  raise notice 'feature_flags_l11: B1 (first run seeds the assistant on) PASS';
end $$;

update public.platform_settings set value = '{"site_assistant": false}'::jsonb where key = 'feature_flags';
