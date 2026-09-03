<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **latest-nzamy-full** (12676 symbols, 23970 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/latest-nzamy-full/context` | Codebase overview, check index freshness |
| `gitnexus://repo/latest-nzamy-full/clusters` | All functional areas |
| `gitnexus://repo/latest-nzamy-full/processes` | All execution flows |
| `gitnexus://repo/latest-nzamy-full/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- owner-rules:start -->
# Owner Workflow Rules — نظامي Project

The project owner works exclusively on the `owner-edits` branch. You MUST enforce these rules in every session.

## Branch Rules — Always Do

- **MUST verify the active branch before any edit or commit.** Run `git branch` and confirm the `*` is on `owner-edits`. If not, switch: `git checkout owner-edits`.
- **MUST only commit to `owner-edits`** — never to `main` or any other branch.
- **MUST pull before starting a new session**: `git pull origin owner-edits`.
- **MUST use this exact push command**: `git push origin owner-edits`.
- When the owner says "save" or "upload changes", run:
  ```bash
  git add .
  git commit -m "<descriptive Arabic or English message>"
  git push origin owner-edits
  ```

## Branch Rules — Never Do

- NEVER commit or push to `main`.
- NEVER create new branches — the owner always works on `owner-edits`.
- NEVER run `library:clear` or `blog:clear` without an explicit, confirmed request — these wipe shared Supabase data for everyone.
- NEVER commit `.env.local` — it is git-ignored and must stay local.

## What the Owner Can Edit (Safe Zone)

| ✅ Owner may edit | ❌ Leave to developer |
|---|---|
| CSS / colors / fonts / layout | Database table additions |
| Page text and headings | API routes and server actions |
| Component order and structure | RLS policies and Supabase security |
| Blog content (`.md` files) | Payment and subscription setup |
| Images and icons | n8n automation config |

## Key File Map

| What to change | Path |
|---|---|
| Homepage | `src/app/page.tsx` |
| Blog pages | `src/app/blog/` |
| Legal library | `src/app/laws/` |
| Dashboard | `src/app/dashboard/` |
| Navbar | `src/components/Navbar.tsx` |
| Footer | `src/components/Footer.tsx` |
| Floating buttons | `src/components/FloatingButtons.tsx` |
| Global styles / colors | `src/app/globals.css` |
| Blog article content | `blog-toolkit/blog_final/` |

## Dev Server

```bash
npm run dev        # starts at http://localhost:3000 (or next available port)
# Ctrl+C           # stop the server
```

## Data Seeding Commands (safe to repeat — idempotent)

```bash
npm run library:status   # check how many library records exist
npm run library:seed     # seed the legal library
npm run blog:images      # upload blog images first
npm run blog:seed        # seed blog articles
```

## Collaboration Model

```
GitHub Repository
┌──────────────────────────────────────┐
│  main (developer) ──────► live site  │
│    ↑                                 │
│    │  developer merges when ready    │
│    │                                 │
│  owner-edits (owner) ◄── your edits  │
└──────────────────────────────────────┘
```

Owner edits → pushes to `owner-edits` → developer reviews → merges to `main` → goes live.

<!-- owner-rules:end -->
