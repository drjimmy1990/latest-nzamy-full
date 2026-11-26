-- prelude_platform_settings_admin_all.sql — the live policy of 20261016_09 on
-- public.platform_settings (FOR ALL TO authenticated USING is_admin()), for
-- l16_review_platform_settings.test.sql. Loaded after 20260627_platform_settings.sql.
drop policy if exists "Admins can modify platform settings" on public.platform_settings;
create policy "Admins can modify platform settings" on public.platform_settings
  for all to authenticated
  using (public.is_admin());
