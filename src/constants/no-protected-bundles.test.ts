/**
 * q390 / BUG-LIB-01 (S1 Task 8): protected library text never ships in the
 * client bundle again. The principles and the book «مصادر الحق» are read from
 * the database only; demo records keep at most 150 characters per field.
 *
 * Binds every later unit: no file under src may import a bundled collection
 * or book again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const at = (rel: string) => join(SRC, rel);

function* sourceFiles(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      yield* sourceFiles(p);
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      yield p;
    }
  }
}

test("the bundled principles and book are gone", () => {
  assert.equal(existsSync(at("constants/precedents")), false, "src/constants/precedents must not exist");
  assert.equal(existsSync(at("constants/sources-of-right-1.json")), false, "src/constants/sources-of-right-1.json must not exist");
});

test("no source file refers to a bundled collection or book", () => {
  const offenders: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (text.includes("constants/precedents") || text.includes("sources-of-right-1.json")) {
      offenders.push(relative(SRC, file));
    }
  }
  assert.deepEqual(offenders, []);
});

/** Double-, single-quoted and template literals in `source`, longer than `max` once one trailing «…» is set aside. */
function longLiterals(source: string, max: number): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  for (const m of source.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").replace(/…$/, "");
    if (raw.length > max) out.push(raw.slice(0, 40));
  }
  return out;
}

function declaration(rel: string, start: string, end: string | null): string {
  const text = readFileSync(at(rel), "utf8").replace(/\r\n/g, "\n");
  const a = text.indexOf(start);
  assert.ok(a >= 0, `${start} not found in ${rel}`);
  const b = end === null ? text.length : text.indexOf(end, a);
  assert.ok(b > a, `${end} not found after ${start} in ${rel}`);
  return text.slice(a, b);
}

test("demo records keep at most 150 characters per field (DEMO_PRECEDENTS, DEMO_RAWD)", () => {
  const precedents = declaration("app/laws/demo-data-precedents.ts", "export const DEMO_PRECEDENTS:", "export const DEMO_PRECEDENTS_COLLECTIONS");
  const rawd = declaration("app/laws/demo-data-books.ts", "export const DEMO_RAWD:", null);
  assert.deepEqual(longLiterals(precedents, 150), [], "DEMO_PRECEDENTS");
  assert.deepEqual(longLiterals(rawd, 150), [], "DEMO_RAWD");
});

/**
 * Controller ruling (fix round 1): the cut applies to EVERY client-bundled
 * copy of library text — law, principle, decree or book. Every
 * src/app/laws/demo-data*.ts file is measured whole, and so is the inline
 * الروض المربع of the feqh preview page.
 */
test("every demo-data module keeps at most 150 characters per string (DEMO_PRINCIPLES, DEMO_ORDERS, …)", () => {
  const files = readdirSync(at("app/laws")).filter((f) => /^demo-data.*\.ts$/.test(f) && !f.endsWith(".test.ts"));
  for (const expected of ["demo-data-principles.ts", "demo-data-orders.ts", "demo-data-precedents.ts", "demo-data-books.ts"]) {
    assert.ok(files.includes(expected), `${expected} not found — update this guard if it moved`);
  }
  for (const f of files) {
    assert.deepEqual(longLiterals(readFileSync(at(`app/laws/${f}`), "utf8"), 150), [], f);
  }
});

test("the feqh preview's inline demo book keeps at most 150 characters per string (DEMO_BOOK)", () => {
  const book = declaration("app/laws/feqh-preview/page.tsx", "const DEMO_BOOK: FeqhBook = {", "\n};");
  assert.ok(book.includes("matn:") && book.includes("chapters:"), "DEMO_BOOK declaration not found whole");
  assert.deepEqual(longLiterals(book, 150), [], "DEMO_BOOK");
});

test("the scanner sees a long literal (negative control)", () => {
  assert.equal(longLiterals(`x: "${"ب".repeat(151)}"`, 150).length, 1);
  assert.equal(longLiterals(`x: '${"ب".repeat(151)}'`, 150).length, 1);
  assert.equal(longLiterals("x: `" + "ب".repeat(151) + "`", 150).length, 1);
  assert.equal(longLiterals(`x: "${"ب".repeat(150)}…"`, 150).length, 0);
});
