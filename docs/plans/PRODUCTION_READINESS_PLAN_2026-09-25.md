# NZAMY — Production Readiness Plan (2026-09-25)

**For:** the developer · **Baseline:** `main` @ `1645676`, production = self-hosted Supabase (clean start, live since 2026-09-25) · **Evidence:** [`docs/audits/2026-09-25-production-readiness-inventory.md`](../audits/2026-09-25-production-readiness-inventory.md) (every page, route, migration, feature and backlog item, with `file:line`) · **Owner decisions:** `أسئلة_المالك_المجمّعة_٢٠٢٦-٠٩-٢٥.md` (repo root, Arabic; question numbers used below are its numbers).

## 0. TL;DR

1. **The platform is live but not honest yet.** Of the 207 dashboard pages, **65 are real, 84 show invented data as fact, 16 are local-only with a disclosure, 27 are honest "coming soon", 10 are hybrid, 2 fall back to fixtures on failure, 3 are broken/redirects.** Two account types are genuinely served (lawyer, individual), one is half real (corporate); firm and provider profiles are mock; government, ngo and micro have only a settings jsonb bag.
2. **Security and integrity holes remain open on the live database** (table-level grants on `profiles` and `service_requests`, self-assignment of orders, admin routes that promote accounts silently, documents deletable by the counterparty, unmetered AI proxies, races in entitlement grants). None needs an owner decision. They are **P0** below and fit in one sprint.
3. **Four things a real user hits today are broken:** the client case file never loads (Next 16 `params` promise), chat rooms cannot be created (`type` vs `room_type`), smart-folder writes fail with 42501, the draft cart is wiped on every save (unbacked column). All **P0**.
4. **Nobody can buy anything** (no gateway, no checkout, no webhook) and **the founder offers whose sale window opened on 23 September are not built**. Both wait on owner question **١** (payment provider); the plan builds everything up to the provider adapter so the choice is the last step.
5. **Owner questions:** 141 collected since 15 August, deduplicated to one registry: **48 unanswered, 24 partially answered, 40 answered, 29 obsolete.** A 22-row quick sheet sits at the top of the Arabic file. Every open question carries the default we apply while waiting, so nothing below blocks on him.
6. **Order of work:** Sprint 1 = P0 + the honesty gate (owner ١٦ default: hide every invented finance/compliance screen) + the marketplace regression. Sprint 2 = profiles completion for all nine types + wiring the pages that already have an API. Sprint 3 = backend hardening, tests, ops-before-launch, the owner's browser round. Product build (P5) only as decisions arrive.

## 1. How this plan was produced

A 35-agent read-only audit of HEAD `1645676` on 2026-09-25, all on Opus 5.5 except four readers whose finished Fable output was kept (admin a–l, admin m–z, profiles, provider) and then adversarially verified by Opus: 11 dashboard readers each followed by a verifier that re-opened every file and re-globbed for missed pages; a profiles/registration/settings reader; three API-route readers (183 routes + 111 `src/lib` modules); a migrations-vs-live-schema reader (81 files against `scripts/selfhost/run4_delivery/01-schema.sql`); two cross-cutting readers (76 AI pages + channels; commerce, founder offers, academy, community, legal pages); two backlog re-verifiers (the 2026-09-21 review B/C/D/E, the selfhost readiness log, the 2026-09-14 delivery, the founder specs, the library tracker, the 88 open items of the owner's 195-list); two owner-question collectors merged and refuted (19 statuses corrected). Gates were run at HEAD: `tsc` 0 errors; unit **1,746 / 1,747** (the one failure is `src/lib/deadlineReminders.test.ts:125` under `TZ=UTC`, review B18's engine bug); lint **3 errors / 3,893 warnings** (B17); GitHub CI runs #14–#18 green.

Not audited (out of scope, stated): the server's runtime behaviour (no probes were run), the n8n instance, e-mail deliverability, browser rendering. Data-dependent library items (LIB-18 dates, 82 chapter descents) were not re-measured.

## 2. Where we stand

### 2.1 Profiles (the user's first question)

| type | verdict | what is real | what is missing (short) |
|---|---|---|---|
| **lawyer** | real, nearly complete | `/dashboard/lawyer/profile` + `/edit` on `GET/PATCH /api/v1/profile`, 20 self-editable columns, services, reviews, slug, public page (closed by `BETA_MONOPOLY_MODE`) | licence/experience/specialties typed at signup are **dropped by the trigger**; no KYC document upload (file *names* only); `license_expiry` read-only; tier trusted from `user_metadata` |
| **individual** | real, minimal | `/settings` ProfileTab persists name/phone/city/nationality to `profiles` | forced onboarding redo after e-mail signup (trigger never writes `onboarding_completed`); language/theme/calendar never persisted; no avatar; no dashboard profile page |
| **corporate** | half real | 4 identity columns + jsonb contact bag; `/dashboard/business/team` real with consent | no verification path (queue skips `business_profiles`); `has_legal_dept` from onboarding lost; `size`/`legal_structure` not editable; `display_name` holds the company name under «الاسم الكامل»; no logo |
| **firm** | mock | firm *team* API real | `/dashboard/firm/profile` is a hardcoded «شركة السند…» with a «حفظ محلي» button; every e-mail-registered firm is named «جهة جديدة» (form never sends `company_name`); licence/CR/managing-partner columns exist with no editor; jsonb bag shadows `cr_number` |
| **provider** | mock | admin verification queue reads `provider_profiles` | `/dashboard/provider/profile` is another person's invented identity with a fake save; licence number never reaches `provider_profiles.license_number`; no editor for visibility/rate/areas; no sub-role gating inside the dashboard |
| **micro** | jsonb bag only | settings bag | CR number collected at signup is lost (no column); real columns never updated |
| **government** | jsonb bag only | settings bag | role vocabulary mismatch (`gov_counsel` vs CHECK `counsel`); `entity_type` always `other`; tab visibility keyed on user-writable `user_metadata.government_role`; team tab with no backend |
| **ngo** | jsonb bag only | settings bag | no registration-number column (input was removed); `org_type` never persisted; team tab with no backend |
| **admin** | n/a | created in DB only | — |

