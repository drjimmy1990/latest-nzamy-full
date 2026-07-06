# Product Completeness Backlog

**Date:** 2026-07-06
**Companion doc:** [PROJECT_STATUS_REVIEW_2026-07-06.md](./PROJECT_STATUS_REVIEW_2026-07-06.md)

This is the owner's forward-looking build backlog for NZAMY — every feature across the *whole* product that is still **mock**, **partial**, or **not-built** after the beta review. It is deliberately NOT about the client↔lawyer core loop (service-request → assign → chat → complete), which is already **real and Supabase/RLS-backed**, nor about the n8n automation layer (already **built**, currently inactive by design). Those are done. This document covers the *rest* of the product — the public/content/registration surfaces, the community system, the LMS/CMS content system, the sector dashboards, the admin console, and the cross-cutting persistence/payments/notifications plumbing — so the owner can plan a full public launch. Each line quotes the real file and states, in one clause, what it needs to become real.

## ✅ Update 2026-07-06 — partial build landed (entitlements + wiring, 7 phases)

A follow-up build implemented the admin-controlled entitlements layer + a first production-wiring wave. See [`ENTITLEMENTS_AND_WIRING_BUILD_LOG.md`](./ENTITLEMENTS_AND_WIRING_BUILD_LOG.md). **Now BUILT** (previously mock/not-built in the tables below): admin-grant + user-request entitlement flow (replaces dead paid CTAs, no gateway); in-app notifications fired on events; community mock-merge removed in supabase mode; draft-cart persisted to DB (lossless); admin **tickets / broadcasts / coupons / audit-log / community-moderation / payments** wired to real routes; **contact / partners / share-token verify / promo / invite** real writes; **Blog CMS** (articles table + admin authoring + DB-served blog). Still deferred: real payment gateway, Academy LMS, sector dashboards, i18n, provider binary doc upload. Items below are **not** yet reconciled line-by-line against this build — cross-check the build log before starting one.

## Legend

**Status:** ⬜ not-built · 🟡 mock · 🟠 partial
**Priority:** 🔴 high · 🟠 med · ⚪ low

Definitions — **not-built**: page/feature absent, pure placeholder, or "قريباً". **mock**: renders hardcoded/const data (MOCK_*, DEMO_*, ARTICLES, COURSES, localStorage) as if real, no real persistence. **partial**: some real wiring + some mock/missing.

---

## 0. Executive summary

| Area | # items | # high-priority |
|------|---------|-----------------|
| Registration & onboarding (9 user types) | 9 | 2 |
| Community (Q&A) | 10 | 6 |
| Blog + Academy + Media (content/LMS) | 12 | 7 |
| Public / marketing pages | 6 | 3 |
| Laws / Library content | 8 | 2 |
| Client + Lawyer dashboards (secondary features) | 17 | 2 |
| Sector dashboards + Admin console | 25 | 6 |
| Cross-cutting systems | 17 | 6 |
| **Total** | **104** | **32** |

### The 5–8 biggest build efforts

1. **Academy / LMS from scratch** — course catalog, curriculum, lesson player (real media), enrollment, progress, quiz engine, certificates. Currently 100% hardcoded consts (`COURSES`, `LESSON`, `MY_COURSES`, `MY_CERTS`) with no tables, no API, no persistence.
2. **Content CMS (Blog + Media)** — an authoring/publishing model (`articles`, `media` tables + admin editor + moderation). Blog list and blog detail even read from two *different* mock sources today.
3. **Community backend wiring** — the DB (`community_posts`/`community_answers`/`community_votes` + RLS) is ~90% built but unwired: default `demo` mode writes to localStorage, and every page *also* merges mock seed consts (`ALL_QUESTIONS`, `TOP_LAWYERS`) on top of real data. Flip to Supabase mode and delete the seed pollution.
4. **Sector dashboards (firm/business/provider/micro/ngo/gov)** — ~129 UI-complete pages that touch zero Supabase, rendering const arrays behind `BETA_MONOPOLY_MODE`. Each sector needs entity-scoped tables + queries before it can launch.
5. **Admin console persistence** — ~20 standalone admin pages (content, tickets, team, moderation, escrow/disputes/payouts/revenue, audit-log, ai-usage) render local `INITIAL_*` arrays with self-admitting "local until DB" toasts. Several have a real `/api/v1/admin/*` route already — just wire the page to it.
6. **Payments gateway** — honestly gated to `disabled`; no provider chosen. Blocks pricing checkout, wallet top-up, library subscription, media subscription. Pick Moyasar/Tap/HyperPay, build checkout + webhook + ledger.
7. **Cross-device persistence migration** — a systemic "schema built, client never wired" pattern: notifications, smart-folders, research collector, community, groups, draft-cart, sticky-notes all run through browser localStorage despite migrations existing. Wire the stores to their tables.
8. **Registration for the sub-provider + partner user types** — 8 of 9 types register end-to-end, but provider document-upload/verification is a placeholder, notary/runner/arbitrator collapse to a generic provider row, and the "partner/content-creator" path silently registers a plain individual.

---

## 1. Registration & onboarding (the 9 user types)

