-- prelude_l8_liblock.sql — runs BEFORE 20261128_20 in l8_liblock.test.sql's
-- chain: the two live columns stubs.sql lacks.
--   * auth.users.email_confirmed_at (GoTrue's column on live);
--   * lawyer_profiles.practice_kind (20261019_20: not null default 'advocate').
alter table auth.users add column if not exists email_confirmed_at timestamptz;
alter table public.lawyer_profiles add column if not exists practice_kind text not null default 'advocate';
