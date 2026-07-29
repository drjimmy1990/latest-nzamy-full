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
| **3** | Content correctness (4 tracks) | 🔄 | **3a + 3b + 3c done**. 3d (feqh) spec rejected by verification — needs rework. |
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
- [x] 2.5 Identity-collision detector in **all four** parsers
- [x] 2.6 Fail-loud exit code in **all four** (was: swallow per file, exit 0)
- [x] All four parsers on shared slug / frontmatter / exclusions / report modules
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

### ✅ Junk removed — collisions 18 → 14

Owner approved deleting the backup archive.

- **Deleted** `deleted_backups_archive` (section 13) — **276 files**, all
  `.backup_*` / `.bak_*` snapshots from the owner's own July audit runs; the live
  version of each exists in the main tree. A safety copy was taken and verified
  (276 = 276) before removal. `du`/`rm` failed on these paths with long-path
  errors — exactly rule ق-4 — so removal used the `\\?\` prefix and clears
  read-only attributes, then verifies emptiness.
- **`lib/exclusions.ts`** — durable, code-level exclusion so artefacts can never
  re-enter the pipeline, with every exclusion **counted and reported**:
  `PDF_EXTRACTION_REPORT.md` (89) and `_غير_تشريعي_مؤكد_لا_يُصنف` (105, excluded
  from parsing only — **not deleted from disk**).

Re-parse: **1,727 files → 194 excluded → 1,533 legal documents, 41,462 articles.**
Collisions **18 → 14**, remaining loss **232 → 88**.

### 📤 Owner guide produced

[`دليل_المالك_إصلاح_المعرفات.md`](دليل_المالك_إصلاح_المعرفات.md) — Arabic, written
for a legal expert rather than a programmer. Generated **from the parser's actual
output**, so every path and count is measured. Contains: what a slug is and why a
duplicate silently deletes a document, slug-naming rules, edit instructions, the
full 14-group / 102-file table with a blank column to fill in, the 8
duplicate-key files with exact field names and line numbers, and what was
deleted. Flags the worst case — `_هيئة_المياه.md` has **`slug` itself duplicated**
(lines 2 and 33), so the document's own identity was ambiguous.

### All four parsers now guarded — full-corpus results

| Parser | Parsed | Excluded | Identity collisions | Unclassified | Exit |
|---|---:|---:|---:|---:|:--:|
| laws | 1,533 laws · 41,462 articles | 194 | **14** (88 docs lost) | — | 1 |
| decrees | 2,313 decrees · 3,199 articles | 1 | **1** | — | 1 |
| precedents | 215 collections · 18,020 principles · 1,213 rulings | 38 | **6** (87 lost) | **4** | 1 |
| feqh | 144 books · 119,392 pages | 1 | **0** | — | **0** ✅ |

**Feqh is clean** — 0 collisions, 0 empty books. This independently confirms the
"82% of feqh seeds empty" claim was already fixed before the owner's guide was
written, as the earlier audit found.

**Precedents: the MOJ volume collapse is real and matches plan decision 1 exactly.**
215 collections → **128 survive → 87 silently lost**:

| Collection id | Volumes collapsing into one row |
|---|---:|
| `moj-judgments-1434` | **30** |
| `moj-rulings-collection-1434` | **30** |
| `moj-judgments-1435` | 14 |
| `moj-rulings-collection-1435` | 13 |
| `_اللجان_شبه_القضائية` | 3 |
| `_وزارة_العدل` | 3 |

Each is one file per physical volume sharing a single frontmatter `id` — roughly
a thousand real rulings reachable only through whichever volume seeds last.

**Decrees: 1 id collision** — the duplicate basename from plan decision 5
(`قرار مجلس الوزراء 123 - 1443-02-21هـ`, two distinct files).

**Fixed the missing `else` branch in precedents.** The three-way classifier
cascade ended with no fallback, so a file matching none of the branches vanished
with no warning, no counter and no exit code. Now counted: **41 → 4** after
exclusions, and those 4 are exactly the files plan decision 3 names.

### Reporting: console caps, the record does not

I capped console warnings at 15 and then realised that hid 873 of 888 decree
warnings — the same silent-truncation pattern this whole pass exists to remove.
Added **`lib/report.ts`**: every run writes a complete, uncapped
`parse-report-<type>.json` beside the output with every warning, exclusion,
collision and unclassified file, and the console prints where to find it.

The decree warnings turned out to be two systematic template defects, not 888
distinct problems — most prominently `section_name: "غير_مصنف" والتعاميم والمراسيم`,
a quoted scalar followed by bare text. That is invalid YAML; the old parser
stored it with the literal quote characters embedded.

### ⏸️ Needs an owner decision before Phase 2 can finish

The collision guard now blocks seeding — by design. Unblocking needs decisions
**4** and **5** from the plan:

1. ~~Exclude the junk?~~ ✅ **Done** — approved and applied (see above).
2. **MOJ volume collapse (plan decision 1)** — 87 collections lost. Recommend one
   row per physical volume, deriving the id from the per-file frontmatter rather
   than the shared collection id.
3. **4 unclassified precedent files (plan decision 3)** — `_قرارات_الضريبة_الانتقائية_2023`,
   `القرارت والتعاميم…الزكاة_والجمارك`, `وزارة_العدل_المجموعة_1435_المجلد_14`,
   `مبادئ-المحكمة-الإدارية-العليا-1442هـ`. The last is marked
   `status: جاري الاستخراج` (extraction in progress) — quarantine it; fix the
   others at source.
4. **Duplicate decree basename (plan decision 5)** — owner renames one file.
5. **88 documents still need distinct `slug:` values at source.** Cannot be
   auto-generated: a machine-invented slug becomes a fabricated citation URL for
   a real law. Guide sent to the owner. Worst groups: `regulation` (28),
   `document-slug` (21 — an unreplaced template placeholder), `regulation-transport`
   (13), `transport` (9), `law` (7 — Railways Law, Ports Authority Law and others
   all sharing the key `law`). Nearly all sit in section 13 (القسم اللوجستي),
   which appears to have been processed with a template that never filled the
   slug in.

---

## PHASE 3 — Content correctness ⬜

- [x] **3a Laws** — ✅ **DONE** — see below
- [x] **3b Decrees** — ✅ **DONE** — see below
- [x] **3c Precedents** — ✅ **DONE** — see below
- [ ] **3d Feqh** — remove `\b` from Arabic regexes · locator formats · flushPage reset · order_index

### 3a — Laws: amended/repealed article text ✅

The highest-severity defect in the project. Two failures in opposite directions:
superseded text leaked **into** the live article text, and the article's real
history was **never captured at all**.

| Metric | Before | After |
|---|---:|---:|
| Markup leaked into live `text` | **3,005 articles** | **0** |
| Articles with `original_text` | 0 | **2,817** |
| Amendments carrying historical text | 0 | **2,878** |
| Files failing to parse | — | **0** |
| Articles parsed | 41,462 | 41,462 (none lost) |

**Concrete proof** — `general-authority-for-competition-regulation` article 1,
the same row I pulled from production earlier:

*Before (live in prod today):* the superseded definition `المحافظ: محافظ الهيئة.`
sits inside the article's live text, wrapped in raw `<details>`/`<summary>` markup.
*After:* live text ends cleanly at `اللجنة: لجنة الفصل في مخالفات النظام.`, and
`original_text` holds `المحافظ: محافظ الهيئة.` on its own.

**New module `lib/article-history.ts`** — designed from a survey of the real
corpus, not from the spec's list. The survey found the single most common label
(`النص قبل الإلغاء (نص صفحة هيئة الخبراء)`, 831 uses) was **missing from the
plan's list entirely**.

- Labels split into **before-text** (what follows IS the superseded law) vs
  **reference** (what follows is a decree citation). Treating a reference as
  text would store "amended by decree X" as if it were the article's wording.
- Matching is **prefix-based and diacritic-folded**. Both mattered: labels carry
  qualifiers like `(بصيغتها المعدَّلة عام 1423هـ)`, and `أُضيفت` vs `أضيفت`
  differ only by a combining damma. Exact matching missed 7 files; diacritics
  accounted for most of the initially-unclassified blocks.
- Three evidence-based fallbacks for unlabelled blocks, then **verbatim
  quarantine** — 3,005 blocks in, **96 quarantined (97.4% classified)**.
- `<details>` containing a `REGULATION` anchor is historic regulation text, not
  article history — separated rather than misfiled (16 blocks).

### Two claims I tested rather than trusted

**CRLF (plan said true — it is).** My own reasoning said the heading regex would
still fire on CRLF; testing proved otherwise. `.` does not match `\r` (it is a
line terminator), so `/^###?\s+.*\n/m` fails on **1,331 of 1,533 files** — every
one of those articles had its heading embedded in its text. Fixed by normalising
at read time.

