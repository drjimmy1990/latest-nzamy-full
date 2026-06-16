# NZAMY Production Readiness Audit & n8n Workflow Specification Plan

This plan details the steps to audit the NZAMY legal platform's client and lawyer dashboards, verify the database and RLS policies, specify n8n workflows, and generate the final audit documents in the repository root.

## Milestones and Verification Strategy

### Milestone 1: Client & Lawyer Dashboard Code Audit
- **Goal**: Audit client dashboard pages (`src/app/dashboard/client/`) and lawyer dashboard pages (`src/app/dashboard/lawyer/`), along with related services, hooks, and API routes.
- **Investigation Targets**: Identify hardcoded mock data, mock data fallbacks, missing API integrations, and other blocker issues.
- **Verification Method**: Subagent review of codebase symbols, pages, hooks, and API routes using GitNexus and search tools.

### Milestone 2: Database and RLS Policy Verification
- **Goal**: Verify Supabase database schemas, tables, columns, constraints, triggers, and Row Level Security (RLS) policies.
- **Investigation Targets**: Verify consistency between Supabase migration files (e.g. under `supabase/migrations/`) and the expectations of frontend pages / API routes.
- **Verification Method**: SQL review of migrations, checking configuration of tables, constraints, triggers, and RLS.

### Milestone 3: n8n Workflow Specification
- **Goal**: Spec out n8n workflows with triggers, conditions, node sequences, payloads, and target API or database updates.
- **Investigation Targets**: Include at least the 12 workflows in `n8n_workflows.md` plus any new ones found.
- **Verification Method**: Align workflows with identified service gaps from Milestones 1 and 2.

### Milestone 4: Report Generation & Verification
- **Goal**: Create `production_readiness_audit.md` and `n8n_workflows_list.md` in the repository root.
- **Verification Method**: Review and audit correctness of output files using independent reviewer subagent.

---

## Plan Checklist

- [ ] **Step 1: Context Gathering & Planning**
  - [x] Read `ORIGINAL_REQUEST.md`, `project_reference.md`, `n8n_workflows.md`, and `workflows_roadmap.md`
  - [x] Create `BRIEFING.md`, `plan.md`, and `progress.md`
- [ ] **Step 2: Dispatch Explorer for Dashboard Code Audit**
  - [ ] Spawn explorer to audit client-side dashboard pages under `src/app/dashboard/client/`
  - [ ] Spawn explorer to audit lawyer-side dashboard pages under `src/app/dashboard/lawyer/`
  - [ ] Collate findings on hardcoded mock data, fallbacks, API routes, and services
- [ ] **Step 3: Dispatch Explorer for Database and RLS Policy Verification**
  - [ ] Spawn explorer to analyze DB schemas, constraints, triggers, and RLS policies from migration SQL files
  - [ ] Cross-reference schema with frontend API route requirements (e.g. check if all required tables/columns exist)
- [ ] **Step 4: Dispatch Worker to Draft Audit Report and n8n Workflow Specs**
  - [ ] Generate `production_readiness_audit.md` at project root
  - [ ] Generate `n8n_workflows_list.md` at project root based on `n8n_workflows.md` and audit findings
- [ ] **Step 5: Review and Verify Outputs**
  - [ ] Spawn reviewer to examine generated files for completeness, accuracy, and adherence to requirements
- [ ] **Step 6: Handoff and Reporting**
  - [ ] Write `handoff.md` and report completion to the Sentinel
