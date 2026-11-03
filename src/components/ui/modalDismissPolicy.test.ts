import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideDismiss, nextFocusIndex } from "./modalDismissPolicy.ts";

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("CODE-F34: no exit while a save is in flight; a changed draft asks first", () => {
  assert.equal(decideDismiss({ busy: true, dirty: true }), "block");
  assert.equal(decideDismiss({ busy: true, dirty: false }), "block");
  assert.equal(decideDismiss({ busy: false, dirty: true }), "confirm");
  assert.equal(decideDismiss({ busy: false, dirty: false }), "close");
});

test("the focus trap wraps at both ends and starts at the right end", () => {
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(1, 3, false), 2);
  assert.equal(nextFocusIndex(-1, 3, false), 0);
  assert.equal(nextFocusIndex(-1, 3, true), 2);
  assert.equal(nextFocusIndex(0, 0, false), -1);
});

test("LIVE-F29: ModalShell is a named dialog with a named close, Escape, trap and focus return", () => {
  const src = read("components/ui/ModalShell.tsx");
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /aria-labelledby=\{titleId\}/);
  assert.match(src, /aria-label="إغلاق"/);
  assert.match(src, /e\.key === "Escape"[\s\S]*?requestClose\("escape"\)/);
  assert.match(src, /e\.key !== "Tab"/);
  assert.match(src, /opener\.focus\(\)/);
  // every exit goes through the one policy
  assert.match(src, /requestClose\("backdrop"\)/);
  assert.match(src, /requestClose\("close_button"\)/);
  assert.match(src, /decideDismiss\(/);
});
