# 30-Oct owner package, merged (2026-10-31): your steps, in order

Everything from the 30-Oct package is now on `main` in one merge. This is the **only** list you need. The older per-branch READMEs (`SQL_batch_2026-10-30_*`) say the same things, one area at a time.

**Already done:** `20261030_80_library_read_quota.sql` (you ran it on 2026-10-31, all 7 columns `true`). Do not run it again.

**Renumbered at the merge:** four files were all called `20261030_10_…`. Now:
- finance keeps `20261030_10` (and `20261030_20`);
- accounts/firms is `20261030_12`;
- letterhead is `20261030_14`;
- pricing is `20261030_16`.

Every file below is new, adds only, and is safe to run twice. Each one runs in one transaction: if it says `ERROR`, nothing changed. Send us the error and stop.

---

## Step 1: the SQL, BEFORE the deploy (Supabase dashboard → SQL Editor, as postgres)

The files are in this folder on your PC (after `git pull` on main):

```
D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\
```

On the server they are in `/www/wwwroot/nzamy/latest-nzamy-full/supabase/migrations/`.

For each file: open it, copy all of it, paste into a new query, and press **Run**. The result appears on the screen (it is not a file). Send us each result.

| # | File | Expected result on the screen |
|---|---|---|
| 1 | `20261030_10_invoice_collections_atomic.sql` | `Success. No rows returned` |
| 2 | `20261030_20_create_invoice_atomic.sql` | `Success. No rows returned`, then run the **finance check** below |
| 3 | `20261030_60_catalogue_repealed_last.sql` | at most 2 rows (`catalogue_is_repealed`) |
| 4 | `20261030_65_library_grant_admin.sql` | one row, all `t` |
| 5 | `20261030_66_library_grant_reminders.sql` | one row, all `t` |
| 6 | `20261030_62_library_title_suggestions.sql` | one value `arabic_trigrams`, a non-empty list like `{0xb65356,…}`. If it shows `{}`, tell us («هل تقصد» stays silent then; nothing breaks) |
| 7 | `20261030_30_client_notes_archive.sql` | `t, 0, f, t, 0` |
| 8 | `20261030_50_stage_auto_deadline_guard.sql` | `No rows returned` (good: no duplicates). Then run `select indexname from pg_indexes where indexname = 'uq_deadlines_one_open_auto_per_stage';` and expect **one row** |
| 9 | `20261030_12_accounts_firms_owner_answers.sql` | one row: `0, t, t, t, t` |
| 10 | `20261030_14_branding_assets.sql` | then run the **letterhead check** below |
| 11 | `20261030_16_pricing_owner_package.sql` | the editor shows only the last result: one `NEWCLIENT` row with `first_paid_order_only = true`, or `No rows returned` if there is no NEWCLIENT coupon (both are fine) |

Files 1 and 2 **must** run before the deploy, or creating or collecting an invoice answers 503. The others may run before or after the deploy; running them all now keeps it simple.

**Finance check** (after file 2). Expect `t, t, f, t, t, f, t, t`:

```sql
select
  to_regclass('public.invoice_collections') is not null                                                           as collections_table,
  to_regprocedure('public.record_invoice_collection(text,uuid,bigint,text,bigint,text)') is not null              as collect_fn,
  has_function_privilege('authenticated', 'public.record_invoice_collection(text,uuid,bigint,text,bigint,text)', 'EXECUTE') as collect_open_to_browser,
  has_function_privilege('service_role',  'public.record_invoice_collection(text,uuid,bigint,text,bigint,text)', 'EXECUTE') as collect_server,
  to_regprocedure('public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)') is not null as create_fn,
  has_function_privilege('authenticated', 'public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)', 'EXECUTE') as create_open_to_browser,
  has_function_privilege('service_role',  'public.create_lawyer_invoice(uuid,text,bigint,text,text,uuid,text,text,text,text,text)', 'EXECUTE') as create_server,
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'payments_create_key_key')        as one_invoice_per_form;
```

**Letterhead check** (after file 10). Expect `t | t | t | 1 | t`:

```sql
select to_regclass('public.branding_assets') is not null              as table_exists,
       (select relrowsecurity from pg_class
         where oid = 'public.branding_assets'::regclass)              as rls_on,
       not has_table_privilege('authenticated', 'public.branding_assets', 'INSERT')
         and not has_table_privilege('authenticated', 'public.branding_assets', 'UPDATE')
         and not has_table_privilege('authenticated', 'public.branding_assets', 'DELETE') as sessions_read_only,
       (select count(*) from pg_policy
         where polrelid = 'public.branding_assets'::regclass)         as policies,
       exists (select 1 from storage.buckets
                where id = 'branding-files' and public = false
                  and file_size_limit = 5242880)                       as private_bucket;
```

If the last column (`private_bucket`) is `f`, the editor was not allowed to create the storage bucket. Tell us; the bucket `branding-files` (private, 5 MB, pdf/docx/png/webp) is then created as `supabase_admin`.

---

## Step 2: deploy (server terminal)

No new npm packages in this batch.

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && git pull origin main && nohup bash deploy.sh > /root/deploy-20261031.log 2>&1 &
```

```bash
tail -f /root/deploy-20261031.log
```

---

## Step 3: `_verify.sql` by hand (server, after the deploy; deploy.sh does not run it)

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 < supabase/migrations/_verify.sql 2>&1 | grep -E "_verify: 20261030_|ERROR"
```

Expect `20261030_10 OK`, `20261030_12 OK`, `20261030_16 OK` and `20261030_20 OK` (screen output), and no `ERROR`.

---

## Later, not needed for this deploy

- **CAPTCHA on login.** It stays off until its key is set. Steps: `docs/security/captcha-turnstile-operator-guide.md`. Do it in that guide's order: the site key and a deploy first, the Supabase switch last.
- **The new AI tools** (L12 الرأي الفصل, L13 محترف العقود, L14 الصائغ القانوني) ship switched off. Turn them on from the admin AI screen after the owner settles their prices.
- **n8n:** a daily schedule for `POST /api/v1/cron/library-grant-reminders`.
