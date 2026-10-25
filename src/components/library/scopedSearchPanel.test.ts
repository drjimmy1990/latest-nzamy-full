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

test("the book reader has the draft cart: the shared hook, the drawer, and «add» only for a block it may read", () => {
  assert.match(BOOK, /const \{ cart, setCart, saveError, clearSaveError \} = useDraftCart\(\);/);
  assert.match(BOOK, /<DraftDrawer cart=\{cart\} onRemoveArticle=\{removeFromCart\} onClearAll=\{clearCart\}/);
  assert.match(BOOK, /\{activeBlock && !activeBlock\.locked && \(/);
  assert.match(BOOK, /addEntryToCart\(blockCartEntry\(/);
  assert.match(BOOK, /role="alert"/);
});
