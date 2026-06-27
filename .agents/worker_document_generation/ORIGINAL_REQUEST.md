## 2026-06-16T01:11:01Z
You are a technical document writer. Your working directory is d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\worker_document_generation.

Your task is to write two comprehensive documentation files in the repository root:
1. `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\production_readiness_audit.md`
2. `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n_workflows_list.md`

Read the following reference files to get the necessary data:
- Audit Findings Report: `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_dashboard_audit\audit_findings.md`
- Explorer Handoff: `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_dashboard_audit\handoff.md`
- Initial n8n workflows info: `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n_workflows.md`
- Workflows roadmap info: `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\workflows_roadmap.md`

Your output files must meet these criteria:
### 1. `production_readiness_audit.md`
- Detail client-side and lawyer-side dashboard audits (files, pages, components, services, and API routes containing mock data, mismatches, or missing functionality). Include details from the findings report, such as:
  - Mock data and fallbacks in `cases/[id]/page.tsx`, `wallet/page.tsx`, `referral/page.tsx`, `cases/updates/page.tsx`, `network/page.tsx`, etc.
  - API mismatches and crashes: e.g. `/api/v1/cases/[id]` returning wrapped data envelope causing frontend crashes, the `/api/v1/lawyers` `available=true` filter crash (due to missing `is_accepting_clients` column), `/api/v1/documents` column and constraint mismatches with `attachments` table, and `/api/v1/service-requests` POST payload wrap mismatch and check constraint status failures.
  - Database schema issues: missing columns (`is_accepting_clients`, `city`), constraint issues (`attachments` `request_id` NOT NULL constraint preventing general document uploads).
  - RLS policy block: the RLS policy on `service_requests` table restricting select to `requester_user_id = auth.uid() or assigned_to = auth.uid()` which completely blocks lawyers from seeing unassigned requests in the marketplace.
  - Conflicting RLS policies on `attachments`.
- Provide specific, step-by-step code and SQL remediations/fixes for each identified blocker.

### 2. `n8n_workflows_list.md`
- Specify all 18 workflows from `n8n_workflows.md` / `workflows_roadmap.md` in detail.
- For each workflow, detail:
  - Exact trigger (e.g. Supabase webhook with table and event, or daily/hourly cron schedule)
  - Activation Conditions (e.g. only trigger if certain parameters match)
  - Node Sequence (the logical flow of n8n nodes, such as HTTPRequest, OpenAI/AI Classifier, Supabase/Postgres nodes, Email/Resend, Evolution API WhatsApp, etc.)
  - Input/Output Payloads (detailed JSON payload structures sent to and from external APIs or webhook calls, including WhatsApp body fields and email parameters)
  - Target API or Database Updates (tables, fields, or endpoints that are updated by the workflow callback)

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT
> hardcode test results, create dummy/facade implementations, or
> circumvent the intended task. A Forensic Auditor will independently
> verify your work. Integrity violations WILL be detected and your
> work WILL be rejected.

When complete, write your `handoff.md` and send a message reporting the completion and the paths to both generated files.

## 2026-06-27T01:52:58Z
Write the file `d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\PROJECT.md` with the following content:

```markdown
# Project: NZAMY Admin Panel Integration

## Architecture
- Secure API endpoints under `/api/v1/admin/` verify administrative privileges via `requireAdmin()`.
- Frontend dashboard tabs (`LibraryTab.tsx`, `CommunityTab.tsx`, `MarketplaceTab.tsx`, `ERPTab.tsx`, `TeamTab.tsx`, `CorporateTab.tsx`) fetch from these APIs via fetch/SWR and trigger actions.
- Database access uses `createServiceClient` to bypass RLS policies for administrative operations.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Create Secure Next.js Admin API Endpoints | Implement secure API endpoints under `/api/v1/admin/` for library, marketplace, erp, and teams. | None | PLANNED |
| 2 | Frontend Admin Dashboard Integration | Wire LibraryTab, CommunityTab, MarketplaceTab, ERPTab, TeamTab, and CorporateTab to secure endpoints. | M1 | PLANNED |
| 3 | Verification & Auditing | Run typecheck, build, and forensic auditor to verify security and completeness. | M2 | PLANNED |

## Interface Contracts
### /api/v1/admin/library
- GET: list and search laws, decrees, precedents, feqh books.
  - Query params: `search` (string), `category` (string)
  - Return: `{ entries: Array<{ id, title, category, source, status, views, date }>, total: number }`
- DELETE: delete a library item.
  - Request body: `{ id: string, type: 'law' | 'decree' | 'principle' | 'feqh' }`
  - Return: `{ success: boolean, message: string }`

### /api/v1/admin/verifications
- GET: list pending provider/lawyer/firm verifications (status 'pending' | 'verified' | 'rejected' | 'all').
  - Return: `{ verifications: Array<{ id, user_id, name, type, date, docs, aiScore, status, license_number, email, phone }> }`
- PATCH /api/v1/admin/verifications/[id]: approve or reject verification.
  - Request body: `{ action: 'approve' | 'reject', reason?: string }`
  - Return: `{ success: boolean, message: string }`

### /api/v1/admin/marketplace
- GET: list listings, offers, and workspaces.
  - Return: `{ requests: Array<{ id, client, clientType, service, provider, amount, commission, status, date }>, total: number }`

### /api/v1/admin/erp
- GET: list firms, active cases, lawyers, and MRR.
  - Return: `{ firms: Array<{ id, name, city, lawyers, activeCases, plan, mrr, rating, status }>, summary: { totalMRR, totalLawyers, totalCases, totalFirms } }`

### /api/v1/admin/teams
- GET: list admin team members.
  - Return: `{ team: Array<{ id, name, role, dept, desc, access: string[], dashboardTabs: string[], kpi, status }> }`
- POST: invite a new admin team member.
  - Request body: `{ name, email, role, department }`
- PATCH /api/v1/admin/teams/[id]: toggle user suspension status.
  - Request body: `{ status: 'active' | 'suspended' }`

## Code Layout
- `src/app/api/v1/admin/` — Admin secure backend API routes
- `src/app/dashboard/admin/tabs/` — Frontend dashboard tabs
- `src/lib/access-control.ts` — Admin access check helper (`requireAdmin`)
```

Create this file and send a message back with success or failure details.
