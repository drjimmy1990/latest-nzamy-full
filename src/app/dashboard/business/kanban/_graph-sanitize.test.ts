import test from "node:test";
import assert from "node:assert/strict";
import {
  safeExternalUrl,
  linkHost,
  normalizeLoadedNodes,
  normalizeLoadedEdges,
  toggleChecklistItem,
  addChecklistItem,
  removeChecklistItem,
  checklistCount,
} from "./_graph-sanitize.ts";

test("safeExternalUrl keeps http(s) only", () => {
  assert.equal(safeExternalUrl("https://laws.boe.gov.sa/x?y=1"), "https://laws.boe.gov.sa/x?y=1");
  assert.equal(safeExternalUrl("  http://moj.gov.sa  "), "http://moj.gov.sa/");
  assert.equal(safeExternalUrl("moj.gov.sa"), "https://moj.gov.sa/", "a bare host is read as https");
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("JAVASCRIPT:alert(1)"), null);
  assert.equal(safeExternalUrl("data:text/html,<b>x</b>"), null);
  assert.equal(safeExternalUrl("file:///etc/passwd"), null);
  assert.equal(safeExternalUrl("//evil.example/x"), null);
  assert.equal(safeExternalUrl(""), null);
  assert.equal(safeExternalUrl(undefined), null);
  assert.equal(safeExternalUrl(42 as unknown as string), null);
  assert.equal(linkHost("https://www.moj.gov.sa/ar/x"), "moj.gov.sa");
  assert.equal(linkHost("javascript:x"), null);
});

test("normalizeLoadedNodes keeps a saved board as it was and repairs what would crash", () => {
  const saved = [
    { id: "a", type: "doc", title: "عقد", desc: "", pos: { x: 10, y: 20 }, author: { name: "x", color: "c", role: "r" }, w: 300 },
    { id: "b", type: "mystery", title: 5, pos: { x: "bad" } },
    null,
    "junk",
    { id: "", type: "doc" },
    { id: "c", type: "link", title: "x", desc: "", pos: { x: 0, y: 0 }, url: "javascript:alert(1)", urgent: "yes" },
    { id: "d", type: "checklist", title: "t", desc: "", pos: { x: 0, y: 0 }, checklist: [{ id: "1", text: "أ", done: true }, { text: 3 }, null] },
    { id: "e", type: "event", title: "جلسة", desc: "", pos: { x: 0, y: 0 }, ref: { ref_type: "hearing", ref_id: "h1", label: "جلسة" } },
    { id: "f", type: "event", title: "x", desc: "", pos: { x: 0, y: 0 }, ref: { ref_type: "bank", ref_id: "1", label: "x" } },
  ];
  const out = normalizeLoadedNodes(saved);
  assert.deepEqual(out.map((n) => n.id), ["a", "b", "c", "d", "e", "f"]);
  assert.deepEqual(out[0], saved[0], "a well-formed old card is untouched");
  assert.equal(out[1].type, "custom", "an unknown type falls back to a free note");
  assert.equal(out[1].title, "");
  assert.deepEqual(out[1].pos, { x: 0, y: 0 });
  assert.equal(out[2].url, undefined, "an unsafe url is dropped on load");
  assert.equal(out[2].urgent, undefined);
  assert.deepEqual(out[3].checklist, [{ id: "1", text: "أ", done: true }]);
  assert.deepEqual(out[4].ref, { ref_type: "hearing", ref_id: "h1", label: "جلسة" });
  assert.equal(out[5].ref, undefined, "an unknown ref type is dropped");
  assert.deepEqual(normalizeLoadedNodes("nope" as unknown as unknown[]), []);
});

test("normalizeLoadedEdges drops edges without both ends and repairs the type", () => {
  const out = normalizeLoadedEdges([
    { id: "e1", from: "a", to: "b", type: "support", label: "x" },
    { id: "e2", from: "a", type: "support" },
    { id: "e3", from: "a", to: "b", type: "weird" },
    7,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[1].type, "neutral");
  assert.equal(out[1].label, "");
});

test("checklist helpers", () => {
  const base = [{ id: "1", text: "أ", done: false }, { id: "2", text: "ب", done: true }];
  assert.deepEqual(toggleChecklistItem(base, "1")[0], { id: "1", text: "أ", done: true });
  assert.equal(addChecklistItem(base, "  ج  ", "3").at(-1)?.text, "ج");
  assert.equal(addChecklistItem(base, "   ", "3").length, 2, "an empty line is not added");
  assert.deepEqual(removeChecklistItem(base, "2").map((i) => i.id), ["1"]);
  assert.deepEqual(checklistCount(base), { done: 1, total: 2 });
  assert.deepEqual(checklistCount(undefined), { done: 0, total: 0 });
});
