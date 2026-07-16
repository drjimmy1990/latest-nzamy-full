# Nzamy Production Readiness Audit & Technical Remediation Plan

This document serves as a detailed production readiness audit and step-by-step remediation guide for the Nzamy website's client-side and lawyer-side dashboards, API routes, database schemas, and row-level security (RLS) policies. It outlines the mock data locations, data shape mismatches, schema/RLS blocks, and provides exact TypeScript and SQL code to resolve them.

---

## 1. Dashboard Audits: Hardcoded Mock Data & Fallbacks

Across the dashboards, several pages are functional UI-only shells relying on static data arrays. Below is a comprehensive list of files containing mock data that must be replaced with real services and database queries.

### 1.1 Client-Side Dashboard (`src/app/dashboard/client/`)
* **Case Details Page (`cases/[id]/page.tsx`)**:
  * *Status*: Completely static.
  * *Mock Data*: Loads timeline events, document lists, shared tasks, team members, fee details, and AI insights from `MOCK_CASES` (lines 37–90).
  * *Remediation*: Replace `MOCK_CASES[id]` with a call to `casesService.getCaseDetail(id)` inside a `useEffect` hook (or fetch server-side using Next.js Server Components).
* **Case Updates Page (`cases/updates/page.tsx`)**:
  * *Status*: Mock-based.
  * *Mock Data*: Relies on a hardcoded list of `SHARED_FROM_LAWYER` items (lines 30–81).
  * *Remediation*: Implement `/api/v1/cases/updates` or fetch updates via `casesService.getCaseUpdates()`.
* **Wallet Page (`wallet/page.tsx`)**:
  * *Status*: Mock-based.
  * *Mock Data*: Balances (`WALLET_BALANCE = 250`, `PENDING_BALANCE = 50`) and coupon lists (`coupons`) are static.
  * *Remediation*: Implement a wallet service calling `/api/v1/wallet_transactions` to calculate actual balances and active coupons.
* **Referrals Page (`referral/page.tsx`)**:
  * *Status*: Mock-based.
  * *Mock Data*: Stats, steps, and friends lists (`friends`) are hardcoded (lines 24–130).
  * *Remediation*: Fetch referral data using `/api/v1/referrals` to show real referral signs and rewards.
* **AI Letter Refinement Workflow (`_components/ClientLetterWorkflow.tsx`)**:
  * *Status*: Simulates API behavior.
  * *Mock Data*: Simulates refinement with a `setTimeout` of 1400ms (line 113) and prepends a static prefix `[ملاحظة AI: ...]` locally.
  * *Remediation*: Integrate a post request calling `/api/v1/ai/letters/refine` containing the user prompt and original letter.
* **Find Lawyer Pages (`find-lawyer/page.tsx` & `find-lawyer/[id]/page.tsx`)**:
  * *Status*: Semi-connected, but falls back to `MOCK_LAWYERS` (from `./data`) upon API failure, masking connection errors.
  * *Remediation*: Remove the static fallback to ensure that database down-states or service-role credential failures are raised and handled gracefully.

### 1.2 Lawyer-Side Dashboard (`src/app/dashboard/lawyer/`)
* **Profile Page (`profile/page.tsx`)**:
  * *Status*: Static `MOCK_PROFILE` displaying certifications, reviews, ratings, and biographical fields.
  * *Remediation*: Query `/api/v1/lawyers/me` or `/api/v1/profiles` using Supabase client to fetch profile details.
* **Activity & Analytics Pages (`activity/page.tsx` & `analytics/page.tsx`)**:
  * *Status*: Entirely mocked graphs, performance metrics, and activity logs.
  * *Remediation*: Create database views aggregating billing counts and client retention rates. Fetch using `/api/v1/lawyer/analytics`.
* **Cases, Clients, & Sharing Pages (`archive/page.tsx`, `cases/[id]/page.tsx`, `cases/[id]/sharing/page.tsx`, `clients/page.tsx`, `clients/[id]/page.tsx`)**:
  * *Status*: Read-only UI rendering `MOCK_CLIENTS`, `MOCK_CASES`, `MOCK_CONTRACTS`, and `MOCK_CONSULTATIONS`.
  * *Remediation*: Connect UI hooks to `workflowService.ts` and fetch cases assigned to the current lawyer (`assigned_to = auth.uid()`).

---

## 2. API Mismatches, Schema Issues, & SQL Remediations

Below are the critical database schema issues, RLS policy blocks, and API code flaws that prevent database mode from integrating correctly.

