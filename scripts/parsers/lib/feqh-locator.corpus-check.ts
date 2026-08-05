#!/usr/bin/env npx tsx
/**
 * feqh-locator.corpus-check.ts — measure locator coverage over the real corpus.
 *
 * Compares the NEW parser against what production currently recognises, so the
 * gain (and any regression) is a number rather than an assertion.
 *
 * Run: npx tsx scripts/parsers/lib/feqh-locator.corpus-check.ts
 */

import * as fs from "fs";
import * as path from "path";
import { parseLocator } from "./feqh-locator";
import { applyExclusions } from "./exclusions";

const root =
  process.argv[2] ||
  path.resolve(process.cwd(), "last_owner/01_المكتبة_القانونية/فقه ومراجع");

const L = (p: string): string => (p.startsWith("\\\\?\\") ? p : "\\\\?\\" + p);

function walk(dir: string, out: string[] = []): string[] {
  let ents: fs.Dirent[];
  try { ents = fs.readdirSync(L(dir), { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith(".md")) out.push(full);
  }
  return out;
}

// Production's two recognisers, transcribed from parse-feqh.ts.
const PROD_HEADER = /^#{1,5}\s*صفحة\s+(\d+)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*?)\s*[-–—]\s*(.*)/;
const PROD_ANCHOR = /^<!--\s*PAGE_START\s*(\{.*?\})\s*-->/;
const prodRecognises = (line: string) => PROD_HEADER.test(line) || PROD_ANCHOR.test(line);

const files = applyExclusions(walk(root)).kept;

let lines = 0;
let prodHits = 0;
let newHits = 0;
let withVolume = 0;
let nonNumericPage = 0;
let nonNumericVolume = 0;
const byKind: Record<string, number> = {};
const booksWithLocators = new Set<string>();
const booksProdCovered = new Set<string>();
const volumesPerBook = new Map<string, Set<number>>();

for (const f of files) {
  let raw: string;
  try { raw = fs.readFileSync(L(f), "utf-8"); } catch { continue; }
  for (const line of raw.replace(/\r\n/g, "\n").split("\n")) {
    lines++;
    if (prodRecognises(line)) { prodHits++; booksProdCovered.add(f); }
    const loc = parseLocator(line);
    if (!loc) continue;
    newHits++;
    byKind[loc.kind] = (byKind[loc.kind] || 0) + 1;
    booksWithLocators.add(f);
    if (loc.volume !== null) {
      withVolume++;
      if (!volumesPerBook.has(f)) volumesPerBook.set(f, new Set());
      volumesPerBook.get(f)!.add(loc.volume);
    }
    if (loc.pageLabel !== null && loc.page === null) nonNumericPage++;
    if (loc.volumeLabel !== null && loc.volume === null) nonNumericVolume++;
  }
}

const multiVolume = [...volumesPerBook.values()].filter((s) => s.size > 1).length;

console.log(`\n${"═".repeat(66)}`);
console.log("  Feqh locator coverage");
console.log(`${"═".repeat(66)}\n`);
console.log(`  books (after exclusions)          ${String(files.length).padStart(8)}`);
console.log(`  lines scanned                     ${String(lines).padStart(8)}`);
console.log(`\n  locators recognised by PRODUCTION ${String(prodHits).padStart(8)}   in ${booksProdCovered.size} book(s)`);
console.log(`  locators recognised by NEW parser ${String(newHits).padStart(8)}   in ${booksWithLocators.size} book(s)`);
console.log(`  gain                              ${String(newHits - prodHits).padStart(8)}`);
console.log(`\n  by shape:`);
for (const [k, v] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(v).padStart(7)}  ${k}`);
}
console.log(`\n  locators carrying a real volume   ${String(withVolume).padStart(8)}`);
console.log(`  books with MORE THAN ONE volume   ${String(multiVolume).padStart(8)}   ← all were volume 1 before`);
console.log(`  non-numeric page tokens preserved ${String(nonNumericPage).padStart(8)}`);
console.log(`  non-numeric volume tokens kept    ${String(nonNumericVolume).padStart(8)}`);
console.log("");
