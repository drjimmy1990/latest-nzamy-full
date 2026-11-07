# Owner answers ٤٠٨–٤٣٨ (2026-11-07): your steps, in order

**Where the files are.** Until the branch `batch/2026-11-07-owner-answers` is merged, the files are in the worktree `D:\nzwt\ow408\`. After the merge they are in `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\`, and on the server after `git pull` in `/www/wwwroot/nzamy/latest-nzamy-full/`. Paths below are written for after the merge.

**Screen or file.** Every SQL result and command output here appears on the screen only. None is saved to a file, except the deploy log named in Step 3. Paste the results back to us.

**The SQL Editor hides NOTICEs and shows only the last result.** Every file ends with a SELECT you can read.

**No `npm install` needed.** No dependency changed in this batch.

## The whole order

| Step | What | When |
|---|---|---|
| 0 | Read-only checks (3 SELECTs) | before anything |
| 1 | SQL `20261107_10`, `20261107_20`, `20261107_30` | before the deploy (also safe after) |
| 2 | n8n: two prompt changes (quick-answer, najiz-optimizer) | any time — we apply them through the n8n API on your go |
| 3 | Deploy | |
| 4 | SQL `20261107_50` | **right after the deploy** |
| 5 | `_verify.sql` by hand | after Steps 1 and 4 |
| 6 | Browser checks | after the deploy |
| — | Re-run `20261107_10` | after **every** library load by the owner |

There is no `20261107_40` (the assistant's 15-message rule needed no SQL).

---

## Step 0: read-only checks

### 0a. How the library monitor acts on a flag

`20261107_20` lowers the alert thresholds to 240 requests and 60 searches an hour. If the monitor's action is not `notify`, heavy readers could be slowed or locked by those alerts.

```sql
select flag_action, hourly_docs, rule_hour_requests, rule_hour_searches, daily_docs, member_daily_docs
  from public.library_monitor_settings;
```

Expect `flag_action = notify`. If it says anything else, stop and send us the row.

### 0b. Points are charged

The AI tools are now open to every account type (owner ٤١٧). They are all in `staff` mode today, but before an admin switches any to `live`, points must be enforced, or runs are free.

```sql
select key, value from public.platform_settings where key = 'points_enforcement';
```

Expect `true`. Send us the row either way.

### 0c. How many law articles carry internal audit notes

The reader now hides them (owner screenshot ٢), but they stay in the database. File:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-11-07_owner_answers\READONLY_count_audit_notes.sql
```

Read-only. Paste the whole file; it shows two result sets but the editor shows the last one — run the two SELECTs one at a time and paste both rows. We send the numbers to the owner.

---

## Step 1: SQL before the deploy

Paste each whole file into the SQL Editor as postgres, one at a time.

### 1a. `20261107_10` — names of the merged regulations on the /laws cards

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261107_10_library_merged_regulation_names.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261107_10_library_merged_regulation_names.sql
```

Adds `library.laws.merged_regulation_names` and fills it. It locks `library.laws` for a few seconds, so the catalogue waits briefly. The new code works without it (the grey «يشتمل على» line just doesn't show), but run it before or soon after the deploy.

Expect a first row `summary` with `laws_with_names=… , merged_flag_laws=… , merged_without_names=…` and up to five sample laws. `laws_with_names` must be more than 0. Paste the rows: we check the names read well.

**After every library load by the owner, run this file again.** His loader doesn't write the new column, so new or reloaded laws lose the line until it runs.

### 1b. `20261107_20` — library hourly limits (owner ٤٢٦)

Only after Step 0a shows `notify`.

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261107_20_library_caps_owner_426.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261107_20_library_caps_owner_426.sql
```

It overwrites the three hourly numbers even if an admin changed them. Expect one row:

```
hourly_docs | rule_hour_requests | rule_hour_searches | daily_docs | member_daily_docs
50          | 240                | 60                 | 220        | 400
```

(The daily numbers are unchanged until the owner answers ٤٤٧; if an admin changed them, you see his numbers.)

