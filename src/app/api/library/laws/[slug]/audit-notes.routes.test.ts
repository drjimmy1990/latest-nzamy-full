/**
 * BUG-01 + #26 (owner package 6-Nov) — a source contract on the law route
 * (it cannot be unit-executed: next/server and "@/…" aliases).
 *
 * 1. Every text field the route sends for an article goes through
 *    stripArticleAuditNotes — the title, `text`, `original_text` (a repealed
 *    article's body), regulation text (per article AND the flat view),
 *    historic regulation text, the legacy executive_reg_text — and before the
 *    locked preview is cut.
 * 2. A regulation row with no text left is no block: not in `regulations`,
 *    not in the flat view, no `regulationHeading` without a block.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
const fmtStart = route.indexOf("function formatArticleWithPaywall(");
const fmt = route.slice(fmtStart);

test("every article text field is stripped of the corpus's audit notes", () => {
  assert.match(route, /import \{ stripArticleAuditNotes, stripAuditNotes, stripPipelineNotes \} from '@\/lib\/library\/lawPreambleBlocks';/);
  assert.match(fmt, /const originalText = stripArticleAuditNotes\(article\.original_text\);/);
  assert.match(fmt, /const articleText = stripArticleAuditNotes\(article\.text\);/);
  assert.match(fmt, /title: isLocked \? preview\(stripArticleAuditNotes\(article\.title\), LOCKED_TITLE_CHARS\) : stripArticleAuditNotes\(article\.title\),/);
  assert.match(fmt, /stripArticleAuditNotes\(article\.historic_regulation_text\)/);
  assert.match(fmt, /text: stripArticleAuditNotes\(article\.executive_reg_text\),/);
  // No raw read of a text column survives in the formatter.
  assert.doesNotMatch(fmt, /\(article\.original_text as string\)/);
  assert.doesNotMatch(fmt, /\(article\.text as string\)/);
  assert.doesNotMatch(fmt, /result\.historicRegulationText = article\.historic_regulation_text/);
  // The locked preview is cut from the stripped text.
  assert.match(fmt, /if \(originalText\) result\.originalText = preview\(originalText\);/);
  assert.match(fmt, /result\.text = preview\(lifted\.text\)/);
  // The amendment fields keep their own filter (pipeline + audit notes).
  assert.match(fmt, /fullText: stripAuditNotes\(a\.full_text as string \| null, 'fullText'\)/);
});

test("regulation text: one helper, stripped, and an empty row is no block (#26)", () => {
  assert.match(route, /function regulationRowText\(r: Record<string, unknown>\): string \{\s*const text = stripArticleAuditNotes\(r\.text\);\s*return text\.trim\(\) \? text : '';\s*\}/);
  // Per article: rows mapped through the helper, the empty ones dropped, before anything is built.
  assert.match(fmt, /const regRows = regulationRows\s*\.map\(\(r\): Record<string, unknown> & \{ text: string \} => \(\{ \.\.\.r, text: regulationRowText\(r\) \}\)\)\s*\.filter\(\(r\) => r\.text\);/);
  assert.doesNotMatch(fmt, /text: r\.text \|\| ''/);
  // regulationHeading only rides with a non-empty block.
  const built = fmt.indexOf("if (regRows.length > 0) {");
  const heading = fmt.indexOf("if (lifted.heading) result.regulationHeading = lifted.heading;");
  assert.ok(built > 0 && heading > built);
  // The legacy column is used only when the article had no rows at all.
  assert.match(fmt, /\} else if \(regulationRows\.length === 0 && stripArticleAuditNotes\(article\.executive_reg_text\)\.trim\(\)\) \{/);

  // The flat «اللائحة وحدها» view: empty rows skipped before the lock count, text through the helper.
  const start = route.indexOf("const regulationsByRef = new Map");
  const end = route.indexOf("const regulationInstruments = Array.from(");
  const block = route.slice(start, end);
  assert.ok(block.indexOf("if (!regulationRowText(r)) return;") > 0);
  assert.ok(block.indexOf("if (!regulationRowText(r)) return;") < block.indexOf("if (parentLocked)"));
  const flat = route.slice(end, end + 700);
  assert.match(flat, /text: regulationRowText\(r\),/);
});
