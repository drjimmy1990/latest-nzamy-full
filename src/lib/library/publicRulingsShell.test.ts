/**
 * publicRulingsShell.test.ts — pending #44 + register 14 item 13: the server
 * HTML of a collection holds the items a guest reads in full and nothing more.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/publicRulingsShell.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PUBLIC_RULINGS_SHELL_MAX, guestShellCount, publicRulingCards } from "./publicRulingsShell.ts";

const rows = [
  { id: "p1", principle_number: "1", issuing_body: "المحكمة العليا", session_date: "1445/3/2هـ", text: "**المبدأ:** نص الأول" },
  { id: "p2", principle_number: "", issuing_body: "", session_date: "", text: "## عنوان\n> نص الثاني" },
  { id: "p3", principle_number: "3", text: "نص الثالث المقفل" },
];

test("the cards are the first N rows, plain text, headed by their own fields", () => {
  const cards = publicRulingCards(rows, 2);
  assert.deepEqual(cards, [
    { id: "p1", heading: "مبدأ رقم (1) — المحكمة العليا — 1445/3/2هـ", text: "المبدأ: نص الأول" },
    { id: "p2", heading: "مبدأ", text: "عنوان\nنص الثاني" },
  ]);
  assert.ok(!JSON.stringify(cards).includes("المقفل"), "the third is a guest's locked item: never in the HTML");
  assert.deepEqual(publicRulingCards(rows, 0), []);
  assert.equal(publicRulingCards([...rows, ...rows], 99).length, PUBLIC_RULINGS_SHELL_MAX);
});

test("the count is the API's rule for a guest, capped for the HTML", () => {
  const def = { freeLimit: 5, freeLimitSource: "default" as const };
  assert.equal(guestShellCount(def, 40, { full: 2 }), 2);
  assert.equal(guestShellCount(def, 1, { full: 2 }), 1);
  assert.equal(guestShellCount(def, 40, { full: 0 }), 0, "the l8 value before the migration: nothing printed");
  assert.equal(guestShellCount({ freeLimit: 10, freeLimitSource: "override" }, 40, { full: 2 }), PUBLIC_RULINGS_SHELL_MAX);
  assert.equal(guestShellCount({ freeLimit: -1 }, 40, { full: 2 }), PUBLIC_RULINGS_SHELL_MAX);
});

test("the collection layout renders them outside the guard, only when the library is open, as a guest", () => {
  const layout = readFileSync(new URL("../../app/precedents/[slug]/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /\{load\.status === "ok" && <PublicRulings collectionId=\{load\.doc\.id\} \/>\}/);
  assert.ok(layout.indexOf("<PublicRulings") > layout.indexOf("<LibraryGuard>"), "after the guarded reader");
  const block = readFileSync(new URL("../../app/precedents/[slug]/_public-rulings.tsx", import.meta.url), "utf8");
  assert.match(block, /checkLibraryAccess\(null, collectionId, 0, "principles", \{ includeExplicitFreeItem: false \}\)/, "a guest's probe");
  assert.match(block, /\.order\("order_index", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)\s*\.range\(0, n - 1\)/, "the API's order");
  assert.match(block, /guestShellCount\(probe, head\.count, guard\.rulings\)/);
});