### 1c. `20261107_30` — urgent cassation, 15 days (owner ٤٢٩)

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261107_30_deadline_cassation_urgent_194.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261107_30_deadline_cassation_urgent_194.sql
```

Expect three rows:

```
appeal_urgent    | 10 | … المادة (١٨٧) …
cassation        | 30 | نظام المرافعات الشرعية — المادة (١٩٤)
cassation_urgent | 15 | نظام المرافعات الشرعية — المادة (١٩٤)
```

No existing deadline is recomputed.

---

## Step 2: n8n (we do it)

Two workflows on n8n.asra3.com get a new **Build prompt** `jsCode`, copied from the repo files:

| Workflow | id | Repo file | Why |
|---|---|---|---|
| `NZAMY · AI · quick-answer (L3 سؤال قانوني سريع)` | `ZigypMIWBhyPHrp7` | `n8n/ai/quick-answer.json` | owner ٤١٣: either an answer from the library texts with their ids, or a general answer with no id at all — never mixed |
| `NZAMY · AI · najiz-optimizer (L2 منقح ناجز R5)` | `b3SSd5YoQmIjCgna` | `n8n/ai/najiz-optimizer.json` | owner ٤١٦: keep every «[يحتاج تحقق]» |

Safe in either order with the deploy. Until they're applied, a general quick answer is refunded, and a condense that drops a «[يحتاج تحقق]» is refunded.

---

## Step 3: deploy

On the server:

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/deploy-20261107-owner-answers.log 2>&1 &
```

```bash
tail -f /root/deploy-20261107-owner-answers.log
```

This deploy also carries the 404 fix (`1c5b9106`) if it is not live yet. Afterwards:

```bash
for u in zzz-check _next/static/chunks/zzz-check.js ""; do curl -s -o /dev/null -w '%{http_code}\n' "https://nezamy.sa/$u"; done
```

Expect `404`, `404`, `200`.

---

## Step 4: SQL right after the deploy

### `20261107_50` — consultation prices, NZAMY50, the protection plan name (owner ٤٢٠, ٤٣٣, ٤٣٦)

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261107_50_owner_answers_prices.sql
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261107_50_owner_answers_prices.sql
```

**After the deploy, not before:** the old code would show a voice-consultation card it can't open. Between the deploy and this file, pages still show the old consultation prices (500/700/250), so run it within minutes.

Expect 7 rows, every `ok` = `t`:
- `ind-litigation` named «عضوية الحماية القانونية»
- `written-opinion` 79, `voice-call` 129, `video-short` 199, `in-person` 349 (each with its lawyer band), `video-full` disabled and hidden
- `NZAMY50` excluded kinds `{topup,plan,library}`, min 200

A re-run leaves any later admin edit alone.

---

## Step 5: `_verify.sql`

As before (`deploy.sh` doesn't run it):

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | tail -40
```

New blocks this batch: merged regulation names, library caps, urgent cassation, owner answers prices. Paste the tail.

---

## Step 6: browser checks (after the deploy)

As a visitor (signed out), then as a subscriber:
1. `/laws` grid: «مدمج» sits next to «متاح»; merged laws show «يشتمل على: … • …» (after 1a).
2. `/laws/law-traffic`, article 1: no «تصحيح 2026-08-14 …» text in «الإصدارات السابقة»; the line «من اللائحة التنفيذية…» is no longer at the end of the article; a separate «اللائحة التنفيذية» section comes after the article's previous versions. As a visitor, no decision number or date in that section.
3. A decree page (`/laws/orders/…`) as a visitor: no number, date or official link; as a subscriber: all three.
4. `/pricing`: top-ups read 700 / 1,500 / 5,000 / 12,500 / 30,000 points with no per-point price; the individuals tab shows the «عضوية الحماية القانونية — قريباً» card with no buy button; the smart plan says «ما يعادل ٢٠٫٧٥ ر.س شهرياً تُدفع سنوياً».
5. `/services/consultations`: 79 / 129 / 199 / 349 (after Step 4).
6. `/about`: «بناء أدوات ذكية تعتمد الأنظمة السعودية مصدراً».
7. As a lawyer: «الإيرادات وبيانات الأتعاب» in the sidebar; issuing one shows «بيان أتعاب — ليست فاتورة ضريبية إلكترونية».
8. AI tools stay «قريباً» for customers until an admin switches a tool's mode — nothing about tool access changes on the day of the deploy.