Registration is **mostly real**: 8 of 9 user types sign up end-to-end via Supabase auth, and the `handle_new_user` trigger provisions the matching profile row for each (individual, corporate, micro, government, ngo, lawyer, firm, provider). The gaps are the sub-provider roles collapsing to a generic profile, the provider verification flow being a placeholder, and the `/register` + `/join` marketing advertising paths that don't map to a real distinct flow.

**Provider onboarding**
- [ ] ⬜ 🔴 **Provider identity/license document upload + verification review** — `src/app/register/provider/components/Steps.tsx` (Step3, ~L309-327) → needs: the `<input type="file">` has no onChange/state/upload — wire to Supabase Storage, save path on `provider_profiles`, build the promised "24h team review" approval workflow (verification status column + admin UI). Today every provider is auto-live unverified.
- [ ] 🟠 🟠 **Sub-provider types (Notary / Legal Runner / Arbitrator) as distinct entities** — `src/app/register/provider/page.tsx` (~L214-215) + `supabase/migrations/20260630_handle_new_user_sectors.sql` → needs: all three register as `user_type='provider'` → one generic `provider_profiles` row; `sub_role`/`arbitration_center`/`gov_entity` live only in auth metadata. Add `sub_role` (or dedicated tables) so they're queryable/dashboardable as distinct providers.

**Partner / content / academy paths**
- [ ] 🟡 🟠 **Partner / Content-Creator registration path** — `src/app/register/page.tsx` (~L60-63, 98-100) → needs: the "Nzamy Partner" strip links to `/register/client?role=partner`, but the client route ignores `role` and has no partner type — it silently registers a normal individual. Build a real partner `user_type` + profile + `handle_new_user` branch, or remove the claim.
- [ ] ⬜ ⚪ **Media subscriber / Academy student onboarding** — `src/app/register/page.tsx` (~L62-63, partnerTypes → /media, /academy) → needs: these chips point at content pages, not a signup/enrollment flow — no subscriber/student account type exists. Build enrollment + a membership row if these are real products.
- [ ] 🟡 🟠 **/join provider marketing page** — `src/app/join/page.tsx` (providerTypes, benefits, steps, testimonials, requirementsByType — all const arrays) → needs: entirely hardcoded marketing with fabricated earnings ("SAR 15,000 avg", 78%/62%/85% bars) and fake testimonials (Khalid Al-Omari etc.), plus a 4-step review promise that isn't implemented. Replace fabricated stats/testimonials with real or clearly-marked illustrative data; back the review step with the verification workflow above.

**Onboarding & session integrity**
- [ ] 🟠 🟠 **Onboarding preferences persistence (services, city, specialties, notifications, has-in-house-lawyer)** — `src/app/onboarding/page.tsx` (~L660-683) → needs: in supabase mode these save ONLY to auth `user_metadata` — no `profiles`/`user_settings` columns, so they can't be queried or used server-side (e.g. matching a lawyer by specialty). Persist to real tables. In demo mode nothing is saved.
- [ ] 🟡 🔴 **Demo-mode registration fallback (localStorage session, no real account)** — `src/app/register/client/page.tsx` & `provider/page.tsx` (`setDemoSession`, default `demo`) + `src/hooks/useUser.ts` → needs: when `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` is unset/`demo` (the default), "Create Account" fabricates a pro-tier session in localStorage with 100 credits — no Supabase user, no profile, no email. Force supabase mode in production so registration is never a fake local session.
- [ ] 🟠 ⚪ **Onboarding vs client-registration type mismatch (company + firm collision)** — `src/app/onboarding/page.tsx` (L33, S5 getDashLink ~L405-416) → needs: onboarding exposes `company`/`firm` but registration maps client `company` → `user_type 'corporate'`, so the metadata value onboarding reads back never equals `company`. Reconcile the enums and route each of the 9 types to its correct dashboard.
- [ ] 🟠 ⚪ **Email verification / post-signup callback handoff** — `src/app/register/client/page.tsx` (~L280 `setStep(4)`) + `src/app/auth/callback/route.ts` → needs: after `signUp` the UI jumps straight to success regardless of whether Supabase requires email confirmation; no "check your email" state. Handle the unconfirmed-email case and align the success screen with the auth/callback flow.

---

## 2. Community (Q&A)

Community has a genuine dual-mode design: real Supabase-backed API routes and a migration (`community_posts`/`community_answers`, RLS, voting) exist — but the whole surface runs in **demo** mode by default, and every page ALSO merges hardcoded mock consts on top of any real data even in Supabase mode, so the feed always shows fake questions. The backend is ~90% built but unwired and polluted with seed data.

