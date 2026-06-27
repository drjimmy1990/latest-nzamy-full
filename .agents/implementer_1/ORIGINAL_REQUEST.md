## 2026-06-27T04:58:03Z

Implement the following secure backend Next.js API routes under `src/app/api/v1/admin/` to expose real database records and execute actions:

1. **`src/app/api/v1/admin/library/route.ts`**:
   - Must check auth using `requireAdmin()` from `@/lib/access-control`.
   - `GET`: list and search laws, decrees, precedents, and feqh books.
     - Support optional query parameters: `search` (filter titles) and `category` (filter by category name).
     - Query `library.laws`, `library.decrees_circulars`, `library.principles`, and `library.feqh_books` tables.
     - Transform results to match the following schema: `{ id, title, category, source, status, views, date }`.
       - For laws, category can be mapped from section_name or type, source is issuing_body, views is total_articles, date is issue_date_hijri.
       - For decrees, category is 'تعاميم ومراسم', source is issuer, views is 0, date is date.
       - For principles, category is 'مبادئ قضائية', source is issuing_body, views is 0, date is session_date, title is text (truncated).
       - For feqh_books, category is 'فقه وشريعة', source is author, views is 0, date is '—'.
     - Return `{ entries: [...], total: count }`.
   - `DELETE`: delete a library item.
     - Request body: `{ id: string, type: 'law' | 'decree' | 'principle' | 'feqh' }`.
     - Based on the `type`, delete the record from the appropriate library table:
       - law: delete from `library.laws` where `slug = id`.
       - decree: delete from `library.decrees_circulars` where `id = id`.
       - principle: delete from `library.principles` where `id = id`.
       - feqh: delete from `library.feqh_books` where `id = id`.
     - Return `{ success: true, message: "تم حذف السجل بنجاح" }`.

2. **`src/app/api/v1/admin/marketplace/route.ts`**:
   - Must check auth using `requireAdmin()`.
   - `GET`: list listings, offers, and workspaces.
     - Fetch from `public.marketplace_listings` joined with `public.profiles` (client display_name).
     - Fetch `public.marketplace_workspaces` joined with listing and accepted offer details.
     - Map results to match: `{ requests: Array<{ id, client, clientType, service, provider, amount, commission, status, date }> }`.
       - `id`: listing ID.
       - `client`: display name of the listing owner.
       - `clientType`: owner_type.
       - `service`: listing title.
       - `provider`: offeror display name if a workspace/offer exists.
       - `amount`: workspace/offer amount.
       - `commission`: amount * (commission_pct / 100).
       - `status`: listing/workspace status.
       - `date`: creation date formatted.

3. **`src/app/api/v1/admin/erp/route.ts`**:
   - Must check auth using `requireAdmin()`.
   - `GET`: list firms, active cases, lawyers, and MRR.
     - Fetch from `public.firm_profiles` joined with `public.profiles` (owner profile).
     - For each firm, count its lawyers from `public.firm_members` where `status = 'active'`, active cases from `public.cases` where status is active, and fetch subscription mrr/plan from `public.subscriptions` where user_id = owner_user_id.
     - Return:
       - `firms`: list of firms mapped to `{ id, name: name_ar, city: metadata->>'city' or 'الرياض', lawyers: count, activeCases: cases_count, plan: plan_name, mrr: subscription.mrr, rating: metadata->>'rating' or 4.5, status: size/status }`.
       - `summary`: `{ totalMRR, totalLawyers, totalCases, totalFirms }`.

4. **`src/app/api/v1/admin/teams/route.ts`**:
   - Must check auth using `requireAdmin()`.
   - `GET`: list admin team members.
     - Fetch profiles where `user_type = 'admin'`.
     - Support listing admins and mapping metadata (role, department, description, access list, tabs list, status).
     - Return `{ team: [...] }`.
   - `POST`: invite a new admin team member.
     - Body: `{ name, email, role, department }`.
     - Insert a profile with `user_type = 'admin'`, display_name = name, email = email, and metadata containing the details and status = 'invited'.
     - Return `{ success: true, message: "تم إرسال الدعوة بنجاح" }`.
   - `PATCH`: suspend/activate team member status.
     - Body: `{ id: string, status: 'active' | 'suspended' }`.
     - Update the profile's metadata `status` field.
     - Return `{ success: true, message: "تم تحديث حالة عضو الفريق بنجاح" }`.

## 2026-06-27T02:24:17Z
Hello! Please report your current progress on implementing the secure admin API endpoints. Let me know if you are stuck or need clarification.

## 2026-06-27T02:25:57Z
Wire all tabs in the admin panel dashboard under `src/app/dashboard/admin/tabs/` to the newly created secure API endpoints, replacing mock/dummy data arrays with fetch/SWR calls:

