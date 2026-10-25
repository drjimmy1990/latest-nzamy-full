/**
 * noEscrowWording.test.ts — owner ٢٨٩: no «حساب الضمان / Escrow» wording
 * anywhere a user reads, and no hold-and-release (Split Payment) promise
 * until one is built. The platform holds no money: fees go through a licensed
 * payment gateway (refund-policy §٢).
 *
 * Reads every .ts / .tsx under src (tests and src/types excluded), drops the
 * comments (several explain WHY a promise was removed, and may name it), and
 * fails on any phrase below. Only the money sense is targeted — «ضمان» alone
 * has other legal meanings (a bank guarantee in a judgment, a lease deposit)
 * and is not matched; neither are lowercase code identifiers (escrowStatus,
 * the audit-log action key "escrow").
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/constants/noEscrowWording.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..");

const BANNED: readonly RegExp[] = [
  /\bEscrow\b/,
  /\bESCROW\b(?!_)/,
  /حساب الضمان/,
  /الضمان المالي/,
  /نظام الضمان/,
  /محفظة الضمان/,
  /حجز الضمان/,
  /إفراج الضمان/,
  /إطلاق الضمان/,
  /أطلق الضمان/,
  /أموال الضمان/,
  /إدارة الضمان/,
];

/**
 * Staff-only mock kept behind its URL (its sidebar link is gone) until the
 * owner decides whether to delete it — named in the 26-Oct owner report.
 */
const ALLOWED = new Set(["app/dashboard/admin/escrow/page.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.test-helper\.ts$/.test(name)) out.push(p);
  }
  return out;
}

/** Block comments (incl. JSX `{/* … *\/}`) and line comments; a `//` after `:` or a quote (a URL) is kept. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

test("stripComments: drops comments, keeps strings and URLs", () => {
  assert.equal(stripComments('a {/* Escrow badge */} b'), "a {} b");
  assert.equal(stripComments("x // No Escrow line").trim(), "x");
  assert.equal(stripComments('const u = "https://example.com";'), 'const u = "https://example.com";');
  assert.match(stripComments('const t = "حساب الضمان";'), /حساب الضمان/);
});

test("owner ٢٨٩: no Escrow / حساب الضمان wording in user-visible source", () => {
  const hits: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split(sep).join("/");
    if (rel.startsWith("types/") || ALLOWED.has(rel)) continue;
    const lines = stripComments(readFileSync(file, "utf8")).split("\n");
    lines.forEach((line, i) => {
      for (const re of BANNED) if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], `Escrow wording found:\n${hits.join("\n")}`);
});

test("owner ٢٨٩: the admin sidebar offers no Escrow page", () => {
  const nav = stripComments(readFileSync(join(SRC, "constants/navigation.sidebars.primary.ts"), "utf8"));
  assert.equal(nav.includes("/dashboard/admin/escrow"), false);
});
