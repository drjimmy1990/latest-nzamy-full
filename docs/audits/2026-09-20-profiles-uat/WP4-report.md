# WP-4 report — Lawyer profile & lawyer flows

> Branch `wp4`, worked 2026-09-20 off the merged wave-1 master. Plan:
> `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` §WP-4. Appendices:
> `04-lawyer-profile-audit.md`, `02-auth-session-audit.md` §5-§6.
>
> **Gate on every commit:** `npm run type-check` (0 errors) and
> `npm run test:unit`. Baseline on this branch was 1271/1271; WP-4 ends at
> **1294/1294** (+23 new tests, 0 modified, 0 removed). `npm run build` was NOT
> run (see *Open risks*). GitNexus MCP was unavailable in this session, so the
> blast radius of every edited symbol was grepped by hand and listed in the
> commit body, as §0 rule 5 requires.

## Owner decisions applied

- **Q1 (G5) — price unit and pricing kind: NO CODE CHANGE.** The owner default
  is to keep «ر.س» and «بحسب الحالة», both of which are already what ships:
  `servicePriceLabelAr` renders «٣٠٠ ر.س» / «يبدأ من ٣٠٠ ر.س» / «٥٠٠ ر.س /
  ساعة» (`src/lib/services/lawyerProfileFields.ts:112-119`) and
  `PRICING_KIND_AR.quote` is «بحسب الحالة», asserted at
  `src/lib/services/lawyerProfileFields.test.ts:35-40`. The owner's acceptance
  script writes «٥٠٠ ريال» and «حسب الطلب»; those are the SAME two values in
  different words, not a defect. If he insists on his wording, the change is
  those two constants plus the four assertions in that test — and it is
  site-wide, because `servicePriceLabelAr` is the only price formatter the
  lawyer profile, the public page and the service modal share.
- **Q3 (G2) — الجنسية: lawyer + individual only.** Added to the lawyer field
  list; firm, corporate, micro, government, ngo, provider and admin
  deliberately excluded, pinned by a test.
- **Q5 (item 9) — `/ai/direction-support`: hide honestly now.** Page body
  replaced with the existing `DashboardComingSoon` pattern, all four source
  files kept (owner decision ٤).

## What changed, per item

### 1 · G1 — «رابط ملفك العام» on the profile page
`src/app/dashboard/lawyer/profile/page.tsx`
- `:231-236` — `origin` state + effect (`window` does not exist during SSR).
- `:784-814` — read-only row after the contact chips, rendered whenever
  `profileData.slug` is set and **not** gated on `canShareProfile`; `dir="ltr"`,
  `readOnly`, select-on-focus, `print:hidden`; under `BETA_MONOPOLY_MODE` it
  carries «الدليل العام غير مُفعَّل خلال مرحلة التجربة، فالرابط لا يفتح بعد.»
- The share **button** keeps its existing gate (`:552-570`), unchanged.

Why it was invisible before: `canShareProfile = Boolean(userId) &&
!BETA_MONOPOLY_MODE` is false for every lawyer during the beta, and the URL
existed only inside the button's click handler.

### 2 · G2 — «الجنسية» for lawyers
- `src/lib/services/profileSettingsFields.ts:44-52` — `nationality` first in
  the lawyer list, `target: "profile"`, maxLength 60.
- `src/lib/services/profileSettingsFields.test.ts:36-53` — two tests: it lands
  in `.profile` for a lawyer, and it is offered to lawyer + individual only.

No route or migration work: `public.profiles.nationality` exists
(`20260906_phase6_settings_out_of_browser.sql:124`), PATCH `/api/v1/profile`
allow-lists it (`route.ts:333`) and validates it (`route.ts:463-466`), and
ProfileTab prefills generically through `sourceFor(field, row)`
(`ProfileTab.tsx:45-49`).

