/**
 * _access.test.ts — the links box's text preview is never looser than the
 * reader: principles and fiqh are subscribers' (owner item 6 §5), an article
 * opens only inside its law's free window, and the route reads text from
 * library.* behind that rule.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { articleTextOpen, principleTextOpen, subscriberOnlyKind, titleOnlyKind } from "./_access.ts";

test("articles: the reader's own rule", () => {
  const base = { isSubscriber: false, lawOpen: false, freeLimit: 3, position: 0 };
  assert.equal(articleTextOpen(base), true, "first article of the free window");
  assert.equal(articleTextOpen({ ...base, position: 2 }), true);
  assert.equal(articleTextOpen({ ...base, position: 3 }), false, "past the free window");
  assert.equal(articleTextOpen({ ...base, position: null }), false, "an uncounted position never opens");
  assert.equal(articleTextOpen({ ...base, freeLimit: 0 }), false);
  assert.equal(articleTextOpen({ ...base, position: 99, isSubscriber: true }), true);
  assert.equal(articleTextOpen({ ...base, position: 99, lawOpen: true }), true, "whitelisted law");
  assert.equal(articleTextOpen({ ...base, position: 99, freeLimit: -1 }), true, "unlimited");
});

test("O16 (b): a principle opens exactly when its collection page shows it in full", () => {
  const visitor = { isSubscriber: false, explicitFree: false, freeLimit: 2, position: 0 };
  assert.equal(principleTextOpen(visitor), true, "first free item");
  assert.equal(principleTextOpen({ ...visitor, position: 1 }), true, "second free item");
  assert.equal(principleTextOpen({ ...visitor, position: 2 }), false, "position N stays locked");
  assert.equal(principleTextOpen({ ...visitor, position: 50 }), false);
  assert.equal(principleTextOpen({ ...visitor, position: null }), false, "an uncounted position never opens");
  assert.equal(principleTextOpen({ ...visitor, position: -1 }), false);
  assert.equal(principleTextOpen({ ...visitor, freeLimit: 0 }), false, "free count 0 = nothing open");
  assert.equal(principleTextOpen({ ...visitor, position: 9, explicitFree: true }), true, "admin-marked free item");
  assert.equal(principleTextOpen({ ...visitor, position: 9, freeLimit: -1 }), true, "unlimited");
  assert.equal(principleTextOpen({ ...visitor, position: 9, isSubscriber: true }), true);
});

test("principles and fiqh: subscribers only; laws and decrees: never text", () => {
  assert.equal(subscriberOnlyKind("principle"), true);
  assert.equal(subscriberOnlyKind("feqh"), true);
  assert.equal(subscriberOnlyKind("article"), false);
  assert.equal(titleOnlyKind("law"), true);
  assert.equal(titleOnlyKind("decree"), true);
});

test("route contract: gate first, never cached, device check before text, no quota spend, text only when open", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await libraryGate\(\);\s*if \(gate\) return gate;/);
  assert.match(route, /const NO_STORE = { "Cache-Control": "private, no-store" };/);
  assert.doesNotMatch(route, /spendLibraryDocument/);
  assert.doesNotMatch(route, /display_text|snippet/, "text comes from library.*, never the graph");
  assert.match(route, /const subscriberOpen = isSubscriber && subscriberOnlyKind\('principle'\);/);
  // O16 (b): the visitor's free items use the collection page's own rule.
  assert.match(route, /const open = subscriberOpen \|\| \(await principleFreeForVisitor\(db, userId, collId, String\(row\.id\), row\.order_index\)\);/);
  assert.match(route, /checkLibraryAccess\(userId, collectionId, 0, 'principles', \{ includeExplicitFreeItem: false \}\)/);
  assert.match(route, /collectionFreeCount\(probe, total\.count, guard\.rulings\)/);
  assert.match(route, /if \(subscriberOpen\) \{\s*const refusal = await enforceLibraryDevice\(userId, true\);/);
  assert.match(route, /\.\.\.\(open \? \{ text: liftRegulationHeading\(raw, !isSubscriber\)\.text \} : \{\}\)/);
  assert.match(route, /\.\.\.\(open \? \{ text \} : \{\}\)/);
  assert.equal((route.match(/enforceLibraryDevice\(userId, true\)/g) ?? []).length, 2);
});
