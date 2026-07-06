-- WF 4.2 consultation reminders (n8n "NZAMY · Communication").
-- Idempotency flags so a reminder is not re-sent on every 30-min cron tick.
-- n8n's "4.2 Mark sent" step sets reminder_sent = true after delivery.
-- Idempotent: safe to re-run.

alter table public.consultations
  add column if not exists reminder_sent boolean not null default false;

alter table public.consultations
  add column if not exists reminder_1h_sent boolean not null default false;

-- Note: WF 4.3 (hearing reminders) is intentionally NOT backed here. Hearings
-- currently live inside service_requests.metadata.hearings (JSONB), not a
-- first-class table/column, so a reminder-flag column has nothing to attach to.
-- Add a hearings table (or a top-level hearing_at column) before building 4.3.
