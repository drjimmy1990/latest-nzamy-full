# Owner-free wave, second batch (2026-11-03): your steps, in order

**Where the files are today.** Until the branch `batch/2026-11-03-owner-free` is merged into main, every file named here exists only in the worktree `D:\nzwt\ownerfree\`. The `D:\DEV\...` paths below work after the merge and `git pull` on your PC. The `/www/wwwroot/...` paths work after `git pull` on the server (Step 3).

**Screen or file.** Every SQL result and every command's output in this file appears on the screen. None of them is saved to a file, except the deploy log, which is named in Step 3. Paste the results back to us.

**The SQL Editor hides NOTICEs and shows only the last result.** So each file below ends with a SELECT you can read.

## The whole order

| Step | What | When |
|---|---|---|
| 0 | Read-only checks, and `_15` if it has not run | before the deploy |
| 1 | SQL `_10`, `_11`, `_12`, `_21`, `_31`, `_69` | before the deploy |
| 2 | n8n: wargaming, analyze-strength, legal-drafter | before the deploy |
| 3 | Deploy | |
| 4 | SQL `_20`, `_22`; later, at a quiet hour, `_14` | after the deploy |
| 5 | n8n: the six «any time» workflows, then contract-review and contract-negotiator | any time; the last two only after the deploy |
| 6 | `_verify.sql` by hand | after Steps 1 and 4 (`_14` may still be waiting) |
| 7 | Cron check and tool modes | after the deploy |
| 8 | Word and pasted text: live test, then the flags | after the deploy |
| 9 | Contract review and negotiator: staff, then live | when you choose |
| 10 | Word export: open the files in Word | after the deploy |
| 11 | Browser checklist | after the deploy |

There is no `20261103_13`; the number stays free for the official-links item, which is not built. `20261103_12` creates a table nothing reads yet, because the eligibility sale gate (item ١٢) is not built. It is harmless, and you still run it: its `_verify` block stops on a missing table and would hide every block after it.

The longer notes for the library files are in `S1_RUN_NOTES.md`, in this folder:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-11-03_owner_free\S1_RUN_NOTES.md
```

---

## Step 0: before the deploy

### 0a. `20261103_15`: invite codes. Any time. Skip it if you already ran it.

It closes a live leak and depends on nothing else. A second run gives the same row, so if you are not sure, run it again. Only comments changed in this file since it was handed to you; its statements are the same.

Before the merge:

```
D:\nzwt\ownerfree\supabase\migrations\20261103_15_library_invitations_close_public_read.sql
```

After the merge:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_15_library_invitations_close_public_read.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_15_library_invitations_close_public_read.sql
```

Paste the whole file into the SQL Editor as postgres. Expect one row:

```
anon_select | authenticated_select | policies_left | policies_admitting_session_roles | service_role_select | ok
f           | f                    | 0             | 0                                | t                   | t
```

### 0b. Library precheck (read-only). Send us the three tables before the deploy.

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-11-03_owner_free\S1_precheck_principles_and_book.READ_ONLY.sql
/www/wwwroot/nzamy/latest-nzamy-full/SQL_batch_2026-11-03_owner_free/S1_precheck_principles_and_book.READ_ONLY.sql
```

The file holds three SELECTs. Run each on its own in the SQL Editor, and paste the three tables back.

**Why it matters:** every `dbId` in `src/lib/library/legacyLibrarySlugs.ts` is still empty at this commit. Until we fill them from your tables, every old link to one of the 33 bundled collections, and to the book «مصادر الحق», opens «قريباً», even when the database already holds that collection.

### 0c. Pricing rows (read-only)

```sql
select service_id, enabled, metadata->>'variantOf' as variant_of
  from public.admin_pricing_catalog
 where audience <> 'individual';
```

Expect no rows before `_20` runs. Any row here was not made by this batch: send it to us.

### 0d. Old library text in the live build (server terminal)

The live build still carries the bundled library text. Find one of its files now, and keep the name for Step 3:

```bash
grep -rl "الإجارة عقد لازم لا تتغير بتغير الأجور" /www/wwwroot/nzamy/latest-nzamy-full/.next-*/static/chunks
```

---

## Step 1: SQL before the deploy (SQL Editor as postgres; paste the whole file; one new query per file)

Each file is safe to run twice and runs in one transaction. If it says `ERROR`, nothing changed: send us the error and stop. Each one is safe with the old code still live.

