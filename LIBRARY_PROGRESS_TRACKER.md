# NZAMY Legal Library — Progress Tracker

**Started:** 2026-07-29 · **Plan:** [`LIBRARY_FINALIZATION_PLAN_2026-07-29.md`](LIBRARY_FINALIZATION_PLAN_2026-07-29.md)

This is the **working log**. Every phase gets checked off here with what was actually
done, what was measured, and what changed versus the plan. The owner-facing Arabic
summary (`LIBRARY_PIPELINE_FIX_STATUS.md`) is produced at Phase 8 from this file.

**Legend:** ✅ done · 🔄 in progress · ⏸️ blocked (needs owner) · ⬜ not started

---

## Phase overview

| # | Phase | Status | Notes |
|---|---|---|---|
| **0** | Tooling truth & safety net | 🔄 | Code done + committed `d5aca3f`. **Backup (0.5) blocked — needs owner.** |
| **1** | Kill switch (open/close library) | ✅ | Built + verified end-to-end. **Not yet deployed to VPS.** |
| **2** | Parser foundations | 🔄 | Laws track done. **Found 232 documents that would be silently lost.** Blocked on owner decisions 4 & 5. |
| **3** | Content correctness (4 tracks) | ⬜ | |
| **4** | Build `library_next` | ⬜ | |
| **5** | Shadow seed & integrity | ⬜ | |
| **6** | App consumes new data | ⬜ | Must deploy **before** Phase 7 |
| **7** | Cutover | ⬜ | |
| **8** | SEO, cleanup, owner deliverable | ⬜ | |

---

## Production baseline — measured 2026-07-29

Captured with `npm run library:baseline` → [`library-toolkit/baseline-2026-07-29.json`](library-toolkit/baseline-2026-07-29.json).
Re-run at every phase gate; diff two snapshots to fill the before/after table.

**Row counts — 319,235 total**

| Group | Tables | Rows |
|---|---|---|
| Laws | laws 386 · chapters 774 · articles 13,436 · amendments 349 | 14,945 |
| Decrees | decrees_circulars 2,078 · decree_pages 2,950 | 5,028 |
| Precedents | collections 95 · principles 17,940 · paragraphs 1,385 | 19,420 |
| Feqh | books 144 · chapters 27,474 · sections 132,832 · blocks 119,392 | 279,842 |
| **User data** | folders 0 · items 0 · reports 0 · invitations 0 | **0** |

**Data-quality metrics — these are the numbers the program must move**

| Metric | Now | Target | Meaning |
|---|---:|---:|---|
| `articlesWithDetailsMarkup` | **1,294** | 0 | Repealed/superseded text leaking into live article text |
| `articlesWithHtmlComment` | **182** | 0 | Raw HTML comments in stored legal text |
| `articlesNumberZero` | **345** | 0 | Article number destroyed by `Number()` coercion |
| `amendmentsWithFullText` | **0** | ~2,600 | Historical text captured (currently 100% lost) |
| `collectionsTrackEmpty` | **94 / 95** | 0 | Judicial track never populated |
| `collectionsCommercialCourt` | **1** | 0 | The fabricated "المحكمة التجارية" collection |
| `feqhBlocksOrderZero` | **119,353 / 119,392** | ~144 | `order_index` all 0 ⇒ every paid feqh book is unlocked |
| `decreeTypes` | royal 421 · cabinet 783 · circular 874 | real taxonomy | Only 3 legal types exist today; reality has ~22 |

---

## Corrections to the plan found during execution

Recorded so nobody re-litigates them. **Measure, don't trust.**

| Plan claim | Reality (measured) | Action |
|---|---|---|
| "55 of 56 seeded laws have `section_code = ''`" (Phase 2.3) | **FALSE in prod.** All 386 laws have real values; distribution `00`–`08`, zero NULL, zero empty. | Phase 2.3 **descoped** to a guard only. The quote-strip bug may still exist in code but does not manifest on current data. |
| "`__art-NaN` ids in production" | **0 rows** match `%__art-NaN%`. The JSON hop converts `NaN` → `null` before the seeder, as plan decision #18 predicted. | Still fix the coercion (it destroys `number`, see 345 rows at `"0"`), but it is **not** producing colliding ids today. |
| "3,005 articles contain `<details>` markup" | **1,294** in current prod. The 3,005 figure was measured against a different corpus. | Use **1,294** as the baseline for the before/after table. |
| `library-clear.mjs` bug | **CONFIRMED** against live schema. | Fixed — see Phase 0 below. |

