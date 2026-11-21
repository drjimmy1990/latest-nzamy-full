/**
 * ihalaSample.test.ts — owner N12 (batch l12): the 50-article «إحالة» sample
 * — deterministic, spread over laws and link counts; the report counts what
 * the graph holds, what the box shows and what is automatic; the script only
 * reads.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/ihalaSample.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { countArticleMentions, formatSampleReport, isAutomatic, pickSample, sampleLinks, type SampleCandidate } from "./ihalaSample.ts";

const cands: SampleCandidate[] = [];
for (let l = 0; l < 40; l++) for (let a = 0; a < 6; a++) cands.push({ lawSlug: `law-${l}`, articleId: `law-${l}__art-${a}`, total: (a % 3) * 5 + 1 });

test("sample: 50 articles, the same for the same seed, at most two per law, spread over link counts", () => {
  const a = pickSample(cands, 50, 7);
  const b = pickSample(cands, 50, 7);
  assert.equal(a.length, 50);
  assert.deepEqual(a, b, "deterministic");
  assert.notDeepEqual(pickSample(cands, 50, 8), a, "another seed, another sample");
  const perLaw = new Map<string, number>();
  for (const c of a) perLaw.set(c.lawSlug, (perLaw.get(c.lawSlug) ?? 0) + 1);
  assert.ok([...perLaw.values()].every((n) => n <= 2));
  const bands = [a.filter((c) => c.total <= 2).length, a.filter((c) => c.total > 2 && c.total <= 8).length, a.filter((c) => c.total > 8).length];
  assert.deepEqual(bands, [17, 17, 16]);
  assert.equal(pickSample([{ lawSlug: "x", articleId: "y", total: 0 }], 50).length, 0, "no link, no sample");
});

test("mentions: a rough count of the articles a text names", () => {
  assert.equal(countArticleMentions("مع مراعاة ما ورد في المادة (5) والمادة الخامسة عشرة"), 2);
  assert.equal(countArticleMentions("وفقاً للمادتين (3) و(4)"), 2);
  assert.equal(countArticleMentions("المواد (1-3) من هذا النظام"), 1);
  assert.equal(countArticleMentions("لا ذكر لمادة هنا"), 0);
});

test("links: «إحالة» only, both directions, origin, the owner's file links never automatic", () => {
  const raw = {
    found: true,
    center_edge_counts: { CITES_ARTICLE: { out: 2, in: 1 } },
    nodes: [
      { node_key: "article:c", law_slug: "l" },
      { node_key: "article:d", title: "نظام ب — المادة 3", law_slug: "b" },
      { node_key: "article:e", title: "نظام ج — المادة 9", law_slug: "c" },
      { node_key: "article:f", title: "نظام د — المادة 1", law_slug: "d" },
    ],
    edges: [
      { source: "article:c", target: "article:d", edge_type: "CITES_ARTICLE", origin: "auto_watchdog", evidence: "وفقاً للمادة (3) من نظام ب", metadata: {} },
      { source: "article:c", target: "article:e", edge_type: "CITES_ARTICLE", origin: "auto_watchdog", metadata: { source: "owner_links" } },
      { source: "article:f", target: "article:c", edge_type: "CITES_ARTICLE", origin: "owner_curated", metadata: { source: "owner_edges" } },
      { source: "article:c", target: "article:d", edge_type: "SUBJECT_TO", origin: "auto_watchdog" },
    ],
  };
  const s = sampleLinks(raw, "c");
  assert.equal(s.out, 2);
  assert.equal(s.in, 1);
  assert.deepEqual(s.links.map((l) => [l.key, l.direction, l.lawSlug, isAutomatic(l)]), [
    ["article:d", "out", "b", true],
    ["article:e", "out", "c", false],
    ["article:f", "in", "d", false],
  ]);
  assert.equal(sampleLinks({ found: false }, "c").found, false);
});

test("report: Arabic, a row per article, a checkbox per link, totals; the script never writes to a database", () => {
  const s = sampleLinks(
    { found: true, nodes: [{ node_key: "article:d", title: "نظام ب — المادة 3", law_slug: "b" }], edges: [{ source: "article:c", target: "article:d", edge_type: "CITES_ARTICLE", origin: "auto_watchdog" }] },
    "c",
  );
  const { md, tsv } = formatSampleReport(
    [{ lawSlug: "a", lawTitle: "نظام أ", articleId: "c", articleLabel: "المادة 5", graphOut: 1, graphIn: 0, shown: 1, automatic: 1, mentions: 2, links: s.links }],
    { date: "2026-11-21", seed: 1 },
  );
  assert.match(md, /^# فحص عيّنة «الإحالة» — 1 مادة/);
  assert.match(md, /\| 1 \| نظام أ \| المادة 5 \| 1\/0 \| 1 \| 1 \| 2 \|/);
  assert.match(md, /- \[ \] نظام ب — المادة 3 \(تحيل إليها هذه المادة · رابط آلي\)/);
  assert.equal(tsv.split("\n")[0], "law_slug\tlaw_title\tarticle_id\tarticle\tgraph_out\tgraph_in\tshown\tautomatic\ttext_mentions");
  const script = readFileSync(new URL("../../../scripts/library-ihala-sample.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(script, /\.(insert|update|upsert|delete)\(|graph_rag_owner_edges_load|graph_rag_resolve_owner_edges|mark_dirty/, "read-only");
  assert.doesNotMatch(script, /readFileSync\([^)]*\.env/, "never reads .env itself");
});
