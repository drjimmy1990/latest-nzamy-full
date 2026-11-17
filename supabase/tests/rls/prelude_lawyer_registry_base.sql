-- prelude_lawyer_registry_base.sql — chain step for lawyer_registry.test.sql
-- (20261122_40). stubs.sql models public.profiles without `phone`; the live
-- table has it (20260921_04), and 20261122_40 refuses to run without it.
-- Synthetic fixtures only: no real name, licence or mobile anywhere.
alter table public.profiles add column if not exists phone text;