### `20261103_10`: an automatic library lock ends by itself

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_10_library_auto_lock_hours.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_10_library_auto_lock_hours.sql
```

```
column_default_24 | auto_lock_hours_now | quota_fn_overloads | evaluate_fn_overloads | lock_create_overloads | staff_lock_converts_auto | ok
t                 | 24                  | 1                  | 1                     | 1                     | t                        | t
```

Locks already open keep no end. The optional statement for them is in `S1_RUN_NOTES.md`; it is a data choice and this file does not run it.

### `20261103_11`: an invite code with its own days

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_11_library_invitation_grant_days.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_11_library_invitation_grant_days.sql
```

```
grant_days_column | grant_days_check | codes_with_own_days | codes_readable_by_session_roles | ok
t                 | t                | 0                   | f                               | t
```

`codes_readable_by_session_roles = t` means `_15` has not run: run it (Step 0a). It is not part of `ok`.

### `20261103_12`: the eligibility table (nothing reads it yet)

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_12_library_eligibility_verifications.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_12_library_eligibility_verifications.sql
```

```
table_exists | rls_on | users_cannot_write | users_cannot_read | verified_accounts | ok
t            | t      | t                  | t                 | 0                 | t
```

### `20261103_21`: NEWCLIENT's first-order rule lives in its row

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_21_newclient_first_order_flag.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_21_newclient_first_order_flag.sql
```

```
expected_code | code      | first_paid_order_only | first_order_rule | ok
NEWCLIENT     | NEWCLIENT | true                  | 20261103_21      | t
```

No NEWCLIENT row: `code` is empty and `ok = t`, which is also fine.

**Do not re-run `20261030_16_pricing_owner_package.sql` after an admin un-ticks «للطلب المدفوع الأول فقط» on NEWCLIENT.** It puts the flag back.

### `20261103_31`: live progress of an AI run

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_31_progress_events.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_31_progress_events.sql
```

Expect one row, `ok = t`. The code survives this file's absence, but the waiting screen then shows no events.

### `20261103_69`: the QR verification card

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_69_letterhead_verify_card.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_69_letterhead_verify_card.sql
```

Expect one row, `ok = t`. It depends on `20261026_63` and `20261026_70`, which are already on production. Without `_70` it stops and changes nothing.

---

## Step 2: n8n before the deploy (n8n.asra3.com)

These three carry the prompt that infers a missing specialty, plus the progress nodes. `analyze-strength` carries only the progress nodes.

**How to import, for this step and Step 5 (the two new workflows are different; see there):**
1. The JSON files carry no id. Importing from the workflow list makes a second workflow on the same webhook path. So open the **existing** workflow by its name, and use its menu → **Import from File**.
2. **Re-select the credentials on every node that has one, including every `Progress ·` node.** If you skip a `Progress ·` node, its posts get 401, which `continueRegularOutput` hides: nothing looks wrong and the screen simply shows no progress. The table gives the count to tick off.
3. Save, and check that the workflow's Active switch is still on.

| Workflow name | Id | Nodes with a credential | `Progress ·` nodes |
|---|---|---|---|
| `NZAMY · AI · wargaming (L9 المحاكي الشامل)` | `5CFEwAsuT0lRZRlK` | 6 | 2 |
| `NZAMY · AI · analyze-strength (L10 محلل قوة الموقف)` | `MwONm9eg0IOGRRzt` | 6 | 2 |
| `NZAMY · AI · legal-drafter (L14 الصائغ القانوني)` | not in the repo: find it by name | 6 | 2 |

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\wargaming.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\analyze-strength.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\legal-drafter.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/wargaming.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/analyze-strength.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/legal-drafter.json
```

Nothing is imported for `wf-5.1` or canvas-strategist: those items are not built.

---

## Step 3: deploy (server terminal)

The branch must be merged into main first. There are no new npm packages (`package.json` is unchanged since main `1103812d`), so `npm install` is not needed. Use nohup: a dropped web terminal kills a build otherwise.

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/deploy-20261103-owner-free.log 2>&1 &
```

```bash
tail -f /root/deploy-20261103-owner-free.log
```

The log is that one file on the server. `deploy.sh` does not run `_verify` (Step 6).

After the deploy, the file you found in Step 0d must be gone. Put its name in this command; expect `404`. If it does not answer 404, purge the nginx cache and try again:

