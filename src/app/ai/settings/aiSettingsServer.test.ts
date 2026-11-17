/**
 * N06-24: /ai/settings saved only to localStorage. It now saves to
 * PATCH /api/v1/settings/preferences (key aiInstructions) and keeps the
 * browser copy as a cache; «تم الحفظ» follows the server's answer, and the
 * page no longer pre-fills an invented persona as the user's own text.
 * Source-read (a .tsx page cannot load under node --test).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("the page loads from and saves to the server preferences", () => {
  assert.match(code, /getPreferences\(\)/);
  assert.match(code, /patchPreferences\(\{ aiInstructions: value \}\)/);
  assert.match(code, /readAiInstructions\(prefs\.aiInstructions\)/);
});

test("«تم الحفظ» is set only after the server save (an error returns first)", () => {
  const save = code.slice(code.indexOf("async function save()"));
  const patch = save.indexOf("patchPreferences(");
  const errorReturn = save.indexOf("return;", patch);
  const savedTrue = save.indexOf("setSaved(true)");
  assert.ok(patch > 0 && errorReturn > patch && savedTrue > errorReturn);
});

test("no invented persona or templates are pre-filled", () => {
  assert.doesNotMatch(code, /useState\("أنا محامٍ/);
  assert.doesNotMatch(code, /مذكرة دفاعية عمالية/);
  assert.match(code, /AI_INSTRUCTIONS_DEFAULT\.instructions/);
});
