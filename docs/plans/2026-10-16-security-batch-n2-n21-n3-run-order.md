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
- as the same test lawyer: switch the dashboard mode in Settings, then check the server log has no `display_mode mirror failed`. The Docker tests prove the SQL; this checks how PostgREST builds the `RETURNING` for a save with `select=user_id` and for this `count: "exact"` update under column grants;
- `/community` (both tabs) and a question page that has a lawyer's answer.

**Never re-run after it** without re-running it: nothing in `supabase/migrations` re-grants SELECT on `lawyer_profiles`, but a self-host restore or any `GRANT ALL … TO anon, authenticated` does. `_verify.sql` names it.

**Rollback:** `grant select on public.lawyer_profiles to anon, authenticated;` (re-opens every column).

---

## N3 (library-only subscription grants `pro`): not built — waiting on the owner

**Re-verified 2026-10-16 against HEAD:**
- Approving a `library` request grants a plan tier the admin picks; the console defaults it to `pro` (`dashboard/admin/entitlements/requests/page.tsx`).
- An admin library invitation code grants `pro` for 30 days (`REDEEM_TIER`, `api/v1/library/invitations/redeem`).
- `pro` unlocks every tool gate (`ai-wargaming`, `health-check`, `finance`, `cases-unlimited`).
- Still open.

**Impact (grep; the gitnexus index is 226 commits stale and its database fails on WAL replay this session, so the tool returned nothing):**
- `getUserTier` → **HIGH**:
  - Called directly by `library/enactments`, `library/laws/[slug]`, `library/monitor` and `dashboard/summary`.
  - Through `access-control.ts` it feeds `checkAccess`, `checkLibraryAccess`, `getLibraryAccessForUser`, `checkCreditBalance` and `checkTierLimit`.
  - Through those, it gates seven library routes and every paid gate.
- `grantEntitlement` has 4 callers: admin grant, admin request approve, invite accept and library invitation redeem.
- `can("library-full-access")` in the browser reads `user_metadata.tier` (`useUser` → `useSubscription` → `featureAccess`). Six places use it: the laws, precedents and fiqh tabs, the article reader, `/laws/subscribe` and `InvitationBanner`.

**Why it stops here:**
- `subscriptions.plan_id` is a NOT NULL foreign key to `subscription_plans`, and live has no library plan row. Its tier CHECK allows only `free/ai/pro/corp/max`.
- A separate library entitlement therefore needs library plan rows with names, prices and periods. The pricing page has `lib-q1` 1,500/3 months, `lib-q2` 2,750/6 months, `lib-annual` 5,000/year and `lib-firm-*`; `plans.ts` uses different ids. The quarterly and half-year plans fit neither `price_monthly` nor `price_yearly`. A zero-priced placeholder would show a false price.
- A few behaviours are not owner-stated:
  - what the library plan includes (the card promises «بحث بالذكاء الاصطناعي»);
  - what the codes and colleague invites grant;
  - what to do with live `pro` grants made for library requests.
- These are questions ١٩٩–٢٠٥ in `أسئلة_المالك_٢٠٢٦-١٠-١٦.md`. Each has a default.

**Design once answered (no change to `getUserTier` needed):**
1. **Migration:**
   - add `library` to both tier CHECKs;
   - insert the library plan rows the owner confirms;
   - verify that `effectiveTier` ignores `library` rows. `tierRank` returns -1 for a tier missing from `TIER_RANK`, and `currentPlanRow` drops rank < 0, so a `library` row never unlocks a tool.
2. **`grantEntitlement`:**
   - add an action `library` that writes a `tier = 'library'` row;
   - limit both the downgrade guard and the cancel-all step to their own track (`library` rows vs tool rows), so neither grant cancels the other;
   - stamp `user_metadata.library_until`, never `tier`.
3. **`checkLibraryAccess` / `getLibraryAccessForUser`:** full access = tool tier ≥ `pro` **or** a running `library` row. One query reads both.
4. **Callers:**
   - approving `library` requests uses the new action, with the duration from `requested_ref`;
   - the library invitation redeem uses it too;
   - the console hides the tier picker for library requests.
5. **Client:** `useUser` exposes `libraryUntil`, and `featureAccess` resolves `library-full-access` from it as well as from the tier.
6. **Display:** the profile and dashboard show the library subscription next to the tool plan.

---

## Rule for the future (N20)

A self-host restore or any `GRANT ALL … TO anon, authenticated` re-opens these locks. `_verify.sql` says which one: its 20261016_09 section raises `anon holds a privilege on public.profiles again`. Re-run the file it names.