- [ ] 🟠 🔴 **Community questions feed (main /community list)** — `src/app/community/page.tsx` → needs: stop merging mock `ALL_QUESTIONS` into the feed (L92: `questions=[...savedQuestions, ...ALL_QUESTIONS]`) and set backend=supabase so `getCommunityPosts()` reads `community_posts` instead of localStorage.
- [ ] 🟡 🔴 **Mock seed content (questions/replies/lawyers constants)** — `src/constants/communityData.ts` → needs: `ALL_QUESTIONS` is rendered as if real; remove or gate behind a demo-only flag so production shows only DB posts.
- [ ] 🟠 🔴 **Ask-a-question (post creation)** — `src/app/community/ask/page.tsx` → needs: `createCommunityPost()` only persists to localStorage in demo mode, and the catch fallback shows a fake success + `Date.now()` id even on real failure. Switch to supabase mode and surface real errors instead of always showing "posted".
- [ ] 🟠 🔴 **Question detail page (view + seed data)** — `src/app/community/[id]/page.tsx` → needs: falls back to hardcoded `QUESTION`/`REPLIES` consts (L37/50) when no DB question found; wire `getCommunityPost()` to the real API and remove the fallback so unknown ids 404 instead of showing a fabricated question.
- [ ] 🟠 🔴 **Post answers / replies** — `src/app/community/[id]/page.tsx` → needs: `addCommunityAnswer()` writes to localStorage in demo mode and updates only local state; enable supabase mode so answers persist to `community_answers` and reload for all users.
- [ ] 🟡 🟠 **Voting (up/down on posts & answers)** — `src/lib/services/communityService.ts` → needs: `voteCommunityPost()` is a no-op in demo mode; UI `handleVote` only mutates local state. Enable supabase mode so votes hit `/api/v1/community/posts/[id]/vote` and persist.
- [ ] 🟡 🔴 **localStorage-only community store** — `src/lib/communityStore.ts` → needs: default persistence is browser localStorage (`nzamy_community_questions_v1`) — per-device, never shared. Make Supabase the default backend so posts are server-persisted.
- [ ] 🟡 🟠 **Community lawyers directory (/community/lawyers)** — `src/app/community/lawyers/page.tsx` → needs: renders hardcoded `TOP_LAWYERS` + `TRENDING` with fake counts and no API call; needs a real query of lawyer profiles ranked by community answer activity.
- [ ] ⬜ ⚪ **Public community profile (/community/public)** — `src/app/community/public/page.tsx` → needs: pure redirect stub to `/community`; build a real per-user profile (questions/answers/reputation) if this surface is intended.

---

## 3. Blog + Academy + Media (content system / LMS)

The entire content surface is **presentational-only** — every page renders hardcoded const arrays (`ARTICLES`, `COURSES`, `COURSES_MAP`, `LESSON`, `MY_COURSES`, `MY_CERTS`, `REELS`/`EPISODES`/`NOVELS`/`COMICS`) with zero Supabase tables, no API routes, and no enrollment/progress/quiz persistence. No admin authoring anywhere. This is a full build backlog.

**Blog**
- [ ] 🟡 🔴 **Blog list (article index + category filter + search)** — `src/app/blog/page.tsx` → needs: an `articles` table (category, author, published_at, views, featured); replace the local `ARTICLES` const; server-side fetch + real search/filter.
- [ ] 🟠 🔴 **Blog article detail (reader + related)** — `src/app/blog/[slug]/page.tsx` → needs: reads from `src/constants/platformContent.ts` (a hardcoded catalog) while the list page uses a DIFFERENT `ARTICLES` const — unify both onto one `articles` table; add real view counts/comments/likes (currently static UI).
- [ ] ⬜ 🟠 **Blog CMS / admin authoring** — `src/app/blog/` → needs: no create/edit/publish route exists — an admin-gated authoring workflow (draft/publish, markdown editor) + moderation model.

**Academy (LMS)**
- [ ] 🟡 🔴 **Academy course catalog** — `src/app/academy/page.tsx` → needs: a `courses` table (title, instructor, category, level, lessons, price, certificate flag); replace `COURSES` const; server-side search/filter.
- [ ] 🟡 🔴 **Academy course detail + curriculum** — `src/app/academy/[slug]/page.tsx` → needs: hardcoded `COURSES_MAP` with inline curriculum; needs `courses` + `course_sections` + `lessons` tables and per-user enrolled/locked state (free/lock flags are static).
- [ ] 🟡 🔴 **Lesson player (video/audio) + in-lesson quiz** — `src/app/academy/[slug]/lesson/[id]/page.tsx` → needs: single hardcoded `LESSON` const with `videoUrl`/`audioUrl = '#'`; needs `lessons` table, real media hosting, and a `lesson_progress` table.
- [ ] ⬜ 🔴 **Course enrollment + progress tracking** — `src/app/academy/my-courses/page.tsx` → needs: `MY_COURSES` is hardcoded with fixed progress %; needs `enrollments` + `lesson_progress` persistence tied to the logged-in user + an enroll action.
- [ ] 🟠 🔴 **Quiz engine (standalone practice)** — `src/app/academy/quiz/page.tsx` → needs: only ~7 hardcoded `REAL_QUESTIONS` across 28 categories; `generateMockQuestions()` fabricates filler and no score is saved. Needs a real question-bank table + `quiz_attempts` persistence.
- [ ] 🟡 🟠 **Certificates (issue + verify)** — `src/app/academy/certificates/page.tsx` → needs: `MY_CERTS` is one hardcoded cert with a fake verifyId and no public verify route/PDF. Needs a `certificates` table, issuance on completion, downloadable/verifiable credential.

