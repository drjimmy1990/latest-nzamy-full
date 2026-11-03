# Slice E: Chrome extension and platform sync (§4), canvas studio (§5)

Master guide lines 202–238. Memo `05_…/مذكرة_فحص_وإصلاح_إضافة_كروم_ناجز_للمبرمج_٢٠٢٦-١١-٠١.md`, where §11 and §12 override §1–10.

Abbreviations used in this report:
- **PKG** = the owner's extension package, `C:\Users\LOQ\Downloads\حزمة_المبرمج_٢٠٢٦-١١-٠١\05_إضافة_كروم_ومزامنة_المنصات\nezamy-chrome-extension\`, version 1.2.0. It has background.js (1502 lines), content.js (694 lines) and popup.js (806 lines).
- **e00e51cd** = our older v1.0 on the `owner-edits` branch, `nezamy-chrome-extension/`, with a 456-line background.js. Its name was «جسر مزامنة ناجز الذكي».
- **UNTRACKED** = files that exist only in the main working folder and are not on any branch:
  - `src/app/api/v1/najiz/sync/route.ts`
  - `src/lib/services/najizDecomposer.ts`
- **main** = `D:\nzwt\founder` at commit 80ea10ad.

Checked across every local branch: no `20261102_*` migration exists on any of them.

## 1. Item table

