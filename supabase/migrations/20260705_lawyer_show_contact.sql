-- ============================================================
-- Migration: 20260705_lawyer_show_contact.sql
-- Purpose:  LAWYER-6.1 — per-lawyer contact-info privacy flag.
--           The public directory (/api/v1/lawyers) must NOT expose
--           license_number (regulated credential PII) unless the
--           lawyer opts in. Default false = private (opt-in disclosure).
-- Idempotent (ADD COLUMN IF NOT EXISTS), mirrors 20260616_production_readiness_fixes.sql.
-- ============================================================
begin;

alter table public.lawyer_profiles
  add column if not exists show_contact boolean not null default false;

comment on column public.lawyer_profiles.show_contact
  is 'When true, the public marketplace may expose the lawyer''s license/contact PII. Default false (private).';

commit;
