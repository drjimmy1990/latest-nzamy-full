-- =============================================================================
-- Migration: 20261107_20_library_caps_owner_426.sql
-- «نشاط المكتبة» — the hourly numbers the owner set (answer ٤٢٦, 2026-11-07).
-- Builds on 20261031_10 (the table) and 20261103_10 (auto_lock_hours). Safe to
-- re-run. Service role only: no grant changes.
-- =============================================================================
--
-- WHAT THIS FILE DOES (public.library_monitor_settings, the one row id = true)
--   hourly_docs         120 → 50   distinct documents a reader may open in a
--                                  rolling hour (a hard cap: the 51st is a 429)
--   rule_hour_requests  600 → 240  library requests in an hour that put the
--                                  account under review (an admin ALERT, not a
--                                  refusal — plan ruling R8; hard caps are the
--                                  next batch)
--   rule_hour_searches  200 → 60   searches in an hour, same (alert only)
--   The column DEFAULTS move to the same numbers, so a re-seeded row (the
--   row is inserted `on conflict do nothing` by 20261031_10) starts there too.
--
-- THIS OVERWRITES THE ROW. If an admin already changed one of these three
--   numbers on the page «نشاط المكتبة», the owner's number replaces it. The
--   SELECT at the end shows the values before you close the editor.
--
-- NOT TOUCHED — daily_docs (220) and member_daily_docs (400): owner question
--   ٤٤٧ is open. Nor the per-user limits (public.library_user_limits).
--
-- RUN ORDER — EITHER ORDER relative to the deploy. Data only: no column,
--   function or signature changes. The deployed code reads the row as it is;
--   the new code's fallbacks (LIBRARY_READ_QUOTA.hourlyDocs = 50,
--   MONITOR_SETTINGS_DEFAULTS) match it and are used only when the row is
--   missing.
--
-- ROLLBACK
--   update public.library_monitor_settings
--      set hourly_docs = 120, rule_hour_requests = 600, rule_hour_searches = 200,
--          updated_at = now()
--    where id;
--   alter table public.library_monitor_settings
--     alter column hourly_docs set default 120,
--     alter column rule_hour_requests set default 600,
--     alter column rule_hour_searches set default 200;
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- ── 0. preconditions ─────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.library_monitor_settings') is null then
    raise exception '20261107_20: public.library_monitor_settings does not exist — run 20261031_10_library_activity_monitor.sql first';
  end if;
end $$;

-- ── 1. the row (created if it is somehow missing) ───────────────────────────
insert into public.library_monitor_settings (id) values (true) on conflict (id) do nothing;

update public.library_monitor_settings
   set hourly_docs        = 50,
       rule_hour_requests = 240,
       rule_hour_searches = 60,
       updated_at         = now()
 where id
   and (hourly_docs, rule_hour_requests, rule_hour_searches) is distinct from (50, 240, 60);

-- ── 2. the column defaults ───────────────────────────────────────────────────
alter table public.library_monitor_settings
  alter column hourly_docs        set default 50,
  alter column rule_hour_requests set default 240,
  alter column rule_hour_searches set default 60;

commit;

-- ── SELECT check (expect 50 · 240 · 60 · 220 · 400) ──────────────────────────
select hourly_docs, rule_hour_requests, rule_hour_searches, daily_docs, member_daily_docs
  from public.library_monitor_settings;
