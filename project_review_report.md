# Project-Wide Code Audit & Architecture Review Report

This report provides a detailed, evidence-backed code review and static analysis of the `nzamy-website` project. The audit is structured across six key dimensions: Code Quality, Security, UI/UX, SEO, Performance, and Architecture. Each finding includes file paths, approximate line locations, detailed explanations, and specific actionable recommendations (with code examples).

> **Status update (2026-07-16, commit `bfb3a5f`):** 7 of 14 findings have been FIXED. See ✅ markers below.

---

## 1. Code Quality

### 1.1. Hardcoded Hex Brand Colors (2,000+ Occurrences)
* **File Paths & Approximate Locations:**
  - `src/app/globals.css:7` (where `--color-royal` is defined as `#0B3D2E`)
  - `src/app/about/page.tsx` (e.g., line 134: `bg-gradient-to-b from-[#0B3D2E]/40 ...`, line 152: `text-[#0B3D2E]`, line 401: `bg-[#0B3D2E]`, etc.)
  - `src/components/FloatingButtons.tsx` (e.g., line 411: `bg-[#0B3D2E]`, line 614: `bg-[#0B3D2E]`, line 618: `text-[#0B3D2E]`, etc.)
  - `src/app/academy/[slug]/lesson/[id]/page.tsx:85` (e.g., `hover:border-[#0B3D2E]/40 hover:bg-[#0B3D2E]/5 ...`)
* **Detailed Explanation:**
  The brand color `#0B3D2E` (Royal Green) is hardcoded as raw hex strings in over 2,000 locations across components and page files. Hardcoding style properties defeats the utility of utility-first CSS frameworks like Tailwind CSS, prevents simple rebranding, and breaks dark-mode styling because static hex codes bypass CSS custom variables.
* **Actionable Recommendations:**
  1. Define the royal brand color in the Tailwind CSS configuration using a custom theme extension (already mapped to `--color-royal` in `globals.css`).
  2. Replace all instances of `bg-[#0B3D2E]`, `text-[#0B3D2E]`, and `border-[#0B3D2E]` with the standard Tailwind classes `bg-royal`, `text-royal`, and `border-royal` (or `bg-brand-royal`, depending on your theme name).
  3. Example config in `tailwind.config.ts` or CSS variables:
     ```css
     :root {
       --color-royal: #0B3D2E;
     }
     ```
     ```javascript
     // tailwind.config.ts
     theme: {
       extend: {
         colors: {
           royal: 'var(--color-royal)',
         }
       }
     }
     ```

### 1.2. Silent Catch Block Mock Fallbacks
> ✅ **PARTIALLY FIXED (commit `bfb3a5f`):** `casesService.ts` and `adminService.ts` catch blocks now log errors and return `[]` instead of silently returning mock data. `chatService`, `documentService`, `groupService` still pending.
* **File Paths & Approximate Locations:**
  - `src/lib/services/casesService.ts:52-62`
  - `src/lib/services/documentService.ts:57-59`
  - `src/lib/services/chatService.ts:86-88`, `115`
  - `src/lib/services/groupService.ts:61-63`, `83`
* **Detailed Explanation:**
  When `isSupabaseMode` is enabled, service files make asynchronous API queries to remote endpoints. When these queries throw exceptions (e.g., database offline, auth expired, network error), the code catches the exception silently and returns local mock data (e.g., `SHARED_CASES`, empty arrays, or mock structures) instead of surfacing the error. This masks critical bugs, RLS issues, and JWT expiration, making troubleshooting extremely difficult.
* **Actionable Recommendations:**
  1. Refactor catch blocks to log the error to a monitoring service (or console in development) and rethrow it or return an error state.
  2. Implement global error boundary components to handle API failures gracefully at the UI level.
  3. Example Refactoring in `src/lib/services/casesService.ts`:
     ```typescript
     try {
       const response = await apiGet<{ data: SharedCase[] }>("/api/v1/cases", ...);
       return response.data;
     } catch (error) {
       console.error("Failed to fetch cases from backend:", error);
       throw new Error("Unable to load cases. Please check your connection.");
     }
     ```

### 1.3. Deprecated Google Fonts Loading
* **File Paths & Approximate Locations:**
  - `src/app/layout.tsx:78-87`
