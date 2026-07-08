## 2026-07-09T00:28:56Z
You are the HTML & Navbar Explorer.
Objective: Analyze Milestone 1 and Milestone 2 requirements:
1. View and analyze src/app/layout.tsx, src/app/page.tsx, src/components/Navbar.tsx, src/components/Hero.tsx, and src/components/FloatingButtons.tsx.
2. Formulate a detailed strategy to:
   - Remove `maximumScale: 1` viewport zoom block from layout.tsx.
   - Adjust Hero grain overlay z-index in Hero.tsx (currently z-50, which overlaps Navbar).
   - Eliminate duplicate `FloatingButtons` and nested <main> elements. Analyze if we can let FloatingButtons dynamically detect the pathname (using usePathname) to show reportConfig for laws/precedents, rendering it only once globally in layout.tsx.
   - Fix the Navbar breakpoint dead zone between 1024px-1280px (desktop xl:flex, hamburger xl:hidden, but menu panel lg:hidden). Align them to a consistent breakpoint.
   - Map what controls are on desktop (login, signup/dashboard, theme, language, region) and make sure they have equivalents in the mobile menu.
3. Write your findings to D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_resp_m1_m2\handoff.md. DO NOT make any code edits yourself.
