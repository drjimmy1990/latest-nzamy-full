/**
 * CI hook for tests/circuits-directory.test.mjs. `npm run test:unit` runs only
 * the test files under src/, so the directory checks — 2,192 entries, the
 * owner's 52 corrected addresses in Latin digits (Q4), the 36 once-flagged
 * adopted by his answer ١٩٢ — never ran in CI, and a parser re-run could undo the corrections
 * unnoticed. Importing the file registers its tests in this run.
 */
import "../../tests/circuits-directory.test.mjs";
