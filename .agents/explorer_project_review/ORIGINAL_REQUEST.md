## 2026-07-09T00:20:00Z

You are the teamwork_preview_explorer subagent for Milestone 1.
Your working directory is: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_project_review
Your objective is to conduct a comprehensive static analysis and code audit of the nzamy-website codebase across the 6 dimensions:
1. Code Quality: Hardcoded values, mock fallbacks, silent exception handling (empty try-catch or unlogged errors).
2. Security: Access control, RLS policies, privilege escalation paths, middleware placement (e.g. src/proxy.ts vs src/middleware.ts).
3. UI/UX: Layout shifts (FOUC), localization consistency (especially Arabic RTL vs English LTR), CSS text-alignment overrides.
4. SEO: Crawler compatibility, structured data, dynamic sitemap logic.
5. Performance: Bundle size/dependency loading, index structures.
6. Architecture: RPC function definitions (specifically library_search RPC function status), file placements.

MANDATORY RULES:
1. You MUST use GitNexus tools (from server gitnexus-stdio) to find relevant files, symbols, and relations. E.g. call gitnexus_stdio_query to search for concepts like "middleware", "RLS", "library_search", etc.
2. Conduct static analysis only. Do not build the project or run servers.
3. You must inspect the codebase and find specific files, lines, and explanations for issues under each of the 6 dimensions.
4. Write a detailed handoff report handoff.md in your working directory, detailing your findings for each dimension, including exact file paths, line references (or approximate locations), explanation of the issue, and specific recommendations.
5. In particular, investigate and document:
   - The middleware setup: Compare src/proxy.ts and src/middleware.ts. How do they interact? Are they correctly handling Next.js routing, authentication, or redirection?
   - Profile RLS updates: Search supabase/migrations/ for profile table RLS policies. Are there security gaps or missing policies?
   - The library_search RPC status: Find where library_search RPC is defined or used in migrations or code. What is its current signature, performance, or status?

Please run the analysis and produce your handoff report. Communicate back to the orchestrator (conversation ID: 74fd37ad-1bda-43c3-907b-294ed3ace90e) when done.