**The heading-strip hazard (plan said ~4,800 — it is 6,700).** A large part of
the corpus writes the article's whole text on the heading line:

```
### المادة السادسة والأربعون: لا يجوز حسم أي مبلغ من راتب الموظف …
```

A naive "delete the heading line" empties **6,700 articles**. `stripArticleHeading`
removes only the matched label, driven by the anchor's own `number_text`, and
leaves the line untouched if the label cannot be matched. **5,254 articles
protected.**

### On the hard-fail: I made it precise rather than loud

The spec called for throwing when cleaning empties an article. Implemented that,
and it failed 7 files — of which 5 were a bug in my own extractor and 2 were
articles genuinely empty in the source (a bare `### الصفحة 2` page marker).

Since `stripArticleHeading` only removes a matched prefix, it *structurally
cannot* delete following text, so "cleaning ate the text" is not the real risk.
The guard was replaced with two precise ones:

1. **An invariant that throws** if the heading strip ever removes a non-heading
   line — this is what actually protects statutory text, and it fails loudly if
   a future edit loosens the regex.
2. **A counted warning** for articles with neither live text nor history (10
   corpus-wide) — a fact about the source, reported in the parse report, not a
   reason to block 1,500 good files.

Also widened `ArticleStatus` to include `added` (45) and `merged` (1), which
occur in the corpus but were absent from the union and silently cast; unknown
statuses now throw rather than defaulting to `active` — publishing an article as
current law on a guess is exactly what rule ق-2 forbids.

