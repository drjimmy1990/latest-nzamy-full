/**
 * platformShortcut.test.ts — owner UX17 (2026-10-30): the search hint printed
 * «⌘ K» in a Windows session.
 *
 * Run: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/nav/platformShortcut.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SERVER_SHORTCUT_MODIFIER, platformOf, shortcutModifierFor } from "./platformShortcut.ts";

test("Windows, Linux, Android and ChromeOS print Ctrl; Apple platforms print ⌘", () => {
  for (const p of ["Win32", "Windows", "Linux x86_64", "Android", "CrOS", "", null, undefined]) {
    assert.equal(shortcutModifierFor(p), "Ctrl", String(p));
  }
  for (const p of ["MacIntel", "macOS", "iPhone", "iPad", "iPod"]) {
    assert.equal(shortcutModifierFor(p), "⌘", p);
  }
});

test("the platform string prefers userAgentData, then platform, then the UA", () => {
  assert.equal(platformOf({ userAgentData: { platform: "Windows" }, platform: "MacIntel" }), "Windows");
  assert.equal(platformOf({ platform: "Win32", userAgent: "Mac" }), "Win32");
  assert.equal(platformOf({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)" }), "Mozilla/5.0 (Macintosh; Intel Mac OS X)");
  assert.equal(platformOf(null), "");
});

test("the server paints Ctrl, and the sidebar search no longer hard-codes ⌘", () => {
  assert.equal(SERVER_SHORTCUT_MODIFIER, "Ctrl");
  const src = readFileSync(new URL("../../components/dashboard/GlobalSearch.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(src, /<span>⌘<\/span>/);
  assert.match(src, /<kbd dir="ltr"[^>]*>\s*<span>\{shortcutModifier\}<\/span><span>K<\/span>/);
  // The handler still takes both, so the hint can never promise a key that does nothing.
  assert.match(src, /\(e\.ctrlKey \|\| e\.metaKey\) && e\.key === "k"/);
});
