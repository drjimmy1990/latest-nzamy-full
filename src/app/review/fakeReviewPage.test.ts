/**
 * D-05 (owner package 25-Nov) — /review/[token] rendered one invented contract
 * review for any token (a fixed document, value, signatories, reviewers and
 * comments), with no read of a real request. Nothing links to it. It is a
 * plain 404 now, like /cases/[id].
 * Source-read: a .tsx page cannot load under node --test.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const raw = readFileSync(new URL("./[token]/page.tsx", import.meta.url), "utf8");
const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'\\])\/\/.*$/gm, "$1");

test("the page is a server-side not-found, not a client page with a mock document", () => {
  assert.doesNotMatch(code, /["']use client["']/);
  assert.match(code, /import \{ notFound \} from "next\/navigation";/);
  assert.match(code, /notFound\(\)/);
  assert.doesNotMatch(code, /MOCK_|useState|ReviewerInfo|sanitizeRichHtml/);
});
