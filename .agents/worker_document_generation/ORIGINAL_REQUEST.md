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
