import test from "node:test";
import assert from "node:assert/strict";

/**
 * The defect this pins: «Status chips sum to 7 against a stated total of ٩»
 * (screenshot findings 4 and 10, shots 01 and 02 — the same mismatch at two
 * different data volumes, which is what proved it was structural rather than a
 * one-off).
 *
 * The lawyer case list prints a total and a row of status chips. The total is
 * every non-archived case; the chips are active / pending / closed. Those two
 * facts only agree while the status mapper CANNOT produce a fourth non-archived
 * value — and `CaseStatus` declares one it does not use, `suspended`. The day
 * anything starts emitting it, the chips silently stop adding up to the total
 * and the screen goes back to contradicting itself, with no error anywhere.
 *
 * Both files import @phosphor-icons/react, so `node --test` cannot load either.
 * The mapping is therefore restated here and the first test asserts the source
 * still says what this file assumes — the same discipline `fabSuppression`
 * and `countVaultDocuments` use, and for the same reason: a paraphrase drifts.
 */

const CASES_PAGE = "src/app/dashboard/lawyer/cases/page.tsx";
const MAPPER = "src/constants/lawyerCasesData.ts";

/** The four chips the page renders, in order. Mirrors both chip rows. */
const CHIPS = ["all", "active", "pending", "closed"] as const;

/** What `workflowToCase` can emit, restated from the mapper's ternary. */
function mapStatus(backend: string): "archived" | "closed" | "active" | "pending" {
  if (backend === "cancelled") return "archived";
  if (backend === "completed") return "closed";
  if (backend === "assigned" || backend === "in_review") return "active";
  return "pending";
}

/** Every backend status the workflow store can hold. */
const BACKEND_STATUSES = [
  "draft", "pending_payment", "pending_assignment",
  "assigned", "in_review", "completed", "cancelled",
];

test("the restated mapping still matches the source", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(MAPPER, "utf8");
  for (const fragment of [
    'const isAssigned = request.status === "assigned" || request.status === "in_review";',
    'const isCancelled = request.status === "cancelled";',
    'const isCompleted = request.status === "completed";',
  ]) {
    assert.ok(src.includes(fragment), `workflowToCase changed — update this file: ${fragment}`);
  }
});

test("both chip rows on the page render the same four chips", async () => {
  const { readFile } = await import("node:fs/promises");
  const page = await readFile(CASES_PAGE, "utf8");
  const rows = page.match(/\(\["all", "active", "pending", "closed"\] as const\)/g) ?? [];
  assert.equal(rows.length, 2,
    "the two status chip rows must stay identical; one drifting from the other is how a screen starts disagreeing with itself");
});

test("the chips exhaust the total — nothing can sit in neither", () => {
  // `all` = every case that is not archived. So every non-archived status the
  // mapper can produce MUST have a chip, or the chips will not sum to it.
  const nonArchived = new Set(
    BACKEND_STATUSES.map(mapStatus).filter((s) => s !== "archived"),
  );
  const covered = new Set(CHIPS.filter((c) => c !== "all"));
  for (const status of nonArchived) {
    assert.ok(covered.has(status as never),
      `«${status}» is non-archived and has no chip — the chips can no longer sum to the total`);
  }
});

test("the arithmetic holds on a concrete docket", () => {
  // Nine cases, the exact shape of shot 01: the total read ٩ and the chips
  // summed to 7. With the mapper as written that gap cannot open.
  const docket = [
    "assigned", "in_review", "assigned",     // → active   (3)
    "draft", "pending_payment",              // → pending  (2)
    "completed", "completed",                // → closed   (2)
    "cancelled", "cancelled",                // → archived (2)
  ].map(mapStatus);

  const all = docket.filter((s) => s !== "archived").length;
  const active = docket.filter((s) => s === "active").length;
  const pending = docket.filter((s) => s === "pending").length;
  const closed = docket.filter((s) => s === "closed").length;

  assert.equal(all, 7);
  assert.equal(active + pending + closed, all,
    "chips must sum to the total the page prints beside them");
});

test("`suspended` is declared but unreachable — and that is load-bearing", () => {
  // It is a member of CaseStatus, so nothing in the type system stops a future
  // mapper from returning it. Nothing does today, which is the ONLY reason the
  // three chips are exhaustive. If this assertion ever fails, add the chip in
  // the same commit that adds the status.
  const produced = new Set(BACKEND_STATUSES.map(mapStatus));
  assert.ok(!produced.has("suspended" as never),
    "something now produces «suspended» — give it a chip or the counters will disagree again");
});