### 3 · G3 — «قبول عملاء جدد» on the lawyer's own profile page
`src/app/dashboard/lawyer/profile/page.tsx`
- `:111-118` `EMPTY_PROFILE.isAcceptingClients` · `:253`
  `ProfileApiResponse.roleProfile.is_accepting_clients` · `:294` mapped in
  `load()` as `r?.is_accepting_clients === true` · `:701-722` a 4th status tile
  inside the existing `hasRoleProfile` branch.
- Copy is taken verbatim from the public page (`lawyers/[slug]/page.tsx:568,573`)
  so the two screens cannot drift.
- **Verified, not assumed:** GET returns the column —
  `src/app/api/v1/profile/route.ts:184-188` selects `*` from `lawyer_profiles`.

### 4 · G4 — one public-link builder
New `src/lib/services/publicProfileLink.ts` — `buildPublicProfileUrl(origin,
slug, userId)` (`slug || userId`, trimmed, percent-encoded),
`canShareProfile(userId, betaMonopolyMode)`, `copyToClipboard(text)` (the
two-tier Clipboard-API/execCommand helper both pages had duplicated verbatim).
New `src/lib/services/publicProfileLink.test.ts` — 5 tests.
- `src/app/dashboard/lawyer/profile/page.tsx:23,383-403,806` — imports all
  three; its private `copyToClipboard` is gone.
- `src/app/dashboard/lawyer/page.tsx:61-62,229,277-351` — same, plus a single
  `apiGet("/api/v1/profile")` for `roleProfile.slug` (this page reads nothing
  else from `lawyer_profiles`), guarded on lawyer + supabase mode and
  deliberately silent on failure: no slug degrades to the user id, i.e. exactly
  the link this button produced before. It had been copying the **UUID**.

### 5 · G5 — wording
No code change; see *Owner decisions applied* above.

### 6 · G6 — anonymous reviews de-anonymised by service title
New `src/app/api/v1/reviews/_redact.ts` — `requestIdsForEnrichment(rows)`
(anonymous rows excluded at the **query**, so an anonymous title is never read
out of `service_requests` at all) and `redactAnonymousReview(row, reviewerName,
serviceTitle)` (all three identity-bearing fields redacted together; an
anonymous row gets nulls regardless of what the caller resolved).
New `_redact.test.ts` — 6 tests, including the required one: an anonymous row
never carries `requestId`, `reviewerName` or `serviceTitleAr` even when both
are handed in.
- `src/app/api/v1/reviews/route.ts:6,59,90` — the route named in the audit.
- `src/app/api/v1/lawyers/[id]/route.ts:6,137,165-176` — **also fixed.** Not in
  the audit's G6 line, but `hydrateReviews` had the identical defect and it is
  the route behind the PUBLIC page, so fixing only the first would have left
  the review publicly de-anonymised.
- Both renderers already gate on the value and were left untouched, verified:
  `_components/profile/ReviewsPanel.tsx:194-196` («الخدمة: …») and
  `lawyers/[slug]/page.tsx:923-924` («عن: …»).

### 7 · G7 — notice when the Phase-7 columns are missing
`src/app/dashboard/lawyer/profile/edit/page.tsx:547-569` — one line where the
hidden sections would have been:
«حقول الملف المهني (الرابط، النبذة، المؤهلات) تحتاج تشغيل ترحيل 20260907 على هذه
القاعدة.»
Gated `loaded && !newFieldsAvailable`, not `!newFieldsAvailable` alone: that
flag is also false before the first read answers, on a failed read, and when
there is no professional row — three states that already have their own banners
and none of which is a missing migration. The second gated block (`:643`) gets
a pointer comment, not a duplicate sentence.

### 8 · UAT-LIVE-CASE-001 — new-case form + server validation
**(a) Client** — `src/app/dashboard/lawyer/_components/AddCaseModal.tsx`
- `:107` `step1Complete`, the one rule both steps share.
- `:310-341` «التالي» gains a real `disabled` + `aria-disabled` + title
  (`:323-325`); it was styled grey and fully clickable. `:366-374` Save
  honours the same rule (`:369`).