```bash
curl -sI https://nezamy.sa/_next/static/chunks/<that file> | head -1
```

---

## Step 4: SQL after the deploy

### `20261103_20`: the business price of contract review. Any time; best right after the deploy.

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_20_contract_review_business_row.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_20_contract_review_business_row.sql
```

```
service_id               | in_table | audience  | base_price | variant_of      | ok
contract-review-business | t        | corporate | 800.00     | contract-review | t
```

### `20261103_22`: coupons for companies. Only after the deploy.

Before the deploy, the old coupons page would narrow an edited coupon to individuals.

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_22_coupon_business_role.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_22_coupon_business_role.sql
```

The file ends with two SELECTs: the codes that now target companies (it may be empty), then the check. The editor shows only the last one:

```
left_business | ok
0             | t
```

### `20261103_14`: search ignores tashkeel. After the deploy, at a quiet hour; it may wait for days.

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261103_14_library_fts_tashkeel_fold.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261103_14_library_fts_tashkeel_fold.sql
```

- **Plan for 1–2 minutes of library downtime.** It rewrites three tables under a lock.
- It leaves the matview `library.cross_section_search` **empty**. Nothing in the app reads it. The plain refresh is in the notes, and `CONCURRENTLY` cannot work on an empty matview.
- The last result is one row, `ok = t`.
- Follow `S1_RUN_NOTES.md`, «AFTER the deploy, at a quiet hour»: the counts before and after, the server command, and what to do if it stops.

---

## Step 5: the other n8n imports

### Any time, before or after the deploy

Import over the existing workflow, as in Step 2.

| Workflow name | Id | Nodes with a credential | `Progress ·` nodes |
|---|---|---|---|
| `NZAMY · AI · case-brief (L7 عصارة المرفقات)` | `snPDkKndPA9wjIKr` | 5 | 2 |
| `NZAMY · AI · brief-check (L8 مراجعة وتدقيق مذكرة)` | `bu9guzNEhaLbyAPd` | 5 | 2 |
| `NZAMY · AI · contract-drafter (L11 محترف العقود المختصر)` | `r2s0JBMr8Q5Ti80O` | 6 | 2 |
| `NZAMY · AI · contracts-pro (L13 محترف العقود)` | `mMekAog89HsgLz3o` | 5 | 1 |
| `NZAMY · AI · legal-opinion-consult (L12 الرأي الفصل — استشارة)` | not in the repo: find it by name | 6 | 2 |
| `NZAMY · AI · legal-opinion-letter (L12 الرأي الفصل — خطاب)` | not in the repo: find it by name | 6 | 2 |

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\case-brief.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\brief-check.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\contract-drafter.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\contracts-pro.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\legal-opinion-consult.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\legal-opinion-letter.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/case-brief.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/brief-check.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/contract-drafter.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/contracts-pro.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/legal-opinion-consult.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/legal-opinion-letter.json
```

Until these are imported, a run still works. Its waiting screen just shows fewer details.

### Only after the deploy: the two new workflows

These two are not on the live n8n yet, so import them from the workflow list as new workflows. Re-select the credentials on every node that has one, including each `Progress ·` node, and switch each one on. Both tools stay off in the app until Step 9, so nobody can reach them yet.

