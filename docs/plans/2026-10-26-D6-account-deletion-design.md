# D6: account deletion (owner answer ٢٩٨): design note

Owner decision ٢٩٨ (أجوبة_المالك_٢٧٨-٢٩٨_٢٠٢٦-١٠-٢٦.md, section خامساً):

1. **An independent account** (an individual lawyer or an individual client) that is deleted enters a frozen recovery period of **60 days** ("like Netflix"). After the 60 days it is deleted for good, with its personal documents and notes. The tax invoices the law requires are the exception and are kept.
2. **A member inside a law office or firm** who is deleted or removed: the case files, the office notes and the clients' documents are **never** deleted with the member's account. They stay as firm assets, and their ownership moves to the managing partner (Firm Owner).

GitNexus did not resolve `proxy`, `assertRole` or the admin DELETE handler in this worktree (the index is stale for it). Callers were found with grep instead: `assertRole(` is called in 80 route files, and `requireStaff(`/`requireAdmin(` in 41.

**HIGH risk:** `src/proxy.ts`, `assertRole`, the admin DELETE handler, and the new BEFORE DELETE trigger on `auth.users`. Every one of them is on the sign-in or deletion path.

---

## 1. How deletion works today (before D6)

| Path | What happens |
|---|---|
| Admin «حذف المستخدم» (`DELETE /api/v1/admin/users/[id]`, `users.delete`, super_admin only) | `auth.admin.deleteUser(id)` straight away. Cascades through every FK below. An audit row is written. Self-delete and deleting the last super admin are refused. |
| Settings → الأمان → منطقة الخطر | No self-service. A static panel says «حذف الحساب يحتاج إلى تواصل مع الدعم» and links to /contact. |
| Firm member removal (`PATCH /api/v1/firm/members/[id]` `status: removed`) | The membership row only. The member **keeps** every row he owns. `can_access_case_row(owner, firm)` has an *owner* arm, so a removed member keeps reading and editing the firm rows he owns. That is a live leak, and D6 closes it. |
| 30-day bin (`/api/v1/cron/deadlines` (c)) | Hard-purges soft-deleted vault documents. It skips case documents (20261025_51). |

### What `deleteUser` cascades to

The real list is from `pg_constraint`, read on the Docker chain of this branch (confdeltype `c` = CASCADE, `n` = SET NULL). The migrations add a few more tables that the chain does not load, found by grep.

**CASCADE: deleted with the account.**
- *Firm assets.* Losing these breaks owner rule 2:
  - `case_notes.author_user_id`
  - `attachments.owner_user_id`: the case documents, and their storage bytes become orphans
  - `hearings`, `tasks`, `case_graphs`, `deadlines`, `deadline_rules`, `case_tracking_links`: each on `owner_user_id`
  - `lawyer_clients.owner_user_id`: the firm's client cards
  - `lawyer_client_notes`, `consultation_notes`, `dashboard_notes`: each on `author_user_id`
- *Entities.* `firm_profiles.owner_user_id` deletes **the whole firm**: its `firm_members` and `case_team_members`, and `firm_id` is nulled on every case row. `business_profiles`, `government_profiles` and `ngo_profiles` do the same.
- *Personal.* These may go:
  - `profiles` → `lawyer_profiles`, `provider_profiles`, `micro_profiles`
  - `subscriptions`, `credit_transactions`, `points_ledger`, `points_lots`, `wallet_transactions`
  - `library_access_grants`, `payment_methods`, `notifications`, `notification_outbox`, `user_settings`
  - `research_sessions`/`items`, `law_article_notes`, `law_draft_carts`, `library.smart_folders`, `work_sessions`, `feature_requests`
  - `community_*`, `groups`/`group_members`, `chat_messages`/`chat_participants`
  - `reviews`, as reviewer and as reviewee
  - `document_shares`, `case_share_tokens`, `referrals.referrer_id`, `promo_links`, `coupon_usage`, `entitlement_requests.user_id`, `platform_staff`, `test_accounts`
