-- prelude_lawyer_registry_verified_dups.sql — the R6 skip path of
-- 20261122_40: two VERIFIED lawyers already share one licence (written once
-- with Arabic-Indic digits, so only the normaliser sees the clash). The
-- migration must SKIP the unique index with a NOTICE, not fail.
-- Synthetic fixtures only.
insert into auth.users values
  ('00000000-0000-0000-0000-0000000f0001'),
  ('00000000-0000-0000-0000-0000000f0002');
insert into public.profiles (id, user_type, display_name) values
  ('00000000-0000-0000-0000-0000000f0001', 'lawyer', 'اختبار أول'),
  ('00000000-0000-0000-0000-0000000f0002', 'lawyer', 'اختبار ثان');
insert into public.lawyer_profiles (user_id, license_number, verification_status) values
  ('00000000-0000-0000-0000-0000000f0001', '99/0001', 'verified'),
  ('00000000-0000-0000-0000-0000000f0002', '٩٩/٠٠٠١', 'verified');
