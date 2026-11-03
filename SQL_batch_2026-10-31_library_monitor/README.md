# Library activity monitor (2026-10-31): your steps

One SQL file. It is new, it only adds, and it is safe to run twice. It runs in one transaction: if it says `ERROR`, nothing changed. Send us the error and stop.

**Order does not matter.**
- The deploy may go before or after the SQL; both halves fail open.
- If the code is live without the SQL:
  - the new «نشاط المكتبة» tab shows a yellow "run the migration" notice;
  - the reading caps stay as they are.
- If the SQL runs before the deploy:
  - nothing changes for readers, because the settings row is seeded with today's caps (220 / 400 / 120 / 60);
  - documents start being counted.

**Prerequisite:** `20261030_80_library_read_quota.sql` (already run on 2026-10-31). The file stops with a clear error if it is missing.

---

## Step 1: the SQL (Supabase dashboard → SQL Editor, as postgres)

The file is on your PC (after `git pull` on main):

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261031_10_library_activity_monitor.sql
```

On the server it is here:

```
/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/20261031_10_library_activity_monitor.sql
```

1. Open the file and copy all of it.
2. Paste it into a new query and press **Run**.
3. The result appears on the screen (it is not a file). Expect **one row with 8 columns, all `t`**:

```
settings_table | settings_row | user_limits_table | activity_table | flags_table | bump_fn | quota_fn_one_overload | bump_service_only
t              | t            | t                 | t              | t           | t       | t                     | t
```

## Step 2: deploy (server terminal)

There are no new npm packages in this batch.

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/deploy-20261031-libmon.log 2>&1 &
```

```bash
tail -f /root/deploy-20261031-libmon.log
```

## Step 3: `_verify.sql` by hand (server, after the deploy; deploy.sh does not run it)

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261031_|ERROR"
```

Expect `_verify: 20261031_10 OK …` on the screen, and no `ERROR`.

## Step 4: a check after a few minutes of real reading (SQL Editor)

This confirms that documents and requests are being counted. The result appears on the screen.

```sql
select count(*) as rows_last_hour,
       coalesce(sum(docs), 0) as docs,
       coalesce(sum(requests), 0) as requests
  from public.library_activity_hourly
 where hour >= date_trunc('hour', now());
```

- `docs` > 0 once anyone signed in has opened a law since the SQL ran.
- `requests` > 0 about 30 seconds after the deploy has served library reads.

## What the owner tests

The acceptance steps are at the end of:

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\docs\audits\2026-10-31-owner-note-library-monitoring.ar.md
```
