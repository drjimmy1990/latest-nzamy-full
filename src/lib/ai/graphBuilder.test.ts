/**
 * graphBuilder.test.ts — TDD suite for Deterministic Saudi Legal GraphRAG
 * Node, Contextual Header, SHA-256 Content Vault Key, Arabic Ordinal Article
 * Parser, and Typed Legal Edge Extractor across all 4 library corpora.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArticleGraphNodes,
  buildCuratedConceptNodes,
  buildDecreeGraphNodes,
  buildEmbeddingInput,
  buildFeqhGraphNodes,
  buildLawStructure,
  buildPrincipleGraphNodes,
  extractArticleEdges,
  resolveParentLawSlugs,
  extractConceptEdges,
  extractDecreeAmendmentEdges,
  findArticleMentions,
  readArticleNumbers,
  extractPrincipleInterpretationEdges,
  parseArabicArticleNumber,
  type LawIndexMap,
} from "./graphBuilder.ts";

test("parseArabicArticleNumber parses Latin digits, Arabic-Indic digits, and spelled-out Arabic statutory ordinals", () => {
  assert.equal(parseArabicArticleNumber("77"), 77);
  assert.equal(parseArabicArticleNumber("٧٧"), 77);
  assert.equal(parseArabicArticleNumber("الأولى"), 1);
  assert.equal(parseArabicArticleNumber("الثانية عشرة"), 12);
  assert.equal(parseArabicArticleNumber("العشرين"), 20);
  assert.equal(parseArabicArticleNumber("السابعة والسبعين"), 77);
  assert.equal(parseArabicArticleNumber("الثمانين"), 80);
  assert.equal(parseArabicArticleNumber("التاسعة بعد المائة"), 109);
  assert.equal(parseArabicArticleNumber("الرابعة والخمسين بعد المائتين"), 254);
});

test("buildArticleGraphNodes scrubs audit notes, fuses ONLY non-empty active regulations, and respects page-numbered docs", () => {
  const nodes = buildArticleGraphNodes({
    law: {
      slug: "labor-law",
      title: "نظام العمل",
      type: "نظام",
      status: "active",
    },
    chaptersById: new Map([["ch-5", "الباب الخامس: علاقات العمل"]]),
    articles: [
      {
        id: "labor-law__art-77",
        law_slug: "labor-law",
        chapter_id: "ch-5",
        number: "77",
        number_text: "المادة السابعة والسبعون",
        heading: "التعويض عن الإنهاء غير المشروع",
        text: "يستحق الطرف المتضرر تعويضاً.\nتصحيح 2026-08-14 (جولة تدقيق منهجي): راجع سجل المشاكل ف1072.",
        status: "active",
      },
    ],
    regulationsByArticleId: new Map([
      [
        "labor-law__art-77",
        [
          { id: "r-empty", article_id: "labor-law__art-77", text: "   ", status: "active" },
          { id: "r-repealed", article_id: "labor-law__art-77", text: "نص ملغى لا يدمج", status: "repealed" },
          { id: "r-active", article_id: "labor-law__art-77", text: "تحدد اللائحة ضوابط احتساب الأجر الفعلي.", status: "active" },
        ],
      ],
    ]),
    amendmentsByArticleId: new Map([
      [
        "labor-law__art-77",
        [
          {
            article_id: "labor-law__art-77",
            summary: "عُدلت بالمرسوم الملكي رقم (م/46). تصحيح 2026-08-14: راجع سجل المشاكل ف99.",
          },
        ],
      ],
    ]),
  });

  assert.equal(nodes.length, 1);
  const n = nodes[0];
  assert.equal(n.node_key, "article:labor-law__art-77");
  assert.equal(n.article_number, 77);
  assert.equal(n.is_page_numbered, false);
  assert.equal(n.url, "/laws/labor-law#labor-law__art-77");
  assert.match(n.contextual_header, /نظام العمل/);
  assert.match(n.contextual_header, /الباب الخامس/);

  // Audit notes stripped!
  assert.doesNotMatch(n.display_text, /سجل المشاكل/);
  assert.doesNotMatch(n.display_text, /تصحيح 2026-08-14/);
  // Repealed regulation excluded, active non-empty regulation fused!
  assert.doesNotMatch(n.display_text, /نص ملغى لا يدمج/);
  assert.match(n.display_text, /اللائحة التنفيذية المرتبطة/);
  assert.match(n.display_text, /تحدد اللائحة ضوابط احتساب الأجر الفعلي/);
  assert.match(n.display_text, /م\/46/);
  assert.match(n.content_sha256, /^[0-9a-f]{64}$/);
  assert.ok(buildEmbeddingInput(n).includes(n.contextual_header));

  // Page-numbered document check
  const pageNodes = buildArticleGraphNodes({
    law: { slug: "guide-doc", title: "دليل إجرائي", type: "دليل", status: "active" },
    chaptersById: new Map(),
    articles: [
      { id: "guide__p1", law_slug: "guide-doc", number: "1", number_text: "الصفحة 1", text: "وفقاً للمادة (2) من هذا الدليل", status: "active" },
      { id: "guide__p2", law_slug: "guide-doc", number: "2", number_text: "الصفحة 2", text: "تفاصيل الصفحة الثانية", status: "active" },
    ],
    regulationsByArticleId: new Map(),
    amendmentsByArticleId: new Map(),
  });
  assert.equal(pageNodes[0].is_page_numbered, true);
  assert.match(pageNodes[0].title, /الصفحة 1/);
});

test("extractArticleEdges extracts EXEMPTS_FROM and CITES_ARTICLE (including Arabic ordinals) and skips page-numbered docs", () => {
  const lawMap: LawIndexMap = new Map([
    [
      "labor-law",
      {
        slug: "labor-law",
        title: "نظام العمل",
        normalizedTitle: "نظام العمل",
        articleKeyByNumber: new Map([
          [77, "article:labor-law__art-77"],
          [80, "article:labor-law__art-80"],
          [109, "article:labor-law__art-109"],
        ]),
        rootNodeKey: "article:labor-law__art-77",
      },
    ],
  ]);

  const edges = extractArticleEdges(
    {
      node_key: "article:labor-law__art-80",
      law_slug: "labor-law",
      is_page_numbered: false,
      display_text:
        "استثناءً من حكم المادة السابعة والسبعين، لا يجوز لصاحب العمل فسخ العقد دون مكافأة مع مراعاة الحقوق المقررة وفقاً للمادة (109).",
    },
    lawMap,
  );

  const exempts = edges.find((e) => e.edge_type === "EXEMPTS_FROM");
  assert.ok(exempts, "must extract EXEMPTS_FROM edge from spelled-out ordinal المادة السابعة والسبعين");
  assert.equal(exempts.source_key, "article:labor-law__art-80");
  assert.equal(exempts.target_key, "article:labor-law__art-77");

  const cites = edges.find((e) => e.edge_type === "CITES_ARTICLE");
  assert.ok(cites, "must extract CITES_ARTICLE edge from المادة (109)");
  assert.equal(cites.target_key, "article:labor-law__art-109");

  // Page-numbered guard -> 0 article citation edges
  const pageEdges = extractArticleEdges(
    {
      node_key: "article:guide__p1",
      law_slug: "labor-law",
      is_page_numbered: true,
      display_text: "وفقاً للمادة (77) استثناءً من حكم المادة (80)",
    },
    lawMap,
  );
  assert.equal(pageEdges.length, 0);
});

test("buildPrincipleGraphNodes, buildDecreeGraphNodes, buildFeqhGraphNodes, and extractPrincipleInterpretationEdges cover all remaining corpora", () => {
  const pNodes = buildPrincipleGraphNodes({
    collection: { id: "sup-1442", title: "مجموعة المبادئ العمالية", court_body: "المحكمة العليا" },
    principles: [
      {
        id: "sup-1442__p1",
        collection_id: "sup-1442",
        number: "15",
        text: "إنهاء عقد العمل غير محدد المدة دون سبب مشروع يوجب التعويض استناداً إلى المادة (77) من نظام العمل.",
        ruling_basis: "تطبيقاً لنص المادة السابعة والسبعين من نظام العمل.",
        court: "المحكمة العليا",
        track: "عمالي",
        hijri_year: 1442,
      },
    ],
  });
  assert.equal(pNodes.length, 1);
  assert.equal(pNodes[0].url, "/precedents/sup-1442#sup-1442__p1");

  const lawMap: LawIndexMap = new Map([
    [
      "labor-law",
      {
        slug: "labor-law",
        title: "نظام العمل",
        normalizedTitle: "نظام العمل",
        articleKeyByNumber: new Map([[77, "article:labor-law__art-77"]]),
        rootNodeKey: "article:labor-law__art-77",
      },
    ],
  ]);

  const interpEdges = extractPrincipleInterpretationEdges(pNodes[0], lawMap);
  assert.ok(
    interpEdges.some((e) => e.edge_type === "INTERPRETS_ARTICLE" && e.target_key === "article:labor-law__art-77"),
    "principle citing المادة (77) من نظام العمل must link via INTERPRETS_ARTICLE",
  );

  const dNodes = buildDecreeGraphNodes([
    {
      decree: {
        id: "m-46-1436",
        title: "المرسوم الملكي رقم م/46 بتعديل نظام العمل",
        type: "مرسوم ملكي",
        issuer: "الملك",
        summary_brief: "الموافقة على تعديلات نظام العمل.",
      },
      pages: [{ page_number: 1, content: "أولاً: الموافقة على تعديل المادة (77) من نظام العمل." }],
    },
  ]);
  assert.equal(dNodes.length, 1);
  assert.equal(dNodes[0].url, "/laws/orders/m-46-1436");

  const fNodes = buildFeqhGraphNodes({
    book: { id: "kashaf-qina", title: "كشاف القناع", author: "البهوتي", type: "sharia" },
    chaptersById: new Map([["ch-ijarah", "كتاب الإجارة"]]),
    blocks: [
      {
        id: "kashaf__b1",
        book_id: "kashaf-qina",
        chapter_id: "ch-ijarah",
        topic: "ضمان الأجير الخاص",
        matn: "والأجير الخاص من قُدّر نفعه بالزمن",
        sharh: "فلا يضمن ما تلف في يده بغير تعدٍّ ولا تفريط.",
      },
    ],
    includeFeqhVectors: false,
  });
  assert.equal(fNodes.length, 1);
  assert.equal(fNodes[0].is_embeddable, false);
  assert.equal(fNodes[0].url, "/book/kashaf-qina#kashaf__b1");

  const concepts = buildCuratedConceptNodes();
  assert.ok(concepts.length >= 25, "must include rich Saudi legal concept taxonomy");
  const conceptEdges = extractConceptEdges(lawMap);
  assert.ok(
    conceptEdges.some((e) => e.edge_type === "HAS_CONCEPT" && e.target_key === "article:labor-law__art-77"),
    "unfair-dismissal concept must link to article:labor-law__art-77 via HAS_CONCEPT",
  );
});

// ─── 2026-11-14 review fixes ──────────────────────────────────────────────────

function twoLaws(): LawIndexMap {
  return new Map([
    [
      "labor-law",
      {
        slug: "labor-law",
        title: "نظام العمل",
        normalizedTitle: "نظام العمل",
        instrumentId: "INS-LABOR",
        articleKeyByNumber: new Map([
          [5, "article:labor-law__art-5"],
          [77, "article:labor-law__art-77"],
        ]),
        rootNodeKey: "article:labor-law__art-1",
      },
    ],
    [
      "labor-reg",
      {
        slug: "labor-reg",
        title: "اللائحة التنفيذية لنظام العمل",
        normalizedTitle: "اللائحه التنفيذيه لنظام العمل",
        parentLawId: "INS-LABOR",
        enablingArticle: "المادة 5",
        articleKeyByNumber: new Map([
          [1, "article:labor-reg__art-1"],
          [5, "article:labor-reg__art-5"],
        ]),
        rootNodeKey: "article:labor-reg__art-1",
      },
    ],
  ]);
}

test("a reference to another, unresolved document never falls back to the same-numbered article of the current law", () => {
  const edges = extractArticleEdges(
    {
      node_key: "article:labor-reg__art-1",
      law_slug: "labor-reg",
      is_page_numbered: false,
      display_text: "وفقاً للمادة (5) من نظام المرافعات الشرعية",
    },
    twoLaws(),
  );
  assert.equal(edges.filter((e) => e.edge_type === "CITES_ARTICLE").length, 0);
});

test("«من نظام العمل» resolves to that law; «من هذا النظام» stays in the current one", () => {
  const map = twoLaws();
  const cross = extractArticleEdges(
    { node_key: "article:labor-reg__art-1", law_slug: "labor-reg", is_page_numbered: false, display_text: "وفقاً للمادة (77) من نظام العمل" },
    map,
  );
  assert.ok(cross.some((e) => e.edge_type === "CITES_ARTICLE" && e.target_key === "article:labor-law__art-77"));
  const own = extractArticleEdges(
    { node_key: "article:labor-reg__art-1", law_slug: "labor-reg", is_page_numbered: false, display_text: "وفقاً للمادة (5) من هذا النظام" },
    map,
  );
  assert.ok(own.some((e) => e.edge_type === "CITES_ARTICLE" && e.target_key === "article:labor-reg__art-5"));
});

test("the fused executive-regulation section is not read as the law's own references", () => {
  const edges = extractArticleEdges(
    {
      node_key: "article:labor-law__art-77",
      law_slug: "labor-law",
      is_page_numbered: false,
      display_text: ["التعويض عن الإنهاء.", "«اللائحة التنفيذية المرتبطة»:", "وفقاً للمادة (5) من هذه اللائحة"].join("\n\n"),
    },
    twoLaws(),
  );
  assert.equal(edges.length, 0);
});

test("PARENT_LAW: parent_law_id is a registry instrument_id, resolved to the parent's slug", () => {
  const map = twoLaws();
  resolveParentLawSlugs(map);
  assert.equal(map.get("labor-reg")?.parentLawId, "labor-law");
  const edges = extractArticleEdges(
    { node_key: "article:labor-reg__art-1", law_slug: "labor-reg", is_page_numbered: false, display_text: "تصدر هذه اللائحة" },
    map,
  );
  const parent = edges.find((e) => e.edge_type === "PARENT_LAW");
  assert.equal(parent?.target_key, "article:labor-law__art-5", "the enabling article of the parent law");
});

test("a decree, collection or book with no title still builds (no crash, non-blank title)", () => {
  const d = buildDecreeGraphNodes([{ decree: { id: "dec-x", title: null as unknown as string, summary_brief: "ملخص" }, pages: [] }]);
  assert.equal(d.length, 1);
  assert.ok(d[0].title.trim().length > 0);
  const p = buildPrincipleGraphNodes({
    collection: { id: "c", title: "" },
    principles: [{ id: "c__p1", collection_id: "c", principle_number: "1", text: "نص" }],
  });
  assert.ok(p[0].title.startsWith("مبادئ قضائية"));
});

// ─── 2026-11-15 graph depth: every way a text names an article ───────────────

test("readArticleNumbers: digits, Arabic-Indic, teens, compounds, duals, lists and capped ranges", () => {
  const nums = (s: string) => readArticleNumbers(s).numbers;
  assert.deepEqual(nums(" (5) من النظام"), [5]);
  assert.deepEqual(nums(" ١٢ من الاتفاقية"), [12]);
  assert.deepEqual(nums(" الخامسة عشرة"), [15]);
  assert.deepEqual(nums(" الثامنة عشر"), [18]);
  assert.deepEqual(nums(" (الحادية والعشرين)"), [21]);
  assert.deepEqual(nums(" التاسعة بعد المائة"), [109]);
  assert.deepEqual(nums(" الثالثة والعشرين بعد المائتين"), [223]);
  assert.deepEqual(nums(" الخامسة والسادسة"), [5, 6], "two units words are two articles, not 11");
  assert.deepEqual(nums(" الرابعة عشرة والخامسة عشرة"), [14, 15], "not 29");
  assert.deepEqual(nums(" (16) و(18) و (19)"), [16, 18, 19]);
  assert.deepEqual(nums(" (5، 6، 7)"), [5, 6, 7]);
  assert.deepEqual(nums(" من (3) إلى (7)"), [3, 4, 5, 6, 7]);
  assert.deepEqual(nums(" ٤ الى ٨"), [4, 5, 6, 7, 8]);
  assert.deepEqual(nums(" من 1 إلى 300"), [1, 300], "a range wider than 30 keeps its ends only");
  assert.deepEqual(nums("\n(١٤)"), [14], "the number may sit on the next line");
  assert.deepEqual(nums(" (5). والمادة (6)"), [5], "a sentence break ends the reference");
  assert.deepEqual(nums(" (5) من نظام العمل والمادة (6)"), [5], "«من …» ends the list");
  assert.deepEqual(nums(" السابقة"), []);
  assert.deepEqual(nums(" المخدرة الخامسة"), [], "the first word must be a number");
});

test("findArticleMentions: noun forms, diacritics, and the per-noun cap", () => {
  const m = (s: string) => findArticleMentions(s).map((x) => [x.kind, x.numbers]);
  assert.deepEqual(m("وفقاً للمادة الخامسة"), [["single", [5]]]);
  assert.deepEqual(m("بالمادّة (٧)"), [["single", [7]]]);
  assert.deepEqual(m("في المادتين (9) و (10) من اللائحة"), [["dual", [9, 10]]]);
  assert.deepEqual(m("أحكام المواد من (3) إلى (5)"), [["plural", [3, 4, 5]]]);
  assert.deepEqual(m("المادة (3) و(4)"), [["single", [3]]], "a singular noun names one article");
  assert.deepEqual(m("حيازة مادة مخدرة"), []);
  assert.deepEqual(m("المشار إليها في المادة السابقة"), []);
  assert.deepEqual(m("الموادّ الغذائية"), []);
});

test("bare spelled-out references and lists become CITES_ARTICLE / EXEMPTS_FROM edges", () => {
  const map = twoLaws();
  const cites = extractArticleEdges(
    { node_key: "article:labor-law__art-1", law_slug: "labor-law", is_page_numbered: false, display_text: "يطبق ما نصت عليه المادة الخامسة" },
    map,
  );
  assert.deepEqual(cites.map((e) => [e.edge_type, e.target_key]), [["CITES_ARTICLE", "article:labor-law__art-5"]]);

  const exempt = extractArticleEdges(
    {
      node_key: "article:labor-law__art-1",
      law_slug: "labor-law",
      is_page_numbered: false,
      display_text: "مع عدم الإخلال بالمادتين (5) و(77)، يلتزم صاحب العمل",
    },
    map,
  );
  assert.deepEqual(
    exempt.map((e) => [e.edge_type, e.target_key]).sort(),
    [
      ["EXEMPTS_FROM", "article:labor-law__art-5"],
      ["EXEMPTS_FROM", "article:labor-law__art-77"],
    ],
  );
  assert.ok(exempt.every((e) => e.evidence?.includes("الإخلال")));
});

test("a bare «من النظام» inside a regulation is its parent law; «من اللائحة» is the regulation itself", () => {
  const map = twoLaws();
  resolveParentLawSlugs(map);
  const toParent = extractArticleEdges(
    { node_key: "article:labor-reg__art-1", law_slug: "labor-reg", is_page_numbered: false, display_text: "مع مراعاة المادة (77) من النظام، تحدد" },
    map,
  );
  assert.ok(toParent.some((e) => e.edge_type === "CITES_ARTICLE" && e.target_key === "article:labor-law__art-77"));

  const own = extractArticleEdges(
    { node_key: "article:labor-reg__art-1", law_slug: "labor-reg", is_page_numbered: false, display_text: "الواردة في المادة (5) من اللائحة." },
    map,
  );
  assert.ok(own.some((e) => e.edge_type === "CITES_ARTICLE" && e.target_key === "article:labor-reg__art-5"));

  // A law that says «من الاتفاقية» cites a document it does not name: no edge.
  const treaty = extractArticleEdges(
    { node_key: "article:labor-law__art-1", law_slug: "labor-law", is_page_numbered: false, display_text: "دون مساس بالمادة ٥ من الاتفاقية، يتعين" },
    map,
  );
  assert.equal(treaty.filter((e) => e.edge_type === "CITES_ARTICLE").length, 0);
});

test("principles and decrees: lists, spelled numbers, and a regulation is never read as its law", () => {
  const map = twoLaws();
  const interp = extractPrincipleInterpretationEdges(
    { node_key: "principle:p1", display_text: "استناداً إلى المادتين (الخامسة) و(السابعة والسبعين) من نظام العمل" },
    map,
  );
  assert.deepEqual(interp.map((e) => e.target_key).sort(), ["article:labor-law__art-5", "article:labor-law__art-77"]);

  const lawOnly: LawIndexMap = new Map([["labor-law", map.get("labor-law")!]]);
  const regRef = extractPrincipleInterpretationEdges(
    { node_key: "principle:p2", display_text: "المادة (77) من اللائحة التنفيذية لنظام العمل" },
    lawOnly,
  );
  assert.equal(regRef.length, 0, "article 77 of the regulation is not article 77 of the law");

  const amends = extractDecreeAmendmentEdges(
    { node_key: "decree:d1", display_text: "تعديل المواد (5، 77) من نظام العمل لتكون بالنص الآتي" },
    map,
  );
  assert.deepEqual(amends.map((e) => [e.edge_type, e.target_key]).sort(), [
    ["AMENDS_ARTICLE", "article:labor-law__art-5"],
    ["AMENDS_ARTICLE", "article:labor-law__art-77"],
  ]);
  const notAmendment = extractDecreeAmendmentEdges(
    { node_key: "decree:d2", display_text: "وفقاً للمادة (77) من نظام العمل" },
    map,
  );
  assert.equal(notAmendment.length, 0, "only an amendment lead-in makes AMENDS_ARTICLE");
});

test("buildLawStructure: law + titled chapters (never embedded), PART_OF and NEXT_ARTICLE in reading order", () => {
  const law = { slug: "labor-law", title: "نظام العمل", type: "نظام", status: "active" };
  const articles = [
    { id: "a1", law_slug: "labor-law", chapter_id: "ch1", number: 1, text: "نص الأولى" },
    { id: "a2", law_slug: "labor-law", chapter_id: "ch1", number: 2, text: "نص الثانية" },
    { id: "a3", law_slug: "labor-law", chapter_id: "ch-untitled", number: 3, text: "نص الثالثة" },
    { id: "a4", law_slug: "labor-law", chapter_id: "ch2", number: 4, text: "" },
  ];
  const chaptersById = new Map([
    ["ch1", "الباب الأول: التعريفات"],
    ["ch-untitled", ""],
    ["ch2", "الباب الثاني"],
  ]);
  const articleNodes = buildArticleGraphNodes({
    law,
    chaptersById,
    articles,
    regulationsByArticleId: new Map(),
    amendmentsByArticleId: new Map(),
  });
  const { nodes, edges } = buildLawStructure({ law, chaptersById, articles, articleNodes });

  assert.deepEqual(
    nodes.map((n) => [n.node_key, n.node_type]),
    [
      ["law:labor-law", "law"],
      ["chapter:ch1", "chapter"],
    ],
    "an untitled chapter, and a chapter whose only article is empty, get no node",
  );
  assert.ok(nodes.every((n) => n.is_embeddable === false && n.display_text.trim().length > 0));
  assert.match(nodes[0].display_text, /عدد المواد: 3/);

  const of = (t: string) => edges.filter((e) => e.edge_type === t).map((e) => `${e.source_key}>${e.target_key}`);
  assert.deepEqual(of("PART_OF"), [
    "chapter:ch1>law:labor-law",
    "article:a1>chapter:ch1",
    "article:a2>chapter:ch1",
    "article:a3>law:labor-law",
  ]);
  assert.deepEqual(of("NEXT_ARTICLE"), ["article:a1>article:a2", "article:a2>article:a3"]);

  assert.deepEqual(buildLawStructure({ law, chaptersById, articles: [], articleNodes: [] }), { nodes: [], edges: [] });
});
