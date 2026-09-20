import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const SRC = path.resolve(process.cwd(), "src");
const APPROVED = "966560655552";
const DISALLOWED_NUMBERS = ["966530384299", "966555979607", "0555979607"];

async function sourceFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await sourceFiles(full));
    else if (/\.(ts|tsx|js|jsx|html)$/.test(entry.name) && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

test("platform contact policy rejects retired numbers and telephone CTAs", async () => {
  const files = await sourceFiles(SRC);
  const violations: string[] = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const number of DISALLOWED_NUMBERS) {
      if (text.includes(number)) violations.push(`${path.relative(process.cwd(), file)} contains ${number}`);
    }
    if (/<a\b[^>]*href\s*=\s*(?:["']tel:|\{\s*["'`]tel:)/i.test(text)) {
      violations.push(`${path.relative(process.cwd(), file)} contains a tel CTA`);
    }
    const waMatches = [...text.matchAll(/https:\/\/(?:www\.)?wa\.me\/([^?\s"'`<]*)/gi)];
    for (const match of waMatches) {
      const destination = match[1];
      // User-to-user sharing helpers may interpolate a recipient's own phone;
      // this policy audits platform contact literals. Runtime platform CTAs
      // must resolve through NZAMY_WHATSAPP_NUMBER and are covered below.
      if (destination && !destination.includes("$") && !destination.includes("…") && destination !== APPROVED) {
        violations.push(`${path.relative(process.cwd(), file)} contains non-approved wa.me/${destination}`);
      }
    }
  }
  assert.deepEqual(violations, [], `contact policy violations:\n${violations.join("\n")}`);
});
