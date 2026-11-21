/**
 * N19 (batch l12; owner RAW [2]): «معقب» is replaced by «مراجع حكومي» on every
 * screen. Display text only: the database keeps sub_role 'bailiff' and the
 * picker id 'tracker'; «تعقيب» (a memo kind) and law texts are not touched.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COMMENT_LINE = /^\s*(\/\/|\*|\/\*|\{\/\*)/;
const SHADDA = String.fromCharCode(0x651);
const WORD = new RegExp(`معق${SHADDA}?ب`);

/** Waiting on the money builder's terms version (src/app/terms is theirs in batch l12). */
const PENDING_ELSEWHERE = new Set(["src/app/terms/page.tsx"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|json)$/.test(name) && !name.endsWith(".test.ts")) out.push(p.replace(/\\/g, "/"));
  }
  return out;
}

test("N19: no screen text says «معقب»; the DB keys stay", () => {
  const offenders: string[] = [];
  for (const file of walk("src")) {
    if (PENDING_ELSEWHERE.has(file) || file.startsWith("src/data/")) continue;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!WORD.test(line) || COMMENT_LINE.test(line)) return;
      const code = line.split(" // ")[0];
      if (WORD.test(code)) offenders.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
  const data = readFileSync("src/app/register/provider/data.ts", "utf8");
  assert.ok(data.includes('id: "tracker"'), "the picker id stays");
  assert.ok(data.includes('label: "مراجع حكومي"'));
  assert.ok(readFileSync("src/components/floating/roleContext.ts", "utf8").includes('bailiff: "مراجع حكومي"'), "the sub_role key stays");
});