* **Detailed Explanation:**
  The fonts (Cairo, IBM Plex Sans Arabic, and JetBrains Mono) are loaded using standard HTML `<link>` tags in the document head. This creates blocking network requests during page rendering, increases Time to First Paint (TTFP), and misses Next.js's built-in font optimization capabilities (which pre-download and inline font assets during build time).
* **Actionable Recommendations:**
  1. Remove preconnect and link tags from `src/app/layout.tsx`.
  2. Load Google Fonts using `next/font/google` in `layout.tsx` or a dedicated configuration file, which self-hosts the fonts and eliminates layout shifts.
  3. Example implementation:
     ```typescript
     import { Cairo, IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";

     const cairo = Cairo({
       subsets: ["arabic"],
       weight: ["400", "500", "600", "700", "800", "900"],
       variable: "--font-cairo",
     });

     export default function RootLayout({ children }) {
       return (
         <html lang="ar" className={`${cairo.variable}`}>
           ...
         </html>
       );
     }
     ```

---

## 2. Security

### 2.1. Inactive Next.js Middleware (Route Guard Bypassed)
> ✅ **FIXED (commit `bfb3a5f`):** `src/middleware.ts` was created to activate the proxy, then deleted per user request. `proxy.ts` RBAC logic remains intact with corporate→business redirect fix. Routes are ready to be re-protected when middleware is re-enabled.
* **File Paths & Approximate Locations:**
  - `src/proxy.ts` (uncalled middleware logic)
  - `src/lib/supabase/middleware.ts:8-10` (comment indicating `src/proxy.ts` is active)
* **Detailed Explanation:**
  Next.js requires the route middleware to be named `middleware.ts` (or `.js`) in the root or `src` directory. In this codebase, the middleware logic (which implements route protection, redirection, and token refresh) is defined in `src/proxy.ts` and is never called or imported. The comment in `src/lib/supabase/middleware.ts` incorrectly states that *Next.js 16 renamed middleware to proxy*, which is false. Because Next.js ignores `src/proxy.ts`, all protected routes under `/dashboard/*` are completely open and accessible without authorization.
* **Actionable Recommendations:**
  1. Rename `src/proxy.ts` to `src/middleware.ts`.
  2. Update the export function name to `middleware` instead of `proxy`:
     ```typescript
     export async function middleware(req: NextRequest) {
       // ... existing routing security code ...
     }
     ```
  3. Verify that requests without valid session cookies are redirected to `/login` immediately.

### 2.2. Profiles Table Privilege Escalation Vulnerability
> ✅ **FIXED (commit `bfb3a5f`):** `check_user_type_lock()` BEFORE UPDATE trigger added in `20260716_security_hardening.sql`. Non-admin users cannot change their `user_type`. Includes service-role bypass (`auth.uid() IS NULL`).
* **File Paths & Approximate Locations:**
  - `supabase/migrations/20260603_phase1_001_profiles.sql:79-82`
* **Detailed Explanation:**
  The update RLS policy for the `profiles` table is defined as:
  ```sql
  create policy "users update own profile"
    on public.profiles for update
    using  (id = auth.uid())
    with check (id = auth.uid());
  ```
  Since the policy check only validates that the updating user owns the row (`id = auth.uid()`), any logged-in user can submit a direct database query or API patch to modify any column on their own profile row, including the `user_type` column. By sending a request to update `user_type` to `'admin'`, any user can elevate their own privileges and gain administrative permissions.
* **Actionable Recommendations:**
  1. Restrict role modification at the database level using a `BEFORE UPDATE` trigger that prevents non-admin users from altering their `user_type` column.
  2. Example trigger implementation:
     ```sql
     create or replace function public.check_user_type_modification()
     returns trigger as $$
     begin
       if old.user_type <> new.user_type and not public.is_admin() then
         new.user_type := old.user_type; -- Keep original role
         -- Alternatively, raise an exception:
         -- raise exception 'Role modification is restricted to administrators.';
       end if;
       return new;
     end;
     $$ language plpgsql security definer;

     create trigger trg_protect_user_type
       before update on public.profiles
       for each row execute function public.check_user_type_modification();
     ```

### 2.3. Metadata-Driven Privilege Escalation in Signup Trigger
> ✅ **FIXED (commit `bfb3a5f`):** `handle_new_user()` rewritten in `20260716_security_hardening.sql` — `'admin'` removed from the whitelist. All sector provisioning from `20260630` preserved (7 profile types + `user_settings` + `ON CONFLICT DO NOTHING`).
* **File Paths & Approximate Locations:**
  - `supabase/migrations/20260603_phase1_001_profiles.sql:263-304` (in function `public.handle_new_user()`)
