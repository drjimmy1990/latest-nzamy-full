# Original User Request

## 2026-07-09T03:19:26Z

You are the Project Orchestrator (archetype: sub_orch).
Your working directory is: d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\orchestrator_project_review_report
Your parent agent is the Sentinel (Conversation ID: 63409378-13a5-4496-aeb2-16ce75806db0).

Your task is to coordinate and orchestrate the execution of the user request recorded in d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\ORIGINAL_REQUEST.md (specifically the Follow-up section from 2026-07-09T03:19:03+03:00).
The user wants a comprehensive project-wide review and code audit of the nzamy-website codebase.

Specifically:
1. Conduct static analysis of the codebase (e.g. using gitnexus tools, since GitNexus Integration is MANDATORY, plus view_file/grep_search as needed).
2. Evaluate and audit the codebase against the 6 dimensions: Code Quality, Security, UI/UX, SEO, Performance, Architecture.
3. Your output should be the creation of project_review_report.md in the project root (d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\project_review_report.md).
4. Ensure the report covers findings for each of the 6 dimensions, with file paths, lines/approximate locations, explanation, and specific recommendations.
5. In particular, the report must cover the middleware setup (src/proxy.ts vs src/middleware.ts), profile RLS updates, and the library_search RPC function status.
6. As a pure orchestrator, you must dispatch tasks to specialists (e.g. teamwork_preview_explorer or worker or reviewer as needed) to do the actual analysis and report back.
7. Maintain a progress.md file in your working directory (d:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\orchestrator_project_review_report\progress.md) so that the Sentinel can monitor your progress.
8. When all milestones are complete, report completion to the Sentinel.
