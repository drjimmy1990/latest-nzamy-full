/**
 * Regression fixture for title-less <details> in the 1436 commercial volume.
 *
 * Run only against the read-only source explicitly supplied by the caller:
 * PRECEDENTS_1436_SOURCE=/absolute/path/to/source.md \
 *   npx tsx scripts/parsers/parse-precedents.unnamed-details.test.ts
 *
 * This test neither rewrites the legal Markdown nor seeds a database.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { parsePrecedents, type PrincipleDetail } from "./parse-precedents.ts";

const sourcePath = process.env.PRECEDENTS_1436_SOURCE;

function requireSource(): string {
  assert.ok(sourcePath, "PRECEDENTS_1436_SOURCE must name the read-only 1436 commercial source Markdown");
  assert.ok(fs.existsSync(sourcePath), `source does not exist: ${sourcePath}`);
  return sourcePath;
}

function sourcePrinciples(source: string): Array<{ number: number; body: string }> {
  const markerRe = /<!--\s*PRINCIPLE_START\s*(.*?)\s*-->([\s\S]*?)<!--\s*PRINCIPLE_END\s*-->/g;
  const result: Array<{ number: number; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(source)) !== null) {
    const meta = JSON.parse(match[1]) as { number: number };
    result.push({ number: Number(meta.number), body: match[2] });
  }
  return result;
}

function expectedUnnamedDetails(body: string): string | undefined {
  const detailsRe = /<details>([\s\S]*?)<\/details>/g;
  const contents: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = detailsRe.exec(body)) !== null) {
    if (/<summary\b/.test(match[1])) continue;
    const content = match[1].trim();
    if (content) contents.push(content);
  }
  return contents.length ? contents.join("\n\n") : undefined;
}

/** The pre-fix, summary-only behaviour — independent control for no regression. */
function legacyNamedDetails(body: string): PrincipleDetail {
  const details: PrincipleDetail = { facts: "", reasons: "", ruling: "", ruling_basis: "" };
  const namedRe = /<details>\s*<summary>(.*?)<\/summary>([\s\S]*?)<\/details>/g;
  let match: RegExpExecArray | null;
  while ((match = namedRe.exec(body)) !== null) {
    const header = match[1].trim();
    const content = match[2].trim();
    if (header.includes("وقائع") || header.includes("facts")) details.facts = content;
    else if (header.includes("أسباب") || header.includes("reasons") || header.includes("تسبيب")) details.reasons = content;
    else if (header.includes("منطوق") || header.includes("ruling") || header.includes("حكم")) details.ruling = content;
    else if (header.includes("سند") || header.includes("basis")) details.ruling_basis = content;
  }
  return details;
}

test("1436 commercial volume: 52 identities, all 13 unnamed folds preserved, named folds unchanged", () => {
  const filePath = requireSource();
  const source = fs.readFileSync(filePath, "utf8");
  const expected = sourcePrinciples(source);
  assert.equal(expected.length, 52, "fixture identity count must remain 52 before parsing");

  const output = parsePrecedents(filePath);
  assert.equal(output.collections.length, 1, "single source file must produce one principle collection");
  const parsed = output.collections[0].principles;
  assert.equal(parsed.length, 52, "parser must preserve all 52 principle rows");
  assert.deepEqual(
    parsed.map((principle) => principle.number),
    expected.map((principle) => principle.number),
    "principle identities/order must not change",
  );

  const unnamed = expected
    .map((principle) => ({ number: principle.number, content: expectedUnnamedDetails(principle.body) }))
    .filter((principle): principle is { number: number; content: string } => Boolean(principle.content));
  assert.equal(unnamed.length, 13, "fixture must keep the known 13 title-less disclosures");
  assert.ok(
    !unnamed.some((principle) => principle.number === 49),
    "principle 49 has a delayed <summary> and must remain on the named-details path",
  );

  for (const { number, content } of unnamed) {
    const principle = parsed.find((candidate) => candidate.number === number);
    assert.ok(principle, `principle ${number} must keep its own identity`);
    assert.equal(principle.unparsed_details, content, `principle ${number} must preserve its own unnamed fold byte-for-byte after trimming`);
    assert.ok(principle.unparsed_details.length > 0, `principle ${number} must retain non-empty recoverable content`);
    assert.ok(!principle.text.includes(content), `principle ${number} must not leak locked unnamed content into text`);
    assert.ok(!principle.details.facts.includes(content), `principle ${number} must not misclassify unnamed content as facts`);
    assert.ok(!principle.details.reasons.includes(content), `principle ${number} must not misclassify unnamed content as reasons`);
    assert.ok(!principle.details.ruling.includes(content), `principle ${number} must not misclassify unnamed content as ruling`);
    assert.ok(!principle.details.ruling_basis.includes(content), `principle ${number} must not misclassify unnamed content as a ruling basis`);
  }

  for (const sourcePrinciple of expected.filter((principle) => /<summary>/.test(principle.body))) {
    const principle = parsed.find((candidate) => candidate.number === sourcePrinciple.number);
    assert.ok(principle, `summary principle ${sourcePrinciple.number} must remain present`);
    assert.equal(principle.unparsed_details, undefined, `summary principle ${sourcePrinciple.number} must not enter unparsed_details`);
    assert.deepEqual(
      principle.details,
      legacyNamedDetails(sourcePrinciple.body),
      `summary handling must not regress for principle ${sourcePrinciple.number}`,
    );
  }

  assert.equal(path.basename(filePath), "مبادئ-ديوان-المظالم-1436هـ-تجاري-ج1_ديوان_المظالم.md");
});
