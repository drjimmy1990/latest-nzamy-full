# Owner package 2026-10-30: accounts, firms, freezes (٣٠٧–٣١٣)

**Source:** `Nezamy-Developer-Handoff-2026-10-30/05-traceability/developer-questions-299-321.csv`, rows ٣٠٧–٣١٣. The owner chose option (أ) in every row. The package was read only and nothing in it was run.

**Background:** these seven rows answer the open questions of D6 (`docs/plans/2026-10-26-D6-account-deletion-design.md` §4). D6 is `20261026_70_account_deletion.sql`, which is live on prod since the 26-Oct batch. The mapping is:

| Owner row | D6 question |
|---|---|
| ٣٠٧ | Q1 |
| ٣٠٨ | Q2 |
| ٣٠٩ | Q3 |
| ٣١٠ | Q4 |
| ٣١١ | Q5 |
| ٣١٢ | Q7 |
| ٣١٣ | Q8 |

Each answer was re-checked against the code at `235e1bef` before anything changed.

**Branch:** `fix/owner-30oct-accounts-firms`

**Commits:**
- `8b7f02f3`: code, SQL and tests.
- The docs commit that adds this ledger and the Arabic note.

**SQL:** one file. It can run before or after the deploy.

| | |
|---|---|
| Path | `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\SQL_batch_2026-10-30_accounts_firms\10_ANY_TIME_20261030_10_accounts_firms_owner_answers.sql` |
| Same as | `supabase/migrations/20261030_10_accounts_firms_owner_answers.sql`, byte for byte (a unit test checks this) |
| Steps | `SQL_batch_2026-10-30_accounts_firms/README.md` |

## Summary

| id | Verdict | One line |
|---|---|---|
| ٣٠٧ | **fixed now** (the server was already enforcing it; the UI was not honest) | Refused until ownership is transferred, admin may freeze, purge suspended: all already true. The copy promised «انقل الملكية» with no screen behind it. Fixed, and the refusal is now shown up front. |
| ٣٠٨ | **fixed now** | `original_author_id` added (mandatory, pinned, survives the purge). The private note already moved to the owner and stayed private. |
| ٣٠٩ | **already enforced** | Keep rule (c) of 20261026_70. Re-proved, plus a unit test that the kept file still downloads. |
| ٣١٠ | **already enforced + hardened now** | Invoices were never deleted by an account deletion. Now no path can delete a paid one, and the buyer snapshot is protected and carries the national address. |
| ٣١١ | **already enforced** | Only `firm_members` drives the transfer. Re-proved in Docker; the Settings copy now says it. |
| ٣١٢ | **fixed now, with one decision open** | Before, it held only by accident and only on the owner's own session. Now it is a rule on every path. *Open:* how a consulting office is marked (see Q-A). |
| ٣١٣ | **fixed now** (the copy) | The DB and the frozen page were right. The gates' 403 text told an admin-frozen user to restore himself. Fixed. |

## Per answer

### ٣٠٧: deleting the account of an owner whose entity has members
**Answer (أ):**
- The deletion is refused until ownership is transferred.
- The administration may freeze the account, and its permanent deletion is suspended.
- The transfer screen is scheduled for later, and the UI must not promise it before it exists.

**Found** (20261026_70):
- `request_account_deletion` refuses with 55000 `ACCOUNT_DELETION_ENTITY_OWNER:<kind>`. This covers firm, business, government and ngo.
- The admin freeze (`account_deletion_request_for`) is allowed.
- The purge stops at `account_purge_prepare` (`blocked: entity_owner`). The `auth.users` trigger refuses (42501) even a direct delete.
- A blocked request is never claimed again, so the account stays frozen and the deletion stays suspended.

**Gaps:**
1. `deletionErrorAr` said «انقل الملكية أو أخرج الأعضاء أولاً». That promised a transfer the platform cannot do.
2. Settings showed the full delete form to an entity owner and refused only after he typed the phrase.
3. The frozen page of a blocked or entity-owner account still announced «في … يُحذف الحساب نهائياً».
4. The admin's blocked «حذف نهائي الآن» gave a generic reason.
5. The admin confirm text did not mention the suspension.

