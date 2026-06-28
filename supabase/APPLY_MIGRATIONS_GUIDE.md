# Supabase Migrations — Apply Guide

> **Last Updated:** 2026-06-28
> **Audience:** applying the pending NZAMY migrations on a hosted Supabase project.

There are **3 SQL migrations** + **storage policies that must be applied through the Storage UI** (they cannot be run as SQL on hosted Supabase — see the note below).

---

## ⚠️ Why storage policies can't run as SQL

`storage.objects` is owned by the `supabase_storage_admin` role, **not** your `postgres` role. On hosted Supabase the `postgres` role is not a superuser and is not the owner of `storage.objects`, so any `CREATE POLICY` / `ALTER TABLE storage.objects` statement fails with:

```
ERROR: 42501: must be owner of table objects
```

This is a **permission wall, not a syntax problem** — no SQL query gets past it. The bucket policies must be created through the **Dashboard Storage UI**, which runs them as the storage admin internally.

---

## STEP 1 — Run the 3 SQL migrations (Dashboard → SQL Editor)

Open **Dashboard → SQL Editor**, paste each file's contents, click **Run**. Do them one at a time, in this order:

| # | File | What it does |
|---|------|-------------|
| 1 | `supabase/migrations/20260628_payments_gateway.sql` | Seeds the `platform_settings.payments_gateway` row (`{"status":"disabled","provider":null}`) — the admin payment-gate flag. |
| 2 | `supabase/migrations/20260628_documents_upload.sql` | Makes `attachments.request_id` nullable + creates the `documents` storage bucket. |
| 3 | `supabase/migrations/20260629_payments_and_storage_policies.sql` | `payments.id` default (`gen_random_uuid()`) + `payments.payer_user_id` column. **Payments-only** — storage policies were split out (see Step 2). |

> **Do NOT** run `supabase/storage_policies_documents.sql` in the SQL Editor — it will fail with `42501`. Apply it via the Storage UI (Step 2).

**Troubleshooting migration #2:** if `20260628_documents_upload.sql` errors on `insert into storage.buckets` (`42501`), the bucket insert got blocked too — just create the bucket manually in Step 2a below. The `attachments.request_id` nullable change is independent and will still apply if the transaction partially succeeded; if the whole transaction rolled back, re-run after creating the bucket in the UI.

---

## STEP 2 — Storage bucket + policies (Dashboard → Storage UI)

### 2a. Create the bucket
1. **Dashboard → Storage → New bucket**
2. Name: `documents`
3. **Public: OFF** (private — signed URLs + RLS control access)
4. Save

If the bucket already exists (created by migration #2), skip this.

### 2b. Add the 4 RLS policies
1. Open the `documents` bucket → **Policies** tab → **New policy** → **For full customization**
2. Add 4 policies, one at a time. The expression is the **same string** for all of them — only the name and operation change:

```
auth.uid()::text = (storage.foldername(name))[1]
```

| Policy name | Operation | Expression |
|---|---|---|
| `documents select own` | **SELECT** | `auth.uid()::text = (storage.foldername(name))[1]` |
| `documents insert own` | **INSERT** | `auth.uid()::text = (storage.foldername(name))[1]` |
| `documents update own` | **UPDATE** | `auth.uid()::text = (storage.foldername(name))[1]` |
| `documents delete own` | **DELETE** | `auth.uid()::text = (storage.foldername(name))[1]` |

**Policy model:** every object is stored under a folder named with the owner's auth uid (`documents/<uid>/<filename>`), so the expression restricts each authenticated user to their own files.

### Editor variations
- If the policy editor has a **Target bucket** dropdown → pick `documents` there (the expression above is then enough).
- If it splits **USING** / **WITH CHECK** boxes:
  - **SELECT** & **DELETE** → fill only **USING**
  - **INSERT** → fill only **WITH CHECK**
  - **UPDATE** → fill **both** with the same expression

---

## STEP 3 — Verify everything landed (SQL Editor)

Paste and Run:

```sql
select 'gateway' as k, value::text as v from platform_settings where key='payments_gateway'
union all
select 'payments_id_default', column_default::text from information_schema.columns
  where table_name='payments' and column_name='id'
union all
select 'attachments_request_id_nullable', is_nullable
  from information_schema.columns where table_name='attachments' and column_name='request_id';
```

Expected — **3 rows**:
| k | v |
|---|---|
| `gateway` | `{"status": "disabled", "provider": null}` |
| `payments_id_default` | `gen_random_uuid()` |
| `attachments_request_id_nullable` | `YES` |

To verify the storage policies landed, in the Dashboard go to **Storage → documents → Policies** — you should see the 4 policies listed (`documents select own`, `insert own`, `update own`, `delete own`).

---

## Quick reference — the 4 storage policies (for the UI)

For convenience, here are the 4 policies in SQL form **exactly as they would be** if you could run them (use these expressions in the UI policy editor — do **not** paste the `CREATE POLICY` lines into the SQL Editor, they will error with `42501`):

```sql
-- SELECT — owners can read their own documents
-- using: bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]

-- INSERT — owners can upload into their own folder
-- with check: bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]

-- UPDATE — owners can update their own documents
-- using:     bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]
-- with check: bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]

-- DELETE — owners can delete their own documents
-- using: bucket_id = 'documents' AND auth.uid()::text = (storage.foldername(name))[1]
```

If your policy editor has a **Target bucket** selector (pick `documents`), drop the `bucket_id = 'documents' AND ` prefix from each expression and use only:

```
auth.uid()::text = (storage.foldername(name))[1]
```

---

## Summary

| Task | Where | Status |
|------|-------|--------|
| `payments_gateway` flag | SQL Editor | Step 1, migration #1 |
| `attachments.request_id` nullable + `documents` bucket | SQL Editor (or UI for bucket) | Step 1, migration #2 |
| `payments.id` default + `payer_user_id` | SQL Editor | Step 1, migration #3 |
| `documents` bucket RLS policies (4) | **Storage UI** (NOT SQL) | Step 2 |

Once the verify query returns the 3 expected rows and the 4 policies appear in the Storage UI, the database is fully set up and the lawyer case-detail **Documents tab** upload/download will work end-to-end.