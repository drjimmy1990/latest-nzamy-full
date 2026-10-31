-- prelude_library_monitor_no_settings.sql — for library_read_quota.test.sql
-- run on top of 20261031_10: with no settings row and no per-user limit, the
-- re-created library_read_quota_hit must behave exactly as 20261030_80's
-- (its arguments are the limits). Proves the re-creation changed nothing else.
--   bash $R/run.sh $M/20261030_80_library_read_quota.sql $M/20261031_10_library_activity_monitor.sql $R/prelude_library_monitor_no_settings.sql $R/library_read_quota.test.sql
delete from public.library_monitor_settings;
