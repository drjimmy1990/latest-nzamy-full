# Code Audit & Comprehensive Static Analysis Report

This report provides a detailed, evidence-backed code review and static analysis of the `nzamy-website` project across six key dimensions: Code Quality, Security, UI/UX, SEO, Performance, and Architecture.

---

## 1. Observations

### 1.1. Code Quality
* **Observation A (Hardcoded Hex Brand Colors):** A search for the brand hex color `#0B3D2E` (defined as `--color-royal` in `src/app/globals.css:7`) returned over 2,000 matches in component and page files. Examples:
  - `src/app/about/page.tsx:134`: `bg-gradient-to-b from-[#0B3D2E]/40 ...`
  - `src/app/academy/[slug]/lesson/[id]/page.tsx:85`: `hover:border-[#0B3D2E]/40 hover:bg-[#0B3D2E]/5 ...`
  - `src/components/FloatingButtons.tsx:401`: `bg-[#0B3D2E]`
* **Observation B (Silent Catch Mock Fallbacks):** In `src/lib/services/casesService.ts:52-62`, API fetches are wrapped in try-catch blocks and silently fall back to mock data:
  ```typescript
  try {
    const response = await apiGet<{ data: SharedCase[] }>("/api/v1/cases", ...);
    return response.data;
  } catch {
    return SHARED_CASES;
  }
  ```
  Similar silent fallbacks are found in `chatService.ts:86-88`, `documentService.ts:57-59`, and `groupService.ts:61-63`.
