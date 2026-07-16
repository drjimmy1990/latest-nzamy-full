# Entitlements + Production Wiring — Build Log & Runbook
### سجل البناء ودليل التشغيل — نظام الصلاحيات والربط الإنتاجي

**Date / التاريخ:** 2026-07-06
**Plan:** [`docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md`](docs/superpowers/plans/2026-07-06-admin-entitlements-and-production-wiring.md)
**Spec:** [`docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md`](docs/superpowers/specs/2026-07-06-admin-entitlements-and-production-wiring-design.md)
**Verification:** `tsc` 0 errors · `next build` 392/392 pages · `eslint` 0 errors · adversarial review 0 findings.
**Commits:** `1497ff6 · e20a44a · 46ae7e0 · c7f29a0 · 597ea04 · 89ab077 · d9aa5ae · 8b4b447` (on `main`).

---

## EN — What this build delivered

A **7-phase** program that makes every paid feature admin-controllable **without a real payment gateway**, and production-wires the "schema-built, client-never-wired" surfaces. It is **more wiring than new building** — notifications, provider verification, admin tier/credit grants, and the localStorage dual-mode services already existed; this build connected them and added the missing grant layer.

### Phase-by-phase
1. **Entitlements foundation** — `entitlement_requests` table + `src/lib/entitlements.ts::grantEntitlement({userId, action:'plan'|'credits'|'wallet', tier?, amount?, durationDays?})` (writes `subscriptions` / `credit_transactions` / `wallet_transactions`, mirroring the existing admin routes) + `src/lib/notify.ts::recordNotification()` + APIs: `POST/GET /api/v1/entitlement-requests`, `GET /api/v1/admin/entitlements/requests`, `PATCH …/requests/[id]` (approve→grant+notify / reject), `POST /api/v1/admin/entitlements/grant`.
2. **Entitlement surfaces** — admin **grant editor** (`/dashboard/admin/entitlements`) + **requests queue** (`/dashboard/admin/entitlements/requests`) + `entitlementService.ts` + sidebar nav.
3. **Trust & sessions** — verified force-supabase (no fake sessions in prod) and that admin approve/reject already persist; added n8n `dispatchVerificationToN8n` + in-app notification on a verification decision; wired the previously-dead provider register file input (captures filenames → signup metadata).
4. **Notifications + store wiring** — `recordNotification` on service-request created/assigned/completed; **killed the community mock-seed merge** in supabase mode; **draft-cart** made dual-mode + lossless (new `law_draft_carts.payload jsonb`).
5. **Admin console** — wired **tickets, broadcasts, coupons, audit-log, community-moderation, payments** off their mock consts to real admin-gated routes.
6. **Content + CTAs** — real **contact** + **partners** writes; **share/[token]** server-side passcode verify (fixes the "any 6 digits" hole); **promo** + **invite** (invite accept grants a trial via `grantEntitlement`); paid CTAs (**pricing, laws/subscribe, media, micro wallet**) → `requestEntitlement()` for logged-in users.
7. **Blog CMS** — `articles` table + public read routes + admin authoring; blog list/detail + admin content page served from the DB (mock kept as fallback); seed migration for the 6 existing articles.

### How it behaves (the key idea)
- **No gateway needed.** A user hits a paid CTA → files an `entitlement_request` → admin approves in the queue → `grantEntitlement` writes the real `subscriptions`/`credit_transactions`/`wallet_transactions` row → the **existing** `access-control.ts` enforcement immediately unlocks the feature. When a real gateway arrives, "approve" becomes "charge then grant" — nothing else changes.
- **Every new GET route is resilient**: on any Supabase error it returns `{ data: [] }` (200), so pages **degrade to their mock fallback** until the migrations are applied — no crashes.

---

## AR — ماذا أنجز هذا البناء

