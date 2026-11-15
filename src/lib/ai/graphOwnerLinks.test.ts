/**
 * graphOwnerLinks.test.ts — the owner's links as graph links, resolved strictly.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/graphOwnerLinks.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { LawIndexEntry, LawIndexMap } from "./graphBuilder.ts";
import {
  buildOwnerLinkIndex,
  decreeTokens,
  formatOwnerLinkStats,
  newOwnerLinkStats,
  ownerArticleNumbers,
  ownerLinkEdges,
  ownerNameCore,
  resolveOwnerLinkTarget,
} from "./graphOwnerLinks.ts";

function law(slug: string, title: string, extra: Partial<LawIndexEntry> = {}): LawIndexEntry {
  return {
    slug,
    title,
    normalizedTitle: title,
    status: "active",
    lawNodeKey: `law:${slug}`,
    articleKeyByNumber: new Map([1, 2, 46].map((n) => [n, `article:${slug}__art-${n}`])),
    rootNodeKey: `article:${slug}__art-1`,
    ...extra,
  };
}

const exec1433 = law("execution-law", "نظام التنفيذ", { issuingInstrument: "مرسوم ملكي رقم م/53", instrumentId: "LAW-00-0114" });
const exec1447 = law("execution-law-1447", "نظام التنفيذ", { issuingInstrument: "مرسوم ملكي رقم م/237" });
const notary = law("notary-law", "نظام التوثيق", { lawGuid: "c81ba2f1-1bf1-443b-9b1c-a9a700f27110" });
const oldNotary = law("old-notary", "لائحة كتاب العدل", { status: "repealed" });
const forgeryOld = law("forgery-1380", "نظام مكافحة التزوير", { status: "repealed" });
const forgeryNew = law("forgery-1435", "النظام الجزائي لجرائم التزوير");
const lawMap: LawIndexMap = new Map([exec1433, exec1447, notary, oldNotary, forgeryOld, forgeryNew].map((l) => [l.slug, l]));
const idx = buildOwnerLinkIndex(lawMap.values());

test("names: decree details and «ولائحته التنفيذية» are not part of the title; decree numbers are read", () => {
  assert.equal(ownerNameCore("نظام التنفيذ (المرسوم الملكي رقم م/53 وتاريخ 13/8/1433هـ)"), "نظام التنفيذ");
  assert.equal(ownerNameCore("نظام التوثيق الصادر بالمرسوم الملكي رقم (م/164) وتاريخ 1441/11/19هـ ولائحته التنفيذية"), "نظام التوثيق");
  assert.deepEqual(decreeTokens("المرسوم الملكي رقم (م/53) وتاريخ ١٤٣٣"), ["م 53"]);
  assert.deepEqual(decreeTokens("قرار وزاري رقم (2268) وتاريخ 1443/08/20هـ"), ["2268"]);
});

test("resolution: slug, id, guid, one title, or the title + the decree number; otherwise counted, never guessed", () => {
  assert.equal(resolveOwnerLinkTarget({ kind: "affects", slug: "notary-law" }, idx, null).law?.slug, "notary-law");
  assert.equal(resolveOwnerLinkTarget({ kind: "affects", id: "law-00-0114" }, idx, null).law?.slug, "execution-law");
  assert.equal(resolveOwnerLinkTarget({ kind: "affects", guid: "C81BA2F1-1BF1-443B-9B1C-A9A700F27110" }, idx, null).law?.slug, "notary-law");
  assert.deepEqual(resolveOwnerLinkTarget({ kind: "affects", name: "نظام التنفيذ" }, idx, null), { law: null, why: "ambiguous" });
  const r = resolveOwnerLinkTarget({ kind: "affects", name: "نظام التنفيذ (المرسوم الملكي رقم م/53 وتاريخ 13/8/1433هـ)" }, idx, null);
  assert.equal(r.law?.slug, "execution-law");
  assert.equal(r.law && r.how, "title+decree");
  assert.deepEqual(resolveOwnerLinkTarget({ kind: "affects", name: "نظام غير موجود" }, idx, null), { law: null, why: "not_found" });
  // An unknown slug falls back to the other stated identities.
  assert.equal(resolveOwnerLinkTarget({ kind: "affects", slug: "renamed", name: "نظام التوثيق" }, idx, null).law?.slug, "notary-law");
});

test("article numbers: plain numbers and whole article phrases only", () => {
  assert.deepEqual(ownerArticleNumbers(["46", "٤٧", "المادة الثالثة", "المادتين 5 و6"]), { numbers: [46, 47, 3, 5, 6], unparsed: 0 });
  assert.deepEqual(ownerArticleNumbers(["23 مكرر", "الفقرات (هـ، و، ح) من (أولاً)", "تعديل اسم الضوابط"]), { numbers: [], unparsed: 3 });
  assert.deepEqual(ownerArticleNumbers(undefined), { numbers: [], unparsed: 0 });
});

test("a decree's affects → AMENDS_ARTICLE to each named article; law-level and other kinds make no link", () => {
  const stats = newOwnerLinkStats();
  const edges = ownerLinkEdges(
    { kind: "decree", nodeKey: "decree:d1" },
    [
      { kind: "affects", name: "نظام التنفيذ (المرسوم الملكي رقم م/53 وتاريخ 13/8/1433هـ)", articles: ["46", "999", "23 مكرر"] },
      { kind: "affects", name: "نظام التوثيق" },
      { kind: "repealed_by", name: "نظام التوثيق" },
      { kind: "related", name: "نظام التوثيق" },
    ],
    lawMap,
    idx,
    stats,
  );
  assert.deepEqual(
    edges.map((e) => [e.source_key, e.edge_type, e.target_key]),
    [["decree:d1", "AMENDS_ARTICLE", "article:execution-law__art-46"]],
  );
  assert.equal(edges[0].metadata?.source, "owner_links");
  assert.match(edges[0].evidence ?? "", /^بيانات المكتبة: يعدّل المادة 46 من/);
  assert.equal(stats.links, 4);
  assert.equal(stats.edges, 1);
  assert.equal(stats.articlesNotInLaw, 1);
  assert.equal(stats.lawLevel, 1);
  assert.equal(stats.decreeOther, 1);
  assert.equal(stats.related, 1);
  assert.match(formatOwnerLinkStats(stats), /owner links: 4 read, 1 graph links/);
});

test("supersession: newer → older between law nodes; a law still in force is not 'repealed by'; contradictions dropped", () => {
  const stats = newOwnerLinkStats();
  const fromOld = ownerLinkEdges(
    { kind: "law", law: forgeryOld },
    [{ kind: "repealed_by", name: "النظام الجزائي لجرائم التزوير الصادر بالمرسوم الملكي رقم (م/11) وتاريخ 1435/02/18هـ" }],
    lawMap,
    idx,
    stats,
  );
  assert.deepEqual(fromOld.map((e) => [e.source_key, e.edge_type, e.target_key]), [["law:forgery-1435", "SUPERSEDES_LAW", "law:forgery-1380"]]);

  const fromNew = ownerLinkEdges({ kind: "law", law: notary }, [{ kind: "repeals", name: "لائحة كتاب العدل" }], lawMap, idx, stats);
  assert.deepEqual(fromNew.map((e) => [e.source_key, e.target_key]), [["law:notary-law", "law:old-notary"]]);

  // Active law «superseded_by» something: not a repeal the library knows.
  assert.deepEqual(ownerLinkEdges({ kind: "law", law: exec1433 }, [{ kind: "superseded_by", slug: "execution-law-1447" }], lawMap, idx, stats), []);
  // A law in force stated as replaced, by a repealed law or by one in force; a link to itself.
  assert.deepEqual(ownerLinkEdges({ kind: "law", law: forgeryOld }, [{ kind: "supersedes", slug: "notary-law" }], lawMap, idx, stats), []);
  assert.deepEqual(ownerLinkEdges({ kind: "law", law: notary }, [{ kind: "supersedes", slug: "execution-law" }], lawMap, idx, stats), []);
  assert.deepEqual(ownerLinkEdges({ kind: "law", law: notary }, [{ kind: "repeals", slug: "execution-law" }], lawMap, idx, stats), []);
  assert.deepEqual(ownerLinkEdges({ kind: "law", law: notary }, [{ kind: "supersedes", slug: "notary-law" }], lawMap, idx, stats), []);
  assert.equal(stats.stillInForce, 4);
  assert.equal(stats.contradictory, 1);
  assert.equal(stats.edges, 2);
  // The evidence is the library's title, not the owner's wording.
  assert.equal(fromOld[0].evidence, `بيانات المكتبة: يحل محل: ${forgeryOld.title}`);
});

test("a law's own affects hang on its first article; malformed stored values are ignored", () => {
  const edges = ownerLinkEdges({ kind: "law", law: notary }, [{ kind: "affects", slug: "execution-law", articles: ["2"] }], lawMap, idx);
  assert.deepEqual(edges.map((e) => [e.source_key, e.target_key]), [["article:notary-law__art-1", "article:execution-law__art-2"]]);
  assert.deepEqual(ownerLinkEdges({ kind: "law", law: notary }, "junk", lawMap, idx), []);
});