**Media**
- [ ] 🟡 🟠 **Media library (reels / YouTube episodes / novels / comics)** — `src/app/media/data.ts` → needs: all content hardcoded (`REELS`, `EPISODES`, `NOVELS`, `COMICS`, `MARQUEE`) with fake view counts and no real URLs; needs a `media` table + real asset hosting + admin authoring.
- [ ] 🟠 🟠 **Media subscription gating ("Media Nizami" paywall)** — `src/app/media/page.tsx` → needs: gate only checks `isLoggedIn`; the 9 SAR/mo subscription has no entitlement check or billing — wire a subscription/entitlement flag to the payments gateway.

---

## 4. Public / marketing pages

The pure content pages (about, faq, terms, privacy, security, ai-disclaimer) are real, hardcoded bilingual static content and need **no** backend work. The interactive/transactional surfaces are the gaps.

- [ ] 🟡 🔴 **Contact form submission** — `src/app/contact/page.tsx` → needs: replace the `setTimeout` fake-submit (`handleSubmit`) with a real POST to an API route / n8n webhook that stores the message and emails info@nezamy.com; add validation + error states.
- [ ] 🟡 🔴 **Pricing plans & subscribe/checkout** — `src/app/pricing/page.tsx` → needs: plans come from hardcoded `getPlanList()`/`pricingData.ts`; CTAs only link to `/register` or `/contact`. Needs real plan records + a payment/checkout flow (or explicit "contact sales" if intentional).
- [ ] 🟡 🟠 **Promo / referral landing page** — `src/app/promo/[slug]/page.tsx` → needs: `getMockPromoData()` returns hardcoded provider/discount — fetch a real promo record by slug from Supabase and apply the discount through login/checkout.
- [ ] 🟡 🔴 **Shared document review (passcode-protected)** — `src/app/share/[token]/page.tsx` → needs: entire page hardcoded — passcode accepts any 6 digits, body is a static contract, Approve/Submit-notes/Download persist nothing. Needs token→document lookup, real passcode verification, and approve/notes writes back to the case.
- [ ] 🟠 🟠 **Colleague invite / trial activation** — `src/app/invite/[code]/page.tsx` → needs: real validate/accept logic exists but `invitationStore.ts` is localStorage-only (self-labeled Demo) — needs server-side invite codes, trial-grant persistence, and license verification.
- [ ] 🟠 ⚪ **Partner application intake** — `src/app/partners/page.tsx` → needs: static content is fine, but "apply" is just an `#apply` anchor + `mailto:partners@nezamy.com` — add a real partner-application form + submission pipeline.

---

## 5. Laws / Library content surfaces

The library detail **readers** (`laws/[slug]`, `orders/[slug]`, `precedents/[slug]`, `book/[slug]`) are genuinely DB-wired against the Supabase `library` schema — real infrastructure sitting on an empty corpus. The mock surfaces are the standalone marketing/preview pages, the main `/laws` tab listings (which import `DEMO_*` arrays directly), the subscribe checkout, and two hardcoded slug fallbacks.

- [ ] 🟡 🟠 **Civil Procedure law page (نظام المرافعات)** — `src/app/laws/civil-procedure/page.tsx` → needs: full articles/regulations/amendments render from hardcoded `ARTICLES`/`SYSTEM_DETAILS` consts with no fetch at all; replace with a fetch to `/api/library/laws/[slug]` (this should be a DB law row, not a bespoke page).
- [ ] 🟡 🟠 **Feqh preview reader (الروض المربع / زاد المستقنع)** — `src/app/laws/feqh-preview/page.tsx` → needs: entire book tree is a hardcoded `DEMO_BOOK` const with zero fetch calls; drive from `feqh_books` via `/api/library/books/[slug]`.
- [ ] 🟡 🔴 **Library subscription checkout (خطط الاشتراك)** — `src/app/laws/subscribe/page.tsx` → needs: `handleSubscribe` calls `createLibrarySubscription()` which only writes localStorage and opens an InvitationModal — no charge, no DB, static price strings. Needs a real payment gateway + server-side subscription record.
- [ ] 🟠 🟠 **Book reader hardcoded-slug fallback (book/[slug])** — `src/app/book/[slug]/page.tsx` → needs: API path (`/api/library/books/[slug]`) is real Supabase; remove the `DEMO_RAWD` hardcoded-slug fallback once `feqh_books` is populated so known slugs don't silently serve demo content.
- [ ] 🟠 🟠 **Royal-orders/decrees reader fallback (orders/[slug])** — `src/app/laws/orders/[slug]/page.tsx` → needs: API (`/api/library/decrees/[id]`) is real (`library.decrees_circulars`); populate the table and drop the `DEMO_ORDERS` fallback (`src/app/laws/demo-data-access.ts`).
- [ ] 🟡 🔴 **Main /laws tab LISTINGS** — `src/app/laws/page.tsx` → needs: tab list views import `DEMO_PRINCIPLES`/`DEMO_PRECEDENTS`/`DEMO_ORDERS`/`DEMO_FEQH_BOOKS`/`DEMO_PRECEDENTS_COLLECTIONS` directly instead of an index API; needs a real `/api/library` index endpoint so the catalog reflects DB rows.
- [ ] 🟠 ⚪ **Precedents/[slug] static-JSON fallback** — `src/app/precedents/[slug]/page.tsx` → needs: API (`/api/library/precedents/[slug]`) is real; migrate the bundled `admin-supreme-*` JSON files (`src/constants/precedents/*.json`) into the DB and remove the long hardcoded slug→import fallback chain.
- [ ] ⬜ ⚪ **Judgment reader (precedents/judgment/[slug])** — `src/app/precedents/judgment/[slug]/page.tsx` → needs: honestly gated to `DashboardComingSoon` (قريباً); build a judgment detail table + `/api/library/judgment` API. (Already honest, listed for completeness.)

