# Fix-and-build plan — 2026-10-16

**Inputs:**
- `docs/audits/2026-10-16-owner-package-10-06-gap-analysis.md`;
- the owner's answers of 2026-10-06;
- the agents' reports for this batch.

**Companion files:**
- `docs/plans/2026-10-16-sql-run-order-and-deploy.md`: what to run, in which order;
- `أسئلة_المالك_٢٠٢٦-١٠-١٦.md`: only the decisions still open.

---

## 1. Fixed in this batch (`fix/2026-10-16-batch`)

Five parallel branches and one wording pass were merged into this branch. Verification:
- 2,280/2,280 unit tests pass on Node 22;
- `tsc` and `eslint` show 0 errors;
- every migration was run twice (idempotent) in Docker with its own test file, against a reproduction of the live policies.

### Security / database (eight migrations; run order in the companion file)

| Item | Owner decision | Migration / code |
|---|---|---|
| Precedent text, ruling, `fts` and paragraphs readable by any guest through REST (one row is 253k characters) | Q171 | 20261016_01 + service-role reads in the precedent, search, autocomplete and init routes; masking unchanged |
| Users could edit their own email, `verified_at`, `nafath_verified` and `metadata`; entity owners could hard-delete members | Q29, Q30 | 20261016_02 |
| Chat: every read raised 42P17; join any room as owner; self-promotion; move messages between rooms; anon held ALL | bug | 20261016_03 + room creation through `create_chat_room` (request parties only); the route now reads the `type`/`related_id` the client sends |
| Urgent appeal 15 → 10 days; owner-verified appeal rules; review (التدقيق) rule | Q18 | 20261016_04 (data only; the 60-day Supreme Administrative rule is held, see questions) |
| Lawyer rate hidden unless the lawyer opts in; price sort uses shown rates only | Q168 | 20261016_05 + API masking + two toggles |
| Community: lawyers-only unreadable by lawyers; answers leaked; fake verified badge; self-set counters; nobody else's votes or views counted | bug | 20261016_06 + view/vote code |
| Draft cart: every save failed (42703) and emptied the cart | bug | safe replace in `api/v1/drafts/cart` |
| Expired subscriptions kept unlocking paid features | bug | `effectiveTier()` in `getUserTier` |
| Clean-wipe SQL would fail on the private precedent table's foreign key | bug | wipe file + Docker T7 |
| The self-host restore re-granted what earlier migrations had revoked: the lawyer/role-profile column lock (a lawyer could self-verify) and EXECUTE on seven service-request functions | bug | re-run 20260922_03 (Step 0) + 20261016_07 |
| …and the write lock on `subscriptions` / `credit_transactions` (20260921_02). `_verify.sql` stopped on live on anon's SELECT on `profiles`; that grant stays (see N21) | bug | 20261016_08 + `_verify.sql` now gates what matters: no anon write on `profiles`, no profiles policy reaching anon. It also expects 4 policies per members table once 20261016_02 has dropped the DELETE one (it expected 5 and would have failed next) |

### Pricing and honesty (fix/a1)

- Removed the popularity badges and the false discounts and struck-through prices.
- Removed the Escrow wording, plus wording that described Escrow without the word.
- Fixed the CTA that led to a 404. `?plan=` now survives signup, and `requested_ref` carries the plan id.
- «طلب عام» is open to clients «يبدأ من ٥٠٠ ر.س» (Q42).
- The refund page has the 14-day clause (Q28).
- Arabic plan names; the coming-soon AI tool is no longer priced.
- No real price was changed (Q165 is still open).

### Community and blog (fix/a2)

- Fixed the PGRST201 feed failure and the tab/category mapping.
- «أكثر المجيبين» now comes from real data (verified, listed lawyers).
- Mock posts and mock replies are gone, as are the false success messages.
- Posts and answers that contain contact numbers are refused.
- Header spacing fixed.
- Blog: Arabic category labels, no invented authors, owner callout colours and «السند النظامي» cards (Q132–134), internal booking link.

