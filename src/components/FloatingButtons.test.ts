import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * FloatingButtons.tsx is a "use client" module that imports framer-motion and
 * @phosphor-icons, so `node --test` cannot load it. As in
 * src/lib/services/fabSuppression.test.ts, the predicate is restated here
 * character for character and the first test asserts the source still holds it.
 */
const REPORT_FAB_SUPPRESSED_PREFIXES = ["/laws"] as const;
const REPORT_FAB_KEPT_PREFIXES = ["/laws/orders"] as const;

function isReportFabSuppressedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  const under = (p: string) => pathname === p || pathname.startsWith(p + "/");
  if (REPORT_FAB_KEPT_PREFIXES.some(under)) return false;
  return REPORT_FAB_SUPPRESSED_PREFIXES.some(under);
}

const SRC = "src/components/FloatingButtons.tsx";

test("the copy here still matches the source of truth", async () => {
  const src = await readFile(SRC, "utf8");
  assert.ok(
    src.includes('const REPORT_FAB_SUPPRESSED_PREFIXES = ["/laws"] as const;') &&
      src.includes('const REPORT_FAB_KEPT_PREFIXES = ["/laws/orders"] as const;'),
    "the report-FAB prefix lists in FloatingButtons.tsx changed — update this file with them",
  );
});

test("the law reader has no orange report FAB (it has its own in-page button)", () => {
  assert.equal(isReportFabSuppressedPath("/laws/labor-law"), true);
  assert.equal(isReportFabSuppressedPath("/laws"), true);
});

test("royal orders keep the report FAB (their page has no in-page button)", () => {
  assert.equal(isReportFabSuppressedPath("/laws/orders/royal-order-1"), false);
  assert.equal(isReportFabSuppressedPath("/laws/orders"), false);
});

test("pages without an in-page report control keep the FAB", () => {
  assert.equal(isReportFabSuppressedPath("/precedents/judgment/123"), false);
  assert.equal(isReportFabSuppressedPath("/precedents/some-principle"), false);
  assert.equal(isReportFabSuppressedPath("/book/some-book"), false);
  assert.equal(isReportFabSuppressedPath("/lawsuits"), false);
  assert.equal(isReportFabSuppressedPath(null), false);
});

test("the report config is never derived for a /laws path", async () => {
  const src = await readFile(SRC, "utf8");
  assert.ok(
    src.includes("isItemDetail && !isReportFabSuppressedPath(pathname)"),
    "reportConfig derivation no longer checks the law-reader suppression",
  );
  assert.ok(!src.includes('pageType: "law" }'), "a /laws reportConfig branch is back");
});

test("both FAB containers use the safe-area bottom offset, not the old phone lift", async () => {
  const src = await readFile(SRC, "utf8");
  assert.ok(
    src.includes('bottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))"'),
    "the safe-area bottom offset is gone",
  );
  assert.equal((src.match(/style=\{FAB_BOTTOM_STYLE\}/g) ?? []).length, 2);
  assert.ok(!src.includes("bottom-20 md:bottom-6"), "the old bottom-20 phone lift is back");
});
