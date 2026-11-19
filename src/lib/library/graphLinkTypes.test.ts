/**
 * graphLinkTypes.test.ts — register 14 item 17 (19 Nov 2026): «إحالة» is back
 * and every legal link type shows in the reader's box; nothing is hidden for
 * not matching the owner's file. Every type of the graph is classified (reader,
 * explorer-only, outline), so a new type can never slip through unclassified.
 * The comparison mapping is still pinned to graphOwnerCompareCore.mapOurEdge,
 * but it no longer decides what is shown.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/graphLinkTypes.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildBridge, mapOurEdge, type DbEdgeLine } from "../ai/graphOwnerCompareCore.ts";
import { EXPLORER_EDGE_TYPES } from "../ai/graphExplorerCore.ts";
import {
  EXPLORER_ONLY_LINK_TYPES,
  LINK_SECTIONS,
  OUR_TO_OWNER_TYPES,
  OUTLINE_LINK_TYPES,
  OWNER_GRAPH_TYPES,
  READER_QUERY_GROUPS,
  SHOWN_LINK_LABELS,
  SHOWN_LINK_TYPES,
  isExplorerVisibleLinkType,
  isShownLinkType,
  linkLabel,
  linkTypesOfSection,
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

test("the comparison mapping stays pinned to the export (documentation only since register 17)", () => {
  const ownerTypes = new Set(Object.keys(OWNER_GRAPH_TYPES));
  assert.equal(ownerTypes.size, 15, "his report lists 14 raw types, plus refers_to_article (owner decision 19 Nov)");
  assert.equal(OWNER_GRAPH_TYPES.refers_to_article.category, "يحيل إلى مادة");
  assert.notEqual(OWNER_GRAPH_TYPES.refers_to_article.category, OWNER_GRAPH_TYPES.related_to.category, "article → article is not law → law");
  assert.deepEqual([...OUR_TO_OWNER_TYPES.CITES_ARTICLE], ["refers_to_article"]);
  assert.deepEqual([...OUR_TO_OWNER_TYPES.INTERPRETS_ARTICLE], ["cites_article"]);
  for (const t of EXPLORER_EDGE_TYPES) {
    const mapped = mapOurEdge(bridge, edge(t)).map((e) => e.type);
    const matches = mapped.length > 0 && mapped.every((m) => ownerTypes.has(m));
    assert.equal(Object.prototype.hasOwnProperty.call(OUR_TO_OWNER_TYPES, t), matches, `${t} → ${mapped.join(",") || "(none)"}`);
    if (matches) assert.deepEqual([...OUR_TO_OWNER_TYPES[t as keyof typeof OUR_TO_OWNER_TYPES]].sort(), [...new Set(mapped)].sort(), t);
  }
});

test("every graph type is in exactly one bucket: reader, explorer-only, or outline", () => {
  for (const t of EXPLORER_EDGE_TYPES) {
    const buckets = [
      isShownLinkType(t),
      (EXPLORER_ONLY_LINK_TYPES as readonly string[]).includes(t),
      (OUTLINE_LINK_TYPES as readonly string[]).includes(t),
    ].filter(Boolean).length;
    assert.equal(buckets, 1, t);
  }
  assert.equal(SHOWN_LINK_TYPES.length + EXPLORER_ONLY_LINK_TYPES.length + OUTLINE_LINK_TYPES.length, EXPLORER_EDGE_TYPES.length);
});

test("register 17: «إحالة» and every legal link type reach the reader; nothing is hidden for not matching his file", () => {
  for (const t of ["CITES_ARTICLE", "EXEMPTS_FROM", "SUBJECT_TO", "PENALIZES", "IMPLEMENTED_BY", "REPLACED_BY", "INTERPRETS_ARTICLE", "AMENDS_ARTICLE", "SUPERSEDES_LAW", "PARENT_LAW"]) {
    assert.equal(isShownLinkType(t), true, t);
    assert.ok(sectionOfLinkType(t), t);
  }
  assert.equal(sectionOfLinkType("CITES_ARTICLE"), "legislation", "«إحالة» is a law citing a law — legislation, not judicial");
  // Every classified type is in the staff explorer.
  for (const t of EXPLORER_EDGE_TYPES) assert.equal(isExplorerVisibleLinkType(t), true, t);
  assert.equal(isExplorerVisibleLinkType("SOMETHING_NEW"), false, "an unclassified type is left out");
  // Computed similarity and the outline are never presented to a reader as a legal link.
  for (const t of ["SIMILAR_TO", "PART_OF", "NEXT_ARTICLE", "HAS_CONCEPT"]) {
    assert.equal(isShownLinkType(t), false, t);
    assert.equal(sectionOfLinkType(t), null, t);
  }
});

test("sections: only INTERPRETS_ARTICLE is judicial; no type is fiqh today", () => {
  assert.deepEqual(linkTypesOfSection("judicial"), ["INTERPRETS_ARTICLE"]);
  assert.deepEqual(linkTypesOfSection("fiqh"), []);
  assert.equal(linkTypesOfSection("legislation").length, SHOWN_LINK_TYPES.length - 1);
  assert.deepEqual([...LINK_SECTIONS], ["legislation", "judicial", "fiqh"]);
});

test("query groups: every reader type asked exactly once, «إحالة» in a group of its own, sections match", () => {
  const asked = READER_QUERY_GROUPS.flatMap((g) => [...g.types]);
  assert.deepEqual([...asked].sort(), [...SHOWN_LINK_TYPES].sort());
  assert.equal(new Set(asked).size, asked.length);
  for (const g of READER_QUERY_GROUPS) for (const t of g.types) assert.equal(sectionOfLinkType(t), g.section, t);
  assert.ok(READER_QUERY_GROUPS.some((g) => g.types.length === 1 && g.types[0] === "CITES_ARTICLE"));
  const leg = READER_QUERY_GROUPS.filter((g) => g.section === "legislation");
  assert.ok(leg[0].types.includes("PARENT_LAW") && leg[0].types.includes("AMENDS_ARTICLE"), "regulation and amendment links are listed first");
});

test("labels: every reader type has both directions, distinct, no «يفسّر» anywhere", () => {
  for (const t of SHOWN_LINK_TYPES) {
    assert.ok(SHOWN_LINK_LABELS[t].out && SHOWN_LINK_LABELS[t].in, t);
    assert.notEqual(SHOWN_LINK_LABELS[t].out, SHOWN_LINK_LABELS[t].in, t);
    assert.doesNotMatch(SHOWN_LINK_LABELS[t].out + SHOWN_LINK_LABELS[t].in, /يفسّر|يفسر|تفسير/);
  }
  assert.equal(linkLabel("CITES_ARTICLE", "out"), "يحيل إلى مادة", "owner decision 19 Nov: refers_to_article");
  assert.equal(linkLabel("CITES_ARTICLE", "in"), "مادة تحيل إليها");
  assert.equal(linkLabel("INTERPRETS_ARTICLE", "out"), "مبدأ قضائي يستند إليه", "cites_article keeps its words");
  assert.equal(linkLabel("SIMILAR_TO", "out"), "");
});
