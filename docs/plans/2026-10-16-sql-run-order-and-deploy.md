# 2026-10-16 batch: SQL run order and deploy steps

**Branch:** `fix/2026-10-16-batch`, merged into `main`.

**Who runs what:**
- **You** run every SQL file, in the Supabase SQL Editor on `auth.nezamy.sa`, signed in as `postgres`.
- The owner runs nothing in this batch.
- Each migration is idempotent, so running one twice is safe.
- Each migration ends with a verify block. The block **raises an error and rolls everything back** if the result is wrong.

Six new migrations, in `supabase/migrations/`:

| File | What it does | Order |
|---|---|---|
| `20260922_03_lawyer_provider_column_grants.sql` (existing, re-run) | Puts back the lawyer and role-profile column lock that the self-host import undid | **Step 0, first** |
| `20261016_01_library_principles_text_lock.sql` | Locks the precedent text, ruling, `fts` and paragraphs away from guests (owner Q171) | **After the deploy** |
| `20261016_02_profiles_members_write_lock.sql` | Users can't change their own email or verification flags. No hard delete of firm/company members (Q29/Q30) | Any time |
| `20261016_03_chat_rls_fix.sql` | Fixes the chat (every read currently fails with 42P17). Closes join-any-room, self-promotion and message-move. Adds `create_chat_room` | **Before the deploy** |
| `20261016_04_deadline_rules_owner_q18.sql` | Urgent appeal is 10 days, not 15. The owner's appeal rules are marked verified (Q18) | Any time |
| `20261016_05_lawyer_show_hourly_rate.sql` | Adds the "show my rate" switch, off by default (Q168) | **Before the deploy** |
| `20261016_06_community_access_and_counters.sql` | Verified lawyers can read lawyers-only posts. Answers follow their post, no fake verified badge, counters kept by the database | Any time |

---

## Step 0: put the 09-22 lawyer column lock back (SQL, first of all)

The production schema dump of 2026-10-10 shows table-level `GRANT ALL` to `anon` and `authenticated` on `lawyer_profiles` (and on most `public` tables). Those grants came back with the self-host import, next to the column grants of `20260922_03_lawyer_provider_column_grants.sql`.

So that file's lock is **not in force on live**: a lawyer can PATCH their own row to `verification_status = 'verified'` or set `credit_balance`.

Run it again before anything else:

0. `20260922_03_lawyer_provider_column_grants.sql`. It ends with its own `verify: OK` NOTICE. It is idempotent, and every screen that writes these tables writes only columns on its list (checked 2026-10-16).

`20261016_05` and `20261016_06` refuse to run until this is done; the error message says so.

## Step 1: before deploying (SQL first)

Run these two in the SQL Editor, one at a time. Paste the whole file and click Run.

1. `20261016_03_chat_rls_fix.sql`. It ends with `NOTICE: 20261016_03 verify: OK`.
2. `20261016_05_lawyer_show_hourly_rate.sql`. It ends with `NOTICE: 20261016_05 verify: OK`.

**Why first:**
- The new code calls `create_chat_room`.
- The new lawyer-directory code selects `show_hourly_rate`. Without the column, the directory answers «تعذّر تحميل دليل المحامين».
- The old code keeps working with both files applied.

You can also run the three "any time" files now:

3. `20261016_02_profiles_members_write_lock.sql`. It prints `verify: OK`.
4. `20261016_04_deadline_rules_owner_q18.sql`. It prints `verify: OK` and a NOTICE: "N open deadline(s) were computed with the old 15-day urgent-appeal rule".
   - If N > 0, run the read-only query at the end of that file. It lists the deadlines that are 5 days too late; tell those lawyers.
   - The migration does not move anyone's dates.
5. `20261016_06_community_access_and_counters.sql`. It prints `verify: OK`.

## Step 2: deploy the code

On the app server:

```bash
cd <app folder> && git pull && bash deploy.sh
```

- No dependency changed in this batch, so `npm install` is not needed.
- `deploy.sh` does **not** touch the database. `supabase/migrations/_verify.sql` is run by hand in the SQL Editor. It has new sections for 20261016_01 and 20261016_02:
  - before a migration is applied, its section prints a NOTICE and passes;
  - after it is applied, the section raises if the lock was undone.
- Before Step 0, its 20260922_03 section raises on live. That is the gap Step 0 closes.

## Step 3: after the deploy (code first, then SQL)

6. `20261016_01_library_principles_text_lock.sql`. It ends with `NOTICE: 20261016_01 verify: OK`.
   - If you apply it **before** the deploy, every precedent page answers 500 until the code is live.
   - **Never re-run** `20261004_01_library_column_lock.sql` after this file: it re-opens the precedent text. If you ever must, re-run `20261016_01` right after it.
7. Run `supabase/migrations/_verify.sql` in the SQL Editor. Expect `_verify: 20260922_03 OK`, `_verify: 20261016_01 OK` and `_verify: 20261016_02 OK`.

## Step 4: check from outside (public anon key)

Each of these must answer `401` (42501), not `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" "https://auth.nezamy.sa/rest/v1/principles?select=text&limit=1"
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" "https://auth.nezamy.sa/rest/v1/principle_paragraphs?select=text&limit=1"
```

The catalogue still works. This one must answer `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" -H "Accept-Profile: library" "https://auth.nezamy.sa/rest/v1/principles?select=id,principle_number&limit=1"
```

Then open on the site:
- a precedent collection (`/precedents/<slug>`);
- a search for «تعويض» (the precedents section);
- `/community`, both tabs;
- a consultation page with its chat (`/dashboard/client/consultation/<id>`);
- `/lawyers/browse`, where no rate shows unless a lawyer turned it on.

---

## What changes for users on deploy (read before deploying)

- **Expired subscriptions stop counting.**
  - Before: `getUserTier` trusted the newest "active" row forever.
  - Now: a row whose `current_period_end` has passed no longer unlocks anything.
  - Test or invited accounts whose granted period already ended drop to **free**. That is intended, but it is visible.
  - To list them first (read-only):

    ```sql
    select user_id, tier, current_period_end from public.subscriptions
     where status = 'active' and current_period_end < now() order by current_period_end;
    ```
- **Lawyer rates are hidden** on the public profile and in the directory until each lawyer turns on «إظهار سعر الاستشارة / الساعة في الملف العام».
- **Chat rooms** are opened only between the two parties of a service request (one room per request).
- **Saving the draft cart works again.** It used to fail and empty the cart.
- **The profile and dashboard show the plan the server grants.** An expired grant no longer shows as "Pro".

## Still on your list from before

- **Rotate the 10 test-lawyer passwords on live** (they use the old default that is in git history). Run this, and keep the password out of chat and git:

  ```bash
  SEED_LAWYER_PASSWORD='<new, 16+ chars>' node scripts/seed-test-lawyers.mjs --execute
  ```
- **After the owner's re-upload ends with `CLEAN`:**

  ```sql
  refresh materialized view library.cross_section_search;
  ```

  (or block 4 of `supabase/one-time/2026-10-04_library_clean_wipe.sql`).
- **The owner rotates** the Anthropic key, his GitHub token and the Sard/Najiz login. All three are in his 10-06 package in plain text.
- **The clean-wipe file** (`supabase/one-time/2026-10-04_library_clean_wipe.sql`) now also empties `library_precedent_private.precedent_unparsed_details`. Its foreign key into `principles` would otherwise make a future wipe fail. Nothing to run now.
