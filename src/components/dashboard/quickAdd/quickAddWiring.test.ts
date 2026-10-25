/**
 * Source pins for the quick-add wiring (a .tsx cannot load under node --test,
 * the repo's convention): both dashboards mount the provider, the sidebar
 * carries the item, and the menu stays keyboard- and screen-reader reachable.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the lawyer and firm layouts mount QuickAddProvider; the firm passes the SESSION role", () => {
  assert.match(read("app/dashboard/lawyer/layout.tsx"), /<QuickAddProvider scope="lawyer">/);
  const firm = read("app/dashboard/firm/layout.tsx");
  assert.match(firm, /<QuickAddProvider scope="firm" firmRole=\{sessionRole\} canAddCase=\{sessionRoleConfig\.can\.addNewCase\}>/);
});

test("the shared sidebar renders the quick-add item, closing the mobile drawer first", () => {
  assert.match(read("components/dashboard/SharedSidebar.tsx"), /<QuickAddSidebarItem onBeforeOpen=\{\(\) => setMobileOpen\(false\)\} \/>/);
});

test("the menu is a labelled ARIA menu with the shortcut announced, and every item has a modal", () => {
  const src = read("components/dashboard/quickAdd/QuickAdd.tsx");
  assert.match(src, /role="menu"/);
  assert.match(src, /role="menuitem"/);
  assert.match(src, /aria-keyshortcuts=\{QUICK_ADD_ARIA_SHORTCUT\}/);
  assert.match(src, /aria-haspopup="menu"/);
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /const MODALS: Record<QuickAddItemId, \(\) => ReactNode>/);
  assert.match(src, /fixed \$\{side\} z-40/, "the button stays below every modal (z-60 and up)");
});
