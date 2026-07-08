# Project: NZAMY Responsive & Structural Layout Overhaul

## Architecture
- Next.js 16 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (CSS-first configuration, @theme in globals.css)
- RTL Arabic-first by default (dir="rtl", lang="ar"), with LTR English toggle (dir="ltr", lang="en")
- Dark/Light mode theme system
- Mobile responsiveness via Tailwind responsive utility classes (md:, lg:, xl:)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Fix Structural HTML & Viewport Issues | Remove maximumScale, fix double FloatingButtons rendering, fix nested main landmarks, adjust Hero grain overlay z-index. | None | PLANNED |
| 2 | Fix Navbar & Breakpoint Dead Zone | Align responsive breakpoints to xl, resolve dead zone between 1024-1280px, add mobile controls. | M1 | PLANNED |
| 3 | Homepage Mobile Responsiveness | Fix trust badges scaling, Bento cards, showcases, social proof, highlights, FAQ, and footer columns for viewports down to 320px. | M2 | PLANNED |
| 4 | Full-Site Responsiveness Audit & Fixes | Audit and fix public-facing pages: About, Blog, Pricing, Contact, FAQ, Services, Cases, Laws, Login, Register, Community pages. | M3 | PLANNED |
| 5 | E2E Build and Audit Verification | Build check (npm run build) and Forensic Audit verification. | M4 | PLANNED |

## Code Layout
- Root Layout: `src/app/layout.tsx`
- Homepage: `src/app/page.tsx`
- Global CSS: `src/app/globals.css`
- Navbar: `src/components/Navbar.tsx`
- Hero: `src/components/Hero.tsx`
- Footer: `src/components/Footer.tsx`
- FloatingButtons: `src/components/FloatingButtons.tsx`
- ThemeProvider: `src/components/ThemeProvider.tsx`