### Dashboards (fix/a3)

- The government dashboard no longer crashes for clerk/admin.
- Hearing times show without seconds.
- The duplicate Hijri widget is gone, and the sidebar has a logout.
- Navbar: the desktop layout starts at 1024px, and each layout has one bell.
- `/erp`, the admin health tiles and `admin/business` are honest.
- All 52 of the owner's court-email corrections are applied (Q4).
- Admin gets full permissions on every tier.

### Library reader (fix/a4)

- Precedent text: no raw `**`; facts, reasons and ruling are in paragraphs.
- No fake 100% progress on fiqh results; empty «الإصدارات السابقة» cards are hidden.
- Court-fee caps (Q167): cassation 7,000, reconsideration 10,000; the old «٢٠٠ ألف» line is replaced.
- Search groups article hits under their law, client-side, and keeps the masking.
- Fiqh books are found by author.

### Wording (Q131, Q128, Q27, Q33, Q2, Q7)

- «ر.س» on prices.
- «نظامي» / «Nezamy» / «ذكاء نظامي — Nezamy AI».
- The LegalTech identity replaces «شركة نظامي للمحاماة».
- Only the X icon stays (the LinkedIn link answers 404).
- No PDPL certification claims; PDPL rights added to the privacy policy; unproven claims removed from /security (2FA, 6-hour backups, 24/7 monitoring, bug bounty).
- **Not done:** Q7, the reviewer line on "the nine cards" — no file lists them (owner question ١٩٧).

See the owner report §١‏.٢٦ for what the pass changed and what it left.

---

## 2. Next batch: decided or plain bugs, small to medium (no owner input needed)

