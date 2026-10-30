# Owner package 2026-10-30 — nav shell (admin lawyer mode)

Branch `fix/owner-30oct-nav-shell`, cut from `main` at `235e1bef`. Not merged, pushed or deployed.

Source: the owner's handoff `Nezamy-Developer-Handoff-2026-10-30`, which was read only:
- `05-traceability/developer-backlog.csv`
- `08-current-code-review/backlog-review.csv` and `new-test-requirements-review.csv`
- `07-references/REF0021.md`
- `06-evidence/nezamy-live-test/01-admin-draft.txt`, `03-admin-contracts.txt`, `08-calculator.txt`, `06-library-assistant.txt`, `admin-route-*.txt`

His file:line references point at `0d5273ea`. Every claim was re-checked against `235e1bef` before any change.

## Re-verification (what was actually wrong at `235e1bef`)

| Claim (REF0021 §1) | At `235e1bef` |
|---|---|
| `src/app/ai/layout.tsx` has no `admin` branch and falls back to Business | **True.** The session block covered 8 types and not `admin`. An admin fell through to the `nzamy_last_dashboard` stamp, which is `lawyer` after visiting the lawyer dashboard, or else to `BusinessDashboardLayout`. |
| `SharedSidebar` takes the path type, else the session type, so `/ai/*` draws `AdminSidebar` | **True, in substance.** It is `ADMIN_SIDEBAR`, the SharedSidebar admin config, not the `AdminSidebar` component. `inferUserTypeFromPath("/ai/draft")` is `null`, so the real role `admin` won. This is the menu in `01-admin-draft.txt`, `03-admin-contracts.txt` and `08-calculator.txt`. |
| The "view as lawyer" state is not stored | **True.** The only switch was a `<Link href="/dashboard/lawyer">` on `/dashboard/admin/page.tsx`. Nothing remembered it. |
| `/laws` shows admin links | **True.** The public `Navbar` used `getNavByUserType(userType)` with the real role (`06-library-assistant.txt`). |
| Not in his list | `/notifications` for an admin opened the **Business** shell. The console stamps `admin`, and no branch of that layout matched it. The console's own «عرض جميع الإشعارات» link led there. |
| `src/proxy.ts`, `src/lib/auth/routeAccess.ts` | **No change needed.** The proxy already lets `admin` past every dashboard rule (`isAdmin` short-circuit), and `/dashboard/admin` stays `["admin"]`. Neither file was touched. |

## Ledger

Commit `e6f0d910` holds all the code below. This ledger and the Arabic note are in the docs commit that follows it.