**Change:**
- `entityOwnerBlockAr` replaces the refusal text. It says the transfer is required, that it is «غير متاح في المنصة بعد», and to contact support.
- New SQL function `account_deletion_owner_block()`. It is `authenticated`, uses `auth.uid()` only, and returns the caller's own block.
- `GET /api/v1/me/account-deletion` returns `ownerBlock` (null before the SQL runs).
- Settings shows the refusal in place of the button.
- The frozen page uses `deletionSuspendedAr` («الحذف النهائي موقوف…») for `status = blocked` or an entity owner.
- The admin route uses `purgeBlockedAr(run.reason)`.
- Both admin confirm prompts state the suspension and that no transfer screen exists yet.

**Files:**
- `src/lib/auth/accountFreeze.ts`
- `src/lib/accountDeletion/accountDeletionServer.ts` (`readOwnerBlock`)
- `src/app/api/v1/me/account-deletion/route.ts`
- `src/app/settings/components/tabs/AccountDeletionPanel.tsx`
- `src/app/account-frozen/page.tsx`
- `src/app/api/v1/admin/users/[id]/route.ts`
- `src/app/dashboard/admin/users/page.tsx`
- SQL §3

**Tests:**
- Unit (`ownerAnswers30Oct.test.ts`): the refusal copy for every kind and for both DB message shapes, never «انقل الملكية»; `readOwnerBlock` (missing function, failure, throw and odd answer all give null); the wiring of route, panel, page and admin.
- Docker T4: O2 is told `firm`, a client gets null, a session cannot ask about another account, and anon cannot ask at all.
- Docker T5: a company owner with a team gets `business` and is refused with 55000.

**Check live:**
1. Sign in as a firm owner who has an active member and open Settings → الأمان. Expect the amber message and no «أريد حذف حسابي» button.
2. As admin, freeze that owner, then try «حذف نهائي الآن». Expect a 409 with «موقوف حتى نقل الملكية — ولا شاشة لنقل الملكية بعد», and the account stays frozen.
3. The owner's `/account-frozen` page then says «الحذف النهائي موقوف…».

### ٣٠٨: a member's «private» notes on a firm case
**Answer (أ):**
- The notes stay and pass to the firm owner as his own private notes.
- The original author is recorded, and `original_author_id` is mandatory.

**Found:**
- `transfer_firm_assets` already moved every visibility of `case_notes` to the owner, private included, and the note stayed private. The owner reads it through the `author_user_id` arm.
- The author was recorded only in the `firm_asset_transfers` trail. There was no `original_author_id` column.

**Change (SQL §1):**
- `original_author_id uuid` on `case_notes`, `dashboard_notes`, `lawyer_client_notes` and `consultation_notes`. These are the four note tables the transfer moves.
- Backfill:
  - A note already moved takes the member from its earliest trail row.
  - Every other note takes its `author_user_id`.
  - The tables' enabled triggers are switched off for the fill only and switched back on in the same transaction, so no «آخر تعديل» moves. The verify block raises if any trigger stays disabled.
- Then `NOT NULL` (every author column is NOT NULL). It has no FK, so it survives the author's purge.
- `trg_note_original_author` sets it to the author on insert, whatever the writer sends, and never changes it on update, not even for the service role.
- No route sends or reads the column. A unit test checks that no file in `src/` mentions it, so a deploy before the SQL cannot break an insert.

**Files:** SQL §1; `supabase/tests/rls/prelude_accounts_firms_before.sql` (the prod-like state before the file).

**Tests (Docker):**
- T1: a private note moved before the file names L2, is O2's, is still private, and its `updated_at` is unchanged (2026-01-01). It is NOT NULL with no FK.
- T1b:
  - O2 reads and edits the inherited note.
  - A session cannot write the column: 20261025_51 grants UPDATE on body, visibility and firm_id only.
  - An insert cannot choose the author.
  - An active colleague cannot read the owner's private note.