---

## 6. Client + Lawyer dashboards — remaining mock/unbuilt sub-features

The core loop is real and Supabase-backed. But a ring of secondary "growth/ops" sub-features is still mock or not-built. A second tier (wallet, referral, my-group, finance) is genuinely wired to APIs but depends on Supabase tables that must be populated to stop showing zeros/empty — so they are **partial**.

**Mock / not-built**
- [ ] 🟡 🟠 **Lawyer collaboration marketplace (my-requests + collab offers + fee-split)** — `src/components/marketplace/MyMarketplaceDashboardData.ts` (rendered by `src/app/dashboard/lawyer/marketplace/page.tsx`) → needs: replace `MY_REQUESTS`/`COLLAB_REQUESTS` consts with a real collab-requests table + API; `FeeSplitModal` must POST a persisted agreement.
- [ ] ⬜ ⚪ **Lawyer professional network** — `src/app/dashboard/lawyer/network/page.tsx` → needs: pure `DashboardComingSoon` — a connections/colleagues model + directory UI + persistence.
- [ ] ⬜ ⚪ **Lawyer promotions / marketing** — `src/app/dashboard/lawyer/promotions/page.tsx` → needs: `DashboardComingSoon` — a promotions/campaign entity, budgeting, API.
- [ ] ⬜ ⚪ **Lawyer secondment (الانتدابات القانونية)** — `src/app/dashboard/lawyer/secondment/page.tsx` → needs: `DashboardComingSoon` — a secondment-contract table (hours, rate, client) + CRUD API.
- [ ] ⬜ 🟠 **Lawyer reviews / ratings inbox** — `src/app/dashboard/lawyer/reviews/page.tsx` → needs: `DashboardComingSoon` — a reviews table written after case completion + aggregation into the public profile rating.
- [ ] ⬜ ⚪ **Client celebrity / referral-rewards program** — `src/app/dashboard/client/celebrity/{code,status,referrals}/page.tsx` → needs: all three are `DashboardComingSoon` — a rewards/tier engine (ambassador codes, tier status, referral ledger) with persistence.
- [ ] ⬜ 🔴 **E-signature on contracts** — `src/app/dashboard/client/contracts/page.tsx` (التوقيع الإلكتروني قريباً), `src/app/dashboard/lawyer/contracts/page.tsx` (رابط التوقيع = toast only) → needs: client sign is disabled "قريباً"; lawyer "send for signature"/"copy link" only fire toasts. Needs a real e-sign flow (signature capture/provider, signed-doc storage, audit trail).

**Partial (wired, needs tables/logic)**
- [ ] 🟠 🟠 **Lawyer analytics — NPS, AI-tool usage, peer/pro scores** — `src/app/dashboard/lawyer/analytics/page.tsx` → needs: win-rate + work-distribution are real (from `getCases`), but NPS/PROMOTER, `AI_TOOLS` counts, and `PRO_SCORES` are hardcoded consts rendered as live — need real survey/telemetry/benchmark sources, or hide them.
- [ ] 🟠 🟠 **Lawyer contracts — standalone contract entity** — `src/app/dashboard/lawyer/contracts/page.tsx` → needs: list/status changes persist via `workflowService` (real), but contracts are only a projection of `service_requests` — no standalone contract document/versioning or PDF generation.
- [ ] 🟠 🟠 **Client wallet (balance, transactions, coupons)** — `src/app/dashboard/client/wallet/page.tsx` (API `src/app/api/v1/wallet/route.ts`) → needs: UI+API wired to `wallet_transactions`/`coupons`, but balances default to 0 and stats show "(قريباً)" until those tables are populated and a credit/debit ledger + top-up path exist.
- [ ] 🟠 🟠 **Client referral program** — `src/app/dashboard/client/referral/page.tsx` (API `src/app/api/v1/referrals/route.ts`) → needs: reads `referrals` (real) but has no reward-crediting on friend signup/subscribe — needs the referral-to-wallet payout wiring.
- [ ] 🟠 ⚪ **Client my-group (family/shared subscription)** — `src/app/dashboard/client/my-group/page.tsx` (API `src/app/api/v1/groups/*`) → needs: group/members/invite APIs exist and are called, but falls back to `DEFAULT_GROUP` when empty — needs real group billing/quota accounting.
- [ ] 🟠 🟠 **Lawyer finance — invoices, expenses, voice-invoice** — `src/app/dashboard/lawyer/finance/page.tsx` (API `src/app/api/v1/lawyer/finance/route.ts`) → needs: reads real `payments`/`wallet_transactions`/`subscriptions`, but invoice/expense creation isn't persisted and voice-invoice parsing is client-side — needs an `invoices`/`expenses` model + create endpoints.
- [ ] 🟠 ⚪ **Lawyer activity feed** — `src/app/dashboard/lawyer/activity/page.tsx` → needs: supabase mode starts empty; needs a real activity/event table populated by workflow events so the feed is non-empty in production.
- [ ] 🟠 🟠 **Lawyer hearings / calendar** — `src/app/dashboard/lawyer/hearings/page.tsx` (`AddHearingModal.tsx`) → needs: events are read-only projections from `service_requests`; `AddHearingModal` has no persistence path — needs a `hearings` table + create/update API.
- [ ] 🟠 🟠 **Client document upload/storage** — `src/app/dashboard/client/documents/page.tsx` → needs: full upload/view/download/delete is wired via document service but hard-blocked with "الوضع التجريبي" unless backend=supabase — needs the Supabase storage bucket + backend enabled.
- [ ] 🟠 ⚪ **Lawyer tasks — team assignment** — `src/app/dashboard/lawyer/tasks/page.tsx` (`_components/_pomodoro/storage.ts`) → needs: tasks persist via `/api/v1/lawyer/tasks` (real), but `TEAM_MEMBERS` is a hardcoded const and Pomodoro state is localStorage-only — needs a real team/collaborators source.

