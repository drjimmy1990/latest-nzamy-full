# Milestone 3 Handoff Report — Homepage Mobile Responsiveness

## 1. Observation

During the read-only investigation, the following files and lines were examined:

### A. `src/components/Hero.tsx`
* **Trust Badges Container (Lines 239-240)**:
  ```tsx
  {/* Trust badges */}
  <div className={`mt-10 flex flex-wrap items-center gap-4 text-xs font-medium border-t pt-8 ${isDark ? "border-white/10 text-gray-400" : "border-slate-100 text-slate-500"}`}>
  ```
  And individual items (Lines 241-252) use fixed horizontal and vertical padding: `px-3 py-1.5`.
* **CTA Buttons (Lines 209-210)**:
  ```tsx
  {/* CTAs */}
  <div className="mt-8 flex flex-wrap items-center gap-4">
  ```
  The buttons within it are `inline-flex` and have no mobile full-width scaling.
* **Floating Visual Badge (Lines 365-370)**:
  ```tsx
  {/* Floating badge */}
  <motion.div
    ...
    className="absolute -bottom-4 -right-4 rounded-2xl border border-white bg-white px-5 py-3 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-dark-card"
  >
  ```

### B. `src/components/ServicesBento.tsx`
* **Layout Grid (Line 239)**:
  ```tsx
  <div className="grid gap-4 md:grid-cols-3 lg:gap-6">
  ```
* **AI Showcase Bento Card (Lines 241-246)**:
  ```tsx
  <motion.div
    ...
    className="row-span-2 group/ai overflow-hidden rounded-[2.5rem] border border-slate-200/50 bg-white p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-dark-card md:p-10"
  >
  ```
  With inner results section padding at `p-5` (Line 262) and Carousel container padding at `p-8` (Line 330).
* **Category Tabs (Line 203)**:
  ```tsx
  className="flex items-center gap-2 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-white/5 backdrop-blur-sm self-start md:self-end"
  ```
  With buttons using padding `py-2.5` (Lines 212, 226).