- T1c: the service role cannot rewrite it.
- T2: a member removed and then purged after the file. His private case note and his dashboard note on the firm case are O2's, still private, and name him.

**Check live:**
1. Run the SQL. The SELECT row shows `notes_without_author = 0`.
2. Remove a test member who has a «خاصة بي فقط» note on a firm case, then as the owner open the case notes.
3. Expect the note visible to the owner alone.
4. In the SQL editor, `select author_user_id, original_author_id from case_notes where id = '<note>'` shows owner and member.

**Not done** (the UI is off limits here): the case-notes screen does not yet show «كتبها في الأصل: …». Only a uuid is kept, so the name is gone after the author's purge (Q-B).

### ٣٠٩: documents on a shared case
**Answer (أ):** they stay for the other party, as in the earlier fix for a departing member's files.

**Verdict: already enforced.**
- Keep rule (c) of 20261026_70 sets `owner_user_id := null` on the deleted user's documents on a case with another participant (or under legal hold). It runs in the `auth.users` BEFORE DELETE trigger, in the delete's own transaction.
- The row and its bytes stay:
  - `account_purge_storage_paths` never lists a path a surviving row uses;
  - the other party downloads through `/api/v1/service-requests/[id]/attachments/[attachmentId]`, which checks participation and the recorded `folder_owner_id` (20261026_72).
- A departing member's firm-case documents move to the firm owner. That is the earlier fix the answer cites.

**Change:** none.

**Tests:**
- Existing Docker (`account_deletion.test.sql`), re-run green on top of 20261030_10:
  - T7c: I's document on C's case is kept for C;
  - T7d: never listed for removal;
  - T13: a client's document on a firm case is kept for the firm.
- New unit test: a detached row (owner null, folder recorded) is still served from the uploader's folder, and a row with neither is not.

**Check live:** as admin, purge a test lawyer who uploaded a file to a test client's case. Then as the client, download it from the case.

### ٣١٠: buyer data on invoices
**Answer (أ):** kept with no expiry; the legal minimum is 6 years. Deleting an account never deletes a tax-invoice row.

**Found (already enforced):**
- `payment_orders.user_id` is ON DELETE SET NULL (20261022_10), so the account deletion never deleted an invoice.
- Keep rule (d) writes `metadata.buyer_snapshot` (name, email from `auth.users`, user_type) on every paid or refunded order.
- Nothing purges `payment_orders`.
- The lawyer finance invoices (`payments`) hang off `service_requests`, whose user keys are all SET NULL, so they also survive.
- Office `receipts` keep `payer_name` (SET NULL keys).

**Hardened now (SQL §4)**, with `trg_payment_orders_keep_tax_invoice` on `payment_orders`:
- BEFORE DELETE refuses (42501 `TAX_INVOICE_KEPT`) a paid or refunded order unless it is test mode (`live = false`). An unpaid order can still go. No code or script deletes orders today; this makes "never" hold on every path.
- BEFORE UPDATE:
  - once `buyer_snapshot` exists, a later write (refund, webhook, a wholesale `metadata =`) cannot drop or edit it;
  - when it is first written, it also takes `profiles.national_address` (20261017_10) when one was given.

No finance screen or route was touched.

**Tests (Docker T6):**
- Paid and refunded orders cannot be deleted; created and test-mode ones can.
- The buyer's deletion keeps both invoices with name, email and national address.
- A later `metadata = '{"refund_job":…}'` keeps the snapshot and the new key.

**SQL check:** the SELECT row shows `invoice_guard = true` and `invoice_fk_set_null = true`.

**Check live:** as a test buyer with a paid test-mode order, nothing changes, because test mode can still be deleted. For a live order, `delete from payment_orders where id = '…'` in the SQL editor answers `TAX_INVOICE_KEPT`. Do it inside `begin; … rollback;`.

### ٣١١: members of a company's legal team
**Answer (أ):** the transfer applies to law firms only. A company team member is an independent account.

