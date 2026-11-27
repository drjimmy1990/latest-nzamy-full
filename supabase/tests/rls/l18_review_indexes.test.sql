-- l18_review_indexes.test.sql — proves the l18 review nit on 20261208_20 /
-- 20261208_50: the plain profiles_confirmed_phone_idx and the UNIQUE
-- profiles_confirmed_phone_unique (same column, same predicate) are never both
-- kept, in any run order, and the lookups always have one of them.
--
-- RUN A (no shared number — the unique index is built, the plain one dropped):
--   R=supabase/tests/rls; M=supabase/migrations; bash $R/run.sh \
--     $R/prelude_l15_phone_otp.sql $M/20261205_10_phone_otp.sql \
--     $R/prelude_l17_pwreset.sql $M/20261207_10_password_reset_whatsapp.sql \
--     $M/20261208_20_phone_sign_in_resolver.sql $M/20261208_50_l18_confirmed_phone_unique.sql \
--     $M/20261208_20_phone_sign_in_resolver.sql $M/20261208_50_l18_confirmed_phone_unique.sql \
--     $R/l18_review_indexes.test.sql
-- RUN B (a number confirmed twice under the same spelling — no unique index,
-- the plain one stays; 20261208_51 reports the pair with blocks_unique_index = t
-- and the other-spelling sharer with f):
--   … $M/20261208_20_phone_sign_in_resolver.sql $R/prelude_l18_shared_phone.sql \
--     $M/20261208_50_l18_confirmed_phone_unique.sql $M/20261208_51_duplicate_phones_report.sql \
--     $M/20261208_20_phone_sign_in_resolver.sql $R/l18_review_indexes.test.sql
-- NEGATIVE CONTROL: RUN A with the files of the commit before the review
-- (both indexes kept) → "I1 FAIL".
\set ON_ERROR_STOP on

do $$
declare
  plain boolean := to_regclass('public.profiles_confirmed_phone_idx') is not null;
  uniq  boolean := to_regclass('public.profiles_confirmed_phone_unique') is not null;
begin
  if plain and uniq then raise exception 'I1 FAIL: both indexes on the confirmed numbers are kept'; end if;
  if not plain and not uniq then raise exception 'I1 FAIL: no index on the confirmed numbers'; end if;
  raise notice 'I1 PASS: exactly one index on the confirmed numbers (%)', case when uniq then 'unique' else 'plain' end;
end $$;
