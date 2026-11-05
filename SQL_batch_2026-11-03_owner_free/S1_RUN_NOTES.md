# S1 (library) run notes

<!-- >>> S1 Task 13: 20261103_14 (STOP-POINT) -->

## AFTER the deploy, at a quiet hour: `20261103_14_library_fts_tashkeel_fold.sql` (STOP-POINT)

**What it does:** a text stored with tashkeel (for example «القَرَارُ») could not be found by a search typed without it («القرار»). This file rebuilds the search index of three tables without tashkeel:
- `library.articles`
- `library.principles`
- `library.feqh_blocks`

No row is added, changed or deleted, and no table or column grant changes. The privileges it does set:
- the new function `library.fold_tashkeel(text)`: EXECUTE for `service_role` only (revoked from PUBLIC, anon and authenticated). It belongs to the owner of the library tables, who can always run it.
- the matview `library.cross_section_search`: it is dropped and recreated, then gets the same privileges back. It keeps its old owner and gets back every grant it had (for example `service_role`'s), except any for anon, authenticated or PUBLIC: it stays off the API.

**Why AFTER the deploy:** the new search code, already in this deploy, sends every word twice, once as typed and once without tashkeel. It works before this file and after it. The old code sends only the typed form. If this file ran first, a search typed with tashkeel would find nothing until the deploy.

**Why at a quiet hour:** it rewrites the three tables under an ACCESS EXCLUSIVE lock, held until the end of the file. While it runs, every library search, law reader, principle reader and fiqh reader waits. The search functions stop after 4 s, so a search made in that window shows an error; a reload after the file finishes works. Do not run it while the owner's loader is running.

**Expected lock duration:**
- Measured on local Docker (postgres 16): **47 seconds** from `begin` to `commit`.
  - The test data was 93,494 articles (122 MB), 25,000 principles (57 MB) and 40,000 fiqh blocks (57 MB), all with tashkeel.
  - The `analyze` after the commit took under 0.2 s and does not block.
- The time grows with the table sizes that Step 1 prints, roughly 47 s per 240 MB in total.
- Plan for **1–2 minutes** of library downtime on the server.

The file is in two places:
- On your PC, after `git pull` on main: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_14_library_fts_tashkeel_fold.sql`
- On the server: `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql`

### Step 1: counts BEFORE (SQL Editor as postgres, or the server's psql)

Copy the numbers somewhere. The result appears on the screen; it is not a file.

```sql
select (select count(*) from library.articles)    as articles,
       (select count(*) from library.principles)  as principles,
       (select count(*) from library.feqh_blocks) as feqh_blocks,
       pg_size_pretty(pg_total_relation_size('library.articles'))    as articles_size,
       pg_size_pretty(pg_total_relation_size('library.principles'))  as principles_size,
       pg_size_pretty(pg_total_relation_size('library.feqh_blocks')) as feqh_size,
       (select count(*) from library.articles   where fts @@ to_tsquery('simple', '''القرار''')) as articles_alqarar,
       (select count(*) from library.principles where fts @@ to_tsquery('simple', '''القرار''')) as principles_alqarar,
       (select pg_get_userbyid(relowner) from pg_class where oid = 'library.articles'::regclass) as tables_owner,
       (select pg_get_userbyid(relowner) from pg_class where oid = to_regclass('library.cross_section_search')) as matview_owner;
```

- Expect `tables_owner = postgres` and `matview_owner = postgres`.
  - If `matview_owner` is another role (for example `supabase_admin`), leave `-c "set role postgres"` out of the Step 2 command. The file gives the matview its old owner back either way.
  - If `tables_owner` is not `postgres`, stop and send us the row.
- The two `_alqarar` columns count the rows that the stripped word «القرار» finds today.

### Step 2: run the file (server terminal, recommended)

It prints its NOTICEs and has no editor timeout:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c "set role postgres" -f - < supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql
```

`set role postgres` runs the file as the tables' owner. The file also hands the function to the tables' owner, and the matview to its old owner, whoever runs it.

**Expected output on the screen:**
- three lines `NOTICE:  20261103_14: library.<table>.fts rebuilt with fold_tashkeel (statistics target 1000)`;
- `COMMIT`, three `ANALYZE`, `NOTIFY`;
- a last result `ok = t`.

A second run prints `already folds tashkeel — skipped` three times and rewrites nothing.

**The other way:** in the Supabase dashboard, open SQL Editor as postgres and paste the whole file.
- The editor hides the NOTICEs and shows only the last result, `ok = t`.
- If the editor reports a timeout, use the terminal command above. The file runs in one transaction, so a timeout changes nothing.
- If Step 1 showed `matview_owner` other than `postgres`, do not use the SQL Editor. It would stop with an error and change nothing. Use the terminal command without `-c "set role postgres"`.

**If it stops:**
- `canceling statement due to lock timeout`: a long query held one of the tables for more than 5 s, and **nothing changed**. Wait a minute and run it again.
- `unexpected dependents on the fts columns`: something new reads those columns, and nothing changed. Stop and send us the whole message.
- Any other `ERROR`: nothing changed. Stop and send us the message.

### Step 3: counts AFTER

Run the Step 1 SELECT again and compare the two sets of numbers.
- `articles`, `principles` and `feqh_blocks` must be **exactly the same** as before.
- `articles_alqarar` and `principles_alqarar` must be **the same or higher**. The difference is the rows stored with tashkeel, which the plain word now finds.
- `matview_owner` must be the same as before.

### Step 4: `_verify.sql` by hand (server; deploy.sh does not run it)

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261103_14|ERROR"
```

- Expect `_verify: 20261103_14 OK — articles, principles and fiqh blocks index text without tashkeel; …` on the screen, and no `ERROR`.
- Before this file runs, the same line reads `_verify: 20261103_14 not applied yet …`. That is a NOTICE, not an error.

### Step 5 (optional): refill the cross-section matview

The file recreates `library.cross_section_search` empty, because it selects the rebuilt columns. Nothing in the app reads it. If you want it filled:

```sql
refresh materialized view library.cross_section_search;
```

- Use the plain form, not `CONCURRENTLY`: the concurrent form cannot run on an empty matview, and `library.refresh_cross_section_search()` uses it.
- It locks only the matview.

### Rollback (only if needed)

The query side needs no change in either direction. To undo:
1. Re-run the `fts` blocks of:
   - `20260729_article_history_columns.sql` (articles and the matview);
   - `20260823_fts_number_search.sql` (principles);
   - the `feqh_blocks` fts of `20260626_legal_library_schema.sql`.
2. Take the recreated matview off the API again and give the server its read back, as `20260922_04` and `20260929_01` did:
   ```sql
   revoke all on library.cross_section_search from anon, authenticated, public;
   grant select on library.cross_section_search to service_role;
   ```
3. Run `20261017_21_library_fts_statistics.sql`.
4. Run `drop function library.fold_tashkeel(text);`.

Rolling back takes the same lock for the same time.

<!-- <<< S1 Task 13: 20261103_14 -->

<!-- >>> S1 Task 14: 20261103_10 (BEFORE the deploy) -->

## BEFORE the deploy: `20261103_10_library_auto_lock_hours.sql`

**What it does:** an automatic library lock (too many documents after the daily limit, or the «نشاط المكتبة» review rule set to «إيقاف») now ends by itself after `auto_lock_hours`, 24 by default (owner q362). Before this file such a lock lasted until an admin lifted it. An admin's own lock is not touched. The admin page «نشاط المكتبة» → «الحدود» shows the new number after the deploy; 0 means "until an admin lifts it".

It adds one column to `public.library_monitor_settings` and re-creates `library_read_quota_hit`, `library_monitor_evaluate` and `library_security_lock_create` with the same arguments. No grant changes; no new function.

**A staff lock now wins over an automatic one.** When staff lock a reader («قفل المكتبة») who already has an open automatic lock, that lock becomes the staff lock: the staff's note, the staff's end (empty = until lifted), the same SEC reference. Before this file the staff lock was silently ignored, and the reader would have been let back in when the automatic 24 hours ran out. A reader who already has a staff lock is unchanged.

**On a value under 24:** the daily count starts again at midnight Riyadh time. A lock shorter than 24 hours can end while the reader's day is still over the limit, so the next refused documents lock that reader again on the same day. The admin page says this under the field.

The file is in two places:
- On your PC, after `git pull` on main: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_10_library_auto_lock_hours.sql`
- On the server: `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_10_library_auto_lock_hours.sql`

Run it in the SQL Editor as postgres (paste the whole file). **Expected result on the screen** (it is not a file): one row with `column_default_24 = t`, `auto_lock_hours_now = 24`, `quota_fn_overloads = 1`, `evaluate_fn_overloads = 1`, `lock_create_overloads = 1`, `staff_lock_converts_auto = t`, `ok = t`. A second run gives the same row.

If it stops with `run 20261031_10_library_activity_monitor.sql first`, nothing changed: that earlier file is missing on this database.

**Optional (a data choice, not run by the file):** locks that are ALREADY open keep no end. To give them the same 24 hours counted from when they started, first look at them:

```sql
select l.reference, l.reason, l.locked_at, l.locked_at + make_interval(hours => s.auto_lock_hours) as would_end
  from public.library_security_locks l, public.library_monitor_settings s
 where s.id and s.auto_lock_hours > 0 and l.lifted_at is null and l.locked_until is null
   and l.reason in ('quota_breach', 'activity_flag');
```

then, if you want it:

```sql
update public.library_security_locks l
   set locked_until = l.locked_at + make_interval(hours => s.auto_lock_hours)
  from public.library_monitor_settings s
 where s.id and s.auto_lock_hours > 0 and l.lifted_at is null and l.locked_until is null
   and l.reason in ('quota_breach', 'activity_flag');
select count(*) as automatic_locks_without_end from public.library_security_locks
 where lifted_at is null and locked_until is null and reason in ('quota_breach', 'activity_flag');
```

The last row should read `automatic_locks_without_end = 0`. A lock whose 24 hours have already passed closes by itself on that reader's next library request.

<!-- <<< S1 Task 14: 20261103_10 -->

<!-- >>> S1 Task 16: 20261103_11 (BEFORE the deploy) -->

## BEFORE the deploy: `20261103_11_library_invitation_grant_days.sql`

**What it does:** a library invite code may carry its own number of days (owner q378). It adds one column, `library.invitations.grant_days` (empty = the usual 30 days; a number = 1 to 3660 days). Codes made before keep giving 30 days. Seats are the existing «عدد المقاعد» (`max_uses`). No grant and no policy changes.

The file is in two places:
- On your PC, after `git pull` on main: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_11_library_invitation_grant_days.sql`
- On the server: `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_11_library_invitation_grant_days.sql`

Run it in the SQL Editor as postgres (paste the whole file). **Expected result on the screen** (it is not a file): one row with `grant_days_column = t`, `grant_days_check = t`, `codes_with_own_days = 0` on the first run, and `ok = t`.

The row also shows `codes_readable_by_session_roles`. It is **not** part of `ok`, and this file does not change it. If it reads `t`, run `20261103_15` (below); after it the column reads `f`.

### The invite codes were readable with the public key: closed by `20261103_15` (run it as soon as possible)

`20260626_legal_library_schema.sql` gave anon and authenticated SELECT on every library table, and added the policy «Allow public read on library.invitations» (`using (true)`). So anyone holding the site's public anon key could list every invite code through the API (`Accept-Profile: library`) and redeem the ones that still have seats. You approved closing it on 2026-11-03; the fix is its own file, `20261103_15_library_invitations_close_public_read.sql` (next section). The drafted statements that stood here are no longer needed.

<!-- <<< S1 Task 16: 20261103_11 -->

<!-- >>> S1: 20261103_15 (ANY time) -->

## ANY time — closes a live leak; run it as soon as possible: `20261103_15_library_invitations_close_public_read.sql`

**What it does:** library invite codes (`library.invitations`) can no longer be read or changed with the site's public key. It takes every privilege on the table away from anon, authenticated and PUBLIC, drops the policy «Allow public read on library.invitations» and any other policy that lets them in (each one it drops is named in a NOTICE), keeps RLS on, and keeps full access for the service role. The site reads and writes this table only through the service role (the admin «أكواد الدعوة» page and the redeem route), so no page changes. It does not depend on the deploy or on any other file of this batch: before or after the deploy, at any time.

The file is in these places:
- On your PC, until this branch is merged, only in the worktree: `D:\nzwt\ownerfree\supabase\migrations\20261103_15_library_invitations_close_public_read.sql`
- On your PC, after the merge and `git pull` on main: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_15_library_invitations_close_public_read.sql`
- On the server, also only after the merge: `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_15_library_invitations_close_public_read.sql`

Run it in the SQL Editor as postgres (paste the whole file). **Expected result on the screen** (it is not a file): one row with `anon_select = f`, `authenticated_select = f`, `policies_left = 0`, `policies_admitting_session_roles = 0`, `service_role_select = t`, `ok = t`. A second run gives the same row. If `policies_left` is above 0, a policy that admits only the service role was kept on purpose; the NOTICEs in the server's psql name every policy that was dropped.

If it stops with `library.invitations is missing`, nothing changed: this database has no library schema.

**Which half lasts:** re-running `20260922_01_library_grants.sql` (or `20260626`) gives anon and authenticated SELECT on the table again. With the policy gone, RLS still returns them no row, so the dropped policy is what keeps the codes closed. `_verify.sql` still stops on the grant alone (block `verify:library_invitations_closed`, «… holds SELECT on library.invitations … run 20261103_15 … (any time)»); run this file again and it is put right.

**When you run it ahead of the rest of the batch, the SELECT row above is your check.** `_verify.sql` cannot confirm this file yet. Before the merge, the server's copy has no such block. After the merge, the blocks of `_20`, `_21`, `_22`, `_10`, `_11` and `_12` come first and stop on any of those files you have not run. Use `_verify` once the whole batch has run (see `README.md` in this folder).

**`_verify.sql` by hand, after the whole batch** (server; deploy.sh does not run it):

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261103_15|ERROR"
```

Expected screen line: `_verify: 20261103_15 OK — library invite codes: no anon / authenticated privilege, no policy admits them (0 polic(ies) left), service_role reads and writes`.

<!-- <<< S1: 20261103_15 -->

<!-- >>> S1 Task 18: 20261103_12 (BEFORE the deploy) -->

## BEFORE the deploy: `20261103_12_library_eligibility_verifications.sql`

**What it does:** it creates a NEW table, `public.library_eligibility_verifications`, where staff record that a micro business, an NGO or a service provider is eligible for the library (owner q375): it has a legal department, or it works with a lawyer on the platform. Only the server writes and reads it: RLS is on, there are no policies, and anon / authenticated hold no privilege. No existing table changes.

The file is in two places:
- On your PC, after `git pull` on main: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_12_library_eligibility_verifications.sql`
- On the server: `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_12_library_eligibility_verifications.sql`

Run it in the SQL Editor as postgres (paste the whole file). **Expected result on the screen** (it is not a file): one row with `table_exists = t`, `rls_on = t`, `users_cannot_write = t`, `users_cannot_read = t`, `verified_accounts = 0` on the first run, and `ok = t`. A second run gives the same row.

<!-- <<< S1 Task 18: 20261103_12 -->
