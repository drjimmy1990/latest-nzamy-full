/**
 * Owner note ٠٧ — one shared circuits directory. Source pins (the component
 * needs a browser); the filter itself is tested in
 * src/lib/search/circuitsDirectoryFilter.test.ts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const DIR = read("./CircuitsDirectory.tsx");
const FIRM = read("../../app/dashboard/firm/circuits-emails/page.tsx");
const BUSINESS = read("../../app/dashboard/business/circuits-emails/page.tsx");

test("both dashboard pages render the one shared component, not their own copy", () => {
  for (const [name, page] of [["firm", FIRM], ["business", BUSINESS]] as const) {
    assert.match(page, /import \{ CircuitsDirectory, type CircuitRecord \} from "@\/components\/directory\/CircuitsDirectory";/, name);
    assert.match(page, /<CircuitsDirectory\s/, name);
    assert.doesNotMatch(page, /\.toLowerCase\(\)\.includes\(q\)/, `${name}: the old single-field filter is gone`);
    assert.doesNotMatch(page, /CaretLeft|CaretRight|currentPage/, `${name}: no arrow pagination`);
  }
  assert.match(FIRM, /showCategoryFilter\s+showVerificationFilter/);
});

test("the business page keeps its plan gate", () => {
  assert.match(BUSINESS, /<SubscriptionGuard featureKey="business-litigation">/);
});

test("cross-field operator search, multi-colour highlight, legend, infinite scroll, copy", () => {
  assert.match(DIR, /filterCircuits\(circuits, \{ query, region, category, verification \}\)/);
  assert.match(DIR, /<HighlightProvider query=\{query\}>/);
  // The provider's wrapper is display:contents: the list spacing lives inside it.
  assert.match(DIR, /<HighlightProvider query=\{query\}>[\s\S]{0,200}<div className="space-y-4">/);
  assert.match(DIR, /<SearchLegendBar onClear=\{\(\) => setSearch\(""\)\} partial=\{hasMore\} \/>/);
  for (const field of ["circuit.name", "circuit.category", "circuit.region", "circuit.city", "circuit.email"]) {
    assert.match(DIR, new RegExp(`<Hl text=\\{${field.replace(".", "\\.")}\\} />`), field);
  }
  assert.match(DIR, /new IntersectionObserver\(/);
  assert.match(DIR, /ref=\{sentinelRef\}/);
  assert.match(DIR, /تحميل المزيد/);
  assert.match(DIR, /copyToClipboard\(circuit\.email\)/);
  assert.doesNotMatch(DIR, /dangerouslySetInnerHTML/);
});
