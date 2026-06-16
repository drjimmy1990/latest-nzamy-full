## 2026-06-16T00:59:56Z

You are a codebase audit explorer. Your working directory is d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_dashboard_audit.
Your task:
1. Audit client-side dashboard pages under `src/app/dashboard/client/` and their respective services, hooks, and API routes. Identify any hardcoded mock data, mock data fallbacks, missing API integrations, and code blocker issues.
2. Audit lawyer-side dashboard pages under `src/app/dashboard/lawyer/` and their respective services, hooks, and API routes. Identify any hardcoded mock data, mock data fallbacks, missing API integrations, and code blocker issues.
3. Verify all database tables, columns, constraints, triggers, and RLS policies. Check the migration SQL files under `supabase/migrations/` and compare them with the expectations of the pages/API routes and the database types in `src/types/database.ts`. Identify any missing columns, constraints, or RLS policy gaps.
4. Document your findings in detail in `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_dashboard_audit\audit_findings.md`.

Use GitNexus and local file view/grep tools to trace and locate the code. Do not write any code changes. When done, write `handoff.md` and send a message reporting completion with the path to the findings report.
