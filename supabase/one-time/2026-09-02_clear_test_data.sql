-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-02_clear_test_data.sql
--
-- ⚠️  NOT A MIGRATION. Lives outside supabase/migrations on purpose so that
--     `supabase db push` and deploy.sh can never pick it up. It is run ONCE,
--     by hand, by the owner, and never again.
--
-- ── WHY ────────────────────────────────────────────────────────────────────
--
-- Production's lawyer dashboard is full of test junk, and the owner
-- photographed it: task titles «12341234», «1223123123», «sdfgsdfg»,
-- «سيبلسيبل» (twice, as two separate rows), «الحب الحب»; a case whose name is
-- «12341234» and whose «وقائع القضية» reads «123412341234»; and a case
-- document that is the repository's own `TASK_TRACKER.md`. Screenshot findings
-- 14, 34, 47, 48, 174, 188 and 205.
--
-- None of that is a code defect and no commit can fix it. It is rows.
--
-- The owner has confirmed there are NO real customers on production yet, so
-- the transactional tables are disposable. That confirmation is what makes
-- this script safe, and it is the ONLY thing that makes it safe — re-read
-- §1 of خطة_البناء_الكاملة before running it on any database where that has
-- stopped being true.
--
-- ── ⛔ WHAT THIS SCRIPT MUST NEVER TOUCH ───────────────────────────────────
--
-- "No customers" does NOT mean "empty database". It holds months of real work:
--
--     library.laws                386 rows      ⛔
--     library.articles         13,436 rows      ⛔
--     library.principles       17,940 rows      ⛔
--     library.decrees_circulars 2,078 rows      ⛔
--     auth.users                   18 rows      ⛔  (deleting these breaks
--                                                    every linked profile and
--                                                    gains nothing)
--     public.articles / blog content            ⛔
--     public.platform_settings                  ⛔
--
-- Every statement below names ONE table explicitly. There is no
-- `truncate ... cascade` on a schema anywhere in this file, and there must
-- never be. `npm run library:reseed:wipe` remains BANNED — it destroys user
-- bookmarks and invitations.
--
-- ── ⚠️ WHAT DELETING service_requests TAKES WITH IT ────────────────────────
--
-- `service_requests.id` is referenced by twelve tables. Five CASCADE — their
-- rows are destroyed:
--
--     public.request_events · public.payments · public.attachments
--     public.consultations  · public.messages
--
-- Seven SET NULL — the rows survive, orphaned from their request:
--
--     public.cases · public.contracts · public.wallet_transactions
--     public.credit_transactions · public.chat_rooms · public.referrals
--     public.reviews
--
-- `public.payments` cascading is the one to read twice. On this database it
-- holds only test rows, but on any other it would not.
--
-- ── ⚠️ STORAGE IS NOT CLEANED BY THIS SCRIPT ───────────────────────────────
--
-- Deleting an `attachments` ROW does not delete the FILE it points at. The
-- uploaded objects (including that TASK_TRACKER.md) stay in the Supabase
-- Storage bucket as orphans. Removing them is a separate pass in the Storage
-- UI, and it is safe to postpone — an orphaned object is invisible to the app.
--
-- ── HOW TO RUN ─────────────────────────────────────────────────────────────
--
--   1. Run STEP 1 alone. It writes nothing. Read the output.
--   2. If the counts match what you expect, run STEP 2.
--   3. Run STEP 3 to confirm the result.
--
-- ═══════════════════════════════════════════════════════════════════════════


-- ── STEP 1 · INVENTORY — read-only, changes nothing ────────────────────────
-- Run this first and look at it. If any number here surprises you, STOP.

select 'service_requests'   as table_name, count(*) as rows from public.service_requests
union all select 'request_events',   count(*) from public.request_events
union all select 'attachments',      count(*) from public.attachments
union all select 'payments',         count(*) from public.payments
union all select 'consultations',    count(*) from public.consultations
union all select 'messages',         count(*) from public.messages
union all select '— PROTECTED —',    null
union all select 'library.laws',     count(*) from library.laws
union all select 'library.articles', count(*) from library.articles
union all select 'auth.users',       count(*) from auth.users
order by 1;

-- The rows themselves, so you can see the junk before you delete it.
select
  id,
  receiver,
  status,
  created_at,
  left(coalesce(metadata->>'title', metadata->>'caseName', ''), 40) as title
from public.service_requests
order by created_at desc;


-- ── STEP 2 · THE DELETE ────────────────────────────────────────────────────
-- Wrapped in an explicit transaction. If the counts printed at the end are
-- not what you want, run `rollback;` instead of `commit;`.

begin;

  -- Named table, no schema-wide truncate. The five CASCADE children listed in
  -- the header go with it; that is intended and is why they are listed.
  delete from public.service_requests;

  -- `consultations` also has rows that were never bound to a request, so the
  -- cascade above does not reach them. Production holds zero either way; this
  -- statement is here so the table is definitely empty rather than probably.
  delete from public.consultations;

  -- Test notifications only. `where` clause, not a bare delete: notifications
  -- is the one table here that could plausibly hold something an account still
  -- wants to see.
  delete from public.notifications
  where created_at < now();

  select 'service_requests' as table_name, count(*) as rows_remaining from public.service_requests
  union all select 'consultations', count(*) from public.consultations
  union all select 'attachments',   count(*) from public.attachments
  union all select 'payments',      count(*) from public.payments;

commit;


-- ── STEP 3 · CONFIRM ───────────────────────────────────────────────────────
-- The transactional tables are empty AND the protected ones are untouched.
-- Both halves matter: an empty library would mean something went very wrong.

select 'service_requests'    as table_name, count(*) as rows, 'should be 0'     as expected from public.service_requests
union all select 'consultations',  count(*), 'should be 0'      from public.consultations
union all select 'library.laws',   count(*), 'should be 386'    from library.laws
union all select 'library.articles', count(*), 'should be 13436' from library.articles
union all select 'auth.users',     count(*), 'should be 18'     from auth.users
order by 1;
