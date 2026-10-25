/**
 * Owner ٢٦٣: a decree / circular card shows its summary to every viewer (the
 * laws' موجز rule of ٢٦٠) — the decree TEXT stays behind the paywall.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

test("init reads summary + summary_brief for the decree cards and strips only the text of a locked one", () => {
  const init = read("src/app/api/library/init/route.ts");
  assert.match(init, /const DECREE_LIST_COLUMNS =\s*"id, title, type, issuer, ref, date, summary_brief, summary, category, hashtags, instrument_ar";/);
  assert.match(init, /stripFields\(\{ \.\.\.row \}, \["content", "text"\]\)/);
  assert.doesNotMatch(init, /stripFields\(\{ \.\.\.row \}, \["summary_brief", "content", "text"\]\)/);
});

test("the decree route keeps its page paywall and its subscriber-only preamble", () => {
  const route = read("src/app/api/library/decrees/[id]/route.ts");
  assert.match(route, /const free = freeDecreePages\(probe, pages\.length\);/);
  assert.match(route, /preamble: isSubscriber \? preamble : '',/);
});

test("the card falls back to the source summary; the decree page shows one box, none when both are empty", () => {
  const page = read("src/app/laws/page.tsx");
  assert.match(page, /summary_brief: stripMarkdownMarks\(d\.summary_brief \|\| d\.summary\),/);
  const reader = read("src/app/laws/orders/[slug]/page.tsx");
  assert.match(reader, /\{\(order\.summary \|\| order\.summary_brief\) && \(/);
  assert.match(reader, /formatBold\(order\.summary \|\| order\.summary_brief \|\| ""\)/);
});

test("the fiqh card and the book reader show the book's summary (feqh_books.description)", () => {
  const page = read("src/app/laws/page.tsx");
  assert.match(page, /desc: stripMarkdownMarks\(b\.description\),/);
  const model = read("src/app/book/[slug]/_reader-model.ts");
  assert.match(model, /description: str\(api\.description\)\.trim\(\),/);
  const reader = read("src/app/book/[slug]/page.tsx");
  assert.match(reader, /\{book\.description && \(/);
});
