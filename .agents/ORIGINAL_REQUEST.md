# Original User Request

## Initial Request — 2026-06-16T00:58:44Z

Audit all client-side and lawyer-side dashboard pages, services, API routes, and database schemas in the NZAMY legal platform. Identify all requirements, missing integrations, and code fixes necessary for production readiness, and provide a detailed list of all n8n workflows that need to be built.

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Client Dashboard Audit
Analyze all client-side dashboard pages under `src/app/dashboard/client/` and their respective services, hooks, and API routes. Identify all instances of hardcoded mock data, mock data fallbacks, missing API integration, and any issues that would block production deployment.

### R2. Lawyer Dashboard Audit
Analyze all lawyer-side dashboard pages under `src/app/dashboard/lawyer/` and their respective services, hooks, and API routes. Identify all instances of hardcoded mock data, mock data fallbacks, missing API integration, and any issues that would block production deployment.

### R3. Database and RLS Policy Verification
Verify that all database tables, columns, constraints, triggers, and Row Level Security (RLS) policies are correctly configured and match what the frontend pages and API routes expect.

### R4. n8n Workflows Specifications
Create a detailed markdown file `n8n_workflows_list.md` in the root of the workspace listing all required n8n workflows. For each workflow, specify the exact trigger (e.g. Supabase webhook/cron), conditions, node sequence (e.g. classification, email, SMS, push notification), data payloads, and target API or database updates.

## Acceptance Criteria

### Documentation
- [ ] A comprehensive audit report file `production_readiness_audit.md` is created in the repository root.
- [ ] The audit report details each page's current state (integrated vs. mocked), specific code issues, and clear action items to make it production-ready.
- [ ] A detailed `n8n_workflows_list.md` file is created in the repository root.
- [ ] The `n8n_workflows_list.md` includes at least the 12 workflows identified in `n8n_workflows.md` with complete trigger and integration details, plus any new ones discovered during the audit.
- [ ] All files are written in clear Markdown format (in English or Arabic as appropriate).

## Follow-up — 2026-06-27T01:50:46Z

Fully wire all tabs of the Admin Panel Dashboard (Library, Community, Marketplace, ERP, Team, Corporate) to secure Next.js API endpoints (checking admin session on the backend) rather than showing mock/dummy arrays, and implement all administrative database actions (verify users, delete library items, approve/reject provider KYC).

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Secure Next.js Admin API Endpoints
- Implement backend API routes under `/api/v1/admin/` for:
  - `/api/v1/admin/library` (list/search laws, decrees, precedents, feqh; delete items)
  - `/api/v1/admin/verifications` (list pending provider/lawyer verifications; update status to approved/rejected)
  - `/api/v1/admin/marketplace` (list listings, orders, templates)
  - `/api/v1/admin/erp` (financial summaries, MRR, stats)
  - `/api/v1/admin/teams` (admin team members and invitations)
- All API routes **must** use `requireAdmin()` from `src/lib/access-control.ts` to verify the caller is an authenticated administrator.

### R2. Frontend Admin Dashboard Integration
- Replace the mock data arrays in:
  - `src/app/dashboard/admin/tabs/LibraryTab.tsx`
  - `src/app/dashboard/admin/tabs/CommunityTab.tsx`
  - `src/app/dashboard/admin/tabs/MarketplaceTab.tsx`
  - `src/app/dashboard/admin/tabs/ERPTab.tsx`
  - `src/app/dashboard/admin/tabs/TeamTab.tsx`
  - `src/app/dashboard/admin/tabs/CorporateTab.tsx`
- Replace them with fetch/SWR calls to the newly created secure API endpoints.
- Preserve all existing tailwind styling, dark mode states, animations, and icons.

### R3. Admin Operations & Actions
- Wire the "Verify" / "KYC" actions to call `/api/v1/admin/verifications`
- Wire the "Delete" actions in the Library Tab to call `/api/v1/admin/library`
- Wire "Status" toggles in the Team tab to invite or suspend team members

