/**
 * answerMentions.test.ts — N06-34..39 remainder (batch l11): article references
 * written in an AI answer's own words become chips.
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/ai/answerMentions.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { citedLawSlug, mentionLookupUrl, readMentionLookup, soleCitedLaw, splitAnswer } from "./answerMentions.ts";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const LABOR = { kind: "article", url: "/laws/labor-law#labor-law__art-80" };
const COMPANIES = { kind: "article", url: "/laws/companies#companies__art-5" };

test("a reference that names its law is a chip, looked up by that name", () => {
  const parts = splitAnswer("يحق لصاحب العمل الفسخ وفق المادة الثمانين من نظام العمل [S1] دون مكافأة.", [LABOR, COMPANIES]);
  const mention = parts.find((p) => p.type === "mention");
  assert.ok(mention && mention.type === "mention");
  assert.deepEqual(mention.numbers, [80]);
  assert.equal(mention.docName, "نظام العمل");
  assert.equal(mention.lawSlug, null);
  assert.match(mention.text, /^المادة الثمانين من نظام العمل/);
  assert.ok(parts.some((p) => p.type === "marker" && p.sid === "S1"));
  // Nothing of the text is lost or duplicated.
  const rebuilt = parts.map((p) => (p.type === "marker" ? `[${p.sid}]` : p.text)).join("");
  assert.equal(rebuilt, "يحق لصاحب العمل الفسخ وفق المادة الثمانين من نظام العمل [S1] دون مكافأة.");
  assert.equal(mentionLookupUrl(mention), `/api/library/laws/ref/citations?name=${encodeURIComponent("نظام العمل")}&n=80`);
});

test("a bare «المادة (٨٠)» is a chip only when the answer cites one law", () => {
  const one = splitAnswer("انظر المادة (٨٠) والمادة (٧٧) [S1]", [LABOR, { kind: "principle", url: "/precedents/x#p" }]);
  const mentions = one.filter((p) => p.type === "mention");
  assert.equal(mentions.length, 2);
  for (const m of mentions) if (m.type === "mention") assert.equal(m.lawSlug, "labor-law");
  assert.equal(
    mentionLookupUrl(mentions[0] as { numbers: number[]; docName: string; lawSlug: string | null }),
    "/api/library/laws/labor-law/citations?law=labor-law&n=80",
  );
  // Two laws cited: the bare reference stays text.
  assert.deepEqual(splitAnswer("انظر المادة (٨٠)", [LABOR, COMPANIES]), [{ type: "text", text: "انظر المادة (٨٠)" }]);
  // No law cited at all: text.
  assert.deepEqual(splitAnswer("انظر المادة (٨٠)", []), [{ type: "text", text: "انظر المادة (٨٠)" }]);
});

test("markers stay markers; a plain answer stays one text run", () => {
  assert.deepEqual(splitAnswer("لا شيء هنا [S2][S3]", []), [
    { type: "text", text: "لا شيء هنا " },
    { type: "marker", sid: "S2" },
    { type: "marker", sid: "S3" },
  ]);
  assert.deepEqual(splitAnswer("", []), []);
});

test("citedLawSlug / soleCitedLaw read the library link, decoded", () => {
  assert.equal(citedLawSlug({ kind: "article", url: `/laws/${encodeURIComponent("نظام-المرور")}#a` }), "نظام-المرور");
  assert.equal(citedLawSlug({ kind: "principle", url: "/laws/x#y" }), null);
  assert.equal(soleCitedLaw([LABOR, LABOR]), "labor-law");
  assert.equal(soleCitedLaw([LABOR, COMPANIES]), null);
});

test("readMentionLookup keeps only well-formed rows, each with its link; never text", () => {
  const read1 = readMentionLookup({
    law: { slug: "labor-law", title: "نظام العمل", status: "active" },
    articles: [
      { id: "labor-law__art-80", number: 80, title: "المادة الثمانون", status: "amended", text: "should never be read" },
      { id: 5, number: 1 },
      null,
    ],
  });
  assert.equal(read1.lawTitle, "نظام العمل");
  assert.equal(read1.lawUrl, "/laws/labor-law");
  assert.deepEqual(read1.articles, [
    { id: "labor-law__art-80", number: 80, title: "المادة الثمانون", status: "amended", url: "/laws/labor-law#labor-law__art-80" },
  ]);
  assert.deepEqual(readMentionLookup({ law: null, articles: [] }), { lawTitle: null, lawUrl: null, articles: [] });
  assert.deepEqual(readMentionLookup("junk"), { lawTitle: null, lawUrl: null, articles: [] });
});

test("CitedText chips the mentions and opens the same sheet; uncited text is never previewed", () => {
  const src = read("src/components/ai/CitedAnswer.tsx");
  assert.match(src, /splitAnswer\(text, cites\)/);
  assert.match(src, /mentionLookupUrl\(/);
  // A mention whose article the run cited opens that citation's own sheet (the
  // source-preview route and its 100-character rule); any other gets no text.
  assert.match(src, /bySid|citedById/);
  assert.doesNotMatch(src.slice(src.indexOf("function MentionSheet")), /source-preview/);
});