Cross-type: **no avatar/logo upload for any type**; the KYC "documents" of the provider/lawyer registration are a string of file names; the admin verification page shows invented weekly charts and a synthesised documents list; `useUser` trusts `user_metadata` for tier, sub_role, active_roles, government_role and credits (self-escalation surface); four entity tables have no UNIQUE on `owner_user_id` (duplicate rows possible).

### 2.2 Dashboards (verifier-corrected)

| role | pages | real | mock-as-real | local-only disclosed | coming-soon | hybrid | demo-fallback | broken / redirect |
|---|---|---|---|---|---|---|---|---|
| admin | 46 | 16 | 18 | 5 | 2 | 3 | 2 | 0 |
| lawyer | 23 | 16 | 1 | 0 | 4 | 1 | 0 | 1 |
| client | 22 | 12 | 0 | 0 | 5 | 2 | 0 | 2 |
| business | 24 | 5 | 9 | 2 | 8 | 0 | 0 | 0 |
| firm | 48 | 12 | 25 | 9 | 0 | 2 | 0 | 0 |
| provider | 15 | 0 | 15 | 0 | 0 | 0 | 0 | 0 |
| government | 6 | 0 | 6 | 0 | 0 | 0 | 0 | 0 |
| ngo | 10 | 0 | 8 | 0 | 2 | 0 | 0 | 0 |
| micro | 13 | 4 | 2 | 0 | 6 | 1 | 0 | 0 |
| **all** | **207** | **65** | **84** | **16** | **27** | **10** | **2** | **3** |

Worst on screen (a user reads them as facts): admin root console MRR/ARR/churn; admin payouts with masked IBANs; admin security "threats"; admin backup «معدل النجاح ٩٤٪»; firm overview «١٨٠,٠٠٠ ﷼ +١٨٪»; firm wallet with a ٥٠٠,٠٠٠ ﷼ escrow account; firm VAT quarters marked «مدفوع» plus a ZATCA integration claim; the firm conflict-of-interest tool is now real (`/api/v1/lawyer/conflict-check`) but its case search leaks strangers' unassigned marketplace orders as "conflicts"; provider earnings with a fake IBAN and 15 % commission; an arbitration award naming a real bank as the losing party; government contracts «١,٧١٠,٠٠٠ ر.س»; business wallet with two "paid" invoices; **the marketplace pages regressed** on 2026-09-20 from an honest gate to invented listings with «Escrow» promises (lawyer, firm and business).

### 2.3 Backend (183 routes, 111 modules)

- **Unbacked on the live schema (fail today):** `PUT /api/v1/drafts/cart` inserts `article_title`, a column `law_draft_carts` does not have — and deletes the cart first; `POST/PATCH/DELETE /api/library/folders` and `POST /api/library/folders/items` hit 42501 (SELECT-only grants on `library.smart_folders*`); `POST /api/library/reports` is a dead duplicate.
- **Security (details in §3, P0):** table-level `GRANT ALL` on `profiles` and `service_requests` to `authenticated`; `assigned_to`, `id` and `metadata` taken from the request body; `enforce_requester_cancel_lock` exempts self-assigned rows; admin `teams` POST promotes any existing account to admin; `users/[id]` PATCH accepts `user_type: "admin"`; "suspend" suspends nothing; concurrent approvals grant twice; invite accept TOCTOU; library redeem re-usable per user; documents hard-deleted/held/shared by the counterparty; `lawyer/finance` writes payments against any request; `n8n/trigger` lets a client fire any workflow; two anonymous unmetered AI proxies; `groups` accepts `max_members`/`plan_id` from the body; `deadline-rules` self-verifiable.
- **Contract drift:** 32 routes return English `Unauthorized`; many return raw Postgres `message/code/hint`; ~20 list routes return no `total` and no range (silent 1,000-row cap); several bespoke envelopes (`{items,nextCursor}`, `{lawyers,total}`, `{companies}`, `{notifications,…}`).
- **Dead or unused:** `/api/v1/cases*` (nothing writes `public.cases`, question ١١), `/api/v1/invite/[code]` (nothing writes `invitations`, question ٢١), `promo/[slug]`, `ai-review-requests`, `lawyer/work-sessions/[id]`, `consultations/[id]`, `groups/[id]`, `lawyerActivityService`.
- **Tests:** none beside most `lawyer/*`, `documents/*`, `chat/*`, `groups/*`, `notifications`, `settings` routes.

### 2.4 Migrations vs live

65 applied · 7 not applied (batch C ×4 with no code dependents; `20260823_fts_number_search` — cannot be applied as written, it drops `fts` under the matview; `20260824_articles_number_text_widen`; `supabase/storage_policies_documents.sql` — the live bucket carries the six Dashboard-fixed policies instead) · 2 do-not-apply · 3 superseded · 5 data-only. `_verify.sql` has never been run against the self-hosted database.

### 2.5 AI tools, channels, commerce

