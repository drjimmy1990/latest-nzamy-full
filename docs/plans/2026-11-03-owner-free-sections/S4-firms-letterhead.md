# S4: Firms, firm finance and letterhead (gap analysis Wave 5)

**Spec:** `docs/audits/2026-11-02-owner-package/F-firms-cases-murshid.md` (slice F, rows q338–q356, §3 Risks, §4 batches F2–F5) and the owner's guide §7 items 1–3 (`00_الدليل_الشامل_المنقح_للمبرمج_٢٠٢٦-١١-٠١.md` lines 259–268).

**Base:** worktree `D:\nzwt\ownerfree`, branch `batch/2026-11-03-owner-free`, HEAD `1103812d`. Every file:line below was re-read at that HEAD on 2026-11-03.

**Migrations used:** `20261103_60` … `20261103_69`. `70`–`79` are kept free.

**Rules:** the planner rules in `00-planner-rules.md` apply. Each migration task ends with a SELECT whose `ok` is never NULL, adds a `-- >>> verify:<name>` block to `supabase/migrations/_verify.sql`, and has a Docker test that runs the migration TWICE.

**Shared files:** `supabase/migrations/_verify.sql`. Every migration task here appends a block to it, and so do other sections; the controller sequences the appends. No task edits `runCore.ts`, `tools.ts`, intake validators, `proxy.ts`, `routeAccess.ts` or navigation files.

**GitNexus impact first (project CLAUDE.md):** before editing, run `impact({target, direction:"upstream"})` on these symbols and report the blast radius:
- `resolveCallerFirm` and `firmHas` (Task 7);
- `resolveBrandingCaller` and `readOwnVault` (Task 9);
- `sessionResponseFor` (Task 12);
- `parseCreateBody`, `parseCollectBody` and the `POST`/`PATCH` of `src/app/api/v1/lawyer/finance/route.ts` (Tasks 15, 17, 20);
- `qrTargetFor` (Task 23);
- `pleadingWordHtml` (Task 27).

A HIGH or CRITICAL result is a warning to the user before the edit.

---

## 0. Facts checked at HEAD (they shape the design)

| # | Fact | Evidence |
|---|---|---|
| F-1 | A firm OWNER is a `firm` account (`firm_profiles.owner_user_id`). A firm MEMBER is a `lawyer` account with an active `firm_members` row. The owner also has a `managing_partner` member row (`ensure_firm_owner_membership`). | `src/lib/auth/firmMembershipAccess.ts:22-66`; `src/proxy.ts:806-832`; `20260903_phase2:249-266` |
| F-2 | `firm_members` RLS is the flat 2026-09-21 matrix. Every cross-table test goes through `is_active_firm_member()` / `is_firm_owner()` (SECURITY DEFINER). Sessions cannot DELETE member rows. | `20260921_03:248-302`; `20261016_02:49-130` |
| F-3 | `firm_members.permissions text[] default '{}'` exists (20260603_phase1_002:131). Nothing in `src/` or SQL reads or writes it. **It stays dormant; this section never reads it.** | grep of `src/` and `supabase/migrations` |
| F-4 | Firm cases are `service_requests` rows with `firm_id`; the lead is `service_requests.assigned_to`. Today every active firm member reads every firm case (owner question ٤٢٨ is still open, so visibility is NOT changed here). | `20260903_phase1_case_tables.sql:110-130` (`can_access_case_row`); `20261017_41:18-27` |
| F-5 | `trg_service_requests_consultation_update` fires AFTER UPDATE OF `assigned_to` and moves `consultations.lawyer_user_id`. | `20260905_phase3:225-237` |
| F-6 | Branding: the vault RLS and the `branding_assets` RLS both use `can_manage_branding_vault` (owner, managing_partner, office_admin). The TS gate `firmHas()` mirrors it; `firmLetterheadPermissions.test.ts` reads the SQL role list. A print grantee outside those roles would read **0 vault rows through RLS** and print a blank identity with no error. | `20261026_63:115-139`; `20261030_14:146-151`; `src/lib/branding/brandingServer.ts:53-93,117-129`; `firmLetterheadPermissions.ts:38-41` |
| F-7 | Invoices: `create_lawyer_invoice` and `record_invoice_collection` both require `service_requests.assigned_to = p_actor`. `invoice_collections` SELECT policy is `sr.assigned_to = auth.uid()`. CHECKs: `amount > 0`, `paid_after > 0`. | `20261030_20:31-48,123`; `20261030_10:89-126,190-196` |
| F-8 | `lawyer_clients.client_type CHECK in ('individual','company')`. The same pair is checked at `src/app/api/v1/lawyer/clients/route.ts:379`, `src/app/api/v1/lawyer/finance/route.ts:81` and `20261030_20:123`. `lawyer_clients` has no column grants (table-level privileges), so new columns need no grant. | `20260903_phase2:134-140` |
| F-9 | `/dashboard/firm/finance/page.tsx` (mock, «Mock Data» line 13), `/dashboard/firm/cases/assign/page.tsx` (mock, line 15) and `/dashboard/firm/team/roles/page.tsx` (mock toggles) are not real. `/dashboard/firm/team/[id]/page.tsx` is real. | the files |
| F-10 | The login destination is `getDashboardRoute(userType)` only: already signed in `src/app/login/page.tsx:194-198`; after the handshake `:308-310`. The handshake body is `sessionResponseFor()` (`src/lib/auth/sessionResponse.ts`), `{ userId, userType }`. The proxy already admits a lawyer with an ACCEPTED firm membership to `/dashboard/firm` (`src/proxy.ts:806-860`, `entityMembershipKindForPath`). | the files |
| F-11 | Libraries: `fflate 0.8.3` and `qrcode` are direct dependencies; `pdf-lib` and `jspdf` cannot shape Arabic (`src/lib/services/letterExport.ts:24-31`). There is **no docx library**. `dompurify` is only an override (transitive, via jspdf). `sharp` is a devDependency (`npm ls dompurify sharp`). | `package.json:55-107` |
| F-12 | Real AI outputs that need letterhead export: the drafter `src/components/draft/steps/StepAiDraft.tsx:96-101,299-310` (today an HTML `.doc`); legal opinion `src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx:146-168` (consult answer and letter, via `AiResultActions` = `.txt`); contracts `src/app/ai/contract-drafter/_components/StepContractResult.tsx` (L11). **Not wired, because they render mock or dead content:** `ResultView.tsx:12,233-240` (`MOCK_RESULT`), `LetterWorkflow.tsx:946-952` (buttons without onClick, replaced by the step-4 AI panel), `src/components/contracts/steps/draft/StepApproval.tsx:103-112` and `src/components/draft/steps/StepDrafting.tsx:603-609` (no onClick). | the files |
| F-13 | The letterhead print pipeline exists: `LetterheadSheet` (`src/components/letterhead/Letterhead.tsx`) and the portal-to-`<body>` print root in `LetterheadWorkspace.tsx:58-67,414`. | the files |
| F-14 | `20261030_12` defines `note_original_author_pin()` and `firm_court_rows_stay_with_member()` with `create or replace`. Re-running 12 after this section's 60/62 silently undoes them. | `20261030_12:104-121,184-205` |

## 1. Design decisions (no owner answer needed)

1. **Permission model:** a new table `public.firm_member_permissions` holds **overrides only**. A row is `allow` or `deny`; no row means "role default".
   - Effective permission = the firm owner always; otherwise an ACTIVE member AND (`allow` row OR (role default AND no `deny` row)).
   - Role defaults live in one SQL function, mirrored in TS. A drift test reads the SQL.
   - Only the firm owner (the `firm` account) writes overrides, through one RPC.
2. **Permission names:** `letterhead.print`, `case.assign`, `finance.bill`, `finance.reverse`. `branding.manage` stays role-only (unchanged; q344 asks only about print).

   Role defaults:

   | permission | owner | role defaults |
   |---|---|---|
   | `letterhead.print` | yes | `managing_partner`, `office_admin` (owner ٣١٥, unchanged) |
   | `case.assign` | yes | `managing_partner`, `partner` |
   | `finance.bill` | yes | `managing_partner`, `finance_manager` (q356 «الشريك المدير/المالي») |
   | `finance.reverse` | yes | `managing_partner`, `finance_manager` |

   The roles all exist in the `firm_members.role` CHECK (`20260603_phase1_002:123-128`).
3. **No RLS change on an existing table** anywhere in this section. Three places use this rule:
   - **The print grantee (q344)** reads the vault through a new SECURITY DEFINER RPC that re-checks the permission in SQL.
   - **Firm invoices and collections (q356)** are read by `/api/v1/firm/*` routes with the service role, only after the SQL permission check returns true.
   - **The verification-card switch (q343)** is a server-written column, so no column grant changes.
4. **SVG logos (q346)** are rasterised IN THE BROWSER into a PNG before upload:
   - no SVG is ever stored or served;
   - the bucket MIME list, the `logo_path` CHECK and the server's magic-byte sniff stay unchanged;
   - the DOCX gets the PNG it needs anyway;
   - no new dependency.
5. **The .docx export (q345)** is a hand-written OOXML package zipped with `fflate` (already a direct dependency). There are two paths:
   - with the office's uploaded `letterhead_docx`: unzip it, replace the `<w:body>` content before the final `<w:sectPr>`, and zip it again (its header and footer survive);
   - without one: a generated package whose header and footer carry the vault identity, the logo PNG and the QR PNG.

   PDF goes through the browser print pipeline (`LetterheadSheet`), labelled «طباعة / حفظ PDF». The uploaded PDF letterhead is not overlaid (pdf-lib cannot shape Arabic), and the screen says so.
6. **Client types (q349):** the stored value `company` stays and is shown as «منشأة تجارية». `government` («جهة حكومية») and `nonprofit` («جهة غير ربحية / وقف») are added. No existing row changes, so the "how to map company" question never arises.
7. **Case assignment (q350)** changes `service_requests.assigned_to`, and `cases.assigned_user_id` when a `cases` row exists.
   - **Never moved:** hearing, stage, deadline and task owners.
   - **Never changed:** firm-wide visibility, because of ٤٢٨. Every active member still reads every firm case.
   - **Follow the lead, by design of existing code:**
     - case-team note access (`case_team_user_ids` includes `assigned_to`, `20261017_41:18-27`);
     - the right to collect on the case's existing invoices (`record_invoice_collection` checks `assigned_to`);
     - the case chat room (`trg_chat_drop_previous_assignee`, `20261016_03:320-327`);
     - a consultation's lawyer (F-5).

     The assign screen says this in one line before confirming.
   - The write passes `trg_00_service_requests_session_guard` (`20261018_04`) because the RPC is called with the service role.
   - **Never assigned:** consultation requests (they have their own flow, F-5).
   - **Refused (Art. 18):** a consultant member on a case that has any hearing or case stage.
8. **Reversal (q355):** a separate append-only table, `invoice_collection_reversals`.
   - At most one reversal per collection, always for the full amount.
   - It needs a reason of 5–500 characters, and records the actor.
   - It subtracts the amount from `metadata.paidAmount`, and a `paid` invoice goes back to `requires_payment`.
   - No time limit: the owner gave none.
   - The original row is never updated or deleted.