## Acceptance Criteria

### Security
- [ ] All API requests to `/api/v1/admin/*` are blocked with HTTP 403 if the user is not an admin.

### Dashboard Functionality
- [ ] Library Tab shows real database records with working search.
- [ ] Community Tab shows real verifications with working Approve/Reject actions.
- [ ] ERP Tab shows real MRR, active plans, and credits usage logs.
- [ ] Zero dummy/mock data remaining in the dashboard tabs.
- [ ] Zero TypeScript compile errors.

## Follow-up — 2026-07-09T00:26:10+03:00

Fix mobile responsive views, broken/missing navigation elements, and layout bugs across the existing NZAMY (نظامي) legal services website — a production Next.js 16 + React 19 + Tailwind CSS v4 RTL Arabic-first website that users are actively using.

Working directory: D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Context

This is a production Arabic-first (RTL) legal services website built with:
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (CSS-first config, `@theme` in `globals.css`)
- Framer Motion for animations
- Phosphor Icons
- Supabase for backend/auth
- Bilingual (Arabic default + English toggle)
- Dark/light theme toggle
- 40+ routes, 8+ user role dashboards

The site has `dir="rtl"` and `lang="ar"` by default. All responsive behavior is done via Tailwind utility classes (`md:`, `lg:`, `xl:` prefixes).

**Key files:**
- Root Layout: `src/app/layout.tsx`
- Homepage: `src/app/page.tsx`
- Global CSS: `src/app/globals.css`
- Navbar: `src/components/Navbar.tsx`
- Hero: `src/components/Hero.tsx`
- Footer: `src/components/Footer.tsx`
- FloatingButtons: `src/components/FloatingButtons.tsx`
- ThemeProvider: `src/components/ThemeProvider.tsx`
- All homepage sections: `src/components/ServicesBento.tsx`, `ContractAnalysisShowcase.tsx`, `AIShowcase.tsx`, `SocialProof.tsx`, `CommunityHighlights.tsx`, `FAQ.tsx`, `UserTypeSelector.tsx`

## Requirements

### R1. Fix Mobile Navigation & Navbar
The Navbar has a critical breakpoint mismatch: desktop links use `xl:flex` (visible at 1280px+), mobile hamburger uses `xl:hidden`, but the mobile menu panel uses `lg:hidden` (hidden at 1024px+). This creates a dead zone between 1024–1280px where the hamburger button is visible but clicking it opens a menu panel that's hidden. All breakpoints must be consistent so navigation works at every viewport width. All buttons that appear on desktop (Login, Sign Up, theme toggle, language toggle, region badge) must have mobile equivalents accessible through the hamburger menu or the mobile controls area.

### R2. Fix Layout & Structural HTML Bugs
Several structural bugs need fixing:
- **Double FloatingButtons:** `layout.tsx` renders `<FloatingButtons />` globally for all pages, but `page.tsx` (and ~30 other page files) also render their own `<FloatingButtons />`, causing duplicate WhatsApp/report buttons on screen. Ensure only one instance renders per page.
- **Nested `<main>` elements:** `layout.tsx` wraps children in `<main id="main-content">`, but `page.tsx` also wraps its content in `<main>`, creating invalid nested `<main>` landmarks. Only one `<main>` element should exist per page.
- **Viewport zoom blocking:** `layout.tsx` sets `maximumScale: 1` which prevents pinch-to-zoom, violating WCAG 1.4.4 accessibility requirements. Remove this restriction.
- **Hero grain overlay z-index:** The grain texture overlay in Hero.tsx uses `fixed inset-0 z-50`, the same z-index as the Navbar, causing the grain to render on top of navigation. Fix the layering.

