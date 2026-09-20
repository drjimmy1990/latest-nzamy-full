import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parseLaws } from "./parse-laws.ts";
import { seedLaws } from "../seed-library.ts";

async function parentStatusThroughDrySeed(rawStatus: string | null): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nzamy-parent-status-"));
  const file = path.join(dir, "synthetic.md");
  const statusLine = rawStatus === null ? "" : `status: ${rawStatus}\n`;
  fs.writeFileSync(file, `---\nid: TEST-PARENT-STATUS\ntitle: اختبار الحالة\ntype: نظام\n${statusLine}section_code: "00"\n---\n<!-- ARTICLE_START {"number":"1","number_text":"المادة الأولى"} -->\nمتن اختباري فقط.\n<!-- ARTICLE_END -->\n`, "utf8");
  const parsed = parseLaws(file);
  assert.equal(parsed.laws.length, 1);
  const stored: Record<string, unknown>[] = [];
  const fakeClient = {
    async upsert(table: string, rows: Record<string, unknown>[]) {
      if (table === "laws") stored.push(...rows);
      return { data: rows, error: null };
    },
    async delete() { return { error: null }; },
  };
  const errors: string[] = [];
  await seedLaws(fakeClient as never, parsed as unknown as Record<string, unknown>, false, errors, false);
  assert.deepEqual(errors, []);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, parsed.laws[0].law_status);
  return String(stored[0].status);
}

test("an undeclared parent status never becomes active in parse or dry seed", async () => {
  // Only a missing status may take this sentinel path with the present
  // operational manifest. An explicit unknown status must fail parsing and
  // must never be used as a dry-seed success fixture.
  assert.equal(await parentStatusThroughDrySeed(null), "status_undeclared");
  assert.equal(await parentStatusThroughDrySeed("active"), "active");
});