---

## PHASE 0 — Tooling truth & safety net 🔄

**Goal:** make the destructive tools honest, and take a restorable backup, before anything touches production.

### 0.1 ✅ Fix `library-clear.mjs` — it could not delete `library.laws`

**The bug.** [`library-clear.mjs`](library-toolkit/library-clear.mjs) deleted with a
filter on `id` for *every* table, but `library.laws` has no `id` column — its primary
key is `slug` ([schema:73](supabase/migrations/20260626_legal_library_schema.sql:73)).
Postgres rejected it, the script printed the error, **continued**, and **exited 0**.

Net effect of `library:clear --type laws`: articles, chapters and amendments deleted —
laws left intact — **reported as success**. That is exactly the earlier incident where
the live site was left showing empty law pages.

**Proved against the live database** (both probes used a sentinel value matching zero
rows, so nothing was deleted; row counts confirmed unchanged at 319,235 afterwards):

```
DELETE /laws?id=eq.<sentinel>     → HTTP 400  {"code":"42703","message":"column laws.id does not exist"}
DELETE /laws?slug=eq.<sentinel>   → HTTP 204  ✔
DELETE /articles?id=eq.<sentinel> → HTTP 204  ✔ (control)
```

**Fixed** with an explicit per-table PK map, mirroring the mapping `seed-library.ts`
already had right:

```js
const PK_BY_TABLE = { laws: "slug" };
const pkFor = (table) => PK_BY_TABLE[table] || "id";
```

### 0.2 ✅ Fail loudly instead of exiting 0

A `failures[]` list now collects every count error, delete error, **and** a new
post-delete verification. The run ends with `process.exit(1)` and an explicit warning
that the library is in a partially-cleared state and must not be seeded on top of.

Added a **post-delete row-count verification** — the script no longer trusts "no error"
as proof of deletion. This is the backstop that would have caught the original bug on
its own, independent of the PK fix.

### 0.3 ✅ User data can no longer be wiped implicitly

`smart_folders`, `smart_folder_items`, `issue_reports`, `invitations` hold data no
reseed can regenerate (invitation codes gate premium access). A bare
`library:clear --live` previously deleted all of it.

Now the `user` group is excluded unless `--type user` is passed **explicitly**, and the
banner states it: `(user data preserved — pass --type user to clear it)`.

> This also defuses `npm run library:reseed:wipe`, which the plan had to ban outright
> because it called clear with no `--type`. It is still **not** the recommended path.

### 0.4 ✅ `LIBRARY_SCHEMA` env support

`seed-library.ts`, `library-clear.mjs`, `library-status.mjs` (and the new
`library-baseline.mjs`) now read `process.env.LIBRARY_SCHEMA ?? "library"`. This is what
makes the Phase 4–7 shadow-schema strategy possible without touching production.
Both clear and status print the active schema in their banner.

### 0.5 ⏸️ **BLOCKED — production backup (needs owner)**

Cannot be done from here: `.env.local` has no `DATABASE_URL` (only the REST service-role
key) and `pg_dump` is not installed locally.

**Owner action required — one of:**
- Supabase Dashboard → Database → Backups → create an on-demand backup, **or**
- provide the direct Postgres connection string so a `pg_dump --schema=library` can run.

> Not a blocker for Phase 1 (non-destructive). **Is** a hard blocker for Phases 5–7.

### 0.6 ✅ Baseline captured

New reusable tool [`library-toolkit/library-baseline.mjs`](library-toolkit/library-baseline.mjs)
(`npm run library:baseline`) — records row counts **plus** the data-quality metrics
above, so before/after is measured identically every time rather than re-derived by
hand. Snapshot committed as `library-toolkit/baseline-2026-07-29.json`.

### Phase 0 verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run library:clear` (dry) | ✅ lists 4 content groups, user group excluded, real counts |
| Live-schema PK probe | ✅ old path 400/42703, new path 204 |
| Row counts after all probes | ✅ 319,235 — unchanged |

### Files changed in Phase 0

| File | Change |
|---|---|
| `library-toolkit/library-clear.mjs` | PK map · failure tracking + exit 1 · post-delete verify · user-group opt-in · `LIBRARY_SCHEMA` |
| `library-toolkit/library-status.mjs` | `LIBRARY_SCHEMA` support + schema in banner |
| `library-toolkit/library-baseline.mjs` | **new** — baseline + data-quality metrics |
| `scripts/seed-library.ts` | `LIBRARY_SCHEMA` for `Content-Profile` / `Accept-Profile` |
| `package.json` | added `library:baseline` |
| `library-toolkit/baseline-2026-07-29.json` | **new** — the measured baseline |

