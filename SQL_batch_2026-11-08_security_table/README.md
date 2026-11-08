# Batch 2026-11-08 (decree security + owner table ٤٣٩–٤٤٤/٤١٧ + devices, section edits, free question, murshid): your steps, in order

**Where the files are.** Until the branch `batch/2026-11-08-security-table` is merged, the files are in the worktree `D:\nzwt\b1108\`. After the merge they are in `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\`, and on the server after `git pull` in `/www/wwwroot/nzamy/latest-nzamy-full/`. The paths below are relative to that folder.

**Screen or file.** Every SQL result here appears on the screen only. Paste the results back to us.

**The SQL Editor hides NOTICEs and shows only the last result.** Every migration ends with a SELECT you can read, and every row must say `ok = t`.

**No `npm install` needed.** No dependency changed in this batch.

## The whole order

| Step | What | When |
|---|---|---|
| 0 | Read-only checks (3 queries) | before anything |
| 1 | SQL `20261108_20`, `20261108_30`, `20261108_40`, `20261108_41`, `20261108_50` | before the deploy (any time; the new code works without them) |
| 2 | Deploy | |
| 3 | SQL `20261108_10` (decree lock) | **only AFTER the deploy** |
| 4 | `_verify.sql` by hand | after Steps 1 and 3 |
| 5 | n8n: the legal-drafter «section» step | **done 2026-11-08**: applied and published through the n8n API (both prompt nodes) |
| 6 | Device limit: test, then switch on | after the deploy, with a test subscriber |
| 7 | Browser checks | after the deploy |

**Do NOT re-run `20261019_40_library_decree_preamble_lock.sql`** after Step 3. Re-running it would reopen everything `20261108_10` closes. It is not in this batch; only its header comment changed.

---

## Step 0: read-only checks

### 0a. Who can read what in the library today

This shows every table and column that the public key can read in the `library` schema. Run it on the server terminal:

```bash
docker exec supabase-db psql -U postgres -d postgres -c "select 'table' as level, table_name, null::text as column_name, grantee, privilege_type from information_schema.table_privileges where table_schema = 'library' and grantee in ('anon','authenticated') and privilege_type = 'SELECT' union all select 'column', table_name, column_name, grantee, privilege_type from information_schema.column_privileges where table_schema = 'library' and grantee in ('anon','authenticated') and privilege_type = 'SELECT' order by 2, 1 desc, 3, 4;"
```

Today `decrees_circulars` should list 15 columns per role, including `ref`, `date`, `official_url`, `summary`, `summary_brief` and `fts`. Paste the `decrees_circulars` rows. Run it again after Step 3, and it must list only 9 columns per role: id, title, type, issuer, category, hashtags, created_at, updated_at, instrument_ar.

### 0b. Points are charged

```sql
select key, value from public.platform_settings where key = 'points_enforcement';
```

If this is `false`, the firm points counter (٤٤٤) reads 0 for everyone, and section edits beyond the free ones are not charged. Send us the row.

### 0c. The drafter's daily limit override

```sql
select value->'legal-drafter' as drafter from public.platform_settings where key = 'ai_tools';
```

Send us the row.

---

## Step 1: before the deploy (any time)

Run each file in the SQL Editor, one at a time. Each one ends with a SELECT, and every row must say `ok = t`.

1. `supabase/migrations/20261108_20_library_device_limit.sql`: the device table and the two device settings. It ships **OFF**.
2. `supabase/migrations/20261108_30_firm_member_points_usage.sql`: the per-member points counter for the firm finance page.
3. `supabase/migrations/20261108_40_drafter_section_edits.sql`: the «عدّل هذا القسم» counting and charging.
4. `supabase/migrations/20261108_41_drafter_daily_limit_excludes_sections.sql`: section edits no longer use up the drafter's daily limit, and the draft that follows a paid analysis is never refused for that limit. Run it after `_40`.
5. `supabase/migrations/20261108_50_free_daily_question.sql`: the free daily question. It stays inactive until phone verification exists.

All five can be re-run safely. If one is missing, the new code hides or refuses only that feature, uncharged.

## Step 2: deploy

As usual (`deploy.sh` via nohup).

## Step 3: right after the deploy

`supabase/migrations/20261108_10_library_decree_tier_columns_lock.sql`

It **must** run after the deploy. The old code reads the decree number and date with the public key, so running it before the deploy would break the decree pages and the /laws list until the deploy lands. The last SELECT returns 32 rows, and all of them must say `ok = t`. Then re-run query 0a.

## Step 4: `_verify.sql`

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | tail -40
```

The new blocks are `library_tier_columns_1108`, `library_device_limit_1108`, `firm_member_points_1108`, `drafter_section_edits_1108`, `drafter_daily_limit_1108` and `free_daily_question_1108`. Paste the tail.

## Step 5: n8n (ours)

**Done 2026-11-08.** The live «NZAMY · AI · legal-drafter (L14 الصائغ القانوني)» workflow (`hhmOLkcaPj3bojmh`) now has the «section» step in both prompt nodes («Prepare» and «Build prompt»), published. It matches `n8n/ai/legal-drafter.json`. The old analysis and draft steps are unchanged.

## Step 6: device limit (٤٢٧), test then switch on

1. Switch it on from «الأمان والحماية ← أجهزة المكتبة», or run:
   `update public.library_monitor_settings set device_limit_enabled = true where id;`
2. As a test subscriber, open a law in the browser. In devtools → Network, the response must carry `Set-Cookie: nz_lib_device=…; HttpOnly; Secure; SameSite=Lax`.
3. Open a law, a decree, a precedents collection, a book, and run a search inside a document. Then
   `select count(*) from public.user_devices where user_id = '<test user uuid>' and revoked_at is null;`
   must return **1**.
4. A second browser makes it 2. A third browser gets the refusal listing the two devices, and «تسجيل خروج هذا الجهاز» there lets the third one in.
5. **If step 2 or 3 fails, switch it off at once:**
   `update public.library_monitor_settings set device_limit_enabled = false where id;`

State check (read-only): `select device_limit_enabled, device_limit from public.library_monitor_settings where id;`

## Step 7: browser checks

The six checks at the end of the owner report `تقرير_للمالك_٢٠٢٦-١١-٠٨_دفعة_الأمان_وردكم_على_٤٣٩_إلى_٤٤٤.md`, plus the murshid routes:

```bash
for p in sectors sectors/1 sectors/32 channels najiz-guide "search?q=%D9%86%D8%A7%D8%AC%D8%B2"; do curl -s -o /dev/null -w "%{http_code} $p\n" "https://nezamy.sa/api/v1/murshid/$p"; done
```

All six must print 200. A 500 means the server can't find `src/data/murshid`, and the pm2 log will show a `[murshid]` error; send it to us.