1. **`src/app/dashboard/admin/tabs/LibraryTab.tsx`**:
   - Fetch real entries from `/api/v1/admin/library` (GET), passing `search` and `category` as query parameters.
   - Display the database entries in the table.
   - Wire the "Delete" action to call `DELETE /api/v1/admin/library` with `{ id: entry.id, type: entry.category }` (mapping entry.category to law/decree/principle/feqh). Ensure the list is refreshed after deletion.
   - Update the KPIs on top based on real data counts.
   - Preserve all existing Tailwind styling, dark mode classes, animations, and icons.

2. **`src/app/dashboard/admin/tabs/CommunityTab.tsx`**:
   - Change this tab to display real verifications/KYC records from `/api/v1/admin/verifications` (GET).
   - Display columns for: Verification ID, Name, User Type/Role, License, AI Score, Date, Documents List, and Status.
   - Wire the "Approve" and "Reject" action buttons to make a `PATCH` request to `/api/v1/admin/verifications/[id]` with `{ action: 'approve' }` or `{ action: 'reject' }`. Refresh the data after the action is processed.
   - Update the KPIs on top based on the fetched verifications.
   - Preserve all Tailwind styling, dark mode classes, animations, and icons.

3. **`src/app/dashboard/admin/tabs/MarketplaceTab.tsx`**:
   - Fetch real requests from `/api/v1/admin/marketplace` (GET).
   - Display them in the table showing client name, type, service, provider, amount, commission, status, and date.
   - Update the KPIs on top (Monthly Commission, Pending Requests, Total Requests, Open Disputes) based on real database records.
   - Preserve all Tailwind styling, dark mode classes, animations, and icons.

4. **`src/app/dashboard/admin/tabs/ERPTab.tsx`**:
   - Fetch real firms data and financial summary KPIs from `/api/v1/admin/erp` (GET).
   - Display the list of firms with active cases, lawyers count, plans, and MRR.
   - Update the KPIs on top (Firms, Lawyers, Active Cases, Total Revenue) with real statistics from the GET response.
   - Preserve all Tailwind styling, dark mode classes, animations, and icons.

5. **`src/app/dashboard/admin/tabs/TeamTab.tsx`**:
   - Fetch real admin team profiles and invitations from `/api/v1/admin/teams` (GET).
   - Display the admin team member cards showing name, role, department, access permissions, KPIs, and status.
   - Wire the "Status" toggle to call `PATCH /api/v1/admin/teams` with `{ id, status: 'active' | 'suspended' }` to suspend or activate team members, and refresh the data.
   - Wire the "Invite member" modal/button to trigger `POST /api/v1/admin/teams` with the new member details, and refresh the data.
   - Preserve all Tailwind styling, dark mode classes, animations, and icons.

6. **`src/app/dashboard/admin/tabs/CorporateTab.tsx`**:
   - Check if any mock company profiles remain, and align it with the rest of the dashboard settings/features.

Make sure to run a TypeScript validation (e.g. `npx tsc --noEmit`) to verify that the dashboard and all tabs compile with no errors before reporting completion.

## 2026-06-27T02:33:18Z

Implement the backend endpoint and wire the Corporate Tab to resolve the integrity audit failure:

1. **Create `src/app/api/v1/admin/corporates/route.ts`**:
   - Secure the route by checking admin auth via `requireAdmin()`.
   - `GET`: Fetch all profiles from `public.business_profiles` (joined with the owner profile from `public.profiles` and their active subscription from `public.subscriptions`).
     - Map and return each company as:
       ```json
       {
         "id": company.id,
         "name": company.company_name_ar || company.company_name_en,
         "plan": active_subscription.tier || company.plan_id || "Starter",
         "mrr": active_subscription.mrr || 0,
         "features": {
           "hasSecondment": company.metadata.features?.hasSecondment || false,
           "hasLitigation": company.metadata.features?.hasLitigation || false,
           "hasMarketplace": company.metadata.features?.hasMarketplace || false,
           "hasGovernance": company.metadata.features?.hasGovernance || false
         }
       }
       ```
   - `PATCH`: Update a company's feature flags in the database.
     - Body: `{ id: string, features: { hasSecondment?: boolean, hasLitigation?: boolean, hasMarketplace?: boolean, hasGovernance?: boolean } }`.
     - Fetch the current metadata, merge the new feature flags into `metadata.features`, and save/update the company profile's `metadata` column in `public.business_profiles`.
     - Return `{ success: true, message: "تم تحديث صلاحيات الشركة بنجاح" }`.

2. **Modify `src/app/dashboard/admin/tabs/CorporateTab.tsx`**:
   - Replace the static mockup company data and the `useAdminSettings` hooks with standard React state management (`useState`, `useEffect`) and standard API calls to `/api/v1/admin/corporates`.
   - On load, make a `GET` request to `/api/v1/admin/corporates` to fetch the real list of companies and their features.
   - When a toggle is clicked, immediately make a `PATCH` request to `/api/v1/admin/corporates` with the updated features object, and update the state to reflect the change.
   - Preserve all existing Tailwind styles, dark mode classes, animations, and Phosphor icons.
