# BRIEFING — 2026-06-16T03:59:03Z

## Mission
Coordinate and execute the NZAMY legal platform production readiness audit and n8n workflow specification.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\orchestrator
- Original parent: main agent
- Original parent conversation ID: 6d9e9138-d651-466e-9cd5-a2e65356efd3

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\PROJECT.md
1. **Decompose**: We decompose the audit and specification task into three logical milestones:
   - Milestone 1: Client and Lawyer Dashboard Code Audit (pages, services, hooks, API routes)
   - Milestone 2: Database Schema & RLS Policy Verification (tables, columns, constraints, triggers, RLS)
   - Milestone 3: n8n Workflow Specification & Documentation Generation (compiling findings into production_readiness_audit.md and n8n_workflows_list.md)
2. **Dispatch & Execute** (pick ONE):
   - **Delegate (sub-orchestrator)**: [TBD]
   - **Direct (iteration loop)**: Use Explorer -> Worker -> Reviewer -> Auditor/Challenger sequence for documents creation and validation.
3. **On failure** (in this order):
   - Retry: nudge stuck agent or re-send task
   - Replace: spawn fresh agent with partial progress
   - Skip: proceed without (only if non-critical)
   - Redistribute: split stuck agent's remaining work
   - Redesign: re-partition decomposition
   - Escalate: report to parent (sub-orchestrators only, last resort)
4. **Succession**: At 16 spawns, write handoff.md, spawn successor.
- **Work items**:
  1. Initialize Plan and Progress [in-progress]
  2. Perform Client/Lawyer Dashboard Audit [pending]
  3. Verify Database Schema and RLS Policies [pending]
  4. Specify n8n Workflows [pending]
  5. Generate final reports (production_readiness_audit.md, n8n_workflows_list.md) [pending]
- **Current phase**: 1
- **Current focus**: Initialize Plan and Progress

## 🔒 Key Constraints
- NEVER write, modify, or create source code or document files outside .agents/ folder directly.
- Use file-editing tools ONLY for metadata/state files (.md) in .agents/ folder.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh

## Current Parent
- Conversation ID: 6d9e9138-d651-466e-9cd5-a2e65356efd3
- Updated: 2026-06-16T03:59:03Z

## Key Decisions Made
- Use teamwork_preview_explorer to audit codebase and database schema.
- Use teamwork_preview_worker to write the final files `production_readiness_audit.md` and `n8n_workflows_list.md`.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_1 | teamwork_preview_explorer | Audit codebase dashboards and DB schema | completed | 077826c1-47a5-409a-b7fe-860731fff691 |
| worker_1 | teamwork_preview_worker | Write audit report and n8n specs | completed | 9c486c00-f0dc-4f84-8711-aae832dd193e |
| reviewer_1 | teamwork_preview_reviewer | Review audit report and n8n specs | completed | 6166ab47-a999-4ef8-a403-1050be6a84f9 |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: none
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: 288cf2d3-ba7b-4cfa-9d42-db946bdb36d8/task-25
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\orchestrator\plan.md — Orchestrator plan
- d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\orchestrator\progress.md — Orchestrator progress heartbeat
- d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\production_readiness_audit.md — Comprehensive production readiness audit
- d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\n8n_workflows_list.md — Detailed n8n workflow specification