- **76 `/ai/*` pages:** 8 work (all manual-fulfilment orders + collector/letter-drafter/fee-calculator/templates), ~50 are mock behind `BetaReviewGate` or fully open (invented legal content reachable logged-out on `/ai/monitor`, `/ai/corp/monitor`, `/ai/legal-translate`, `/ai/transcriber`…), 3 honest, 6 broken. **No `BetaReviewGate` call site passes `orderPayload`**, so the gate never creates an order. The owner already answered how to word them (question ٦٨: «نماذج وقوالب استرشادية» + a review button) and asked for the 96 artificial delays to go (٤٤).
- **Channels:** in-app notifications work end to end. E-mail exists only through the self-hosted GoTrue SMTP (signup/invite); **the app sends no e-mail of its own and the password-reset round trip must be verified**. WhatsApp and n8n: the code reads 5 `N8N_*` vars, `.env.example` declares 28; the 7 exported n8n workflows cannot be imported against the live schema; the deadline cron is scheduled on the server (25 Sep) but its e-mail/WhatsApp branch has no producer.
- **Commerce:** no checkout, no provider adapter, no webhook (`paymentAdapter.ts` is dead code). Paid access happens only through admin-granted entitlements; the `/pricing` CTAs file `entitlement_requests`. The visible `/pricing` individual plan still promises **Escrow and video consultations**; forbidden old numbers survive on `/book/consultation` and `/services/consultations` (an AI-99 tier). Founder offers (`client-founder-2026`, `business-founder-national-2026`, `lawyer-founder-2026`): **0 hits in `src/`**.
- **Academy:** no schema live; fabricated certificates/courses shown to anonymous visitors (C1); `vault-explorer` reads a Windows path (C2). **Community:** works for public posts; post detail 401s guests; votes never move (RLS). **PWA:** works. **Mobile:** scripts and deps with no Capacitor project (owner says a mobile app is coming — ٣٤).

## 3. Work plan

Ticket ids are stable (`P0-xx`…). Size: **S** < ½ day, **M** 1–2 days, **L** 3+ days. "Q n" = owner question n in the Arabic file; the default in that file is what the ticket implements unless he answers.

### P0 — Security, integrity and broken user paths (no owner decision needed; before any public launch)

