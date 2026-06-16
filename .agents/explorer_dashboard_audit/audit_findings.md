# Nzamy Codebase Audit Findings Report

**Date**: 2026-06-16  
**Auditor**: Teamwork Explorer (Read-only Investigator)  
**Status**: COMPLETE  
**Workspace**: `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website`

---

## Executive Summary
This report presents the findings of a comprehensive, read-only audit of the client-side dashboard (`src/app/dashboard/client/`), lawyer-side dashboard (`src/app/dashboard/lawyer/`), their corresponding API routes, services, hooks, and database schemas/migrations (`supabase/migrations/` and `src/types/database.ts`). 

Key findings reveal that while a Supabase dual-mode layer exists, it is widely bypassed or unimplemented across several pages. There are critical shape mismatches between what the frontend expects and what the database APIs return. Furthermore, several database table constraints, RLS policies, and API endpoint code paths contain bugs that act as direct blockers for any real database mode integration.

---

## 1. Client-Side Dashboard Audit (`src/app/dashboard/client/`)

### 1.1 Hardcoded Mock Data & Fallbacks
* **Case Details Page (`cases/[id]/page.tsx`)**: Completely static. It loads all details (timeline events, documents list, shared tasks, team members, fee details, and AI insights) from a hardcoded `MOCK_CASES` object (lines 37–90). It has no API integration or hooks to fetch details from `/api/v1/cases/[id]` or the service layer.
* **Case Updates Page (`cases/updates/page.tsx`)**: Fully mock-based. It relies entirely on a hardcoded list of `SHARED_FROM_LAWYER` items (lines 30–81). No services or API requests are performed.
* **Wallet Page (`wallet/page.tsx`)**: Fully mock-based. Wallet balances (`WALLET_BALANCE = 250`, `PENDING_BALANCE = 50`) and coupon lists (`coupons`) are hardcoded at the top of the file. There is no `useEffect` or integration with any wallet service or `/api/v1/wallet_transactions`.
* **Referrals Page (`referral/page.tsx`)**: Fully mock-based. Stats, steps, and friends lists (`friends`) are hardcoded (lines 24–130).
* **AI Letters Generation (`_components/ClientLetterWorkflow.tsx`)**: The AI refinement feature simulates backend generation using a hardcoded `setTimeout` of 1400ms (line 113) and appends a hardcoded string `[ملاحظة AI: ...]` locally. There is no real AI refinement API call.
* **Find Lawyer Page (`find-lawyer/page.tsx` & `find-lawyer/[id]/page.tsx`)**: Bypasses service layer in case of API failure by falling back to `MOCK_LAWYERS` (from `./data`).

### 1.2 Missing API Integrations & Functional Gaps
* **New Request Wizard (`requests/new/page.tsx`)**: Files uploaded by users (state `files`, lines 31, 66) are logged inside `metadata` as a file count and comma-separated string (lines 149–150), but they are **never uploaded** to Supabase Storage or saved to the `attachments` table.
* **Documents Page (`documents/page.tsx`)**: The file input element (`<input type="file" className="hidden" />` on line 139) and drag-and-drop zone (`onDrop` on line 147) lack any event handlers to parse files, upload them, or call `uploadDocument()`. Therefore, the upload functionality is completely non-functional.
* **New Case Modal (`cases/_components/NewCaseModal`)**: Form submission processes the data locally and does not hook into any database creation service or API.

### 1.3 Code Blocker Issues & API Mismatches
* **Case Detail Service Wrapper Mismatch (`src/lib/services/casesService.ts`)**:  
  `getCaseDetail(id)` returns `apiGet<SharedCase>('/api/v1/cases/${id}')`. However, the API route `/api/v1/cases/[id]/route.ts` wraps the response in a `data` envelope: `return NextResponse.json({ data: { ... } })`. This results in `getCaseDetail()` returning `{ data: SharedCase }` instead of `SharedCase` directly, crashing page components that expect properties directly on the return value.
* **Lawyer Search API Filter Crash (`src/app/api/v1/lawyers/route.ts`)**:  
  When `available=true` is requested, the endpoint runs `query = query.eq("lawyer_profiles.is_accepting_clients", true)`. However, the `is_accepting_clients` column does not exist in the `lawyer_profiles` table, resulting in a database execution crash.
