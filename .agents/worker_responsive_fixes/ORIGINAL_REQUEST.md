## 2026-07-09T00:33:12Z

You are the Responsive & Layout Fixes Worker.
Objective: Implement responsiveness improvements, structural HTML fixes, and navigation breakpoint corrections on the NZAMY legal services website.

Here is the exact implementation checklist based on code investigations:

### 1. Viewport Zoom & Layering Fixes
- **src/app/layout.tsx**: Remove `maximumScale: 1` from the `viewport` object to allow users to pinch-to-zoom on mobile viewports.
- **src/components/Hero.tsx**: Change the grain overlay z-index from `z-50` to `z-30` so it doesn't render on top of the Navbar (which has z-50).

### 2. Double FloatingButtons & Nested Main Element Cleanup
- **src/components/FloatingButtons.tsx**:
  - Import `usePathname` from `next/navigation`.
  - Import `useDraftCart` from `@/hooks/useDraftCart`.
  - Import `DraftDrawer` from `@/components/laws/DraftDrawer`.
  - Inside the component, call `usePathname()` to dynamically detect page slug/type and calculate `reportConfig`:
    - If `pathname === "/laws"`, `reportConfig` is `{ pageSlug: "laws-index", pageType: "law" }`.
    - If `pathname` starts with `/laws/orders/`, extract slug and use `reportConfig = { pageSlug: 'order-' + slug, pageType: "order" }`.
    - If `pathname` starts with `/laws/`, extract slug and use `reportConfig = { pageSlug: slug, pageType: "law" }`.
    - If `pathname` starts with `/precedents/`, extract slug and use `reportConfig = { pageSlug: slug, pageType: "precedent" }`.
  - Call `useDraftCart()` internally. Set the `cartCount` to `cart.length`.
  - Render the `<DraftDrawer />` component globally inside `FloatingButtons.tsx` (using local state `showCart` to toggle its visibility). Use `cart`, `removeArticle`, and `clearAll` directly inside `FloatingButtons.tsx` (generic implementations that update the cart array).
  - Register a global `window` event listener for `"nzamy-open-cart"` to open the drawer when triggered.
- **Clean up pages & layouts**:
  - Write a Node script to programmatically strip `import FloatingButtons from ...` and `<FloatingButtons />` rendering (with any props) from the 77+ page and layout files in the project. Execute the script to remove duplicates.
  - In `src/app/page.tsx` (homepage) and other pages that wrap contents in `<main>`, replace the `<main>` tag with React fragment `<>` or a simple `<div>` (e.g., `<div className="flex flex-col">`), so that there are no nested `<main>` tags (the root landmark is already defined in `layout.tsx`).

### 3. Navbar Responsive Breakpoints & Feature Parity
- **src/components/Navbar.tsx**:
  - Locate the mobile menu panel wrapper (around line 510) and change the class from `lg:hidden` to `xl:hidden` to match the hamburger toggle breakpoint (`xl:hidden`) and desktop links breakpoint (`xl:flex`).
  - Inside the mobile menu drawer, add the Region badge, Notifications Bell, and user identity profile/avatar header, along with settings, pricing, and billing links, to ensure complete feature parity between desktop and mobile.

### 4. Homepage Mobile Responsiveness (320px-768px)
- **src/components/Hero.tsx**: Reduce trust badges padding to `px-2.5 py-1 sm:px-3 sm:py-1.5` and text size to `text-[10px] sm:text-xs`. Stacking CTA buttons vertically on mobile: change buttons container to `flex flex-col sm:flex-row items-stretch sm:items-center w-full sm:w-auto`. Make buttons take full width `w-full justify-center sm:w-auto`. Hide the absolute floating badge on mobile (`hidden md:flex md:absolute md:-bottom-4 md:-right-4`).
- **src/components/ServicesBento.tsx**: Change `row-span-2` on AI Bento card to `md:row-span-2`. Adjust card padding to `p-5 sm:p-8 md:p-10`. Center category tabs on mobile using `self-center sm:self-auto`.
- **src/components/ContractAnalysisShowcase.tsx**: Increase filter tab buttons height/padding (`py-2.5 px-4 sm:py-1.5 sm:px-3`) and Option A/B switcher buttons (`py-3 px-4 sm:py-2 sm:px-3`) to at least 44px touch targets. Make main CTA button full width on mobile (`w-full justify-center sm:w-fit`). Ensure Legend/explanations display above Contract Viewer on mobile (natural code flow order, or swap).
- **src/components/SocialProof.tsx**: Scale marquee gradient masks on mobile: change `w-24` to `w-8 sm:w-16 md:w-24`. Reduce stats card padding/gaps (`p-4 sm:p-8`, `gap-4 sm:gap-8`). Make counter numbers text responsive (`text-2xl sm:text-3xl md:text-5xl`).
- **src/components/CommunityHighlights.tsx**: Reduce card padding (`p-5 sm:p-8 md:p-10`) and metrics footer gaps. Add `min-h-[44px]` or increase vertical padding (`py-3.5`) to "Ask the Community" dashed button for touch targets.
- **src/components/FAQ.tsx**: Replace `ml-4` on caret icon with RTL-friendly `ms-4` (margin-start). Reduce accordion container paddings on mobile (`p-4 sm:p-6` for headers, `px-4 pb-5 sm:px-6 sm:pb-6` for details).
- **src/components/Footer.tsx**: Change column grid to stack fully on mobile: `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`. Reduce CTA banner overlap/padding (`-mt-16 sm:-mt-24 md:-mt-32`, `p-6 sm:p-10`). Make register button full width on mobile (`w-full justify-center sm:w-auto`). Fix LTR arrow direction by conditionally rendering `isAr ? <ArrowLeft /> : <ArrowRight />`.

### 5. Site-wide Audited Layout Bugs
- **src/app/community/page.tsx**: Add `relative` to the mapped answer container `div` at line 502/504 (fixing rank badge alignment).
- **src/app/laws/page.tsx**: Make the category tabs container horizontally scrollable: wrap in `overflow-x-auto` and add `whitespace-nowrap` to the inner `inline-flex` bar.
- **src/app/laws/[slug]/_article-components.tsx**: Make the article block header stack vertically on mobile: replace `flex items-center gap-2` with `flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 ...`.
- **src/app/laws/components/PaywallModal.tsx** (AdvancedSearchModal component): Replace non-responsive grids `grid-cols-4` and `grid-cols-5` at lines 445, 468, and 482 with responsive structures (e.g. `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`, etc.).

### 6. Verification
- Once changes are done, run `npm run type-check` and `npm run build` in the workspace to verify that everything compiles cleanly with zero errors.
- Document your changes and verification results in D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\worker_responsive_fixes\handoff.md.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