---

## 7. Sector dashboards (firm/business/provider/micro/ngo/government) + Admin console

All six sector dashboards (~129 pages) are UI-complete but **data-fake**: zero touch Supabase, rendering const arrays / localStorage with no persistence — hidden behind `BETA_MONOPOLY_MODE`. The Admin console is split: several tab components + Users/Subscriptions/Settings/Verifications ARE wired to real `/api/v1/admin` routes, but ~20 standalone admin pages render local `INITIAL_*` arrays with "local until DB" toasts. Module-level backlog, one line per buildable module.

**Sector dashboards (all 🟡 mock, hidden behind BETA_MONOPOLY_MODE)**
- [ ] 🟡 🟠 **Firm — core practice management** — `src/app/dashboard/firm/{cases,clients,hearings,contracts,documents,finance,wallet}/page.tsx` → needs: Supabase tables + RLS per firm org; wire pages to real queries.
- [ ] 🟡 ⚪ **Firm — org & governance** — `src/app/dashboard/firm/{departments,branches,team,compliance,governance}/page.tsx` → needs: org-structure + membership + compliance tables; persist role/permission assignments server-side.
- [ ] 🟡 ⚪ **Firm — collaboration & growth** — `src/app/dashboard/firm/{of-counsel,secondment,referrals,marketplace,client-portal,shared-rooms,analytics}/page.tsx` → needs: cross-firm collaboration schema + real analytics aggregation.
- [ ] 🟡 🟠 **Business (in-house counsel) — matters, hearings, consultations, requests** — `src/app/dashboard/business/{cases,hearings,consultations,requests}/page.tsx` → needs: business-org matter tables + link to the real service-request loop.
- [ ] 🟡 ⚪ **Business — team/departments/governance, seconded-counsel, employee-contracts, kanban, reports** — `src/app/dashboard/business/{team,departments,governance,seconded-counsel,employee-contracts,kanban,reports}/page.tsx` → needs: persistence for org + contracts + board state; reports need real aggregation.
- [ ] 🟡 🟠 **Provider — service ops** — `src/app/dashboard/provider/{arbitration,bailiff,notary,calendar,requests}/page.tsx` → needs: provider-service request pipeline persisted in Supabase + calendar store.
- [ ] 🟡 ⚪ **Provider — earnings, promotions, reviews, profile** — `src/app/dashboard/provider/{earnings,promotions,reviews,profile}/page.tsx` → needs: real payout/earnings ledger + review persistence; profile edit save-to-DB.
- [ ] 🟡 🟠 **Micro-business — cases, requests, requirements, contracts, documents, find-lawyer, wallet** — `src/app/dashboard/micro/{cases,requests,requirements,contracts,documents,find-lawyer,wallet}/page.tsx` → needs: reuse client-loop tables scoped to micro tier; wire find-lawyer to the real directory.
- [ ] 🟡 ⚪ **NGO — programs, volunteers, board, finance, awqaf, compliance, contracts, reports** — `src/app/dashboard/ngo/{programs,volunteers,board,finance,awqaf,compliance,contracts,reports}/page.tsx` → needs: NGO-specific schema (programs/volunteers/endowments) + finance ledger.
- [ ] 🟡 ⚪ **Government — cases, external-counsel, contracts, compliance, reports** — `src/app/dashboard/government/{cases,external-counsel,contracts,compliance,reports}/page.tsx` → needs: gov-entity matter + external-counsel engagement tables; reports need real data.

