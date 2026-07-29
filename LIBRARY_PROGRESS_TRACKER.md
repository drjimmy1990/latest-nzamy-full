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
| **0** | Tooling truth & safety net | 🔄 | Code done. **Backup (0.5) blocked — needs owner.** |
| **1** | Kill switch (open/close library) | ⬜ | |
| **2** | Parser foundations | ⬜ | |
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

## PHASE 1 — Kill switch ⬜

**Goal:** the owner can close/open the library from admin with no redeploy. Insurance for Phase 7.

- [ ] 1.1 Migration `20260729_library_status.sql` (default `'open'` — must be a no-op)
- [ ] 1.2 `library_status` in `ALLOWED_SETTINGS_KEYS` + value validator (reject typos)
- [ ] 1.3 `getLibraryStatus()` in `access-control.ts`, mirroring `getPaymentGatewayStatus()`
- [ ] 1.4 `/api/v1/library/status` route + `useLibraryStatus` hook
- [ ] 1.5 Gate **8** API routes (7 content + `api/ai/library-chat`)
- [ ] 1.6 Gate **all 5** client-side bundled-content bypasses
- [ ] 1.7 `LibraryClosedNotice` on 9 pages (spinner while loading — never flash real text)
- [ ] 1.8 Admin toggle with confirm step
- [ ] 1.9 Deploy to VPS
- [ ] Exit criteria: 8 routes → 503 logged out; DOM checks on 5 client pages; flip open → identical

**What was done:** _(pending)_

---

## PHASE 2 — Parser foundations ⬜

- [ ] 2.1 Vendor `schema_manifest.json`; `getManifest()` outside try/catch
- [ ] 2.2 `js-yaml` (CORE_SCHEMA) replacing the hand-rolled frontmatter parser
- [ ] 2.3 ~~`section_code`~~ **descoped** — measured fine in prod; add guard only
- [ ] 2.4 Shared `slug.ts`; delete 4 `AR_TRANSLIT` copies; add Arabic-Indic digits
- [ ] 2.5 `identity.ts` — `assertUniqueIdentity()`, `dedupeOrDie()` (4 silent dedups)
- [ ] 2.6 `guard.ts` — anchor conservation (ق-3); delete 5 catch-and-continue blocks
- [ ] 2.7 Provenance `source_path` / `source_anchor_index` (pre-scan before chapter split)
- [ ] 2.8 Kill `Number()` coercion — `number_raw: string | null`
- [ ] 2.9 Re-key ids (chapter-scoped); hard uniqueness assertion
- [ ] 2.10 Build old→new id map for the bookmark remap

**What was done:** _(pending)_

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
| 2026-07-29 | **Phase 0 code complete** (0.1–0.4, 0.6). `tsc` clean, dry-run verified, row counts unchanged. 0.5 backup blocked on owner. |
