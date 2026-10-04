# The 2026-09-22 critical batch — execution log

**Branch:** `main` (working tree; not committed at the time of writing).
**What it implements:** the six CRITICAL items of [`docs/audits/2026-09-21-post-profiles-review.md`](2026-09-21-post-profiles-review.md) that need no owner decision — **A1, A2, A3, A4 (+F13), A5, A6** — plus **B3** and the re-invite half of **B12**, which A5 could not be shipped without.
**New migrations (APPLIED on production 2026-09-22 by the developer via the SQL Editor; 01 verified live by REST — anon SELECT on `library.article_regulations` 200, the public-prosecution law returns 30/30 articles):** `20260922_01_library_grants.sql` · `20260922_02_members_accept_own_invitation.sql` · `20260922_03_lawyer_provider_column_grants.sql`. Apply order and the deploy-order cliffs are in §Apply order.
**Not in this batch:** the seventh critical item is the incident response of A1/A2 (§Incident), which is operational, not code; B1–B17 **except B3**, C1–C4, B18 (CI), B19 (the owner's ZIP folder), B20 (`deploy.sh db push`) stay open.

---

## Context: what happened between 2026-09-05 and 2026-09-21

Three commits landed on `main` after our last one (`17a81b9`, 2026-09-05):

| Commit | What it is |
|---|---|
| `fbf9c58` | The owner's technical package (`nzamy-developer-test-نهائي-2026-09-20/web/`) copied over `main`: 371 files, 17 new migrations, library parsers/seeder rewrite, PWA, academy. |
| `3e2f5db` | The profiles fix batch (WP-0..WP-7): 192 files, migrations `20260921_01..04`, auth/session rework, business members API, dashboards, settings tabs. |
| `8727d2d` | `_verify.sql` storage-policy gate by content. |

15 migrations were applied to production on 2026-09-21 and the code was deployed. Our read-only review of the result (2026-09-21, 131 agents, every finding double-verified) confirmed **55 defects, 7 critical**. This batch closes the six that need no owner decision.

---

## Incident (contained 2026-09-21 — operational, not code)

A test-admin password was committed in the **public** repo (`scripts/simulate_human_*.py`, pushed at `fbf9c58`), and production held **146 synthetic `@nzamy.test` accounts** from four UAT runs, four of them `user_type = admin`.

Already done by the developer on 2026-09-21:

* the 47 accounts sharing the leaked password had their passwords rotated;
* the 4 test admins were banned.

**No real user account or data was touched.** What remains is in §What the developer still has to do: removing all 146 test accounts with the new teardown script, dry run first, after the owner's current test round is over.

---

## A1 · No credential in the nine simulation scripts

**What.** `scripts/simulate_human_{admin,client,corporate,firm,government,lawyer,micro,ngo,provider}.py` no longer carry any password. Each reads `os.environ["UAT_PASSWORD"]` and exits 2 with a plain message when it is unset. The target defaults to `http://localhost:3000`; production requires **both** `--live` (an `argparse` flag) **and** `UAT_ALLOW_LIVE=1` in the environment — without the variable the flag is refused and the run falls back to localhost. The hard-coded `C:\Users\Judge\.gemini\...` screenshot mirror became the optional `UAT_BRAIN_SCREENSHOTS_DIR`.

**Why.** Review A1 (C02), CRITICAL: the literal `UNIVERSAL_PASSWORD` plus `LIVE_BASE_URL = "https://nezamy.sa"` was served by a public GitHub repo, and the account it opened was a live production admin.

**Files.** The nine `scripts/simulate_human_*.py`.

**Tests.** None (operator scripts, no test harness). Verified by grep: no plaintext password remains anywhere under `scripts/` — the only `Uat!` occurrence left is `scripts/uat/seed-actors.ps1:128`, which *generates* a random password at runtime.

**Migration validation.** n/a.

**Leftovers.** The default *e-mail* `admin.uat-20260915-full@nzamy.test` is still a literal (overridable with `UAT_ADMIN_EMAIL`); an address is not a credential and the account is banned. Rotation was mandatory and is done; **rewriting git history was not attempted and is not sufficient on its own.** Whether the repo should be public at all is an owner decision (review A1 step 3).

---

## A2 · The UAT PowerShell scripts cannot touch production by accident

**What.**

* New `scripts/uat/_env.ps1`, dot-sourced by all 13 scripts, replacing each one's private `.env.local` parsing. `Get-UatEnv` parses the env file (`NZAMY_UAT_ENV_FILE`, else `../../.env.local`) and derives the Supabase project ref from `NEXT_PUBLIC_SUPABASE_URL`. `Assert-UatProject` then **refuses any project ref not listed in `NZAMY_UAT_PROJECT_REFS`**. With `-AllowWrites` it additionally hard-denies the production ref (`gdqfqfcxnwrwgaphtfhu`, held in a PowerShell `Constant` so a caller cannot reassign it) unless the caller passes `-IUnderstandThisIsProduction` **and** `NZAMY_UAT_ALLOW_PRODUCTION=1` is set, in which case it prints a red banner and continues. Every refusal writes to stderr directly and `exit 3` (never `Write-Error`, which under `$ErrorActionPreference = 'Stop'` would terminate before the exit statement).
* New `scripts/uat/teardown-actors.ps1` (490 lines): the teardown `seed-actors.ps1`'s own header had promised. **Dry run by default** — it only SELECTs and prints per-table counts plus the first 20 ids; `-Execute` deletes. It selects `auth.users` by `@nzamy.test` **or** `user_metadata.uat_run`, then derives the synthetic *entity* set from `owner_user_id` membership in that user set, because `seed-actors.ps1` adopts trigger-created entity rows that carry no tag of their own. Deletion order is FK-safe: the `ON DELETE SET NULL` / `RESTRICT` children (`court_cost_notices`, `case_disbursements`, `cases`, `contracts`, `service_requests`, `support_tickets`, `invitations`, `lawyer_clients`) are removed explicitly, children before parents, **before** the auth users — deleting the user first would null the identifying FK and turn them into unreachable orphans. Storage objects are cleaned too, and the run emits a JSON summary.
* New `scripts/uat/README.md`.

**Why.** Review A2 (C03, F05), CRITICAL: every `scripts/uat/*.ps1` read `.env.local`, which **is** production, with a presence check as the only guard; six of them write with the service-role key.

**Files.** `scripts/uat/_env.ps1` (new) · `scripts/uat/teardown-actors.ps1` (new) · `scripts/uat/README.md` (new) · the 13 existing `scripts/uat/*.ps1` (guard wired in; `seed-actors.ps1` also carries its PS7-compat + `email_exists` retry fix).

**Tests.** None automated. The dry-run mode is the test: it is what the developer runs first.

**Migration validation.** n/a.

**Leftovers.** A real second Supabase project for UAT does not exist yet; until it does, **no `verify-*.ps1` may run against the production project**, and the allow-list is what enforces that. The 146 synthetic accounts are still on production — see §What the developer still has to do.

---

## A3 · Free self-service Pro is closed, on all three doors

**What.**

1. **`POST /api/v1/invite/sync` deleted** (`src/app/api/v1/invite/sync/route.ts`, 131 lines). It let any authenticated caller write up to 20 self-chosen invitation codes with the **service-role client**, `tier: null`. It had zero callers — its only client, `invitationStore.ts`, was deleted on 2026-09-05.
2. **`POST /api/v1/invite/[code]/accept` gained three guards.** `inviter_id` is now selected and compared: a code you created yourself is refused **403** («لا يمكن قبول دعوة أنشأتها بنفسك»). A row with **no `inviter_id`** is refused **400** — deliberately written as a separate check rather than `row.inviter_id && …`, which would let a NULL skip the comparison. A row whose **`tier` is NULL or not in `VALID_TIERS`** is refused **400**; it used to silently become `"pro"` for 14 days.
3. **`grantEntitlement` no longer downgrades.** The plan branch used to cancel *every* active subscription before inserting, so a 14-day invite trial destroyed a live paid plan. The decision moved to the new pure module `src/lib/entitlementGrantRules.ts` (`planGrantDecision`): a **higher-ranked** active row is never traded for days whatever its expiry; at the **same rank** the longer window wins; a **lower-ranked** row is replaced (a real upgrade). A NULL `current_period_end` on an active row is treated as `+Infinity` (protect) rather than 0 (cancel). When the grant is skipped the result carries `alreadyEntitled: true` and the kept row, and the user's `auth` metadata `tier` is stamped to the tier they **keep**, never the lower requested one.
   The ranking is `TIER_RANK`, now `export`ed from `src/lib/access-control.ts` and **injected** into the rules module, because that module must stay loadable by `node --test` (the `@/lib/...` alias does not resolve outside the bundler). The hand-maintained mirror table that used to live in the rules file, and the source-parsing drift test that policed it, are both gone — there is one tier ranking on the server again.
4. **Callers handle the skip.** `POST /api/v1/admin/entitlements/grant` passes `replaceActive: true` unconditionally and is the **only** caller that does: granting `free` there is the admin's only revoke button, so a silent no-op behind the console's success toast would be the worse lie. It is not read from the request body — the console sends no such field, so a passthrough flag would have left exactly that no-op in place. `PATCH /api/v1/admin/entitlements/requests/[id]` deliberately does **not** pass it (nobody requests a downgrade, and its page defaults the tier selector to `pro`, so approving a max-holder's library request would otherwise cancel that subscription); it marks the request approved either way but tells the requester «حسابك يحمل بالفعل هذه الباقة أو أعلى منها، فلم نغيّر اشتراكك الحالي» instead of «تم تفعيل ما طلبته على حسابك», and returns `alreadyEntitled` in the body. `POST /api/v1/invite/[code]/accept` answers **400** with the Arabic explanation and leaves the invitation **pending** — the code stays redeemable once the better plan lapses. `POST /api/v1/library/invitations/redeem` does the same and **refunds the slot it already burned off `current_uses`**, through the compare-and-swap helper `refundClaimedUse` (only writes `current_uses - 1` if the counter still holds the value this claim advanced it to, so a concurrent redeemer's use is never clobbered).

Every refusal is a **non-2xx with an Arabic `error`**, because `src/app/invite/[code]/page.tsx` sets `accepted` on any ok response without reading the body and would print «تجربتك مفعّلة!» over a grant that was never written.

**Why.** Review A3 (C01), CRITICAL and live: two POSTs were a renewable free Pro, and the rows were stamped `method: "admin_grant"` so they looked legitimate in the admin console.

**Files.** `src/app/api/v1/invite/sync/route.ts` (**deleted**) · `src/app/api/v1/invite/[code]/accept/route.ts` · `src/lib/entitlements.ts` · `src/lib/entitlementGrantRules.ts` (new) · `src/lib/access-control.ts` (`TIER_RANK` exported) · `src/app/api/v1/admin/entitlements/grant/route.ts` · `src/app/api/v1/admin/entitlements/requests/[id]/route.ts` · `src/app/api/v1/library/invitations/redeem/route.ts`.

**Tests.** New: `src/lib/entitlements.test.ts` · `src/app/api/v1/invite/[code]/accept/route.test.ts` · `src/app/api/v1/admin/entitlements/grant/route.test.ts` · `src/app/api/v1/admin/entitlements/requests/[id]/route.test.ts` · `src/app/api/v1/library/invitations/redeem/route.test.ts`.

**Migration validation.** No migration.

**Leftovers, stated because they are not wins.** Refusing a NULL `inviter_id` closes **nothing** of the `invite/sync` hole — that route wrote `inviter_id: user.id` and it was `tier` it left NULL (guards 2 and 3 are what close it). Per the DDL the only producer of a NULL inviter is the FK `on delete set null` (`20260706_content_and_ops.sql:115`), i.e. a **real pending invitation whose inviter deleted their account**. Those invitations now die. That is the accepted cost of the review's mandated refusal; such rows must not be reasoned about as junk and must not be purged. Separately, `public.invitations` still has **no writer** — who may create an invitation and what it grants is owner question ٢١.

---

## A4 + F13 · Law pages serve their articles again, and the regulation paywall is real

**What.**

*The migration* `supabase/migrations/20260922_01_library_grants.sql`: `grant select` on `library.article_regulations` to `anon, authenticated` and `grant all` to `service_role`; the same table gains `enable row level security` **and** an `"Allow public read on library.article_regulations"` policy, matching the 17 sibling content tables (`20260730` created it with neither — the only library content table in that state); guarded grants on `library.cross_section_search` and `library.v_laws_enactment_status`; the three `20260626` schema-wide grants re-run as a catch-all; and **`alter default privileges in schema library`** so the next object created there cannot silently blank a page again. Its verify block asserts the grants with `has_table_privilege`, asserts the read policy exists (a table with RLS on and no policy returns **zero rows with no error** — byte-for-byte the outage being closed), and counts default-ACL grantees with `count(distinct rolname) … < 2`, never `count(*) <> 2`: `pg_default_acl` holds one row per grantor, so an equality test would raise on a database that is *more* correctly granted and roll the whole grant back.

*The route* `src/app/api/library/laws/[slug]/route.ts` now destructures and checks `error` on **both** the chapters query and the articles query, logs the code/message/details, and answers **500 with an Arabic message** instead of a 200 with an empty law. (The chapters guard matters for the same reason: a failed chapters query arrives as `null`, `(chapters || [])` yields zero chapters, and the ungrouped-articles fallback does not rescue it because it only fires when articles carry no `chapter_id` at all.) The remaining English bodies were Arabized too — «لم يُعثر على هذا النظام» (404) and «تعذّر تحميل هذا النظام» (catch-all).

*F13, in the same commit:* the flat «اللائحة وحدها» view used to emit the full `r.text` of every regulation row for every article, never consulting `hasFullAccess`/`freeLimit`. It now evaluates `isArticleLocked` per parent article and **omits** (never truncates — a truncated regulation is still paid text in the clear) the regulation articles hanging under a locked one, counting them into the new response field `regulationInstrumentsLocked`. `src/app/laws/[slug]/page.tsx` maps that field through, keeps the regulation **tab** reachable when the count is > 0 (a law whose every regulation-bearing article sits past the free limit would otherwise lose the entry point, not just the content), and renders a lock card with the count and a «اشترك للوصول» button.

**Why.** Review A4 (F01), CRITICAL and live: `GET /api/library/laws/public-prosecution-law` was measured on 2026-09-21 returning 200 with `articles: 0` while the database holds 30 articles for that law. PostgREST fails the **whole** embedded query when any embedded relation is unreadable, and `error` was never read. F13 was masked by A4 — the moment the grant lands, every anonymous visitor would read the full executive-regulation text for free.

**Files.** `supabase/migrations/20260922_01_library_grants.sql` (new) · `src/app/api/library/laws/[slug]/route.ts` · `src/app/laws/[slug]/page.tsx` · `src/app/laws/data.ts` (the `regulationInstrumentsLocked` field on the type).

**Tests.** New `src/app/api/library/laws/[slug]/regulation-paywall.routes.test.ts`.

**Migration validation.** The migration's own verify block; a gate in `supabase/migrations/_verify.sql` that raises «…and EVERY law page is serving 0 articles with HTTP 200» when the grant is absent, plus gates for `service_role` write, the RLS policy, and the two other objects; and the file is in `supabase/tests/rls/rehearse-staging-order.sh`.

**Leftovers — an owner decision the migration states in capitals.** This grant does **not** close the paywall at the data layer. `library` is an **exposed PostgREST schema** reached with the public anon key, so `GET {SUPABASE_URL}/rest/v1/article_regulations?select=text` with `Accept-Profile: library` returns every regulation text regardless of F13. This is neither new nor specific to this table — `library.articles` has carried the identical grant and read policy since `20260626`, so statutory article text is already readable the same way — and the grant is **required** for any law page to render at all. But it means F13 closes a **UI-layer** paywall, not a data-layer one. Closing it for real means serving the corpus through a service-role route with no anon grant, or a row-level "free preview" flag: an owner decision, not a migration. Also: schema `library` is now **public-read by default**, so any future per-user table put there **must** carry its own RLS policies, exactly as `library.smart_folders` / `invitations` / `issue_reports` already do — a grant alone will not protect it.

---

## A5 · A company or firm roster is consented now, not imposed

**What.**

*The routes.* `POST /api/v1/business/members` and `POST /api/v1/firm/members` insert `status: 'invited', accepted_at: null` (they used to insert `status: 'active', accepted_at: now()`) and **notify the invitee** through `recordNotification`, addressed to the dashboard their account type actually lands on (`inviteeDashboardHref`: lawyer → `/dashboard/lawyer`, corporate → `/dashboard/business`, else `/dashboard/client` — a lawyer sent to the client dashboard would find no banner there). An `invited` row grants nothing: every membership read in the repo (`useUser`, `resolveActiveEntityIds`, `is_active_business_member`, `is_active_firm_member`, both roster GETs) filters `status = 'active'`.

*Answering.* New `GET /api/v1/me/invitations` (the caller's own pending invitations, newest first, with the entity name resolved by **one** service-client read of a single display column keyed to exactly the entity ids the RLS-scoped read returned — an invitee is not an owner, an active member or an admin, so they cannot read the entity name themselves, and «شركة ما تدعوك» is not a consent decision anybody can make). `entityName: null` means «we could not read it», never «unnamed»; a failed read is **500**, never `{ data: [] }`. New `POST /api/v1/me/invitations/[kind]/[id]/accept` and `…/decline`, sharing `src/app/api/v1/me/invitations/_answer.ts`. The write is **RLS-scoped** — no service client anywhere in that file — so the database, not the code, is what refuses somebody else's invitation. Decline is `removed`, not a DELETE, so the entity keeps a record and the row can be re-invited later.

*The migration* `supabase/migrations/20260922_02_members_accept_own_invitation.sql` adds, on all four `*_members` tables (`firm`, `business`, `government`, `ngo`), a fifth policy `"<x>_members: invitee can answer own invitation"` — `using (user_id = auth.uid() and status = 'invited')`, `with check (user_id = auth.uid() and status in ('active','removed'))`, no subquery and no inline entity read — plus a `BEFORE UPDATE` trigger `entity_member_invitation_answer_guard()`. The trigger exists because **RLS filters rows, not columns**, and `authenticated` holds PostgREST's table-level UPDATE grant: without it an invitee could accept as a role they were never offered, or move their invitation row onto a company that never invited them. On the invitee path it takes OLD wholesale as jsonb and lets exactly `status`, `accepted_at` and `updated_at` through. On the third-party path it enforces **the consent invariant** — a row may not be left `active` while `accepted_at` is null — and pins `accepted_at` so it cannot be forged in the same statement. The invariant is stated on the **resulting row**, not on one transition, so `invited → suspended → active` is refused too. Writes with `auth.uid() is null` (service role, cron, the `ensure_business_owner_membership` bootstrap trigger, whose `on conflict do update` does fire this trigger) and a member writing their own row are passed through.

*The screens.* New `src/components/dashboard/PendingInvitationsBanner.tsx`, mounted on `/dashboard/client`, `/dashboard/lawyer` and `/dashboard/business`. It renders nothing while loading (a dashboard must not flash a consent prompt), nothing when empty, an amber strip with «إعادة المحاولة» when the read failed, and one card per invitation with «قبول»/«رفض». Accepting does a full `window.location.reload()` — `useUser()` returns a session value and exposes no refresh, and joining an entity changes what the guards decide. No `localStorage`: an unanswered invitation lives in `*_members`.
The two team pages show `invited` rows as «دُعي في … — بانتظار القبول» with an explicit «بانتظار قبول الدعوة — لا يطّلع هذا الحساب على شيء من بيانات الشركة/المكتب قبل أن يقبل», no role menu and no «تعليق» — only «إلغاء الدعوة».

*The owner PATCH* (`…/members/[memberId]`, both entities) refuses `status: "active"` on a row whose `accepted_at` is null with **409** «لا يمكن تفعيل العضوية قبل أن يقبل المدعوّ الدعوة بنفسه» — 409 rather than 403, because the caller *is* allowed here, the row is simply not in a state this endpoint may activate. Without it the whole flow is decorative: POST an invitation, PATCH it to `active`, and the stranger is on the roster exactly as before — and the row then disappears from the victim's banner so they are never even shown it. Re-activating somebody who **did** accept and was later suspended still works: that row has an `accepted_at`.

*B3, which A5 cannot ship without.* `src/proxy.ts` Gate 2 decided on `profiles.user_type` alone, so an individual or lawyer who accepted an invitation was redirected away **before** the page — and therefore before `UserTypeGuard`, which already understood membership — ever rendered. The invitation could be accepted and lead nowhere. Gate 2 now calls `entityMembershipKindForPath(pathname)` (the same table the browser guard's membership arms read) **only after** the `allowedTypes` comparison has already failed, so nobody who belongs by type pays a round trip, and does one RLS-scoped read of `*_members` with `status = 'active'`, passing on a hit and **failing open on a read error** (stated, not assumed: all three layouts this branch can pass into carry a `UserTypeGuard` doing its own membership read, and RLS is what actually separates entities either way).

**Why.** Review A5 (F03), CRITICAL: a company owner who knew an e-mail address put that person on the roster, and from then on `20260914`'s policy «business members read business service requests» plus `/api/v1/service-requests` routed the victim's private consultations into the company feed. Anyone can register a corporate account today.

**Files.** `src/app/api/v1/business/members/route.ts` · `src/app/api/v1/business/members/[memberId]/route.ts` · `src/app/api/v1/firm/members/route.ts` · `src/app/api/v1/firm/members/[memberId]/route.ts` · `src/app/api/v1/me/invitations/route.ts` (new) · `src/app/api/v1/me/invitations/_answer.ts` (new) · `src/app/api/v1/me/invitations/[kind]/[id]/accept/route.ts` (new) · `…/decline/route.ts` (new) · `src/lib/services/invitationsService.ts` (new) · `src/components/dashboard/PendingInvitationsBanner.tsx` (new) · `src/app/dashboard/{client,lawyer,business}/page.tsx` · `src/app/dashboard/business/team/page.tsx` · `src/app/dashboard/firm/team/page.tsx` · `src/lib/services/businessMembersService.ts` · `src/lib/services/firmMembersService.ts` · `src/lib/auth/businessMembershipAccess.ts` · `src/proxy.ts` · `supabase/migrations/20260922_02_members_accept_own_invitation.sql` (new).

**Tests.** `src/lib/services/invitationsService.test.ts` (new, and it pins the banner's three mount sites) · `src/app/api/v1/me/invitations/route.test.ts` (new) · `src/app/api/v1/firm/members/[memberId]/route.test.ts` (new) · `src/proxy.membership.test.ts` (new, pins the path→kind table prefix by prefix) · updated `src/app/api/v1/business/members/route.test.ts`, `…/[memberId]/route.test.ts`, `src/app/api/v1/firm/members/route.test.ts`.

**Migration validation.** `supabase/tests/rls/members_accept_own_invitation.test.sql` (new, 497 lines) proves A1/A2 accept and decline, B an invitee cannot touch another user's row, C cannot change their own **active** row, D the column guard pins role/entity key/permissions/department, E `suspended` and back-to-`invited` are refused (42501), F the owner path from `20260921_03` is unchanged, G an `invited` row still grants **nothing** through `20260914`'s service_requests policy, **H the owner cannot answer for the invitee** including both walk-arounds, I the legitimate owner powers survive, and BOOT that `ensure_business_owner_membership` still works through the trigger. `supabase/tests/rls/entity_members_no_recursion.test.sql` was extended. The migration's own verify block asserts 5 policies per table, the named UPDATE arm, the attached trigger, **the guard's body** (checked by regex, because an earlier draft guarded only the invitee, so the function merely existing proves nothing), and 0 inline entity reads / 0 subqueries across all eight entity tables. Gates added to `_verify.sql`; file added to `rehearse-staging-order.sh`.

**Leftovers.**
* **Roster rows created before this batch stay as they are.** The migration is consent at *entry*; nothing backfills the rows the old code already wrote as `active` with `accepted_at = now()` and no consent. Whether to re-confirm them is **owner question ٢٢**.
* **An active member still cannot leave on their own.** The new UPDATE arm is gated on `status = 'invited'`, so self-departure stays owner-only. **Owner question ٢٣**.
* **B12 is half-closed.** Both POST routes now re-invite a `removed`/`suspended` row in place (PATCH back to `invited` with the new role, answered **200** instead of 201 — nothing was created), so a colleague who was once removed is no longer permanently unaddable. The team pages' own reactivate control for a `removed` row was **not** added: both pages still guard the suspend/remove buttons with `m.status !== "removed"`.
* **Re-apply hazard.** `20260921_03` opens by dropping every policy on the eight entity tables and its verify block asserts exactly 4 per `*_members`. If it is ever re-run it removes `20260922_02`'s policy, and `20260922_02` must be applied again after it.
* `government_members` and `ngo_members` got the same accept arm but have no roster route, so `/api/v1/me/invitations` deliberately does not list them.

---

## A6 · verification_status, credits, plans and seats can no longer be self-set

**What.** `supabase/migrations/20260922_03_lawyer_provider_column_grants.sql`: for each of **seven** profile tables, `revoke insert, update on public.<table> from authenticated, anon` at the **table** level, then `grant update (<columns>)` back. A column-level REVOKE alone is a **no-op** while the table-level grant exists — the same defect this repo already shipped at `20260917…:438` — and revoking UPDATE at the table level also drops every column-level grant the role held, so each GRANT below it is the complete, authoritative list and re-running can never accumulate stale grants.

The allowlists were derived from a documented `grep` sweep of every RLS-scoped writer in `src/` (the migration header reproduces the full output):

| Table | UPDATE granted on | Source of the list |
|---|---|---|
| `lawyer_profiles` | 20 columns | `lawyerFields` in `src/app/api/v1/profile/route.ts:454-480`, **plus `display_mode`** (the Phase-6 dashboard-mode mirror at `settings/preferences/route.ts:79-80`, which the review's draft list omitted and which would have started 42501-ing the day this landed), plus `updated_at` |
| `business_profiles` | 8 | `validateBusinessProfilePatch` (six identity columns) + `metadata` + `updated_at` |
| `firm_profiles` | 3 | `display_mode`, `metadata`, `updated_at` |
| `provider_`, `government_`, `ngo_`, `micro_profiles` | 2 each | `metadata`, `updated_at` — every settings field those types offer is `target: "entitySettings"`, i.e. inside `metadata->'settings'` |

Deliberately ungranted: `verification_status` on all six tables that have it, `credit_balance` / `credit_package` / `credit_expiry` / `free_briefs_remaining`, `active_roles`, `plan_id`, `annual_points_budget`, `points_spent`, `max_seats`, the statutory identity columns, `license_expiry` (which `profile/route.ts:475-477` itself names as out of scope), `user_id` and `created_at`. INSERT is revoked outright on all seven: signup rows are written by `handle_new_user` (SECURITY DEFINER) and the Google-claim path by the service client, and no browser-side insert exists.

**Why.** Review A6 (F04), CRITICAL: `"lawyers update own profile"` is row-scoped with no column list and `authenticated` holds the default table-level UPDATE, so `PATCH /rest/v1/lawyer_profiles?user_id=eq.<me> {"verification_status":"verified","credit_balance":999999}` succeeded. The review named `lawyer_profiles` and `provider_profiles`; **the same shape was open on the five other entity profile tables**, including the `verification_status` a firm owner could use to hand his own office the badge the admin verification queue exists to grant. Latent on the lawyer table only because production has 0 verified lawyers; the credit half is live.

**Files.** `supabase/migrations/20260922_03_lawyer_provider_column_grants.sql` (new).

**Tests.** `supabase/tests/rls/lawyer_provider_column_grants.test.sql` (new, 865 lines): T1–T18 across all seven tables and both roles. Its recorded Docker run is **78 PASS, 0 FAIL, 0 SKIP, exit 0** — with no skips at all, after `20260906_court_costs` was added to the chain on 2026-09-22 (it had been missing, which made T5 skip `bar_membership_number` and left the four firm statutory columns unexercised). Listing the migration twice in the chain is also green (78 PASS), i.e. idempotent. **Both negative controls were run and recorded:** dropping `20260922_03` from the chain stops the run at «T2 FAIL: L self-verified — A6/F04 is open»; substituting the pre-entity-tables draft gets all the way to «T12 FAIL: F wrote firm_profiles.verification_status», which is what proves T12–T18 are doing work.

**Migration validation.** The migration's own verify block, plus a `_verify.sql` gate that checks, per table, that `authenticated` **cannot** update each trust/money column, **can** still update each allowlisted one (an over-revoke would 500 a real write path), that no column outside the allowlist leaked, and that INSERT is revoked for both `authenticated` and `anon`. The gate also asserts `business_profiles.legal_rep_name` exists and explains why.

**Leftovers.** **Prerequisite:** `20260826_corporate_identity_persisted.sql` must be on production — it is the file that adds `legal_rep_name` / `legal_rep_capacity`, and `20260922_03` grants them **by name**, so without it the file dies on 42703 and rolls back whole. The grant is deliberately *not* made conditional: a grant that silently skips a column is exactly the "looked applied, was a no-op" failure this file exists to close. (Per the brief, `20260826` is already applied on production; this log records the dependency, it does not re-verify the live catalog.) The firm identity form is still unbuilt and must arrive **with its own grant**. B2 and B6 — the same table-level-grant defect on `service_requests` and `profiles` — are **not** in this batch.

---

## Apply order

Developer, in the Supabase **SQL Editor** (never `db push` — see B20), before deploying this code:

1. `supabase/migrations/20260922_01_library_grants.sql`
2. `supabase/migrations/20260922_02_members_accept_own_invitation.sql`
3. `supabase/migrations/20260922_03_lawyer_provider_column_grants.sql`
4. `supabase/migrations/_verify.sql`

Prerequisites already expected on production: `20260730` (the table `01` grants), `20260921_03` (the four-policy matrix `02` extends), `20260826` (the two columns `03` grants by name), `20260914`, `20260906_phase6`, `20260907`.

**Deploy-order cliffs:**

| Migration | vs the code | Why |
|---|---|---|
| `20260922_01` | **before** | The route now answers 500 with an Arabic error instead of an empty page, so deploying the code first turns a silent blank law into a visible error. Applying the migration first makes the pages correct in one step. |
| `20260922_02` | **before** | The routes write `status: 'invited'`; without the migration those rows cannot be answered by anyone, and the owner PATCH refuses to answer for them. |
| `20260922_03` | any time | Pure GRANT/REVOKE, independent of the code. |

All three are idempotent and safe to re-run. Rollback blocks are in each file's header.

---

## What the developer still has to do

1. ~~Apply the three migrations in the order above~~ **Done 2026-09-22** (SQL Editor). Run `_verify.sql` with `set nzamy.env = 'production';` if not yet run and confirm the three `NOTICE: _verify: 20260922_0x OK` lines. The owner docs were flipped to «نُفِّذت ✓ (٢٢ سبتمبر)».
2. **Optionally rehearse first:** `bash supabase/tests/rls/rehearse-staging-order.sh` now carries all three files and their `_verify.sql` gates.
3. **Deploy** (`git pull && npm run build && pm2 reload nzamy`, then clear the nginx proxy cache — in that order).
4. **Remove the 146 synthetic accounts.** `pwsh scripts/uat/teardown-actors.ps1` **dry run first**, read the per-table counts, then `-Execute` — **only after the owner's current test round is over**, and only with the production guards consciously satisfied (`-IUnderstandThisIsProduction` + `NZAMY_UAT_ALLOW_PRODUCTION=1`).
5. **Never run `scripts/uat/verify-*.ps1` against the production project.** Until a second Supabase project exists for UAT, the `NZAMY_UAT_PROJECT_REFS` allow-list is the only thing standing between those six service-role writers and live data.
6. **Still open from the review:** B1–B17 **except B3**, C1–C4, B18 (the CI fixes: the timezone-dependent test, the npm-10-incompatible `minimatch` overrides, the lint rule), B19 (move the owner's ZIP folder out of the repo), B20 (`deploy.sh db push` → an explicit abort pointing at README-ORDER), the 2026-09-21 owner report's question numbering (E5), and the `owner-edits` branch (29 conflicting files — owner question ٦).

---

## Gates on the tree

* **`npm run type-check`:** 0 errors outside the owner's extracted ZIP folder (`nzamy-developer-test-نهائي-2026-09-20/`, which is git-excluded but still walked by `tsconfig.json` — review B19).
* **Unit suite:** green (count in the commit message).
* **`npm run lint`:** 3 errors, 3917 warnings. The 3 errors are exactly the pre-existing `react-hooks` "Compilation Skipped: Existing memoization could not be preserved" findings from the profiles batch (review B17) — `src/components/dashboard/GlobalSearch.tsx:162` and `:189`, and `src/app/dashboard/client/page.tsx:333` (the review cited `:332`; this batch's banner import shifted it by one line). Not fixed here — the fix is a one-line rule demotion in `eslint.config.mjs` that belongs with the rest of B18.
* **CI on GitHub:** still red, for the reasons in review B18. Not this batch.