- `:114-126` `handleSave` re-validates and returns to step 1 with an Arabic
  reason (`:123`).
- **Deleted** the two silent fallbacks (old `:109` `title.trim() || \`قضية —
  …\`` and old `:115` `clientName.trim() || user.name || "عميل نظامي"`). The
  payload now sends the trimmed values or nothing is sent at all.

**(b) Server** — new `src/lib/services/serviceRequestIntake.ts` +
`serviceRequestIntake.test.ts` (10 tests).
`validateServiceRequestCreate(body)` → `{ ok, value } | { ok:false, status:400,
error }`: `title` non-empty ≤ 200, `description` a string ≤ 5000, `requester` a
plain object when present, `lawyerClientId` a uuid when present, and
`type`/`receiver` restricted to the DB CHECK lists, copied from
`supabase/migrations/20260814_service_orders_types.sql:22-25` (the latest
redefinition of `type`) and
`supabase/migrations/20260518_client_workflow_backend_ready.sql:11`
(`receiver`, never redefined). Called at
`src/app/api/v1/service-requests/route.ts:265-278` (the call is `:275`) — right after `requestData`
is unwrapped, i.e. before the payment-gateway gate, the entity-scope
resolution, the `lawyer_clients` lookup and the insert, so a malformed body
cannot come back with an unrelated reason. The insert reads the validated
values (`:465-475`); `:428-430` drops the route's own ad-hoc
`lawyerClientId` shape check, keeping the DB-backed ownership check.
`checkOrderIntake` is untouched — it validates `metadata.intake` for the four
AI services only.

**(c) موكل modelling — OPTION 1 (require a card), the preferred one.**
A free-text name used to mean «no card»: the name went into the `requester`
jsonb and `lawyer_client_id` stayed null, so the موكل existed on that one row
and nowhere else — invisible to «الموكّلون», to the client file, and to every
count that joins on that column. Typing a name now **creates** the card
(`createLawyerClient`, `AddCaseModal.tsx:131-159` — the call is `:141`, reusing the modal's existing
picker and the existing `POST /api/v1/lawyer/clients`, which already allows
`lawyer` and `firm`) and links the case to it, so `lawyer_client_id` is always
set. A «نوع الموكّل» select (`:278-300`, guarded at `:286`) appears only while naming a new موكل,
because `lawyer_clients.client_type` is NOT NULL with a CHECK
(`20260903_phase2…:139-140`). Card-creation failure aborts the save with its own
Arabic reason — no case is written without its موكل. The success screen names
the card it created (`:235-238`). Demo mode is excluded: there is no cards API
there (`createLawyerClient` throws by design), so that branch keeps the local
store, which is its real backend.

*Why option 1 and not the «بدون بطاقة موكّل» label:* the label would have been
honest about the gap but would have left it — `lawyer_client_id` still null,
the موكل still unreachable from «الموكّلون», and the plan's own proof
requirement («a `service_requests` row has `lawyer_client_id`») still
unmeetable for any case created this way. The picker and the create route both
already existed, so the preferred option cost one extra select and one extra
request.

### 9 · UAT-LIVE-AI-001 / UAT-GHOST-002 — «داعم الاتجاه» hidden honestly
- `src/app/ai/direction-support/page.tsx` — body replaced with
  `DashboardComingSoon` (pattern copied from
  `src/app/dashboard/business/departments/page.tsx`, including its convention of
  keeping the epitaph of what was removed in the file). All four files in the
  folder are kept on disk and in git.
- `grep -rn "direction-support.data" src` → **0 hits**, so the fixture leaves
  the bundle. (The page's comment names the file without spelling it, so that
  grep stays a real check instead of matching itself.)