| # | Item | Where | Size |
|---|---|---|---|
| N1 | **Q166 redirects (301)** for slugs changed by the 10-15 reload. Mechanism: a `library_redirects` map (old slug → new section/slug) consulted on a 404 in `/laws/[slug]` and `/decrees/[id]` with `permanentRedirect()`; a script builds candidates by matching titles. **Blocked on data:** we kept no pre-wipe slug list (the 10-15 diff report has samples only). Use the Search Console export of indexed URLs (ask the user/owner) or the old sitemap from a CDN cache | library | M |
| N2 | **Lawyer rows readable by REST.** The live policy "public read verified lawyers" gives anon/authenticated every column: `license_number`, `hourly_rate`, `credit_balance`, `metadata`. Move the lawyer's own-row reads (`/api/v1/profile` GET, the settings screens) to the server, then column-lock SELECT for the API roles | security | M |
| N3 | **Library-only subscription grants tier `pro`**, which unlocks every AI tool. Separate the library entitlement from tool tiers (`entitlements.ts`, admin approve default) | access | M |
| N4 | Fiqh search rows are mapped `free: true` and ignore the server's `locked` flag (A4) | library | S |
| N5 | Paywall sends `lib-quarterly`, the subscribe page expects `lib-q1` and ignores `?plan=`; Google signup drops `?plan=`; login ignores `?next=` (use `safeLocalPath`) | checkout | S |
| N6 | `stripOffPlatformContact` leaves the last character of a match and rewrites all Arabic digits (used by reviews) | `contactSanitizer.ts` | S |
| N7 | Honesty, still on main: «خلال ١٥ دقيقة», «معتمدون من وزارة العدل» (services/individuals); the government dashboard's hardcoded KPIs and actions; the admin overview's mock MRR, users table, alerts, AI usage and dead export button; the firm wallet is all mock; «+٥٬٠٠٠ نظام» | various | S–M |
| N8 | Admin console sidebar has no logout | `AdminSidebar` | S |
| N9 | `ai/fee-calculator/page.tsx:97` still describes two caps | calculators | S |
| N10 | Re-running `scripts/parsers/parse-circuits-directory.mjs` would undo the owner's email corrections — make it read the corrections file or refuse | data | S |
| N11 | The dashboard summary and the profile GET show an expired "active" subscription as current | display | S |
| N12 | Community RSS button and newsletter form do nothing — remove or build | community | S |
| N13 | `rows-preflight.mjs` (10-09 package), `metadata_card` / summary (Identity Card V2) for the library loader | library | M |
| N14 | Review and port the rest of the owner's `00_ALL.patch` (about 3,900 lines) | library | M |
| N15 | `useUser.ts` admin permissions have no unit test (it cannot load under `node --test`) — extract the table | tests | S |
| N16 | **Requests assigned by the client.** `service_requests` INSERT lets a client set `assigned_to`, and the UPDATE policy lets the requester change it. Chat follows the request, so a client can open a room with any lawyer they "assign". Decide the booking flow (Q١٨٧/١٨٨), then restrict `assigned_to` to the claim RPC / admin | security | M |
| N17 | Search: the laws count badge counts hits while cards are grouped per law («(37)» over 5 cards); «تحميل المزيد» may only raise «+N» (A4 review) | library | S |
| N18 | Precedent full-text search now runs as the service role (like articles), so a guest search has no `statement_timeout`; AbortSignal drops only the HTTP request. Add a timeout-bounded RPC for both | performance | M |
| N19 | Community: in demo mode the seed cards open «هذا السؤال غير موجود»; `admin/business` local overrides hide later server flag changes (minor reviews) | community / admin | S |
| N20 | **Grants from the self-host import.** The restore recreated the schema under Supabase's default privileges and replayed GRANTs only, never REVOKEs. What was checked against the 2026-10-10 dump: (a) every public table carries `GRANT ALL` to anon/authenticated, and RLS is on all 95, so rows stay gated; (b) tables with column-level grants — only the seven role-profile tables, whose lock re-running 20260922_03 restores (Step 0); profiles/chat/community column limits come from 20261016_02/03/06; (c) functions — 24 SECURITY DEFINER functions are executable by anon/authenticated, all policy helpers, triggers or owner-checked actions; the seven whose migrations revoked EXECUTE (20260908, 20260917) are re-locked by 20261016_07. **Not checked:** schemas other than `public` and `library`, sequences, and storage buckets. Rule: any future lock REVOKEs the table/function privilege itself and verifies the effective privilege | security | done / rule |
| N21 | **Admin policies read `profiles` inline and apply to PUBLIC.** About fifteen live policies (`"admins read all lawyer profiles"`, `articles_admin_read_all`, `"Admins can modify platform settings"`, `blog_sections_admin_write`, `contact_admin_read`, `tickets_admin_all`, …) are `USING (EXISTS (SELECT 1 FROM public.profiles …))` with no `TO` clause. Postgres checks the caller's SELECT on every table a policy reads, so anon must keep SELECT on `profiles` or every guest read of those tables fails with 42501 (Docker: `profiles_anon_policy_subquery.test.sql`). Re-running 20260921_01 on live would break guest pages. Fix: recreate them `TO authenticated USING (public.is_admin())`, then revoke anon SELECT on `profiles` (finishing 20260921_01) and drop the exemption in `_verify.sql` | security | M |
| N22 | **Fiqh search fails on very common words.** «عقد» → the fiqh section is `degraded` (503 on its own): PostgREST's `count=estimated` on `feqh_blocks` hits the 57014 statement timeout (~4 s as anon), while the same page without the count answers in ~0.5 s. Same query shape before this batch. Keep the rows when the count fails (or count cheaper); check laws/precedents/orders for the same | library / performance | S |

**Status of N21 / N2 / N3 (2026-10-16, branch `claude/amazing-shirley-69859e`):**
- N21 is built as `20261016_09_admin_policies_is_admin.sql`; run it any time.
- N2 is built as `20261016_10_lawyer_profiles_select_column_lock.sql` plus the `/api/v1/profile` change; deploy the code first, then run the migration.
- N3 is designed but not built: it waits on owner questions ١٩٩–٢٠٥.
- Run order, Docker proofs and the N3 design: `docs/plans/2026-10-16-security-batch-n2-n21-n3-run-order.md`.