### 2.1 Lawyer Search Endpoint Crash (`is_accepting_clients` & `city` Columns)
* **Blocker**: The route `/api/v1/lawyers/route.ts` filters by `lawyer_profiles.is_accepting_clients`. However, the table `lawyer_profiles` does not contain this column. Also, the frontend expects a `city` column on profiles which does not exist, causing missing data and execution crashes.
* **SQL Remediation**:
```sql
-- Add is_accepting_clients and city columns to lawyer_profiles and profiles
ALTER TABLE public.lawyer_profiles 
ADD COLUMN IF NOT EXISTS is_accepting_clients BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE public.lawyer_profiles 
ADD COLUMN IF NOT EXISTS city TEXT;
```

---

### 2.2 Document Upload API Column & Constraint Mismatches
* **Blocker 1**: `/api/v1/documents/route.ts` inserts using `label` and `storage_path` keys:
  ```typescript
  { label: body.label, storage_path: body.storage_path }
  ```
  However, the `attachments` table has no `label` column; it uses `file_name` which is marked `NOT NULL` in the DB, causing insertion failure.
* **Blocker 2**: The table schema marks `request_id text not null references public.service_requests(id)`. This blocks general document uploads (e.g. uploading a resume or ID card from the Documents dashboard) that are not tied to a specific service request.
* **SQL Remediation**:
```sql
-- Allow request_id to be nullable for general document uploads
ALTER TABLE public.attachments 
ALTER COLUMN request_id DROP NOT NULL;
```
* **API Remediation (`src/app/api/v1/documents/route.ts`)**:
```typescript
// Replace original insert logic:
const { data: attachment, error } = await supabase
  .from("attachments")
  .insert({
    file_name: body.file_name ?? body.label ?? "Untitled Document",
    storage_path: body.storage_path,
    mime_type: body.mime_type ?? null,
    size_bytes: body.size_bytes ?? null,
    request_id: body.request_id ?? null, // Now accepts null in DB
    owner_user_id: user.id
  })
  .select()
  .single();
```

---

### 2.3 Service Requests POST Payload Wrapper Mismatch & Constraint failures
* **Blocker 1**: The API route `/api/v1/service-requests/route.ts` expects request fields to be wrapped in a nested object:
  ```typescript
  const { data: serviceRequest, error: reqError } = await supabase
    .from("service_requests")
    .insert({
      ...body.request,
      requester_user_id: user.id,
      status: "pending",
    })
  ```
  However, `workflowService.ts` submits a flat `WorkflowRequest` payload, resulting in `body.request` being `undefined` and causing insertion failure or runtime crash.
* **Blocker 2**: The API overrides the input status to `"pending"`. But `"pending"` is not in the allowed check constraint list (`'draft'`, `'pending_payment'`, `'pending_assignment'`, `'assigned'`, `'in_review'`, `'completed'`, `'cancelled'`), which triggers a CHECK constraint violation.
* **SQL Remediation**:
```sql
-- Update status check constraint to include 'pending' as a valid status if desired,
-- or map 'pending' to 'pending_assignment' or 'draft' in the API route.
ALTER TABLE public.service_requests 
DROP CONSTRAINT IF EXISTS service_requests_status_check;

ALTER TABLE public.service_requests 
ADD CONSTRAINT service_requests_status_check 
CHECK (status IN ('draft', 'pending_payment', 'pending_assignment', 'assigned', 'in_review', 'completed', 'cancelled', 'pending'));
```
* **API Remediation (`src/app/api/v1/service-requests/route.ts`)**:
```typescript
// Support both wrapped request and flat payload
const requestData = body.request ?? body;

// Map 'pending' status safely to a valid constraint value or use input status
const statusValue = requestData.status ?? "pending_assignment";

const { data: serviceRequest, error: reqError } = await supabase
  .from("service_requests")
  .insert({
    title: requestData.title,
    description: requestData.description,
    type: requestData.type ?? "service",
    priority: requestData.priority ?? "medium",
    status: statusValue,
    requester_user_id: user.id,
    budget: requestData.budget ?? null,
    category: requestData.category ?? null,
    source_path: requestData.sourcePath ?? requestData.source_path ?? null,
    assigned_to: requestData.assignedTo ?? requestData.assigned_to ?? null,
  })
  .select()
  .single();
```

---

