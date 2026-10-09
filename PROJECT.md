# Project: NZAMY Library, Reader & Calculator Fixes (R1, R2, R3)

## Architecture
This project implements the non-database UI/UX, reader formatting, calculator logic, and schema contract fixes provided in the owner delivery package (`C:\Users\LOQ\Downloads\حزمة_تسليم_المبرمج_محدثة_2026-10-09`) on the `owner-edits` branch of `nzamy-website`.

The system consists of:
1. **Library & Search UI (`src/app/laws/`)**:
   - Law search debouncing, state management (`searchLoading`, `resultsPending`), skeleton shimmer placeholders, and empty state gating.
   - Left sidebar layout hosting `<LegislativeUpdates />` and `<EnactmentCountdownWidget />`.
   - Repealed law cards without strikethrough (`line-through`), displaying explicit status badges (`⛔ ملغى وغير سارٍ`).
   - Compact display density rules in `src/app/globals.css`.
2. **Legal Reader (`src/app/laws/[slug]/`)**:
   - Markdown parsing of articles (`_article-components.tsx`), preserving numbered items (`_numbered-item.ts`) with tabular digits.
   - Collapsible `<details>` for amended articles (`AmendedToggleDetails`) with amber badges (`✏️ معدَّلة`).
   - Fixed header compensation via `READER_SCROLL_MARGIN_TOP` and TOC anchor identifiers (`regview-X-Y`).
