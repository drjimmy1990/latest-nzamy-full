// Owner package 2026-11-06 item 26: a REGULATION anchor with no text under it
// comes from the source. The parser keeps it (the owner reserves the
// hide-or-refer decision; the latent-article recovery needs empty anchors)
// and lists it in the parse report so the empty blocks are visible.
//
// Run: node --import tsx --test scripts/parsers/parse-laws.empty-regulations.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";

function parseWithReport(body: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-empty-reg-"));
  const file = path.join(dir, "synthetic.md");
  fs.writeFileSync(
    file,
    `---\nid: TEST-EMPTY-REG\ntitle: نظام اختباري للوائح الفارغة\ntype: نظام\nstatus: active\nsection_code: "00"\n---\n${body}`,
    "utf8",
  );
  const reportDir = path.join(dir, "report");
  fs.mkdirSync(reportDir);
  const parsed = parseLaws(file, reportDir);
  const reportFile = fs.readdirSync(reportDir).find((f) => f.startsWith("parse-report-laws"));
  assert.ok(reportFile, "the laws parse report is written");
  const report = JSON.parse(fs.readFileSync(path.join(reportDir, reportFile), "utf8"));
  return { parsed, report };
}

test("an empty REGULATION block is kept as it is and listed in the parse report", () => {
  const { parsed, report } = parseWithReport(
    `<!-- ARTICLE_START {"number":"1","number_text":"المادة الأولى"} -->\nمتن.\n` +
      `<!-- REGULATION {"ref":"المادة 1 من اللائحة","regNum":"1"} -->\n` +
      `<!-- REGULATION {"ref":"المادة 2 من اللائحة","regNum":"2"} -->\nنص لائحي.\n` +
      `<!-- ARTICLE_END -->\n`,
  );
  const regs = parsed.laws[0].chapters.flatMap((c) => c.articles).flatMap((a) => a.regulations);
  assert.deepEqual(regs.map((r) => r.text), ["", "نص لائحي."], "the parser neither drops nor invents a block");
  assert.equal(report.counts.emptyRegulationBlocks, 1);
  assert.equal(report.notes.emptyRegulationBlocks.length, 1);
  assert.match(report.notes.emptyRegulationBlocks[0], /المادة 1 من اللائحة/);
});

test("a block filled by the latent-article recovery is not reported as empty", () => {
  const { parsed, report } = parseWithReport(
    `<!-- ARTICLE_START {"number":"5","number_text":"المادة الخامسة"} -->\nمتن النظام.\n` +
      `<!-- REGULATION {"ref":"المادة 6 من اللائحة","regNum":"6"} -->\n` +
      `<!-- ARTICLE_END -->\n` +
      `<!-- ARTICLE_START {"number":"6","number_text":"المادة السادسة","latent_recovered":true} -->\nنص اللائحة الكامن.\n<!-- ARTICLE_END -->\n`,
  );
  const articles = parsed.laws[0].chapters.flatMap((c) => c.articles);
  assert.equal(articles.length, 1, "the latent article is folded into the regulation");
  assert.equal(articles[0].regulations[0].text, "نص اللائحة الكامن.");
  assert.equal(report.counts.emptyRegulationBlocks, 0);
});
