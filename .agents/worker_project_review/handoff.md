# Handoff Report — Code Audit & Architecture Review

## 1. Observation
* I verified the existence and content of the following files:
  - `src/proxy.ts` (Next.js middleware setup). I observed the line `export default async function proxy(req: NextRequest) {` which is never triggered because Next.js only executes `middleware.ts`.
  - `supabase/migrations/20260603_phase1_001_profiles.sql:79-82`:
    ```sql
    create policy "users update own profile"
      on public.profiles for update
      using  (id = auth.uid())
      with check (id = auth.uid());
    ```
    This policy checks row ownership but does not restrict updates to specific columns (like `user_type`), exposing a privilege escalation vulnerability.
  - `supabase/migrations/20260603_phase1_001_profiles.sql:263-304` (the `handle_new_user()` trigger). It parses `'user_type'` from signup metadata and validates it against a list that includes `'admin'`:
    ```sql
    _user_type := coalesce(
      new.raw_user_meta_data ->> 'user_type',
      'individual'
    );
    -- Validate against allowed types
    if _user_type not in (
      'individual', 'lawyer', 'firm', 'corporate',
      'micro', 'provider', 'government', 'ngo', 'admin'
    ) then ...
    ```
    This allows self-elevation of accounts to `'admin'` during registration.
  - `src/lib/supabaseLibrary.ts:369` (invoking missing RPC function `library_search`):
    ```typescript
    const { data, error } = await supabase.rpc('library_search', { ...
    ```
    No SQL migration defines `library_search` function, which causes the RPC to fail.
  - `src/lib/supabaseLibrary.ts:438-443` & `575-580` (broken table mappings):
    ```typescript
    const tableMap: Record<string, string> = {
      laws: 'laws',
      precedents: 'judicial_principles',
      orders: 'decrees',
      feqh: 'books',
    };
    ```
    The actual database tables are `principles` (not `judicial_principles`), `decrees_circulars` (not `decrees`), and `feqh_books` (not `books`), making fallback queries fail with database table relation errors.
  - `src/app/laws/page.tsx:211-227`: Bypasses server-side FTS API (`/api/library/search`) and does client-side search by loading first 100 rows from `/api/library/init` and using `.filter()`.
  - `supabase/migrations/20260706_entitlement_requests.sql:38,42`: RLS policies check admin privilege by directly querying the `profiles` table:
    ```sql
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
    ```
    bypassing the non-recursive helper function `public.is_admin()`.
  - `src/app/layout.tsx:78-87` (Google fonts loaded via link elements).
  - `src/app/layout.tsx:75` and `49-67` (client-side layout flips with FOUC risk and search crawler mismatch).
  - `src/app/globals.css:165-170` (broad physical text-alignment overrides).
  - `src/app/sitemap.ts:19-20` (hardcoded sitemap routes).
  - `src/components/FloatingButtons.tsx:12-18` (static imports of widgets/drawers causing bundle bloat).
  - `supabase/migrations/20260706_content_and_ops.sql` (foreign keys on `articles.author_id` and `support_tickets.user_id`/`assignee_id` lack indexes).
* Created the audit report in the project root: `project_review_report.md`.

## 2. Logic Chain
1. By examining `src/proxy.ts` and Next.js documentation, Next.js will ignore `proxy.ts`. Since no other middleware exists, route guards for `/dashboard/*` are inactive.
2. Checking database migration scripts for RLS rules confirmed that updates to `profiles.user_type` are not restricted to admin users, meaning owners can elevate their roles.
3. Checking `handle_new_user()` showed that it accepts `'admin'` from `new.raw_user_meta_data ->> 'user_type'`, letting new users register directly as administrators.
4. Examining `supabaseLibrary.ts` and schema migrations verified that the tables mapped in the search fallbacks do not exist, and the `library_search` RPC function is missing.
5. In-memory client-side filtering on the first 100 rows retrieved by `/api/library/init` prevents users from finding any matches past the first 100 entries.
6. The compiled report matches the 6 dimensions requested (Code Quality, Security, UI/UX, SEO, Performance, Architecture) with detailed locations and specific recommendations to fix them.

## 3. Caveats
* Staging/prod variables: If `NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND` is not set to `supabase`, the codebase runs in local-only demo mode where Supabase database schema and RLS policies are bypassed, which can hide these issues during local development.

## 4. Conclusion
* The project has significant security and architectural defects (such as inactive middleware, role elevation vectors, missing RPCs, broken table references, client-side search bypass, and bundle bloat).
* A comprehensive code audit and review report has been successfully written to `project_review_report.md` in the project root to detail these findings.

## 5. Verification Method
1. Inspect the root of the project to confirm `project_review_report.md` exists and contains the audit report.
2. Confirm the report covers all 6 dimensions with locations and recommendations.
