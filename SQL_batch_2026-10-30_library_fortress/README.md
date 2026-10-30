# Library fortress (owner note ١٣, 2026-10-30): your steps

> **APPLIED ON PROD 2026-10-31** (by the user, SQL editor). SELECT check returned one row, all seven columns `true`. Do not list it as pending at integration; re-running is harmless.

One SQL file. It adds the per-user library document quota and the library-only security lock
(`public.library_read_quota_docs`, `public.library_security_locks` and three service-role functions).
It never touches accounts, subscriptions or library content. Safe to run twice.

**Order: any.** The code degrades safely while the file is not applied — the proxy and the status route treat a missing
function as "no quota, no lock", so the library keeps working exactly as today. The quota and the locks start working the
moment the file has run (no redeploy needed after it). Recommended: run it right after the deploy of this branch.

## Step 1: the SQL (Supabase SQL editor)

File (after the branch is merged into main):

`D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_80_library_read_quota.sql`

1. Supabase dashboard → **SQL Editor** → New query.
2. Paste the whole file and press **Run**. It ends with a check that raises an error if anything is wrong, then a SELECT.
3. The SELECT at the bottom must show **one row, every column `true`**:
   `locks_table | quota_table | quota_fn | lock_create_fn | lock_lift_fn | locks_hidden_from_users | quota_fn_service_only`
4. If you need to run the check again on its own:

```sql
select
  to_regclass('public.library_security_locks') is not null                         as locks_table,
  to_regclass('public.library_read_quota_docs') is not null                        as quota_table,
  to_regprocedure('public.library_read_quota_hit(uuid,text,int,int,int,int)') is not null as quota_fn,
  to_regprocedure('public.library_security_lock_create(uuid,uuid,text,timestamptz)') is not null as lock_create_fn,
  to_regprocedure('public.library_security_lock_lift(uuid,uuid,text,boolean)') is not null as lock_lift_fn,
  not has_table_privilege('authenticated', 'public.library_security_locks', 'SELECT') as locks_hidden_from_users,
  not has_function_privilege('authenticated', 'public.library_read_quota_hit(uuid,text,int,int,int,int)', 'EXECUTE') as quota_fn_service_only;
```

Send us that row. If it says `ERROR`, send the error and stop.

## Step 2: the server env (check only)

The proxy calls the function with `SUPABASE_SERVICE_ROLE_KEY` from
`/www/wwwroot/nzamy/latest-nzamy-full/.env.local` — the same key every service-role route already uses. Nothing to add;
if it were missing, the quota would simply stay off (fail open).

## Step 3: ops items for later (not this file)

- **C02** — before any `revoke` on the `library` schema, run the read-only listing in
  `docs/audits/2026-10-30-owner-package-library-fortress.md` (section C02) and send us the result.
- **C08** — firewall the origin to Cloudflare's ranges and restore the visitor IP in nginx (same doc, section C08).

The Docker test that proves this file: `supabase/tests/rls/library_read_quota.test.sql`
(`bash supabase/tests/rls/run.sh <migration> <migration> <test>`), run 2026-10-30: ALL PASS.