- *Financial, worth a note:* `escrow_transactions`, as buyer and as seller. Escrow is not live (it is the owner's open Escrow decision), so nothing is lost today.

**SET NULL: the row survives without its person.**
- `service_requests.requester_user_id` and `assigned_to`, which means a firm case loses its lead.
- `consultations.requester_user_id` and `lawyer_user_id`.
- `contracts.owner_user_id` and `client_user_id`.
- `case_stages.owner_user_id`, `tasks.assignee_user_id`, `activity_events`.
- `contract_versions.uploaded_by`, `legal_ledger_entries.created_by`, `receipts.issued_by`.
- **`payment_orders.user_id`.** The invoice row survives, but nothing on it says who bought.
- `support_tickets.user_id`, `ai_review_requests`, the library issue reports, `community_reports.reporter_user_id`, `messages.sender_user_id`, `admin_audit_events.actor_id`.

**NO ACTION: blocks the delete.** There is exactly one in the migrations: `entitlement_requests.decided_by`. Every account (an admin) that ever decided an entitlement request cannot be deleted. 20261026_70 turns it into SET NULL. Prod may hold hand-applied FKs that the repo cannot see, so the README gives the user a read-only `pg_constraint` query to run first. The purge also records a `23503` on the request and stops retrying it.

### Last batch's soft delete (20261025_51)

Case notes and case documents are archived, never hard-deleted, by sessions. Its header already names the gap D6 closes: "Deleting an ACCOUNT … cascades: case_notes.author_user_id and attachments.owner_user_id are ON DELETE CASCADE … Changing those keys is an owner decision." ٢٩٨ is that decision.

The trigger `case_record_archive_stamp` pins `request_id`/`storage_path` of a case document. It does **not** pin `owner_user_id` or `author_user_id`, so a transfer may rewrite them.

### Storage (`documents` bucket, private)

The object keys are:
- `{uid}/{ts}-{name}`: attachments, which are vault documents **and** case documents
- `{uid}/notes/…`: `law_article_notes.audio_path`
- `{uid}/contracts/{contract}/…`: `contract_versions.storage_path`
- `licences/{uid}/…`: `lawyer_profiles.licence_image_path`

A firm-case document uploaded by a member lives under **the member's own folder**. So the purge must **never delete by prefix**. It deletes only the paths that no kept row references. A kept row means an attachment of someone else or with no owner, a contract version, or anything `storage_object_is_case_document()` holds.

### Payments and tax invoices

- `payment_orders` (Moyasar) carries `receipt_number`, the amounts and VAT. It carries no buyer snapshot.
- The receipt pages (`billingView`, `resultView`) render no buyer fields today.
- The office `receipts` keep their own `payer_name`.
- No ZATCA e-invoice is issued yet.
- Nothing auto-renews: `auto_renew` is false, and renewals arrive with B2.

---

## 2. The firm model, and what a "firm asset" is

- **Firm Owner / managing partner** = `firm_profiles.owner_user_id`. The trigger `ensure_firm_owner_membership` (20260903_phase2) also makes him a `managing_partner` row in `firm_members`. `FIRM_ROLE_ALLOWED_ITEMS`/`managing_partner` in the navigation is the same person.
- **The case anchor** is a `service_requests` row. A firm case has `service_requests.firm_id`.
- **A firm asset** is a row that is owned or written by the departing member **and** belongs to firm F. It belongs to F either through its own `firm_id` or through its case (`service_requests.firm_id`). The transfer covers these columns:

| table | columns moved to the firm owner | firm from |
|---|---|---|
| service_requests | requester_user_id, assigned_to | firm_id |
| case_stages, hearings, deadlines, case_graphs, case_tracking_links, activity_events | owner_user_id | firm_id, else the case's firm |
| tasks | owner_user_id, assignee_user_id | firm_id, else the case's firm |
| deadline_rules | owner_user_id. A rule whose code the owner already has is skipped: per-owner unique code | firm_id |
| lawyer_clients | owner_user_id | firm_id |
| lawyer_client_notes | author_user_id | firm_id |
| consultations | lawyer_user_id, requester_user_id | firm_id |
| consultation_notes | author_user_id | the consultation's firm |
| contracts | owner_user_id | firm_id |
| case_notes | author_user_id (every visibility, private included; see Q2) | firm_id, else the case's firm |
| attachments | owner_user_id | the case's firm |
| dashboard_notes | author_user_id: notes on a firm case, or a non-private note with firm_id | as left |

Every move writes one row to `public.firm_asset_transfers`: table, row, column, the original user, the new user, the firm, the reason, and when. Nothing is lost about who wrote what. The table has no FKs, so a purge never rewrites it. The firm owner reads the rows addressed to him.

Membership rows (`case_team_members`, `firm_members`) are access, not assets, and they are not moved.

---

## 3. The plan

### Data model: `supabase/migrations/20261026_70_account_deletion.sql`

- **`public.account_deletion_requests`**
  - Columns:
    - `id`, and `user_id uuid` with **no FK**, so the purged record survives
    - `status` in requested / purging / blocked / cancelled / purged
    - `requested_at`, and `purge_after`, set by trigger to `requested_at + 60 days`, with CHECK `purge_after > requested_at`
    - `requested_by` (self / admin) and `requested_by_user`
    - `reason`, ≤ 500 characters
    - `cancelled_at`/`cancelled_by`
    - `purge_started_at`, `purged_at`, `purge_report jsonb`, `last_error`
    - `prior_listing jsonb`: the `marketplace_visible` values before the freeze
  - At most one active request (requested / purging / blocked) per user, enforced by a partial unique index.
  - RLS on. The user SELECTs his own rows. No write privilege for any API role: every write goes through a function.
- **`public.firm_asset_transfers`**: the trail described in §2.
- **Functions.** All are SECURITY DEFINER with `search_path ''`. Execute is revoked from PUBLIC/anon.
  - For a session (authenticated):
    - `request_account_deletion(reason)` and `cancel_account_deletion()`. They take **no user id**: they act on `auth.uid()`. So nobody can request or cancel someone else's deletion, by construction.
    - The request refuses an admin, and an owner of a firm, company, NGO or government entity that has other non-removed members.
  - For the service role:
    - `account_deletion_request_for(user, actor, reason)` and `account_deletion_cancel_for(user, actor)`: admin freeze and restore.
    - `account_purge_claim(limit)`: claims due rows atomically with `update … where status='requested' and purge_after <= now()`. A purge that died mid-way is re-claimed after an hour.
    - `account_purge_claim_user(user, actor)`: «حذف نهائي الآن».
    - `account_purge_prepare(user)`: the keep rules, a hold check, and the storage paths. It aborts while any firm-scoped row still points at the user.
    - `account_purge_finish(request, outcome, report, error)`.
    - `transfer_firm_assets(user, firm)`.
- **The freeze hides the public profile at the source.** A BEFORE INSERT/UPDATE trigger on `lawyer_profiles` and `provider_profiles` forces `marketplace_visible = false` while an active request exists. It is the 20261017_44 `test_accounts` technique, so the directory, `/lawyers/[slug]`, the community widgets, reviews and anon REST all follow without code. A cancel restores `prior_listing`.
- **Keep rules on every deletion path.** A BEFORE DELETE trigger on `auth.users` runs on the cron, «حذف نهائي», the Supabase dashboard, and the UAT teardown. It:
  1. refuses (42501) to delete an entity owner who has other non-removed members, because the cascade would delete the firm;
  2. transfers the firm assets of every firm the user's rows belong to;
  3. detaches the user's documents on a **non-firm case that has another participant**, setting `owner_user_id` to null, so a client's file with his lawyer, or a lawyer's file with his client, stays with the other party (Q3);
  4. snapshots the buyer onto every `paid`/`refunded` `payment_orders` row: `metadata.buyer_snapshot` with display_name, email, user_type and when. It never overwrites an earlier snapshot.
- **Member removal.** An AFTER UPDATE trigger on `firm_members`, firing when `status` becomes `removed`, runs `transfer_firm_assets(user, firm)` and notifies the owner with a count, never content. A *suspension* moves nothing, because it is reversible. A *freeze* moves nothing either: a cancel could not undo a move.
- `entitlement_requests.decided_by` becomes ON DELETE SET NULL. The constraint name is looked up, not assumed.
- Re-runnable, inside `begin … commit`, with `lock_timeout`, a verify block, and `notify pgrst`.

### Purge: what goes and what stays

| Goes (after 60 days) | Stays |
|---|---|
| The profile and the role profiles, subscriptions, points, notifications, settings, research, law notes and audio, the draft cart, community posts and votes, chat participation, reviews he wrote or received, payment methods (tokens), library grants | `payment_orders` (the tax invoices) with `buyer_snapshot`; office `receipts` (`payer_name`) |
| His personal documents (vault, his own solo cases with no other participant) and their storage bytes; personal notes (solo cases, private dashboard notes); his licence image | Everything on a firm case, moved to the firm owner; his documents on a case shared with another person (detached, Q3); `contract_versions` and their bytes; the trails (`case_record_history`, `firm_asset_transfers`, `admin_audit_events`); the request row itself (`status = purged`) |

### Flows

- **Self.** Settings → الأمان → «حذف الحساب»:
  - The panel explains: 60 days, what is deleted, what is kept. To confirm, the user types «احذف حسابي».
  - `POST /api/v1/me/account-deletion` calls the RPC, then sets `app_metadata.account_deletion = {status: "frozen", purge_after}`. It does a read-merge-write through the admin API. `app_metadata` is never user-writable.
  - If the metadata write fails, the request is cancelled again and the route answers 500.
- **The gate.** `freezeStateFromUser(user)` reads `app_metadata` only:
  - In `src/proxy.ts`, page branch: right after the `!user` redirect, every PROTECTED page redirects to `/account-frozen`, and the refreshed cookies are carried.
  - In the protected API branch (`lawyer`/`admin`/`firm`): a 403.
  - In `assertRole` (80 route files): a 403.
  - It costs no extra query: `getUser()` already returns the fresh `app_metadata`.
  - The table stays the truth. GET and cancel re-sync the metadata in both directions.
  - Residual: direct PostgREST calls with the user's own JWT still reach his own rows during the freeze.
- **`/account-frozen`.** It says «حسابك مجمّد حتى …» and offers «استعادة الحساب» (`POST /api/v1/me/account-deletion/cancel`) and sign-out.
- **Admin.** `DELETE /api/v1/admin/users/[id]`, still `users.delete`:
  - With no mode, it **freezes for 60 days**.
  - `?mode=cancel` restores.
  - `?mode=purge` with `{confirm: "حذف نهائي"}` purges now, through the **same** purge library as the cron. It is super_admin only. The other rules stand: no self-delete, and the last super admin stays.
- **Cron.** `POST /api/v1/cron/account-purge`:
  - Auth is `x-cron-secret` = `CRON_SECRET`, compared timing-safe with `cronSecretMatches`. It fails closed when the variable is unset.
  - Per claimed request, in order:
    1. `prepare`, which runs the keep rules and returns the storage paths;
    2. remove those storage objects;
    3. `auth.admin.deleteUser`, where the trigger re-runs the keep rules;
    4. `finish`.
  - An entity owner, or a `23503`, ends as `blocked` with the error, and is never retried in a loop.
  - It logs counts.
  - n8n runs it daily: Schedule Trigger → HTTP Request `POST https://nezamy.sa/api/v1/cron/account-purge` with header `x-cron-secret`.

### Before the migration (code first is safe)

- The status route answers `{available: false}` on a missing relation or function. Settings then keeps the old «تواصل مع الدعم» panel.
- The admin freeze answers 503 and names the SQL file. «حذف نهائي» keeps the old `deleteUser` behaviour.
- The cron answers 200 `skipped: "schema_missing"`.
- Nobody carries frozen metadata, so the gate never fires.
- `deploy.sh` does not run `_verify.sql`. The user runs it by hand.

### Deploy order

1. Run the read-only FK query from the README on prod.
2. Run `70_BEFORE_DEPLOY_20261026_70_account_deletion.sql`.
3. Deploy the code.
4. Run `_verify.sql` by hand: expect `_verify: 20261026_70 OK`.
5. Add the daily n8n schedule. `CRON_SECRET` is already set for the deadlines job.

---

## 4. Open questions for the owner (safe defaults chosen)

1. **A firm, company or NGO owner deleting his own account.** Default: the self-request is refused while the entity has other members. An admin freeze is allowed, but the purge is `blocked` and the account stays frozen. Ownership has to be transferred first, and no screen does that yet.
2. **A member's PRIVATE notes on a firm case** (owner ١٦٩ «خاصة بي فقط»). Default: kept, moved to the firm owner, and still private, so he can read them. The original author is in `firm_asset_transfers`. Should they be deleted instead?
3. **Documents on a case shared with another person** (a client's uploads in his lawyer's file, a solo lawyer's uploads in his client's case). Default: **kept** for the other party, with no owner. Owner rule 1 says "his documents are deleted"; confirm the exception.
4. **How long the buyer snapshot on invoices is kept.** VAT practice is 6 years. Today it is kept with no end date. Confirm the period with the accountant.
5. **Company (`business_members`) members.** ٢٩٨ names law offices and firms. Should the same transfer apply to corporate legal teams?
6. **B2 auto-renew** must skip accounts with an active deletion request. Nothing charges today.
