-- prelude_l18_firm_verification.sql — stubs.sql's firm_profiles has no
-- verification_status; production's has it (20260603_phase1_002_entities).
alter table public.firm_profiles add column if not exists verification_status text not null default 'pending';
