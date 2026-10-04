# 06 — Live database probe, 2026-09-20

Read-only PostgREST probes against the live project (`.env.local` → the same project as `.env.vps`), run from the developer's machine. No writes, no logins, no service-role impersonation of a user.

## Probe A — service-role key (object existence; RLS bypassed)

| Object | HTTP | Code | Verdict |
|---|---|---|---|
| `service_requests.business_id` | 400 | `42703 column does not exist` | **`20260914_entity_memberships_and_business_requests.sql` NOT applied** |
| `court_cost_notices` | 404 | `PGRST205` | **`20260906_court_costs_and_firm_profile_fields.sql` NOT applied** |
| `case_disbursements` | 404 | `PGRST205` | same file, same verdict |
| `firm_profiles.cr_number` | 400 | `42703` | independent confirmation of the same file |
| `business_members` | 200 | — | table exists (`20260603_phase1_002_entities.sql` applied) |
| `profiles.nationality` | 200 | — | **`20260906_phase6_settings_out_of_browser.sql` APPLIED** |
| `lawyer_profiles.slug` | 200 | — | **`20260907_phase7_profile_services_reviews.sql` APPLIED** |
| `platform_settings.payments_gateway` | 200 | `{"status":"disabled","provider":null}` | **`20260916_enable_test_payment_gateway.sql` NOT applied** — the live gateway is correctly disabled |

## Probe B — anon key (RLS behaviour)

| Path | HTTP | Body | Verdict |
|---|---|---|---|
| `profiles?select=id,display_name&limit=3` | 200 | `[]` | RLS is **enabled** on `profiles` and anon matches no rows |
| `subscriptions?select=id,tier&limit=3` | 200 | `[]` | RLS enabled, anon blocked |
| `business_members?select=id&limit=1` | 500 | `42P17 infinite recursion detected in policy for relation "business_members"` | **recursion live** |
| `firm_members?select=id&limit=1` | 500 | `42P17 … for relation "firm_members"` | **recursion live on the firm too** |

## What this settles

1. **UAT-SEC-001 is an `authenticated`-scoped leak, not a public one.** Three hypotheses are now excluded: RLS is not disabled (a disabled-RLS table would return every row to anon, or `42501` if anon lacked `GRANT SELECT`); the offending policy is not `TO public USING (true)` (anon would have read rows); and it is not an `anon` grant problem. What remains is a permissive policy scoped to the `authenticated` role, created outside the migration chain. The dynamic-drop lockdown in WP-1 A handles it without needing to know its name; run the `pg_policy` read first anyway so the removal is recorded.

2. **UAT-TEAM-001 is confirmed live and the repo analysis is validated.** `20260903_phase2_clients_and_firm_membership.sql` is demonstrably applied (both later migrations, phase6 and phase7, are live), yet `firm_members` still recurses. That is exactly the prediction of appendix 01 §4: `20260903` replaced only the self-referential *co-members* policy and left the mutual `X_members ↔ X_profiles` cycle from `20260616_entities_setup_and_rls_fix.sql` intact. The error fires for the anon role too, so it is policy-evaluation-wide, not tied to a signed-in identity.

3. **Nothing has been applied to the live database since the 2026-09-15 UAT.** Every object that round found missing is still missing. The migration backlog is therefore exactly the three files listed below, not a moving target.

4. **The payment-gateway stub never reached the live database.** `20260916_enable_test_payment_gateway.sql` would have flipped `platform_settings.payments_gateway` to `{"status":"test","provider":"stub"}` via `on conflict do update`. The live value is `disabled`. Keep the file clearly marked staging-only so a future bulk apply cannot pick it up.

5. **Same-day filenames must be verified per file, never per date.** `20260906` is three files; one is applied (`phase6_settings`) and two are not (`court_costs`, `fix_subscriptions_rls`). With no `schema_migrations` table in this project, object probing is the only reliable inventory.

## Still unverified (needs a signed-in user token, or a `pg_policy` read)

- `subscriptions` write policies — the service role bypasses RLS and the anon role matches no rows, so neither probe can see whether `"users create own subscriptions"` / `"users update own subscriptions"` are still present. The 2026-09-15 evidence (`subscription-rls.json`, `persistedTier: "max"`) says they are. Treat `20260906_fix_subscriptions_rls_security.sql` as not applied until a post-fix re-test proves otherwise.
- `storage.objects` policies for the `documents` bucket — not reachable through PostgREST at all. The 2026-09-15 evidence stands: a permissive policy is live.
- The exact name and definition of the offending `profiles` policy — needs `select polname, polcmd, polroles::regrole[], pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'public.profiles'::regclass;` in the SQL editor.