### 2.4 Service Requests PATCH Key Mismatch
* **Blocker**: The frontend service layer passes camelCase keys (e.g. `sourcePath`, `assignedTo`) to the API. However, the PATCH route `/api/v1/service-requests/[id]/route.ts` forwards the payload directly to Supabase `.update(patch)`, which crashes because columns in Postgres are snake_case.
* **API Remediation (`src/app/api/v1/service-requests/[id]/route.ts`)**:
```typescript
// Map camelCase keys to snake_case before updating Supabase
const body = await req.json();
const updateData: Record<string, any> = {};

const mapping: Record<string, string> = {
  title: "title",
  description: "description",
  status: "status",
  priority: "priority",
  budget: "budget",
  category: "category",
  sourcePath: "source_path",
  assignedTo: "assigned_to",
};

for (const [key, val] of Object.entries(body)) {
  if (mapping[key]) {
    updateData[mapping[key]] = val;
  } else {
    // Keep snake_case key directly if passed
    updateData[key] = val;
  }
}

const { data, error } = await supabase
  .from("service_requests")
  .update(updateData)
  .eq("id", id)
  .select()
  .single();
```

---

### 2.5 RLS Policy Block on Service Requests (Marketplace Block)
* **Blocker**: The only SELECT policy on `service_requests` table restricts visibility to:
  ```sql
  requester_user_id = auth.uid() or assigned_to = auth.uid()
  ```
  This completely blocks lawyers from seeing unassigned requests (where `assigned_to` is NULL) in the marketplace, making browsing impossible.
* **SQL Remediation**:
```sql
-- Drop old restrictive select policy and replace with a marketplace-friendly policy
DROP POLICY IF EXISTS "clients read their own service requests" ON public.service_requests;

-- Allow clients to read their own, and lawyers to read unassigned or assigned requests
CREATE POLICY "service_requests_select_policy" ON public.service_requests
  FOR SELECT
  USING (
    -- User is the creator
    requester_user_id = auth.uid()
    -- User is the assigned lawyer
    OR assigned_to = auth.uid()
    -- User is a verified lawyer browsing for unassigned requests in the marketplace
    OR (
      EXISTS (
        SELECT 1 FROM public.lawyer_profiles
        WHERE lawyer_profiles.user_id = auth.uid() 
        AND lawyer_profiles.is_verified = true
      )
      AND assigned_to IS NULL
    )
  );
```

---

### 2.6 Redundant & Conflicting RLS Policies on `attachments`
* **Blocker**: The schema files create conflicting SELECT/INSERT policies. `20260518_client_workflow_backend_ready.sql` enforces case participant validation, but `20260616_entities_setup_and_rls_fix.sql` defines owner-based checks (`owner_user_id = auth.uid()`). An owner-only check will block lawyers from reading client-uploaded attachments.
* **SQL Remediation**:
```sql
-- Drop conflicting policies on attachments
DROP POLICY IF EXISTS "participants read attachments" ON public.attachments;
DROP POLICY IF EXISTS "users read own attachments" ON public.attachments;

-- Single unified policy allowing access to owners and case/request participants
CREATE POLICY "attachments_select_policy" ON public.attachments
  FOR SELECT
  USING (
    -- Owner can read
    owner_user_id = auth.uid()
    -- Or user is a participant (requester or assignee) in the associated service request
    OR EXISTS (
      SELECT 1 FROM public.service_requests
      WHERE service_requests.id = attachments.request_id
      AND (service_requests.requester_user_id = auth.uid() OR service_requests.assigned_to = auth.uid())
    )
  );

CREATE POLICY "attachments_insert_policy" ON public.attachments
  FOR INSERT
  WITH CHECK (
    -- Owner must match authenticated user
    owner_user_id = auth.uid()
  );
```

---

### 2.7 Case Detail Service Wrapper Mismatch (`getCaseDetail`)
* **Blocker**: `/api/v1/cases/[id]/route.ts` wraps its JSON response in a `data` envelope:
  ```typescript
  return NextResponse.json({ data: caseDetail });
  ```
  However, `getCaseDetail()` in `casesService.ts` forwards this payload directly, causing frontend rendering exceptions when it tries to read properties on the wrapped envelope.
* **Service Remediation (`src/lib/services/casesService.ts`)**:
```typescript
export async function getCaseDetail(id: string): Promise<SharedCase> {
  const response = await apiGet<{ data: SharedCase }>(`/api/v1/cases/${id}`);
  // Safely unwrap data envelope
  return response.data;
}
```

---