| id | Owner wants | Status | Evidence | Effort | Needs |
|---|---|---|---|---|---|
| §4.1.1a | 1-click harvest of chosen cases (all, active, closed, by number, by party), sessions and full minutes | PARTIAL | The harvester exists only in PKG: background.js:375-401 calls `/icms/api/cases/{key}/…`, :653 calls `/ocelot/api/my-cases`. Our repo has only the older e00e51cd. No server stores the result safely (see §4.2.1a). | M | none (extension); server routes as below |
| §4.1.1b | Hijri dates converted to Gregorian via `gregorianFromHijri` | MISSING in extension; helper exists on server | PKG sends the raw `hijriDate` (background.js:571). The server helper is `gregorianFromHijri` in main `src/lib/services/hijri.ts`, used at `src/lib/library/monitorFeed.ts:119`. Conversion belongs on the server (memo §9 `normalizeGovDate.ts`). | S | none |
| §4.1.1c | **All PDF binaries** pulled and uploaded, even with the nezamy.sa tab closed | MISSING (both sides) | PKG never fetches a binary. Attachments carry only `sourcePath: att.downloadUrl…` (background.js:474, 510, 537). content.js:591 reads `response.text()` only. There is no blob or arrayBuffer handling and no `uploads/sign` call. Main has no `uploads/sign` route. | L | SQL migration (attachments columns) |
| §4.1.1d | `resolveClientSide`: the client's true side decides folder 03 vs 04 | PARTIAL (buggy) | background.js:285-336 falls back to `"plaintiff"` silently (:335). The regex at :306 matches «مستأنف ضده» with hamza, but `normalizeArabicText` (:268) has already turned أ into ا, so an appellee is never matched and is classed as plaintiff side. `isRoleOnClientSide` ends `return isPlaintiffUploader \|\| true;` (:348), so any unknown uploader goes to folder 03 «مذكراتي». | S | none |
| §4.1.1e | Background upload with an outbox while the nezamy.sa tab is closed | PARTIAL (unsafe) | Outbox at background.js:777-793 holds up to 100 full bundles in plaintext `chrome.storage.local`. It flushes when any nezamy tab loads (:888-894). Memo §9 phase 4 asked for IndexedDB with WebCrypto, `chrome.alarms`, an `isFlushingQueue` lock and `Retry-After`; none of these are present (grep found nothing). | M | none |
| §4.1.2a | No code obfuscation; ownership by Nezamy stays visible | DONE | PKG is plain readable JS. grep for `eval(`, `new Function` and `atob(` finds nothing. The manifest name and README state Nezamy ownership. | – | none |
| §4.1.2b-1 | Official name «نظامي \| مساعد المزامنة والأرشفة المكتبية» | DONE (PKG) | PKG manifest.json:3 and :20. e00e51cd still has the old name. | S | none |
| §4.1.2b-2 | Publish as **Unlisted**; install only from the verified subscriber's dashboard | NOT-CODE + MISSING | This is a Chrome Web Store setting. No install link or "connect platforms" page exists in main (`grep -ri "chromewebstore\|najiz" src/app/settings` finds nothing). | S (page) | owner decision / store account |
| §4.1.2b-3 | `activeTab` + `scripting` only; no `.gov.sa` hosts declared in the manifest | CONFLICT (PKG contradicts the owner's own §11ج1) | PKG manifest.json:26-50 lists static `content_scripts` on 15 gov patterns. :51-69 lists the same 15 gov hosts in `host_permissions`, plus `http://localhost:3000/*`. :71-77 declares `"tabs"` and has neither `activeTab` nor `alarms`. :79-83 lists `localhost:3000` in `externally_connectable`. | M | none |
| §4.1.2b-4 | Zero server-to-portal footprint | DONE today; must be kept | No route in main contacts a gov host. **Rule to keep:** the server must never fetch the `sourcePath` URLs PKG sends (background.js:474), or the footprint is broken. | – | none |
| §4.1.2b-5 | Terms clause 9: the subscriber is Data Importer and Controller, Nezamy is the Data Processor (PDPL art. 8, regulation art. 17) | PARTIAL / CONFLICT | Main has no such clause (`grep "Data Processor\|معالج" src/app/terms/page.tsx` finds nothing). The ready patch `src_patches/app/terms/page.tsx:105-112` has the clause, but the file rewrites about 189 lines of live terms (whitespace-insensitive diff) and changes the commission (see Conflicts C1). | S to merge | owner decision (commission) |
| §4.1.2c-1 | Remove «ناجز حكومة» | DONE (PKG) | grep across PKG finds nothing. | – | none |
| §4.1.2c-2 | Remove `humanDelay`; replace it with a calm `clientRequestQueue` (1–2 concurrent) | PARTIAL: renamed only | The behaviour is unchanged. `paceClientRequest()` at background.js:168-171 still sleeps `PACE_FLOOR_MS 800 + Math.random()*PACE_JITTER_MS 650` (:16-17), which is randomized human-like jitter. No `clientRequestQueue` exists. | S | none |
| §4.2.1a | `POST /api/v1/workspace/import-archive` as the neutral standard route, accepting the extension bundle and JSON/ZIP uploads | MISSING | No `src/app/api/v1/workspace/`. `ls src/app/api/v1` has no workspace or gov-sync folder. | L | SQL migration |
| §4.2.1b | Aliases `/api/v1/gov-sync/batches` and `/api/v1/najiz/sync`, never a 404 | MISSING / CONFLICT | `gov-sync` is missing. `najiz/sync` exists only in UNTRACKED and is **unsafe to ship** (see Risks R1). | M | – |
| §4.2.1c | `uploads/sign` + `uploads/complete` for large PDFs under `<uid>/gov-sync/…` | MISSING | No route. The path must also pass the `20261026_65` path-ownership guard (`supabase/migrations/20261026_65_attachments_path_ownership.sql`). | M | SQL migration |
| §4.2.1d | `ancillary` routes for the five procedural portals | MISSING | No `gov_sync_ancillary_records` table and no route. | M | SQL migration |
| §4.2.1e | Server-side filter: drop binaries flagged `containsClassifiedHint` or `containsIdentityCardHint`; keep a text reference only | MISSING (server); weak (client) | The flags are set from the **title only**, on the client (background.js:351-358). The pattern `/اقامه/` matches the normalized «صحيفة إقامة دعوى», so a lawsuit petition is flagged as an identity card and would be dropped. The server must run its own check and must not trust a missing flag. | M | none |
| §4.2.2a | All attachments placed in `CaseSixFolderArchive.tsx` (01–06) in the «المستندات والأرشيف» tab; never in the vault | MISSING | No component exists. The lawyer case tab is a flat «المستندات» (`src/app/dashboard/lawyer/cases/[id]/page.tsx:279`), fed from `attachments` (:745). `public.attachments` has no folder column (`20260518_client_workflow_backend_ready.sql:41-50`). An upload with `request_id IS NULL` is a vault file (`20260628_documents_upload.sql:10-11`), so the importer must always set `request_id`. | M | SQL migration |
| §4.2.2b | `service_requests.request_kind = 'self_managed_case'` keeps synced cases out of the marketplace | MISSING | There is no `request_kind` column. Only `type` exists, with its check at `20260814_service_orders_types.sql:21-25`. Marketplace leak risk: see R6. | M | SQL migration |
| §4.2.2c | Seven platforms on `CaseGraphView` (Najiz and Moeen as primary; Taradhi with privilege lock; Khibrah, admin enforcement, Infath and Efaa as intermediate nodes) | MISSING | `NodeRefType = "hearing" \| "document" \| "party" \| "stage"` (`src/app/dashboard/business/kanban/_graph-model.ts:20`). No platform nodes and no `conciliation_privilege_guard` (grep finds nothing). | M | – |
| §4.2.2d | Honest dual save receipts (shown only on 200 OK) | CONFLICT (server) | PKG treats `!response.ok` as queued (background.js:841-852), which is fine. UNTRACKED route.ts:97-103 returns `ok:true` for wekalat without saving anything. :152-154 only logs a warning when the case upsert fails, then still returns `ok:true` (:252). | S | – |
| §4.2.3a | Sync, alerts and graph cost 0 points | n/a (no sync yet) | Nothing to bill yet. Keep these flows out of `ai_runs`. | – | – |
| §4.2.3b | Brief at 30 points (1–5 pages) and 150 points (6–30 pages) | DONE | `src/lib/ai/tools.ts:324-325`, price at :1253 (`case-brief`). | – | – |
| §4.2.3c | +5 points per page above 30 | CONFLICT | `CASE_BRIEF_FILES … maxPages: 30` (tools.ts:326) rejects page 31 (`aiFiles.ts:182`). The canonical pricing doc (`04_…/وثيقة_التسعير…:236`) says "+5 per page, capped at 150 pages". | S | owner confirm |
| §4.2.3d | `ai_document_cache (sha256)` so the same document is never charged twice | MISSING | No table and no code (grep finds nothing for `ai_document_cache`). | M | SQL migration |
| §4.2.3e | Send to `/ai/collector` with context ("save to collector" button and "send with context to ▾" on each document) | PARTIAL | The collector exists (`src/app/ai/collector/page.tsx`, researchService). Documents have no such buttons. | M | – |
| §4.2.3f | Waiting motion (`AiThinkingStage`) | MISSING | grep finds nothing. Covered by the motion-system slice. | – | – |
| §4.2.3g | `can_access_case_file`: owner, `case_team_members`, and `co_counsel` without duplicating the case row | PARTIAL / CONFLICT | `case_team_members` exists (`20261017_41_notes_visibility_case_team.sql:102-109`) with `firm_id NOT NULL` and **no role column**, and its insert requires an active member of the case's firm. `can_access_case_file` does not exist. Today's rule `case_worker_ok` gives **every active firm member** access to every firm case (`20261025_31_dashboard_notes.sql:105-110`). | L | SQL migration + owner decision |
| §4.2.3h | Managing partner dashboard: aggregate numbers and Milestone Billing Trigger, without opening colleagues' files | MISSING | No milestone billing exists. Belongs to the firm/finance slice. | L | owner decision |
| §4.3.1 | Storage and AI adapters behind env vars (`StorageAdapter`, `AiProviderAdapter`, `VERTEX_REGION=me-central2`) | PARTIAL | AI already goes through n8n paths (`tools.ts` `n8nPath`), which in practice works as the provider adapter. Storage calls the Supabase client directly, with no adapter (grep finds nothing). | M | none |
| §4.3.2 | Migration `20261102_04` with **nullable** BYOS columns (`storage_provider`, `drive_file_id`, `drive_web_view_link`) on `attachments` | MISSING / CONFLICT | No 20261102 file on any branch. Memo §9 makes `storage_provider` NOT NULL and relaxes the path guard; §12 says nullable (see C3). | S | SQL migration |
| §4.3.3 | `GET /api/v1/workspace/portal-adapters-config` (signed, cached 6 h) + `optional_host_permissions` | MISSING | No route. Store-policy limit noted in R9. | S | – |
| §4.3.4 | Non-destructive merge of graph and hearings (`graphReconciler.ts`, `superseded_by`) | PARTIAL | The basis exists: `NodeRef {ref_type, ref_id}` (`_graph-model.ts:20-21`) and import cards (N3.5). No `graphReconciler` and no `superseded_by` on hearings. UNTRACKED **inserts** new hearings and deadlines on every sync (route.ts:195-198, 233-237), creating duplicates. | M | SQL migration |
| §4.3.5 | Normalized case-bundle schema (`ingest_gov_case_bundle`) so an official B2B API can plug in later | MISSING | No schema and no RPC. | M | SQL migration |
| §11ج3 / §12أ3 | Privacy page: remove "we train AI on anonymized data" (lines 34 and 129) | MISSING on main; patch is PARTIAL | Main `src/app/privacy/page.tsx:34` still has the sentence. The patch changes only lines 34 and 129. It lacks the retention split and the sub-processor list that §11ج3 asks for. | S (P0) | none |
| §11ج3 | n8n: switch off "Save successful production executions" | NOT-CODE + JSON | Repo JSON still has `"saveDataSuccessExecution": "all"` in 7 workflows: assistant, **canvas-card**, communicate, lib-queries, library-assistant, najiz-optimizer, quick-answer (`n8n/ai/*.json`). | S | n8n workflow |
| Memo §9-4 / §11ب6 | Extension hardening: device pairing with DPoP and `storage.session` (8 h max, 30 min idle); no external `sync-case`; no localhost; identity mismatch as a hard lock; no forced `tabs.reload` | MISSING (PKG) | Token stored in `chrome.storage.local` (background.js:1480-1488). External `nezamy:sync-case` still accepted (:1471-1477). localhost trusted (:81). `identityMismatch` is advisory only (:1117-1133). `chrome.tabs.reload(tabId)` still at :255. Keep-alive uses `setInterval` (:157). | M | – |
| Memo §9-1 | Device tables, consent and audit (`gov_sync_devices`, `gov_sync_consents`, `gov_sync_batches`, `gov_sync_audit`) and pairing routes | MISSING | No tables and no routes. PKG accepts **any** token pushed via `nezamy:pair-token` (:1479). | L | SQL migration |
| §5.1a | Remove `OfficeGraphPage` at `/dashboard/lawyer/graph`; replace it with the "canvas and graph studio" | CONFLICT | `OfficeGraphPage` is **real**, not mock. It is a read-only map backed by `GET /api/v1/lawyer/office-graph` (`src/components/dashboard/officeGraph/OfficeGraphView.tsx:8`, `src/app/dashboard/lawyer/graph/page.tsx:1-6`). Deleting it removes real data. Proposal: keep it as the studio's "global map" mode. | M | owner decision |
| §5.1b | Build the studio from the golden components (`CaseGraphView`, `CaseGraphOverlays`, `_use-case-graph-state`, `_graph-model` with `isGlobal`, `LegalCanvas`, `CanvasHighlighter`) | CONFLICT (honesty gate) | The golden files are **older and use mock data**: `MOCK_NODES`/`MOCK_EDGES`/`ERP_GENERATED_*` (golden `_graph-model.ts:63-86`); fake AI via `setTimeout` (golden `_use-case-graph-state.ts:111`, `runAiAnalysis` 2000 ms at :264-269, a fake voice note at :272-278); `MOCK_CARDS` (golden kanban `page.tsx:67,198`); hard-coded «قوة الموقف: ٧٨٪» (golden lawyer `LegalCanvas.tsx:141`); `CanvasHighlighter` in localStorage (golden :23,36). Live is a superset (`CaseGraphView` 1185 lines vs golden 722), saved in `case_graphs`, with a real `canvas-card` AI. **Port missing UI pieces onto live; never replace live files.** | M | – |
| §5.1c | Firm case page uses the unified `CaseGraphView` (memo §9-3) | PARTIAL | The firm page still mounts `LegalCanvas` (`src/app/dashboard/firm/cases/[id]/page.tsx:90,1404`). The lawyer and business pages already use `CaseGraphView` with `isGlobal`. | S | – |
| §5.2 | Saved boards index in the DB: unlimited boards, linked to a case, consultation, contract, task, collector session or synced case, or free; link later in one click | MISSING | `case_graphs.case_request_id` is the **primary key** (`20260903_phase1_case_tables.sql:309-313`), so there is one board per case and no free boards. Needs a new `canvas_boards` table with a nullable `(entity_type, entity_id)`, plus RLS and a list page. | L | SQL migration |
| §5.3a | Manual cards: 0 points | DONE | Manual editing writes `case_graphs` only. | – | – |
| §5.3b | AI content for one card: 10 points | DONE | `canvas-card` `price: () => 10` (`src/lib/ai/tools.ts:1230-1243`); the UI is at `CaseGraphView.tsx:119-140`. | – | – |
| §5.3c | Canvas AI Strategist (full case strategy map): 50 points | MISSING | No tool id or n8n workflow (grep for "Strategist" finds nothing). | M | n8n workflow |

**Counts by status (46 rows, each counted by the first word of its status cell):**

| Status | Rows |
|---|---|
| DONE | 7 |
| PARTIAL | 10 |
| MISSING | 21 |
| CONFLICT | 5 |
| NOT-CODE | 2 |
| n/a | 1 |

Four rows also carry a second CONFLICT label (§4.1.2b-5, §4.2.1b, §4.2.3g, §4.3.2), and Section 2 lists 9 conflicts in all.

## 2. Conflicts

**C1. Marketplace commission in the terms patch versus the canonical pricing and live terms.**
- The patch, `05_…/src_patches/app/terms/page.tsx:80` and :210, says «تتراوح بين ٧٪ و١٥٪».
- The canonical pricing doc (`04_…/وثيقة_التسعير_الكنوني…:821`) gives the fourth tier (founder lawyer, firm-enterprise, نخبة) as «تنخفض النسبة إلى `5%` فقط». Line 317 says «عمولة سوق `5%` للسنة الأولى».
- Live terms, main `src/app/terms/page.tsx:81`, say «بين ٥٪ و١٥٪».
- **Conclusion:** the patch would publish a floor of 7% that contradicts the owner's own 5% tier. Merge clause 9 only and keep 5–15%, unless the owner says otherwise.

**C2. The owner's §11ج1 manifest versus the shipped PKG manifest.**
- The memo says: «الاكتفاء بـ `activeTab`, `scripting`, `storage`, `alarms`, `notifications`, `downloads` مع `host_permissions: ["https://nezamy.sa/*", "https://*.nezamy.sa/*"]`».
- PKG manifest.json:26-83 declares 15 gov hosts in both `content_scripts` and `host_permissions`, plus `tabs` and `localhost:3000`, with no `activeTab` and no `alarms`.
- Memo §9-4 also asked for `localhost` to be removed, `oauth2 drive.file` and `unlimitedStorage` to be added. §11 and §12 supersede the Drive part.

**C3. Migration 04: memo §9 versus §12 and the master guide.**
- Memo §9 (line 309): `storage_provider text NOT NULL DEFAULT 'supabase' CHECK (…'gdrive')`. It also relaxes `trg_00_attachments_session_guard` to allow `storage_path IS NULL` when `gdrive`.
- §12ج2 and guide line 229 say the BYOS columns are «`NULLABLE`», added only for later.
- **Ruling (§12 overrides):** add nullable columns only, and **do not touch the 20261026_65 path guard** in v1.

**C4. "Every lawyer sees only his case" versus today's firm-wide model.**
- The memo (§11ب7) says «قطع رؤية `firm_members` المشاعية» through `can_access_case_file`.
- Live `case_worker_ok` (`20261025_31_dashboard_notes.sql:105-110`) admits **any active firm member** to every firm case. It drives notes, tracking links (`20261025_32`) and the ledger (`20261025_33`).
- Narrowing it removes access that firm managers have today across several already-shipped features. This needs an explicit owner decision and a full policy sweep (effort L).

**C5. `co_counsel` versus the `case_team_members` schema.**
- The guide wants co-counsel added «دون تكرار الصف», and memo §9-5 wants `role = 'co_counsel'`.
- The table has `firm_id NOT NULL`, the primary key `(request_id, user_id)`, no role column, and an insert that requires an active member of the case's firm (`20261017_41:102-109`).
- A co-counsel from another firm, or a solo lawyer, cannot be represented without a schema change.
- Memo §9-5 also says «مقيدة بنفس firm_id فقط», which contradicts the guide's cross-lawyer co-counsel.

**C6. Brief pages above 30.**
- The canonical doc (`…:236`) says «وما زاد عن ٣٠ صفحة: `+5 نقاط/صفحة` بسقف ١٥٠ صفحة».
- Live `CASE_BRIEF_FILES.maxPages: 30` (`tools.ts:326`) refuses page 31.

**C7. "Restore the golden canvas" versus the honesty gate.**
- The live file headers document the removal of these exact fixtures: live `kanban/page.tsx:3-27` (MOCK_CARDS), `_use-case-graph-state.ts:270-275` and :495, `LegalCanvas.tsx:324`.
- Re-copying the golden files would bring back invented nodes, fake AI spinners and a fake «قوة الموقف ٧٨٪» score. The owner removed win-rates earlier.

**C8. "Delete the useless OfficeGraphPage" versus its being real.**
- See §5.1a. The page is a live, RLS-scoped data map, not a mock.

**C9. Hosting premise.**
- The memo (§11أ3) treats production as `Supabase Cloud`.
- Project records show production moved to self-hosted Supabase at `auth.nezamy.sa` (`docs/audits/2026-09-25-selfhost-readiness.md`).
- The server's country is not in the repo. Whichever it is, the guide's neutral wording («مساحتك السحابية المعزولة والمشفرة») is the safe choice. The user should confirm the location before any "inside KSA" claim.

## 3. Risks

**R1 (security, critical). UNTRACKED `src/app/api/v1/najiz/sync/route.ts` must never be committed as it is.**
- route.ts:72-77: any `Bearer` token longer than 10 characters becomes the **user id**. `Bearer <victim-uuid>` writes as the victim. Any `NZ_…` token maps to the zero UUID.
- route.ts:116 writes with the **service client**, which bypasses RLS.
- route.ts:81-92: outside production, an anonymous call writes as `11111111-…`.
- route.ts:124 and :150: `upsert` on `id = najiz_<objectKey>` lets one user overwrite another user's case row. It also writes `public.cases`, a legacy table with no readers. The live case model is `service_requests` (see the comment at `src/app/api/v1/lawyer/case-graph/[caseId]/route.ts:13-15`).
- route.ts:137: party `identityNumber` values (opponents' national IDs) are kept in plaintext metadata (PDPL art. 6 and 28).
- route.ts:170: the side is hard-coded as `"plaintiff"`.
- route.ts:167: a missing hearing date defaults to **today**.
- route.ts:210-211: deadlines are counted from the **sync date**, not the hearing date. That is invented legal data.
- `najizDecomposer`'s «Tactical Leaning Score 20–85» (`najizDecomposer.ts:12`) is an invented confidence score, the same class as the removed win-rate.
- **Recommendation:** delete it, and rebuild it as the `import-archive` alias on top of device-token auth and an `ingest_gov_case_bundle` RPC.

**R2 (security, high). PKG lets any nezamy.sa page, or a local process, steer the extension.**
- `isTrustedNezamyOrigin` trusts `http://localhost:3000` in production (background.js:81; manifest :69 and :82).
- A page on that port can send `nezamy:pair-token`. The extension then sets `nezamy_server_url` to that origin (:1479-1488), and every later bundle (names, IDs, minutes) goes to it.
- `nezamy:sync-case` from any nezamy.sa page starts a Najiz harvest **without a user click or the consent checkbox** (:1471-1477). That contradicts "only at the user's command", and an XSS on nezamy.sa could use it to exfiltrate cases.
- The token is persistent in `storage.local`. The real name in `nezamy_bound_gov_identity` and the outbox of up to 100 bundles are unencrypted on disk.

**R3 (legal, owner's decision; report, not refuse). The automation is still the pattern the owner's own memo calls risky.**
- Memo §11أ1 names undocumented internal APIs (`/ocelot`, `/icms`), randomized delays and scripted profile clicks as a «قرينة مادية خطيرة» under Anti-Cybercrime Law arts. 3, 5, 9, 13 and Copyright Law art. 47.
- PKG keeps all three:
  - the APIs (background.js:375-401, 653, 729-730, roleIds 1331/1332);
  - random jitter (:168-171), only renamed;
  - automatic profile switching that clicks Najiz menus (content.js:501-553);
  - a forced tab reload (:255).
- Renaming a function changes nothing for a reviewer who reads behaviour.
- **Minimum honest fix:**
  - a deterministic fixed-interval queue (for example 1 request in flight, fixed 500 ms);
  - no automatic reload or profile clicks (ask the user to switch);
  - harvest only on a user gesture;
  - per-case caps.
- The memo's own advice to seek an MoJ no-objection (§11ج3) remains the real mitigation. Najiz's terms of use were not checked here.

**R4 (store policy).**
- **Unlisted** does not skip review. The listing still needs an accurate single-purpose description, a privacy policy and data-use disclosures.
- Leaving gov domains out of the manifest *so that they are not shown publicly* can be read as misrepresentation if the description does not say the extension reads those portals. Using `activeTab` for least privilege is legitimate; hiding purpose is not.
- Technical limits of `activeTab`:
  - the grant exists only after a user click on that tab and ends when the tab navigates or reloads, so :255 `tabs.reload` would kill it;
  - each portal needs its own click;
  - background `chrome.tabs.query({url})` cannot see gov tabs without `tabs` or host permissions.
- "Sync all cases with one click" therefore works only while the user stays on that tab.

**R5 (data protection).**
- The cloud backup checkbox is **pre-ticked** (popup/index.html:214 `checked`; popup.js:567 defaults to `true`). That conflicts with §11ب4's explicit choice and PDPL consent.
- Bundles carry third-party data such as opponents' names and identity numbers. Minimise this on the server: hash or drop `identityNumber`.

**R6 (data leak). Marketplace exposure.**
- RLS admits «every unassigned pending request» to verified lawyers (`src/app/api/v1/service-requests/route.ts:197-199`).
- A synced case created unassigned or pending would appear in the marketplace.
- `request_kind` must gate the **RLS policy** itself, not only the query, and imports should be created `assigned_to = owner` with a non-pending status.

**R7 (data loss).**
- `classified` and `identity` matching on titles only gives false positives: «إقامة دعوى» matches `اقامه` (background.js:353). The importer would drop real petitions and never tell the user.
- Show the excluded list in the save receipt.

**R8 (fake data).**
- Copying the golden canvas or LegalCanvas brings back mock nodes and invented scores (C7).
- UNTRACKED returns `mock-dl-*` deadline ids when no DB is present (route.ts:243).

**R9 (store policy).** `portal-adapters-config` may ship **data only** (selectors, field maps). Any executable logic fetched remotely breaks the Manifest V3 ban on remotely hosted code.

## 4. Suggested batches, in dependency order

**0. P0 quick wins (S).**
- Privacy lines 34 and 129, from the patch.
- Merge **only** terms clause 9 (Controller/Processor) into live terms, keeping 5–15% and the `LEGAL_IDENTITY` and escrow wording.
- Set `saveDataSuccessExecution: "none"` on the 7 n8n JSONs and on the live instance.
- Delete UNTRACKED `najiz/sync` and `najizDecomposer`, or park them off main.

**1. Extension hardening (M), our copy derived from PKG.**
- Manifest per §11ج1 (C2): `activeTab`, `scripting`, `alarms`; nezamy hosts only; no localhost in the store build.
- Drop external `sync-case`.
- Pinned origin; no server-URL override.
- Fixed-interval queue; no `tabs.reload` or automatic profile clicks.
- `storage.session` token; encrypted IndexedDB outbox; identity hard lock.
- Fix `resolveClientSide` (hamza bug, `|| true`); refine the sensitivity regex.
- Consent unticked by default.

**2. Migrations (M; for the user to run).**
- `20261102_01`: devices, pairing codes, consents, batches, append-only audit.
- `20261102_02`: `service_requests.request_kind` with the RLS gate, `gov_*` columns, partial unique indexes; `hearings` gains `gov_portal`, `external_hearing_id`, `hijri_date_raw`, `superseded_by`, `missing_at_source_since`; `gov_sync_ancillary_records`.
- `20261102_04`: `attachments.archive_folder` (01–06), `content_sha256`, `gov_document_key`, `hearing_id`, and **nullable** `storage_provider`, `drive_file_id`, `drive_web_view_link`; no change to the path guard (C3).
- `20261102_05`: `ingest_gov_case_bundle` RPC and `ai_document_cache`.

**3. Server routes (L).**
- Pairing and refresh; `POST /api/v1/workspace/import-archive` with the normalized bundle schema and aliases `gov-sync/batches` and `najiz/sync`.
- `uploads/sign` and `complete`, with magic bytes, server sha256 and **server-side** sensitivity enforcement.
- `ancillary` list and link; `portal-adapters-config` (data only).
- Hijri conversion via `gregorianFromHijri`; idempotent hearing upserts.
- Rate-limit bucket in `src/proxy.ts`.

**4. UI (M–L).**
- `CaseSixFolderArchive.tsx` in the case file tab, never the vault.
- Settings page "connect platforms" with devices, consent and orphan inbox, plus the Unlisted install link.
- `NodeRefType` gains ancillary, minutes and folder_bucket; seven-platform nodes; `graphReconciler.ts`.
- Firm case page switches `LegalCanvas` to `CaseGraphView`.
- Collector buttons on each document.
- Then add the extension PDF binary fetch, in-tab with signed upload (completes §4.1.1c).

**5. Access model (L; needs owner decision C4/C5).**
- `can_access_case_file`; a `role` column on `case_team_members` and a cross-firm co-counsel design.
- Policy sweep across `service_requests`, `hearings`, `case_stages`, `tasks`, `deadlines`, `case_graphs`, notes, tracking links, ledger and `ownRequestsFilter.ts`.

**6. Canvas studio (L).**
- `canvas_boards` table (nullable entity link), board index, link-later action.
- `/dashboard/lawyer/graph` becomes the studio, with `OfficeGraphView` kept as its "global map" mode (C8).
- Port selected golden UI pieces (not mock data) onto live `CaseGraphView`.
- The `canvas-strategist` tool at 50 points, with an n8n workflow and save-executions off.

**Owner questions to raise:**
- C1 commission floor.
- C4 firm-wide visibility.
- C5 cross-firm co-counsel.
- C6 pages above 30.
- C8 keep the office map.
- R3 MoJ no-objection before publishing.