**Verdict: already enforced.**
- `transfer_firm_assets` matches only `firm_profiles` and `firm_members`.
- A `business_members` member's rows follow the personal rules when he is deleted.
- The company owner is still covered by ٣٠٧. The answer says «كيان فيه أعضاء», so his deletion is refused while the team has members.

**Change:** copy only. The Settings panel now says a company legal-team member's account is independent and nothing moves to the company.

**Tests (Docker T5):** deleting the team member transfers nothing, his personal note goes, and the company stays. The company owner is refused.

**Check live:** none beyond ٣٠٧.

### ٣١٢: a consulting office (Art. 18) loses a lawyer
**Answer (أ):**
- The lawyer's hearings and appointments stay in his name, and he keeps seeing them, until his account is deleted.
- Then they pass to the office owner for viewing and keeping only, not for representation.

**Found:**
- On a removal the transfer tried to move the hearings.
- When the firm owner's own session did the removal, the Art. 18 guard (20261019_21) refused the move and the transfer swallowed the error. The rows stayed, by accident.
- A removal written by the service role or an admin passed the guard and moved them to the consultant.
- One refused court deadline also kept that lawyer's contract dates back, because it is a single UPDATE.
- "Appointments" are `hearings` rows. The table holds every diary entry: `kind` in judicial, appointment, deadline, gov_review, client_meet or internal (20260903 phase 1). No separate appointments table exists among the 21 specs.
- Other dated rows still move to the owner on removal, deliberately: tasks, consultations (`scheduled_at`) and contracts. They are not court work under Art. 18, and a consulting office's owner may carry them on.

**Change (SQL §2):**
- `firm_member_removed_transfer` marks the removal with a transaction-local setting.
- `firm_asset_specs`' three court rows call `firm_court_rows_stay_with_member(firm)`. It is true only during a removal from an office whose owner's `lawyer_profiles.practice_kind = 'consultant'`. While it is true, `hearings` (every kind: judicial and appointment), `case_stages` and non-contract `deadlines` stay with the lawyer.
- The lawyer keeps seeing them through `can_access_case_row`'s owner arm.
- A contract obligation's date, the notes and the case lead still move.
- On account deletion the setting is empty, so everything moves to the owner. The Art. 18 guard then refuses the consultant owner's edits: view and keep, not plead.
- An advocate firm is unchanged.

