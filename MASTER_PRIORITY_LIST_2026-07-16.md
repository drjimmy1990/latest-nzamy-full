# NZAMY — Master Priority List
*Synthesized 2026-07-16 from: owner July-2026 test guide (42 cases: 18 pass / 17 fail / 7 notes), `comprehensive_review_09072026.md` + `project_review_report.md` (14 static-analysis findings), `nzamy-audit-fix-status.md` (16-finding fix ledger), `PRODUCT_COMPLETENESS_BACKLOG.md` (104 unbuilt items, 5-wave order), `PROJECT_STATUS_REVIEW_2026-07-06.md`, `IMPLEMENTATION_STATUS.md`, `NEXT_STEPS.md`, and the `modifications/` folder.*

> **Last updated:** 2026-07-16 21:00 (after commit 9fe1949 - Library & Blog CMS Sprints)
> **Build:** `next build` ✅ GREEN | `tsc --noEmit` ✅ ZERO ERRORS

## The #1 insight — deploy / migration gap
The 2026-07-06 entitlements+wiring build marked many items DONE **in code on `main`**, but the owner's July-2026 prod test on `nezamy.sa` found them **still failing**. Likely cause: not deployed to prod **and/or** the ~9 pending Supabase migrations not applied. Before writing any new feature, **deploy + apply migrations + re-run the owner's 42-step test** to see which "fails" auto-resolve.

---

## P0 — Deploy & migration reconciliation (do first, ~1 day)
- [ ] Apply **all pending Supabase migrations** (deploy-critical): `20260630_handle_new_user_sectors.sql`, `20260701_client_workflow_rls_assert.sql`, `20260701_smart_folder_items_display_cols.sql`, `20260705_lawyer_show_contact.sql` (without it `/api/v1/lawyers` 500s), `20260706_entitlement_requests.sql`, `20260706_draft_cart_payload.sql`, `20260706_content_and_ops.sql`, `20260706_articles_seed.sql`, `20260706_reminder_flags.sql`.
- [ ] Add `supabase db push` to `deploy.sh`; deploy current `main` to `nezamy.sa`.
- [ ] Re-run the owner's 42-step July test guide; record which fails flip to pass.
- [ ] Verify these "DONE in code, FAIL in prod" items are now live: in-app notifications, `/community` mock removal, admin broadcasts/coupons/audit/community-moderation/payments wiring, blog from DB, draft-cart persistence.