---

## PHASE 1 — Kill switch ✅ (built & verified — deploy pending)

**Goal:** the owner can close/open the library from admin with no redeploy. Insurance for Phase 7.

- [x] 1.1 Migration `20260729_library_status.sql` (seeds `'open'` — verified a no-op)
- [x] 1.2 `library_status` in `ALLOWED_SETTINGS_KEYS` + **value validator**
- [x] 1.3 `getLibraryStatus()` in `access-control.ts`, mirroring `getPaymentGatewayStatus()`
- [x] 1.4 `/api/v1/library/status` route + `useLibraryStatus` hook
- [x] 1.5 Gate **9** API routes — one more than planned (see below)
- [x] 1.6 Gate client-side bundled-content bypasses — via **layout-level** guard
- [x] 1.7 `LibraryClosedNotice` + loading spinner (never flashes real text)
- [x] 1.8 Admin toggle with two-step confirm
- [ ] 1.9 **Deploy to VPS — not done yet**

### What was done

**Storage & read path.** `platform_settings.library_status` holds
`{status: "open"|"closed", message: string|null}`, mirroring the existing
`payments_gateway` flag exactly. `getLibraryStatus()` **fails open and logs
loudly** — a settings outage must not black out the library, and it cannot leak
paid content either because the tier paywall is a separate check that already
degrades toward *more* locking.

**Typo safety, both directions.** The reader treats anything that isn't exactly
`"closed"` as open, so a bad value can't take the library down by accident. The
inverse risk — the owner *means* to close it, typos `"closd"`, and it silently
stays **open** — is caught at the write path by a new per-key validator in
`api/v1/admin/settings`, which rejects any status other than `open`/`closed`.

**Enforcement is at the API, not the UI.** `libraryGate()` is the first
statement of every content route and returns `503` with
`Cache-Control: no-store` (so no intermediary can pin the closure after
reopening) and `Retry-After: 3600`. Admins bypass it. Cost is one settings
lookup on the open path — the admin check only runs once already closed.

**Found a 9th leak path the plan missed.** `api/ai/explain-article` returns
`relatedArticles: [{num, text}]` — real statutory text — despite living under
`/api/ai/`. Gated it too. Routes gated: `init`, `laws/[slug]`, `books/[slug]`,
`decrees/[id]`, `precedents/[slug]`, `search`, `autocomplete`,
`ai/library-chat`, `ai/explain-article`. Deliberately **not** gated:
`folders`, `folders/items`, `reports` — user data, not library content.

**Layout-level client guard instead of 9 per-page edits.** `LibraryGuard` wraps
`laws/layout.tsx`, `precedents/layout.tsx` and a new `book/[slug]/layout.tsx`.
Chosen over per-page early-returns because an early return inside an existing
page would skip that page's remaining hooks and break the rules of hooks. It
also covers future routes automatically and never mounts children while closed,
so no content fetches fire. `/book/[slug]` is scoped to the dynamic segment so
`/book/consultation` (a lawyer booking flow) is untouched. `/laws/subscribe`
stays reachable via an allowlist — it sells library access but renders no
statutory text, and blocking it would strand users arriving from a pricing link.

### Verification — end to end against a real dev server

Applied the setting, flipped **closed**, measured, flipped back **open**.

| Check | Closed | Open |
|---|---|---|
| `/api/v1/library/status` | `effectiveStatus: "closed"` | `"open"` |
| All **9** content routes | **503**, no body leak | **200** |
| `/laws/companies-law` (bundled `COMPANIES_LAW`) | notice, **159 chars**, no text | full content |
| `/laws/civil-procedure` (bundled `ARTICLES`) | notice, **159 chars** | full content |
| `/laws/feqh-preview` (bundled `DEMO_BOOK`) | notice, **145 chars** | full content |
| `/book/rawd-al-murbi` (bundled `DEMO_RAWD`) | notice, **159 chars** | full content |
| `/laws/subscribe` (must stay open) | **renders pricing** ✔ | renders pricing |
| `/laws` body length | notice only | **2072 — byte-identical to pre-test** |