برنامج من **٧ مراحل** يجعل كل ميزة مدفوعة قابلة للتحكم من لوحة الإدارة **بدون بوابة دفع حقيقية**، ويربط الأجزاء التي كانت جداولها جاهزة لكن الواجهة غير موصولة. معظم العمل **ربط** وليس بناءً جديدًا: الإشعارات وتوثيق المزودين ومنح الباقات/النقاط للمشرف والخدمات ثنائية الوضع كانت موجودة، وهذا البناء وصلها وأضاف طبقة المنح الناقصة.

- **الفكرة الأساسية:** المستخدم يضغط زر ترقية مدفوعة → يُنشأ **طلب** في `entitlement_requests` → المشرف يوافق من قائمة الطلبات → `grantEntitlement` يكتب صف الاشتراك/النقاط/المحفظة الحقيقي → منطق `access-control.ts` القائم يفتح الميزة فورًا. وعند توفر بوابة دفع حقيقية لاحقًا: تتحوّل "الموافقة" إلى "دفع ثم منح" دون أي تغيير آخر.
- **كل مسار GET جديد مرن:** عند أي خطأ من Supabase يُعيد `{ data: [] }` فتعرض الصفحة بيانات تجريبية احتياطية دون تعطل، إلى أن تُطبَّق الترحيلات (migrations).

---

## Runbook — apply & operate / التشغيل

### 1) Apply the new migrations (in filename order) / طبّق الترحيلات الجديدة
Run these against the Supabase project (SQL editor or CLI). Order within `20260706_*` is safe (no cross-deps):
```
supabase/migrations/20260706_reminder_flags.sql          # (from an earlier session — apply if not yet)
supabase/migrations/20260706_entitlement_requests.sql    # request queue + RLS
supabase/migrations/20260706_draft_cart_payload.sql      # law_draft_carts.payload jsonb
supabase/migrations/20260706_content_and_ops.sql         # articles, contact_messages, support_tickets, broadcasts, invitations, document_shares
supabase/migrations/20260706_articles_seed.sql           # seeds the 6 existing blog articles (idempotent)
```
> Until applied, the new admin/content pages show their mock fallback and writes will error gracefully. `coupons`, `promo_links`, `admin_audit_events`, `community_posts`, `notifications`, `subscriptions`, `credit_transactions`, `wallet_transactions` already exist from earlier migrations.

### 2) Env (unchanged from the deploy runbook) / المتغيرات
`NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND=supabase` **must** be set in production (otherwise the app runs the demo/localStorage path). `N8N_WEBHOOK_BASE_URL` optional — verification/contact n8n dispatch is inert until set.

### 3) Admin: grant an entitlement / منح صلاحية
`/dashboard/admin/entitlements` → search a user → **grant** a plan tier (+expiry days), AI credits, or wallet balance. Writes immediately; the user's tier/credits update.

### 4) Admin: review requests / مراجعة الطلبات
`/dashboard/admin/entitlements/requests` → pending tab → **approve** (for plan/library/media pick the tier to grant) or **reject**. The requester gets an in-app notification.

### 5) User: request an upgrade / طلب ترقية
Logged-in users on pricing / laws-subscribe / media / wallet CTAs now file a request and see "تم إرسال طلبك للمراجعة" instead of a dead end.

---

## Deferred / not in scope (unchanged) / مؤجل
- Real payment gateway / checkout / ledger (the whole point of the admin-grant layer is to run without it).
- Academy LMS; sector dashboards; i18n/English layer.
- Provider **binary** doc upload during registration (needs a post-auth session; the file input now captures filenames into signup metadata as a breadcrumb — full upload is a dashboard follow-up).
- Broadcast persistent delete; community true report/flag table; wallet amount-picker on top-up.

## Verification evidence / إثبات التحقق
- `npm run type-check` → 0 errors. `npm run build` → compiled, 392/392 pages. `npm run lint` → 0 errors.
- Adversarial review (4 agents: column-correctness vs migrations, envelope consistency, auth/IDOR) → **0 confirmed findings**; coupons + promo_links columns spot-checked against the migration.
- `npm run test:smoke` is flaky in this environment (cold Turbopack compile timeout on `/`); `next build` is the authoritative static gate.
