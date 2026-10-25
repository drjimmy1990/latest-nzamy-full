# Upcoming work — after the owner's 22-Oct package (2026-10-25)

**Sources:**
- The owner's package `Downloads/حزمة_تسليم_المبرمج_المعتمدة_2026-10-22`, new items only, compared against the 10-18 package.
- Our deferred lists: payments B1, B2, B3 and the pre-live work.
- Three read-only reviews of the package against `main` f9d3219b.

**Owner questions:** `للمالك_دفعة_٢٥_أكتوبر/أسئلة_للمالك_حزمة_٢٢_أكتوبر.md`, numbered ٢٥٧–٢٧٧. ٢٥٥ and ٢٥٦ are still open.

**Rules for everything below:**
- Never copy the owner's staging files or patches in. Port the idea onto our code.
- Never run any seeder or library loader. A library reload is the owner's job.
- The user runs all prod SQL. Each migration gets a Docker RLS test and a `_verify` check.
- The owner report goes in the same commit as each batch.

**Sizes:** S ≈ under half a day · M ≈ 1–2 days · L ≈ 3 days or more.

---

## PART 1 — WHAT WE CAN DO NOW, WITHOUT THE OWNER'S ANSWERS

**Progress:** each finished item is marked **✅ made** with its commit, on branch `batch/2026-10-25-owner-free` in `D:/nzwt/integ`. Nothing there is merged or pushed until you give the go. The detailed plan for each phase is in `docs/plans/2026-10-25-owner-free-phases-plan.md` on that branch.

| Phase | Items | State |
|---|---|---|
| P1 | N1.1–N1.9 | ✅ all 9 made and reviewed (review fixes cd10c88b, 69170514, 2dbbc7af, 5d4cc5fc; N1.8 ecc4c5bc) |
| P2 | N4.1 | ✅ made and reviewed (aa8aeff4), merged into the batch at 9c38a311. N4.2 = your live checks |

**Batch state:** all 30 items are made. The merged batch has 3,630 unit tests passing, tsc clean, and the production build compiling. The final whole-branch review ran every migration together in Docker (all 11 RLS tests pass, every file re-runnable) and fixed a stray merge marker in `_verify.sql` (e38fd72c); 3,630 unit tests pass after N1.8. SQL run order: `SQL_batch_2026-10-25_owner_free/README.md` (files 01, 10–17, 20–22). Not merged into main or pushed; that waits for your go.
| P3 | N2.1, N2.2, N2.3, N3.1, N3.3 | ✅ all 5 made and reviewed |
| P4 | N3.2, N3.4, N3.6, N3.7 (one SQL batch) | ✅ all 4 made and reviewed |
| P5 | N2.4–N2.8 | ✅ all 5 made and reviewed; library track merged into the batch |
| P6 | N3.5, N3.8–N3.11 | ✅ all 5 made and reviewed; dashboard track merged into the batch at 29b8be2a |

Each item is either a plain fix, or built on a default that matches decisions he has already made. Where an open question touches an item, the item is built so the answer is only a setting or a small follow-up.

### Batch N1: fixes and honesty (all S, no SQL)

