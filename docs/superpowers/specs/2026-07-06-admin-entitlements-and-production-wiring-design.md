# Design — Admin-Controlled Entitlements + Production Wiring

**Date:** 2026-07-06 · **Status:** Approved (design), pending implementation plan
**Backlog source:** [`PRODUCT_COMPLETENESS_BACKLOG.md`](../../../PRODUCT_COMPLETENESS_BACKLOG.md) · **Beta scope:** [`PROJECT_STATUS_REVIEW_2026-07-06.md`](../../../PROJECT_STATUS_REVIEW_2026-07-06.md)

## 1. Problem & goals

The payment gateway is not finished and no provider is chosen. Everything monetized (plans, wallet, AI credits, library/content access) is currently either a dead-end CTA or hidden behind the `payments_gateway=disabled` admin flag. Separately, large parts of the product are wired to browser **localStorage** instead of their (already-migrated) Supabase tables, so they are not production-ready.

**Goals**
1. Make every paid feature **grantable/controllable from the admin panel** without a real gateway, in a way that swaps to a real gateway later with no client change.
2. **Production-wire** the "schema built, client never wired" surfaces so data persists server-side.
3. Wire the mock **admin console** pages to real routes/tables.
4. Make the **content/marketing** pages real (+ a Blog CMS).

**Non-goals (explicitly out of scope for this effort)**
- A real payment provider / checkout / webhook / ledger (deferred until a provider is chosen).
- The **Academy LMS** (courses/lessons/quizzes/certificates) — largest single build, deferred.
- Sector dashboards (firm/business/provider/micro/ngo/gov) — post-monopoly-mode, deferred.
- i18n / English layer — deferred.

## 2. Key decisions (locked with owner)
- **Entitlement flow = BOTH** a manual admin grant editor AND a user-initiated request→approve queue.
- **Content scope = marketing/transactional pages + Blog CMS** (not Academy LMS).
- Production must **force `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase`** — no demo/localStorage fake sessions.

## 3. Architecture

### §A — Admin-controlled entitlements (foundation)

The app already **enforces** entitlements in `src/lib/access-control.ts`:
- `getUserTier(userId)` → newest `subscriptions` row where `status='active'` → `tier`.
- `checkCreditBalance` → `lawyer_profiles.credit_balance` / `credit_transactions.balance_after`.
- `checkLibraryAccess` → `platform_settings` (`library_free_items`, `library_whitelisted_laws`, `library_free_article_limit`).
- `checkAccess` / `checkTierLimit` → tier rank vs `SERVER_FEATURE_GATES` / `platform_settings.tier_limits`.

So we only add a **grant layer** over existing tables. No new enforcement.

**New table:** `public.entitlement_requests`
```
id            uuid pk default gen_random_uuid()
user_id       uuid not null references auth.users(id) on delete cascade
kind          text not null check (kind in ('plan','credits','wallet','library','media'))
requested_ref text                 -- what the user asked for (plan name / "library" / "media" / label)
amount        numeric              -- for credits/wallet requests
note          text                 -- user's message
status        text not null default 'pending' check (status in ('pending','approved','rejected'))
decided_by    uuid references auth.users(id)
decided_at    timestamptz
created_at    timestamptz not null default now()
```
RLS: user can `insert` + `select` own rows; admin (`profiles.user_type='admin'`) can `select`/`update` all. Writes to the target tables happen via service-role in the API, not via user RLS.

> **Request kind vs grant kind (important):** `entitlement_requests.kind` is the user's *ask* (may be `library`/`media`). The **grant** only ever writes three concrete things — a **plan tier**, **credits**, or **wallet** — because that is all the app enforces. A `library` or `media` request is fulfilled by granting the **plan tier** that unlocks it (pro+ already unlocks the full library via `checkLibraryAccess` step 4). There is **no per-user library-item grant** — that would require making the item free platform-wide (`library_free_items` is global), which is wrong for one user. Platform-wide "always-free items" stays the **existing separate admin toggle**, untouched.

**Shared grant function** — `grantEntitlement({ userId, action, tier?, amount?, durationDays? }, adminClient)` in a new `src/lib/entitlements.ts`, where `action ∈ {plan, credits, wallet}`:
- `plan` → upsert a `subscriptions` row (`tier`, `status='active'`, `current_period_end = now()+durationDays`), superseding the prior active one.
- `credits` → insert a `credit_transactions` row (+ update `lawyer_profiles.credit_balance` if present).
- `wallet` → insert a `wallet_transactions` row (credit).
Both the manual editor and the approve-action call this one function. Approving a `library`/`media` request = admin picks a `plan` tier to grant.

**APIs**
- `POST /api/v1/entitlement-requests` — auth user creates a request `{kind, requested_ref?, amount?, note?}`.
- `GET /api/v1/admin/entitlements/requests` — admin queue (filter by status).
- `PATCH /api/v1/admin/entitlements/requests/[id]` — admin `{action:'approve'|'reject', ...grantOverrides}` → on approve calls `grantEntitlement`, sets status/decided_by/decided_at.
- `POST /api/v1/admin/entitlements/grant` — admin direct grant → `grantEntitlement`.
All admin routes use `requireAdmin()`.

