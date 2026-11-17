import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { isLawReaderPath, LAWS_STATIC_SEGMENTS } from "./libraryGuardPaths.ts";

test("a law's reader path is /laws/<slug>, one segment, never a static sibling", () => {
  assert.equal(isLawReaderPath("/laws/labor-law"), true);
  assert.equal(isLawReaderPath("/laws/labor-law/"), true);
  assert.equal(isLawReaderPath("/laws/%D9%86%D8%B8%D8%A7%D9%85-%D8%A7%D9%84%D8%B9%D9%85%D9%84"), true);
  assert.equal(isLawReaderPath("/laws"), false);
  assert.equal(isLawReaderPath("/laws/"), false);
  assert.equal(isLawReaderPath("/laws/subscribe"), false);
  assert.equal(isLawReaderPath("/laws/orders"), false);
  assert.equal(isLawReaderPath("/laws/orders/abc"), false);
  assert.equal(isLawReaderPath("/laws/feqh-preview"), false);
  assert.equal(isLawReaderPath("/laws/civil-procedure"), false);
  assert.equal(isLawReaderPath("/laws/labor-law/extra"), false);
  assert.equal(isLawReaderPath("/precedents/x"), false);
  assert.equal(isLawReaderPath(null), false);
  assert.equal(isLawReaderPath("/laws/%E0%A4%A"), true, "a malformed escape is still a slug, guarded by the reader's own guard");
});

test("every folder under src/app/laws is a listed static sibling (a missing one would lose the section guard)", () => {
  const dir = new URL("../../app/laws/", import.meta.url);
  const folders = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("[") && !d.name.startsWith("(") && !d.name.startsWith("_"))
    .map((d) => d.name);
  assert.ok(folders.length >= 4, "the laws folders were read");
  for (const name of folders) assert.ok(LAWS_STATIC_SEGMENTS.has(name), `src/app/laws/${name} is not in LAWS_STATIC_SEGMENTS`);
});
