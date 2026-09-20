# WP-5 report — client (individual) profile

**Branch:** `wp5` · **Date:** 2026-09-20 · **Plan:** `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` §WP-5
**Evidence read first:** `05-client-business-audit.md` §1, §2, «Gaps & fixes → A. CLIENT» · plan §0 ground rules · plan §5 (Q4)
**Gate before every commit:** `npm run type-check` (0 errors) + `npm run test:unit` (1271 → **1278** passing; +7 new)

> No migration was written and no SQL was run. WP-5 is code-only: Q4's default (no individual address) removes the one item that needed a column, and C-5 is an ops check that belongs to WP-1's apply order.
> GitNexus MCP was **not available** in this session, so every blast radius below was gathered by hand with `grep` and is repeated in the corresponding commit body, as plan §0 rule 5 requires.

---

## 1. What changed, per item

| Item | Verdict | Commit |
|---|---|---|
| C-1 address for individuals | **Not done, by decision** — nothing added | — |
| C-2 summary swallows failures | done | `decision ٤ (client dashboard): C-2 …` |
| C-3 entry point to the profile | done | `owner ك‏١ (individual): C-3 …` |
| C-4 stale settings banner | done (narrowed) | `decision ٤ (settings): C-4 …` |
| Bonus — 200-char subject clamp | done | `WP-5 bonus · UAT-LIVE-CASE-001 …` |
| C-5 `20260827` applied? | **not ours** — ops, in WP-1's apply order | — |
| ز‏٢ «الخطة والحدود» | **re-test only**, no code change | — |

### C-1 — dropped (owner decision Q4, default «no — city only»)

**Nothing was added.** No `address` key in `src/lib/services/profileSettingsFields.ts`, no `address` in the
`profileFields` allow-list of `src/app/api/v1/profile/route.ts`, no validator in `profileEntityFields.ts`, and
**no migration** (`supabase/migrations/20260921_profiles_address.sql` was never created). `profiles.city` is what
an individual has, and ك‏٢'s «العنوان» names the entity's address, not the person's. The audit's C-1 fix block
stays on file for the day the owner asks for it explicitly.

### C-2 — `getDashboardSummary()` no longer answers a failed read with a demo object

`src/lib/services/dashboardService.ts:71` ended in `catch { return { ...DEMO_SUMMARY } }`. A failed
`GET /api/v1/dashboard/summary` therefore arrived at the page as a complete, confident object — `activeCases: []`,
`nextAppointment: null`, `subscription` reading «مجانية» — so «قضاياي» silently disappeared for a client who has
cases and nothing on screen said why.

* `src/lib/services/dashboardService.ts:96` — new pure `summaryReadFrom(body)`: a non-object body (`null`, an
  array, a scalar) is `listFailed()`, never an empty dashboard.
* `src/lib/services/dashboardService.ts:103-115` — `getDashboardSummary()` now returns
  `ListRead<DashboardSummary>`; `DEMO_SUMMARY` survives **only** on the `!isSupabaseMode` branch, where the
  fixture is the answer rather than a stand-in for one that failed.