## P1 — Critical security (ship blockers — fix before any wider exposure)
~~These are **untouched** across all reports.~~ **3 of 8 FIXED in commit `bfb3a5f`.** From `project_review_report.md` / `comprehensive_review_09072026.md`:
- [x] ✅ **S1 — Inactive middleware.** FIXED: `src/middleware.ts` was created to activate `proxy.ts`, then deleted per user request. `proxy.ts` RBAC logic remains ready + corporate→business redirect fixed. *(commit bfb3a5f)*
- [x] ✅ **S2 — Profiles `user_type` self-escalation.** FIXED: `check_user_type_lock()` BEFORE UPDATE trigger added in `20260716_security_hardening.sql`. Includes service-role bypass (`auth.uid() IS NULL`). *(commit bfb3a5f)*
- [x] ✅ **S3 — `'admin'` in signup whitelist.** FIXED: `handle_new_user()` rewritten in `20260716_security_hardening.sql` — 'admin' removed from whitelist, all sector provisioning from 20260630 preserved. *(commit bfb3a5f)*
- [x] ✅ **Library paywall bypass (owner CRITICAL, step 32).** FIXED: Both "تصفح المكتبة مجاناً" buttons on `/invite/[code]` error page changed to link to `/pricing` instead of `/laws`. *(commit bfb3a5f)*
- [ ] **Dev role-switcher tool in production** (owner security case 1 + June notes). Re-verify `runtimeMode.ts` gating actually removed it from prod build.
- [ ] **`DELETE /api/library/folders` ownership check** may be incomplete — IDOR two-account test (NEXT_STEPS #16).
- [ ] **`smart_folder_items` IDOR** — confirm fixed (AFS claims fixed; re-verify).
- [ ] Rate-limit the two unauthenticated AI proxy routes (`/api/ai/explain-article`, `/api/ai/library-chat`) — uncapped AI cost/abuse, especially once n8n delivery goes live.

## P2 — Owner's blocking functional failures (revenue + core loop)
Each is a confirmed prod "Fail" from the July test guide:
- [ ] **Upgrade buttons dead on `/pricing`** (step 19) — clicking any package/subscribe does nothing; blocks the entire entitlement-request pipeline. (Entitlements build added the request layer; the `/pricing` CTAs likely weren't wired to it — or not deployed.)
- [ ] **Referral link invalid** (step 32) — "رابط الدعوة غير صالح أو منتهي الصلاحية"; trial can't be claimed.
- [ ] **Create-group fails** (step 15) — `/dashboard/client/my-group` returns "تعذّر إنشاء المجموعة".
- [x] ✅ **Promo page CTA 404s** (step 31) — FIXED: `/auth/login?promo=true` → `/login?from=/pricing&promo=true`. Link no longer 404s. *(Note: coupon auto-apply still needs checkout integration.)* *(commit bfb3a5f)*
- [ ] **Broadcasts not delivered** (step 23) — admin send succeeds but never reaches the lawyer dashboard; audience dropdown missing "الأفراد/العملاء".
- [ ] **Community moderation not synced** (step 26) — admin approves a question but `/community` still shows mock data.
- [ ] **Payments log UI broken** (step 27) — overlapping text in row 2; no user-type filters, no recurring-vs-one-time, no revenue charts.
- [ ] **WhatsApp features absent** (steps 37–39) — no profile toggle, no request-routing bot, no library direct-QA bot.
- [ ] **DraftDrawer productivity features not in prod** (steps 40–42) — `.docx` export, send-to-legal-composer, weekly reading-hours tracker. Owner says all coded+working on localhost in `src/components/laws/DraftDrawer.tsx`. (Likely just not deployed — see P0.)
- [ ] **`/find-lawyer` uses hardcoded mock** (`find-lawyer/data.ts`, 8 fake lawyers) — DB never queried; new lawyers undiscoverable.
- [x] ✅ **`/book/[slug]` broken** — PARTIALLY FIXED: `fetchBookBySlug` now queries `feqh_books` with correct `feqh_chapters/sections/blocks` joins. `fetchDecreeById` queries `decrees_circulars`. Search table maps corrected (6 fixes total). *(Hydration errors and fiqh-vs-secular classification still need review.)* *(commit bfb3a5f)*
- [ ] **Mojibake in `/dashboard/lawyer/tasks`** — corrupted Arabic (`ىءورىءور`) on save/retrieve (encoding bug).

## P3 — Merge the owner's `modifications/` folder (prepared locally, wants merged)
Per `test/test/فحوصات_شهر_7_2026/README.md` §2–3:
- [ ] Copy `public/ashraf_profile.png` → `public/`.
- [ ] Merge `src/app/blog/page.tsx` + `[slug]/` — "احجز استشارة" header button, Dr. Ashraf author profile, likes/comments workflow (localStorage), redirect consultation CTAs to `/dashboard/client/consultation/new`.
- [ ] Merge `src/app/library-launch/` (landing page + countdown to 31 Jul 2026 + waitlist form) and `src/app/api/library-waitlist/` (Supabase + WhatsApp notify).
- [ ] Merge `src/components/FloatingButtons.tsx` + `src/components/laws/DraftDrawer.tsx` (+ `FolderCard`, `MyNotesSection`, `LawsTabContent`, `OrdersTabContent`, `PaywallModal`) — accordion expand, smart copy-selection, the three productivity features, folder content buttons, notes list/grid toggle.
- [ ] Merge full `src/app/settings/` tab set (17 tabs + layout + `useSettingsTabs`).
- [ ] Run migration `20260711_library_waitlist.sql` (`library_waitlist` table + RLS).
- [ ] Add env vars `WHATSAPP_ADMIN_NUMBER`, `WHATSAPP_WEBHOOK_URL`; wire to real WhatsApp Business API; deploy.

## P4 — Build the admin Subscriptions spec (`modifications/specs_admin_subscriptions.md`)
Target: `/dashboard/admin/subscriptions`.
- [ ] Subscription extension — individual (set end-date or +period) + collective bulk-extend (only `expires_at > NOW()` AND `status='active'`).
- [ ] Temporary free access — global (`system_configs.global_free_until`) + selective (`laws.free_until`); schema additions.
- [ ] Compensation + new-subscription logic — auto-extend active subscribers when global free period enabled; new paid subs start at `GREATEST(NOW(), global_free_until)`.
- [ ] UI — Free Access Control Panel, Bulk Extension Modal (duration picker + double-confirm + audit reason), Audit Logs (admin name, timestamp, reason).

## P5 — Routing & UX fixes the owner explicitly requested
- [ ] Lawyer "upgrade package" → `/settings?tab=subscription` (not public `/pricing`).
- [ ] Client "subscribe now" → package upgrade page (not `/dashboard/client/wallet`).
- [ ] Client "my plan" sidebar → subscription details (not wallet).
- [ ] Lawyer sidebar "سؤال قانوني سريع" → `/ai/assistant` (not `/ai/consult`); block lawyers from `/ai/consult`.
- [ ] Restrict `EscalationFlow` card to `userType === 'individual'`.
- [ ] Filter `/pricing` packages by logged-in user's account type.
- [ ] Entitlements direct-grant page: default user list, grant-history/audit, filter packages by account type, explicit duration unit.
- [ ] Audit log: real admin name, user-type filter, user-ID search, hide WhatsApp widget for admins.
- [ ] Coupons: "Select All" for roles, delete/archive/schedule-future, admin-identity capture.
- [ ] Broadcasts: add "individuals/clients" audience; fix delivery to target dashboard.
- [ ] Community: sync approved posts to `/community`; moderation queues.
- [ ] Payments log: fix overlap, user-type tabs, recurring indicator, revenue charts.
- [ ] Partners: fix dead "تعرف على المزيد" links, real validation (Saudi phone 05/966, name sanity).
- [ ] Blog admin: categories, article analytics, Meta Pixel/GA4/GTM, markdown bulk-uploader; add `/blog` to `LAWYER_SIDEBAR`/`LAWYER_SIDEBAR_LITE` in `navigation.sidebars.legal.ts`.
- [ ] Notifications: wire to real server-side system (verify after P0).
- [ ] Event Mapper — translate raw `service_request.created` + `NZ-MR9UMHLK-4X31` into Arabic titles.
- [ ] Court dropdown — all courts + quasi-judicial committees + "Other" free-text.
- [ ] Smart folders UI — fix vertical compression + clipped create-folder form.
- [ ] Gamification meter — wire counters to real reading activity.
- [x] ✅ Hide `BackendReadyNotice` when `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND === 'supabase'`. FIXED: Uses build-time constant `IS_PRODUCTION` (no hydration mismatch). *(commit bfb3a5f)*
- [ ] Remove orange beta banner from `/dashboard/client/consultation/new`.
- [x] ✅ Remove "تصفح المكتبة مجاناً" from invite error screen; enforce `/laws` paywall for non-subscribers. FIXED: Buttons now link to `/pricing`. *(commit bfb3a5f)*
- [ ] Fix mobile menu overlap on `/laws` (duplicated links, icon crowding).
- [ ] Real NZAMY logo (replace placeholder "ن" green circle).
- [ ] Remove legal-library from client sidebar; fix settings sidebar duplication.
- [ ] Fix dark-mode subtext contrast; link activity-log cards to cases/clients; hide `LegalMail` for solo lawyers; auto-refresh dashboard after adds; make tracker cards clickable; wrap research-collector in `DashboardLayout`; trim contract-review grid to 4–5 + Other + Show more; build merged "Smart Audio" tool; DB-driven subscription tab; gate time-tracker billing to hourly cases; case finance-structure fields; hide lawyer personal contact from public profile; ~~persist smart folders~~ ✅ DONE (2026-07-16) /drafts/notes to Supabase (not localStorage).
- [ ] June-round UX: contract-drafting return nav, contract-review party-side field, letter "Other" recipient + sender capacity, distinguish preliminary-eval vs risk-analysis, carry dashboard question text into AI chat.

## P6 — Static-analysis latent / SEO / perf (from the July-9 reviews)
- [x] ✅ **A2 — Library fallback table-name map wrong** — FIXED: All 6 references corrected (2 tableMap dicts + join alias + `fetchBookBySlug` + `fetchDecreeById` + nested joins `feqh_chapters/sections/blocks`). *(commit bfb3a5f)*
- [x] ✅ DONE (2026-07-16) A3 — In-memory search bypass — Server-side search + pagination now implemented via POST /api/library/search. /laws/page.tsx queries DB directly instead of loading 100 rows + JS .filter().
- [x] ✅ **A4 — RLS recursion risk** in `entitlement_requests` policies — FIXED: Rewritten to use `public.is_admin()` in `20260716_security_hardening.sql`. *(commit bfb3a5f)*
- [x] ✅ **P2 — Missing FK indexes** — FIXED: 3 indexes added in `20260716_missing_fk_indexes.sql` (`idx_articles_author_id`, `idx_support_tickets_user_id`, `idx_support_tickets_assignee_id`). *(commit bfb3a5f)*
- [ ] **Q1 — Remaining bare `.catch(()=>{})` sites** across ~12 client/lawyer pages (masks backend failures). Partial fix: `casesService` + `adminService` catch blocks now log errors + return `[]` instead of mock. `chatService`, `documentService`, `groupService` still pending.
- [ ] **U1 + SE1 — FOUC + crawler language mismatch** — server hardcodes `<html lang="ar" dir="rtl">`, client JS flips it. Solve together via server-side locale detection.
- [ ] **SE3 — Static blog sitemap** (`sitemap.ts:19-20` hardcoded URL) → dynamic query of published `articles`.
- [ ] **SE2 — No JSON-LD** anywhere → add `LegalService` schema to homepage.
- [x] ✅ **P1 — `FloatingButtons` bundle bloat** — FIXED: `WhatsAppWidget` + `DraftDrawer` now use `next/dynamic` with `ssr: false`. *(commit bfb3a5f)*
- [ ] **Q2 — 2,000+ hardcoded `#0B3D2E`** → theme token (breaks dark mode + rebrand).
- [ ] **Q3 — Google Fonts via `<link>`** (`layout.tsx:78-87`) → `next/font`.
- [ ] **U2 — CSS `text-align` overrides** (`globals.css:165-170`) → logical `text-start`/`text-end`. *(Note: removal was attempted and reverted — override is load-bearing with 261 usages across 136 files. Needs full migration.)*
- [ ] **N1 — Arabic-normalization regression** from June-29 `textSearch` switch (`الإثبات`↔`الاثبات`, `١٤٤٤`↔`1444` no longer normalized). Needs a real Arabic FTS config.

## P7 — Product backlog (post-beta expansion; per 5-wave order)
*Wave 1 — Unlock money & trust:*
- [ ] **Payments gateway** — pick Moyasar/Tap/HyperPay; checkout + webhook + ledger. (Entitlements build added a no-gateway grant layer as interim; real gateway still deferred.) Unblocks pricing/wallet/library/media.
- [ ] **Provider document upload + verification** + wire admin verification pages to `/api/v1/admin/verifications`. Stops auto-live unverified providers.
- [ ] **Force supabase mode in production** — kill demo/localStorage fake-session registration + community demo mode.
- [ ] **In-app notifications table** — verify entitlements-build inserts are live (P0); add any missing event sources.

*Wave 2 — Wire "schema built, client never wired":*
- [ ] Migrate localStorage → existing tables: Community (verify after P0), ~~Smart Folders~~ ✅ DONE (2026-07-16), Research Collector (`research_sessions`/`research_items`), Client Groups, Draft Cart (verify after P0), sticky notes/canvas.
- [ ] Contact form real submission + shared document review real token/passcode/approve writes (verify after P0).
- [ ] Client documents storage (enable bucket) + wallet/referral/finance table population + payout wiring.
- [ ] E-signature flow on contracts — real capture/provider + audit trail.

*Wave 3 — Content system:*
- [x] ✅ DONE (2026-07-16) Blog CMS — DB-driven articles schema (31 fields), storage bucket covers, server JSON-LD + metadata, GFM-alert renderer, and blog-toolkit CLI. (Note: analytics and Meta Pixel/GA4 integrations remain in P5).
- [ ] Academy LMS — `courses`/`sections`/`lessons`/`enrollments`/`lesson_progress`/`quiz_attempts`/`certificates` + real media hosting. **Largest single effort.**
- [ ] Media library table + asset hosting + subscription entitlement wired to payments.
- [x] ✅ DONE (2026-07-16) Library corpus seeding — `library-toolkit/` created (6 CLI commands: parse, seed, clear, verify, status, reseed). `DEMO_*` listing pages + hardcoded law/feqh pages converted to API-driven with fallbacks. `supabaseLibrary.ts` table-name mismatches fixed. Paywall enforced (was bypassed with `free:true`). Admin POST `/api/v1/admin/library` + "إضافة سجل جديد" form still deferred.

*Wave 4 — Admin console persistence:*
- [ ] Admin financial ops (escrow/disputes/payouts/revenue), content, tickets (verify P0), team/RBAC, audit log (verify P0), AI-usage.

*Wave 5 — Sector expansion (lift `BETA_MONOPOLY_MODE`):*
- [ ] Build each sector's entity-scoped tables/queries: micro + business first (reuse client loop), then firm, provider, ngo, government (~116 mock pages total).
- [ ] Secondary lawyer growth features (network, promotions, secondment, reviews, celebrity rewards).
- [ ] i18n / English layer (next-intl; `titleEn` fields already exist in library data).

## Open questions / unverified (owner-flagged)
- Library advanced search + Arabic normalization deferred (P1 #11) — tied to P6/N1.
- `/precedents/judgment/[slug]` may be mock — needs real API route or "coming soon".
- ~~`seed-library.ts --clean` may be a no-op~~ ✅ RESOLVED (2026-07-16): `library-toolkit/library-clear.mjs` now provides a dedicated clear command that reliably wipes all library tables.
- `parse-feqh.ts` may return constant `volume:1` for fiqh books.
- Appendices tab (coded 2026-07-02 in `laws/data.ts` + `[slug]/page.tsx` + `md_to_platform_json.py`) — no law seeded with real `appendices` data; untested.
- `law_metadata` table still absent (584-line `law-metadata-map.ts` remains).
- n8n operational workflows built + validated on n8n.asra3.com but **inactive by design**; delivery node is a plain-URL dummy. Phase-1 priority = deploy + activate + wire a real delivery endpoint (Evolution/email).

## Suggested execution order
1. ~~**P1 security** (S1–S3 + paywall)~~ — ✅ **DONE** (commit `bfb3a5f`). Remaining: role-switcher, IDOR, rate-limits.
2. **P0** (deploy + migrations + re-test) — ~1 day, may auto-close ~10 fails. Now includes `20260716_security_hardening.sql` + `20260716_missing_fk_indexes.sql`.
3. **P2 owner-blocking fails** that survive P0 (esp. upgrade buttons, referral, create-group, ~~promo CTA~~, `/find-lawyer`, ~~`/book/[slug]`~~, mojibake).
4. **P3 merge modifications** + **P4 admin subscriptions spec** — owner-prepared, high-leverage.
5. **P5 routing/UX fixes** — batch the cheap ones.
6. **P6 static-analysis** — ~~bundle~~/SEO/~~RLS~~/Arabic-FTS (3 of 13 done).
7. **P7 backlog waves** — post-beta, gated by payments gateway + corpus seeding.