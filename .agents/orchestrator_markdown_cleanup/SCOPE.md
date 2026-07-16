# Scope: Markdown Cleanup & Organization

## Architecture
- Root directory of `nzamy-website` repository.
- A new `OLD` directory at root (distinct from the existing lowercase `old`).
- Target Markdown files for archival and status updating.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Root Directory Cleanup | Create `OLD/` directory and move historical/obsolete files to it. | none | PLANNED |
| 2 | Documentation Index Update | Update `DOCUMENTATION_INDEX.md` with revised relative links and statuses. | M1 | PLANNED |
| 3 | Status & Roadmap Updates | Update `MASTER_PRIORITY_LIST_2026-07-16.md`, `REMAINING_WORK.md`, and `IMPLEMENTATION_STATUS.md` with recent milestones. | M2 | PLANNED |

## Interface Contracts
Not applicable (documentation-only task).

## Code Layout
- Root directory: active documentation files.
- `OLD/`: historical documentation files.
