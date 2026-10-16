# 2026-10-17 owner-free batch: one SQL run order and one deploy

Five pieces merged together. Each piece's own run-order doc (`2026-10-17-p1…p4-run-order.md`) has the details, the outside checks and the rollback SQL. This page is the single order to follow.

**Who runs what:** you run every SQL file in the Supabase SQL Editor on `auth.nezamy.sa` (signed in as `postgres`). Paste the whole file and click Run. Each file is idempotent and ends with `verify: OK`; a failed verify rolls the whole file back.

**Merged tree checks:**
- 2,435/2,435 unit tests on Node 22; type-check clean; lint 0 errors.
- The ten Docker database tests for the new SQL pass, each migration run twice where its test says so.
- All 24 `_verify.sql` blocks parse in Postgres.
- A webpack production build compiled every page. Its route type check flagged 7 files that are unchanged from live; 3 of them were real (Next 16 Promise params) and are fixed in 375d2a2f. The other 4 are extra exports that the Turbopack build on the server accepts.

## Step 1: SQL before the deploy (one at a time, in this order)

| # | File | What it does | Piece |
|---|---|---|---|
| 1 | `20261017_10_profiles_national_address.sql` | Optional national address for invoices (owner ٥٦/٥٧); only the person and admins read it | p1 |
| 2 | `20261017_30_business_delegations.sql` | The company's delegation register; a registered delegate may edit company data (owner ٣٦, ٥); the company can no longer overwrite the admin console's feature flags | p3 |
| 3 | `20261017_31_firm_reviews_opt_in.sql` | Firm reviews public only after the firm opts in (owner ٢٠) | p3 |
| 4 | `20261017_41_notes_visibility_case_team.sql` | Notes private by default; share with the case team or the whole firm (owner ١٦٩) | p4 |
| 5 | `20261017_44_test_accounts_never_listed.sql` | Test accounts never listed anywhere public (owner ١١٥). **After 4** | p4 |
| — | `20261017_21_library_fts_statistics.sql` | **Optional**, any time: better estimates for rare search words | p2 |

Why before: the new code reads `national_address`, the delegation register and the review opt-in. If the code goes first, the delegation and firm-review pages show "not enabled yet" until the SQL runs (nothing breaks).

## Step 2: deploy

```bash
cd /www/wwwroot/nzamy/latest-nzamy-full && nohup bash deploy.sh > /root/deploy-$(date +%F).log 2>&1 &
```

```bash
tail -f /root/deploy-$(date +%F).log
```

No new dependency, so no `npm install`.

## Step 3: SQL after the deploy

6. `20261017_20_library_search_principles_page.sql`: the precedents search gets a 4-second limit inside the database (plan N18).
   - It runs after the deploy so it can be checked at once: the developer searches «الدعوى» and «تعويض» right after.
   - If the precedents section shows as unavailable twice in a row, roll back with the one line in `2026-10-17-p2-run-order.md` (Rollback). The site returns to today's query.
   - Optional check on the Supabase server: `docker compose images rest` shows PostgREST **v12 or later**. On older versions the limit simply does not apply (same as today).

## Step 4: `_verify.sql`

7. `supabase/migrations/_verify.sql`, copied fresh. Seven new sections at the end (`20261017_10`, `_20`, `_21` optional notice, `_30`, `_31`, `_41`, `_44`).

## Held: needs the owner first

- `supabase/one-time/2026-10-17_q102_page_numbered_documents.sql` labels 81 page-numbered documents «دليل إرشادي / تنظيم إداري» (owner ١٠٢).
  - Run it only after the owner reviews the list in `2026-10-17-q102-page-numbered-documents.md` (owner question ٢١١).
  - Until the parser accepts the new type, his next library upload would undo it.
- Owner ٤٣ (role matrix) is not built: question ٢١٠ asks which team it means. A draft for reading (ب) is parked on the local branch `hold/p4-43-firm-role-matrix`.

## What users will notice

- Test lawyer and test accounts disappear from the lawyer directory and «أكثر المجيبين».
- Platform admins no longer read lawyers' private notes. A firm owner sees "case team" notes only if added to the team.
- Firm reviews are hidden until the firm opts in.
- Disabled buttons look disabled everywhere; some show the reason.
- Date fields on the lawyer and firm dashboards use the new Hijri/Gregorian picker; the stored dates are unchanged.
