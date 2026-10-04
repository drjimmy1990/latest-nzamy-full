# WP-7 — UAT-GHOST-001: the dashboard search's «من محتواك الشخصي» section

**Date:** 2026-09-20 · **Branch:** `wp7` (off the merged wave-1 master, `75d9226`) · **Closes:** UAT-GHOST-001 (P2)
**Plan:** `docs/plans/PROFILES_COMPLETION_PLAN_2026-09-20.md` §2 WP-7 · **Governing decision:** owner decision ٤, quoted in `05-client-business-audit.md:422-424`

---

## 1. What was wrong

`src/components/dashboard/GlobalSearch.tsx` (the ⌘K palette pinned in every dashboard sidebar) carried a module-level array of three invented rows and rendered them under the heading «من محتواك الشخصي»:

| label | sub | href |
|---|---|---|
| قضية الشركة المتحدة ضد محمد العمري | قضية تجارية • نشطة | `/dashboard/client/cases/1` |
| عقد الإيجار — شقة الرياض | مستند • آخر تعديل أمس | `/dashboard/client/documents/2` |
| استشارة قانونية — حقوق العمال | استشارة • مكتملة | `/dashboard/client/consultations/3` |

Three separate breaches of decision ٤ («كل سطح ثبت أنه يعرض mock أو أرقاماً/أشخاصاً مختلقين يُحجب مباشرة بـ404 أو Coming Soon صادق … الرابط المباشر لا يرسم fixture ولو اختفى من sidebar؛ build الإنتاج لا يحمل mock قابلاً للوصول»):

1. **Invented people and cases** presented as the signed-in account's own content — the same three for a lawyer, a client, a company and a government user alike.
2. **Direct links that draw a fixture.** A lawyer clicking the first row landed on `/dashboard/client/cases/1`, i.e. another profile's dashboard with a made-up id.
3. **Reachable in a production build.** The array was a plain module constant with no mode gate, so it shipped in every bundle that contains the sidebar — eight dashboard layouts.

The empty state was dishonest in a fourth way: with no query, the section printed «قضاياك ومستنداتك ستظهر هنا» / «متاح بعد ربط قاعدة البيانات» — a promise about a backend that was already there.

---

## 2. Option chosen: **(a) bind to the account's real data**

The plan offered (a) bind to real data or (b) delete the section behind «البحث في محتواك الخاص — قريباً». The brief said to prefer (a) when **at least two of the three** sources are already exposed by an existing client-side service. Three were checked:

| source | client-side service | verdict |
|---|---|---|
| **documents** | `src/lib/services/documentService.ts:314` `getDocuments()` → `GET /api/v1/documents` | **available** — throws on failure, returns rows only |
| **service requests** | `src/lib/services/serviceOrders.ts:124` `listMyServiceOrders()` → `GET /api/v1/service-requests` | **available** — throws on failure *and* on the route's `degraded: true` 200 |
| **cases** | `src/lib/services/casesService.ts:91` `getCases()` | **deliberately NOT used** — see below |

Two of three ⇒ option (a), no new API work.

**Why `getCases()` was left out.** `casesService.ts:30-36` imports `SHARED_CASES` from `src/lib/casesStore.ts`, which is itself a fixture of eight invented cases («نزاع تجاري — شركة الأفق», «أحمد الزاهد», …), and `getCases()` returns it verbatim on the `!isSupabaseMode` branch (`casesService.ts:97-102`). Importing that module into the sidebar would have pulled a *second* mock fixture into the exact bundle this work package exists to clean — trading one ghost for another and breaking the «build الإنتاج لا يحمل mock قابلاً للوصول» half of decision ٤. Cases can be added later behind a service that does not carry a fixture; that is not a WP-7 change.

---

## 3. What changed

### 3.1 New — `src/lib/services/globalSearchContent.ts` (pure, no React / fetch / Supabase)

| line | export | what it decides |
|---|---|---|
| `:117` | `resolveDocumentsHref(tools)` | the documents page **from this account's own sidebar**, `null` for the four sidebars that have none (`government`, `ngo`, `provider`, `admin`). No `userType → path` table is written here, and no route is guessed. |
| `:127` | `mapDocumentsToContent(rows, href)` | drops a row with no `file_name` (never «مستند بدون اسم»), drops the bin (`deleted_at`), and returns nothing at all when `href` is `null` so no row can link nowhere. |
| `:153` | `mapServiceOrdersToContent(rows)` | title + Arabic status from `ORDER_STATUS_AR`; an unknown status degrades to the bare «طلب» rather than printing a raw token; `href` is `/ai/orders/${encodeURIComponent(id)}`. |
| `:189` | `matchPersonalContent(items, query, limit)` | case-insensitive substring on the **label only** (the text `<Highlight>` marks up), capped at `PERSONAL_CONTENT_VISIBLE_LIMIT = 6` (`:99`). |
| `:212` | `summarisePersonalReads(reads)` | `unreadable` only when **every attempted** read failed; `partial` when some did. This is `listRead.ts`'s rule applied across two independent reads. |

