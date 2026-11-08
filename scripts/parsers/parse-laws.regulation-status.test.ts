// Owner package 2026-11-06 items 5 and 16: a REGULATION anchor's own status
// reaches the parser output and the article_regulations row as the source
// wrote it. An anchor that states none stays unknown (never "active"), and a
// value outside the article status tokens is reported, not guessed.
//
// Run: node --import tsx --test scripts/parsers/parse-laws.regulation-status.test.ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws, regulationStatusOf } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";

type Row = Record<string, unknown>;

function lawFile(regulations: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-reg-status-"));
  const file = path.join(dir, "synthetic.md");
  fs.writeFileSync(
    file,
    `---\nid: TEST-REG-STATUS\ntitle: نظام اختباري للوائح\ntype: نظام\nstatus: active\nsection_code: "00"\n---\n` +
      `<!-- ARTICLE_START {"number":"1","number_text":"المادة الأولى"} -->\nمتن المادة الأولى.\n` +
      regulations +
      `<!-- ARTICLE_END -->\n`,
    "utf8",
  );
  return file;
}

async function regulationRows(file: string): Promise<Row[]> {
  const parsed = parseLaws(file);
  const stored: Row[] = [];
  const fakeClient = {
    async upsert(table: string, rows: Row[]) {
      if (table === "article_regulations") stored.push(...rows);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, parsed as unknown as Row, false, errors, false);
  assert.deepEqual(errors, []);
  return stored;
}

const THREE_ANCHORS =
  `<!-- REGULATION {"ref":"المادة 1 من اللائحة","regNum":"1","status":"repealed"} -->\nنص لائحي ملغى.\n` +
  `<!-- REGULATION {"ref":"المادة 2 من اللائحة","regNum":"2","status":"amended"} -->\nنص لائحي معدل.\n` +
  `<!-- REGULATION {"ref":"المادة 3 من اللائحة","regNum":"3"} -->\nنص لائحي بلا حالة.\n`;

test("each REGULATION anchor keeps its own status in the parser output; an absent one stays absent", () => {
  const parsed = parseLaws(lawFile(THREE_ANCHORS));
  const regs = parsed.laws[0].chapters.flatMap((c) => c.articles).flatMap((a) => a.regulations);
  assert.equal(regs.length, 3);
  assert.equal(regs[0].status, "repealed");
  assert.equal(regs[1].status, "amended");
  assert.equal("status" in regs[2], false, "an anchor with no status must not be given one by the parser");
});

test("the dry seed writes the anchor status and status_undeclared (never active) for an absent one", async () => {
  const rows = await regulationRows(lawFile(THREE_ANCHORS));
  assert.deepEqual(rows.map((r) => r.status), ["repealed", "amended", "status_undeclared"]);
});

test("a value outside the article status tokens is not guessed: no status, seeded undeclared", async () => {
  const file = lawFile(`<!-- REGULATION {"ref":"المادة 1 من اللائحة","regNum":"1","status":"sort_of_active"} -->\nنص.\n`);
  const parsed = parseLaws(file);
  const reg = parsed.laws[0].chapters.flatMap((c) => c.articles).flatMap((a) => a.regulations)[0];
  assert.equal("status" in reg, false);
  const rows = await regulationRows(file);
  assert.equal(rows[0].status, "status_undeclared");
});

test("regulationStatusOf: blank is absent, known tokens pass verbatim, anything else is null", () => {
  assert.equal(regulationStatusOf(undefined), undefined);
  assert.equal(regulationStatusOf(null), undefined);
  assert.equal(regulationStatusOf("  "), undefined);
  for (const s of ["active", "amended", "repealed", "suspended", "added", "merged", "status_undeclared"]) {
    assert.equal(regulationStatusOf(s), s);
  }
  assert.equal(regulationStatusOf(" repealed "), "repealed");
  assert.equal(regulationStatusOf("ملغاة"), null);
  assert.equal(regulationStatusOf("partially_active"), null);
});