| Workflow name | Nodes with a credential | `Progress ·` nodes |
|---|---|---|
| `NZAMY · AI · contract-review (مراجع العقود)` | 5 | 2 |
| `NZAMY · AI · contract-negotiator (مفاوض العقود)` | 6 | 2 |

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\contract-review.json
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n\ai\contract-negotiator.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/contract-review.json
/www/wwwroot/nzamy/latest-nzamy-full/n8n/ai/contract-negotiator.json
```

---

## Step 6: `_verify.sql` by hand (server; deploy.sh does not run it)

Run it after Steps 1 and 4.

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/_verify.sql
```

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261103_|ERROR"
```

Expect these ten lines on the screen, in this order, and no `ERROR`:

```
_verify: 20261103_20 OK — companies see contract review from 800.00 SAR …
_verify: 20261103_21 OK — NEWCLIENT is for the buyer's first paid order only (from its row)
_verify: 20261103_22 OK — no coupon targets 'business'; company coupons target 'corporate'
_verify: 20261103_14 not applied yet — …      (until you run _14; then: _verify: 20261103_14 OK — …)
_verify: 20261103_10 OK — automatic library locks end after 24 hour(s) …
_verify: 20261103_11 OK — … invite code(s) carry their own number of days; the rest give 30
_verify: 20261103_12 OK — library eligibility is staff-only (0 verified, 0 revoked)
_verify: 20261103_15 OK — library invite codes: no anon / authenticated privilege, …
_verify: 20261103_31 OK — progress_events: own rows through granted columns, …
_verify: 20261103_69 OK — verification card: token and switch server-only, …
```

An `ERROR` names the file to run. `ON_ERROR_STOP=1` means every block after it was skipped, so run that file and repeat this step. Run this step once more after `_14`.

**What was tested and what was not.** In Docker, these ten blocks pass in this order on one database. The same database shows the blocks of `_20`, `_21`, `_10`, `_11`, `_12`, `_15`, `_31` and `_69` stopping with «run …» while their files are missing, and `_14` giving only its NOTICE. `_22`'s block passes when no coupon holds `business`, so with no such coupon it has nothing to report. The whole `_verify.sql` was never run top to bottom on a database with every migration: the test database holds only these files' chains, so older blocks stop there for files it never loaded. It has no syntax error. So an older block that fails on production is not covered by this test: send us the line.

---

## Step 7: cron and tool modes, after the deploy

### 7a. The sweep must be running

In n8n (n8n.asra3.com), check that a schedule sends these, with the header `x-cron-secret` set to the server's `CRON_SECRET`:
- every 10 minutes: `POST https://nezamy.sa/api/v1/cron/ai-sweep`
- daily: `POST https://nezamy.sa/api/v1/cron/ai-sweep?task=retention`

**If the sweep is not running, a run abandoned by a restart stays `running` forever, with its points held.** The daily one clears run text older than 90 days and progress events older than 7 days. To check from the database:

```sql
select count(*) as runs_stuck_past_deadline
  from public.ai_runs
 where status = 'running' and deadline_at < now() - interval '20 minutes';
```

Expect `0`.

### 7b. Which tools are on (read-only)

**Every tool in this batch ships with `defaultMode` off.** A tool works only if `platform_settings.ai_tools` says otherwise. So what users see after the deploy depends on this result:

```sql
select t.tool, s.value -> t.tool ->> 'mode' as mode
  from (values ('case-brief'), ('quick-answer'), ('brief-check'), ('wargaming'), ('analyze-strength'),
               ('legal-drafter'), ('contract-drafter'), ('contracts-pro'), ('legal-opinion-consult'),
               ('legal-opinion-letter'), ('contract-review'), ('contract-negotiator')) as t(tool)
  left join public.platform_settings s on s.key = 'ai_tools'
 order by t.tool;
```

- An empty `mode` means the default, which is off.
- **`case-brief`:** without `staff` or `live`, the card on `/ai/analyze` answers `tool_off`.
- **`quick-answer`:** the same; the plan's "visible at the deploy" holds only if it is already `live`.
- **To change a mode:** as an admin, open `https://nezamy.sa/dashboard/admin/ai-usage`, choose the mode for the row, and press **حفظ**. `staff` is «للمشرفين فقط», and `live` is «مفعّلة».

Send us this table. `contract-review` and `contract-negotiator` should be empty until Step 9.

---

## Step 8: Word and pasted text (after the deploy; a live test, then the flags)

Text and Word have not been proven on live n8n or Gemini. Nothing shows to users until the last step here. **Keep the window short:** the server flag covers every file tool (case-brief, brief-check, wargaming, analyze-strength, legal-drafter). Any of them that is `live` accepts a `.docx` or a paste through a direct API call during the test. A failed run is refunded, so this is money-safe.

**First check two conditions, or every paste is refused uncharged and looks like a failed test.** `NZAMY_AI_KEY` must be set, and `NEXT_PUBLIC_SITE_URL` must start with `https://`. In this file:

```
/www/wwwroot/nzamy/latest-nzamy-full/.env.local
```

```bash
grep -cE '^NZAMY_AI_KEY=.+' /www/wwwroot/nzamy/latest-nzamy-full/.env.local; grep '^NEXT_PUBLIC_SITE_URL=' /www/wwwroot/nzamy/latest-nzamy-full/.env.local
```

Expect `1`, then the https address. Never paste the key itself in chat.

Admin runs are exempt from charges. Then:

