# Original User Request

## Initial Request — 2026-07-09T02:51:52+03:00

Conduct a comprehensive review of the `nzamy-website` project, focusing on code quality, security, UI/UX, SEO, performance, and general architecture. Provide actionable feedback.

Working directory: D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Comprehensive Markdown Report
Generate a detailed markdown report (e.g., `comprehensive_review.md`) summarizing all findings and recommendations across the requested domains: code quality, security, UI/UX, SEO, performance, and general architecture.

### R2. Static Analysis Only
Conduct the review solely through static analysis. Do not attempt to install dependencies, build the project, or run the development server.

## Acceptance Criteria

### Deliverable Structure
- [ ] A markdown file named `comprehensive_review.md` is created in the working directory.
- [ ] The report contains distinct, clearly labeled sections for: Code Quality, Security, UI/UX, SEO, Performance, and Architecture.

### Finding Quality (Agent-as-Judge)
- [ ] Each section contains at least two specific findings tied to actual files or code patterns found in the repository.
- [ ] Recommendations are actionable (e.g., "Refactor X in file Y because Z") rather than generic advice (e.g., "Write clean code").
- [ ] The review reflects standard industry best practices for modern web development.

## Follow-up — 2026-07-09T03:19:03+03:00

The goal is to perform a comprehensive project-wide review and code audit of the nzamy-website codebase (Next.js and Supabase migrations) across Code Quality, Security, UI/UX, SEO, Performance, and Architecture, identifying current issues, gaps, and areas for improvement.

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Comprehensive Static Analysis
Perform a static analysis of the codebase, including Next.js pages/components (`src/`), database migration files (`supabase/migrations/`), and route configurations.

### R2. Cross-Dimensional Assessment
Evaluate findings against the following dimensions:
- **Code Quality**: Hardcoded values, mock fallbacks, silent exception handling.
- **Security**: Access control, RLS policies, privilege escalation paths, middleware placement.
- **UI/UX**: Layout shifts (FOUC), localization consistency, CSS text-alignment overrides.
- **SEO**: Crawler compatibility, structured data, dynamic sitemap logic.
- **Performance**: Bundle size/dependency loading, index structures.
- **Architecture**: RPC function definitions, file placements.

### R3. Actionable Review Report
Produce a structured markdown report `project_review_report.md` in the project root detailing findings, the underlying logic, and concrete remediation steps.

## Acceptance Criteria

### Project Audit Report
- [ ] A detailed report named `project_review_report.md` is created in the project root.
- [ ] The report details findings across all 6 specified dimensions (Code Quality, Security, UI/UX, SEO, Performance, Architecture).
- [ ] Each finding includes file paths, lines (or approximate locations), explanation of the issue, and specific recommendations.
- [ ] The report covers the middleware setup (`src/proxy.ts` vs `src/middleware.ts`), profiles RLS updates, and the `library_search` RPC function status.