3. **Calculators (`src/components/calculators/`)**:
   - `judicialCosts.ts`: Pure mathematical court fee calculation enforcing statutory caps (Article 3 of Court Costs Law & Owner Decision #167): 5% capped at 1,000,000 SAR for first-instance courts; 10,000 SAR for appeal courts.
   - `CalcCourtFees.tsx`: Interactive court fee calculator interface.
4. **Schema Contracts (`scripts/parsers/`)**:
   - `schema_manifest.json`: Specification manifest defining parser schemas and lifecycle enums, with zero duplicate object keys.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Repealed Law Strikethrough Elimination | Remove CSS `line-through` from repealed laws in `_article-components.tsx` and `_sidebar.tsx`; use status badges and containers | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Search Empty State Guard & Skeletons | Prevent premature "no results" flash by requiring `!isLoading && hasSearched && results.length === 0`, displaying animated skeletons while loading | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Countdown Widget Relocation | Move `EnactmentCountdownWidget` to left sidebar under `LegislativeUpdates` | M1 | ORIGINAL_REQUEST §R1 |
| 4 | Sidebar Zoom Removal & 75% CSS Density | Ensure sidebar zoom buttons are removed and clean CSS anti-compounding rules apply for 75% density | M1 | ORIGINAL_REQUEST §R1 |
| 5 | Sublegislation TOC Anchor Offsets | Ensure anchor IDs and `scroll-margin-top` prevent fixed header occlusion during TOC navigation | M2 | ORIGINAL_REQUEST §R2 |
| 6 | Legal Reader Clause Numbering | Preserve and display clause numbers ("1.", "2.", "3.") and escaped backslashes via `_numbered-item.ts` (Patch 20) | M2 | ORIGINAL_REQUEST §R2 |
| 7 | Court Fee Statutory Caps | Enforce 1,000,000 SAR first-instance cap and 10,000 SAR appeal cap in `judicialCosts.ts` and test assertions | M2 | ORIGINAL_REQUEST §R2 |
| 8 | Amended Articles Collapsible Details | Display amber badge `✏️ معدَّلة` and collapsible `<details>` toggle for historical amendment notices without regular article corruption | M2 | ORIGINAL_REQUEST §R2 |
| 9 | Schema Manifest Duplicate Key Removal | Eliminate duplicate keys (`law_lifecycle_status`, `superseded_by`) in `schema_manifest.json` (Patch 01) | M3 | ORIGINAL_REQUEST §R3 |
| 10 | Branch & Database Safety | Strictly work on `owner-edits`; zero destructive DB actions or unverified schema migrations | M3 | ORIGINAL_REQUEST §R3 |
| 11 | TypeScript Clean Compilation | Zero TypeScript errors (`npx tsc --noEmit` exits with 0) | M4 | ORIGINAL_REQUEST §R3 |
| 12 | Automated Unit & Integration Tests | 100% pass across all unit and E2E test suites (2,061+ tests) | M4 | ORIGINAL_REQUEST §R3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Visual Presentation & Library Search | R1: Strikethrough elimination, search empty-state guard & skeletons, countdown widget placement, 75% CSS | None | DONE (worker_m1: 8c4d5864-d7ba-45cc-8324-5bc828306633 - strikethrough eliminated, empty state guard & skeleton active, countdown relocated, 75% CSS active, 2068/2068 tests passed) |
| M2 | Reader Navigation, Clause Numbering & Court Fee Caps | R2: Sublegislation TOC anchors, clause numbering preservation (Patch 20), 1M SAR first-instance / 10k SAR appeal fee caps, amended `<details>` toggle | None | DONE (worker_m2: 48977f3d-a726-41be-a980-3c0320ac29ba - clause numbering, amended details, court fee caps verified, 2068/2068 tests passed) |
| M3 | Parser Schema Manifest & Contract Integrity | R3: Remove duplicate keys from `schema_manifest.json` (Patch 01), JSON lint conformity | None | DONE (worker_m3: 8de1d1bb-c7f8-42d3-a026-b083d83f6a0c - 0 duplicate keys, SHA256 verified, contract passed) |
| M4 | Final Milestone: Full Integration, E2E Verification & TypeCheck | Full suite test execution, `tsc --noEmit`, regression verification, challenger stress tests, forensic audit | M1, M2, M3 | DONE (Gate PASS: 2 Reviewers APPROVE, 2 Challengers APPROVE, Forensic Auditor CLEAN, 68/68 acceptance tests, 2,068 unit tests, 0 TS errors) |

## Interface Contracts
### `src/components/calculators/judicialCosts.ts`
- `export const FIRST_INSTANCE_COST_CAP_SAR = 1_000_000;`
- `export const APPEAL_COST_CAP_SAR = 10_000;`
- `estimateJudicialCosts(input: JudicialCostsInput): JudicialCostsResult | null`
  - When `claimAmountSar = 50_000_000` and `includeFirstInstance = true`, returns first-instance line with `amountSar: 1_000_000`, `capped: true`, and `totalSar: 1_000_000`.
  - When `claimAmountSar = 1_000_000` and `includeAppeal = true`, returns appeal line with `amountSar: 10_000`, `capped: true`.

### `src/app/laws/[slug]/_numbered-item.ts`
- `export interface NumberedItemMatch { number: string; text: string; }`
- `export function splitNumberedItem(line: string): NumberedItemMatch | null`
  - Matches `^([0-9]+|[٠-٩]+)\\?\.\s+` and returns isolated `{ number, text }`.
  - Returns `null` on lines that are not numbered items (e.g. `1.5 مليون`).

### `src/app/laws/[slug]/_article-components.tsx`
- Block `num-list-item` carries `number?: string`.
- Renders `<span className="tabular-nums font-bold ...">{block.number}.</span>`.
- Renders `<AmendedToggleDetails />` for amended article details without dropping unclosed blocks.
- Repealed articles render with red badge/border container without CSS `line-through`.

## Code Layout & Ownership
- **Milestone 1 (M1) Exclusive Ownership**:
  - `src/app/laws/page.tsx`
  - `src/app/laws/components/LawsTabContent.tsx`
  - `src/app/globals.css`
  - `src/app/laws/[slug]/_sidebar.tsx`
- **Milestone 2 (M2) Exclusive Ownership**:
  - `src/app/laws/[slug]/_numbered-item.ts` (new)
  - `src/app/laws/[slug]/_numbered-item.test.ts` (new)
  - `src/app/laws/[slug]/_article-components.tsx`
  - `src/app/laws/[slug]/_reader-anchors.ts`
  - `src/components/calculators/judicialCosts.ts`
  - `src/components/calculators/judicialCosts.test.ts`
  - `src/components/calculators/CalcCourtFees.tsx`
  - `src/app/ai/fee-calculator/page.tsx`
- **Milestone 3 (M3) Exclusive Ownership**:
  - `scripts/parsers/schema_manifest.json`
- **Milestone 4 / E2E Track Ownership**:
  - `tests/e2e/` (or dedicated test files)
  - `TEST_READY.md`