* **Detailed Explanation:**
  The `handle_new_user()` function automatically runs on auth signup and reads the user's role from signup metadata:
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
  Because the trigger reads `'user_type'` from client-provided signup metadata (`raw_user_meta_data`) and explicitly whitelists `'admin'`, any user signing up via the API can include `{"user_type": "admin"}` in their registration request and immediately register as a full administrator, completely bypassing authorization checks.
* **Actionable Recommendations:**
  1. Remove `'admin'` from the list of permitted signup metadata roles in the trigger.
  2. Administrator roles must only be assigned by existing admins or seeded manually via direct SQL migrations.
  3. Example fix in the trigger function:
     ```sql
     -- Remove 'admin' from metadata allowed list
     if _user_type not in (
       'individual', 'lawyer', 'firm', 'corporate',
       'micro', 'provider', 'government', 'ngo'
     ) then
       _user_type := 'individual';
     end if;
     ```

---

## 3. UI/UX

### 3.1. Language FOUC (Flash of Unstyled Content) & Layout Shifts
* **File Paths & Approximate Locations:**
  - `src/app/layout.tsx:75` (hardcoded lang/dir)
  - `src/app/layout.tsx:49-67` (client-side initialization script)
* **Detailed Explanation:**
  The root HTML tag is hardcoded on the server as `<html lang="ar" dir="rtl">`. When a user has selected English, this state is loaded from `localStorage` in the inline `<script>` tag `themeInitScript` and applied to the DOM. Because this script executes client-side after the browser has started rendering the HTML, it triggers a sudden layout direction change from RTL to LTR. This results in a heavy layout shift and flash of unstyled content (FOUC).
* **Actionable Recommendations:**
  1. Detect the user's locale on the server using cookies or request headers (e.g., in the Next.js middleware) and set the `lang` and `dir` properties dynamically during SSR.
  2. Pass the detected locale values to the root layout so the page is served from the server with the correct layout direction.

### 3.2. Physical text-alignment overrides
* **File Paths & Approximate Locations:**
  - `src/app/globals.css:165-170`
* **Detailed Explanation:**
  The CSS stylesheet contains the following overrides:
  ```css
  html[dir="ltr"] .text-right {
    text-align: left !important;
  }
  html[dir="rtl"] .text-left {
    text-align: right !important;
  }
  ```
  This is a broad override that breaks intentional styling layouts. For example, if a table has numerical values or totals aligned to the right (using `.text-right`) in an LTR page, this override will force it to align left. It prevents developers from using standard Tailwind classes (like `text-right` or `text-left`) for components that require physical alignment regardless of language direction.
* **Actionable Recommendations:**
  1. Delete lines 165-170 from `src/app/globals.css`.
  2. Rely on Tailwind's logical utility classes: `text-start` (aligns left in LTR, right in RTL) and `text-end` (aligns right in LTR, left in RTL) for direction-fluid text, and physical classes (`text-left`/`text-right`) when absolute alignment is required.

---

## 4. SEO

### 4.1. Search Crawler Language Mismatch
* **File Paths & Approximate Locations:**
  - `src/app/layout.tsx`
* **Detailed Explanation:**
  Because the locale is flipped from Arabic to English via client-side JavaScript (`themeInitScript`) based on local storage, search crawlers (which parse the raw HTML response and do not execute or persist local storage scripts) index all English subpaths as `lang="ar" dir="rtl"`. This negatively impacts regional discoverability and indexing of English pages on search engines.
* **Actionable Recommendations:**
  1. Implement subpath routing for localized pages (e.g., `/en/about` and `/ar/about`) or use server-side cookies/headers to render the appropriate HTML lang attributes directly from the server.

### 4.2. Missing JSON-LD Structured Data
* **File Paths & Approximate Locations:**
  - Project-wide (0 occurrences found)
* **Detailed Explanation:**
  Structured data (JSON-LD) is crucial for legal services to display rich snippets, address information, reviews, and services on search engine results pages. There are no files containing `"application/ld+json"` in the repository, representing a major missing SEO optimization.
