# Milestone 1 & 2 Exploration Report: HTML & Navbar Analysis

## 1. Observation

During our investigation of `src/app/layout.tsx`, `src/app/page.tsx`, `src/components/Navbar.tsx`, `src/components/Hero.tsx`, and `src/components/FloatingButtons.tsx`, we directly observed the following implementation details:

### A. Viewport Zoom Block in `src/app/layout.tsx`
The viewport metadata contains `maximumScale: 1` which explicitly restricts viewport scaling:
```typescript
// Line 6-11 of src/app/layout.tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 1,
};
```

### B. Hero Grain Overlay Z-Index in `src/components/Hero.tsx`
The grain overlay `div` is set to `z-50` and is `fixed` to cover the entire viewport:
```typescript
// Line 156-161 of src/components/Hero.tsx
{/* Grain overlay */}
<div
  className="pointer-events-none fixed inset-0 z-50 opacity-[0.02] mix-blend-overlay"
  style={{
    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
  }}
/>
```
Meanwhile, the Navbar wrapper is also configured at `z-50`:
```typescript
// Line 326-330 of src/components/Navbar.tsx
<motion.nav
  initial={{ y: -100 }}
  animate={{ y: 0 }}
  transition={{ type: "spring", stiffness: 80, damping: 20 }}
  className="fixed top-0 right-0 left-0 z-50"
>
```
Because the Hero component is rendered after the Navbar in the page DOM, the grain overlay sits on top of the Navbar.

### C. Duplicate `FloatingButtons` and Nested `<main>` Elements
* In `src/app/layout.tsx`, the children are wrapped inside a global `<main>` element, and `FloatingButtons` is rendered at the root layout level:
  ```typescript
  // Line 95-96 of src/app/layout.tsx
  <main id="main-content">{children}</main>
  <FloatingButtons />
  ```
* In `src/app/page.tsx`, the page content is wrapped inside another `<main>` tag, and `FloatingButtons` is rendered again:
  ```typescript
  // Line 41-52 of src/app/page.tsx
  <main>
    <Hero />
    ...
  </main>
  <Footer />
  <FloatingButtons />
  ```
  This creates a nested `<main>` element (semantic HTML violation) and duplicate `FloatingButtons` DOM nodes.
* A grep search shows `FloatingButtons` is manually imported and rendered inside **77+ page/layout files** (such as `about/page.tsx`, `ai/page.tsx`, `blog/page.tsx`, all dashboard layouts, etc.).
* To mitigate instances of double buttons rendering, a primary instance hack is currently used in `FloatingButtons.tsx`:
  ```typescript
  // Line 445-459 of src/components/FloatingButtons.tsx
  useEffect(() => {
    const refreshPrimaryInstance = () => {
      const isInsideMain = rootRef.current ? document.getElementById("main-content")?.contains(rootRef.current) : false;
      if (isInsideMain) {
        setIsPrimaryInstance(true);
      } else {
        const hasLocalInstance = document.querySelector('#main-content [data-nzamy-floating-root="true"]') !== null;
        setIsPrimaryInstance(!hasLocalInstance);
      }
    };
    refreshPrimaryInstance();
    const observer = new MutationObserver(refreshPrimaryInstance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  ```

### D. Navbar Breakpoint Dead Zone
In `src/components/Navbar.tsx`, there are conflicting tailwind responsive breakpoint utility classes:
* Desktop links and desktop right controls are visible on screens `>=1280px` (`xl`):
  ```typescript
  // Line 362 & 395 of src/components/Navbar.tsx
  className="hidden items-center gap-1 xl:flex"
  ```
* Mobile controls trigger (hamburger/toggles) is shown on screens `<1280px` (`xl`):
  ```typescript
  // Line 484 of src/components/Navbar.tsx
  className="flex items-center gap-2 xl:hidden"
  ```
* Mobile menu panel container is hidden on screens `>=1024px` (`lg`):
  ```typescript
  // Line 510 of src/components/Navbar.tsx
  className="overflow-hidden lg:hidden"
  ```
* **Result**: On screen widths between `1024px` and `1280px`, the desktop navigation is hidden, the hamburger is visible, but the mobile menu panel is hidden due to `lg:hidden`. Clicking the hamburger has no visible effect.