**Admin UI**
1. **User entitlements editor** — a panel on the admin user detail (or `dashboard/admin/entitlements`): show current tier + set tier/expiry (grant `plan`), add wallet, add AI credits. Calls `grantEntitlement`. (Platform-wide "always-free library items" remains the existing separate admin toggle, not part of the per-user editor.)
2. **Requests queue** — `dashboard/admin/entitlements/requests`: pending list, approve/reject.

**Client CTAs** (stop being dead-ends)
- `pricing` subscribe, `wallet` top-up, `laws/subscribe`, `media` subscribe → `POST /api/v1/entitlement-requests` + toast "تم إرسال طلبك للمراجعة." Keep the `payments_gateway`-disabled banner for anything not requestable.

**Later swap:** real gateway → the "approve" step becomes "charge then grant"; enforcement + client CTAs unchanged.

### §B — Wave-1 production wiring (Phase 1)
1. **Kill demo fake-session:** gate `setDemoSession` in `register/client` + `register/provider` + `useUser` so production always creates a real Supabase account (`isSupabaseMode` guard already exists — apply on the register success path).
2. **Provider verification:** wire the dead `<input type=file>` in `register/provider` Step 3 → Supabase Storage → `provider_profiles` doc path + `verification_status` column (migration); wire admin `provider-verification/{page,firms}` to the existing `/api/v1/admin/verifications` route; fire the built n8n `/verification` webhook on submit.
3. **In-app notifications:** new `public.notifications` table `(id,user_id,type,title,body,link,read,created_at)` + RLS (own rows) + `recordNotification()` helper called on service-request/chat/entitlement events + `GET/PATCH /api/v1/notifications` + point the bell + `/notifications` page at it (replace `notificationsStore` localStorage).
4. **localStorage → existing tables** (sub-phase): community (`community_posts/answers/votes`), smart-folders (`smart_folder_items`), research collector (`research_sessions/items`), client groups (`groups/members/invitations`), draft-cart (`law_draft_carts`). For each: switch the store/service default from localStorage to the Supabase API; remove mock-seed merges.

### §C — Admin console wiring (Phase 2)
Wire the ~20 mock admin pages. Buckets:
- **Wire to existing route:** provider-verification (`/api/v1/admin/verifications`), team/RBAC (`/api/v1/admin/teams`), ai-usage/credits (`/api/v1/admin/credits`), subscriptions coupons/payments.
- **Build route + table:** content/articles (ties to §D Blog CMS), tickets (`support_tickets`), community moderation, financial ops (escrow/disputes/payouts/revenue), audit-log, broadcasts, sector-profiles, reports (real aggregation).
- The **entitlements editor + requests queue** (§A) are new admin surfaces added here.
Priority: the tools needed to operate the beta + the entitlement queue first.

### §D — Content pages + Blog CMS (Phase 3)
- **Marketing/transactional:** contact form → real `POST /api/v1/contact` (store + n8n email); pricing → entitlement request (§A); `share/[token]` → token→document lookup + real passcode verify + approve/notes/download writes; `promo/[slug]` → real promo record; `invite/[code]` → server-side invite validate/accept + trial grant via `grantEntitlement`; partners → application form + submission.
- **Blog CMS:** `public.articles` table `(id,slug,title,title_en,body,category,author_id,cover,status,published_at,views,featured)` + RLS (public read published; admin write) + admin authoring UI (draft/publish) + unify `blog/page` list and `blog/[slug]` detail onto the table (remove the two divergent mock consts).

## 4. Phasing & acceptance

| Phase | Scope | Acceptance |
|-------|-------|-----------|
| **1** | §A entitlements + §B (force-supabase, provider verification, notifications, localStorage→DB) | Admin can grant a tier/credits/wallet + approve a request; a user's paid CTA creates a request; registration always makes a real account; notifications persist; the 5 localStorage stores read/write their tables. tsc/eslint/build green each step. |
| **2** | §C admin console wiring | Each targeted admin page reads/writes real data (route + table); no `INITIAL_*`/const-only admin surfaces in the targeted set. |
| **3** | §D content + Blog CMS | Contact/share/promo/invite/partners do real writes; pricing → request; blog served from `articles` with admin authoring. |

Each phase: `gitnexus_impact` before editing shared symbols (`grantEntitlement`, `access-control`, `useUser`), `tsc --noEmit` + `eslint` + `next build` green, `detect_changes` before commit, commit per coherent chunk.

## 5. Data model additions (summary)
- `entitlement_requests` (§A)
- `notifications` (§B.3)
- `provider_profiles.verification_status` + doc path (§B.2)
- `support_tickets`, financial-ops tables (escrow/disputes/payouts), `audit_log`, `broadcasts` (§C — as needed)
- `articles` (§D)

## 6. Security notes
- All grant writes go through service-role in admin-guarded routes (`requireAdmin`), never client RLS.
- `entitlement_requests` RLS: users cannot set `status`/`decided_*` — only admin PATCH can.
- Forcing supabase mode removes the client-side demo role bypass entirely in production.
- `share/[token]` passcode must be verified server-side (not "any 6 digits").

## 7. Testing
- Unit-ish: `grantEntitlement` writes the right rows per kind; `getUserTier` reflects a granted plan.
- Flow: user request → admin approve → tier changes → gated feature unlocks.
- Gates: tsc 0 / eslint 0 / build exit 0 per phase; `detect_changes` in scope.
