-- prelude_l14_paygate_widen_trap.sql — NEGATIVE CONTROL (b) of
-- l14_paygate.test.sql: puts back the old 1–10 device CHECK, as an
-- unguarded re-run of 20261108_20 used to. The verify:l14_paygate block run
-- after it must RAISE.
alter table public.library_monitor_settings drop constraint if exists library_monitor_settings_device_limit_check;
alter table public.library_monitor_settings add constraint library_monitor_settings_device_limit_check check (device_limit between 1 and 10);
