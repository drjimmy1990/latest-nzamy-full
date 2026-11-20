/**
 * ownerLinks.test.ts — the owner's frontmatter links, every shape his files use.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/library/ownerLinks.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ARTICLE_TEXT_MAX,
  ARTICLES_MAX,
  describeOwnerLinkCut,
  extractOwnerLinks,
  NAME_MAX,
  OWNER_LINKS_MAX,
  parseOwnerLinks,
  type OwnerLinkCut,
} from "./ownerLinks.ts";

const PATH = "01_المكتبة_القانونية/أنظمة ولوائح/02 - القسم الإداري/نظام الإحصاءات العامة للدولة/نظام الإحصاءات العامة للدولة_هيئة_الخبراء.md";
const resolvePath = (p: string) => (p === PATH ? { slug: "statistics-law-1379", id: "LAW-02-0100" } : undefined);

test("registry ids, slugs, guids and titles are kept as stated, by kind", () => {
  const links = extractOwnerLinks({
    superseded_by: "LAW-00-1161",
    superseded_by_registry_id: "LAW-00-1161",
    repealed_by: "نظام التوثيق الصادر بالمرسوم الملكي رقم (م/164) وتاريخ 1441/11/19هـ ولائحته التنفيذية",
    repeals_slug: "volunteer-work-law",
    supersedes: "c81ba2f1-1bf1-443b-9b1c-a9a700f27110",
    related_laws: ["نظام الدفاع المدني"],
    title: "ignored",
    editorial_notes: "never read",
  });
  assert.deepEqual(links, [
    { kind: "superseded_by", id: "LAW-00-1161" },
    { kind: "repealed_by", name: "نظام التوثيق الصادر بالمرسوم الملكي رقم (م/164) وتاريخ 1441/11/19هـ ولائحته التنفيذية" },
    { kind: "supersedes", guid: "c81ba2f1-1bf1-443b-9b1c-a9a700f27110" },
    { kind: "repeals", slug: "volunteer-work-law" },
    { kind: "related", name: "نظام الدفاع المدني" },
  ]);
});

test("a path becomes the target file's slug and id; «؛ و…» separates two titles; an id keeps no trailing note", () => {
  const links = extractOwnerLinks(
    {
      supersedes: `نظام الإحصاءات العامة للدولة (المرسوم الملكي رقم 23 وتاريخ 7/12/1379هـ) — ${PATH}؛ ونظام تعداد السكان العام (المرسوم الملكي رقم م/13)`,
      repealed_by: "LAW-00-0114 (نظام التنفيذ ولائحته - جمعية قضاء_جمعية_قضاء.md، بنفس المجلد) — هذا النظام يحل محله",
    },
    resolvePath,
  );
  assert.deepEqual(links, [
    { kind: "repealed_by", id: "LAW-00-0114" },
    {
      kind: "supersedes",
      slug: "statistics-law-1379",
      id: "LAW-02-0100",
      name: "نظام الإحصاءات العامة للدولة (المرسوم الملكي رقم 23 وتاريخ 7/12/1379هـ)",
    },
    { kind: "supersedes", name: "نظام تعداد السكان العام (المرسوم الملكي رقم م/13)" },
  ]);
});

test("affected_laws: objects with names, files, guids and article texts; strings split on «؛»; empty values dropped", () => {
  const links = extractOwnerLinks(
    {
      affected_laws: [
        { name: "نظام التنفيذ (المرسوم الملكي رقم م/53 وتاريخ 13/8/1433هـ)", affected_articles: ["46", 47, "", null] },
        { name: "نظام رسوم الأراضي البيضاء", boe_guid: "6932E745-0F61-4F25-9E4A-A9A700F21D6B" },
        { law_name: "نظام التقاعد المدني", amended_articles: ["23"], added_articles: ["23 مكرر"] },
        { name: "الأوسمة", law_file: PATH, affected_articles: [] },
        { name: "", law_file: "" },
        "null",
      ],
    },
    resolvePath,
  );
  assert.deepEqual(links, [
    { kind: "affects", name: "نظام التنفيذ (المرسوم الملكي رقم م/53 وتاريخ 13/8/1433هـ)", articles: ["46", "47"] },
    { kind: "affects", name: "نظام رسوم الأراضي البيضاء", guid: "6932e745-0f61-4f25-9e4a-a9a700f21d6b" },
    { kind: "affects", name: "نظام التقاعد المدني", articles: ["23", "23 مكرر"] },
    { kind: "affects", name: "الأوسمة", slug: "statistics-law-1379", id: "LAW-02-0100" },
  ]);
  assert.deepEqual(
    extractOwnerLinks({ affected_laws: "نظام الطوارئ الصادر بالمرسوم الملكي رقم (م/89)؛ نظام المرافعات أمام ديوان المظالم" }).map((l) => l.name),
    ["نظام الطوارئ الصادر بالمرسوم الملكي رقم (م/89)", "نظام المرافعات أمام ديوان المظالم"],
  );
  for (const blank of [null, "", "null", [], ["", null]]) {
    assert.deepEqual(extractOwnerLinks({ superseded_by: blank, affected_laws: blank }), []);
  }
});

test("only `affects` keeps articles; duplicates collapse; the list is capped", () => {
  assert.deepEqual(extractOwnerLinks({ repeals: [{ name: "نظام قديم", affected_articles: ["1"] }] }), [{ kind: "repeals", name: "نظام قديم" }]);
  assert.equal(extractOwnerLinks({ superseded_by: "LAW-00-1", superseded_by_registry_id: "LAW-00-1" }).length, 1);
  const many = Array.from({ length: OWNER_LINKS_MAX + 20 }, (_, i) => `نظام رقم ${i}`);
  assert.equal(extractOwnerLinks({ related_laws: many }).length, OWNER_LINKS_MAX);
});

test("owner package 19 Nov, item 1.3: the caps are 500 links per file and 300 articles per link", () => {
  assert.equal(OWNER_LINKS_MAX, 500);
  assert.equal(ARTICLES_MAX, 300);
  assert.equal(NAME_MAX, 300);
  assert.equal(ARTICLE_TEXT_MAX, 80);
});

test("item 1.3: 48 affected_laws give 48 links, and nothing is reported cut", () => {
  const cuts: OwnerLinkCut[] = [];
  const affected = Array.from({ length: 48 }, (_, i) => ({ name: `نظام رقم ${i + 1}`, affected_articles: [String(i + 1)] }));
  const links = extractOwnerLinks({ affected_laws: affected }, undefined, (c) => cuts.push(c));
  assert.equal(links.length, 48);
  assert.equal(links[47].name, "نظام رقم 48");
  assert.deepEqual(cuts, []);
});

test("item 1.3: 501 links keep 500 and report one cut line; the list is the same without a reporter", () => {
  const cuts: OwnerLinkCut[] = [];
  const meta = { affected_laws: Array.from({ length: 501 }, (_, i) => `نظام رقم ${i + 1}`) };
  const links = extractOwnerLinks(meta, undefined, (c) => cuts.push(c));
  assert.equal(links.length, 500);
  assert.deepEqual(cuts, [{ what: "links", kept: 500, dropped: 1 }]);
  assert.equal(describeOwnerLinkCut(cuts[0]), "1 link(s) beyond the cap of 500 not kept (500 kept)");
  assert.deepEqual(extractOwnerLinks(meta), links);
});

test("item 1.3: links past the cap are counted across keys, duplicates once", () => {
  const cuts: OwnerLinkCut[] = [];
  const meta = {
    affected_laws: Array.from({ length: 500 }, (_, i) => `نظام رقم ${i + 1}`),
    related_laws: ["نظام زائد", "نظام زائد", "LAW-00-0001"],
  };
  assert.equal(extractOwnerLinks(meta, undefined, (c) => cuts.push(c)).length, 500);
  assert.deepEqual(cuts, [{ what: "links", kept: 500, dropped: 2 }]);
});

test("item 1.3: articles beyond 300, a long title and a long article text are reported", () => {
  const cuts: OwnerLinkCut[] = [];
  const longName = `نظام ${"ا".repeat(400)}`;
  const links = extractOwnerLinks(
    {
      affected_laws: [
        { name: "نظام الأحوال", affected_articles: Array.from({ length: 302 }, (_, i) => String(i + 1)) },
        { name: longName, affected_articles: ["م".repeat(90)] },
      ],
    },
    undefined,
    (c) => cuts.push(c),
  );
  assert.equal(links[0].articles?.length, 300);
  assert.equal(links[1].name?.length, 300);
  assert.equal(links[1].articles?.[0].length, 80);
  assert.deepEqual(
    cuts.map((c) => c.what),
    ["articles", "name", "article_text"],
  );
  assert.deepEqual(cuts[0], { what: "articles", link: "نظام الأحوال", kept: 300, dropped: 2 });
  assert.match(describeOwnerLinkCut(cuts[1]), /a title of \d+ characters shortened to 300/);
  assert.match(describeOwnerLinkCut(cuts[2]), /an article text of 90 characters shortened to 80/);
});

test("parseOwnerLinks reads the stored jsonb back and drops what is malformed", () => {
  assert.deepEqual(parseOwnerLinks(null), []);
  assert.deepEqual(
    parseOwnerLinks([
      { kind: "affects", name: " نظام ", articles: ["5", 6, {}] },
      { kind: "invented", name: "x" },
      { kind: "repeals" },
      "junk",
      { kind: "superseded_by", guid: "ABC" },
    ]),
    [
      { kind: "affects", name: "نظام", articles: ["5", "6"] },
      { kind: "superseded_by", guid: "abc" },
    ],
  );
});

test("an editorial note or a bracketed aside never reaches the stored name; a decree number in brackets stays", () => {
  assert.deepEqual(
    extractOwnerLinks({
      superseded_by: "نظام باء (ملاحظة المحرر: الإلغاء جزئي ولم يُتحقق منه بعد)",
      repealed_by: "نظام التوثيق الصادر بالمرسوم الملكي رقم (م/164) — ملاحظة: يراجع",
      related_laws: ["لائحة كتاب العدل (القديمة)"],
    }),
    [
      { kind: "superseded_by", name: "نظام باء" },
      { kind: "repealed_by", name: "نظام التوثيق الصادر بالمرسوم الملكي رقم (م/164)" },
      { kind: "related", name: "لائحة كتاب العدل" },
    ],
  );
});

test("owner file 18 («خامساً» 5): affected_laws reads `law_id` — the target's registry id, stated outright", () => {
  const links = extractOwnerLinks({
    affected_laws: [
      { name: "نظام القضاء", law_id: "LAW-00-0897", affected_articles: ["5"] },
      { law_id: "LAW-00-0114" },
      { name: "LAW-09-0001 (عنوان)", law_id: "LAW-09-0002" },
      { name: "نظام باء", law_id: "غير متوفر" },
      { law_id: "null" },
    ],
  });
  assert.deepEqual(links, [
    { kind: "affects", name: "نظام القضاء", id: "LAW-00-0897", articles: ["5"] },
    { kind: "affects", id: "LAW-00-0114" },
    { kind: "affects", id: "LAW-09-0002" },
    { kind: "affects", name: "نظام باء" },
  ]);
});