### R3. Fix All Homepage Sections for Mobile
Every section on the homepage must display correctly on mobile viewports (320px–768px) in both RTL (Arabic) and LTR (English) modes, and in both dark and light themes. Specifically:
- Hero section trust badges should scale text on very small screens (<360px)
- ServicesBento grid cards should not overflow or get cut off
- ContractAnalysisShowcase interactive elements should be usable on touch screens
- SocialProof stats and logo marquee should render without overlap
- CommunityHighlights tabs and content should be tappable and readable
- FAQ accordion should work properly on mobile
- Footer columns should stack cleanly

### R4. Full-Site Mobile Audit & Fix
Beyond the homepage, audit all major public-facing pages for mobile responsiveness: About, Blog, Pricing, Contact, FAQ, Services, Cases, Laws, Login, Register, and Community pages. Fix any broken layouts, overflowing content, untappable buttons, or illegible text found on mobile viewports.

### R5. Preserve Existing Functionality
All fixes must preserve: dark/light theme switching, AR/EN language toggle, RTL/LTR layout direction, authentication flows, navigation structure, and all existing animations. No regressions in desktop views.

## Acceptance Criteria

### Navigation
- [ ] Navbar hamburger menu opens and displays all nav links at every viewport width below 1280px (including 768px, 1024px, 1100px, 1200px)
- [ ] All nav links present on desktop are accessible via the mobile hamburger menu
- [ ] Login/Sign Up buttons (or Dashboard link when logged in) are accessible on mobile
- [ ] Theme toggle and language toggle are accessible on mobile

### Structural HTML
- [ ] Only one `<FloatingButtons />` instance renders on any given page (no duplicates visible in DOM)
- [ ] Only one `<main>` landmark element exists per page (validated via DOM inspection)
- [ ] Pinch-to-zoom is NOT blocked on mobile (no `maximumScale: 1` in viewport meta)
- [ ] Hero grain overlay does NOT render on top of the Navbar

### Mobile Responsiveness
- [ ] Homepage renders without horizontal scroll at 320px, 375px, 414px, and 768px viewport widths
- [ ] All text is readable (no text cut off, no overlap) at 320px viewport width in both AR and EN
- [ ] All buttons and interactive elements are tappable (minimum 44x44px touch target or equivalent)
- [ ] All homepage sections (Hero through Footer) display without layout corruption on mobile
- [ ] Dark mode and light mode both render correctly on mobile

### Site-Wide
- [ ] Public-facing pages (About, Blog, Pricing, Contact, Services, Login, Register) have no horizontal overflow on 375px viewport
- [ ] No existing desktop functionality is broken by the mobile fixes

### Verification Method
- [ ] Run `npm run build` successfully with zero errors
- [ ] Open the site in Chrome DevTools mobile emulation at 375px (iPhone SE), 414px (iPhone 14), and 768px (iPad) and visually confirm no layout corruption on homepage and key pages
- [ ] Toggle between AR/EN and dark/light on mobile to confirm no regressions
- [ ] Test the hamburger menu navigation at 1024px, 1100px, and 1200px viewport widths to confirm the breakpoint dead zone is resolved


## Follow-up — 2026-07-16T18:57:48Z

