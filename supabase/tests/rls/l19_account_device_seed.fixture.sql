-- l19_account_device_seed.fixture.sql — rows that exist BEFORE 20261209_40 runs
--   (devices the library-only limit registered), so l19_account_device_gate.test.sql
--   can prove the label backfill, the grandfathering and the pending-row rule.
--   Load it right before the first 20261209_40 in the chain.
--   G (…c6): two computers (the old «two devices» setting), one phone, one
--            device of unknown label — all verified.
--   P (…c7): one phone still waiting for an old e-mail code (verified_at NULL).
insert into auth.users (id) values
  ('9c000000-0000-0000-0000-0000000000c6'),
  ('9c000000-0000-0000-0000-0000000000c7')
on conflict do nothing;
insert into public.profiles (id, user_type, display_name) values
  ('9c000000-0000-0000-0000-0000000000c6', 'lawyer', 'G'),
  ('9c000000-0000-0000-0000-0000000000c7', 'individual', 'P')
on conflict do nothing;

insert into public.user_devices (user_id, device_hash, label, verified_at) values
  ('9c000000-0000-0000-0000-0000000000c6', encode(sha256(convert_to('l19-device-101', 'UTF8')), 'hex'), 'كمبيوتر — Chrome / Windows', now()),
  ('9c000000-0000-0000-0000-0000000000c6', encode(sha256(convert_to('l19-device-102', 'UTF8')), 'hex'), 'كمبيوتر — Edge / Windows', now()),
  ('9c000000-0000-0000-0000-0000000000c6', encode(sha256(convert_to('l19-device-103', 'UTF8')), 'hex'), 'جوال — Safari / iPhone', now()),
  ('9c000000-0000-0000-0000-0000000000c6', encode(sha256(convert_to('l19-device-104', 'UTF8')), 'hex'), 'جهاز غير معروف', now()),
  ('9c000000-0000-0000-0000-0000000000c7', encode(sha256(convert_to('l19-device-105', 'UTF8')), 'hex'), 'جوال — Chrome / Android', null)
on conflict do nothing;
