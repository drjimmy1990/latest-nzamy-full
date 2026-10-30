# Batch 2026-10-30 (owner pricing package, answers ٢٩٩–٣٠٦): your steps

**What it does:** this batch has **one** SQL file. You can run it at any time, before or after the deploy:

- It writes the price book's listed prices into `subscription_plans`. The admin MRR figures and the admin user page read them; checkout never does.
  - The smart individual plan becomes 29 / 79 / 149 / 249.
  - The two firm plans gain their quarterly and half-yearly prices.
- It marks `NEWCLIENT` as first-paid-order only.

**Checkout charges from the code (the price book), not from this table.** So the new prices, the launch prices and the coupon rules all apply from the deploy, whether or not the file has run.

**Tested in Docker** (postgres:16, `supabase/tests/rls/pricing_owner_package.test.sql`):
- it ran twice;
- both its own verify and the `_verify` section passed;
- a re-run touches no row;
- without its prerequisite it stops.

It has not run on any real database yet.

**Prerequisite:** `20261026_10_billing_cycles.sql`. It ran on prod on 2026-10-26. If it has not run, the file stops and tells you, and changes nothing.

---

## Step 1: the SQL (SQL editor)

1. On your PC, the file is
   `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-10-30_pricing\10_ANY_TIME_20261030_16_pricing_owner_package.sql`.
   - On the server, after `git pull`, it is `/www/wwwroot/nzamy/latest-nzamy-full/SQL_batch_2026-10-30_pricing/10_ANY_TIME_20261030_16_pricing_owner_package.sql`.
   - It is the same file as `supabase/migrations/20261030_16_pricing_owner_package.sql`.
2. Open the Supabase dashboard → **SQL Editor** → New query. Paste the whole file and press **Run**.
3. The SQL editor hides NOTICEs, so the file ends with two SELECTs. **Send us their result (screen output, not a file):**
   - **7 rows of `subscription_plans`:**

     | id | monthly | quarterly | semiannual | yearly |
     |---|---|---|---|---|
     | consultant-independent | 399 | null | null | 3990 |
     | firm-basic | 990 | 2990 | 5490 | 9900 |
     | firm-enterprise | 1490 | 4490 | 8190 | 14900 |
     | ind-ai | 29 | 79 | 149 | 249 |
     | ind-litigation | 399 | null | null | 3990 |
     | ind-preventive | 149 | null | null | 1490 |
     | lawyer-pro | 399 | null | null | 3990 |

   - **The NEWCLIENT row**, with `first_paid_order_only` = `true`. If there is no NEWCLIENT row, the result is empty, and that is fine.
4. If it says `ERROR`, send the error and stop. Nothing changed: the file runs in one transaction.

## Step 2: deploy

Deploy as usual, after the merge. There are no new npm packages in this batch.

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull && nohup bash deploy.sh > /root/deploy-20261030.log 2>&1 &
```

```bash
tail -f /root/deploy-20261030.log
```

## Step 3: `_verify` by hand (server, after both)

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "20261030|ERROR"
```

**Send us** the line `_verify: 20261030_16 OK — …` (screen output).

## Rollback

The rollback statements are in the file's header. They restore 39 / 390 for ind-ai, remove the firms' quarterly and half-yearly prices, and remove the NEWCLIENT stamp. The code does not need them: it charges the price book either way.
