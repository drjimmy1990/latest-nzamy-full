# NZAMY Responsive & Structural Layout Fixes Plan

This plan details the steps to fix mobile responsive views, broken/missing navigation elements, and structural HTML/layout bugs across the NZAMY website.

## Milestones and Verification Strategy

### Milestone 1: Fix Structural HTML & Viewport Issues
- **Goal**: Resolve layout issues and HTML validation warnings.
  - Remove `maximumScale: 1` in the viewport config of `src/app/layout.tsx` to permit pinch-to-zoom (WCAG accessibility rule).
  - Remove duplicate `<FloatingButtons />` rendering from individual pages and keep it only in the global `layout.tsx` (or dashboard layouts if appropriate).
  - Fix nested `<main>` landmarks by replacing nested `<main>` tags with `div` or React fragments.
  - Adjust Hero grain overlay z-index in `src/components/Hero.tsx` so it does not overlap the Navbar.
- **Verification Method**: Validate DOM tree using inspection or layout analyzer. Confirm only one `FloatingButtons` and one `<main>` landmark exists on pages.

### Milestone 2: Fix Navbar & Breakpoint Dead Zone
- **Goal**: Align breakpoints in `src/components/Navbar.tsx` so there are no dead zones.
  - Fix the mismatch between desktop menu links (`xl:flex` -> 1280px+), hamburger visibility (`xl:hidden` -> <1280px), and the mobile menu panel (`lg:hidden` -> <1024px). Align them to a unified breakpoint (e.g., `xl`).
  - Ensure all controls (Login, Sign Up/Dashboard, theme toggle, language toggle, region badge) are present and fully functional in the mobile version (either in a sub-header or the mobile hamburger menu drawer).
- **Verification Method**: Test navigation at 768px, 1024px, 1100px, 1200px, and 1440px viewports to verify consistent rendering and menu opening.

### Milestone 3: Homepage Mobile Responsiveness
- **Goal**: Adjust all homepage components for perfect mobile rendering (320px-768px) in both English and Arabic (RTL/LTR), light and dark themes.
  - Trust badges text sizing on small viewports (<360px) in `Hero.tsx`.
  - Prevent cards overflow in `ServicesBento.tsx`.
  - Fix touch interaction for `ContractAnalysisShowcase.tsx`.
  - Fix `SocialProof.tsx` marquee and stats.
  - Make `CommunityHighlights.tsx` tabs tap-friendly and readable.
  - Ensure `FAQ.tsx` and `Footer.tsx` render cleanly.
- **Verification Method**: Emulate views on mobile devices in Chrome DevTools. Check for horizontal overflow (no horizontal scrollbar at 320px, 375px, 414px, 768px).

### Milestone 4: Full-Site Responsiveness Audit & Fixes
- **Goal**: Fix responsive layout issues on other public-facing pages: About, Blog, Pricing, Contact, FAQ, Services, Cases, Laws, Login, Register, and Community pages.
- **Verification Method**: Open pages on mobile, check for overflow, overlapping text, or cut-off elements.

### Milestone 5: Verification & Integrity Auditing
- **Goal**: Run clean build verification and complete forensic auditing.
- **Verification Method**: Run `npm run build` successfully. Verify Forensic Auditor reports a CLEAN verdict.

---

## Plan Checklist

- [ ] **Step 1: Planning and Setup**
  - [x] Gather context & review requirements from ORIGINAL_REQUEST.md
  - [x] Create project plan, briefing, and progress templates
- [ ] **Step 2: Structural HTML & Viewport Fixes**
  - [ ] Spawn worker to fix viewport metadata in `layout.tsx` (remove `maximumScale: 1`)
  - [ ] Spawn worker to remove duplicate `FloatingButtons` and nested `<main>` tags from `page.tsx` and all public/dashboard pages
  - [ ] Spawn worker to adjust Hero grain overlay z-index in `Hero.tsx`
- [ ] **Step 3: Navbar & Breakpoint Alignment**
  - [ ] Spawn worker to align Navbar responsive breakpoints to `xl` and fix the 1024px-1280px dead zone
  - [ ] Add mobile equivalents for login, signup/dashboard, theme, language, and region controls
- [ ] **Step 4: Homepage Sections Mobile Overhaul**
  - [ ] Spawn worker to optimize trust badges, Bento cards, showcases, social proof, highlights, FAQ, and footer on mobile
- [ ] **Step 5: Public Pages Audit & Responsiveness Fixes**
  - [ ] Spawn worker to audit and fix About, Blog, Pricing, Contact, FAQ, Services, Cases, Laws, Login, Register, and Community pages for mobile overflow and styling
- [ ] **Step 6: Quality Assurance and Audit**
  - [ ] Run build validation to ensure zero build errors
  - [ ] Run forensic audit verification
- [ ] **Step 7: Completion and Reporting**
  - [ ] Write `handoff.md` and report victory to the user
