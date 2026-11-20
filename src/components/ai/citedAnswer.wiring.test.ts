/**
 * The citation sheet's wiring (owner N06-34..37, batch l6): source-level checks,
 * as the page and route need a browser / a database to run.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("a marker or a source row opens the sheet in place, not a new tab", () => {
  const src = read("components/ai/CitedAnswer.tsx");
  const text = src.slice(src.indexOf("export function CitedText"));
  assert.doesNotMatch(text, /target="_blank"/, "CitedText / SourceList open no tab themselves");
  assert.match(text, /aria-haspopup="dialog"/);
  assert.match(src, /createPortal\(/, "the sheet is portalled out of the <p>/<ol>");
  assert.match(src, /<ModalShell/, "focus trap, Escape and focus return come from ModalShell");
  assert.match(src, /افتح في المكتبة/);
  assert.match(src, /<CitationStatusPill status=\{c\.status\}/, "each source row carries its status pill");
});

test("the sheet's route previews only a text the caller's own run cited, behind the paywall rules", () => {
  const route = read("app/api/v1/ai/source-preview/route.ts");
  assert.match(route, /await libraryGate\(\)/);
  assert.match(route, /requireApiUser\(/);
  assert.match(route, /\.eq\("user_id", userId\)\s*\.contains\("citations", citedByFilter\(/);
  assert.match(route, /hasFullLibraryAccess\(userId, accessMemo\)/);
  assert.match(route, /enforceLibraryDevice\(/);
  assert.equal((route.match(/previewExcerpt\(/g) ?? []).length, 2, "both kinds go through the one excerpt rule");
  assert.doesNotMatch(route, /\.select\("\*"\)|select\('\*'\)/);
});

test("every AI view that renders [S…] markers does it through CitedText (one shared component)", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith(".tsx")) files.push(p);
    }
  };
  walk(join(SRC, "app"));
  walk(join(SRC, "components"));
  const offenders = files.filter((f) => {
    const s = readFileSync(f, "utf8");
    // Rendering a stripped text as JSX children is the old way of showing an answer.
    return />\{stripCitationMarkers\(/.test(s);
  });
  assert.deepEqual(offenders, []);
});