### Verification

`npx tsx scripts/parsers/lib/article-history.corpus-check.ts` — a committed
corpus-coverage harness (re-run after any change to the extractor; the only
meaningful test of a heuristic over free-form Arabic legal prose is what it does
to the real corpus). `tsc` clean. Full parse: **0 failed files**, 41,462 articles,
0 markup leaked. Only remaining failure is the 14 slug collisions — the owner's.

### 3c — Precedents: court attribution ✅

Two independent misattributions, both fixed.

**Root cause found by surveying the corpus, and it is not what the plan said.**
The plan blamed a bad default. The actual cause is that **the administrative
judiciary uses a different frontmatter field**: ordinary courts write
`court_type:`, while ديوان المظالم (61 files) and المحكمة الإدارية العليا (16)
write `court:`. The parser read `court_type || track || "ordinary"` — so every
administrative document fell through to the default.

Also measured: **`track` appears in 0 of 1,432 source files**, yet the seeder
wrote `coll.track`. That is why 94 of 95 collections in production have an empty
track column. And `court_type` holds court *names* ("المحكمة العليا"), not
branches — so name and branch were conflated in one column.

| | Before | After |
|---|---:|---:|
| Collections on `admin` track | **0** | **100** (6,602 principles) |
| Collections on `semi` track | 0 | 19 (2,019 principles) |
| Collections on `ordinary` track | *all of them* | 95 (9,382 principles) |
| Collections with unresolved track | 215 | **1** |
| Rulings falsely attributed to المحكمة التجارية | **639** | 0 |

**6,602 principles** of administrative-judiciary rulings — ديوان المظالم and the
Supreme Administrative Court — were published as ordinary-judiciary decisions.
In Saudi law these are separate branches.

**New `lib/court.ts`** separates the two concerns: `court` keeps the verbatim
name; `track` is a derived branch. It classifies from the **folder first** (the
strongest signal, and the only one present for the 219 files carrying no court
field), then the court name, then `"unknown"`. Defaulting to a real branch is
forbidden — that is precisely what published administrative rulings as ordinary.

**The fabricated collection is gone.** Every standalone ruling was attached to
one hardcoded row: `court: "المحكمة التجارية"`, `track: "commercial"` (not even a
valid track). The seeder now derives one collection per (track, court) actually
present:

| Rulings | Track | Court |
|---:|---|---|
| 599 | ordinary | المحكمة العليا |
| 574 | ordinary | المحكمة التجارية |
| 15 | semi | لجنة الاستئناف في منازعات الأوراق المالية |
| 12 | ordinary | المحكمة العمالية |
| 11 | ordinary | محكمة الاستئناف |
| 2 | ordinary | المحكمة العامة |

