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

