import test from "node:test";
import assert from "node:assert/strict";
import { DRAFT_FAB_SCROLL_THRESHOLD, FAB_EDGE_ZONE, draftFabVisible, nextFabHidden } from "./draftFab.ts";

test("L2: on a reader with a header «المسودة» button the floating one shows past 300 px only", () => {
  const base = { cartCount: 2, isItemDetail: true, headerHasDraftButton: true };
  assert.equal(DRAFT_FAB_SCROLL_THRESHOLD, 300);
  assert.equal(draftFabVisible({ ...base, scrollY: 0 }), false, "hidden at the header");
  assert.equal(draftFabVisible({ ...base, scrollY: 300 }), false);
  assert.equal(draftFabVisible({ ...base, scrollY: 301 }), true);
  assert.equal(draftFabVisible({ ...base, scrollY: 5000, cartCount: 0 }), false, "nothing to open");
  assert.equal(draftFabVisible({ ...base, scrollY: 5000, isItemDetail: false }), false, "library pages only");
  assert.equal(draftFabVisible({ ...base, headerHasDraftButton: false, scrollY: 0 }), true, "the judgment page keeps it always");
});

test("New 1: hide while reading down, show on a scroll up, at the top and at the end", () => {
  const max = 10_000;
  assert.equal(nextFabHidden(false, 1000, 1100, max), true, "scrolling down hides");
  assert.equal(nextFabHidden(true, 1100, 1000, max), false, "scrolling up shows");
  assert.equal(nextFabHidden(true, 1000, 1003, max), true, "jitter changes nothing");
  assert.equal(nextFabHidden(false, 1003, 1000, max), false, "jitter changes nothing");
  assert.equal(nextFabHidden(true, 200, 100, max), false, "near the top");
  assert.equal(nextFabHidden(true, FAB_EDGE_ZONE + 50, FAB_EDGE_ZONE + 200, max), true);
  assert.equal(nextFabHidden(true, max - 300, max - 10, max), false, "at the end of the page");
  assert.equal(nextFabHidden(true, 500, 600, 0), true, "a page with no scroll range: direction only");
});

// ── source pins (the components are "use client" + icon modules; node cannot load them) ──
import { readFileSync } from "node:fs";
import { join } from "node:path";
const SRC = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("New 1: below lg the marked floating buttons fade while scrolling down; the reader column has room", () => {
  const css = read("app/globals.css");
  assert.match(css, /@media \(max-width: 1023\.98px\) \{[\s\S]*html\[data-fab-scroll="down"\] \[data-fab-autohide\] \{[\s\S]*visibility: hidden;[\s\S]*pointer-events: none;/);
  assert.match(css, /\.nzamy-reader-container \{ padding-bottom: 6rem; \}/);
  // every floating button of the reader carries the mark
  assert.ok(read("components/ResearchWorkspace.tsx").includes('data-fab-autohide=""'), "the phone tools stack");
  assert.equal((read("app/laws/[slug]/page.tsx").match(/data-fab-autohide=""/g) ?? []).length, 2, "index + scroll-to-top");
  assert.ok(read("hooks/useFabScroll.ts").includes("root.dataset.fabScroll = hidden ? \"down\" : \"up\";"));
});

test("New 2: no «+» / «−» on the library readers' add-to-draft buttons; bookmark, then a check", () => {
  const icon = read("components/draft/DraftToggleIcon.tsx");
  assert.match(icon, /inDraft \? <Check [^>]*\/> : <BookmarkSimple /);
  assert.ok(icon.includes('"أضف للمسودة"'));
  for (const p of [
    "app/laws/[slug]/_article-components.tsx",
    "app/laws/[slug]/_ref-box.tsx",
    "components/library/ScopedSearchPanel.tsx",
    "app/laws/orders/[slug]/page.tsx",
    "app/precedents/[slug]/_principle-block.tsx",
    "app/book/[slug]/_stream-block.tsx",
  ]) {
    const src = read(p);
    assert.doesNotMatch(src, /<Plus size=/, `${p}: a «+» is back`);
    assert.doesNotMatch(src, /<Minus size=/, `${p}: a «−» is back`);
  }
});
