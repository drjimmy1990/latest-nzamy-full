/**
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ext/extLibrary.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { libraryQuotaTarget } from "../library/readQuota.ts";
import { clipText, extStatus, mayReadLawText, toExtArticle, toExtEdges, toExtHits, type ExtAccess } from "./extLibrary.ts";

const LONG = "نص المادة ".repeat(200).trim();
const full: ExtAccess = { hasFullAccess: true, whitelistedSlugs: [], freeItemsByType: {} };
const free: ExtAccess = { hasFullAccess: false, whitelistedSlugs: ["open-law"], freeItemsByType: { principles: ["p-free"] } };
const row = { id: "a1", law_slug: "labor", number: 5, title: "عنوان", text: LONG, original_text: null, status: "active" };

test("status: only the library's own words; undeclared is unknown, never in force", () => {
  assert.equal(extStatus("active"), "in_force");
  assert.equal(extStatus("amended"), "amended");
  assert.equal(extStatus("repealed"), "repealed");
  for (const v of ["", "suspended", "added", null, undefined, 5]) assert.equal(extStatus(v), "unknown");
});

test("entitlement: no free preview through a token; whitelist and full access read", () => {
  assert.equal(mayReadLawText(full, "labor"), true);
  assert.equal(mayReadLawText(free, "labor"), false);
  assert.equal(mayReadLawText(free, "open-law"), true);
});

test("clipText cuts at a word and never exceeds the cap by more than the ellipsis", () => {
  const c = clipText(LONG, 240);
  assert.ok(c.length <= 241 && c.endsWith("…"));
  assert.equal(clipText("قصير", 240), "قصير");
  assert.equal(clipText(null, 10), "");
});

test("hits: a reader without the right gets the row but no text; a full reader gets ≤ 240", () => {
  const hits = [{ kind: "article", id: "a1", title: "نظام العمل — المادة ٥", url: "/laws/labor#a1", text: LONG }, { kind: "decree", id: "d1", title: "x", url: "/d", text: "y" }];
  const meta = new Map([["a1", { law_slug: "labor", number: 5, status: "amended" }]]);
  const titles = new Map([["labor", "نظام العمل"]]);
  const locked = toExtHits(hits, meta, titles, free, 8);
  assert.equal(locked.length, 1, "decrees are not offered through a token");
  assert.equal(locked[0]!.snippet, "");
  assert.equal(locked[0]!.locked, true);
  assert.equal(locked[0]!.status, "amended");
  assert.equal(locked[0]!.article_number, 5);
  const open = toExtHits(hits, meta, titles, full, 8);
  assert.equal(open[0]!.locked, false);
  assert.ok(String(open[0]!.snippet).length > 0 && String(open[0]!.snippet).length <= 241);
});

test("article: locked has no text at all, with the reason", () => {
  const plan = toExtArticle(row, "نظام العمل", { mayRead: false, refusal: null, excerptOnly: false, remainingToday: null }, [], "req_1");
  assert.equal(plan.text, null);
  assert.equal(plan.locked, true);
  assert.equal(plan.lock_reason, "plan");
  const quota = toExtArticle(row, "x", { mayRead: true, refusal: "daily_quota", excerptOnly: false, remainingToday: 0 }, [], "req_1");
  assert.equal(quota.text, null);
  assert.equal(quota.lock_reason, "daily_quota");
  const lock = toExtArticle(row, "x", { mayRead: true, refusal: "library_lock", excerptOnly: false, remainingToday: 0 }, [], "req_1");
  assert.equal(lock.text, null);
});

test("article: full read, excerpt, repealed wording, and the 20k cap", () => {
  const fullRead = toExtArticle(row, "x", { mayRead: true, refusal: null, excerptOnly: false, remainingToday: 7 }, [], "req_1");
  assert.equal(fullRead.text, LONG);
  assert.equal(fullRead.locked, false);
  assert.equal(fullRead.excerpt_only, undefined);
  const ex = toExtArticle(row, "x", { mayRead: true, refusal: null, excerptOnly: true, remainingToday: null }, [], "req_1");
  assert.ok(String(ex.text).length <= 241);
  assert.equal(ex.excerpt_only, true);
  assert.equal(ex.text_truncated, true);
  const repealed = toExtArticle({ ...row, text: "", original_text: "نص ملغى", status: "repealed" }, "x", { mayRead: true, refusal: null, excerptOnly: false, remainingToday: null }, [], "req_1");
  assert.equal(repealed.text, "نص ملغى");
  assert.equal(repealed.status, "repealed");
  const huge = toExtArticle({ ...row, text: "ا".repeat(30000) }, "x", { mayRead: true, refusal: null, excerptOnly: false, remainingToday: null }, [], "req_1");
  assert.equal(String(huge.text).length, 20000);
  assert.equal(huge.text_truncated, true);
});

test("neighbours: types folded, outline links dropped, direction from the root, locked has no snippet", () => {
  const raw = {
    found: true,
    nodes: [
      { node_key: "article:a2", node_type: "article", title: "مادة ٢", law_slug: "labor", article_number: 2, item_status: "active", snippet: LONG },
      { node_key: "article:a3", node_type: "article", title: "مادة ٣", law_slug: "other", article_number: 3, item_status: "repealed", snippet: LONG },
      { node_key: "chapter:c1", node_type: "chapter", title: "باب" },
    ],
    edges: [
      { source: "article:a1", target: "article:a2", edge_type: "EXEMPTS_FROM" },
      { source: "article:a3", target: "article:a1", edge_type: "AMENDS_ARTICLE" },
      { source: "article:a1", target: "chapter:c1", edge_type: "PART_OF" },
      { source: "article:a1", target: "article:a2", edge_type: "NEXT_ARTICLE" },
    ],
  };
  const out = toExtEdges(raw, "article:a1", free, 12) as Array<{ type: string; direction: string; node: Record<string, unknown> }>;
  assert.deepEqual(out.map((e) => [e.type, e.direction, e.node.id]), [["EXCEPTS", "out", "a2"], ["AMENDS", "in", "a3"]]);
  assert.equal(out[0]!.node.locked, true);
  assert.equal(out[0]!.node.snippet, "");
  assert.equal(out[1]!.node.status, "repealed");
  const asFull = toExtEdges(raw, "article:a1", full, 1) as Array<{ node: Record<string, unknown> }>;
  assert.equal(asFull.length, 1);
  assert.equal(asFull[0]!.node.locked, false);
  assert.deepEqual(toExtEdges({ found: false }, "article:a1", full, 5), []);
  assert.deepEqual(toExtEdges(null, "article:a1", full, 5), []);
});

test("quota key: the law page's own key, so a token spends the same document as the website", () => {
  assert.deepEqual(libraryQuotaTarget("GET", "/api/library/laws/" + encodeURIComponent("نظام-العمل")), { kind: "doc", docKey: "law:نظام-العمل" });
});
