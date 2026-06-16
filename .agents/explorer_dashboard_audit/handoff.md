# Handoff Report — Dashboard and Database Audit

This handoff report summarizes the findings of the audit of client and lawyer dashboards, services, API routes, and database schemas for the Nzamy website.

## 1. Observation

### 1.1 Document Upload API Column & Null Constraint Mismatches
* **File**: `src/app/api/v1/documents/route.ts`
  * **Observation 1 (Lines 61-62)**: The insertion payload contains the key `label` and `storage_path`:
    ```typescript
    label: body.label,
    storage_path: body.storage_path,
    ```
  * **Observation 2 (Line 65)**: The insertion payload sets `request_id` to null if not provided:
    ```typescript
    request_id: body.request_id ?? null,
    ```
* **File**: `supabase/migrations/20260518_client_workflow_backend_ready.sql`
  * **Observation 3 (Lines 41-50)**: The `attachments` table schema definition:
    ```sql
    create table if not exists public.attachments (
      id bigserial primary key,
      request_id text not null references public.service_requests(id) on delete cascade,
      owner_user_id uuid references auth.users(id) on delete cascade,
      file_name text not null,
      storage_path text not null,
      mime_type text,
      size_bytes bigint,
      created_at timestamptz not null default now()
    );
    ```
    Note that `file_name` is marked `not null` and there is no `label` column. Also, `request_id` is marked `not null`.

### 1.2 Service Requests POST Payload spreading undefined
* **File**: `src/app/api/v1/service-requests/route.ts`
  * **Observation 4 (Lines 76-82)**: Spreads `body.request` and sets status:
    ```typescript
    const { data: serviceRequest, error: reqError } = await supabase
      .from("service_requests")
      .insert({
        ...body.request,
        requester_user_id: user.id,
        status: "pending",
      })
    ```
* **File**: `src/lib/services/workflowService.ts`
  * **Observation 5 (Lines 47-56)**: Sends the input object directly as the body:
    ```typescript
    return await apiMutate<WorkflowRequest>("/api/v1/service-requests", "POST", input);
    ```
    The input object has flat properties (`id`, `title`, `description`, etc.) and does not contain a nested `request` object.
* **File**: `supabase/migrations/20260518_client_workflow_backend_ready.sql`
  * **Observation 6 (Line 13)**: The `service_requests` check constraint:
    ```sql
    status text not null check (status in ('draft', 'pending_payment', 'pending_assignment', 'assigned', 'in_review', 'completed', 'cancelled'))
    ```
    Note that `"pending"` is not in the list of allowed statuses.

### 1.3 Lawyer Task UI Category & Date Mismatch
* **File**: `src/app/api/v1/lawyer/tasks/route.ts`
  * **Observation 7 (Lines 42-55)**: Mapped task properties returned by API:
    ```typescript
    const tasks = (requests ?? []).map((req) => {
      const reqEvents = (events ?? []).filter((e) => e.request_id === req.id);
      return {
        id: req.id,
        title: req.title || "مهمة بدون عنوان",
        status: req.status,
        type: req.type,
        priority: "medium",
        createdAt: req.created_at,
        updatedAt: req.updated_at,
        eventsCount: reqEvents.length,
        lastEvent: reqEvents[0] || null,
      };
    });
    ```
* **File**: `src/app/dashboard/lawyer/tasks/_types.ts`
  * **Observation 8 (Lines 10-25)**: The expected `Task` type in the UI:
    ```typescript
    export interface Task {
      id: string;
      title: string;
      category: TaskCategory;
      priority: Priority;
      status: TaskStatus;
      due?: string;
      dueDate?: string;
      // ...
    }
    ```
    Note the UI expects `category` (type `TaskCategory`) and `dueDate`/`due` (string), whereas the API returns `type` and does not provide due dates.

### 1.4 Marketplace select queries blocked by RLS on `service_requests`
* **File**: `supabase/migrations/20260518_client_workflow_backend_ready.sql`
  * **Observation 9 (Lines 148-150)**: RLS policy on `service_requests`:
    ```sql
    create policy "clients read their own service requests"
      on public.service_requests for select
      using (requester_user_id = auth.uid() or assigned_to = auth.uid());
    ```
    No other select policy exists on this table. This prevents any third-party lawyer from selecting unassigned requests (where `assigned_to` is NULL).

### 1.5 Missing database columns on Lawyer Profiles
* **File**: `src/app/api/v1/lawyers/route.ts`
  * **Observation 10 (Line 35)**: Checks:
    ```typescript
    query = query.eq("lawyer_profiles.is_accepting_clients", true);
    ```