* **Lawyer Search Data Shape Mismatch (`src/app/dashboard/client/find-lawyer/page.tsx`)**:  
  The frontend expects objects conforming to the `Lawyer` interface (from `./data`), which has fields like `experienceYears`, `city`, `priceMin`, `priceMax`, and `available`. However, the API route returns raw database rows from `profiles` and `lawyer_profiles`, which contain fields like `years_experience` and `hourly_rate`, and completely lack a `city` or `is_accepting_clients` column. Running in Supabase mode will cause `undefined` rendering errors.
* **Document Upload API Column Mismatch (`src/app/api/v1/documents/route.ts`)**:  
  The POST route inserts into the `attachments` table using `{ label: body.label, storage_path: body.storage_path, ... }`. However, the `attachments` table does not contain a `label` column (it has `file_name` instead). Additionally, `file_name` is marked `NOT NULL` in the database but is never passed, causing database insertion failure. Furthermore, the `DocumentInput` interface in `documentService.ts` defines `file_name` and `file_url`, which do not match the API's expectation of `label` and `storage_path`.
* **Client Pricing Catalog Wrapper Mismatch**:  
  `createGroup()` in `groupService.ts` returns `apiMutate<GroupDetail>('/api/v1/groups', 'POST', data)` directly. However, the POST API route wraps the group in `{ data: group }`. This causes `createGroup` to return `{ data: GroupDetail }` instead of `GroupDetail` directly, leading to wrapper mismatches in components.

---

## 2. Lawyer-Side Dashboard Audit (`src/app/dashboard/lawyer/`)

### 2.1 Hardcoded Mock Data & Fallbacks
* **Lawyer Profile Page (`profile/page.tsx`)**: Displays all certifications, reviews, personal information, and ratings from a static `MOCK_PROFILE` object. It has no hook to fetch the lawyer profile dynamically.
* **Lawyer Activity Page (`activity/page.tsx`)**: Loads all lawyer activities from a hardcoded `MOCK_ACTIVITIES` array.
* **Lawyer Analytics Page (`analytics/page.tsx`)**: All chart statistics, performance metrics, and financial breakdown values are hardcoded in local constants.
* **Lawyer Archive Page (`archive/page.tsx`)**: Relies entirely on `MOCK_` archived cases.
* **Lawyer Cases Detail Page (`cases/[id]/page.tsx`)**: Loads timeline, documents, and client details from a local `MOCK_CASES` record.
* **Lawyer Sharing Page (`cases/[id]/sharing/page.tsx`)**: All client-visible toggle states and sharing presets are mocked locally.
* **Lawyer Clients Pages (`clients/page.tsx` & `clients/[id]/page.tsx`)**: Rely entirely on `MOCK_CLIENTS`, `MOCK_CASES`, `MOCK_CONTRACTS`, and `MOCK_CONSULTATIONS`.
* **Lawyer Consultations Detail Page (`consultations/[id]/page.tsx`)**: Fully mock-based.
* **Lawyer Contracts Page (`contracts/page.tsx`)**: Uses hardcoded mock contract listings.
* **Lawyer Network Page (`network/page.tsx`)**: Entirely mocked (team list, secondment options, referral payouts).

### 2.2 Missing API Integrations & Functional Gaps
* **Add Case Modal (`_components/AddCaseModal.tsx`)**: Clicking "حفظ واعتماد" (Save and approve) sets a local state `setDone(true)` and displays a success screen without making any API call or database update.
* **Add Task Modal (`_components/AddTaskModal.tsx`)**: Simulates task creation locally by updating status to done and does not call any database task creator service.

### 2.3 Code Blocker Issues & API Mismatches
* **Service Requests POST Payload Mismatch (`src/app/api/v1/service-requests/route.ts`)**:  
  The POST route expects the request fields to be wrapped under `body.request` (e.g. `...body.request`). However, `workflowService.ts` sends the request object flat at the root of the request body. This results in `body.request` evaluating as `undefined`, causing the insert statement to crash or fail.
* **Service Requests Status Override**:  
  The POST `/api/v1/service-requests` endpoint overrides the status to `"pending"` (line 81) on insert, completely ignoring the status provided by the client (which could be `"pending_payment"` or `"pending_assignment"`).
