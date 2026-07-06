# Admin-Controlled Entitlements + Production Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline) — this plan is executed in-session by the author with hard gates between phases. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make every paid feature grantable/controllable from the admin panel without a real gateway, and production-wire the "schema-built, client-never-wired" surfaces so data persists server-side and everything connects end-to-end.

**Architecture:** A thin **grant layer** over the *existing* entitlement tables (`subscriptions`, `credit_transactions`, `wallet_transactions`) plus a new `entitlement_requests` request→approve queue. The app already **enforces** entitlements (`src/lib/access-control.ts`); we add no new enforcement. Everything else is **wiring** existing dual-mode services/routes to real data and removing mock-seed pollution.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (SSR `createClient` / service-role `createServiceClient`), Tailwind v4, TypeScript 5. RTL Arabic UI.

## Global Constraints
- Migration naming: `YYYYMMDD_description.sql` (newest today: `20260706_reminder_flags.sql`).
- RLS user-own pattern: `using (user_id = auth.uid())`. Admin-override pattern: `using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin'))`.
- Admin API auth: call `requireAdmin()` from `@/lib/access-control` (returns `{isAdmin, userId, error?, status?}`); on `!isAdmin` return `NextResponse.json({ error }, { status })`.
- All grant writes go through `createServiceClient()` (bypass RLS) inside admin-guarded routes — never client RLS.
- Response shape: success `NextResponse.json({ success: true, data })`; error `NextResponse.json({ error }, { status })`.
- `profiles.user_type` is the admin/role column (values: individual/lawyer/firm/corporate/micro/provider/government/ngo/admin). Tiers (`subscriptions.tier`) are free/shield/ai/pro/max/corp/enterprise.
- Gates per phase: `npm run type-check` (tsc 0), `npm run lint` (eslint 0 new errors), `npm run build` (exit 0). `detect_changes` unavailable (GitNexus MCP off) → substitute `git diff --stat` review + grep caller-analysis before editing shared symbols.
- Production must run `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`; `src/instrumentation.ts` already hard-fails boot otherwise.

## Reconciliation vs the design spec (post-sweep corrections)
The design spec (`docs/superpowers/specs/2026-07-06-...-design.md`) predates the codebase sweep. Corrections locked here:
1. **Notifications = ALREADY BUILT.** Table `notifications(id,user_id,title,body,href,read_at,created_at)` (migration `20260518_client_workflow_backend_ready.sql`), route `/api/v1/notifications` (GET/PATCH), `notificationService.ts` dual-mode, `useNotifications` Realtime hook, bell in `Navbar.tsx`, `/notifications` page. **Remaining work:** a server `recordNotification()` helper + event calls; no new table (columns suffice; type/severity stay client-side defaults).
2. **Provider verification = MOSTLY BUILT.** `verification_status` on lawyer/provider/firm/business profiles; `/api/v1/admin/verifications` GET + `[id]` PATCH (approve/reject + `admin_audit_events`); `documentService.uploadDocumentFile` (storage `documents` bucket + signed URL). **Remaining work:** wire the unwired register file-input → upload; confirm admin approve button calls PATCH (resolve agent conflict at execution); add n8n `verification` dispatch path.
3. **Tier/credit grants have routes already.** `POST /api/v1/admin/subscriptions` (cancels active, inserts new sub, updates auth metadata tier) and `POST /api/v1/admin/credits` (kind `admin_adjustment`). `grantEntitlement` consolidates these + adds wallet; existing routes stay untouched.
4. **localStorage stores already dual-mode** on `isSupabaseMode` (`communityService`/`groupService`/`researchService`/`notificationService`). **Remaining work:** kill mock-seed merges (esp. `community/page.tsx:154` `[...saved, ...ALL_QUESTIONS]` — merges regardless of mode) + wire draft-cart (has route `/api/v1/drafts/cart`, no service wrapper; `useDraftCart` is localStorage-only).
5. **force-supabase largely done.** `setDemoSession` already early-returns when `isSupabaseMode` (`useUser.ts:469`), and register pages only call it in the `else` (demo) branch. Work shrinks to verify + harden.

## Execution note (deviation from writing-plans default)
This is executed **inline by the author, same session**, not handed to a fresh engineer. So tasks below are specified at **contract level** (exact signatures, table columns, route bodies, file paths, wiring points) rather than pasting every final line; real code is written into the actual files during execution and verified by the hard gates. This is intentional for a same-session full build and keeps the plan from duplicating ~40 files of source.

---

## File Structure (created / modified)