`/ai/orders/[id]/page.tsx` is a real, auth-scoped route that loads the row through `getServiceOrder()` and renders its own «الطلب غير موجود» on a 404 — so a stale search hit degrades into an honest page instead of drawing a fixture. There is no per-document page anywhere under `src/app` (only `api/v1/documents/[id]`), which is why document rows link to the list.

### 3.2 New — `src/lib/services/globalSearchContent.test.ts` (22 tests)

Pins the mappings and, explicitly, the substitutions that would put invented content back: a nameless row being named, a row linked to a page this account does not have, an id interpolated raw into an href, and a failed read being reported as «لا توجد نتائج».

### 3.3 Changed — `src/components/dashboard/GlobalSearch.tsx`

| line | change |
|---|---|
| `:56-65` | the mock array is **deleted**; a comment records verbatim what stood there, why, and where the replacement lives. `grep -rn "MOCK_CONTENT" src` → 0 hits. |
| `:34-40` | new imports: `getDocuments`, `listMyServiceOrders`, and the five pure helpers. |
| `:100-104` | `ContentTypeIcon` now types on `PersonalContentKind` (`doc` \| `request`); the dead `case` / `consult` branches are gone. |
| `:120-131` | three-state read: `contentState: "loading" \| "ready" \| "unreadable"`, `personalItems`, `partialRead`, plus `loadTokenRef` so a slow first open cannot overwrite a newer one. Initial state is `"loading"`, never `"ready"` — «لا توجد نتائج» on first paint is a false statement. |
| `:142` | `documentsHref = resolveDocumentsHref(allTools)`. |
| `:162-192` | `loadPersonalContent()` — `Promise.allSettled` over the two reads, each outcome turned into a `PersonalReadResult`, the verdict left to `summarisePersonalReads`. The documents read is **skipped, not faked**, when there is no documents page, so it cannot be counted as a source that failed. |
| `:201` | `matchedContent = matchPersonalContent(personalItems, query)` — feeds the existing `totalResults` / ↑↓ / Enter keyboard navigation unchanged. |
| `:218-223` | the read runs when the palette **opens**, not on mount: the component sits in every dashboard sidebar, and two fetches per page load for a panel nobody opened is not worth it. |
| `:266-282` | `partialReadNote` — «تعذّرت قراءة جزء من محتواك» + «إعادة المحاولة», shown beside real rows rather than instead of them. |
| `:412-418` | loading → «جارٍ قراءة محتواك…». |
| `:419-434` | unreadable → «تعذّرت القراءة» + «إعادة المحاولة» (calls `loadPersonalContent` again). |
| `:435-467` | results → the account's own rows, keyed on `item.key` (every document row shares the one vault href, so the href cannot be the key). |
| `:468-481` | empty → «لا توجد نتائج في محتواك» when a query is typed, «ابحث في مستنداتك وطلباتك» when it is not. The «متاح بعد ربط قاعدة البيانات» line is gone. |

Navigation and the static «الأدوات» section are untouched.

### 3.4 Why account B cannot appear in account A's search

Nothing on the client filters by account, which is the point — a client-side filter is a thing a future change can forget:

- `GET /api/v1/documents` (`src/app/api/v1/documents/route.ts:45-56`) selects `attachments` with `.eq("owner_user_id", user.id)` after `auth.getUser()`, on top of RLS, and 500s on a query error instead of serving an empty 200.
- `GET /api/v1/service-requests` (`src/app/api/v1/service-requests/route.ts:150-170`) is RLS-scoped and additionally narrowed to `requester_user_id.eq(<uid>)` / `assigned_to.eq(<uid>)`; `listMyServiceOrders` rejects the route's `degraded: true` 200 rather than reading it as an empty list.
- No `service_role` client is reachable from either path.

---

## 4. Proof still owed (the closing standard — a green unit test closes nothing)

Per ground rule 2 («لا يُغلق شيء هنا إلا بإثبات متصفح + API/قاعدة بيانات + إعادة اختبار»), WP-7 is **not closed** by this commit. Still owed, and explicitly the two-account test the plan's closing map asks for (`uat-matrix.csv` row `UAT-GHOST-001` → "two-account search test"):

1. **Two-account browser proof (blocking).** With two fresh synthetic UAT actors A and B on staging (`scripts/uat/seed-actors.ps1`; never the 2026-09-15 `actors.json`, never a real account, never a service-role magic link):
   - as A: upload a document with a distinctive name and submit one service request; open ⌘K and type part of each — both appear, and the document row opens A's own documents page while the request row opens `/ai/orders/<A's id>`;
   - as B, in a **private window**: open ⌘K and type A's document name and A's request title — expect «لا توجد نتائج في محتواك» and **zero** rows; capture the DevTools Network panel showing `/api/v1/documents` and `/api/v1/service-requests` returning only B's rows;
   - as B: paste A's `/ai/orders/<A's id>` directly — expect «الطلب غير موجود», not a rendered order.