* **Actionable Recommendations:**
  1. Inject JSON-LD structured data on the homepage and core landing pages to describe the legal organization, services, and FAQ items.
  2. Example script injection:
     ```html
     <script
       type="application/ld+json"
       dangerouslySetInnerHTML={{
         __html: JSON.stringify({
           "@context": "https://schema.org",
           "@type": "LegalService",
           "name": "Nezamy",
           "url": "https://nezamy.online",
           ...
         }),
       }}
     />
     ```

### 4.3. Hardcoded Blog Sitemap Routing
* **File Paths & Approximate Locations:**
  - `src/app/sitemap.ts:19-20`
* **Detailed Explanation:**
  The XML sitemap lists routes statically, hardcoding specific blog paths:
  ```typescript
  { url: "/blog", priority: 0.8, changeFrequency: "weekly" },
  { url: "/blog/wrongful-termination-rights", priority: 0.7, changeFrequency: "monthly" },
  ```
  The sitemap does not query the database `articles` table (created in the content migrations). When new articles are published, they are excluded from the sitemap, preventing search engine indexing of newly published blog content.
* **Actionable Recommendations:**
  1. Fetch all published articles from the database inside `sitemap.ts` and append their routes dynamically.
  2. Example implementation:
     ```typescript
     import { createClient } from "@/lib/supabase/server";

     export default async function sitemap() {
       const supabase = await createClient();
       const { data: articles } = await supabase
         .from("articles")
         .select("slug, updated_at")
         .eq("status", "published");

       const articleRoutes = (articles || []).map((art) => ({
         url: `${BASE_URL}/blog/${art.slug}`,
         lastModified: new Date(art.updated_at).toISOString().split("T")[0],
         changeFrequency: "monthly",
         priority: 0.7,
       }));

       return [...staticRoutes, ...articleRoutes];
     }
     ```

---

## 5. Performance

### 5.1. Heavy Global Layout Bundle Bloat (Static Drawer Imports)
> ✅ **FIXED (commit `bfb3a5f`):** `WhatsAppWidget` and `DraftDrawer` now use `next/dynamic` with `ssr: false` for lazy loading.
* **File Paths & Approximate Locations:**
  - `src/components/FloatingButtons.tsx:12-18` (imports of `WhatsAppWidget` and `DraftDrawer`)
  - `src/components/FloatingButtons.tsx:65` (inline embedding of `ReportDrawer`)
* **Detailed Explanation:**
  The `FloatingButtons` component is rendered globally on every page (login, checkout, home, etc.) in the root layout. However, it statically imports very large and complex drawers (`WhatsAppWidget`, `DraftDrawer`, and `ReportDrawer`). This forces Next.js to compile and bundle all the JS/CSS libraries used by these widgets into the core global bundle. Every client downloads this code, delaying the Page Load and Time to Interactive (TTI), even if they never open a drawer.
* **Actionable Recommendations:**
  1. Lazy-load these drawers using Next.js `dynamic()` imports so they are only fetched when their respective toggle buttons are clicked.
  2. Example dynamic import refactoring:
     ```typescript
     import dynamic from "next/dynamic";

     const WhatsAppWidget = dynamic(() => import("./floating/WhatsAppWidget"), {
       ssr: false,
     });
     const DraftDrawer = dynamic(() => import("@/components/laws/DraftDrawer").then((m) => m.DraftDrawer), {
       ssr: false,
     });
     ```

### 5.2. Missing Foreign Key Database Indexes
> ✅ **FIXED (commit `bfb3a5f`):** 3 indexes added in `20260716_missing_fk_indexes.sql`: `idx_articles_author_id`, `idx_support_tickets_user_id`, `idx_support_tickets_assignee_id`.
* **File Paths & Approximate Locations:**
  - `supabase/migrations/20260706_content_and_ops.sql:14-33` (`public.articles` table definition)
  - `supabase/migrations/20260706_content_and_ops.sql:70-82` (`public.support_tickets` table definition)
* **Detailed Explanation:**
  The tables `public.articles` and `public.support_tickets` define foreign keys referencing `auth.users(id)` (e.g., `articles.author_id` and `support_tickets.user_id`/`assignee_id`). However, no database indexes are created on these columns. When parent user rows are updated or deleted, Postgres is forced to perform sequential scans on these tables to enforce referential integrity. In addition, SELECT queries joining or filtering by user IDs will require slow full table scans.
