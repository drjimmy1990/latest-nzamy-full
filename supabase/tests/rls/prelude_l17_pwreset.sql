-- prelude_l17_pwreset.sql — chain step (NOT a migration) for
-- l17_pwreset.test.sql. Runs after prelude_l15_phone_otp.sql and
-- 20261205_10_phone_otp.sql (profiles.phone_verified_at). stubs.sql models
-- auth.users as (id); pw_reset_target (20261207_10) also reads the GoTrue
-- columns email, banned_until, deleted_at and is_sso_user. This adds exactly
-- those.
alter table auth.users
  add column if not exists email        text,
  add column if not exists banned_until timestamptz,
  add column if not exists deleted_at   timestamptz,
  add column if not exists is_sso_user  boolean not null default false;