**Created**
- `supabase/migrations/20260706_entitlement_requests.sql` — request queue table + RLS.
- `src/lib/entitlements.ts` — `grantEntitlement()` + types.
- `src/app/api/v1/entitlement-requests/route.ts` — user POST (+ GET own).
- `src/app/api/v1/admin/entitlements/requests/route.ts` — admin GET queue.
- `src/app/api/v1/admin/entitlements/requests/[id]/route.ts` — admin PATCH approve/reject.
- `src/app/api/v1/admin/entitlements/grant/route.ts` — admin direct grant.
- `src/lib/services/entitlementService.ts` — client helper to POST a request + read own.
- `src/app/dashboard/admin/entitlements/page.tsx` — user editor + grant.
- `src/app/dashboard/admin/entitlements/requests/page.tsx` — requests queue.
- `src/lib/notify.ts` — `recordNotification()` server helper.
- `src/lib/services/draftCartService.ts` — dual-mode draft-cart wrapper.
- `src/app/api/v1/contact/route.ts` — contact submit (+ `contact_messages` table migration).
- `supabase/migrations/20260706_content_and_ops.sql` — `articles`, `contact_messages`, `support_tickets`, `coupons`(if absent), `broadcasts` tables + RLS.
- `src/app/api/v1/admin/articles/route.ts` + `[id]/route.ts` — Blog CMS.
- `src/app/api/v1/blog/route.ts` + `[slug]/route.ts` — public blog read.
- (Phase 5 as-needed) admin routes: `tickets`, `broadcasts`, `coupons`, `moderation`, `audit-log`.

**Modified (shared — grep callers before editing)**
- `src/lib/n8n/dispatch.ts` — add `verification` event path.
- `src/app/register/provider/components/Steps.tsx` + `register/provider/page.tsx` — wire file input.
- `src/app/community/page.tsx` — gate `ALL_QUESTIONS` merge on `!isSupabaseMode`.
- `src/hooks/useDraftCart.ts` — read/write via `draftCartService` in supabase mode.
- Client CTAs: `pricing`/`wallet`/`laws/subscribe`/`media` pages → `entitlementService.requestEntitlement`.
- Admin pages (Phase 5): `team`, `subscriptions/coupons`, `subscriptions/payments`, `tickets`, `community/moderation`, `broadcasts`, `audit-log`, `content/articles` → real routes.
- Blog: `blog/page.tsx` + `blog/[slug]/page.tsx` → read from `/api/v1/blog`.

---

## Phase 1 — Entitlements foundation (§A core)

**Interfaces produced (consumed by Phases 2 & 5):**
- `entitlement_requests` row: `{ id, user_id, kind:'plan'|'credits'|'wallet'|'library'|'media', requested_ref?, amount?, note?, status:'pending'|'approved'|'rejected', decided_by?, decided_at?, created_at }`.
- `grantEntitlement(input: GrantInput, admin: SupabaseClient): Promise<GrantResult>` where `GrantInput = { userId: string; action: 'plan'|'credits'|'wallet'; tier?: ServerTier; amount?: number; durationDays?: number; note?: string }`, `GrantResult = { ok: true; action; detail } | { ok: false; error: string }`.

- [ ] **1.1** Write migration `20260706_entitlement_requests.sql`: create table (cols above; `id uuid default gen_random_uuid()`, `user_id → auth.users on delete cascade`, checks on `kind`/`status`), enable RLS, policies: insert-own (`with check user_id = auth.uid()`), select-own, admin-select-all, admin-update-all. Index on `(status, created_at desc)`.
- [ ] **1.2** Write `src/lib/entitlements.ts`: `grantEntitlement`. `plan` → mirror `POST /api/v1/admin/subscriptions` insert (read that route first; cancel active subs for user, insert new `subscriptions` row `status='active'`, `tier`, `current_period_end = now()+durationDays||30d`, then `auth.admin.updateUserById(userId,{ user_metadata:{ tier } })`). `credits` → mirror `POST /api/v1/admin/credits` (read balance from `lawyer_profiles.credit_balance` else last `credit_transactions.balance_after`; insert `credit_transactions{kind:'admin_adjustment', amount, balance_after}`; update `lawyer_profiles.credit_balance` if row exists). `wallet` → insert `wallet_transactions{kind:'credit', amount, description}`.
- [ ] **1.3** Write `POST /api/v1/entitlement-requests` (auth user via `createClient().auth.getUser()`; insert own request; validate `kind`) + `GET` (own rows). 
- [ ] **1.4** Write `GET /api/v1/admin/entitlements/requests` (`requireAdmin`; `createServiceClient`; filter `?status=`).
- [ ] **1.5** Write `PATCH /api/v1/admin/entitlements/requests/[id]` (`requireAdmin`; body `{action:'approve'|'reject', grantAction?, tier?, amount?, durationDays?}`; on approve → `grantEntitlement` then set `status/decided_by/decided_at`; on reject → set status only; `recordNotification` to requester — added Phase 4, guard optional-chain until then).
- [ ] **1.6** Write `POST /api/v1/admin/entitlements/grant` (`requireAdmin`; body `GrantInput`; call `grantEntitlement`; return result).
- [ ] **1.7** Gate: `type-check` + `lint` + `build`. Commit `feat(entitlements): request queue table + grantEntitlement lib + APIs`.

