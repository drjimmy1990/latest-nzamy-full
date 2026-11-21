/**
 * Q119 (batch l12): the addresses the owner's mail check found dead are shown
 * nowhere — not in the agencies directory, not in the procedures guide's
 * sector cards or national channels.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { NO_MAIL_EMAILS, isNoMailEmail } from "./noMailEmails.ts";
import { getNationalChannels, getSector, getSectorIndex } from "./murshidStore.ts";

test("Q119: the list equals the parser's withheld addresses (agencies directory)", () => {
  const parser = readFileSync("scripts/parsers/parse-gov-agencies-directory.mjs", "utf8");
  const at = parser.indexOf("export const WITHHELD_EMAILS = {");
  const block = parser.slice(at, parser.indexOf("};", at));
  const withheld = new Set([...block.matchAll(/"([^"\s]+@[^"\s]+)"/g)].map((m) => m[1].toLowerCase()));
  assert.deepEqual([...withheld].sort(), [...NO_MAIL_EMAILS].sort());
  assert.equal(isNoMailEmail(" Info@BIP.gov.sa "), true);
  assert.equal(isNoMailEmail("info@moj.gov.sa"), false, "exact addresses, never a whole domain");
});

test("Q119: no sector card or national channel the guide serves carries one of them", () => {
  const index = getSectorIndex();
  assert.ok(index.length >= 30);
  for (const s of index) {
    const sector = getSector(s.no);
    assert.ok(sector);
    for (const e of JSON.stringify(sector).toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g) ?? []) {
      assert.equal(NO_MAIL_EMAILS.has(e), false, `sector ${s.no}: ${e}`);
    }
  }
  for (const c of getNationalChannels()) {
    for (const e of c.emails) assert.equal(isNoMailEmail(e), false, `${c.id}: ${e}`);
  }
});
