/**
 * linkCoverage.test.ts — batch l14, the staff page «تغطية الإحالات» (owner
 * file 07 §2, §12.8; approved 23 Nov §15).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coveragePercent, linksPerArticle, parseLinkCoverage, sortLawCoverage } from "./linkCoverage.ts";
import { ADMIN_PAGE_ACTION } from "../auth/adminNavAccess.ts";
import { ADMIN_NAV_SECTIONS } from "../../constants/adminNavItems.ts";

const RAW = {
  laws: [
    { slug: "jud", title: "نظام القضاء", articles: 4, linked: 3, links: 12, similar_linked: 1, doc_level: 1, gone_anchors: 1 },
    { slug: "mech", title: "آلية العمل", articles: 9, linked: 9, links: 9, similar_linked: 0, doc_level: 0, gone_anchors: 0 },
    { slug: "poor", title: "نظام فقير", articles: 10, linked: 1, links: 1, similar_linked: 0, doc_level: 0, gone_anchors: 0 },
    { slug: "", title: "بلا معرّف" },
    { slug: "bad", articles: -3, linked: "x" },
  ],
  totals: { laws: 3, articles: 23, linked: 13, links: 22, similar_linked: 1, doc_level: 1, gone_anchors: 1 },
  owner_edges: { resolved_doc: 1, target_doc_unknown: 2, "<script>": 9 },
  anomaly_min: 6,
  anomaly_count: 1,
  anomalies: [
    { article_key: "article:jud__art-1", article_title: "نظام القضاء — المادة 1", law_slug: "jud", edge_type: "IMPLEMENTED_BY", direction: "out", other_doc: "mech", other_title: "آلية العمل", n: 9 },
    { article_title: "بلا مفتاح" },
  ],
};

test("parse: whatever the server sent — numbers stay numbers, a row without a key is dropped, odd keys ignored", () => {
  const c = parseLinkCoverage(RAW);
  assert.deepEqual(c.laws.map((l) => l.slug), ["jud", "mech", "poor", "bad"]);
  assert.deepEqual(c.laws[3], { slug: "bad", title: "bad", articles: 0, linked: 0, links: 0, similarLinked: 0, docLevel: 0, goneAnchors: 0 });
  assert.equal(c.totals.linked, 13);
  assert.deepEqual(c.ownerEdges, { resolved_doc: 1, target_doc_unknown: 2 });
  assert.equal(c.anomalies.length, 1);
  assert.deepEqual(c.anomalies[0], {
    articleKey: "article:jud__art-1", articleTitle: "نظام القضاء — المادة 1", lawSlug: "jud", edgeType: "IMPLEMENTED_BY",
    direction: "out", otherDoc: "mech", otherTitle: "آلية العمل", n: 9,
  });
  const empty = parseLinkCoverage(null);
  assert.deepEqual(empty.laws, []);
  assert.equal(empty.anomalyMin, 6);
});

test("percent, links per article, and the poorest first", () => {
  assert.equal(coveragePercent(3, 4), 75);
  assert.equal(coveragePercent(1, 3), 33.3);
  assert.equal(coveragePercent(5, 0), null);
  assert.equal(coveragePercent(9, 4), 100, "never above 100");
  assert.equal(linksPerArticle(12, 4), 3);
  assert.equal(linksPerArticle(1, 0), null);
  const rows = parseLinkCoverage(RAW).laws;
  assert.deepEqual(sortLawCoverage(rows, "poorest").map((r) => r.slug), ["poor", "jud", "mech", "bad"], "a law with no article last");
  assert.deepEqual(sortLawCoverage(rows, "largest").map((r) => r.slug), ["poor", "mech", "jud", "bad"]);
  assert.equal(sortLawCoverage(rows, "unresolved")[0].slug, "jud");
});

test("the page is in the admin list, a read page (any staff role), and its route is requireStaff(\"read\") on the service function", () => {
  const href = "/dashboard/admin/library-links-coverage";
  assert.ok(ADMIN_NAV_SECTIONS.some((s) => s.items.some((i) => i.href === href)));
  assert.equal(ADMIN_PAGE_ACTION[href], "read");
  const route = readFileSync(new URL("../../app/api/v1/admin/library-links-coverage/route.ts", import.meta.url), "utf8");
  assert.match(route, /const gate = await requireStaff\("read"\);/);
  assert.match(route, /admin\.rpc\("graph_rag_link_coverage", \{ p_types: readerLinkTypes\(true\), p_anomaly_min: 6, p_sample: 50 \}\)/);
  assert.match(route, /schemaMissing: true, migration: "20261204_40_library_link_coverage\.sql"/);
  const page = readFileSync(new URL("../../app/dashboard/admin/library-links-coverage/page.tsx", import.meta.url), "utf8");
  assert.match(page, /تغطية الإحالات/);
  assert.match(page, /\/api\/v1\/admin\/library-links-coverage/);
});
