# NZAMY Admin Panel Dashboard Integration Plan

This plan details the steps to fully wire all tabs of the Admin Panel Dashboard (Library, Community, Marketplace, ERP, Team, Corporate) to secure API endpoints, and implement admin database actions (verify users, delete items, approve/reject KYC).

## Milestones and Verification Strategy

### Milestone 1: Secure Next.js Admin API Endpoints
- **Goal**: Implement secure backend API routes under `/api/v1/admin/` to expose real database records and perform admin actions.
  - `/api/v1/admin/library` (GET: list/search laws, decrees, precedents, feqh; DELETE: delete library items)
  - `/api/v1/admin/verifications` (GET/PATCH: already exists, verify its correctness, support Approve/Reject KYC)
  - `/api/v1/admin/marketplace` (GET: list marketplace listings, offers, and workspaces)
  - `/api/v1/admin/erp` (GET: financial summaries, MRR, stats, and firm details)
  - `/api/v1/admin/teams` (GET: list admin team members; POST: invite team member; PATCH: suspend/activate team member status)
- **Verification Method**: API route tests and manual validation using direct REST calls or curl. Verify all requests use `requireAdmin()` check and return 403 when not authenticated.

### Milestone 2: Frontend Dashboard Tabs Integration
- **Goal**: Wire all tabs in the admin panel to the newly created secure API endpoints, replacing mock data.
  - `LibraryTab.tsx` ➡️ `/api/v1/admin/library` (with delete action wired)
  - `CommunityTab.tsx` ➡️ `/api/v1/admin/verifications` (list verifications and handle Approve/Reject KYC actions)
  - `MarketplaceTab.tsx` ➡️ `/api/v1/admin/marketplace`
  - `ERPTab.tsx` ➡️ `/api/v1/admin/erp`
  - `TeamTab.tsx` ➡️ `/api/v1/admin/teams` (list admins, invite, and toggle active/suspended status)
  - `CorporateTab.tsx` ➡️ Update to use fetched data if applicable or persist feature flag updates.
- **Verification Method**: SWR / SWR mutation and fetch integrations verified on the client. Verify page render succeeds with zero TypeScript errors.

### Milestone 3: End-to-End Build and Audit Verification
- **Goal**: Run typecheck, build, and forensic auditing checks to ensure there are no compilation errors or security/integrity violations.
- **Verification Method**: Run next build (`npm run build` or `npx tsc`). Run forensic audit validation.

---

## Plan Checklist

- [ ] **Step 1: Planning and Setup**
  - [x] Analyze codebase structure and identify target tabs and APIs
  - [x] Create project plan, briefing, and progress templates
  - [ ] Write `PROJECT.md` at project root via worker subagent to define interface contracts and architecture layout
- [ ] **Step 2: Backend API Routes Implementation**
  - [ ] Spawn worker subagent to create `/api/v1/admin/library`
  - [ ] Spawn worker subagent to create `/api/v1/admin/marketplace`
  - [ ] Spawn worker subagent to create `/api/v1/admin/erp`
  - [ ] Spawn worker subagent to create `/api/v1/admin/teams`
  - [ ] Verify security rules: ensure all routes block requests with 403 if the user is not an admin (test with mock user/session)
- [ ] **Step 3: Frontend Admin Dashboard Integration**
  - [ ] Wire `LibraryTab.tsx` to get/delete laws/decrees/precedents/feqh books
  - [ ] Wire `CommunityTab.tsx` to list verifications and approve/reject them
  - [ ] Wire `MarketplaceTab.tsx` to list active/pending/disputed trades and commissions
  - [ ] Wire `ERPTab.tsx` to display real firms, active cases, and billing metrics
  - [ ] Wire `TeamTab.tsx` to list admin profiles and handle suspend/activate toggles
  - [ ] Wire `CorporateTab.tsx` to handle company profiles or verify functionality
- [ ] **Step 4: Quality Assurance and Audit**
  - [ ] Run build validation to ensure zero TypeScript errors
  - [ ] Run forensic audit verification
- [ ] **Step 5: Completion and Reporting**
  - [ ] Write `handoff.md` and report completion to the main agent