The bundled-content pages are the important result: those render statutory text
straight from the JS bundle without ever calling the API, so the server gate
alone would not have stopped them.

`npx tsc --noEmit` → exit 0. `npm run build` → compiled, **394/394 pages**.

**Left in `open`.** Final DB state confirmed `{"status":"open","message":null}`.

### Not verified

- The admin PATCH validator was not exercised over HTTP (needs an admin
  session). Logic is unit-obvious but untested end to end — worth one manual
  click after deploy: set an invalid status and confirm a 400.
- Screenshots unavailable in this environment (browser pane not composited);
  all UI checks were done via DOM text extraction, which is stricter anyway.

### Files changed in Phase 1

| File | Change |
|---|---|
| `supabase/migrations/20260729_library_status.sql` | **new** — seeds `open` |
| `src/lib/access-control.ts` | `getLibraryStatus()` + types + default message |
| `src/lib/library-gate.ts` | **new** — the 503 gate |
| `src/hooks/useLibraryStatus.ts` | **new** — client hook |
| `src/app/api/v1/library/status/route.ts` | **new** — public status endpoint |
| `src/components/library/LibraryGuard.tsx` | **new** — layout-level guard |
| `src/components/library/LibraryClosedNotice.tsx` | **new** — closure UI |
| `src/app/api/v1/admin/settings/route.ts` | allowlist + value validator |
| 9 API routes | `libraryGate()` as first statement |
| `src/app/laws/layout.tsx`, `precedents/layout.tsx` | wrapped in guard |
| `src/app/book/[slug]/layout.tsx` | **new** — scoped guard |
| `src/app/dashboard/admin/settings/page.tsx` | Section 4: open/close + message + confirm |
| `.claude/launch.json` | `autoPort` (port 3000 was occupied) |

---

## PHASE 2 — Parser foundations 🔄 (laws track done; 3 parsers remain)

- [x] 2.1 Vendor `schema_manifest.json`; `getManifest()` eager + shape-asserted
- [x] 2.2 `js-yaml` (CORE_SCHEMA) replacing the hand-rolled frontmatter parser
- [x] 2.3 ~~`section_code`~~ **descoped — verified already correct** (see below)
- [x] 2.4 Shared `lib/slug.ts` + Arabic-Indic digits + equivalence test
- [x] 2.5 Slug-collision detector wired into `parse-laws`
- [x] 2.6 Fail-loud exit code in `parse-laws` (was: swallow per file, exit 0)
- [ ] 2.5/2.6 for `parse-decrees`, `parse-precedents`, `parse-feqh`
- [ ] 2.7 Provenance `source_path` / `source_anchor_index`
- [ ] 2.8 Kill `Number()` coercion — `number_raw: string | null`
- [ ] 2.9 Re-key ids (chapter-scoped); hard uniqueness assertion
- [ ] 2.10 Build old→new id map for the bookmark remap

### 🛑 Headline result: 232 documents would have been silently lost

Ran the new pipeline over the full delivered laws corpus
(`last_owner/01_المكتبة_القانونية/أنظمة ولوائح`):

```
1,765 files parsed → 41,924 articles
1,765 laws         → only 1,533 distinct slugs
                   → 232 documents silently discarded at seed time  (13%)
```

`library.laws` is keyed by slug and upserted with `merge-duplicates`, so each
collision group collapses to ONE row and the rest vanish with no error. The new
detector stops the run before any write (**exit 1**).

**18 collision groups / 250 files.** Split:

| Kind | Groups | Files | Notes |
|---|---:|---:|---|
| Pure junk | 2 | 141 | `PDF_EXTRACTION_REPORT.md` (122), non-legislative GACA forms |
| **Contains real legal documents** | **16** | **109** | collapse to 16 rows ⇒ **93 real documents lost** |

Worst offenders:

| Slug | Real files | What they are |
|---|---:|---|
| `document-slug` | 21 | **A placeholder template that was never replaced** — real transport regulations |
| `regulation-transport` | 14 | Distinct transport executive regulations |
| `transport` | 9 | Distinct transport regulations |
| `law` | 8 | Railways Law, Ports Authority Law, Ship Registration Fees… all → `"law"` |
| `transport-1447` | 4 | Distinct 1447 instruments |
| `chambers-of-commerce-law` | 2 | ⚠️ **the ACTIVE law and the REPEALED 1400هـ version collide** |