**Frontend priority inverted.** `getCourtOrIssuer` preferred the collection's
court over the record's own `issuing_body`, so the fake label won on screen and
in generated citations. The per-record body now wins — the collection is a
grouping and necessarily less specific. Also **removed the collection title as a
court fallback**: "مجموعة الأحكام القضائية لعام 1434هـ" is a publication, not an
issuing authority, and citing it as one is a fabricated attribution.

**The one remaining `unknown`** records its issuing body as "وزارة المالية" — a
ministry, not a court. Left flagged for review rather than assigned a branch on
a guess.

`tsc` clean; build 394/394.

### 3b — Decrees: instrument taxonomy ✅

**707 of 2,077 typed documents (34%) were stored under a wrong or
under-specified instrument.** The DB CHECK allowed only three values, so the
seeder clamped everything else.

| Instrument | Now | Previously stored as |
|---|---:|---|
| circular (تعميم) | 873 | circular ✓ |
| cabinet_decision (قرار مجلس الوزراء) | 292 | cabinet ✓ |
| royal_decree (مرسوم ملكي) | 287 | royal ✓ |
| **supreme_order (أمر سامي)** | **265** | **royal** — a distinct instrument |
| **rules (قواعد)** | **118** | **cabinet** — fabricated |
| decision (قرار, issuer unstated) | 69 | cabinet |
| **royal_order (أمر ملكي)** | **64** | **royal** — conflated with مرسوم ملكي |
| **ministerial_decision (قرار وزاري)** | **34** | **circular** — clamped |
| principles / regulation / standards / guide / … | 25 / 15 / 14 / 10 / … | all cabinet |
| **unknown** | **0** | — |

**New `lib/instrument.ts`** — exact-match on the real frontmatter strings, no
substring guessing. `type: "قرار"` (362 files) names a *form*, not an authority;
`issuing_instrument` resolves 75% of them (160 أمر سامي, 75 مجلس الوزراء, 38 أمر
ملكي, 19 وزاري). A cross-check against the title found 187 agreements and **zero
contradictions**, which is what justifies trusting that field. The rest stay the
generic `decision` — coarse but accurate, rather than precise and wrong.

Removed `detectDecreeType`'s catch-all `return "cabinet"`, which asserted 207
unrecognised documents were Cabinet Decisions.

**Migration `20260729_decree_instrument_taxonomy.sql`** widens the CHECK to 21
types **and retains the three legacy values**, so it cannot fail on the ~2,078
existing rows and needs no backfill — applying it alone is a behavioural no-op
until a reseed writes precise types. Adds `instrument_ar` for the verbatim name.

**Seeder clamp replaced with a loud assertion.** Silently rewriting a legal
instrument type to satisfy a constraint is the exact failure this program exists
to remove.

**Frontend crash guard (plan D8).** `ORDER_TYPE_STYLES[o.type].label` had no
fallback — the first widened value would have thrown and taken down the Orders
tab. All lookups now route through `orderTypeStyle()` / `orderTypeLabelEn()`.

### 3d — Feqh: spec rejected by verification ⏸️

Not implemented. The adversarial pass found the survey's design would fail:

- It writes a **`page_order` column that exists nowhere** in the repo or in any
  proposed migration — it would fail at the PostgREST layer.
- **810 PAGE_START anchors are invisible to both production and the proposed
  fix** (796 share a line with a preceding `<!-- PAGE_END -->`). True anchor
  count is 17,687, not the 16,879 it designed against.
- The `order_index` impact claim is **wrong by ~88×** (12 affected blocks, not
  ~1,053), making its before/after verification unusable.
- Several pinned acceptance numbers do not reproduce.
- The reseed would leave **~119k orphaned blocks** unless the shadow-schema
  cutover is used, and stales the `cross_section_search` matview — never mentioned.

The underlying defects are real and I confirmed them independently: **119,353 of
119,392 blocks have `order_index = 0`**, and
[route.ts:126](src/app/api/library/books/[slug]/route.ts:126) gates on
`order_index >= freeLimit` — so every paid feqh book is fully readable right now.
But the fix is not safe to implement as written; 3d needs a fresh survey against
the corrected anchor population.

**What was done:** 3a, 3b, 3c complete. 3d deferred pending a sound spec.

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