Organize, clean, and update all Markdown files in the root directory of the `nzamy-website` repository. Create a folder named `OLD`, move historical/obsolete docs there, keep active files in the root, and update them to reflect the latest library and blog development milestones.

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Root Directory Cleanup
- Create a directory named `OLD` (keep it separate from the existing lowercase `old` directory).
- Move the following historical/obsolete files from the root to `OLD/`:
  * `ORIGINAL_REQUEST.md`
  * `PRODUCTION_FIX_IMPLEMENTATION.md`
  * `PRODUCTION_FIX_PLAN.md`
  * `PRODUCT_COMPLETENESS_BACKLOG.md`
  * `TEST_REVIEW_FIX_PLAN.md`
  * `TEST_REVIEW_RECONCILIATION.md`
  * `blog-system-newblog-migration.md`
  * `client_dashboard_audit.md` (obsolete audit)
  * `client_lawyer_functional_audit.md` (obsolete audit)
  * `client_lawyer_testing_arabic (1).md` (obsolete test guide)
  * `comprehensive_review_09072026.md` (obsolete audit)
  * `library_testing_arabic.md` (obsolete test guide)
  * `manual_seeding_guide.md` (obsolete seeding guide)
  * `master_checklist.md` (obsolete checklist)
  * `master_checklist2.md` (obsolete checklist)
  * `n8n_BUILD_LOG_AND_TEST_GUIDE.md` (obsolete n8n log)
  * `n8n_FINAL_MASTER_PLAN.md` (obsolete n8n plan)
  * `n8n_workflows.md` (obsolete n8n info)
  * `n8n_workflows_list.md` (obsolete n8n list)
  * `nzamy-audit-fix-status.md` (obsolete status)
  * `payments-gateway-admin-gate.md` (obsolete payments info)
  * `production_readiness_audit.md` (obsolete audit)
  * `project_reference.md` (obsolete status)
  * `search_implementation_guide.md` (obsolete search guide)
  * `workflows_roadmap.md` (obsolete roadmap)
  * `ENTITLEMENTS_AND_WIRING_BUILD_LOG.md` (obsolete build log)
  * `legal_library_guide.md` (obsolete library guide)
  * `project_guide.md` (obsolete project guide)
  * `old/BLOG_SEEDING_GUIDE.md` (move to `OLD/`)
- Keep the following active files in the root:
  * `AGENTS.md` (Agent instructions)
  * `CLAUDE.md` (Claude instructions)
  * `ARCHITECTURE.md` (System architecture)
  * `DEPLOY_AND_SMOKETEST_RUNBOOK.md` (Active deploy runbook)
  * `deployment_guide.md` (Active deployment reference)
  * `دليل_اختبار_الجولة_الثالثة_يوليو_2026.md` (Arabic test guide)
  * `دليل_اختبار_المالك.md` (Arabic owner test guide)
  * `DOCUMENTATION_INDEX.md` (Documentation map)
  * `MASTER_PRIORITY_LIST_2026-07-16.md` (Active status/checklist)
  * `REMAINING_WORK.md` (Active remaining work list)
  * `IMPLEMENTATION_STATUS.md` (Active implementation status)
  * `PROJECT.md` (Active project milestones)
  * `n8n_master_guide_latest.md` (Canonical n8n guide)
  * `project_review_report.md` (Canonical audit report)
  * `PROJECT_STATUS_REVIEW_2026-07-06.md` (Canonical review report)
  * `BLOG_GUIDE.md` (Recently made blog guide)

### R2. Documentation Index Update
- Update `DOCUMENTATION_INDEX.md` to reflect the new paths (`OLD/` prefix) for all moved files.
- Ensure the document status legend is preserved and updated accurately for each document.

### R3. Status & Roadmap Updates
- Update `MASTER_PRIORITY_LIST_2026-07-16.md`, `REMAINING_WORK.md`, and `IMPLEMENTATION_STATUS.md` with the latest developments from the 2026-07-16 Library Sprint and recent blog CMS commits.
- Clearly document what has been completed, what is in progress, and what remains pending.

## Acceptance Criteria

### Verification and Checks
- [ ] No historical markdown files remain in the root directory except the specified active ones.
- [ ] All moved files are located in `OLD/` directory.
- [ ] `DOCUMENTATION_INDEX.md` is updated with no broken relative file links.
- [ ] The priority list, remaining work, and status files are updated accurately to reflect the completed library sprint and blog CMS work.



## Follow-up — 2026-10-09T15:24:52Z

The user requested a full agent team: "فريق وكلاء متكامل (Full Team)".