| ID | What | Why it's safe without him | Size |
|---|---|---|---|
| N1.1 ✅ made (65bad284) | Moyasar key check: reject a key containing `*` or of the wrong length, and show the reason on the admin gateway card | Our own bug. A starred key reads as test mode and every charge then fails | S |
| N1.2 ✅ made (11e4e350) | Law page: stop splitting the preamble on `***`. Today the identity card and the H1 can land under «اللائحة التنفيذية» (example: `precious-metals-customer-due-diligence-guide`) | Our own bug in `api/library/laws/[slug]/route.ts:276-287` | S |
| N1.3 ✅ made (26f1b788) | Public `/cases/[id]`: remove the mock escrow box («حالة الضمان») and the fake 4.8★ from 127 reviews. Hide the page, or route it to the real tracking link (N3.6) later | Owner decision ١٨٠: no escrow. No fake data | S |
| N1.4 ✅ made (55e0ec9f) | Mock legal-opinion page: remove «٩٤٪» and the "Claude 3.5 Sonnet" label | Owner decision ١٩٣: no percentages | S |
| N1.5 ✅ made (6a898ea0) | Blog: the author link stops opening an outside site; consultation links point to `/book/consultation` | Owner axis 8 says this plainly | S |
| N1.6 ✅ made (2ee8077a) | Blog table of contents: gold `#C8A762` on hover in both themes, plus active-section highlight while scrolling | Owner axis 8 | S |
| N1.7 ✅ made (fa7e4155) | Blog spacing: drop the `<br/>` added for every blank line (`ArticleView.tsx:246`) and tune the margins | Owner axis 8 | S |
| N1.8 ✅ made (ecc4c5bc): the drafter takes a transcript through a one-shot session handoff and prefills «الوقائع», and the button is ready. It is mounted only when the transcriber or «عصارة المرفقات» gets a real service (both are «قريباً», owner ١١٥) | Transcriber: add a «إرسال النص للصائغ القانوني» button to `/ai/draft`, passed through the server or the URL, not localStorage | Owner axis 9; a small addition | S |
| N1.9 ✅ made (69ed32bd) | Firm route rules: limit firm hearings and procedures-expert to litigation roles (Article 18) | Matches the existing consultant court-write guard | S |

### Batch N2: library (no reload, no new data)

| ID | What | Notes | Size |
|---|---|---|---|
| N2.1 ✅ made (c279b69e, 604025c4, 8acc781a, a8d6b6d1; reviewed) | Identity card V2 in the law reader's sidebar, plus the «موجز» as a collapsible box above the preamble | Data is already in `laws.preamble`: card in 1,982 laws, موجز in 482. Read it server-side, with an optional jsonb column filled by SQL. **Default: subscribers only** (today's preamble rule). If ٢٦٠ says public, it's a flag flip. Never invent card values: no default «ساري», no copied dates | M |
| N2.2 ✅ made (b931a575, e946c842; reviewed; SQL 20 for you) | Outer `/laws` cards: a two-line موجز with «قراءة المزيد / طي الموجز» in place | Same data and the same visibility rule as N2.1. The card list must not load the full preamble: keep the init payload small, and send only the موجز text | M |
| N2.3 ✅ made (c658146b; reviewed) | Fiqh reader: the two missing layer buttons, «الشرح فقط» and «الحاشية فقط» | `feqh_blocks` has matn/sharh/hashiyah; today there are only «الكل» and «المتن فقط» | S |
| N2.4 ✅ made (5564b19f, 25a95f1f; reviewed) | Multi-volume precedent collections: one card per series with volume buttons, plus a volume selector inside the reader | Only collections that already carry `series_id` + `part`, which today is 2 series. More need ٢٦٢. No hard-coded series lists | S–M |
| N2.5 ✅ made (1f5c195e, 9ae7dc2c; reviewed; SQL 21 for you) | Default catalogue sort: merged laws first, then latest amendment, then issue date | A server-side sort on a normalized date key (generated column or view, plus index). Dates exist on only 387 laws, in mixed formats. Catalogue only; search keeps relevance (default for ٢٧٧) | M + SQL |
| N2.6 ✅ made (e29224a6, bdf0933e, c7697e2c, 6434cf3f, 72cc1c40, 2c88ff5d; reviewed; SQL 22 for you) | Search inside the open law, collection or book, across all its volumes, using the existing operators (+ − / "…" *), with full matching texts stacked on the page plus «نسخ بالتوثيق» and «+ للمسودة» | Server-side through `parseSearchQuery` + `LIBRARY_FTS_CONFIG`, with the existing paywall rules and no raw `.or()` strings. Add the draft cart to the book reader | L |
| N2.7 ✅ made (244ab45c, 73cb201e; reviewed) | Library-rule gaps from his "6 commandments" | The seeder's `safeInt` turns «1439-1441» into 1439; `.substring()` cuts text silently; there is no hash-bound diff report. Code only; nothing runs against prod | S–M |
| N2.8 ✅ made (76753dbf; reviewed) | Parser fixes, **code only**: `parse-decrees` takes the short موجز from the `<details>` block and keeps the full summary separate; `parse-laws` description | Takes effect only when the owner re-parses and reloads. **Reject** his `parse-precedents` change, which would overwrite principle text | S |

