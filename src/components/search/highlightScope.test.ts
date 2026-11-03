/**
 * BUG-LIB-01 (S1 Task 7): principles are coloured only near the viewport.
 * The pure step helper is tested directly; the React side is pinned by source
 * (the components need a DOM).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stepPrincipleIndex } from "./highlightScope.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const HL = read("./MultiColorHighlight.tsx");
const HOOK = read("../../hooks/useNearViewport.ts");
const BLOCK = read("../../app/precedents/[slug]/_principle-block.tsx");
const PAGE = read("../../app/precedents/[slug]/page.tsx");

test("stepPrincipleIndex walks the matching principles and wraps at both ends", () => {
  assert.equal(stepPrincipleIndex([2, 5, 9], 5, 1), 9);
  assert.equal(stepPrincipleIndex([2, 5, 9], 9, 1), 2);
  assert.equal(stepPrincipleIndex([2, 5, 9], 2, -1), 9);
  assert.equal(stepPrincipleIndex([2, 5, 9], 5, -1), 2);
  assert.equal(stepPrincipleIndex([], 0, 1), null);
  // From a principle that does not match: the next / previous match after it.
  assert.equal(stepPrincipleIndex([2, 5, 9], 6, 1), 9);
  assert.equal(stepPrincipleIndex([2, 5, 9], 6, -1), 5);
  assert.equal(stepPrincipleIndex([2, 5, 9], -1, 1), 2);
  assert.equal(stepPrincipleIndex([2, 5, 9], 10, 1), 2);
  assert.equal(stepPrincipleIndex([2, 5, 9], 0, -1), 9);
  assert.equal(stepPrincipleIndex([4], 4, 1), 4);
});

test("Hl renders plain text when its HighlightScope is inactive; the default scope is active", () => {
  // No HighlightScope above (the law reader, the book reader, ScopedSearchPanel): unchanged.
  assert.match(HL, /const HighlightScopeContext = createContext<boolean>\(true\);/);
  assert.match(HL, /export function HighlightScope\(\{ active, children \}: \{ active: boolean; children: ReactNode \}\)/);
  assert.match(HL, /const inScope = useContext\(HighlightScopeContext\);/);
  assert.match(HL, /if \(!inScope\) return <>\{text \?\? ""\}<\/>;/);
});

test("SearchLegendBar: counts override the DOM recount; onStep handles ↑/↓ when it returns true", () => {
  assert.match(HL, /counts\?: readonly number\[\];/);
  assert.match(HL, /onStep\?: \(dir: 1 \| -1, term: number \| null\) => boolean;/);
  assert.match(HL, /const shown = countsProp \?\? counts;/);
  // The MutationObserver recount is skipped when the counts are given.
  assert.match(HL, /if \(countsGiven \|\| !root \|\| terms\.length === 0\) return;/);
  assert.match(HL, /if \(onStep\?\.\(step, focus\)\) return;/);
  // Without the new props the bar still counts and walks the rendered marks.
  assert.match(HL, /new MutationObserver\(recount\)/);
  assert.match(HL, /const marks = marksIn\(rootRef\?\.current \?\? null, focus\);/);
});

test("useNearViewport: true without IntersectionObserver, 800px margin by default", () => {
  assert.match(HOOK, /export function useNearViewport\(ref: RefObject<Element \| null>, rootMargin = "800px 0px"\): boolean/);
  assert.match(HOOK, /typeof IntersectionObserver === "undefined"/);
});

test("the principle block colours only near the viewport; the page counts every loaded principle", () => {
  assert.match(BLOCK, /const nearViewport = useNearViewport\(cardRef\);/);
  assert.match(BLOCK, /<HighlightScope active=\{nearViewport\}>/);
  assert.match(BLOCK, /ref=\{cardRef\}/);
  assert.match(PAGE, /countTermMatches\(/);
  assert.match(PAGE, /stepPrincipleIndex\(/);
  assert.match(PAGE, /counts=\{legendCounts\}/);
  assert.match(PAGE, /onStep=\{stepToMatch\}/);
});
