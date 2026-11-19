/**
 * Owner file 18 (our reply «خامساً» 1–4), parser → seeder on one small
 * synthetic file: one amendment = one card with its new fields, «مكرر»
 * articles keep a number and a stable id, and the frontmatter summaries load
 * (never `review_*`). The client is in-memory; nothing reaches a database.
 *
 *   node --import tsx --test scripts/parsers/parse-laws.amendment-cards.test.ts
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws, readArticleNumber, readLawSummaries } from "./parse-laws.ts";
import { articleBaseNum, mukarrarIdPart, seedLaws } from "../seed-library.ts";

type Row = Record<string, any>;

const anchor = (o: Record<string, unknown>) => `<!-- AMENDMENT ${JSON.stringify(o)} -->`;
const article = (number: string, numberText: string, body: string, status = "active") =>
  `<!-- ARTICLE_START ${JSON.stringify({ number, number_text: numberText, status })} -->\n${body}\n<!-- ARTICLE_END -->`;

function writeFixture(frontmatterExtra: string, articles: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-amendment-cards-"));
  const file = path.join(dir, "law.md");
  fs.writeFileSync(file, `---
id: LAW-TEST-0001
law_guid: ''
slug: test-amendment-cards
title: نظام اختباري للتعديلات
type: نظام
status: active
section_code: "00"
${frontmatterExtra}---
${articles.join("\n\n")}
`, "utf8");
  return file;
}

async function seed(parsed: Row): Promise<Map<string, Row[]>> {
  const inserted = new Map<string, Row[]>();
  const client = {
    async upsert(table: string, rows: Row[]) {
      inserted.set(table, [...(inserted.get(table) || []), ...rows]);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(client as never, parsed, false, errors, false);
  assert.deepEqual(errors, []);
  return inserted;
}

const AMENDED_ARTICLE = article("1", "الأولى", [
  "1. النص الحالي.",
  "<details>",
  "<summary>📜 الإصدارات السابقة</summary>",
  anchor({ type: "تعديل", decree: "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ", date: "1443/11/09", decree_id: null, paragraphs: "5", text_status: "available" }),
  "**🔄 تعديل:** عُدّلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113).",
  "**ونص الفقرة (5) قبل هذا التعديل:**",
  "نص الفقرة الخامسة قبل م/113.",
  "",
  anchor({ type: "تعديل", decree: "المرسوم الملكي رقم (م/6) وتاريخ 1440/01/02هـ", date: "1440/01/02", decree_id: "LAW-00-0002", paragraphs: "5، 7", text_status: "available" }),
  "**🔄 تعديل:** عُدّلت الفقرتان (5) و(7) بموجب المرسوم الملكي رقم (م/6).",
  "**ونص الفقرة (5) الأصلي قبل التعديل:**",
  "الأصل في الفقرة الخامسة.",
  "**ونص الفقرة (7) الأصلي قبل التعديل:**",
  "الأصل في الفقرة السابعة.",
  "",
  anchor({ type: "إلغاء", decree: "م/1", date: "1430/01/01", text_status: "unavailable" }),
  "**🔄 تعديل:** أُلغيت فقرة بموجب م/1.",
  "</details>",
].join("\n"), "amended");

test("one amendment = one card: date, decree, decree_id, paragraphs, text_status, position, description", async () => {
  const parsed = parseLaws(writeFixture("", [AMENDED_ARTICLE]));
  const art = parsed.laws[0].chapters[0].articles[0];
  assert.equal(art.amendments.length, 3, "three anchors → three cards (was 3 anchor cards + 3 text cards)");

  const [a, b, c] = art.amendments;
  assert.equal(a.date, "1443/11/09");
  assert.equal(a.original_text, "نص الفقرة الخامسة قبل م/113.");
  assert.equal(a.summary, "عُدّلت الفقرة (5) بموجب المرسوم الملكي رقم (م/113).");
  assert.equal(a.paragraphs, "5");
  assert.equal(a.decree_id, undefined, "decree_id null → absent");
  assert.equal(a.text_status, "available");

  assert.equal(b.decree_id, "LAW-00-0002");
  assert.equal(b.paragraphs, "5، 7");
  assert.equal(
    b.original_text,
    "ونص الفقرة (5) الأصلي قبل التعديل:\nالأصل في الفقرة الخامسة.\n\nونص الفقرة (7) الأصلي قبل التعديل:\nالأصل في الفقرة السابعة.",
    "two paragraphs of one decree: one card, each text under its label",
  );

  assert.equal(c.type, "إلغاء");
  assert.equal(c.text_status, "unavailable");
  assert.equal(c.original_text, undefined);

  for (const x of art.amendments) assert.ok(!x.summary.includes("الإصدارات السابقة"));

  const rows = (await seed(parsed as unknown as Row)).get("article_amendments") || [];
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
  assert.deepEqual(rows.map((r) => r.text_status), ["available", "available", "unavailable"]);
  assert.deepEqual(rows.map((r) => r.decree_id), [null, "LAW-00-0002", null]);
  assert.deepEqual(rows.map((r) => r.paragraphs), ["5", "5، 7", null]);
  assert.equal(rows[2].full_text, null);
  assert.equal(rows[0].source, "المرسوم الملكي رقم (م/113) وتاريخ 1443/11/09هـ");
});

test("«مكرر»: a number and a stable id from the label — not 0 and not the article's position", async () => {
  const articles = [
    article("23", "الثالثة والعشرون", "نص المادة 23."),
    article("23 مكرر", "الثالثة والعشرون مكرر", "نص المادة 23 مكرر."),
    article("٩ مكرر (٢)", "التاسعة مكرر (2)", "نص المادة 9 مكرر 2."),
    article("52", "التاسعة والأربعون مكرر", "مخالفة: رقم المادة التالية بدل «مكرر»."),
  ];
  const parsed = parseLaws(writeFixture("", articles));
  const arts = parsed.laws[0].chapters[0].articles;
  assert.equal(arts[1].number, 23);
  assert.equal(arts[1].number_label, "23 مكرر");
  assert.equal(arts[2].number, 9);
  assert.equal(arts[2].number_label, "9 مكرر 2");
  assert.equal(arts[3].number, 52, "a malformed «مكرر» is parsed as before (reported, never renumbered)");
  assert.equal(arts[3].number_label, undefined);
  assert.equal("number_label" in arts[0], false, "an ordinary article carries no new key");

  const rows = (await seed(parsed as unknown as Row)).get("articles") || [];
  assert.deepEqual(rows.map((r) => r.id), [
    "test-amendment-cards__art-23",
    "test-amendment-cards__art-23-mukarrar",
    "test-amendment-cards__art-9-mukarrar-2",
    "test-amendment-cards__art-52",
  ]);
  assert.deepEqual(rows.map((r) => r.number), ["23", "23 مكرر", "9 مكرر 2", "52"]);

  // Moving the «مكرر» article does not move its id (it used to be `__art-i<index>`).
  const moved = parseLaws(writeFixture("", [articles[1], articles[0]]));
  const movedRows = (await seed(moved as unknown as Row)).get("articles") || [];
  assert.equal(movedRows[0].id, "test-amendment-cards__art-23-mukarrar");
});

test("readArticleNumber: the one format, its variants, and what stays as before", () => {
  assert.deepEqual(readArticleNumber("23 مكرر"), { number: 23, number_label: "23 مكرر" });
  assert.deepEqual(readArticleNumber("23مكرر"), { number: 23, number_label: "23 مكرر" });
  assert.deepEqual(readArticleNumber("9 مكرر 2"), { number: 9, number_label: "9 مكرر 2" });
  assert.deepEqual(readArticleNumber("17"), { number: 17 });
  assert.deepEqual(readArticleNumber(4), { number: 4 });
  assert.equal(readArticleNumber(1, "الأولى مكرر").problem !== undefined, true);
  assert.equal(readArticleNumber("الرابعة مكرر ثانياً - منع الدخول").problem !== undefined, true);
  assert.equal(readArticleNumber("2/59").problem, undefined, "not a «مكرر» question");
  assert.equal(mukarrarIdPart("23 مكرر"), "23-mukarrar");
  assert.equal(mukarrarIdPart("9 مكرر 2"), "9-mukarrar-2");
  assert.equal(mukarrarIdPart("23"), null);
  assert.equal(articleBaseNum({ number: 0 }, [{}, { number: 0 }]), "i-1", "unchanged fallback for a missing article");
});

test("frontmatter summaries load into summary / summary_card / summary_status / summary_reviewed_at; review_* never", async () => {
  const long = "يتناول هذا النظام تنظيم القضاء ودرجات المحاكم واختصاصاتها وتعيين القضاة وترقيتهم وتأديبهم. ".repeat(4).trim();
  const parsed = parseLaws(writeFixture(`summary: |
  ${long}
summary_brief: "يتناول تنظيم المحاكم ودرجاتها وشؤون القضاة."
summary_status: "reviewed"
summary_reviewed_at: 2026-11-20
review_status: reviewed
`, [article("1", "الأولى", "نص.")]));
  const law = parsed.laws[0] as Row;
  assert.equal(law.summary, long);
  assert.equal(law.summary_brief, "يتناول تنظيم المحاكم ودرجاتها وشؤون القضاة.");
  assert.equal(law.summary_status, "reviewed");
  assert.equal(law.summary_reviewed_at, "2026-11-20", "an unquoted YAML date is read as the date it names");

  const row = ((await seed(parsed as unknown as Row)).get("laws") || [])[0];
  assert.equal(row.summary, long);
  assert.equal(row.summary_card, "يتناول تنظيم المحاكم ودرجاتها وشؤون القضاة.");
  assert.equal(row.summary_status, "reviewed");
  assert.equal(row.summary_reviewed_at, "2026-11-20");
  assert.equal("summary_brief" in row, false, "summary_brief is GENERATED — a row never carries it");
  assert.equal(Object.keys(row).some((k) => k.startsWith("review_")), false);
});

test("summaries: absent → null; a status or date outside the contract → null; placeholders are absent", async () => {
  const parsed = parseLaws(writeFixture(`summary: "غير متوفر"
summary_brief: null
summary_status: "approved"
summary_reviewed_at: "20/11/2026"
`, [article("1", "الأولى", "نص.")]));
  const row = ((await seed(parsed as unknown as Row)).get("laws") || [])[0];
  assert.equal(row.summary, null);
  assert.equal(row.summary_card, null);
  assert.equal(row.summary_status, null);
  assert.equal(row.summary_reviewed_at, null);

  const noFields = parseLaws(writeFixture("", [article("1", "الأولى", "نص.")]));
  const bare = ((await seed(noFields as unknown as Row)).get("laws") || [])[0];
  assert.deepEqual([bare.summary, bare.summary_card, bare.summary_status, bare.summary_reviewed_at], [null, null, null, null]);
});

test("readLawSummaries reports a draft with no status, a long brief and markup — and still loads the text", () => {
  const out = readLawSummaries({ summary_brief: `## عنوان\n${"س".repeat(260)}` }, "x.md");
  assert.equal(out.summary_brief?.startsWith("## عنوان"), true, "text is never cut or rewritten");
  assert.equal(out.summary_status, null);
});

test("an amendment block inside a regulation: the cards pair, the regulation keeps its history and the text after it, the live text stays clean", () => {
  const body = [
    "نص المادة الأولى من النظام.",
    "",
    '<!-- REGULATION {"instrument": "آلية تنفيذية", "ref": "آلية العمل", "regNum": "7", "status": "amended"} -->',
    "> **سابعاً:** نص البند السابع الحالي.",
    "> <details>",
    "> <summary>📜 الإصدارات السابقة</summary>",
    "> " + anchor({ type: "تعديل", decree: "م/113", date: "1443/11/09" }),
    "> > **🔄 تعديل:** عُدّلت الفقرة (5) بموجب م/113.",
    "> > **ونص الفقرة (5) قبل هذا التعديل:**",
    "> > النص القديم للفقرة الخامسة.",
    "> </details>",
    ">",
    "> #### المادة (6/75): `[مضافة]`",
    "> نص مادة لائحية تالية بلا مرساة خاصة بها.",
  ].join("\n");
  const parsed = parseLaws(writeFixture("", [article("1", "الأولى", body)]));
  const art = parsed.laws[0].chapters[0].articles[0];
  assert.equal(art.text, "نص المادة الأولى من النظام.", "no note, prior text or regulation text left in the live text");
  assert.equal(art.amendments.length, 1);
  assert.equal(art.amendments[0].original_text, "النص القديم للفقرة الخامسة.");
  assert.equal(art.regulations.length, 1);
  const reg = art.regulations[0].text;
  assert.ok(reg.includes("<details>") && reg.includes("</details>"), "the regulation's own history block stays whole");
  assert.ok(reg.includes("نص مادة لائحية تالية بلا مرساة خاصة بها."), "the text after the block stays with the regulation");
});