That last one is the sharpest example of why this matters: the current Chambers
of Commerce Law and its repealed 1400هـ predecessor map to the same primary key.
Whichever seeds last wins the URL — so the library could serve a **repealed**
law as the current one, with no indication anything was dropped.

### Also found: 8 files with duplicated YAML keys

The old hand-rolled parser applied silent last-wins. Confirmed example —
`اللائحة التنفيذية لإجراءات الاستئناف_وزارة_العدل.md` has `source_note` **twice**
(line 19: an extraction audit note; line 47: the notice that the regulation was
repealed and superseded). One was discarded invisibly. On a field like
`issue_date_hijri` or `superseded_by` that same behaviour is a legal-accuracy
defect. These files now parse via a recorded fallback — content preserved,
problem visible.

### What was done

**`lib/slug.ts`** — one shared transliteration table replacing four copies.
Because slug is the laws PK, consolidation is only safe if output is unchanged,
so `slug.equivalence.test.mjs` runs the old and new implementations side by side:
**16 non-digit samples byte-identical**, digits deliberately different. It also
demonstrates the real bug — 3 distinct royal decrees collapsing to one slug, and
a pure-numeral title producing an **empty** slug.

Added Arabic-Indic (`٠-٩`) and extended (`۰-۹`) digits. `\bال` was deliberately
**kept** despite being near-dead on Arabic text: it does fire after an ASCII
boundary, so removing it would re-key real existing slugs for no gain.

**`lib/frontmatter.ts`** — js-yaml with `CORE_SCHEMA` (not `DEFAULT_SCHEMA`,
which coerces date-like strings into `Date` objects; Hijri dates must stay
verbatim per rule ق-1). Not `json: true`, which would restore silent last-wins.
Malformed YAML falls back to the legacy line parser so no document is ever lost,
but the failure is **recorded and reported**.

**Prevented a regression in the process:** with a real YAML parser, nested blocks
now arrive as objects instead of being dropped — and
[seed-library.ts:289](scripts/seed-library.ts:289) does
`String(law.article_status_summary || "")`, which would have written the literal
`"[object Object]"` into the database. `nullIfForbidden` now returns null for
non-scalars, and `asScalar()` exists for the same purpose at other call sites.