**Admin console**
- [ ] 🟡 🔴 **Content management (articles, laws)** — `src/app/dashboard/admin/content/articles/page.tsx` → needs: CMS table + POST/PUT route; page edits `INITIAL_ARTICLES` in local state only (toast admits "local until CMS/DB").
- [ ] 🟡 🔴 **Support tickets** — `src/app/dashboard/admin/tickets/page.tsx` → needs: `support_tickets` table + route; renders const `TICKETS`, no persistence.
- [ ] 🟡 🔴 **Team / RBAC management** — `src/app/dashboard/admin/team/page.tsx` → needs: real staff account creation; mutates `INITIAL_TEAM` locally (toast: "no server account created"). `TeamTab.tsx` already uses real `/api/v1/admin/teams` — consolidate onto it.
- [ ] 🟡 🟠 **Community moderation queue** — `src/app/dashboard/admin/community/moderation/page.tsx` → needs: moderation table + actions route; approve/reject only mutates local state.
- [ ] 🟡 ⚪ **Celebrity/influencer program** — `src/app/dashboard/admin/celebrities/{page,referrals/page,upgrade/page}.tsx` → needs: celebrity accounts + referral-attribution + upgrade tables; all const arrays.
- [ ] 🟡 🟠 **Sector profiles editor** — `src/app/dashboard/admin/sector-profiles/page.tsx` → needs: sector-config persistence route; 9 local const blocks, no save.
- [ ] 🟡 🟠 **Reports & analytics** — `src/app/dashboard/admin/reports/page.tsx` → needs: real aggregation queries over platform data; currently 4 hardcoded metric arrays.
- [ ] 🟡 🔴 **Financial ops (escrow, disputes, payouts, revenue)** — `src/app/dashboard/admin/{escrow,disputes,payouts,revenue}/page.tsx` → needs: escrow/dispute/payout ledgers + resolution actions persisted; today display-only const.
- [ ] 🟡 ⚪ **Broadcasts / announcements** — `src/app/dashboard/admin/broadcasts/page.tsx` → needs: broadcast table + send pipeline (n8n/notifications); no route, local only.
- [ ] 🟡 🟠 **Audit log** — `src/app/dashboard/admin/audit-log/page.tsx` → needs: real `audit_log` table populated by server actions; page shows const rows.
- [ ] 🟡 🟠 **AI usage & credits monitoring** — `src/app/dashboard/admin/ai-usage/{page,credits/page,reports/page}.tsx` → needs: AI-usage metering table + aggregation; const arrays. `/api/v1/admin/credits` route exists — wire pages to it.
- [ ] 🟡 ⚪ **Security & system (security, system, system/backup)** — `src/app/dashboard/admin/{security/page,system/page,system/backup/page}.tsx` → needs: real security-events feed + backup trigger/status; currently static const panels.
- [ ] 🟠 🔴 **Provider verification pages** — `src/app/dashboard/admin/provider-verification/{page,firms/page}.tsx` → needs: pages render locally but `/api/v1/admin/verifications` route IS Supabase-backed — wire the pages to the existing route.
- [ ] 🟡 ⚪ **Reviews & pricing moderation** — `src/app/dashboard/admin/{reviews,pricing}/page.tsx` → needs: reviews moderation route + pricing-config persistence; local const now.
- [ ] 🟠 🟠 **Subscriptions coupons & payments sub-pages** — `src/app/dashboard/admin/subscriptions/{coupons/page,payments/page}.tsx` → needs: main subscriptions page uses a real route; coupons/payments sub-pages still local const — add routes.

---

## 8. Cross-cutting systems (persistence, payments, notifications, vault, i18n)

The systemic pattern is **"schema built, client never wired"**: migrations already define tables for community, groups, research sessions/items, draft carts, user settings, and smart-folder items — but the app reads/writes through browser-localStorage (device-local, not cross-device, wiped on cache clear). Payments are honestly gated off. Outbound n8n notifications are built-but-inert, but there is no in-app notification persistence at all.

**Persistence migration (localStorage → existing tables)**
- [ ] 🟡 🔴 **In-app notifications (bell + /notifications page)** — `src/lib/notificationsStore.ts` → needs: a real `notifications` table + insert-on-event (service-request/chat/payment) + per-user read/query API; today it renders 8 hardcoded SEED items in localStorage with no DB table.
- [ ] 🟠 🔴 **Smart Folders (legal library)** — `src/app/laws/components/SmartFolders.tsx` → needs: wire to the existing `library.smart_folder_items` table (migration 20260701) + a folders CRUD API; all ops write only to `nzamy_smart_folders` localStorage (comment admits "API wiring is a follow-up").
- [ ] 🟡 🔴 **Research Collector — desktop + sessions** — `src/lib/draftInboxStore.ts` → needs: persist to existing `public.research_sessions`/`research_items` instead of `nzamy_collector_items/sessions` localStorage; "team-visible desktop" + 7-day auto-archive are single-device only.
- [ ] 🟡 🔴 **Community Q&A store** — `src/lib/communityStore.ts` → needs: read/write existing `public.community_posts`/`community_answers`/`community_votes`; posted questions never leave the browser (see also §2).
- [ ] 🟡 🟠 **Client Groups membership** — `src/lib/clientGroupStore.ts` → needs: back with existing `public.groups`/`group_members`/`group_invitations`; membership is faked in localStorage (`activateClientGroup` hardcodes group `grp-001`).
- [ ] 🟡 🟠 **Library invitations + trials + issue reports** — `src/lib/invitationStore.ts` → needs: server-side invite generation/validation/redemption + lawyer-license lookup + issue-report intake; header admits "Demo/Frontend", `validateInviteCode` accepts any well-formed code as 30-day trial, `getLawyerLicense` is a 3-row hardcoded object.
- [ ] 🟡 🟠 **Sticky notes + canvas highlighter (law/precedent pages)** — `src/components/StickyNotesManager.tsx` → needs: persist notes + highlighter strokes per user+document to DB (currently `sticky_notes_{pageId}`/`highlighter_strokes_{pageId}` localStorage); lost on cache clear.
- [ ] 🟠 🟠 **Draft cart / law draft builder** — `src/hooks/useDraftCart.ts` → needs: wire to existing `public.law_draft_carts`; the hook keeps state in localStorage so a started draft can't resume on another device.
- [ ] 🟡 ⚪ **Pomodoro / lawyer task timer state** — `src/app/dashboard/lawyer/tasks/_components/_pomodoro/storage.ts` → needs: optional DB backing if cross-device timers are wanted; localStorage-only is acceptable as device-local.