### C. `src/components/ContractAnalysisShowcase.tsx`
* **Interactive Filter Tabs (Lines 428-436)**:
  ```tsx
  {/* Filter tabs */}
  <div className={`flex flex-wrap gap-1 border-x border-b px-3 py-2 ${isDark ? "border-white/[0.08] bg-zinc-900" : "border-slate-200 bg-slate-50/60"}`}>
    {tabs.map(({ val, label, count }) => {
      ...
      return (
        <button
          key={val}
          onClick={() => setFilterTab(val)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all duration-200 ...`}
  ```
* **Interactive Option A/B Switcher (Lines 579-582)**:
  ```tsx
  <div className={`flex mb-0 border rounded-xl overflow-hidden text-[11px] font-bold ${isDark ? "border-white/[0.08]" : "border-slate-200"}`}>
    {([["a", isAr ? "الخيار (أ) — الحماية القصوى" : "Option A — Max Protection"], ["b", isAr ? "الخيار (ب) — المتوازن" : "Option B — Balanced"]] as const).map(([t, label]) => (
      <button key={t} onClick={e => { e.stopPropagation(); setAmendTab(t); }}
        className={`flex-1 py-2 px-3 transition-colors text-center ...`}
  ```
* **CTA Button (Line 356)**:
  ```tsx
  className="flex items-center gap-3 rounded-2xl bg-[#0B3D2E] dark:bg-[#C8A762] px-7 py-4 text-sm font-bold text-white dark:text-zinc-900 shadow-[0_8px_32px_-8px_rgba(11,61,46,0.35)] dark:shadow-[0_8px_32px_-8px_rgba(200,167,98,0.35)] w-fit"
  ```
* **Mobile Layout Grid Order (Line 292)**:
  ```tsx
  <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.22fr] gap-10 xl:gap-16 items-start">
  ```
  Where Legend+CTA is `order-2 lg:order-1` and Contract Viewer is `order-1 lg:order-2`.

### D. `src/components/SocialProof.tsx`
* **Logo Marquee Gradient Masks (Lines 62-64)**:
  ```tsx
  <div className="mt-16 border-t border-slate-100 pt-10 dark:border-white/10 overflow-hidden relative">
    <div className="absolute left-0 top-0 z-10 w-24 h-full bg-gradient-to-r from-surface dark:from-dark-bg to-transparent" />
    <div className="absolute right-0 top-0 z-10 w-24 h-full bg-gradient-to-l from-surface dark:from-dark-bg to-transparent" />
  ```
* **Stats Container Grid and Sizing (Lines 126-130)**:
  ```tsx
  className={`rounded-[2.5rem] border p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] md:p-12 ${
    isDark ? "border-white/10 bg-dark-card shadow-black/40" : "border-slate-200/50 bg-white"
  }`}
  ...
  <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-0 md:divide-x md:divide-x-reverse md:divide-slate-100 dark:md:divide-white/10">
  ```
  The counter text size (Line 140) uses a non-responsive `text-3xl md:text-5xl`.
* **Testimonials Card (Line 174)**:
  ```tsx
  className={`group relative rounded-[2rem] border p-8 transition-shadow hover:shadow-xl dark:shadow-none ${
  ```

### E. `src/components/CommunityHighlights.tsx`
* **Bento Card and Item Padding (Lines 202, 239)**:
  ```tsx
  className={`lg:col-span-2 lg:row-span-2 rounded-[2.5rem] border p-8 md:p-10 ${
  ...
  className={`group flex items-start gap-4 rounded-2xl border p-5 transition-all ${
  ```
* **Item Metrics Container (Line 259)**:
  ```tsx
  <div className="flex items-center gap-3 mt-2.5 flex-wrap">
  ```
* **"Ask the Community" CTA Button (Lines 282-286)**:
  ```tsx
  className="mt-6 flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-dashed border-[#0B3D2E]/20 text-sm font-semibold text-[#0B3D2E] ... hover:border-[#0B3D2E]/40 ..."
  ```

### F. `src/components/FAQ.tsx`
* **RTL Caret Icon Left Margin Bug (Line 115)**:
  ```tsx
  <div className={`ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
  ```
* **Accordion Container Padding (Lines 106, 132)**:
  ```tsx
  className="flex w-full items-center justify-between p-5 text-start md:p-6"
  ...
  className={`px-5 pb-6 text-sm leading-relaxed md:px-6 md:text-base ${isDark ? "text-gray-400" : "text-ink-muted"}`}
  ```

### G. `src/components/Footer.tsx`
* **Footer Columns Layout Grid (Line 108)**:
  ```tsx
  <div className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12">
  ```
* **CTA Banner Negative Margin & Padding (Line 83)**:
  ```tsx
  className="-mt-32 mb-16 rounded-[2.5rem] bg-royal p-10 shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-14"
  ```
* **Register CTA Button in Banner (Lines 98, 101)**:
  ```tsx
  className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]"
  ...
  <ArrowLeft size={16} weight="bold" />
  ```

---

## 2. Logic Chain

1. **Hero Trust Badges & Buttons**:
   - On screens <360px, a 320px viewport has ~288px of inner layout width.
   - The trust badges use `gap-4` (16px spacing) and `text-xs` (12px font) with `px-3 py-1.5` padding. This makes the badges wrap into 3 vertical rows and appear heavily cluttered.
   - The CTA buttons have no full-width option. On <360px, they overflow the screen margins or wrap awkwardly.
   - The floating badge with `absolute -bottom-4 -right-4` pushes 16px past the right-most edge of the parent, causing a browser horizontal scrollbar on mobile devices.
   - **Conclusion**: Badges must have responsive padding (`px-2 py-1 sm:px-3 sm:py-1.5`) and text sizes (`text-[10px] sm:text-xs`). CTA buttons should stack vertically (`flex-col sm:flex-row w-full sm:w-auto`) on mobile with centered text. The absolute floating badge should be hidden on mobile screens (`hidden md:flex md:absolute md:-bottom-4 md:-right-4`).

2. **Services Bento Grid Layout**:
   - The showcase card uses `row-span-2` without screen prefixes. On single-column mobile stacking, standard grid engines can introduce empty rows or rendering bugs when `row-span` is set without specifying column constraints.
   - The container has `p-8` (64px total horizontal padding) and inner components also have large paddings (`p-5` for the analysis block and `p-8` for the marquee block). On 320px viewports, this leaves less than 200px of actual content width, crushing text columns.
   - **Conclusion**: Make bento cards use responsive padding (`p-5 sm:p-8 md:p-10`) and inner containers use `p-3.5 sm:p-5`. Make `row-span-2` responsive (`md:row-span-2`). Tab list buttons should be aligned center on mobile (`self-center sm:self-auto`) and have increased vertical padding (`py-3`) for better finger-tap accuracy.

3. **Contract Analysis Showcase Tap Targets & Grid Order**:
   - The Filter buttons' total height (~23px) and the Option A/B switcher buttons' height (~27px) are too small for touch screen taps, violating the WCAG 44x44px target standard and leading to accidental clicks.
   - The grid puts the Contract Viewer first on mobile, forcing the user to scroll through a heavy, 540px scrollable component before seeing the Legend/Explanations and main CTA.
   - **Conclusion**: Increase tab padding to `py-2.5 px-4 sm:py-1.5 sm:px-3` and increase Option A/B switcher height to `py-3 px-4 sm:py-2 sm:px-3`. Adjust font sizes on mobile to `text-xs`. Reverse grid order on mobile (`order-1 lg:order-2` to `order-2 lg:order-1`) or simplify. Set primary CTA button to `w-full justify-center sm:w-fit` so it fits small viewports neatly.

4. **Social Proof Stats & Logo Marquee Overlaps**:
   - The logo marquee features absolute gradient masks of `w-24` (96px) on both left and right edges. On a 320px screen, `96 * 2 = 192px` of visual masking leaves only 128px of visible space in the center, causing the client logos to look completely invisible or faded.
   - The stats block uses `p-8` padding and `gap-8` in a 2-column mobile layout. A number like `32,600+` in Arabic numerals (`٣٢,٦٠٠+`) combined with the text wraps tightly and breaks layout columns.
   - **Conclusion**: Scale the absolute gradient masks on mobile: change `w-24` to `w-8 sm:w-16 md:w-24`. Reduce container padding to `p-4 sm:p-8` and grid gap to `gap-4 sm:gap-8`. Make stat text sizes responsive: `text-2xl sm:text-3xl md:text-5xl`. Reduce testimonials padding to `p-5 sm:p-8`.

5. **Community Highlights Bento Card Spacing & Metrics**:
   - The card uses `p-8 md:p-10` padding, and list elements use `p-5`. The metrics footer uses `gap-3`, which wraps long lines (e.g. `votes` + `views` + `answers` + `timeAgo`) into 3 separate lines on small devices.
   - The "Ask the Community" dashed button height (~38px) is below the 44px tap target standard.
   - **Conclusion**: Adjust padding to `p-5 sm:p-8 md:p-10` for card and `p-3.5 sm:p-5` for items. Reduce metrics gap and font size (`gap-1.5 xs:gap-2 sm:gap-3 mt-2 text-[10px] sm:text-xs`). Increase CTA height to `py-3.5` or add `min-h-[44px]` for better mobile touch ergonomics.

6. **FAQ Accordion RTL Margin & Mobile Spacing**:
   - The accordion icon uses a hardcoded left margin `ml-4`. In RTL (Arabic), the text is right-aligned and the caret icon is left-aligned. The spacing should be on the right side of the icon (`me-4`), not the left side. Pushing the left margin on the left-most element creates asymmetry.
   - **Conclusion**: Replace `ml-4` with logical margin `ms-4` (margin-start) or use `gap-4` on the flex container. Reduce vertical and horizontal padding on mobile (`p-4 sm:p-6` for headers, `px-4 pb-5 sm:px-6 sm:pb-6` for details) to increase text width.

7. **Footer Stacking & LTR Direction Bug**:
   - On screens <480px, displaying 2 columns forces link categories to be ~128px wide. Long links in English/Arabic wrap into 3+ lines and look broken.
   - The CTA banner uses `-mt-32` and `p-10`. On mobile, `-mt-32` causes major overlap with preceding elements, and `p-10` eats up 80px of horizontal space.
   - The footer CTA button hardcodes `<ArrowLeft />` in English (LTR) mode, which points backwards (left) instead of forwards (right).
   - **Conclusion**: Change the grid layout to stack fully on mobile: `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`. Adjust CTA banner negative margin to `-mt-16 sm:-mt-24 md:-mt-32` and padding to `p-6 sm:p-10 md:p-14`. Make banner button full-width on mobile (`w-full justify-center sm:w-auto`). Fix the arrow direction bug in LTR mode by conditionally rendering: `isAr ? <ArrowLeft size={16} weight="bold" /> : <ArrowRight size={16} weight="bold" />`.

---

## 3. Caveats

* **No live browser testing**: Because this is a read-only exploration workspace, no visual testing or interactive browser checking was performed. Sizing calculations are based on code logic and container layouts.
* **Layout breakpoints assumptions**: It is assumed that Tailwind v4 is compiling standard screen sizes (e.g. `sm: 640px`, `md: 768px`, `lg: 1024px`). If custom breakpoints are defined in `globals.css` or elsewhere, class thresholds might shift slightly.
* **Font-family sizes**: Cairo and IBM Plex Sans Arabic take up more horizontal pixels per character than LTR fonts. Test calculations assume Arabic characters occupy roughly 15-20% more horizontal space than standard Latin text.

---

## 4. Conclusion

To achieve pixel-perfect mobile responsiveness (320px-768px) in LTR/RTL and Light/Dark modes, the following specific Tailwind modifications are recommended:

### A. `src/components/Hero.tsx`
* **Trust Badges Container** (Line 240):
  * *Before:* `className={\`mt-10 flex flex-wrap items-center gap-4 text-xs font-medium border-t pt-8 ...\`}
  * *After:* `className={\`mt-10 flex flex-wrap items-center gap-2 sm:gap-4 text-[10px] sm:text-xs font-medium border-t pt-8 ...\`}
* **Trust Badges Items** (Lines 241, 245, 249):
  * *Before:* `px-3 py-1.5`
  * *After:* `px-2.5 py-1.5 sm:px-3 sm:py-1.5`
* **CTA Buttons Container** (Line 210):
  * *Before:* `className="mt-8 flex flex-wrap items-center gap-4"`
  * *After:* `className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full sm:w-auto"`
* **CTA Button Links** (Lines 210-237):
  * Add `w-full justify-center sm:w-auto` to the `a` (Line 215) and `button` (Line 230) tags.
* **Floating Visual Badge** (Line 369):
  * *Before:* `className="absolute -bottom-4 -right-4 rounded-2xl ..."`
  * *After:* `className="hidden md:flex md:absolute md:-bottom-4 md:-right-4 rounded-2xl ..."`

### B. `src/components/ServicesBento.tsx`
* **AI Showcase Bento Card** (Line 246):
  * *Before:* `row-span-2 group/ai overflow-hidden rounded-[2.5rem] border border-slate-200/50 bg-white p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-dark-card md:p-10`
  * *After:* `md:row-span-2 group/ai overflow-hidden rounded-[2.5rem] border border-slate-200/50 bg-white p-5 sm:p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] dark:border-white/10 dark:bg-dark-card md:p-10`
* **AI Showcase Inner Analysis Card** (Line 262):
  * *Before:* `className="rounded-2xl border border-gold/10 bg-gold/[0.03] p-5"`
  * *After:* `className="rounded-2xl border border-gold/10 bg-gold/[0.03] p-3.5 sm:p-5"`
* **Carousel Outer Container** (Line 330):
  * *Before:* `className="mt-8 rounded-[2.5rem] border border-slate-200/50 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-dark-card"`
  * *After:* `className="mt-8 rounded-[2.5rem] border border-slate-200/50 bg-white p-5 sm:p-8 shadow-sm dark:border-white/10 dark:bg-dark-card"`
* **Service Grid Card Container** (Line 305):
  * *Before:* `className={\`group flex flex-col justify-between rounded-[2rem] border transition-all hover:-translate-y-1 hover:shadow-xl dark:shadow-none p-6 md:p-8 ...\`}`
  * *After:* `className={\`group flex flex-col justify-between rounded-[2rem] border transition-all hover:-translate-y-1 hover:shadow-xl dark:shadow-none p-5 sm:p-6 md:p-8 ...\`}`
* **Category Tabs Container** (Line 203):
  * *Before:* `className="flex items-center gap-2 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-white/5 backdrop-blur-sm self-start md:self-end"`
  * *After:* `className="flex items-center gap-2 rounded-2xl bg-slate-100/80 p-1.5 dark:bg-white/5 backdrop-blur-sm self-center sm:self-auto md:self-end"`
* **Category Tabs Buttons** (Lines 212, 226):
  * *Before:* `px-5 py-2.5 text-sm`
  * *After:* `px-5 py-3 sm:py-2.5 text-sm`

### C. `src/components/ContractAnalysisShowcase.tsx`
* **Filter Tabs Buttons** (Line 436):
  * *Before:* `className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold ...\`}`
  * *After:* `className={\`flex items-center gap-1.5 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-lg text-xs sm:text-[11px] font-semibold ...\`}`
* **Option A/B Switcher Buttons** (Line 582):
  * *Before:* `className={\`flex-1 py-2 px-3 transition-colors text-center ...\`}`
  * *After:* `className={\`flex-1 py-3 px-4 sm:py-2 sm:px-3 transition-colors text-center text-xs sm:text-[11px] ...\`}`
* **CTA Button Container** (Line 356):
  * *Before:* `className="flex items-center gap-3 rounded-2xl bg-[#0B3D2E] ... px-7 py-4 text-sm font-bold text-white ... w-fit"`
  * *After:* `className="flex items-center gap-3 rounded-2xl bg-[#0B3D2E] ... px-7 py-4 text-sm font-bold text-white ... w-full justify-center sm:w-fit"`
* **Section Grid Layout Order** (Line 292):
  * Update the columns order for mobile viewports to place the legend details first and viewer second:
  * *Before:* `order-2 lg:order-1` (Legend, Line 295) and `order-1 lg:order-2` (Viewer, Line 370).
  * *After:* Remove `order-2 lg:order-1` and `order-1 lg:order-2` (allowing natural code-order: Legend then Viewer on mobile), or swap them (`order-1 lg:order-1` and `order-2 lg:order-2`).

### D. `src/components/SocialProof.tsx`
* **Logo Marquee Gradients** (Lines 63-64):
  * *Before:* `className="absolute left-0 top-0 z-10 w-24 h-full ..."` and `className="absolute right-0 top-0 z-10 w-24 h-full ..."`
  * *After:* `className="absolute left-0 top-0 z-10 w-8 sm:w-16 md:w-24 h-full ..."` and `className="absolute right-0 top-0 z-10 w-8 sm:w-16 md:w-24 h-full ..."`
* **Stats Container Box** (Line 126):
  * *Before:* `className={\`rounded-[2.5rem] border p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] md:p-12 ...\`}`
  * *After:* `className={\`rounded-[2.5rem] border p-4 sm:p-8 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)] md:p-12 ...\`}`
* **Stats Container Grid** (Line 130):
  * *Before:* `className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-0 ..."`
  * *After:* `className="grid grid-cols-2 gap-4 sm:gap-8 md:grid-cols-4 md:gap-0 ..."`
* **Counter Text Size** (Line 140):
  * *Before:* `className={\`font-brand text-3xl font-extrabold md:text-5xl ...\`}`
  * *After:* `className={\`font-brand text-2xl sm:text-3xl font-extrabold md:text-5xl ...\`}`
* **Testimonials Card** (Line 174):
  * *Before:* `className={\`group relative rounded-[2rem] border p-8 transition-shadow ...\`}`
  * *After:* `className={\`group relative rounded-[2rem] border p-5 sm:p-8 transition-shadow ...\`}`

### E. `src/components/CommunityHighlights.tsx`
* **Bento Card** (Line 202):
  * *Before:* `className={\`lg:col-span-2 lg:row-span-2 rounded-[2.5rem] border p-8 md:p-10 ...\`}`
  * *After:* `className={\`lg:col-span-2 lg:row-span-2 rounded-[2.5rem] border p-5 sm:p-8 md:p-10 ...\`}`
* **Bento Item** (Line 239):
  * *Before:* `className={\`group flex items-start gap-4 rounded-2xl border p-5 ...\`}`
  * *After:* `className={\`group flex items-start gap-4 rounded-2xl border p-3.5 sm:p-5 ...\`}`
* **Metrics Container** (Line 259):
  * *Before:* `className="flex items-center gap-3 mt-2.5 flex-wrap"`
  * *After:* `className="flex items-center gap-1.5 sm:gap-3 mt-2 flex-wrap text-[10px] sm:text-xs"`
* **Dashed CTA Button** (Line 286):
  * *Before:* `className="mt-6 flex items-center justify-center gap-2 w-full py-3 ..."`
  * *After:* `className="mt-6 flex items-center justify-center gap-2 w-full py-3.5 sm:py-3 min-h-[44px] ..."`

### F. `src/components/FAQ.tsx`
* **RTL Caret Left Margin Bug** (Line 115):
  * *Before:* `className={\`ml-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ...\`}`
  * *After:* `className={\`ms-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ...\`}`
* **Accordion Title Button Padding** (Line 106):
  * *Before:* `className="flex w-full items-center justify-between p-5 text-start md:p-6"`
  * *After:* `className="flex w-full items-center justify-between p-4 sm:p-5 text-start md:p-6"`
* **Accordion Detail Text Padding** (Line 132):
  * *Before:* `className={\`px-5 pb-6 text-sm leading-relaxed md:px-6 md:text-base ...\`}`
  * *After:* `className={\`px-4 pb-5 sm:px-5 sm:pb-6 text-sm leading-relaxed md:px-6 md:text-base ...\`}`

### G. `src/components/Footer.tsx`
* **Footer Columns Stacking Grid** (Line 108):
  * *Before:* `className="grid grid-cols-2 gap-8 md:grid-cols-4 lg:gap-12"`
  * *After:* `className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12"`
* **CTA Banner Overlap** (Line 83):
  * *Before:* `className="-mt-32 mb-16 rounded-[2.5rem] bg-royal p-10 shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-14"`
  * *After:* `className="-mt-16 sm:-mt-24 md:-mt-32 mb-16 rounded-[2.5rem] bg-royal p-5 sm:p-10 shadow-[0_20px_60px_-15px_rgba(11,61,46,0.4)] md:p-14"`
* **Banner Register Button** (Line 98):
  * *Before:* `className="inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)]"`
  * *After:* `className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-8 py-4 text-sm font-bold text-royal shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)] w-full sm:w-auto"`
* **LTR Direction Arrow Fix** (Line 101):
  * Conditionally render the icon pointing forward in LTR and RTL:
  * *Before:* `<ArrowLeft size={16} weight="bold" />`
  * *After:* `{isAr ? <ArrowLeft size={16} weight="bold" /> : <ArrowRight size={16} weight="bold" />}`

---

## 5. Verification Method

To verify these layout improvements, execute the following steps:

1. **Verify Index Integrity**:
   Confirm that all code targets compile cleanly after applying layout classes:
   ```powershell
   npm run build
   ```
2. **Visual Inspection & Layout Verification**:
   - Open the web application inside Google Chrome or Microsoft Edge.
   - Press `F12` to open DevTools, and click the Device Toolbar toggle (`Ctrl+Shift+M`) to trigger the responsive emulator.
   - Test viewports under the following conditions:
     * **320px viewport**: Ensure no elements cause a horizontal scrollbar. Check that Hero trust badges wrap cleanly and are readable. Verify footer links stack into a single column.
     * **375px viewport (iPhone 12/13/14)**: Verify all badges, stats columns, and logo marquee gradients display with clear margins.
     * **768px viewport (Tablet)**: Verify elements switch correctly into 2-column or 3-column layouts.
3. **Accessibility (Touch Target) Check**:
   - Open standard touch target audit (e.g. Lighthouse inside DevTools).
   - Ensure the accordion filter buttons and Option A/B switcher buttons pass the touch size inspection (>40px min height, 48px optimal).
4. **Bidi (RTL) Spacing Verification**:
   - Switch language to English (LTR) and verify the Register Button Arrow points right (`->`).
   - Switch language to Arabic (RTL) and verify the FAQ Caret Margin remains symmetric and matches the parent borders.
