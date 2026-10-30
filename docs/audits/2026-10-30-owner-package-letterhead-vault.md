# Owner package 2026-10-30 — letterhead and legal vault (ledger)

Branch `fix/owner-30oct-letterhead-vault`, cut from `main` at `235e1bef`. Not merged, not pushed, not deployed.

Source (read only): `Nezamy-Developer-Handoff-2026-10-30` —
`05-traceability/developer-backlog.csv`, `08-current-code-review/backlog-review.csv`,
`new-test-requirements-review.csv` (NOTE-09), `lawyer-detailed-followup.csv` (LAW-DETAIL-030),
`07-references/REF0009.md` (note 09), `05-traceability/developer-questions-299-321.csv` (٣١٤, ٣١٥).

## Commits

| Commit | What |
|---|---|
| `68acaea7` | Explicit letterhead permissions (٣١٥), firm QR hook (٣١٤), `/dashboard/firm/vault` route rule, `ensureOwnVault` |
| `1b5fb019` | Stationery upload: migration `20261030_10`, `/api/v1/branding/assets`, panel, account-purge cleanup |
| `06d7d04d` | Vault pages and tabs, letterhead redirects, sidebar, letter editor removed, CODE-F37 save lock |
| `ccc96e72` | Migration fix found by the new RLS harness test (plpgsql `IF … CASE … THEN`), plus the test |
| `5832bf88` | Lint cleanup |
| `eaef6328` | This ledger and the Arabic owner note |
| (last) | Vault pages key the workspace on the tab, so a same-route link (the sidebar's «الخزنة», which has no `?tab`) shows the tab its URL names; pinned in `letterheadWiring.test.ts` |

## Re-verification against current code (before any edit)

All the package's anchors still held at `235e1bef`; the blobs were unchanged since the package's base:

- `src/app/ai/vault/page.tsx` rendered `DashboardComingSoon` («الخزنة القانونية غير متاحة حالياً … لا توجد مستندات محفوظة بعد»).
- `navigation.sidebars.legal.ts:67-71` had a separate «الورق المروّس» row and a «الخزنة · قريباً» row pointing at `/ai/vault`; `:203` had the firm's «الورق المروّس».
- `LetterheadWorkspace.tsx` had the «الخطاب» section (date / to / subject / body / signature, never saved).
- `LetterheadWorkspace.tsx:149-159,280`: inputs were `disabled={!available}` only, and the PUT reply was written straight into `fields`.
- `letterheadIdentity.ts`: `if (res.scope === "firm") return platform("firm")`, and no public firm page exists (`src/app/firms` is absent).
- Firm print rights were implicit: GET `/api/v1/branding?scope=firm` was gated by `FIRM_BRANDING_ROLES` (owner, `managing_partner`, `office_admin`), the same set as `can_manage_branding_vault` (20261026_63). No named permission existed.
- Firm roles are modelled. `firm_members.role` has a CHECK of 13 roles that includes `managing_partner` («الشريك المدير») and `office_admin` («مدير مكتب»), and `firm_profiles.owner_user_id` is the owner. `firm_members.permissions text[]` exists but nothing reads or writes it.

## Blast radius

The GitNexus index is stale for these files. `impact` returned "target not found" for `LetterheadWorkspace`, `qrTargetFor` and `resolveBrandingCaller`, and `detect_changes` mapped 0 symbols across 25 files. The callers below were found with grep instead. Risk is LOW: the only callers are the letterhead and branding modules themselves.

- `resolveBrandingCaller`: `/api/v1/branding` (GET, PUT), `/api/v1/branding/logo` (POST, DELETE) and the new `/assets` route. Its new second parameter defaults to `branding.manage`, so the logo route and PUT behave as before.
- `qrTargetFor` / `buildLetterheadIdentity`: `useLetterhead`, then `LetterheadWorkspace`. The new third parameter has a default.
- `LetterheadWorkspace`: was used by the two letterhead pages; now used only by `LegalVaultWorkspace`.
- `removeLawyerBrandingWith`: `purgeAccountWith` (two call sites); its signature is unchanged.

Re-run `node .gitnexus/run.cjs analyze` after the merge.

## Per-id verdicts

### LIVE-F08 — the letterhead was a separate entry and the vault said nothing could be uploaded
- **Verdict:** fixed in code, waiting for deploy and acceptance.
- **Change:**
  - New real vault at `/dashboard/lawyer/vault` and `/dashboard/firm/vault` with two tabs.
    - «المستندات»: for a lawyer it leads to the real `/dashboard/lawyer/documents` store. For a firm it says plainly that no shared firm document store exists yet.
    - «هوية ومطبوعات المكتب»: the identity, the blank letterhead print, and uploads of the office's own Word / PDF / stamp / signature files to a real backend (C01).
  - `/ai/vault` was **not** touched (off limits), but the lawyer sidebar no longer points there.
- **Files:**
  - `src/app/dashboard/{lawyer,firm}/vault/page.tsx`
  - `src/components/letterhead/LegalVaultWorkspace.tsx`
  - `src/components/letterhead/legalVaultTabs.ts`
  - plus the C01 files below
- **Commits:** `06d7d04d`, `1b5fb019`, `ccc96e72`
- **Tests:** `letterheadWiring.test.ts` (vault pages are server pages, are not «قريباً», and read `?tab`); `brandingAssets.test.ts`; `supabase/tests/rls/branding_assets.test.sql`.
- **Check live:** the package's acceptance test.
  1. Open the lawyer menu, then «الخزنة», then «هوية ومطبوعات المكتب».
  2. Upload a test `.docx` and a PDF. Reload the page and see both listed.
  3. «تنزيل» returns the same file under its original name.
  4. A second lawyer can neither see nor download them: GET returns only his own, and the signed URLs are folder-checked.

### NOTE-09-C06 — letterhead inside the vault, old links redirected, separate entry removed
- **Verdict:** fixed in code, waiting for deploy and acceptance.
- **Change:**
  - `/dashboard/lawyer/letterhead` and `/dashboard/firm/letterhead` are now server pages calling `permanentRedirect(...)` to `/dashboard/<scope>/vault?tab=branding`. This is a page-level 308; `next.config.ts` is untouched.
  - Sidebar changes in `src/constants/navigation.sidebars.legal.ts`, the only navigation file touched (see "Navigation files touched" below).
  - The firm route rule for `/dashboard/firm/vault` is added in `src/constants/entityRouteAccess.ts` (one line).
- **Commits:** `06d7d04d`, `68acaea7`
- **Tests:** `letterheadWiring.test.ts`:
  - no «الورق المروّس» label in either sidebar, and no `/ai/vault` in the lawyer sidebar;
  - the redirect pages are server pages and target the branding tab;
  - the firm vault route admits only `managing_partner` and `office_admin` (and the owner, who resolves as `managing_partner`).
- **Check live:**
  - An old bookmark `/dashboard/lawyer/letterhead` lands on the vault's branding tab.
  - A firm partner opening `/dashboard/firm/vault` is refused by the route guard.

### NOTE-09-C01 — upload the office's ready-made printed material (Word/PDF) and identity assets
- **Verdict:** partly fixed in code, waiting for deploy, SQL and acceptance. Upload, keep, replace, download and delete are real. Applying the files to outputs is **not** built.
- **Change:** built on the existing vault backend (20261026_63), which is real.
  - New table `branding_assets`, one file per kind per vault:
    - `letterhead_docx`, max 5 MB;
    - `letterhead_pdf`, max 5 MB;
    - `stamp`, PNG or WebP, max 1 MB;
    - `signature`, PNG or WebP, max 1 MB.
  - Storage is a new private bucket `branding-files`. It is separate on purpose: `_verify.sql` pins the logo bucket `branding` to 1 MB images.
  - Sessions can SELECT only their own vault's rows; every write is done by the server.
  - A trigger pins each object to the vault owner's folder; the negative control proves the trigger is load-bearing.
  - Route `/api/v1/branding/assets` (GET / POST / DELETE):
    - Order of checks: the explicit permission gate, then the vault read through RLS, then the service role.
    - It refuses a body over the Content-Length limit.
    - File type is sniffed from the bytes: a `.docx` must be a zip with `word/document.xml`, and one carrying `vbaProject.bin` (macros) is refused; a PDF must start with `%PDF-`; images must be PNG or WebP.
    - Downloads are 10-minute signed URLs with the original file name.
  - Account purge now also clears `u/<uid>/` in `branding-files`; a missing bucket counts as nothing to clear.
  - The panel says honestly that nothing is merged into the template, printed over the PDF, or stamped on outputs yet.
- **Not built** (it would be faking it to claim otherwise): merging documents into the uploaded `.docx` at export, printing over the PDF background with margins, placing the stamp and signature on outputs, the ZIP of executive requests, and SVG logos with server-side sanitizing.
- **Files:**
  - `supabase/migrations/20261030_10_branding_assets.sql`
  - `src/lib/branding/brandingAssets.ts`
  - `src/app/api/v1/branding/assets/route.ts`
  - `src/components/letterhead/BrandingAssetsPanel.tsx`
  - `src/lib/branding/brandingServer.ts` (`ensureOwnVault`)
  - `src/lib/accountDeletion/accountDeletionServer.ts`
- **Commits:** `1b5fb019`, `ccc96e72`
- **Tests:**
  - `brandingAssets.test.ts` (6): sniffing, paths, names, migration parity, route order.
  - `accountDeletionServer.test.ts` (+2).
  - The RLS harness: T0–T5 ALL PASS on postgres:16 with both migrations run twice, plus a recorded negative control.
- **Check live:**
  - After the SQL runs, upload each kind, replace one, delete one.
  - Make sure nginx `client_max_body_size` (6m, already required by the licence upload) covers `/api/v1/branding/assets`.
  - Before the SQL runs, the panel shows «يتطلب تحديث قاعدة البيانات» and every button is disabled.

### NOTE-09-C02 — AI identity-generation studio
- **Verdict:** not built here; it needs a later AI build.
- **Why:** it is a new AI tool (server-side OpenAI / Image API, three logo proposals, palette, layout, and debiting points). `src/lib/ai/*` and `src/app/ai/*` belong to another worker. Its 15–20 point price is the owner's suggestion and still needs his pricing confirmation.
- **Files, commit, tests:** none.

### NOTE-09-C03 — keep the ready-made templates separate from writing a letter
- **Verdict:** partly fixed in code.
- **Done:**
  - The never-saved «الخطاب» editor is removed. The page now only sets up the identity and prints.
  - The office's own ready-made stationery lives in its own section, «مطبوعات المكتب الجاهزة», separate from the identity editor.
  - The preview toggles between «بنص نموذجي باهت» (screen only) and «ورقة فارغة».
  - «طباعة الورق فارغاً / حفظ PDF» prints the blank sheet.
- **Not done:**
  - The five built-in visual presets (الملكي، التنفيذي، الكلاسيكي، البسيط، المرفوعة). They need design decisions and a stored layout column.
  - A «تحميل الورق فارغاً Word .docx» download. No docx-writing library is in `package.json`, and none was added; the blank PDF comes from the print dialog.
- **Files:** `src/components/letterhead/LetterheadWorkspace.tsx`
- **Commit:** `06d7d04d`
- **Tests:** `letterheadWiring.test.ts` checks that the letter fields are gone, the printed copy is `BlankBody`, and the sample text is preview-only.
- **Check live:** the print preview shows the header, the footer and the QR on an empty page, with no sample text.

### NOTE-09-C04 — remove the letter editor and connect the identity to the document tools
- **Verdict:** the removal is fixed in code. Connecting the identity to the tools is **open**.
- **Why open:** the tools that would adopt `LetterheadSheet` / `useLetterhead` are «الرأي الفصل» (`/ai/legal-opinion`), «الصائغ القانوني» (`/ai/draft`) and «محترف العقود» (`/ai/contracts`). All three are under `src/app/ai/*`, which is off limits, and contracts upload is excluded as well. The components are ready to adopt: `Letterhead.tsx` documents how, and print rights come from `permissions.print`. The page tells the user the tools do not apply the identity yet.
- **Commit:** `06d7d04d`
- **Check live:** the page no longer offers a letter editor; the «أين أكتب الخطاب؟» note is shown.

### NOTE-09-C05 and LAW-DETAIL-030 — the QR always points at the professional account
- **Verdict:**
  - Firm: fixed in code per ٣١٤.
  - Lawyer: unchanged, waiting for an owner decision (open question 1).
- **Firm (٣١٤):**
  - The QR carries the home page while no public firm page exists.
  - `FIRM_PUBLIC_PAGES_LIVE` (false) and `firmProfileUrl()` switch every firm letterhead to `/firms/<firm id>` with one constant.
  - A test pins the constant to `src/app/firms` existing, so it cannot be flipped before the page ships, and checks that a missing firm id never produces `/firms/undefined`.
  - The on-screen note cites ٣١٤.
- **Lawyer:**
  - A published lawyer (verified and visible) already gets his `/lawyers/<slug>` URL.
  - An unpublished or unverified lawyer still gets the home page, because `/lawyers/[slug]` 404s for him (the Q151 gate, which also guards against leaking names). Pointing paper at a 404 is worse.
  - Note 09 asks for a direct «بطاقة مهنية» that works even when `marketplace_visible = false`. That overrides the lawyer's own visibility switch and the beta privacy gate, so it is a question, not a code change.
- **Files:** `src/lib/branding/letterheadIdentity.ts`, `src/app/api/v1/branding/route.ts` (sends `firm.id`)
- **Commit:** `68acaea7`
- **Tests:** `letterheadIdentity.test.ts` (+1)
- **Check live:** scanning a firm letterhead's QR opens the home page, and the screen note says why.

### Owner answer ٣١٥ — only the firm owner, the managing partner and the office manager print firm letterhead
- **Verdict:** fixed in code, waiting for deploy and acceptance.
- **Change:**
  - `src/lib/branding/firmLetterheadPermissions.ts` defines **named** permissions, `letterhead.print` and `branding.manage`. Both are explicit grants to the firm owner, `managing_partner` and `office_admin`. These roles already exist; none was invented.
  - Server: `resolveBrandingCaller(scope, need)` checks `firmHas(firm, need)`. GET `/api/v1/branding` and GET `/assets` ask for `letterhead.print`; writes ask for `branding.manage`. The response carries `permissions: {print, manage}`.
  - UI: the print button and the print portal render only when `permissions.print`; the inputs lock without `manage`. The page contains no role names.
  - Database: the vault's RLS (`can_manage_branding_vault`) already names the same two roles. A test fails if the TypeScript grants, the SQL and the route rules drift apart.
- **Files:**
  - `src/lib/branding/firmLetterheadPermissions.ts`
  - `src/lib/branding/brandingServer.ts`
  - `src/app/api/v1/branding/route.ts`
  - `LetterheadWorkspace.tsx`
  - `useLetterhead.ts`
- **Commit:** `68acaea7`
- **Tests:** `firmLetterheadPermissions.test.ts` (5):
  - all 13 roles checked;
  - the roles are in the `firm_members` CHECK;
  - parity with 63's SQL and with both firm route rules;
  - the server asks for the permission by name.
- **Check live:** a firm partner calling `GET /api/v1/branding?scope=firm` gets 403 with «طباعة ورق المكتب المروّس لمالك المكتب والشريك المدير ومدير المكتب فقط»; the office manager prints.

### CODE-F37 — fields stayed editable while saving and the reply overwrote them
- **Verdict:** fixed in code, waiting for deploy and acceptance. Per the package, a source test is not acceptance.
- **Change:**
  - `identityInputsLocked()` disables every identity input, the colour picker, the «ذهبي المنصة» reset and the logo buttons while `saveState === "saving"`.
  - `setField` refuses edits while locked.
  - Adopting the server's normalised fields on success can therefore no longer wipe newer typing.
- **Files:** `src/components/letterhead/letterheadFormLock.ts`, `LetterheadWorkspace.tsx`
- **Commit:** `06d7d04d`
- **Tests:** `letterheadWiring.test.ts` checks the lock states and that every identity input, the reset and both logo buttons carry `disabled={locked}`.
- **Check live:** throttle the network, press «حفظ الهوية», and try to type: the fields are greyed out until «حُفظت».

## SQL for the user (never run by this branch)

1. **`supabase/migrations/20261030_10_branding_assets.sql`**
   - Worktree path: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.claude\worktrees\agent-a63b2b2bfdaa23198\supabase\migrations\20261030_10_branding_assets.sql`
   - Path after merge: `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\supabase\migrations\20261030_10_branding_assets.sql`
   - Run it in the SQL editor (postgres), after 20261026_63, before or after the deploy. Before it runs, the code shows «يتطلب تحديث قاعدة البيانات».
   - If the editor role may not write `storage.buckets`, the file warns. Then create the private bucket `branding-files` (5 MB; pdf, docx, png, webp) as `supabase_admin`.
   - SELECT check (expect one row `t | t | t | 1 | t`):
     ```sql
     select to_regclass('public.branding_assets') is not null              as table_exists,
            (select relrowsecurity from pg_class
              where oid = 'public.branding_assets'::regclass)              as rls_on,
            not has_table_privilege('authenticated', 'public.branding_assets', 'INSERT')
              and not has_table_privilege('authenticated', 'public.branding_assets', 'UPDATE')
              and not has_table_privilege('authenticated', 'public.branding_assets', 'DELETE') as sessions_read_only,
            (select count(*) from pg_policy
              where polrelid = 'public.branding_assets'::regclass)         as policies,
            exists (select 1 from storage.buckets
                     where id = 'branding-files' and public = false
                       and file_size_limit = 5242880)                       as private_bucket;
     ```
   - `_verify.sql` was not edited (new SQL only goes in new migration files), so it does not check 30_10 yet. The block for it is the harness test `supabase/tests/rls/branding_assets.test.sql`.

## Navigation files touched (reconcile at merge — another worker owns navigation)

All three edits are in `src/constants/navigation.sidebars.legal.ts`.

- **Lawyer sidebar (`LAWYER_SIDEBAR`, «العقود والمستندات»):** the row `{ label: "الورق المروّس", … href: "/dashboard/lawyer/letterhead" }` and its comment are **deleted**.
- **Lawyer sidebar, same group:** the row `{ label: "الخزنة", labelEn: "The Vault", href: "/ai/vault", icon: "Vault", badge: "قريباً" }` becomes `{ label: "الخزنة", labelEn: "The Vault", href: "/dashboard/lawyer/vault", icon: "Vault" }`, with no badge.
- **Firm sidebar (`FIRM_SIDEBAR`, «العقود»):** `{ label: "الورق المروّس", labelEn: "Letterhead", href: "/dashboard/firm/letterhead", icon: "Stamp" }` becomes `{ label: "الخزنة", labelEn: "Letterhead", href: "/dashboard/firm/vault?tab=branding", icon: "Vault" }`.
  - `labelEn` is deliberately kept as `"Letterhead"`: `navigation.sidebars.ts` filters firm items by `labelEn` (office_admin's list holds `"Letterhead"`), and `entityRouteAccess.test.ts` greps for it.
  - At merge, rename it to `"The Vault"` in **both** files together, along with that test's regex.

Also touched: `src/constants/entityRouteAccess.ts`, one line adding the `/dashboard/firm/vault` rule. The existing `/dashboard/firm/letterhead` rule is kept so the redirect path stays guarded.

Not touched, but now inconsistent, so worth reconciling:
- the «خدمات متقدمة → الخزنة القانونية · قريباً» rows in both sidebars (→ `/services/lawyers/vault`, the marketing page);
- `/ai/vault` («قريباً», for client and corporate accounts too), which belongs to the AI worker;
- the Settings shortcut «الإعدادات ← هوية ومطبوعات المكتب» asked for in note 09 §٤ (not built).

## Tests

- Unit (`node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test "src/**/*.test.ts"`): final run on the branch tip gave 4184 tests, 4176 pass, 8 fail. None of the 8 is caused by this branch.
  - **7 fail identically at the base `235e1bef`.** They were re-run with the base commit checked out (detached), then the branch was restored:
    - `src/lib/payments/fulfillOrder.test.ts`: «grantPurchase keys every grant on the order».
    - `src/lib/tracking/trackingWiring.test.ts` ×2: «no v1 fallback …» and «the insert and revoke policies … maker rule».
    - `src/app/api/library/books/[slug]/_shape.test.ts`: «the volume series (T28-24)».
    - `src/lib/libraryAccess.test.ts`: «the end read takes the latest ends_at …».
    - `src/constants/navigation.consultant.test.ts`: «the lawyer dashboard hides the hearings and deadlines cards …». It reads `src/app/dashboard/lawyer/page.tsx`, which this branch did not touch. The test does import `navigation.sidebars.legal.ts`, which this branch edited, but it fails the same way at the base.
    - `src/lib/ai/aiFiles.test.ts`: `pdf-lib` is not installed in the shared `node_modules`.
  - **1 is flaky.** `src/lib/ai/runCore.test.ts`, «the start call carries the price, the limit and the deadline». It failed once in the full run, then passed 20/20 twice when run alone. The file is untouched and owned by the AI worker.
  - **New tests: 19.**
    - `firmLetterheadPermissions`: 5
    - `brandingAssets`: 6
    - `letterheadWiring`: +4 (with the `key` pin)
    - `letterheadIdentity`: +1
    - `accountDeletionServer`: +2
- `npx tsc --noEmit`, re-run on the tip: clean, except the pre-existing `pdf-lib` "cannot find module" in `src/lib/ai/aiFiles*.ts`.
- RLS harness (Docker, postgres:16-alpine; run.sh's steps done by hand): `supabase/tests/rls/branding_assets.test.sql` ALL PASS (T0–T5), with 63 and 30_10 each run twice.
  - The first run caught a plpgsql syntax error, fixed in `ccc96e72`.
  - The migration header's SELECT check returned `t | t | t | 1 | t`.
  - Negative control: with the guard trigger dropped, a foreign-folder row is accepted.
- ESLint on the touched folders: 0 errors. 4 `set-state-in-effect` warnings, all in the same load-in-effect pattern the files already used.

## Touched outside my area (reconcile with the owner of auth / account deletion)

- **`src/lib/accountDeletion/accountDeletionServer.ts`** (commit `1b5fb019`). The account purge now also clears `u/<uid>/` in the new `branding-files` bucket; a missing bucket counts as nothing to clear. Without this, a deleted lawyer's uploaded letterhead, stamp and signature would stay in storage.
  - The file sits next to the off-limits auth area: it imports `src/lib/auth/accountFreeze.ts`.
  - It is pinned by `src/lib/auth/accountFreezeGates.test.ts`, which this branch did **not** edit. That pin still passes, because the code keeps one `.list(` call site and the literal `admin.storage.from(BRANDING_BUCKET)`.
  - But the pin's comment («The one listing is the branding bucket's u/<id>/ folder») and its `lists.length === 1` assertion now under-describe the behaviour: the same listing helper runs over two buckets. The auth owner should update that comment and assertion.
  - **Fallback if the owner objects:** revert only the purge part of `1b5fb019`, that is, `accountDeletionServer.ts` and its two new tests. Orphaned stationery files on account deletion then become an open item.
- **`src/lib/branding/brandingServer.ts`**: `resolveBrandingCaller` gained a second parameter, which defaults to the old behaviour for the logo route.
- **GitNexus index:** stale for these files. It was not re-analyzed from this worktree.

## Open questions for the owner

1. **QR of an unpublished lawyer (C05 / LAW-DETAIL-030).** Note 09 wants a direct business-card page that works even when the lawyer turned off «الظهور في السوق», but today `/lawyers/[slug]` is a 404 unless he is verified **and** visible (Q151, built so that no name leaks). Choose one:
   - (a) a direct card for verified lawyers even when hidden from search;
   - (b) also for unverified lawyers, with no «موثّق» mark;
   - (c) keep the home page until he publishes.
2. **Should `letterhead.print` be grantable or revocable per member?** ٣١٥ fixes it to three roles, which is what was built. `firm_members.permissions text[]` exists but is unused.
3. **Applying the uploaded Word, PDF, stamp and signature to outputs**, and the identity in Drafter, Legal Opinion and Contracts (C01 rest, C04): needs the AI-tools owner. In what order?
4. **The AI identity studio (C02):** confirm the point price before the AI build.
5. **Five built-in letterhead presets (C03 rest) and SVG logos:** confirm the designs, and whether an SVG logo (sanitised on the server) is still wanted given the 1 MB image-only logo bucket that `_verify` pins.
