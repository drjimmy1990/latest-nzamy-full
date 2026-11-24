/**
 * _l14-links.test.ts — batch l14, owner file 07 (approved 23 Nov §15):
 *   §3  the article never appears in its own links — neither its own key nor,
 *       in «مواد متقاربة في المعنى», another copy of the same law (the case of
 *       the owner's screenshot: judiciary-law art 1 «similar» to
 *       law-of-the-judiciary-1428 art 1, its own text in a second record);
 *   §4  other documents first, this law's own last; within «التشريعات»: the
 *       in-force counterpart and the amendment, then the regulation, then
 *       reference / exception / «مع مراعاة» / penalty; the repealed last;
 *   §12 no duplicates between the legal and the similar sections; similar
 *       capped at three, its total what is shown;
 *   §14 the per-process cache and the Server-Timing header.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIMILAR_MAX,
  arrangeSection,
  cleanArticleRefs,
  cleanLawLinks,
  compareRefItems,
  emptySections,
  expandLawLinks,
  isRegulationRef,
  isSameLawOrCopy,
  lawBaseTitle,
  orderRefs,
  refArticleNumber,
  refMatchesFilter,
  sortRefItems,
  type LawLinks,
  type RefGroupOut,
  type RefItem,
} from "./_shape.ts";
import { READER_DISPLAY_ORDER, SHOWN_LINK_TYPES } from "../../../../../../lib/library/graphLinkTypes.ts";
import { createTtlCache, linksCacheKey, serverTiming } from "./_cache.ts";

const item = (over: Partial<RefItem> & Pick<RefItem, "key">): RefItem => ({
  kind: "article",
  title: "",
  status: "active",
  linkType: "CITES_ARTICLE",
  direction: "out",
  relation: "",
  section: "legislation",
  docKind: "law",
  docId: "other",
  anchorId: null,
  anchorMissing: false,
  auto: false,
  ...over,
});

const bulkItem = (key: string, docId: string, title: string, status = "active") => ({
  key,
  kind: "article" as const,
  title,
  status,
  docKind: "law" as const,
  docId,
  anchorId: key.slice("article:".length),
  anchorMissing: false,
  href: `/laws/${docId}`,
  docHref: `/laws/${docId}`,
});

// The live answer of /laws/judiciary-law, article 1 (24 Nov), cut down.
const JUDICIARY: LawLinks = {
  found: true,
  perType: 3,
  items: {
    "article:judiciary-diwan-mazalim-executive-mechanism__art-1": bulkItem("article:judiciary-diwan-mazalim-executive-mechanism__art-1", "judiciary-diwan-mazalim-executive-mechanism", "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم — المادة 1"),
    "article:judiciary-diwan-mazalim-executive-mechanism__art-2": bulkItem("article:judiciary-diwan-mazalim-executive-mechanism__art-2", "judiciary-diwan-mazalim-executive-mechanism", "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم — المادة 2"),
    "article:judiciary-diwan-mazalim-executive-mechanism__art-7": bulkItem("article:judiciary-diwan-mazalim-executive-mechanism__art-7", "judiciary-diwan-mazalim-executive-mechanism", "آلية العمل التنفيذية لنظام القضاء ونظام ديوان المظالم — المادة 7", "amended"),
    "article:law-of-the-judiciary-1428__art-1": bulkItem("article:law-of-the-judiciary-1428__art-1", "law-of-the-judiciary-1428", "نظام القضاء الصادر بالمرسوم الملكي رقم (م/78) وتاريخ 1428/09/19ه — المادة 1"),
    "article:basic-law-of-governance-shura-edition__art-46": bulkItem("article:basic-law-of-governance-shura-edition__art-46", "basic-law-of-governance-shura-edition", "النظام الأساسي للحكم — المادة 46"),
    "article:basic-law-of-governance__art-46": bulkItem("article:basic-law-of-governance__art-46", "basic-law-of-governance", "النظام الأساسي للحكم — المادة 46"),
    "article:judiciary-law__art-1": bulkItem("article:judiciary-law__art-1", "judiciary-law", "نظام القضاء — المادة 1"),
  },
  articles: {
    "judiciary-law__art-1": [
      ["IMPLEMENTED_BY", "out", 9, [["article:judiciary-diwan-mazalim-executive-mechanism__art-1", 0], ["article:judiciary-diwan-mazalim-executive-mechanism__art-2", 0]]],
      ["SIMILAR_TO", "out", 2, [["article:law-of-the-judiciary-1428__art-1", 0], ["article:basic-law-of-governance-shura-edition__art-46", 0]]],
      ["SIMILAR_TO", "in", 14, [["article:judiciary-diwan-mazalim-executive-mechanism__art-2", 0], ["article:basic-law-of-governance__art-46", 0], ["article:judiciary-diwan-mazalim-executive-mechanism__art-7", 0]]],
      // a stray link of the article onto itself (any type): never shown
      ["CITES_ARTICLE", "out", 1, [["article:judiciary-law__art-1", 0]]],
    ],
  },
};

test("§3 the owner's screenshot: judiciary-law art 1 never lists itself — nor its copy law-of-the-judiciary-1428 art 1", () => {
  const out = cleanLawLinks(JUDICIARY, "judiciary-law", "نظام القضاء");
  const groups = out.articles["judiciary-law__art-1"];
  const keys = groups.flatMap((g) => g[3].map(([k]) => k));
  assert.ok(!keys.includes("article:judiciary-law__art-1"), "its own key, in any group");
  assert.ok(!keys.includes("article:law-of-the-judiciary-1428__art-1"), "the same article in another copy of the law");
  assert.equal(out.items["article:judiciary-law__art-1"], undefined, "a node nobody lists is dropped");
  assert.equal(out.items["article:law-of-the-judiciary-1428__art-1"], undefined);
  // the similar groups: one, deduped against the legal links (art-2 is an implementing article already), at most three
  const sim = groups.filter((g) => g[0] === "SIMILAR_TO");
  assert.equal(sim.length, 1);
  assert.deepEqual(sim[0][3].map(([k]) => k), [
    "article:basic-law-of-governance-shura-edition__art-46",
    "article:basic-law-of-governance__art-46",
    "article:judiciary-diwan-mazalim-executive-mechanism__art-7",
  ]);
  assert.equal(sim[0][2], 3, "the total is what is shown — never «عرض الكل (١٦)»");
  assert.ok(sim[0][3].length <= SIMILAR_MAX);
  // the legal group keeps the graph's true total
  assert.deepEqual(groups.find((g) => g[0] === "IMPLEMENTED_BY")!.slice(0, 3), ["IMPLEMENTED_BY", "out", 9]);
  // and the client's expansion of it never shows the article itself either
  const box = expandLawLinks(JUDICIARY, "judiciary-law__art-1");
  assert.ok(!box.sections.legislation.items.some((i) => i.key === "article:judiciary-law__art-1"));
});

test("§3 copies of one law: the issuing part and a bracket do not make another law; different names stay different", () => {
  assert.equal(lawBaseTitle("نظام القضاء الصادر بالمرسوم الملكي رقم (م/78) وتاريخ 1428/09/19ه — المادة 1"), "نظام القضاء");
  assert.equal(lawBaseTitle("نظام القضاء"), "نظام القضاء");
  assert.equal(lawBaseTitle("النظام الأساسي للحكم (طبعة)"), "النظام الاساسي للحكم");
  assert.equal(lawBaseTitle("نظام"), "", "too short to compare");
  const copy = { docKind: "law" as const, docId: "law-of-the-judiciary-1428", title: "نظام القضاء الصادر بالمرسوم الملكي — المادة 1" };
  assert.equal(isSameLawOrCopy(copy, "judiciary-law", lawBaseTitle("نظام القضاء")), true);
  assert.equal(isSameLawOrCopy({ ...copy, title: "نظام ديوان المظالم — المادة 1" }, "judiciary-law", lawBaseTitle("نظام القضاء")), false);
  assert.equal(isSameLawOrCopy({ ...copy, docKind: "collection" }, "judiciary-law", lawBaseTitle("نظام القضاء")), false);
  assert.equal(isSameLawOrCopy(copy, "judiciary-law", ""), false, "the law's title unknown: only its own slug counts");
  assert.equal(isSameLawOrCopy({ ...copy, docId: "judiciary-law" }, "judiciary-law", ""), true);
});

test("§3 one article's answer (?article=): its own key out of every section; a legal link to a law of the same name stays", () => {
  const refs = { found: true, sections: emptySections() };
  refs.sections.legislation = {
    total: 3,
    items: [
      item({ key: "article:a1", docId: "labor", anchorId: "a1" }),
      // a repealed old edition's counterpart shares the name: a legal link, kept
      item({ key: "article:old__art-5", docId: "labor-old", title: "نظام العمل — المادة 5", linkType: "REPLACED_BY", direction: "in", status: "repealed", anchorId: "old__art-5" }),
      item({ key: "article:reg__art-2", docId: "reg", title: "اللائحة التنفيذية لنظام العمل — المادة 2", linkType: "IMPLEMENTED_BY", anchorId: "reg__art-2" }),
    ],
  };
  refs.sections.similar = {
    total: 5,
    items: [
      item({ key: "article:labor-copy__art-1", docId: "labor-copy", title: "نظام العمل الصادر بالمرسوم — المادة 1", linkType: "SIMILAR_TO", section: "similar" }),
      item({ key: "article:reg__art-2", docId: "reg", title: "اللائحة التنفيذية لنظام العمل — المادة 2", linkType: "SIMILAR_TO", section: "similar" }),
      item({ key: "article:c__art-1", docId: "c", title: "نظام ج — المادة 1", linkType: "SIMILAR_TO", section: "similar" }),
      item({ key: "article:d__art-1", docId: "d", title: "نظام د — المادة 1", linkType: "SIMILAR_TO", section: "similar" }),
      item({ key: "article:e__art-1", docId: "e", title: "نظام هـ — المادة 1", linkType: "SIMILAR_TO", section: "similar" }),
      item({ key: "article:f__art-1", docId: "f", title: "نظام و — المادة 1", linkType: "SIMILAR_TO", section: "similar" }),
    ],
  };
  const out = cleanArticleRefs(refs, "a1", "labor", "نظام العمل");
  assert.deepEqual(out.sections.legislation.items.map((i) => i.key), ["article:old__art-5", "article:reg__art-2"]);
  assert.equal(out.sections.legislation.total, 2);
  assert.deepEqual(out.sections.similar.items.map((i) => i.key), ["article:c__art-1", "article:d__art-1", "article:e__art-1"]);
  assert.equal(out.sections.similar.total, 3);
});

test("§4/§5 order: other documents first, the repealed after them, this law's own last; meaning-changing → regulation → reference …", () => {
  const law = "labor";
  const items = [
    item({ key: "own-cite", docId: law, anchorId: "labor__art-9", linkType: "CITES_ARTICLE" }),
    item({ key: "pen", linkType: "PENALIZES" }),
    item({ key: "cite-amended", linkType: "CITES_ARTICLE", status: "amended", anchorId: "x__art-2", docId: "x" }),
    item({ key: "cite-3", linkType: "CITES_ARTICLE", anchorId: "x__art-3", docId: "x" }),
    item({ key: "cite-1", linkType: "CITES_ARTICLE", anchorId: "x__art-1", docId: "x" }),
    item({ key: "reg", linkType: "IMPLEMENTED_BY" }),
    item({ key: "gone", linkType: "REPLACED_BY", direction: "in", status: "repealed" }),
    item({ key: "amend", kind: "decree", docKind: "order", linkType: "AMENDS_ARTICLE", direction: "in", status: null }),
    item({ key: "in-force", linkType: "REPLACED_BY", direction: "out" }),
    item({ key: "exempt", linkType: "EXEMPTS_FROM" }),
    item({ key: "subject", linkType: "SUBJECT_TO" }),
    item({ key: "own-gone", docId: law, status: "repealed" }),
  ];
  assert.deepEqual(sortRefItems(items, law).map((i) => i.key), [
    "in-force", "amend", "reg", "cite-1", "cite-3", "cite-amended", "exempt", "subject", "pen", "gone", "own-cite", "own-gone",
  ]);
  assert.equal(compareRefItems(items[0], items[0], law), 0);
  assert.equal(refArticleNumber("judiciary-law__art-12"), 12);
  assert.equal(refArticleNumber("COLL-1__pr-5"), null);
  // every reader type has a place in the display order
  assert.deepEqual([...READER_DISPLAY_ORDER].sort(), [...SHOWN_LINK_TYPES].sort());
  // orderRefs leaves the similar section in its closest-first order
  const refs = { sections: emptySections() };
  refs.sections.similar = { total: 2, items: [item({ key: "s2", section: "similar", linkType: "SIMILAR_TO", status: "repealed" }), item({ key: "s1", section: "similar", linkType: "SIMILAR_TO" })] };
  assert.deepEqual(orderRefs(refs, law).sections.similar.items.map((i) => i.key), ["s2", "s1"]);
});

test("§6.4 the box's parts: other documents, then «في هذا النظام» with no extra fold; the repealed at the end of each part", () => {
  const law = "labor";
  const pool = new Map<string, RefItem>([
    ["a", item({ key: "a", linkType: "CITES_ARTICLE" })],
    ["b-gone", item({ key: "b-gone", linkType: "CITES_ARTICLE", status: "repealed" })],
    ["own", item({ key: "own", linkType: "CITES_ARTICLE", docId: law })],
    ["reg", item({ key: "reg", linkType: "IMPLEMENTED_BY" })],
    ["own-reg", item({ key: "own-reg", linkType: "IMPLEMENTED_BY", docId: law })],
  ]);
  const groups: RefGroupOut[] = [
    { linkType: "CITES_ARTICLE", direction: "out", relation: "تحيل إليها هذه المادة", section: "legislation", total: 3, keys: ["b-gone", "own", "a"] },
    { linkType: "IMPLEMENTED_BY", direction: "out", relation: "مادة لائحية تنفّذها", section: "legislation", total: 2, keys: ["own-reg", "reg"] },
  ];
  const parts = arrangeSection(groups, (_g, k) => pool.get(k), law);
  assert.deepEqual(parts.outside.map((p) => [p.group.linkType, p.keys]), [
    ["IMPLEMENTED_BY", ["reg"]],
    ["CITES_ARTICLE", ["a"]],
    ["CITES_ARTICLE", ["b-gone"]],
  ]);
  assert.deepEqual(parts.inside.map((p) => [p.group.linkType, p.keys]), [
    ["IMPLEMENTED_BY", ["own-reg"]],
    ["CITES_ARTICLE", ["own"]],
  ]);
});

test("§5/§6.4 regulation badge and the quick filters", () => {
  assert.equal(isRegulationRef(item({ key: "r", linkType: "IMPLEMENTED_BY", direction: "out" })), true);
  assert.equal(isRegulationRef(item({ key: "r", linkType: "IMPLEMENTED_BY", direction: "in", title: "نظام القضاء — المادة 1" })), false);
  assert.equal(isRegulationRef(item({ key: "r", linkType: "PARENT_LAW", direction: "in" })), true);
  assert.equal(isRegulationRef(item({ key: "r", title: "اللائحة التنفيذية لنظام العمل — المادة 3" })), true);
  assert.equal(isRegulationRef(item({ key: "r", title: "آلية العمل التنفيذية لنظام القضاء — المادة 7" })), true);
  assert.equal(isRegulationRef(item({ key: "r", title: "نظام العمل ولوائحه التنفيذية — المادة 3" })), false, "a «نظام» is never a regulation");
  assert.equal(isRegulationRef(item({ key: "r", kind: "principle", title: "اللائحة" })), false);
  const repealed = item({ key: "x", status: "repealed" });
  assert.equal(refMatchesFilter(repealed, "repealed"), true);
  assert.equal(refMatchesFilter(repealed, "all"), true);
  assert.equal(refMatchesFilter(item({ key: "x", linkType: "AMENDS_ARTICLE" }), "amending"), true);
  assert.equal(refMatchesFilter(item({ key: "x", section: "judicial", linkType: "INTERPRETS_ARTICLE" }), "judicial"), true);
  assert.equal(refMatchesFilter(item({ key: "x" }), "judicial"), false);
});

test("§14 the cache: bounded, expires, refreshes on a hit; the key carries the link types (the similar switch)", () => {
  let now = 0;
  const c = createTtlCache<number>(2, 1000, () => now);
  c.set("a", 1);
  c.set("b", 2);
  assert.equal(c.get("a"), 1, "a hit moves «a» to the end");
  c.set("c", 3);
  assert.equal(c.get("b"), undefined, "the oldest goes first");
  assert.equal(c.size, 2);
  now = 1000;
  assert.equal(c.get("a"), undefined, "expired");
  assert.notEqual(linksCacheKey("bulk", "labor", null, ["CITES_ARTICLE"]), linksCacheKey("bulk", "labor", null, ["CITES_ARTICLE", "SIMILAR_TO"]));
  assert.equal(linksCacheKey("article", "labor", "a1", ["B", "A"]), linksCacheKey("article", "labor", "a1", ["A", "B"]));
  assert.equal(serverTiming([["gate", 12.345], ["graph", 800]], "miss"), 'gate;dur=12.3, graph;dur=800, cache;desc="miss"');
});

test("§14 route contract: the guard runs before the cache; errors and «available: false» are never kept; masked on every request", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const gate = route.indexOf("const gate = await libraryGate();");
  assert.ok(gate > 0 && gate < route.indexOf("bulkCache.get(key)") && gate < route.indexOf("articleCache.get(key)"));
  assert.match(route, /if \(shapedLaw\.found && lawTitle\) bulkCache\.set\(key, shapedLaw\);/);
  assert.match(route, /if \(lawTitle\) articleCache\.set\(key, out\);/);
  assert.match(route, /'Server-Timing': timing/);
  assert.match(route, /cleanLawLinks\(shapeLawLinks\(data, slug, types, safeArticleStatus, lawStatusForDetail, autoTagOn\), slug, lawTitle\)/);
  // the cache never holds a masked answer: the mask runs after every get
  assert.doesNotMatch(route, /Cache\.set\([^)]*maskDecreeTitlesForViewer/);
  const cache = readFileSync(new URL("./_cache.ts", import.meta.url), "utf8");
  assert.match(cache, /export const LINKS_CACHE_TTL_MS = 10 \* 60 \* 1000;/);
});