- `src/constants/navigation.sidebars.legal.ts:98-101` and `:339-340` — badge
  «جديد» → «قريباً», the convention already used for «الخزنة القانونية» at
  `:149` and `:374` (owner ١٣٦) and **enforced** by
  `src/lib/services/navComingSoon.test.ts`, which asserts every nav row
  pointing at a `DashboardComingSoon` page is badged «قريباً» and that none is
  badged «جديد». That test now covers this route and passes.
- `src/app/dashboard/lawyer/_data/mockData.ts:106-109` — AI_QUICK tile badge
  «جديد» → «قريباً».
- `src/constants/lawyerAiCatalog.ts:38-47,205-216,295-298` — this file had **no**
  coming-soon convention, so rather than removing the entry it gains
  `comingSoon?: true` on `LawyerAiTool`, set on this one tool, and
  `getLawyerAiBadge` checks it before any price: the AI hub card now reads
  «قريباً» instead of «١٠٠ نقطة». Removing the row was rejected because it would
  drop `ai:direction-support` from `LAWYER_AI_PERMISSION_KEYS`
  (`useUser.ts:16,239`) — and `ai/layout.tsx` would then refuse the lawyer even
  the «قريباً» page — and would drop the admin pricing key.

The real feature (داعم الاتجاه + المدقق التشريعي) stays out of this plan; it
needs its own spec per owner decision ٥.

## Proof still owed (plan §WP-4 *Proof to close*)

Nothing below can be produced from this worktree: it needs a running deploy, a
verified lawyer account and a database. Every item is still **open**.

| # | Proof | Needs |
|---|---|---|
| P1 | ي‏١.1 — edit headline + slug, save, reload; the profile page shows «رابط ملفك العام» with the saved slug and the beta sentence | browser + a lawyer account whose DB has `20260907` |
| P2 | ي‏١.2–ي‏١.3 — phone-in-bio refusal; qualification + 2 courts + 2 languages render in «نبذة» | browser (unchanged by WP-4; re-test only) |
| P3 | ي‏١.4 — a **second** lawyer takes the same slug → «هذا الرابط مستخدم من محامٍ آخر» under the field | two lawyer accounts |
| P4 | ي‏٢.1–3 — add a fixed-price service, a quote service, toggle, delete | browser + `lawyer_services` rows |
| P5 | ي‏٣ — print / save as PDF: the new link row must NOT appear (it is `print:hidden`) | browser print preview |
| P6 | ي‏٤.1–4 — client reviews a completed assigned request, **anonymously**; the lawyer's «التقييمات» tab shows no name, **no «الخدمة: …» line**, and the reply flow still works | a client account + a completed assigned request + `reviews` row |
| P7 | ي‏٤.4 public half — the same anonymous review on `/lawyers/[slug]` shows no «عن: …» line (needs `BETA_MONOPOLY_MODE` off or a direct API read of `/api/v1/lawyers/[id]`) | API read is enough |
| P8 | ك‏١.1 — settings «الملف الشخصي» on a lawyer shows «الجنسية», saves, survives reload and a private window; `profiles.nationality` row check | browser + DB |
| P9 | ك‏١.5 — toggle «أستقبل موكلين جدد» in «المهنة», reload `/dashboard/lawyer/profile`, the 4th tile flips | browser + `lawyer_profiles.is_accepting_clients` row check |
| P10 | G — «مشاركة ملفي المهني» on `/dashboard/lawyer` copies the **slug** URL, not the UUID (requires `BETA_MONOPOLY_MODE` off to be clickable at all) | browser |
| P11 | UAT-LIVE-CASE-001 — a new case with an empty client or title **cannot** be submitted; a valid one appears after reload and its `service_requests` row has a non-null `lawyer_client_id`; a new `lawyer_clients` card exists for a typed name | browser + two DB queries |
| P12 | UAT-LIVE-CASE-001 server half — a direct `POST /api/v1/service-requests` with `{"title":"   "}` returns **400** with the Arabic reason, and with a 201-char title likewise | authenticated API call |
| P13 | UAT-LIVE-AI-001 / UAT-GHOST-002 — `/ai/direction-support` shows «قريباً»; no lawyer/firm nav row and no AI-hub card carries «جديد» for it | browser |
| P14 | G7 — on a database **without** `20260907`, the editor shows the migration notice instead of silently hiding the sections | a staging DB behind that migration |

