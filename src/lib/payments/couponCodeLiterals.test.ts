/**
 * couponCodeLiterals.test.ts — S6-T10 (slice A §6.2.3): every coupon rule
 * comes from the coupon's ROW (public.coupons and its metadata), which the
 * admin coupons page edits. No code path may special-case a coupon by its
 * name: not NEWCLIENT's first-order rule, not NZAMY50's value, not the old
 * seed's LAUNCH2026. A name in code is a rule the admin cannot see or change.
 *
 * Read as source over every non-test .ts / .tsx under src/ (review M3: it
 * was src/lib/payments and the coupon / payment API routes only), with // and
 * block comments stripped (a comment that names a code explains, it does not
 * decide). String literals are kept, so `"NEWCLIENT"` in code is caught, in
 * any letter case (`"newclient"` too).
 *
 * RUN: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test src/lib/payments/couponCodeLiterals.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");
const ROOTS = [SRC];

/** A named coupon as a string literal, in any letter case. */
export const NAMED_COUPON_RE = /["'`](NZAMY50|NEWCLIENT|LAUNCH2026)["'`]/i;
/**
 * A coupon row's code compared with a literal code, in any letter case and
 * after any trim / toUpperCase / toLowerCase. `typeof c.code === "string"` is
 * a type check, not a code (the lookbehind). Only the names a coupon row goes
 * by in this code are matched — never a Postgres / PostgREST error's `.code`.
 */
export const CODE_COMPARE_RE =
  /(?<!typeof\s+)\b(row|coupon|c|k)\??\.code(\.(trim|toUpperCase|toLowerCase)\(\))*\s*[!=]==?\s*["'`][A-Z0-9_-]{2,32}["'`]/i;

/** The source without // and block comments; strings and template literals are kept as they are. */
export function stripComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      // keep the line breaks, so a hit's line number is the file's
      out += src.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\") j++;
        else if (quote !== "`" && src[j] === "\n") break;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

function sources(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.test-helper\.ts$/.test(name)) out.push(p);
  }
  return out;
}

test("S6: the scanners match what they must and nothing else", () => {
  assert.ok(NAMED_COUPON_RE.test(`if (code === "NEWCLIENT") {`));
  assert.ok(CODE_COMPARE_RE.test(`return row.code.toUpperCase() === "NEWCLIENT" || flag;`));
  assert.ok(CODE_COMPARE_RE.test(`if (c.code !== 'NZAMY50') return;`));
  assert.ok(CODE_COMPARE_RE.test(`k.code == "SUMMER-25"`));
  // review M3: any letter case, any normalising call, optional chaining
  assert.ok(NAMED_COUPON_RE.test(`if (code.toLowerCase() === "newclient") {`));
  assert.ok(NAMED_COUPON_RE.test("const c = `Nzamy50`;"));
  assert.ok(CODE_COMPARE_RE.test(`if (row.code.toLowerCase() === "newclient") {`));
  assert.ok(CODE_COMPARE_RE.test(`coupon?.code.trim().toUpperCase() !== "WELCOME"`));
  // a Postgres / PostgREST error code is not a coupon's code
  assert.equal(CODE_COMPARE_RE.test(`if (error.code === "23505") {`), false);
  assert.equal(CODE_COMPARE_RE.test(`if (insertErr?.code === "PGRST116") {`), false);
  // couponServer.orderCoupon's type check is not a comparison with a code
  assert.equal(CODE_COMPARE_RE.test(`code: typeof c.code === "string" ? c.code : "",`), false);
  assert.equal(CODE_COMPARE_RE.test(`if (typeof row.code !== "string") return;`), false);
  // comments go, strings stay
  assert.equal(stripComments(`a // NEWCLIENT\nb /* "NZAMY50" */ c`), `a \nb  c`);
  assert.equal(stripComments(`a /* x\n"NEWCLIENT"\n */ b`), `a \n\n b`);
  assert.equal(stripComments(`const u = "https://x.test/a"; // "NEWCLIENT"`), `const u = "https://x.test/a"; `);
  assert.ok(NAMED_COUPON_RE.test(stripComments(`const x = "NEWCLIENT"; // a comment`)));
});

test("S6: no coupon is special-cased by its name", () => {
  const files = ROOTS.flatMap(sources);
  assert.ok(files.length >= 500, `scanned ${files.length} files`);
  assert.ok(files.some((f) => f.endsWith(`${sep}couponRules.ts`)), "couponRules.ts is scanned");
  assert.ok(files.some((f) => f.endsWith(`coupons${sep}[id]${sep}route.ts`)), "the admin coupon route is scanned");
  assert.ok(files.some((f) => f.endsWith(`checkout${sep}page.tsx`)), "the checkout page is scanned");
  assert.ok(files.some((f) => f.endsWith(`proxy.ts`)), "src/proxy.ts is scanned");
  assert.ok(!files.some((f) => /\.test\.tsx?$|\.test-helper\.ts$/.test(f)), "tests are not scanned");
  const hits: string[] = [];
  for (const f of files) {
    const code = stripComments(readFileSync(f, "utf8"));
    code.split(/\r?\n/).forEach((line, i) => {
      if (NAMED_COUPON_RE.test(line) || CODE_COMPARE_RE.test(line)) {
        hits.push(`${relative(SRC, f)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(hits, []);
});
