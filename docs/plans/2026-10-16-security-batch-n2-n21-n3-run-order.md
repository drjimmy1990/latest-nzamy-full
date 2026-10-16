# Security batch N21 / N2 / N3: SQL run order and deploy steps

**Plan items:** `docs/plans/2026-10-16-fix-and-build-plan.md` §2 — N21, N2, N3.

**Who runs what:**
- **You** run every SQL file, in the Supabase SQL Editor on `auth.nezamy.sa`, signed in as `postgres`.
- The owner runs nothing in this batch.
- Each migration is idempotent, so running one twice is safe.
- Each migration ends with a verify block. The block **raises an error and rolls everything back** if the result is wrong.

| File | What it does | When |
|---|---|---|
| `20261016_09_admin_policies_is_admin.sql` | N21: the sixteen admin policies that read `profiles` inline become `TO authenticated USING (public.is_admin())`; then anon loses SELECT on `profiles` | **Any time** (no code needed) |
| `20261016_10_lawyer_profiles_select_column_lock.sql` | N2: guests and signed-in users read only the 13 public columns of `lawyer_profiles` (no licence, rate, credit, contact or metadata through REST) | **After the deploy** |

**Order:** Step 1 any time → Step 2 deploy the code → Step 3 `20261016_10`. Steps 1 and 3 do not depend on each other.

---

## Step 1 (any time): N21 — `20261016_09_admin_policies_is_admin.sql`

Paste the whole file and click Run. It ends with
`NOTICE: 20261016_09 verify: OK — 16 admin policies TO authenticated via is_admin(); anon holds no privilege on public.profiles; …`.

What it checks before it revokes anything:
- **The guard.** If any policy in the database reads `public.profiles` and still applies to guests (one created after the 2026-10-10 dump, or one the list missed), the file stops with `20261016_09: these policies read public.profiles and apply to anon/PUBLIC — … : <names>` and changes nothing. Send me the names.
- **The live probe.** After the revoke, still inside the transaction, it runs `select 1 … limit 1` as `anon` on every table and view in `public` that a guest may read. A guest read that now fails with "permission denied for table profiles" rolls the whole file back.
  - Any other failure prints a NOTICE ("already fails for another reason — not caused by this file") and does not stop it.
  - If the editor session cannot `SET ROLE anon`, the probe is skipped with a NOTICE; the catalog checks still ran.

**After it:**
- Re-running `20260921_01_profiles_rls_lockdown.sql` is safe again (its header no longer says "do not re-run").
- `20261016_08` no longer expects anon to hold SELECT, so it can be re-run too.
- `_verify.sql` has a new last section: `_verify: 20261016_09 OK …`. Before this file runs, that section prints `_verify: 20261016_09 is not applied yet …` and passes.

**Check from outside (public anon key).** This must now answer `401` (42501), not `200 []`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "https://auth.nezamy.sa/rest/v1/profiles?select=id&limit=1"
```

And these guest reads must still answer `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "https://auth.nezamy.sa/rest/v1/platform_settings?select=key&limit=1"
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "https://auth.nezamy.sa/rest/v1/articles?select=id&limit=1"
```

Then open `/blog` and `/lawyers/browse` on the site.

**Rollback:** `grant select on public.profiles to anon;` (the guest still reads zero rows).

---

## Step 2: deploy the code

On the app server:

```bash
cd <app folder> && git pull && bash deploy.sh
```

- No dependency changed, so `npm install` is not needed.
- What changed: `GET /api/v1/profile` reads the lawyer's own `lawyer_profiles` row with the service role (keyed by the signed-in user's id). `PATCH` still writes with the user's session and reads the saved row back the same way. The old code works with or without Step 3; the new code does too.

## Step 3 (after the deploy): N2 — `20261016_10_lawyer_profiles_select_column_lock.sql`

Paste the whole file and click Run. It ends with
`NOTICE: 20261016_10 verify: OK — anon/authenticated read 13 public lawyer_profiles columns only; …`.

- **Not before the deploy.** The old profile route reads `select("*")` with the user's session, and its save returns every column. Both fail (42501) once this file runs, so until the new code is live every lawyer would see «تعذّر قراءة بياناتك المهنية» and could not save.
- It refuses to run until Step 0 of the 2026-10-16 batch (`20260922_03`) and `20261016_05` are in force; the error message says which.
- It revokes **SELECT only**. The lawyer's save list (the 21 columns of `20260922_03` + `show_hourly_rate`) is checked again in its verify block.
- Its verify block also refuses if any policy that reaches guests or signed-in users reads a locked column (that would break the whole table for them). It then reads every `public` table as `anon` and as `authenticated`; a "permission denied for table lawyer_profiles" rolls it back.
- `_verify.sql` gets a section for it: `_verify: 20261016_10 OK …`. Before the file runs, it prints `… is not applied yet …` and passes.

**Check from outside (public anon key).** These must now answer `401` (42501), not `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "https://auth.nezamy.sa/rest/v1/lawyer_profiles?select=license_number&limit=1"
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "https://auth.nezamy.sa/rest/v1/lawyer_profiles?select=*&limit=1"
```

This one must still answer `200`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $ANON" "https://auth.nezamy.sa/rest/v1/lawyer_profiles?select=user_id,slug,specialties&limit=1"
```

Then on the site:
- `/lawyers/browse` and one lawyer's public profile;
- as a test lawyer: `/dashboard/lawyer/profile`, `/dashboard/lawyer/profile/edit` (change the bio, save, reload), Settings → المهنة;
- `/community` (both tabs) and a question page that has a lawyer's answer.

**Never re-run after it** without re-running it: nothing in `supabase/migrations` re-grants SELECT on `lawyer_profiles`, but a self-host restore or any `GRANT ALL … TO anon, authenticated` does. `_verify.sql` names it.

**Rollback:** `grant select on public.lawyer_profiles to anon, authenticated;` (re-opens every column).

---

## Rule for the future (N20)

A self-host restore or any `GRANT ALL … TO anon, authenticated` re-opens these locks. `_verify.sql` says which one: its 20261016_09 section raises `anon holds a privilege on public.profiles again`. Re-run the file it names.
