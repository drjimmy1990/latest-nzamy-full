## 2026-07-08T23:53:00Z
Your mission is to perform a comprehensive static analysis and code review of the `nzamy-website` project.
Specifically, review the following 6 areas:
1. Code Quality: readability, modularity, consistency, React 19 / Next.js 16 best practices, Tailwind v4 usage.
2. Security: authentication, role-based authorization, Supabase/database RLS policies, SQL injection risk, API key exposure, XSS/CORS, input validation.
3. UI/UX: mobile responsive layout issues, RTL/LTR styling patterns, tap targets, navigation elements, accessibility (WCAG, viewport pinch-to-zoom support).
4. SEO: meta tags, JSON-LD schema markup, sitemap, language tags (RTL/LTR handling), Open Graph.
5. Performance: component lazy loading, Tailwind v4 configuration/optimization, bundle size considerations, heavy scripts.
6. Architecture: file structure, directory organization, routing patterns, database schema/migration design.

You must:
- Start by checking the GitNexus index. If it is stale or missing, run `npx gitnexus analyze --embeddings` to index/re-index the repository. Use GitNexus MCP tools (like query, context, impact) or read MCP resources (processes, clusters, schema) to navigate the codebase semantics instead of simple text greps.
- Identify at least two specific findings per area. Each finding must be tied to actual files, directories, or code patterns in the repository.
- Provide highly actionable recommendations (e.g. "Refactor X in file Y because Z") rather than generic advice.
- Do NOT build, install, or run the app. Use static analysis only.
- Write your progress heartbeat in `progress.md` under your working directory `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_review\`.
- Write your final detailed report to `D:\DEV\projects\SITE MAPS NZAMY (1)\SITE MAPS NZAMY\nzamy-website\.agents\explorer_review\handoff.md`.
- Send a message back to me (the orchestrator parent) with the path to your handoff file when you are finished.