* **File**: `supabase/migrations/20260603_phase1_001_profiles.sql`
  * **Observation 11 (Lines 92-115)**: `lawyer_profiles` table definition:
    Does not contain a column named `is_accepting_clients`.

---

## 2. Logic Chain

1. **Document Upload Failure**:
   * *Observation 1* shows that the documents API inserts using `{ label, storage_path }` and specifies `request_id: body.request_id ?? null`.
   * *Observation 3* shows the database `attachments` table has no `label` column (it uses `file_name`) and marks both `file_name` and `request_id` as `NOT NULL`.
   * **Conclusion**: Inserting into `attachments` will fail with a database execution error due to:
     * A column mismatch (column `label` does not exist).
     * A null constraint violation on `file_name` (since it is not passed).
     * A null constraint violation on `request_id` if general documents are uploaded (which default `request_id` to null).

2. **Service Request Creation Crash**:
   * *Observation 4* shows the POST handler spreads `body.request`.
   * *Observation 5* shows the frontend service layer sends a flat object without a `request` wrapper.
   * *Observation 6* shows that the `status` column has a strict CHECK constraint excluding `"pending"`.
   * **Conclusion**: Creating a service request will crash the API route with a `TypeError: Cannot read properties of undefined (reading 'Symbol(Symbol.iterator)')` because `body.request` is undefined. Even if fixed, inserting a row with `status: "pending"` will trigger a CHECK constraint violation on Postgres.

3. **Lawyer Tasks UI Filtering Break**:
   * *Observation 7* shows the task list API maps the task type to `type` and doesn't map due dates.
   * *Observation 8* shows the UI expects tasks to have `category` (used for filtering/colors) and `dueDate` (used for sorting and filters).
   * **Conclusion**: The lawyer task board will render incorrectly, task category filters will not function, and task due dates will be missing or default to undefined.

4. **Empty Lawyer Marketplace**:
   * *Observation 9* shows select access to `service_requests` is only permitted for the requester or the assigned lawyer.
   * **Conclusion**: An unassigned request in the marketplace cannot be seen by any lawyer browsing for jobs, completely blocking the marketplace workflow.

5. **Lawyer Listing Filter Crash**:
   * *Observation 10* shows the public lawyers endpoint filters by `lawyer_profiles.is_accepting_clients`.
   * *Observation 11* shows the table is missing this column.
   * **Conclusion**: Filtering for available lawyers will crash the query on Postgres with a missing column error.

---

## 3. Caveats

* Only client-side (`src/app/dashboard/client/`) and lawyer-side (`src/app/dashboard/lawyer/`) dashboards, service layers, and API routes were audited. Other dashboards (e.g., admin, corporate, firm, government) were not evaluated in detail, though similar issues may exist.
* The analysis is based on static code investigation. Run-time database states (e.g., if there were manual schema modifications made directly to the database outside of the migrations folder) were not verified, as this is a read-only investigation.

---

## 4. Conclusion

There are critical blocker issues that completely prevent the application from functioning in Supabase database mode:
1. **API route crashes**: Spreading undefined payloads and using status strings that violate Postgres CHECK constraints.
2. **Postgres constraint failures**: Inserting invalid column names (`label` instead of `file_name`) and passing NULLs for non-nullable columns (`request_id` and `file_name` on attachments).
3. **RLS policy blocks**: The RLS policy on `service_requests` prevents lawyers from querying unassigned requests, breaking the lawyer marketplace.
4. **Data shape mismatches**: Discrepancies between database columns/API payloads and UI expected interfaces (such as `type` vs `category` on tasks, and nested structures in lawyer searches).

A detailed compilation of these issues and proposed remediations is stored in `audit_findings.md`.

---

## 5. Verification Method

To independently verify these findings, inspect the following files:
1. Compare table schemas in `supabase/migrations/20260518_client_workflow_backend_ready.sql` (lines 41-50) against the insert query in `src/app/api/v1/documents/route.ts` (lines 57-68).
2. Compare the POST payload structure sent in `src/lib/services/workflowService.ts` (line 52) with the expected request body parsed in `src/app/api/v1/service-requests/route.ts` (lines 73-82).
3. Look at the CHECK constraint on `status` in `supabase/migrations/20260518_client_workflow_backend_ready.sql` (line 13) and compare with the insert status value in `src/app/api/v1/service-requests/route.ts` (line 81).
4. Run `npm run build` or `npx tsc --noEmit` if database types in `src/types/database.ts` are checked against services, which will show missing type errors.
