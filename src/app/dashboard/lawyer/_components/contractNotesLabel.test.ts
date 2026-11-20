import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * O16 (d), batch l11-misc: the lawyer's contract notes are internal — the
 * client read path (src/app/api/v1/client/contracts/_clientRead.ts) never
 * selects `notes` of a contract, a version, an obligation or a payment — so
 * every notes field says so: «ملاحظات داخلية (لا يراها العميل)».
 */
const LABEL = "ملاحظات داخلية (لا يراها العميل)";
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("every contract notes field and the detail heading say the notes are internal", () => {
  for (const [file, count] of [
    ["./contracts/ContractFormModal.tsx", 1],
    ["./contracts/ContractChildForms.tsx", 2],
    ["./contracts/UploadVersionModal.tsx", 1],
    ["./contracts/ContractDetail.tsx", 1],
  ] as const) {
    const src = read(file);
    assert.equal(src.split(LABEL).length - 1, count, `${file}: ${count} × «${LABEL}»`);
    assert.doesNotMatch(src, /labelCls\}>ملاحظات<\/label>/, `${file}: a bare «ملاحظات» label is left`);
  }
});

test("the client read path still never selects notes (the label stays true)", () => {
  const src = read("../../../api/v1/client/contracts/_clientRead.ts");
  for (const name of ["CLIENT_CONTRACT_COLUMNS", "CLIENT_VERSION_COLUMNS", "CLIENT_OBLIGATION_COLUMNS", "CLIENT_PAYMENT_COLUMNS"]) {
    const m = new RegExp(`export const ${name} =([\\s\\S]*?);`).exec(src);
    assert.ok(m, `${name} found`);
    assert.doesNotMatch(m[1], /\bnotes\b/, `${name} must not carry notes`);
  }
});