1. In `/dashboard/admin/ai-usage`, make sure brief-check and wargaming are at least `staff`. **If Step 7b shows one of them `live`, leave it live:** `staff` would hide it from users during the test. If you changed one, note what it was and put it back at the end.
2. In `.env.local`, add `NZAMY_AI_TEXT_FILES=on`, then run `pm2 reload nzamy`. Leave `NEXT_PUBLIC_AI_TEXT_FILES` off.
3. As admin, upload a `.docx` to the vault. In the browser console, find the row's `id` by its file name:
   ```js
   (await fetch("/api/v1/documents").then(r=>r.json())).data
   ```
4. Run a brief-check on the `.docx`. Put the id in place of `ID`:
   ```js
   await fetch("/api/v1/ai/runs",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tool:"brief-check",input:{client_capacity:"مدعٍ"},fileIds:[ID],idempotencyKey:crypto.randomUUID()})}).then(r=>r.json())
   ```
5. Open `/ai/runs/<runId>`. Expect `مكتمل`, with findings that quote the document.
6. Repeat with a pasted memo: no `fileIds`, and `memo_text` of at least 200 characters in `input`.
7. Test the second workflow kind with a wargaming paste, because wargaming is a `caseJob`, not a `docJob`. Use `tool:"wargaming"` and `input:{role:"plaintiff",area:"عمالي",case_summary:"<20+ chars>",targets:["opponent"],docs_text:"<50+ chars>"}`.

**If any run fails** (`download_failed`, `model_error`, or the text is ignored):
- Remove `NZAMY_AI_TEXT_FILES` from `.env.local`, run `pm2 reload nzamy`, and send us the result. Do not turn on the client flag.
- If Gemini rejects the file type, first suspect `; charset=utf-8` being carried into the binary's mime type.

**If all pass:** add `NEXT_PUBLIC_AI_TEXT_FILES=on` to the same file and deploy again. This flag is baked in at build time, so a restart is not enough:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && nohup bash deploy.sh > /root/deploy-20261103-textfiles.log 2>&1 &
```

Then the Word pickers and the paste boxes appear. The attachment preview eye button is not behind this flag: it appears at the first deploy.

**Limits to know:**
- Word extraction reads the document's body only. Headers, footers, footnotes and comments are not sent, so a memo that cites in footnotes loses those citations.
- `.doc` is refused with a message asking for `.docx` or PDF. Reading it would need a new dependency.
- Pasted text stays in `ai_runs.input` for the 90-day retention. A pasted contract in a team order stays in `service_requests.metadata`, and the admin brief shows it in full.
- A 100 KB pasted contract through nginx's `client_max_body_size` is unconfirmed. The docs say the site needs 6m.
- `NZAMY_AI_KEY` also signs the file-text links.

---

## Step 9: contract review and negotiator (when you choose)

Both are built and **off**. No real model has run them. While off, nobody is charged, and the screens show «قريباً» or the team order, with no price.

1. Complete Step 5's second part.
2. In `https://nezamy.sa/dashboard/admin/ai-usage`, set `contract-review` and `contract-negotiator` to `staff`.
3. Test as admin:
   - **Review:** `https://nezamy.sa/ai/contracts`, choose the review mode, and go to the last step. It takes one PDF or image up to 15 pages, or a pasted contract once the Step 8 flags are on.
   - **Negotiator:** `https://nezamy.sa/ai/contract-negotiator`, with 1 to 10 pasted clauses.
4. An admin runs exempt, so this proves the workflow and the screen, not the money.
5. Set a tool to `live` only when you are satisfied. Then read the first real ledger rows:

   ```sql
   select delta, reason, tool, ref, created_at
     from public.points_ledger
    where tool in ('contract-review', 'contract-negotiator')
    order by created_at
    limit 5;
   ```

   Expect a `usage` row of −250 or −150, and a matching `usage_refund` if that run failed.

6. **After go-live for everyone, tell us, and we remove «قريباً» with a code change and a deploy.** It sits in `src/constants/navigation.sidebars.legal.ts`, rows 268 (negotiator) and 269 (reviewer). Until then, the lawyer's sidebar reads «قريباً» even with the tool live. Row 269 keeps its old address, `/ai/contract-reviewer`, which redirects to `/ai/contracts`: the sidebar keys its rows by address, and «محترف العقود» at row 267 already uses `/ai/contracts`.