## Phase 2 — Entitlement surfaces (§A UI + client CTAs)

**Consumes:** Phase-1 routes + `grantEntitlement`.

- [ ] **2.1** `src/lib/services/entitlementService.ts`: `requestEntitlement({kind,requested_ref?,amount?,note?})` → POST; `getMyRequests()` → GET. Client-safe (fetch).
- [ ] **2.2** Admin `dashboard/admin/entitlements/page.tsx`: user picker (by email/id via existing `/api/v1/admin/users` if present, else id input), show current tier (`/api/v1/admin/stats` or direct), controls: set tier+expiry (grant `plan`), add credits, add wallet → `POST /api/v1/admin/entitlements/grant`. Match existing admin card UI (`useTheme`, rounded-2xl).
- [ ] **2.3** Admin `dashboard/admin/entitlements/requests/page.tsx`: pending list (GET queue), approve (with grant-override inputs) / reject (PATCH). Status badges per existing pattern.
- [ ] **2.4** Client CTAs → request: `pricing` subscribe, `wallet` top-up, `laws/subscribe`, `media` subscribe call `requestEntitlement` + toast `تم إرسال طلبك للمراجعة`. Keep `payments_gateway`-disabled banner where not requestable. (Resolve pricing CTA: currently anchor→`/register/client?plan=`; for logged-in users convert to request button.)
- [ ] **2.5** Gate + commit `feat(entitlements): admin editor + requests queue + client request CTAs`.

## Phase 3 — Trust & sessions (§B1 + §B2)

- [ ] **3.1** Verify/harden force-supabase: confirm `setDemoSession` early-return (`useUser.ts:469`) + register `else`-branch gating; add an explicit `if (!isSupabaseMode)` guard around any residual client session fabrication. grep `setDemoSession(` callers first.
- [ ] **3.2** Provider doc upload: add `onChange` to the Step-3 file input (`register/provider/components/Steps.tsx:322`) → state; on submit in supabase mode call `documentService.uploadDocumentFile` → store returned path on `provider_profiles` (add `verification_doc_path text` column via migration if absent) and set `verification_status='pending'`.
- [ ] **3.3** Resolve the admin-approve conflict: read `adminService.approveVerification/rejectVerification` — if it only mutates local state, wire it to `PATCH /api/v1/admin/verifications/[id]`. Confirm the page refetches after.
- [ ] **3.4** n8n verification dispatch: extend `src/lib/n8n/dispatch.ts` `resolvePath` with a `verification.submitted` → `verification` path; fire best-effort on provider submit (try/catch, mirrors service-request dispatch).
- [ ] **3.5** Gate + commit `feat(trust): provider doc upload wiring + admin approve wire + n8n verification dispatch`.

## Phase 4 — Notifications helper + store wiring (§B3 + §B4)

- [ ] **4.1** `src/lib/notify.ts`: `recordNotification({userId,title,body,href?}, admin?)` → insert into `notifications` via service-role. Idempotent-friendly (no dedupe needed now).
- [ ] **4.2** Call `recordNotification` on: service-request created/assigned/completed (in the existing route handlers next to `dispatchToN8n`), and entitlement approve/reject (Phase-1.5 hook now concrete).
- [ ] **4.3** Kill community mock merge: `community/page.tsx:154` → `const questions = isSupabaseMode ? savedQuestions : [...savedQuestions, ...ALL_QUESTIONS]`. Verify `communityService` already returns DB rows in supabase mode.
- [ ] **4.4** Draft-cart wiring: create `draftCartService.ts` (`getCart()`/`saveCart(items)` → `/api/v1/drafts/cart` GET/PUT in supabase mode, localStorage else); refactor `useDraftCart` to use it. grep `useDraftCart(` callers first.
- [ ] **4.5** Gate + commit `feat(wiring): recordNotification on events + kill community mock merge + draft-cart dual-mode`.

## Phase 5 — Admin console wiring (§C)

Priority order (highest operational value first). Each: create table (if needed) + admin route + wire page off its mock const. Where a full backend is out of proportion, wire read-path to real data and mark write-path explicitly as scaffold in-code + in docs (no silent fakes).