* **Service Requests PATCH Case Mismatch**:  
  The service layer in `workflowService.ts` passes a `patch` object containing camelCase keys (e.g., `sourcePath` or `assignedTo`). However, `/api/v1/service-requests/[id]/route.ts` forwards `patch` directly to Supabase `.update(patch)`. This will fail because Postgres columns are snake_case (`source_path`, `assigned_to`).
* **Lawyer Task Shape & Category Mismatch (`src/app/api/v1/lawyer/tasks/route.ts`)**:  
  The GET route maps service requests to tasks. It assigns `type` from `service_requests.type` (which holds values like `'service'`, `'consultation'`, etc.). However, the lawyer tasks page UI expects a `category` property belonging to the `TaskCategory` union (`"case" | "document" | "admin" | "deadline" | "client"`). Because of this mismatch, UI category filtering and rendering will break. Furthermore, the API does not return a `dueDate` or `due` field, leaving all task due dates undefined in the UI.
* **Lawyer Cases Page Date Crash (`src/app/dashboard/lawyer/cases/page.tsx`)**:  
  The API endpoint `/api/v1/service-requests` does not map database columns to camelCase. Thus, it returns `created_at` instead of `createdAt`. In the frontend, `workflowToCase` executes `new Date(request.createdAt).toLocaleDateString("ar-SA")`. Because `request.createdAt` is undefined, this throws a runtime crash or displays `"Invalid Date"`.
* **Lawyer Dashboard Tier Mocking**:  
  The main lawyer dashboard page hardcodes `const lawyerTier: LawyerTier = "free"` (line 100) with a `// TODO` to fetch it from the subscription API.

---

## 3. Database Schema, Constraints, & RLS Policies Audit

### 3.1 `src/types/database.ts` Coverage Gaps
* The file `src/types/database.ts` is completely missing interfaces for the tables created in the client workflow migration (`20260518_client_workflow_backend_ready.sql`):
  - `service_requests`
  - `request_events`
  - `payments`
  - `attachments`
  - `consultations`
  - `cases`
  - `contracts`
  - `messages`
  - `admin_pricing_catalog`
  - `wallet_transactions`
  - `notifications`
* This results in type-safety compilation warnings or forces the use of `any`/`unknown` casts in the service layer.

### 3.2 Column & Constraint Gaps
* **`attachments` table `request_id` NOT NULL constraint**:  
  The table schema marks `request_id text not null`. This prevents users from uploading general documents from their documents dashboard that are not associated with a specific case/request. General document uploads will fail with a database NOT NULL constraint violation.
* **`lawyer_profiles` table `is_accepting_clients` column**:  
  The `lawyer_profiles` table (defined in `20260603_phase1_001_profiles.sql`) is missing the `is_accepting_clients` column referenced by `/api/v1/lawyers/route.ts`.
* **Missing `city` column on `profiles` and `lawyer_profiles`**:  
  Neither table holds a `city` column, although it is expected by the frontend filtering and UI.

### 3.3 RLS Policy Gaps
* **Marketplace Browsing Blocked by `service_requests` RLS**:  
  The RLS policy `"clients read their own service requests"` on the `service_requests` table restricts select access to: `requester_user_id = auth.uid() or assigned_to = auth.uid()`.  
  Because of this, a lawyer **cannot see any unassigned requests** in the system (`assigned_to IS NULL`). This completely blocks the Lawyer Marketplace from functioning, as the database query will return zero results for any lawyer trying to browse unassigned incoming requests.
* **Redundant/Conflicting Policies on `attachments`**:  
  `20260518_client_workflow_backend_ready.sql` defines `"participants read attachments"` (case/request participant check).  
  `20260616_entities_setup_and_rls_fix.sql` defines `"users read own attachments"` (`owner_user_id = auth.uid()`).  
  If the owner-based policy takes precedence or acts restrictively, it will block lawyers from reading attachments uploaded by the client, even if they are assigned to the corresponding request.
* **Entity Trigger Gaps**:  
  The `handle_new_user()` trigger automatically provisions `lawyer_profiles` and `provider_profiles`, but does not create initial profiles for `firm`, `corporate`, `micro`, `government`, or `ngo` users, creating a gap if the system expects these profiles to exist immediately upon registration.