**`manifest.ts`** — the manifest is now vendored into `scripts/parsers/`
(tracked in git; `test/` is gitignored, so a fresh clone had no manifest, every
file threw, the per-file catch swallowed it, and the run printed *"Parsed 0
laws"* and exited **0**). `assertManifestLoadable()` runs once at the entry
point, outside the try/catch, and asserts the enum shape — an empty enum would
silently validate every value to its fallback.

**2.3 descoped with evidence.** The plan claimed 55 of 56 laws have
`section_code = ''`. Measured in prod: **all 386 have real values** (`00`–`08`,
zero null, zero empty), and
[parse-laws.ts:296-303](scripts/parsers/parse-laws.ts:296) already re-pads a
YAML-coerced integer back to `"00"`. The claim does not hold.

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ exit 0 |
| `slug.equivalence.test.mjs` | ✅ 16/16 identical, digit fix confirmed |
| Parse one section (37 laws) | ✅ 1,929 articles, exit 0, 1 YAML warning surfaced |
| Parse full corpus (1,765 files) | ✅ 41,924 articles; **exit 1** on 18 collisions — correct |

### ⏸️ Needs an owner decision before Phase 2 can finish

The collision guard now blocks seeding — by design. Unblocking needs decisions
**4** and **5** from the plan:

1. **Exclude the junk?** `deleted_backups_archive` (38), `PDF_EXTRACTION_REPORT.md`
   (122), `_غير_تشريعي_مؤكد_لا_يُصنف` (108). Folders literally named "deleted
   backups" and "confirmed non-legislative — do not classify". *Recommend: yes,
   exclude and print the count.* Not done unilaterally — deciding what is not a
   legal document is the owner's call.
2. **The 93 real colliding documents need distinct `slug:` frontmatter at
   source.** Cannot be auto-generated: a machine-invented slug becomes a
   fabricated citation URL. The `document-slug` group (21 files) is an
   unreplaced template placeholder.

---

## PHASE 3 — Content correctness ⬜

- [ ] **3a Laws** — CRLF normalize · `<details>` extraction (8 heading variants) · quarantine · hard fail on emptied body
- [ ] **3b Decrees** (canary) — exact-match taxonomy · unknown bucket · archive exclusion · duplicate basename
- [ ] **3c Precedents** — track/court classification · per-court collections · no-else guard · container ids
- [ ] **3d Feqh** — remove `\b` from Arabic regexes · locator formats · flushPage reset · order_index

**What was done:** _(pending)_

---

## PHASE 4 — Build `library_next` ⬜

- [ ] M2 bootstrap migration (14 content tables only — **not** the 4 user tables)
- [ ] Expose `library_next` in Supabase API settings
- [ ] Verify zero impact on `library.*`; PostgREST write probe

**What was done:** _(pending)_

---

## PHASE 5 — Shadow seed & integrity ⬜

- [ ] Preflight gate (`scripts/preflight-library.mjs`)
- [ ] Canary: **decrees** → gates → precedents → feqh → laws
- [ ] G1–G4 gates after each type

**What was done:** _(pending)_

---

## PHASE 6 — App consumes new data ⬜

- [ ] Decrees: `ORDER_TYPE_STYLES` fallback (**crash risk** — must ship before data)
- [ ] Laws: `originalText` / `repealedBy` / repealed render gated by `isLocked`
- [ ] Precedents: `getCourtOrIssuer` priority inverted
- [ ] Feqh: `page_label` / `volume_label` null-guards
- [ ] Citation module with corrected `LOCATOR_NOUNS` (**no** `الصفحة`)
- [ ] Deploy to prod on OLD data → must render identically

**What was done:** _(pending)_

---

## PHASE 7 — Cutover ⬜

- [ ] Backup verified (0.5) · library closed · snapshot counts
- [ ] M3 transactional swap · `notify pgrst` · refresh matview
- [ ] Post-cutover gate · bookmark remap · reopen · smoke

**What was done:** _(pending)_

---

## PHASE 8 — SEO, cleanup, deliverable ⬜

- [ ] `/laws/[slug]` server shell + `generateMetadata` + JSON-LD
- [ ] DB-backed sitemap · soft-404 fix · preamble print
- [ ] M4 (drop legacy `royal`, drop `library_old`) after 7-day soak
- [ ] **`LIBRARY_PIPELINE_FIX_STATUS.md`** — Arabic deliverable for the owner

**What was done:** _(pending)_

---

## Open decisions blocking work

Full list in §8 of the plan. Blocking right now:

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 0.5 | Production backup method | Supabase on-demand backup, or share a DB connection string | Phases 5–7 |
| 1 | MOJ volume collapse (87 collections lost) | One row per physical volume, id from frontmatter `meta.id` | Phase 3c |
| 2 | 44 section-97 stub files | Exclude — recovers ~1,000 real rulings | Phase 3c |
| 4 | `_deleted_backups_archive` (232 files) | Exclude, print the count | Phase 3b |
| 5 | Duplicate decree basename | Owner renames one at source | Phase 3b |
| 9 | Repealed text searchable? | Yes, with a prominent ملغاة badge | Phase 3a |
| 10 | Paywall on historical text | Paid — it *is* the article for repealed ones | Phase 6 |
| 11 | Citation wording for repealed articles | Must visibly say ملغاة — owner approves exact text | Phase 6 |

---

## Running log

| Date | Entry |
|---|---|
| 2026-07-29 | Audited owner's `last_owner/` handoff against live code (3 audits). Built 9-phase plan via 15-agent design→verify→sequence workflow. |
| 2026-07-29 | Verified the `library-clear.mjs` laws bug directly against the live schema — confirmed real and still armed. |
| 2026-07-29 | Captured production baseline (319,235 rows + 8 data-quality metrics). Found 3 plan claims that don't reproduce on current prod data — recorded above. |
| 2026-07-29 | **Phase 0 code complete** (0.1–0.4, 0.6). `tsc` clean, dry-run verified, row counts unchanged. 0.5 backup blocked on owner. Committed `d5aca3f`. |
| 2026-07-29 | **Phase 2 laws track**: shared slug + real YAML + fail-loud guards. Full-corpus parse found **232 documents (13%) that would be silently discarded** by slug collision, 93 of them real legal documents — including the active and repealed Chambers of Commerce Law colliding on one key. Blocked on owner decisions 4 & 5. |
| 2026-07-29 | **Phase 1 complete and verified end to end** — closed/open flipped against a live dev server, all 9 routes 503, all 4 bundled-content pages sealed, `/laws/subscribe` stays open, restoration byte-identical. Found and gated a 9th leak path (`ai/explain-article`) the plan missed. **Deploy to VPS still pending.** |
