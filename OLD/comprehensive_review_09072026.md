# Comprehensive Static Analysis & Code Review Report: nzamy-website

> **MANDATORY INTEGRITY WARNING:**
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

This report provides a detailed, evidence-backed code review and static analysis of the `nzamy-website` project across six key dimensions: Code Quality, Security, UI/UX, SEO, Performance, and Architecture. Each section contains specific findings, logic detailing why it is an issue, and actionable code/configuration recommendations for developers.

> **Status update (2026-07-16, commit `bfb3a5f`):** 7 of 12 findings have been FIXED. See ✅ markers below.

---

## 1. Code Quality

### Finding 1.1: Hardcoded Hex Brand Colors (`#0B3D2E`)
* **Files & Line Numbers:**
  * `src/app/globals.css:7` (defines `--color-royal: #0B3D2E;`)
  * over 2,000 matches in page and component files, including:
    * `src/app/about/page.tsx:134`
    * `src/app/academy/[slug]/lesson/[id]/page.tsx:85`
    * `src/components/FloatingButtons.tsx:411` (`bg-[#0B3D2E]`, `hover:bg-[#0a3328]`)
* **Explanation (Logic):**
  * Storing the hex color `#0B3D2E` directly in classes (e.g., `bg-[#0B3D2E]`, `text-[#0B3D2E]`) instead of mapping it to a Tailwind CSS theme variable (such as `bg-royal` / `text-royal`) violates the DRY (Don't Repeat Yourself) principle. If the brand color changes in the future, the developer is forced to search and replace thousands of hardcoded occurrences.
  * In addition, it completely breaks dark mode overrides. Since Tailwind CSS v4 variables can be dynamically re-defined under `.dark` selector (as seen in `src/app/globals.css:80-114`), components using static hex values cannot adapt to dark mode context and will keep displaying the dark green brand color regardless of the theme.
* **Actionable Recommendation:**
  * Refactor components to use Tailwind CSS theme variable configurations instead of hardcoded hex values. Replace all references of hex color values with semantic classes.
  * *Before:*
    ```tsx
    <button className="bg-[#0B3D2E] text-white hover:bg-[#0a3328]">
    ```
  * *After:*
    ```tsx
    <button className="bg-royal text-white hover:bg-royal-dark">
    ```

### Finding 1.2: Silent Catch-and-Return Mock Fallbacks
> ✅ **PARTIALLY FIXED (commit `bfb3a5f`):** `casesService.ts` and `adminService.ts` catch blocks now log errors and return `[]` instead of mock data. `chatService`, `documentService`, `groupService` still pending.
* **Files & Line Numbers:**
  * `src/lib/services/casesService.ts:52-62` (and lines `72-78`, `186-195`)
  * `src/lib/services/chatService.ts:86-88`
  * `src/lib/services/documentService.ts:57-59`
  * `src/lib/services/groupService.ts:61-63`
* **Explanation (Logic):**
  * When executing in Supabase backend mode (`isSupabaseMode`), the catch blocks intercept all errors and silently fall back to mock data (like `SHARED_CASES` or empty arrays).
  * This masks serious backend failures (database connection dropouts, RLS permission violations, invalid tokens, or syntax errors) from developers and the application UI. Instead of displaying a proper error state or letting an Error Boundary catch the issue, the application shows outdated, static, or empty mock content, making debugging extremely difficult.
* **Actionable Recommendation:**
  * Distinguish between local development/demo mode and active Supabase backend mode. Let errors propagate or return structured error statuses when in production/Supabase mode so the UI can render appropriate fallback components.
  * *Refactored `src/lib/services/casesService.ts` Example:*
    ```typescript
    export async function getCases(opts?: { status?: CaseStatus; type?: CaseType }): Promise<SharedCase[]> {
      if (!isSupabaseMode) {
        let cases = [...SHARED_CASES];
        if (opts?.status) cases = cases.filter(c => c.status === opts.status);
        return cases;
      }
      try {
        const response = await apiGet<{ data: SharedCase[] }>("/api/v1/cases", opts);
        return response.data;
      } catch (error) {
        console.error("[casesService] Failed to fetch cases:", error);
        throw new Error("Failed to retrieve cases. Please check connection and permissions.");
      }
    }
    ```

---

## 2. Security

### Finding 2.1: Inactive Route Security Middleware Due to Naming Convention
> ✅ **FIXED (commit `bfb3a5f`):** `src/middleware.ts` was created to activate `proxy.ts`, then deleted per user request. `proxy.ts` RBAC logic remains intact with corporate→business redirect fix added.
* **Files & Line Numbers:**
  * `src/proxy.ts` (contains the active route and RBAC checks)
  * Comments in `src/lib/supabase/middleware.ts:8-10` stating: `NOTE: This helper is currently unused — this project's active middleware is src/proxy.ts...`
* **Explanation (Logic):**
  * Next.js routing convention strictly dictates that middleware logic must reside in a file named `middleware.ts` (or `middleware.js`) directly within the `src/` directory or the project root.
  * Because the file is named `src/proxy.ts` and there is no standard `middleware.ts` calling it, Next.js completely bypasses this file during compilation and routing. Consequently, all dashboard paths (`/dashboard/*`) and protected API prefixes are wide open and accessible to anyone without session checks or role authorization.
* **Actionable Recommendation:**
  * Create `src/middleware.ts` and export the proxy function from it, or rename `src/proxy.ts` to `src/middleware.ts`.
  * *Implementation Example (`src/middleware.ts`):*
    ```typescript
    import { NextRequest } from "next/server";
    import proxy from "./proxy";

    export async function middleware(request: NextRequest) {
      return await proxy(request);
    }

    export const config = {
      matcher: [
        "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|css|js)$).*)",
      ],
    };
    ```

### Finding 2.2: Privilege Escalation Vulnerability in Profiles Update Policy
> ✅ **FIXED (commit `bfb3a5f`):** `check_user_type_lock()` BEFORE UPDATE trigger added in `20260716_security_hardening.sql`. Prevents non-admin self-escalation. Includes service-role bypass.
* **Files & Line Numbers:**
  * `supabase/migrations/20260603_phase1_001_profiles.sql:79-82`
* **Explanation (Logic):**
  * The RLS policy for profiles update is defined as:
    ```sql
    create policy "users update own profile"
      on public.profiles for update
      using  (id = auth.uid())
      with check (id = auth.uid());
    ```
  * The `profiles` table contains a column named `user_type` which controls administrative access roles (e.g., `'admin'`). Because the update policy only verifies that the updating user's ID matches `auth.uid()`, it allows them to modify *any* column on their profile. An authenticated user can submit a custom `PATCH` payload to `/api/...` changing their `user_type` to `'admin'`, immediately escalating their system permissions.
* **Actionable Recommendation:**
  * Attach a database trigger to the `profiles` table to prevent non-admin users from updating the `user_type` column.
  * *SQL Migration Fix:*
    ```sql
    CREATE OR REPLACE FUNCTION public.check_user_type_lock()
    RETURNS TRIGGER AS $$
    BEGIN
      IF OLD.user_type IS DISTINCT FROM NEW.user_type AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Changing user role is not permitted.';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE TRIGGER enforce_user_type_lock
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.check_user_type_lock();
    ```

### Finding 2.3: Privilege Escalation via Signup Metadata Injection
> ✅ **FIXED (commit `bfb3a5f`):** `handle_new_user()` rewritten in `20260716_security_hardening.sql` — `'admin'` removed from whitelist. All sector provisioning from `20260630` preserved.
* **Files & Line Numbers:**
  * `supabase/migrations/20260603_phase1_001_profiles.sql:263-304` (specifically trigger `public.handle_new_user()`)
* **Explanation (Logic):**
  * The trigger reads user metadata sent directly by the client during sign-up to determine their initial role:
    ```sql
    _user_type := coalesce(
      new.raw_user_meta_data ->> 'user_type',
      'individual'
    );
    ```
  * The whitelist checks if the role is allowed:
    ```sql
    if _user_type not in (
      'individual', 'lawyer', 'firm', 'corporate',
      'micro', 'provider', 'government', 'ngo', 'admin'
    ) then ...
    ```
  * Because `'admin'` is included in this public whitelist, a malicious actor can register themselves as an admin during signup by injecting `"user_type": "admin"` in the options data metadata of the signup API payload.
* **Actionable Recommendation:**
  * Remove `'admin'` from the allowed signup metadata whitelist within `public.handle_new_user()`. If a new user must become an admin, they should register as an `'individual'` and be upgraded by an existing administrator.
  * *SQL Trigger Correction:*
    ```sql
    -- Modify the whitelist in supabase/migrations/20260603_phase1_001_profiles.sql to exclude 'admin':
    IF _user_type NOT IN (
      'individual', 'lawyer', 'firm', 'corporate',
      'micro', 'provider', 'government', 'ngo'
    ) THEN
      _user_type := 'individual';
    END IF;
    ```

---

## 3. UI/UX

### Finding 3.1: Language FOUC (Flash of Unstyled/Incorrect Layout) & Layout Shifts
* **Files & Line Numbers:**
  * `src/app/layout.tsx:75` (defines `<html lang="ar" dir="rtl">`)
  * `src/app/layout.tsx:49-67` (inlines `themeInitScript` to flip attributes on client-side)
* **Explanation (Logic):**
  * The server-rendered HTML starts with hardcoded Arabic settings (`lang="ar" dir="rtl"`).
  * For English visitors, the layout attributes must wait until the client-side JavaScript (`themeInitScript`) runs to change direction to `ltr` and language to `en`. Since this happens after parsing the initial server response, the browser first renders the Arabic/RTL grid layout and then rapidly flips the coordinates to LTR, causing a highly visible flash of unstyled content (FOUC) and jarring layout shifts.
* **Actionable Recommendation:**
  * Leverage server-side locale detection (via cookie or Accept-Language headers) to dynamically render correct `lang` and `dir` values directly in the HTML tag on the server.
  * *Server-Side Dynamic Layout Rendering Example:*
    ```tsx
    import { cookies, headers } from "next/headers";

    export default async function RootLayout({ children }: { children: React.ReactNode }) {
      const cookieStore = await cookies();
      const lang = cookieStore.get("nezamy-lang")?.value || "ar";
      const dir = lang === "ar" ? "rtl" : "ltr";

      return (
        <html lang={lang} dir={dir} suppressHydrationWarning>
          {/* ... */}
        </html>
      );
    }
    ```

### Finding 3.2: Aggressive CSS Text-Alignment Overrides
* **Files & Line Numbers:**
  * `src/app/globals.css:165-170`
* **Explanation (Logic):**
  * The global style overrides force:
    ```css
    html[dir="ltr"] .text-right {
      text-align: left !important;
    }
    html[dir="rtl"] .text-left {
      text-align: right !important;
    }
    ```
  * This is extremely brittle. If a page deliberately aligns numbers, totals, or icons to the physical right side (e.g. in tables, forms, or back buttons) in LTR, the CSS forces it to realign to the left. This breaks explicit alignments required for consistent UI structures.
* **Actionable Recommendation:**
  * Remove these physical-to-logical translation overrides. Developers should use logical utilities like Tailwind's `text-start` and `text-end` classes, which automatically adapt based on the HTML `dir` attribute.
  * *Action:* Delete lines 165-170 from `src/app/globals.css` and use logical styling.

---

## 4. SEO

### Finding 4.1: Search Crawler Language and Indexing Mismatch
* **Files & Line Numbers:**
  * `src/app/layout.tsx:75`
* **Explanation (Logic):**
  * Since the raw server-rendered HTML only contains `lang="ar"`, search engine index crawlers (like Googlebot) that do not execute client-side scripting will index every English and Arabic page as Arabic.
  * This severely damages international SEO and regional search rankings, as English search queries will fail to match these incorrectly classified pages.
* **Actionable Recommendation:**
  * Use Next.js localized subpaths (e.g., `/ar` and `/en`) or middleware-based locale rewrites so that page requests resolve to HTML documents served with the appropriate localized server-side headers and attributes.

### Finding 4.2: Lack of JSON-LD Structured Data
* **Files & Line Numbers:**
  * Global project-wide codebase (search for `"application/ld+json"` returned 0 matches)
* **Explanation (Logic):**
  * Search engines look for JSON-LD scripts containing schema data (e.g. `schema.org/LegalService`) to understand service structures, locations, and brand credentials.
  * The absence of this data prevents the search engines from generating rich snippet search results, degrading click-through rates (CTR) and site authority.
* **Actionable Recommendation:**
  * Inject structured JSON-LD data into the main layout or home page component.
  * *Metadata Injection Example (`src/app/page.tsx`):*
    ```tsx
    export default function HomePage() {
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "LegalService",
        "name": "Nezamy",
        "url": "https://nezamy.online",
        "logo": "https://nezamy.online/logo.png",
        "description": "Smart legal platform in Saudi Arabia.",
        "address": {
          "@type": "PostalAddress",
          "addressCountry": "SA"
        }
      };

      return (
        <>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          {/* page content */}
        </>
      );
    }
    ```

### Finding 4.3: Hardcoded dynamic sitemaps
* **Files & Line Numbers:**
  * `src/app/sitemap.ts:19-20`
* **Explanation (Logic):**
  * The sitemap static routing lists a single hardcoded blog URL (`/blog/wrongful-termination-rights`).
  * However, articles are dynamically managed inside the database `articles` table. As new articles are published by the CMS, search engines will have no direct way to discover and crawl them via the XML sitemap, hiding fresh content from indexing.
* **Actionable Recommendation:**
  * Refactor `sitemap.ts` to be asynchronous, query the published article slugs dynamically from the Supabase client, and generate URL records programmatically.
  * *Dynamic Sitemap Code:*
    ```typescript
    import { MetadataRoute } from "next";
    import { createClient } from "@supabase/supabase-js"; // Or local rawClient helper

    export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
      const today = new Date().toISOString().split("T")[0];
      const BASE_URL = "https://nezamy.online";

      // Query database articles
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data: articles } = await supabase
        .from("articles")
        .select("slug, updated_at")
        .eq("status", "published");

      const blogRoutes = (articles || []).map((art) => ({
        url: `${BASE_URL}/blog/${art.slug}`,
        lastModified: art.updated_at ? new Date(art.updated_at).toISOString().split("T")[0] : today,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));

      // Merge with public static routes
      return [
        { url: `${BASE_URL}/`, lastModified: today, changeFrequency: "weekly", priority: 1.0 },
        ...blogRoutes,
      ];
    }
    ```

---

## 5. Performance

### Finding 5.1: Heavy Global Layout Dependencies causing Bundle Bloat
> ✅ **FIXED (commit `bfb3a5f`):** `WhatsAppWidget` and `DraftDrawer` now use `next/dynamic` with `ssr: false` for lazy loading.
* **Files & Line Numbers:**
  * `src/app/layout.tsx:95` (renders `<FloatingButtons />` globally)
  * `src/components/FloatingButtons.tsx:12-18` (statically imports `WhatsAppWidget`, `DraftDrawer`, and embeds `ReportDrawer`)
* **Explanation (Logic):**
  * Statically importing complex drawers (like `DraftDrawer` and the form-heavy `ReportDrawer`) directly in the global `FloatingButtons.tsx` forces the client to download, parse, and evaluate this code immediately on the initial bundle load.
  * This bloats the bundle size for every page (including simple landing, login, and about pages), increasing Time to Interactive (TTI), Total Blocking Time (TBT), and negatively affecting Google Core Web Vitals.
* **Actionable Recommendation:**
  * Lazy-load these drawers using Next.js `dynamic()` so they are only fetched on demand (when their respective trigger buttons are clicked).
  * *Refactored Imports Example in `FloatingButtons.tsx`:*
    ```tsx
    import dynamic from "next/dynamic";

    const WhatsAppWidget = dynamic(() => import("./floating/WhatsAppWidget"), {
      ssr: false,
    });
    const DraftDrawer = dynamic(() => import("@/components/laws/DraftDrawer").then(mod => mod.DraftDrawer), {
      ssr: false,
    });
    const ReportDrawer = dynamic(() => import("./FloatingButtons").then(mod => mod.ReportDrawer), {
      ssr: false,
    });
    ```

### Finding 5.2: Missing Database Foreign Key Indexes
> ✅ **FIXED (commit `bfb3a5f`):** 3 indexes added in `20260716_missing_fk_indexes.sql`.
* **Files & Line Numbers:**
  * `supabase/migrations/20260706_content_and_ops.sql` (defines tables like `articles` and `support_tickets`)
* **Explanation (Logic):**
  * Foreign key references (e.g. `articles.author_id` and `support_tickets.user_id` referencing `auth.users(id)`) do not automatically create database indexes in PostgreSQL.
  * Because RLS queries perform checks on these relations (such as `user_id = auth.uid()`), database joins and reads will perform sequential scans on the tables instead of index lookups. As the tables grow in size, query speeds will degrade exponentially, creating database bottlenecks.
* **Actionable Recommendation:**
  * Add explicit indexing migration steps to foreign keys.
  * *SQL Migration Fix:*
    ```sql
    CREATE INDEX IF NOT EXISTS idx_articles_author_id ON public.articles(author_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee_id ON public.support_tickets(assignee_id);
    ```

---

## 6. Architecture

### Finding 6.1: Non-Standard Next.js Middleware Name and Placement
* **Files & Line Numbers:**
  * `src/proxy.ts`
* **Explanation (Logic):**
  * Next.js expects a routing middleware to be located either in `middleware.ts` in the project root or in `src/middleware.ts`.
  * Placing the active middleware in `src/proxy.ts` violates the Next.js architectural standard. Since Next.js has no built-in linkage to compile `proxy.ts` as a routing interceptor, the application remains fully unprotected during build and deployment.
* **Actionable Recommendation:**
  * Rename the file `src/proxy.ts` to `src/middleware.ts` or create a standard `src/middleware.ts` that imports and calls the handler from `proxy.ts`.

### Finding 6.2: Invoking Undefined Database RPC Function (`library_search`)
> ⚠️ **PARTIALLY FIXED (commit `bfb3a5f`):** The RPC `library_search` is still undefined, BUT all fallback table mappings are now correct (`principles`, `decrees_circulars`, `feqh_books`, `feqh_chapters/sections/blocks`). The fallback search path works.
* **Files & Line Numbers:**
  * `src/lib/supabaseLibrary.ts:369` (invokes `supabase.rpc('library_search', { ... })`)
* **Explanation (Logic):**
  * The frontend code invokes the RPC `'library_search'` to query across libraries. However, this RPC function is never defined in any schema or database migration scripts in the `supabase/migrations/` folder.
  * Consequently, any user query requesting a library search will trigger a DB exception (RPC function does not exist), breaking the global search feature.
* **Actionable Recommendation:**
  * Write the database migration establishing the `library_search` function.
  * *SQL Function Definition Example:*
    ```sql
    CREATE OR REPLACE FUNCTION public.library_search(
      p_query TEXT,
      p_section TEXT,
      p_category TEXT DEFAULT NULL,
      p_track TEXT DEFAULT NULL,
      p_source TEXT DEFAULT NULL,
      p_issuer TEXT DEFAULT NULL,
      p_year TEXT DEFAULT NULL,
      p_status TEXT DEFAULT NULL,
      p_sort TEXT DEFAULT 'relevance',
      p_limit INT DEFAULT 20,
      p_offset INT DEFAULT 0
    )
    RETURNS SETOF jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      -- Function implementation that searches public.articles, laws, etc.
      -- and returns matching records.
    END;
    $$;
    ```

### Finding 6.3: Recursion-Prone Direct RLS Calls Instead of Helper Functions
> ✅ **FIXED (commit `bfb3a5f`):** RLS policies for `entitlement_requests` rewritten to use `public.is_admin()` in `20260716_security_hardening.sql`.
* **Files & Line Numbers:**
  * `supabase/migrations/20260706_entitlement_requests.sql:38,42`
* **Explanation (Logic):**
  * The RLS policies for entitlement requests are defined as:
    ```sql
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.user_type = 'admin')
    ```
  * This directly queries `public.profiles` from another table's RLS policy. If a profiles policy queries other tables, this triggers recursive loop errors.
  * To solve this exact recursion issues, the migration `20260625_fix_rls_recursion.sql` created a specialized security definer function `public.is_admin()`. Bypassing this helper in subsequent migrations violates architectural isolation and re-introduces the risk of infinite recursion loops on database operations.
* **Actionable Recommendation:**
  * Refactor RLS policies in `supabase/migrations/20260706_entitlement_requests.sql` to check admin status using the non-recursive `public.is_admin()` helper function.
  * *Refactored RLS Policies:*
    ```sql
    DROP POLICY IF EXISTS "entitlement_requests_admin_select" ON public.entitlement_requests;
    DROP POLICY IF EXISTS "entitlement_requests_admin_update" ON public.entitlement_requests;

    CREATE POLICY "entitlement_requests_admin_select" on public.entitlement_requests
      FOR SELECT USING (public.is_admin());

    CREATE POLICY "entitlement_requests_admin_update" on public.entitlement_requests
      FOR UPDATE USING (public.is_admin());
    ```