**Payments & delivery**
- [ ] ⬜ 🔴 **Payments gateway (checkout / wallet top-up / subscription pay)** — `supabase/migrations/20260628_payments_gateway.sql` → needs: integrate a real provider (Moyasar/Tap/HyperPay): checkout, webhook verification, ledger. Honestly gated to `status:'disabled'` via `platform_settings.payments_gateway`; all pay call-sites block. No provider chosen.
- [ ] 🟠 🟠 **Notification DELIVERY via n8n (email/SMS/WhatsApp)** — `src/lib/n8n/dispatch.ts` → needs: set `N8N_WEBHOOK_BASE_URL` + activate the (already-built, inactive) workflows; dispatch is inert by design (returns `{delivered:false}`, no network call). Only 3 service-request events are mapped (new/assigned/completed).

**Vault & i18n**
- [ ] 🟡 🟠 **Legal Vault — lawyer document vault** — `src/app/services/lawyers/vault/page.tsx` → needs: real document upload/storage + AI extraction pipeline; page renders `MOCK_RESULTS` + static `PROJECT_TYPES` with no upload backing.
- [ ] 🟡 🟠 **AI Vault — office document store** — `src/app/ai/vault/page.tsx` → needs: persist uploaded office documents + lawyer letterhead to storage; `INITIAL_ITEMS`/`MOCK_LAWYER` are hardcoded, delete/upload are local state only.
- [ ] ⬜ ⚪ **English / i18n coverage** — `src/app/layout.tsx` → needs: no i18n framework (no next-intl/i18next); UI is Arabic-only with `lang=ar` hardcoded. `titleEn` fields exist in library data but there's no English locale, language switch, or translated routes.

*(Module-level duplicates of sections above, listed in the cross-cutting audit for completeness: Sector dashboards — `src/constants/firmTeamData.ts`; Marketplace — `src/app/marketplace/_data.ts`; Blog/Academy content — `src/app/blog/page.tsx`. See §3 and §7 for the itemized backlog.)*

---

## Suggested build order (for a full public launch, after the beta)

**Wave 1 — Unlock money & trust (turn honest gates into real systems)**
1. **Payments gateway** (§8) — pick Moyasar/Tap/HyperPay; build checkout + webhook + ledger. Everything monetized (pricing, wallet top-up, library/media subscriptions) is blocked on this.
2. **Provider document upload + verification workflow** (§1) + wire **Admin provider-verification pages** to the existing `/api/v1/admin/verifications` route (§7). Stops auto-live unverified providers.
3. **Force supabase mode in production** (§1, §2) — kill the demo/localStorage fake-session registration and community demo mode. This single flip makes registration and community real.
4. **In-app notifications table + insert-on-event** (§8) — the platform has no persisted notifications at all; needed before any real transactional product.

**Wave 2 — Wire the "schema built, client never wired" backlog**
5. Migrate the localStorage stores to their existing tables: **Community**, **Smart Folders**, **Research Collector**, **Client Groups**, **Draft Cart** (§2, §8). Cheap wins — tables already exist.
6. **Contact form → real submission** + **Shared document review** real token/passcode/approve writes (§4).
7. **Client documents storage** (enable bucket) + **wallet/referral/finance** table population + payout wiring (§6).
8. **E-signature flow** on contracts (§6) — real signature capture/provider + audit trail.

**Wave 3 — Content system (CMS + LMS)**
9. **Blog CMS** — one `articles` table, unify list+detail, admin authoring (§3).
10. **Academy LMS** — `courses`/`sections`/`lessons`/`enrollments`/`lesson_progress`/`quiz_attempts`/`certificates` + real media hosting + player (§3). Largest single effort.
11. **Media library** table + asset hosting + subscription entitlement wired to payments (§3).
12. **Library corpus** — populate the `library` schema; convert the `DEMO_*` listing pages and bespoke hardcoded law/feqh pages to API-driven, and drop the demo-slug fallbacks (§5).

**Wave 4 — Admin console persistence**
13. **Admin financial ops** (escrow/disputes/payouts/revenue), **content**, **tickets**, **team/RBAC**, **audit log**, **AI-usage** — build routes or wire to the few that already exist (§7).

**Wave 5 — Sector expansion (post-monopoly-mode)**
14. Lift `BETA_MONOPOLY_MODE` sector by sector, building each sector's entity-scoped tables + queries: **micro** and **business** first (they reuse the client loop), then **firm**, **provider**, **ngo**, **government** (§7).
15. Secondary lawyer growth features (network, promotions, secondment, reviews, celebrity rewards) + **i18n/English layer** if English is a goal (§6, §8).