### 2.8 Lawyer Tasks Category & Date Mismatch
* **Blocker**: The route `/api/v1/lawyer/tasks/route.ts` maps service requests to tasks. It maps the type of the request to `type`, but the lawyer dashboard UI filters and styles items using `category` (which belongs to the union type `TaskCategory`: `"case" | "document" | "admin" | "deadline" | "client"`). Also, it returns `created_at` instead of `createdAt`, which crashes `new Date(request.createdAt).toLocaleDateString("ar-SA")` in the UI due to undefined date references.
* **API Remediation (`src/app/api/v1/lawyer/tasks/route.ts`)**:
```typescript
// In the array mapping logic:
const tasks = (requests ?? []).map((req) => {
  const reqEvents = (events ?? []).filter((e) => e.request_id === req.id);
  
  // Map database service types to TaskCategory
  let category: 'case' | 'document' | 'admin' | 'deadline' | 'client' = 'case';
  if (req.type === 'document' || req.type === 'contract') {
    category = 'document';
  } else if (req.type === 'consultation') {
    category = 'client';
  }

  return {
    id: req.id,
    title: req.title || "مهمة بدون عنوان",
    status: req.status,
    category: category, // Map to category field
    priority: req.priority || "medium",
    createdAt: req.created_at, // Send in camelCase for UI parser
    updatedAt: req.updated_at,
    dueDate: req.due_date ?? null, // Add due date field
    due: req.due_date ?? null,
    eventsCount: reqEvents.length,
    lastEvent: reqEvents[0] || null,
  };
});
```

---

### 2.9 Profile Entity Trigger Gaps
* **Blocker**: The database trigger function `handle_new_user()` provisions `lawyer_profiles` and `provider_profiles` tables but lacks automation to provision basic settings and empty relationship rows for `firm`, `corporate`, `micro`, `government`, or `ngo` users.
* **SQL Remediation**:
```sql
-- Update handle_new_user trigger function to populate correct profiles based on user_role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, user_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', 'مستخدم جديد'),
    new.email,
    COALESCE(new.raw_user_meta_data->>'user_type', 'client')
  );

  -- Provision specialized profiles based on role/type
  IF COALESCE(new.raw_user_meta_data->>'user_type', 'client') = 'lawyer' THEN
    INSERT INTO public.lawyer_profiles (user_id, is_verified, is_accepting_clients)
    VALUES (new.id, false, true);
  ELSIF COALESCE(new.raw_user_meta_data->>'user_type', 'client') = 'provider' THEN
    INSERT INTO public.provider_profiles (user_id, is_verified)
    VALUES (new.id, false);
  ELSIF COALESCE(new.raw_user_meta_data->>'user_type', 'client') IN ('firm', 'corporate', 'micro', 'government', 'ngo') THEN
    INSERT INTO public.firm_profiles (user_id, company_name, is_verified)
    VALUES (new.id, COALESCE(new.raw_user_meta_data->>'company_name', 'جهة جديدة'), false);
  END IF;

  -- Create default notifications setting
  INSERT INTO public.user_settings (user_id, email_notifications, push_notifications, sms_notifications)
  VALUES (new.id, true, true, false);

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 3. Database TypeScript Types Coverage (`src/types/database.ts`)

The file `src/types/database.ts` must be extended with type interfaces for the client workflow migration tables. Add the following definitions:

```typescript
export interface Database {
  public: {
    Tables: {
      service_requests: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: 'draft' | 'pending_payment' | 'pending_assignment' | 'assigned' | 'in_review' | 'completed' | 'cancelled' | 'pending';
          priority: 'low' | 'medium' | 'high' | 'urgent';
          budget: number | null;
          category: string | null;
          requester_user_id: string;
          assigned_to: string | null;
          source_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['service_requests']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['service_requests']['Insert']>;
      };
      attachments: {
        Row: {
          id: number;
          request_id: string | null;
          owner_user_id: string;
          file_name: string;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['attachments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['attachments']['Insert']>;
      };
      consultations: {
        Row: {
          id: string;
          request_id: string;
          scheduled_at: string;
          duration_minutes: number;
          meeting_link: string | null;
          status: 'scheduled' | 'completed' | 'cancelled';
          reminder_sent: boolean;
          reminder_1h_sent: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['consultations']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['consultations']['Insert']>;
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          request_id: string;
          amount: number;
          status: 'pending' | 'completed' | 'failed' | 'refunded';
          payment_method: string | null;
          invoice_url: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['payments']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['payments']['Insert']>;
      };
    };
  };
}
```
