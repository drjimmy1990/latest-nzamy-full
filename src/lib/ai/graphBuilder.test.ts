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
  buildPrincipleGraphNodes,
  extractArticleEdges,
  extractConceptEdges,
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
