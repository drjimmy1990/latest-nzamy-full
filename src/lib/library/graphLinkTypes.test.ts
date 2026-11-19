/**
 * graphLinkTypes.test.ts — the allow-list of owner decision ٦٠ is pinned to the
 * comparison mapping (graphOwnerCompareCore.mapOurEdge) and to the explorer's
 * full type list, so a new type can never slip through unclassified.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/graphLinkTypes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBridge, mapOurEdge, type DbEdgeLine } from "../ai/graphOwnerCompareCore.ts";
import { EXPLORER_EDGE_TYPES } from "../ai/graphExplorerCore.ts";
import {
  LINK_SECTIONS,
  OUR_TO_OWNER_TYPES,
  OUTLINE_LINK_TYPES,
  OWNER_GRAPH_TYPES,
  SHOWN_LINK_LABELS,
  SHOWN_LINK_TYPES,
  UNREVIEWED_LINK_TYPES,
  isExplorerVisibleLinkType,
  isShownLinkType,
  linkLabel,
  sectionOfLinkType,
} from "./graphLinkTypes.ts";

const bridge = buildBridge([]);
function edge(type: string): DbEdgeLine {
  return {
    kind: "edge",
    edge_type: type,
    source_key: "a",
    target_key: "b",
    from: { node_type: "article", law_slug: "a", source_id: "a1", article_number: 1 },
    to: { node_type: "article", law_slug: "b", source_id: "b1", article_number: 2 },
  } as DbEdgeLine;
}

test("٦٠: a type is shown exactly when the comparison export maps it onto one of the owner's 14 types", () => {
  const ownerTypes = new Set(Object.keys(OWNER_GRAPH_TYPES));
  assert.equal(ownerTypes.size, 14, "his report lists 14 raw types");
  for (const t of EXPLORER_EDGE_TYPES) {
    const mapped = mapOurEdge(bridge, edge(t)).map((e) => e.type);
    const matches = mapped.length > 0 && mapped.every((m) => ownerTypes.has(m));
    assert.equal(isShownLinkType(t), matches, `${t} → ${mapped.join(",") || "(none)"}`);
    if (matches) assert.deepEqual([...OUR_TO_OWNER_TYPES[t as keyof typeof OUR_TO_OWNER_TYPES]].sort(), [...new Set(mapped)].sort(), t);
  }
});

test("every explorer type is in exactly one bucket: shown, unreviewed, or outline", () => {
  for (const t of EXPLORER_EDGE_TYPES) {
    const buckets = [
      isShownLinkType(t),
      (UNREVIEWED_LINK_TYPES as readonly string[]).includes(t),
      (OUTLINE_LINK_TYPES as readonly string[]).includes(t),
    ].filter(Boolean).length;
    assert.equal(buckets, 1, t);
  }
  assert.equal(SHOWN_LINK_TYPES.length + UNREVIEWED_LINK_TYPES.length + OUTLINE_LINK_TYPES.length, EXPLORER_EDGE_TYPES.length);
});

test("the five types question ٦٠ named that his file lacks are hidden from the reader and the explorer", () => {
  for (const t of ["EXEMPTS_FROM", "SUBJECT_TO", "PENALIZES", "IMPLEMENTED_BY", "REPLACED_BY"]) {
    assert.equal(isShownLinkType(t), false, t);
    assert.equal(isExplorerVisibleLinkType(t), false, t);
    assert.equal(sectionOfLinkType(t), null, t);
  }
  assert.equal(isExplorerVisibleLinkType("SIMILAR_TO"), false);
  assert.equal(isExplorerVisibleLinkType("SOMETHING_NEW"), false, "an unclassified type is hidden");
  assert.equal(isExplorerVisibleLinkType("PART_OF"), true, "the outline stays in the explorer");
  assert.equal(isShownLinkType("PART_OF"), false, "and never reaches the reader");
});

test("sections follow his categories; no shown type is fiqh today", () => {
  assert.equal(sectionOfLinkType("INTERPRETS_ARTICLE"), "judicial");
  for (const t of ["AMENDS_ARTICLE", "SUPERSEDES_LAW", "PARENT_LAW"]) assert.equal(sectionOfLinkType(t), "legislation", t);
  // His cites_article is LAW → LAW in 11,062 of 12,296 edges (compare 19 Nov): our «إحالة» matches it,
  // and sits with the legislation, not under his judicial category.
  assert.equal(isShownLinkType("CITES_ARTICLE"), true);
  assert.equal(isExplorerVisibleLinkType("CITES_ARTICLE"), true);
  assert.equal(sectionOfLinkType("CITES_ARTICLE"), "legislation");
  assert.equal(SHOWN_LINK_TYPES.some((t) => sectionOfLinkType(t) === "fiqh"), false);
  assert.deepEqual([...LINK_SECTIONS], ["legislation", "judicial", "fiqh"]);
});

test("labels: every shown type has both directions, no «يفسّر» anywhere", () => {
  for (const t of SHOWN_LINK_TYPES) {
    assert.ok(SHOWN_LINK_LABELS[t].out && SHOWN_LINK_LABELS[t].in, t);
    assert.doesNotMatch(SHOWN_LINK_LABELS[t].out + SHOWN_LINK_LABELS[t].in, /يفسّر|يفسر|تفسير/);
  }
  assert.equal(linkLabel("PENALIZES", "out"), "");
  assert.equal(linkLabel("CITES_ARTICLE", "out"), "تُحيل إليها");
});