## 3. Decided by the owner, to build (medium)

| Owner # | Decision | Size |
|---|---|---|
| ٥ | Company dashboard: five core sections live (contracts, cases, appointments, delegations, team); the rest «قيد التطوير» | M |
| ١٥ / ١٩ | Client (individual / company) sees stage, next hearing date and final ruling; internal deliberation notes hidden | M |
| ٢٠ | Firm reviews shown publicly only with the firm manager's opt-in | S |
| ٣٦ | Company data edited by the owner account or a registered delegate only (check against the WP-6 owner-only rule already built) | S |
| ٤٠ | Simulator memo: upload Word/PDF or paste text | M |
| ٤٣ | Team role matrix: Admin, Partner, Associate, Assistant | M |
| ٥١ / ٥٢ / ١٠١ | Repealed texts searchable with a red «⛔ ملغى وغير سارٍ» badge, no strike-through; historic text behind the wall; «ونصه قبل الإلغاء:» | S–M |
| ٥٥ | 920 numbers accepted for companies and firms, refused for individuals | S |
| ٥٦ / ٥٧ | Nationality for lawyers and individuals; city enough for an individual's address; optional national address for invoices | S |
| ١٠٢ | The 112 page-numbered documents as «دليل إرشادي / تنظيم إداري», keeping their page anchors | S |
| ١١٥ | Demo mode fully separated from production | M |
| ١٣ | Disabled buttons: 50% opacity, `cursor-not-allowed`, a tooltip with the reason | S |
| ١٢٧ | One shared Hijri/Gregorian (Umm al-Qura) date picker | M |
| ١٦٩ | Notepad: private by default; share with the case team or the whole firm | M |
| ١٧٠ | The three 1430H judicial-inspection regulation copies: keep only the owner's verified one | data |

## 4. Large features (in the order the owner prioritises)

1. **Live payments (Moyasar):** after Q24/Q35 — licence verification before payment. Server-side amount, signed webhooks; never the package's patches.
2. **ZATCA simplified e-invoicing and QR receipts** (Q41).
3. **AI through a secure server layer with direct Claude models** (Q44): keys in env only, server-side prompts, no `user_metadata` trust.
4. **Lawyer vault and contract categories.**
5. **Client entity types** (6), 22-body court list, 14 consultation types, case-facts editor, hearing edit/delete.
6. **RBAC** beyond Q43 (trainee, secretary, accountant); Article-18 consultant limits; firm access requests; pro-rata upgrades.
7. **Integrations:** staff CRM, WhatsApp gateway, government-platforms hub, NDC codes `/d/[code]`.
8. **UI:** Nezamy Motion, sticky board, speed-dial, PWA, public-profile banner and stats.

## 5. Package code to reject (from the gap analysis §6)

- Both Moyasar patches: browser-side amount, raw card/CVC, fake "paid", unsigned webhooks.
- CRM / Claude-n8n / global-AI code: embedded API key, trusts `user_metadata.role`, canned answers.
- Unauthenticated service-role routes: `ingest_najiz_route`, the NDC resolver. The uncommitted Najiz sync route in the main folder trusts any Bearer string — do not commit it as is.
- `20261012_server_performance_and_anti_scraping.sql` (re-grants the whole library schema to anon); SECURITY DEFINER SQL open to any caller; `20261006` (rewrites a law).
- The package's chat recursion fix (keeps the join-any-room branch). 20261016_03 replaces it.
- Staging's `proxy.ts` (drops Bearer auth); the runbook's whole-file drop-ins.

## 6. Waiting on the owner

See `أسئلة_المالك_٢٠٢٦-١٠-١٦.md`. The main blockers:
- Q165 prices (consultant, lawyer, firm, family plan, points);
- whether fiqh and decree text go behind the wall;
- the Supreme Administrative Court period;
- the court-fee regulation's flat fees;
- refund-page wording;
- real social URLs;
- the old-URL list for redirects.
