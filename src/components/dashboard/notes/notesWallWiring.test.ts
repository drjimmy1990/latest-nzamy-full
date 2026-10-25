/**
 * Source pins for the sticky notes wall (N3.4): both dashboards mount it, it
 * reads and writes only through the API (no browser storage, no seed notes),
 * and the editor is an accessible dialog with a labelled colour radio group.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "../../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("the lawyer and firm dashboards mount the wall; the firm links cases to the firm case file", () => {
  assert.match(read("app/dashboard/lawyer/page.tsx"), /<StickyNotesWall \/>/);
  assert.match(read("app/dashboard/firm/page.tsx"), /<StickyNotesWall caseHrefBase="\/dashboard\/firm\/cases\/" \/>/);
});

test("the wall keeps nothing in the browser and invents no notes", () => {
  for (const f of ["components/dashboard/notes/StickyNotesWall.tsx", "components/dashboard/notes/NoteEditorModal.tsx", "lib/services/dashboardNotesService.ts"]) {
    const src = read(f);
    assert.doesNotMatch(src, /localStorage|sessionStorage/, f);
    assert.doesNotMatch(src, /\b(?:MOCK|SEED|SAMPLE|DEMO)_[A-Z_]*NOTES?\b|\bMOCK_/, f);
  }
  assert.match(read("lib/services/dashboardNotesService.ts"), /\/api\/v1\/lawyer\/dashboard-notes/);
  const wall = read("components/dashboard/notes/StickyNotesWall.tsx");
  assert.match(wall, /لا ملاحظات بعد/, "an honest empty state");
  assert.match(wall, /تعذّر تحميل الملاحظات/, "a failed read is not an empty wall");
  assert.match(wall, /n\.mine &&/, "edit / pin / delete only on the caller's own notes");
});

test("the editor is a labelled dialog; colours are a radio group with Arabic names", () => {
  const src = read("components/dashboard/notes/NoteEditorModal.tsx");
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /role="radiogroup"/);
  assert.match(src, /aria-label=\{NOTE_COLOR_LABEL_AR\[c\]\}/);
  assert.match(src, /e\.key === "Escape"/);
});

test("the routes use the session client (RLS), never the service client for note rows", () => {
  for (const f of ["app/api/v1/lawyer/dashboard-notes/route.ts", "app/api/v1/lawyer/dashboard-notes/[id]/route.ts"]) {
    const src = read(f);
    assert.match(src, /assertCaseWorker\(\)/, f);
    assert.doesNotMatch(src, /createServiceClient/, f);
    assert.doesNotMatch(src, /firm_id:\s*(?:body|input|raw)\./, `${f}: firm_id never comes from the request`);
  }
});