**Three things to watch after go-live:**
- **Percentages fail the run.** Any figure with `%` or `٪` in the result refunds the run, including a contract's own rate («غرامة ٥٪»); the prompts ask for rates in words. If refunds run high, look here first. This is owner question ٤٤٠.
- **A long reply can be cut.** Review can reach about 26,000 characters at 20 clauses against 12,000 tokens, and the negotiator about 19,000 at 10 clauses against 10,000 tokens. A cut reply fails and refunds.
- **A shared rate limit.** `/ai/contracts` reads tool-status on every load, in the same per-IP bucket as points-standing. A 429 reads as "unusable", so AI review can vanish behind a shared office IP. No one is charged.

---

## Step 10: Word export (once, after the deploy)

No `.docx` from this code has ever been opened in real Word or LibreOffice. Neither is installed where it was built.

1. Open these two samples in Word. They sit in a temporary folder and may be gone:

   ```
   C:\Users\LOQ\AppData\Local\Temp\claude\4b7b475a5d8808af\d7052e5f-cce5-4ccd-9007-bd25c3c4529e\scratchpad\docx\generated.docx
   C:\Users\LOQ\AppData\Local\Temp\claude\4b7b475a5d8808af\d7052e5f-cce5-4ccd-9007-bd25c3c4529e\scratchpad\docx\merged.docx
   ```

   The logo in `generated.docx` is a dummy, so that picture may show as broken. Judge only whether the file opens and how the layout looks.

2. On the live site, as a lawyer, export one AI result to Word with **one real office template** uploaded in `/dashboard/lawyer/vault`. Check the right-to-left text, mixed Latin words, the logo and the footer.

---

## قراءة فقط — ملخصات `<details>` في الديباجات

Any time; it changes nothing.

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-11-03_owner_free\READ_ONLY_library_preamble_details_summaries.sql
/www/wwwroot/nzamy/latest-nzamy-full/SQL_batch_2026-11-03_owner_free/READ_ONLY_library_preamble_details_summaries.sql
```

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < SQL_batch_2026-11-03_owner_free/READ_ONLY_library_preamble_details_summaries.sql
```

Send us the rows with `already_known = f`: `summary`, `laws` and `example_slug`, as they appear. In the SQL Editor, select only the lines from `with s as` to the `order by` line, because the editor would otherwise show just the rollback.

---

## Step 11: browser checklist

**None of the screens below has been seen in a browser with real data.** Tests cover their logic only. Try each in light and dark mode. Send us what looks wrong.

