/** Test-only adapter for immutable historical JSON that predates corpus_scope.
 * This is not a publication decision or an output migration. Exclude every
 * inventory match before supplying scope to an isolated in-memory seed test.
 * Historical files and their text/hash assertions remain unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
const entries = JSON.parse(fs.readFileSync(path.join(__dirname, "parsers/corpus-scope-registry.json"), "utf8")).entries as Array<{
  path: string; source_ids: string[]; title: string;
}>;

function isAmbiguous(row: Row): boolean {
  const meta = row.metadata ?? {};
  const ids = [row.id, row.instrument_id, meta.id, meta.instrument_id].filter((value): value is string => typeof value === "string" && !!value);
  const titles = [row.title, meta.title].filter((value): value is string => typeof value === "string" && !!value);
  const paths = [row.source_path, row.source_file, meta.source_path, meta.source_file, ...ids]
    .filter((value): value is string => typeof value === "string")
    .map(value => value.replace(/\\/g, "/").normalize("NFC"));
  return entries.some(entry =>
    titles.includes(entry.title)
    || entry.source_ids.some(id => ids.some(value => value === id || value.startsWith(id + "_")))
    || paths.some(value => value === entry.path || value.endsWith("/" + entry.path)
      || value === path.basename(entry.path, ".md")),
  );
}

export function unambiguousIdentityFixtures(rows: Row[]): Row[] {
  const selected = rows.filter(row => !isAmbiguous(row)
    && (!Object.prototype.hasOwnProperty.call(row, "corpus_scope") || row.corpus_scope === "public_corpus")
    && !row.metadata?.gate_zero_status
    && (!Object.prototype.hasOwnProperty.call(row.metadata ?? {}, "corpus_scope")
      || row.metadata.corpus_scope === "public_corpus"));
  assert.ok(selected.length > 0, "the isolated identity fixture must not become an empty test");
  return selected.map(row => {
    assert.equal(isAmbiguous(row), false, "never label an inventory source as public to pass an identity test");
    return { ...row, corpus_scope: "public_corpus", corpus_scope_provenance: "test_identity_fixture_only" };
  });
}
