/**
 * N05-L13: the demo records in src/app/laws/demo-data*.ts reach a page only
 * through the gate in src/app/laws/demo-data-access.ts (empty arrays outside
 * demo mode). Anywhere else in src/ a module may take their TYPES, never their
 * values: src/constants/lawsLibraryData.ts used to import DEMO_PRINCIPLES,
 * DEMO_PRECEDENTS and DEMO_ORDERS ungated and sum them into category counts
 * nobody read, which shipped the demo records with every /laws tab.
 *
 * Source-read (the modules import "@/…" paths node --test cannot resolve).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../", import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Every `import … from "…demo-data…"` statement (multi-line imports included). */
function demoImports(source: string): string[] {
  return [...source.matchAll(/import\s[^;]*?from\s*["'][^"']*demo-data[^"']*["']/g)].map((m) => m[0]);
}

test("outside src/app/laws, demo-data modules are imported for their types only", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split(sep).join("/");
    if (rel.startsWith("app/laws/")) continue; // the gate and its readers (demo-data-access.ts)
    for (const stmt of demoImports(readFileSync(file, "utf8"))) {
      if (!/^import\s+type\s/.test(stmt)) offenders.push(`${rel}: ${stmt.replace(/\s+/g, " ")}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("lawsLibraryData.ts no longer carries demo-derived counts or the fake law entry", () => {
  const text = readFileSync(new URL("./lawsLibraryData.ts", import.meta.url), "utf8");
  for (const gone of ["DEMO_PRINCIPLES", "DEMO_PRECEDENTS", "DEMO_ORDERS", "DEMO_FEQH_BOOKS_MOCK", "FULL_LAWS_SYSTEMS", "catTotalCount", "CAT_PRINCIPLES_COUNT"]) {
    assert.ok(!new RegExp(`\\b${gone}\\b`).test(text.replace(/\/\/.*$/gm, "")), gone);
  }
});

test("the scanner sees a value import (negative control)", () => {
  assert.equal(demoImports(`import {\n  DEMO_ORDERS,\n} from "@/app/laws/demo-data";`).length, 1);
  assert.equal(demoImports(`import type { DemoOrder } from "../demo-data";`).length, 1);
  assert.equal(demoImports(`import { x } from "./other";`).length, 0);
});