### Guest (a private window)
- [ ] `/ai/case-brief` lands on `/ai/analyze`; `/ai/research` on `/ai/legal-opinion`; `/ai/corp/contracts`, `/ai/ngo/volunteer-contract` and `/ai/contract-reviewer` on `/ai/contracts`.
- [ ] `/services/contracts` shows both contract-review prices, 600 and 800.
- [ ] `/verify/not-a-real-token` goes to the home page and reveals nothing.
- [ ] `/precedents/tamyeez` shows «قريباً» (or its record, once Step 0b's ids are in).
- [ ] **Library:** a collection shows 50 principles and scrolling loads 50 more. A deep link to the 300th opens its window with «عرض ما قبل».
- [ ] **Search:** «القرار» finds a text stored with tashkeel (after `_14`). The ⓘ button beside the search bar opens by keyboard.

### Individual client
- [ ] `/dashboard/client/services` and `/dashboard/client/requests/new?type=contract-review` show «يبدأ من ٦٠٠ ر.س».
- [ ] The eye button in a service request's attachments previews a PDF, an image and a Word file. A PDF may be blocked in the frame at `auth.nezamy.sa`; the plain link beside it must work.
- [ ] `/ai/analyze` shows the client analyzer, not the lawyer's studio.
- [ ] The dashboard banner's «المجيب السريع» leads to a tool this role cannot run (owner question ٤٤٣).

### Company
- [ ] The same two pages show «يبدأ من ٨٠٠ ر.س».
- [ ] `/ai/contracts`: while `contract-review` is off, the review mode shows the team order and no 250.

### Micro business
- [ ] `/ai/micro`: the three contract cases open the real drafter; the other three show «قريباً».
- [ ] The banner's «استشارة سريعة» leads to a tool this role cannot run (٤٤٣).

### Lawyer
- [ ] **Case brief studio** in `/ai/analyze`: upload, run and result, with the mode on (Step 7b).
- [ ] **Quick answer** at `/ai/quick-answer`: examples, sources, «المجمّع», follow-ups; 20 points charged.
- [ ] **The waiting screen (`AiThinkingStage`)**, on a job tool with one PDF, such as wargaming: file names, the stages, a real clock; layout in dark mode. `GET /api/v1/ai/runs/<id>/events` shows a `note` «يقرأ 1 ملف» and a `step` «يكتب الناتج».
- [ ] **`/ai/runs/<id>`:** a finished run, a failed one, and a running one.
- [ ] **`/dashboard/lawyer/activity`:** the run appears with the robot badge and a link.
- [ ] **Pickers, flag off:** PDF and images only on `/ai/brief-check` and `/ai/wargaming`, and no paste box.
- [ ] **Pickers, flag on (after Step 8):** Word and text accepted, and the paste boxes appear there and in the contract review step.
- [ ] **The preview eye button** on `/ai/brief-check`, `/ai/wargaming`, `/ai/draft` and the contract review step.
- [ ] **`/ai/draft`, `/ai/wargaming`, `/ai/legal-opinion`:** run with no specialty or branch. Nothing prints `undefined`, and the result infers the specialty.
- [ ] **Keyboard on `/ai/draft`:** Tab and the arrow keys through the radio groups of the first step; the upload area opens with Enter or Space, in the draft and in the contract review step.
- [ ] **Both contract screens:** `/ai/contracts` review mode and `/ai/contract-negotiator` read «جارٍ التحقق…» first, then «قريباً» or the form. No price shows while off.
- [ ] **Export bar** on a finished `/ai/draft`, `/ai/legal-opinion` and `/ai/contracts` result: «Word» and print. The Word file carries no `[S1]` markers.
- [ ] **Print:** the paper shows the letterhead and the QR, and no raw markers. It does not carry the on-screen AI note (owner question ٤٤٢).
- [ ] **Verify card:** scan the QR of a verified, unpublished lawyer: name, licence number, «موثّق», nothing else. Turn the switch off in `/settings`, in the profession tab: the card goes home, and a new Word file holds no `/verify/`.
- [ ] **SVG logo** in `/dashboard/lawyer/vault`: a normal SVG becomes a PNG; an SVG with a script is refused.

### Firm account
- [ ] `/ai/analyze` shows the studio; `/dashboard/firm/vault` works.
- [ ] Export offers «ورق المكتب».
- [ ] `/dashboard/firm/activity` shows **no** AI rows. This is expected today (owner question ٤٤٤). The run page opens by its link.
- [ ] A firm member with no print permission sees only his own paper. A personal print grant waits for item ٢٣.

### Admin
- [ ] `/dashboard/admin/pricing`: change the company row to 850; the company request form shows it; set it back to 800.
- [ ] While it reads 850, `/services/contracts` still shows 800. That is correct: public pages read the compiled `CLIENT_SERVICE_CATALOG`, so they change only with a code change and a deploy. The page and the owner report say so.
- [ ] `/dashboard/admin/subscriptions/coupons`: open NZAMY50 and save with no change: no request is sent. Change the value to 40: only the value is sent. Then put it back.
- [ ] «عرض كـ»: as judge, it opens `/dashboard/government`, and the tab survives a reload. As «مستشار (م ١٨)», the menu has no pleading items. As company with simulate on, a hidden business route shows «قريباً».
- [ ] `/dashboard/admin/security` → «نشاط المكتبة» → «الحدود»: the new hours field.
- [ ] `/dashboard/admin/library-invitations`: a code with its own days and seats.
- [ ] `/dashboard/admin/ai-usage`: both new tools appear in the list.
- [ ] Staff lock on a reader who already has an automatic lock: same SEC reference, the staff's note and end. A second lock on him changes nothing.

---

## If a file is re-run later

- **`20261030_16`** after an admin un-ticks NEWCLIENT: re-stamps the flag (see Step 1).
- **`20260922_01` or `20260626`:** gives anon SELECT on `library.invitations` again, and `_verify` stops. Run `_15` again.
- **`20261031_10` or `20261030_80`:** puts back the automatic lock that never ends, and `_verify` stops. Run `_10` again.

## Rollback (by hand)

Each migration's header has its rollback, under "ROLLBACK". After one, `_verify.sql` stops on that file's block every time, and with `ON_ERROR_STOP=1` it skips the blocks after it. So tell us: the block must change in the repo too, never only on the server.
