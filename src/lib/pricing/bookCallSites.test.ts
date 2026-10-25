/**
 * bookCallSites.test.ts — every page that reads a price from the book names a
 * price the book SELLS today.
 *
 * bookPriceText / bookSar throw for an id or billing the book does not sell
 * (retired, coming soon, or never listed), and most callers run them at
 * module scope (src/constants/pricing/*, /pro, /laws/subscribe, the admin
 * pricing screen…) — a page that asks for a retired price fails to load, and
 * only `next build` would notice. This test lists every literal call site, so
 * the phase that retires a price (P2: lawyer-pro; P6: the firms' monthly
 * cycle) gets one failing test naming each page it must update.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { bookEntry, isBilling, offeredSar } from "./priceBook.ts";

const SRC = join(import.meta.dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules") out.push(...sourceFiles(p));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

/** Literal calls, and the page helpers that wrap one billing. */
const PATTERNS: Array<{ re: RegExp; billing?: string }> = [
  { re: /\bbook(?:PriceText|Sar)\("([^"]+)",\s*"([^"]+)"/g },
  { re: /\btwelveMonths\("([^"]+)"/g, billing: "monthly" },
  { re: /\blib(?:Ar|En)\("([^"]+)"\)/g, billing: "once" },
  { re: /\btopupNumbers\("([^"]+)"\)/g, billing: "once" },
];

test("every literal price-book call in src names a price the book sells today", () => {
  const bad: string[] = [];
  let calls = 0;
  for (const file of sourceFiles(SRC)) {
    if (file.endsWith(join("lib", "pricing", "priceBook.ts"))) continue;
    const text = readFileSync(file, "utf8");
    for (const { re, billing: fixed } of PATTERNS) {
      for (const m of text.matchAll(re)) {
        calls++;
        const id = m[1];
        const billing = fixed ?? m[2];
        const entry = bookEntry(id);
        const sold = entry && isBilling(billing) ? offeredSar(entry, billing) : null;
        if (sold === null) bad.push(`${relative(SRC, file)}: ${id} ${billing}`);
      }
    }
  }
  assert.ok(calls >= 60, `only ${calls} call sites found — the scan lost its patterns`);
  assert.deepEqual(bad, [], "pages that ask the book for a price it does not sell (update them in the phase that retires it)");
});