Audit, verify, and implement the non-database UI/UX, reader formatting, calculator logic, and schema contract fixes provided in the owner delivery package (`C:\Users\LOQ\Downloads\حزمة_تسليم_المبرمج_محدثة_2026-10-09`) on the `owner-edits` branch of `nzamy-website`, ensuring all code modifications are clean, verified, and free of regression without altering database schemas or executing destructive data migrations.

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Library Search & Visual Presentation Fixes
- Eliminate the typographic strikethrough (`line-through`) styling on repealed laws across `LawCard` and detail components, replacing it with clear status badges (`⛔ ملغى وغير سارٍ`) and container borders to maintain Arabic text legibility.
- Prevent premature "no results" flashing during library searches by ensuring empty states render only after search execution completes and loading states terminate (`!isLoading && hasSearched && results.length === 0`), displaying skeleton placeholders during pending fetches.
- Relocate the legislation countdown widget from the top search bar area to the left sidebar under legislative updates, keeping the primary search area focused and uncluttered.
- Remove redundant sidebar zoom buttons and standardize the compact 75% display density via clean CSS rules.

### R2. Reader Navigation, Legal Numbering & Calculator Logic
- Resolve sublegislation table-of-contents (TOC) link navigation by aligning DOM anchor IDs and compensating for fixed header height using `scroll-margin-top`.
- Fix the legal reader component to preserve and display clause numbers (e.g. "1.", "2.", "3.") accurately rather than stripping or mangling backslashed numbers (refer to patch 20 in the delivery package `06_تحديث_المكتبة_والقبول_2026-10-09/01_رقع_كلود/حزمة_المبرمج_2026-10-08/patches/20_موجز29أ_أرقام_البنود_في_القارئ.patch`).
- Update the judicial court fee calculator logic (`court-fees.ts`) to enforce the statutory caps: a 5% rate capped at 1,000,000 SAR for first-instance courts, and a fixed maximum of 10,000 SAR for appeal courts.
- Support collapsible `<details>` displays for amended articles showing amendment notices and historical text context without corrupting regular article views.

### R3. Quality Assurance, Contract Consistency & Branch Safety
- Resolve duplicate keys (`law_lifecycle_status`, `superseded_by`) in the parser schema manifest (`scripts/parsers/schema_manifest.json`) (refer to patch 01 in the delivery package) to guarantee JSON parser conformity.
- Perform all work exclusively on the `owner-edits` branch. Do not execute destructive table wipes (`TRUNCATE CASCADE` or `library:clear`) and do not apply unverified database schema modifications.
- Ensure all modified and added TypeScript/React code compiles cleanly with zero type errors (`npx tsc --noEmit`) and passes existing automated test suites.

## Acceptance Criteria

### Visual & Search UI
- [ ] No repealed law title or text has a CSS `line-through` rule applied in `LawCard` or reader views.
- [ ] Initiating a library search displays animated loading skeletons and never displays an empty state banner before HTTP/data fetching completes.
- [ ] The legislation countdown widget is positioned inside the left sidebar and not above the search input bar on `/laws`.
- [ ] Manual zoom buttons in the navigation sidebar are removed, and compact layout rules apply gracefully.

### Reader & Calculator Verification
- [ ] Clicking headings in the sublegislation right-hand TOC scrolls the viewport directly to the target element without being obscured by the fixed header.
- [ ] Clause numbering ("N.") renders visibly and correctly in legal document readers.
- [ ] Court fee calculation tests confirm that a first-instance claim of 50,000,000 SAR yields exactly 1,000,000 SAR in fees, and an appeal fee does not exceed 10,000 SAR.
- [ ] Amended articles display an amber indicator badge with an expandable toggle revealing the prior text/notice.

### Code Quality & Contract Validation
- [ ] `scripts/parsers/schema_manifest.json` contains no duplicate object keys and passes JSON linting without syntax warnings.
- [ ] `git branch` confirms execution occurs strictly on `owner-edits`.
- [ ] `npx tsc --noEmit` exits with status code 0 (zero TypeScript errors across the project).
- [ ] Existing automated unit tests (`npm test` or equivalent suite) execute with zero failures.