### Batch N3: lawyer dashboard and hearings

| ID | What | Notes | Size |
|---|---|---|---|
| N3.1 ✅ made (9d37d823, d683ccbb, 7e19b1b2; reviewed) | `.ics` download per hearing with 4 alarms, next to the existing «أضف إلى Google» link | Keep the floating local time as the Google link does. No n8n | S |
| N3.2 ✅ made (3f3eb615, 94006910, 07b056fe, 833f97a9, 7fe058bb; reviewed; SQL 10+11 for you) | Hearing reminders: server-side stages for the lawyer, the assigned consultant and the office owner, in-platform | Reuse `notification_outbox` plus a `hearing_id` column. **Default times from his report:** 7 days, 3 days, 20:00 the evening before, 07:00 the same day, all editable. WhatsApp to clients without an account waits on ٢٦٥ and the WhatsApp setup. Needs the hourly cron (O3) | M + SQL |
| N3.3 ✅ made (2652a786; reviewed) | Floating «+ إضافة سريعة» (Alt+N), plus a button at the top of the sidebar: case, hearing, client, task, deadline, and the sticky note (N3.4) | The modals exist. Handle Alt+N with input focus (on a Mac, Option+N types a character) | S–M |
| N3.4 ✅ made (1a1d941f, 7bf72a8d; reviewed; SQL 12 for you) | Sticky-notes wall on the lawyer dashboard: 5 colours, pin, optional link to a case, private or shared with the team | New `dashboard_notes` table; visibility reuses the case-notes scopes. No fake starter notes | M + SQL |
| N3.5 ✅ made (a656a894, 5bedf639; reviewed) | Case canvas upgrades on our `CaseGraphView`: undo/redo (40 steps), pulsing glow on urgent cards, link cards, checklists, an «import from case» drawer that points to real rows | Stored in the existing `case_graphs` jsonb. **No** win/lose percentages (٢٦٧ default) and no fake AI | M |
| N3.6 ✅ made (ad3c355f, 23fb791a, 8ccc5489; reviewed; SQL 13 for you) | Client case-tracking link: hashed token, revoke by the lawyer, a public page showing only the next hearings, court, stage and approved decisions, plus a «إنشاء حساب» call to action | Reuse the hashed-share pattern. Default field set and "valid until revoked" (٢٧٦). Replaces the public mock `/cases/[id]` | M + SQL |
| N3.7 ✅ made (0aa83568, 046a20fe; reviewed; SQL 14 for you) | Activity log in 3 tabs: «نشاطي», «نشاط المكتب», «الصادر والوارد», plus a timeline inside each case with «إضافة قيد صادر/وارد» | New ledger table keyed on `case_request_id text` (his SQL fails on uuid→text). The office tab shows only for firm accounts and members | M + SQL |
| N3.8 ✅ made (43e95185, 91f66334; reviewed; SQL 15 for you) | Profile visibility switches for services, education and courts | Column grants under the column lock, plus `_verify`. **Default (٢٦٨-أ):** the license still follows «إظهار التواصل», and reviews stay protected | M + SQL |
| N3.9 ✅ made (f8eefeff, 2c640892, dde95924, 4790a96b; reviewed; SQL 16 + 17 for you) | No hard delete of case notes or documents by staff: archive with `deleted_at`, keep history, notify the office owner, restore in one click | His directive 5 is clear. Touches the case-table policies. Docker RLS tests required | M–L + SQL |
| N3.10 ✅ made (a656a894; reviewed) | Automatic graph layout (force-directed, Obsidian style) as a «ترتيب تلقائي» button on our canvas | Not delivered in his package; build with d3-force or similar | M |
| N3.11 ✅ made (8a64eb3e, 4753b25c, 5bd154df; reviewed) | Office-wide graph, read-only: cases, clients and opponents across the office, with conflict hints | Built on `lawyer_clients` / `service_requests` and the real conflict-check route. His graph is all invented data | M–L |

### Batch N4: payments, before going live (ours, already deferred)