**Files:** SQL §2 (`firm_asset_specs` and `firm_member_removed_transfer` are re-created, with 70's list otherwise unchanged; the verify block checks the count of 21); `_verify.sql` (`verify:accounts_firms_owner_answers`).

**Tests (Docker):**
- T3: a service-role removal keeps the hearing, the appointment, the stage and the statutory deadline with R2, while the contract deadline, the note and the case lead move to Q2.
- T3b: R2 still sees both hearings.
- T3c: R2 is purged; all four move to Q2, Q2 can view them, and Q2's edit is refused with 42501.
- T3d: an advocate firm's service-role removal still moves the hearing.
- Negative control 2: re-running 20261026_70 after this file makes T3 fail. That is the re-run trap, which `_verify.sql` reports.

**Open:**
- **Q-A: how is a consulting office marked?**
  - `firm_profiles` has no such field.
  - A consultant signs up as a `lawyer` account, and `handle_new_user` creates `firm_profiles` only for `firm` accounts, so no signup path creates an office whose owner is a consultant.
  - The rule keys on the only signal there is, the one the Art. 18 guard reads. It takes effect the day the platform can represent such an office.
  - The owner must decide how an office is marked as consulting (a firm field set at signup or by admin?).
- **Q-C:** the Art. 18 guard does not cover DELETE, so a consultant owner can still delete a hearing he holds "for keeping". Should a kept court row be undeletable?

**Check live:** none possible until Q-A (no such office exists on prod).

### ٣١٣: lifting an admin freeze
**Answer (أ):** only the administration lifts it. The frozen user sees «تواصل مع الدعم».

**Found (already enforced):**
- `account_deletion_close(p_self_only)` lets the user's own cancel lift only `requested_by = 'self'`.
- A self request the admin then freezes becomes the admin's.
- `/api/v1/me/account-deletion/cancel` answers 409 with `ADMIN_FREEZE_AR`.
- `/account-frozen` shows «تم تجميد الحساب بقرار من الإدارة — تواصل مع الدعم» with no restore button.

**Gap:** the gates' 403 (`ACCOUNT_FROZEN_AR`: proxy API branch, `requireApiUser`, `assertRole`) said «استعده أولاً من صفحة «حسابك مجمّد»» to every frozen account, including an admin-frozen one.

**Change:** the text now covers both cases: restore it there if you asked for it, contact support if the administration froze it. The gates read only the cached copy, which does not say who froze the account, so no gate code changed.

**Files:** `src/lib/auth/accountFreeze.ts`.

**Tests:**
- Unit: the copy, the admin copy, and no restore button on an admin freeze.
- Docker T7: the user cannot lift it and an admin can. The existing D6 T12 also still passes.

**Check live:** as admin, freeze a test account and sign in as it. The page shows the support line and no «استعادة الحساب». Any API call answers the new 403 text.

**Not a freeze:** the admin PATCH `status: "suspended"` cancels subscriptions and sets the tier to free. It does not lock the account and is not covered by ٣١٣.

## Tests run

| What | Result |
|---|---|
| Docker `accounts_firms_owner_answers.test.sql` (the full D6 chain, the prelude, 20261030_10 twice) | **ALL PASS**, T1–T8 |
| Docker `account_deletion.test.sql` (D6) with 20261030_10 applied twice | **ALL PASS**, T1–T16 |
| Negative control 1: the chain without 20261030_10 | fails at T1 (no `original_author_id`), exit 3 |
| Negative control 2: 20261030_10, then 20261026_70 again | `T3 FAIL: a service-role removal moved R2's hearing to the consultant owner`, exit 3 |
| The new `_verify.sql` block, after 20261030_10 | `_verify: 20261030_10 OK` |
| Unit `ownerAnswers30Oct.test.ts`, `accountFreeze`, `accountFreezeGates`, `accountDeletionServer`, `sqlMergeHygiene`, `storagePathOwnership` | 52 / 52 pass |
| Unit, whole suite `src/**/*.test.ts` | 4175 tests: 4168 pass, 7 fail |
| `tsc --noEmit` | 2 errors |

The 7 failing unit tests and the 2 `tsc` errors are not from this branch:
- The failing tests are in 5 files:
  - `_shape.test.ts` (library)
  - `navigation.consultant.test.ts`
  - `libraryAccess.test.ts`
  - `fulfillOrder.test.ts`
  - `trackingWiring.test.ts`
- None of them reads or imports a file this branch changed.
- `aiFiles.test.ts` and both `tsc` errors are `Cannot find module 'pdf-lib'`, which is not installed in the shared `node_modules`.

GitNexus: `impact` returned "not found" for every symbol (the index is stale for this code, as the D6 note recorded), so the risk is UNKNOWN. Callers were checked by grep:
- `deletionErrorAr` has 5 call sites;
- `ACCOUNT_FROZEN_AR` is used by `proxy.ts`, `apiAuth.ts` and `assertRole.ts`, and only its text changed.

`detect_changes` mapped 0 symbols for 9 changed files.

## Open questions for the owner

| | Question |
|---|---|
| **Q-A (٣١٢)** | How is a consulting office marked? A firm field, set at signup or by an admin? Until then the rule applies only to an office whose owner account is a legal consultant, which signup cannot create today. |
| **Q-B (٣٠٨)** | After the original author's account is purged, only his id remains. Should we also keep his name on the note at the moment it moves, so the owner sees «كتبها: فلان»? |
| **Q-C (٣١٢)** | May a consultant owner delete a hearing he holds "for viewing and keeping"? Today he can, because the Art. 18 guard covers only writes. |
| still open from D6 | Q6: B2 auto-renew must skip a frozen account. Nothing charges today. |