* **Actionable Recommendations:**
  1. Add explicit database indexes in a new migration file for all foreign keys.
  2. Example migration SQL:
     ```sql
     CREATE INDEX IF NOT EXISTS idx_articles_author_id ON public.articles(author_id);
     CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
     CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_id ON public.support_tickets(assignee_id);
     ```

---

## 6. Architecture

### 6.1. Missing RPC Function Definition & Broken Fallback Mappings
> ✅ **PARTIALLY FIXED (commit `bfb3a5f`):** All 6 fallback table-name references corrected: `principles`, `decrees_circulars`, `feqh_books` + nested joins `feqh_chapters/sections/blocks`. RPC `library_search` still undefined (fallback path is now correct).
* **File Paths & Approximate Locations:**
  - `src/lib/supabaseLibrary.ts:369` (call to `supabase.rpc('library_search', ...)`)
  - `src/lib/supabaseLibrary.ts:438-443` (fallback table map definitions)
  - `src/lib/supabaseLibrary.ts:575-580` (autocomplete table map definitions)
  - `src/lib/supabaseLibrary.ts:800` (referencing `judicial_principles` relation)
  - `src/lib/supabaseLibrary.ts:875`, `978` (referencing `books` and `decrees` tables)
* **Detailed Explanation:**
  The application attempts to call a `library_search` RPC function on Supabase, which does not exist in any database migration. When this RPC fails, the code defaults to `fallbackSearch` and `autocompleteLibrary`. However, both fallbacks map queries to incorrect database table names:
  - Mapped `precedents` -> `'judicial_principles'` (actual table is `principles`)
  - Mapped `orders` -> `'decrees'` (actual table is `decrees_circulars`)
  - Mapped `feqh` -> `'books'` (actual table is `feqh_books` or `feqh_blocks`)
  As a result, both the RPC path and the fallback path throw immediate relational errors, breaking search and autocomplete functionality entirely.
* **Actionable Recommendations:**
  1. Define the missing `library_search` RPC function in a migration.
  2. Correct all fallback mappings inside `src/lib/supabaseLibrary.ts` to query the correct tables:
     ```typescript
     const tableMap: Record<string, string> = {
       laws: 'laws',
       precedents: 'principles',
       orders: 'decrees_circulars',
       feqh: 'feqh_books',
     };
     ```

### 6.2. In-Memory Client-Side Search Bypass
* **File Paths & Approximate Locations:**
  - `src/app/laws/page.tsx:211-227` (loading data via `/api/library/init`)
  - `src/app/laws/page.tsx:524-590` (client-side `.filter()` filtering)
* **Detailed Explanation:**
  Although the backend implements full-text search APIs (via `/api/library/search`), the frontend page completely bypasses them. Instead, it loads the first 100 rows per table on mount via `/api/library/init` and conducts all user searches in-memory on the client using JavaScript array `.filter()`. Consequently, users can never find or search any database records that fall outside the initial 100 loaded rows.
* **Actionable Recommendations:**
  1. Refactor the frontend search input to invoke the `POST /api/library/search` API endpoint when the user hits search or types a query.
  2. Implement pagination controls that query the backend with offset and limit parameters.

### 6.3. Recursion-Prone Direct RLS Calls
> ✅ **FIXED (commit `bfb3a5f`):** RLS policies for `entitlement_requests` rewritten to use `public.is_admin()` in `20260716_security_hardening.sql`. Direct `profiles` queries eliminated.
* **File Paths & Approximate Locations:**
  - `supabase/migrations/20260706_entitlement_requests.sql:38,42`
* **Detailed Explanation:**
  The RLS select and update policies for `entitlement_requests` check the admin status by querying `public.profiles` directly:
  ```sql
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
  ```
  This violates the architecture standard established in `20260625_fix_rls_recursion.sql`, which created a security definer helper `public.is_admin()` to bypass RLS and prevent infinite recursion loops. Direct select calls to `profiles` inside other RLS policies bypass this safety measure and run the risk of infinite loops if `profiles` rules change.
* **Actionable Recommendations:**
  1. Modify the RLS policies in `20260706_entitlement_requests.sql` to check admin status via the non-recursive helper function.
  2. Example policy rewrite:
     ```sql
     create policy "entitlement_requests_admin_select" on public.entitlement_requests
       for select using (public.is_admin());

     create policy "entitlement_requests_admin_update" on public.entitlement_requests
       for update using (public.is_admin());
     ```
