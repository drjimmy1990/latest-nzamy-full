/**
 * Read-only regression proof for the source boundary documented in Raw_Vault
 * 15/26. The six inputs represent five source families; the real-estate pair
 * deliberately exercises both historical law slugs, for eleven seed rows.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { corpusFile } from "../test-evidence.ts";

const RAW_LAWS = corpusFile(["أنظمة ولوائح"], "/Users/nezamy/Projects/Raw_Vault/01_المكتبة_القانونية/أنظمة ولوائح");

type ExpectedRow = {
  regNum: string;
  parent: number;
  codepoints: number;
  textSha256: string;
};

const cases: Array<{
  relativeSource: string;
  sourceSha256: string;
  slug: string;
  ref: string;
  instrument: string;
  rows: ExpectedRow[];
}> = [
  {
    relativeSource: "04 - القسم التجاري/نظام البيانات التجارية_هيئة_الخبراء.md",
    sourceSha256: "2ba601a36761cc3f6a7382b69b278cfced30b2e85659f55af0e165dd23f1283c",
    slug: "commercial-data-law",
    ref: "اللائحة التنفيذية لنظام البيانات التجارية لعام 1423هـ",
    instrument: "لائحة تنفيذية",
    rows: [
      { regNum: "15", parent: 14, codepoints: 696, textSha256: "e95984c49607c0ddaa8c8351aaa521849d103770140b936118ee5cc61887d547" },
      { regNum: "16", parent: 14, codepoints: 449, textSha256: "866ae543e1ac36ecb196ecb275c45901595a53ed67b6bd7bba0f770448115b9f" },
    ],
  },
  {
    relativeSource: "07 - القسم العقاري والبناء/تنظيم الهيئة السعودية للمقاولين/تنظيم الهيئة السعودية للمقاولين-ولائحته-مدمج.md",
    sourceSha256: "e05fa5867d381affda73dfd5bbdf2e7a741aa73b7ff009323c805a2d651d7dcb",
    slug: "saudi-contractors-authority-regulation",
    ref: "اللائحة التنفيذية للهيئة السعودية للمقاولين",
    instrument: "لائحة تنفيذية",
    rows: [{ regNum: "39", parent: 20, codepoints: 376, textSha256: "9030c8bb6446dcce94d62997065c3a42d60b9331ecee63b3a624229b4cfbed29" }],
  },
  {
    relativeSource: "07 - القسم العقاري والبناء/نظام ملكية الوحدات العقارية وفرزها وإدارتها/نظام ملكية الوحدات العقارية وفرزها وإدارتها-ولائحته - جمعية قضاء.md",
    sourceSha256: "ceb69250bccaf8c551819bc596c5a14e76069e2f10865c86d8969a6909cc1e91",
    slug: "real-estate-units-ownership-subdivision-management-law-and-regulation",
    ref: "اللائحة التنفيذية لنظام ملكية الوحدات العقارية وفرزها وإدارتها",
    instrument: "لائحة تنفيذية",
    rows: [{ regNum: "41", parent: 33, codepoints: 159, textSha256: "783e1b5cb9e6c5966b79f61340b70589da6ccb398a50d6b61923231d99286641" }],
  },
  {
    relativeSource: "09 - القسم الضريبي/نظام جباية الزكاة/نظام جباية الزكاة ولائحته - جمعية قضاء.md",
    sourceSha256: "646c170ee894e0c3831fae2d2d286b0fcc8e8e2d3c1e9e05b782d227b736df39",
    slug: "zakat-collection-law",
    ref: "قواعد جباية الزكاة من المستثمرين في الصناديق الاستثمارية",
    instrument: "قواعد",
    rows: [
      { regNum: "5", parent: 4, codepoints: 609, textSha256: "34da652dd7b21748476a4a2ba6b95f7ce68364de46d4e6f65afaaaeb5f57b74e" },
      { regNum: "6", parent: 4, codepoints: 2022, textSha256: "cbde2eb41e72de7d7d98f3f5bf4a38a31618c0d20a4d586f14442e2214b4920a" },
      { regNum: "7", parent: 4, codepoints: 182, textSha256: "be9c51135475d4611d4480c277658e17c4bafafa07a9f88e878f65e115bfcdb5" },
      { regNum: "8", parent: 4, codepoints: 173, textSha256: "2eebaf7cf859607b671722441242ab5c5379dd76a0cf9e14f8ed43382d7a97b2" },
      { regNum: "9", parent: 4, codepoints: 302, textSha256: "f01d4dd3289c16f6a9340829f273d092635809d44de29a4a4efba3e21c917e03" },
    ],
  },
  {
    relativeSource: "21 - القسم الرياضي/مؤسسة أعضاء الأندية الرياضية (نظام ولائحة مدمج)/النظام الأساس لمؤسسة أعضاء الأندية الرياضية-مدمج.md",
    sourceSha256: "26119197783d76d03bccf674e5f68d3ecb1640af9b4e0bc341b4f7435e15d0a2",
    slug: "statute-and-regulation-member-institutions-sports-clubs-merged",
    ref: "اللائحة المنظمة لمؤسسات أعضاء الأندية الرياضية",
    instrument: "لائحة تنفيذية",
    rows: [{ regNum: "46", parent: 24, codepoints: 192, textSha256: "63a11a3808fc6d840aab02b6689b7be119b526d309d50f444b245a0f9ec9c708" }],
  },
  {
    // Same physical recovery boundary as the preceding real-estate case, but
    // a second source/slug that historically produced the eleventh seed row.
    relativeSource: "07 - القسم العقاري والبناء/نظام ملكية الوحدات العقارية وفرزها وإدارتها/نظام ملكية الوحدات العقارية وفرزها وإدارتها_هيئة_الخبراء.md",
    sourceSha256: "ed377c3f5870c38bae2fcba0cb0dafb0570b2608cad55419e1f8d39b0007feb9",
    slug: "real-estate-units-ownership-subdivision-management-law",
    ref: "اللائحة التنفيذية لنظام ملكية الوحدات العقارية وفرزها وإدارتها",
    instrument: "لائحة تنفيذية",
    rows: [{ regNum: "41", parent: 33, codepoints: 159, textSha256: "783e1b5cb9e6c5966b79f61340b70589da6ccb398a50d6b61923231d99286641" }],
  },
];

function sha256(value: string | Buffer) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function assertSourceBoundary(source: string, ref: string, regNum: string) {
  const anchors = [...source.matchAll(/<!-- REGULATION (\{[^\n]*\}) -->/g)]
    .filter((match) => {
      const meta = JSON.parse(match[1]);
      return meta.ref === ref && String(meta.regNum ?? "") === regNum;
    });
  assert.equal(anchors.length, 1, `one ${ref} regulation anchor for ${regNum}`);

  const anchor = anchors[0];
  const remainder = source.slice(anchor.index! + anchor[0].length);
  const next = remainder.match(/<!-- ARTICLE_START (\{[^\n]*\}) -->/);
  assert.ok(next, `a same-number latent article must follow ${regNum}`);
  const between = remainder.slice(0, next.index);
  const nextMeta = JSON.parse(next[1]);
  assert.ok(between.includes("<!-- ARTICLE_END -->"));
  assert.equal(between.replace(/<!--[\s\S]*?-->/g, "").trim(), "");
  assert.equal(String(nextMeta.number), regNum);
  assert.equal(nextMeta.latent_recovered, true);
}

test("recovers all eleven bounded latent regulation rows without changing their text or instrument", () => {
  const seederSource = fs.readFileSync(new URL("../seed-library.ts", import.meta.url), "utf8");
  assert.match(seederSource, /law_slug:\s*lawId\.substring\(0, 200\)/);
  assert.match(seederSource, /system_article_number:\s*String\(art\.number \|\| "0"\)/);
  assert.match(seederSource, /ref:\s*String\(r\.ref \|\| ""\)/);
  assert.match(seederSource, /reg_num:\s*r\.regNum != null \? String\(r\.regNum\)/);
  assert.match(seederSource, /text:\s*r\.text \|\| ""/);

  let rowCount = 0;
  for (const expected of cases) {
    const input = path.join(RAW_LAWS, expected.relativeSource);
    const source = fs.readFileSync(input);
    assert.equal(sha256(source), expected.sourceSha256, `pinned source: ${expected.relativeSource}`);

    const law = parseLaws(input).laws[0];
    assert.equal(law.slug, expected.slug);
    const drySeedRows = law.chapters.flatMap((chapter) => chapter.articles.flatMap((article) =>
      article.regulations.map((regulation) => ({
        law_slug: law.slug,
        system_article_number: article.number,
        ref: regulation.ref,
        reg_num: regulation.regNum,
        instrument: regulation.instrument,
        text: regulation.text,
      })),
    ));

    const actual = drySeedRows
      .filter((row) => row.ref === expected.ref && expected.rows.some((item) => item.regNum === row.reg_num))
      .sort((a, b) => Number(a.reg_num) - Number(b.reg_num));
    assert.equal(actual.length, expected.rows.length);

    for (const row of expected.rows) {
      assertSourceBoundary(source.toString("utf8"), expected.ref, row.regNum);
      const seeded = actual.find((item) => item.reg_num === row.regNum);
      assert.ok(seeded, `dry seed has ${expected.slug}/${row.regNum}`);
      assert.deepEqual(
        {
          law_slug: seeded.law_slug,
          system_article_number: seeded.system_article_number,
          ref: seeded.ref,
          instrument: seeded.instrument,
          codepoints: [...seeded.text].length,
          textSha256: sha256(seeded.text),
        },
        {
          law_slug: expected.slug,
          system_article_number: row.parent,
          ref: expected.ref,
          instrument: expected.instrument,
          codepoints: row.codepoints,
          textSha256: row.textSha256,
        },
      );
      assert.equal(
        law.chapters.flatMap((chapter) => chapter.articles).some((article) => article.number === Number(row.regNum)),
        false,
        `latent regulation ${row.regNum} is not duplicated as a system article`,
      );
      rowCount += 1;
    }
  }
  assert.equal(rowCount, 11);
});

test("the guard cannot alter independent regulation text or the civil-service regulation preamble", () => {
  const parserSource = fs.readFileSync(new URL("./parse-laws.ts", import.meta.url), "utf8");
  assert.match(parserSource, /latentRecoveredArticles\.has\(latent\)[\s\S]*?latent\.text\.trim\(\)/);
  assert.match(parserSource, /matchingEmptyRegulations\.length !== 1/);
  // The 83 independent nonempty rows in 15/26 do not satisfy the literal
  // latent_recovered boundary, so the narrow guard has no number-only path.

  const civilService = path.join(RAW_LAWS, "02 - القسم الإداري/نظام الخدمة المدنية/نظام الخدمة المدنية_هيئة_الخبراء.md");
  assert.equal(sha256(fs.readFileSync(civilService)), "0feb2459ef3a72afbec64886491928d235d1d58df8ae390be0bb12361ff2da72");
  const law = parseLaws(civilService).laws[0];
  assert.equal(law.total_articles, 44);
  assert.equal([...law.regulation_preamble].length, 259);
  assert.equal(sha256(law.regulation_preamble), "1bc4538d598102e7ed1627259eb702588017d7f960f11d90e5c7ab2023f4d3bd");
});