| Id | Verdict | Change | Files | Tests | What to check live |
|---|---|---|---|---|---|
| **LIVE-F01** (P0) | **fixed now** | (1) **One resolver.** `src/lib/nav/shellContext.ts` decides the menu for SharedSidebar, GlobalSearch, the `/ai` layout, the `/notifications` layout and the public Navbar. Every admin decision goes through `resolveAdminView()`. (2) **View context kept apart from the real role.** sessionStorage `nzamy_admin_view_as` (`admin` \| `lawyer`, this tab only) is consulted only when the real role is `admin`. Entering `/dashboard/admin` writes `admin`; entering `/dashboard/lawyer` or using the switch writes `lawyer`. (3) **On every `/ai/*` tool an admin gets the lawyer shell and the lawyer sidebar.** Visiting `/ai/*` does not write the view, so an admin in admin mode is not silently flipped. (4) The `Navbar` follows the view, so `/laws` keeps the lawyer links in lawyer mode. (5) **Access is unchanged.** Guards, the proxy and the API routes read the real role. The lawyer layout already admitted `admin`. | `src/lib/nav/shellContext.ts` (new), `src/hooks/useAdminView.ts` (new), `src/app/ai/layout.tsx`, `src/app/notifications/layout.tsx`, `src/components/dashboard/SharedSidebar.tsx`, `src/components/dashboard/GlobalSearch.tsx`, `src/components/dashboard/SidebarComponents.tsx`, `src/components/Navbar.tsx`, `src/components/admin/AdminSidebar.tsx` | `src/lib/nav/shellContext.test.ts`, 15 tests: the owner's journey; a regression table (>1000 sidebar rows, >5000 `/ai` rows) showing that every non-admin session gets the pre-fix answer; the guard and proxy sources unchanged; stored junk ignored. | Sign in as admin, then go `/dashboard/admin` → «وضع المحامي» → `/ai/draft` → `/ai/contracts` → `/ai/fee-calculator` → `/laws/<any law>` → `/notifications` → back to `/dashboard/lawyer`. Every step should show the lawyer menu, with a logo link to `/dashboard/lawyer` and no `/dashboard/admin` link. Then press «لوحة الإدارة» and check that `/notifications` and `/laws` show the admin menus. Also sign in as a lawyer, a firm and a client and check that nothing changed. |
| **NOTE-22-C01** | **fixed now** | The `/ai` layout now has an explicit admin branch: `resolveAiShell()` → `lawyer`, so `LawyerDashboardLayout` wraps the tool. The shared menu (SharedSidebar plus GlobalSearch's tool list) resolves to `lawyer` on every `/ai/*` path for an admin. | same as LIVE-F01 | the `/ai/*` row in `shellContext.test.ts` (every `/ai` path × every stored value × every stamp → `lawyer`) | `/ai/draft`, `/ai/contracts` and `/ai/fee-calculator` as admin, in a fresh tab. The lawyer menu should appear even with nothing stored. |
| **NOTE-22-C02** | **fixed now** | `AdminViewSwitch` is a fixed «عرض كـ: وضع المحامي \| لوحة الإدارة» bar. It is pinned outside the scrolling nav in SharedSidebar and under the admin badge in AdminSidebar. It renders only when the **real** role is `admin`, never from the view being shown, and it says «يغيّر القائمة فقط — لا يغيّر الصلاحيات». In lawyer mode the sidebar header reads «مدير النظام · وضع المحامي», not a bare «محامي». | `src/components/dashboard/AdminViewSwitch.tsx` (new), `SharedSidebar.tsx`, `AdminSidebar.tsx` | wiring tests: gate on `useUser().userType !== "admin"`; present in both sidebars; `adminViewSuffix` cases | The bar is visible to an admin on desktop and in the mobile drawer, and invisible to a lawyer. Switching moves between `/dashboard/lawyer` and `/dashboard/admin`. The admin console's own pages and actions still work after a round trip. |
| **UX08** | **fixed now — lawyer half. Admin half: partly, see the note.** | **Lawyer menu.** `withComingSoonLast()` moves every «قريباً» row (8 rows, 9 for Saudi accounts) out of its group, in order, into one last group «قريباً», closed by default. The same rows and badges remain; only their position changes. A moved row's divider passes to the next row. Lawyer only; the firm menu is untouched. **Admin menu.** Admins used to see three menu structures: `AdminSidebar` (`adminNavByRole.ts`), SharedSidebar's `ADMIN_SIDEBAR`, and the Navbar's `ADMIN_NAV`. After this fix, no route draws SharedSidebar with the type `admin`: `/ai/*` gives lawyer, `/notifications` uses the console's own `AdminLayout`, and `/dashboard/admin/*` was already `AdminSidebar`. So `ADMIN_SIDEBAR` can no longer be reached in practice. The top-bar `ADMIN_NAV`, including its `#settings` link, is still a separate structure and was **not** unified here. | `src/constants/navigation.comingSoon.ts` (new), `src/constants/navigation.sidebars.ts` | `src/constants/navigation.comingSoon.test.ts`, 5 tests: same rows before and after; every «قريباً» row is in the last closed group for advocate, consultant and Saudi accounts; daily-work order kept; divider handover; firm untouched | The lawyer sidebar ends with a closed «قريباً» section, and the AI and «أدوات إضافية» groups carry no «قريباً» rows. As admin, the console menu should look the same on `/dashboard/admin/*` and `/notifications`. |
| **UX17** | **fixed now — the Ctrl+K half only** | The sidebar search hint printed «⌘ K» on every OS. It now prints «Ctrl K» off Apple platforms and «⌘ K» on Mac and iOS. The server and the first paint print Ctrl, so hydration matches. The handler already accepted both keys. **Not done:** the other half of UX17 (the label for an unassigned task and the due date on its card) lives in `src/app/dashboard/lawyer/tasks/_components/TaskCard.tsx`, a lawyer page body that is off limits for this branch. | `src/lib/nav/platformShortcut.ts` (new), `src/components/dashboard/GlobalSearch.tsx` | `src/lib/nav/platformShortcut.test.ts`, 3 tests | Windows Chrome shows «Ctrl K» beside «ابحث عن أداة...», and a Mac shows «⌘ K». Ctrl+K opens the search on both. |
| **UX15** | **deferred — outside nav scope** | Not changed. The file names and «Backend-ready/Mock» labels are in the page body `src/app/dashboard/admin/platform/page.tsx`, not in a nav or sidebar file, and the brief limits optional items to the navigation. | — | — | Still open. It needs a page-body pass on the platform control centre: a plain-language summary plus a collapsible developer section, and separate «حسابي», «إعدادات المنصة» and «سجل النظام». |

## Behaviour changes, all admin-only

- `/ai/corp`, `/ai/gov`, `/ai/ngo` and `/ai/micro` now open in the **lawyer** shell for an admin. Before, an admin got the stamp or Business shell with the admin sidebar inside it.
- `/notifications` for an admin now opens in the console shell (`AdminLayout`) or in the lawyer shell in lawyer mode. Before, it opened the Business shell.
- The view is **per tab** (sessionStorage), as the owner proposed in REF0021 §1-ج. A **new tab** opened directly on `/laws` or `/notifications` starts in admin view until the admin enters `/dashboard/lawyer` or uses the switch in that tab. This is expected and not a regression. `/ai/*` is always lawyer, whatever the tab.
- The view is not cleared on sign-out; that code is in `useUser`, an auth file that is off limits here. This is harmless: the value is ignored for every non-admin session (tested), and the tab is per-session.

## Verification

- New tests: 23, all passing (`shellContext` 15, `platformShortcut` 3, `navigation.comingSoon` 5).
  - Run with `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/nav/shellContext.test.ts src/lib/nav/platformShortcut.test.ts src/constants/navigation.comingSoon.test.ts`.
- Full suite on `src/**/*.test.ts`:
  - **Before:** 4166 tests, 4159 pass, 7 fail.
  - **After:** 4189 tests, 4181 pass, 8 fail.
  - The 8 failures are the same 7 pre-existing ones (library volume series, lawyer dashboard consultant cards, `aiFiles` because `pdf-lib` is missing in node_modules, `libraryAccess` end read, `grantPurchase`, two document-share snapshot checks) plus `runCore.test.ts` «the start call carries the price…», a timing flake (49999 vs 50000 ms) that passed 3 out of 3 when rerun alone. None touch a file in this branch.
- Existing nav tests stay green: `navigation.fullOnly`, `navigation.consultant`, `quickAddWiring`, `adminNavByRole`, `adminSidebarLogout`, `darkModeGuard`, `navComingSoon`, `officeGraph.wiring`, `lawyerQuickTools`.
- `tsc --noEmit`: the only errors are `TS2307 pdf-lib` in `src/lib/ai/aiFiles*.ts`, a dependency missing from the shared node_modules. They are not from this change.
- `eslint` on the changed files: 0 errors. The 14 warnings are all on pre-existing lines.
- GitNexus: the index is 675 commits behind `HEAD`. `impact` could not resolve `SharedSidebar`, `getSidebarByUserType`, `inferUserTypeFromPath`, `AILayout` or `Navbar` (risk UNKNOWN), and `detect_changes` saw the 16 files but mapped 0 symbols. Callers were counted by text search instead:
  - `getSidebarByUserType`: 7 files.
  - `Navbar`: imported by 60 files. **HIGH fan-out.** For any non-admin session its output is identical, which the regression table shows.
  - `AdminSidebar`: 7 files.
  - The notifications layout: 1 file.
  - The index was not refreshed, because that would write the shared `.gitnexus` of the main checkout.
- Line endings are kept as they were (CRLF, and the BOM on `AdminSidebar.tsx`). Endings-only churn on mixed-ending files was reverted, so the diff holds only real changes.

## Files outside navigation and layouts

None of the off-limits areas were touched: lawyer page bodies, login and auth, `src/lib/ai/*` and the AI route handlers, library pages, pricing. Shared files touched:
- `src/hooks/useAdminView.ts`: new UI hook; it does not touch `useUser`.
- `src/lib/nav/*`: new pure modules.
- `src/constants/navigation.sidebars.ts`: a 5-line addition for UX08.