2. **Honest-failure proof.** Block `/api/v1/service-requests` in DevTools and open ⌘K: expect «تعذّرت قراءة جزء من محتواك» beside the documents that did load, **not** «لا توجد نتائج». Block both: expect «تعذّرت القراءة» + a working «إعادة المحاولة».
3. **Empty-account proof.** A brand-new account with no documents and no requests: «لا توجد نتائج في محتواك» — and the same account after one upload: the file appears. (Guards against the failure-as-emptiness substitution in the other direction.)
4. **Production-bundle proof.** `npm run build`, then `grep -r "المتحدة ضد محمد العمري" .next` and `grep -r "MOCK_CONTENT" .next` → both empty. (`npm run build` was **not** run here — see §6.)
5. **Sidebars without a documents page.** Sign in as `government` / `ngo` / `provider` / `admin` and confirm the section shows requests only, with no document row and no dead link.

Everything else in `surface-inventory.json` stays as-is pending the owner's route-by-route decision (plan §2 WP-7).

---

## 5. Gate results at commit time

```
grep -rn "MOCK_CONTENT" src   → no output (exit 1)
npm run type-check            → tsc --noEmit, no diagnostics
npm run test:unit             → 1293/1293 pass, 0 fail   (baseline 1271 + 22 new)
```

Line endings preserved — `GlobalSearch.tsx` is a mixed-ending file and stayed exactly as mixed:

```
HEAD 75d9226 : 360 CR-lines / 369 lines  ⇒ 9 LF-only
after        : 500 CR-lines / 509 lines  ⇒ 9 LF-only   (every added line CRLF, the file's dominant style)
```

New files (`globalSearchContent.ts`, `.test.ts`) are LF, matching every other file in `src/lib/services/`.

**Blast radius** (GitNexus MCP unavailable in this session — grepped by hand, per plan ground rule 5):

- `GlobalSearch` is exported from `GlobalSearch.tsx` only and imported at exactly one place — `src/components/dashboard/SharedSidebar.tsx:27`, rendered at `:224`.
- `SharedSidebar` is imported by the eight dashboard layouts: `src/app/dashboard/{client,lawyer,firm,business,micro,provider,government,ngo}/layout.tsx`. (`src/app/settings/layout.tsx:8`, `src/app/ai/loading.tsx:36`, `src/app/dashboard/business/page.tsx:428`, `src/components/dashboard/SidebarComponents.tsx:216` and `src/components/HijriDateWidget.tsx:21,342` mention it in comments only — no import, no render.)
- `src/lib/services/globalSearchContent.ts` has exactly two importers: `GlobalSearch.tsx:36-40` and its own test.
- Nothing else in `src/` referenced `MOCK_CONTENT`.

---

## 6. Open risks and what was not done

1. **Two agents were assigned this same worktree.** A duplicate WP-7 agent was writing `/home/claude/wt/wp7` concurrently (confirmed in `ps`: a second Claude bash session running `cd /home/claude/wt/wp7 && … npm run type-check`). We overwrote each other's files three times, swapping between two helper APIs (`buildPersonalContent`/`documentsHrefFromTools`/`item.id` and `mapDocumentsToContent`/`resolveDocumentsHref`/`item.key`). It was resolved by freezing the helper at the second API, aligning the component to it, and messaging both the orchestrator and every sibling agent to stop writing here. **Re-read this commit's diff before trusting it**, and confirm no later commit on `wp7` re-introduces the other API. The prose in `GlobalSearch.tsx:56-65` and the structure of `loadPersonalContent` came from the other agent's draft and were kept deliberately.
2. **`npm run build` was not run** (the plan's baseline gate asks for it before a PR). The `.next` mock-grep in §4 item 4 therefore still has to be performed.
3. **No browser or staging evidence at all** — see §4. This commit is code plus unit tests only.
4. **Cases are still missing from the section.** A client who has a case but no document and no service request sees «لا توجد نتائج في محتواك», which is true of the two sources read but may read as broader than it is. Adding cases needs a case reader that does not import `casesStore`'s fixture.
5. **Two GETs per palette open.** Deliberate (§3.3, `:218-223`) so a just-uploaded file is findable, but it is a per-open cost on every dashboard.
6. **Empty query lists the account's most recent rows** (up to 6) rather than nothing. That is a small behaviour change from the mock version, which showed nothing until a query was typed; if the owner would rather the palette reveal nothing before a search, change `matchPersonalContent` (`globalSearchContent.ts:189`) to return `[]` for an empty needle — the test at `globalSearchContent.test.ts` pins the current choice and would need flipping with it.
