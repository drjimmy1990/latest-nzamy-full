# WP-6 report — Business (corporate) profile & membership

**Branch:** `wp6` (off the merged wave-1 master, `75d9226`) · **Date:** 2026-09-20
**Closes (app half):** owner step ك‏٢ (company), UAT-TEAM-001, UAT-BIZ-001, closing-map item 4 («الشركة بلا/بإدارة قانونية»), owner decision ٤ for `/dashboard/business/*`
**Plan:** `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` §2 WP-6 · **Appendix:** `05-client-business-audit.md` §3-§7 and "Gaps & fixes → B. BUSINESS"

**No migration was written in this work package** (plan §3: the company's ك‏٢ address/phone needs none, and `service_model` / `has_legal_dept` already exist). Every column touched here predates this branch:
`business_profiles.metadata` (jsonb, `metadata.settings` is the bag), `service_model` (CHECK in `internal`/`external`/`hybrid`), `has_legal_dept` (boolean NOT NULL DEFAULT false) — all in `supabase/migrations/20260603_phase1_002_entities.sql:218-234`; `business_members` (nine roles, four statuses) at `:298-318`.

**Gate:** `npm run type-check` clean; `npm run test:unit` **1355/1355** (baseline on this branch was 1271). One commit per numbered item, nine in all.

| # | Commit | Item |
|---|---|---|
| 1 | `90acba0` | B-1 — ك‏٢ address/phone via the jsonb bag |
| 2 | `13fe2d0` | B-2 / B-3 — member scope, owner-only writes |
| 3 | `fa756fe` | B-4 — legal-department flag from the real columns |
| 4 | `2e7a777` | B-5 — the real business members API |
| 5 | `27be494` | B-6 — mock modules out of the bundle + the real team page |
| 6 | `97f1ecf` | B-7 — readiness panel links to the editor that exists |
| 7 | `4e5e21a` | B-8 — independent membership reads |
| 8 | `f3d6300` | B-9 — deny-by-default corporate role |
| 9 | `686a9c2` | B-10 — explicit `entityScope` + «باسم الشركة» on the three intakes |

Two commits follow the nine: `1412bd1` (this report) and `0188da8` — a chore that untracks a `node_modules` SYMLINK the first `git add -A` picked up, because `.gitignore` listed `node_modules/` with a trailing slash and that pattern matches a directory only. The ignore pattern is widened to the bare `node_modules` so the same thing cannot happen in the other WP worktrees, which are set up the same way. The blob stays reachable in history (`git rebase -i` is unavailable here and rewriting nine commits would invalidate every hash cited above); the merged tree is clean.

> **GitNexus MCP was not available in this session.** The blast radius of every edited function/component was gathered by hand (`grep` over `src/`) and is listed in each commit body under `Blast radius:`.

---

## 1. B-1 — a company can enter العنوان and رقم التواصل (owner step ك‏٢)

`EntitySettingsTab.tsx:121` was `isCorporate ? CORPORATE_FIELDS : ENTITY_SETTINGS_FIELDS[userType ?? ""] ?? EMPTY_FIELDS` — an either/or. Firm, micro, government and ngo got `address`/`city`/`phone`/`email`/`website` from the `metadata.settings` jsonb bag; corporate took the other branch and got only the four identity columns, so ك‏٢ could not be performed at all.

| File | What changed |
|---|---|
| `src/app/settings/components/tabs/_entitySettingsFields.ts` | **NEW.** The field catalogue and the two-arm split, extracted from the React component so the split is unit-testable. `ENTITY_SETTINGS_FIELDS.corporate` (`:122-128`) = `address` (span 2), `city`, `phone`, `email`, `website` — the SAME keys the firm uses (`:111-121`), so the bag keeps one shape. `splitEntityTabValues()` (`:139-183` after B-4) returns `{ businessProfile, entitySettings }`. |
| `src/app/settings/components/tabs/EntitySettingsTab.tsx` | `:78-79` resolves BOTH arms (`identityFieldsFor` + `entitySettingsFieldsFor`); the load reads both (`:132-142`); `handleSave` sends both keys in **one** PATCH (`:200-215`); inline Arabic phone error beside the field, checked before the request (`:96-98`, `:170-175`, `renderField` at `:230`). |
| `src/lib/services/profileEntityFields.ts` | `validateEntitySettingsPatch` now enforces a FORMAT on two keys for every entity type: `phone` must normalise through `normalizeSaudiMobile` and is stored E.164 (400 carries `saudiMobileMessage`'s per-reason text); `email` must match `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. `null` and whitespace still clear. |
| `src/app/api/v1/profile/route.ts` | Nothing needed for the read/write path: GET already returned `entitySettings` for corporate (`entityProfileTableFor("corporate") === "business_profiles"`), and the PATCH `entitySettings` arm already merged `metadata.settings` for any mapped type. Verified, not changed. |

**Deliberate side effect, flagged for the owner.** Applying the mobile rule to the bag's `phone` key *for every entity type* (as the brief requires) contradicted three existing field labels: firm and ngo called this key «الرقم الموحد» with a `920XXXXXXX` placeholder and government placeheld the `1950` short code. None is a Saudi mobile, so the form would have been asking for a value the server now refuses. Those labels/placeholders are aligned to «رقم التواصل» / `05XXXXXXXX`. **A unified 920 number now has no field and no column anywhere on the platform.** Recording one needs its own key and an owner decision — see *Open risks* §1.

**Tests:** `_entitySettingsFields.test.ts` (9 cases) + 5 cases in `profileEntityFields.test.ts`.

---

## 2. B-2 / B-3 — member scope; owner-only writes (plan §5 Q2 default)

GET read `business_profiles` by `.eq("owner_user_id", user.id)`. For a member that returns **zero rows, not an error**, so `businessProfile` was null with `roleProfileReadFailed` false and the tab rendered four blank inputs with Save enabled. The PATCH behind them matched zero rows and answered `AR.saveFailed` **500** — an invitation to retry a request that can never succeed.

| File | What changed |
|---|---|
| `src/lib/auth/businessProfileScope.ts` | **NEW.** Pure `resolveBusinessProfileScope()` + `canWriteBusinessProfile()`. Owner outranks member (the 20260914 backfill trigger gives an owner a `business_members` row too). A FAILED read is never reported as `"none"`. |
| `src/app/api/v1/profile/route.ts` | `resolveBusinessScope()` (`:109-160`) — two RLS-scoped reads, each error logged, decided by the pure function. GET: `:307-360` resolves the row by scope and reads it by id; envelope gains `businessProfileScope` (`:398`), corporate only. PATCH: one owner gate for BOTH write arms (`:704-721`), before either write. |
| `src/app/settings/components/tabs/EntitySettingsTab.tsx` | `:104-105` derives `readOnly` / `noBusinessRow`; member → every input and the capacity select disabled + «هذه البيانات يعدّلها مالك الحساب فقط» + **no Save button at all**; `none` on a corporate account → an empty state instead of a form with nowhere to save. A route deploy without the key reads as `"owner"`, i.e. today's behaviour. |

### API contract — `GET /api/v1/profile` (changed keys only)

```
200 { profile, roleProfile, roleProfileReadFailed, subscription, entitySettings,
      businessProfile?, businessProfileScope? }
```
* `businessProfile` / `businessProfileScope` are emitted **only** for `user_type === "corporate"`, so the three existing readers that destructure `{ profile, roleProfile }` are unaffected.
* `businessProfileScope: "owner" | "member" | "none"` — the caller owns the company row, is an ACTIVE member of one, or neither.
* A read FAILURE is reported through the existing `roleProfileReadFailed: true`, never as `"none"`. The tab already honours that marker by disabling Save.

### API contract — `PATCH /api/v1/profile` (changed answers only)

| Case | Before | Now |
|---|---|---|
| corporate MEMBER sends `businessProfile` or `entitySettings` | 500 `AR.saveFailed` (or 404 for the bag arm) | **403** «تعديل بيانات الشركة متاح لمالك الحساب فقط.» |
| corporate owner, no company row | 500 / 404 | 404 «لم نعثر على بيانات الكيان الخاصة بحسابك.» |
| scope unresolvable (a read failed) | wrote nothing, reported a save failure | 500 `AR.saveFailed` — refusing rather than guessing who the caller is |

RLS refuses a member's write regardless; this check exists so the REASON reaches the user in Arabic, not so the database can be trusted less.

**Tests:** `businessProfileScope.test.ts` (8 cases) + 6 source-assertion cases in `profile/route.test.ts`.

---

## 3. B-4 — the legal-department flag comes from the company's own row

`grep has_legal_dept src` returned exactly one hit before this: the type declaration at `src/types/database.ts:202`. Nothing selected or updated either column. What decided the with/without-legal-department distinction **in production** was the subscription tier (`resolveFeatureAccess("team-legal-department")`, pinned by `featureAccess.test.ts:98-108`), and in demo mode a localStorage `hasInternalLegal` flag about a fictional company.

* `_entitySettingsFields.ts:70-76` `SERVICE_MODEL_OPTIONS` (the three CHECK values, Arabic labels) and `:94-106` the two controls in `CORPORATE_FIELDS` — a `<select>` and a toggle, never free text.
* `EntitySettingsTab.tsx` `renderField` branches on `control` (`:216-262`); both are disabled for a member like every other field.
* `profile/route.ts`: GET select `:329`, envelope `:353-354`, PATCH returning select `:814`.
* `profileEntityFields.ts` `validateBusinessProfilePatch`: `service_model` must be one of the three (Arabic 400 rather than a Postgres 23514); `has_legal_dept` must be a real boolean. **Neither accepts null** — both columns are NOT NULL with a default, so "clear" is not a state they have.

**Not done, deliberately, per plan §3 ⓡ2 and §2 WP-6.3:** `handle_new_user()` is untouched and `corporateSignupMetadata()` is not extended. The company sets both from «إعدادات الكيان» after signup; the column defaults cover the gap until it does.

**`can("team-legal-department")` at the old `business/team/page.tsx:285,410` (pre-`27be494`) is NOT carried forward.** The brief made that replacement conditional on the page surviving item 5 as a real page. It did — but the control the flag gated there was the «تفعيل صلاحيات محامي» PowerModal, whose confirm button had no handler and which has no schema behind it, so it is gone rather than re-gated. `featureAccess.ts` is unchanged and still tier-based for its other keys. See *Open risks* §4.

---

## 4. B-5 — the real business members API (plan §5 Q7 = yes)

Until this commit the only writer of `public.business_members` was the `ensure_business_owner_membership` backfill trigger (20260914). The RLS write policies already exist after WP-1 D (`20260921_03`): INSERT/UPDATE/DELETE require `public.is_business_owner(business_id)` or admin; SELECT admits own row / active member / owner / admin.

### New files

| File | Role |
|---|---|
| `src/lib/auth/businessMembershipAccess.ts` | The nine CHECK roles as a **runtime** array, the four statuses, `BUSINESS_ROLE_LABEL` (Arabic), and `decideBusinessMemberPatch()` — a pure decision so the PATCH's whole 400 surface is testable. `owner` is a real role and is never invitable or PATCH-able. |
| `src/app/api/v1/business/members/route.ts` | GET + POST |
| `src/app/api/v1/business/members/[memberId]/route.ts` | PATCH |
| `src/lib/services/businessMembersService.ts` | Typed client over `ListRead`, mirroring `firmMembersService.ts` |

### Contract — `GET /api/v1/business/members`

```
200 { data: BusinessMember[], total: number, canManage: boolean }
403 the caller is neither the owner nor an ACTIVE member
404 no company on this account
500 a read failed  (never `{ data: [] }` — see src/lib/services/listRead.ts)
```
Active rows first, then `created_at` ascending. `canManage` is true **only** for the owner, so the UI hides its write controls rather than discovering the 403 by pressing them.

```ts
BusinessMember = {
  id, businessId, userId,
  role: BusinessRole,            // one of the DDL's nine
  status: "invited"|"active"|"suspended"|"removed",
  displayName: string | null,    // null = NOT READABLE, not "no name"
  email: string | null,
  isOwner: boolean,              // user_id === business_profiles.owner_user_id
  acceptedAt: string | null,
  createdAt: string,
}
```

### Contract — `POST /api/v1/business/members`

```
body { email: string, role: BusinessRole }   // role ∈ the EIGHT invitable ones
201 { data: BusinessMember }
400 missing e-mail, or a role outside the eight
403 the caller is not the company owner (also the RLS answer, 42501)
404 no company on this account, or no account with that e-mail is readable to this caller
409 that account is already on this company's roster (uq_business_members_business_user)
```
The insert mirrors `/api/v1/firm/members` POST exactly: `status: 'active'` with `accepted_at` set, **not** `'invited'`. There is no invite e-mail and no acceptance screen anywhere in the product (`team_invitations` exists and is unused), so a row parked at `invited` would be a pending invitation nobody can accept.

### Contract — `PATCH /api/v1/business/members/{memberId}`

```
body { role?, status? }   // at least one; status ∈ active | suspended | removed
200 { data: BusinessMember }
400 nothing to update, or an unrecognised role/status
403 not the owner, or the target row IS the owner's own row
404 no company on this account, or no such member in THIS company
500 a read or the write failed
```
`removed` is a status, not a DELETE: the row stays so the company keeps a record. Every membership read in this repo filters `status = 'active'`.

### Names and e-mails — ⓡ **superseded 2026-09-20, see *Open risks* §1**

> **As shipped in `2e7a777`:** both routes read `profiles` with the caller's own RLS client and no `service_role` anywhere, so `displayName`/`email` came back null for every row but the caller's own and POST's e-mail lookup could resolve nobody else. That was recorded here as the top open risk.
>
> **As it stands now (fix-pass commit, see *Open risks* §1):** both routes follow the pattern `/api/v1/firm/members` has always used — an RLS-scoped ownership check **first**, then a server-only `createServiceClient()` projection of `profiles` limited to `id, display_name, email` (+ `user_type` on the invite lookup). Colleagues' names resolve; invite-by-e-mail works. The `null` in the DTO survives and now means only «the projection itself failed».

### Also in this commit

* `TeamManagementTab.tsx` — the corporate branch reads the real roster. Its old copy («لا يوجد لهذا النوع من الحسابات جدول أعضاء مماثل بعد») is gone: wrong about the schema then, wrong about the code now. Both rosters render through one `RosterRow` shape.
* `settingsReadiness.ts` `CORPORATE_INVITE_ROLES` — `compliance_officer` and `seconded` added (now the eight invitable roles, matching what POST validates). `isCorporateComplianceManager` already branched on the first and the team page already rendered labels for both. The constant is now `export`ed for the team page.
* **NEW** `src/constants/settingsReadiness.test.ts` — none existed. Source assertions (the module imports `@/hooks/useUser`, so `node --test` cannot load it).

**Tests:** 12 + 11 route-folder cases, 3 in `settingsReadiness.test.ts`.

---

## 5. B-6 — mock modules out of the bundle; the real team page (owner decision ٤)

`isHiddenBusinessSection` + `SectionNotReady` is a **client-side layout guard only**: every module below was still compiled into the production bundle and a direct link still rendered it for an admin, who is exempt from that guard. That is precisely what decision ٤ names («الرابط المباشر لا يرسم fixture ولو اختفى من sidebar»؛ «build الإنتاج لا يحمل mock قابلاً للوصول»).

Six page bodies replaced with the `DashboardComingSoon` pattern from `departments/page.tsx`. **No file deleted**; each new header records what was removed:

| Page | Fixture retired |
|---|---|
| `requests/` | `MOCK_REQUESTS` — 6 requests with invented budgets, assignees, offer counts, deadlines; filters/counters summed the same array |
| `consultations/` | 6 consultations with invented lawyer names, fees and **star ratings** |
| `governance/` | `MOCK_RULES` — approval thresholds and approver chains presented as the company's own policy |
| `health-check/` | `MOCK_FILES` / `MOCK_FINDINGS` / `SCORE_BARS` / `PREDICTIVE_INSIGHTS` + a setTimeout that made it look computed |
| `kanban/` | `MOCK_CARDS` — cards with **due dates**, assigned lawyers, checklists |
| `reviews/` | `MOCK_DOCS` — per-department verdicts attributed to named people, with notes and timestamps |

### `grep -rn "MOCK_" src/app/dashboard/business` — what remains, and why

All 13 remaining hits are **comments**, not compiled data:

```
cases/page.tsx:30,42                    — the header documenting the MOCK_CASES this page already lost
departments/page.tsx:8,24               — the pre-existing removal note
governance/page.tsx:10                  ┐
health-check/page.tsx:10,12             │ the removal notes added by this commit
requests/page.tsx:9                     │
reviews/page.tsx:8                      │
kanban/page.tsx:8                       ┘
kanban/_graph-model.ts:67               — prose about a seed the graph model no longer carries
kanban/_use-case-graph-state.ts:20,109  — prose about the same removed seed
```

`_graph-model.ts`, `_use-case-graph-state.ts` and `CaseGraphView.tsx` stay because they have **real** callers outside this folder: `marketplace/workspace/[id]/page.tsx:17`, `firm/cases/[id]/LegalCanvas.tsx:52`, `business/cases/[id]/page.tsx`. `src/constants/healthCheckData.ts` now has no importer at all — left in place (never delete a source) and out of the bundle.

### `/dashboard/business/team` is now real

* Lists `public.business_members` through the new API; add-by-e-mail with the role select drawn from `CORPORATE_INVITE_ROLES`; change role; suspend/activate; remove (status `removed`, behind a confirm step).
* `canManage` comes from the **server**, not a guessed role.
* Gone with no replacement because nothing backs them: the stats row, the two fabricated pending invites, the fake `https://nezamy.sa/invite/x7k2m9p` URL, the dead «إزالة العضو» / «تعديل البيانات» buttons, the «تفعيل صلاحيات محامي» PowerModal, and a seat counter.
* Four read states kept apart (loading / unreadable / empty / ready) — no «٠ أعضاء» over a failed read.
* `navigation.sidebars.business.ts` gains the «إدارة الفريق» entry; `VISIBLE_BUSINESS_ROUTES` is **derived** from `CORPORATE_SIDEBAR`, so that one line re-opens the route. `labelEn: "Team"` is already in `CORP_ROLE_ALLOWED_ITEMS` for `owner` and `hr_manager` (`navigation.sidebars.ts:293,297`).
* `navigation.sidebars.business.test.ts` updated: the pinned visible list is three routes; the team page moved out of both "hidden" sets; a new case asserts `/teams` and `/team-legacy` are still refused.

---

## 6. B-7 — the readiness panel stops denying that an editor exists

`BusinessProfileReadinessPanel.tsx` told a company with no saved record *"There is no corporate profile editor to link to"* and offered `/contact` as the only way out. The empty state now links «افتح إعدادات الكيان» → `/settings?tab=entity`, with `/contact` kept as the secondary route (it really submits, and is the right answer when the row is missing or the caller is not the owner).

`settings/page.tsx` now **honours `?tab=`**, which it never did — the parameter was ignored and every deep link landed on «الملف الشخصي», so shipping the link without this would have been a second false promise. Read from `window.location` inside an effect rather than `useSearchParams`, so the page does not acquire a Suspense boundary it does not otherwise need. Applied once, only after the policy has produced tabs, and **only to a tab the policy grants** — a hand-typed `?tab=entity` cannot open a tab the account is not entitled to.

---

## 7. B-8 — one failing membership query no longer discards the other three

`useUser.readEntityMemberships` collapsed all four reads on any one error. That is the 42P17 blast radius: a recursive `business_members` policy threw and took the caller's own `business_profiles` row with it. On a cold load (nothing to carry forward) the user was thrown out of `/dashboard/business/**` and `/dashboard/firm/**`, lost business scope on the shared intake (so a request filed in that window became a **personal** request with no `business_id`), and got `businessRole: undefined`, which the settings policy read as the owner.

* **NEW** `mergeMembershipReads()` in `src/lib/auth/entityMembership.ts` — pure; takes the four reads as `{ summary, failed }`. A membership row outranks the owned-profile fallback per entity. `unavailable` **only** when all four failed. A summary from a failed read is ignored. Returns `degraded` (see B-9).
* `useUser.ts:645-700` maps its four rows into that shape, logs each failing read by table name (it logged nothing at all before), and delegates the merge. The outer `catch` still returns `unavailable`, which is correct there: a throw means nothing was read.
* 8 new cases in `entityMembership.test.ts` — none existed for this — including the exact 42P17 case.

---

## 8. B-9 — an unknown corporate role denies instead of granting owner rights

All three corporate predicates read `role ?? "owner"`. `businessRole` is `memberships.business?.role ?? meta.business_role` and **no signup writes that metadata key**, so "unknown" was not an edge case: it was every corporate account whose membership read had failed — the 42P17 population of UAT-TEAM-001 — shown entity, team, billing and compliance settings.

* `settingsReadiness.ts:155-167` — all three are now `role ? [...].includes(role) : false`. B-8 is what makes that safe: a real owner gets `role: "owner"` from the owned-`business_profiles` fallback, which now survives a failing `business_members` read.
* A denial must say WHY. `SettingsRolePolicy.roleUnavailable` (`:64`, set at `:304`) is set in the corporate branch only when `businessRole` is unknown **and** the session's membership reads were degraded or failed — never when the account genuinely holds no entity role. `settings/page.tsx:164-173` renders «تعذّر قراءة دورك داخل الشركة… هذه ليست قائمة صلاحياتك النهائية».
* To tell those apart the session carries the fact: `UserSession.membershipState: "ok" | "degraded" | "unavailable"` (`useUser.ts:138`, field at `:147`, computed at `:908-916`). A session carried forward from a previous read counts as `degraded`, not as a fresh answer.
* 3 new source-assertion cases in `settingsReadiness.test.ts` + 1 in `entityMembership.test.ts`.

---

## 9. B-10 — the three corporate intake paths say, and send, whose request this is

`resolveServiceRequestEntityScope` has always supported an explicit scope validated against a server-proven membership, but nothing in `src` sent one, so attachment rested on `sourcePath` string matching. Rename a route and a company's request silently becomes personal — invisible to the rest of the company.

* `AddCaseModal.tsx` now sends `entityScope: "business"` when the session has a business membership. The two client forms already did (wave 1); their payloads are untouched.
* All three show «سيُقدَّم هذا الطلب باسم <اسم الشركة>» above the submit button, through a new pure `businessIntakeNoticeAr()` in `src/lib/services/businessOverview.ts`. It goes through `accountDisplayName`, so «شركة جديدة» — what the signup trigger wrote into the NOT NULL `company_name_ar` for every corporate account created before 20260826 — is never printed back as a trading name; the fallback still states the fact that matters («…باسم منشأتك المسجَّلة، لا باسمك الشخصي»).
* `serviceRequestEntityScope.test.ts` grew from 5 to 13 cases: one per branch of the six exits plus the fall-through, and an exhaustive sweep over 5 paths × 6 scopes × 5 account types asserting no result ever carries both ids and every error result carries neither.

---

## What is still mock under `src/app/dashboard/business`

All of these are **hidden** by `isHiddenBusinessSection` (they are not in `VISIBLE_BUSINESS_ROUTES`) but are still compiled into the bundle and still reachable by direct link for an **admin**, exactly like the six this WP gated. They were **not in WP-6's list**, so they were left alone rather than swept in silently.

| Path | Fixture still compiled | Why it was left |
|---|---|---|
| `circuits-emails/page.tsx:29` | `INITIAL_CIRCUITS` | Not in the WP-6 item list |
| `employee-contracts/page.tsx:34` | `CONTRACTS` | " |
| `hearings/page.tsx:20` | `EVENTS` | " |
| `reports/page.tsx:14,49` | `DEPT_REPORTS`, `MONTHLY_TREND` | " |
| `seconded-counsel/page.tsx:16,41` | `COUNSEL`, `TASKS` | " |
| `wallet/page.tsx:13,22,29` | `WALLET_DATA`, `USAGE_HISTORY`, `BILLING_HISTORY` (two PAID invoices) | " |
| `marketplace/page.tsx` | via `MyMarketplaceDashboard` → `MY_REQUESTS` | Marketplace is not part of the manual-fulfilment model |
| `procedures-expert/page.tsx` | re-exports `/ai/procedures` | Somebody else's page |

`cases/page.tsx` and `documents/page.tsx` are real reads and are not in this list. **Recommendation:** one follow-up commit applying the same `DashboardComingSoon` treatment to the six rows above would make `grep -rn "MOCK_\|INITIAL_\|const [A-Z_]*: .*\[\]" src/app/dashboard/business` mean something as a gate; it needs the owner's route-by-route call (decision ٤ was scoped to the named pages).

---

## Proof still owed under "Proof to close WP-6"

The owner's closing standard — «لا يُغلق شيء هنا إلا بإثبات متصفح + API/قاعدة بيانات + إعادة اختبار بعد إصلاح المبرمج». A green unit suite closes nothing. Owed:

1. **`npm run build`.** It could **not** be run in this worktree: `sh: 1: next: Permission denied` (`node_modules` is a shared symlink). The plan's baseline gate is `type-check && test:unit && build`; the third is unverified for this branch.
2. **WP-1's migrations applied to staging** — WP-6 depends on `20260921_03` (the `business_members` / `business_profiles` policy matrix, without which every read here still throws 42P17) and `20260914` (the `business_id` column and the business-request SELECT policy). Nothing in this WP was exercised against a live database.
3. **Corporate OWNER browser round:** register (company name, CR, representative capacity, service model) → `/settings` → «إعدادات الكيان» shows identity + address/city/phone/email/website + the service-model select and the legal-department toggle → edit → «تم الحفظ» → persists after reload **and in a private window** → the DB row shows `metadata.settings.phone` in `+9665…` form and `service_model` / `has_legal_dept` set.
4. **Corporate MEMBER browser round:** a `legal_manager` added through `POST /api/v1/business/members` logs in → «إعدادات الكيان» renders the company's real data **read-only** with «هذه البيانات يعدّلها مالك الحساب فقط» and no Save → a forced `PATCH` returns **403**, not 500.
5. **`/dashboard/business` on a COLD tab** (fresh private window) loads without a 500 for both owner and member — the B-8 case.
6. **Tenant isolation:** the member creates a request → `service_requests.business_id` is set → a member of company B does not see it. Re-run the business checks in `scripts/uat/verify-core-tenant-isolation.ps1` with **fresh synthetic actors**.
7. **`grep -r MOCK_ .next/server/app/dashboard/business` is empty** after a real build (this report proves only the source-level grep).
8. **Direct-link check** on `/dashboard/business/{requests,consultations,governance,health-check,kanban,reviews}` **as an admin** — they must render «قيد الإعداد», not a fixture.
9. **«بعد» screenshots** for every item with an owner «قبل» screenshot in `docs/audits/2026-09-14-screenshot-reconciliation.md`.

---

## Open risks

1. ~~**Invite-by-e-mail cannot find anyone but the caller (highest).**~~ → **RESOLVED — aligned to the firm pattern** (fix pass, 2026-09-20, after the wave-1/wave-2 merges).

   *The risk as filed.* WP-6 read its brief's «no `service_role` on a user read path» as absolute, so `POST /api/v1/business/members` resolved the invite e-mail with the caller's own RLS client. After `20260921_01`, `public.profiles` admits exactly three policies and none is broader than «your own row», so that lookup could never resolve a colleague: **every invite to a real person answered 404**, and every other member's `displayName`/`email` was null on the roster. The feature was built, correct, and unusable.

   *Why it is resolved without a migration.* The proposed fix — a `security definer` RPC — would have been a **second** mechanism for a problem this codebase had already solved. `/api/v1/firm/members` (baseline code, not written by this plan) does exactly the same job for a firm, and does it in the established way:

   | step | firm (`firm/members/route.ts`) | business (now) |
   |---|---|---|
   | authorize, RLS client | `resolveCallerFirm` + `FIRM_TEAM_VIEW_ROLES` gate (`:108-118`) | `resolveCallerBusiness` → `scope.businessId` guard (`:219-230`); POST: `business_profiles.owner_user_id = user.id` + the `!business` guard (`:312-330`) |
   | *then* the service key | `createServiceClient()` (`:135`, `:202`) | `createServiceClient()` (`:254`, `:337`) |
   | projection | `id, display_name, email` (+ `user_type` on the invite) | identical |
   | key set | `.in("id", userIds)` from the RLS-scoped roster; one e-mail, `user_type`-restricted | identical |

   *Why it is not the thing ground rule 3 forbids.* That rule bans using `service_role` **to impersonate a user or bypass RLS in a normal read path** — i.e. to *decide* who may see what. Here RLS still makes every authorization decision, and it has already made it before the key exists: the service client is created after the ownership/membership check, is asked for three display columns of a closed set of ids the RLS-scoped query itself returned, and never reads a full row. It is a server-only projection for rows the caller is proven entitled to see. The same reasoning has governed `/api/v1/firm/members` since Phase 2.

   *Blast radius of the divergence, had it stayed.* Two entity rosters with two different security models, one of which does not work; a `security definer` RPC to review, deploy and keep in step; and a WP-6 that ships a feature the owner cannot use in the browser round — which the closing standard would have refused.

   *What changed.* `src/app/api/v1/business/members/route.ts` (header `:46-86`, GET `:245-269`, POST `:332-343`, `INVITABLE_ACCOUNT_TYPES` `:195`, `AR.accountNotFound` `:203-209`), `…/[memberId]/route.ts` (`:136-148`), and the three UI comments that asserted the old constraint (`dashboard/business/team/page.tsx:43-50`, `settings/components/tabs/TeamManagementTab.tsx:94-96`, `lib/services/businessMembersService.ts:34-42`). The «no service_role» tests in both business folders became pattern tests — *the service client appears only after the ownership resolution, and `"id, display_name, email"` is the only projection on `profiles`* — and the identical assertions now also run against the firm route in a new `src/app/api/v1/firm/members/route.test.ts`.

   *Two consequences worth naming.* (a) The invite lookup is restricted to `individual`, `lawyer` and `corporate` accounts, so its 404 cannot be used to discover that an address belongs to an admin or to another entity — `corporate` is in the list so that an owner typing their **own** address still gets «عضو مسبقاً» (409) rather than «لا يوجد حساب» (404). (b) `AR.accountNotReadable` → `AR.accountNotFound`: the old copy blamed «ما يسمح به وصولك الحالي», which after this change would be a lie.

   *Still owed:* the browser round. Nothing here has been exercised against a live database, and `20260921_01` is not applied to staging yet.
2. **A unified 920 number now has nowhere to go.** The bag's `phone` key is a Saudi mobile for every entity type (§1), and the firm/ngo «الرقم الموحد» labels were aligned to match rather than left contradicting the validator. If a firm needs to record a 920 number, it needs its own key (`unifiedNumber`) — a one-line addition to `_entitySettingsFields.ts`, but it is new product copy and was not in the brief.
3. **`entityRouteAccess.ts:47` is stricter than the new API.** It restricts `/dashboard/business/team` to `owner`, `legal_manager`, `hr_manager`. `GET /api/v1/business/members` admits any ACTIVE member, so a `legal_staff` member is refused by the route guard even though the API would let them read the roster. Left as-is (it is pre-existing and defensible), but the two should be reconciled deliberately.
4. **`featureAccess.ts` is still tier-based for `team-legal-department`.** B-4 gives the company a real `has_legal_dept`, but nothing reads it yet — the one consumer (`business/team/page.tsx:285,410`) was a fake control and did not survive B-6. Whoever builds the first real "with/without legal department" behaviour should read the column, not the tier; `featureAccess.test.ts:98-108` currently pins the tier behaviour and will need updating with it.
5. **The FIRM role predicates are still fail-open.** `isFirmManager` / `isFirmBillingManager` (`settingsReadiness.ts:129-137`) still do `if (!role) return true` — the same defect B-9 fixed for corporate. Out of WP-6's scope and deliberately untouched; it should be someone's item.
6. **`npm run lint` could not be run** either: the pinned `eslint-plugin-react` throws `contextOrFilename.getFilename is not a function` against the ESLint in this environment. Pre-existing and unrelated to these changes, but it means no lint gate was applied to them.
7. **`src/constants/healthCheckData.ts` is now an orphan** (no importer). Correct per «لا حذف للمصدر», but a reader may mistake it for live data; its own header already says otherwise.
8. **Concurrent branches.** `src/constants/settingsReadiness.ts` is edited by another work package in its header / `SETTINGS_BACKEND_READY_MESSAGE` region; every edit here is **below line 55** (the predicate block, the corporate block, `CORPORATE_INVITE_ROLES`, the policy type). `src/app/dashboard/client/requests/new/page.tsx` was touched only for the intake sentence, leaving another branch's title `maxLength` alone.