| id | ticket | where | size |
|---|---|---|---|
| P0-01 | **Service-request write path.** Clamp `assigned_to` to self-or-null, generate `id` server-side, validate `metadata` keys, refuse `in_review` at creation, Arabic errors instead of `message/code/hint`; migration: drop the `auth.uid() is distinct from old.assigned_to` conjunct in `enforce_requester_cancel_lock` and replace the table-level UPDATE grant on `service_requests` with `grant update (status, lawyer_client_id, updated_at)` | `src/app/api/v1/service-requests/route.ts:359-370,464-475,493`; live fn `01-schema.sql:469-491`; grants `:13124-13126` | M + 1 migration |
| P0-02 | **`profiles` column grants** (Q ٢٩ default): `revoke update on profiles from authenticated, anon; grant update (display_name, display_name_en, phone, avatar_url, language, calendar_type, theme, country_code, city, onboarding_completed, nationality)` — the exact PATCH allow-list; add `has_column_privilege` gates to `_verify.sql` | migration; `01-schema.sql:14577` | S + 1 migration |
| P0-03 | **Anonymous reviews de-anonymisable through REST** (B7): hide `reviewer_id`/`request_id` behind column grants or a security-invoker view; keep `lawyer_review_stats`; also tighten `reviewees respond to reviews` (it lets a reviewee rewrite rating/body/status) | migration; `01-schema.sql:10608,12562,14377` | M + 1 migration |
| P0-04 | **`*_members` DELETE** (Q ٣٠ default): revoke DELETE from `authenticated` on the four tables; removal stays a status change | migration; `01-schema.sql:10834,11621,11689,12160` | S + 1 migration |
| P0-05 | **Admin authority.** `admin/teams` POST must not promote an existing account (refuse with 409, never overwrite `display_name`/metadata); `users/[id]` PATCH: `user_type` allow-list without `admin`; "suspend" = `auth.admin.updateUserById({ban_duration})` + a stored status, not a subscription cancel; every admin mutation writes `admin_audit_events` (delete, subscription, credit, entitlement, settings, coupon, team, library delete) with real `before_state` | `src/app/api/v1/admin/teams/route.ts:99-142,198-212`; `admin/users/[id]/route.ts:185-229,288`; `verifications/[id]/route.ts:151` | M |
| P0-06 | **Grant races and re-use.** `entitlements/requests/[id]`: `.eq('status','pending')` on both updates; `invite/[code]/accept`: check affected rows on the status flip before granting; `library/invitations/redeem`: per-user redemption record (new table `library_invitation_redemptions` + UNIQUE); `admin/subscriptions` POST: validate tier against the live CHECK (`free/ai/pro/corp/max`), do cancel+insert in one RPC; `admin/credits`: atomic RPC instead of read-modify-write; `entitlements.ts` grantEntitlement: check the cancel error, insert first | routes named; `src/lib/entitlements.ts:205-232` | M + 1 migration |
| P0-07 | **Documents owned by the uploader.** Permanent delete, legal hold, restore and public share only for `owner_user_id = auth.uid()`; participants keep read; no signing/downloading of trashed attachments | `src/app/api/v1/documents/[id]/route.ts:61-103`, `hold/route.ts:77-85`, `restore/route.ts:52-57`, `share/route.ts:71-90`, `service-requests/[id]/attachments/[attachmentId]/route.ts:26-44` | M |
| P0-08 | **`lawyer/finance` POST**: require `requestId` and prove ownership/assignment under RLS; never fabricate `service_requests` rows; accumulate partial collections; Arabic errors | `src/app/api/v1/lawyer/finance/route.ts:343-401,446-498` | M |
| P0-09 | **Case graph PUT** checks the caller can read `service_requests[caseId]` (RLS read first); Arabic errors | `src/app/api/v1/lawyer/case-graph/[caseId]/route.ts:53-167` | S |
| P0-10 | **Contract versions path guard**: reject `..`/absolute/foreign-prefix `storagePath` (copy `documents/route.ts:90-96`) before signing | `lawyer/contracts/[id]/versions/route.ts:76`, `…/[vid]/url/route.ts:37-39` | S |
| P0-11 | **Outbound n8n**: delete `POST /api/v1/n8n/trigger` (any participant fires any workflow) or restrict to admin + event allow-list; contact-form forward gets the secret header and `AbortSignal.timeout` | `src/app/api/v1/n8n/trigger/route.ts:70-89`; `contact/route.ts:78-90` | S |
| P0-12 | **AI proxies**: `library-chat` and `explain-article` require a session (or the proxy's strict limiter keyed on the real IP), get a timeout, and paywall-check `relatedArticles[].text` | `src/app/api/ai/library-chat/route.ts:26-33`, `explain-article/route.ts:20-32,90-91` | S–M |
| P0-13 | **Groups**: validate/ignore `max_members` and `plan_id` from the body; make `join` work under RLS (security-definer lookup by `join_code`); non-owner invite must not return an unsaved code; member names via a definer projection | `src/app/api/v1/groups/**`; `01-schema.sql:11744,12289` | M + 1 migration |
| P0-14 | **Deadline rules**: `verified_by_owner` writable by admin only; `case-stages` auto-deadline and the cron use only verified rules or flag `ruleVerified:false` (Q ١٨ default) | `deadline-rules/[id]/route.ts:92-118`; `lawyer/case-stages/[caseId]/route.ts:260-266` | S |
| P0-15 | **Injection and limiter bypass**: escape/whitelist the `search` term in `community/moderation` `.or()`; the leads limiter must key on the proxy-resolved IP (last XFF entry, as `proxy.ts` does) | `admin/community/moderation/route.ts:114-116`; `leads/business-assessment/route.ts:69-76` | S |
| P0-16 | **Draft cart** (unbacked): migration adds `law_draft_carts.article_title` (or drop it from the insert), PUT becomes an RPC upsert (no delete-then-insert), Arabic errors | `src/app/api/v1/drafts/cart/route.ts:66-86`; `01-schema.sql:3709-3721` | S + 1 migration |
| P0-17 | **Smart folders** (unbacked): grant `insert, update, delete` on `library.smart_folders`, `smart_folder_items` (+ `issue_reports` insert) to `authenticated`, RLS already exists; Arabic errors; delete `/api/library/reports` | migration; `src/app/api/library/folders/**` | S + 1 migration |
| P0-18 | **Client pages broken by Next 16 `params`**: read the id with `useParams()` in `client/cases/[id]/page.tsx:189-216`, `client/find-lawyer/[id]/page.tsx:3-4`, `group/join/[code]/page.tsx:8-14` (the case file currently always shows "not found") | three pages | S |
| P0-19 | **Chat and consultations**: `chatService.createChatRoom` sends `room_type`; remove `support` from the route's allowed types (CHECK rejects it); dedupe the client consultation list by `consultations.request_id` (every booking shows twice); messages page: derive sender from `sender_id`, mobile layout, remove the call modal/verified seal | `src/lib/services/chatService.ts:133-136`; `chat/rooms/route.ts:118-130`; `client/consultation/page.tsx:449-503,550-558`; `client/messages/page.tsx` | M |
| P0-20 | **Signup trigger**: `handle_new_user` writes `onboarding_completed` from `raw_user_meta_data` (every e-mail signup is forced through onboarding again) **and** persists the metadata it drops today (`license_number`, `experience_years`, `provider_specialties`, `company_name`, `cr_number`, `government_role`→`role`, `org_type`, `registration_number`). One migration carrying the body forward byte-for-byte from `20260921_04` (its header rule is binding); Docker harness test | migration; `01-schema.sql:663-811`; `register/provider/page.tsx:405-432`; `register/client/page.tsx:253-359` | M + 1 migration |
| P0-21 | **Auth resilience**: B4 (`resolveAuthOutcome` treats GoTrue 500/429 as transport failure), B15 (`useUser` keeps the session on transport failure), C10 (proxy returns `supabaseResponse` on the unavailable branch), B9 (`?from=` read on `/login` via `safeRedirectPath()`, forwarded through OAuth) | `src/lib/auth/resolveAuthOutcome.ts:53-64`; `src/hooks/useUser.ts:937-1002`; `src/proxy.ts:355-357,364,706`; `src/app/login/page.tsx` | M |
| P0-22 | **Password reset on the self-hosted GoTrue**: prove `resetPasswordForEmail → /auth/callback → updateUser` end to end with the new SMTP; build the missing piece if any; test signup confirmation the same way | `src/app/forgot-password/**`, `src/app/auth/callback/route.ts` | S–M |
| P0-23 | **Stop trusting `user_metadata` in the browser**: tier from subscriptions (server already does, `access-control.ts:106`), `sub_role` from `provider_profiles`, `government_role` from `government_profiles`, `active_roles`/credits from tables — via `GET /api/v1/auth/session` or `/profile`; delete the demo block behind `runtimeMode` | `src/hooks/useUser.ts:766-830`; `register/provider/page.tsx:386,409` | M |
| P0-24 | **Marketplace regression** (2026-09-20 package sync): restore the `DashboardComingSoon` gate for `MyMarketplaceDashboard` (lawyer, firm, business `/marketplace` pages), gate the lawyer overview «نشر في السوق» link and the provider FAB links under `BETA_MONOPOLY_MODE` | `src/components/marketplace/MyMarketplaceDashboard.tsx` (was a gate at `a5b69a1`); `dashboard/lawyer/page.tsx:674-680`; `floatingServices.tsx:586,596` | S |
| P0-25 | **Provider dashboard gating**: sub-role gate inside `/dashboard/provider/*` (a notary can open `arbitration/*` today); specialist draft intake (`arbitration/notary/report/minutes`) cannot submit because `clientRole` is hidden but required | `dashboard/provider/layout.tsx:22`; `routeAccess.ts:80`; `StepIdentify.tsx:115`; `useDraftState.ts:207-214` | S |
| P0-26 | **CI/tooling**: `daysUntil` in `Asia/Riyadh` (`deadlineEngine.ts:74-79`, the cron runs in UTC); `react-hooks/preserve-manual-memoization` → warn in the existing block; confirm the `minimatch` overrides under `npx npm@10 ci --dry-run` (CI is green on Node 22 — record why); `test:scripts` conditional on the corpus | `src/lib/services/deadlineEngine.ts`; `eslint.config.mjs:28-38`; `package.json:90-98`; `scripts/run-script-tests.mjs:18-27` | S |
| P0-27 | **Rate limits and login attempts**: proxy limiter on `GET /api/library/search|laws|autocomplete` (OWN-172); a writer for `login_attempts` (nothing writes it) | `src/lib/rateLimitRoutes.ts:50-55`; `src/proxy.ts:21-39` | S–M |
| P0-28 | **Conflict check leaks strangers' orders**: `lawyer/conflict-check` case search runs under `service_requests_select_policy`, which returns every unassigned marketplace request to a verified lawyer; scope it to own/firm rows | `src/app/api/v1/lawyer/conflict-check/route.ts`; `01-schema.sql:12643` | S |

Migrations in P0: **7** (P0-01, 02, 03, 04, 06, 13/16/17 can share, 20). Each: header + verify block, Docker harness test, `rehearse-staging-order.sh`, applied by the user on self-hosted via the SQL Editor, then `_verify.sql` with `set nzamy.env = 'production'`.

### P1 — Honesty sweep (owner ١٦ default = hide now; ٩ answered = remove static «جديد» badges; ٦٥/٦٦ answered = delete Escrow copy)

**Rule per page:** if an API that serves the data already exists → *wire* (S–M); else → *gate* with `DashboardComingSoon` now, keep the source, and file the build as P5 with its owner decision. The full per-page mapping is Appendix A of the inventory; the actions:

| role | gate now (no data source) | wire now (API exists) |
|---|---|---|
| admin | `ai-usage`, `ai-usage/reports`, `celebrities` ×3 (Q ٦١), `disputes`, `escrow`, `payouts`, `reports`, `security`, `system`, `system/backup` (delete — backups are a server job), `users/new` (or build POST), `provider-verification/firms`, `sector-profiles`, `features` (or DB-driven flags), root console's five mock tabs (or wire `stats`/`revenue`/`users`) | `ai-usage/credits` ← `GET /api/v1/admin/users`; `marketplace/orders` ← `GET /api/v1/admin/marketplace`; `business` ← `GET/PATCH /api/v1/admin/corporates` (or delete: duplicate of `CorporateTab`); `subscriptions` (read `json.data.*`; drop the invented trend/churn/ARPU); `users/[id]` tickets tab ← `/api/v1/admin/tickets?user_id=`; `tickets` reply box (new `ticket_messages` table, M) or strip; `coupons` usage ← `coupon_usage`; `settings` tier vocabulary + block saves after a failed load; `audit-log` CSV; `broadcasts` edit/delete + do not re-fan-out on a second `sent`; `content/articles` and `community/moderation` drop the fixture fallbacks; `provider-verification` drop the invented charts and the synthesised docs list; `pricing` ← new GET/PATCH over live `admin_pricing_catalog` (M) |
| firm | `achievements`, `analytics`, `compliance/kyc`, `compliance/walls` (false security claim), `fees`, `finance`, `finance/reports` (fabricated VAT «مدفوع» + ZATCA claim), `governance`, `health-check`, `shared-rooms`, `templates` (or redirect to `/ai/draft`), `team/attendance`, `team/timesheets`, `circuits-emails`, `branding`/`branches`/`departments/permissions` (need grants) | root KPIs ← `firm/members` + firm-scoped `hearings`/`tasks` (M); `cases/assign` ← `service-requests` + `firm/members` + `firm/members/workload`; `clients/[id]` ← `lawyer/clients/[id]`; `archive` ← closed requests + archived clients; `documents` ← `documentService`; `hearings` and `tasks` (firm scope on the lawyer routes, M); `wallet` ← `/api/v1/wallet` (points only, delete the escrow/bank cards); `reviews` ← `reviews/mine` (Q ٢٠); `referrals` ← `/api/v1/referrals` (Q ٦١; delete the `/ref/` link); `of-counsel` ← members filtered `external_of_counsel`; `team/roles` counts and `team/trainees` roster ← `firm/members`; `profile` ← `GET /api/v1/profile` + a new `firmProfile` PATCH arm (see P2); `secondment/new` → write `secondment_contracts` (M); `procedures-expert` drop the fake 1.4 s timer and the «أبحث في قاعدة البيانات» text |
| business | `team/[id]` (live by URL for any owner — first), `departments/[id]`, `employee-contracts` (or wire `contracts` with `contract_type='employment'`, M), `marketplace`, `procedures-expert`, `seconded-counsel` (`secondment_contracts` is live — M later), `circuits-emails`, `cases/new` (delete; the real intake is `/dashboard/client/services`), duplicate routes `requests` and `consultations` (delete), navbar `CORPORATE_NAV` dead links | `cases` list re-linked + requester filter and tier gate fixed (S); `hearings` ← hearings of own requests (M); `reports` ← aggregate of own `service_requests` (M); `wallet` ← real tier + no invoices (S) |
| provider | all 15 gated now (S each) except: | `reviews` ← `reviews/mine` + `[id]/response` with `assertRole` widened; `profile` ← `GET /api/v1/profile` (+ P2 PATCH arm); `calendar` and `arbitration/hearings` ← owner-scoped `hearings`; `arbitration/files` ← `/api/v1/documents`; `drafts`/`notary/drafts` ← own `service_requests` after P0-25; `requests`/`notary/requests`/`bailiff/requests` need a provider RLS policy on unassigned `receiver='provider'` rows (L, Q on beta scope) |
| government / ngo | gate all (government 6, ngo 8) except `contracts` ← new thin route over live `public.contracts` (M each); remove `SectorProfileReadinessPanel` (invented G-001/N-001/M-001 entities from localStorage) | — |
| micro | home requirements block (invented compliance state); `cases` (or wire type `business_case`) | `documents` ← `documentService` (upload is a fake `setTimeout`); `requests` price floors and «دفع بعد الرضا» line removed; `find-lawyer` specialty chips derived from data, limit passed |
| lawyer | `reviews` page → redirect to profile tab; «تقييم نظامي AI · قريباً» card; `tasks` drop the `SHARED_CASES` fixture import; delete dead `_data/analytics.ts`, `_data/performance.ts`, `_data/clientLinks.ts`; `documents` templates tab | `cases?client=` honoured; `finance` Arabic errors |
| client | `my-group` invented discount tiers (Q ٦٢); `wallet` fixture arrays; `services` copy («كل محامٍ يحدد سعره…», dead «قريباً» branch); `consultation/new` quota promise; `referral` badge; `cases/[id]` fees card (payment shown only as recorded) | — |

Cross-cutting sweeps in the same sprint:

- **«قريباً» outside `DashboardComingSoon`:** page copy in `ai/vault`, `ai/secretary`, `ai/quick-answer`, `ai/global`, the `/laws` AI panels, `lawyer/cases/[id]:1193-1206`, `client/services:213-217`, `firm/governance:171`, `library/status` default message, `users/roles:65`, `admin/team:61`, admin `pricing:102,111`. Navigation badges «قريباً» (14) stay **only** where the target page *is* `DashboardComingSoon` (the repo's own `navComingSoon.test.ts` rule); the micro five and the firm two comply, the client «ربعي» and «برنامج الإحالة» badges do not.
- **«جديد» / «مُطوَّر» / «تجريبي» badges:** remove all static ones (`navigation.sidebars.primary.ts:143-197`, `legal.ts:31-167,260,268,279-363`, `business.ts:160`, `sidebars.ts:51,102,138`, `navbar.ts:107-118`).
- **English in UI:** the per-role lists in Appendix A (tier codes, «Backend-ready», «(Escrow)», «KYC», «MB/KB», «Admin Panel», role ids…), plus the `Navbar` language toggle (Arabic-only rule).
- **Dark-mode traps:** `.dark` rescues for `text-gray-200`, `text-slate-200/300`, `text-emerald-100` beside the existing `.text-white` block in `globals.css:155-181`, then fix the cited sites (C4).
- **localStorage misuse:** `useAdminSettings` writes four admin-data keys on every mount and is mounted by `SharedSidebar`/`useSubscription` (every dashboard page) — remove it from the sidebar and from the readiness panels; `ai/settings`; `researchService` inbox/desktop (server routes exist); `clientGroupStore` seed; `laws/orders/[slug]` recent keys. `nzamy_last_dashboard` is sidebar state and stays.
- **False promises on public pages:** `/pricing` Escrow + video consultation (`pricing.individuals.ts:27,34`), Hero «مرخّص من وزارة العدل» (Q ٢٧), `/pro`, `/partners`, `/join`, `/academy` testimonials and counters, `seconded-counsel` Cyrillic word, the AI-99 tier on `/book/consultation` and `/services/consultations`, terms «متاجر التطبيقات» → «عند توفرها» (٣٤).
- **Academy:** C1 (`certificates`, `my-courses` → `DashboardComingSoon`, drop the navbar «جديد»), C2 (delete `vault-explorer` + the four fetch sites), Arabic errors on the academy routes; the whole academy either behind one gate or out of the navbar until its schema is applied.
- **AI tools (owner ٦٨/٤٤ answers):** remove the 96 `setTimeout` fakes, label every template tool «نماذج وقوالب استرشادية», pass `orderPayload` from the tools that map to a manual service (draft, contracts, wargaming, legal-opinion families), `DashboardComingSoon` for the rest (`monitor`, `corp/monitor`, `legal-translate`, `transcriber`, `compare`, `global`, `gov/judicial-search`, `mail-advisor`, `smart-inspector`, `tracker`, `vault`, `case-brief`, `brief-check`, `assistant`, `consult`, `analyze*`, `contract-*`, `corp/*`, `ngo/*`, `gov/*` mocks), protect `/ai/*` by default with an allow-list, delete `/ai/share-history`, fix `/ai/communicate` and `/ai/corp/privacy` redirects. Size: L, mechanical.

### P2 — Profiles completion (all nine types)

| id | ticket | size | owner Q |
|---|---|---|---|
| P2-01 | Trigger fix + persisted signup metadata (= P0-20) | — | — |
| P2-02 | `UNIQUE (owner_user_id)` on `firm_profiles`, `business_profiles`, `government_profiles`, `ngo_profiles` (dedupe first), so `ON CONFLICT DO NOTHING` is real | S + migration | — |
| P2-03 | **Avatar/logo upload**: private bucket `avatars` (+ `logos` under the entity id), RLS by folder, `POST /api/v1/profile/avatar`, controls in ProfileTab and EntitySettingsTab, `useUser` reads `profiles.avatar_url` | M + migration/storage policy | — |
| P2-04 | Persist `language`/`theme`/`calendar_type` to `profiles` (columns and allow-list exist) | S | — |
| P2-05 | **Lawyer**: `license_expiry` editable (grant + field); remove the «قريباً» badges and the 24 h promise in `register/provider/components/Steps.tsx:359,480,487-505`; KYC document upload (see P2-11) | S | ٣٩ (directory publishing) |
| P2-06 | **Individual**: `/settings?tab=profile` entry stays the profile page; avatar; onboarding fix; decide on an ID document (Q — PDPL); Saudi-only registration or international mobiles (validator + CHECK + trigger) | S–M | new Q (Saudi-only?) |
| P2-07 | **Corporate**: add `business_profiles` to the admin verification queue + PATCH; write `has_legal_dept`/`service_model` from the onboarding answer; `size` + `legal_structure` selects; representative's own name in `profiles.display_name` at signup; logo | M | ٥٤, ٥٥, ٣٦ |
| P2-08 | **Firm**: `/register/provider` sends `company_name` (+ licence/CR); rebuild `/dashboard/firm/profile` on `GET /api/v1/profile` + a `firmProfile` PATCH arm (`name_ar/name_en, license_number, license_expiry, cr_number, unified_number_700, managing_partner_*, size, structure, practice_model, branches, departments, branding`) with matching column grants (`20260922_03` pattern); move `crNumber` out of the jsonb bag; admin `provider-verification/firms` real list; public firm page (Q ٢٠) | L + migration | ٢٠ |
| P2-09 | **Provider**: rebuild `/dashboard/provider/profile` on `GET /api/v1/profile` + `providerProfile` PATCH arm (`license_number, license_expiry, service_areas, hourly_rate, availability, marketplace_visible`) + grants; ProfessionTab for providers; exempt e-mail-registered providers from the wizard when the phone is valid; public listing stays closed (beta) | L + migration | beta scope |
| P2-10 | **Micro / government / ngo**: real columns for `cr_number` (micro), `role`/`entity_type` (government, fix the CHECK vocabulary), `registration_number`/`org_type` (ngo) + PATCH arms + grants; team/delegation tabs hidden until `government_members`/`ngo_members` routes exist (or build them, L); verification flows per Q | M each + migration | new Qs (verify NGO/government/micro? multi-user?) |
| P2-11 | **KYC documents**: private bucket `verification-documents`, table `verification_documents (user_id, kind, storage_path, status)`, upload step in `/register/provider` and a «وثائقي» panel, admin viewer in the verification page; replaces the synthesised docs list | L + migration | new Q (which documents per role) |
| P2-12 | **Admin verification page**: delete the invented weekly chart, «٧٨.٤%», the `aiScore`, fix the `approved`/`verified` filter mismatch, Arabic errors | S | — |

### P3 — Backend hardening and tests

| id | ticket | size |
|---|---|---|
| P3-01 | Arabic error bodies everywhere: the 32 `Unauthorized` routes, every raw `error.message`, English enum lists (`_shared.ts` helpers per folder), and the client-side `api.ts` defaults | M |
| P3-02 | `{data,total}` + range on every list route (admin marketplace/corporates/articles/tickets/coupons/revenue/stats/feature-requests/library-issue-reports/community reports, documents, notifications, research items, reviews/mine, lawyer/activity, firm/activity, firm/members/workload, lawyers, wallet); `.in()` lists chunked at ≤ 300 ids | M |
| P3-03 | Service-role only where justified: `lawyer/clients*`, `consultations/_shared`, `contracts/_shared`, `case notes`, `me/invitations`, `blog`, `client-pricing`, `library` access lookups (twice per request in `precedents`), `payments/status` → RLS or definer projections; document the remaining ones in the route header | M |
| P3-04 | Route tests for every untested folder (`lawyer/*`, `documents/*`, `chat/*`, `groups/*`, `notifications`, `settings`, `cases/[id]/notes`, `me/invitations/*/accept|decline`) — pure-function extraction + `node --test`, house style | L |
| P3-05 | Community: guests may read a post detail; votes through a definer RPC (RLS lets only authors update); answers Arabic errors; `lawyers_only` tab honest | S–M + migration |
| P3-06 | Notifications: `{data,total}`; real delete route (today "delete" marks read); check `recordNotification` errors and stop marking outbox rows `sent` on failure | S |
| P3-07 | Consultations/contracts: status sync between `consultations` and `service_requests` (0-row updates only logged); `deadlines/[id]` re-queues the outbox when offsets change; obligations DELETE cancels the deadline only after the delete succeeds; holidays read failure must not silently compute without holidays; `convert` refuses cancelled consultations | M |
| P3-08 | Dead/duplicate surfaces: delete `ai-review-requests` (D1), `promo/[slug]`, `lawyer/work-sessions/[id]`, `consultations/[id]`, `groups/[id]`, `lawyerActivityService`, the second `library/reports`; `consultations` POST stub answers an honest 409 or goes; `/api/v1/cases*` per Q ١١ default (keep the table, retire the route) | S |
| P3-09 | Invitations: `invite/[code]` unreachable until a producer exists (Q ٢١) — hide `/invite` or build the founder producer in P5 | S |
| P3-10 | Migrations hygiene: D3 (`drop trigger if exists` in `20260730`), D4 (redundant unique indexes), README-ORDER fourth section for the 9 unclassified files, rewrite `20260823_fts_number_search` to drop/recreate the matview dependency, apply `20260824_articles_number_text_widen`, reconcile `storage_policies_documents.sql` with the six live policies, run `_verify.sql` on self-hosted and keep it in `deploy.sh`'s pre-flight as an operator step (not `db push`) | M |
| P3-11 | Search/library: rebuild the ranked RPC with `EXECUTE … USING` and measure at full size before applying (LIB-11); hamza normalisation in title hits; law-status filter; `enactments` route behind `libraryGate`; decrees error handling; autocomplete paywall consistency; law pages SSR shell + `generateMetadata` + JSON-LD + DB-backed sitemap + real 404 (LT-P8a–c, SH-LIB-14) | L |
| P3-12 | Docs: archive `REMAINING_WORK.md`, `IMPLEMENTATION_STATUS.md`, `supabase/APPLY_MIGRATIONS_GUIDE.md`, `LIBRARY_PROGRESS_TRACKER.md` with pointers; fix `DEPLOY_AND_SMOKETEST_RUNBOOK.md`/`ARCHITECTURE.md` (`db push`), E2/E3/E5 items; stale code comments listed by the verifiers | S |

### P4 — Operations before a public launch (operator checklist lives outside git)

1. Rotate every secret exposed on 2026-09-25 (the cutover guide §2.8; never let `generate-keys.sh` write `.env` on a live DB) and the cloud DB password, then pause the cloud project.
2. Reverse DNS for the mail host; RAM upgrade (search degrades under swap); re-measure `section=all` afterwards.
3. Off-server backup copy weekly + **one restore drill recorded** (OWN-195); keep 7 days on-server.
4. A second Supabase project for `scripts/uat/*` (the allow-list is the only thing keeping the six service-role writers off production).
5. Monitoring: uptime probe on `/api/library/stats`, pm2 log rotation, nginx 5xx alert; `_verify.sql` after every migration.
6. Prove e-mail: signup confirmation, invitation, password reset (P0-22) from the self-hosted SMTP; PTR + SPF/DKIM already set.
7. n8n: decide (Q on channels) whether an instance is hosted; until then remove the 23 unread `N8N_*`/`EVOLUTION_*` lines from `.env.example` and the n8n README drift.
8. Owner's browser round on the 12 clean accounts (Q ١١٤) → fixes → randomise the shared test password.
9. Repo visibility (Q ٢٦): until he answers, nothing new that names the server enters git.

### P5 — Product build, gated by owner decisions

| decision | unlocks | size |
|---|---|---|
| **١ payment provider** (+ ٢٤ founder approval, ٣٥ licence-before-payment) | provider adapter, checkout, signed idempotent webhook, `payments`/`subscriptions`/`receipts` writes, founder offers (3 tiers: seat counters, campaign/returnTo, badges, 4 works + 1 tool, 15 % discount, monthly invite cycles, guest pass, founder room, verified reviews), points purchase, coupons redeem RPC, client receipts/payment history | XL (everything except the adapter can start now behind the flag) |
| **٣ trust ledger** (default: outside the platform) | finance module (invoices, expenses, VAT, P&L, statements) — or nothing | XL |
| **١٦ + build-vs-delete per page** | the P1-gated pages: firm HR (attendance, timesheets, trainees hours), governance rules, shared rooms, templates, health-check, admin analytics (ai-usage telemetry, reports, security detection), payouts/escrow/disputes, government modules (cases/compliance/reports/counsel), ngo modules (volunteers/programs/finance/reports/board/awqaf), micro requirements register, business departments/employee-contracts/reviews/kanban/health-check | per page M–L |
| **٦٠ data-layer paywall** | serve paid corpus through the server, revoke anon on paid tables, migration plan on staging | L |
| **٤٤ LLM provider/budget** | real AI behind the template tools + `direction-support` spec (٦٣) | XL |
| **٤٧/٨ circuits directory** | import the 2,192-entry archive with `source`/`verified_at`, public page + Schema.org, `/ai/procedures` search | L |
| **٢١ / ٦١ invitations and affiliate** | invitation producer, referral attribution (`/join?ref`), commission model | M–L |
| **beta scope** (marketplace, provider intake, government/ngo/micro/provider public listing) | provider RLS + claim flow, marketplace API + escrow only after ١, directories | L–XL |
| **٣٤ mobile** | Capacitor config/platforms or remove the scripts/deps | M |
| **٢ hosting/PDPL** | data classification + application-level encryption | XL |

### P6 — Cleanup

Dead code (`_data/analytics.ts`, `casesStore.ts` fixtures, `NewCaseModal/*` 774 lines, `paymentAdapter.ts`, wallet/activity fixtures), duplicate routes, `next.config` redirects for `achievements`/`research`/`memo-studio`, `Skeleton.tsx` with 0 importers vs 68 `animate-pulse` sites, `#0B3D2E` literal in 384 files → token (RW-06, low), Capacitor per ٣٤.

## 4. Sequencing and size

| sprint | content | migrations | rough size |
|---|---|---|---|
| **1 (weeks 1–2)** | P0-01…28; P0-24 first; P1 *gate-now* column for every role; P1 cross-cutting: marketplace, badges, Escrow/false claims, academy C1/C2, dark-mode rescue; P0-26 CI | 7 | 2 × M-heavy weeks |
| **2 (weeks 3–4)** | P2-01…12 (profiles); P1 *wire-now* column; P1 AI honesty pass; P3-01/02 (Arabic errors, `{data,total}`) on every route touched | 4–5 | 2 weeks |
| **3 (weeks 5–6)** | P3-03…12; P4 items 1–8; the owner's browser round and its fixes; randomise test passwords | 2–3 | 2 weeks |
| **then** | P5 per decision, starting with everything of ١ that does not need the adapter | — | — |

Definition of "ready for production" at the end of sprint 3: no invented figure anywhere a signed-in user can reach; every role either real or honestly gated; all nine profile types persist what registration collects; the P0 list closed and proven by the RLS harness + route tests; `_verify.sql` green on self-hosted; gates green; the owner's round passed on the 12 accounts; ops list 1–8 done. Paid features remain behind `payments_gateway = disabled` until ١.

## 5. Verification protocol (unchanged, restated)

Every batch: GitNexus `impact()` before editing a symbol and `detect_changes()` before committing; `npm run type-check && npm run test:unit && npm run lint`; migrations through the Docker RLS harness and `rehearse-staging-order.sh`; an independent refute pass (different agent, Opus) before the owner report; owner report updated **in the same commit**; deploy only with `bash deploy.sh`; read-only REST probes after deploy; never a secret, IP, port or hardening detail in a tracked file.

## 6. What this plan deliberately does not do

- It does not choose a payment provider, a legal identity, a hosting region or an LLM vendor — those are the owner's (١, ٢٧, ٢, ٤٤).
- It does not migrate any cloud data (clean start stands) and does not touch `owner-edits` (٦).
- It does not build finance, marketplace, government/ngo modules or founder offers before the decisions in §3 P5; it makes their pages honest instead.
- It does not re-measure library latency or chapter descents (data work: LIB-18, 82 laws, 2 covers — owner content items).
