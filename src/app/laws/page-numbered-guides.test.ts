/**
 * Owner decision ١٠٢ (answers of 2026-10-06): the documents numbered by page
 * rather than by article are labelled «دليل إرشادي / تنظيم إداري» and keep
 * their page anchors. The label is set in the data by the one-time file
 * supabase/one-time/2026-10-17_q102_page_numbered_documents.sql; this pins
 * the citation that reads it, and that the file only relabels library.laws.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCitation } from "./[slug]/_citation.ts";

const LABEL = "دليل إرشادي / تنظيم إداري";
const oneTime = readFileSync(
  new URL("../../../supabase/one-time/2026-10-17_q102_page_numbered_documents.sql", import.meta.url),
  "utf8",
);
const fixture = readFileSync(new URL("../../../supabase/tests/rls/prelude_q102_fixture.sql", import.meta.url), "utf8");

test("a page of a relabelled document is cited by page, with the owner's label as its kind", () => {
  const c = buildCitation(
    { docTitle: "نظام السلامة المدرسية - القسم الرابع (العمليات)", docType: LABEL, numberText: "الصفحة 3" },
    true,
  );
  assert.equal(c.kind, "page");
  assert.equal(c.plain, `الصفحة (3) من ${LABEL} (نظام السلامة المدرسية - القسم الرابع (العمليات)) ونصه:`);
  // Before the label the same page read «… من نظام (…)».
  const before = buildCitation({ docTitle: "نظام السلامة المدرسية - القسم الرابع (العمليات)", docType: "نظام", numberText: "الصفحة 3" }, true);
  assert.ok(before.plain.includes("من نظام ("), before.plain);
});

test("the one-time file writes exactly the label the citation knows, on library.laws only", () => {
  const code = oneTime.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
  assert.ok(code.includes(`set type = '${LABEL}'`));
  const writes = code.match(/\b(update|delete|insert|truncate|alter|drop)\b[^;]*/gi) ?? [];
  assert.ok(writes.length > 0);
  for (const w of writes) {
    assert.match(w, /^update library\.laws l\s+set type = /i, `unexpected write: ${w.slice(0, 80)}`);
  }
  // It aborts on drift and checks the result before committing.
  assert.match(code, /raise exception 'q102: the list and the database disagree on/);
  assert.match(code, /raise exception 'q102: expected \d+ documents labelled/);
});

test("the Docker fixture is generated from the same list as the one-time file", () => {
  const listed = [...oneTime.matchAll(/^ {4}\('([^']+)', '(نظام|لائحة تنفيذية)'\)/gm)].map((m) => m[1]);
  const inFixture = [...fixture.matchAll(/^ {2}\('([^']+)', '(?:[^']|'')*', '(نظام|لائحة تنفيذية)', '00'\)/gm)]
    .map((m) => m[1])
    .filter((slug) => !slug.startsWith("q102-")); // the fixture's own control rows
  // Documents the owner asked to keep (generator --exclude) sit in the fixture
  // too, recorded in public.q102_kept, and must not be in the file's list.
  const keptLine = /insert into public\.q102_kept \(slug\) values (.*);/.exec(fixture)?.[1] ?? "";
  const kept = [...keptLine.matchAll(/\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(listed.length > 0);
  for (const slug of kept) assert.ok(!listed.includes(slug), `kept document ${slug} is in the list`);
  // The list appears once per block (preview, drift, update ×3, verify): compare the set.
  assert.deepEqual(
    [...new Set(inFixture)].filter((slug) => !kept.includes(slug)).sort(),
    [...new Set(listed)].sort(),
  );
});

// Owner answer ٢١١ (18 Oct): the label must be an accepted type BEFORE his
// files carry it — the parser refuses a type outside enums.type.
test("the parser's manifest accepts the label (owner ٢١١) and its version moved past 1.18", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../../../scripts/parsers/schema_manifest.json", import.meta.url), "utf8"),
  ) as { manifest_version: string; enums: { type: string[] } };
  assert.ok(manifest.enums.type.includes(LABEL));
  // One value, verbatim — not split into «دليل إرشادي» and «تنظيم إداري».
  assert.ok(!manifest.enums.type.includes("تنظيم إداري"));
  assert.equal(manifest.manifest_version, "1.19");
});

test("the /laws type lists know the label", () => {
  const data = readFileSync(new URL("./data.ts", import.meta.url), "utf8");
  // Plain substring checks: the label holds no regex metacharacters to escape.
  assert.ok(data.includes(`  | "${LABEL}"`), "LawDocumentType");
  const lists = readFileSync(new URL("../../constants/lawsLibraryData.ts", import.meta.url), "utf8");
  assert.ok(lists.includes(`  | "${LABEL}"`), "DocSubType");
  assert.ok(
    lists.includes(`{ id: "${LABEL}", label: "${LABEL}", labelEn: "Guidance / Administrative Regulation"`),
    "LAW_DOC_TYPES",
  );
});
