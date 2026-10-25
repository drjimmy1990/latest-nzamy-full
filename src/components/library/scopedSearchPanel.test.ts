/**
 * N2.6 — the in-document search panel in its three readers, and the draft
 * cart in the book reader. Source pins (the readers need a live library).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(path.join(here, rel), "utf8").replace(/\r\n/g, "\n");
const PANEL = read("ScopedSearchPanel.tsx");
const LAW = read("../../app/laws/[slug]/page.tsx");
const COLLECTION = read("../../app/precedents/[slug]/page.tsx");
const BOOK = read("../../app/book/[slug]/page.tsx");
const FLOATING = read("../FloatingButtons.tsx");
const HOOK = read("../../hooks/useDraftCart.ts");

test("the panel posts to the scoped route, renders text as text, and gives locked hits no copy or draft", () => {
  assert.match(PANEL, /fetch\("\/api\/library\/scoped-search", \{\s*method: "POST"/);
  assert.doesNotMatch(PANEL, /dangerouslySetInnerHTML/);
  assert.match(PANEL, /<mark key=\{i\}/);
  // the copy / draft buttons live only in the unlocked branch
  const lockedBranch = PANEL.slice(PANEL.indexOf("{hit.locked ? ("), PANEL.indexOf(") : (\n                    <div className=\"flex flex-wrap gap-1.5\">"));
  assert.ok(lockedBranch.length > 0);
  assert.doesNotMatch(lockedBranch, /نسخ النص بالتوثيق|إضافة لمسودة التجميع/);
  assert.match(PANEL, /📋 نسخ النص بالتوثيق/);
  assert.match(PANEL, /إضافة لمسودة التجميع/);
  assert.match(PANEL, /role="status" aria-live="polite"/);
  assert.match(PANEL, /maxLength=\{300\}/);
});

test("each reader mounts the panel on its own document, keyed so a new volume starts over", () => {
  assert.match(LAW, /<ScopedSearchPanel\s+key=\{`law:\$\{law\.slug \|\| slug\}`\}\s+scope=\{`law:\$\{law\.slug \|\| decodeURIComponent\(apiSlug\(slug\)\)\}`\}/);
  assert.match(COLLECTION, /<ScopedSearchPanel\s+key=\{`collection:\$\{collection\.id\}`\}\s+scope=\{`collection:\$\{collection\.id\}`\}/);
  assert.match(COLLECTION, /volumeCount=\{collection\.series\?\.volumes\.length \?\? 1\}/);
  assert.match(BOOK, /<ScopedSearchPanel\s+key=\{`book:\$\{book\.id\}`\}\s+scope=\{`book:\$\{book\.id\}`\}/);
  assert.match(BOOK, /volumeCount=\{series\?\.volumes\.length \?\? 1\}/);
  for (const page of [LAW, COLLECTION, BOOK]) assert.match(page, /onAddToDraft=\{/);
});

test("the book reader has the draft cart: the shared hook, the global drawer, and «add» only for a block it may read", () => {
  assert.match(BOOK, /const \{ cart, setCart \} = useDraftCart\(\);/);
  // The drawer and the save-error notice are FloatingButtons' (one shared
  // store): the page opens that drawer instead of mounting a second copy.
  assert.match(BOOK, /window\.dispatchEvent\(new Event\("nzamy-open-cart"\)\)/);
  assert.doesNotMatch(BOOK, /<DraftDrawer/);
  assert.match(FLOATING, /window\.addEventListener\("nzamy-open-cart", handler\)/);
  assert.match(FLOATING, /if \(pathname\.startsWith\("\/book\/"\)\) \{/);
  assert.match(BOOK, /\{activeBlock && !activeBlock\.locked && \(/);
  assert.match(BOOK, /addEntryToCart\(blockCartEntry\(/);
});

test("every cart caller shares one store (the FAB and the readers cannot diverge)", () => {
  assert.match(HOOK, /useSyncExternalStore\(subscribe, getSnapshot, getServerSnapshot\)/);
  assert.match(HOOK, /let store: DraftCartStore \| null = null;/);
  assert.doesNotMatch(HOOK, /useState</);
});

test("the panel is labelled apart from each reader's own box; «more» stops at the depth the route accepts", () => {
  assert.match(PANEL, /\{scopedPanelTitle\(scope, volumeCount\)\}/);
  assert.match(PANEL, /role="group" aria-label="معاملات البحث"/);
  assert.match(COLLECTION, /تصفية المبادئ المعروضة في هذا المجلد/);
  const ROUTE = read("../../app/api/library/scoped-search/route.ts");
  assert.match(ROUTE, /hasMore: from \+ rows\.length < count && \(req\.page \+ 1\) \* req\.limit <= SCOPED_MAX_DEPTH,/);
});

test("one save-error notice per tab: FloatingButtons shows the shared saveError; no reader renders a second", () => {
  assert.match(FLOATING, /\{saveError && \(/);
  const ORDERS = read("../../app/laws/orders/[slug]/page.tsx");
  for (const [name, page] of [["law", LAW], ["collection", COLLECTION], ["book", BOOK], ["orders", ORDERS]] as const) {
    assert.doesNotMatch(page, /\{saveError && \(/, `${name} reader renders its own save-error toast`);
    assert.doesNotMatch(page, /clearSaveError/, `${name} reader reads clearSaveError`);
  }
});