9. **The verification card (q343)** is for lawyers only; firms stay on ٣١٤ (home page).
   - Each vault gets a random 32-character base32 token, written only by the server. It is never the user id.
   - A public `no-store` page shows the name, the licence number and «موثّق» only.
   - The switch defaults ON (the owner's choice), with an opt-out from day one. When it is off, or the token is unknown, the page sends the visitor to the home page, so printed paper never shows a 404 and a token reveals nothing.

## 2. Deploy order

| Migration | What | Run | Code that survives the other order |
|---|---|---|---|
| `20261103_60_note_author_name.sql` | q340 snapshot | BEFORE deploy | routes select the new column only through a fallback (42703 → old query) |
| `20261103_61_inherited_court_rows_delete_guard.sql` | q341 | EITHER | no code reads it; DELETE routes map 42501 |
| `20261103_62_firm_office_kind.sql` | q339 | BEFORE deploy (signup sends `office_kind`) | metadata key ignored when the trigger is absent |
| `20261103_63_firm_member_permissions.sql` | F3 base | BEFORE deploy | TS treats 42P01/PGRST205 as "no overrides" (role defaults) |
| `20261103_64_firm_letterhead_print_kit.sql` | q344 | BEFORE deploy | route falls back to the RLS read (today's behaviour) on PGRST202 |
| `20261103_65_assign_firm_case.sql` | q350 | BEFORE deploy | route answers 503 «يتطلب تحديث قاعدة البيانات» |
| `20261103_66_client_types.sql` | q349 | BEFORE deploy | route maps 23514 to «يتطلب تحديث قاعدة البيانات»; sends rep fields only when non-null |
| `20261103_67_firm_billing.sql` | q356 | BEFORE deploy, AFTER 66 | firm routes answer 503 on PGRST202 |
| `20261103_68_invoice_reversal.sql` | q355 | BEFORE deploy | reverse route answers 503 |
| `20261103_69_letterhead_verify_card.sql` | q343 | BEFORE deploy | branding route skips the card when the columns are missing (42703) |

**Re-run chains (in each header and in `_verify.sql`):**
- re-running `20261030_12` must be followed by `60` and `62`;
- re-running `20261030_20` must be followed by `66`, then `67`;
- re-running `20261030_10` must be followed by `67`.

---

## F2 — small SQL guards

### Task 1: q340 — keep the note author's name (SQL)

**Files:**
- create `supabase/migrations/20261103_60_note_author_name.sql`;
- create `supabase/tests/rls/note_author_name.test.sql`;
- modify `supabase/migrations/_verify.sql` (append block `verify:note_author_name`).

**Interfaces:**
- **Consumes:** `public.note_original_author_pin()` (20261030_12:104-121), `trg_note_original_author` on `case_notes`, `dashboard_notes`, `lawyer_client_notes` and `consultation_notes`.
- **Produces:**
  - a column `original_author_name text NULL` on the four tables;
  - `public.note_author_display_name(p_user uuid) returns text`: SECURITY DEFINER, `search_path ''`, EXECUTE revoked from PUBLIC/anon/authenticated. It reads `profiles.display_name` and returns NULL when the profile is missing or the name is blank.
  - `note_original_author_pin()` replaced IN PLACE (same signature, still `returns trigger`):
    - **INSERT:** `original_author_id := author_user_id`; `original_author_name := note_author_display_name(author_user_id)`.
    - **UPDATE:** `original_author_id` as before; `original_author_name := coalesce(note_author_display_name(original_author_id), old.original_author_name)`. Every update re-snapshots while the profile exists, which covers the moment of the transfer or removal; once the profile is purged, the last name is kept.

**Steps:**
- [ ] **Failing test.** Write `note_author_name.test.sql`.
  - Chain: the chain in the header of `supabase/tests/rls/accounts_firms_owner_answers.test.sql`, then `$M/20261103_60_note_author_name.sql` twice.
  - Assertions (each RAISEs on failure):
    - **T1:** profile A has `display_name 'سارة العتيبي'`. A inserts a `case_notes` row → `original_author_name = 'سارة العتيبي'`.
    - **T2:** `transfer_firm_assets` moves the note to owner O → `author_user_id = O`, `original_author_id = A`, `original_author_name = 'سارة العتيبي'`.
    - **T3:** `delete from profiles where id = A` (cascade as the purge does), then any UPDATE of the note body → `original_author_name` is still `'سارة العتيبي'`.
    - **T4:** a session update that sets `original_author_name = 'x'` is overwritten → still `'سارة العتيبي'`.
    - **T5:** the same as T1 on `dashboard_notes`, `lawyer_client_notes` and `consultation_notes` (3 asserts).
    - **T6:** the backfill gives existing rows the name from `profiles` of `original_author_id`. The note tables' `updated_at` does not change (compare before and after).
  - **Negative control (must FAIL):** chain `… 60, 20261030_12` (12 re-run after 60). T1 must fail with "original_author_name is null".
- [ ] **Run:** `T=supabase/tests/rls; M=supabase/migrations; bash $T/run.sh <chain> $M/20261103_60_note_author_name.sql $M/20261103_60_note_author_name.sql $T/note_author_name.test.sql` → it fails (the column is missing).
- [ ] **Code** (the migration):
  - `begin; set local lock_timeout='5s';`
  - prerequisite check: `20261030_12` ran (`to_regprocedure('public.note_original_author_pin()')`);
  - add the column on each existing table (loop as in `20261030_12:126-178`);
  - the backfill, with that table's enabled triggers disabled and re-enabled exactly as 12 does;
  - `create or replace` both functions;
  - a comment saying "re-run after any re-run of 20261030_12";
  - a raising verify;
  - `commit; notify pgrst, 'reload schema';`
  - the final SELECT: one row per table, `ok = coalesce(column exists and trigger exists and (select count(*) … where original_author_name is null and exists (select 1 from profiles p where p.id = original_author_id)) = 0, false)`.
- [ ] **Verify:** the run command passes; the negative control fails; the `_verify.sql` block passes in the same chain.
- [ ] **Commit:** `feat(firms): keep the note author's name for «كتبها» (q340) — 20261103_60`

### Task 2: q340 — show «كتبها: فلان» from the original author

**Files:**
- modify `src/app/api/v1/cases/[id]/notes/_shared.ts` (lines 60-110: `toCaseNoteDto`, `hydrateAuthorNames`);
- modify `src/app/api/v1/cases/[id]/timeline/route.ts` (lines 52-80);
- modify `src/app/api/v1/lawyer/consultations/[id]/notes/route.ts` (lines 21-57, 88);
- modify the client-note and dashboard-note readers. Find them with `grep -rln "lawyer_client_notes\|dashboard_notes" src/app/api`.
- create `src/lib/notes/noteAuthor.ts` and `noteAuthor.test.ts`.

**Interfaces:**
- **Produces:** `export function noteAuthorLabel(row: { author_user_id: string; original_author_id?: string | null; original_author_name?: string | null }, uid: string, liveNames: Map<string, string>): { name: string; known: boolean; transferred: boolean }`.
- **Rules:**
  - the author is `original_author_id ?? author_user_id`;
  - the name comes from `liveNames` (looked up by that id), else `original_author_name`, else «أنت» when the id is the caller, else «محامٍ»;
  - `transferred` is `original_author_id && original_author_id !== author_user_id`.
- `hydrateAuthorNames` looks up `original_author_id ?? author_user_id`.
- The select lists add `original_author_id, original_author_name`. On a 42703 (the SQL has not run) the query is retried once without them. That fallback is a helper, `selectWithOptionalColumns(query builder factory, base, optional)`, in the same file.

**Steps:**
- [ ] **Failing test** `noteAuthor.test.ts`:
  - **"names the original author after a transfer":** row `{author_user_id:'O', original_author_id:'A', original_author_name:'سارة'}` with empty liveNames → `{name:'سارة', known:true, transferred:true}`.
  - **"live name wins over the snapshot":** liveNames `A → 'سارة ع.'` → `name:'سارة ع.'`.
  - **"own note":** `{author_user_id:'U'}` with uid `'U'` → `{name:'أنت', known:false, transferred:false}`.
  - **"purged colleague with no snapshot":** `{author_user_id:'O', original_author_id:'A', original_author_name:null}` → `{name:'محامٍ', known:false, transferred:true}`.
  - **A source test:** the three route files contain `original_author_id` and none contains `names.get(n.author_user_id)` any more.
- [ ] **Run:** `node --test src/lib/notes/noteAuthor.test.ts` → it fails (the module is missing).
- [ ] **Code:**
  - write `noteAuthorLabel`, and use it in the 3+ readers;
  - the DTO keeps `authorName` and `authorNameKnown`, and adds `authorTransferred: boolean`;
  - the UI shows «كتبها: {name}» when `authorTransferred` (the case notes panel; find it with `grep -rln "authorNameKnown" src/components src/app`);
  - `mine` stays `author_user_id === uid` (edit rights are unchanged).
- [ ] **Verify:** `npm run test:unit` (only the 6 known CRLF failures); then the build command from the rules.
- [ ] **Commit:** `feat(firms): notes show the original author after a transfer (q340)`

### Task 3: q341 — block deleting inherited court rows (SQL)

**Files:**
- create `supabase/migrations/20261103_61_inherited_court_rows_delete_guard.sql`;
- create `supabase/tests/rls/inherited_court_rows_delete_guard.test.sql`;
- `_verify.sql` (block `verify:inherited_court_rows_delete_guard`).

**Interfaces:**
- **Consumes:** `public.refuse_consultant_court_rows()` and its writer rule (20261019_21:21-80): who is writing; cascade passes; contract deadlines pass; `is_admin()` passes.
- **Produces:**
  - `public.refuse_consultant_court_row_delete() returns trigger`, SECURITY DEFINER, `search_path ''`;
  - `trg_00_refuse_consultant_court_row_delete`, BEFORE DELETE FOR EACH ROW on `public.hearings`, `public.case_stages` and `public.deadlines`.
- **The rule mirrors the update guard:**
  - **Passes:**
    - roles `postgres`, `service_role`, `supabase_admin` and `supabase_auth_admin` (read from the `role` setting, else `session_user`, exactly as 20261019_21 does);
    - `pg_trigger_depth() > 1` (an FK ON DELETE CASCADE from a deleted `service_requests`, `profiles` or firm);
    - `deadlines.kind = 'contract'`;
    - `public.is_admin()`.
  - **Refused:** 42501 with `CONSULTANT_BLOCKED_MESSAGE` when the caller (`auth.uid()`) or `OLD.owner_user_id` is a consultant. "Consultant" here means `public.is_court_restricted_user(uuid)` (Task 4). Until Task 4 lands, the function reads `lawyer_profiles.practice_kind = 'consultant'` inline; Task 4 replaces it in place.
  - `return old` when allowed.

**Steps:**
- [ ] **Failing test.**
  - Chain: the chain in the header of `consultant_court_write_guard.test.sql`, then `20261030_12`'s prerequisites (as in `accounts_firms_owner_answers.test.sql`), then 61 twice.
  - Asserts:
    - **T1:** consultant C deletes his own hearing through the session → SQLSTATE 42501 and the row remains.
    - **T2:** C deletes his `case_stages` row → 42501.
    - **T3:** C deletes his own `deadlines` row with `kind='contract'` → it succeeds.
    - **T4:** advocate L deletes his own hearing → it succeeds.
    - **T5:** the consulting firm's owner O (after a member's account deletion moved rows to O) deletes an inherited hearing → 42501.
    - **T6:** `delete from service_requests where id = <case of C>` as `service_role` → it succeeds and the hearing rows cascade away.
    - **T6b:** the same DELETE from C's own session and from the consulting owner's session → 0 rows deleted, and the hearings remain. At HEAD no DELETE policy exists on `service_requests` or `firm_profiles` for sessions (grep `for delete` in `supabase/migrations`), so the cascade arm cannot be reached from a session.
      - If T6b ever fails because a later migration adds such a policy, this task's known limit is that a parent delete bypasses the guard. The fix is then a guard on the parent delete, not here.
    - **T7:** an account purge of C through the 20261026_70 path (as `supabase_auth_admin`) → it succeeds.
    - **T8:** `transfer_firm_assets` (member removed) still passes (the 20261030_12 T3 scenario).
    - **T9:** a platform admin session deletes C's hearing → it succeeds.
  - **Negative control:** remove the `pg_trigger_depth() > 1` arm → T6 must FAIL.
- [ ] **Run:** `bash $T/run.sh <chain> $M/20261103_61_….sql $M/20261103_61_….sql $T/inherited_court_rows_delete_guard.test.sql` → it fails.
- [ ] **Code:** the migration:
  - a prerequisite check (`refuse_consultant_court_rows` exists);
  - the function and three `drop trigger if exists` / `create trigger`;
  - EXECUTE revoked from PUBLIC, anon and authenticated;
  - a verify block (3 triggers present, function SECURITY DEFINER with `search_path=""`);
  - the final SELECT: `select t.tbl, exists(trigger) as ok from (values ('hearings'),('case_stages'),('deadlines')) t(tbl)`, with `ok` coalesced to false.
- [ ] **Code:** the DELETE handlers of the hearings, case-stages and deadlines routes map 42501 to 403 `{ error: CONSULTANT_BLOCKED_MESSAGE }`. Find them with `grep -rn "export async function DELETE" src/app/api/v1/lawyer/hearings src/app/api/v1/lawyer/case-stages src/app/api/v1/lawyer/deadlines`; reuse `dbErrorResponse` if it already maps 42501. A wiring unit test asserts each DELETE handler file references `CONSULTANT_BLOCKED_MESSAGE` or `dbErrorResponse`.
- [ ] **Verify:** Docker passes, the negative control fails, `npm run test:unit`.
- [ ] **Commit:** `feat(firms): inherited court rows cannot be deleted by a consulting office (q341) — 20261103_61`

### Task 4: q339 — the m18 office kind (SQL)

**Files:**
- create `supabase/migrations/20261103_62_firm_office_kind.sql`;
- create `supabase/tests/rls/firm_office_kind.test.sql`;
- `_verify.sql` (block `verify:firm_office_kind`).

**Interfaces:**
- **Produces:**
  - **The column.** `firm_profiles.office_kind text NULL CHECK (office_kind in ('law_firm','consulting_m18'))`. The backfill sets `consulting_m18` where the owner's `lawyer_profiles.practice_kind = 'consultant'`, and `law_firm` otherwise. The backfill runs with the table's user triggers disabled and re-enabled.
  - **The signup trigger.** `public.firm_profile_office_kind_from_signup()`: BEFORE INSERT on `firm_profiles`, SECURITY DEFINER. Its pattern is `20261019_20:125-172` (`lawyer_profile_from_signup`). It reads `auth.users.raw_user_meta_data->>'office_kind'` for `NEW.owner_user_id` and sets `NEW.office_kind` only when that value is exactly `'consulting_m18'`. Otherwise it uses `coalesce(NEW.office_kind, 'law_firm')`. `handle_new_user` is NOT touched.
  - **The lock.** `public.firm_profile_office_kind_lock()`: BEFORE UPDATE OF `office_kind` on `firm_profiles`. A change passes only for the privileged roles (same detection as 20261019_21) or `public.is_admin()`. Otherwise it raises 42501 «نوع المكتب تحدده الإدارة». The lock is needed because an owner who could flip `consulting_m18` → `law_firm` could unlock inherited court rows.
  - **The shared test.** `public.is_court_restricted_user(p_user uuid) returns boolean`, SECURITY DEFINER, `search_path ''`. It is true when the user's `practice_kind = 'consultant'` OR the user owns a firm with `office_kind = 'consulting_m18'`.
  - **Replaced in place, same signatures:**
    - `firm_court_rows_stay_with_member(p_firm)` (20261030_12:184-205) now reads `office_kind = 'consulting_m18'`, falling back to the old owner `practice_kind` test when `office_kind` is null;
    - `refuse_consultant_court_rows()` (20261019_21) and `refuse_consultant_court_row_delete()` (Task 3) now call `is_court_restricted_user()` for the caller and the row owner.

    Both bodies are copied verbatim from HEAD, with only that test changed.

**Steps:**
- [ ] **Failing test** `firm_office_kind.test.sql`:
  - Chain: the `accounts_firms_owner_answers` chain, then 61, then 62 twice.
  - Asserts:
    - **T1:** a signup with metadata `{"user_type":"firm","office_kind":"consulting_m18"}` → `firm_profiles.office_kind = 'consulting_m18'`.
    - **T2:** a signup with `{"office_kind":"evil"}` → `'law_firm'`.
    - **T3:** the owner session runs `update firm_profiles set office_kind='law_firm'` → 42501.
    - **T4:** an admin session changes it → it succeeds.
    - **T5:** a member is removed from a `consulting_m18` firm whose owner is a FIRM account → the member keeps his hearing (`owner_user_id` unchanged).
    - **T6:** after an account deletion moved rows to the firm-account owner of a `consulting_m18` firm, the owner's UPDATE of the hearing → 42501, and his DELETE → 42501.
    - **T7:** the backfill: a firm whose owner is a consultant lawyer → `consulting_m18`.
  - **Negative control:** chain `… 62, 20261030_12` → T5 must FAIL.
- [ ] **Run:** the run.sh command → it fails.
- [ ] **Code:** the migration as specified:
  - `lock_timeout 5s`;
  - EXECUTE on `is_court_restricted_user` granted to authenticated and service_role only;
  - a raising verify;
  - the final SELECT: `ok = coalesce((select count(*) from firm_profiles where office_kind is null) = 0 and <3 triggers exist>, false)`.
- [ ] **Verify:** Docker and the negative control; re-run Task 3's test with 62 in the chain (it must still pass).
- [ ] **Commit:** `feat(firms): explicit consulting-office kind (م١٨) at signup or from the owner's licence (q339) — 20261103_62`

### Task 5: q339 — signup card and admin edit

**Files:**
- modify `src/app/register/provider/data.ts:5-24` (add a card);
- modify `src/app/register/provider/types.ts` (`ProviderType` gains `"consulting_firm"`);
- modify `src/app/register/provider/signupMetadata.ts:23-66` (map);
- modify `src/app/register/provider/signupMetadata.test.ts` (it exists next to it; otherwise create it);
- create `src/app/api/v1/admin/firms/[id]/office-kind/route.ts`;
- modify the admin verifications or firm detail screen that lists firms. Find it with `grep -rln "firm_profiles" src/app/dashboard/admin`.
- show the kind read-only on `/dashboard/firm/profile` (a badge).

**Interfaces:**
- `signupMetadataFor("consulting_firm")` → `{ user_type: "firm", sub_role: null, office_kind: "consulting_m18" }`. The `"firm"` card sends no `office_kind` key.
- The card: id `consulting_firm`, label «مكتب استشارات قانونية مرخص (م١٨)», desc «استشارات وعقود ودراسات — دون ترافع»; en «Licensed Legal Consulting Office (Art. 18)».
- `PATCH /api/v1/admin/firms/[id]/office-kind`:
  - body `{ officeKind: "law_firm" | "consulting_m18" }`;
  - caller: platform admin (`isPlatformAdmin`), else 403;
  - the write goes through the service client (the lock trigger passes `service_role`);
  - answers 200 `{ officeKind }`, 400 on any other value, and 503 «يتطلب تحديث قاعدة البيانات» on 42703.

**Steps:**
- [ ] **Failing test** in `signupMetadata.test.ts`:
  - "consulting firm signs up as a firm with office_kind consulting_m18": `deepEqual(signupMetadataFor("consulting_firm"), { user_type:"firm", sub_role:null, office_kind:"consulting_m18" })`;
  - "the law firm card sends no office_kind": `equal("office_kind" in signupMetadataFor("firm"), false)`.
- [ ] **Run:** `node --test src/app/register/provider/signupMetadata.test.ts` → it fails.
- [ ] **Code:**
  - the card, the map and the route;
  - the admin control: a select with the two labels, with a confirm «تغيير نوع المكتب يغيّر قواعد الترافع على قضاياه»;
  - the firm profile badge. The signup country rule stays as it is: consulting firms are not forced to SA, because the owner said nothing.
- [ ] **Verify:** `npm run test:unit`, the build.
- [ ] **Commit:** `feat(firms): signup card and admin switch for the consulting-office kind (q339)`

---

## F3 — the firm permission model

### Task 6: `firm_member_permissions` (SQL)

**Files:**
- create `supabase/migrations/20261103_63_firm_member_permissions.sql`;
- create `supabase/tests/rls/firm_member_permissions.test.sql`;
- `_verify.sql` (block `verify:firm_member_permissions`).

**Interfaces:**
- **The table:**
  ```
  public.firm_member_permissions(
    firm_id uuid not null references public.firm_profiles(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    permission text not null check (permission in ('letterhead.print','case.assign','finance.bill','finance.reverse')),
    effect text not null check (effect in ('allow','deny')),
    set_by uuid, set_at timestamptz not null default now(),
    primary key (firm_id, user_id, permission))
  ```
- **RLS on; policies `TO authenticated`:**
  - SELECT using `user_id = auth.uid() or public.is_firm_owner(firm_id) or public.is_admin()`;
  - no INSERT, UPDATE or DELETE policy.
- **Privileges:** `revoke all … from public, anon, authenticated`; `grant select … to authenticated`; `grant all … to service_role`.
- **Functions** (all SECURITY DEFINER, `search_path ''`):
  - `public.firm_role_default_permissions(p_role text) returns text[]`: IMMUTABLE, `language sql`. It returns the §1.2 table (for example `'finance_manager'` → `{finance.bill,finance.reverse}`; an unknown role → `'{}'`).
  - `public.firm_member_has_permission(p_firm uuid, p_user uuid, p_permission text) returns boolean`: STABLE.
    - **The owner:** true when `p_user` is the firm's `owner_user_id`.
    - **A member:** true when he has an `active` `firm_members` row AND (an `allow` row OR (`p_permission = any(firm_role_default_permissions(role))` AND no `deny` row)).
    - **Anything else:** false, and NULL arguments give false.
    - EXECUTE: service_role only.
  - `public.firm_caller_has_permission(p_firm uuid, p_permission text) returns boolean`: STABLE, `= firm_member_has_permission(p_firm, auth.uid(), p_permission)`. EXECUTE: authenticated and service_role. It has a distinct name, so there is no overload.
  - `public.set_firm_member_permission(p_actor uuid, p_firm uuid, p_user uuid, p_permission text, p_effect text) returns jsonb`: VOLATILE. EXECUTE: service_role only.
    - `p_effect` is one of `'allow'`, `'deny'` or `'default'` (`default` deletes the row).
    - The actor must be the firm's owner; otherwise it returns `{"code":"forbidden"}`.
    - The target must hold a `firm_members` row in that firm and must not be the owner; otherwise `{"code":"not_member"}`.
    - Any other bad value gives `{"code":"invalid"}`.
    - Success returns `{"code":"ok","effective":<firm_member_has_permission after>}`.
- **The old column:** a `comment on column firm_members.permissions is 'Dormant since 20260603 — never read; firm_member_permissions (20261103_63) is the model.'`

**Steps:**
- [ ] **Failing test.**
  - Chain: the chain of `phase2_clients_and_membership.test.sql` + `20260921_03_entity_rls_recursion_fix.sql` + `20261016_02` + 63 twice.
  - Asserts:
    - **T1:** a `managing_partner` with no row has `letterhead.print` = true, and a `lawyer` has false.
    - **T2:** owner `set … 'lawyer' 'letterhead.print' 'allow'` → `code ok`, `effective true`.
    - **T3:** owner `deny` on the managing_partner → `effective false`.
    - **T4:** `'default'` deletes the row → back to the role default.
    - **T5:** a managing_partner (not the owner) as `p_actor` → `forbidden`.
    - **T6:** a target from another firm → `not_member`.
    - **T7:** a suspended member with an `allow` row → false.
    - **T8:** the owner has every permission, and a `deny` row on the owner is impossible (`not_member`).
    - **T9:** a member reads his own rows and not a colleague's (0 rows); the owner reads all of them.
    - **T10:** a session INSERT into the table → 42501.
    - **T11 (42P17 regression, the style of `entity_members_no_recursion.test.sql`):** as anon and as a member, `select count(*)` from `firm_members`, `firm_profiles` and `firm_member_permissions` raises no 42P17.
    - **T12:** `firm_role_default_permissions('unknown') = '{}'`.
  - **Negative control:** drop the `m.status = 'active'` test → T7 must FAIL.
- [ ] **Run:** the run.sh command → it fails.
- [ ] **Code:** the migration, the raising verify, and the final SELECT `ok = coalesce(RLS on and 1 policy and anon has no privilege and the 4 functions exist, false)`.
- [ ] **Verify:** Docker and the negative control.
- [ ] **Commit:** `feat(firms): per-member permission overrides with role defaults — 20261103_63`

### Task 7: the TS permission module and drift test

**Files:**
- create `src/lib/firm/firmPermissions.ts` and `src/lib/firm/firmPermissions.test.ts`;
- modify `src/lib/branding/firmLetterheadPermissions.ts:33-77`: `firmHas` delegates for `letterhead.print`, and `branding.manage` stays unchanged;
- modify `src/lib/branding/firmLetterheadPermissions.test.ts`: the SQL drift now reads 63 for print;
- modify `src/lib/auth/firmMembershipAccess.ts`: ADD a new export, `loadPermissionOverrides`. `resolveCallerFirm` itself is NOT changed, so a failed overrides read can never break the firm routes that use it today (members, activity, reviews-visibility, branding).

**Interfaces:**
- `export type FirmPermission = "letterhead.print" | "case.assign" | "finance.bill" | "finance.reverse";`
- `export const FIRM_ROLE_DEFAULTS: Readonly<Record<FirmPermission, readonly string[]>>` (§1.2).
- `export interface PermissionOverride { permission: FirmPermission; effect: "allow" | "deny" }`
- `export function firmCan(caller: { isOwner: boolean; role: string | null | undefined; overrides?: readonly PermissionOverride[] }, p: FirmPermission): boolean`.
- `export const FIRM_PERMISSION_LABEL_AR: Record<FirmPermission,string>`, with these labels:
  - «طباعة ورق المكتب المروّس»;
  - «إسناد القضايا لأعضاء الفريق»;
  - «إصدار الفواتير على مستوى المكتب»;
  - «عكس قيود التحصيل».
- `export async function loadPermissionOverrides(supabase, firmId: string, userId: string): Promise<{ overrides: PermissionOverride[]; error: { message: string; code?: string } | null }>`.
  - It is a session read of `firm_member_permissions` `where firm_id = firmId and user_id = userId` (RLS allows his own rows; the owner needs none).
  - `42P01` or `PGRST205` (63 not run) → `overrides: []` with no error, so role defaults apply.
  - Any other error is returned, and the permission gate that called it answers 500 (fails closed for that gate only).
  - Only the permission gates call it: Tasks 8, 9, 11, 17, 18, 20 and 26.

**Steps:**
- [ ] **Failing test** `firmPermissions.test.ts`:
  - "role defaults": `firmCan({isOwner:false, role:"finance_manager"}, "finance.bill") === true` and `firmCan({isOwner:false, role:"lawyer"}, "finance.bill") === false`;
  - "allow overrides a missing default": `{role:"lawyer", overrides:[{permission:"letterhead.print",effect:"allow"}]}` → true;
  - "deny withdraws a default": `{role:"managing_partner", overrides:[{permission:"letterhead.print",effect:"deny"}]}` → false;
  - "owner always": `{isOwner:true, role:"managing_partner", overrides:[{permission:"finance.reverse",effect:"deny"}]}` → true;
  - "SQL drift": parse `supabase/migrations/20261103_63_firm_member_permissions.sql`. The regex extracts each `when '<role>' then array[...]` from `firm_role_default_permissions`. `deepEqual` the result with `FIRM_ROLE_DEFAULTS` inverted per role.
  - In `firmLetterheadPermissions.test.ts`, the print-role assertion now compares with 63; the `branding.manage` assertion still compares with 63_branding_vault (`can_manage_branding_vault`).
- [ ] **Run:** `node --test src/lib/firm/firmPermissions.test.ts src/lib/branding/firmLetterheadPermissions.test.ts` → it fails.
- [ ] **Code:**
  - the module;
  - `firmHas(caller,"letterhead.print")` → `firmCan(caller,"letterhead.print")`, with `caller.overrides` filled by `loadPermissionOverrides`;
  - `loadPermissionOverrides`, plus its unit test "missing table means role defaults": a stub client returning `{error:{code:"PGRST205"}}` → `{overrides:[], error:null}`.
- [ ] **Verify:** `npm run test:unit`, the build.
- [ ] **Commit:** `feat(firms): firmPermissions — role defaults plus per-member overrides, drift-tested against SQL`

### Task 8: the owner grants or withdraws a permission per member (API and UI)

**Files:**
- create `src/app/api/v1/firm/members/[memberId]/permissions/route.ts` and `route.test.ts`;
- modify `src/app/dashboard/firm/team/[id]/page.tsx` (a «الصلاحيات» card);
- modify `src/app/dashboard/firm/team/roles/page.tsx`: replace the mock toggles with `UnfinishedModuleNote`/«قريباً» and a link «صلاحيات كل عضو من صفحته».

**Interfaces:**
- `GET /api/v1/firm/members/[memberId]/permissions`:
  - caller: firm owner (`assertRole(["firm"])` + `resolveCallerFirm().isOwner`), or the member himself;
  - answers `{ permissions: { [p in FirmPermission]: { effective: boolean; source: "role" | "allow" | "deny" | "owner" } } }`.
- `PUT …/permissions`:
  - body `{ permission: FirmPermission, effect: "allow" | "deny" | "default" }`;
  - it calls `service.rpc("set_firm_member_permission", { p_actor: user.id, p_firm, p_user, p_permission, p_effect })`;
  - code → HTTP: `ok` → 200, `forbidden` → 403, `not_member` → 404, `invalid` → 400, PGRST202 → 503 «يتطلب تحديث قاعدة البيانات».
- `memberId` is the `firm_members.id`. The route resolves `user_id` through a session read of `firm_members` (RLS lets the owner read his firm's rows).

**Steps:**
- [ ] **Failing test** `route.test.ts` (the existing pattern in `src/app/api/v1/firm/members/[memberId]/route.test.ts`; source-level and pure):
  - "PUT refuses a non-owner": the handler source calls `isOwner` before `rpc(`;
  - "maps every RPC code": a pure `permissionRpcStatus(code)` exported from a sibling `_status.ts` gives `ok→200, forbidden→403, not_member→404, invalid→400, undefined→503`.
- [ ] **Run:** `node --test "src/app/api/v1/firm/members/[memberId]/permissions/*.test.ts"` → it fails.
- [ ] **Code:**
  - the route and the card: four rows, each a three-way control «حسب الدور / مسموح / ممنوع» with a «الفعلي: نعم/لا» chip;
  - the owner sees the controls; the member sees his own permissions read-only;
  - no text-gray-100/200.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(firms): owner grants or withdraws a permission per member (q344 base)`

### Task 9: q344 — per-member print reaches the vault without an RLS change

**Files:**
- create `supabase/migrations/20261103_64_firm_letterhead_print_kit.sql`;
- create `supabase/tests/rls/firm_letterhead_print_kit.test.sql`;
- `_verify.sql` (block `verify:firm_letterhead_print_kit`);
- modify `src/lib/branding/brandingServer.ts:53-93,117-129`;
- modify `src/app/api/v1/branding/route.ts` (GET, lines 55-140);
- modify `src/app/api/v1/branding/route.test.ts`.

**Interfaces:**
- **SQL:** `public.firm_letterhead_print_kit(p_firm uuid) returns jsonb`: SECURITY DEFINER, STABLE, `search_path ''`. EXECUTE: authenticated and service_role; revoked from anon.
  - When `public.firm_caller_has_permission(p_firm,'letterhead.print')` is false, it returns `{"code":"forbidden"}`.
  - Otherwise it returns `{"code":"ok","vault":<branding_vaults row of firm_id = p_firm as json, or null>,"docx_path":<branding_assets.storage path where kind='letterhead_docx' of that vault, or null>}`.
  - The asset column name is read from `20261030_14:70-90` at HEAD.
- **TS:** `readVaultForPrint(supabase, owner): Promise<{ row: VaultRow | null; docxPath: string | null; error }>`.
  - For a lawyer: the RLS read (unchanged), plus the `docx_path` read through RLS on `branding_assets`.
  - For a firm caller who holds print but not `branding.manage`: `supabase.rpc("firm_letterhead_print_kit", { p_firm })`, through the SESSION, so the DB re-checks the permission.
  - The logo and the docx are then signed with the service role. That respects the brandingServer rule "service role only after a DB-side check has succeeded".
  - On PGRST202 (64 not run):
    - a caller who manages branding (role owner, managing_partner or office_admin) gets the old RLS read, which is today's behaviour;
    - any other print holder gets 503 «يتطلب تحديث قاعدة البيانات». The plan never prints a blank identity silently.
- `GET /api/v1/branding?scope=firm` uses `need = "letterhead.print"`, as it already does.

**Steps:**
- [ ] **Failing test (Docker):**
  - Chain: the `branding_vault.test.sql` chain + `20261030_14` (twice, as in `branding_assets.test.sql`) + the chain needed by 63 + 63 + 64 twice.
  - Asserts:
    - **T1:** a `lawyer`-role member with an `allow` row on `letterhead.print` → `code ok`, and `vault->>'display_name_ar'` equals the saved name.
    - **T2:** the same member without the row → `forbidden`.
    - **T3:** an `office_admin` with a `deny` row → `forbidden`.
    - **T4:** anon cannot EXECUTE.
    - **T5:** the vault RLS is unchanged: the T1 member's direct `select from branding_vaults` returns 0 rows (proves no RLS widening).
- [ ] **Failing test (unit)** in `route.test.ts`:
  - "a print-only grantee is served the vault through the print kit". Source check: `route.ts` GET references `firm_letterhead_print_kit` (through `readVaultForPrint`), and `brandingServer.ts` exports `readVaultForPrint`.
  - "no silent blank letterhead": a pure `printKitFallback({ manages: false, code: "PGRST202" })` returns `{ status: 503 }`, and `({ manages: true, code: "PGRST202" })` returns `{ status: "rls_read" }`.
- [ ] **Run:** Docker → it fails; `node --test src/app/api/v1/branding/route.test.ts` → it fails.
- [ ] **Code:** the migration (final SELECT `ok = coalesce(function exists and is definer and anon cannot execute, false)`), `readVaultForPrint`, and the GET.
  - `permissions.print` in the response comes from `firmCan` (Task 7).
  - `permissions.manage` comes from the role-only `firmHas(…,"branding.manage")`.
- [ ] **Verify:** Docker, unit, build.
- [ ] **Commit:** `feat(firms): a member granted print gets the firm letterhead — DB-checked print kit, no RLS change (q344) — 20261103_64`

**Alternative (STOP-POINT if chosen instead):** widen `can_manage_branding_vault` to print grantees. That changes RLS on `branding_vaults`, `branding_assets` and the storage policies, and it would also give them write access. **Not chosen.**

### Task 10: q350 — assign a case to a team member (SQL)

**Files:**
- create `supabase/migrations/20261103_65_assign_firm_case.sql`;
- create `supabase/tests/rls/assign_firm_case.test.sql`;
- `_verify.sql` (block `verify:assign_firm_case`).

**Interfaces:**
- **The table** `public.case_assignment_events`:
  - `id bigserial pk`;
  - `request_id text not null references service_requests(id) on delete cascade`;
  - `firm_id uuid not null references firm_profiles(id) on delete cascade`;
  - `from_user_id uuid`, `to_user_id uuid not null`, `actor_user_id uuid` (no FK: the history outlives a purge);
  - `reason text check (reason is null or length(reason) <= 500)`;
  - `created_at timestamptz default now()`.
  - RLS on: SELECT `TO authenticated` using `public.is_active_firm_member(firm_id) or public.is_firm_owner(firm_id) or public.is_admin()`. No write policy. Revoked from anon.
- **The function** `public.assign_firm_case(p_actor uuid, p_request_id text, p_assignee uuid, p_reason text) returns jsonb`: SECURITY DEFINER, VOLATILE. EXECUTE: service_role only. Steps, in order:
  1. `select … from service_requests where id = p_request_id for update`. Not found → `not_found`.
  2. `firm_id` is null → `not_firm_case`; `type = 'consultation'` → `not_a_case`.
  3. `firm_member_has_permission(firm_id, p_actor, 'case.assign')` is false → `forbidden`.
  4. The assignee must have an `active` `firm_members` row in the same firm → otherwise `not_member`.
  5. `public.is_court_restricted_user(p_assignee)` AND (any `hearings` or `case_stages` row with `case_request_id = p_request_id`) → `consultant_court_case`.
  6. `assigned_to` is already `p_assignee` → `{"code":"ok","unchanged":true}`.
  7. Update `service_requests.assigned_to`. Update `cases.assigned_user_id` where `request_id = p_request_id`, if `public.cases` exists. Insert the event row. Insert an `activity_events` row `(case_request_id, firm_id, owner_user_id = p_assignee, actor_user_id = p_actor, kind = 'case_assigned', summary = 'إسناد القضية', payload = {from,to})`.
  8. Return `{"code":"ok","unchanged":false,"from":…,"to":…}`.
- **Unchanged:** visibility (٤٢٨ is open), and the owners of hearings, stages, deadlines and tasks.

**Steps:**
- [ ] **Failing test.**
  - Chain: the `notes_visibility_case_team.test.sql` chain + `20261019_20` + `20261019_21` + 61 + 62 + 63 + 65 twice.
  - Asserts:
    - **T1:** the owner assigns case R (lead A) to member B → `ok`; `service_requests.assigned_to = B`; 1 event row; 1 activity row of kind `case_assigned`.
    - **T2:** a plain `lawyer`-role member as actor → `forbidden`, and nothing changed.
    - **T3:** a `partner` (role default) → `ok`.
    - **T4:** an assignee from another firm → `not_member`.
    - **T5:** a suspended assignee → `not_member`.
    - **T6:** a consultant member as assignee on a case with one hearing → `consultant_court_case`.
    - **T7:** a consultation request → `not_a_case`, and `consultations.lawyer_user_id` is unchanged.
    - **T8:** a hearing of R still has `owner_user_id = A` after T1.
    - **T9:** a member of the firm reads the event rows, and a stranger reads 0.
    - **T10:** a session cannot EXECUTE the function.
    - **T11:** a `case_team` case note of R becomes readable by B and unreadable by A after T1. A has no `case_team_members` row; B reads 1 row, A reads 0.
    - **T12:** an open invoice on R: after T1, `record_invoice_collection` by B → `ok`, and by A → `forbidden`. Include 20261030_10 in the chain.
  - **Negative control:** remove the step-4 status test → T5 must FAIL.
- [ ] **Run** → it fails.
- [ ] **Code:** the migration, with the final SELECT `ok = coalesce(table RLS on, function service-only, false)`. The `activity_events.kind` column has no CHECK at HEAD (`20260903_phase1:281-293`); the verify asserts that is still so.
- [ ] **Verify:** Docker.
- [ ] **Commit:** `feat(firms): assign_firm_case — permission-checked reassignment with history (q350) — 20261103_65`

### Task 11: q350 — the assign route and the real assign page

**Files:**
- create `src/app/api/v1/firm/cases/[id]/assign/route.ts`;
- create `src/app/api/v1/firm/cases/[id]/assign/_status.ts` and `_status.test.ts`;
- rewrite `src/app/dashboard/firm/cases/assign/page.tsx` (remove the mock data);
- add an «إسناد» action on `src/app/dashboard/firm/cases/[id]/page.tsx`.

**Interfaces:**
- `POST /api/v1/firm/cases/[id]/assign`:
  - body `{ assigneeUserId: string, reason?: string }`;
  - the session must be a firm owner or a member (`resolveCallerFirm`), and `firmCan(caller,"case.assign")`, else 403 before the RPC;
  - the RPC call: `service.rpc("assign_firm_case", { p_actor, p_request_id, p_assignee, p_reason })`.
- `assignStatus(code)`:
  - `ok` → 200;
  - `forbidden` → 403;
  - `not_found`, `not_firm_case` → 404;
  - `not_member`, `not_a_case`, `consultant_court_case` → 409, with the Arabic texts:
    - «العضو ليس عضواً نشطاً في المكتب»;
    - «طلبات الاستشارة لا تُسند من هنا»;
    - «لا تُسند قضية فيها جلسات أو مراحل لمستشار قانوني (المادة ١٨)»;
  - undefined → 503.
- The page lists the firm's cases from the existing `GET /api/v1/service-requests` (already used by `/dashboard/firm/cases/page.tsx:132`) and the members from `GET /api/v1/firm/members`. There is no workload, rating or "available" data (it does not exist); load stays a «قريباً» chip.

**Steps:**
- [ ] **Failing test** `_status.test.ts`: the exact mapping above (7 codes plus undefined); and "the page has no mock data": `src/app/dashboard/firm/cases/assign/page.tsx` contains neither `UNASSIGNED_CASES` nor `const TEAM = [`.
- [ ] **Run:** `node --test "src/app/api/v1/firm/cases/[id]/assign/_status.test.ts"` → it fails.
- [ ] **Code:** the route, the page (pick case → pick member → reason → confirm) and the case-page action. The action is shown only when the GET permissions say `case.assign`.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(firms): assign a firm case to a team member — real page replaces the mock (q350)`

### Task 12: q338 — a firm member lands on the firm dashboard

**Files:**
- modify `src/lib/auth/sessionResponse.ts` (contract and `sessionResponseFor`);
- modify `src/app/api/v1/auth/session/route.ts` and `route.test.ts`;
- modify `src/app/login/page.tsx:194-198,300-310`;
- create `src/lib/auth/memberLanding.ts` and `memberLanding.test.ts`.

**Interfaces:**
- `sessionResponseFor(outcome, userId, profile, firmMembership?: { firmId: string } | null)` → `ok` body `{ userId, userType, firmMember: boolean }`.
  - The route reads `firm_members` (session client, `status='active'`, `limit 1`).
  - A read error → `firmMember: false`; login is never blocked.
- `export function landingPath(userType: DbUserType, firmMember: boolean): string`:
  - `lawyer` with `firmMember` → `"/dashboard/firm"`;
  - everything else → `getDashboardRoute(userType)`.
- In both places, `postLoginPath(nextFromUrl(), landingPath(...))`, so an explicit `next` still wins.
- The "already signed in" effect uses `user.affiliation?.entityType === "firm"` (from `useUser`) as `firmMember`.

**Steps:**
- [ ] **Failing test** `memberLanding.test.ts`:
  - `landingPath("lawyer", true) === "/dashboard/firm"`;
  - `landingPath("lawyer", false) === "/dashboard/lawyer"`;
  - `landingPath("firm", false) === "/dashboard/firm"`;
  - `landingPath("individual", true) === "/dashboard/client"`.
- [ ] **Failing test** in `sessionResponse` (the existing route test): `sessionResponseFor("ok","u1",{user_type:"lawyer"},{firmId:"f1"}).body` → `deepEqual {userId:"u1", userType:"lawyer", firmMember:true}`; and with `null` → `firmMember:false`.
- [ ] **Run:** `node --test src/lib/auth/memberLanding.test.ts src/app/api/v1/auth/session/route.test.ts` → it fails.
- [ ] **Code:** as specified. Deploy order: code only, no SQL.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(firms): a firm member lands on the firm dashboard after sign-in (q338)`

### Task 13: q338 — «قضاياي المسندة» on the firm home

**Files:**
- create `src/app/api/v1/firm/assigned-cases/route.ts`;
- create `src/components/dashboard/firm/MyAssignedCasesPanel.tsx`;
- modify `src/app/dashboard/firm/page.tsx` (render the panel for a non-owner member);
- create `src/lib/firm/assignedCases.ts` and `assignedCases.test.ts`.

**Interfaces:**
- `GET /api/v1/firm/assigned-cases`:
  - the session client: `service_requests` where `firm_id = <caller firm>` and `assigned_to = user.id`, ordered `created_at desc`, limit 50;
  - answers `{ firm: { id, name }, cases: AssignedCase[] }`.
- `AssignedCase = { id: string; title: string; status: string; createdAt: string }`.
- `toAssignedCase(row)` maps the title from `metadata.title ?? metadata.caseTitle ?? "قضية بلا عنوان"`. Check those keys against `workflowToCase` in `src/constants/lawyerCasesData.ts` at HEAD.
- Dates are formatted on the client, in an effect, never during SSR.

**Steps:**
- [ ] **Failing test:**
  - "maps a row": `toAssignedCase({id:"R1", status:"in_progress", created_at:"2026-11-01T10:00:00Z", metadata:{title:"نزاع إيجار"}})` deepEquals `{id:"R1", title:"نزاع إيجار", status:"in_progress", createdAt:"2026-11-01T10:00:00Z"}`;
  - "falls back to the title placeholder": `metadata:{}` → title `"قضية بلا عنوان"`.
- [ ] **Run** → it fails.
- [ ] **Code:** the route, the panel (empty state «لا قضايا مسندة إليك بعد»; header «{اسم المكتب} — قضاياي المسندة»; each row links to `/dashboard/firm/cases/{id}`), and the page wiring.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(firms): the firm home shows the member's assigned cases (q338)`

---

## F4 — firm finance

### Task 14: q349 — four client types and representative fields (SQL)

**Files:**
- create `supabase/migrations/20261103_66_client_types.sql`;
- create `supabase/tests/rls/client_types.test.sql`;
- `_verify.sql` (block `verify:client_types`).

**Interfaces:**
- **`lawyer_clients`.** The client-type CHECK is found by its definition (`pg_get_constraintdef ilike '%client_type%'`), dropped and re-added as `lawyer_clients_client_type_check CHECK (client_type in ('individual','company','government','nonprofit'))`.
- **New nullable columns:**
  - `representative_name text check (length <= 200)`;
  - `representative_capacity text check (length <= 120)` (صفة الممثل);
  - `representation_basis text check (representation_basis in ('power_of_attorney','board_resolution','authorization_letter','legal_guardianship','other'))`;
  - `representation_ref text check (length <= 120)` (رقم وتاريخ السند).
- **`create_lawyer_invoice`.** The same 11-argument signature is `create or replace`d from the HEAD body (`20261030_20:86-260`), with ONLY the `p_client_type` test widened to the four values. The fingerprint is unchanged.

**Steps:**
- [ ] **Failing test.**
  - Chain: `prelude_invoice_payments_live.sql`, `prelude_lawyer_clients_min.sql` (or the phase2 migration), `20261030_20` twice, then 66 twice.
  - Asserts:
    - **T1:** insert a card `client_type='government'` → it succeeds.
    - **T2:** `client_type='bank'` → 23514.
    - **T3:** an existing `company` row is unchanged (count before = after).
    - **T4:** `create_lawyer_invoice(... p_client_type => 'nonprofit' ...)` with no card → `code ok`.
    - **T5:** `'bank'` → `code invalid`.
    - **T6:** the representative columns accept NULL and refuse 201 characters.
    - **T7:** exactly one client-type CHECK remains on `lawyer_clients`.
  - **Negative control:** without 66 → T1 must FAIL.
- [ ] **Run** → it fails.
- [ ] **Code:** the migration; the final SELECT `ok = coalesce(constraint def contains 'nonprofit' and 4 columns exist, false)`.
- [ ] **Verify:** Docker; re-run `create_lawyer_invoice.test.sql` with 66 appended (it must still pass).
- [ ] **Commit:** `feat(clients): four client types with the legal representative and his authority (q349) — 20261103_66`

### Task 15: q349 — the clients form, the routes and the labels

**Files:**
- create `src/lib/clients/clientTypes.ts` and `clientTypes.test.ts`;
- modify `src/app/api/v1/lawyer/clients/route.ts:370-400` and `src/app/api/v1/lawyer/clients/[id]/route.ts` (PATCH);
- modify `src/app/api/v1/lawyer/finance/route.ts:81`;
- modify `src/components/dashboard/lawyer/AddClientModal.tsx` and `ClientDrawer.tsx`;
- modify `src/app/dashboard/lawyer/_components/AddCaseModal.tsx` (its client-type usage; check at HEAD);
- modify `src/lib/finance/invoiceFinanceCore.ts` (`parseCreateBody` type check).

**Interfaces:**
- `export const CLIENT_TYPES = ["individual","company","government","nonprofit"] as const; export type ClientType = (typeof CLIENT_TYPES)[number];`
- `export const CLIENT_TYPE_LABEL_AR: Record<ClientType,string> = { individual:"فرد", company:"منشأة تجارية", government:"جهة حكومية", nonprofit:"جهة غير ربحية / وقف" }`.
- `export const REPRESENTATION_BASIS_LABEL_AR`, with these labels:
  - «وكالة شرعية»;
  - «قرار مجلس الإدارة / الشركاء»;
  - «خطاب تفويض»;
  - «ولاية / وصاية»;
  - «أخرى».
- `export function isClientType(v: unknown): v is ClientType`.
- `export function parseRepresentative(body): { ok: true; value: {...} | null } | { ok: false; error: string }`. It trims, applies the length caps above, and returns `value: null` when all four are empty.
- **The routes:**
  - accept the 4 types;
  - send the representative columns only when `value !== null` (the deploy-order rule);
  - map 23514 / 42703 to 503 «يتطلب تحديث قاعدة البيانات»;
  - `allowUnified` (route.ts:394) is true for every non-individual type;
  - `finance/route.ts:81` returns `isClientType(meta.clientType) ? meta.clientType : "individual"`.

**Steps:**
- [ ] **Failing test** `clientTypes.test.ts`:
  - `CLIENT_TYPES.length === 4`;
  - `CLIENT_TYPE_LABEL_AR.company === "منشأة تجارية"`;
  - `isClientType("bank") === false`;
  - `parseRepresentative({}).value === null`;
  - `parseRepresentative({representative_name:"x".repeat(201)}).ok === false`;
  - a SQL drift test: the `'individual','company','government','nonprofit'` list in `20261103_66_client_types.sql` equals `CLIENT_TYPES`.
- [ ] **Run:** `node --test src/lib/clients/clientTypes.test.ts` → it fails.
- [ ] **Code:**
  - the module; the routes;
  - the modal: a 4-way type picker, plus the representative block (name, capacity, basis select, reference). The block shows for every non-individual type, and stays optional for an individual (labelled «الوكيل / الولي إن وُجد»);
  - the drawer shows them.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(clients): four client types and representative fields on the client card and invoice (q349)`

### Task 16: q356 — firm-level billing (SQL)

**Files:**
- create `supabase/migrations/20261103_67_firm_billing.sql`;
- create `supabase/tests/rls/firm_billing.test.sql`;
- `_verify.sql` (block `verify:firm_billing`).

**Interfaces** (both functions are `create or replace` with the same signatures and HEAD bodies, plus the firm arm):
- **`create_lawyer_invoice(...)`.** Its body starts from 66.
  - **The ownership step** (`20261030_20` step 3) passes when the referenced request, case or card is the actor's own (today's rule). It also passes when the row's firm (`service_requests.firm_id` or `lawyer_clients.firm_id`) is F AND `firm_member_has_permission(F, p_actor, 'finance.bill')`.
  - **One firm per invoice.** All the referenced rows must share that same F; otherwise the answer is `forbidden`.
  - **The placeholder request** (no `p_request_id`) is created with `assigned_to = p_actor` and `firm_id = F` when a firm card or case was referenced.
  - `metadata` gains `issued_by = p_actor` and `firm_id = F`.
- **`record_invoice_collection(...)`.** The ownership test at `20261030_10:190-196` becomes `owner_id = p_actor OR (sr.firm_id is not null AND firm_member_has_permission(sr.firm_id, p_actor, 'finance.bill'))`.
- **`firm_invoice_ids(p_firm uuid, p_actor uuid) returns setof text`.** STABLE, SECURITY DEFINER, service_role only. It returns the `payments.id` values whose request has `firm_id = p_firm`, when the actor holds `finance.bill`; otherwise an empty set. The `/api/v1/firm/finance` route uses it before its service-role reads, so the `invoice_collections` and `payments` RLS stay untouched.

**Steps:**
- [ ] **Failing test.**
  - Chain: the `create_lawyer_invoice.test.sql` and `invoice_collections.test.sql` preludes, the phase2 chain, 63, 66, 20261030_10, then 67 twice.
  - Asserts:
    - **T1:** `finance_manager` FM invoices on colleague A's firm case → `ok`; the payment's `request_id` is A's case; `metadata->>'issued_by' = FM`.
    - **T2:** a plain member invoices on A's case → `forbidden`.
    - **T3:** FM references a card of firm F and a case of firm G → `forbidden`.
    - **T4:** FM records a collection on that invoice → `ok`.
    - **T5:** a plain member collects → `forbidden`.
    - **T6:** solo lawyer S (no firm) still invoices and collects on his own requests → `ok`.
    - **T7:** `firm_invoice_ids(F, FM)` returns the T1 id; `firm_invoice_ids(F, plain)` is empty.
    - **T8:** a `deny` row on FM's `finance.bill` → T1 repeated with a new key → `forbidden`.
  - **Negative control:** chain `… 67, 20261030_20` → T1 must FAIL.
- [ ] **Run** → it fails.
- [ ] **Code:** the migration; the final SELECT `ok = coalesce(prosrc of both functions contains 'finance.bill', false)`.
- [ ] **Verify:** Docker; re-run `create_lawyer_invoice.test.sql` and `invoice_collections.test.sql` with 63, 66 and 67 appended (both still pass).
- [ ] **Commit:** `feat(finance): the managing partner / finance role invoices and collects at firm level (q356) — 20261103_67`

**Alternative (STOP-POINT if chosen instead):** widen the `invoice_collections` SELECT policy to firm finance holders. **Not chosen.** Reads go through the service role after `firm_invoice_ids`.

### Task 17: q356 — the firm finance API

**Files:**
- create `src/app/api/v1/firm/finance/route.ts` (GET list, POST issue);
- create `src/app/api/v1/firm/finance/[paymentId]/collect/route.ts` (POST);
- create `src/lib/finance/firmFinance.ts` and `firmFinance.test.ts`.

**Interfaces:**
- **GET** → `{ invoices: FirmInvoice[] }`.
  - The caller passes `firmCan(caller,"finance.bill")`, else 403.
  - The ids come from `service.rpc("firm_invoice_ids", { p_firm, p_actor })`.
  - The payments are read with the service client, `.in("id", ids)`. The ids are chunked at 300 (the `.in()` ceiling).
  - The collections are read the same way.
- `FirmInvoice = { id; amountHalalas; paidHalalas; remainingHalalas; status; clientName; clientType; caseTitle; issuedBy; lead; createdAt }`.
- **POST** takes the same body as `POST /api/v1/lawyer/finance` (reuse `parseCreateBody`) and calls `create_lawyer_invoice` with `p_actor = user.id`. The codes are mapped with the existing `FinanceReply` helpers.
- **Collect POST** takes the same body as the lawyer PATCH (`parseCollectBody`) and calls `record_invoice_collection`.
- `toFirmInvoice(payment, collections)` is pure. Amounts are in halalas: `paid = sum(collections.amount)*100 - reversals`, but it reads `metadata.paidAmount` as the source of truth (the same as the lawyer page).

**Steps:**
- [ ] **Failing test** `firmFinance.test.ts`: `toFirmInvoice({id:"P1", amount:"1000.00", status:"requires_payment", metadata:{paidAmount:450, clientName:"شركة الأفق", clientType:"company", issued_by:"u2"}}, [])` → `amountHalalas 100000, paidHalalas 45000, remainingHalalas 55000, clientType "company"`; and "chunks ids at 300": `chunkIds(Array(650).fill("x")).map(c=>c.length)` deepEquals `[300,300,50]`.
- [ ] **Run** → it fails.
- [ ] **Code:** the routes (all under `/api/v1/firm/`, already session-protected by `PROTECTED_API_PREFIXES`; no proxy change).
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(finance): firm finance API — list, issue and collect at firm level (q356)`

### Task 18: q356 — the real `/dashboard/firm/finance` page

**Files:** rewrite `src/app/dashboard/firm/finance/page.tsx` (remove «Mock Data» and its data). `finance/reports` stays as it is.

**Interfaces:**
- **Consumes:** Task 17's routes, `CLIENT_TYPE_LABEL_AR` and the permission GET (Task 8; the member's own permissions).
- **The page:**
  - a holder of `finance.bill` sees the firm invoice list, «إصدار فاتورة» (case picker from the firm's service-requests; client picker from the firm's cards via `GET /api/v1/lawyer/clients`, check at HEAD that it returns firm-shared cards) and «تسجيل تحصيل»;
  - a non-holder sees «إصدار الفواتير على مستوى المكتب لمالك المكتب والشريك المدير والمدير المالي، أو لمن منحه المالك الصلاحية»;
  - the invoice wording stays «بيان أتعاب» with no VAT (٤٣٠ is open);
  - dates are formatted on the client.

**Steps:**
- [ ] **Failing test:** a source test in `src/app/dashboard/firm/finance/page.test.ts`. The page has no `Mock Data` and no hard-coded amount array, and it fetches `/api/v1/firm/finance`.
- [ ] **Run** → it fails.
- [ ] **Code:** the page.
- [ ] **Verify:** unit, build, and a manual check in the dev server with a seeded firm (`run` skill), at desktop and at 375 px width.
- [ ] **Commit:** `feat(finance): real firm finance page replaces the mock (q356)`

### Task 19: q355 — the reversal entry (SQL)

**Files:**
- create `supabase/migrations/20261103_68_invoice_reversal.sql`;
- create `supabase/tests/rls/invoice_reversal.test.sql`;
- `_verify.sql` (block `verify:invoice_reversal`).

**Interfaces:**
- **The table** `public.invoice_collection_reversals`:
  - `id bigserial pk`;
  - `collection_id bigint not null unique references invoice_collections(id) on delete cascade`;
  - `payment_id text not null references payments(id) on delete cascade`;
  - `amount numeric(12,2) not null check (amount > 0)`;
  - `reason text not null check (length(btrim(reason)) between 5 and 500)`;
  - `paid_before numeric(12,2) not null check (paid_before >= 0)`, `paid_after numeric(12,2) not null check (paid_after >= 0)`;
  - `idempotency_key text not null unique check (length between 8 and 100)`;
  - `reversed_by uuid references auth.users(id) on delete set null`;
  - `reversed_at timestamptz not null default now()`.
  - RLS on. SELECT policy copied from `invoice_collections_select_assigned` (the assigned lawyer) on this NEW table. No write policy. Revoked from anon; authenticated has SELECT only.
- **The function** `public.reverse_invoice_collection(p_collection_id bigint, p_actor uuid, p_reason text, p_idempotency_key text) returns jsonb`: SECURITY DEFINER, VOLATILE, service_role only. Steps:
  1. Validate the arguments → `invalid`.
  2. Load the collection, else `not_found`. Lock its payment `FOR UPDATE`.
  3. Who may reverse:
     - when the request's `firm_id` is not null: `firm_member_has_permission(firm_id, p_actor, 'finance.reverse')`;
     - otherwise: `service_requests.assigned_to = p_actor`;
     - anything else → `forbidden`.
  4. The same key returns the first answer (`replay`); the key used on another collection → `key_reused`.
  5. Already reversed → `already_reversed`.
  6. The payment status is not `requires_payment` or `paid` → `not_reversible`.
  7. The current paid total is less than the amount → `inconsistent`.
  8. Insert the reversal. `metadata.paidAmount := paid - amount`; add `metadata.lastReversalAt` and `lastReversalBy`; set status to `requires_payment`.
  9. Return `{code:'ok', paid_halalas, remaining_halalas}`.

  Never UPDATE or DELETE an `invoice_collections` row.
- `public.payments` carries no user trigger at HEAD (`grep -n "on public.payments" supabase/migrations/*.sql` shows only the 20260518 SELECT policy), so `paid` → `requires_payment` is not blocked. The verify block re-asserts that no trigger exists on `payments`; if one is added later, it must be included in this test's chain.

**Steps:**
- [ ] **Failing test.**
  - Chain: the `invoice_collections.test.sql` chain, 63, 66, 67, then 68 twice.
  - Asserts:
    - **T1:** solo lawyer S has an invoice of 1000 with collections of 400 and 600 (status `paid`). He reverses the 600 with reason «مبلغ مكرر بالخطأ» → `ok`; `paidAmount = 400`; status `requires_payment`; the collection row is unchanged (`amount = 600`).
    - **T2:** reversing the same collection with a new key → `already_reversed`.
    - **T3:** the same key again → `ok` with `replay = true` and no second row.
    - **T4:** reason «خطأ» (4 characters) → `invalid`.
    - **T5:** a firm case: the assigned plain member → `forbidden`, and the `finance_manager` → `ok`.
    - **T6:** a session cannot INSERT into the reversals table or EXECUTE the function.
    - **T7:** after T1, `record_invoice_collection` of 600 with `expected_paid = 40000` → `ok` (the books can be corrected forward).
  - **Negative control:** remove the step-5 check (and the unique constraint) → T2 must FAIL.
- [ ] **Run** → it fails.
- [ ] **Code:** the migration; the final SELECT `ok = coalesce(table RLS on, unique(collection_id) exists, function service-only, false)`.
- [ ] **Verify:** Docker.
- [ ] **Commit:** `feat(finance): a wrong payment is corrected by a reasoned reversal entry, never deleted (q355) — 20261103_68`

### Task 20: q355 — the collections list and «عكس القيد»

**Files:**
- create `src/app/api/v1/lawyer/finance/[paymentId]/collections/route.ts` (GET);
- create `src/app/api/v1/lawyer/finance/collections/[collectionId]/reverse/route.ts` (POST);
- the same two under `src/app/api/v1/firm/finance/…` (they call the same RPC; the firm list uses the service role after `firm_invoice_ids`);
- modify `src/lib/finance/invoiceFinanceCore.ts` (add `parseReverseBody`, `reverseReplyStatus`) and its test;
- modify `src/app/dashboard/lawyer/finance/page.tsx` and the Task 18 page (an expandable collections list per invoice, with a reverse button and a reason modal).

**Interfaces:**
- `parseReverseBody(body) → { ok: true; reason: string; idempotencyKey: string } | { ok: false; error: string }`. The reason must be 5–500 characters after trim; the key is 8–100 characters.
- `reverseReplyStatus(code)`:
  - `ok` → 200;
  - `forbidden` → 403;
  - `not_found` → 404;
  - `already_reversed`, `not_reversible`, `inconsistent` → 409, with the texts «عُكس هذا القيد من قبل», «لا يُعكس تحصيل على فاتورة مستردة أو ملغاة», «مجموع التحصيل لا يسمح بالعكس — راجع الدعم»;
  - `invalid` → 400;
  - `key_reused` → 409;
  - undefined → 503.
- The collections GET (lawyer) is a session read of `invoice_collections` and `invoice_collection_reversals`; RLS already scopes both to the assigned lawyer.
- A reversed row shows struck through, with «عُكس: {reason}». The original amount stays visible.

**Steps:**
- [ ] **Failing test:**
  - `parseReverseBody({reason:"  خطأ  ", idempotencyKey:"abcdefgh"}).ok === false`;
  - `parseReverseBody({reason:"مبلغ مكرر", idempotencyKey:"abcdefgh"})` deepEquals `{ok:true, reason:"مبلغ مكرر", idempotencyKey:"abcdefgh"}`;
  - the full `reverseReplyStatus` mapping.
- [ ] **Run:** `node --test src/lib/finance/invoiceFinanceCore.test.ts` → it fails.
- [ ] **Code:** the routes and the UI. The key comes from `crypto.randomUUID()` once per opened modal, so a retry reuses it.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(finance): collections list with a reasoned «عكس القيد» (q355)`

---

## F5 — letterhead

### Task 21: q346 — SVG logos, rasterised in the browser

**Files:**
- create `src/lib/branding/svgLogo.ts` and `svgLogo.test.ts` (pure);
- create `src/components/letterhead/rasterizeSvgLogo.ts` (browser only);
- modify the logo upload control in `src/components/letterhead/LetterheadWorkspace.tsx` (find `accept=` and the upload call; it is a shared letterhead file, sequenced before Tasks 26-27);
- modify `src/lib/branding/brandingVault.ts:107-114` (only a new export, `looksLikeSvg`);
- modify `src/app/api/v1/branding/logo/route.ts` (the refusal message).

**Interfaces:**
- `export function svgLogoRejectReason(text: string): string | null`. It returns:
  - «الملف ليس SVG» when no `<svg` root;
  - «الشعار يحتوي عناصر غير مسموحة» when any of `<!ENTITY`, `<!DOCTYPE`, `<script`, `<foreignObject`, `on[a-z]+=`, `javascript:` appears, or any `href`/`xlink:href` whose value does not start with `#` or `data:image/png|jpeg|webp` (case-insensitive);
  - «حجم ملف SVG أكبر من ٥٠٠ ك.ب» over 512,000 bytes;
  - otherwise null.
- `export function svgIntrinsicSize(text: string): { width: number; height: number } | null`. It reads the root `width`/`height` (unitless or `px`), else the `viewBox` width and height, else null.
- `export function rasterSize(w: number, h: number, maxSide = 1600): { width: number; height: number }`. The longest side is capped at 1600 and the smallest at 1; non-finite or ≤ 0 inputs → `{width:1600,height:1600}`. The rasteriser passes `svgIntrinsicSize(text)` first and uses `naturalWidth`/`naturalHeight` only as the fallback, so a viewBox-only logo keeps its aspect ratio.
- `export function looksLikeSvg(bytes: Uint8Array): boolean`. After an optional BOM and whitespace, the bytes start with `<svg` or `<?xml`.
- `rasterizeSvgLogo(file: File): Promise<Blob>` (browser): read the text → check `svgLogoRejectReason` → `<img src=blob:image/svg+xml>` → draw on a canvas at `rasterSize(naturalWidth, naturalHeight)` → `canvas.toBlob("image/png")`.
  - Over 1 MB → retry at a max side of 1000, else the error «الشعار أكبر من ١ ميجابايت بعد التحويل».
  - A SecurityError (tainted canvas) → «تعذّر تحويل الشعار؛ ارفعه بصيغة PNG».
- The upload sends the PNG exactly as a PNG logo is sent today.
- The server is unchanged except the message: when `sniffLogoImage` fails and `looksLikeSvg`, it answers 415 «ارفع ملف SVG من صفحة الهوية ليُحوَّل تلقائياً إلى PNG».
- Bucket, CHECK and `_verify` unchanged. The screen note reads: «يُقبل SVG ويُحفظ صورة PNG عالية الدقة».

**Steps:**
- [ ] **Failing test** `svgLogo.test.ts`:
  - `svgLogoRejectReason('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>') === null`;
  - `…('<svg><script>alert(1)</script></svg>') === "الشعار يحتوي عناصر غير مسموحة"`;
  - `…('<svg><image href="https://evil.example/x.png"/></svg>')` → the same text;
  - `…('<svg><use href="#a"/></svg>') === null`;
  - `…('<!DOCTYPE svg [<!ENTITY x "y">]><svg/>')` → the same refusal;
  - `rasterSize(400,100)` deepEquals `{width:1600,height:400}`;
  - `rasterSize(0,0)` deepEquals `{width:1600,height:1600}`;
  - `svgIntrinsicSize('<svg viewBox="0 0 300 100"></svg>')` deepEquals `{width:300,height:100}`;
  - `svgIntrinsicSize('<svg width="120px" height="40"></svg>')` deepEquals `{width:120,height:40}`;
  - `svgIntrinsicSize('<svg></svg>') === null`;
  - `looksLikeSvg(new TextEncoder().encode("\uFEFF  <svg/>")) === true`.
- [ ] **Run:** `node --test src/lib/branding/svgLogo.test.ts` → it fails.
- [ ] **Code:** as specified; the input becomes `accept=".png,.jpg,.jpeg,.webp,.svg,image/svg+xml"`.
- [ ] **Verify:** unit, build; then manually: upload a sample SVG in the dev server and check that the stored object is `logo-*.png`.
- [ ] **Commit:** `feat(letterhead): SVG logos accepted — vetted and rasterised to PNG in the browser, never stored as SVG (q346)`

**Alternative (STOP-POINT if chosen instead):** server-side sanitising or rasterising. It needs `dompurify` + `jsdom`, or `sharp` moved from devDependencies to dependencies. **Not chosen.**

### Task 22: q343 — the verification card (SQL)

**Files:**
- create `supabase/migrations/20261103_69_letterhead_verify_card.sql`;
- create `supabase/tests/rls/letterhead_verify_card.test.sql`;
- `_verify.sql` (block `verify:letterhead_verify_card`).

**Interfaces:**
- **New `branding_vaults` columns.** No session grant is added; the 63 column grants stay exactly as they are:
  - `verify_token text unique check (verify_token ~ '^[a-z2-7]{32}$')`;
  - `qr_verify_card boolean not null default true`.
- **`public.letterhead_verification_card(p_token text) returns jsonb`.** SECURITY DEFINER, STABLE, `search_path ''`. EXECUTE: service_role only.
  - Returns `{"state":"home"}` unless all of these hold:
    - the token matches the shape and a vault has it;
    - `lawyer_user_id` is not null;
    - `qr_verify_card` is true;
    - `lawyer_profiles.verification_status = 'verified'`.
  - Then it returns `{"state":"card","name": coalesce(nullif(display_name_ar,''), profiles.display_name),"licence": lawyer_profiles.license_number,"published": <verified and marketplace_visible>,"slug": <slug when published else null>}`.
  - It never returns the user id, the phone or the e-mail.
- **`public.mint_letterhead_verify_token(p_vault uuid, p_token text) returns text`.** SECURITY DEFINER, service_role only. It sets the token only `where verify_token is null`, and returns the stored token.

**Steps:**
- [ ] **Failing test.**
  - Chain: the `branding_vault.test.sql` chain, `prelude_lawyer_profiles_live.sql`, `20261016_10`, `20261025_50` as needed for `lawyer_profiles` columns, then 69 twice.
  - Asserts:
    - **T1:** a verified, unpublished lawyer with a minted token → `state card`, the name, the licence `'12345'`.
    - **T2:** `qr_verify_card=false` → `state home`.
    - **T3:** an unverified lawyer → `home`.
    - **T4:** an unknown token `'aaaa…'` (32 characters) → `home` (the same answer as T2: no oracle).
    - **T5:** a firm vault with a token → `home`.
    - **T6:** a second mint → the first token is kept.
    - **T7:** a session `update branding_vaults set qr_verify_card=false` → 42501 (no column grant); likewise `verify_token`.
    - **T8:** anon cannot EXECUTE either function.
    - **T9:** the returned JSON has no key `user_id`, `email` or `phone`.
  - **Negative control:** remove the `verification_status = 'verified'` test → T3 must FAIL.
- [ ] **Run** → it fails.
- [ ] **Code:** the migration; the final SELECT `ok = coalesce(2 columns exist and authenticated lacks UPDATE on both and 2 functions are service-only, false)`.
- [ ] **Verify:** Docker, plus `branding_vault.test.sql` re-run with 69 appended.
- [ ] **Commit:** `feat(letterhead): verification-card token and switch, server-only (q343) — 20261103_69`

### Task 23: q343 — the card page, the QR target and the privacy switch

**Files:**
- modify `src/lib/branding/letterheadIdentity.ts:55-120` and `letterheadIdentity.test.ts`;
- modify `src/app/api/v1/branding/route.ts` (lawyer GET: mint, and return `verifyCard`);
- create `src/app/api/v1/branding/verify-card/route.ts` (PUT);
- create `src/app/api/v1/letterhead/verify/[token]/route.ts` (public GET);
- create `src/app/verify/[token]/page.tsx` (public, client component);
- add the switch to the lawyer privacy settings (the component that holds the `show_services`/`show_courts` switches; find it with `grep -rln "show_courts" src/app src/components`) and a link from the letterhead page's QR note.

**Interfaces:**
- `BrandingResponse` gains `verifyCard?: { token: string; enabled: boolean } | null`.
- `QrTarget` gains `{ kind: "card"; url: string; caption: string }`.
- `qrTargetFor`: for a lawyer whose `profileShareState` is `unpublished` and verified, AND `verifyCard?.enabled` with a token → `{ kind:"card", url:`${origin}/verify/${token}`, caption: QR_CAPTION_CARD }`, where `QR_CAPTION_CARD = "امسح الرمز للتحقق من بيانات المحامي على منصة نظامي"`. Otherwise it is unchanged (published → profile; the rest → platform).
- `qrNoteAr` for `unpublished` with the card off reads: «الرمز يحمل رابط المنصة لأنك أوقفت بطاقة التحقق من إعدادات الخصوصية».
- **The branding GET (lawyer scope)** mints a token after its RLS read succeeded, and only when verified + unpublished + `qr_verify_card` + no token.
  - The token is 20 random bytes, base32-lowercased, 32 characters.
  - It is minted through `service.rpc("mint_letterhead_verify_token", …)`.
  - On 42703 or PGRST202 the GET skips the card (`verifyCard: null`), which is today's behaviour.
- **`PUT /api/v1/branding/verify-card`.**
  - Body `{ enabled: boolean }`; lawyer scope only (`resolveBrandingCaller("lawyer")`).
  - It ensures the vault (`ensureOwnVault`, the RLS proof), then a service update `qr_verify_card` where `id = vault.id`.
  - It answers `{ enabled }`.
- **The public `GET /api/v1/letterhead/verify/[token]`** calls `service.rpc("letterhead_verification_card", { p_token })` and returns its JSON with `Cache-Control: no-store`.
- **The page** fetches the GET in an effect.
  - `state home` → `router.replace("/")`.
  - `state card` → a small card: the name; «ترخيص رقم {licence}» (Arabic digits); a «موثّق على منصة نظامي» badge; «عرض الملف» when `published`.
  - It sets `robots noindex` and no SSR data.
  - `/verify` is not under any `ROUTE_ACCESS` prefix, so it is public; `/api/v1/letterhead/` is not protected. **Shared files: none.** Confirm at HEAD that `ROUTE_ACCESS` has no `/verify` entry.

**Steps:**
- [ ] **Failing test** `letterheadIdentity.test.ts`:
  - "verified unpublished lawyer with the card on gets the card": `qrTargetFor({scope:"lawyer", profile:{userId:"u1", slug:"s", hasRoleProfile:true, readFailed:false, verificationStatus:"verified", marketplaceVisible:false}, verifyCard:{token:"abcdefghijklmnopqrstuvwxyz234567", enabled:true}}, "https://nezamy.sa")` deepEquals `{kind:"card", url:"https://nezamy.sa/verify/abcdefghijklmnopqrstuvwxyz234567", caption:QR_CAPTION_CARD}`;
  - "card off → platform unpublished": with `enabled:false` → `kind "platform"`, `reason "unpublished"`;
  - "published wins": `marketplaceVisible:true` → `kind "profile"`;
  - "firm never gets a card": `scope:"firm"` → `reason "firm"`.
- [ ] **Run:** `node --test src/lib/branding/letterheadIdentity.test.ts` → it fails.
- [ ] **Code:** as specified. `Letterhead.tsx` needs no change: it draws `identity.qr`.
- [ ] **Verify:** unit, build; in the dev server, `/verify/<bad token>` lands on `/`.
- [ ] **Commit:** `feat(letterhead): barcode of a verified unpublished lawyer opens a short verification card, with a privacy switch (q343)`

### Task 24: q345 — the OOXML writer (fflate, no new dependency)

**Files:** create `src/lib/docx/ooxml.ts` and `src/lib/docx/ooxml.test.ts`.

**Interfaces:**
- `export type DocBlock = { kind: "title"; text: string } | { kind: "heading"; text: string } | { kind: "para"; text: string } | { kind: "list"; items: string[]; ordered: boolean } | { kind: "signature"; lines: string[] };`
- `export function xmlEscape(s: string): string`. It escapes `& < > " '` and strips XML-1.0-invalid control characters (`[\x00-\x08\x0B\x0C\x0E-\x1F]`).
- `export function blocksToBodyXml(blocks: DocBlock[]): string`. It returns `<w:p>` elements only (no `<w:body>`):
  - every paragraph carries `<w:pPr><w:bidi/><w:jc w:val="both"/></w:pPr>`, and the title `w:jc="center"`;
  - every run `<w:rPr><w:rtl/><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Traditional Arabic"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`;
  - the title is `w:b` with sz 36; headings are `w:b` with sz 30;
  - lists are rendered as paragraphs prefixed `١. ` / `• ` (no numbering part);
  - newlines inside text become `<w:br/>`.
- `export function minimalDocx(bodyXml: string, opts?: { headerXml?: string; footerXml?: string; headerRels?: string; footerRels?: string; media?: { name: string; bytes: Uint8Array }[] }): Uint8Array`. The `headerRels` and `footerRels` strings are written to `word/_rels/header1.xml.rels` and `footer1.xml.rels`. It writes `[Content_Types].xml`, `_rels/.rels`, `word/document.xml` (`<w:body>` + bodyXml + `<w:sectPr>` with an A4 page `w:w=11906 w:h=16838`, margins 1440, and header/footer references when given), `word/_rels/document.xml.rels`, `word/styles.xml` (a default RTL paragraph style), the optional `word/header1.xml`, `word/footer1.xml` and `word/media/*`. It zips them with `fflate.zipSync`.
- `export const DOCX_MIME` is re-exported from `brandingAssets.ts`.

**Steps:**
- [ ] **Failing test** `ooxml.test.ts`:
  - `xmlEscape('a<b>&"\x01') === "a&lt;b&gt;&amp;&quot;"`;
  - `blocksToBodyXml([{kind:"para", text:"مرحبا"}])` contains `<w:bidi/>` and `<w:rtl/>` and `مرحبا`;
  - "a valid package": `unzipSync(minimalDocx(blocksToBodyXml([{kind:"title", text:"لائحة"}])))` has the keys `[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`, `word/styles.xml`; and `document.xml` contains `<w:pgSz w:w="11906" w:h="16838"/>` and `لائحة`;
  - "header referenced when given": with `headerXml` → `document.xml` contains `w:headerReference`, and the rels contain `header1.xml`;
  - "no macro content type": `[Content_Types].xml` does not contain `macroEnabled`.
- [ ] **Run:** `node --test src/lib/docx/ooxml.test.ts` → it fails.
- [ ] **Code:** the module (imports `fflate`, which `node --test` resolves from node_modules).
- [ ] **Verify:** unit; then manually open a generated file in Word or LibreOffice once and record the result in the commit body.
- [ ] **Commit:** `feat(letterhead): OOXML writer for real .docx files, RTL Arabic, using fflate (q345)`

### Task 25: q345 — the letterhead in the .docx (uploaded template or generated)

**Files:** create `src/lib/docx/letterheadDocx.ts` and `src/lib/docx/letterheadDocx.test.ts`.

**Interfaces:**
- `export function mergeIntoTemplate(templateBytes: Uint8Array, bodyXml: string): { ok: true; bytes: Uint8Array } | { ok: false; reason: "not_docx" | "no_body" | "macro" }`.
  1. `unzipSync`. A missing `word/document.xml` → `not_docx`. A `[Content_Types].xml` containing `macroEnabled` → `macro`.
  2. In `document.xml`, find `<w:body>` and the LAST `<w:sectPr` before `</w:body>`. Either one missing → `no_body`.
  3. Replace everything between them with `bodyXml`, keeping the template's `<w:sectPr>…</w:sectPr>` (its header and footer references).
  4. `zipSync` every other entry unchanged.
- `export function generatedHeaderXml(identity: LetterheadIdentity, logoRelId: string | null): string`.
- `export function generatedFooterXml(stampText: string, qrRelId: string | null, caption: string): string`.
- Both are RTL paragraphs, with an inline `<w:drawing><wp:inline>…<a:blip r:embed="…"/>` for the image. The logo is 2.5 cm tall and the QR 2.2 cm, in EMU: 1 cm = 360000.
- **Image relationships.** An `r:embed` inside a header or footer resolves against THAT part's rels.
  - The logo's relationship goes in `word/_rels/header1.xml.rels` (target `media/logo.png`).
  - The QR's goes in `word/_rels/footer1.xml.rels` (target `media/qr.png`).
  - `document.xml.rels` holds only the header and footer relationships.

  `minimalDocx` (Task 24) therefore takes `headerRels` and `footerRels` too.
- **Content types.** `[Content_Types].xml` gets `<Default Extension="png" ContentType="image/png"/>` plus `<Override>` entries for `/word/header1.xml` (`…wordprocessingml.header+xml`) and `/word/footer1.xml` (`…wordprocessingml.footer+xml`).
- `export function buildLetterheadDocx(input: { blocks: DocBlock[]; identity: LetterheadIdentity; template?: Uint8Array | null; logoPng?: Uint8Array | null; qrPng?: Uint8Array | null }): { bytes: Uint8Array; usedTemplate: boolean; note: string | null }`.
  - **With a template:** merge it. If the merge fails, generate instead, with note «تعذّر استخدام قالب Word المرفوع؛ استُخدمت ترويسة المنصة».
  - **Without one:** `minimalDocx` with the generated header, the footer and the media.

**Steps:**
- [ ] **Failing test** `letterheadDocx.test.ts`. Fixtures are built in the test with `minimalDocx`, never from the owner package.
  - "keeps the template's header": the template is `minimalDocx(blocksToBodyXml([{kind:"para", text:"OLD"}]), {headerXml:"<w:hdr…>HEAD</w:hdr>"})`. After merging `[{kind:"para", text:"جديد"}]`: `document.xml` contains `جديد`, does not contain `OLD`, still contains `w:headerReference`; and `word/header1.xml` is byte-identical.
  - "refuses macro templates": a template whose content types contain `macroEnabled` → `{ok:false, reason:"macro"}`.
  - "falls back when no body": `buildLetterheadDocx({..., template: <zip without word/document.xml>})` → `usedTemplate false` and note `"تعذّر استخدام قالب Word المرفوع؛ استُخدمت ترويسة المنصة"`.
  - "generated header names the office": `generatedHeaderXml({nameAr:"مكتب العدل", licenceLine:"ترخيص رقم ١٢٣", contacts:[], logoUrl:null, accent:"#C8A762", nameEn:"", qr:…}, null)` contains `مكتب العدل` and `ترخيص رقم ١٢٣`.
  - "media written in the right rels": with `logoPng = Uint8Array.of(0x89,0x50,0x4e,0x47)` and no template:
    - the zip has `word/media/logo.png`;
    - `word/_rels/header1.xml.rels` contains `media/logo.png`, and `word/_rels/document.xml.rels` does NOT;
    - `[Content_Types].xml` contains `Extension="png"`, `PartName="/word/header1.xml"` and `PartName="/word/footer1.xml"`;
    - with `qrPng` as well, `word/_rels/footer1.xml.rels` contains `media/qr.png`.
- [ ] **Run:** `node --test src/lib/docx/letterheadDocx.test.ts` → it fails.
- [ ] **Code:** the module.
- [ ] **Verify:** unit; manually open a merged file built from a real office template (any .docx with a header) in Word once.
- [ ] **Commit:** `feat(letterhead): .docx on the office letterhead — merge into the uploaded Word template or generate header/footer (q345)`

### Task 26: q345 — the export bar, the export kit and the print-PDF path

**Files:**
- modify `src/app/api/v1/branding/route.ts` (GET adds `letterheadDocxUrl`, signed for 600 s, from `readVaultForPrint().docxPath`, Task 9);
- modify `src/components/letterhead/useLetterhead.ts` (expose `letterheadDocxUrl`);
- create `src/components/letterhead/LetterheadExportBar.tsx`;
- create `src/components/letterhead/LetterheadPrintDocument.tsx`;
- create `src/components/letterhead/exportKit.ts` (browser helpers);
- create `src/app/api/v1/branding/export-file/route.ts` (same-origin bytes of the logo and template, print-gated);
- create `src/lib/docx/exportPolicy.ts` and `exportPolicy.test.ts` (pure).

**Interfaces:**
- `export function letterheadScopesFor(user: { userType: string | null; affiliation?: { entityType?: string } | null }, firmPrint: boolean): ("lawyer" | "firm")[]`:
  - a `lawyer` gets `["lawyer"]`, plus `"firm"` when he is a firm member with `firmPrint`;
  - a `firm` account gets `["firm"]`;
  - everyone else gets `[]` (the bar is not rendered; individuals keep today's buttons).
- `<LetterheadExportBar title: string; blocks: DocBlock[]; filename: string />`:
  - a scope select when there are 2 scopes;
  - «Word على الورق الرسمي (.docx)» → `exportKit.downloadDocx`;
  - «طباعة / حفظ PDF على الورق الرسمي» → mounts `LetterheadPrintDocument` and calls `window.print()`;
  - a note when the office has uploaded a PDF letterhead: «ملف PDF المرفوع لا يُدمج؛ تُطبع ترويسة الهوية».
- `exportKit.downloadDocx({ blocks, identity, docxUrl, logoUrl, qr })`:
  - **Fetching the bytes.** The template and the logo bytes are fetched through a same-origin route, `GET /api/v1/branding/export-file?scope=…&kind=logo|letterhead_docx`. It applies the same `letterhead.print` gate and `readVaultForPrint`, and streams the object with the service role. The browser never fetches the storage URL on `auth.nezamy.sa`, so there is no CORS dependency and no tainted canvas.
  - **Converting the logo.** The logo bytes → `Blob` → `createObjectURL` → `<img>` → canvas → PNG (webp/jpg → png).
  - makes the QR PNG with `qrcode.toDataURL(qr.url)`;
  - calls `buildLetterheadDocx`, then a Blob download of `${filename}.docx` with `DOCX_MIME`;
  - when it fails: «تعذّر إنشاء ملف Word — انسخ النص».
- `LetterheadPrintDocument` portals a `LetterheadSheet` with the blocks rendered as `<h1>/<h2>/<p>/<ol>` under `<body>`. It uses its own root id, `nz-letterhead-export-print-root`, and the same print CSS pattern as `LetterheadWorkspace.tsx:58-67`. `LetterheadWorkspace` is not edited.

**Steps:**
- [ ] **Failing test** `exportPolicy.test.ts`:
  - `letterheadScopesFor({userType:"lawyer", affiliation:{entityType:"firm"}}, true)` deepEquals `["lawyer","firm"]`;
  - `(…, false)` deepEquals `["lawyer"]`;
  - `letterheadScopesFor({userType:"firm"}, true)` deepEquals `["firm"]`;
  - `letterheadScopesFor({userType:"individual"}, true)` deepEquals `[]`.
- [ ] **Failing test (route source):** `src/app/api/v1/branding/route.test.ts` asserts that the GET body includes `letterheadDocxUrl` and signs it only after `readVaultForPrint`.
- [ ] **Run** → it fails.
- [ ] **Code:** as specified. The firm scope's `firmPrint` comes from `GET /api/v1/branding?scope=firm` returning 200 with `permissions.print`.
- [ ] **Verify:** unit, build.
- [ ] **Commit:** `feat(letterhead): export bar — real .docx and print-to-PDF on the lawyer's or the firm's letterhead (q345)`

### Task 27: q345 — wire the bar into the three live tools

**Files:**
- modify `src/components/draft/legalDraft.ts` (add `pleadingBlocks(p: Pleading): DocBlock[]`; `pleadingWordHtml` stays for non-letterhead users);
- modify `src/components/draft/steps/StepAiDraft.tsx:96-101,299-310`;
- modify `src/app/ai/legal-opinion/_components/AiOpinionPanel.tsx:146-168` and its pure helper module (add `consultAnswerBlocks` and `letterDraftBlocks` next to `asConsultAnswer` / `asLetterDraft`);
- modify `src/app/ai/contract-drafter/_components/StepContractResult.tsx` (add a `contractBlocks(...)` helper beside the page's draft type);
- modify the existing tests of those helpers, where they exist (`legalDraft.test.ts`, `src/app/ai/legal-opinion/aiPath.test.ts`).

**Not touched** (dead or mock; F-12): `ResultView.tsx`, `LetterWorkflow.tsx:946-952`, `StepApproval.tsx`, `StepDrafting.tsx`. **Coordination:** Wave 4 sections may edit `StepAiDraft.tsx`, `AiOpinionPanel.tsx` and `StepContractResult.tsx`; the controller sequences them.

**Interfaces:**
- `pleadingBlocks(p)` = `[{kind:"title",text:p.title}, ...sections.flatMap(s => [{kind:"heading",text:s.heading},{kind:"para",text:stripMarkers(s.body)}]), ...(requests.length ? [{kind:"heading",text:"الطلبات"},{kind:"list",ordered:true,items:requests}] : [])]`.
- The other two helpers follow the same shape from their typed outputs. The source markers are stripped, and citations are not printed as raw markers.
- Each tool renders `<LetterheadExportBar title=… blocks=… filename=…/>` beside its existing actions. `letterheadScopesFor` returns `[]` for clients, so nothing changes for them.

**Steps:**
- [ ] **Failing test** in `legalDraft.test.ts`, "pleading blocks": for `{title:"لائحة دعوى", sections:[{heading:"الوقائع", body:"نص [S1]"}], requests:["إلزام المدعى عليه"], citation_check:[]}` → deepEquals `[{kind:"title",text:"لائحة دعوى"},{kind:"heading",text:"الوقائع"},{kind:"para",text:"نص"},{kind:"heading",text:"الطلبات"},{kind:"list",ordered:true,items:["إلزام المدعى عليه"]}]`. Check the `stripMarkers` output shape at HEAD and pin its exact result. Matching tests cover `consultAnswerBlocks` and `letterDraftBlocks` with one fixture each.
- [ ] **Run:** `node --test src/components/draft/legalDraft.test.ts src/app/ai/legal-opinion/aiPath.test.ts` → it fails.
- [ ] **Code:** the helpers and the three wirings.
- [ ] **Verify:** unit, build; manually in the dev server (`run` skill), as a lawyer and as a firm member with an `allow` row, export one draft to .docx and to PDF from each tool.
- [ ] **Commit:** `feat(letterhead): the drafter, the legal opinion and contract pro export .docx and PDF on the official letterhead (q345)`

### Task 28: Section close — the SQL run order and the full Docker sweep

**Files:**
- create `SQL_batch_2026-11-03_owner_free/S4_README.md` (or the folder the controller names). It lists the 10 files in run order, BEFORE/AFTER the deploy, the re-run chains (§2) and the `_verify` blocks to run by hand.

**Steps:**
- [ ] Run every new Docker test once more in one sweep, plus the touched old ones: `create_lawyer_invoice`, `invoice_collections`, `branding_vault`, `branding_assets`, `accounts_firms_owner_answers`, `consultant_court_write_guard`, `notes_visibility_case_team` and `entity_members_no_recursion`, each with this section's migrations appended. All of them pass.
- [ ] `npm run test:unit` (only the 6 known CRLF failures); the build command.
- [ ] `detect_changes()` (GitNexus). Confirm that only the symbols named in Tasks 1–27 changed.
- [ ] **Commit:** `docs(firms): S4 SQL run order and verification`

---

## Stop points

**The design as planned needs no new npm dependency and changes no RLS policy on an existing table.** Three things take the place of RLS changes:
- the print grantee uses a definer RPC;
- firm finance reads use the service role after a SQL permission check;
- the card switch is a server-only column.

The only privilege-adjacent changes are trigger additions on `firm_profiles`, `hearings`, `case_stages` and `deadlines`, and widened CHECKs.

Each item below becomes a `STOP-POINT` only if the reviewer picks the alternative over the planned design:

| # | Alternative | Why it is a STOP-POINT |
|---|---|---|
| SP-1 | Task 9: widen `can_manage_branding_vault` to print grantees | RLS on `branding_vaults`, `branding_assets` and storage (also grants write) |
| SP-2 | Task 16/17: widen the `invoice_collections` SELECT policy for firm finance | RLS on an existing table |
| SP-3 | Task 21: server-side SVG sanitise or rasterise (`dompurify` + `jsdom`, or `sharp` to dependencies) | new or moved npm dependency |
| SP-4 | Tasks 24–25: the `docx` npm package instead of the fflate OOXML writer | new npm dependency |

## Estimate

- **28 tasks.**
- **About 14 working days for one developer:**
  - F2: 2 days;
  - F3: 4.5 days;
  - F4: 3.5 days;
  - F5: 4 days, including the Docker sweep.
- **Order:**
  - T1–T5 (independent);
  - then T6–T7 (the base);
  - then T8, T9, T10–T11, T12–T13;
  - then T14–T15, T16–T18, T19–T20 (T19 needs T16);
  - T21–T27 can start once T7 and T9 are in (T26 needs T9).

## Excluded (each blocked by an open owner question)

| Item | Blocking question |
|---|---|
| q354: optional 15% VAT and a VAT number on firm invoices (needs the «بيان أتعاب — ليست فاتورة ضريبية إلكترونية» wording or a Fatoora integration) | **٤٣٠** |
| Firm case access model: restrict to the case team, and co-counsel from another firm. q350 here changes the lead only and leaves visibility as it is. | **٤٢٨** |
| Murshid bundle: 15 channels, 61 cards, 243 Najiz classifications (corrections 1–10 and the version), 862 circuits (q384), the 363 agency cards, and the urgent-cassation 10 days (q348, the Art. 194 text) | **٤٢٩** |

**Not excluded, already done or no code:**
- q342 (no auto-renewal exists; it is on the B2 checklist);
- q347, q351, q352, q357, q358 and q386, built in Wave 1 (main `1103812d`);
- q353, already done;
- q360 and q389, not code.