| ID | What | Size |
|---|---|---|
| N4.1 ✅ made (be8aff38, 2e4cd10d, aa8aeff4) | Make `grantPlan`'s cancel+insert atomic: a transient error during an upgrade can lose the remaining days | M + SQL |
| N4.2 | After the first test run: confirm `metadata.order_id` reaches Moyasar, test refund vs void past 90 minutes, and test sweep recovery | S |

### Suggested order for Part 1
1. **N1** (one batch, no SQL).
2. **N4.1**, which must land before real payments.
3. **N2.1–N2.3** and **N3.1 + N3.3**: quick wins the owner can see.
4. **N3.2, N3.4, N3.6, N3.7**: one SQL batch for the user.
5. **N2.4–N2.6** (library search and sorting).
6. **N3.5, N3.8–N3.11**.

---

## PART 2 — WAITING FOR THE OWNER'S ANSWER

| Question | What it unblocks | Default we keep meanwhile |
|---|---|---|
| ٢٥٧ library assistant points (1 vs 5–10) | B2 point charge for the assistant; the pricing card text | No charge yet |
| ٢٥٨ top-up VAT for individuals | `catalog.ts` top-ups `vat: "buyer"` (S) | VAT added for everyone |
| ٢٥٩ laws with no recorded status | Removing «لم يُتحقّق من الحالة» (S, 3 tests pinned) | Label stays |
| ٢٦٠ موجز and card public or subscribers only | Showing N2.1/N2.2 to guests (flag) | Subscribers only |
| ٢٦١ which card fields | Field list in N2.1 | Fields as they are in the file |
| ٢٦٢ series key for collections | More series in N2.4; may need a reload by him | Tagged series only |
| ٢٦٣ موجز for decrees and fiqh books | Source edits by his library agent, then a reload | None |
| ٢٦٤ which «مبسطة» to remove | Sidebar toggle removal (S–M); other removals (S) | No change |
| ٢٦٥ reminder times and client WhatsApp | Final times in N3.2; WhatsApp path | Report times, in-platform |
| ٢٦٦ real Google sync | Google OAuth sync, a token table, consent verification (L) | `.ics` + link only |
| ٢٦٧ canvas strength % | — | Not built |
| ٢٦٨ license / reviews switches | Variant (b) of N3.8 | (a) |
| ٢٦٩ "my profile isn't listed" | Diagnosis of that account | — |
| ٢٧٠ branches, devices, procurations, timesheets, firm invoices | A rewrite of his `20261023` SQL as separate safe features (L). Firm invoices conflict with ٢٥٠ | Deferred |
| ٢٧١ who decides; د. أشرف's title; About page | Blog author titles (data), About page text | Address د. محمد; no change |
| ٢٧٢ staff mailbox names | Mailboxes; CRM users | Nothing |
| ٢٧٣ which entity owns the Moyasar keys | Company details on receipts; B3 office account | Platform account |
| ٢٧٤ CRM scope | Staff CRM dashboard + sales/support role (L), or the WhatsApp gateway first | Not built |
| ٢٧٥ AI models | Model choice in n8n for new tools | Haiku 5.5 / Sonnet 5.5, no Opus |
| ٢٧٦ tracking-link fields and lifetime | Final field set in N3.6 | Default set, until revoked |
| ٢٧٧ merged-first sort in search too | N2.5 scope | Catalogue only |
| N1.8 target when the transcriber goes live: drafter or `/ai/analyze` (his own docs disagree) | Where the ready button is mounted | Drafter handoff built; button mounted on activation |
| ٢٥٥ SMS sign-in | SMS provider + phone sign-in (M–L, monthly cost) | Email + phone field |
| ٢٥٦ ZIP of attachments + branding: where; lawyer or firm | Branding vault + ZIP bundle (M–L + SQL; his `20261019_vault_lawyer_branding.sql` can't run: it reads a non-existent `profiles.role`) | Not built |
| (old) ١٨٦/٢٢٢ basic laws for companies | Waiting on his library agent moving 3 files | — |
| (old) ٢٣٤ service pages | The service-page fix batch | Hidden from the list |

---

## PART 3 — PAYMENTS, LATER BATCHES (already planned)

- **B2 (after real payments open):**
  - renewal from the saved card, with a reminder 3 days before;
  - retries on days 0/+3/+6 and a 7-day grace period;
  - monthly plan points (yearly plans need per-month lots: `p_order` null or a per-month order);
  - the assistant point charge (amount per ٢٥٧);
  - pro-rata upgrades (٢٥٣).
- **B3:**
  - payment links;
  - bank transfer marked as paid;
  - consultations and services through the office's separate Moyasar account;
  - fix the payments `'pending'` CHECK bug.

---

## PART 4 — OPS, ON THE USER'S SIDE (no code)

| ID | What |
|---|---|
| O1 | Deploy f9d3219b (payments UX + dark mode), then tell me so the owner report can be flipped to «نُفِّذ ✓» |
| O2 | Run payments SQL 08 (`20261022_34`) if not done, then `07_AFTER_ALL_verify.sql` → `_verify: 20261022_34 OK` |
| O3 | n8n: payments sweep every 10 minutes (`x-cron-secret`), and the hourly `POST /api/v1/cron/deadlines` (also needed by N3.2) |
| O4 | Set `N8N_WEBHOOK_BASE_URL` on the server (WhatsApp delivery notices are off without it) |
| O5 | Admin → settings: company details for the receipt (blocks real payments) |
| O6 | Tell me whether founder-campaign file 03 (the old-subscriptions wipe) was run |
| O7 | Later, after the answers: staff mailboxes + DNS; Meta WhatsApp Business (number, templates); Google OAuth app (only if ٢٦٦-ب); Claude key in n8n; Apple Pay domain registration with Moyasar |

---

## PART 5 — FROM HIS PACKAGE, NOT TO BE APPLIED (for reference)

- **SQL:**
  - `20261023_unified_firm_tenancy_and_procurations.sql`:
    - `FOR ALL` policies without `WITH CHECK` let anyone plant rows in another firm;
    - two tables have no policies;
    - there is no role gating;
    - it isn't re-runnable;
    - it creates second sources of truth.
  - `20261019_lawyer_visibility_and_ledger.sql`: uuid→text FK, so it fails.
  - `20261019_vault_lawyer_branding.sql`: uses `profiles.role`, which doesn't exist.
  - `20260930_dashboard_notes.sql`: uses the dead `public.cases`.
  - The phase-39 canvas SQL: needs `tenants` and a `tenant_id` JWT claim.
- **Routes:**
  - `api/v1/firm/entitlements`: trusts an `x-test-user-id` header, so anyone can impersonate anyone.
  - `api/v1/calendar/google-sync` + its n8n workflow: no auth, so it's an open relay. It also puts every office in one Google account, hard-codes `office@nezamy.sa`, and shows a false "4 reminders set".
  - Library staging routes (init/search/books/precedents/laws):
    - they read locked columns with the anon key;
    - they're open to `.or()` injection;
    - they sort inside a page and drop the paywall checks.
  - `api/v1/profile`: an older base that would overwrite ours.
- **Code:**
  - `entityRouteAccess.ts`: would overwrite decisions ٥/٣٦ and risks locking firm accounts out.
  - Graph and canvas patches: invented cases, `setTimeout` "AI", a localStorage hand-off.
  - Watermark viewer: the real ID and IBAN are sent to the browser.
  - Speed dial, sticky wall, `ledgerService`, `VaultSmartMultiUploadModal`: fake data or localStorage.
  - `identityCardV2AndSummary.ts`: invents card values.
  - `KNOWN_PRECEDENT_SERIES` and the المغني/كشاف القناع maps: invented counts and topics.
  - The `purge_unverified_article_status` patch: waits on ٢٥٩.
  - `parse-precedents` change: would overwrite principle text.
- **Worth reusing as ideas:**
  - the reminder-stage date logic;
  - the shape of `assertFirmRole`;
  - the target-firm idea in `firmMembershipAccess` (without the non-existent `branch_id`);
  - `firmVocabulary.ts`, once the firm profile save is wired up;
  - the `PrivacyTab` link;
  - the `ListItems` expand/collapse markup.

**Security note for the owner (also in his questions file):** README §34 of his package carries the live Moyasar public key, the secret-key prefixes and the entity ID in plain text.