- [ ] **5.1** Coupons: `coupons` table already exists (migration `..._003_subscriptions_billing`); build `GET/POST/PATCH /api/v1/admin/coupons`; wire `subscriptions/coupons/page.tsx` off `INITIAL_COUPONS`.
- [ ] **5.2** Payments ledger: wire `subscriptions/payments/page.tsx` to a real read of `payments` + `wallet_transactions` + `credit_transactions` (`GET /api/v1/admin/payments`).
- [ ] **5.3** Tickets: `support_tickets` table (migration `20260706_content_and_ops.sql`) + `GET/POST/PATCH /api/v1/admin/tickets`; wire `tickets/page.tsx` off `TICKETS`.
- [ ] **5.4** Community moderation: `GET/PATCH /api/v1/admin/community/moderation` (reads `community_posts`/reports; action updates status); wire `community/moderation/page.tsx` off `INITIAL_REPORTS`.
- [ ] **5.5** Broadcasts: `broadcasts` table + `GET/POST /api/v1/admin/broadcasts`; wire `broadcasts/page.tsx`.
- [ ] **5.6** Audit-log: `GET /api/v1/admin/audit-log` reading existing `admin_audit_events`; wire `audit-log/page.tsx` off `LOGS`.
- [ ] **5.7** Team/RBAC: wire `team/page.tsx` off `INITIAL_TEAM` to the existing `/api/v1/admin/teams` (GET/POST/PATCH).
- [ ] **5.8** Add nav entries for `entitlements` + `entitlements/requests` in the admin nav/sidebar.
- [ ] **5.9** Gate + commit per 2–3 pages `feat(admin): wire <pages> to real routes`.

## Phase 6 — Content pages (§D part 1)

- [ ] **6.1** Contact: `contact_messages` table + `POST /api/v1/contact` (store; best-effort n8n email dispatch); replace `contact/page.tsx` `setTimeout` with real fetch.
- [ ] **6.2** Share token: server-verify passcode — `POST /api/v1/share/[token]/verify` checks token→document + passcode server-side (replace client `passcode.length===6`); read from `attachments`/`shares` (create `document_shares` table if none — check first).
- [ ] **6.3** Promo: `GET /api/v1/promo/[slug]` reads `promo_links` (exists) → replace `getMockPromoData`.
- [ ] **6.4** Invite: `POST /api/v1/invite/[code]/accept` server-side validate + `grantEntitlement` trial (plan) — replace client `validateInviteCode`; create `invitations` table if none.
- [ ] **6.5** Partners: application form → `POST /api/v1/contact` (kind `partner`) or `partner_applications` table.
- [ ] **6.6** Gate + commit `feat(content): contact/share/promo/invite/partners real writes`.

## Phase 7 — Blog CMS (§D part 2)

- [ ] **7.1** `articles` table (in `20260706_content_and_ops.sql`): `(id uuid, slug unique, title, title_en, excerpt, excerpt_en, body, category, author_id, cover, status:'draft'|'published', published_at, views int, featured bool, created_at, updated_at)` + RLS (public read `status='published'`; admin write).
- [ ] **7.2** `GET /api/v1/blog` (list published) + `GET /api/v1/blog/[slug]` (one) — public.
- [ ] **7.3** Admin `GET/POST /api/v1/admin/articles` + `PATCH/DELETE [id]`; wire `content/articles/page.tsx` off `PLATFORM_BLOG_ARTICLES` (draft/publish).
- [ ] **7.4** Unify blog: `blog/page.tsx` + `blog/[slug]/page.tsx` read from `/api/v1/blog` (remove the two divergent consts `ARTICLES` + `PLATFORM_BLOG_ARTICLES`; keep a seed migration inserting the current 6 articles so content survives).
- [ ] **7.5** Gate + commit `feat(blog): articles table + admin authoring + blog served from DB`.

## Phase 8 — Verify, review, docs
- [ ] **8.1** Adversarial review workflow over the full diff (connectivity, RLS, service-role misuse, dead imports).
- [ ] **8.2** Final gates: tsc 0 / lint 0 / build 0 / `npm run test:smoke`.
- [ ] **8.3** Update MD docs: `IMPLEMENTATION_STATUS`, `PRODUCT_COMPLETENESS_BACKLOG` (tick built items), `NEXT_STEPS`, `DOCUMENTATION_INDEX`, spec status → Implemented; a new `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` (AR/EN) listing every table/route/page + a migration-apply + admin-usage runbook. Update memory.
- [ ] **8.4** Final commit + summary of done vs deferred.

## Acceptance (per spec §4)
- Admin can grant tier/credits/wallet + approve a request; user paid CTA creates a request; registration always makes a real account in prod; notifications persist and fire on events; community/draft-cart read/write their tables; admin targeted pages read/write real data; contact/share/promo/invite do real writes; blog served from `articles` with admin authoring. tsc/lint/build green each phase.

## Deferred (unchanged non-goals)
Real payment gateway/checkout; Academy LMS; sector dashboards; i18n/English layer.
