/**
 * N10 (fix plan 2026-10-16): re-running scripts/parsers/parse-circuits-directory.mjs
 * restored the printed typos the owner had corrected (Q4), because the parser
 * never read his table. It now applies src/data/circuits-directory-corrections.json
 * after parsing and stops on a correction that matches no row. CI has no copy
 * of the source Markdown, so the pure step is tested here on its own.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { applyOwnerCorrections } from "../../scripts/parsers/parse-circuits-directory.mjs";

type Row = {
  id: string;
  page: number;
  rawEmail: string;
  email: string;
  needsVerification: boolean;
  suggestedEmail: string | null;
  verificationStatus: string;
};
type Fix = { id: string; page: number; printed: string; email: string };

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const corrections: Fix[] = JSON.parse(read("./circuits-directory-corrections.json")).corrections;
const directory: { circuits: Row[] } = JSON.parse(read("./circuits-directory.json"));

function row(over: Partial<Row>): Row {
  return {
    id: "moj-cir-0001", page: 1, rawEmail: "a@moj.gov.sa", email: "a@moj.gov.sa",
    needsVerification: false, suggestedEmail: null, verificationStatus: "معتمد", ...over,
  };
}

test("a correction sets the address; a flagged row's suggestion too; the flag stays", () => {
  const flagged = row({ id: "moj-cir-0002", page: 2, rawEmail: "moj.gov.sa@X٢", email: "moj.gov.sa@X٢", needsVerification: true, suggestedEmail: "X٢@moj.gov.sa", verificationStatus: "مرجّحة" });
  const digitOnly = row({ id: "moj-cir-0003", page: 3, rawEmail: "k١@moj.gov.sa", email: "k١@moj.gov.sa" });
  const changed = applyOwnerCorrections([flagged, digitOnly], [
    { id: "moj-cir-0002", page: 2, printed: "moj.gov.sa@X٢", email: "X2@moj.gov.sa" },
    { id: "moj-cir-0003", page: 3, printed: "k١@moj.gov.sa", email: "k1@moj.gov.sa" },
  ]);
  assert.equal(changed, 2);
  assert.deepEqual(
    [flagged.email, flagged.suggestedEmail, flagged.needsVerification, flagged.verificationStatus],
    ["X2@moj.gov.sa", "X2@moj.gov.sa", true, "مرجّحة"],
  );
  assert.deepEqual([digitOnly.email, digitOnly.suggestedEmail, digitOnly.needsVerification], ["k1@moj.gov.sa", null, false]);
});

test("a correction that matches no row stops the run (ids are positional)", () => {
  const rows = () => [row({ id: "moj-cir-0005", page: 5, rawEmail: "p@moj.gov.sa" })];
  const fix = { id: "moj-cir-0005", page: 5, printed: "p@moj.gov.sa", email: "q@moj.gov.sa" };
  assert.throws(() => applyOwnerCorrections(rows(), [{ ...fix, id: "moj-cir-0006" }]), /matches no row/);
  assert.throws(() => applyOwnerCorrections(rows(), [{ ...fix, page: 6 }]), /matches no row/);
  assert.throws(() => applyOwnerCorrections(rows(), [{ ...fix, printed: "other@moj.gov.sa" }]), /matches no row/);
  assert.throws(() => applyOwnerCorrections(rows(), [fix, fix]), /listed twice/);
});

test("the corrections file holds the owner's 52 rows, each a sendable Latin address", () => {
  assert.equal(corrections.length, 52);
  assert.equal(new Set(corrections.map((c) => c.id)).size, 52);
  for (const c of corrections) {
    assert.match(c.email, /^[A-Za-z0-9._-]+@moj\.gov\.sa$/, c.id);
    assert.ok(Number.isInteger(c.page) && c.printed.length > 0, c.id);
  }
});

test("the committed directory already carries every correction (a re-run changes nothing)", () => {
  const copy = structuredClone(directory.circuits);
  assert.equal(applyOwnerCorrections(copy, corrections), 0);
  assert.deepEqual(copy, directory.circuits);
});

test("the parser reads the corrections and writes only with --write", () => {
  const parser = read("../../scripts/parsers/parse-circuits-directory.mjs");
  assert.match(parser, /src\/data\/circuits-directory-corrections\.json/);
  assert.match(parser, /applyOwnerCorrections\(circuits, readCorrections\(CORRECTIONS_PATH\)\)/);
  assert.match(parser, /write = false/);
  assert.match(parser, /if \(!write\) \{/);
  assert.match(parser, /write: args\.includes\("--write"\)/);
  // The whole backticked printed address, not the part before a stray space.
  assert.match(parser, /\(\?:`\(\[\^`\]\+\)`\|/);
});
