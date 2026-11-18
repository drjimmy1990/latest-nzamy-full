/**
 * arabic-errors.test.ts — N05-L11 / L12 (owner, 13-Nov package, F-35 / F-36):
 * the library routes answer the reader in Arabic, and the locked-text notice
 * names the library subscription, not the English word "Pro".
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (rel: string) => readFileSync(join(import.meta.dirname, rel), "utf8");

const ROUTES = ["folders/route.ts", "folders/items/route.ts", "folders/titles/route.ts", "decrees/[id]/route.ts"];

test("folders and decree routes: every error string a reader can see is Arabic", () => {
  for (const rel of ROUTES) {
    const source = read(rel);
    const literals = [...source.matchAll(/NextResponse\.json\(\{ error: '([^']*)'/g)].map((m) => m[1]);
    assert.ok(literals.length > 0, rel);
    for (const text of literals) assert.match(text, /[؀-ۿ]/, `${rel}: "${text}"`);
  }
});

test("the locked-text notice names the library subscription, never 'Pro'", () => {
  const law = read("laws/[slug]/route.ts");
  const precedent = read("precedents/[slug]/route.ts");
  const block = read("../../precedents/[slug]/_principle-block.tsx");
  assert.match(law, /result\.lockedMessage = '[^']*باقة المكتبة القانونية[^']*';/);
  // Batch l8-libguard: a ruling's own message, a principle's as before — both name the library plan.
  assert.match(precedent, /lockedMessage: isLocked\s*\? \(isRuling\s*\? '[^']*المكتبة القانونية[^']*'\s*: '[^']*باقة المكتبة القانونية[^']*'\)/);
  for (const source of [law, precedent]) assert.doesNotMatch(source, /lockedMessage[^\n]*Pro/);
  assert.match(block, /const DEFAULT_LOCKED_MESSAGE = "[^"]*المكتبة القانونية[^"]*";/);
  assert.doesNotMatch(block, /DEFAULT_LOCKED_MESSAGE = "[^"]*Pro/);
});
