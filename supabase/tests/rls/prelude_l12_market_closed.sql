-- prelude_l12_market_closed.sql — the admin closed the market before 20261202_70
-- re-runs: the row exists with open = false, so the migration (insert only when
-- missing) keeps it. With it, the 20261127_70 test (open_requests_publish.test.sql)
-- must pass unchanged: a closed market lists staff-published rows only.
--   T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh \
--     $M/20260815_marketplace_excludes_ai_workspace.sql $M/20261122_30_service_requests_open_view.sql \
--     $M/20261124_30_open_requests_city_summary.sql $T/prelude_open_requests_publish.sql \
--     $M/20261127_70_open_requests_publish.sql $T/prelude_platform_settings_min.sql \
--     $T/prelude_l12_market_closed.sql $M/20261202_70_market_open.sql $T/open_requests_publish.test.sql
insert into public.platform_settings (key, value)
values ('marketplace_market', '{"open": false, "opened_at": null, "accept_mode": "admin_approval", "approval_minutes": 30}'::jsonb)
on conflict (key) do nothing;