* **Observation C (Deprecated Google Fonts Loading):** In `src/app/layout.tsx:78-87`, Google Fonts are loaded using link elements:
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ```

### 1.2. Security
* **Observation A (Inactive Middleware):** The routing, authentication, and redirection logic is defined in `src/proxy.ts`. No `src/middleware.ts` or root `middleware.ts` exists. Running `npx gitnexus context "proxy" --repo latest-nzamy-full` confirms `proxy` has no incoming callers (i.e., it is never invoked by Next.js). Comments in `src/lib/supabase/middleware.ts:8-10` indicate:
  ```typescript
  * NOTE: This helper is currently unused — this project's active middleware is
  * `src/proxy.ts` (Next.js 16 renamed `middleware` → `proxy`), which inlines its
  * own session refresh + route protection. Kept for reference.
  ```
* **Observation B (Profiles Table Privilege Escalation):** In `supabase/migrations/20260603_phase1_001_profiles.sql:79-82`, the update policy for `profiles` is defined as:
  ```sql
  create policy "users update own profile"
    on public.profiles for update
    using  (id = auth.uid())
    with check (id = auth.uid());
  ```
  The table includes a `user_type` column that controls roles (e.g., `'admin'`).
* **Observation C (Signup Trigger Privilege Escalation):** In `supabase/migrations/20260603_phase1_001_profiles.sql:263-304`, the `handle_new_user()` trigger handles metadata-driven role assignments:
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

### 1.3. UI/UX
* **Observation A (Language FOUC Layout Shifts):** The root layout `src/app/layout.tsx:75` is hardcoded to `<html lang="ar" dir="rtl">`. If a user selected English, layout variables are flipped client-side in the inline script `themeInitScript` (lines 49-67) via JavaScript:
  ```javascript
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  ```
* **Observation B (Physical text-alignment overrides):** In `src/app/globals.css:165-170`, alignment overrides are hardcoded as:
  ```css
  html[dir="ltr"] .text-right {
    text-align: left !important;
  }
  html[dir="rtl"] .text-left {
    text-align: right !important;
  }
  ```

### 1.4. SEO
* **Observation A (Search Crawler Mismatch):** Search index crawlers do not run the client-side `themeInitScript` layout flips, indexing all pages (including English/LTR subpaths) as `lang="ar" dir="rtl"`.
* **Observation B (Missing JSON-LD Structured Data):** A global search for `"application/ld+json"` returned 0 matches in code files.
* **Observation C (Hardcoded Blog Sitemap):** In `src/app/sitemap.ts:19-20`, the sitemap dynamically constructs URLs but hardcodes:
  ```typescript
  { url: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { url: "/blog/wrongful-termination-rights", priority: 0.7, changeFrequency: "monthly" },
  ```
  It does not query the database `articles` table created in `supabase/migrations/20260706_content_and_ops.sql`.

### 1.5. Performance
* **Observation A (Heavy Global Layout Dependencies):** The root layout `src/app/layout.tsx:95` renders `<FloatingButtons />` globally. In `src/components/FloatingButtons.tsx:12-18`, components such as `WhatsAppWidget` and `DraftDrawer` are statically imported, and `ReportDrawer` is embedded directly.
* **Observation B (Missing Foreign Key Indexes):** In `supabase/migrations/20260706_content_and_ops.sql`, tables `articles` and `support_tickets` contain foreign key constraints referencing `auth.users(id)` (e.g. `articles.author_id` and `support_tickets.user_id`), but no indexes are created for these columns.

### 1.6. Architecture
* **Observation A (Bypassed RPC search & broken fallback table maps):** In `src/lib/supabaseLibrary.ts:369`, `supabase.rpc('library_search', { ... })` is called. No migration defines a `library_search` SQL function. The code catches the RPC failure and falls back to `fallbackSearch`, which maps sections to tables in `supabaseLibrary.ts:438-443`:
  ```typescript
  const tableMap: Record<string, string> = {
    laws: 'laws',
    precedents: 'judicial_principles',
    orders: 'decrees',
    feqh: 'books',
  };
  ```
  However, the actual database tables created in `20260626_legal_library_schema.sql` are named `principles` (not `judicial_principles`), `decrees_circulars` (not `decrees`), and `feqh_books` (not `books`).
* **Observation B (Bypassed Server-Side FTS Search):** The frontend page `src/app/laws/page.tsx` does not invoke `/api/library/search` or `supabaseLibrary.ts:searchLibrary`. Instead, it initializes the page by calling `/api/library/init` (which fetches the first 100 rows per table), and handles all searches in-memory on the client using `.filter()` on these 100 rows.
* **Observation C (Recursion-Prone Direct RLS Calls):** In `supabase/migrations/20260706_entitlement_requests.sql:38,42`, policies query `profiles` directly using:
  ```sql
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
  ```
  bypassing the non-recursive helper function `public.is_admin()` created in `20260625_fix_rls_recursion.sql`.

---

## 2. Logic Chain

1. **Code Quality (Hardcoding & Fallbacks):**
   * By hardcoding hex color `#0B3D2E` in over 2,000 places instead of reference configuration, changing the color requires search-and-replace across the entire codebase. This also prevents the application from applying dark mode styling for these components since static hex codes ignore CSS theme variables.
   * Silently catching API errors and returning `SHARED_CASES` (mock data) in services hides database disconnects, RLS policies failure, and JWT expiration issues from both developers and the UI.
2. **Security (Inactive Middleware & Privilege Escalations):**
   * Next.js expects routing middleware to be configured at `src/middleware.ts` or root `middleware.ts`. Because the file is named `src/proxy.ts` and not configured or imported anywhere, it is completely ignored during build and runtime. As a result, route protection, session updates, and role validations are inactive, leaving `/dashboard/*` endpoints unprotected.
   * Since the update policy for `profiles` checks `id = auth.uid()` without checking which columns are updated, any logged-in user can execute a `PATCH` request to modify their own `user_type` column to `'admin'`, obtaining full administrative access.
   * Similarly, since `public.handle_new_user()` reads `user_type` from user metadata provided during registration and whitelists `'admin'`, any user can sign up directly as an administrator.
3. **UI/UX (Flickers & Overrides):**
   * Delivering a hardcoded `lang="ar" dir="rtl"` HTML page and subsequently flipping the direction to `ltr` via client-side JavaScript creates a structural layout flip (FOUC).
   * Overriding all `.text-right` classes to `left` in LTR and `.text-left` to `right` in RTL breaks intentional layouts, such as aligning currency digits in LTR tables.
4. **SEO (Crawlers & Sitemaps):**
   * Crawlers do not execute dynamic scripts block-synchronously. They index the page as Arabic-only, damaging indexing and regional discoverability for English subpaths.
   * In addition, since `sitemap.ts` hardcodes blog URLs and does not query the database `articles` table, newly published articles are excluded from the sitemap.
5. **Performance (Layout Bloat & Sequential Scans):**
   * Statically importing the heavy WhatsApp widget, drafting drawers, and report drawers inside the global `FloatingButtons` forces the client to download, parse, and evaluate this code on every route (including simple landing and login pages), increasing bundle size and TTI.
   * Not creating indexes on foreign key columns (like `author_id` and `user_id` in `articles` and `support_tickets`) forces Postgres to perform sequential table scans during RLS checks and joins.
6. **Architecture (Broken Search & Recursion):**
   * Because `library_search` SQL function is missing in migrations, search queries fail and hit the `fallbackSearch` path.
   * `fallbackSearch` and `autocompleteLibrary` attempt to query non-existent tables (`judicial_principles`, `decrees`, `books` instead of `principles`, `decrees_circulars`, `feqh_books`), causing database errors.
   * Since the frontend `page.tsx` implements search by filtering in-memory on the cached first 100 rows loaded by `/api/library/init`, users cannot search or find any data beyond the first 100 rows in the database.
   * Querying the `profiles` table directly inside RLS policies in `20260706_entitlement_requests.sql` bypasses the `public.is_admin()` helper, violating architectural rules and risking infinite recursion loops.

---

## 3. Caveats

* **Staging and Production Variables:** This audit assumes that the production server is intended to run in Supabase mode (`NEXT_PUBLIC_NZAMY_WORKFLOW_BACKEND="supabase"`). If this variable is misconfigured or omitted, the application silently falls back to local-only mock data.

---

## 4. Conclusion & Actionable Recommendations

### 4.1. Code Quality
* **Recommendation 1:** Replace all hardcoded occurrences of `#0B3D2E` with the Tailwind CSS variable configuration class `bg-royal` / `text-royal`.
* **Recommendation 2:** Refactor the service catch blocks in `src/lib/services/` to propagate errors instead of returning mock data when `isSupabaseMode` is active.
* **Recommendation 3:** Load Google Fonts using Next.js's built-in `next/font/google` loader in `layout.tsx` to optimize layout stability.

### 4.2. Security
* **Recommendation 4:** Rename `src/proxy.ts` to `src/middleware.ts` so Next.js executes it on all incoming requests.
* **Recommendation 5:** Secure the `user_type` column in `profiles` by attaching a database trigger that rejects updates to `user_type` unless executed by an admin user.
* **Recommendation 6:** Remove `'admin'` from the signup trigger whitelist (`public.handle_new_user()`) to prevent self-elevation during registration.

### 4.3. UI/UX
* **Recommendation 7:** Set the `lang` and `dir` attributes of `<html>` dynamically in `src/app/layout.tsx` based on cookie-based server-side locale detection.
* **Recommendation 8:** Remove physical-to-logical overrides in `src/app/globals.css` (lines 165-170). Use Tailwind's logical utility classes (`text-start`/`text-end`) instead.

### 4.4. SEO
* **Recommendation 9:** Programmatically query published database articles in `sitemap.ts` to build dynamic routes.
* **Recommendation 10:** Inject structured JSON-LD data describing the legal service details on the homepage.

### 4.5. Performance
* **Recommendation 11:** Refactor `src/components/FloatingButtons.tsx` to lazy-load `WhatsAppWidget`, `DraftDrawer`, and `ReportDrawer` using Next.js `dynamic()` only when opened.
* **Recommendation 12:** Add explicit indexes to foreign key columns:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_articles_author_id ON public.articles(author_id);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_id ON public.support_tickets(assignee_id);
  ```

### 4.6. Architecture
* **Recommendation 13:** Implement the missing `library_search` database RPC function in migrations.
* **Recommendation 14:** Fix table name mappings in `src/lib/supabaseLibrary.ts` (`fallbackSearch` and `autocompleteLibrary`) to query `principles`, `decrees_circulars`, and `feqh_books` instead of `judicial_principles`, `decrees`, and `books`.
* **Recommendation 15:** Refactor frontend search in `src/app/laws/page.tsx` to call `/api/library/search` using server-side full-text search instead of doing client-side `.filter()` on the first 100 loaded rows.
* **Recommendation 16:** In `supabase/migrations/20260706_entitlement_requests.sql`, refactor RLS policies to use the non-recursive `public.is_admin()` helper function.

---

## 5. Verification Method

1. **Verify Middleware Status:** Run `npm run test` (which triggers `node scripts/smoke-routes.mjs`). If the file is named `src/proxy.ts`, accessing `/dashboard/*` routes without cookies will succeed, confirming the middleware is bypassed. Rename `proxy.ts` to `middleware.ts` and run again; the tests will output redirect statuses.
2. **Verify Table Mappings:** Query `autocompleteLibrary` or `searchLibrary` inside a test wrapper. Confirm it throws database relation errors when the fallback path is executed.
3. **Verify Privilege Escalation:** Sign up a test user using the Supabase client while setting `"user_type": "admin"` in user metadata, then check if the user is registered as an admin.