## Open risks

1. **`npm run build` was not run** in this worktree (the §0 baseline gate names
   it alongside type-check and test:unit). Type-check and the full unit suite
   are green; a production build should still be run before the PR.
2. **Title length is now enforced at 200 but not at the input.**
   `src/app/dashboard/client/requests/new/page.tsx:207` has no `maxLength` on
   the subject field, so a client who types more than 200 characters now gets a
   400 with the Arabic reason instead of a silent save. The message names the
   limit, but adding `maxLength={200}` there (WP-5 territory) would make it a
   non-event. No other caller can exceed it — all were read.
3. **Card creation is an extra request inside the save.** If
   `POST /api/v1/lawyer/clients` succeeds and the case POST then fails, the card
   survives without a case. The modal keeps the created card selected so a retry
   attaches to it rather than creating a duplicate, but an abandoned modal
   leaves an empty client card behind. A card with a name and no case is honest
   (the lawyer did name that موكل) — but it is a new row the lawyer did not
   explicitly ask for, and a reviewer should agree that is acceptable.
4. **Duplicate cards by name are not prevented.** `lawyer_clients` is unique on
   identity numbers, not on name, so typing «مؤسسة العليان» twice (instead of
   picking the existing card) creates two cards. The picker is offered first and
   the placeholder now reads «— موكّل جديد (اكتب الاسم أدناه) —», but nothing
   refuses the duplicate.
5. **When the clients list is unreadable the picker is hidden entirely**
   (`clientsUnreadable`, pre-existing), so the lawyer can only type a name — and
   will therefore always create a card, possibly duplicating one that exists but
   could not be listed.
6. **`src/app/sitemap.ts:81` still advertises `/ai/direction-support`** and
   `src/proxy.ts:115` still protects it. Both are arguably correct for a
   reachable page that says «قريباً», and neither was touched; flag for whoever
   owns the sitemap.
7. **The AI hub card's description for a coming-soon tool is generic.**
   `src/app/ai/page.tsx:576-582` still calls it «أداة قانونية رسمية ضمن كتالوج
   المحامي ونظام الرصيد» — true (the pricing key is real) but thin next to a
   «قريباً» badge. Left alone to keep this pass surgical.
8. **`enrichReviews`' existing tradeoff is unchanged:** `service_requests.title`
   is still not run through `stripOffPlatformContact()` before being published
   as `serviceTitleAr` for a NON-anonymous review — the route's own comment
   explains why (the phone pattern matches Saudi case numbers). G6 narrows the
   exposure to named reviews only; it does not close that one.
9. **`lawyer_profiles.is_accepting_clients` is read as `=== true`** on the
   profile page while the editor reads it as `?? true` (the column's own
   default). On a row where the column is NULL the two screens will disagree.
   The tile is the stricter, non-asserting read; the editor's default is the
   older behaviour. Worth one owner decision if a NULL row is ever observed.
10. **Concurrency with other agents:** this branch touched
    `src/app/api/v1/service-requests/route.ts` (3 hunks: an import, the
    validator call, the insert + the `lawyerClientId` line) and read but did not
    modify `src/app/api/v1/profile/route.ts`, `src/hooks/useUser.ts`,
    `src/constants/settingsReadiness.ts`, `src/app/dashboard/business/**` and
    `src/components/dashboard/GlobalSearch.tsx`. `service-requests/route.ts` has
    **mixed line endings** (631 CRLF + 44 LF lines); the added lines are CRLF,
    matching their neighbours, and the LF block was left untouched — check this
    survives the merge.
