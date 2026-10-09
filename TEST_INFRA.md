# E2E Test Infra: NZAMY Platform Quality & Acceptance Suite

## Test Philosophy
- Opaque-box, requirement-driven, derived directly from `ORIGINAL_REQUEST.md` and user-facing acceptance criteria.
- Complete coverage across R1, R2, R3 with systematic multi-tier testing:
  - Tier 1: Feature Coverage (happy path per feature in isolation)
  - Tier 2: Boundary & Corner Cases (statutory caps, unclosed tags, escaped characters)
  - Tier 3: Cross-Feature Combinations (search while loading, repealed laws in reader and TOC)
  - Tier 4: Real-World Application Scenarios (high-claim litigation court fees, full legislative reading)
  - Tier 5: Adversarial Hardening (white-box stress testing)

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | Repealed law line-through elimination | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Search loading guard & skeleton rendering | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | Countdown widget sidebar relocation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 4 | Sidebar zoom removal & 75% density | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 5 | Sublegislation TOC anchor offsets | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 6 | Legal reader clause numbering preservation | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 7 | Court fee statutory caps (1M first-instance, 10k appeal) | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 8 | Amended articles collapsible <details> | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 9 | Parser schema manifest duplicate key removal | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 10| TypeScript compile zero errors (`tsc --noEmit`) | ORIGINAL_REQUEST §R3 | 1 | 1 | ✓ |
| 11| Automated test runner pass rate (2061+ tests) | ORIGINAL_REQUEST §R3 | 1 | 1 | ✓ |

## Test Architecture
- Test Runner: Node.js test runner (`node --test`), TypeScript compiler (`npx tsc --noEmit`), and custom validation scripts.
- Scripts:
  - `npm run test:unit` (`node --test "src/**/*.test.ts"`)
  - `npm run type-check` (`tsc --noEmit`)
  - `node scripts/check-schema-manifest-drift.mjs`
- Test Files:
  - `src/components/calculators/judicialCosts.test.ts`
  - `src/app/laws/[slug]/_numbered-item.test.ts`
  - `src/app/laws/[slug]/_reader-anchors.test.ts`
  - Acceptance checks script / E2E verification test script

## Coverage Thresholds
- Tier 1: ≥5 tests per feature (where applicable)
- Tier 2: Boundary & corner cases for calculator limits, regex edge cases, and parsing
- Tier 3: Pairwise combinations of reader and search states
- Tier 4: Real-world acceptance scenarios confirming all acceptance criteria in `ORIGINAL_REQUEST.md`