### E. Navbar Controls Mapping
* **Desktop controls** (lines 394–481):
  1. Region badge (SA flag)
  2. Language toggle (Globe button)
  3. Theme toggle (Moon/Sun button)
  4. Notifications Bell (if logged in)
  5. User Avatar & identity dropdown containing Dashboard, My Account, Plan & Billing, Notifications, and Sign Out links.
* **Mobile controls**:
  - Bar (always visible): Theme toggle, Language toggle, Menu toggle (List/X). (No Region badge or Notifications Bell)
  - Drawer (visible when open): Active nav links, Dashboard link (if logged in), Sign Out button (if logged in). (No user name, avatar, Settings, Plan & Billing, or Notifications links)

---

## 2. Logic Chain

1. **Accessibility**: Removing `maximumScale: 1` from `layout.tsx` is required because preventing mobile zooming violates accessibility standards (WCAG 1.4.4).
2. **Layer Stacking**: The Hero grain overlay covers the entire viewport fixed at `z-50`. Since the Navbar is also at `z-50` and rendered earlier in the DOM, the overlay stacks on top of it. Lowering the grain overlay to `z-40` or `z-30` keeps it above Hero content (`z-10`) but places it safely behind the Navbar.
3. **HTML Semantics and Duplication**:
   - The root layout skip-to-content target uses `<main id="main-content">`. Keeping `<main>` in `layout.tsx` is essential. Changing the tag in all inner pages from `<main>` to a fragment (`<>`) or a `<div>` eliminates nested `<main>` tags.
   - Deleting individual `<FloatingButtons />` renderings from the 77+ subpages/layouts leaves only one global instance in `layout.tsx`.
   - To make this global instance work correctly on laws/precedents detail pages, `FloatingButtons` can use Next.js's `usePathname()` to automatically extract the page slug/type and compute `reportConfig`.
   - `FloatingButtons` can call `useDraftCart()` internally and handle rendering the `DraftDrawer` itself. Pages can open this drawer by dispatching a custom event `nzamy-open-cart` which `FloatingButtons` listens to.
4. **Layout Continuity**:
   - Aligning the mobile menu panel breakpoint from `lg:hidden` to `xl:hidden` matches the hamburger toggle visibility (`xl:hidden`) and desktop navigation visibility (`xl:flex`). This eliminates the `1024px-1280px` dead zone.
5. **Feature Parity**:
   - Mobile users need access to all account settings. Adding the Region badge, Notifications Bell, user identity header, and Settings/Pricing links to the mobile menu ensures mobile feature parity.

---

## 3. Caveats

* **Pathname format consistency**: We assume the library pages are structured as `/laws`, `/laws/[slug]`, `/laws/orders/[slug]`, and `/precedents/[slug]`. If there are additional subpaths, the dynamic detection helper must be updated.
* **Global imports removal**: Eliminating manually rendered `FloatingButtons` components requires removing them from 77+ page and layout files. While this is straightforward, it must be performed meticulously.

---

## 4. Conclusion

We propose the following targeted changes:
1. **`src/app/layout.tsx`**: Remove `maximumScale: 1` from viewport configuration.
2. **`src/components/Hero.tsx`**: Update grain overlay z-index from `z-50` to `z-30`.
3. **`src/components/Navbar.tsx`**:
   - Change mobile menu panel container's class to `xl:hidden` (fixing the dead zone).
   - Add Region badge, Notifications Bell, user profile header, and Profile/Pricing links to mobile equivalents.
4. **`src/components/FloatingButtons.tsx`**:
   - Import `usePathname` and `useDraftCart`.
   - Read pathname to dynamically calculate `reportConfig` and handle cart state internally.
   - Embed and control `DraftDrawer` visibility from this single global instance.
5. **Page Files**: Replace `<main>` with `<>` or `<div>` and remove local `<FloatingButtons>` elements.

---

## 5. Verification Method

To verify these changes:
1. Run compilation tests:
   ```bash
   npm run type-check
   npm run lint
   npm run build
   ```
2. Inspect the DOM in a desktop browser:
   - Ensure there is only one `<main>` tag and one `<div data-nzamy-floating-root="true">` wrapper.
   - Resize the window between `1000px` and `1300px` to verify the hamburger menu works correctly and that the desktop links hide/show cleanly at `1280px`.
3. In mobile view:
   - Check that pinching to zoom is enabled.
   - Open the menu drawer to verify that the Region flag, notifications bell, user name/avatar, and settings/billing links appear correctly.
