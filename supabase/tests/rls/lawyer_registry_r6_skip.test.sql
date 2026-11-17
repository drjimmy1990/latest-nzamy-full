-- lawyer_registry_r6_skip.test.sql — 20261122_40 with verified duplicates
-- already present: the file must COMMIT everything else and skip only R6.
--   R=supabase/tests/rls; M=supabase/migrations
--   bash $R/run.sh $R/prelude_lawyer_registry_base.sql $R/prelude_lawyer_registry_verified_dups.sql \
--     $M/20261122_40_lawyer_registry.sql $M/20261122_40_lawyer_registry.sql $R/lawyer_registry_r6_skip.test.sql
do $$
begin
  if to_regclass('public.lawyer_registry') is null then
    raise exception 'S1 FAIL: lawyer_registry missing — the file did not commit';
  end if;
  if to_regclass('public.lawyer_profiles_verified_licence_uniq') is not null then
    raise exception 'S2 FAIL: the R6 index was created although verified duplicates exist';
  end if;
  raise notice 'lawyer_registry_r6_skip: all assertions passed';
end $$;
