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

## Follow-up — 2026-06-27T01:50:46Z

Fully wire all tabs of the Admin Panel Dashboard (Library, Community, Marketplace, ERP, Team, Corporate) to secure Next.js API endpoints (checking admin session on the backend) rather than showing mock/dummy arrays, and implement all administrative database actions (verify users, delete library items, approve/reject provider KYC).

Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website
Integrity mode: development

## Requirements

### R1. Secure Next.js Admin API Endpoints
- Implement backend API routes under `/api/v1/admin/` for:
  - `/api/v1/admin/library` (list/search laws, decrees, precedents, feqh; delete items)
  - `/api/v1/admin/verifications` (list pending provider/lawyer verifications; update status to approved/rejected)
  - `/api/v1/admin/marketplace` (list listings, orders, templates)
  - `/api/v1/admin/erp` (financial summaries, MRR, stats)
  - `/api/v1/admin/teams` (admin team members and invitations)
- All API routes **must** use `requireAdmin()` from `src/lib/access-control.ts` to verify the caller is an authenticated administrator.

### R2. Frontend Admin Dashboard Integration
- Replace the mock data arrays in:
  - `src/app/dashboard/admin/tabs/LibraryTab.tsx`
  - `src/app/dashboard/admin/tabs/CommunityTab.tsx`
  - `src/app/dashboard/admin/tabs/MarketplaceTab.tsx`
  - `src/app/dashboard/admin/tabs/ERPTab.tsx`
  - `src/app/dashboard/admin/tabs/TeamTab.tsx`
  - `src/app/dashboard/admin/tabs/CorporateTab.tsx`
- Replace them with fetch/SWR calls to the newly created secure API endpoints.
- Preserve all existing tailwind styling, dark mode states, animations, and icons.

### R3. Admin Operations & Actions
- Wire the "Verify" / "KYC" actions to call `/api/v1/admin/verifications`
- Wire the "Delete" actions in the Library Tab to call `/api/v1/admin/library`
- Wire "Status" toggles in the Team tab to invite or suspend team members

## Acceptance Criteria

### Security
- [ ] All API requests to `/api/v1/admin/*` are blocked with HTTP 403 if the user is not an admin.

### Dashboard Functionality
- [ ] Library Tab shows real database records with working search.
- [ ] Community Tab shows real verifications with working Approve/Reject actions.
- [ ] ERP Tab shows real MRR, active plans, and credits usage logs.
- [ ] Zero dummy/mock data remaining in the dashboard tabs.
- [ ] Zero TypeScript compile errors.
