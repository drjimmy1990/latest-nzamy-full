# BRIEFING — 2026-07-09T02:57:00+03:00

## Mission
Perform a comprehensive static analysis and code review of the nzamy-website project across 6 areas.

## 🔒 My Identity
- Archetype: explorer
- Roles: static-analysis, code-reviewer
- Working directory: D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_review
- Original parent: 868a1a11-d569-4868-9865-55d5171ebfc2
- Milestone: static analysis and code review report

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT build, install, or run the app
- Rely on GitNexus code intelligence MCP tools/CLI for exploration

## Current Parent
- Conversation ID: 868a1a11-d569-4868-9865-55d5171ebfc2
- Updated: 2026-07-09T02:57:00+03:00

## Investigation State
- **Explored paths**: src/app/layout.tsx, src/app/page.tsx, src/proxy.ts, src/app/sitemap.ts, src/hooks/useUser.ts, src/lib/services/api.ts, src/lib/services/casesService.ts, src/components/Navbar.tsx, src/components/FloatingButtons.tsx, src/components/ThemeProvider.tsx, supabase/migrations/*.sql
- **Key findings**:
  - Code Quality: Hardcoded color hexes (#0B3D2E) over 2,000 times; silent local demo fallback catching backend exceptions; deprecated font loading via HTML link tags.
  - Security: Ignored middleware due to naming file src/proxy.ts; profiles RLS update policy privilege escalation; handle_new_user() signup metadata escalation.
  - UI/UX: Client-side language/dir hydration visual flicker (FOUC); aggressive global text-alignment overrides (.text-left/.text-right) in LTR/RTL.
  - SEO: Server-rendered language metadata hardcoded; missing JSON-LD schema markup; static blog sitemap.
  - Performance: Heavy static imports in global layout component (FloatingButtons); missing DB indexes on FKs used in RLS.
  - Architecture: Ignored middleware routing file; missing database function library_search RPC; inconsistent admin RLS checks.
- **Unexplored areas**: None. Comprehensive static audit of the 6 areas is complete.

## Key Decisions Made
- Audited 6 target dimensions using codebase searches and SQL migration inspections.
- Created handoff.md reporting all 15 findings along with direct quotes, files, and logic paths.

## Artifact Index
- D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_review\ORIGINAL_REQUEST.md — Original request details
- D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_review\progress.md — Liveness progress heartbeat
- D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_review\handoff.md — Final detailed report
