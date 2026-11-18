-- prelude_refund_credit_notes_between_runs.sql — the self-host restore's
-- shape between the two runs of 20261127_30: stray grants the second run
-- must take back (the migration's own verify raises if it does not).
grant all on public.payment_credit_notes to anon, authenticated;
grant execute on function public.issue_payment_credit_note(uuid) to public, anon, authenticated;
grant usage on sequence public.payment_credit_note_seq to authenticated;