* `src/lib/services/dashboardService.ts:15-16` — the two imports moved from the `@/` alias to `./api.ts` /
  `./listRead.ts`. This is the house convention for a module whose decision must be reachable from `node --test`
  (spelled out in `profileEntityFields.ts`'s header; `serviceOrders.ts:20` already imports `./api.ts`). Verified:
  `node --test` cannot resolve `@/lib/...` — it throws `ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`.
* `src/app/dashboard/client/page.tsx:241-244` — `summaryRead: ListRead<DashboardSummary> | null` +
  `summaryAttempt` replace `summary: DashboardSummary | null`.
* `src/app/dashboard/client/page.tsx:266-290` — the effect stores the read (with a `cancelled` guard and a
  `console.error` backstop that also lands on the unreadable branch), and `retrySummary` (`:283`) bumps the attempt.
* `src/app/dashboard/client/page.tsx:292-293` — `summaryView = listViewState(loading, summaryRead)` and
  `summary = itemsOf(summaryRead)[0] ?? null`: the same two helpers the documents card uses, so there is one
  spelling of «تعذّرت القراءة» on this page, not two.
* `src/app/dashboard/client/page.tsx:535` — the skeleton gate is `summaryView === "loading"` only. It was
  `loading || !summary`; leaving `!summary` in would have parked every unreadable summary on a skeleton that
  never resolves.
* `src/app/dashboard/client/page.tsx:555-576` — the unreadable branch: an amber banner at the top of the page,
  «تعذّرت قراءة ملخص لوحتك — قضاياك ومواعيدك وباقتك غير معروضة الآن، وهذا لا يعني أنها غير موجودة.» with an
  in-place «إعادة المحاولة» button. Same colours, icons and retry shape as the documents card at `:1016-1041`.
* `src/lib/services/dashboardService.test.ts` — **new, 7 tests**: an object body is a ready read carrying that
  exact object; `{}` is ready (an account that ordered nothing is a real answer); `null`, arrays and scalars are
  unreadable; an unreadable read hands the page no items and no plan to print; loading outranks both.

**Callers adapted:** `grep -rn "getDashboardSummary" src` → the definition, `src/lib/services/index.ts:109`
(a barrel re-export with no importer of its own) and `src/app/dashboard/client/page.tsx` (import at `:17`, one
call). There is no second caller left assuming a summary object.

### C-3 — «الملف الشخصي» entry point, and `/settings?tab=` made real

* `src/app/dashboard/client/page.tsx:693-701` — a third, deliberately quieter control in the welcome-hero button
  row: «الملف الشخصي» → `/settings?tab=profile`, with `UserCircle` added to the existing icon import at `:11`.
* **The query param did not exist.** `src/app/settings/page.tsx` read no `searchParams`, no hash and no
  `useSearchParams` (`grep -rn "searchParams|useSearchParams" src/app/settings` → nothing), so any `?tab=` was
  decorative and every link landed on `tabs[0]`. `src/app/settings/page.tsx:112-146` now reads `?tab=<id>` from
  `window.location.search` once after mount and selects it **only** when the id is one of the tabs this account's
  role policy actually shows — a hidden tab can never be forced open, and the existing validation effect
  (`:106-110`) still owns the fallback.
  `window.location`, not `useSearchParams()`: the hook would force this statically rendered page under a Suspense
  boundary (the wrapper `marketplace/page.tsx:386-391` and `ai/contracts/page.tsx:435-441` carry for that reason).
  A `useRef` guard rather than a `[]` dependency, because `tabs` comes from `useUser()` and fills in after the
  first paint.
* **Avatar left as-is**, per the plan: there is no Storage/API wiring behind an upload, and a second button that
  only apologises is worse than its absence.

### C-4 — `SETTINGS_BACKEND_READY_MESSAGE` narrowed

`src/constants/settingsReadiness.ts:35-38` (constant) + `:4-34` (new docblock). It used to read
«محلي وجاهز للباك إند: لا يوجد حفظ خادمي أو إرسال بريد أو RBAC إنتاجي في هذه المرحلة.» — a blanket claim over the
whole of `/settings` that is now false.

It was **narrowed, not deleted**: the constant has exactly **one** render site and that tab is read-only, so there
is no «delete it where the tab persists» to perform. `grep -rn "SETTINGS_BACKEND_READY_MESSAGE" src` →

| Site | Action |
|---|---|
| `src/constants/settingsReadiness.ts:35` | the definition — rewritten |
| `src/app/settings/components/tabs/RoleScopeTab.tsx:12` (import), `:40` (`<BackendReadyNotice>{…}</BackendReadyNotice>`) | untouched — it renders whatever the constant holds |

`InvoiceTab.tsx:36` and `SignatureTab.tsx:29` also render `<BackendReadyNotice>`, but with their own children;
neither reads this constant.

New text: the role and capabilities on that tab are computed in the browser from the account type, not from a
server-side permission store, and cannot be edited there; tabs that accept edits do persist; «التوقيع والختم» and
«الفواتير» still store nothing.

### Bonus — 200-character clamp on the request subject

`src/app/dashboard/client/requests/new/page.tsx:222` — `maxLength={200}` on «موضوع الطلب الأساسي», with the
reason at `:205-219`. No counter or hint: nothing else on this form carries one (the description textarea
included) and `src/components/reviews/ReviewForm.tsx:170` sets `maxLength` the same bare way.
**Caveat for the verifier:** on this branch nothing enforces 200 server-side yet — the validator is WP-4 item 8's
(`serviceRequestIntake`) to add. This is the client half landing early; it cannot reject anything the current
server accepts.

---

## 2. What is still local-only in `/settings`

Grepped across every file in `src/app/settings/components/tabs/` for `apiGet` / `apiMutate` / `fetch(` and for
`localStorage`.

| Tab | State | Evidence |
|---|---|---|
| الملف الشخصي · ProfileTab | **persists** | PATCH `/api/v1/profile`. Its `localStorage` use is a per-`user_type` form-draft cache **beside** the server write, not instead of it |
| إعدادات الكيان · EntitySettingsTab | **persists** | `:153` GET, `:227` PATCH `{businessProfile}`, `:236` PATCH `{entitySettings}` |
| إعدادات المهنة · ProfessionTab | **persists** | `:109` GET, `:141` PATCH `/api/v1/profile` |
| الأمان · SecurityTab | **persists** | `:84` GET, `:122` PUT `/api/v1/settings` |
| الإشعارات · NotificationsTab | **persists** | `:377` GET, `:419` PUT `/api/v1/settings` |
| الخصوصية · PrivacyTab | **persists** | `:71` GET, `:108` PUT `/api/v1/settings` |
| المساعدة · HelpTab | **persists** | `submitTicket` / `getMyTickets` (`ticketsService`) |
| الفريق والدعوات · TeamManagementTab | **read-only, real source** | reads `firm_members` via `firmMembersService`; every write links out to `/dashboard/firm/team` |
| **التوقيع والختم · SignatureTab** | **LOCAL-ONLY / nothing stored** | no signature or stamp storage and no eSignature integration; the tab states this itself (`:29-32`) |
| **الفواتير · InvoiceTab** | **LOCAL-ONLY / nothing stored** | inputs are format hints, nothing is sent or stored and no invoice is issued (`:36-39`) |
| الامتثال · ComplianceTab | no input to lose | `EmptyPanel` only — no controls at all |
| التفويض · DelegationTab | no input to lose | `EmptyPanel` only |
| المدفوعات · PaymentsTab | no input to lose | `EmptyPanel` only |
| الخطة والحدود · SubscriptionTab | no input to lose | `EmptyPanel` only |
| دعوة الأصدقاء · ReferralTab | no input to lose | `EmptyPanel` only |
| صلاحياتي · RoleScopeTab | read-only, computed in the browser | `getSettingsRolePolicy()` derives every flag from `user_type`/`sub_role` |

**So: two tabs are genuinely local-only** — «التوقيع والختم» and «الفواتير» — and those are the two the narrowed
message names. The five `EmptyPanel` tabs accept nothing, so nothing can be lost in them; calling them
"local-only" would be its own inaccuracy.

---

## 3. Proof still owed to close WP-5

The plan's *Proof to close WP-5* is a browser + API/DB run against a real individual account. **None of it was
performed here** — this session had no staging credentials, no browser and no database. Owed:

1. **Register an individual → `/settings`** shows name / phone / e-mail (read-only) / city / nationality
   pre-filled; edit → «تم الحفظ»; reload **and** a private window still show the new values.
   *(No address field — that is C-1's Q4 default, and its absence is part of the expected result.)*
2. **`/dashboard/client` shows the real name and plan** — and, with the summary read forced to fail
   (block `/api/v1/dashboard/summary` in devtools, or return a 500), the page must show the amber
   «تعذّرت قراءة ملخص لوحتك» banner with a working «إعادة المحاولة», **not** an empty dashboard. This is C-2's
   acceptance and the only way to see the fix from a browser.
3. **C-3 deep link:** «الملف الشخصي» on `/dashboard/client` opens `/settings` **on the الملف الشخصي tab**; and
   `/settings?tab=security` opens الأمان, while `/settings?tab=entity` on an individual account falls back to the
   first visible tab instead of a blank one.
4. **C-4:** the «صلاحياتي» tab's amber notice reads the new sentence, and no tab that persists shows a notice
   claiming otherwise.
5. **ز‏٢ «الخطة والحدود»** for individuals — re-test only, no code change in this WP.
6. **C-5 (ops, not this branch):** confirm `20260827_signup_contact_fields.sql` is applied on staging using the
   verification query in its own footer. It is in WP-1's apply order.
7. **ي‏٤ review flow** from `/dashboard/client/requests` — shared with WP-4.
8. `npm run build` — the plan's baseline gate (§0 rule 8) requires it before any PR. Not run here; only
   `type-check` + `test:unit` were.

---

## 4. Open risks

1. **`npm run build` was not run on this branch.** `type-check` and `test:unit` both pass, but the C-3 effect in
   `src/app/settings/page.tsx` touches `window.location` — deliberately *inside* a `useEffect` so it never runs
   during prerender. It should still be confirmed by a real build before merge.
2. **`eslint` cannot run in this environment** (`TypeError: Error while loading rule 'react/display-name':
   contextOrFilename.getFilename is not a function` — a plugin/CLI version mismatch, present before any of my
   edits). Lint was therefore not part of this branch's gate.
3. **`src/constants/settingsReadiness.ts` is being edited by another work package** (the role-default predicates
   and the corporate block). My change is 34 added lines and 1 removed, all at the top of the file above
   `SettingsRoleOption`; a merge should be textual, but the file will conflict if the other branch also re-wrapped
   the header.
4. **`src/app/dashboard/client/page.tsx` is large and is touched by C-2 and C-3 both.** Any other branch editing
   the client dashboard will conflict around the welcome hero and the summary effect.
5. **The "unreadable" state is now reachable in a way it never was.** Previously every failure rendered as a demo
   summary, so the page always had a `subscription` object. After C-2 a failed summary renders the hero with no
   «لديك N قضايا» line, no appointment card, and the plan card's neutral «الباقات والأسعار» — plus the banner.
   That is the intended behaviour, but it is a visible change to a production surface and should be seen once in a
   browser before it reaches the owner (proof item 2).
6. **`summaryReadFrom` accepts any plain object at face value.** A 200 response whose body is
   `{ error: "…" }` would be treated as a summary. That is bounded by `apiGet`, which throws on every non-2xx; a
   route that answers 200 with an error envelope would be a separate defect in that route. Deliberately not
   sniffed for here — inventing an oracle out of an optional field is what the page's old comment warned against.
7. **The bonus clamp precedes its server rule.** Until WP-4 lands `serviceRequestIntake`, `maxLength={200}` is a
   client courtesy with nothing enforcing it behind; a direct API caller can still post a longer title.
