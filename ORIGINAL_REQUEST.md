# Original User Request

## Initial Request — 2026-06-16T00:58:44Z

Audit all client-side and lawyer-side dashboard pages, services, API routes, and database schemas in the NZAMY legal platform. Identify all requirements, missing integrations, and code fixes necessary for production readiness, and provide a detailed list of all n8n workflows that need to be built.

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Client Dashboard Audit
Analyze all client-side dashboard pages under `src/app/dashboard/client/` and their respective services, hooks, and API routes. Identify all instances of hardcoded mock data, mock data fallbacks, missing API integration, and any issues that would block production deployment.

### R2. Lawyer Dashboard Audit
Analyze all lawyer-side dashboard pages under `src/app/dashboard/lawyer/` and their respective services, hooks, and API routes. Identify all instances of hardcoded mock data, mock data fallbacks, missing API integration, and any issues that would block production deployment.

### R3. Database and RLS Policy Verification
Verify that all database tables, columns, constraints, triggers, and Row Level Security (RLS) policies are correctly configured and match what the frontend pages and API routes expect.

### R4. n8n Workflows Specifications
Create a detailed markdown file `n8n_workflows_list.md` in the root of the workspace listing all required n8n workflows. For each workflow, specify the exact trigger (e.g. Supabase webhook/cron), conditions, node sequence (e.g. classification, email, SMS, push notification), data payloads, and target API or database updates.

## Acceptance Criteria

### Documentation
- [ ] A comprehensive audit report file `production_readiness_audit.md` is created in the repository root.
- [ ] The audit report details each page's current state (integrated vs. mocked), specific code issues, and clear action items to make it production-ready.
- [ ] A detailed `n8n_workflows_list.md` file is created in the repository root.
- [ ] The `n8n_workflows_list.md` includes at least the 12 workflows identified in `n8n_workflows.md` with complete trigger and integration details, plus any new ones discovered during the audit.
- [ ] All files are written in clear Markdown format (in English or Arabic as appropriate).
