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
